// social.js — Friends & Party panel (spec §6 multiplayer & social, §11 identity).
// All backend behaviour is LOCAL FAKE through the ctx.pn boundary pattern:
// no networking, no servers. Persistence via ctx.save ('friends', 'party',
// 'friendCode'). Cross-module signals via ctx.bus ('friend-added',
// 'party-joined', plus 'friend-removed' / 'party-created' / 'party-left').
// Kid-safe: the ONLY free-text field in this module is the code input, and it
// is strictly sanitized to uppercase unambiguous alphanumerics.

import { registerSystem } from '../core/registry.js';

// ---------- constants ----------
const MAX_FRIENDS = 50;
const MAX_PARTY = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — kid-proof
const FRIEND_CODE_RE = /^67-[A-Z0-9]{4}$/;
const PARTY_CODE_RE = /^P-[A-Z0-9]{4}$/;
const PRESENCE_TICK = 15; // seconds between presence re-rolls (stub)

const NAME_ADJ = ['Happy', 'Speedy', 'Cosmic', 'Bouncy', 'Sunny', 'Zippy', 'Mellow', 'Turbo', 'Wiggly', 'Sparky'];
const NAME_NOUN = ['Fox', 'Panda', 'Koala', 'Tiger', 'Otter', 'Bunny', 'Gecko', 'Puffin', 'Mole', 'Llama'];
const PRESENCE_POOL = [
  { kind: 'online', label: 'Online' },
  { kind: 'online', label: 'Online' },
  { kind: 'online', label: 'In the hub' },
  { kind: 'playing', label: 'Playing Tag' },
  { kind: 'playing', label: 'In a party game' },
  { kind: 'offline', label: 'Offline' },
  { kind: 'offline', label: 'Offline' },
];

// ---------- tiny deterministic helpers ----------
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}
function codeFromSeed(prefix, seed) {
  let h = hash(seed);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
    h = Math.floor(h / CODE_ALPHABET.length) + i * 7919;
  }
  return prefix + out;
}
// Fake display name derived from a friend code (no free text anywhere).
function nameFromCode(code) {
  const h = hash('name:' + code);
  return NAME_ADJ[h % NAME_ADJ.length] + ' ' + NAME_NOUN[Math.floor(h / NAME_ADJ.length) % NAME_NOUN.length];
}
// Presence stub: deterministic per (code, 10-minute bucket) so it drifts
// slowly over time without any network. Codex replaces with real PN presence.
function presenceOf(code, isSelf) {
  if (isSelf) return { kind: 'online', label: 'Online' };
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  return PRESENCE_POOL[hash('presence:' + code + ':' + bucket) % PRESENCE_POOL.length];
}
function sanitizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
// Accepts typed codes with or without dashes; returns normalized code or null.
function normalizeFriendCode(raw) {
  const clean = sanitizeCode(raw);
  const body = clean.startsWith('67') ? clean.slice(2) : clean;
  if (body.length !== 4) return null;
  const code = '67-' + body;
  return FRIEND_CODE_RE.test(code) ? code : null;
}
function normalizePartyCode(raw) {
  const clean = sanitizeCode(raw);
  const body = clean.startsWith('P') ? clean.slice(1) : clean;
  if (body.length !== 4) return null;
  const code = 'P-' + body;
  return PARTY_CODE_RE.test(code) ? code : null;
}

