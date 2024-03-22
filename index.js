const request = require("request");
const cheerio = require("cheerio");
const dotenv = require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { WebClient } = require("@slack/web-api");

const app = express();
const PORT = process.env.PORT || 3000;
const slackClient = new WebClient(process.env.BOT_TOKEN);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

console.log('Server starting...');


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
  "Warning: High probability of taste bud overload. Proceed with today's menu:"
];


app.post('/slack/commands', async (req, res) => {
  try {
    const menu = await getMenu();
    // Select a random funny message
    const randomMessage = `*${funnyMessages[Math.floor(Math.random() * funnyMessages.length)]}*`;
    // Combine the random message with the fetched menu
    const fullMessage = `${randomMessage}\n\n${menu}`;

    // Respond with the combined message directly to Slack
    res.json({ text: fullMessage });
  } catch (error) {
    console.error('Error fetching menu or posting message:', error);
    // Fallback response in case of error
    res.json({ text: "Sorry, couldn't fetch today's menu. Please try again later." });
  }
});


const getMenu = async () => {
  return new Promise((resolve, reject) => {
    request("https://en.klondyketalo.fi/lounaslista", (error, response, html) => {
      if (!error && response.statusCode == 200) {
        const $ = cheerio.load(html);
        const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const today = new Date();
        const todayWeekday = weekday[today.getDay()].toLowerCase();
        
        let menuFound = false;
        let menuText = "";

        $('.mygridbase').each(function() {
          const dayHeading = $(this).find('.myparagraph.bold strong').text().toLowerCase();
          if(dayHeading.includes(todayWeekday)) {
            menuFound = true;
            const menuHtml = $(this).find('.myparagraph.lounas').html();
            // Split menu items by <br>, remove dietary info, decode HTML entities, and filter out empty items
            const menuItems = menuHtml.split('<br>').map(item => 
              $('<textarea/>').html(item).text().replace(/\(.*?\)/g, '').trim()
            ).filter(item => item && !item.includes('&amp;'));

            // Special handling for items with '&'
            const finalMenuItems = [];
            menuItems.forEach((item, index) => {
              if (item.endsWith('&') && menuItems[index + 1]) {
                finalMenuItems.push(item + ' ' + menuItems[index + 1]);
                menuItems[index + 1] = ""; // Clear the next item as it's been merged
              } else if (!item.startsWith('&')) {
                finalMenuItems.push(item);
              }
            });

            menuText += finalMenuItems.map(item => `• ${item}`).join('\n');
          }
        });

        if (!menuFound) {
          resolve("Sorry, today's menu could not be found. Please check again later.");
        } else {
          resolve(menuText);
        }
      } else {
        console.error("Failed to fetch the menu:", error);
        reject("Failed to fetch the menu: " + error);
      }
    });
  });
};






getMenu().then(menu => console.log("Initial menu fetch:", menu)).catch(err => console.error("Initial menu fetch error:", err));



app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


