// quests.js — daily/weekly quests (spec §9: "the return hook, pay out Coins + pass progress").
// Progress is driven entirely by ctx.bus events ('game-result', 'coins-earned', 'emote',
// 'ugc-play', 'ugc-like'), persisted in the 'quests' save key with daily/weekly
// rollover. Claiming pays Coins via save.addCoins and emits 'season-xp' for the
// Season Pass module. Bus listeners attach once via the 'boot' hook so quests
// keep progressing while any game is mounted (not only when the panel is open).
import { registerSystem, registerHook } from '../core/registry.js';
import { localGameResultProgress } from '../core/game-result.js';
import {
  isPlainRecord,
  LOCAL_SAVE_SCHEMA_VERSION,
  nonNegativeInteger,
} from '../core/local-save-schema.js';

const DAY_MS = 86400000;

/* ---------------- date keys & reset clocks ---------------- */
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekKey(d = new Date()) { // ISO-8601 week, Monday start
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((t - firstThu) / (7 * DAY_MS));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function msUntilDailyReset(now = new Date()) {
  const n = new Date(now); n.setHours(24, 0, 0, 0);
  return n - now;
}
function msUntilWeeklyReset(now = new Date()) {
  const n = new Date(now); n.setHours(24, 0, 0, 0);
  const dow = (n.getDay() + 6) % 7;               // 0 = Monday
  n.setDate(n.getDate() + ((7 - dow) % 7));       // next Monday 00:00 local
  return n - now;
}
function fmtDur(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

/* ---------------- quest pools ----------------
   def: { id, text, goal, reward(coins), event, inc(data) -> increment } */
const DAILY_POOL = [
  { id: 'play3',    text: 'Play 3 mini-games',       goal: 3,   reward: 60, event: 'game-result',  inc: (d) => localGameResultProgress(d).play },
  { id: 'coins100', text: 'Earn 100 Coins',          goal: 100, reward: 40, event: 'coins-earned', inc: (d) => Math.max(0, (d && d.amount) || 0) },
  { id: 'emote3',   text: 'Use 3 emotes',            goal: 3,   reward: 30, event: 'emote',        inc: () => 1 },
  { id: 'score500', text: 'Score 500 points total',  goal: 500, reward: 50, event: 'game-result',  inc: (d) => localGameResultProgress(d).score },
  { id: 'ugcplay1', text: 'Play a community world',  goal: 1,   reward: 40, event: 'ugc-play',     inc: () => 1 },
  { id: 'champ1',   text: 'Finish 1st in any game',  goal: 1,   reward: 80, event: 'game-result',  inc: (d) => localGameResultProgress(d).firstPlace },
];
const WEEKLY_POOL = [
  { id: 'play15',    text: 'Play 15 mini-games',         goal: 15,   reward: 250, event: 'game-result',  inc: (d) => localGameResultProgress(d).play },
  { id: 'coins500',  text: 'Earn 500 Coins',             goal: 500,  reward: 150, event: 'coins-earned', inc: (d) => Math.max(0, (d && d.amount) || 0) },
  { id: 'emote15',   text: 'Use 15 emotes',              goal: 15,   reward: 120, event: 'emote',        inc: () => 1 },
  { id: 'score2500', text: 'Score 2,500 points total',   goal: 2500, reward: 200, event: 'game-result',  inc: (d) => localGameResultProgress(d).score },
  { id: 'ugcplay5',  text: 'Play 5 community worlds',    goal: 5,    reward: 150, event: 'ugc-play',     inc: () => 1 },
  { id: 'ugclike5',  text: 'Like 5 community worlds',    goal: 5,    reward: 150, event: 'ugc-like',     inc: () => 1 },
  { id: 'champ3',    text: 'Finish 1st in 3 games',      goal: 3,    reward: 300, event: 'game-result',  inc: (d) => localGameResultProgress(d).firstPlace },
];
const ALL = DAILY_POOL.concat(WEEKLY_POOL);
const defOf = (id) => ALL.find((q) => q.id === id);

/* Deterministic per-period selection: same day/week => same 3 quests. */
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pickQuests(pool, n, seed) {
  return pool
    .map((q) => ({ q, k: hash32(seed + ':' + q.id) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.q.id);
}
function blankPeriod(key, pool, n, seedPrefix) {
  return { key, order: pickQuests(pool, n, seedPrefix + key), prog: {}, claimed: {} };
}

/* ---------------- state (save key: 'quests') ---------------- */
function recoverPeriod(raw, key, pool, count, seedPrefix) {
  const fallback = blankPeriod(key, pool, count, seedPrefix);
  if (!isPlainRecord(raw) || raw.key !== key) return fallback;
  const allowed = new Set(pool.map((quest) => quest.id));
  const order = [];
  for (const id of Array.isArray(raw.order) ? raw.order : []) {
    if (allowed.has(id) && !order.includes(id) && order.length < count) order.push(id);
  }
  for (const id of fallback.order) {
    if (!order.includes(id) && order.length < count) order.push(id);
  }

  const prog = {};
  const rawProgress = isPlainRecord(raw.prog) ? raw.prog : {};
  for (const quest of pool) {
    if (!Object.hasOwn(rawProgress, quest.id)) continue;
    const value = nonNegativeInteger(rawProgress[quest.id], -1, quest.goal);
    if (value >= 0) prog[quest.id] = value;
  }

  const claimed = {};
  const rawClaimed = isPlainRecord(raw.claimed) ? raw.claimed : {};
  for (const quest of pool) {
    if (rawClaimed[quest.id] === true) {
      claimed[quest.id] = true;
      if ((prog[quest.id] || 0) < quest.goal) prog[quest.id] = quest.goal;
    }
  }
  return { key, order, prog, claimed };
}

export function recoverQuestState(raw, { now = new Date() } = {}) {
  const source = isPlainRecord(raw) ? raw : {};
  const dk = dayKey(now);
  const wk = weekKey(now);
  const state = {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    daily: recoverPeriod(source.daily, dk, DAILY_POOL, 3, 'd'),
    weekly: recoverPeriod(source.weekly, wk, WEEKLY_POOL, 3, 'w'),
  };
  let recovered = true;
  try { recovered = JSON.stringify(raw) !== JSON.stringify(state); } catch {}
  return { state, recovered };
}

function getState(save) {
  const recovery = recoverQuestState(save.get('quests', null));
  if (recovery.recovered) save.set('quests', recovery.state);
  return recovery.state;
}

/* ---------------- progression ---------------- */
function handleEvent(ctx, event, data) {
  const save = ctx.save;
  const st = getState(save); // also rolls over on date change
  let dirty = false;
  const updates = [];
  for (const period of ['daily', 'weekly']) {
    const P = st[period];
    for (const id of P.order) {
      if (P.claimed[id]) continue;
      const def = defOf(id);
      if (!def || def.event !== event) continue;
      const cur = P.prog[id] || 0;
      if (cur >= def.goal) continue;
      const add = def.inc(data) || 0;
      if (add <= 0) continue;
      const next = Math.min(def.goal, cur + add);
      P.prog[id] = next;
      dirty = true;
      updates.push({
        questId: `${period}:${id}`,
        next,
        completed: next >= def.goal,
        text: def.text,
      });
    }
  }
  if (!dirty || !save.set('quests', st)) return false;
  for (const update of updates) {
    ctx.bus.emit('quest-progress', { questId: update.questId, n: update.next });
    if (update.completed) {
      ctx.ui.toast(`Quest complete: ${update.text} — claim it! 🎯`);
    }
  }
  return true;
}

export function claimQuestReward(ctx, period, id) {
  const st = getState(ctx.save);
  const P = st[period];
  const def = defOf(id);
  if (!def || P.claimed[id] || (P.prog[id] || 0) < def.goal) return false;
  const total = ctx.save.commitCoins(def.reward, `quest:${period}:${id}`, () => {
    P.claimed[id] = true;
    return ctx.save.set('quests', st);
  });
  if (!Number.isFinite(total)) {
    ctx.ui.toast('Quest reward could not be saved on this device. Nothing was claimed.');
    return false;
  }
  // Quests also feed the Season Pass (spec §9) — season.js listens for this.
  ctx.bus.emit('season-xp', { amount: period === 'weekly' ? 80 : 30, why: `quest:${id}` });
  ctx.ui.toast(`+${def.reward} Coins — ${def.text}`);
  return true;
}

/* ---------------- panel UI ---------------- */
function el(tag, styles, text) {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (text != null) e.textContent = text;
  return e;
}
function questRow(ctx, period, id, P, rerender) {
  const def = defOf(id);
  const n = Math.min(def.goal, P.prog[id] || 0);
  const done = n >= def.goal;
  const claimed = !!P.claimed[id];
  const row = el('div', {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
    border: '1px solid #e5e5ea', borderRadius: '14px', background: claimed ? '#f5f5f7' : '#fffdf9',
  });
  const mid = el('div', { flex: '1', minWidth: '0' });
  mid.appendChild(el('div', { fontWeight: '700', fontSize: '14px' }, def.text));
  const bar = el('div', { height: '7px', borderRadius: '999px', background: '#eae4d9', marginTop: '6px', overflow: 'hidden' });
  bar.appendChild(el('div', {
    height: '100%', width: `${Math.round((n / def.goal) * 100)}%`, borderRadius: '999px',
    background: done ? '#5a9c7a' : '#0A84FF', transition: 'width .25s',
  }));
  mid.appendChild(bar);
  mid.appendChild(el('div', { fontSize: '11.5px', color: '#9a9aa2', marginTop: '4px' },
    `${n.toLocaleString()} / ${def.goal.toLocaleString()} · reward ${def.reward} Coins`));
  row.appendChild(mid);
  if (claimed) {
    row.appendChild(el('span', { fontWeight: '800', color: '#5a9c7a', fontSize: '13px' }, '✓ Claimed'));
  } else {
    const b = ctx.ui.button(`Claim ${def.reward}`, () => {
      if (claimQuestReward(ctx, period, id)) rerender();
    }, { primary: done });
    b.disabled = !done;
    row.appendChild(b);
  }
  return row;
}
function sectionTitle(text, sub) {
  const wrap = el('div', { margin: '14px 0 8px' });
  const head = el('div', { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' });
  head.appendChild(el('div', { fontWeight: '800', fontSize: '15px' }, text));
  head.appendChild(el('div', { fontSize: '12px', color: '#9a9aa2' }, sub));
  wrap.appendChild(head);
  return wrap;
}

let panel = null;
let unsubs = [];
function teardown() {
  for (const u of unsubs) { try { u(); } catch {} }
  unsubs = [];
}

registerSystem('quests', {
  open(ctx) {
    if (panel) return;
    panel = ctx.ui.panel({
      title: '🎯 Quests',
      onClose: () => { teardown(); panel = null; },
    });

    const render = () => {
      const st = getState(ctx.save);
      const body = panel.body;
      body.textContent = '';

      const coins = el('div', { fontSize: '13px', color: '#9a9aa2', marginBottom: '2px' },
        `Complete quests to earn Coins and Season XP. Balance: ${ctx.save.coins.toLocaleString()} Coins`);
      body.appendChild(coins);

      body.appendChild(sectionTitle('Daily quests', `resets in ${fmtDur(msUntilDailyReset())}`));
      for (const id of st.daily.order) body.appendChild(questRow(ctx, 'daily', id, st.daily, render));

      body.appendChild(sectionTitle('Weekly quests', `resets in ${fmtDur(msUntilWeeklyReset())}`));
      for (const id of st.weekly.order) body.appendChild(questRow(ctx, 'weekly', id, st.weekly, render));

      const row = el('div', { marginTop: '16px', display: 'flex', justifyContent: 'center' });
      row.appendChild(ctx.ui.button('⭐ Open Season Pass', () => {
        const p = panel; panel = null; teardown();
        p.close();
        const s = ctx.systems.get('season');
        if (s) s.open(ctx);
      }));
      body.appendChild(row);
    };

    render();
    // Live-update rows while the panel is open (e.g. claim -> coins-earned -> earn-coins quest).
    unsubs.push(ctx.bus.on('quest-progress', render));
  },
  close() { if (panel) { panel.close(); panel = null; } teardown(); },
});

/* ---------------- boot: persistent listeners + rollover init ---------------- */
const attachedQuestBuses = new WeakSet();

export function attachQuestProgression(ctx) {
  if (!ctx?.bus || attachedQuestBuses.has(ctx.bus)) return false;
  attachedQuestBuses.add(ctx.bus);
  getState(ctx.save); // initialise storage / roll over stale periods
  for (const ev of ['game-result', 'coins-earned', 'emote', 'ugc-play', 'ugc-like']) {
    ctx.bus.on(ev, (d) => handleEvent(ctx, ev, d));
  }
  return true;
}

registerHook('boot', attachQuestProgression, { replay: true });
