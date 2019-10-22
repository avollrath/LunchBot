const request = require('request');
const cheerio = require('cheerio');
const SlackBot = require('slackbots');
const dotenv = require('dotenv')

dotenv.config()

let menuData;

request('https://www.delicatessen.fi/lounaslistat/klondyke', (error, response, html) => {
  if (!error && response.statusCode == 200) {

    const $ = cheerio.load(html);

  menuData = $('.newsText ul').text();

  console.log(menuData);

  }})

  const bot = new SlackBot({
    token: `${process.env.BOT_TOKEN}`,
    name: 'LunchBot'
})

bot.on('start', () => {
  const params = {
      icon_emoji: ':robot_face:'
  }

  bot.postMessageToUser(
      'andre.vollrath',
      ":pizza: You look hungry lovely human. It's time to get some nutrition soon" + menuData,
      params
  );
})

bot.on('error', (err) => {
  console.log(err);
})

 