// ---------- scoped styles (injected on open, removed on close) ----------
const CSS = `
.uv-soc-sec{margin:14px 0 6px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#9a9aa2}
.uv-soc-card{background:#f5f5f7;border:1px solid #e5e5ea;border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.uv-soc-code{font:600 22px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;color:#060c21;user-select:all;background:#ffffff;border:1px dashed #9a9aa2;border-radius:10px;padding:8px 12px}
.uv-soc-sub{font-size:12.5px;color:#9a9aa2}
.uv-soc-input{flex:1;min-width:140px;font:500 16px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;padding:11px 14px;border-radius:10px;border:1px solid #e5e5ea;background:#ffffff;color:#060c21;outline:none}
.uv-soc-input:focus{border-color:#9a9aa2}
.uv-soc-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.uv-soc-row{display:flex;align-items:center;gap:10px;background:#ffffff;border:1px solid #e5e5ea;border-radius:14px;padding:10px 12px;flex-wrap:wrap}
.uv-soc-dot{width:10px;height:10px;border-radius:50%;flex:none}
.uv-soc-dot.online{background:#5a9c7a}
.uv-soc-dot.playing{background:#0A84FF}
.uv-soc-dot.offline{background:#a9a9b1}
.uv-soc-name{font-weight:500;font-size:14.5px}
.uv-soc-meta{font-size:12px;color:#9a9aa2;font-family:ui-monospace,Menlo,monospace}
.uv-soc-status{font-size:12px;color:#9a9aa2;margin-left:auto}
.uv-soc-empty{font-size:13.5px;color:#9a9aa2;background:#f5f5f7;border:1px dashed #e5e5ea;border-radius:14px;padding:14px;text-align:center}
.uv-soc-crown{color:#0A84FF;font-weight:600}
.uv-soc-note{font-size:12px;color:#9a9aa2;margin-top:10px;line-height:1.5}
`;

// ---------- module state ----------
let panel = null;
let styleEl = null;
let stopTicker = null;
let tickAcc = 0;
let ctxRef = null;
let friendCodeState = null;

// ---------- save access ----------
export function initializeLocalFriendCode(save, identityName, sessionCode = null) {
  const stored = save?.get?.('friendCode', null);
  if (typeof stored === 'string' && FRIEND_CODE_RE.test(stored)) {
    return Object.freeze({ code: stored, persisted: true });
  }
  const code = typeof sessionCode === 'string' && FRIEND_CODE_RE.test(sessionCode)
    ? sessionCode
    : codeFromSeed('67-', 'friend:' + (identityName || 'guest'));
  const persisted = save?.set?.('friendCode', code) === true;
  return Object.freeze({ code, persisted });
}

function initializeFriendCode() {
  const id = ctxRef.pn.identity();
  friendCodeState = initializeLocalFriendCode(
    ctxRef.save,
    id?.name || 'guest',
    friendCodeState?.code,
  );
  return friendCodeState;
}

function myFriendCode() {
  return (friendCodeState || initializeFriendCode()).code;
}

function retryFriendCodeSave() {
  const state = friendCodeState || initializeFriendCode();
  if (!ctxRef.save.set('friendCode', state.code)) {
    socialSaveFailed('Friend code');
    return false;
  }
  friendCodeState = Object.freeze({ code: state.code, persisted: true });
  ctxRef.ui.toast('Friend code saved on this device.');
  return true;
}

function retryLocalProfileSave() {
  if (!ctxRef.save.retryProfile()) {
    socialSaveFailed('Guest profile');
    return false;
  }
  ctxRef.ui.toast('Guest profile saved on this device.');
  return true;
}

function getFriends() {
  const f = ctxRef.save.get('friends', []);
  return Array.isArray(f) ? f : [];
}
function getParty() { return ctxRef.save.get('party', null); }

export function commitLocalSocialWrites(save, writes) {
  if (!save || !Array.isArray(writes) || writes.length === 0) return false;
  const previous = [];
  for (const write of writes) {
    if (!write || typeof write.key !== 'string') return false;
    previous.push({ key: write.key, value: save.get(write.key, null) });
  }
  for (let index = 0; index < writes.length; index += 1) {
    const write = writes[index];
    if (save.set(write.key, write.value)) continue;
    for (let rollback = index - 1; rollback >= 0; rollback -= 1) {
      save.set(previous[rollback].key, previous[rollback].value);
    }
    return false;
  }
  return true;
}

function setFriends(list) {
  return commitLocalSocialWrites(ctxRef.save, [{ key: 'friends', value: list }]);
}
function setParty(party) {
  return commitLocalSocialWrites(ctxRef.save, [{ key: 'party', value: party }]);
}

function socialSaveFailed(noun) {
  ctxRef.ui.toast(`${noun} could not be saved on this device. Try again.`);
}

// ---------- actions ----------
async function copyText(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    ctxRef.ui.toast(what + ' copied!');
  } catch {
    ctxRef.ui.toast(what + ': ' + text + ' (select & copy)');
  }
}

