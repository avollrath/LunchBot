const request = require('request');
const cheerio = require('cheerio');
const SlackBot = require('slackbots');
const dotenv = require('dotenv')

dotenv.config()

const bot = new SlackBot({
  token: `${process.env.BOT_TOKEN}`,
  name: 'LunchBot'
})



request('https://www.delicatessen.fi/lounaslistat/klondyke', (error, response, html) => {
  if (!error && response.statusCode == 200) {

    const $ = cheerio.load(html);

  let = menuData = $('.newsText ul').text();

  menuData = menuData
    .replace("Maanantai", "Monday")
    .replace("Tiistai", "Tuesday")
    .replace("Keskiviikko", "Wednesday")
    .replace("Torstai", "Thursday")
    .replace("Perjantai", "Friday")
    .replace(/ M/g, "")
    .replace(/ G/g, "")
    .replace(/ K/g, "")
    .replace(/ G/g, "")
    .replace(/FI/g, "")
    .replace(/VE/g, "")
    .replace(/ G/, "")
    .replace(/,/g, "")
    .replace(/ L/g, "")
    .replace(/[()]/g, '');


  const dailyMenu = () => {

      let today = new Date().getDay()

     if (today == 1) return menuData.substring(menuData.indexOf(("Monday")) + 13, menuData.indexOf("Tuesday"));
     if (today == 2) return menuData.substring(menuData.indexOf(("Tuesday")) + 14, menuData.indexOf("Wednesday"));
     if (today == 3) return menuData.substring(menuData.indexOf(("Wednesday")) + 16, menuData.indexOf("Thursday"));
     if (today == 4) return menuData.substring(menuData.indexOf(("Thursday")) +15, menuData.indexOf("Friday"));
     if (today == 5) return menuData.substring((menuData.indexOf("Friday")) + 13, menuData.length).replace("  ","");
     else return "I am so sorry, human. I couldn't get today's menu :disappointed_relieved:"
      
    }


  const params = {
    icon_emoji: ':robot_face:'
}

  bot.postMessageToUser(
    'andre.vollrath',
    ":pizza: You look hungry, lovely human. It's time to get some nutrition soon! \n" + dailyMenu(),
    params
);


  }})


bot.on('error', (err) => {
  console.log(err);
})



 

