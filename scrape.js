const request = require('request');
const cheerio = require('cheerio');

request('https://www.delicatessen.fi/lounaslistat/klondyke', (error, response, html) => {
  if (!error && response.statusCode == 200) {

    const $ = cheerio.load(html);

  const menuContainer = $('.newsText ul');

  console.log (menuContainer.text().replace(/\.w/g,''));

  }})
