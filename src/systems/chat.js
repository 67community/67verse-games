// systems/chat.js — Chat dock (SPEC §12, COPPA / under-13 posture by default).
//
// What this module owns:
//   - Toggleable chat dock (bottom-left, non-modal — the hub stays playable).
//   - Local message loop: typed text -> local word filter -> ctx.pn.chatSend stub
//     -> re-filtered echo -> bus 'chat-message' + on-screen bubble.
//   - Safety flows: per-message Report (appends to save key 'modQueue') and
//     Block / Unblock (save key 'chatBlocked').
//   - Parental controls: save.settings.chatEnabled === false hides the dock UI
//     entirely; save.settings.parentalGate === true requires a parent confirm
//     (ctx.ui.confirm) once per session before the dock opens.
//
// Save keys used:  'settings' (read), 'modQueue' (versioned append), 'chatBlocked' (own key, r/w)
// Bus events:      emits + listens 'chat-message' { from, text }
//                  listens 'settings-changed' (live enable/disable reaction)
// ctx APIs:        ctx.save, ctx.bus, ctx.ui (toast/confirm/button), ctx.pn.chatSend
//
// The exported filterChatText() is the single chat filter for the whole game —
// other modules should pass any user-visible chat text through it (per
// ARCHITECTURE.md "chat must pass through the filter in systems/chat").
// NOTE: this local blocklist is a prototype first pass only. Any future online
// service would need its own authoritative filtering and moderation boundary.

import { registerSystem } from '../core/registry.js';
import { appendLocalModerationRecord } from '../core/local-moderation.js';

// ---------------------------------------------------------------------------
// Word filter
// ---------------------------------------------------------------------------
// Client-side first-pass blocklist: profanity, sexual content, violence,
// self-harm and bullying terms. Deliberately aggressive (under-13 default).
const BLOCKLIST = [
  // profanity
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'bastard', 'asshole', 'cunt',
  'dick', 'cock', 'pussy', 'whore', 'slut', 'piss', 'crap', 'damn', 'wtf', 'stfu',
  // sexual
  'sex', 'sexy', 'porn', 'porno', 'nude', 'nudes', 'naked', 'boobs', 'boob',
  'penis', 'vagina', 'horny', 'dildo', 'orgasm', 'hentai', 'onlyfans',
  // violence / self-harm
  'kys', 'suicide', 'murder', 'rape', 'rapist', 'terrorist', 'nazi', 'hitler',
  // bullying
  'killyourself', 'loser', 'retard', 'retarded',
];

// Leetspeak / symbol substitutions used to evade naive filters.
const LEET = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't',
  '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '+': 't', '(': 'c',
};

function variants(text) {
  const low = String(text).toLowerCase();
  const sub = low.split('').map((ch) => LEET[ch] || ch).join('');
  const collapse = (s) => s.replace(/(.)\1{2,}/g, '$1'); // "fuuuck" -> "fuck"
  const alpha = (s) => s.replace(/[^a-z]/g, '');
  const tokens = sub.split(/[^a-z]+/).filter(Boolean);
  return {
    tokens,
    tokensCollapsed: tokens.map(collapse),
    squashed: alpha(sub),                 // catches "b a d w o r d" / "b.a.d"
    squashedCollapsed: alpha(collapse(sub)),
    // "spaced out" heuristic: mostly single-letter tokens = bypass attempt
    spacedOut: tokens.length >= 4 &&
      tokens.filter((t) => t.length === 1).length >= tokens.length / 2,
  };
}

/**
 * filterChatText(text) -> { ok, clean, hits }
 *  ok    — false when a blocked term was detected (message must NOT be shown)
 *  clean — trimmed, length-capped version safe to display
 *  hits  — matched blocklist terms (for logging/moderation)
 */
export function filterChatText(text, maxLen = 120) {
  const clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, maxLen);
  if (!clean) return { ok: false, clean: '', hits: ['<empty>'] };
  const v = variants(clean);
  const hits = [];
  for (const word of BLOCKLIST) {
    // Whole-word matches (raw + repeat-collapsed) are always checked.
    // Substring checks on the squashed text are only applied to longer words,
    // or when the message looks deliberately spaced out — this avoids
    // Scunthorpe-style false positives on innocent words.
    if (
      v.tokens.includes(word) ||
      v.tokensCollapsed.includes(word) ||
      ((word.length >= 5 || v.spacedOut) &&
        (v.squashed.includes(word) || v.squashedCollapsed.includes(word)))
    ) hits.push(word);
  }
  return { ok: hits.length === 0, clean, hits };
}

