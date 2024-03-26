const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();
const express = require("express");
const { WebClient } = require("@slack/web-api");
const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
const CACHE_PATH = path.join(CACHE_DIR, "menuCache.json");

const app = express();
const PORT = process.env.PORT || 3000;
const slackClient = new WebClient(process.env.BOT_TOKEN);
let slackRequestCount = 0;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send(
    `LunchBot is running! Slack requests received: ${slackRequestCount}`
  );
});

console.log("Server starting...");

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

app.post("/slack/commands", async (req, res) => {
  slackRequestCount++;
  console.log(`Slack request count: ${slackRequestCount}`);

  try {
    const menu = await getMenu(); // This function fetches the daily menu, either from cache or by scraping
    const randomMessage =
      funnyMessages[Math.floor(Math.random() * funnyMessages.length)];

    // Include the Slack request count in the message
    const fullMessage = `*${randomMessage}*\n\n${menu}\n\nSlack requests received: ${slackRequestCount}`;
    res.json({ text: fullMessage });
  } catch (error) {
    console.error("Error fetching menu or posting message:", error);

    const randomErrorMessage =
      errorMessages[Math.floor(Math.random() * errorMessages.length)];
    const fullErrorMessage = `*${randomErrorMessage}*\nSorry, couldn't fetch today's menu. Please try again later.`;

    res.json({ text: fullErrorMessage });
  }
});

const getMenu = async () => {
  let cache = { menu: "", date: "" };

  if (fs.existsSync(CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  }

  const currentDate = new Date().toISOString().slice(0, 10);
  if (cache.date === currentDate) {
    return cache.menu;
  }

  try {
    const response = await axios.get("https://en.klondyketalo.fi/lounaslista");
    const $ = cheerio.load(response.data);
    const weekday = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const todayWeekday = weekday[new Date().getDay()].toLowerCase();

    let menuText = "";

    $(".mygridbase").each(function () {
      const dayHeading = $(this)
        .find(".myparagraph.bold strong")
        .text()
        .toLowerCase();
      if (dayHeading.includes(todayWeekday)) {
        const menuHtml = $(this).find(".myparagraph.lounas").html();
        const menuItems = menuHtml
          .split("<br>")
          .map((item) => {
            const text = cheerio.load(`<span>${item}</span>`).text();
            return text.replace(/\(.*?\)/g, "").trim();
          })
          .filter((item) => item && !item.includes("&amp;"));

        menuText += menuItems.map((item) => `• ${item}`).join("\n");
        return false;
      }
    });
    fs.writeFileSync(
      CACHE_PATH,
      JSON.stringify({ menu: menuText, date: currentDate }),
      "utf8"
    );
    return (
      menuText ||
      "Sorry, today's menu could not be found. Please check again later."
    );
  } catch (error) {
    console.error("Failed to fetch the menu:", error);
    throw new Error("Failed to fetch the menu: " + error);
  }
};

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
