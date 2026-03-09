const fs = require("fs");
const path = require("path");
const { getRestaurants } = require("../config/restaurants");

const CACHE_DIR = path.join(__dirname, "..", "cache");

function getTodayInHelsinki() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function isFallbackMenu(menuText = "") {
  const normalized = String(menuText).toLowerCase();
  return (
    normalized.includes("today's menu could not be found") ||
    normalized.includes("sorry, couldn't fetch menu")
  );
}

function readCache(cachePath) {
  if (!fs.existsSync(cachePath)) {
    return { menu: "", date: "" };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    return {
      menu: typeof parsed.menu === "string" ? parsed.menu : "",
      date: typeof parsed.date === "string" ? parsed.date : "",
    };
  } catch (error) {
    return { menu: "", date: "" };
  }
}

async function getRestaurantMenu(restaurant, opts = {}) {
  const currentDate = opts.date || getTodayInHelsinki();
  const cache = readCache(restaurant.cachePath);

  if (cache.date === currentDate && cache.menu && !isFallbackMenu(cache.menu)) {
    console.log(`Serving menu from cache for ${restaurant.name}.`);
    return cache.menu;
  }

  console.log(`Fetching fresh menu from ${restaurant.name}...`);
  const menuText = await restaurant.scrapeFunction(restaurant.url);
  const safeMenu =
    menuText ||
    `Sorry, today's menu could not be found for ${restaurant.name}. Please check again later.`;

  fs.writeFileSync(
    restaurant.cachePath,
    JSON.stringify({ menu: safeMenu, date: currentDate }),
    "utf8"
  );

  return safeMenu;
}

async function getAllMenus(opts = {}) {
  const date = opts.date || getTodayInHelsinki();
  const restaurants = opts.restaurants || getRestaurants(CACHE_DIR);

  const menuPromises = restaurants.map(async (restaurant) => {
    try {
      const menu = await getRestaurantMenu(restaurant, { date });
      return {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        menu,
      };
    } catch (error) {
      console.error(`Error fetching menu for ${restaurant.name}:`, error);
      return {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        menu: `Sorry, couldn't fetch menu for ${restaurant.name}. Error: ${error.message}`,
      };
    }
  });

  return Promise.all(menuPromises);
}

module.exports = {
  CACHE_DIR,
  getTodayInHelsinki,
  isFallbackMenu,
  getRestaurantMenu,
  getAllMenus,
};
