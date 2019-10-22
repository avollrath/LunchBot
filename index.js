const request = require('request');
const cheerio = require('cheerio');
const SlackBot = require('slackbots');
var fs = require('fs');

request('https://www.delicatessen.fi/lounaslistat/klondyke', (error, response, html) => {
  if (!error && response.statusCode == 200) {

    const $ = cheerio.load(html);

  const menuData = $('.newsText ul').text();






  }})

 

