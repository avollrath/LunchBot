const axios = require("axios");
const cheerio = require("cheerio");

// Factory Pasila scraper function
async function scrapeFactoryMenu() {
    try {
      console.log("Starting to scrape Factory menu...");
      const response = await axios.get("https://ravintolafactory.com/lounasravintolat/ravintolat/factory-pasila/");
      const $ = cheerio.load(response.data);
      const today = new Date();
      
      // Format today's date as DD.M.YYYY
      const formattedDate = `${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`;
      const dayOfWeek = today.toLocaleDateString('fi-FI', { weekday: 'long' });
      
      console.log(`Looking for Factory menu for: ${dayOfWeek} ${formattedDate}`);
      
      // Debug: Print all heading texts to see what's available
      console.log("Available headings:");
      $('.list h3').each(function() {
        console.log($(this).text().trim());
      });
      
      // Find the current day's heading
      const todayHeading = $('.list h3').filter(function() {
        const text = $(this).text().trim();
        console.log(`Checking heading: ${text}`);
        return text.includes(formattedDate) || 
               (text.includes(`${today.getDate()}.${today.getMonth() + 1}`) && 
                text.toLowerCase().includes(dayOfWeek.toLowerCase()));
      }).first(); // Take only the first match
      
      // Array to collect menu items
      let items = [];
      
      if (todayHeading.length > 0) {
        console.log("Found today's heading:", todayHeading.text().trim());
        
        // Get all content until the next h3
        let currentElement = todayHeading.next();
        while (currentElement.length && !currentElement.is('h3')) {
          if (currentElement.is('p')) {
            // Use .html() so we can handle <br> tags
            const htmlContent = currentElement.html() || "";
            // Replace <br> tags with newline characters
            const textContent = htmlContent.replace(/<br\s*\/?>/gi, '\n');
            // Split into lines (in case multiple dishes are in one <p>)
            const lines = textContent.split('\n').map(line => line.trim()).filter(line => line);
            for (let line of lines) {
              // Remove any leading bullet if present
              if (line.startsWith("•")) {
                line = line.substring(1).trim();
              }
              if (line) {
                items.push(line);
              }
            }
          }
          currentElement = currentElement.next();
        }
        
        // If no items found, try alternative method: look for content between this h3 and the next h3
        if (items.length === 0) {
          const nextH3 = todayHeading.nextAll('h3').first();
          if (nextH3.length) {
            const betweenElements = todayHeading.nextUntil(nextH3);
            betweenElements.each(function() {
              const text = $(this).text().trim();
              if (text) {
                // Split by newline if needed and push each line
                const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                items.push(...lines);
              }
            });
          }
        }
      }
      
      // Fallback: Try to find menu based on day of week if still no items
      if (items.length === 0) {
        console.log("Trying to find menu based on day of week...");
        const finnishDays = {
          "maanantai": 1, "tiistai": 2, "keskiviikko": 3, 
          "torstai": 4, "perjantai": 5, "lauantai": 6, "sunnuntai": 0
        };
        
        $('.list h3').each(function() {
          const headingText = $(this).text().trim().toLowerCase();
          for (const [day, dayNum] of Object.entries(finnishDays)) {
            if (headingText.includes(day) && dayNum === today.getDay()) {
              console.log("Found heading with matching day of week:", headingText);
              let menuItems = [];
              let currentElement = $(this).next();
              while (currentElement.length && !currentElement.is('h3')) {
                const text = currentElement.text().trim();
                if (text) {
                  menuItems.push(...text.split('\n').map(line => line.trim()).filter(line => line));
                }
                currentElement = currentElement.next();
              }
              if (menuItems.length > 0) {
                items = menuItems;
                return false; // Break the loop
              }
            }
          }
        });
      }
      
      console.log("Raw menu items:", items);
      
      // If items found, wrap them in a proper HTML unordered list
      let menuHtml = items.length > 0 
        ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`
        : "Sorry, today's menu could not be found. Please check again later.";

      menuHtml +=`<br/><p>Buffet price: <strong>13,30€</strong></p>`
        
      console.log("Factory menu HTML:", menuHtml);
      return menuHtml;
    } catch (error) {
      console.error("Failed to fetch Factory menu:", error);
      throw error;
    }
  }
  
  module.exports = scrapeFactoryMenu;
  