// ---------------------------------------------------------------------------
// Chat dock (system 'chat')
// ---------------------------------------------------------------------------

const CSS = `
.uvchat-dock{position:fixed;left:12px;bottom:12px;width:min(340px,calc(100vw - 24px));
  max-height:min(52vh,440px);display:flex;flex-direction:column;z-index:55;
  background:#ffffff;border:1px solid #e5e5ea;border-radius:10px;
  box-shadow:0 14px 40px rgba(6,12,33,.22);overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#060c21;
  touch-action:pan-y}
.uvchat-head{display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;background:#f5f5f7;border-bottom:1px solid #e5e5ea;
  font-weight:600;font-size:15px}
.uvchat-head .uvchat-x{border:1px solid #e5e5ea;background:#ffffff;border-radius:999px;
  width:28px;height:28px;font-size:13px;cursor:pointer;color:#060c21}
.uvchat-log{flex:1;min-height:120px;overflow-y:auto;padding:10px 12px;
  display:flex;flex-direction:column;gap:8px;font-size:13.5px}
.uvchat-local{padding:9px 12px;background:#0A84FF24;border-bottom:1px solid #e5e5ea;
  color:#4e4d4d;font-size:11.5px;font-weight:500;line-height:1.4}
.uvchat-msg{display:flex;flex-direction:column;gap:2px}
.uvchat-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:#9a9aa2;font-weight:500}
.uvchat-meta .uvchat-act{border:none;background:none;cursor:pointer;font-size:11px;
  color:#9a9aa2;padding:0 2px;text-decoration:underline}
.uvchat-meta .uvchat-act:hover{color:#9a9aa2}
.uvchat-bubble{align-self:flex-start;max-width:100%;background:#f5f5f7;
  border:1px solid #e5e5ea;border-radius:14px;padding:7px 11px;word-break:break-word}
.uvchat-msg.self .uvchat-bubble{background:#0A84FF33;border-color:#0A84FF}
.uvchat-sys{font-size:12px;color:#9a9aa2;font-style:italic;text-align:center}
.uvchat-composer{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e5ea;background:#ffffff}
.uvchat-input{flex:1;border:1px solid #e5e5ea;border-radius:999px;padding:9px 14px;
  font:500 13.5px -apple-system,system-ui,sans-serif;background:#f5f5f7;color:#060c21;outline:none;
  user-select:text;-webkit-user-select:text}
.uvchat-input:focus{border-color:#0A84FF}
.uvchat-note{padding:14px;font-size:13.5px;color:#9a9aa2;line-height:1.5}
.uvchat-note b{color:#060c21}
.uvchat-blocked{padding:0 12px 10px;font-size:12px;color:#9a9aa2}
.uvchat-blocked summary{cursor:pointer;font-weight:500}
.uvchat-blocked .uv-row{margin-top:6px}
.uvchat-chip{display:inline-flex;align-items:center;gap:6px;background:#f5f5f7;
  border:1px solid #e5e5ea;border-radius:999px;padding:4px 10px;font-size:12px;color:#060c21}
.uvchat-chip button{border:none;background:none;cursor:pointer;color:#9a9aa2;font-weight:600;font-size:12px;padding:0}
@media(max-width:600px){
  .uvchat-dock{left:8px;bottom:max(8px,env(safe-area-inset-bottom));width:calc(100vw - 16px);
    max-height:min(68dvh,520px);border-radius:10px}
  .uvchat-log{min-height:92px}
}
`;

let dock = null;          // root DOM element while open
let styleEl = null;       // injected stylesheet while open
let offBus = [];          // bus unsubscribers while open
let gateApproved = false; // parental-gate approval, per session
let sending = false;      // async-send reentrancy guard
let lastSentAt = 0;       // rate limit
let log = [];             // session message log [{from,text,at,self}] (capped)

const LOG_CAP = 100;
const SEND_COOLDOWN_MS = 1500;

export function readLocalChatBlocked(save) {
  const raw = save?.get?.('chatBlocked', []);
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((name) => (
    typeof name === 'string' && name.length > 0 && name.length <= 64
  )))];
}

export function commitLocalChatBlock(save, name, blocked) {
  if (
    !save
    || typeof name !== 'string'
    || name.length === 0
    || name.length > 64
  ) return false;
  const current = readLocalChatBlocked(save);
  const next = blocked
    ? (current.includes(name) ? current : [...current, name])
    : current.filter((entry) => entry !== name);
  return save.set('chatBlocked', next) === true;
}