function addFriend(rawCode) {
  const code = normalizeFriendCode(rawCode);
  if (!code) { ctxRef.ui.toast('Codes look like 67-AB3K'); return false; }
  if (code === myFriendCode()) { ctxRef.ui.toast("That's your own code!"); return false; }
  const friends = getFriends();
  if (friends.some((f) => f.code === code)) { ctxRef.ui.toast('Already your friend!'); return false; }
  if (friends.length >= MAX_FRIENDS) { ctxRef.ui.toast('Friends list is full'); return false; }
  friends.push({ code, name: nameFromCode(code), addedAt: Date.now() });
  if (!setFriends(friends)) {
    socialSaveFailed('Friend');
    return false;
  }
  ctxRef.bus.emit('friend-added', { code });
  ctxRef.ui.toast(nameFromCode(code) + ' added!');
  return true;
}

async function removeFriend(code) {
  const ok = await ctxRef.ui.confirm('Remove ' + nameFromCode(code) + ' from friends?');
  if (!ok) return;
  const nextFriends = getFriends().filter((f) => f.code !== code);
  // Also drop them from a local party if present.
  const party = getParty();
  const writes = [{ key: 'friends', value: nextFriends }];
  if (party && party.members.some((m) => m.code === code)) {
    writes.push({
      key: 'party',
      value: {
        ...party,
        members: party.members.filter((m) => m.code !== code),
      },
    });
  }
  if (!commitLocalSocialWrites(ctxRef.save, writes)) {
    socialSaveFailed('Friend removal');
    return;
  }
  ctxRef.bus.emit('friend-removed', { code });
  ctxRef.ui.toast('Friend removed');
  renderAll();
}

function ensureParty() {
  let party = getParty();
  if (!party) {
    const me = myFriendCode();
    party = {
      code: codeFromSeed('P-', 'party:' + me + ':' + Date.now()),
      leader: me,
      members: [{ code: me, name: ctxRef.pn.identity().name + ' (you)' }],
    };
    if (!setParty(party)) {
      socialSaveFailed('Party');
      return null;
    }
    ctxRef.bus.emit('party-created', { code: party.code });
  }
  return party;
}

function inviteToParty(code) {
  let party = getParty();
  const created = !party;
  if (!party) {
    const me = myFriendCode();
    party = {
      code: codeFromSeed('P-', 'party:' + me + ':' + Date.now()),
      leader: me,
      members: [{ code: me, name: ctxRef.pn.identity().name + ' (you)' }],
    };
  }
  if (party.members.some((m) => m.code === code)) { ctxRef.ui.toast('Already in the party'); renderAll(); return; }
  if (party.members.length >= MAX_PARTY) { ctxRef.ui.toast('Party is full (' + MAX_PARTY + ')'); return; }
  const nextParty = {
    ...party,
    members: [...party.members, { code, name: nameFromCode(code) }],
  };
  if (!setParty(nextParty)) {
    socialSaveFailed('Party invitation');
    return;
  }
  if (created) ctxRef.bus.emit('party-created', { code: nextParty.code });
  ctxRef.bus.emit('party-joined', { code: nextParty.code, member: code, size: nextParty.members.length });
  ctxRef.ui.toast(nameFromCode(code) + ' joined the party!');
  renderAll();
}

function joinPartyByCode(rawCode) {
  const code = normalizePartyCode(rawCode);
  if (!code) { ctxRef.ui.toast('Party codes look like P-AB3K'); return false; }
  const me = myFriendCode();
  const leaderCode = codeFromSeed('67-', 'host:' + code);
  const party = {
    code,
    leader: leaderCode,
    members: [
      { code: leaderCode, name: nameFromCode(leaderCode) },
      { code: me, name: ctxRef.pn.identity().name + ' (you)' },
    ],
  };
  if (!setParty(party)) {
    socialSaveFailed('Party');
    return false;
  }
  ctxRef.bus.emit('party-joined', { code, member: me, size: party.members.length });
  ctxRef.ui.toast('Joined party ' + code + '!');
  return true;
}

