// cosmetics.js — The Closet (SPEC-GAME.md §5): collectible primitive cosmetics
// (hats, glasses, backpacks) layered on the shared ~1.9u character body.
//
// Save keys (via ctx.save, JSON, namespaced "67v." by save.js):
//   'ownedCosmetics'    -> string[] of owned cosmetic ids.
//                          Default = STARTERS below (free starters, kid-safe:
//                          nothing here is sold; the Shop module grants more).
//   'equippedCosmetics' -> { hat: id|null, glasses: id|null, backpack: id|null }
//
// Bus events:
//   listens 'player-ready'        -> { group|rig|player } (optional payload).
//                                    Re-finds the hub player rig and re-applies.
//   listens 'character-equipped'  -> { id }. Re-applies after a character swap.
//   emits   'cosmetic-equipped'   -> { id, slot }
//   emits   'cosmetic-unequipped' -> { slot }
//
// Canonical character instances expose named anchors. Older preview callers can
// still pass a plain Group and use the legacy fixed offsets as a fallback.
import * as THREE from 'three';
import { registerSystem, registerHook } from '../core/registry.js';

// ---------- Palette (ARCHITECTURE.md) ----------
const C = {
  cream: 0xf4efe7, beige: 0xeae4d9, ink: 0x2a2724, line: 0xddd4c6,
  terra: 0xd0775e, sage: 0x5a9c7a, yellow: 0xe8b64a, plum: 0x8a6fb0, rose: 0xc46f8e,
};

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, ...extra });
}
function shadowed(g) {
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return g;
}

// ---------- Bone anchors ----------
// Character-local space: character is ~1.9u tall, feet at y=0, faces +Z
// (same convention as characters.buildMesh). Every cosmetic def names one of
// these bones plus an optional extra offset/rotation/scale.
export const COSMETIC_BONES = {
  head: { pos: [0, 1.42, 0] },   // head center (hats perch relative to this)
  face: { pos: [0, 1.48, 0.42] }, // just in front of the eyes (glasses)
  back: { pos: [0, 0.85, -0.30] }, // behind the body (backpacks)
};

