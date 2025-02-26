const axios = require("axios");
const cheerio = require("cheerio");

// Helper function: Convert a string to Title Case.
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

async function scrapeHankoAsiaMenu() {
  try {
    console.log("Starting to scrape Hanko Aasia menu...");
    const response = await axios.get("https://www.hankoaasia.fi/en/lounas/#lounas");
    const $ = cheerio.load(response.data);

    // Get today's day in English (e.g. "Monday", "Tuesday", etc.)
    const today = new Date();
    const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
    console.log(`Looking for menu for: ${dayName}`);

    // Find the day header element (e.g. an h3 containing "Tuesday")
    const dayHeader = $("h3.fusion-title-heading")
      .filter(function() {
        return $(this).text().trim().toLowerCase().includes(dayName.toLowerCase());
      })
      .first();

    if (!dayHeader || dayHeader.length === 0) {
      console.log("No matching day header found");
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    // Get the parent container holding the day's content.
    // (Assuming each day's dishes are grouped in a single fusion-layout-column)
    const dayContainer = dayHeader.closest(".fusion-layout-column");
    if (!dayContainer || dayContainer.length === 0) {
      console.log("No day container found");
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    // Find all table blocks that contain dish prices.
    // We assume each dish group starts with a "div.table-2.menutaulukko"
    const dishElements = dayContainer.find("div.table-2.menutaulukko");
    let dishes = [];
    dishElements.each(function(index, elem) {
      // Get the price from the table block (e.g. "13,50 €")
      let priceRaw = $(elem).find("strong").first().text().trim();
      // Ensure price ends with "€"
      let price = priceRaw;
      if (price && !price.endsWith("€")) {
        price = price + " €";
      }

      // Look for the next fusion-title element after this table block.
      const dishTitleElem = $(elem).nextAll("div.fusion-title").first();
      // Then, the fusion-text element that immediately follows the dish title holds the description.
      const dishDescElem = dishTitleElem.nextAll("div.fusion-text").first();

      let dishName = dishTitleElem.text().trim();
      // Convert the dish name to title case.
      dishName = toTitleCase(dishName);
      const dishDesc = dishDescElem.text().trim();

      if (dishName) {
        dishes.push({ dishName, price, dishDesc });
      }
    });

    if (dishes.length === 0) {
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    // Build HTML output: Each dish becomes an <li> with the title (and price) in bold,
    // and the dish description on a new line within the same list item.
    const menuHtml = `<ul>` + dishes.map(dish => {
      const titlePart = `<strong>${dish.dishName}${dish.price ? ` <span>${dish.price}</span>` : ""}</strong>`;
      const descriptionPart = dish.dishDesc ? `<br>${dish.dishDesc}` : "";
      return `<li>${titlePart}${descriptionPart}</li>`;
    }).join('') + `</ul>`;

    console.log("Hanko Aasia menu HTML:", menuHtml);
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Hanko Aasia menu:", error);
    throw error;
  }
}

module.exports = scrapeHankoAsiaMenu;
