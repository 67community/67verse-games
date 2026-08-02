// season.js — Season Pass (spec §9/§13): free + premium tracks, 8-week seasons.
// XP accrues from ctx.bus events ('game-result', 'coins-earned', 'emote',
// 'ugc-play', 'ugc-like', plus 'season-xp' emitted by quests.js). State lives in
// the 'season' save key. Premium is a Units purchase routed exclusively through
// ctx.pn stubs — no backend, no pay-to-win: premium rewards are cosmetics and
// XP boosts only. Bus listeners attach once via the 'boot' hook.
import { registerSystem, registerHook } from '../core/registry.js';
import { localGameResultProgress } from '../core/game-result.js';
import {
  isPlainRecord,
  LOCAL_SAVE_SCHEMA_VERSION,
  nonNegativeInteger,
  uniqueBoundedIntegers,
  uniqueStrings,
} from '../core/local-save-schema.js';

const DAY_MS = 86400000;
const SEASON_LEN_MS = 8 * 7 * DAY_MS;      // spec: seasons every 6-8 weeks
const SEASON_EPOCH = Date.UTC(2025, 0, 6); // a Monday; seasons roll every 8 weeks from here
const MAX_LEVEL = 30;
const PREMIUM_PRICE_UNITS = 5;

function seasonInfo(now = Date.now()) {
  const idx = Math.max(0, Math.floor((now - SEASON_EPOCH) / SEASON_LEN_MS));
  const start = SEASON_EPOCH + idx * SEASON_LEN_MS;
  return { id: `s${idx + 1}`, name: `Season ${idx + 1}`, start, end: start + SEASON_LEN_MS };
}
const xpNeed = (l) => 100 + (l - 1) * 25; // XP to advance from level l to l+1
function levelFromXp(xp) {
  let l = 1, rem = Math.max(0, xp | 0);
  while (l < MAX_LEVEL && rem >= xpNeed(l)) { rem -= xpNeed(l); l++; }
  return l;
}
function levelProgress(xp) {
  let l = 1, rem = Math.max(0, xp | 0);
  while (l < MAX_LEVEL && rem >= xpNeed(l)) { rem -= xpNeed(l); l++; }
  const maxed = l >= MAX_LEVEL;
  return { level: l, into: maxed ? 0 : rem, need: maxed ? 0 : xpNeed(l), maxed };
}

/* ---------------- reward track ----------------
   Free track: Coins every level + a cosmetic at levels 10/20/30.
   Premium track: cosmetics + XP boosts ONLY (no pay-to-win, no Coins). */
const COSMETIC_NAMES = [
  'Sunny Helmet', 'Skate Cape', 'Star Shades', 'Bubble Backpack', 'Rocket Sneakers',
  'Candy Hoodie', 'Comet Trail', 'Plush Crown', 'Wave Board Skin', 'Glow Bracelet',
];
function cosmeticReward(track, level) {
  const name = COSMETIC_NAMES[(level - 1) % COSMETIC_NAMES.length];
  return { type: 'cosmetic', id: `season-${track}-${level}`, label: name };
}
function rewardsFor(level) {
  const free = level % 10 === 0
    ? cosmeticReward('free', level)
    : { type: 'coins', amount: 40 + 10 * level, label: `${40 + 10 * level} Coins` };
  let premium;
  if (level === 8) premium = { type: 'boost', pct: 10, label: '+10% Season XP (rest of season)' };
  else if (level === 16) premium = { type: 'boost', pct: 15, label: '+15% Season XP (rest of season)' };
  else if (level === 24) premium = { type: 'boost', pct: 20, label: '+20% Season XP (rest of season)' };
  else premium = cosmeticReward('premium', level);
  return { free, premium };
}

