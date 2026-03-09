const path = require("path");

const scrapeDylanMenu = require("../scrapers/dylan");
const scrapeSchnitzelMenu = require("../scrapers/schnitzel");
const scrapeBurgersMenu = require("../scrapers/burgers&wine");
const scrapeFactoryMenu = require("../scrapers/factory");
const scrapeHankoAsiaMenu = require("../scrapers/hankoaasia");
const scrapeLimoneTriplaMenu = require("../scrapers/limone");
const scrapeTokumaruMenu = require("../scrapers/tokumaru");
const scrapeSizzleStationMenu = require("../scrapers/sizzlestation");
const scrapeVaunuMenu = require("../scrapers/vaunu");

const RESTAURANT_DEFS = [
  {
    id: "factory",
    name: "Factory Pasila",
    url: "https://ravintolafactory.com/lounasravintolat/ravintolat/factory-pasila/",
    cacheFile: "factoryCache.json",
    scrapeFunction: scrapeFactoryMenu,
  },
  {
    id: "burgers",
    name: "Burgers & Wine",
    url: "https://burgersandwine.fi/lounas/",
    cacheFile: "burgersCache.json",
    scrapeFunction: scrapeBurgersMenu,
  },
  {
    id: "limone",
    name: "Tripla Limone",
    url: "https://tripla.limone.fi/lounas/",
    cacheFile: "limoneCache.json",
    scrapeFunction: scrapeLimoneTriplaMenu,
  },
  {
    id: "schnitzel",
    name: "The Schnitzel",
    url: "https://europe-west1-luncher-7cf76.cloudfunctions.net/api/v1/week/9af82d20-966d-4f10-a4a9-1465a05a7e22/active?language=en",
    cacheFile: "schnitzelCache.json",
    scrapeFunction: scrapeSchnitzelMenu,
  },
  {
    id: "hanko",
    name: "Hanko Aasia",
    url: "https://hankoaasia-tripla.bestorante.com/",
    cacheFile: "hankoCache.json",
    scrapeFunction: scrapeHankoAsiaMenu,
  },
  {
    id: "tokumaruEng",
    name: "Tokumaru",
    url: "https://www.tokumaru.fi/lunch-menu",
    cacheFile: "tokumaruCache.json",
    scrapeFunction: scrapeTokumaruMenu,
  },
  {
    id: "dylan",
    name: "Dylan Bole",
    url: "https://europe-west1-luncher-7cf76.cloudfunctions.net/api/v1/week/3aba0b64-0d43-41ea-b665-1d2d6c0f2d5e/active?language=en",
    cacheFile: "dylanCache.json",
    scrapeFunction: scrapeDylanMenu,
  },
  {
    id: "sizzle",
    name: "Sizzle Station",
    url: "https://www.sizzlestation.com/menu/",
    cacheFile: "sizzleCache.json",
    scrapeFunction: scrapeSizzleStationMenu,
  },
  {
    id: "vaunu",
    name: "Vaunu",
    url: "https://jk-kitchen.fi/vaunu/#lounas",
    cacheFile: "vaunuCache.json",
    scrapeFunction: scrapeVaunuMenu,
  },
];

function getRestaurants(cacheDir) {
  return RESTAURANT_DEFS.map((restaurant) => ({
    ...restaurant,
    cachePath: path.join(cacheDir, restaurant.cacheFile),
  }));
}

module.exports = {
  RESTAURANT_DEFS,
  getRestaurants,
};

