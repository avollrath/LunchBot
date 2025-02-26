const axios = require("axios");
const cheerio = require("cheerio");

// Helper function: Convert string to Title Case.
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map(word => {
      // Handle any empty strings
      return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
    })
    .join(" ");
}

async function scrapeLimoneTriplaMenu() {
  try {
    console.log("Starting to scrape Tripla Limone menu...");
    const response = await axios.get("https://tripla.limone.fi/lounas/");
    const $ = cheerio.load(response.data);
    const today = new Date();
    // Finnish days in order (Sunday = index 0)
    const daysOfWeek = ["SUNNUNTAI", "MAANANTAI", "TIISTAI", "KESKIVIIKKO", "TORSTAI", "PERJANTAI", "LAUANTAI"];
    const dayOfWeek = daysOfWeek[today.getDay()];
    console.log(`Looking for menu items for: ${dayOfWeek}`);
    
    // We'll build an array of dishes
    let dishes = [];
    
    // Find the <h3> element that exactly matches today's day (the text is expected in uppercase)
    let dayHeading;
    $("div.page-content h3").each(function () {
      const headingText = $(this).text().trim().toUpperCase();
      if (headingText === dayOfWeek) {
        dayHeading = $(this);
        return false; // break out of the loop once found
      }
    });
    
    if (dayHeading && dayHeading.length > 0) {
      console.log("Found heading for today's menu:", dayOfWeek);
      // Get all elements until the next h3 tag
      const menuElements = dayHeading.nextUntil("h3");
      
      menuElements.each(function () {
        const p = $(this);
        if (p.is("p")) {
          // Look for a dish title contained in a <strong>
          const strongEl = p.find("strong");
          if (strongEl.length > 0) {
            let rawTitle = strongEl.text().trim();
            // Extract price using regex (e.g. "13,70")
            let priceMatch = rawTitle.match(/(\d+,\d+)/);
            let price = "";
            if (priceMatch) {
              price = priceMatch[1] + "€";
              // Remove the price from the raw title text
              rawTitle = rawTitle.replace(priceMatch[0], "").trim();
            }
            // Convert dish title to title case
            const dishName = toTitleCase(rawTitle);
            
            // Get the description from an <em> element (if available)
            let description = "";
            const emEl = p.find("em");
            if (emEl.length > 0) {
              description = emEl.text().trim();
            }
            
            dishes.push({ dishName, price, description });
          }
        }
      });
    }
    
    // Build HTML output: Each dish becomes a <li> with the title (and price) in bold and description below.
    const menuHtml = dishes.length > 0
      ? `<ul>${dishes.map(dish => {
          // Format title: Bold dish name with price appended in bold.
          const titleHtml = `<strong>${dish.dishName}${dish.price ? ` <span>${dish.price}</span>` : ""}</strong>`;
          // If there's a description, place it in a new line within the same list item.
          const descriptionHtml = dish.description ? `<br>${dish.description}` : "";
          return `<li>${titleHtml}${descriptionHtml}</li>`;
        }).join('')}</ul>`
      : "Sorry, today's menu could not be found. Please check again later.";
    
    console.log("Tripla Limone menu HTML:", menuHtml);
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Tripla Limone menu:", error);
    throw error;
  }
}

module.exports = scrapeLimoneTriplaMenu;
