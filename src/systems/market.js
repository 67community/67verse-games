// market.js — Marketplace system panel (spec §10/§14: real-value trading layer).
//
// This module is the game's PUBLIC NETWORK BOUNDARY for the real-value economy:
// - Units balance + identity come from ctx.pn.* (local fakes owned by Codex).
// - list / buy / sell flows call ONLY ctx.pn.marketList / marketBuy / marketSell
//   stubs. No real trading, no backend, no networking is implemented here.
// - Gated: one-time 13+ age attestation (save key 'marketAgeOK') + a per-session
//   parental confirmation whenever settings.parentalGate is enabled.
// - Coin-economy cosmetics stay OUT of the marketplace (two asset classes kept
//   separate per spec §10): only profile assets from save keys 'ownedChars' and
//   'ownedCosmetics' are shown as listable collectibles.
//
// Save keys used: 'ownedChars', 'ownedCosmetics', 'settings', 'marketAgeOK'.
// Bus events: none emitted, none subscribed (panel is DOM-only).

import { registerSystem } from '../core/registry.js';

const SAVE_AGE_OK = 'marketAgeOK'; // bool — one-time "I am 13+" attestation for the PN layer

// ---- palette (ARCHITECTURE.md) ----
const C = {
  ink: '#060c21', sub: '#9a9aa2', line: '#e5e5ea', cream: '#f5f5f7',
  plum: '#8a6fb0', yellow: '#0A84FF', sage: '#5a9c7a', panel: '#ffffff',
};

let panel = null;   // active ctx.ui.panel handle (null when closed)
let session = 0;    // async-guard token; bumped on close() so late resolves no-op

// Small DOM helper: el('div', {css}, 'text')
function el(tag, style, text) {
  const n = document.createElement(tag);
  if (style) n.style.cssText = style;
  if (text != null) n.textContent = text;
  return n;
}

function chip(text, color = C.sub) {
  return el('span',
    `font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;` +
    `padding:5px 11px;border-radius:8px;background:${C.cream};border:1px solid ${C.line};color:${color};`,
    text);
}

// ---- profile assets --------------------------------------------------------
// ownedChars / ownedCosmetics formats are owned by other modules still being
// built; normalize defensively: string ids or {id,name,...} objects both work.
function normalize(list, kind, ctx) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      const id = typeof entry === 'string' ? entry : entry && entry.id;
      if (!id) return null;
      const roster = ctx.characters.ROSTER.find((r) => r.id === id);
      const name = (typeof entry === 'object' && entry.name) ||
        (roster && roster.name) ||
        id.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
      const colorHex = roster ? '#' + roster.color.toString(16).padStart(6, '0') : C.plum;
      return { id, name, kind, color: colorHex };
    })
    .filter(Boolean);
}

function profileAssets(ctx) {
  const charsRaw = ctx.save.get('ownedChars', null);
  // Guarantee at least the equipped character shows (fresh guests own 'ghost').
  const chars = (Array.isArray(charsRaw) && charsRaw.length)
    ? charsRaw
    : [ctx.characters.equippedId()];
  return [
    ...normalize(chars, 'character', ctx),
    ...normalize(ctx.save.get('ownedCosmetics', []), 'cosmetic', ctx),
  ];
}

// ---- trading flows (ALL routed through ctx.pn stubs; nothing real here) ----

// List an owned asset for sale -> pn.marketList(asset)
async function flowList(ctx, s, asset, price) {
  const ok = await ctx.ui.confirm(
    `List "${asset.name}" on the Public Network marketplace for ${price} Units? ` +
    `This is the real-value layer — trades settle in Units (1:1 USDC).`);
  if (s !== session || !panel || !ok) return;
  const res = await ctx.pn.marketList({ id: asset.id, kind: asset.kind, name: asset.name, price });
  if (s !== session || !panel) return;
  ctx.ui.toast(res && res.ok ? `Listed "${asset.name}" for ${price} Units.`
    : (res && res.reason) || 'Listing failed.');
}

// Direct sale of an owned asset id at a fixed price -> pn.marketSell(id, price)
async function flowSell(ctx, s, asset, price) {
  const ok = await ctx.ui.confirm(
    `Sell "${asset.name}" now for ${price} Units on Public Network? Verified transfer, no take-backs.`);
  if (s !== session || !panel || !ok) return;
  const res = await ctx.pn.marketSell(asset.id, price);
  if (s !== session || !panel) return;
  ctx.ui.toast(res && res.ok ? `Sold "${asset.name}" for ${price} Units.`
    : (res && res.reason) || 'Sale failed.');
}

