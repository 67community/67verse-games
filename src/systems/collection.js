// collection.js — Character Collection system panel (spec §8).
// Shelf grid of every character in ctx.characters.ROSTER with lightweight 3D
// previews (one shared offscreen WebGLRenderer, visible/dirty cards only,
// disposed on close), owned vs locked states ('ownedChars' save
// key), equip flow via ctx.characters.equip (persists 'equipped' and emits
// bus 'character-equipped'), and a skin-tone swatch row that persists
// settings.skinTone. Self-registers at import time.
import { registerSystem } from '../core/registry.js';

const DEFAULT_TONES = ['#f6dfc4', '#f2c9a0', '#e0ac7e', '#c98a5e', '#a06a42', '#7a4c2e'];
const FALLBACK_TONE = '#f2c9a0';
const DEFAULT_OWNED = ['ghost', 'kid']; // starter shelf until the shop/grant flow fills 'ownedChars'
const PREVIEW_W = 132;
const PREVIEW_H = 168;
const RENDER_PER_TICK = 2;
const PREVIEW_FRAME_TIME = 1 / 12;

const CSS = `
.col-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px}
.col-card{background:#f5f5f7;border:1px solid #e5e5ea;border-radius:10px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px}
.col-preview{width:${PREVIEW_W}px;height:${PREVIEW_H}px;border-radius:14px;background:linear-gradient(180deg,#ffffff,#eae4d9);overflow:hidden;position:relative;border:1px solid #eae4d9}
.col-preview canvas{width:100%;height:100%;display:block}
.col-card.locked .col-preview canvas{filter:grayscale(.9);opacity:.5}
.col-lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px;pointer-events:none}
.col-name{font-weight:600;font-size:14px;color:#060c21}
.col-chip{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:5px 11px;border-radius:8px;background:#eae4d9;border:1px solid #e5e5ea;color:#9a9aa2}
.col-chip.equipped{background:#5a9c7a;border-color:#5a9c7a;color:#ffffff}
.col-swatchrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid #e5e5ea}
.col-swatchlabel{font-weight:500;color:#9a9aa2;font-size:13px;margin-right:2px}
.col-swatch{width:34px;height:34px;border-radius:999px;border:2px solid #e5e5ea;cursor:pointer;padding:0}
.col-swatch.sel{outline:3px solid #9a9aa2;outline-offset:2px}
.col-note{font-size:12px;color:#9a9aa2;margin-top:10px}
`;

let session = null;

registerSystem('collection', {
  open(ctx) {
    if (session) return;
    session = createSession(ctx);
  },
  close() {
    // panel.close() removes the veil and fires onClose -> session.destroy()
    if (session) session.panel.close();
  },
});

