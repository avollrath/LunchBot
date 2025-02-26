const axios = require("axios");
const cheerio = require("cheerio");

// Helper: Convert a string to Title Case.
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

async function scrapeTokumaruMenu() {
  try {
    console.log("Starting to scrape Tokumaru English lunch menu...");
    const response = await axios.get("https://www.tokumaru.fi/lunch-menu");
    const $ = cheerio.load(response.data);

    // Narrow down to the main content area.
    const contentElem = $("main.content.menu-content").find(".sqs-html-content").first();
    if (!contentElem || contentElem.length === 0) {
      console.log("No content element found.");
      return "Sorry, today's menu could not be found. Please check again later.";
    }
    
    // Use the English day name (e.g. "Monday")
    const today = new Date();
    const dayName = today.toLocaleDateString("en-US", { weekday: "long" }).trim();
    console.log(`Looking for menu for: ${dayName}`);
    
    // Find the day header <h3> that contains today's day name.
    let dayHeader;
    contentElem.find("h3").each(function () {
      const headerText = $(this).text().trim();
      if (headerText.toLowerCase().includes(dayName.toLowerCase())) {
        dayHeader = $(this);
        return false;
      }
    });
    
    if (!dayHeader || dayHeader.length === 0) {
      console.log(`Day header for ${dayName} not found.`);
      return "Sorry, today's menu could not be found. Please check again later.";
    }
    
    // Gather all <p> elements between this day header and the next <h3>.
    let dishParas = [];
    let sibling = dayHeader.next();
    while (sibling.length && sibling.get(0).tagName.toLowerCase() !== "h3") {
      if (sibling.is("p")) {
        const txt = sibling.text().trim();
        if (txt) {
          dishParas.push(sibling);
        }
      }
      sibling = sibling.next();
    }
    
    // Group the paragraphs in pairs (first = title, second = description).
    let dishes = [];
    for (let i = 0; i < dishParas.length; i += 2) {
      const titleEl = dishParas[i];
      let titleTextRaw = $(titleEl).text().trim();
      let descriptionText = "";
      
      // If there's a next paragraph, treat it as description.
      if (i + 1 < dishParas.length) {
        descriptionText = $(dishParas[i + 1]).text().trim();
      }
      
      // Extract price from title if present (e.g., "13,50")
      let price = "";
      const priceMatch = titleTextRaw.match(/(\d+,\d+)/);
      if (priceMatch) {
        price = priceMatch[1] + " €";
        // Remove the price from the title text.
        titleTextRaw = titleTextRaw.replace(priceMatch[0], "").trim();
      }
      
      // Convert the dish title to title case.
      const dishName = toTitleCase(titleTextRaw);
      
      dishes.push({ dishName, price, description: descriptionText });
    }
    
    // Build the HTML output.
    // Each dish becomes an <li> with the title (with price) in bold and description on a new line.
    const menuHtml = dishes.length > 0
      ? `<ul>${dishes.map(dish => {
          const titlePart = `<strong>${dish.dishName}${dish.price ? ` <span>${dish.price}</span>` : ""}</strong>`;
          const descriptionPart = dish.description ? `<br>${dish.description}` : "";
          return `<li>${titlePart}${descriptionPart}</li>`;
        }).join('')}</ul>`
      : "Sorry, today's menu could not be found. Please check again later.";
    
    console.log("Extracted Tokumaru menu HTML:", menuHtml.substring(0, 300) + "...");
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Tokumaru English lunch menu:", error);
    throw error;
  }
}

module.exports = scrapeTokumaruMenu;
