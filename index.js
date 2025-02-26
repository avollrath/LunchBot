const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();
const express = require("express");
const { WebClient } = require("@slack/web-api");
const fs = require("fs");
const path = require("path");
const xml2js = require("xml2js"); // Add this package for parsing XML

const CACHE_DIR = path.join(__dirname, "cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;
const slackClient = new WebClient(process.env.BOT_TOKEN);
const COUNT_FILE = path.join(__dirname, 'slackCount.json');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function loadSlackCount() {
  try {
    const data = fs.readFileSync(COUNT_FILE, 'utf8');
    return JSON.parse(data).count || 0;
  } catch (err) {
    return 0;
  }
}

function saveSlackCount(count) {
  fs.writeFileSync(COUNT_FILE, JSON.stringify({ count }), 'utf8');
}

// Initialize the count from file
let slackRequestCount = loadSlackCount();

// Restaurant configuration
const restaurants = [
  {
    id: "factory",
    name: "Factory Pasila",
    url: "https://ravintolafactory.com/lounasravintolat/ravintolat/factory-pasila/",
    cachePath: path.join(CACHE_DIR, "factoryCache.json"),
    scrapeFunction: scrapeFactoryMenu
  },
  {
    id: "burgers",
    name: "Burgers & Wine",
    url: "https://burgersandwine.fi/lounas/", 
    cachePath: path.join(CACHE_DIR, "burgersCache.json"),
    scrapeFunction: scrapeBurgersMenu
  },
  {
    id: "limone",
    name: "Tripla Limone",
    url: "https://tripla.limone.fi/lounas/",
    cachePath: path.join(CACHE_DIR, "limoneCache.json"),
    scrapeFunction: scrapeLimoneTriplaMenu
  },
  {
    id: "schnitzel",
    name: "The Schnitzel",
    url: "https://europe-west1-luncher-7cf76.cloudfunctions.net/api/v1/rss/week/9af82d20-966d-4f10-a4a9-1465a05a7e22/current?days=current&language=en",
    cachePath: path.join(CACHE_DIR, "schnitzelCache.json"),
    scrapeFunction: scrapeRssMenu,
    isRss: true
  },
  {
    id: "hanko",
    name: "Hanko Aasia",
    url: "https://www.hankoaasia.fi/en/lounas/#lounas",
    cachePath: path.join(CACHE_DIR, "hankoCache.json"),
    scrapeFunction: scrapeHankoAsiaMenu
  },
  {
    id: "tokumaruEng",
    name: "Tokumaru",
    url: "https://www.tokumaru.fi/lunch-menu",
    cachePath: path.join(CACHE_DIR, "tokumaruEngCache.json"),
    scrapeFunction: scrapeTokumaruEnglishMenu
  }
];

// Funny messages for Slack
const funnyMessages = [
  "Gather 'round, hungry mortals. Behold today's feast:",
  "Stomach rumbling louder than thunder? Silence it with:",
  "Fueling stations for humans detected. Commencing download:",
  "Alert: Low energy detected. Recommend immediate refueling with:",
  "Engage taste sensors! Today's culinary adventure includes:",
  "Human sustenance protocol initiated. Today's choices are:",
  "In need of a taste explosion? Today's menu is ready to detonate:",
  "Your daily dose of deliciousness is ready for consumption:",
  "Ravenous for some bytes? Here's what's cooking in the data kitchen:",
  "Stomach in standby mode? Activate with today's menu:",
  "Prepare your utensil appendages. Today's sustenance options are:",
  "Uploading today's menu to your taste mainframe. Please stand by:",
  "Executing program: Gourmet Delight. Today's culinary code is:",
  "Memory low on tasty bytes? Recharge with today's menu:",
  "Attention, human unit! Your fuel options today include:",
  "Engaging taste protocols. Analyzing today's delicious data:",
  "Input hunger; output satisfaction. Today's menu algorithm includes:",
  "Seeking culinary adventure? Your quest begins with:",
  "Your daily nutrition subroutine is ready to execute with:",
  "Warning: High probability of taste bud overload. Proceed with today's menu:",
];

const errorMessages = [
  "Seems like my digital taste buds are offline.",
  "I've encountered a byte error in fetching the menu.",
  "My culinary circuits are currently scrambled.",
  "Error: Menu not found. Please try resetting your hunger and try again.",
];

// Main web route
app.get("/", async (req, res) => {
  try {
    console.log("Fetching menus for web display...");
    
    // Get all menus
    const allMenus = await getAllMenus();
    
    // Read the HTML template
    let htmlTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    
    // Replace the placeholder with dynamic content
    const menuContent = generateHtmlMenuContent(allMenus);
    
    // Make sure we're replacing the exact placeholder text with proper HTML content
    htmlTemplate = htmlTemplate.replace('<!-- MENU_CONTENT -->', menuContent);
    
    // Update stats with current values - using RegExp to ensure all instances are replaced
    htmlTemplate = htmlTemplate.replace(/{{SLACK_COUNT}}/g, slackRequestCount.toString());
    htmlTemplate = htmlTemplate.replace(/{{LAST_UPDATED}}/g, new Date().toLocaleString('en-GB', { 
      dateStyle: 'short', 
      timeStyle: 'short',
      timeZone: 'Europe/Helsinki' 
    }));
    
    // Set the proper content type
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlTemplate);
  } catch (error) {
    console.error("Error rendering web page:", error);
    const randomErrorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    res.setHeader('Content-Type', 'text/html');
    res.send(`<html><body><h1>LunchBot</h1><p>Slack requests received: ${slackRequestCount}</p><p>${randomErrorMessage}</p></body></html>`);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Function to clear cache for testing
function clearCache() {
  restaurants.forEach(restaurant => {
    if (fs.existsSync(restaurant.cachePath)) {
      try {
        fs.unlinkSync(restaurant.cachePath);
        console.log(`Cleared cache for ${restaurant.name}`);
      } catch (error) {
        console.error(`Error clearing cache for ${restaurant.name}:`, error);
      }
    }
  });
}

// Slack command endpoint
app.post("/slack/commands", async (req, res) => {
  slackRequestCount++;
  saveSlackCount(slackRequestCount);
  console.log(`Slack request count: ${slackRequestCount}`);
  
  try {
    const allMenus = await getAllMenus();
    const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    
    // Format all menus for Slack
    let slackMessage = `*${randomMessage}*\n\n`;
    
    for (const menu of allMenus) {
      // Add red circle emoji and colon after restaurant name
      slackMessage += `:red_circle: *${menu.restaurantName}*:\n`;
      // Format menu as code block
      slackMessage += "```" + menu.menu + "```\n\n";
    }
    
    // Append the footer message with a link to PasiLunch
    slackMessage += "\n:robot_face: Enjoy your lunch and visit <https://lunchbot-btnu.onrender.com/|PasiLunch> for a nicer view of the lunch options! :heart:";
    
    res.json({ text: slackMessage });
  } catch (error) {
    console.error("Error fetching menus or posting message:", error);
    const randomErrorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    res.json({ text: randomErrorMessage });
  }
});

// Function to generate HTML content for menus
function generateHtmlMenuContent(menus) {
  let html = '';
  
  for (const menu of menus) {
    // Make sure the menu content is properly formatted as HTML
    let formattedMenuContent = '';
    if (menu.menu) {
      // Split the menu by lines and create properly formatted HTML
      const menuLines = menu.menu.split('\n');
      formattedMenuContent = menuLines
        .filter(line => line.trim()) // Skip empty lines
        .map(line => `<p>${line}</p>`)
        .join('');
    } else {
      formattedMenuContent = '<p>No menu available for today.</p>';
    }
    
    html += `
      <div class="restaurant-menu">
        <h2>${menu.restaurantName}</h2>
        <div class="menu-content">
          ${formattedMenuContent}
        </div>
      </div>
    `;
  }
  
  // Add a debug statement to log what we're generating
  console.log("Generated menu HTML:", html.substring(0, 300) + "...");
  
  return html;
}

// Function to get all menus from all configured restaurants
async function getAllMenus() {
  const menuPromises = restaurants.map(async (restaurant) => {
    try {
      console.log(`Attempting to fetch menu for ${restaurant.name}...`);
      const menu = await getRestaurantMenu(restaurant);
      return {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        menu: menu
      };
    } catch (error) {
      console.error(`Error fetching menu for ${restaurant.name}:`, error);
      return {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        menu: `Sorry, couldn't fetch menu for ${restaurant.name}. Error: ${error.message}`
      };
    }
  });
  
  return Promise.all(menuPromises);
}

// Function to get a restaurant menu (from cache or by scraping)
async function getRestaurantMenu(restaurant) {
  let cache = { menu: "", date: "" };
  
  if (fs.existsSync(restaurant.cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(restaurant.cachePath, "utf8"));
      console.log(`Cache loaded successfully for ${restaurant.name}.`);
    } catch (error) {
      console.error(`Error reading cache for ${restaurant.name}:`, error);
    }
  }
  
  const currentDate = new Date().toISOString().slice(0, 10);
  console.log(`Current Date for comparison: ${currentDate}, Cache date: ${cache.date}`);
  
  if (cache.date === currentDate && cache.menu) {
    console.log(`Serving menu from cache for ${restaurant.name}.`);
    return cache.menu;
  }
  
  try {
    console.log(`Fetching new menu from ${restaurant.name} website at ${restaurant.url}`);
    const menuText = await restaurant.scrapeFunction(restaurant.url);
    
    fs.writeFileSync(
      restaurant.cachePath,
      JSON.stringify({ menu: menuText, date: currentDate }),
      "utf8"
    );
    console.log(`Cache updated with new menu for ${restaurant.name}.`);
    
    return menuText || `Sorry, today's menu could not be found for ${restaurant.name}. Please check again later.`;
  } catch (error) {
    console.error(`Failed to fetch the menu for ${restaurant.name}:`, error);
    throw new Error(`Failed to fetch the menu for ${restaurant.name}: ${error.message}`);
  }
}

// RSS Feed scraper function
async function scrapeRssMenu(url) {
  try {
    console.log(`Starting to fetch RSS feed from: ${url}`);
    const response = await axios.get(url);
    
    // Parse XML to JS object
    const parser = new xml2js.Parser({ 
      explicitArray: false,
      mergeAttrs: true,
      normalize: true,
      explicitCharkey: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    
    const result = await parser.parseStringPromise(response.data);
    
    if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
      console.error("Invalid RSS structure:", JSON.stringify(result, null, 2));
      throw new Error("Could not parse RSS feed structure");
    }
    
    // Handle both single item and array of items
    const items = Array.isArray(result.rss.channel.item) 
      ? result.rss.channel.item 
      : [result.rss.channel.item];
    
    console.log(`Found ${items.length} items in RSS feed`);
    
    // Get today's date to find today's menu
    const today = new Date();
    const formattedDate = `${today.getDate()}.${today.getMonth() + 1}`;
    
    // Find today's menu
    let todayMenu = null;
    for (const item of items) {
      const title = item.title || "";
      // Check if the title or description contains today's date
      if (title.includes(formattedDate)) {
        todayMenu = item;
        break;
      }
    }
    
    if (!todayMenu && items.length > 0) {
      // If we couldn't find today's menu specifically, just use the first item
      // This assumes the RSS feed is already filtered for today
      todayMenu = items[0];
    }
    
    if (!todayMenu) {
      return "Sorry, today's menu could not be found in the RSS feed.";
    }
    
    // Extract and format the menu
    let menuText = "";
    
    if (todayMenu.description) {
      // Clean up HTML from RSS content
      const description = todayMenu.description
        .replace(/<br\s*\/?>/gi, '\n') // Replace <br> with newlines
        .replace(/<[^>]*>/g, '')       // Remove other HTML tags
        .replace(/&lt;/g, '<')         // Handle HTML entities
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\n+/g, '\n')         // Remove duplicate newlines
        .trim();
      
      // Format each line with bullet points
      menuText = description.split('\n')
        .filter(line => line.trim())
        .map(line => `• ${line.trim()}`)
        .join('\n');
    }
    
    console.log("Extracted menu from RSS:", menuText || "No menu found");
    return menuText || "Sorry, today's menu details could not be found in the RSS feed.";
  } catch (error) {
    console.error("Failed to fetch RSS menu:", error);
    throw error;
  }
}

// Tokumaru English scraper function
async function scrapeTokumaruEnglishMenu() {
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

    // Get today's day name in English.
    const today = new Date();
    const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
    console.log(`Looking for menu for: ${dayName}`);

    // Look for an <h3> element that includes today's day name.
    let dayHeading;
    contentElem.find("h3").each(function () {
      const h3Text = $(this).text().trim().toLowerCase();
      if (h3Text.includes(dayName.toLowerCase())) {
        dayHeading = $(this);
        return false; // break loop once found
      }
    });

    if (!dayHeading || dayHeading.length === 0) {
      console.log(`Day heading "${dayName}" not found.`);
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    // Collect all sibling elements after the day heading until the next <h3>.
    let menuHtml = "";
    let sibling = dayHeading.next();
    while (sibling.length && !sibling.is("h3")) {
      // Append the text of the sibling (adding a newline for separation)
      menuHtml += $(sibling).text() + "\n";
      sibling = sibling.next();
    }
    
    const menuText = menuHtml.trim();
    console.log("Extracted Tokumaru English menu:", menuText.substring(0, 300) + "...");
    return menuText || "Sorry, today's menu could not be found. Please check again later.";
  } catch (error) {
    console.error("Failed to fetch Tokumaru English lunch menu:", error);
    throw error;
  }
}

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
    
    let menuText = "";
    
    if (todayHeading.length > 0) {
      console.log("Found today's heading:", todayHeading.text().trim());
      
      // Get all content until the next h3
      let currentElement = todayHeading.next();
      while (currentElement.length && !currentElement.is('h3')) {
        if (currentElement.is('p')) {
          const itemText = currentElement.text().trim();
          if (itemText) {
            console.log("Found menu item:", itemText);
            const items = itemText.split('\n').filter(item => item.trim());
            for (const item of items) {
              menuText += `• ${item.trim()}\n`;
            }
          }
        }
        currentElement = currentElement.next();
      }
      
      // If no content found in paragraphs, try looking for other elements
      if (!menuText) {
        // Look for any content between this h3 and the next h3
        const nextH3 = todayHeading.nextAll('h3').first();
        if (nextH3.length) {
          const betweenElements = todayHeading.nextUntil(nextH3);
          betweenElements.each(function() {
            const text = $(this).text().trim();
            if (text) {
              menuText += `• ${text}\n`;
            }
          });
        }
      }
    }
    
    // If still no menu found, try to find based on day of week
    if (!menuText) {
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
            
            // Get content from all elements until next h3
            let menuItems = [];
            let currentElement = $(this).next();
            while (currentElement.length && !currentElement.is('h3')) {
              if (currentElement.text().trim()) {
                menuItems.push(currentElement.text().trim());
              }
              currentElement = currentElement.next();
            }
            
            if (menuItems.length > 0) {
              menuText = menuItems.map(item => `• ${item}`).join('\n');
              return false; // Break the loop
            }
          }
        }
      });
    }
    
    console.log("Factory menu text:", menuText || "No menu found");
    return menuText || "Sorry, today's menu could not be found. Please check again later.";
  } catch (error) {
    console.error("Failed to fetch Factory menu:", error);
    throw error;
  }
}

