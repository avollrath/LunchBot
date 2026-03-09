const axios = require("axios");
const cheerio = require("cheerio");

const DEFAULT_LIMONE_URL = "https://tripla.limone.fi/lounas/";

function cleanText(str = "") {
  return str.replace(/\s+/g, " ").trim();
}

async function scrapeLimoneTriplaMenu(url = DEFAULT_LIMONE_URL) {
  try {
    console.log("Starting to scrape Tripla Limone menu...");
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const today = new Date();

    const daysOfWeek = [
      "SUNNUNTAI",
      "MAANANTAI",
      "TIISTAI",
      "KESKIVIIKKO",
      "TORSTAI",
      "PERJANTAI",
      "LAUANTAI",
    ];

    const dayOfWeek = daysOfWeek[today.getDay()];
    const formattedDate = `${today.getDate()}.${today.getMonth() + 1}.`;

    console.log(`Looking for menu items for: ${dayOfWeek} ${formattedDate}`);

    const pageContent = $("#main .page-content").first();
    if (!pageContent.length) {
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    let dayHeading = null;

    pageContent.find("h3").each(function () {
      const headingText = cleanText($(this).text().toUpperCase());
      if (headingText.startsWith(dayOfWeek) && headingText.includes(formattedDate)) {
        dayHeading = $(this);
        return false;
      }
    });

    if (!dayHeading || !dayHeading.length) {
      pageContent.find("h3").each(function () {
        const headingText = cleanText($(this).text().toUpperCase());
        if (headingText.startsWith(dayOfWeek)) {
          dayHeading = $(this);
          return false;
        }
      });
    }

    if (!dayHeading || !dayHeading.length) {
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    const dishes = [];
    const menuElements = dayHeading.nextUntil("h3");

    menuElements.each(function () {
      const p = $(this);
      if (!p.is("p")) {
        return;
      }

      const strongEl = p.find("strong").first();
      if (!strongEl.length) {
        return;
      }

      const title = cleanText(strongEl.text());
      if (!title) {
        return;
      }

      const description = cleanText(p.find("em").first().text());
      dishes.push({ title, description });
    });

    const menuHtml =
      dishes.length > 0
        ? `<ul>${dishes
            .map((dish) => {
              const descriptionHtml = dish.description ? `<br>${dish.description}` : "";
              return `<li><strong>${dish.title}</strong>${descriptionHtml}</li>`;
            })
            .join("")}</ul>`
        : "Sorry, today's menu could not be found. Please check again later.";

    console.log("Tripla Limone menu HTML:", menuHtml);
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Tripla Limone menu:", error);
    throw error;
  }
}

module.exports = scrapeLimoneTriplaMenu;
