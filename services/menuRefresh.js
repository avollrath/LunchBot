const fs = require("fs");
const path = require("path");
const { getRestaurants } = require("../config/restaurants");
const { getAllMenus } = require("./rawMenuFetch");
const { normalizeMenus } = require("../scripts/normalize-menus");

const ROOT_DIR = path.join(__dirname, "..");
const CACHE_DIR = path.join(ROOT_DIR, "cache");
const DATA_DIR = path.join(ROOT_DIR, "data");
const NORMALIZED_MENUS_PATH = path.join(DATA_DIR, "normalizedMenus.json");

let refreshPromise = null;

function getTodayInHelsinki() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function readNormalizedMenusIfExists() {
  if (!fs.existsSync(NORMALIZED_MENUS_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(NORMALIZED_MENUS_PATH, "utf8"));
  } catch (error) {
    console.warn("Failed to parse normalizedMenus.json, treating as missing.");
    return null;
  }
}

function isNormalizedMenusFresh(data) {
  return Boolean(
    data &&
      typeof data === "object" &&
      typeof data.date === "string" &&
      data.date === getTodayInHelsinki()
  );
}

async function runFullMenuRefresh() {
  // Render Free uses an ephemeral filesystem, so ensure folders exist every refresh.
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const today = getTodayInHelsinki();
  const restaurants = getRestaurants(CACHE_DIR);

  console.log("Running full menu refresh (scrape + Gemini normalization)...");
  await getAllMenus({ restaurants, date: today });

  // One combined Gemini request (with chunk fallback in normalize script).
  return normalizeMenus({ skipIfFresh: false });
}

async function ensureMenusAreFresh() {
  const existing = readNormalizedMenusIfExists();
  if (existing && isNormalizedMenusFresh(existing)) {
    console.log("Menus already fresh for today");
    return existing;
  }

  if (!existing) {
    console.log("Normalized menu file missing, rebuilding");
  } else {
    console.log("Menus stale or missing, regenerating");
  }

  // Lock refresh so concurrent requests await the same in-flight promise.
  if (refreshPromise) {
    console.log("Refresh already in progress, awaiting existing promise");
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      return await runFullMenuRefresh();
    } catch (error) {
      const fallback = readNormalizedMenusIfExists();
      if (fallback) {
        console.warn("Using last known normalized menus after refresh failure");
        return fallback;
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

module.exports = {
  CACHE_DIR,
  DATA_DIR,
  NORMALIZED_MENUS_PATH,
  getTodayInHelsinki,
  readNormalizedMenusIfExists,
  isNormalizedMenusFresh,
  runFullMenuRefresh,
  ensureMenusAreFresh,
};