// Burgers & Wine scraper function
async function scrapeBurgersMenu() {
  try {
    console.log("Starting to scrape Burgers & Wine menu...");
    const response = await axios.get("https://burgersandwine.fi/lounas/");
    const $ = cheerio.load(response.data);
    const today = new Date();
    
    // Format today as needed to match their format
    const daysOfWeek = ["SUNNUNTAI", "MAANANTAI", "TIISTAI", "KESKIVIIKKO", "TORSTAI", "PERJANTAI", "LAUANTAI"];
    const dayOfWeek = daysOfWeek[today.getDay()];
    const formattedDate = `${today.getDate()}.${today.getMonth() + 1}`;
    
    console.log(`Looking for Burgers & Wine menu for: ${dayOfWeek} ${formattedDate}`);
    
    // First, try to find today's special burger
    let menuText = "";
    const paragraphs = $('p');
    
    // Print all paragraphs for debugging
    console.log("Available paragraphs:");
    paragraphs.each(function(index) {
      console.log(`${index}: ${$(this).text().trim()}`);
    });
    
    // Search for today's date/day
    let todayIndex = -1;
    paragraphs.each(function(index) {
      const text = $(this).text().trim().toUpperCase();
      // Look for something like "TIISTAI 25.2." or just "TIISTAI"
      if ((text.includes(dayOfWeek) && text.includes(formattedDate)) || 
          (text === dayOfWeek) || 
          (text.startsWith(dayOfWeek + " "))) {
        console.log(`Found today's header at index ${index}: ${text}`);
        todayIndex = index;
        return false; // Break the loop
      }
    });
    
    if (todayIndex >= 0) {
      menuText += `• ${paragraphs.eq(todayIndex).text().trim()}\n`;
      
      // Get menu items until the next day or a separator
      let i = todayIndex + 1;
      while (i < paragraphs.length) {
        const text = paragraphs.eq(i).text().trim();
        
        // Stop if we hit another day or a separator
        if (text.match(/^(MAANANTAI|TIISTAI|KESKIVIIKKO|TORSTAI|PERJANTAI|LAUANTAI|SUNNUNTAI)/) ||
            text === "—" || text === "-" || text === "–" || text === "—") {
          break;
        }
        
        if (text) {
          menuText += `• ${text}\n`;
        }
        i++;
      }
    } else {
      // If we couldn't find today specifically, look for this week's menu
      console.log("No specific day found, looking for this week's menu");
      
      // Find "Viikon lounasannos" and include the following content
      let weeklySpecialIndex = -1;
      paragraphs.each(function(index) {
        const text = $(this).text().trim();
        if (text.includes("Viikon lounasannos")) {
          weeklySpecialIndex = index;
          return false;
        }
      });
      
      if (weeklySpecialIndex >= 0) {
        menuText += `• ${paragraphs.eq(weeklySpecialIndex).text().trim()}\n`;
        
        // Get the next paragraph which should be the description
        if (weeklySpecialIndex + 1 < paragraphs.length) {
          const nextText = paragraphs.eq(weeklySpecialIndex + 1).text().trim();
          if (nextText && nextText !== "—" && !nextText.match(/^(MAANANTAI|TIISTAI|KESKIVIIKKO|TORSTAI|PERJANTAI|LAUANTAI|SUNNUNTAI)/)) {
            menuText += `• ${nextText}\n`;
          }
        }
      }
      
      // Also include the burger information from the top
      paragraphs.each(function(index) {
        const text = $(this).text().trim();
        if (text.includes("Viikon lounasburger") || text.includes("Business Lunch")) {
          menuText += `• ${text}\n`;
        }
      });
    }
    
    // If still no specific menu found, get general lunch information
    if (!menuText) {
      console.log("No specific menu found, getting general lunch info");
      
      // Look for any lunch-related information
      paragraphs.each(function() {
        const text = $(this).text().trim();
        if (text.includes("lounas") || text.includes("Lounas") || 
            text.includes("Burger") || text.includes("burger")) {
          menuText += `• ${text}\n`;
        }
      });
    }
    
    console.log("Burgers & Wine menu text:", menuText || "No menu found");
    return menuText || "Sorry, today's menu could not be found. Please check again later.";
  } catch (error) {
    console.error("Failed to fetch Burgers & Wine menu:", error);
    throw error;
  }
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

    let menuText = "";

    // Find the h3 element that exactly matches today's day
    let dayHeading;
    $("div.page-content h3").each(function () {
      const headingText = $(this).text().trim().toUpperCase();
      // Skip headings that are not valid day names (e.g. "LOUNAS 1")
      if (headingText === dayOfWeek) {
        dayHeading = $(this);
        return false; // break out of each
      }
    });

    if (dayHeading && dayHeading.length > 0) {
      console.log("Found heading for today's menu:", dayOfWeek);
      // Get all elements until the next h3 tag
      const menuElements = dayHeading.nextUntil("h3");

      menuElements.each(function () {
        const text = $(this).text().trim();
        if (text) {
          menuText += `• ${text}\n`;
        }
      });
    }

    if (!menuText) {
      menuText = "Sorry, today's menu could not be found. Please check again later.";
    }

    console.log("Tripla Limone menu text:", menuText);
    return menuText;
  } catch (error) {
    console.error("Failed to fetch Tripla Limone menu:", error);
    throw error;
  }
}

