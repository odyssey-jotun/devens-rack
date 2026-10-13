// Pulls Deven's live Depop shop into data/listings.json.
//
// Depop answers plain HTTP requests with 403, so this opens the shop in a real
// (headless) Chromium and reads the product feeds the shop page loads.
//
//   npm run sync            -> writes data/listings.json
//   CHROME_PATH=/path npm run sync   (use an already installed Chrome)

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const SHOP = 'de2en_927';
const OUT = new URL('../data/listings.json', import.meta.url);

// Listings kept off the site even while they are live on Depop. Add the
// product id (from data/listings.json) to hide a specific piece; the word list
// catches new ones with suggestive graphics before anyone sees them.
const HIDDEN_IDS = new Set([
  879769585, // biker pinup graphic tee
]);
const HIDDEN_WORDS = /\b(pin-?ups?|nude|naked|topless|sexy|playboy|nsfw)\b/i;
const allowed = (p) => !HIDDEN_IDS.has(p.id) && !HIDDEN_WORDS.test(`${p.slug} ${p.description}`);

const CONDITION = {
  brand_new: 'Brand new',
  used_like_new: 'Like new',
  used_excellent: 'Excellent',
  used_good: 'Good',
  used_fair: 'Fair',
};

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});

// Depop blocks scripted fetches, so let the shop page load its own product
// feeds and read those responses as they arrive. Scrolling loads more pages.
async function loadShop() {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36',
  });
  const feeds = { active: new Map(), sold: new Map() };
  const hasMore = { active: false, sold: false };
  let pending = 0;
  page.on('response', async (r) => {
    const u = r.url();
    if (!/webapi\.depop\.com\/.*\/shops\/\d+\/products\//.test(u) || r.status() !== 200) return;
    const kind = u.includes('/by-status/sold/') ? 'sold' : u.includes('/by-status/') ? null : 'active';
    if (!kind) return;
    pending++;
    try {
      const j = await r.json();
      for (const p of j.objects || []) feeds[kind].set(p.id, p);
      hasMore[kind] = Boolean(j.page_info?.has_more);
    } catch {}
    pending--;
  });

  const res = await page.goto(`https://www.depop.com/${SHOP}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!res || res.status() !== 200) throw new Error(`Depop returned ${res?.status()} for the shop page`);

  // Keep scrolling until both feeds have arrived and nothing new loads for a while.
  let quiet = 0;
  for (let i = 0; i < 45 && (quiet < 6 || (feeds.sold.size === 0 && i < 25)); i++) {
    const before = feeds.active.size + feeds.sold.size;
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(1000);
    if (i === 15 && feeds.active.size === 0) break; // page came back without the shop
    const grew = feeds.active.size + feeds.sold.size > before;
    quiet = grew || pending ? 0 : quiet + 1;
  }
  if (feeds.active.size === 0) throw new Error('Depop page loaded without the shop listings');
  if (hasMore.active || hasMore.sold) console.warn('Warning: Depop reported more pages than were loaded.');

  const soldCount = await page
    .locator('text=/\\d+ sold/')
    .first()
    .textContent({ timeout: 5000 })
    .then((t) => Number(t.match(/(\d+) sold/)[1]))
    .catch(() => null);
  await page.close();
  return { active: [...feeds.active.values()], sold: [...feeds.sold.values()], soldCount };
}

// Depop sometimes serves an empty page to repeat visitors; wait and try again.
let shop;
for (let attempt = 1; attempt <= 4 && !shop; attempt++) {
  try {
    shop = await loadShop();
  } catch (err) {
    console.warn(`Attempt ${attempt} failed: ${err.message}`);
    if (attempt < 4) await new Promise((r) => setTimeout(r, 30000 * attempt));
  }
}
await browser.close();
if (!shop) throw new Error('Could not read the Depop shop after 4 attempts; listings.json left unchanged.');
const { active, sold } = shop;

function titleOf(p) {
  const first = (p.description || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  const clean = first
    .replace(/#\S+/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 90) || p.brand_name || 'Vintage piece';
}

function shape(p) {
  // Use the listed price. total_price can include Depop's buyer fee and tax,
  // which depend on where the request comes from.
  const listed = (x) => x?.price_breakdown?.price?.amount ?? x?.total_price;
  const price = listed(p.pricing?.current_price);
  const original = listed(p.pricing?.original_price);
  return {
    id: p.id,
    url: `https://www.depop.com/products/${p.slug}/`,
    title: titleOf(p),
    brand: p.brand_name && p.brand_name !== 'Other' ? p.brand_name : '',
    category: p.category_name || '',
    group: p.attributes?.group || '',
    size: p.sizes?.[0]?.name || '',
    condition: CONDITION[p.attributes?.condition] || '',
    price: price ? Number(price) : null,
    originalPrice: original && original !== price ? Number(original) : null,
    images: (p.pictures || []).slice(0, 4).map((x) => x.formats?.P0?.url).filter(Boolean),
    listedAt: p.created_at,
  };
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;

const data = {
  shop: SHOP,
  shopUrl: `https://www.depop.com/${SHOP}/`,
  syncedAt: new Date().toISOString(),
  soldCount: shop.soldCount ?? (sold.length || prev?.soldCount || 0),
  listings: active.filter((p) => p.status === 'STATUS_ONSALE' && allowed(p)).map(shape),
  sold: !sold.length && prev?.sold?.length ? prev.sold : sold.filter(allowed).map(shape).map(({ url, title, brand, images, price }) => ({ url, title, brand, images: images.slice(0, 1), price })),
};

// Leave the file alone if nothing changed apart from the timestamp, so the
// scheduled job does not commit every run.
if (prev) {
  const strip = (d) => JSON.stringify({ ...d, syncedAt: null });
  if (strip(prev) === strip(data)) {
    console.log(`No changes (${data.listings.length} live, ${data.sold.length} sold).`);
    process.exit(0);
  }
}

writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`Synced ${data.listings.length} live listings and ${data.sold.length} sold from ${SHOP}.`);
