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

async function scrapeSizzleStationMenu(url) {
  try {
    console.log("Starting to scrape Sizzle Station menu...");
    // Replace with the actual URL for Sizzle Station
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // Select all category blocks (each dish group)
    const categoryBlocks = $("div.single-item");
    if (!categoryBlocks.length) {
      return "Sorry, today's menu could not be found. Please check again later.";
    }
    
    // We will build an overall nested list
    let outputHtml = "<ul>";
    
    categoryBlocks.each(function() {
      const categoryBlock = $(this);
      
      // Get the category title from an h2 element. Prefer h2.heading-40.
      let categoryTitle = categoryBlock.find("h2.heading-40").first().text().trim();
      if (!categoryTitle) {
        categoryTitle = categoryBlock.find("h2").first().text().trim();
      }
      // Convert to title case
      categoryTitle = toTitleCase(categoryTitle);
      
      // Optionally get a category description from a container (if desired)
      let categoryDesc = "";
      const descEl = categoryBlock.find("div.max-w-[800px] p").first();
      if (descEl.length) {
        categoryDesc = descEl.text().trim();
      }
      
      // Process dish options within the category.
      let dishItems = [];
      const optionsBlock = categoryBlock.find("div.single-item__options");
      // Each dish option is in a child div with flex classes.
      optionsBlock.find("div.flex").each(function() {
        const dishTitleEl = $(this).find("p").first();
        const priceEl = $(this).find("p").last();
        
        let dishTitle = dishTitleEl.text().trim();
        // Remove anything within parentheses, e.g. (s,e), (s,m,f,n,g,e), etc.
        dishTitle = dishTitle.replace(/\s*\([^)]*\)/g, "").trim();
        dishTitle = toTitleCase(dishTitle);
        
        let price = priceEl.text().trim();
        if (price && !price.endsWith("€")) {
          price = price + " €";
        }
        // Wrap the price in <strong> tags.
        price = price ? `<strong>${price}</strong>` : "";
        
        // Build the dish option text
        dishItems.push({ dishTitle, price });
      });
      
      // Build the HTML for this category as a nested list item.
      let categoryHtml = `<li><strong>${categoryTitle}</strong>`;
      if (categoryDesc) {
        categoryHtml += `<p>${categoryDesc}</p>`;
      }
      if (dishItems.length > 0) {
        categoryHtml += `<ul>`;
        dishItems.forEach(item => {
          const dishText = `${item.dishTitle}${item.price ? ` ${item.price}` : ""}`;
          categoryHtml += `<li>${dishText}</li>`;
        });
        categoryHtml += `</ul>`;
      }
      categoryHtml += `</li>`;
      
      outputHtml += categoryHtml;
    });
    
    outputHtml += "</ul>";
    return outputHtml;
  } catch (error) {
    console.error("Failed to fetch Sizzle Station menu:", error);
    throw error;
  }
}

module.exports = scrapeSizzleStationMenu;