async function leaveParty() {
  const party = getParty();
  if (!party) return;
  const me = myFriendCode();
  const isLeader = party.leader === me;
  const ok = await ctxRef.ui.confirm(isLeader
    ? 'You are the party leader — leave and disband the party?'
    : 'Leave the party?');
  if (!ok) return;
  if (isLeader || party.members.length <= 2) {
    if (!setParty(null)) {
      socialSaveFailed('Party');
      return;
    }
    ctxRef.bus.emit('party-left', { code: party.code, disbanded: true });
    ctxRef.ui.toast('Party disbanded');
  } else {
    const nextParty = {
      ...party,
      members: party.members.filter((m) => m.code !== me),
    };
    if (!setParty(nextParty)) {
      socialSaveFailed('Party');
      return;
    }
    ctxRef.bus.emit('party-left', { code: party.code, disbanded: false });
    ctxRef.ui.toast('Left the party');
  }
  renderAll();
}

async function kickFromParty(code) {
  const party = getParty();
  if (!party) return;
  const ok = await ctxRef.ui.confirm('Remove ' + nameFromCode(code) + ' from the party?');
  if (!ok) return;
  const nextParty = {
    ...party,
    members: party.members.filter((m) => m.code !== code),
  };
  if (!setParty(nextParty)) {
    socialSaveFailed('Party member removal');
    return;
  }
  ctxRef.ui.toast('Removed from party');
  renderAll();
}