/* ---------------- state (save key: 'season') ---------------- */
export function recoverSeasonState(raw, { now = Date.now() } = {}) {
  const si = seasonInfo(now);
  const source = isPlainRecord(raw) && raw.id === si.id ? raw : {};
  const state = {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    id: si.id,
    xp: nonNegativeInteger(source.xp),
    premium: source.premium === true,
    boostPct: nonNegativeInteger(source.boostPct, 0, 45),
    claimedFree: uniqueBoundedIntegers(source.claimedFree, 1, MAX_LEVEL),
    claimedPrem: uniqueBoundedIntegers(source.claimedPrem, 1, MAX_LEVEL),
    granted: uniqueStrings(source.granted),
  };
  let recovered = true;
  try { recovered = JSON.stringify(raw) !== JSON.stringify(state); } catch {}
  return { state, recovered };
}

function getState(save) {
  const recovery = recoverSeasonState(save.get('season', null));
  if (recovery.recovered) save.set('season', recovery.state);
  return recovery.state;
}

/* ---------------- XP accrual ---------------- */
const XP_MAP = {
  'game-result': (d) => {
    const result = localGameResultProgress(d);
    return result.play
      ? 20 + Math.min(30, Math.floor(result.score / 50)) + result.firstPlace * 15
      : 0;
  },
  'coins-earned': (d) => Math.min(25, Math.floor(((d && d.amount) || 0) / 10)),
  'emote': () => 2,
  'ugc-play': () => 15,
  'ugc-like': () => 5,
  'season-xp': (d) => Math.max(0, (d && d.amount) || 0), // quest payouts
};
function grantXp(ctx, base, why) {
  if (!base || base <= 0) return false;
  const st = getState(ctx.save);
  const before = levelFromXp(st.xp);
  const gain = Math.round(base * (1 + (st.boostPct || 0) / 100));
  if (gain <= 0) return false;
  st.xp += gain;
  if (!ctx.save.set('season', st)) return false;
  ctx.bus.emit('season-xp-gained', { amount: gain, why, total: st.xp });
  const after = levelFromXp(st.xp);
  if (after > before) {
    ctx.bus.emit('season-levelup', { level: after });
    ctx.ui.toast(`⭐ Season level ${after}! New rewards to claim.`);
  }
  return true;
}

/* ---------------- reward claiming ---------------- */
function claimFailure(ctx) {
  ctx.ui.toast('Season reward could not be saved on this device. Nothing was claimed.');
  return false;
}

export function claimSeasonReward(ctx, level, track) {
  const st = getState(ctx.save);
  const arr = track === 'free' ? st.claimedFree : st.claimedPrem;
  if (arr.includes(level)) return false;
  if (track === 'premium' && !st.premium) return false;
  if (levelFromXp(st.xp) < level) return false;
  const r = rewardsFor(level)[track];
  if (r.type === 'coins') {
    const total = ctx.save.commitCoins(r.amount, `season:${st.id}:lv${level}`, () => {
      arr.push(level);
      return ctx.save.set('season', st);
    });
    if (!Number.isFinite(total)) return claimFailure(ctx);
  } else if (r.type === 'boost') {
    arr.push(level);
    st.boostPct = (st.boostPct || 0) + r.pct;
    if (!ctx.save.set('season', st)) return claimFailure(ctx);
    ctx.ui.toast(`Season XP boost +${r.pct}% active for the rest of the season!`);
  } else if (r.type === 'cosmetic') {
    const owned = ctx.save.get('ownedCosmetics', []);
    const priorOwned = Array.isArray(owned) ? [...owned] : [];
    const ownershipChanged = !priorOwned.includes(r.id);
    if (ownershipChanged && !ctx.save.set('ownedCosmetics', [...priorOwned, r.id])) {
      return claimFailure(ctx);
    }
    arr.push(level);
    if (!st.granted.includes(r.id)) st.granted.push(r.id);
    if (!ctx.save.set('season', st)) {
      if (ownershipChanged) ctx.save.set('ownedCosmetics', priorOwned);
      return claimFailure(ctx);
    }
    ctx.bus.emit('cosmetic-granted', { id: r.id, via: 'season' });
    ctx.ui.toast(`Unlocked cosmetic: ${r.label}`);
  }
  ctx.bus.emit('season-reward', { level, track, reward: r });
  return true;
}

