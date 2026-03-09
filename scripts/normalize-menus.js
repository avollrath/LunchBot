const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const dotenv = require("dotenv");
const { GoogleGenAI, Type } = require("@google/genai");

dotenv.config();

const ROOT_DIR = path.join(__dirname, "..");
const CACHE_DIR = path.join(ROOT_DIR, "cache");
const DATA_DIR = path.join(ROOT_DIR, "data");
const OUTPUT_MINIFIED = path.join(DATA_DIR, "normalizedMenus.json");
const OUTPUT_PRETTY = path.join(DATA_DIR, "normalizedMenus.pretty.json");

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const MAX_RPM = 5;
const MIN_REQUEST_INTERVAL_MS = 15000; // max 1 req / 15s when chunking
const CHUNK_MAX_CHARS = 50000;
const CHUNK_MAX_ITEMS = 4;

const PRICE_REGEX = /(?:\d{1,3}(?:[.,]\d{2})\s?(?:€|EUR)?|€\s?\d{1,3}(?:[.,]\d{2}))/i;
const DIETARY_REGEX = /\b(?:M|G|L|VE|VL|V|DF|GF|VS|VG)\b/i;

const RESTAURANT_NAME_MAP = {
  "factoryCache.json": "Factory Pasila",
  "burgersCache.json": "Burgers & Wine",
  "limoneCache.json": "Tripla Limone",
  "schnitzelCache.json": "The Schnitzel",
  "hankoCache.json": "Hanko Aasia",
  "tokumaruCache.json": "Tokumaru",
  "dylanCache.json": "Dylan Bole",
  "sizzleCache.json": "Sizzle Station",
  "vaunuCache.json": "Vaunu",
};

const ALLOWED_CATEGORIES = new Set([
  "soup",
  "main",
  "vegetarian",
  "vegan",
  "ramen",
  "don",
  "burger",
  "schnitzel",
  "dessert",
  "side",
  "buffet",
  "other",
]);

const GEMINI_BATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    restaurants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cacheFile: { type: Type.STRING },
          restaurantName: { type: Type.STRING },
          sourceLanguage: { type: Type.STRING },
          currency: { type: Type.STRING, nullable: true },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                nameFi: { type: Type.STRING, nullable: true },
                nameEn: { type: Type.STRING },
                descriptionEn: { type: Type.STRING, nullable: true },
                dietary: { type: Type.ARRAY, items: { type: Type.STRING } },
                priceText: { type: Type.STRING, nullable: true },
                category: { type: Type.STRING, nullable: true },
              },
              required: ["nameEn", "dietary"],
            },
          },
          notesFi: { type: Type.ARRAY, items: { type: Type.STRING } },
          notesEn: { type: Type.ARRAY, items: { type: Type.STRING } },
          rawMenuText: { type: Type.STRING },
        },
        required: [
          "cacheFile",
          "restaurantName",
          "sourceLanguage",
          "currency",
          "items",
          "notesFi",
          "notesEn",
          "rawMenuText",
        ],
      },
    },
  },
  required: ["restaurants"],
};

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeString(value, fallback = null) {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = cleanText(value);
  return cleaned || fallback;
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => sanitizeString(item, null))
    .filter((item) => typeof item === "string");
}

function normalizeDietaryList(value) {
  const raw = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const marker = sanitizeString(item, null);
    if (!marker) {
      continue;
    }
    const upper = marker.toUpperCase();
    if (seen.has(upper)) {
      continue;
    }
    seen.add(upper);
    out.push(upper);
  }
  return out;
}

function toTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getRestaurantNameFromCacheFile(cacheFile) {
  if (RESTAURANT_NAME_MAP[cacheFile]) {
    return RESTAURANT_NAME_MAP[cacheFile];
  }
  const base = cacheFile.replace(/\.json$/i, "").replace(/cache$/i, "");
  return toTitleCase(base);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTodayInHelsinki() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function createRequestThrottle() {
  const minFromRpm = Math.ceil(60000 / MAX_RPM);
  const minInterval = Math.max(MIN_REQUEST_INTERVAL_MS, minFromRpm);
  let nextAllowedAt = 0;

  return async function waitTurn() {
    const now = Date.now();
    const waitMs = Math.max(0, nextAllowedAt - now);
    if (waitMs > 0) {
      console.log(`[normalize] Throttle wait: ${Math.ceil(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
    nextAllowedAt = Date.now() + minInterval;
  };
}

function detectLikelyLanguage(text) {
  const sample = String(text || "").toLowerCase();
  if (!sample) {
    return "unknown";
  }

  let fiScore = 0;
  let enScore = 0;
  const fiMarkers = [
    "lounas",
    "maanantai",
    "tiistai",
    "keskiviikko",
    "torstai",
    "perjantai",
    "keitto",
    "salaatti",
    "kana",
    "nauta",
    "kasvis",
  ];
  const enMarkers = [
    "lunch",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "soup",
    "salad",
    "chicken",
    "beef",
  ];

  if (/[äöå]/i.test(sample)) {
    fiScore += 2;
  }
  for (const marker of fiMarkers) {
    if (sample.includes(marker)) {
      fiScore += 1;
    }
  }
  for (const marker of enMarkers) {
    if (sample.includes(marker)) {
      enScore += 1;
    }
  }

  if (fiScore >= enScore + 2) {
    return "fi";
  }
  if (enScore >= fiScore + 2) {
    return "en";
  }
  return "unknown";
}

function hasFoodSignal(line) {
  const l = line.toLowerCase();
  const markers = [
    "soup",
    "burger",
    "pizza",
    "pasta",
    "salad",
    "tofu",
    "chicken",
    "beef",
    "salmon",
    "ramen",
    "don",
    "keitto",
    "kana",
    "nauta",
    "kala",
    "kasvis",
    "lounas",
  ];
  return markers.some((m) => l.includes(m));
}

function isFluffLine(line) {
  const l = String(line || "").toLowerCase();
  const fluffPatterns = [
    /welcome to/i,
    /come enjoy/i,
    /enjoy your lunch in style/i,
    /corner of/i,
    /pasilansilta/i,
    /pasilankatu/i,
    /daily guide/i,
    /friendly lunchbot/i,
    /nauttimaan lounaasi tyylikkäästi/i,
  ];
  return fluffPatterns.some((pattern) => pattern.test(l));
}

function isLikelyNoteLine(line) {
  const l = String(line || "").toLowerCase();
  if (isFluffLine(line)) {
    return false;
  }
  return (
    l.includes("buffet") ||
    l.includes("lounas") ||
    l.includes("served") ||
    l.includes("klo") ||
    l.includes("coffee") ||
    l.includes("tea") ||
    l.includes("bread") ||
    l.includes("salad") ||
    l.includes("price")
  );
}

function extractPriceFromLine(line) {
  const match = String(line || "").match(PRICE_REGEX);
  return match ? cleanText(match[0]) : null;
}

function splitPriceFromText(text, fallbackPrice = null) {
  const value = sanitizeString(text, null);
  if (!value) {
    return { text: null, priceText: fallbackPrice };
  }

  const trailing = value.match(/^(.*?)(\d{1,3}(?:[.,]\d{2})\s?(?:€|EUR)?)$/i);
  if (trailing) {
    return {
      text: cleanText(trailing[1]),
      priceText: cleanText(trailing[2]),
    };
  }

  return { text: value, priceText: fallbackPrice };
}

function extractStructuredMenuFromHtml(html) {
  const wrapped = `<div>${String(html || "")}</div>`;
  const $ = cheerio.load(wrapped);
  $("script, style, noscript").remove();

  const lines = [];
  const seen = new Set();
  const pushLine = (value) => {
    const line = cleanText(value);
    if (!line || seen.has(line)) {
      return;
    }
    seen.add(line);
    lines.push(line);
  };

  $("li").each((_, el) => pushLine($(el).text()));
  $("p, h1, h2, h3, h4, h5, h6").each((_, el) => pushLine($(el).text()));

  if (lines.length === 0) {
    const fallbackText = cleanText($.root().text());
    fallbackText.split("\n").forEach(pushLine);
  }

  const filtered = lines.filter((line) => !isFluffLine(line));
  const itemLines = filtered.filter(
    (line) =>
      extractPriceFromLine(line) ||
      DIETARY_REGEX.test(line) ||
      hasFoodSignal(line)
  );
  const noteLines = filtered.filter((line) => isLikelyNoteLine(line));

  return {
    rawMenuText: filtered.join("\n"),
    lines: filtered,
    itemLines,
    noteLines,
  };
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9äöå]+/gi, " ")
    .split(" ")
    .filter((t) => t.length > 2);
}

function similarityScore(a, b) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }
  let common = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      common += 1;
    }
  }
  return common / Math.max(aTokens.size, bTokens.size);
}

function buildPriceCandidates(structured) {
  const candidates = [];
  const seen = new Set();

  for (const line of structured.itemLines) {
    const priceText = extractPriceFromLine(line);
    if (!priceText) {
      continue;
    }
    const key = `${line}|${priceText}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidates.push({ line, priceText, used: false });
  }

  return candidates;
}

function recoverMissingItemPrices(restaurant, structured) {
  const priceCandidates = buildPriceCandidates(structured);
  for (const item of restaurant.items) {
    if (item.priceText) {
      continue;
    }

    const query = `${item.nameEn || ""} ${item.nameFi || ""}`.trim();
    if (!query) {
      continue;
    }

    let best = null;
    let bestScore = 0;
    for (const candidate of priceCandidates) {
      if (candidate.used) {
        continue;
      }
      const score = similarityScore(query, candidate.line);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best && bestScore >= 0.2) {
      item.priceText = best.priceText;
      best.used = true;
    }
  }
}

function mergeUnique(base, additions) {
  const out = [...base];
  const seen = new Set(base.map((v) => v.toLowerCase()));
  for (const value of additions) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

function applyNoteSafeguards(restaurant, structured, sourceLanguage) {
  const pricingNotes = structured.noteLines.filter(
    (line) => extractPriceFromLine(line) && isLikelyNoteLine(line)
  );

  if (sourceLanguage === "fi") {
    restaurant.notesFi = mergeUnique(restaurant.notesFi, pricingNotes);
  } else {
    restaurant.notesEn = mergeUnique(restaurant.notesEn, pricingNotes);
  }

  restaurant.notesFi = restaurant.notesFi.filter((line) => !isFluffLine(line));
  restaurant.notesEn = restaurant.notesEn.filter((line) => !isFluffLine(line));
}

function enforceCurrency(restaurant, structured) {
  if (restaurant.currency) {
    return;
  }
  const hasEuro =
    /€|eur/i.test(restaurant.rawMenuText || "") ||
    restaurant.items.some((item) => /€|eur/i.test(item.priceText || "")) ||
    structured.lines.some((line) => /€|eur/i.test(line));
  if (hasEuro) {
    restaurant.currency = "EUR";
  }
}

function validateAndSanitizeRestaurant(normalized, context) {
  const out = {
    cacheFile: context.cacheFile,
    restaurantName:
      sanitizeString(normalized && normalized.restaurantName, null) ||
      context.restaurantName,
    sourceLanguage:
      sanitizeString(normalized && normalized.sourceLanguage, null) ||
      context.sourceLanguage,
    currency: sanitizeString(normalized && normalized.currency, null),
    items: [],
    notesFi: sanitizeStringArray(normalized && normalized.notesFi).filter(
      (line) => !isFluffLine(line)
    ),
    notesEn: sanitizeStringArray(normalized && normalized.notesEn).filter(
      (line) => !isFluffLine(line)
    ),
    rawMenuText:
      sanitizeString(normalized && normalized.rawMenuText, null) ||
      context.rawMenuText,
    date: context.date,
    rawMenuHtml: context.rawMenuHtml,
  };

  const items = Array.isArray(normalized && normalized.items)
    ? normalized.items
    : [];

  for (const item of items) {
    const inputPrice = sanitizeString(item && item.priceText, null);
    const splitEn = splitPriceFromText(item && item.nameEn, inputPrice);
    const splitFi = splitPriceFromText(item && item.nameFi, splitEn.priceText);

    const nameEn = sanitizeString(splitEn.text, null);
    if (!nameEn || isFluffLine(nameEn)) {
      continue;
    }

    const category = sanitizeString(item && item.category, null);
    out.items.push({
      nameFi: sanitizeString(splitFi.text, null),
      nameEn,
      descriptionEn: sanitizeString(item && item.descriptionEn, null),
      dietary: normalizeDietaryList(item && item.dietary),
      priceText: sanitizeString(splitFi.priceText, null),
      category: category && ALLOWED_CATEGORIES.has(category) ? category : "other",
    });
  }

  recoverMissingItemPrices(out, context.structured);
  applyNoteSafeguards(out, context.structured, context.sourceLanguage);
  enforceCurrency(out, context.structured);

  return out;
}

function createErrorRestaurant(context, error) {
  return {
    cacheFile: context.cacheFile,
    restaurantName: context.restaurantName,
    sourceLanguage: context.sourceLanguage,
    currency: null,
    items: [],
    notesFi: [],
    notesEn: [],
    rawMenuText: context.rawMenuText,
    date: context.date,
    rawMenuHtml: context.rawMenuHtml,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function buildPrompt(batchInput) {
  return [
    "You are a strict menu normalization engine for production use.",
    "Return JSON only. No markdown, no code fences, no explanations.",
    "Normalize EACH input restaurant independently and return one output entry per input entry.",
    "Never invent ingredients, allergens, prices, or notes.",
    "Preserve dietary markers exactly when present (M, G, L, VE, VL, V, DF, GF, VS).",
    "PRICE RULES:",
    "- If an item has visible price in source, ALWAYS set priceText.",
    "- Never drop visible euro prices.",
    "- If price is embedded in title, split it out into priceText.",
    "- Keep visible source price style when possible.",
    "FLUFF FILTER RULES:",
    "- Remove welcome/location/promotional fluff.",
    "- Keep only actual menu items and lunch-relevant notes/prices.",
    "- Move buffet/lunch-wide pricing into notesFi/notesEn, not fake items.",
    "TRANSLATION RULES:",
    "- Translate to natural English in nameEn.",
    "- Preserve Finnish in nameFi when present.",
    "- If source is already English, nameFi should usually be null.",
    "category must be one of: soup, main, vegetarian, vegan, ramen, don, burger, schnitzel, dessert, side, buffet, other.",
    "Set currency to EUR only when euro pricing exists, otherwise null.",
    "Keep cacheFile unchanged from input.",
    "Keep restaurantName unchanged from input.",
    "Keep rawMenuText unchanged from input.",
    "",
    "Input array JSON:",
    JSON.stringify(batchInput),
  ].join("\n");
}

function parseJsonLoose(text) {
  const direct = String(text || "").trim();
  if (!direct) {
    throw new Error("Empty model response.");
  }

  try {
    return JSON.parse(direct);
  } catch (_) {}

  const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const firstBrace = direct.indexOf("{");
  const lastBrace = direct.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(direct.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Unable to parse Gemini JSON response.");
}

function shouldSkipForTodayCache(today) {
  if (!fs.existsSync(OUTPUT_MINIFIED)) {
    return false;
  }
  try {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_MINIFIED, "utf8"));
    if (existing && existing.date === today) {
      console.log(
        `[normalize] Skipping regeneration. ${path.basename(
          OUTPUT_MINIFIED
        )} already has date ${today}.`
      );
      return true;
    }
  } catch (error) {
    console.warn(
      `[normalize] Existing normalized output unreadable; regenerating. (${error.message})`
    );
  }
  return false;
}

function chooseTopLevelDate(restaurants) {
  const counts = new Map();
  for (const restaurant of restaurants) {
    if (restaurant && typeof restaurant.date === "string" && restaurant.date) {
      counts.set(restaurant.date, (counts.get(restaurant.date) || 0) + 1);
    }
  }
  if (counts.size === 0) {
    return null;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function splitIntoChunks(entries) {
  const chunks = [];
  let current = [];
  let currentChars = 0;

  for (const entry of entries) {
    const entryChars = JSON.stringify(entry).length;
    const wouldOverflowChars = currentChars + entryChars > CHUNK_MAX_CHARS;
    const wouldOverflowItems = current.length >= CHUNK_MAX_ITEMS;

    if (current.length > 0 && (wouldOverflowChars || wouldOverflowItems)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(entry);
    currentChars += entryChars;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

async function callGeminiBatch(ai, batchInput, waitTurn) {
  await waitTurn();
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: buildPrompt(batchInput),
    config: {
      temperature: 0,
      topP: 0.05,
      responseMimeType: "application/json",
      responseSchema: GEMINI_BATCH_RESPONSE_SCHEMA,
    },
  });
  return parseJsonLoose(response.text || "");
}

function readCacheContexts(cacheFiles) {
  const contexts = [];
  const errorsByFile = new Map();

  for (const cacheFile of cacheFiles) {
    const filePath = path.join(CACHE_DIR, cacheFile);
    const restaurantName = getRestaurantNameFromCacheFile(cacheFile);

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      const fallback = {
        cacheFile,
        restaurantName,
        sourceLanguage: "unknown",
        rawMenuText: "",
        rawMenuHtml: "",
        date: null,
      };
      errorsByFile.set(cacheFile, createErrorRestaurant(fallback, error));
      continue;
    }

    const rawMenuHtml = typeof parsed.menu === "string" ? parsed.menu : "";
    const structured = extractStructuredMenuFromHtml(rawMenuHtml);
    const rawMenuText = structured.rawMenuText;
    const sourceLanguage = detectLikelyLanguage(rawMenuText);
    const date = typeof parsed.date === "string" ? parsed.date : null;

    contexts.push({
      cacheFile,
      restaurantName,
      date,
      rawMenuHtml,
      rawMenuText,
      sourceLanguage,
      structured,
    });
  }

  return { contexts, errorsByFile };
}

async function normalizeAllWithBatches(ai, contexts) {
  const waitTurn = createRequestThrottle();
  const byCacheFile = new Map();

  const allInput = contexts.map((ctx) => ({
    cacheFile: ctx.cacheFile,
    restaurantName: ctx.restaurantName,
    date: ctx.date,
    rawMenuHtml: ctx.rawMenuHtml,
    rawMenuText: ctx.rawMenuText,
  }));

  try {
    console.log(`[normalize] Sending single Gemini batch request (${allInput.length} restaurants)...`);
    const parsed = await callGeminiBatch(ai, allInput, waitTurn);
    const outputRestaurants = Array.isArray(parsed && parsed.restaurants)
      ? parsed.restaurants
      : [];

    const contextByCache = new Map(contexts.map((ctx) => [ctx.cacheFile, ctx]));
    for (const raw of outputRestaurants) {
      const cacheFile = sanitizeString(raw && raw.cacheFile, null);
      if (!cacheFile || !contextByCache.has(cacheFile)) {
        continue;
      }
      const context = contextByCache.get(cacheFile);
      byCacheFile.set(cacheFile, validateAndSanitizeRestaurant(raw, context));
    }

    return byCacheFile;
  } catch (singleError) {
    console.warn(
      `[normalize] Single batch failed, falling back to chunked mode: ${
        singleError instanceof Error ? singleError.message : String(singleError)
      }`
    );
  }

  const chunks = splitIntoChunks(contexts);
  console.log(`[normalize] Chunked mode: ${chunks.length} chunk(s).`);

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const chunkInput = chunk.map((ctx) => ({
      cacheFile: ctx.cacheFile,
      restaurantName: ctx.restaurantName,
      date: ctx.date,
      rawMenuHtml: ctx.rawMenuHtml,
      rawMenuText: ctx.rawMenuText,
    }));

    try {
      console.log(
        `[normalize] Sending chunk ${i + 1}/${chunks.length} (${chunkInput.length} restaurants)...`
      );
      const parsed = await callGeminiBatch(ai, chunkInput, waitTurn);
      const outputRestaurants = Array.isArray(parsed && parsed.restaurants)
        ? parsed.restaurants
        : [];
      const contextByCache = new Map(chunk.map((ctx) => [ctx.cacheFile, ctx]));

      for (const raw of outputRestaurants) {
        const cacheFile = sanitizeString(raw && raw.cacheFile, null);
        if (!cacheFile || !contextByCache.has(cacheFile)) {
          continue;
        }
        const context = contextByCache.get(cacheFile);
        byCacheFile.set(cacheFile, validateAndSanitizeRestaurant(raw, context));
      }
    } catch (chunkError) {
      console.error(
        `[normalize] Chunk ${i + 1} failed: ${
          chunkError instanceof Error ? chunkError.message : String(chunkError)
        }`
      );
      for (const ctx of chunk) {
        if (!byCacheFile.has(ctx.cacheFile)) {
          byCacheFile.set(ctx.cacheFile, createErrorRestaurant(ctx, chunkError));
        }
      }
    }
  }

  return byCacheFile;
}

async function normalizeMenus(options = {}) {
  const skipIfFresh = options.skipIfFresh !== false;
  const today = options.today || getTodayInHelsinki();

  console.log("[normalize] Starting menu normalization pipeline...");

  if (skipIfFresh && shouldSkipForTodayCache(today)) {
    return JSON.parse(fs.readFileSync(OUTPUT_MINIFIED, "utf8"));
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }
  if (!fs.existsSync(CACHE_DIR)) {
    throw new Error(`Cache directory does not exist: ${CACHE_DIR}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const cacheFiles = fs
    .readdirSync(CACHE_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort();

  if (cacheFiles.length === 0) {
    throw new Error("No cache JSON files found in cache/.");
  }

  console.log(`[normalize] Found ${cacheFiles.length} cache files.`);

  const { contexts, errorsByFile } = readCacheContexts(cacheFiles);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const normalizedByFile = await normalizeAllWithBatches(ai, contexts);

  const restaurants = cacheFiles.map((cacheFile) => {
    if (errorsByFile.has(cacheFile)) {
      return errorsByFile.get(cacheFile);
    }

    if (normalizedByFile.has(cacheFile)) {
      return normalizedByFile.get(cacheFile);
    }

    const context = contexts.find((ctx) => ctx.cacheFile === cacheFile);
    if (context) {
      return createErrorRestaurant(
        context,
        new Error("No normalized output returned for this restaurant.")
      );
    }

    return createErrorRestaurant(
      {
        cacheFile,
        restaurantName: getRestaurantNameFromCacheFile(cacheFile),
        sourceLanguage: "unknown",
        rawMenuText: "",
        rawMenuHtml: "",
        date: null,
      },
      new Error("Missing context for cache file.")
    );
  });

  const combined = {
    date: chooseTopLevelDate(restaurants),
    generatedAt: new Date().toISOString(),
    model: MODEL_NAME,
    restaurants,
  };

  fs.writeFileSync(OUTPUT_MINIFIED, JSON.stringify(combined), "utf8");
  fs.writeFileSync(OUTPUT_PRETTY, JSON.stringify(combined, null, 2), "utf8");

  console.log(
    `[normalize] Done. Wrote ${path.relative(
      ROOT_DIR,
      OUTPUT_MINIFIED
    )} and ${path.relative(ROOT_DIR, OUTPUT_PRETTY)}`
  );

  return combined;
}

async function main() {
  const force = process.argv.includes("--force");
  await normalizeMenus({ skipIfFresh: !force });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `[normalize] Failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  normalizeMenus,
  getTodayInHelsinki,
  OUTPUT_MINIFIED,
  OUTPUT_PRETTY,
};
