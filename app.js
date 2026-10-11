// Renders Deven's Rack from data/listings.json, which scripts/sync-depop.mjs keeps
// in step with Deven's Depop.

const GROUPS = [
  ['Denim', (l) => /jeans|denim/i.test(l.category) || /jean|denim/i.test(l.title)],
  ['Tees', (l) => /t-shirt/i.test(l.category)],
  ['Knits', (l) => /sweat|jumper|knit|hood/i.test(l.category)],
  ['Shirts', (l) => /polo|shirt|blouse|top/i.test(l.category)],
  ['Bottoms', (l) => /bottom|trouser|short|skirt|pant/i.test(l.category)],
];
// Listings to keep off the site even while they're live on Depop.
const HIDDEN = new Set([879771374]); // 2Pac graphic tee

const groupOf = (l) => (GROUPS.find(([, test]) => test(l)) || ['More'])[0];

const money = (n) => (n == null ? '' : `$${Number.isInteger(n) ? n : n.toFixed(2)}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const grid = document.getElementById('grid');
const chips = document.getElementById('chips');
const sortSel = document.getElementById('sort');
const empty = document.getElementById('empty');

const more = document.getElementById('more');

let listings = [];
let active = 'All';
let showAll = false;
const FIRST = 8;

function card(l) {
  const [main, alt] = l.images;
  const sale = l.originalPrice && l.originalPrice > l.price;
  return `
    <a class="card" href="${esc(l.url)}" rel="noopener" aria-label="${esc(l.title)}, ${money(l.price)}, view on Depop">
      <div class="card-photo">
        <span class="tag">${sale ? `<s>${money(l.originalPrice)}</s>` : ''}<b>${money(l.price)}</b></span>
        <img src="${esc(main)}" alt="${esc(l.title)}" loading="lazy" decoding="async" width="600" height="800">
        ${alt ? `<img class="alt" src="${esc(alt)}" alt="" loading="lazy" decoding="async" width="600" height="800">` : ''}
      </div>
      <div class="card-body">
        <h3 class="card-title">${esc(l.title)}</h3>
        <div class="card-meta">
          ${l.brand ? `<span class="pill brand">${esc(l.brand)}</span>` : ''}
          ${l.size ? `<span class="pill">Size ${esc(l.size)}</span>` : ''}
          ${l.condition ? `<span class="pill">${esc(l.condition)}</span>` : ''}
        </div>
        <div class="card-foot">
          <span class="buy">Buy on Depop</span>
        </div>
      </div>
    </a>`;
}

const reveal = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    }, { rootMargin: '0px 0px -40px 0px' })
  : null;

function render() {
  let list = active === 'All' ? [...listings] : listings.filter((l) => l.group === active);
  if (sortSel.value === 'low') list.sort((a, b) => a.price - b.price);
  else if (sortSel.value === 'high') list.sort((a, b) => b.price - a.price);
  else list.sort((a, b) => (b.listedAt || '').localeCompare(a.listedAt || ''));

  const shown = showAll ? list : list.slice(0, FIRST);
  grid.innerHTML = shown.map(card).join('');
  empty.hidden = list.length > 0;
  more.hidden = shown.length >= list.length;
  more.textContent = `Show all ${list.length} pieces`;
  grid.querySelectorAll('.card').forEach((c) => (reveal ? reveal.observe(c) : c.classList.add('in')));
}

function renderChips() {
  const counts = listings.reduce((m, l) => m.set(l.group, (m.get(l.group) || 0) + 1), new Map());
  const names = ['All', ...[...GROUPS.map(([g]) => g), 'More'].filter((g) => counts.has(g))];
  chips.innerHTML = names
    .map((g) => `<button class="chip" type="button" data-group="${g}" aria-pressed="${g === active}">${g}<span class="count">${g === 'All' ? listings.length : counts.get(g)}</span></button>`)
    .join('');
}

chips.addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  active = b.dataset.group;
  chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
  render();
});
sortSel.addEventListener('change', render);
more.addEventListener('click', () => {
  showAll = true;
  render();
});

function renderSold(sold) {
  const strip = document.getElementById('soldStrip');
  strip.innerHTML = sold
    .filter((s) => s.images?.[0])
    .slice(0, 12)
    .map((s) => `
      <figure class="sold-item">
        <img src="${esc(s.images[0])}" alt="${esc(s.title)}" loading="lazy" decoding="async" width="400" height="400">
        <span class="sold-badge">SOLD</span>
        <figcaption>${esc(s.title)}</figcaption>
      </figure>`)
    .join('');
  if (!strip.children.length) document.getElementById('sold').hidden = true;
}

function syncedLabel(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 2) return 'Live from Depop. Updated just now';
  if (mins < 60) return `Live from Depop. Updated ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Live from Depop. Updated ${hrs} hr ago`;
  return `Live from Depop. Updated ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

fetch('data/listings.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((data) => {
    listings = data.listings.filter((l) => !HIDDEN.has(l.id)).map((l) => ({ ...l, group: groupOf(l) }));
    renderChips();
    render();
    renderSold(data.sold || []);
    const photos = listings.filter((l) => l.images[0]);
    const [left, right] = photos;
    if (left) document.getElementById('heroLeft').src = left.images[0];
    if (right) document.getElementById('heroRight').src = right.images[0];
    document.getElementById('stack').innerHTML = photos
      .slice(2, 5)
      .map((l) => `<img src="${esc(l.images[0])}" alt="" loading="lazy" decoding="async" width="600" height="800">`)
      .join('');
    const planPick = photos.find((l, i) => i >= 5 && l.images[1]) || photos[0];
    if (planPick) document.getElementById('planPhoto').src = planPick.images[1] || planPick.images[0];
    const prices = listings.map((l) => l.price).filter((p) => p != null);
    const cheap = prices.filter((p) => p < 20).length;
    if (prices.length && cheap <= prices.length / 2) {
      document.getElementById('priceWin').textContent = `Pieces from $${Math.min(...prices)}`;
    }
    const soldCount = data.soldCount ?? (data.sold || []).length;
    document.querySelectorAll('[data-stat="live"]').forEach((el) => (el.textContent = listings.length));
    document.querySelectorAll('[data-stat="sold"]').forEach((el) => (el.textContent = soldCount));
    document.getElementById('synced').textContent = syncedLabel(data.syncedAt);
  })
  .catch(() => {
    empty.hidden = false;
    empty.textContent = 'The rack is loading slowly. Refresh in a moment.';
  });
