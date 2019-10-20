const request = require('request');
const cheerio = require('cheerio');
var fs = require('fs');

request('https://www.delicatessen.fi/lounaslistat/klondyke', (error, response, html) => {
  if (!error && response.statusCode == 200) {

    const $ = cheerio.load(html);

  const menuData = $('.newsText ul').text();



fs.writeFile("menu.json", menuData, function(err) {
    if (err) {
        console.log(err);
    }
});


  }})

 