// Hanko Aasia scraper function – returns both dishes for today
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

    // Now, within the dayContainer, find all the table blocks that contain dish prices.
    // We assume each dish group starts with a "div.table-2.menutaulukko"
    const dishElements = dayContainer.find("div.table-2.menutaulukko");
    let menuDishes = [];
    dishElements.each(function(index, elem) {
      // Get the price from the table block (e.g. "13,50 €")
      const price = $(elem).find("strong").first().text().trim();

      // Look for the next fusion-title element after this table block.
      const dishTitleElem = $(elem).nextAll("div.fusion-title").first();
      // Then, the fusion-text element that immediately follows the dish title holds the description.
      const dishDescElem = dishTitleElem.nextAll("div.fusion-text").first();

      const dishName = dishTitleElem.text().trim();
      const dishDesc = dishDescElem.text().trim();

      // Combine the details into a bullet point
      if (dishName) {
        menuDishes.push(`• ${dishName} (${price}): ${dishDesc}`);
      }
    });

    if (menuDishes.length === 0) {
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    const menuText = menuDishes.join("\n");
    console.log("Hanko Aasia menu text:", menuText);
    return menuText;
  } catch (error) {
    console.error("Failed to fetch Hanko Aasia menu:", error);
    throw error;
  }
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Create public dir if it doesn't exist
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  // Create index.html if it doesn't exist
  createHtmlTemplate();
  
  // Initial menu fetch
  console.log("Performing initial menu fetch...");
  getAllMenus().catch(err => {
    console.error("Error in initial menu fetch:", err);
  });
});