// ---------- Cosmetic catalogue (>=6, primitives only, original designs) ----------
// build(THREE) returns a Group whose origin is the bone anchor point.
export const COSMETICS = [
  {
    id: 'beanie_sunny', name: 'Sunny Beanie', emoji: '🧢', slot: 'hat',
    anchor: { bone: 'head', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    build(T) {
      const g = new T.Group();
      const dome = new T.Mesh(new T.SphereGeometry(0.40, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.yellow));
      dome.scale.set(1, 0.72, 1); dome.position.y = 0.36;
      const cuff = new T.Mesh(new T.CylinderGeometry(0.41, 0.43, 0.15, 18), mat(C.terra));
      cuff.position.y = 0.36;
      const pom = new T.Mesh(new T.SphereGeometry(0.11, 10, 8), mat(0xfbf8f2));
      pom.position.y = 0.68;
      g.add(dome, cuff, pom);
      return shadowed(g);
    },
  },
  {
    id: 'cap_terra', name: 'Skate Cap', emoji: '🧢', slot: 'hat',
    anchor: { bone: 'head', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    build(T) {
      const g = new T.Group();
      const dome = new T.Mesh(new T.SphereGeometry(0.40, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.terra));
      dome.scale.set(1, 0.6, 1); dome.position.y = 0.34;
      const brim = new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.42), mat(C.terra));
      brim.position.set(0, 0.30, 0.48);
      const button = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), mat(C.cream));
      button.position.y = 0.60;
      g.add(dome, brim, button);
      return shadowed(g);
    },
  },
  {
    id: 'crown_plum', name: 'Plum Crown', emoji: '👑', slot: 'hat',
    anchor: { bone: 'head', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    build(T) {
      const g = new T.Group();
      const band = new T.Mesh(new T.CylinderGeometry(0.30, 0.32, 0.20, 16), mat(C.plum));
      band.position.y = 0.56;
      g.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new T.Mesh(new T.ConeGeometry(0.075, 0.18, 8), mat(C.yellow));
        spike.position.set(Math.cos(a) * 0.27, 0.74, Math.sin(a) * 0.27);
        g.add(spike);
      }
      const gem = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), mat(C.rose));
      gem.position.set(0, 0.56, 0.32);
      g.add(gem);
      return shadowed(g);
    },
  },
  {
    id: 'specs_round', name: 'Round Specs', emoji: '👓', slot: 'glasses',
    anchor: { bone: 'face', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    build(T) {
      const g = new T.Group();
      const frame = mat(C.ink, { roughness: 0.3 });
      for (const sx of [-1, 1]) {
        const lens = new T.Mesh(new T.TorusGeometry(0.14, 0.028, 8, 20), frame);
        lens.position.set(sx * 0.19, 0.02, 0.03);
        g.add(lens);
        const temple = new T.Mesh(new T.BoxGeometry(0.03, 0.03, 0.42), frame);
        temple.position.set(sx * 0.33, 0.04, -0.18);
        g.add(temple);
      }
      const bridge = new T.Mesh(new T.BoxGeometry(0.12, 0.03, 0.03), frame);
      bridge.position.set(0, 0.04, 0.03);
      g.add(bridge);
      return shadowed(g);
    },
  },
  {
    id: 'shades_star', name: 'Star Shades', emoji: '🕶️', slot: 'glasses',
    anchor: { bone: 'face', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    build(T) {
      const g = new T.Group();
      for (const sx of [-1, 1]) {
        const lens = new T.Mesh(new T.OctahedronGeometry(0.17), mat(C.rose, { roughness: 0.25 }));
        lens.scale.set(1, 1, 0.35);
        lens.position.set(sx * 0.19, 0.03, 0.04);
        g.add(lens);
        const temple = new T.Mesh(new T.BoxGeometry(0.035, 0.035, 0.4), mat(C.yellow));
        temple.position.set(sx * 0.34, 0.05, -0.17);
        g.add(temple);
      }
      const bridge = new T.Mesh(new T.BoxGeometry(0.1, 0.035, 0.035), mat(C.yellow));
      bridge.position.set(0, 0.06, 0.04);
      g.add(bridge);
      return shadowed(g);
    },
  },
  {
    id: 'pack_sage', name: 'Sage Pack', emoji: '🎒', slot: 'backpack',
    anchor: { bone: 'back', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    build(T) {
      const g = new T.Group();
      const body = new T.Mesh(new T.BoxGeometry(0.52, 0.58, 0.26), mat(C.sage));
      body.position.set(0, 0, -0.18);
      const flap = new T.Mesh(new T.BoxGeometry(0.54, 0.18, 0.28), mat(C.beige));
      flap.position.set(0, 0.24, -0.18);
      const pocket = new T.Mesh(new T.BoxGeometry(0.3, 0.22, 0.08), mat(C.yellow));
      pocket.position.set(0, -0.12, -0.33);
      g.add(body, flap, pocket);
      for (const sx of [-1, 1]) {
        const strap = new T.Mesh(new T.BoxGeometry(0.08, 0.5, 0.05), mat(C.terra));
        strap.position.set(sx * 0.19, 0.05, -0.02);
        g.add(strap);
      }
      return shadowed(g);
    },
  },
  {
    id: 'pack_wings', name: 'Cloud Wings', emoji: '🪽', slot: 'backpack',
    anchor: { bone: 'back', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    build(T) {
      const g = new T.Group();
      const hub = new T.Mesh(new T.BoxGeometry(0.2, 0.24, 0.1), mat(C.beige));
      hub.position.set(0, 0, -0.12);
      g.add(hub);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const feather = new T.Mesh(new T.ConeGeometry(0.09, 0.42 - i * 0.08, 8), mat(0xfbf8f2));
          feather.scale.z = 0.45;
          feather.rotation.z = sx * (Math.PI / 2 + 0.35 + i * 0.28);
          feather.position.set(sx * (0.24 + i * 0.13), 0.08 + i * 0.1, -0.14);
          g.add(feather);
        }
      }
      return shadowed(g);
    },
  },
];

const COSMETIC_BY_ID = new Map(COSMETICS.map((d) => [d.id, d]));
const SLOT_IDS = ['hat', 'glasses', 'backpack'];
const SLOT_LABEL = { hat: 'Hats', glasses: 'Glasses', backpack: 'Backpacks' };
// Clean line-icons per slot — no emoji, Apple-style.
const SLOT_ICON = {
  hat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 16a8.5 8.5 0 0 1 17 0"/><rect x="2" y="16" width="20" height="3.2" rx="1.6"/></svg>',
  glasses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="13" r="3.4"/><circle cx="17.5" cy="13" r="3.4"/><path d="M9.9 13c.8-1 3.4-1 4.2 0"/><path d="M3.4 11 5 7.2h2"/><path d="M20.6 11 19 7.2h-2"/></svg>',
  backpack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="7" width="12" height="14" rx="4.5"/><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5"/><rect x="9.5" y="12" width="5" height="4.6" rx="1.4"/></svg>',
};
// Most cosmetics are a purchase; the two starters stay free. Prices in coins.
const PRICES = { beanie_sunny: 0, specs_round: 0, cap_terra: 120, crown_plum: 260, shades_star: 200, pack_sage: 180, pack_wings: 320 };
const priceOf = (id) => (PRICES[id] ?? 150);
// You start with nothing — every item is picked up in the Closet itself.
const STARTERS = [];
// Trial phase: everything is free so the whole wardrobe can be tested end to
// end. PRICES above stays as the future price list — flip this back to turn
// the paid flow on again.
const FREE_TRIAL = true;

// ---------- ctx / save helpers ----------
let ctxRef = null;
function getOwned() {
  const owned = ctxRef.save.get('ownedCosmetics', STARTERS);
  return Array.isArray(owned) ? owned : STARTERS;
}
function getEquipped() {
  const eq = ctxRef.save.get('equippedCosmetics', { hat: null, glasses: null, backpack: null });
  return { hat: null, glasses: null, backpack: null, ...(eq || {}) };
}

// ---------- Attachment (mirrors the proposed ctx.characters.attach contract) ----------
const builtCache = new Map(); // cosmetic id -> template; every wearer gets a clone

export function attachCosmetic(character, def) {
  const bone = COSMETIC_BONES[def.anchor.bone] || COSMETIC_BONES.head;
  const namedAnchor = character?.anchors?.[def.anchor.bone] || null;
  const charGroup = namedAnchor || character?.root || character;
  if (!charGroup?.isObject3D) return null;
  const holder = new THREE.Group();
  holder.name = 'cosmetic:' + def.id;
  if (!namedAnchor) holder.position.fromArray(bone.pos);
  if (def.anchor.position) holder.position.add(new THREE.Vector3().fromArray(def.anchor.position));
  if (def.anchor.rotation) holder.rotation.set(def.anchor.rotation[0], def.anchor.rotation[1], def.anchor.rotation[2]);
  if (def.anchor.scale && def.anchor.scale !== 1) holder.scale.setScalar(def.anchor.scale);
  let template = builtCache.get(def.id);
  if (!template) { template = def.build(THREE); builtCache.set(def.id, template); }
  const item = template.clone(true);
  holder.add(item);
  charGroup.add(holder);
  return holder;
}

let attachedCosmetics = [];
function applyCosmetics(character) {
  if (!ctxRef || !character) return;
  for (const holder of attachedCosmetics) holder.removeFromParent();
  attachedCosmetics = [];
  const owned = new Set(getOwned());
  const eq = getEquipped();
  for (const slot of SLOT_IDS) {
    const id = eq[slot];
    if (id && owned.has(id) && COSMETIC_BY_ID.has(id)) {
      const holder = attachCosmetic(character, COSMETIC_BY_ID.get(id));
      if (holder) attachedCosmetics.push(holder);
    }
  }
}

// ---------- Player rig locator (shared with emotes.js) ----------
// main.js does not expose the hub player rig on ctx, so we locate it via the
// 'hub' hook (scene + getSim) by matching a top-level Group to the sim
// position, and we also honor a 'player-ready' bus event if integration emits
// one with the rig in the payload.
let hubRef = null;
let rig = null;
let characterInstance = null;
const rigWatchers = new Set();

export function getPlayerRig() { return rig; }
export function getPlayerCharacter() { return characterInstance; }
export function onPlayerRig(fn) {
  rigWatchers.add(fn);
  if (rig) fn(rig);
  return () => rigWatchers.delete(fn);
}
function setRig(r) {
  if (r === rig) return;
  rig = r;
  if (r) applyCosmetics(characterInstance || r);
  for (const fn of rigWatchers) {
    try { fn(r); } catch (e) { console.error('[cosmetics] rig watcher', e); }
  }
}
function setCharacter(instance) {
  characterInstance = instance || null;
  setRig(instance?.root || null);
}
function setFallbackRig(nextRig) {
  characterInstance = null;
  setRig(nextRig);
}
// main.js repositions the player rig to sim.pos every frame, so the true rig
// is the top-level Group that FOLLOWS the sim. Static world/decoration groups
// can coincide with sim.pos momentarily (e.g. player standing at the origin),
// so we confirm by movement correlation, with a ~4s idle fallback.
let pendingRig = null; // { obj, x, z, hits }
function scanForRig() {
  if (!hubRef || !hubRef.scene || !hubRef.getSim) return;
  const sim = hubRef.getSim();
  if (!sim || !sim.pos) return;
  const worldGroup = hubRef.world && hubRef.world.group;
  let match = null;
  for (const child of hubRef.scene.children) {
    if (!child.isGroup || child === worldGroup) continue;
    if (Math.abs(child.position.x - sim.pos.x) < 0.05
      && Math.abs(child.position.z - sim.pos.z) < 0.05) {
      match = child;
      break;
    }
  }
  if (!match) { pendingRig = null; return; }
  if (pendingRig && pendingRig.obj === match) {
    const simMoved = Math.hypot(sim.pos.x - pendingRig.x, sim.pos.z - pendingRig.z) > 0.02;
    if (simMoved) { pendingRig = null; setFallbackRig(match); return; } // it followed the sim: confirmed
    if (++pendingRig.hits > 240) { pendingRig = null; setFallbackRig(match); } // idle fallback
  } else {
    pendingRig = { obj: match, x: sim.pos.x, z: sim.pos.z, hits: 0 };
  }
}

// ---------- Equip / unequip ----------
export function persistEquippedCosmetics(save, equipped) {
  return save?.set?.('equippedCosmetics', equipped) === true;
}

function equip(id) {
  const def = COSMETIC_BY_ID.get(id);
  if (!def || !getOwned().includes(id)) return false;
  const eq = getEquipped();
  eq[def.slot] = id;
  if (!persistEquippedCosmetics(ctxRef.save, eq)) return false;
  applyCosmetics(characterInstance || rig);
  ctxRef.bus.emit('cosmetic-equipped', { id, slot: def.slot });
  return true;
}
function unequip(slot) {
  const eq = getEquipped();
  if (!eq[slot]) return false;
  eq[slot] = null;
  if (!persistEquippedCosmetics(ctxRef.save, eq)) return false;
  applyCosmetics(characterInstance || rig);
  ctxRef.bus.emit('cosmetic-unequipped', { slot });
  return true;
}
// Direct purchase from the Closet. Provisional unlock (trial): the item is
// added to the owned set and persisted — the same way the character picker
// unlocks — with a real coin-spend / IAP hook slotting in here later.
function buy(id) {
  const owned = getOwned();
  if (owned.includes(id)) return true;
  return ctxRef.save.set('ownedCosmetics', [...owned, id]) === true;
}

// ---------- Closet panel ----------
let panel = null;

const CLOSET_CSS = `
.closet-premium { font-family: inherit; }
.closet-premium .cp-intro { margin: 0 0 6px; color: #6b7280; font-size: 13.5px; line-height: 1.55; }
.closet-premium .cp-slot-head { display: flex; align-items: center; gap: 9px; font-weight: 700;
  font-size: 12.5px; letter-spacing: 0.05em; text-transform: uppercase; color: #111827; margin: 20px 0 11px; }
.closet-premium .cp-slot-head svg { width: 19px; height: 19px; color: #2d6cdf; flex: none; }
.closet-premium .cp-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.closet-premium .cp-card { width: 132px; background: #fff; border: 1.5px solid #eceef2; border-radius: 16px;
  padding: 12px 10px 13px; display: flex; flex-direction: column; align-items: center; gap: 7px;
  box-shadow: 0 4px 14px #0000000a; transition: transform .14s, border-color .14s, box-shadow .14s; }
.closet-premium .cp-card:hover { transform: translateY(-3px); box-shadow: 0 10px 24px #00000014; }
.closet-premium .cp-card.equipped { border-color: #2d6cdf; box-shadow: 0 8px 22px #2d6cdf22; }
.closet-premium .cp-thumb { width: 90px; height: 90px; border-radius: 13px;
  background: radial-gradient(120% 120% at 50% 22%, #f4f7fb, #e7ecf4);
  display: flex; align-items: center; justify-content: center; }
.closet-premium .cp-thumb img { width: 82px; height: 82px; }
.closet-premium .cp-name { font-weight: 650; font-size: 12.5px; color: #111827; text-align: center; line-height: 1.25; }
.closet-premium .cp-price { font-size: 11.5px; color: #8a93a3; height: 15px; }
.closet-premium .cp-btn { border: none; border-radius: 10px; padding: 8px 14px; font-size: 12.5px;
  font-weight: 650; cursor: pointer; width: 100%; transition: transform .12s, opacity .12s; }
.closet-premium .cp-btn:hover { transform: scale(1.03); }
.closet-premium .cp-btn.equip { background: #17223a; color: #fff; }
.closet-premium .cp-btn.equipped { background: #eef2fb; color: #2d6cdf; }
.closet-premium .cp-btn.buy { background: #c8892f; color: #fff; }
`;
let cssInjected = false;
function ensureClosetCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CLOSET_CSS;
  document.head.appendChild(s);
}

