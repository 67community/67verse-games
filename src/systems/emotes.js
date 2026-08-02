// emotes.js — Emote wheel (SPEC-GAME.md §8 vibe: "playful + cool").
// HUD button + hotkey (Q) opens a radial emote wheel; each emote is a
// presentation action played by the canonical hub character animator.
//
// Bus events:
//   emits   'emote'       -> { id }        (fired when the LOCAL player emotes;
//                                           future netcode rebroadcasts this)
//   listens 'emote-play'  -> { id }        (replay hook for future netcode:
//                                           plays an emote without re-emitting)
//
// Plain-Group fallback animation remains for older preview paths.
import { registerSystem, registerHook } from '../core/registry.js';
import { getPlayerCharacter, getPlayerRig } from './cosmetics.js';

// ---------- Emote catalogue (>=3; pose(p) -> { sy, sxz, y, ry, rz }) ----------
// p in [0,1]. sy = vertical scale, sxz = horizontal scale, y = lift offset,
// ry = yaw add, rz = tilt add. Volume-preserving squash = kid-cute.
const EMOTES = [
  {
    id: 'hop', name: 'Hop', emoji: '🐰', key: '1', dur: 0.85,
    pose(p) {
      let sy = 1, y = 0;
      if (p < 0.22) { // crouch anticipation
        sy = 1 - 0.18 * Math.sin((Math.PI * p) / 0.22);
      } else if (p < 0.78) { // airborne arc + stretch
        const k = (p - 0.22) / 0.56;
        y = 0.5 * Math.sin(Math.PI * k);
        sy = 1 + 0.15 * Math.sin(Math.PI * k);
      } else { // landing squash
        sy = 1 - 0.12 * Math.sin((Math.PI * (p - 0.78)) / 0.22);
      }
      return { sy, sxz: 1 + (1 - sy) * 0.8, y, ry: 0, rz: 0 };
    },
  },
  {
    id: 'spin', name: 'Spin', emoji: '🌀', key: '2', dur: 0.9,
    pose(p) {
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
      return {
        sy: 1 - 0.1 * Math.sin(Math.PI * p),
        sxz: 1 + 0.06 * Math.sin(Math.PI * p),
        y: 0.12 * Math.sin(Math.PI * p),
        ry: Math.PI * 2 * e,
        rz: 0,
      };
    },
  },
  {
    id: 'wave', name: 'Wave', emoji: '👋', key: '3', dur: 1.25,
    pose(p) {
      const decay = 1 - p * 0.6; // whole-body happy wiggle (no arm bones yet)
      return {
        sy: 1,
        sxz: 1,
        y: 0.04 * Math.abs(Math.sin(p * Math.PI * 6)),
        ry: 0,
        rz: 0.3 * Math.sin(p * Math.PI * 6) * decay,
      };
    },
  },
  {
    id: 'groove', name: 'Groove', emoji: '🎵', key: '4', dur: 1.4,
    pose(p) {
      const b = Math.abs(Math.sin(p * Math.PI * 4));
      return {
        sy: 1 - 0.1 * b,
        sxz: 1 + 0.08 * b,
        y: 0.1 * b,
        ry: 0.35 * Math.sin(p * Math.PI * 2),
        rz: 0.1 * Math.sin(p * Math.PI * 4),
      };
    },
  },
];
const EMOTE_BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

// ---------- Animation engine (drives the shared hub player rig) ----------
let ctxRef = null;
let active = null;   // { id, t }
let cooldown = 0;

function captureBases(rig) {
  for (const child of rig.children) {
    child.userData.__emoteBase = { y: child.position.y, ry: child.rotation.y };
  }
}
function restorePose(rig) {
  rig.scale.set(1, 1, 1);
  for (const child of rig.children) {
    const b = child.userData.__emoteBase;
    if (b) { child.position.y = b.y; child.rotation.y = b.ry; }
    child.rotation.z = 0;
  }
}

function tick(dt) {
  cooldown = Math.max(0, cooldown - dt);
  const rig = getPlayerRig();
  if (!rig) { active = null; return; }
  if (active?.canonical) {
    active.t += dt;
    const def = EMOTE_BY_ID.get(active.id);
    if (!def || active.t >= def.dur) active = null;
    return;
  }
  if (!active) {
    // Idle: keep base transforms fresh (handles character/cosmetic swaps)
    // and guarantee the rig scale returns to 1.
    captureBases(rig);
    rig.scale.set(1, 1, 1);
    return;
  }
  // A child added mid-emote (e.g. a hat just equipped) joins from its base.
  for (const child of rig.children) {
    if (!child.userData.__emoteBase) {
      child.userData.__emoteBase = { y: child.position.y, ry: child.rotation.y };
    }
  }
  active.t += dt;
  const def = EMOTE_BY_ID.get(active.id);
  if (!def) { active = null; restorePose(rig); return; }
  const p = Math.min(1, active.t / def.dur);
  const pose = def.pose(p);
  rig.scale.set(pose.sxz, pose.sy, pose.sxz);
  for (const child of rig.children) {
    const b = child.userData.__emoteBase;
    child.position.y = b.y + pose.y;
    child.rotation.y = b.ry + pose.ry;
    child.rotation.z = pose.rz;
  }
  if (p >= 1) { active = null; restorePose(rig); }
}