// Create HTML template if it doesn't exist
function createHtmlTemplate() {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  const cssPath = path.join(__dirname, 'public', 'styles.css');
  
  // Create HTML file
  if (!fs.existsSync(htmlPath)) {
    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>PasiLunch - Today's Menus</title>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <meta http-equiv="refresh" content="300"> <!-- Auto-refresh every 5 minutes -->
</head>
<body>
  <!-- Hero Section with Background Video -->
  <section class="hero">
    <div class="video-container">
      <img src="/video-placeholder.jpg" alt="Loading video" class="video-placeholder">
      <video id="heroVideo" class="hero-video" muted loop playsinline poster="/video-placeholder.jpg" preload="none">
        <source src="/video.mp4" type="video/mp4">
      </video>
    </div>
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <h1 class="instrument-serif-regular">PasiLunch</h1>
      <p>Your daily guide to lunch menus near the office</p>
    </div>
  </section>

  <header>
    <div class="stats">
      <p>Last updated: {{LAST_UPDATED}}</p>
    </div>
  </header>

  <main>
    <div class="menus-container">
      <!-- MENU_CONTENT -->
    </div>
  </main>

 <div class="stats">
      <p>Slack requests served: {{SLACK_COUNT}}</p>
    </div>
  <footer>
    <p>PasiLunch &copy; ${new Date().getFullYear()} - Your friendly LunchBot by André Vollrath</p>
  </footer>

  <script>
    // JavaScript for lazy loading the video
    document.addEventListener('DOMContentLoaded', function() {
      const videoElement = document.getElementById('heroVideo');
      const placeholder = document.querySelector('.video-placeholder');
      
      // Create an Intersection Observer
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          // If video is in viewport
          if (entry.isIntersecting) {
            videoElement.preload = 'auto';
            videoElement.load();
            
            // When video can play, hide placeholder and play video
            videoElement.addEventListener('canplay', function() {
              placeholder.style.opacity = '0';
              videoElement.style.opacity = '1';
              videoElement.play();
              // Disconnect the observer after loading
              observer.disconnect();
            });
          }
        });
      }, { threshold: 0.1 }); // Trigger when 10% of the video is visible
      
      // Start observing the video element
      observer.observe(videoElement);
    });
  </script>