// Small one-shot preview renderer: renders each item to a thumbnail data URL,
// then disposes itself immediately (allowed per ARCHITECTURE.md).
function renderThumbnails() {
  const thumbs = new Map();
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (e) {
    console.warn('[cosmetics] thumbnail renderer unavailable', e);
    return thumbs; // cards fall back to emoji
  }
  try {
    renderer.setPixelRatio(2);
    renderer.setSize(104, 104);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff2de, 0xd8c4a8, 1.15));
    const dir = new THREE.DirectionalLight(0xffe2b8, 1.5);
    dir.position.set(2, 3, 4);
    scene.add(dir);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    for (const def of COSMETICS) {
      const item = def.build(THREE); // fresh copy — never borrow the rig's cached mesh
      const box = new THREE.Box3().setFromObject(item);
      const center = box.getCenter(new THREE.Vector3());
      item.position.sub(center);
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.2);
      const wrap = new THREE.Group();
      wrap.add(item);
      scene.add(wrap);
      const dist = (radius / Math.tan((cam.fov * Math.PI) / 360)) * 1.15;
      cam.position.set(dist * 0.55, dist * 0.4, dist * 0.85);
      cam.lookAt(0, 0, 0);
      renderer.render(scene, cam);
      try { thumbs.set(def.id, renderer.domElement.toDataURL()); } catch {}
      scene.remove(wrap);
      item.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
  } finally {
    try { renderer.dispose(); } catch {}
  }
  return thumbs;
}

