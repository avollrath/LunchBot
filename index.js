const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();
const express = require("express");
const { WebClient } = require("@slack/web-api");
const fs = require("fs");
const path = require("path");
const xml2js = require("xml2js"); // Add this package for parsing XML

const scrapeDylanMenu = require('./scrapers/dylan');
const scrapeSchnitzelMenu = require('./scrapers/schnitzel');
const scrapeBurgersMenu = require('./scrapers/burgers&wine');
const scrapeFactoryMenu = require('./scrapers/factory');
const scrapeHankoAsiaMenu = require('./scrapers/hankoaasia');
const scrapeLimoneTriplaMenu = require('./scrapers/limone');
const scrapeTokumaruMenu = require('./scrapers/tokumaru');
const scrapeSizzleStationMenu = require('./scrapers/sizzlestation');

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
    url: "https://europe-west1-luncher-7cf76.cloudfunctions.net/api/v1/week/9af82d20-966d-4f10-a4a9-1465a05a7e22/active?language=en",
    cachePath: path.join(CACHE_DIR, "schnitzelCache.json"),
    scrapeFunction: scrapeSchnitzelMenu
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
    cachePath: path.join(CACHE_DIR, "tokumaruCache.json"),
    scrapeFunction: scrapeTokumaruMenu
  },
  {
    id: "dylan",
    name: "Dylan Böle",
    url: "https://europe-west1-luncher-7cf76.cloudfunctions.net/api/v1/week/3aba0b64-0d43-41ea-b665-1d2d6c0f2d5e/active?language=en",
    cachePath: path.join(CACHE_DIR, "dylanCache.json"),
    scrapeFunction: scrapeDylanMenu
  },
  {
    id: "sizzle",
    name: "Sizzle Station",
    url: "https://www.sizzlestation.com/menu/",
    cachePath: path.join(CACHE_DIR, "sizzleCache.json"),
    scrapeFunction: scrapeSizzleStationMenu
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

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '');
}

// Slack command endpoint
app.post("/slack/commands", async (req, res) => {
  slackRequestCount++;
  saveSlackCount(slackRequestCount);
  console.log(`Slack request count: ${slackRequestCount}`);
  
  try {
    const allMenus = await getAllMenus();
    const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    
    // Build the slack message as plain text.
    let slackMessage = `*${randomMessage}*\n\n`;
    
    // For each restaurant, get the plain text version of the menu.
    for (const menu of allMenus) {
      slackMessage += `:red_circle: *${menu.restaurantName}*:\n`;
      // Strip HTML tags before wrapping in a code block.
      const plainTextMenu = stripHtml(menu.menu);
      slackMessage += "```\n" + plainTextMenu + "\n```\n\n";
    }
    
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
  
  // Set up the keep-alive ping
  setupKeepAlive();
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
  <script src="text-scramble.js" defer></script>
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
      <p>Your daily guide to lunch menus in Pasila</p>
      
    </div>
  </section>

  <header>
     <p class="text-scramble">Wednesday</p>
  </header>

  <main>
    <div class="menus-container">
      <!-- MENU_CONTENT -->
    </div>
  </main>

 <div class="stats">
      <p>Slack requests served: {{SLACK_COUNT}}</p>
      <p>Last updated: {{LAST_UPDATED}}</p>
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
  position: relative;
}

.text-scramble {
color:rgb(255, 255, 255);
font-size: 2rem;
top: 0;
position: absolute;
padding: 0.2rem 0.6rem;
left: 50%;
background-color: #A2D2FF;
transform: translate(-50%, -50%);
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

function setupKeepAlive() {
  const appUrl = process.env.APP_URL || "https://lunchbot-btnu.onrender.com/";
  const interval = 14 * 60 * 1000; // 14 minutes (just under the 15-minute limit)
  
  console.log(`Setting up keep-alive ping to ${appUrl} every ${interval/60000} minutes`);
  
  function pingServer() {
    axios.get(appUrl)
      .then(response => {
        console.log(`[KeepAlive] Pinged server at ${new Date().toLocaleString('en-GB', { 
          dateStyle: 'short', 
          timeStyle: 'short',
          timeZone: 'Europe/Helsinki' 
        })}: Status ${response.status}`);
      })
      .catch(error => {
        console.error(`[KeepAlive] Error pinging server at ${new Date().toLocaleString('en-GB')}: ${error.message}`);
      });
  }
  
  // Initial ping after 30 seconds (give the server time to fully start)
  setTimeout(() => {
    pingServer();
    // Then start the regular interval
    setInterval(pingServer, interval);
  }, 30000);
}

