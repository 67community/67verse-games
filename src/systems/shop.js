// shop.js — 67VERSE Shop system (spec §9).
//   • Coins wallet display (live, from ctx.save / bus 'coins-earned').
//   • Earned blind boxes purchasable ONLY with Coins (randomness is earned by
//     playing — never paid). Playful reveal animation. Odds shown up front.
//   • Direct-buy premium characters/cosmetics priced in Units via ctx.pn stubs.
//   • One-way rail Units -> Coins (via pn.buyCoinsWithUnits). Coins NEVER
//     convert back to Units — there is deliberately no such UI or code path.
//   • save.settings.spendCap gates every real-money (Units) action with
//     ctx.ui.confirm + a per-day cumulative cap tracked in the 'wallet' key.
//   • Purchases write 'ownedCosmetics' / 'ownedChars' (arrays of id strings)
//     and emit bus 'shop-purchase'. Coin box purchases use save.commitCoins so
//     debit, ownership, duplicate rebate, event, and reveal stay coherent.
//   • Cosmetics/collectibles only — nothing sold gives a gameplay advantage.
//
// Contract gaps flagged for integration (see report):
//   - pn has no "spend Units" stub yet; chargeUnits() feature-detects
//     ctx.pn.spendUnits / ctx.pn.purchaseItem and otherwise reports the PN
//     checkout as pending (the local fake has a 0-Units balance anyway).
//   - Coin box spends are device-local staged writes, not backend transactions.

import { registerSystem } from '../core/registry.js';

// ---------------------------------------------------------------- catalog --
// All original 67VERSE designs — no third-party IP. Cosmetic/fun only.

const RARITY = {
  common: { label: 'Common', color: '#9a9aa2', bg: '#f5f5f7' },
  rare:   { label: 'Rare',   color: '#5a9c7a', bg: '#e9f3ec' },
  epic:   { label: 'Epic',   color: '#8a6fb0', bg: '#f0ebf7' },
};

const COSMETICS = {
  'cap-sunny':     { name: 'Sunny Cap',     emoji: '🧢', rarity: 'common', slot: 'hat'   },
  'shades-cool':   { name: 'Cool Shades',   emoji: '🕶️', rarity: 'common', slot: 'face'  },
  'trail-bubbles': { name: 'Bubble Trail',  emoji: '🫧', rarity: 'common', slot: 'trail' },
  'backpack-bean': { name: 'Bean Backpack', emoji: '🎒', rarity: 'common', slot: 'back'  },
  'hat-sprout':    { name: 'Sprout Hat',    emoji: '🌱', rarity: 'rare',   slot: 'hat'   },
  'trail-stars':   { name: 'Star Trail',    emoji: '✨', rarity: 'rare',   slot: 'trail' },
  'skate-flame':   { name: 'Flame Board',   emoji: '🛹', rarity: 'rare',   slot: 'gear'  },
  'wings-paper':   { name: 'Paper Wings',   emoji: '🪽', rarity: 'epic',   slot: 'back'  },
  'trail-rainbow': { name: 'Rainbow Trail', emoji: '🌈', rarity: 'epic',   slot: 'trail' },
  'crown-gold':    { name: 'Golden Crown',  emoji: '👑', rarity: 'epic',   slot: 'hat'   },
};

// Earned blind boxes — Coins only. Pools are weighted; odds are rendered to
// the player before purchase (no hidden gacha math).
const BOXES = [
  {
    id: 'box-sunny', name: 'Sunny Box', emoji: '🎁', price: 250,
    blurb: 'A cheerful little surprise. Every look, no luck needed twice!',
    pool: [
      { id: 'cap-sunny', w: 30 },
      { id: 'shades-cool', w: 25 },
      { id: 'trail-bubbles', w: 25 },
      { id: 'backpack-bean', w: 20 },
    ],
  },
  {
    id: 'box-star', name: 'Star Box', emoji: '🌟', price: 600,
    blurb: 'Rarer treats — you might even meet a new pal!',
    pool: [
      { id: 'hat-sprout', w: 22 },
      { id: 'trail-stars', w: 22 },
      { id: 'skate-flame', w: 16 },
      { id: 'wings-paper', w: 10 },
      { id: 'char:cat', w: 15 },
      { id: 'char:shark', w: 15 },
    ],
  },
];