function cardEl(def, { equipped, owned, thumb }) {
  const card = document.createElement('div');
  card.className = 'cp-card' + (equipped ? ' equipped' : '');

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'cp-thumb';
  if (thumb) {
    const img = document.createElement('img');
    img.src = thumb;
    img.alt = def.name;
    thumbWrap.appendChild(img);
  } else {
    // no-emoji fallback: the item's initial on the soft chip.
    const ph = document.createElement('span');
    ph.textContent = def.name.slice(0, 1);
    ph.style.cssText = 'font-weight:700;font-size:30px;color:#9aa4b5;';
    thumbWrap.appendChild(ph);
  }
  card.appendChild(thumbWrap);

  const name = document.createElement('div');
  name.className = 'cp-name';
  name.textContent = def.name;
  card.appendChild(name);

  const price = document.createElement('div');
  price.className = 'cp-price';
  price.textContent = owned
    ? (equipped ? 'Equipped' : 'Owned')
    : (FREE_TRIAL ? 'Free — trial' : `${priceOf(def.id)} coins`);
  card.appendChild(price);

  const btn = document.createElement('button');
  btn.type = 'button';
  if (!owned) {
    btn.className = 'cp-btn buy';
    btn.textContent = FREE_TRIAL ? 'GET' : 'BUY';
    btn.onclick = () => {
      if (!buy(def.id)) { ctxRef.ui.toast('Purchase could not be saved on this device.'); return; }
      equip(def.id);
      ctxRef.ui.toast(def.name + ' unlocked');
      renderBody();
    };
  } else if (equipped) {
    btn.className = 'cp-btn equipped';
    btn.textContent = 'Remove';
    btn.onclick = () => {
      if (!unequip(def.slot)) { ctxRef.ui.toast('Change could not be saved on this device.'); return; }
      renderBody();
    };
  } else {
    btn.className = 'cp-btn equip';
    btn.textContent = 'Equip';
    btn.onclick = () => {
      if (!equip(def.id)) { ctxRef.ui.toast('Change could not be saved on this device.'); return; }
      renderBody(); // hub player behind the panel updates live
    };
  }
  card.appendChild(btn);
  return card;
}

