const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const express = require('express');
const { WebClient } = require('@slack/web-api');

const app = express();
const PORT = process.env.PORT || 3000;
const slackClient = new WebClient(process.env.BOT_TOKEN);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('LunchBot is running!');
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

app.post("/slack/commands", async (req, res) => {
  try {
    const menu = await getMenu();
    const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    const fullMessage = `*${randomMessage}*\n\n${menu}`;
    res.json({ text: fullMessage });
  } catch (error) {
    console.error("Error fetching menu or posting message:", error);
    res.json({ text: "Sorry, couldn't fetch today's menu. Please try again later." });
  }
});

const getMenu = async () => {
  try {
    const response = await axios.get("https://en.klondyketalo.fi/lounaslista");
    const $ = cheerio.load(response.data);
    const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayWeekday = weekday[new Date().getDay()].toLowerCase();
    
    let menuText = "";

    $(".mygridbase").each(function () {
      const dayHeading = $(this).find(".myparagraph.bold strong").text().toLowerCase();
      if (dayHeading.includes(todayWeekday)) {
        const menuHtml = $(this).find(".myparagraph.lounas").html();
        const menuItems = menuHtml.split("<br>").map(item => {
          const text = cheerio.load(`<span>${item}</span>`).text();
          return text.replace(/\(.*?\)/g, "").trim();
        }).filter(item => item && !item.includes("&amp;"));

        menuText += menuItems.map(item => `• ${item}`).join("\n");
        return false; // Break loop
      }
    });

    return menuText || "Sorry, today's menu could not be found. Please check again later.";
  } catch (error) {
    console.error("Failed to fetch the menu:", error);
    throw new Error("Failed to fetch the menu: " + error);
  }
};

getMenu()
  .then(menu => console.log("Initial menu fetch:", menu))
  .catch(err => console.error("Initial menu fetch error:", err));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
