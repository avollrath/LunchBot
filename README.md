# PasiLunch

PasiLunch is a Node.js/Express app that aggregates lunch menus from multiple restaurants, normalizes them with Gemini into one consistent JSON format, and serves the result to:

- The web dashboard (`/`)
- Slack slash command endpoint (`/slack/commands`)
- JSON API (`/api/menus/normalized`)

## How it works

1. Scrapers fetch raw menus into `cache/*.json`
2. Gemini normalization converts all cached menus into one unified file:
   - `data/normalizedMenus.json`
   - `data/normalizedMenus.pretty.json`
3. The app uses normalized data as the single source of truth for rendering

## Daily refresh behavior

The app uses lazy daily refresh logic (Europe/Helsinki date):

- First real request of the day triggers refresh:
  - scrape all restaurants
  - run Gemini normalization (combined request)
  - write normalized output files
- Later requests on the same day reuse normalized output
- If filesystem data is missing (for example after Render free spin-down/restart), it rebuilds automatically on the next request
- Concurrent requests share one refresh lock so duplicate refreshes are not run in parallel

## Requirements

- Node.js 18.x
- npm
- Gemini API key

## Environment variables

Create a `.env` file in project root:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
APP_URL=https://your-service.onrender.com
TZ=Europe/Helsinki
```

Notes:
- `GEMINI_API_KEY` is required for normalization
- `GEMINI_MODEL` is optional (defaults to `gemini-2.5-flash`)
- `APP_URL` is used by optional keep-alive ping
- Helsinki timezone is used explicitly in code for daily freshness checks

## Install and run locally

```bash
npm install
npm run start
```

Open:
- `http://localhost:3000/`
- `http://localhost:3000/health`
- `http://localhost:3000/api/menus/normalized`

## Scripts

- `npm run start`
  - starts the Express server
- `npm run normalize:menus`
  - runs normalization script directly (uses existing `cache/*.json`)
- `npm run refresh:menus`
  - runs full refresh flow (scrape + normalize)

## Main endpoints

- `GET /`
  - renders normalized menu cards
- `POST /slack/commands`
  - returns normalized menu text for Slack
- `GET /api/menus/normalized`
  - returns normalized JSON
- `GET /health`
  - lightweight health check (does not trigger scraping or Gemini)

## Project structure

```text
cache/                     # raw scraper output (intermediate)
data/                      # normalized Gemini output
scrapers/                  # restaurant scrapers
scripts/normalize-menus.js # normalization pipeline
services/menuRefresh.js    # daily refresh orchestration + locking
services/rawMenuFetch.js   # raw cache fetching utilities
config/restaurants.js      # restaurant registry
index.js                   # express app entrypoint
```

## Deployment notes (Render Free)

- Render free web services can spin down and use ephemeral filesystem
- This app is designed to recover automatically:
  - if `cache/` or `data/` files disappear, first real request rebuilds menus
- Keep-alive pings should target `/health` so they do not trigger refresh work

## Troubleshooting

- `Missing GEMINI_API_KEY in environment`
  - add `GEMINI_API_KEY` to `.env` and restart
- `No cache JSON files found in cache/`
  - run `npm run refresh:menus` to generate cache + normalized output
- Normalization not re-running on same day
  - expected behavior; use:
  - `npm run normalize:menus -- --force`

