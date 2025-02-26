const axios = require("axios");

// Helper function to convert a string to Title Case.
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

async function scrapeSchnitzelMenu(url) {
  try {
    console.log("Starting to fetch The Schnitzel JSON menu from:", url);
    const response = await axios.get(url);
    const jsonData = response.data;
    
    if (!jsonData.success || !jsonData.data || !jsonData.data.week) {
      throw new Error("Invalid JSON structure");
    }
    
    const days = jsonData.data.week.days;
    const currentDayNumber = new Date().getDay(); // Sunday = 0, Monday = 1, etc.
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
    
    // Process each lunch dish.
    const dishes = todayMenu.lunches.map(lunch => {
      // Use the English title; if not provided, fallback to "No title".
      const rawTitle = (lunch.title && lunch.title.en ? lunch.title.en.trim() : "No title");
      // Convert the dish title to title case.
      const dishName = toTitleCase(rawTitle);
      
      // Get the description (ingredients) if available.
      const description = (lunch.description && lunch.description.en ? lunch.description.en.trim() : "");
      
      // Extract and format the price if available.
      let price = "";
      if (lunch.normalPrice && lunch.normalPrice.price) {
        price = lunch.normalPrice.price.trim();
        if (lunch.normalPrice.unit && lunch.normalPrice.unit.en) {
          price += lunch.normalPrice.unit.en;
        }
      }
      
      return { dishName, description, price };
    });
    
    // Build an HTML unordered list.
    // Each dish appears as a <li> with the dish title (and price) in bold.
    // If there is a description, it is added on a new line (<br>).
    let menuHtml = `<ul>` + dishes.map(dish => {
      const titlePart = `<strong>${dish.dishName}${dish.price ? ` <span>${dish.price}</span>` : ""}</strong>`;
      const descriptionPart = dish.description ? `<br>${dish.description}` : "";
      return `<li>${titlePart}${descriptionPart}</li>`;
    }).join('') + `</ul>`;

    menuHtml +=`<br/><p>Buffet price: <strong>13,70€</strong></p>`
    
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch The Schnitzel JSON menu:", error);
    throw error;
  }
}

module.exports = scrapeSchnitzelMenu;
