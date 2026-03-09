const fs = require("fs");
const path = require("path");

function loadNormalizedMenus() {
  const normalizedPath = path.join(__dirname, "..", "data", "normalizedMenus.json");

  if (!fs.existsSync(normalizedPath)) {
    throw new Error(
      `Normalized menu file missing at ${normalizedPath}. Run "npm run normalize:menus" first.`
    );
  }

  try {
    const content = fs.readFileSync(normalizedPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to read normalized menus: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

module.exports = loadNormalizedMenus;

