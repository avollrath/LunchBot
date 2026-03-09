const axios = require("axios");
const cheerio = require("cheerio");

const DEFAULT_VAUNU_URL = "https://jk-kitchen.fi/vaunu/#lounas";
const FINNISH_WEEKDAYS = [
  "sunnuntai",
  "maanantai",
  "tiistai",
  "keskiviikko",
  "torstai",
  "perjantai",
  "lauantai",
];

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeMenuHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[\u2028\u2029]/g, "\n");
}

function extractDaySections(text) {
  const weekdayPattern =
    "(Maanantai|Tiistai|Keskiviikko|Torstai|Perjantai|Lauantai|Sunnuntai)";
  const dayRegex = new RegExp(
    `(${weekdayPattern}\\s+\\d{1,2}\\.\\d{1,2})([\\s\\S]*?)(?=${weekdayPattern}\\s+\\d{1,2}\\.\\d{1,2}|Pidätämme oikeuden|$)`,
    "gi"
  );

  const sections = [];
  let match;
  while ((match = dayRegex.exec(text)) !== null) {
    sections.push({
      heading: cleanText(match[1]),
      body: (match[3] || "").trim(),
    });
  }

  return sections;
}

async function scrapeVaunuMenu(url = DEFAULT_VAUNU_URL) {
  try {
    console.log("Starting to scrape Vaunu menu...");
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const today = new Date();

    const todayDay = FINNISH_WEEKDAYS[today.getDay()];
    const todayDate = `${today.getDate()}.${today.getMonth() + 1}`;

    const textContainer = $(".elementor-widget-text-editor .elementor-widget-container")
      .filter((_, el) => {
        const text = $(el).text();
        return text.includes("Maanantai") && text.includes("Tiistai");
      })
      .first();

    if (!textContainer.length) {
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    const normalizedHtml = normalizeMenuHtml(textContainer.html() || "");
    const normalizedText = cheerio
      .load(`<div>${normalizedHtml}</div>`)("div")
      .text()
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .replace(/(Maanantai|Tiistai|Keskiviikko|Torstai|Perjantai|Lauantai|Sunnuntai)\s+(\d{1,2}\.\d{1,2})/gi, "\n$1 $2\n")
      .replace(/Pidätämme oikeuden[\s\S]*$/i, "")
      .replace(/\s*\n\s*/g, "\n");

    const sections = extractDaySections(normalizedText);
    const targetSection =
      sections.find((section) => {
        const heading = section.heading.toLowerCase();
        return heading.includes(todayDay) && heading.includes(todayDate);
      }) ||
      sections.find((section) => section.heading.toLowerCase().includes(todayDay));

    if (!targetSection) {
      return "Sorry, today's menu could not be found. Please check again later.";
    }

    const items = targetSection.body
      .split("\n")
      .map((line) => cleanText(line))
      .filter(
        (line) =>
          line &&
          !line.toLowerCase().includes("pidätämme oikeuden") &&
          !line.toLowerCase().startsWith("m =")
      );

    const menuHtml =
      items.length > 0
        ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
        : "Sorry, today's menu could not be found. Please check again later.";

    const priceHeading = $("h2")
      .filter((_, el) => $(el).text().toLowerCase().includes("lounasbufee"))
      .first()
      .text();
    const priceLine = cleanText(priceHeading) || "Lounasbuffet 13,70 EUR";

    return `${menuHtml}<br/><p>${priceLine}</p>`;
  } catch (error) {
    console.error("Failed to fetch Vaunu menu:", error);
    throw error;
  }
}

module.exports = scrapeVaunuMenu;
