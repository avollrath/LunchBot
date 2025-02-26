const axios = require("axios");

// Helper: Convert a string to Title Case.
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

async function scrapeDylanMenu(url) {
  try {
    console.log("Starting to fetch Dylan JSON menu from:", url);
    const response = await axios.get(url);
    const jsonData = response.data;
    
    if (!jsonData.success || !jsonData.data || !jsonData.data.week) {
      throw new Error("Invalid JSON structure");
    }
    
    const days = jsonData.data.week.days;
    // Use the current day number (Sunday = 0, Monday = 1, etc.) to locate today's menu.
    const currentDayNumber = new Date().getDay();
    const todayMenu = days.find(day => day.dayNumber === currentDayNumber);
    
    if (!todayMenu) {
      return "Sorry, today's menu could not be found.";
    }
    
    if (todayMenu.isClosed) {
      return "The restaurant is closed today.";
    }
    
    if (!todayMenu.lunches || todayMenu.lunches.length === 0) {
      return "No lunch options found for today.";
    }
    
    // Process each lunch item and build a dishes array.
    const dishes = todayMenu.lunches.map(lunch => {
      // Use the English title; if not provided, fallback to "No title".
      const rawTitle = (lunch.title.en || "No title").trim();
      // Convert dish title to title case.
      const dishName = toTitleCase(rawTitle);
      
      // Format the price if available.
      const price = (lunch.normalPrice && lunch.normalPrice.price)
        ? lunch.normalPrice.price.trim() + " " + (lunch.normalPrice.unit.en || "").trim()
        : "";
      
      // Get the description (ingredients) if provided.
      const description = (lunch.description.en || "").trim();
      
      return { dishName, price, description };
    });
    
    // Build HTML output.
    // Each dish becomes an <li> with the dish title (and price) in bold, and its description on a new line.
    let menuHtml = `<ul>` + dishes.map(dish => {
      const titlePart = `<strong>${dish.dishName}${dish.price ? ` <span>${dish.price}</span>` : ""}</strong>`;
      const descriptionPart = dish.description ? `<br>${dish.description}` : "";
      return `<li>${titlePart}${descriptionPart}</li>`;
    }).join('') + `</ul>`;

     menuHtml +=`<br/><p>Buffet price: <strong>14,70€</strong></p>`
    
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Dylan JSON menu:", error);
    throw error;
  }
}

module.exports = scrapeDylanMenu;