// Premium direct-buy — Units (real-money rail via Public Network). You always
// see exactly what you get. `char:` ids resolve against characters.ROSTER.
const DIRECT = [
  { key: 'char:ninja', priceUnits: 5 },
  { key: 'char:robot', priceUnits: 4 },
  { key: 'crown-gold', priceUnits: 3 },
  { key: 'trail-rainbow', priceUnits: 2 },
];

// Units -> Coins packs (one-way, 1:100 per the pn stub). Coins never go back.
const COIN_PACKS = [1, 5, 10];

const DUP_REFUND = 0.4; // duplicate blind-box pulls refund 40% of box price

// ------------------------------------------------------------- styles -----
const CSS = `
.uv-shop-wallet{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.uv-shop-wallet .uv-chip{font-size:13px;padding:8px 14px;border-radius:10px}
.uv-shop-note{font-size:12px;color:#9a9aa2;background:#f5f5f7;border:1px solid #e5e5ea;border-radius:10px;padding:9px 12px;margin:0 0 12px;line-height:1.45}
.uv-shop-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.uv-shop-tab{font:500 13px -apple-system,system-ui,sans-serif;background:#f5f5f7;border:1px solid #e5e5ea;border-radius:999px;padding:9px 16px;cursor:pointer;color:#9a9aa2}
.uv-shop-tab.on{background:#060c21;color:#ffffff;border-color:#060c21}
.uv-shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.uv-shop-card{border:1px solid #e5e5ea;border-radius:10px;background:#fff;padding:14px 12px;display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center}
.uv-shop-card .big{font-size:40px;line-height:1}
.uv-shop-card .nm{font-weight:600;font-size:14px}
.uv-shop-card .blurb{font-size:11.5px;color:#9a9aa2;line-height:1.35}
.uv-shop-card .odds{font-size:10.5px;color:#9a9aa2;line-height:1.5;border-top:1px dashed #e5e5ea;padding-top:6px;width:100%}
.uv-shop-rar{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:3px 9px;border-radius:7px}
.uv-shop-card.owned{opacity:.65}
.uv-shop-card .ownedtag{font-size:11px;font-weight:600;color:#5a9c7a}
.uv-shop-reveal{display:flex;flex-direction:column;align-items:center;gap:12px;padding:26px 10px;text-align:center}
.uv-shop-box{font-size:84px;line-height:1;animation:uvshopshake .9s ease-in-out infinite}
@keyframes uvshopshake{0%,100%{transform:rotate(-7deg) scale(1)}25%{transform:rotate(7deg) scale(1.06)}50%{transform:rotate(-5deg) scale(1.03)}75%{transform:rotate(6deg) scale(1.08)}}
.uv-shop-prize{font-size:84px;line-height:1;animation:uvshoppop .55s cubic-bezier(.2,1.6,.4,1) both}
@keyframes uvshoppop{0%{transform:scale(0) rotate(-30deg)}100%{transform:scale(1) rotate(0)}}
.uv-shop-confetti{position:absolute;font-size:22px;pointer-events:none;animation:uvshopconf 1.15s ease-out both}
@keyframes uvshopconf{0%{transform:translate(0,0) scale(.4);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1.1) rotate(var(--rot));opacity:0}}
.uv-shop-revealwrap{position:relative;display:flex;justify-content:center}
.uv-shop-sub{font-size:12.5px;color:#9a9aa2}
`;

let cssInjected = false;
function injectCss() {
  if (cssInjected) return; cssInjected = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
}

// ------------------------------------------------------------ helpers -----
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Real-money spend tracking lives in the documented 'wallet' save key:
//   wallet = { day: 'YYYY-MM-DD', spentUnits: number }
function unitsSpentToday(save) {
  const w = save.get('wallet', null);
  if (!w || w.day !== todayKey()) return 0;
  return w.spentUnits || 0;
}
function recordUnitsSpend(save, units) {
  save.set('wallet', { day: todayKey(), spentUnits: unitsSpentToday(save) + units });
}