function createSession(ctx) {
  const THREE = ctx.THREE;
  let destroyed = false;

  // ---------- Scoped styles (removed on destroy) ----------
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // ---------- Panel ----------
  const panel = ctx.ui.panel({ title: 'Character Collection', onClose: () => api.destroy() });

  // ---------- Shared preview renderer (ONE extra GL context, disposed on close) ----------
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  previewRenderer.setPixelRatio(ratio);
  previewRenderer.setSize(PREVIEW_W, PREVIEW_H, false);
  previewRenderer.setClearColor(0x000000, 0);
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  previewRenderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2de, 0xd8c4a8, 1.0));
  const key = new THREE.DirectionalLight(0xffe2b8, 1.6);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, PREVIEW_W / PREVIEW_H, 0.1, 20);
  camera.position.set(0, 1.2, 3.6);
  camera.lookAt(0, 0.95, 0);

  // ---------- State ----------
  const ownedSet = new Set(ctx.save.get('ownedChars', DEFAULT_OWNED));
  // The Collection reflects the durable user choice, even when gameplay
  // temporarily substitutes a production-safe fallback for that selection.
  ownedSet.add(ctx.characters.selectedId());
  ownedSet.add(ctx.characters.equippedId());
  let currentTone = (ctx.save.settings && ctx.save.settings.skinTone) || FALLBACK_TONE;
  const tones = ctx.save.get('skinTones', DEFAULT_TONES);

  // ---------- Cards ----------
  const grid = document.createElement('div');
  grid.className = 'col-grid';

  const cards = ctx.characters.ROSTER.map((def, i) => {
    const owned = ownedSet.has(def.id);
    const card = document.createElement('div');
    card.className = 'col-card' + (owned ? '' : ' locked');

    const wrap = document.createElement('div');
    wrap.className = 'col-preview';
    const canvas = document.createElement('canvas');
    canvas.width = PREVIEW_W * ratio;
    canvas.height = PREVIEW_H * ratio;
    wrap.appendChild(canvas);
    if (!owned) {
      const lock = document.createElement('div');
      lock.className = 'col-lock';
      lock.textContent = '🔒';
      wrap.appendChild(lock);
    }

    const name = document.createElement('div');
    name.className = 'col-name';
    name.textContent = def.name;

    const chip = document.createElement('span');
    chip.className = 'col-chip';

    const btn = ctx.ui.button('', () => {});
    card.append(wrap, name, chip, btn);
    grid.appendChild(card);

    const entry = {
      def, owned, card, canvas, chip, btn,
      ctx2d: canvas.getContext('2d'),
      instance: null,
      group: null,
      phase: i * 0.7,
      baseYaw: 0.3,
      visible: true,
      dirty: true,
    };
    if (owned) {
      btn.textContent = 'Equip';
      btn.onclick = () => {
        if (!ctx.characters.equip(def.id)) {
          ctx.ui.toast('Character could not be saved on this device. Your previous character is still equipped.');
          refreshEquipStates();
          return;
        }
        ctx.ui.toast(def.name + ' equipped!');
        refreshEquipStates();
      };
    } else {
      btn.textContent = 'Locked';
      btn.disabled = true;
      card.addEventListener('click', () => {
        ctx.ui.toast(def.name + ' is locked — visit the Shop to unlock it!');
      });
    }
    return entry;
  });

  function refreshEquipStates() {
    const eq = ctx.characters.selectedId();
    for (const c of cards) {
      if (!c.owned) { c.chip.textContent = 'Locked'; continue; }
      const isEq = c.def.id === eq;
      c.chip.textContent = isEq ? 'Equipped' : 'Owned';
      c.chip.classList.toggle('equipped', isEq);
      c.btn.textContent = isEq ? 'Equipped ✓' : 'Equip';
      c.btn.disabled = isEq;
      c.btn.classList.toggle('primary', isEq);
      c.dirty = true;
    }
  }
  refreshEquipStates();
  panel.body.appendChild(grid);

  // ---------- Skin-tone swatches ----------
  const toneRow = document.createElement('div');
  toneRow.className = 'col-swatchrow';
  const toneLabel = document.createElement('span');
  toneLabel.className = 'col-swatchlabel';
  toneLabel.textContent = 'Skin tone';
  toneRow.appendChild(toneLabel);

  const swatches = tones.map((hex) => {
    const sw = document.createElement('button');
    sw.className = 'col-swatch';
    sw.style.background = hex;
    sw.title = 'Skin tone ' + hex;
    sw.setAttribute('aria-label', 'Skin tone ' + hex);
    sw.onclick = () => applyTone(hex);
    toneRow.appendChild(sw);
    return sw;
  });
  panel.body.appendChild(toneRow);

  const note = document.createElement('div');
  note.className = 'col-note';
  note.textContent = 'Skin tone applies to humanoid characters.';
  panel.body.appendChild(note);

  function markSwatches() {
    tones.forEach((hex, i) => swatches[i].classList.toggle('sel', hex === currentTone));
  }
  markSwatches();

  function applyTone(hex) {
    if (hex === currentTone) return;
    const previousTone = currentTone;
    currentTone = hex; // suppress our synchronous settings-changed echo
    if (!ctx.save.setSettings({ ...ctx.save.settings, skinTone: hex })) {
      currentTone = previousTone;
      ctx.ui.toast('Look could not be saved on this device. Your previous skin tone is still active.');
      markSwatches();
      return;
    }
    markSwatches();
    rebuildHumanoids(hex);
  }

  // Rebuild humanoid previews with the new tone.
  async function rebuildHumanoids(hex) {
    for (const c of cards) {
      if (!c.def.humanoid) continue;
      try {
        const instance = await ctx.characters.createInstance(c.def.id, {
          skinTone: hex,
          lod: 'crowd',
          shadow: 'none',
        });
        if (destroyed || hex !== currentTone) {
          instance.dispose();
          continue;
        }
        const old = c.instance;
        c.instance = instance;
        c.group = instance.root;
        c.dirty = true;
        old?.dispose();
      } catch (e) { console.warn('[collection] tone rebuild failed', c.def.id, e); }
    }
  }

  // ---------- Preview instances ----------
  for (const c of cards) {
    ctx.characters.createInstance(c.def.id, {
      skinTone: currentTone,
      lod: 'crowd',
      shadow: 'none',
    })
      .then((instance) => {
        if (destroyed) { instance.dispose(); return; }
        c.instance = instance;
        c.group = instance.root;
        renderCard(c); // first paint immediately
      })
      .catch((e) => console.warn('[collection] preview build failed', c.def.id, e));
  }

  // Only cards intersecting the panel viewport are eligible for animation.
  const visibility = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const c = cards.find((card) => card.card === entry.target);
        if (!c) continue;
        c.visible = entry.isIntersecting;
        if (c.visible) c.dirty = true;
      }
    }, { root: panel.body, rootMargin: '40px' })
    : null;
  if (visibility) {
    for (const c of cards) {
      c.visible = false;
      visibility.observe(c.card);
    }
  }

  // ---------- Visible/dirty preview loop (stopped on destroy) ----------
  let t = 0;
  let paintAcc = 0;
  let cursor = 0;
  const stop = ctx.loop.add((dt) => {
    t += dt;
    paintAcc += dt;
    if (paintAcc < PREVIEW_FRAME_TIME) return;
    paintAcc %= PREVIEW_FRAME_TIME;
    let n = 0;
    const total = cards.length;
    for (let i = 0; i < total && n < RENDER_PER_TICK; i++) {
      const c = cards[(cursor + i) % total];
      if (!c.group || !c.visible) continue;
      const isEquipped = c.def.id === ctx.characters.selectedId();
      const animate = isEquipped || c.card.matches(':hover');
      if (!c.dirty && !animate) continue;
      if (animate) c.group.rotation.y = c.baseYaw + Math.sin(t * 0.9 + c.phase) * 0.5;
      renderCard(c);
      c.dirty = false;
      n++;
    }
    cursor = (cursor + RENDER_PER_TICK) % total;
  });

  function renderCard(c) {
    scene.add(c.group);
    previewRenderer.render(scene, camera);
    scene.remove(c.group);
    c.ctx2d.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.ctx2d.drawImage(previewRenderer.domElement, 0, 0, c.canvas.width, c.canvas.height);
  }

  // ---------- React to skin-tone changes from the settings panel ----------
  const onSettings = (s) => {
    if (destroyed || !s || !s.skinTone || s.skinTone === currentTone) return;
    currentTone = s.skinTone;
    markSwatches();
    rebuildHumanoids(s.skinTone);
  };
  ctx.bus.on('settings-changed', onSettings);

  const api = {
    panel,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop(); // remove ctx.loop ticker
      visibility?.disconnect();
      ctx.bus.off('settings-changed', onSettings);
      for (const c of cards) {
        c.instance?.dispose();
        c.instance = null;
        c.group = null;
        c.btn.onclick = null;
      }
      previewRenderer.dispose();
      if (previewRenderer.forceContextLoss) previewRenderer.forceContextLoss();
      style.remove();
      if (session === api) session = null;
    },
  };
  return api;
}
