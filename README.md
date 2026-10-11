# Deven's Rack

Storefront site for Deven Patel's Depop shop, [de2en_927](https://www.depop.com/de2en_927/).

The page is static (`index.html`, `styles.css`, `app.js`). Every listing comes from
`data/listings.json`, which `scripts/sync-depop.mjs` rebuilds from the live Depop shop.
Buy buttons send shoppers to the Depop listing to check out.

## Syncing with Depop

Depop has no public API and returns 403 to plain requests, so the sync opens the shop in
headless Chromium and reads the product feeds the page loads. Depop sometimes serves an
empty page, so the script retries up to four times and never overwrites the data with an
empty shop.

- **Automatic:** `.github/workflows/sync-depop.yml` runs every 3 hours and commits
  `data/listings.json` only when the shop changed. GitHub Pages redeploys on that commit.
- **By hand:** `npm install && npx playwright install chromium && npm run sync`

## Hero photo

The hero image is `assets/deven.jpg`. Replace it with Deven's photo (portrait, about 4:5).

## Preview

https://odyssey-jotun.github.io/devens-rack/ (set to `noindex` while it is a preview)
