// src/ugc/editor.js — 67VERSE UGC world editor ("Creator").
//
// A grid-based builder: players place reusable pieces (block, ramp, spinner,
// bounce pad, spawn pad, goal pad) on a 16x16 plot, rotate/erase them, save the world JSON
// to the `ugcWorlds` save key, and hit PLAY TEST to run the world with the
// shared stepPlayer sim (reach-the-goal win condition + timer), then return to
// the editor.
//
// Registered as:
//   - GAME  'creator'  (appears in the game-select list as "Creator")
//   - SYSTEM 'editor'  (kept from the placeholder contract; info + saved-world
//                       browser — the real builder runs as a game mount so the
//                       main.js mount/unmount lifecycle stays the single owner)
//
// Save keys used: ugcWorlds (rw), ugcPlays {version,counts} (rw),
//                 settings/equipped (read via ctx)
// Bus events emitted:
//   'ugc-save'  { id, name, pieces }                      — after a save
//   'ugc-play'  { id, name, phase:'start' }               — play test begins
//   'ugc-play'  { id, name, phase:'finish', won, time }   — play test ends
//
// The versioned schema and finite asset registry live in ./format.js.

import { registerGame, registerSystem } from '../core/registry.js';
import {
  incrementLocalCounter,
  readLocalCounterMap,
} from '../core/local-save-schema.js';
import { createPlayerState, stepPlayer, angleLerp } from '../player.js';
import {
  editorPiecesFromLevel,
  formatLocalCreatorAttribution,
  LEVEL_ASSETS,
  levelFromEditor,
  normalizeLevel,
  pieceSignature,
  UGC_GAMEPLAY_MODES,
  validateLevel,
} from './format.js';
import {
  deleteLocalWorld,
  readLocalWorlds,
  upsertLocalWorld,
} from './local-worlds.js';
import {
  createUgcStage,
  UGC_ASSET_COLORS,
} from './presentation.js';
import { creatorTemplate, UGC_TEMPLATES } from './templates.js';

const SIM_DT = 1 / 60;
const GRID = 16;                 // cells per side
const HALF = GRID / 2;           // 8 — plot spans [-8, 8] on x/z
const PIECE_H = 0.6;             // block height / ramp rise (jumpable: apex ~0.63)
const MAX_PIECES = 96;
const BOUNCE = LEVEL_ASSETS['play.bounce'].runtime;

const TOOLS = [
  { t: 'block',   emoji: '🧱', label: 'Block' },
  { t: 'ramp',    emoji: '◢',  label: 'Ramp' },
  { t: 'spinner', emoji: '🌀', label: 'Spinner' },
  { t: 'bounce',  emoji: '↟',  label: 'Bounce Pad' },
  { t: 'score',   emoji: '⭐', label: 'Score Star' },
  { t: 'spawn',   emoji: '🚩', label: 'Spawn' },
  { t: 'goal',    emoji: '🏁', label: 'Goal' },
];

const COLORS = UGC_ASSET_COLORS;

const CSS = `
.uge-root{position:fixed;inset:0;z-index:40;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#060c21}
.uge-bar{position:absolute;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;pointer-events:auto;background:rgba(255,255,255,.94);border:1px solid #e5e5ea;border-radius:10px;box-shadow:0 8px 24px rgba(6,12,33,.14);padding:8px 12px;max-width:94vw}
.uge-top{top:calc(env(safe-area-inset-top) + 12px)}
.uge-bottom{bottom:calc(env(safe-area-inset-bottom) + 14px)}
.uge-title{font-weight:600;font-size:15px;letter-spacing:-.01em;padding:0 4px}
.uge-name{font-size:13px;color:#9a9aa2;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uge-status{font-size:11px;font-weight:500;color:#4e4d4d;padding:5px 8px;border-radius:999px;background:#f5f5f7;white-space:nowrap}
.uge-toolstrip{display:flex;gap:6px;align-items:center;justify-content:center;flex-basis:100%;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;padding:1px}
.uge-tool{border:1px solid #e5e5ea;background:#f5f5f7;border-radius:10px;padding:8px 10px;font:600 13px -apple-system,system-ui,sans-serif;cursor:pointer;color:#060c21}
.uge-tool:hover{border-color:#a9a9b1}
.uge-tool.uge-on{background:#0A84FF;border-color:#0A84FF;font-weight:600}
.uge-tool:disabled{opacity:.45;cursor:default}
.uge-hint{font-size:11.5px;color:#9a9aa2;flex-basis:100%;text-align:center;margin-top:2px}
.uge-timer{font-weight:600;font-size:16px;font-variant-numeric:tabular-nums;padding:0 6px}
.uge-win{font-size:15px;line-height:1.5;text-align:center}
.uge-win b{font-size:30px;display:block;margin:6px 0 10px;font-variant-numeric:tabular-nums}
.uge-row2{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.uge-worldrow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eae4d9}
.uge-worldrow:last-child{border-bottom:none}
.uge-worldcopy{flex:1;min-width:0}
.uge-worldname{flex:1;font-weight:500}
.uge-worldmeta{margin-top:3px;font-size:12px;line-height:1.35;color:#9a9aa2}
.uge-worldactions{display:flex;gap:6px;align-items:center}
.uge-input{font:600 14px -apple-system,system-ui,sans-serif;padding:10px 14px;border-radius:10px;border:1px solid #e5e5ea;background:#fff;color:#060c21;width:min(260px,60vw)}
.uge-template-intro{margin:0 0 12px;color:#4e4d4d;font-size:13px;line-height:1.45}
.uge-template-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.uge-template{display:flex;min-width:0;flex-direction:column;gap:7px;padding:13px;border:1px solid #e5e5ea;border-radius:10px;background:#f5f5f7}
.uge-template h3{margin:0;font-size:15px}.uge-template p{margin:0;color:#4e4d4d;font-size:12px;line-height:1.4}
.uge-template-tags{font-size:11px;font-weight:500;color:#9a9aa2}
.uge-template .uv-btn{margin-top:auto;min-height:44px}
body.creator-mode:not(.creator-playing) #touch-ui{display:none}
@media(max-width:600px){
  .uge-bar{width:calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 16px);max-width:none;gap:5px;padding:7px 8px;border-radius:10px}
  .uge-top{top:calc(env(safe-area-inset-top) + 64px);max-height:32dvh;overflow:auto}
  .uge-bottom{bottom:calc(env(safe-area-inset-bottom) + 8px);max-height:34dvh;overflow:auto}
  .uge-title{font-size:13px}.uge-name{max-width:105px;font-size:12px}
  .uge-status{font-size:10px}
  body.creator-mode .uv-panel header .uv-x{width:44px;height:44px}
  .uge-toolstrip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;overflow:visible}
  .uge-toolstrip .uge-tool{width:100%;min-width:0;white-space:normal;line-height:1.15}
  .uge-bottom > .uge-tool{min-width:44px}
  .uge-tool,.uge-bar .uv-btn{min-height:44px;padding:8px 10px;font-size:12px}
  .uge-hint{font-size:10.5px}
  .uge-worldrow{align-items:flex-start;gap:10px}
  .uge-worldname{overflow-wrap:anywhere}
  .uge-worldactions .uv-btn{min-width:44px;min-height:44px;padding:9px 12px}
  .uge-template-grid{grid-template-columns:1fr}
  body.creator-playing.touch .uge-bottom{bottom:calc(env(safe-area-inset-bottom) + 104px)}
}
`;