function ownedCosmetics(save) {
  const owned = save.get('ownedCosmetics', []);
  return Array.isArray(owned) ? owned : [];
}
function ownedChars(save) {
  const owned = save.get('ownedChars', ['ghost']);
  return Array.isArray(owned) ? owned : ['ghost'];
}
function isOwned(save, key) {
  return key.startsWith('char:')
    ? ownedChars(save).includes(key.slice(5))
    : ownedCosmetics(save).includes(key);
}
export function grantShopItem(save, key) {
  if (key.startsWith('char:')) {
    const id = key.slice(5);
    const cur = ownedChars(save);
    return cur.includes(id) || save.set('ownedChars', [...cur, id]);
  } else {
    const cur = ownedCosmetics(save);
    return cur.includes(key) || save.set('ownedCosmetics', [...cur, key]);
  }
}

export function commitCoinShopPurchase({ save, bus }, box, prizeKey) {
  if (
    !save
    || !bus
    || !box
    || typeof box.id !== 'string'
    || !Number.isFinite(box.price)
    || box.price <= 0
    || typeof prizeKey !== 'string'
    || !prizeKey
  ) {
    return { ok: false, reason: 'invalid-purchase' };
  }
  if (save.coins < box.price) return { ok: false, reason: 'insufficient-coins' };

  const duplicate = isOwned(save, prizeKey);
  const refund = duplicate ? Math.max(1, Math.round(box.price * DUP_REFUND)) : 0;
  const netCost = box.price - refund;
  const total = save.commitCoins(-netCost, `shop:${box.id}`, () => (
    duplicate || grantShopItem(save, prizeKey)
  ));
  if (!Number.isFinite(total)) {
    return {
      ok: false,
      reason: 'storage-failed',
      duplicate,
      refund,
      netCost,
    };
  }

  const event = {
    kind: 'blindbox',
    itemId: box.id,
    prizeId: prizeKey,
    currency: 'coins',
    amount: box.price,
    refund,
    netCost,
  };
  bus.emit('shop-purchase', event);
  return {
    ok: true,
    duplicate,
    refund,
    netCost,
    total,
    event,
  };
}

function resolveItem(ctx, key) {
  if (key.startsWith('char:')) {
    const id = key.slice(5);
    const def = ctx.characters.ROSTER.find((r) => r.id === id);
    return { key, type: 'character', name: def ? def.name : id, emoji: '🧸', rarity: 'epic' };
  }
  const c = COSMETICS[key] || { name: key, emoji: '🎀', rarity: 'common' };
  return { key, type: 'cosmetic', name: c.name, emoji: c.emoji, rarity: c.rarity };
}

function rarityChip(rarity) {
  const r = RARITY[rarity] || RARITY.common;
  const s = document.createElement('span');
  s.className = 'uv-shop-rar';
  s.style.background = r.bg;
  s.style.color = r.color;
  s.textContent = r.label;
  return s;
}

function pickWeighted(pool) {
  const total = pool.reduce((a, p) => a + p.w, 0);
  let roll = Math.random() * total;
  for (const p of pool) { roll -= p.w; if (roll <= 0) return p.id; }
  return pool[pool.length - 1].id;
}

function oddsText(ctx, pool) {
  const total = pool.reduce((a, p) => a + p.w, 0);
  return pool
    .map((p) => `${resolveItem(ctx, p.id).emoji} ${Math.round((p.w / total) * 100)}%`)
    .join('  ·  ');
}

// Attempt to charge Units through the PN boundary. The real debit API is
// Codex-owned; we feature-detect it so this module works unchanged once it
// lands, and degrades to a clear "pending" message with the local fake.
async function chargeUnits(ctx, units, label) {
  if (typeof ctx.pn.spendUnits === 'function') return ctx.pn.spendUnits(units, label);
  if (typeof ctx.pn.purchaseItem === 'function') return ctx.pn.purchaseItem(label, units);
  const bal = await ctx.pn.unitsBalance();
  if (bal < units) return { ok: false, reason: 'Not enough Units — connect a Public Network wallet (parent-approved) to get Units.' };
  return { ok: false, reason: 'PN checkout is still being connected. Hang tight!' };
}