// Trigger an emote on the local player. Emits bus 'emote' {id} so future
// netcode can rebroadcast it. Returns false if on cooldown / unknown id.
export function playEmote(ctx, id) {
  const def = EMOTE_BY_ID.get(id);
  if (!def || active || cooldown > 0) return false;
  const character = getPlayerCharacter();
  const canonical = Boolean(character);
  if (canonical && !character.animator.play(id)) return false;
  active = { id, t: 0, canonical };
  cooldown = def.dur + 0.35;
  ctx.bus.emit('emote', { id });
  return true;
}

// ---------- Emote wheel UI (radial overlay; NOT a uv-panel so the hotkey
// doesn't fight other system panels) ----------
let wheel = null; // { el, onKey, priorFocus, releaseIsolation }

function closeWheel() {
  if (!wheel) return;
  const { el, onKey, priorFocus, releaseIsolation } = wheel;
  window.removeEventListener('keydown', onKey);
  el.remove();
  releaseIsolation?.();
  wheel = null;
  const restoreTarget = (
    priorFocus instanceof HTMLElement
    && priorFocus !== document.body
    && priorFocus.isConnected
  ) ? priorFocus : document.getElementById('primary-play');
  restoreTarget?.focus();
}

function openWheel(ctx) {
  if (wheel) return;
  const priorFocus = document.activeElement;
  const el = document.createElement('div');
  el.className = 'uv-emote-wheel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:55', 'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(6,12,33,.18)', 'backdrop-filter:blur(1.5px)',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif',
  ].join(';');

  const ring = document.createElement('div');
  ring.style.cssText = 'position:relative;width:320px;height:320px;border-radius:50%;background:rgba(255,255,255,.35);border:2px dashed rgba(221,212,198,.9);';

  const center = document.createElement('div');
  center.id = 'uv-emote-wheel-title';
  center.innerHTML = '<div style="font-weight:600;font-size:14px;color:#060c21;">Emotes</div><div style="font-size:10.5px;color:#9a9aa2;margin-top:2px;">tap / press 1-' + EMOTES.length + '</div>';
  center.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;';
  el.setAttribute('aria-labelledby', center.id);
  ring.appendChild(center);

  const buttons = [];
  EMOTES.forEach((def, i) => {
    const ang = -Math.PI / 2 + (i * Math.PI * 2) / EMOTES.length;
    const x = 160 + Math.cos(ang) * 118;
    const y = 160 + Math.sin(ang) * 118;
    const b = document.createElement('button');
    b.title = def.name + ' (' + def.key + ')';
    b.style.cssText = [
      `position:absolute;left:${x - 35}px;top:${y - 35}px`, 'width:70px;height:70px;border-radius:50%',
      'border:2px solid #e5e5ea', 'background:#ffffff', 'cursor:pointer',
      'box-shadow:0 6px 18px rgba(6,12,33,.18)',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center', 'gap:1px',
    ].join(';');
    const em = document.createElement('span');
    em.textContent = def.emoji;
    em.style.fontSize = '25px';
    const nm = document.createElement('span');
    nm.textContent = def.name;
    nm.style.cssText = 'font-size:9.5px;font-weight:600;color:#9a9aa2;letter-spacing:.03em;';
    b.append(em, nm);
    b.onmouseenter = () => { b.style.borderColor = '#0A84FF'; b.style.transform = 'scale(1.08)'; };
    b.onmouseleave = () => { b.style.borderColor = '#e5e5ea'; b.style.transform = 'scale(1)'; };
    b.onclick = () => {
      if (playEmote(ctx, def.id)) ctx.ui.toast(def.emoji + ' ' + def.name + '!');
      closeWheel();
    };
    ring.appendChild(b);
    buttons.push(b);
  });

  el.appendChild(ring);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) closeWheel(); });

  const onKey = (e) => {
    if (e.code === 'Escape' || e.code === 'KeyQ') { closeWheel(); return; }
    if (e.code === 'Tab' && buttons.length) {
      e.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      const direction = e.shiftKey ? -1 : 1;
      buttons[(index + direction + buttons.length) % buttons.length].focus();
      return;
    }
    const def = EMOTES.find((em) => em.key === e.key);
    if (def) {
      if (playEmote(ctx, def.id)) ctx.ui.toast(def.emoji + ' ' + def.name + '!');
      closeWheel();
    }
  };
  window.addEventListener('keydown', onKey);

  document.body.appendChild(el);
  const releaseIsolation = ctx.ui.isolateModalLayer(el);
  wheel = { el, onKey, priorFocus, releaseIsolation };
  queueMicrotask(() => buttons[0]?.focus());
}

registerSystem('emotes', {
  open(ctx) {
    ctxRef = ctx;
    if (wheel) { closeWheel(); return; }
    openWheel(ctx);
  },
  close() { closeWheel(); },
});

// ---------- Boot: animation ticker and netcode replay hook ----------
// The app shell owns the always-visible HUD button and Q hotkey so this module
// can remain lazy without changing the immediate controls.
registerHook('boot', (ctx) => {
  ctxRef = ctx;
  ctx.loop.add(tick);
  // Future netcode: replay a remote player's emote locally (no re-emit).
  ctx.bus.on('emote-play', (data) => {
    if (!data || !data.id || !EMOTE_BY_ID.has(data.id)) return;
    if (!active && cooldown <= 0) {
      const def = EMOTE_BY_ID.get(data.id);
      const character = getPlayerCharacter();
      const canonical = Boolean(character);
      if (canonical && !character.animator.play(data.id)) return;
      active = { id: data.id, t: 0, canonical };
      cooldown = def.dur + 0.35;
    }
  });
}, { replay: true });
