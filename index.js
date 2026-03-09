const axios = require("axios");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { ensureMenusAreFresh, NORMALIZED_MENUS_PATH } = require("./services/menuRefresh");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const COUNT_FILE = path.join(__dirname, "slackCount.json");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const funnyMessages = [
  "Gather 'round, hungry mortals. Behold today's feast:",
  "Stomach rumbling louder than thunder? Silence it with:",
  "Fueling stations for humans detected. Commencing download:",
  "Alert: Low energy detected. Recommend immediate refueling with:",
  "Engage taste sensors! Today's culinary adventure includes:",
];

const errorMessages = [
  "Seems like my digital taste buds are offline.",
  "I've encountered a byte error in fetching the menu.",
  "My culinary circuits are currently scrambled.",
];

function loadSlackCount() {
  try {
    const data = fs.readFileSync(COUNT_FILE, "utf8");
    return JSON.parse(data).count || 0;
  } catch (_) {
    return 0;
  }
}

function saveSlackCount(count) {
  fs.writeFileSync(COUNT_FILE, JSON.stringify({ count }), "utf8");
}

let slackRequestCount = loadSlackCount();

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeSlack(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isFluffText(value = "") {
  const text = String(value).toLowerCase();
  return (
    text.includes("welcome to enjoy your lunch in style") ||
    text.includes("corner of pasilansilta") ||
    text.includes("friendly lunchbot") ||
    text.includes("your daily guide")
  );
}

function sanitizeDietaryTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const tag of tags) {
    const normalized = String(tag || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function generateNormalizedHtmlMenuContent(restaurants = []) {
  let html = "";

  for (const restaurant of restaurants) {
    const restaurantName = escapeHtml(restaurant.restaurantName || "Unknown restaurant");
    const items = (Array.isArray(restaurant.items) ? restaurant.items : []).filter(
      (item) => item && item.nameEn && !isFluffText(item.nameEn)
    );
    const notes = (Array.isArray(restaurant.notesEn) ? restaurant.notesEn : []).filter(
      (note) => note && !isFluffText(note)
    );

    const itemsHtml = items
      .map((item) => {
        const tags = sanitizeDietaryTags(item.dietary);
        return `
          <li class="menu-item">
            <div class="menu-item-header">
              <span class="menu-item-name">${escapeHtml(item.nameEn)}</span>
              ${
                item.priceText
                  ? `<span class="menu-item-price">${escapeHtml(item.priceText)}</span>`
                  : ""
              }
            </div>
            ${
              item.descriptionEn
                ? `<div class="menu-item-description">${escapeHtml(item.descriptionEn)}</div>`
                : ""
            }
            ${
              tags.length
                ? `<div class="menu-item-tags">${tags
                    .map((tag) => `<span class="menu-tag">${escapeHtml(tag)}</span>`)
                    .join("")}</div>`
                : ""
            }
          </li>
        `;
      })
      .join("");

    const notesHtml = notes.length
      ? `<div class="menu-notes">${notes
          .map((note) => `<p>${escapeHtml(note)}</p>`)
          .join("")}</div>`
      : "";

    html += `
      <div class="restaurant-menu">
        <h2>${restaurantName}</h2>
        <div class="menu-content">
          <ul class="menu-list">
            ${
              itemsHtml ||
              '<li class="menu-item"><div class="menu-item-header"><span class="menu-item-name">No menu items available.</span></div></li>'
            }
          </ul>
          ${notesHtml}
        </div>
      </div>
    `;
  }

  return html;
}

function formatRestaurantForSlack(restaurant) {
  const name = restaurant.restaurantName || "Unknown restaurant";
  const items = (Array.isArray(restaurant.items) ? restaurant.items : []).filter(
    (item) => item && item.nameEn && !isFluffText(item.nameEn)
  );
  const notes = (Array.isArray(restaurant.notesEn) ? restaurant.notesEn : []).filter(
    (note) => note && !isFluffText(note)
  );

  const bullet = "\u2022";
  let text = `*${escapeSlack(name)}*\n`;

  if (items.length === 0) {
    text += `${bullet} No menu items available\n`;
  } else {
    for (const item of items) {
      const price = item.priceText ? ` - ${escapeSlack(item.priceText)}` : "";
      text += `${bullet} ${escapeSlack(item.nameEn)}${price}\n`;
      if (item.descriptionEn) {
        text += `  ${escapeSlack(item.descriptionEn)}\n`;
      }
    }
  }

  if (notes.length) {
    text += `\n_Notes: ${escapeSlack(notes.join("; "))}_\n`;
  }

  return `${text}\n`;
}

app.get("/health", (req, res) => {
  // Keep this endpoint lightweight for Render keep-alive checks.
  console.log("Health check requested");
  res.status(200).json({ ok: true });
});

app.get("/api/menus/normalized", async (req, res) => {
  try {
    const normalizedMenus = await ensureMenusAreFresh();
    res.json(normalizedMenus);
  } catch (error) {
    console.error("Error returning normalized menus:", error);
    res.status(500).json({
      error: "Failed to load normalized menus",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/", async (req, res) => {
  try {
    const normalizedMenus = await ensureMenusAreFresh();
    const menuContent = generateNormalizedHtmlMenuContent(normalizedMenus.restaurants || []);

    let htmlTemplate = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    htmlTemplate = htmlTemplate.replace("<!-- MENU_CONTENT -->", menuContent);
    htmlTemplate = htmlTemplate.replace(/{{SLACK_COUNT}}/g, String(slackRequestCount));
    htmlTemplate = htmlTemplate.replace(
      /{{LAST_UPDATED}}/g,
      new Date().toLocaleString("en-GB", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Helsinki",
      })
    );

    res.setHeader("Content-Type", "text/html");
    res.send(htmlTemplate);
  } catch (error) {
    console.error("Error rendering web page:", error);
    const randomErrorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    res
      .status(500)
      .send(`<html><body><h1>PasiLunch</h1><p>${escapeHtml(randomErrorMessage)}</p></body></html>`);
  }
});

app.post("/slack/commands", async (req, res) => {
  slackRequestCount += 1;
  saveSlackCount(slackRequestCount);

  try {
    const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    const normalizedMenus = await ensureMenusAreFresh();
    const restaurants = Array.isArray(normalizedMenus.restaurants)
      ? normalizedMenus.restaurants
      : [];

    let slackMessage = `*${randomMessage}*\n\n`;
    for (const restaurant of restaurants) {
      slackMessage += formatRestaurantForSlack(restaurant);
    }
    slackMessage +=
      "\n:robot_face: Enjoy your lunch and visit <https://lunchbot-btnu.onrender.com/|PasiLunch> for a nicer view of the lunch options! :heart:";

    res.json({ text: slackMessage });
  } catch (error) {
    console.error("Error handling Slack command:", error);
    const randomErrorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    res.status(500).json({ text: randomErrorMessage });
  }
});

function createHtmlTemplate() {
  const htmlPath = path.join(__dirname, "public", "index.html");
  const publicDir = path.join(__dirname, "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (fs.existsSync(htmlPath)) {
    return;
  }

  fs.writeFileSync(
    htmlPath,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PasiLunch</title><link rel="stylesheet" href="styles.css"></head><body><main><div class="menus-container"><!-- MENU_CONTENT --></div></main></body></html>`,
    "utf8"
  );
}

function setupKeepAlive() {
  const baseUrl = process.env.APP_URL || "https://lunchbot-btnu.onrender.com";
  const healthUrl = `${baseUrl.replace(/\/+$/, "")}/health`;
  const interval = 14 * 60 * 1000;

  console.log(`Setting up keep-alive ping to ${healthUrl} every ${interval / 60000} minutes`);

  const pingServer = () => {
    axios
      .get(healthUrl)
      .then((response) => {
        console.log(
          `[KeepAlive] Pinged /health at ${new Date().toLocaleString("en-GB", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Europe/Helsinki",
          })}: Status ${response.status}`
        );
      })
      .catch((error) => {
        console.error(
          `[KeepAlive] Error pinging /health at ${new Date().toLocaleString("en-GB")}: ${error.message}`
        );
      });
  };

  setTimeout(() => {
    pingServer();
    setInterval(pingServer, interval);
  }, 30000);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  createHtmlTemplate();

  if (fs.existsSync(NORMALIZED_MENUS_PATH)) {
    console.log("Using normalized Gemini menus");
  } else {
    console.log("Normalized menu file missing - falling back to lazy rebuild on first request");
  }

  console.log("Lazy refresh mode enabled (no startup scrape).");
  setupKeepAlive();
});