// ---------- rendering ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderAll() {
  if (!panel) return;
  const body = panel.body;
  body.textContent = '';
  const ui = ctxRef.ui;
  const me = myFriendCode();
  const id = ctxRef.pn.identity();
  const profileState = ctxRef.save.profileState;

  // --- Your code card ---
  body.appendChild(el('div', 'uv-soc-sec', 'Your friend code'));
  const card = el('div', 'uv-soc-card');
  card.appendChild(el('span', 'uv-soc-code', me));
  const idCol = el('div');
  idCol.appendChild(el('div', 'uv-soc-name', id.name + (id.guest ? ' · Guest' : '')));
  idCol.appendChild(el(
    'div',
    'uv-soc-sub uv-soc-profile',
    profileState.persisted
      ? 'Guest profile saved on this device'
      : 'Guest profile is session-only until it can be saved',
  ));
  idCol.appendChild(el(
    'div',
    'uv-soc-sub',
    friendCodeState?.persisted
      ? 'Saved on this device · on-device friend code'
      : 'Session-only code · save it before relying on it after a reload',
  ));
  card.appendChild(idCol);
  if (!profileState.persisted) {
    card.appendChild(ui.button('Retry profile save', () => {
      if (retryLocalProfileSave()) renderAll();
    }, { primary: true }));
  }
  if (friendCodeState?.persisted) {
    card.appendChild(ui.button('Copy', () => copyText(me, 'Friend code')));
  } else {
    card.appendChild(ui.button('Retry save', () => {
      if (retryFriendCodeSave()) renderAll();
    }, { primary: true }));
  }
  body.appendChild(card);

  // --- Code input (the ONLY free-text field in this module) ---
  body.appendChild(el('div', 'uv-soc-sec', 'Add / join with a code'));
  const inputRow = el('div', 'uv-soc-card');
  const input = el('input', 'uv-soc-input');
  input.type = 'text';
  input.placeholder = '67-AB3K or P-AB3K';
  input.maxLength = 8;
  input.autocapitalize = 'characters';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.inputMode = 'text';
  input.setAttribute('aria-label', 'Friend or party code');
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    try { input.setSelectionRange(pos, pos); } catch {}
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { if (addFriend(input.value)) { input.value = ''; renderAll(); } }
  });
  inputRow.appendChild(input);
  inputRow.appendChild(ui.button('Add friend', () => {
    if (addFriend(input.value)) { input.value = ''; renderAll(); }
  }, { primary: true }));
  inputRow.appendChild(ui.button('Join party', () => {
    if (joinPartyByCode(input.value)) { input.value = ''; renderAll(); }
  }));
  body.appendChild(inputRow);

  // --- Party ---
  body.appendChild(el('div', 'uv-soc-sec', 'Party'));
  const party = getParty();
  if (!party) {
    const startRow = el('div', 'uv-soc-card');
    startRow.appendChild(el('div', 'uv-soc-sub', 'Party up to bring friends into games together.'));
    startRow.appendChild(ui.button('Start a party', () => {
      if (ensureParty()) renderAll();
    }, { primary: true }));
    body.appendChild(startRow);
  } else {
    const pCard = el('div', 'uv-soc-card');
    pCard.appendChild(el('span', 'uv-soc-code', party.code));
    pCard.appendChild(el('div', 'uv-soc-sub', party.members.length + '/' + MAX_PARTY + ' members'));
    pCard.appendChild(ui.button('Copy code', () => copyText(party.code, 'Party code')));
    pCard.appendChild(ui.button(party.leader === me ? 'Disband' : 'Leave', leaveParty));
    body.appendChild(pCard);
    const mList = el('div', 'uv-soc-list');
    for (const m of party.members) {
      const row = el('div', 'uv-soc-row');
      const pres = presenceOf(m.code, m.code === me);
      const dot = el('span', 'uv-soc-dot ' + pres.kind);
      dot.dataset.presenceFor = m.code;
      row.appendChild(dot);
      row.appendChild(el('span', 'uv-soc-name', m.name));
      if (m.code === party.leader) row.appendChild(el('span', 'uv-soc-crown', '★ leader'));
      row.appendChild(el('span', 'uv-soc-meta', m.code === me ? me : m.code));
      const st = el('span', 'uv-soc-status', pres.label);
      st.dataset.presenceFor = m.code;
      row.appendChild(st);
      if (party.leader === me && m.code !== me) {
        row.appendChild(ui.button('Remove', () => kickFromParty(m.code)));
      }
      mList.appendChild(row);
    }
    body.appendChild(mList);
  }

  // --- Friends list ---
  body.appendChild(el('div', 'uv-soc-sec', 'Friends (' + getFriends().length + '/' + MAX_FRIENDS + ')'));
  const friends = getFriends();
  if (!friends.length) {
    body.appendChild(el('div', 'uv-soc-empty', 'No friends yet — share your code or add one above!'));
  } else {
    const list = el('div', 'uv-soc-list');
    for (const f of friends) {
      const row = el('div', 'uv-soc-row');
      const pres = presenceOf(f.code, false);
      const dot = el('span', 'uv-soc-dot ' + pres.kind);
      dot.dataset.presenceFor = f.code;
      row.appendChild(dot);
      row.appendChild(el('span', 'uv-soc-name', f.name));
      row.appendChild(el('span', 'uv-soc-meta', f.code));
      const st = el('span', 'uv-soc-status', pres.label);
      st.dataset.presenceFor = f.code;
      row.appendChild(st);
      row.appendChild(ui.button('Invite', () => inviteToParty(f.code), { primary: true }));
      row.appendChild(ui.button('Remove', () => removeFriend(f.code)));
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  body.appendChild(el('div', 'uv-soc-note',
    'On-device social: friends and parties stay in this browser. Presence labels are training status; online social and multiplayer are off in this build.'));
}

// Re-roll presence dots only (cheap; avoids rebuilding inputs while typing).
function refreshPresence() {
  if (!panel) return;
  const me = myFriendCode();
  const seen = new Map();
  for (const n of panel.body.querySelectorAll('[data-presence-for]')) {
    const code = n.dataset.presenceFor;
    if (!seen.has(code)) seen.set(code, presenceOf(code, code === me));
    const pres = seen.get(code);
    if (n.classList.contains('uv-soc-dot')) n.className = 'uv-soc-dot ' + pres.kind;
    else if (n.classList.contains('uv-soc-status')) n.textContent = pres.label;
  }
}

// ---------- registration ----------
registerSystem('social', {
  open(ctx) {
    if (panel) return;
    ctxRef = ctx;
    const code = initializeFriendCode();
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
    panel = ctx.ui.panel({
      title: 'Friends & Party',
      onClose: () => { panel = null; cleanup(); },
    });
    renderAll();
    if (!code.persisted) {
      ctx.ui.toast('Friend code could not be saved on this device. It is session-only until you retry.');
    }
    tickAcc = 0;
    stopTicker = ctx.loop.add((dt) => {
      tickAcc += dt;
      if (tickAcc >= PRESENCE_TICK) { tickAcc = 0; refreshPresence(); }
    });
  },
  close() {
    if (panel) { const p = panel; panel = null; p.close(); }
    cleanup();
  },
});

function cleanup() {
  if (stopTicker) { stopTicker(); stopTicker = null; }
  if (styleEl) { styleEl.remove(); styleEl = null; }
  ctxRef = null;
}