// Buy a marketplace listing -> pn.marketBuy(listingId)
async function flowBuy(ctx, s, listing) {
  const ok = await ctx.ui.confirm(
    `Buy "${listing.name || listing.id}" for ${listing.price} Units? This spends real-value Units on Public Network.`);
  if (s !== session || !panel || !ok) return;
  const res = await ctx.pn.marketBuy(listing.id);
  if (s !== session || !panel) return;
  ctx.ui.toast(res && res.ok ? `Bought "${listing.name || listing.id}".`
    : (res && res.reason) || 'Purchase failed.');
}

// ---- panel sections --------------------------------------------------------

function buildBoundaryBanner() {
  const wrap = el('div',
    `border:1.5px solid ${C.plum};background:#f3eef9;border-radius:10px;padding:12px 14px;margin-bottom:14px;`);
  const top = el('div', 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;');
  top.append(
    el('span', 'font-size:16px;', '🌐'),
    chip('Public Network', C.plum),
    chip('Real-value layer', C.plum),
    chip('13+ · parental gate', C.sub),
  );
  wrap.append(top,
    el('div', `font-size:12.5px;color:${C.sub};line-height:1.45;`,
      'Everything in this panel is Units (1:1 USDC) on Public Network — not Coins. ' +
      'Coins can never be converted back to Units. Trading goes through PN only; it is pending Codex integration.'));
  return wrap;
}

function buildHeader(ctx, s) {
  const wrap = el('div', `display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;`);
  const id = ctx.pn.identity();
  const units = el('span', `font-weight:600;font-size:15px;color:${C.ink};`, 'Units: …');
  const who = el('span', `font-size:13px;color:${C.sub};`, `${id.name}${id.guest ? ' (guest)' : ''}`);
  const linkBtn = ctx.ui.button('Link PN account', async () => {
    const res = await ctx.pn.upgradeToPN();
    if (s !== session || !panel) return;
    ctx.ui.toast(res && res.ok ? 'PN account linked.' : (res && res.reason) || 'Could not link PN account.');
  });
  wrap.append(chip('Balance'), units, who, linkBtn);
  ctx.pn.unitsBalance().then((n) => {
    if (s !== session || !panel) return;
    units.textContent = `Units: ${Number(n || 0).toFixed(2)}`;
  }).catch(() => { if (panel) units.textContent = 'Units: —'; });
  return wrap;
}

function assetCard(ctx, s, asset) {
  const cap = ctx.save.settings.spendCap | 0;
  const card = el('div',
    `border:1px solid ${C.line};border-radius:10px;background:#fff;padding:12px;` +
    `display:flex;flex-direction:column;gap:9px;`);
  const head = el('div', 'display:flex;align-items:center;gap:9px;');
  head.append(
    el('span', `width:26px;height:26px;border-radius:9px;background:${asset.color};border:1px solid ${C.line};flex:0 0 auto;`),
    el('span', `font-weight:600;font-size:14px;color:${C.ink};flex:1;`, asset.name),
    chip(asset.kind, asset.kind === 'character' ? C.sage : C.plum),
  );
  const row = el('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
  const price = el('input',
    `width:84px;padding:9px 10px;border:1px solid ${C.line};border-radius:10px;` +
    `font:600 13px -apple-system,system-ui,sans-serif;color:${C.ink};background:${C.panel};`);
  price.type = 'number'; price.min = '1'; price.step = '1'; price.placeholder = 'Units';
  if (cap > 0) price.max = String(cap);
  const readPrice = () => {
    const p = Math.floor(Number(price.value));
    if (!Number.isFinite(p) || p < 1) { ctx.ui.toast('Enter a price of at least 1 Unit.'); return null; }
    if (cap > 0 && p > cap) { ctx.ui.toast(`Price exceeds your parental spend cap of ${cap} Units.`); return null; }
    return p;
  };
  row.append(
    price,
    ctx.ui.button('List for sale', () => { const p = readPrice(); if (p != null) flowList(ctx, s, asset, p); }),
    ctx.ui.button('Sell now', () => { const p = readPrice(); if (p != null) flowSell(ctx, s, asset, p); }, { primary: true }),
  );
  card.append(head, row);
  return card;
}

function buildMyAssets(ctx, s) {
  const wrap = el('div');
  const assets = profileAssets(ctx);
  if (!assets.length) {
    wrap.append(el('p', `color:${C.sub};`, 'You do not own any collectible assets yet.'));
    return wrap;
  }
  wrap.append(el('p', `font-size:12.5px;color:${C.sub};margin:0 0 10px;`,
    'Your profile is your storefront — owned characters and cosmetics can be listed for Units.'));
  const grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;');
  for (const a of assets) grid.append(assetCard(ctx, s, a));
  wrap.append(grid);
  return wrap;
}

function buildBrowse(ctx, s) {
  const wrap = el('div');
  const status = el('div', `font-size:13px;color:${C.sub};margin:0 0 10px;`,
    'Listings load from Public Network when the marketplace integration lands.');
  const grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;');
  const refresh = ctx.ui.button('Refresh listings', async () => {
    refresh.disabled = true;
    status.textContent = 'Contacting Public Network…';
    // ASSUMPTION (flagged in report): marketList doubles as the listings query
    // until Codex ships a dedicated fetch; ok:true payloads with a `listings`
    // array render real buyable cards below.
    const res = await ctx.pn.marketList({ kind: 'all' }).catch(() => null);
    if (s !== session || !panel) return;
    refresh.disabled = false;
    grid.textContent = '';
    if (res && res.ok && Array.isArray(res.listings) && res.listings.length) {
      status.textContent = `${res.listings.length} listing(s) on Public Network:`;
      for (const l of res.listings) {
        const card = el('div',
          `border:1px solid ${C.line};border-radius:10px;background:#fff;padding:12px;` +
          `display:flex;flex-direction:column;gap:9px;`);
        card.append(
          el('span', `font-weight:600;font-size:14px;color:${C.ink};`, l.name || l.id),
          el('span', `font-size:13px;color:${C.sub};`, `${l.price} Units`),
          ctx.ui.button('Buy', () => flowBuy(ctx, s, l), { primary: true }),
        );
        grid.append(card);
      }
    } else {
      status.textContent = (res && res.reason) ||
        'No marketplace yet — buying will call pn.marketBuy(id) once Public Network trading is live.';
    }
  }, { primary: true });
  wrap.append(status, refresh, el('div', 'height:10px;'), grid);
  return wrap;
}

// ---- panel assembly --------------------------------------------------------

function openPanel(ctx, s) {
  if (s !== session || panel) return;
  panel = ctx.ui.panel({ title: '🏪 Marketplace', onClose: () => { panel = null; } });

  panel.body.append(buildBoundaryBanner(), buildHeader(ctx, s));

  // Tabs: My Assets (list/sell) | Browse (buy)
  const tabRow = el('div', 'display:flex;gap:8px;margin-bottom:12px;');
  const content = el('div');
  const tabMy = ctx.ui.button('My assets', () => select('my'));
  const tabBrowse = ctx.ui.button('Browse', () => select('browse'));
  tabRow.append(tabMy, tabBrowse);
  function select(which) {
    tabMy.classList.toggle('primary', which === 'my');
    tabBrowse.classList.toggle('primary', which === 'browse');
    content.textContent = '';
    content.append(which === 'my' ? buildMyAssets(ctx, s) : buildBrowse(ctx, s));
  }
  panel.body.append(tabRow, content);
  select('my');
}

registerSystem('market', {
  open(ctx) {
    if (panel) return;
    const s = session; // capture; close() bumps session to invalidate pending gates
    (async () => {
      // Gate 1 — age attestation (13+), persisted once per profile.
      if (!ctx.save.get(SAVE_AGE_OK, false)) {
        const ok = await ctx.ui.confirm(
          'The Marketplace trades real-value collectibles for Units on Public Network. ' +
          'It is for players aged 13 and older. Are you 13 or older?');
        if (s !== session) return;
        if (!ok) { ctx.ui.toast('The Marketplace is 13+ only.'); return; }
        ctx.save.set(SAVE_AGE_OK, true);
      }
      // Gate 2 — parental confirmation every session when the parental gate is on.
      if (ctx.save.settings.parentalGate) {
        const ok = await ctx.ui.confirm(
          'Parent or guardian: the Marketplace is the real-value (Units) layer on Public Network. ' +
          'Confirm this session may open it.');
        if (s !== session) return;
        if (!ok) { ctx.ui.toast('A parent or guardian must confirm to open the Marketplace.'); return; }
      }
      openPanel(ctx, s);
    })();
  },
  close() {
    session++; // invalidate any in-flight confirms / pn stub promises
    if (panel) { panel.close(); panel = null; }
  },
});