// spendCap gate for every real-money (Units) action. Returns true if the
// action may proceed (after any needed confirm), false if blocked/cancelled.
async function gateUnitsSpend(ctx, units, what) {
  const { save, ui } = ctx;
  const cap = save.settings.spendCap | 0;
  if (cap > 0) {
    const spent = unitsSpentToday(save);
    if (spent + units > cap) {
      ui.toast(`💠 Daily spend cap is ${cap} Units — a parent can change this in Settings.`);
      return false;
    }
    return ui.confirm(
      `${what} costs ${units} Units (real money via Public Network).\n` +
      `Today: ${spent} + ${units} of your ${cap}-Unit daily cap. ` +
      (save.settings.parentalGate ? 'A parent should approve this. ' : '') +
      `Everything here is for looks & fun only — no power-ups.`
    );
  }
  return ui.confirm(
    `${what} costs ${units} Units (real money via Public Network). ` +
    (save.settings.parentalGate ? 'A parent should approve this. ' : '') +
    `It's just for looks & fun — no gameplay advantages, ever.`
  );
}

// -------------------------------------------------------------- module ----
let panel = null;
let teardownFns = [];

function teardown() {
  for (const fn of teardownFns) { try { fn(); } catch { /* noop */ } }
  teardownFns = [];
}