/* ---------------- premium unlock (Units via ctx.pn stubs ONLY) ---------------- */
async function unlockPremium(ctx, refresh) {
  const ok = await ctx.ui.confirm(
    `Premium Pass costs ${PREMIUM_PRICE_UNITS} Units via Public Network. ` +
    `Premium rewards are cosmetics and XP boosts only — never gameplay power. Continue?`
  );
  if (!ok) return;
  const me = ctx.pn.identity();
  if (me.guest) {
    const up = await ctx.pn.upgradeToPN();
    ctx.ui.toast((up && up.reason) || 'A Public Network account is required for purchases.');
    return;
  }
  const bal = await ctx.pn.unitsBalance();
  if (typeof ctx.pn.buySeasonPass === 'function') { // future real PN stub
    const res = await ctx.pn.buySeasonPass(PREMIUM_PRICE_UNITS);
    if (res && res.ok) {
      const st = getState(ctx.save);
      st.premium = true;
      ctx.save.set('season', st);
      ctx.ui.toast('Premium Pass unlocked! ⭐');
      refresh();
    } else {
      ctx.ui.toast((res && res.reason) || 'Purchase failed.');
    }
  } else {
    ctx.ui.toast(`PN season-pass purchase integration pending (Codex). Balance: ${bal} Units.`);
  }
}

/* ---------------- panel UI ---------------- */
function el(tag, styles, text) {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (text != null) e.textContent = text;
  return e;
}
function rewardCell(ctx, st, level, track, rerender) {
  const r = rewardsFor(level)[track];
  const reached = levelFromXp(st.xp) >= level;
  const claimedArr = track === 'free' ? st.claimedFree : st.claimedPrem;
  const claimed = claimedArr.includes(level);
  const lockedPrem = track === 'premium' && !st.premium;
  const cell = el('div', {
    flex: '1', minWidth: '0', padding: '8px 10px', borderRadius: '12px',
    border: `1px solid ${track === 'premium' ? '#0A84FF' : '#e5e5ea'}`,
    background: claimed ? '#f5f5f7' : track === 'premium' ? '#fdf6e3' : '#fffdf9',
    opacity: reached || claimed ? '1' : '0.55',
  });
  const tag = el('div', {
    fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '.04em',
    color: track === 'premium' ? '#b8860b' : '#9a9aa2',
  }, track === 'premium' ? '⭐ Premium' : 'Free');
  cell.appendChild(tag);
  const icon = r.type === 'coins' ? '🪙' : r.type === 'boost' ? '⚡' : '🎁';
  cell.appendChild(el('div', { fontSize: '13px', fontWeight: '700', margin: '3px 0 6px' }, `${icon} ${r.label}`));
  if (claimed) {
    cell.appendChild(el('div', { fontSize: '12px', fontWeight: '800', color: '#5a9c7a' }, '✓ Claimed'));
  } else if (lockedPrem) {
    cell.appendChild(el('div', { fontSize: '12px', color: '#9a9aa2' }, '🔒 Premium'));
  } else {
    const b = ctx.ui.button('Claim', () => {
      if (claimSeasonReward(ctx, level, track)) rerender();
    }, { primary: reached });
    b.disabled = !reached;
    b.style.padding = '7px 14px';
    cell.appendChild(b);
  }
  return cell;
}

let panel = null;
let unsubs = [];
function teardown() {
  for (const u of unsubs) { try { u(); } catch {} }
  unsubs = [];
}