// ---------------------------------------------------------------------------
// The editor game.
// ---------------------------------------------------------------------------
registerGame({
  id: 'creator',
  name: 'Creator',
  hint: 'Build & play your own world',
  color: 0x8a6fb0,
  mount(ctx) {
    const T = ctx.THREE;
    const renderer = ctx.renderer;
    const creatorProfile = ctx.save.profile;
    document.body.classList.add('creator-mode');
    ctx.bus.emit('performance-scope', 'ugc');

    // ---------- Scene / camera / lights ----------
    const scene = new T.Scene();
    const presentation = createUgcStage(T, scene, {
      mode: 'race',
      plotSize: GRID,
      dynamicTemplate: true,
    });

    const camera = new T.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.1, 200
    );

    const hemi = new T.HemisphereLight(0xfff2de, 0xd8c4a8, 0.95);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xffe2b8, 1.5);
    sun.position.set(16, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); // mobile budget (≤2048)
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    // ---------- Shared geometry / materials (disposed on unmount) ----------
    const disposables = [];
    function track(x) { disposables.push(x); return x; }

    function rampGeometry() {
      // Right triangle in XY (rise toward +x), extruded 1 along z, centered.
      const shape = new T.Shape();
      shape.moveTo(-0.5, 0);
      shape.lineTo(0.5, 0);
      shape.lineTo(0.5, PIECE_H);
      shape.lineTo(-0.5, 0);
      const g = new T.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      return g;
    }

    const GEO = {
      block: track(new T.BoxGeometry(1, PIECE_H, 1)),
      ramp: track(rampGeometry()),
      spinnerBase: track(new T.CylinderGeometry(0.42, 0.5, 0.25, 16)),
      spinnerArm: track(new T.BoxGeometry(1.7, 0.2, 0.2)),
      bounceBase: track(new T.CylinderGeometry(0.46, 0.5, 0.14, 20)),
      bounceRing: track(new T.TorusGeometry(0.31, 0.045, 8, 24)),
      scoreStar: track(new T.OctahedronGeometry(0.3)),
      pad: track(new T.CylinderGeometry(0.46, 0.46, 0.09, 20)),
      cellPlane: track(new T.PlaneGeometry(0.96, 0.96)),
      goalRing: track(new T.TorusGeometry(0.62, 0.05, 10, 32)),
      goalPost: track(new T.CylinderGeometry(0.07, 0.09, 1.35, 12)),
      goalBeam: track(new T.BoxGeometry(1.24, 0.14, 0.14)),
    };

    function vinyl(color, extra = {}) {
      return track(new T.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra }));
    }
    const MAT = {
      block: vinyl(COLORS.block),
      ramp: vinyl(COLORS.ramp),
      spinner: vinyl(COLORS.spinner),
      bounce: vinyl(COLORS.bounce, { emissive: COLORS.bounce, emissiveIntensity: 0.32 }),
      bounceRing: vinyl(0xfbfff8, { emissive: COLORS.bounce, emissiveIntensity: 0.7 }),
      score: vinyl(COLORS.score, { emissive: COLORS.score, emissiveIntensity: 0.55 }),
      spawn: vinyl(COLORS.spawn, { emissive: COLORS.spawn, emissiveIntensity: 0.25 }),
      goal: vinyl(COLORS.goal, { emissive: COLORS.goal, emissiveIntensity: 0.7 }),
      armGhost: vinyl(COLORS.spinner, { transparent: true, opacity: 0.35 }),
      armSolid: vinyl(0x4a4540, { roughness: 0.45 }),
      ghostOk: vinyl(COLORS.spawn, { transparent: true, opacity: 0.5, depthWrite: false }),
      ghostBad: vinyl(COLORS.block, { transparent: true, opacity: 0.5, depthWrite: false }),
      hiOk: track(new T.MeshBasicMaterial({ color: COLORS.spawn, transparent: true, opacity: 0.3, depthWrite: false })),
      hiBad: track(new T.MeshBasicMaterial({ color: 0xd0775e, transparent: true, opacity: 0.35, depthWrite: false })),
      floor: vinyl(0xeae4d9, { roughness: 0.85 }),
      skirt: vinyl(0xe2d7c3, { roughness: 0.9 }),
      ring: vinyl(COLORS.goal, { emissive: COLORS.goal, emissiveIntensity: 1.0 }),
      goalTrim: vinyl(0xfff8e8, { roughness: 0.48 }),
    };

    // ---------- Plot floor / skirt / grid ----------
    const floor = new T.Mesh(new T.PlaneGeometry(GRID, GRID), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    track(floor.geometry);

    const grid = new T.GridHelper(GRID, GRID, 0xc9bda9, 0xddd4c6);
    grid.position.y = 0.015;
    scene.add(grid);
    track(grid.geometry);
    track(grid.material);

    // Plot border posts (visual only, outside the play area).
    const borderMat = vinyl(0xdccfb8);
    for (const [bx, bz] of [[-HALF - 0.6, 0], [HALF + 0.6, 0], [0, -HALF - 0.6], [0, HALF + 0.6]]) {
      const wall = new T.Mesh(new T.BoxGeometry(bz === 0 ? 0.4 : GRID + 1.6, 0.35, bx === 0 ? 0.4 : GRID + 1.6), borderMat);
      wall.position.set(bx, 0.17, bz);
      wall.castShadow = wall.receiveShadow = true;
      scene.add(wall);
      track(wall.geometry);
    }

    // ---------- Editor state ----------
    const state = {
      id: null,
      name: 'My World',
      creator: creatorProfile.name,
      pieces: [],              // { t, gx, gz, rot, mesh, arm? }
      gameplayMode: 'race',
      templateId: 'race-starter',
      discoveryTags: ['race', 'quick', 'beginner'],
      publicationState: 'draft',
      publishedAt: null,
      validatedSignature: '',
      validatedAt: null,
    };
    const occupied = new Map(); // "gx,gz" -> piece entry
    const walkables = [];       // meshes for the play-mode ground raycast

    let mode = 'edit';          // 'edit' | 'play'
    let tool = 'block';
    let toolRot = 0;            // 0..3 quarter turns (ramps)
    let hoverCell = null;       // { gx, gz } | null
    let unmounted = false;
    let loadingLevel = false;
    let publishBtn = null;
    let statusEl = null;
    let undoBtn = null;
    let restoringHistory = false;
    const undoStack = [];
    const query = new URLSearchParams(location.search);
    const autoplay = query.get('autoplay') === '1';
    const visualQaPlayback = query.get('visualQaUgc') === '1';
    const requestedTemplate = query.get('ugcTemplate');
    const survivalSeconds = query.get('qa') === '1' && !visualQaPlayback
      ? 3
      : UGC_GAMEPLAY_MODES.survival.durationSeconds;

    function refreshEditorStatus() {
      if (!statusEl) return;
      const currentIsValidated =
        state.validatedSignature && state.validatedSignature === pieceSignature(state.pieces);
      const stateLabel = state.publicationState === 'local'
        ? 'Published here'
        : currentIsValidated ? 'Test passed' : 'Local draft';
      const modeLabel = UGC_GAMEPLAY_MODES[state.gameplayMode]?.label || 'Race';
      const profileState = ctx.save.profileState;
      statusEl.textContent = `${modeLabel} · ${state.pieces.length}/${MAX_PIECES} pieces · ${stateLabel} · ${
        formatLocalCreatorAttribution(state.creator, {
          sessionOnly: !state.id && !profileState.persisted,
        })
      }`;
    }

    function refreshPublishButton() {
      if (!publishBtn) return;
      const currentIsValidated =
        state.validatedSignature && state.validatedSignature === pieceSignature(state.pieces);
      publishBtn.textContent = state.publicationState === 'local'
        ? '✓ Published on this device'
        : currentIsValidated ? '📤 Publish on this device' : '🔒 Play test to publish';
      publishBtn.disabled = state.publicationState === 'local';
      refreshEditorStatus();
    }

    function refreshUndoButton() {
      if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    }

    function markEdited() {
      if (loadingLevel) return;
      state.publicationState = 'draft';
      state.publishedAt = null;
      state.validatedSignature = '';
      state.validatedAt = null;
      refreshPublishButton();
    }

    // ---------- Piece meshes ----------
    function cellKey(gx, gz) { return gx + ',' + gz; }
    function cellX(gx) { return gx - HALF + 0.5; }
    function cellZ(gz) { return gz - HALF + 0.5; }
    function rampYaw(rot) { return [0, -Math.PI / 2, Math.PI, Math.PI / 2][rot & 3]; }

    function makePieceMesh(t) {
      let mesh;
      if (t === 'block') {
        mesh = new T.Mesh(GEO.block, MAT.block);
        mesh.position.y = PIECE_H / 2;
      } else if (t === 'ramp') {
        mesh = new T.Mesh(GEO.ramp, MAT.ramp);
      } else if (t === 'spinner') {
        mesh = new T.Mesh(GEO.spinnerBase, MAT.spinner);
        mesh.position.y = 0.125;
      } else if (t === 'bounce') {
        mesh = new T.Mesh(GEO.bounceBase, MAT.bounce);
        mesh.position.y = 0.07;
      } else if (t === 'score') {
        mesh = new T.Mesh(GEO.scoreStar, MAT.score);
        mesh.position.y = 0.62;
      } else { // spawn | goal pads
        mesh = new T.Mesh(GEO.pad, t === 'spawn' ? MAT.spawn : MAT.goal);
        mesh.position.y = 0.045;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    function addPiece(def) {
      const entry = {
        t: def.t, gx: def.gx, gz: def.gz, rot: def.rot || 0,
        mesh: null, arm: null, spinHit: 0, bounceHit: 0, collected: false,
      };
      const mesh = makePieceMesh(def.t);
      mesh.position.x = cellX(def.gx);
      mesh.position.z = cellZ(def.gz);
      if (def.t === 'ramp') mesh.rotation.y = rampYaw(entry.rot);
      if (def.t === 'spinner') {
        const arm = new T.Mesh(GEO.spinnerArm, MAT.armGhost);
        arm.position.y = 0.42;
        arm.castShadow = true;
        mesh.add(arm);
        entry.arm = arm;
      }
      if (def.t === 'bounce') {
        const ring = new T.Mesh(GEO.bounceRing, MAT.bounceRing);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.1;
        mesh.add(ring);
        entry.bounceRing = ring;
      }
      if (def.t === 'goal') {
        const ring = new T.Mesh(GEO.goalRing, MAT.ring);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.35;
        mesh.add(ring);
        entry.ring = ring;
        const leftPost = new T.Mesh(GEO.goalPost, MAT.goalTrim);
        leftPost.position.set(0, 0.72, -0.55);
        const rightPost = new T.Mesh(GEO.goalPost, MAT.goalTrim);
        rightPost.position.set(0, 0.72, 0.55);
        const beam = new T.Mesh(GEO.goalBeam, MAT.goal);
        beam.position.set(0, 1.38, 0);
        beam.rotation.y = Math.PI / 2;
        leftPost.castShadow = rightPost.castShadow = beam.castShadow = true;
        mesh.add(leftPost, rightPost, beam);
      }
      scene.add(mesh);
      mesh.updateWorldMatrix(true, false);
      mesh.userData.box2 = {
        minX: cellX(def.gx) - 0.5, maxX: cellX(def.gx) + 0.5,
        minZ: cellZ(def.gz) - 0.5, maxZ: cellZ(def.gz) + 0.5,
      };
      entry.mesh = mesh;
      state.pieces.push(entry);
      occupied.set(cellKey(def.gx, def.gz), entry);
      if (def.t !== 'score') walkables.push(mesh);
      markEdited();
      refreshEditorStatus();
      return entry;
    }

    function removePiece(entry) {
      const i = state.pieces.indexOf(entry);
      if (i >= 0) state.pieces.splice(i, 1);
      occupied.delete(cellKey(entry.gx, entry.gz));
      const w = walkables.indexOf(entry.mesh);
      if (w >= 0) walkables.splice(w, 1);
      scene.remove(entry.mesh);
      markEdited();
      refreshEditorStatus();
    }

    function clearWorld() {
      for (const p of [...state.pieces]) removePiece(p);
    }

    function pieceSnapshot() {
      return state.pieces.map(({ t, gx, gz, rot }) => ({ t, gx, gz, rot }));
    }

    function pushUndo() {
      if (loadingLevel || restoringHistory) return;
      undoStack.push(pieceSnapshot());
      if (undoStack.length > 40) undoStack.shift();
      refreshUndoButton();
    }

    function undoEdit() {
      const previous = undoStack.pop();
      if (!previous || mode !== 'edit') return;
      restoringHistory = true;
      loadingLevel = true;
      clearWorld();
      for (const piece of previous) addPiece(piece);
      loadingLevel = false;
      restoringHistory = false;
      markEdited();
      refreshUndoButton();
      updateGhost();
      ctx.ui.toast('Last edit undone');
    }

    function resetUndoHistory() {
      undoStack.length = 0;
      refreshUndoButton();
    }

    function findPiece(t) { return state.pieces.find((p) => p.t === t) || null; }

    function updatePresentationMode(gameplayMode) {
      presentation.setMode(gameplayMode);
      MAT.floor.color.setHex(presentation.playfieldColor(gameplayMode));
    }

    function starterWorld(templateId = 'race-starter') {
      const template = creatorTemplate(templateId);
      loadingLevel = true;
      clearWorld();
      state.id = null;
      state.name = 'My World';
      state.creator = creatorProfile.name;
      state.gameplayMode = template.mode;
      state.templateId = template.id;
      state.discoveryTags = [...template.tags];
      updatePresentationMode(template.mode);
      presentation.setTemplate(template.id);
      for (const piece of template.pieces) addPiece(piece);
      state.publicationState = 'draft';
      state.publishedAt = null;
      state.validatedSignature = '';
      state.validatedAt = null;
      loadingLevel = false;
      resetUndoHistory();
      refreshNameLabel();
      refreshPublishButton();
    }

    function openTemplatesPanel() {
      const panel = ctx.ui.panel({ title: 'Choose a safe starting template' });
      panel.el.classList.add('uge-template-panel');
      const intro = document.createElement('p');
      intro.className = 'uge-template-intro';
      intro.textContent =
        'Each original template has one bounded objective and safe defaults. ' +
        'Choosing one replaces the current unsaved layout; everything stays on this device.';
      const gridEl = document.createElement('div');
      gridEl.className = 'uge-template-grid';
      for (const template of UGC_TEMPLATES) {
        const card = document.createElement('article');
        card.className = 'uge-template';
        const title = document.createElement('h3');
        title.textContent = `${template.icon} ${template.label}`;
        const objective = document.createElement('p');
        objective.textContent = template.objective;
        const guidance = document.createElement('p');
        guidance.textContent = template.guidance;
        const tags = document.createElement('div');
        tags.className = 'uge-template-tags';
        tags.textContent = template.tags.map((tag) => `#${tag}`).join(' · ');
        const use = ctx.ui.button(`Use ${template.label}`, () => {
          starterWorld(template.id);
          panel.close();
          ctx.ui.toast(`${template.label} template ready · local draft`);
        }, { primary: template.id === state.templateId });
        card.append(title, objective, guidance, tags, use);
        gridEl.appendChild(card);
      }
      panel.body.append(intro, gridEl);
    }

    // ---------- Ghost preview + cell highlight ----------
    let ghost = null; // current preview mesh (geometry is shared; not disposed)
    function rebuildGhost() {
      if (ghost) scene.remove(ghost);
      ghost = null;
      if (tool === 'erase') return;
      ghost = makePieceMesh(tool);
      ghost.traverse((o) => {
        if (o.isMesh) { o.material = MAT.ghostOk; o.castShadow = false; o.receiveShadow = false; }
      });
      if (tool === 'ramp') ghost.rotation.y = rampYaw(toolRot);
      ghost.visible = false;
      scene.add(ghost);
    }

    const highlight = new T.Mesh(GEO.cellPlane, MAT.hiOk);
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.y = 0.02;
    highlight.visible = false;
    scene.add(highlight);

    function updateGhost() {
      if (mode !== 'edit') { if (ghost) ghost.visible = false; highlight.visible = false; return; }
      if (!hoverCell) { if (ghost) ghost.visible = false; highlight.visible = false; return; }
      const { gx, gz } = hoverCell;
      highlight.position.x = cellX(gx);
      highlight.position.z = cellZ(gz);
      highlight.visible = true;
      const taken = occupied.has(cellKey(gx, gz));
      if (tool === 'erase') {
        highlight.material = taken ? MAT.hiOk : MAT.hiBad;
        if (ghost) ghost.visible = false;
        return;
      }
      highlight.material = taken ? MAT.hiBad : MAT.hiOk;
      if (!ghost) rebuildGhost();
      ghost.visible = true;
      ghost.position.x = cellX(gx);
      ghost.position.z = cellZ(gz);
      ghost.traverse((o) => { if (o.isMesh) o.material = taken ? MAT.ghostBad : MAT.ghostOk; });
    }

    // ---------- Place / erase ----------
    function tryPlace(gx, gz) {
      const key = cellKey(gx, gz);
      if (occupied.has(key)) { ctx.ui.toast('That spot is taken — erase it first'); return; }
      if (state.pieces.length >= MAX_PIECES) { ctx.ui.toast('Piece limit reached (' + MAX_PIECES + ')'); return; }
      pushUndo();
      if (tool === 'spawn' || tool === 'goal') {
        const old = findPiece(tool);
        if (old) removePiece(old); // exactly one spawn / goal: move it
      }
      addPiece({ t: tool, gx, gz, rot: toolRot });
    }

    function tryErase(gx, gz) {
      const entry = occupied.get(cellKey(gx, gz));
      if (entry) {
        pushUndo();
        removePiece(entry);
      }
    }

    // ---------- Picking ----------
    const ndc = new T.Vector2();
    const raycaster = new T.Raycaster();
    const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    const hitPoint = new T.Vector3();

    function pickCell(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return null;
      const gx = Math.floor(hitPoint.x + HALF);
      const gz = Math.floor(hitPoint.z + HALF);
      if (gx < 0 || gx >= GRID || gz < 0 || gz >= GRID) return null;
      return { gx, gz };
    }

    // ---------- Editor camera (isometric, rotatable in quarter turns) ----------
    let camA = Math.PI * 0.25;
    let camATarget = camA;
    const CAM_DIST = 15, CAM_H = 11.5;
    function placeEditCamera(dt) {
      camA = angleLerp(camA, camATarget, 6 * dt);
      camera.position.set(Math.sin(camA) * CAM_DIST, CAM_H, Math.cos(camA) * CAM_DIST);
      camera.lookAt(0, 0, 0);
    }
    placeEditCamera(1);

    // ---------- Save / load ----------
    function serialize() {
      return levelFromEditor({
        id: state.id,
        name: state.name,
        creator: state.creator,
        pieces: state.pieces,
        publicationState: state.publicationState,
        publishedAt: state.publishedAt,
        validatedSignature: state.validatedSignature,
        validatedAt: state.validatedAt,
        gameplayMode: state.gameplayMode,
        templateId: state.templateId,
        tags: state.discoveryTags,
      });
    }

    function validateForSave() {
      const candidate = levelFromEditor({
        id: state.id || 'local-draft-check',
        name: state.name,
        creator: state.creator,
        pieces: state.pieces,
        gameplayMode: state.gameplayMode,
        templateId: state.templateId,
        tags: state.discoveryTags,
      });
      const checked = validateLevel(candidate);
      if (checked.ok) return true;
      ctx.ui.toast(checked.errors[0]);
      return false;
    }

    function persistWorld(message = null) {
      const worlds = readLocalWorlds(ctx.save);
      const idx = worlds.findIndex((w) => w.id === state.id);
      const prev = idx >= 0 ? worlds[idx] : null;
      const data = levelFromEditor({
        id: state.id,
        name: state.name,
        creator: state.creator,
        pieces: state.pieces,
        previous: prev,
        publicationState: state.publicationState,
        publishedAt: state.publishedAt,
        validatedSignature: state.validatedSignature,
        validatedAt: state.validatedAt,
        gameplayMode: state.gameplayMode,
        templateId: state.templateId,
        tags: state.discoveryTags,
      });
      const saved = upsertLocalWorld(ctx.save, data);
      if (!saved) {
        ctx.ui.toast('Could not save this level on this device. Check browser storage and try again.');
        return null;
      }
      ctx.bus.emit('ugc-save', { id: saved.id, name: saved.name, pieces: saved.pieces.length });
      ctx.ui.toast(message || ('Saved "' + saved.name + '" as a local draft 💾'));
      refreshPublishButton();
      return saved;
    }

    function saveFlow(afterSave = null) {
      const onSaved = typeof afterSave === 'function' ? afterSave : null;
      if (!validateForSave()) return;
      if (state.id) {
        if (persistWorld()) onSaved?.();
        return;
      }
      // New world — ask for a name.
      const p = ctx.ui.panel({ title: 'Name your world' });
      const input = document.createElement('input');
      input.className = 'uge-input';
      input.maxLength = 24;
      input.value = state.name === 'My World'
        ? 'World ' + (readLocalWorlds(ctx.save).length + 1)
        : state.name;
      const row = document.createElement('div');
      row.className = 'uge-row2';
      row.append(
        ctx.ui.button('Cancel', () => p.close()),
        ctx.ui.button('Save 💾', () => {
          state.name = (input.value || '').trim().slice(0, 24) || 'My World';
          state.id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
          refreshNameLabel();
          if (!persistWorld()) {
            input.focus();
            return;
          }
          p.close();
          onSaved?.();
        }, { primary: true })
      );
      p.body.append(input, row);
      input.focus();
      input.select();
    }

    function loadWorld(data) {
      const normalized = editorPiecesFromLevel(data);
      if (!normalized.level) {
        ctx.ui.toast('That level could not be loaded.');
        return;
      }
      loadingLevel = true;
      clearWorld();
      state.id = normalized.level.id || null;
      state.name = (normalized.level.name || 'My World').slice(0, 24);
      state.creator = normalized.level.creator;
      state.gameplayMode = normalized.level.gameplay.mode;
      state.templateId = normalized.level.discovery.templateId;
      state.discoveryTags = [...normalized.level.discovery.tags];
      updatePresentationMode(state.gameplayMode);
      presentation.setTemplate(state.templateId);
      for (const d of normalized.pieces) {
        if (!TOOLS.some((t) => t.t === d.t)) continue;
        if (d.gx < 0 || d.gx >= GRID || d.gz < 0 || d.gz >= GRID) continue;
        if (occupied.has(cellKey(d.gx, d.gz))) continue;
        addPiece({ t: d.t, gx: d.gx, gz: d.gz, rot: d.rot || 0 });
      }
      // Guarantee the one-spawn / one-goal invariant on old data.
      for (const t of ['spawn', 'goal']) {
        let seen = false;
        for (const p of [...state.pieces]) {
          if (p.t !== t) continue;
          if (seen) removePiece(p); else seen = true;
        }
      }
      state.publicationState = normalized.level.publication.state;
      state.publishedAt = normalized.level.publication.publishedAt;
      state.validatedSignature = normalized.level.validation.pieceSignature;
      state.validatedAt = normalized.level.validation.passedAt;
      loadingLevel = false;
      resetUndoHistory();
      refreshNameLabel();
      refreshPublishButton();
    }

    function openWorldsPanel() {
      const worlds = readLocalWorlds(ctx.save);
      const p = ctx.ui.panel({ title: 'My Worlds' });
      if (!worlds.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No saved worlds yet — build something and hit Save!';
        p.body.appendChild(empty);
        return;
      }
      for (const w of worlds) {
        const level = normalizeLevel(w);
        if (!level) continue;
        const row = document.createElement('div');
        row.className = 'uge-worldrow';
        const name = document.createElement('div');
        name.className = 'uge-worldname';
        name.textContent = level.name;
        const meta = document.createElement('div');
        meta.className = 'uge-worldmeta';
        meta.textContent = `${UGC_GAMEPLAY_MODES[level.gameplay.mode].label} · ` +
          level.discovery.tags.map((tag) => `#${tag}`).join(' ') + ' · ' +
          level.pieces.length + ' pieces · ' +
          (level.publication.state === 'local' ? 'published on this device' : 'local draft') +
          ' · ' + formatLocalCreatorAttribution(level.creator);
        const copy = document.createElement('div');
        copy.className = 'uge-worldcopy';
        copy.append(name, meta);
        const actions = document.createElement('div');
        actions.className = 'uge-worldactions';
        const loadBtn = ctx.ui.button('Load', () => {
          loadWorld(w);
          p.close();
          ctx.ui.toast('Loaded "' + level.name + '"');
        }, { primary: true });
        const deleteBtn = ctx.ui.button('🗑', async () => {
            const ok = await ctx.ui.confirm('Delete "' + level.name + '" forever?');
            if (!ok) return;
            const result = deleteLocalWorld(ctx.save, w.id);
            if (result.status === 'write-failed') {
              ctx.ui.toast('Could not delete this level from this device. Check browser storage and try again.');
              return;
            }
            p.close();
            ctx.ui.toast(result.status === 'removed' ? 'Deleted' : 'That local level is no longer available.');
          });
        deleteBtn.title = `Delete ${level.name} from this device`;
        deleteBtn.setAttribute('aria-label', `Delete ${level.name} from this device`);
        actions.append(loadBtn, deleteBtn);
        row.append(copy, actions);
        p.body.appendChild(row);
      }
    }

    function publishLocal() {
      const currentIsValidated =
        state.validatedSignature && state.validatedSignature === pieceSignature(state.pieces);
      if (!currentIsValidated) {
        startPlay();
        return;
      }
      if (!state.id) {
        saveFlow(publishLocal);
        return;
      }
      const candidate = serialize();
      const checked = validateLevel(candidate, { requireValidated: true });
      if (!checked.ok) {
        ctx.ui.toast(checked.errors[0]);
        return;
      }
      const previousState = state.publicationState;
      const previousPublishedAt = state.publishedAt;
      state.publicationState = 'local';
      state.publishedAt = Date.now();
      const data = persistWorld('Published on this device · no online upload ✨');
      if (!data) {
        state.publicationState = previousState;
        state.publishedAt = previousPublishedAt;
        refreshPublishButton();
        return;
      }
      ctx.bus.emit('ugc-world-published', { id: data.id, scope: 'local-device' });
      refreshPublishButton();
    }

    // ---------- Play test ----------
    const env = {
      bounds: HALF - 0.45,
      sampleGround(x, z, fromY) {
        if (Math.abs(x) > HALF + 0.6 || Math.abs(z) > HALF + 0.6) return { y: -6, box2: null };
        envRay.set(envOrigin.set(x, fromY, z), DOWN);
        envRay.far = fromY + 4;
        const hits = envRay.intersectObjects(walkables, false);
        if (hits.length) return { y: hits[0].point.y, box2: hits[0].object.userData.box2 || null };
        return { y: 0, box2: null };
      },
    };
    const envRay = new T.Raycaster();
    const DOWN = new T.Vector3(0, -1, 0);
    const envOrigin = new T.Vector3();

    let sim = null;
    let rig = null;             // character rig group
    let characterInstance = null;
    let characterLoadToken = 0;
    let playTime = 0;
    let playWon = false;
    let playFinishedEmitted = false;
    let acc = 0;
    let playCamYaw = Math.PI;
    let lastTimerText = '';
    const playCamPos = new T.Vector3();
    const playCamTarget = new T.Vector3();

    function spawnPoint() {
      const s = findPiece('spawn');
      return s ? { x: cellX(s.gx), z: cellZ(s.gz) } : { x: -HALF + 2, z: 0 };
    }

    function scoreProgress() {
      const stars = state.pieces.filter((piece) => piece.t === 'score');
      return {
        collected: stars.filter((piece) => piece.collected).length,
        target: stars.length,
      };
    }

    function playObjectiveCopy() {
      if (state.gameplayMode === 'survival') {
        return `Stay in play for ${survivalSeconds} seconds.`;
      }
      if (state.gameplayMode === 'score') {
        return `Collect all ${scoreProgress().target} Score Stars.`;
      }
      return 'Reach the Goal as quickly as you can.';
    }

    function startPlay() {
      if (!validateForSave()) return;
      mode = 'play';
      document.body.classList.add('creator-playing');
      playTime = 0;
      playWon = false;
      playFinishedEmitted = false;
      acc = 0;
      const sp = spawnPoint();
      sim = createPlayerState(sp.x, sp.z);
      sim.yaw = Math.PI / 2; // face +x into the plot
      playCamYaw = sim.yaw;
      playCamPos.set(sp.x - 4.5, 3, sp.z);
      if (visualQaPlayback) {
        if (state.gameplayMode === 'race') {
          camera.position.set(-11.5, 6.8, 0.5);
          camera.lookAt(1.5, 0.15, 0.5);
        } else {
          camera.position.set(-11.2, 9.2, 12.8);
          camera.lookAt(0, 0.15, 0);
        }
      }

      // Editor visuals off; play visuals on.
      grid.visible = false;
      if (ghost) ghost.visible = false;
      highlight.visible = false;
      for (const p of state.pieces) {
        if (p.arm) p.arm.material = MAT.armSolid;
        p.bounceHit = 0;
        p.collected = false;
        if (p.t === 'score') p.mesh.visible = true;
      }

      rig = new T.Group();
      rig.position.set(sim.pos.x, sim.pos.y, sim.pos.z);
      scene.add(rig);
      const loadToken = ++characterLoadToken;
      ctx.characters.createInstance(ctx.characters.equippedId(), {
        skinTone: ctx.save.settings.skinTone,
        lod: 'game',
        shadow: 'hero',
      })
        .then((instance) => {
          if (unmounted || mode !== 'play' || loadToken !== characterLoadToken) {
            instance.dispose();
            return;
          }
          scene.remove(rig);
          characterInstance?.dispose();
          characterInstance = instance;
          rig = instance.root;
          rig.position.set(sim.pos.x, sim.pos.y, sim.pos.z);
          rig.rotation.y = sim.yaw;
          scene.add(rig);
        })
        .catch(() => {});

      editBar.style.display = 'none';
      topBar.style.display = 'none';
      playBar.style.display = 'flex';
      const objective = state.gameplayMode === 'survival'
        ? 'stay in play'
        : state.gameplayMode === 'score' ? 'collect every ⭐' : 'reach the 🏁';
      playHint.textContent = ctx.input.isTouchDevice
        ? `Stick to move · JUMP to hop · ${objective}`
        : `WASD to move · Space to hop · ${objective}`;
      hintText.textContent = '';
      ctx.bus.emit('ugc-play', { id: state.id, name: state.name, phase: 'start' });
      ctx.ui.toast(playObjectiveCopy());
    }

    function emitPlayFinish() {
      if (playFinishedEmitted) return;
      playFinishedEmitted = true;
      const playCount = state.id
        ? incrementLocalCounter(ctx.save, 'ugcPlays', state.id)
        : null;
      const counterCommitted = Number.isFinite(playCount);
      ctx.bus.emit('ugc-play', {
        id: state.id, name: state.name, phase: 'finish',
        won: playWon, time: Math.round(playTime * 100) / 100,
        counterCommitted,
        playCount: counterCommitted ? playCount : null,
      });
      if (state.id && !counterCommitted) {
        ctx.ui.toast('Play test finished, but its local play count could not be saved on this device.');
      }
    }

    function stopPlay() {
      emitPlayFinish();
      mode = 'edit';
      document.body.classList.remove('creator-playing');
      characterLoadToken++;
      characterInstance?.dispose();
      characterInstance = null;
      if (rig) { scene.remove(rig); rig = null; }
      sim = null;
      grid.visible = true;
      for (const p of state.pieces) {
        if (p.arm) p.arm.material = MAT.armGhost;
        if (p.t === 'score') p.mesh.visible = true;
      }
      editBar.style.display = 'flex';
      topBar.style.display = 'flex';
      playBar.style.display = 'none';
      placeEditCamera(1);
      camATarget = camA;
      updateGhost();
    }

    function winPlay() {
      playWon = true;
      characterInstance?.animator.play('celebrate');
      state.validatedSignature = pieceSignature(state.pieces);
      state.validatedAt = Date.now();
      refreshPublishButton();
      emitPlayFinish();
      const t = playTime;
      let resultAction = false;
      const p = ctx.ui.panel({
        title: state.gameplayMode === 'survival'
          ? '🎉 Survival complete!'
          : state.gameplayMode === 'score' ? '🎉 All stars collected!' : '🎉 You did it!',
        onClose: () => {
          if (!resultAction && mode === 'play') stopPlay();
        },
      });
      const msg = document.createElement('div');
      msg.className = 'uge-win';
      const resultLead = state.gameplayMode === 'survival'
        ? 'You stayed in play for'
        : state.gameplayMode === 'score'
          ? `You collected all ${scoreProgress().target} stars in`
          : 'You reached the goal in';
      msg.innerHTML = `${resultLead}<b>${t.toFixed(2)}s</b>`;
      const row = document.createElement('div');
      row.className = 'uge-row2';
      row.append(
        ctx.ui.button('↻ Play again', () => {
          resultAction = true;
          p.close();
          if (mode === 'play') { softStop(); mode = 'edit'; startPlay(); }
        }),
        ctx.ui.button('🛠 Back to editor', () => {
          resultAction = true;
          p.close();
          if (mode === 'play') stopPlay();
        }, { primary: true }),
        ctx.ui.button('🏠 Done', () => {
          resultAction = true;
          p.close();
          ctx.goHome();
        })
      );
      p.body.append(msg, row);
      // "Play again" needs a no-finish-emit teardown (already emitted above).
      function softStop() {
        characterLoadToken++;
        characterInstance?.dispose();
        characterInstance = null;
        if (rig) { scene.remove(rig); rig = null; }
        sim = null;
        for (const q of state.pieces) { if (q.arm) q.arm.material = MAT.armGhost; }
      }
    }

    function stepPlay(dt) {
      let dirX = 0;
      let dirZ = 0;
      let simInput;
      if (autoplay) {
        const scoreTarget = state.gameplayMode === 'score'
          ? state.pieces.find((piece) => piece.t === 'score' && !piece.collected)
          : null;
        const goal = state.gameplayMode === 'race' ? findPiece('goal') : null;
        dirX = scoreTarget
          ? cellX(scoreTarget.gx) - sim.pos.x
          : goal ? cellX(goal.gx) - sim.pos.x : Math.sin(playTime * 0.9);
        dirZ = scoreTarget
          ? cellZ(scoreTarget.gz) - sim.pos.z
          : goal ? cellZ(goal.gz) - sim.pos.z : Math.cos(playTime * 0.9);
        const length = Math.hypot(dirX, dirZ) || 1;
        dirX /= length;
        dirZ /= length;
        simInput = {
          dirX, dirZ, moving: true,
          jumpHeld: true, grabPressed: false,
        };
      } else {
        const pad = ctx.input.poll();
        // Camera-relative movement (same scheme as the hub).
        const f = { x: Math.sin(playCamYaw), z: Math.cos(playCamYaw) };
        const r = { x: -f.z, z: f.x };
        dirX = f.x * -pad.my + r.x * pad.mx;
        dirZ = f.z * -pad.my + r.z * pad.mx;
        const dLen = Math.hypot(dirX, dirZ);
        if (dLen > 1e-4) { dirX /= Math.max(1, dLen); dirZ /= Math.max(1, dLen); }
        simInput = {
          dirX, dirZ,
          moving: pad.moving && dLen > 1e-4,
          jumpHeld: pad.jumpHeld,
          grabPressed: pad.grabPressed,
        };
      }

      acc += dt;
      while (acc >= SIM_DT) {
        acc -= SIM_DT;
        if (!playWon) {
          const wasGrounded = sim.grounded;
          stepPlayer(sim, simInput, SIM_DT, env);
          if (sim.jumpEvent) characterInstance?.animator.signal('jump');
          if (!wasGrounded && sim.grounded) characterInstance?.animator.signal('land');
          playTime += SIM_DT;

          // Spinner knockback (gentle, kid-safe: boing away from the arm hub).
          for (const p of state.pieces) {
            if (p.t !== 'spinner') continue;
            p.spinHit = Math.max(0, p.spinHit - SIM_DT);
            const cx = p.mesh.position.x, cz = p.mesh.position.z;
            const dx = sim.pos.x - cx, dz = sim.pos.z - cz;
            const d = Math.hypot(dx, dz);
            if (p.spinHit <= 0 && d < 1.05 && sim.pos.y < 0.75) {
              const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
              sim.vel.x = nx * 7.5;
              sim.vel.z = nz * 7.5;
              sim.vel.y = 3.2;
              sim.grounded = false;
              p.spinHit = 0.6;
              characterInstance?.animator.signal('impact');
            }
          }

          // Bounce pads are a reusable gameplay piece: the same trigger and
          // launch speed are used by Discover playback below.
          for (const p of state.pieces) {
            if (p.t !== 'bounce') continue;
            p.bounceHit = Math.max(0, p.bounceHit - SIM_DT);
            const dx = sim.pos.x - p.mesh.position.x;
            const dz = sim.pos.z - p.mesh.position.z;
            if (
              p.bounceHit <= 0 &&
              Math.hypot(dx, dz) < BOUNCE.triggerRadius &&
              sim.pos.y < BOUNCE.maxContactY &&
              sim.vel.y <= 0.5
            ) {
              sim.vel.y = BOUNCE.launchVelocity;
              sim.grounded = false;
              p.bounceHit = BOUNCE.cooldown;
              characterInstance?.animator.signal('jump');
              ctx.bus.emit('sfx', 'jump');
            }
          }

          // Fell off the plot -> back to spawn (bounds clamp makes this rare).
          if (sim.pos.y < -4) {
            const sp = spawnPoint();
            sim.pos.x = sp.x; sim.pos.z = sp.z; sim.pos.y = 0;
            sim.vel.x = sim.vel.y = sim.vel.z = 0;
          }

          // Goal check.
          const g = state.gameplayMode === 'race' ? findPiece('goal') : null;
          if (g) {
            const gdx = sim.pos.x - cellX(g.gx);
            const gdz = sim.pos.z - cellZ(g.gz);
            if (Math.hypot(gdx, gdz) < 0.8 && sim.pos.y < 0.6) winPlay();
          }

          if (state.gameplayMode === 'score') {
            for (const score of state.pieces) {
              if (score.t !== 'score' || score.collected) continue;
              const dx = sim.pos.x - score.mesh.position.x;
              const dz = sim.pos.z - score.mesh.position.z;
              if (Math.hypot(dx, dz) > LEVEL_ASSETS['play.score'].runtime.triggerRadius) continue;
              score.collected = true;
              score.mesh.visible = false;
              ctx.bus.emit('sfx', 'checkpoint');
            }
            const progress = scoreProgress();
            if (progress.target > 0 && progress.collected === progress.target) winPlay();
          }

          if (state.gameplayMode === 'survival' && playTime >= survivalSeconds) {
            winPlay();
          }
        }
      }

      // Rig from sim.
      if (rig) {
        rig.position.set(sim.pos.x, sim.pos.y, sim.pos.z);
        rig.rotation.y = sim.yaw;
      }
      characterInstance?.animator.update(dt, {
        speed: Math.hypot(sim.vel.x, sim.vel.z),
        grounded: sim.grounded,
      });

      // Chase camera (hub pattern).
      if (simInput.moving) {
        const heading = Math.atan2(dirX, dirZ);
        playCamYaw = angleLerp(playCamYaw, heading, 2.2 * dt);
      }
      if (!visualQaPlayback) {
        playCamTarget.set(
          sim.pos.x - Math.sin(playCamYaw) * 4.5,
          sim.pos.y + 3.0,
          sim.pos.z - Math.cos(playCamYaw) * 4.5
        );
        playCamPos.lerp(playCamTarget, 1 - Math.exp(-5 * dt));
        camera.position.copy(playCamPos);
        camera.lookAt(sim.pos.x, sim.pos.y + 1.5, sim.pos.z);
      }

      // Timer HUD (update only when the displayed centisecond changes).
      const progress = scoreProgress();
      const txt = state.gameplayMode === 'survival'
        ? `🛡️ ${Math.max(0, survivalSeconds - playTime).toFixed(1)}s`
        : state.gameplayMode === 'score'
          ? `⭐ ${progress.collected}/${progress.target} · ${playTime.toFixed(1)}s`
          : `⏱ ${playTime.toFixed(2)}s`;
      if (txt !== lastTimerText) { lastTimerText = txt; timerEl.textContent = txt; }
    }

    // ---------- DOM overlay ----------
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.className = 'uge-root';

    // Top bar.
    const topBar = document.createElement('div');
    topBar.className = 'uge-bar uge-top';
    topBar.setAttribute('role', 'toolbar');
    topBar.setAttribute('aria-label', 'Creator actions');
    const titleEl = document.createElement('span');
    titleEl.className = 'uge-title';
    titleEl.textContent = '🛠 Creator';
    const nameEl = document.createElement('span');
    nameEl.className = 'uge-name';
    function refreshNameLabel() { nameEl.textContent = state.name; }
    refreshNameLabel();
    statusEl = document.createElement('span');
    statusEl.className = 'uge-status';
    statusEl.setAttribute('aria-live', 'polite');
    topBar.append(
      titleEl, nameEl, statusEl,
      ctx.ui.button('🆕 New', async () => {
        const ok = await ctx.ui.confirm('Start a fresh world? Unsaved changes are lost.');
        if (ok) openTemplatesPanel();
      }),
      ctx.ui.button('📂 Worlds', openWorldsPanel),
      ctx.ui.button('💾 Save', saveFlow),
      publishBtn = ctx.ui.button('🔒 Play test to publish', publishLocal),
      ctx.ui.button('▶ Play Test', startPlay, { primary: true }),
      ctx.ui.button('🏠 Exit', () => ctx.goHome())
    );

    // Bottom bar (edit mode): tools + rotate + erase.
    const editBar = document.createElement('div');
    editBar.className = 'uge-bar uge-bottom';
    const toolStrip = document.createElement('div');
    toolStrip.className = 'uge-toolstrip';
    toolStrip.setAttribute('role', 'toolbar');
    toolStrip.setAttribute('aria-label', 'Level pieces');
    const toolBtns = new Map();
    function selectTool(t) {
      tool = t;
      for (const [k, b] of toolBtns) {
        const selected = k === t;
        b.classList.toggle('uge-on', selected);
        b.setAttribute('aria-pressed', String(selected));
      }
      rebuildGhost();
      updateGhost();
    }
    for (const { t, emoji, label } of TOOLS) {
      const b = document.createElement('button');
      b.className = 'uge-tool' + (t === tool ? ' uge-on' : '');
      b.textContent = emoji + ' ' + label;
      b.title = `${label} · tap a grid cell to place`;
      b.setAttribute('aria-pressed', String(t === tool));
      b.onclick = () => selectTool(t);
      toolBtns.set(t, b);
      toolStrip.appendChild(b);
    }
    const rotBtn = document.createElement('button');
    rotBtn.className = 'uge-tool';
    rotBtn.textContent = '🔁 Rotate';
    rotBtn.title = 'Rotate piece (R)';
    rotBtn.onclick = rotateTool;
    const eraseBtn = document.createElement('button');
    eraseBtn.className = 'uge-tool';
    eraseBtn.textContent = '🧽 Erase';
    eraseBtn.setAttribute('aria-pressed', 'false');
    eraseBtn.onclick = () => selectTool('erase');
    toolBtns.set('erase', eraseBtn);
    undoBtn = document.createElement('button');
    undoBtn.className = 'uge-tool';
    undoBtn.textContent = '↶ Undo';
    undoBtn.title = 'Undo last edit (Ctrl/Command + Z)';
    undoBtn.onclick = undoEdit;
    const hintText = document.createElement('div');
    hintText.className = 'uge-hint';
    hintText.textContent = ctx.input.isTouchDevice
      ? 'Choose a piece, tap a cell · Rotate turns ramps · publishing stays on this device'
      : 'Choose a piece, then click a cell · R rotates ramps · every published level stays on this device';
    editBar.append(toolStrip, undoBtn, rotBtn, eraseBtn,
      camButton('⟲', -1), camButton('⟳', 1), hintText);
    function camButton(label, dir) {
      const b = document.createElement('button');
      b.className = 'uge-tool';
      b.textContent = label;
      const direction = dir < 0 ? 'left' : 'right';
      b.title = `Rotate camera ${direction}`;
      b.setAttribute('aria-label', `Rotate camera ${direction}`);
      b.onclick = () => { camATarget += dir * Math.PI / 2; };
      return b;
    }

    // Bottom bar (play mode).
    const playBar = document.createElement('div');
    playBar.className = 'uge-bar uge-bottom';
    playBar.setAttribute('role', 'toolbar');
    playBar.setAttribute('aria-label', 'Creator play-test actions');
    playBar.style.display = 'none';
    const timerEl = document.createElement('span');
    timerEl.className = 'uge-timer';
    timerEl.textContent = '⏱ 0.00s';
    const playHint = document.createElement('div');
    playHint.className = 'uge-hint';
    playHint.textContent = ctx.input.isTouchDevice
      ? 'Stick to move · JUMP to hop · reach the 🏁'
      : 'WASD to move · Space to hop · reach the 🏁';
    playBar.append(
      timerEl,
      ctx.ui.button('↻ Restart', () => {
        const keepWon = playWon; // restart after a win already emitted finish
        softRestart();
        function softRestart() {
          characterLoadToken++;
          characterInstance?.dispose();
          characterInstance = null;
          if (rig) { scene.remove(rig); rig = null; }
          sim = null;
          for (const q of state.pieces) { if (q.arm) q.arm.material = MAT.armGhost; }
          mode = 'edit';
          startPlay();
          if (!keepWon) { /* startPlay re-emits phase:'start' for the new run */ }
        }
      }),
      ctx.ui.button('🛠 Editor', () => stopPlay(), { primary: true }),
      ctx.ui.button('🏠 Exit', () => ctx.goHome()),
      playHint
    );

    root.append(topBar, editBar, playBar);
    document.body.appendChild(root);

    function rotateTool() {
      toolRot = (toolRot + 1) & 3;
      rebuildGhost();
      updateGhost();
    }

    // ---------- Event listeners ----------
    const canvas = renderer.domElement;
    const onPointerMove = (e) => {
      if (mode !== 'edit') return;
      hoverCell = pickCell(e);
      updateGhost();
    };
    const onPointerDown = (e) => {
      if (mode !== 'edit') return;
      const cell = pickCell(e);
      if (!cell) return;
      hoverCell = cell;
      if (e.button === 2 || tool === 'erase') tryErase(cell.gx, cell.gz);
      else tryPlace(cell.gx, cell.gz);
      updateGhost();
    };
    const onContextMenu = (e) => e.preventDefault();
    const onKeyDown = (e) => {
      if (
        mode === 'edit' &&
        (e.metaKey || e.ctrlKey) &&
        e.code === 'KeyZ' &&
        !e.target.closest?.('input,textarea')
      ) {
        e.preventDefault();
        undoEdit();
        return;
      }
      if (e.code === 'KeyR' && mode === 'edit') rotateTool();
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    // ---------- Frame ticker ----------
    let elapsed = 0;
    const stop = ctx.loop.add((dt) => {
      elapsed += dt;
      if (mode === 'play' && sim) {
        stepPlay(dt);
        const presentationTime = visualQaPlayback ? 1.25 : elapsed;
        // Fast spin on arms while playing.
        for (const p of state.pieces) {
          if (p.arm) p.arm.rotation.y = presentationTime * 2.6;
          if (p.ring) { p.ring.rotation.z = presentationTime * 1.4; p.ring.position.y = 0.35 + Math.sin(presentationTime * 3) * 0.06; }
          if (p.bounceRing) {
            const pulse = 1 + Math.sin(presentationTime * 7) * 0.12;
            p.bounceRing.scale.setScalar(pulse);
          }
          if (p.t === 'score' && p.mesh.visible) {
            p.mesh.rotation.y = presentationTime * 2.2;
            p.mesh.position.y = 0.62 + Math.sin(presentationTime * 3 + p.gx) * 0.08;
          }
        }
      } else {
        placeEditCamera(dt);
        // Slow preview spin + gentle goal pulse in edit mode.
        for (const p of state.pieces) {
          if (p.arm) p.arm.rotation.y = elapsed * 0.8;
          if (p.ring) { p.ring.rotation.z = elapsed * 0.7; p.ring.position.y = 0.35 + Math.sin(elapsed * 1.6) * 0.04; }
          if (p.bounceRing) {
            const pulse = 1 + Math.sin(elapsed * 3) * 0.07;
            p.bounceRing.scale.setScalar(pulse);
          }
          if (p.t === 'score') {
            p.mesh.visible = true;
            p.mesh.rotation.y = elapsed * 1.4;
            p.mesh.position.y = 0.62 + Math.sin(elapsed * 2 + p.gx) * 0.06;
          }
        }
        if (ghost && ghost.visible) {
          const s = 1 + Math.sin(elapsed * 4) * 0.015;
          ghost.scale.setScalar(s);
        }
      }
    });

    // ---------- Go ----------
    starterWorld(requestedTemplate);
    rebuildGhost();
    ctx.view.current = { scene, camera };
    ctx.ui.toast('Build a course, then hit ▶ Play Test!');
    if (query.get('creatorTemplates') === '1') {
      queueMicrotask(openTemplatesPanel);
    }

    return {
      unmount() {
        unmounted = true;
        if (mode === 'play') { try { emitPlayFinish(); } catch {} }
        stop();
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('contextmenu', onContextMenu);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);
        root.remove();
        style.remove();
        document.body.classList.remove('creator-mode', 'creator-playing');
        ctx.bus.emit('performance-scope', 'hub');
        characterLoadToken++;
        characterInstance?.dispose();
        characterInstance = null;
        if (rig) { scene.remove(rig); rig = null; }
        for (const d of disposables) { if (d && d.dispose) d.dispose(); }
        presentation.dispose();
        if (ctx.view.current && ctx.view.current.scene === scene) ctx.view.current = null;
      },
    };
  },
});

