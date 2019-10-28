const request = require('request');
const cheerio = require('cheerio');
const SlackBot = require('slackbots');
const dotenv = require('dotenv')
const schedule = require('node-schedule');
const http = require("http");
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

   res.writeHead(200, {'Content-Type': 'text/plain'});
   res.end('Lunchbot running ...\n');
});

server.listen(PORT, () => {
   console.log(`Lunchbot running at Port:${PORT}/`);
})



dotenv.config()


const bot = new SlackBot({
  token: `${process.env.BOT_TOKEN}`,
  name: 'LunchBot'
})


let rule = new schedule.RecurrenceRule();
rule.dayOfWeek = [new schedule.Range(1, 5)];
rule.hour = 11;
rule.minute =46;
 
const cron = schedule.scheduleJob(rule, function(){
  getMenu();
});


const getMenu = () => {

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
    .replace(/[()]/g, '')
    .replace("Sipulikeitto ", "Onion soup")
    .replace("-krutonkeja", "with croutons")
    .replace("BBQ porsasta", "BBQ pork")
    .replace("Valkoviinissä haudutetut", "stewed in white wine")
    .replace("lohi-kampelarullat", "Salmon flounder roll")
    .replace("Perunasosetta", "Mashed potatoes")
    .replace("Paahtokasviksia", "Oven roasted vegetables")
    .replace("Talon jälkiruokabufee", "Dessert buffet")
    .replace("Kermainen lohikeitto", "Creamy salmon soup")
    .replace("Kiinalainen possu-nuudeliwok", "Chinese Wok with pork and noodles")
    .replace("Aurajuusto-kalkkunapata", "Turkey stew with Aura cheese")
    .replace("Riisiä", "Rice")
    .replace("Keltainen myskikurpitsa- kikhernecurry", "Yellow pumpkin chickpea curry")


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
    "You look hungry, lovely human. It's time to get some nutrition soon:pizza:! Here's today's menu at Klondyke:   \n" + dailyMenu(),
    params
);


  }})

}


bot.on('error', (err) => {
  console.log(err);
})







 

