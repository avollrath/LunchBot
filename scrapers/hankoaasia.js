const axios = require("axios");
const cheerio = require("cheerio");

const DEFAULT_HANKO_URL = "https://hankoaasia-tripla.bestorante.com/";
const HANKO_ASSORTMENT_PRICE_FALLBACK = {
  "small assortment": "12,90 EUR",
  "medium assortment": "13,70 EUR",
  "large assortment": "15,90 EUR",
  "veggie assortment": "13,70 EUR",
  "salmon lover": "15,90 EUR",
  "pieni lajitelma": "12,90 EUR",
  "normaali lajitelma": "13,70 EUR",
  "iso lajitelma": "15,90 EUR",
  "kasvislajitelma": "13,70 EUR",
  "lohirakastaja": "15,90 EUR",
};

function cleanText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePrice(raw = "") {
  const match = String(raw).match(/\d{1,2},\d{2}/);
  return match ? `${match[0]} EUR` : "";
}

function priceFallbackForName(name = "") {
  return HANKO_ASSORTMENT_PRICE_FALLBACK[String(name).toLowerCase().trim()] || "";
}

function buildMenuHtml(items) {
  if (!items.length) {
    return "Sorry, today's menu could not be found. Please check again later.";
  }

  return (
    "<ul>" +
    items
      .map((item) => {
        const titlePart = `<strong>${item.name}${item.price ? ` <span>${item.price}</span>` : ""}</strong>`;
        const descriptionPart = item.description ? `<br>${item.description}` : "";
        return `<li>${titlePart}${descriptionPart}</li>`;
      })
      .join("") +
    "</ul>"
  );
}

function parseLunchFromHtml($) {
  const lunchGroup = $(".group-container")
    .filter((_, element) => {
      const groupName = cleanText($(element).find(".group-name").first().text()).toLowerCase();
      return groupName === "lunch";
    })
    .first();

  if (!lunchGroup.length) {
    return [];
  }

  const items = [];
  lunchGroup.find(".group-articles-item").each((_, element) => {
    const name = cleanText($(element).find(".group-item-name").first().text());
    if (!name) {
      return;
    }

    const description = cleanText($(element).find(".group-item-description").first().text());
    const rawPrice = cleanText($(element).find(".bottom-menu-button-content").first().text());
    const priceMatch = rawPrice.match(/\d{1,2},\d{2}/);
    const price = priceMatch ? `${priceMatch[0]} EUR` : "";

    items.push({ name, description, price });
  });

  return items;
}

function parseLunchFromMirror(markdown) {
  const lines = markdown
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

  const itemNamePattern =
    /^(small assortment|medium assortment|large assortment|veggie assortment|salmon lover|pieni lajitelma|normaali lajitelma|iso lajitelma|kasvislajitelma|lohirakastaja)$/i;

  const itemsByName = new Map();
  const items = [];
  let inLunchSection = false;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (!inLunchSection) {
      if (lower === "lounas") {
        inLunchSection = true;
      }
      continue;
    }

    if (lower.startsWith("title:") || lower.startsWith("url source:") || lower === "markdown content:") {
      continue;
    }

    if (line.startsWith("![Image")) {
      continue;
    }

    if (line.startsWith("**") && items.length > 0) {
      items[items.length - 1].description = line.replace(/\*\*/g, "").trim();
      continue;
    }

    // If a line contains inline price with a known item, extract both.
    const withPrice = line.match(
      /^(small assortment|medium assortment|large assortment|veggie assortment|salmon lover|pieni lajitelma|normaali lajitelma|iso lajitelma|kasvislajitelma|lohirakastaja).{0,20}?(\d{1,2},\d{2})\s*€/i
    );
    if (withPrice) {
      const name = cleanText(withPrice[1]);
      const price = normalizePrice(withPrice[2]);
      const key = name.toLowerCase();
      if (!itemsByName.has(key)) {
        const item = { name, description: "", price };
        items.push(item);
        itemsByName.set(key, item);
      } else if (!itemsByName.get(key).price) {
        itemsByName.get(key).price = price;
      }
      continue;
    }

    if (itemNamePattern.test(line)) {
      const name = cleanText(line);
      const key = name.toLowerCase();
      if (itemsByName.has(key)) {
        continue;
      }
      items.push({
        name,
        description: "",
        price: priceFallbackForName(name),
      });
      itemsByName.set(key, items[items.length - 1]);
      continue;
    }

    // Stop if we have already collected items and hit a non-menu section.
    if (items.length > 0 && /^(drinks|juomat|allergens|allergeenit)/i.test(lower)) {
      break;
    }
  }

  return items;
}

async function scrapeHankoAsiaMenu(url = DEFAULT_HANKO_URL) {
  try {
    console.log("Starting to scrape Hanko Aasia menu...");

    const response = await axios.get(url);
    let $ = cheerio.load(response.data);

    let items = parseLunchFromHtml($);

    // Fallback for JS-rendered page where lunch items are not present in initial HTML.
    if (items.length === 0) {
      console.log("Lunch group not in raw HTML, trying rendered mirror fallback...");
      const mirrorUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
      const mirrorResponse = await axios.get(mirrorUrl);
      items = parseLunchFromMirror(mirrorResponse.data || "");
    }

    const menuHtml = buildMenuHtml(items);
    console.log("Hanko Aasia menu HTML:", menuHtml);
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Hanko Aasia menu:", error);
    throw error;
  }
}

module.exports = scrapeHankoAsiaMenu;