registerSystem('season', {
  open(ctx) {
    if (panel) return;
    panel = ctx.ui.panel({
      title: '⭐ Season Pass',
      onClose: () => { teardown(); panel = null; },
    });

    const render = () => {
      const st = getState(ctx.save);
      const si = seasonInfo();
      const prog = levelProgress(st.xp);
      const daysLeft = Math.max(0, Math.ceil((si.end - Date.now()) / DAY_MS));
      const body = panel.body;
      body.textContent = '';

      // Header: season identity, level, XP bar, premium status.
      const head = el('div', {
        padding: '12px 14px', borderRadius: '16px', border: '1px solid #e5e5ea',
        background: '#f5f5f7', marginBottom: '12px',
      });
      const top = el('div', { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' });
      top.appendChild(el('div', { fontWeight: '800', fontSize: '15px' }, `${si.name} · Level ${prog.level}${prog.maxed ? ' (MAX)' : ''}`));
      top.appendChild(el('div', { fontSize: '12px', color: '#9a9aa2' }, `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`));
      head.appendChild(top);
      const bar = el('div', { height: '9px', borderRadius: '999px', background: '#eae4d9', marginTop: '8px', overflow: 'hidden' });
      bar.appendChild(el('div', {
        height: '100%', borderRadius: '999px', background: '#8a6fb0', transition: 'width .25s',
        width: prog.maxed ? '100%' : `${Math.round((prog.into / prog.need) * 100)}%`,
      }));
      head.appendChild(bar);
      head.appendChild(el('div', { fontSize: '12px', color: '#9a9aa2', marginTop: '5px' },
        prog.maxed
          ? `Season complete! Total XP ${st.xp.toLocaleString()}`
          : `${prog.into.toLocaleString()} / ${prog.need.toLocaleString()} XP to level ${prog.level + 1} · total ${st.xp.toLocaleString()} XP` +
            (st.boostPct ? ` · ⚡ +${st.boostPct}% XP boost active` : '')));
      const premRow = el('div', { marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' });
      if (st.premium) {
        premRow.appendChild(el('span', { fontWeight: '800', fontSize: '13px', color: '#b8860b' }, '⭐ Premium active'));
      } else {
        const b = ctx.ui.button(`Unlock Premium — ${PREMIUM_PRICE_UNITS} Units`, () => unlockPremium(ctx, render), { primary: true });
        premRow.appendChild(b);
        premRow.appendChild(el('span', { fontSize: '11.5px', color: '#9a9aa2' }, 'Units via Public Network · cosmetics & XP boosts only'));
      }
      head.appendChild(premRow);
      body.appendChild(head);

      // Track rows, one per level.
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const row = el('div', { display: 'flex', gap: '8px', alignItems: 'stretch', marginBottom: '8px' });
        const badge = el('div', {
          width: '40px', flex: '0 0 40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '12px', border: '1px solid #e5e5ea', fontWeight: '800', fontSize: '14px',
          background: levelFromXp(st.xp) >= level ? '#0A84FF' : '#f5f5f7',
          color: levelFromXp(st.xp) >= level ? '#060c21' : '#9a9aa2',
        }, String(level));
        row.appendChild(badge);
        row.appendChild(rewardCell(ctx, st, level, 'free', render));
        row.appendChild(rewardCell(ctx, st, level, 'premium', render));
        body.appendChild(row);
      }

      const foot = el('div', { marginTop: '10px', display: 'flex', justifyContent: 'center' });
      foot.appendChild(ctx.ui.button('🎯 Open Quests', () => {
        const p = panel; panel = null; teardown();
        p.close();
        const q = ctx.systems.get('quests');
        if (q) q.open(ctx);
      }));
      body.appendChild(foot);
    };

    render();
    unsubs.push(ctx.bus.on('season-xp-gained', render));
    unsubs.push(ctx.bus.on('season-levelup', render));
  },
  close() { if (panel) { panel.close(); panel = null; } teardown(); },
});

/* ---------------- boot: persistent XP listeners ---------------- */
const attachedSeasonBuses = new WeakSet();

export function attachSeasonProgression(ctx) {
  if (!ctx?.bus || attachedSeasonBuses.has(ctx.bus)) return false;
  attachedSeasonBuses.add(ctx.bus);
  getState(ctx.save); // initialise storage / roll into the current season
  for (const ev of Object.keys(XP_MAP)) {
    ctx.bus.on(ev, (d) => grantXp(ctx, XP_MAP[ev](d), ev));
  }
  return true;
}

registerHook('boot', attachSeasonProgression, { replay: true });