</body>
</html>`;
    
    fs.writeFileSync(htmlPath, htmlTemplate, 'utf8');
    console.log('Created HTML template file');
  }
  
  // Create CSS file
  if (!fs.existsSync(cssPath)) {
    const cssTemplate = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Body styling */
body {
  /* Using a neutral sans-serif for body text */
  font-family: "JetBrains Mono", monospace;
  background-color:rgb(255, 255, 255);
  color: #333;
  line-height: 1.6;
}

/* Hero Section */
.hero {
  position: sticky;
  top: 0;
  z-index: -5;
  height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
}

.video-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.video-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.5s ease;
  z-index: 1;
}

.hero-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.5s ease;
  z-index: 1;
}

.hero-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  z-index: 2;
}

.hero-content {
  position: relative;
  color: #fff;
  z-index: 3;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-content h1 {
  font-size: 16rem;
  margin-bottom: -5rem;
  /* Use Instrument Serif for the big title */
  font-family: "Instrument Serif", serif;
  font-weight: 400;
}

.hero-content p {
  font-size: 2rem;
  background-color: #FFAFCC;
  padding: 0.5rem 1rem;
  transform: rotate(-3deg);
  display: inline-block;
  word-wrap: break-word;
  hyphens: auto;
  text-align: center;
  margin: 0 auto;
}

/* Header */
header {
  background-color:rgb(255, 255, 255);
  padding: 1rem;
  text-align: center;
}

.stats p {
  font-size: 0.9rem;
  color: #A2D2FF;
  text-align: center;
}

main {
background-color:rgb(255, 255, 255);
}

/* Menus Container */
.menus-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  padding: 2rem;
  background-color:rgb(255, 255, 255);
  max-width: 1920px;
  margin: auto;
}

/* Restaurant Menu Card */
.restaurant-menu {
  background-color:rgb(255, 255, 255);
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.3s ease;
}

.restaurant-menu h2 {
  background-color:rgb(255, 255, 255);
  color: #FFAFCC;
  padding: 1rem;
  font-size: 1.8rem;
  text-align: center;
  /* Use Instrument Serif for restaurant names */
  font-family: "Instrument Serif", serif;
}

.menu-content {
  padding: 1.5rem;
  line-height: 1.8;
  background-color:rgb(255, 255, 255);
}

/* Footer */
footer {
  background-color:#FFAFCC;
  color: #fff;
  text-align: center;
  padding: 2rem;
  margin-top: 2rem;
}

/* Example class for JetBrains Mono usage */
.jetbrains-mono-code {
  font-family: "JetBrains Mono", monospace;
  font-optical-sizing: auto;
  font-weight: 400;
  font-style: normal;
}

/* Responsive adjustments with multiple breakpoints */
@media (max-width: 1200px) {
  .hero-content h1 {
    font-size: 12rem;
    margin-bottom: -3rem;
  }
  .hero-content p {
    font-size: 1.8rem;
  }
  .menus-container {
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  }
}

@media (max-width: 992px) {
  .hero-content h1 {
    font-size: 10rem;
    margin-bottom: -2rem;
  }
  .hero-content p {
    font-size: 1.5rem;
  }
  .menus-container {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }
}

@media (max-width: 768px) {
  .hero-content h1 {
    font-size: 7rem;
    margin-bottom: 0.5rem;
  }
  .hero-content p {
    font-size: 1.2rem;
    padding: 0.4rem 0.8rem;
    width: auto;
  }
  .menus-container {
    grid-template-columns: 1fr;
    padding: 1.5rem;
  }
}

@media (max-width: 576px) {
  .hero-content h1 {
    font-size: 5rem;
    margin-bottom: 1rem;
  }
  .hero-content p {
    font-size: 0.9rem;
    padding: 0.3rem 0.7rem;
  }
  .menus-container {
    gap: 1.5rem;
    padding: 1rem;
  }
}

@media (max-width: 375px) {
  .hero-content h1 {
    font-size: 3.5rem;
  }
  .hero-content p {
    font-size: 0.8rem;
    padding: 0.2rem 0.6rem;
  }
}`;
    
    fs.writeFileSync(cssPath, cssTemplate, 'utf8');
    console.log('Created CSS template file');
  }
}