let thumbCache = null;
function renderBody() {
  if (!panel) return;
  ensureClosetCss();
  panel.body.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = 'closet-premium';

  const intro = document.createElement('p');
  intro.className = 'cp-intro';
  intro.textContent = 'You start with nothing — grab any item and it goes on your character live. Everything is free during the trial.';
  wrap.appendChild(intro);

  const owned = new Set(getOwned());
  const eq = getEquipped();
  for (const slot of SLOT_IDS) {
    const head = document.createElement('div');
    head.className = 'cp-slot-head';
    head.innerHTML = `${SLOT_ICON[slot]}<span>${SLOT_LABEL[slot]}</span>`;
    wrap.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'cp-grid';
    for (const def of COSMETICS.filter((d) => d.slot === slot)) {
      grid.appendChild(cardEl(def, {
        equipped: eq[slot] === def.id,
        owned: owned.has(def.id),
        thumb: thumbCache ? thumbCache.get(def.id) : null,
      }));
    }
    wrap.appendChild(grid);
  }
  panel.body.appendChild(wrap);
}

registerSystem('cosmetics', {
  open(ctx) {
    if (panel) return;
    ctxRef = ctx;
    thumbCache = renderThumbnails();
    panel = ctx.ui.panel({
      title: 'Closet',
      onClose: () => { panel = null; thumbCache = null; },
    });
    renderBody();
  },
  close() {
    if (panel) { panel.close(); panel = null; thumbCache = null; }
  },
});

// ---------- Hooks: rig discovery + re-apply triggers ----------
// The app shell owns the always-visible Closet button so this secondary module
// can load after the base hero without changing navigation.
registerHook('boot', (ctx) => {
  ctxRef = ctx;
  // Live preview: integration may emit 'player-ready' when the hub player
  // exists (optionally carrying { group|rig|player }).
  ctx.bus.on('player-ready', (data) => {
    if (data?.instance) {
      setCharacter(data.instance);
      return;
    }
    const g = data && (data.group || data.rig || data.player);
    if (g && g.isObject3D) setFallbackRig(g);
    else scanForRig();
  });
  // Re-apply after the Collection module swaps the equipped character.
  ctx.bus.on('character-equipped', () => {
    if (ctx.hubCharacter) setCharacter(ctx.hubCharacter);
    else scanForRig();
  });
  // Cheap poll until the rig is found (or if it is silently rebuilt).
  ctx.loop.add(() => { if (!rig || !rig.parent) scanForRig(); });
}, { replay: true });

registerHook('hub', (ctx, hub) => {
  ctxRef = ctx;
  hubRef = hub;
  if (ctx.hubCharacter) setCharacter(ctx.hubCharacter);
  else scanForRig();
}, { replay: true });