// ---------------------------------------------------------------------------
// System registration (kept from the placeholder contract): a light browser of
// saved worlds. The full builder runs as the 'creator' game mount so main.js
// remains the single owner of the game mount/unmount lifecycle.
// ---------------------------------------------------------------------------
let editorPanel = null;
registerSystem('editor', {
  open(ctx) {
    if (editorPanel) return;
    editorPanel = ctx.ui.panel({
      title: '🛠 Creator — My Worlds',
      onClose: () => { editorPanel = null; },
    });
    const body = editorPanel.body;
    const tip = document.createElement('p');
    tip.textContent = 'Open Creator from the purple plaza marker to build, play-test, and publish a level on this device.';
    body.appendChild(tip);
    const worlds = readLocalWorlds(ctx.save);
    if (!worlds.length) {
      const none = document.createElement('p');
      none.textContent = 'No saved worlds yet.';
      body.appendChild(none);
      return;
    }
    const plays = readLocalCounterMap(ctx.save, 'ugcPlays');
    for (const w of worlds) {
      const level = normalizeLevel(w);
      if (!level) continue;
      // Inline styles: the game's stylesheet only exists while it is mounted.
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eae4d9';
      const name = document.createElement('div');
      name.style.cssText = 'flex:1;font-weight:500';
      name.textContent = level.name;
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:12px;color:#9a9aa2';
      meta.textContent =
        level.pieces.length + ' pieces · ' +
        (level.publication.state === 'local' ? 'on-device publish' : 'draft') + ' · ' +
        (plays[level.id] || 0) + ' plays' +
        (level.updatedAt ? ' · ' + new Date(level.updatedAt).toLocaleDateString() : '');
      row.append(name, meta);
      body.appendChild(row);
    }
  },
  close() { if (editorPanel) { editorPanel.close(); editorPanel = null; } },
});
