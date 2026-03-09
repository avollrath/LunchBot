const axios = require("axios");
const cheerio = require("cheerio");

const DEFAULT_FACTORY_URL =
  "https://ravintolafactory.com/lounasravintolat/ravintolat/factory-pasila/";

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isDailyHeading(text) {
  return /^(maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai)\s+\d{1,2}\.\d{1,2}\.\d{4}$/i.test(
    text
  );
}

function extractLinesFromParagraph($, element) {
  const html = $(element).html() || "";
  if (!html.includes("<br")) {
    return [];
  }

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => cleanText(cheerio.load(`<div>${line}</div>`)("div").text()))
    .filter((line) => line && line !== "\u00a0");
}

// Factory Pasila scraper function
async function scrapeFactoryMenu(url = DEFAULT_FACTORY_URL) {
  try {
    console.log("Starting to scrape Factory menu...");
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const today = new Date();

    const formattedDate = `${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`;
    const dayOfWeek = today.toLocaleDateString("fi-FI", { weekday: "long" });
    const normalizedDayOfWeek = dayOfWeek.toLowerCase();

    const listContainer =
      $(".tab-content.lounaslista .list").first().length > 0
        ? $(".tab-content.lounaslista .list").first()
        : $(".list").first();

    if (!listContainer.length) {
      throw new Error("Factory menu container not found.");
    }

    console.log(`Looking for Factory menu for: ${dayOfWeek} ${formattedDate}`);

    const dayHeadings = listContainer.find("h3").filter((_, element) => {
      const headingText = cleanText($(element).text());
      return isDailyHeading(headingText);
    });

    let todayHeading = dayHeadings
      .filter((_, element) => {
        const headingText = cleanText($(element).text()).toLowerCase();
        return (
          headingText.includes(formattedDate) &&
          headingText.startsWith(normalizedDayOfWeek)
        );
      })
      .first();

    if (!todayHeading.length) {
      todayHeading = dayHeadings
        .filter((_, element) => {
          const headingText = cleanText($(element).text());
          return headingText.includes(formattedDate);
        })
        .first();
    }

    let items = [];

    if (todayHeading.length) {
      console.log("Found today's heading:", cleanText(todayHeading.text()));

      let current = todayHeading.next();
      while (current.length) {
        if (current.is("h3") && isDailyHeading(cleanText(current.text()))) {
          break;
        }

        if (current.is("p")) {
          const lines = extractLinesFromParagraph($, current);
          if (lines.length > 0) {
            items.push(...lines);
          }
        }

        current = current.next();
      }
    }

    if (items.length === 0) {
      console.log("Failed to match by date heading, trying weekday fallback...");
      dayHeadings.each((_, element) => {
        const headingText = cleanText($(element).text()).toLowerCase();
        if (!headingText.startsWith(normalizedDayOfWeek)) {
          return;
        }

        const siblingParagraph = $(element).nextAll("p").first();
        const lines = extractLinesFromParagraph($, siblingParagraph);
        if (lines.length > 0) {
          items = lines;
          return false;
        }
      });
    }

    console.log("Raw menu items:", items);

    let menuHtml =
      items.length > 0
        ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
        : "Sorry, today's menu could not be found. Please check again later.";

    menuHtml += "<br/><p>Buffet price: <strong>13,70 EUR</strong></p>";

    console.log("Factory menu HTML:", menuHtml);
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Factory menu:", error);
    throw error;
  }
}

module.exports = scrapeFactoryMenu;