function myName(ctx) {
  try { return ctx.pn.identity().name || ctx.save.profile.name; }
  catch { return ctx.save.profile.name; }
}

registerSystem('chat', {
  open(ctx) {
    if (dock) return; // already open (toggle target)

    const settings = ctx.save.settings;

    // Parental gate: a parent must approve opening chat (once per session).
    if (settings.parentalGate && !gateApproved) {
      ctx.ui.confirm(
        'Chat is protected by a parental gate. A parent should approve before chatting. Open chat?'
      ).then((ok) => {
        if (ok) { gateApproved = true; this.open(ctx); }
        else ctx.ui.toast('Chat needs a parent’s OK 💛');
      });
      return;
    }

    openDock(ctx);
  },

  close() {
    for (const off of offBus) { try { off(); } catch {} }
    offBus = [];
    if (dock) { dock.remove(); dock = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
  },
});

function openDock(ctx) {
  styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  dock = document.createElement('div');
  dock.className = 'uvchat-dock';
  dock.setAttribute('role', 'region');
  dock.setAttribute('aria-label', 'On-device chat');
  // Keep hub controls (WASD/Space/E) from firing while typing or clicking here.
  dock.addEventListener('keydown', (e) => e.stopPropagation());
  dock.addEventListener('keyup', (e) => e.stopPropagation());
  document.body.appendChild(dock);

  const head = document.createElement('div');
  head.className = 'uvchat-head';
  head.textContent = '💬 Local Chat';
  const x = document.createElement('button');
  x.className = 'uvchat-x';
  x.type = 'button';
  x.textContent = '✕';
  x.title = 'Close chat';
  x.setAttribute('aria-label', 'Close local chat');
  x.onclick = () => closeFromInside(ctx);
  head.appendChild(x);
  dock.appendChild(head);

  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.minHeight = '0';
  dock.appendChild(content);

  // --- live reactions ---
  offBus.push(ctx.bus.on('chat-message', (m) => {
    if (!m || typeof m.text !== 'string') return;
    const entry = {
      from: String(m.from || '???'),
      text: m.text,
      at: Date.now(),
      self: m.from === myName(ctx),
    };
    log.push(entry);
    if (log.length > LOG_CAP) log = log.slice(-LOG_CAP);
    if (isBlocked(ctx, entry.from)) return; // blocked senders never render
    appendMessage(ctx, entry);
  }));
  offBus.push(ctx.bus.on('settings-changed', () => renderBody(ctx)));

  renderBody(ctx);

  function renderBody(c) {
    content.textContent = '';
    const st = c.save.settings;

    const localNote = document.createElement('div');
    localNote.className = 'uvchat-local';
    const profileState = c.save.profileState;
    localNote.textContent = [
      'On-device chat · Messages stay in this browser session. Online chat is off in this build.',
      `Playing as ${profileState.profile.name} · ${profileState.persisted
        ? 'guest profile saved on this device'
        : 'session-only guest profile'}.`,
    ].join(' ');
    content.appendChild(localNote);

    if (!st.chatEnabled) {
      const note = document.createElement('div');
      note.className = 'uvchat-note';
      note.innerHTML = '<b>Chat is turned off.</b><br>A parent can turn it back on in Settings → Chat.';
      content.appendChild(note);
      return;
    }

    const logEl = document.createElement('div');
    logEl.className = 'uvchat-log';
    logEl.setAttribute('aria-live', 'polite');
    logEl.setAttribute('aria-label', 'Chat messages');
    content.appendChild(logEl);

    const visible = log.filter((m) => !isBlocked(c, m.from));
    if (!visible.length) {
      const sys = document.createElement('div');
      sys.className = 'uvchat-sys';
      sys.textContent = 'Say hi! Messages are filtered to keep 67VERSE safe 🌱';
      logEl.appendChild(sys);
    }
    for (const m of visible) appendMessage(c, m, logEl);

    // Blocked players management.
    const blocked = readLocalChatBlocked(c.save);
    if (blocked.length) {
      const det = document.createElement('details');
      det.className = 'uvchat-blocked';
      const sum = document.createElement('summary');
      sum.textContent = `Blocked players (${blocked.length})`;
      det.appendChild(sum);
      const row = document.createElement('div');
      row.className = 'uv-row';
      for (const name of blocked) {
        const chip = document.createElement('span');
        chip.className = 'uvchat-chip';
        chip.textContent = name;
        const un = document.createElement('button');
        un.textContent = '✕ unblock';
        un.onclick = () => {
          if (!commitLocalChatBlock(c.save, name, false)) {
            c.ui.toast(`Could not unblock ${name} on this device. Try again.`);
            return;
          }
          c.ui.toast(`${name} unblocked`);
          renderBody(c);
        };
        chip.appendChild(un);
        row.appendChild(chip);
      }
      det.appendChild(row);
      content.appendChild(det);
    }

    // Composer.
    const composer = document.createElement('div');
    composer.className = 'uvchat-composer';
    const input = document.createElement('input');
    input.className = 'uvchat-input';
    input.maxLength = 120;
    input.placeholder = 'Message… (filtered)';
    input.setAttribute('aria-label', 'Chat message');
    const sendBtn = c.ui.button('Send', () => send(c, input), { primary: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); send(c, input); }
    });
    composer.append(input, sendBtn);
    content.appendChild(composer);
    queueMicrotask(() => input.focus());
  }

  function appendMessage(c, m, target) {
    const logEl = target || dock.querySelector('.uvchat-log');
    if (!logEl) return;
    const placeholder = logEl.querySelector('.uvchat-sys');
    if (placeholder) placeholder.remove();

    const wrap = document.createElement('div');
    wrap.className = 'uvchat-msg' + (m.self ? ' self' : '');
    const meta = document.createElement('div');
    meta.className = 'uvchat-meta';
    const who = document.createElement('span');
    who.textContent = m.self ? 'You' : m.from;
    meta.appendChild(who);

    if (!m.self) {
      const rep = document.createElement('button');
      rep.className = 'uvchat-act';
      rep.textContent = 'report';
      rep.title = 'Report this message';
      rep.onclick = () => reportMessage(c, m);
      const blk = document.createElement('button');
      blk.className = 'uvchat-act';
      blk.textContent = 'block';
      blk.title = `Block ${m.from}`;
      blk.onclick = () => blockSender(c, m.from);
      meta.append(rep, blk);
    }
    const bubble = document.createElement('div');
    bubble.className = 'uvchat-bubble';
    bubble.textContent = m.text;
    wrap.append(meta, bubble);
    logEl.appendChild(wrap);
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function send(c, input) {
    const raw = input.value;
    if (!raw.trim() || sending) return;
    const now = Date.now();
    if (now - lastSentAt < SEND_COOLDOWN_MS) {
      c.ui.toast('Slow down a little 😊');
      return;
    }
    // Client-side filter FIRST — blocked text never leaves the client.
    const f = filterChatText(raw);
    if (!f.ok) {
      input.value = '';
      c.ui.toast('That message isn’t allowed here 🌱');
      console.log('[chat] blocked by filter:', f.hits);
      return;
    }
    sending = true;
    try {
      const res = await Promise.resolve(c.pn.chatSend(f.clean));
      const echoed = res && typeof res.filtered === 'string' ? res.filtered : f.clean;
      // Defense in depth: re-filter whatever comes back before display/emit.
      const f2 = filterChatText(echoed);
      if (!f2.ok) { c.ui.toast('That message isn’t allowed here 🌱'); return; }
      lastSentAt = Date.now();
      input.value = '';
      c.bus.emit('chat-message', { from: myName(c), text: f2.clean });
    } catch (e) {
      console.error('[chat] send failed', e);
      c.ui.toast('Message didn’t send — try again');
    } finally {
      sending = false;
    }
  }

  async function reportMessage(c, m) {
    const ok = await c.ui.confirm(
      `Report this message from ${m.from}?\n“${m.text.slice(0, 80)}”`
    );
    if (!ok) return;
    const saved = appendLocalModerationRecord(c.save, {
      id: 'chat-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36),
      type: 'chat',
      from: m.from,
      text: m.text,
      reporter: myName(c),
      reason: 'user-report',
      status: 'pending',
      at: new Date().toISOString(),
    });
    c.ui.toast(saved
      ? 'Report saved on this device · reporter name kept as a local snapshot. 🛡️'
      : 'Could not save this report on this device. Check browser storage and try again.');
  }

  async function blockSender(c, name) {
    if (name === myName(c)) return;
    const ok = await c.ui.confirm(`Block ${name}? You won’t see their messages anymore.`);
    if (!ok) return;
    if (!commitLocalChatBlock(c.save, name, true)) {
      c.ui.toast(`Could not block ${name} on this device. Try again.`);
      return;
    }
    c.ui.toast(`${name} blocked`);
    renderBody(c); // re-render without their messages
  }

  function isBlocked(c, name) {
    return readLocalChatBlocked(c.save).includes(name);
  }

  function closeFromInside(c) {
    const sys = c.systems.get('chat');
    if (sys && sys.close) sys.close();
  }
}
