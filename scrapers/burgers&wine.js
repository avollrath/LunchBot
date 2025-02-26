const axios = require("axios");
const cheerio = require("cheerio");

// Burgers & Wine scraper function
async function scrapeBurgersMenu() {
  try {
    console.log("Starting to scrape Burgers & Wine menu...");
    const response = await axios.get("https://burgersandwine.fi/lounas/");
    const $ = cheerio.load(response.data);
    const today = new Date();

    // Format today as needed to match their format
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
    const formattedDate = `${today.getDate()}.${today.getMonth() + 1}`;

    console.log(
      `Looking for Burgers & Wine menu for: ${dayOfWeek} ${formattedDate}`
    );

    // Select the main content container
    const container = $("div.brxe-knlxvt.brxe-text");
    const elements = container.children();

    // Find the element index where today's header (e.g. "KESKIVIIKKO 26.2.") appears.
    let todayHeaderIndex = -1;
    elements.each(function (index) {
      if ($(this).is("p")) {
        const text = $(this).text().trim().toUpperCase();
        if (text.includes(dayOfWeek) && text.includes(formattedDate)) {
          todayHeaderIndex = index;
          return false; // break out of loop once found
        }
      }
    });

    // Array to collect dishes
    let dishes = [];
    let currentDish = null;

    if (todayHeaderIndex >= 0) {
      console.log("Found today's header at index:", todayHeaderIndex);
      // Process all sibling elements following the header until we hit a new day header.
      for (let i = todayHeaderIndex + 1; i < elements.length; i++) {
        const el = $(elements[i]);
        const tag = el.get(0).tagName.toLowerCase();

        // If we hit another <p> that looks like a day header (and does not contain today's date), break.
        if (tag === "p") {
          const text = el.text().trim();
          if (
            text.match(
              /^(MAANANTAI|TIISTAI|KESKIVIIKKO|TORSTAI|PERJANTAI|LAUANTAI|SUNNUNTAI)/i
            ) &&
            !text.includes(formattedDate)
          ) {
            break;
          }
        }

        // Process paragraph elements
        if (tag === "p") {
          // Check if this paragraph contains a <strong> element.
          if (el.find("strong").length > 0) {
            // This is a new dish title.
            // If there's an existing dish, push it into the array.
            if (currentDish) {
              dishes.push(currentDish);
            }
            const title = el.text().trim();
            currentDish = { title, details: [] };
          } else {
            // Otherwise, treat it as ingredient details.
            // Replace any <br> tags in the HTML with newlines.
            let htmlContent = el.html() || "";
            htmlContent = htmlContent.replace(/<br\s*\/?>/gi, "\n");
            const lines = htmlContent
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line && line !== "—");
            if (lines.length > 0 && currentDish) {
              currentDish.details.push(...lines);
            }
          }
        }

        // Process unordered lists: add each <li> as ingredient details.
        if (tag === "ul") {
          el.find("li").each(function () {
            const liText = $(this).text().trim();
            if (liText && liText !== "—" && currentDish) {
              currentDish.details.push(liText);
            }
          });
        }
      }
      // Push the last dish if one is in progress.
      if (currentDish) {
        dishes.push(currentDish);
      }
    } else {
      console.log(
        "Today's header not found; falling back to general content search."
      );
      // Fallback: Search the entire container for any paragraphs or list items mentioning "lounas" or "burger"
      container.find("p, li").each(function () {
        const text = $(this).text().trim();
        if (
          text &&
          (text.toLowerCase().includes("lounas") ||
            text.toLowerCase().includes("burger")) &&
          text !== "—"
        ) {
          dishes.push({ title: text, details: [] });
        }
      });
    }

    console.log("Collected dishes:", dishes);

    // Build HTML: each dish becomes a <li> with a nested <ul> for its ingredients.
    let menuHtml =
      dishes.length > 0
        ? `<ul>${dishes
            .map((dish) => {
              const detailsHtml =
                dish.details.length > 0
                  ? `<ul>${dish.details
                      .map((detail) => `<li>${detail}</li>`)
                      .join("")}</ul>`
                  : "";
              return `<li><strong>${dish.title}</strong>${detailsHtml}</li>`;
            })
            .join("")}</ul>`
        : "Sorry, today's menu could not be found. Please check again later.";

    menuHtml += `<br/><p>Lunch menu price: <strong>14,50€</strong></p>
                    <p>Lunch menu for 3 persons: <strong>39,00€</strong></p>`;

    console.log("Burgers & Wine menu HTML:", menuHtml);
    return menuHtml;
  } catch (error) {
    console.error("Failed to fetch Burgers & Wine menu:", error);
    throw error;
  }
}

module.exports = scrapeBurgersMenu;
