const axios = require("axios");
const cheerio = require("cheerio");

// RSS Feed scraper function
async function scrapeRssMenu(url) {
  try {
    console.log(`Starting to fetch RSS feed from: ${url}`);
    const response = await axios.get(url);
    
    // Parse XML to JS object
    const parser = new xml2js.Parser({ 
      explicitArray: false,
      mergeAttrs: true,
      normalize: true,
      explicitCharkey: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    
    const result = await parser.parseStringPromise(response.data);
    
    if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
      console.error("Invalid RSS structure:", JSON.stringify(result, null, 2));
      throw new Error("Could not parse RSS feed structure");
    }
    
    // Handle both single item and array of items
    const items = Array.isArray(result.rss.channel.item) 
      ? result.rss.channel.item 
      : [result.rss.channel.item];
    
    console.log(`Found ${items.length} items in RSS feed`);
    
    // Get today's date to find today's menu
    const today = new Date();
    const formattedDate = `${today.getDate()}.${today.getMonth() + 1}`;
    
    // Find today's menu
    let todayMenu = null;
    for (const item of items) {
      const title = item.title || "";
      // Check if the title or description contains today's date
      if (title.includes(formattedDate)) {
        todayMenu = item;
        break;
      }
    }
    
    if (!todayMenu && items.length > 0) {
      // If we couldn't find today's menu specifically, just use the first item
      // This assumes the RSS feed is already filtered for today
      todayMenu = items[0];
    }
    
    if (!todayMenu) {
      return "Sorry, today's menu could not be found in the RSS feed.";
    }
    
    // Extract and format the menu
    let menuText = "";
    
    if (todayMenu.description) {
      // Clean up HTML from RSS content
      const description = todayMenu.description
        .replace(/<br\s*\/?>/gi, '\n') // Replace <br> with newlines
        .replace(/<[^>]*>/g, '')       // Remove other HTML tags
        .replace(/&lt;/g, '<')         // Handle HTML entities
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\n+/g, '\n')         // Remove duplicate newlines
        .trim();
      
      // Format each line with bullet points
      menuText = description.split('\n')
        .filter(line => line.trim())
        .map(line => `• ${line.trim()}`)
        .join('\n');
    }
    
    console.log("Extracted menu from RSS:", menuText || "No menu found");
    return menuText || "Sorry, today's menu details could not be found in the RSS feed.";
  } catch (error) {
    console.error("Failed to fetch RSS menu:", error);
    throw error;
  }
}

module.exports = scrapeRssMenu;