registerSystem('shop', {
  open(ctx) {
    if (panel) return;
    injectCss();
    const { ui, save, bus } = ctx;
    let activeTab = 'boxes';
    let unitsBal = null;
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    teardownFns.push(() => { for (const t of timers) clearTimeout(t); timers.clear(); });

    panel = ui.panel({
      title: '🛒 Shop',
      onClose: () => { teardown(); panel = null; },
    });
    const body = panel.body;

    // -- wallet header (live) -------------------------------------------
    const walletRow = document.createElement('div');
    walletRow.className = 'uv-shop-wallet';
    const coinsChip = document.createElement('span');
    coinsChip.className = 'uv-chip';
    const unitsChip = document.createElement('span');
    unitsChip.className = 'uv-chip';
    const capChip = document.createElement('span');
    capChip.className = 'uv-chip';
    walletRow.append(coinsChip, unitsChip, capChip);
    body.appendChild(walletRow);

    function renderWallet() {
      coinsChip.textContent = `🪙 ${save.coins} Coins`;
      unitsChip.textContent = unitsBal == null ? '💠 Units: …' : `💠 ${unitsBal} Units`;
      const cap = save.settings.spendCap | 0;
      capChip.textContent = cap > 0 ? `🛡️ Cap ${unitsSpentToday(save)}/${cap} Units today` : '🛡️ No spend cap set';
    }
    renderWallet();
    ctx.pn.unitsBalance().then((b) => { unitsBal = b; renderWallet(); });
    const offCoins = bus.on('coins-earned', renderWallet);
    const offSettings = bus.on('settings-changed', renderWallet);
    teardownFns.push(offCoins, offSettings);

    // -- kid-safe banner --------------------------------------------------
    const note = document.createElement('p');
    note.className = 'uv-shop-note';
    note.textContent = '🌈 Everything in the Shop is for looks & collecting only — no power-ups, no advantages. Coins are earned by playing and can never be turned back into real money.';
    body.appendChild(note);

    // -- tabs ---------------------------------------------------------------
    const tabsRow = document.createElement('div');
    tabsRow.className = 'uv-shop-tabs';
    const tabDefs = [
      ['boxes', '🎁 Blind Boxes (Coins)'],
      ['direct', '💠 Premium (Units)'],
      ['coins', '🪙 Get Coins'],
    ];
    const tabBtns = {};
    for (const [id, label] of tabDefs) {
      const b = document.createElement('button');
      b.className = 'uv-shop-tab';
      b.textContent = label;
      b.onclick = () => { activeTab = id; renderTab(); };
      tabBtns[id] = b;
      tabsRow.appendChild(b);
    }
    body.appendChild(tabsRow);

    const view = document.createElement('div');
    body.appendChild(view);

    function renderTab() {
      for (const [id, b] of Object.entries(tabBtns)) b.classList.toggle('on', id === activeTab);
      view.textContent = '';
      if (activeTab === 'boxes') renderBoxes();
      else if (activeTab === 'direct') renderDirect();
      else renderCoins();
    }

    // -- tab: blind boxes (Coins only) --------------------------------------
    function renderBoxes() {
      const grid = document.createElement('div');
      grid.className = 'uv-shop-grid';
      for (const box of BOXES) {
        const card = document.createElement('div');
        card.className = 'uv-shop-card';
        const big = document.createElement('div'); big.className = 'big'; big.textContent = box.emoji;
        const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = box.name;
        const blurb = document.createElement('div'); blurb.className = 'blurb'; blurb.textContent = box.blurb;
        const odds = document.createElement('div'); odds.className = 'odds';
        odds.textContent = 'Inside: ' + oddsText(ctx, box.pool);
        const buy = ui.button(`Open · ${box.price} 🪙`, () => purchaseBox(
          box,
          `Open a ${box.name} for ${box.price} Coins? It contains one random earned item from the list shown. ` +
            `Coins are earned by playing — this is never a real-money purchase.`,
        ));
        if (save.coins < box.price) buy.disabled = true;
        card.append(big, nm, rarityChip('rare'), blurb, odds, buy);
        grid.appendChild(card);
      }
      const hint = document.createElement('p');
      hint.className = 'uv-shop-note';
      hint.style.marginTop = '12px';
      hint.textContent = '🎲 Blind boxes are bought ONLY with Coins you earn by playing. Duplicates turn back into Coins (40% refund). Odds are always shown up front.';
      view.append(grid, hint);
    }

    // -- blind-box reveal animation -----------------------------------------
    async function purchaseBox(box, confirmation) {
      if (save.coins < box.price) {
        ui.toast('Not enough Coins — play games & quests to earn more! 🪙');
        return;
      }
      const ok = await ui.confirm(confirmation);
      if (!ok || !panel) return;
      const prizeKey = pickWeighted(box.pool);
      const outcome = commitCoinShopPurchase(ctx, box, prizeKey);
      if (!outcome.ok) {
        ui.toast(outcome.reason === 'insufficient-coins'
          ? 'Not enough Coins — play games & quests to earn more! 🪙'
          : 'This box could not be saved on this device. No Coins were spent and no item was granted.');
        return;
      }
      playReveal(box, prizeKey, outcome);
    }

    function playReveal(box, prizeKey, outcome) {
      view.textContent = '';
      for (const t of timers) clearTimeout(t); timers.clear();
      const wrap = document.createElement('div');
      wrap.className = 'uv-shop-reveal';
      const boxEl = document.createElement('div');
      boxEl.className = 'uv-shop-box';
      boxEl.textContent = box.emoji;
      const sub = document.createElement('div');
      sub.className = 'uv-shop-sub';
      sub.textContent = 'Opening…';
      wrap.append(boxEl, sub);
      view.appendChild(wrap);

      const prize = resolveItem(ctx, prizeKey);
      const { duplicate, refund } = outcome;

      later(() => {
        if (!panel) return;
        wrap.textContent = '';
        const stage = document.createElement('div');
        stage.className = 'uv-shop-revealwrap';
        const prizeEl = document.createElement('div');
        prizeEl.className = 'uv-shop-prize';
        prizeEl.textContent = prize.emoji;
        stage.appendChild(prizeEl);
        // confetti burst (pure CSS, removed with the panel)
        const confetti = ['🎉', '⭐', '🟡', '🟠', '🟣', '✨'];
        for (let i = 0; i < 10; i++) {
          const c = document.createElement('span');
          c.className = 'uv-shop-confetti';
          c.textContent = confetti[i % confetti.length];
          const ang = (i / 10) * Math.PI * 2;
          c.style.setProperty('--dx', `${Math.cos(ang) * 110}px`);
          c.style.setProperty('--dy', `${Math.sin(ang) * 90 - 40}px`);
          c.style.setProperty('--rot', `${(i % 2 ? 1 : -1) * 160}deg`);
          c.style.left = '50%'; c.style.top = '40%';
          stage.appendChild(c);
        }
        const nm = document.createElement('div');
        nm.className = 'nm';
        nm.style.fontSize = '19px';
        nm.style.fontWeight = '800';
        nm.textContent = duplicate ? `${prize.name} (already yours!)` : prize.name;
        const sub2 = document.createElement('div');
        sub2.className = 'uv-shop-sub';
        sub2.textContent = duplicate
          ? `Duplicate → +${refund} 🪙 back!`
          : prize.type === 'character'
            ? 'New pal added to your Characters! 🧸'
            : 'Added to your Closet! Check the Cosmetics panel. 🎀';
        const row = document.createElement('div');
        row.className = 'uv-row';
        row.style.justifyContent = 'center';
        const again = ui.button(`Open another · ${box.price} 🪙`, () => purchaseBox(
          box,
          `Open another ${box.name} for ${box.price} Coins?`,
        ));
        if (save.coins < box.price) again.disabled = true;
        const back = ui.button('Back to Shop', () => renderTab(), { primary: true });
        row.append(again, back);
        wrap.append(stage, nm, rarityChip(prize.rarity), sub2, row);
      }, 1100);
    }

    // -- tab: direct buy (Units) ----------------------------------------------
    function renderDirect() {
      const grid = document.createElement('div');
      grid.className = 'uv-shop-grid';
      for (const entry of DIRECT) {
        const item = resolveItem(ctx, entry.key);
        const owned = isOwned(save, entry.key);
        const card = document.createElement('div');
        card.className = 'uv-shop-card' + (owned ? ' owned' : '');
        const big = document.createElement('div'); big.className = 'big'; big.textContent = item.emoji;
        const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = item.name;
        const kind = document.createElement('div'); kind.className = 'blurb';
        kind.textContent = item.type === 'character' ? 'Collectible character' : `Cosmetic · ${(COSMETICS[entry.key] || {}).slot || 'style'}`;
        const buy = ui.button(owned ? 'Owned ✓' : `Buy · ${entry.priceUnits} 💠`, async () => {
          if (owned) return;
          const allowed = await gateUnitsSpend(ctx, entry.priceUnits, item.name);
          if (!allowed || !panel) return;
          const res = await chargeUnits(ctx, entry.priceUnits, entry.key);
          if (!res || !res.ok) {
            ui.toast('💠 ' + ((res && res.reason) || 'Units checkout unavailable right now.'));
            return;
          }
          recordUnitsSpend(save, entry.priceUnits);
          grantShopItem(save, entry.key);
          bus.emit('shop-purchase', { kind: 'direct', itemId: entry.key, itemType: item.type, currency: 'units', amount: entry.priceUnits });
          ui.toast(`${item.emoji} ${item.name} is yours!`);
          renderWallet();
          renderTab();
        });
        if (owned) buy.disabled = true;
        card.append(big, nm, rarityChip(item.rarity), kind);
        if (owned) {
          const tag = document.createElement('div'); tag.className = 'ownedtag'; tag.textContent = 'In your collection';
          card.appendChild(tag);
        }
        card.appendChild(buy);
        grid.appendChild(card);
      }
      const hint = document.createElement('p');
      hint.className = 'uv-shop-note';
      hint.style.marginTop = '12px';
      hint.textContent = '💠 Units are Public Network\'s real-money rail (parent-approved, age-gated). Direct buys always show exactly what you get — never random. Coins can never be turned back into Units.';
      view.append(grid, hint);
    }

    // -- tab: get coins (one-way Units -> Coins) --------------------------------
    function renderCoins() {
      const grid = document.createElement('div');
      grid.className = 'uv-shop-grid';
      for (const units of COIN_PACKS) {
        const coins = units * 100;
        const card = document.createElement('div');
        card.className = 'uv-shop-card';
        const big = document.createElement('div'); big.className = 'big'; big.textContent = '🪙';
        const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = `${coins} Coins`;
        const blurb = document.createElement('div'); blurb.className = 'blurb';
        blurb.textContent = 'One-way swap: Units become play Coins. Coins can never go back.';
        const buy = ui.button(`${units} 💠 → ${coins} 🪙`, async () => {
          const allowed = await gateUnitsSpend(ctx, units, `${coins} Coins`);
          if (!allowed || !panel) return;
          const res = await ctx.pn.buyCoinsWithUnits(units);
          if (!res || !res.ok) {
            ui.toast('💠 ' + ((res && res.reason) || 'Conversion unavailable right now.'));
            return;
          }
          recordUnitsSpend(save, units);
          bus.emit('shop-purchase', { kind: 'conversion', currency: 'units', amount: units, coins: res.coins });
          ui.toast(`🪙 +${res.coins} Coins! Have fun!`);
          renderWallet();
        });
        card.append(big, nm, blurb, buy);
        grid.appendChild(card);
      }
      const earn = document.createElement('p');
      earn.className = 'uv-shop-note';
      earn.style.marginTop = '12px';
      earn.textContent = '🎮 Free players: you never need Units! Play mini-games and finish daily quests to earn Coins for everything in the Coins shop.';
      view.append(grid, earn);
    }

    renderTab();
  },

  close() {
    if (panel) { panel.close(); panel = null; } // onClose -> teardown()
    else teardown();
  },
});
