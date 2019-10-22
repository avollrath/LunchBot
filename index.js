const request = require('request');
const cheerio = require('cheerio');
const SlackBot = require('slackbots');
const dotenv = require('dotenv')



let date = new Date();
let weekday = new Array(7);
weekday[0] = "Sunday";
weekday[1] = "Monday";
weekday[2] = "Tuesday";
weekday[3] = "Wednesday";
weekday[4] = "Thursday";
weekday[5] = "Friday";
weekday[6] = "Saturday";

var n = weekday[date.getDay()];

console.log(n);

dotenv.config()

const bot = new SlackBot({
  token: `${process.env.BOT_TOKEN}`,
  name: 'LunchBot'
})


let menuData;

request('https://www.delicatessen.fi/lounaslistat/klondyke', (error, response, html) => {
  if (!error && response.statusCode == 200) {

    const $ = cheerio.load(html);

  menuData = $('.newsText ul').text();

  menuData = menuData
    .replace("Maanantai", "Monday")
    .replace("Tiistai", "Tuesday")
    .replace("Keskiviiko", "Wednesday")
    .replace("Torstai", "Thursday")
    .replace("Perjantai", "Friday");


    let menuMonday = menuData.substring(menuData.indexOf("Monday"), menuData.indexOf("Tuesday"));
    let menuTuesday = menuData.substring(menuData.indexOf("Tuesday"), menuData.indexOf("Wednesday"));
    let menuWednesday = menuData.substring(menuData.indexOf("Wednesday"), menuData.indexOf("Thursday"));
    let menuThursday = menuData.substring(menuData.indexOf("Thursday"), menuData.indexOf("Friday"));
    let menuFriday = menuData.substring(menuData.indexOf("Friday"), menuData.length);



  const params = {
    icon_emoji: ':robot_face:'
}

  bot.postMessageToUser(
    'andre.vollrath',
    ":pizza: You look hungry lovely human. It's time to get some nutrition soon! \n" + menuFriday,
    params
);


  }})



bot.on('error', (err) => {
  console.log(err);
})



 

