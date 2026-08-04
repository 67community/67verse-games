// discovery.js — 67VERSE UGC Discovery feed (spec §11 UGC / §14 moderation).
//
// A browsable feed of saved worlds from the `ugcWorlds` save key plus built-in
// featured sample worlds. Cards show name / creator / plays / likes with Play
// and Like buttons (`ugcPlays` / `ugcLikes` save keys). A kid-safe report flow
// writes to the `modQueue` save key, and a Moderation tab lists reported items
// with keep / remove actions.
//
// Bus events emitted:  'ugc-play' {id, name, counterCommitted, playCount}
//                      'ugc-like' {id, likeCount} · 'ugc-report' {id, reason}
// Bus events consumed: 'ugc-world-published' (refreshes the feed if open)
//
// Save keys used: ugcWorlds [{id,name,creator,createdAt,blocks,spawn,goal}]
//                 ugcPlays/ugcLikes {version, counts:{worldId: n}}
//                 modQueue {version, records:[device-local reports]}
//
// WORLD FORMAT CONTRACT (shared with the editor module — coordinate changes):
//   world = { id, name, creator, blocks: [...], spawn:{x,z}, goal:{x,z} }
//   block = { x, y, z, w, h, d, color? }   // CENTER-based box; top = y + h/2
// normalizeBlock() also tolerates sx/sy/sz or size:[w,h,d] so older or
// differently-shaped editor output still loads.
//
// Play mode is a minimal self-contained reach-the-goal runner built on the
// shared deterministic stepPlayer sim (../player.js) — no editor import.

import { registerSystem } from '../core/registry.js';
import {
  incrementLocalCounter,
  retainLocalCounterEntries,
} from '../core/local-save-schema.js';
import {
  appendLocalModerationRecord,
  formatLocalReporterAttribution,
  readLocalModerationQueue,
  setLocalModerationStatus,
} from '../core/local-moderation.js';
import { createPlayerState, stepPlayer, angleLerp } from '../player.js';
import {
  compileLevelForPlay,
  formatLocalCreatorAttribution,
  isLocallyPublished,
  LEVEL_ASSETS,
  UGC_GAMEPLAY_MODES,
} from './format.js';
import {
  deleteLocalWorld,
  readLocalWorlds,
} from './local-worlds.js';
import {
  createUgcStage,
  UGC_ASSET_COLORS,
} from './presentation.js';

const SIM_DT = 1 / 60;
const BOUNCE = LEVEL_ASSETS['play.bounce'].runtime;
const UGC_WIN_REWARD = 15;

const PAL = {
  cream: 0xf4efe7, beige: 0xeae4d9, ink: 0x2a2724, sub: 0x7a736a,
  line: 0xddd4c6, terracotta: 0xd0775e, sage: 0x5a9c7a, yellow: 0xe8b64a,
  plum: 0x8a6fb0, rose: 0xc46f8e,
};

const REPORT_REASONS = ['Unkind words', 'Scary or unsafe', 'Looks copied', 'Something else'];

// ---------- Built-in featured sample worlds ----------
// Steps rise ≤0.5 (walkable via stepUp 0.55) or ≤0.9 (jumpable); kid-easy.
const FEATURED_WORLDS = [
  {
    id: 'feat-sunny-steps', name: 'Sunny Steps', creator: 'Team 67VERSE',
    featured: true, basePlays: 128, baseLikes: 46,
    spawn: { x: 0, z: 12 }, goal: { x: 0, z: -8 },
    blocks: [
      { x: 0, y: 0.25, z: 8, w: 4, h: 0.5, d: 2.6, color: PAL.yellow },
      { x: 0, y: 0.5, z: 5, w: 4, h: 1.0, d: 2.6, color: PAL.yellow },
      { x: 0, y: 0.75, z: 2, w: 4, h: 1.5, d: 2.6, color: PAL.terracotta },
      { x: 0, y: 1.0, z: -1, w: 4, h: 2.0, d: 2.6, color: PAL.terracotta },
      { x: 0, y: 1.25, z: -4, w: 4, h: 2.5, d: 2.6, color: PAL.rose },
      { x: 0, y: 1.5, z: -8, w: 5, h: 3.0, d: 5, color: PAL.rose },
    ],
  },
  {
    id: 'feat-terracotta-towers', name: 'Terracotta Towers', creator: 'Team 67VERSE',
    featured: true, basePlays: 96, baseLikes: 31,
    spawn: { x: 0, z: 12 }, goal: { x: 0, z: -6.5 },
    blocks: [
      { x: 0, y: 0.3, z: 8, w: 3, h: 0.6, d: 2.4, color: PAL.terracotta },
      { x: 1.2, y: 0.45, z: 4.5, w: 3, h: 0.9, d: 2.4, color: PAL.yellow },
      { x: -1.2, y: 0.3, z: 1, w: 3, h: 0.6, d: 2.4, color: PAL.terracotta },
      { x: 0.8, y: 0.45, z: -2.5, w: 3, h: 0.9, d: 2.4, color: PAL.rose },
      { x: 0, y: 0.5, z: -6.5, w: 5, h: 1.0, d: 4, color: PAL.terracotta },
    ],
  },
  {
    id: 'feat-sage-garden', name: 'Sage Garden Maze', creator: 'Team 67VERSE',
    featured: true, basePlays: 74, baseLikes: 28,
    spawn: { x: 0, z: 12 }, goal: { x: 0, z: 0 },
    blocks: [
      // low walls (top 1.2 > stepUp) forming a simple spiral to the center
      { x: 0, y: 0.6, z: 6, w: 10, h: 1.2, d: 0.8, color: PAL.sage },
      { x: -4.6, y: 0.6, z: 1.5, w: 0.8, h: 1.2, d: 10, color: PAL.sage },
      { x: 4.6, y: 0.6, z: -1.5, w: 0.8, h: 1.2, d: 10, color: PAL.sage },
      { x: -1, y: 0.6, z: -3, w: 8, h: 1.2, d: 0.8, color: PAL.sage },
      { x: 2, y: 0.6, z: 1.5, w: 0.8, h: 1.2, d: 4, color: PAL.sage },
      { x: -2.5, y: 0.3, z: 8.5, w: 3, h: 0.6, d: 2, color: PAL.yellow }, // step up the entrance
    ],
  },
];

// ---------- Normalization (tolerant of editor output shape drift) ----------
function num(v, d) { return Number.isFinite(+v) ? +v : d; }

function normalizeBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const w = num(b.w ?? b.sx ?? (Array.isArray(b.size) ? b.size[0] : undefined), 1);
  const h = num(b.h ?? b.sy ?? (Array.isArray(b.size) ? b.size[1] : undefined), 1);
  const d = num(b.d ?? b.sz ?? (Array.isArray(b.size) ? b.size[2] : undefined), 1);
  if (w <= 0 || h <= 0 || d <= 0) return null;
  let color = PAL.beige;
  const c = b.color;
  if (Number.isFinite(c)) color = c;
  else if (typeof c === 'string') { const p = parseInt(c.replace('#', ''), 16); if (Number.isFinite(p)) color = p; }
  return { x: num(b.x, 0), y: num(b.y, h / 2), z: num(b.z, 0), w, h, d, color };
}

function normalizeWorld(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  if (Array.isArray(raw.pieces)) {
    const compiled = compileLevelForPlay(raw);
    if (!compiled) return null;
    return {
      playbackNormalized: true,
      id: compiled.id,
      name: compiled.name,
      creator: compiled.creator,
      featured: false,
      localOnly: true,
      basePlays: 0,
      baseLikes: 0,
      spawn: compiled.spawn,
      goal: compiled.goal,
      gameplay: compiled.gameplay,
      discovery: compiled.discovery,
      blocks: [],
      runtimePieces: compiled.runtimePieces,
      pieceCount: compiled.pieces.length,
      assetLabels: [...new Set(compiled.runtimePieces.map((piece) =>
        LEVEL_ASSETS[piece.assetId]?.label
      ).filter(Boolean))],
    };
  }
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks
    : Array.isArray(raw.objects) ? raw.objects : [];
  const blocks = rawBlocks.map(normalizeBlock).filter(Boolean);
  return {
    playbackNormalized: true,
    id: String(raw.id),
    name: String(raw.name || 'Untitled World').slice(0, 48),
    creator: String(raw.creator || 'Unknown').slice(0, 32),
    featured: !!raw.featured,
    basePlays: num(raw.basePlays, 0), baseLikes: num(raw.baseLikes, 0),
    spawn: { x: num(raw.spawn?.x, 0), z: num(raw.spawn?.z, 10) },
    goal: { x: num(raw.goal?.x, 0), z: num(raw.goal?.z, -10) },
    gameplay: {
      mode: 'race',
      objective: UGC_GAMEPLAY_MODES.race.objective,
      durationSeconds: null,
      targetScore: null,
    },
    discovery: { scope: 'built-in', templateId: '', tags: ['race'] },
    blocks,
    runtimePieces: [],
    pieceCount: blocks.length,
    assetLabels: [],
  };
}

export function commitUgcWorldWinReward(save) {
  const total = save?.addCoins?.(UGC_WIN_REWARD, 'ugc-world-win');
  return {
    rewardCommitted: Number.isFinite(total),
    coins: Number.isFinite(total) ? UGC_WIN_REWARD : 0,
    attemptedCoins: UGC_WIN_REWARD,
    total: Number.isFinite(total) ? total : null,
  };
}

export function partitionUgcStaticPieces(runtimePieces = []) {
  const blocks = [];
  const ramps = [];
  const dynamic = [];
  for (const piece of Array.isArray(runtimePieces) ? runtimePieces : []) {
    if (piece?.assetId === 'block.basic') blocks.push(piece);
    else if (piece?.assetId === 'ramp.basic') ramps.push(piece);
    else dynamic.push(piece);
  }
  return { blocks, ramps, dynamic };
}

// ---------- Styles (injected while the panel is open) ----------
const CSS = `
.uvd-tabs{display:flex;gap:8px;margin:2px 0 12px}
.uvd-tab{font:500 13px -apple-system,system-ui,sans-serif;padding:8px 14px;border-radius:999px;border:1px solid #e5e5ea;background:#f5f5f7;color:#9a9aa2;cursor:pointer}
.uvd-tab.on{background:#060c21;color:#ffffff;border-color:#060c21}
.uvd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.uvd-card{border:1px solid #e5e5ea;border-radius:10px;background:#f5f5f7;overflow:hidden;display:flex;flex-direction:column}
.uvd-thumb{height:72px;display:flex;align-items:center;justify-content:center;font-size:30px}
.uvd-info{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.uvd-name{margin:0;font-weight:600;font-size:14.5px;color:#060c21}
.uvd-creator{font-size:12px;color:#9a9aa2}
.uvd-stats{display:flex;gap:10px;font-size:12px;color:#9a9aa2;font-weight:600}
.uvd-pieces{font-size:11.5px;line-height:1.35;color:#4e4d4d}
.uvd-actions{display:flex;gap:6px;margin-top:auto;flex-wrap:wrap}
.uvd-btn{font:500 12px/1 -apple-system,system-ui,sans-serif;padding:8px 12px;border-radius:999px;border:1px solid #e5e5ea;background:#ffffff;color:#060c21;cursor:pointer}
.uvd-btn:hover{border-color:#a9a9b1}
.uvd-btn.primary{background:#0A84FF;border-color:#0A84FF;font-weight:600}
.uvd-btn:disabled{opacity:.5;cursor:default}
.uvd-btn.danger,.uv-btn.danger{background:#c46f8e;border-color:#c46f8e;color:#ffffff}
.uvd-empty{padding:24px;text-align:center;color:#9a9aa2;font-size:14px}
.uvd-mod{border:1px solid #e5e5ea;border-radius:14px;background:#f5f5f7;padding:12px 14px;margin-bottom:10px}
.uvd-mod h4{margin:0 0 4px;font-size:14px;color:#060c21}
.uvd-mod p{margin:0 0 8px;font-size:12.5px;color:#9a9aa2}
.uvd-reasons{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.uvd-playhud{position:fixed;top:calc(env(safe-area-inset-top) + 72px);left:calc(env(safe-area-inset-left) + 12px);z-index:55;box-sizing:border-box;display:flex;min-height:44px;max-width:calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 24px);align-items:center;background:rgba(255,255,255,.94);border:1px solid #e5e5ea;border-radius:10px;padding:10px 14px;font:600 13px/1.25 -apple-system,system-ui,sans-serif;color:#060c21;box-shadow:0 4px 14px rgba(6,12,33,.12);backdrop-filter:blur(8px)}
.uvd-win{z-index:70;background:rgba(6,12,33,.42)}
.uvd-winbox{width:min(440px,calc(100vw - 32px));text-align:center}
.uvd-winbox .uv-body{padding-top:6px}
.uvd-result-copy{margin:0 0 16px;color:#4e4d4d;font-size:14px;line-height:1.45}
.uvd-win-actions{justify-content:center}
.uvd-win-actions .uv-btn{min-height:44px}
body.ugc-result #touch-ui{visibility:hidden}
@media(max-width:620px){
  .uvd-panel header .uv-x,.uvd-report-panel header .uv-x{width:44px;height:44px}
  .uvd-tabs{position:sticky;top:0;z-index:3;padding:4px 0 8px;margin:0 0 8px;background:#ffffff}
  .uvd-tab,.uvd-btn,.uvd-mod .uv-btn,.uvd-reasons .uv-btn{min-height:44px}
  .uvd-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  .uvd-actions .uvd-btn{width:100%}
  .uvd-actions .uvd-btn:nth-child(3){grid-column:1 / -1}
  .uvd-playhud{top:calc(env(safe-area-inset-top) + 68px);right:calc(env(safe-area-inset-right) + 8px);left:calc(env(safe-area-inset-left) + 8px);max-width:none}
  .uvd-winbox{width:calc(100vw - 20px)}
  .uvd-winbox .uv-body{padding:8px 20px 22px}
  .uvd-win-actions{display:grid;grid-template-columns:1fr}
  .uvd-win-actions .uv-btn{width:100%}
}
`;

// ---------- Self-contained play mode (reach-the-goal, stepPlayer sim) ----------
function playWorld(ctx, rawWorld) {
  const world = rawWorld?.playbackNormalized === true ? rawWorld : normalizeWorld(rawWorld);
  if (!world) { ctx.ui.toast('This world could not be loaded'); return; }
  const T = ctx.THREE;
  const modeName = document.getElementById('mode-name');
  const query = new URLSearchParams(location.search);
  const visualQaPlayback = query.get('visualQaUgc') === '1';
  const qaCharacterLod = query.get('qa') === '1'
    && ['hero', 'game', 'crowd'].includes(query.get('ugcCharacterLod'))
    ? query.get('ugcCharacterLod')
    : 'game';

  // Opening the world is a true play-entry fact even if the optional aggregate
  // counter cannot be persisted. Keep that event independent, but expose the
  // failed device-local counter instead of implying it was saved.
  const playCount = incrementLocalCounter(ctx.save, 'ugcPlays', world.id);
  const counterCommitted = Number.isFinite(playCount);
  ctx.bus.emit('ugc-play', {
    id: world.id,
    name: world.name,
    counterCommitted,
    playCount: counterCommitted ? playCount : null,
  });
  if (!counterCommitted) {
    ctx.ui.toast('World opened, but its local play count could not be saved on this device.');
  }

  // ----- Scene -----
  const scene = new T.Scene();
  createUgcStage(T, scene, {
    mode: world.gameplay.mode,
    plotSize: world.localOnly ? 16 : 30,
    templateId: world.discovery.templateId,
  });
  const camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);

  scene.add(new T.HemisphereLight(0xfff2de, 0xd8c4a8, 0.95));
  const sun = new T.DirectionalLight(0xffe2b8, 1.5);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  // UGC is a bounded 16x16 stage. A tighter 256 map preserves readable
  // grounding while avoiding a full-resolution shadow pass for tiny widgets.
  const shadowExtent = world.localOnly ? 14 : 30;
  sun.shadow.mapSize.set(world.localOnly ? 256 : 512, world.localOnly ? 256 : 512);
  sun.shadow.camera.left = -shadowExtent; sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent; sun.shadow.camera.bottom = -shadowExtent;
  sun.shadow.camera.far = 90;
  scene.add(sun); scene.add(sun.target);

  // ----- Blocks + sim environment -----
  const walkables = [];
  const spinners = [];
  const bouncePads = [];
  const scoreStars = [];
  let extent = 14;
  for (const b of world.blocks) {
    const mesh = new T.Mesh(
      new T.BoxGeometry(b.w, b.h, b.d),
      new T.MeshStandardMaterial({ color: b.color, roughness: 0.85 })
    );
    mesh.position.set(b.x, b.y, b.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.box2 = {
      minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
    };
    scene.add(mesh);
    walkables.push(mesh);
    extent = Math.max(extent, Math.abs(b.x) + b.w / 2 + 6, Math.abs(b.z) + b.d / 2 + 6);
  }

  const assetColors = {
    'block.basic': UGC_ASSET_COLORS.block,
    'ramp.basic': UGC_ASSET_COLORS.ramp,
    'hazard.spinner': UGC_ASSET_COLORS.spinner,
    'play.bounce': UGC_ASSET_COLORS.bounce,
    'play.score': UGC_ASSET_COLORS.score,
  };
  const staticPieces = partitionUgcStaticPieces(world.runtimePieces);
  const staticBatchStats = {
    blocks: staticPieces.blocks.length,
    ramps: staticPieces.ramps.length,
    collisionProxies: 0,
    renderedBatches: 0,
  };
  const instanceTransform = new T.Object3D();
  function setInstanceTransform(
    batch,
    index,
    x,
    y,
    z,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    scale = 1,
  ) {
    instanceTransform.position.set(x, y, z);
    instanceTransform.rotation.set(rotationX, rotationY, rotationZ);
    instanceTransform.scale.setScalar(scale);
    instanceTransform.updateMatrix();
    batch.setMatrixAt(index, instanceTransform.matrix);
  }
  const rampRotations = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
  const rampShape = new T.Shape();
  rampShape.moveTo(-0.5, 0);
  rampShape.lineTo(0.5, 0);
  rampShape.lineTo(0.5, 0.6);
  rampShape.lineTo(-0.5, 0);

  const staticBatchDefinitions = [
    {
      assetId: 'block.basic',
      pieces: staticPieces.blocks,
      geometry: () => new T.BoxGeometry(1, 0.6, 1),
      material: () => new T.MeshStandardMaterial({
        color: assetColors['block.basic'],
        roughness: 0.85,
      }),
      place(object, piece) {
        object.position.set(piece.x, 0.3, piece.z);
        object.rotation.set(0, 0, 0);
      },
    },
    {
      assetId: 'ramp.basic',
      pieces: staticPieces.ramps,
      geometry: () => {
        const geometry = new T.ExtrudeGeometry(
          rampShape,
          { depth: 1, bevelEnabled: false },
        );
        geometry.translate(0, 0, -0.5);
        return geometry;
      },
      material: () => new T.MeshStandardMaterial({
        color: assetColors['ramp.basic'],
        roughness: 0.82,
      }),
      place(object, piece) {
        object.position.set(piece.x, 0, piece.z);
        object.rotation.set(0, rampRotations[piece.rot & 3], 0);
      },
    },
  ];

  for (const definition of staticBatchDefinitions) {
    if (!definition.pieces.length) continue;
    const geometry = definition.geometry();
    const material = definition.material();
    const batch = new T.InstancedMesh(geometry, material, definition.pieces.length);
    batch.name = `ugc-${definition.assetId}-batch`;
    batch.userData.perfGroup = 'ugc-static';
    batch.userData.assetId = definition.assetId;
    batch.castShadow = true;
    batch.receiveShadow = true;
    definition.pieces.forEach((piece, index) => {
      definition.place(instanceTransform, piece);
      instanceTransform.scale.setScalar(1);
      instanceTransform.updateMatrix();
      batch.setMatrixAt(index, instanceTransform.matrix);

      // Physics remains one raycastable mesh per authored piece. These proxies
      // never render, so batching changes presentation cost without changing
      // sloped ground sampling or the piece-local collision boundary.
      const collisionProxy = new T.Mesh(geometry, material);
      collisionProxy.name = `ugc-${definition.assetId}-collision`;
      collisionProxy.visible = false;
      definition.place(collisionProxy, piece);
      collisionProxy.userData.box2 = {
        minX: piece.x - 0.5, maxX: piece.x + 0.5,
        minZ: piece.z - 0.5, maxZ: piece.z + 0.5,
      };
      collisionProxy.updateWorldMatrix(true, false);
      walkables.push(collisionProxy);
      staticBatchStats.collisionProxies += 1;
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    scene.add(batch);
    staticBatchStats.renderedBatches += 1;
  }

  const spinnerPieces = staticPieces.dynamic
    .filter(({ assetId }) => assetId === 'hazard.spinner');
  const bouncePieces = staticPieces.dynamic
    .filter(({ assetId }) => assetId === 'play.bounce');
  const scorePieces = staticPieces.dynamic
    .filter(({ assetId }) => assetId === 'play.score');
  const animatedBatchStats = {
    spinnerBases: spinnerPieces.length,
    spinnerArms: spinnerPieces.length,
    bounceBases: bouncePieces.length,
    bounceRings: bouncePieces.length,
    scoreStars: scorePieces.length,
    collisionProxies: 0,
    renderedBatches: 0,
  };
  let spinnerArmBatch = null;
  let bounceRingBatch = null;
  let scoreStarBatch = null;

  function addAnimatedBatch(batch, name, { moving = false } = {}) {
    batch.name = name;
    batch.userData.perfGroup = 'ugc-animated';
    if (moving) {
      batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
    }
    batch.instanceMatrix.needsUpdate = true;
    if (!moving) {
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
    }
    scene.add(batch);
    animatedBatchStats.renderedBatches += 1;
  }

  if (spinnerPieces.length) {
    const baseGeometry = new T.CylinderGeometry(0.42, 0.5, 0.25, 16);
    const baseMaterial = new T.MeshStandardMaterial({
      color: assetColors['hazard.spinner'],
      roughness: 0.7,
    });
    const baseBatch = new T.InstancedMesh(
      baseGeometry,
      baseMaterial,
      spinnerPieces.length,
    );
    spinnerArmBatch = new T.InstancedMesh(
      new T.BoxGeometry(1.7, 0.2, 0.2),
      new T.MeshStandardMaterial({ color: PAL.ink, roughness: 0.5 }),
      spinnerPieces.length,
    );
    spinnerPieces.forEach((piece, index) => {
      setInstanceTransform(baseBatch, index, piece.x, 0.125, piece.z);
      setInstanceTransform(spinnerArmBatch, index, piece.x, 0.42, piece.z);
      const collisionProxy = new T.Mesh(baseGeometry, baseMaterial);
      collisionProxy.name = 'ugc-hazard.spinner-collision';
      collisionProxy.visible = false;
      collisionProxy.position.set(piece.x, 0.125, piece.z);
      collisionProxy.userData.box2 = {
        minX: piece.x - 0.5, maxX: piece.x + 0.5,
        minZ: piece.z - 0.5, maxZ: piece.z + 0.5,
      };
      collisionProxy.updateWorldMatrix(true, false);
      walkables.push(collisionProxy);
      spinners.push({ index, x: piece.x, z: piece.z, cooldown: 0 });
      animatedBatchStats.collisionProxies += 1;
    });
    addAnimatedBatch(baseBatch, 'ugc-spinner-base-batch');
    addAnimatedBatch(spinnerArmBatch, 'ugc-spinner-arm-batch', { moving: true });
  }

  if (bouncePieces.length) {
    const baseGeometry = new T.CylinderGeometry(0.46, 0.5, 0.14, 20);
    const baseMaterial = new T.MeshStandardMaterial({
      color: assetColors['play.bounce'],
      roughness: 0.58,
      emissive: assetColors['play.bounce'],
      emissiveIntensity: 0.32,
    });
    const baseBatch = new T.InstancedMesh(
      baseGeometry,
      baseMaterial,
      bouncePieces.length,
    );
    bounceRingBatch = new T.InstancedMesh(
      new T.TorusGeometry(0.31, 0.045, 8, 24),
      new T.MeshStandardMaterial({
        color: 0xfbfff8,
        roughness: 0.42,
        emissive: assetColors['play.bounce'],
        emissiveIntensity: 0.7,
      }),
      bouncePieces.length,
    );
    bouncePieces.forEach((piece, index) => {
      setInstanceTransform(baseBatch, index, piece.x, 0.07, piece.z);
      setInstanceTransform(
        bounceRingBatch,
        index,
        piece.x,
        0.17,
        piece.z,
        Math.PI / 2,
      );
      const collisionProxy = new T.Mesh(baseGeometry, baseMaterial);
      collisionProxy.name = 'ugc-play.bounce-collision';
      collisionProxy.visible = false;
      collisionProxy.position.set(piece.x, 0.07, piece.z);
      collisionProxy.userData.box2 = {
        minX: piece.x - 0.5, maxX: piece.x + 0.5,
        minZ: piece.z - 0.5, maxZ: piece.z + 0.5,
      };
      collisionProxy.updateWorldMatrix(true, false);
      walkables.push(collisionProxy);
      bouncePads.push({ index, x: piece.x, z: piece.z, cooldown: 0 });
      animatedBatchStats.collisionProxies += 1;
    });
    addAnimatedBatch(baseBatch, 'ugc-bounce-base-batch');
    addAnimatedBatch(bounceRingBatch, 'ugc-bounce-ring-batch', { moving: true });
  }

  if (scorePieces.length) {
    scoreStarBatch = new T.InstancedMesh(
      new T.OctahedronGeometry(0.36),
      new T.MeshStandardMaterial({
        color: assetColors['play.score'],
        roughness: 0.42,
        emissive: assetColors['play.score'],
        emissiveIntensity: 0.6,
      }),
      scorePieces.length,
    );
    scorePieces.forEach((piece, index) => {
      setInstanceTransform(scoreStarBatch, index, piece.x, 0.72, piece.z);
      scoreStars.push({
        index,
        x: piece.x,
        z: piece.z,
        collected: false,
      });
    });
    addAnimatedBatch(scoreStarBatch, 'ugc-score-star-batch', { moving: true });
  }
  for (const piece of world.runtimePieces || []) {
    extent = Math.max(extent, Math.abs(piece.x) + 7, Math.abs(piece.z) + 7);
  }
  extent = Math.max(extent, Math.abs(world.spawn.x) + 8, Math.abs(world.spawn.z) + 8);
  if (world.goal) {
    extent = Math.max(
      extent,
      Math.abs(world.goal.x) + 8,
      Math.abs(world.goal.z) + 8,
    );
  }

  const groundRay = new T.Raycaster();
  const groundOrigin = new T.Vector3();
  const down = new T.Vector3(0, -1, 0);
  const env = {
    bounds: extent,
    sampleGround(x, z, fromY) {
      groundOrigin.set(x, fromY, z);
      groundRay.set(groundOrigin, down);
      groundRay.far = Math.max(1, fromY + 4);
      const hits = groundRay.intersectObjects(walkables, false);
      if (hits.length) {
        return { y: hits[0].point.y, box2: hits[0].object.userData.box2 || null };
      }
      return { y: 0, box2: null };
    },
  };

  // ----- Goal marker -----
  const goalGroup = new T.Group();
  const goalTopY = world.goal
    ? env.sampleGround(world.goal.x, world.goal.z, 500).y
    : 0;
  const ring = new T.Mesh(
    new T.TorusGeometry(1.1, 0.1, 10, 28),
    new T.MeshBasicMaterial({ color: PAL.yellow })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  const star = new T.Mesh(
    new T.OctahedronGeometry(0.45),
    new T.MeshStandardMaterial({ color: PAL.yellow, roughness: 0.4, emissive: 0x554411 })
  );
  star.position.y = 1.6;
  star.castShadow = true;
  const arch = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    new T.MeshStandardMaterial({
      color: 0xfff8e8,
      roughness: 0.48,
    }),
    3,
  );
  arch.name = 'ugc-goal-arch';
  arch.userData.perfGroup = 'ugc-objective';
  const archTransform = new T.Object3D();
  const goalRunsAlongX = world.goal
    && Math.abs(world.goal.x - world.spawn.x) > Math.abs(world.goal.z - world.spawn.z);
  const archParts = goalRunsAlongX
    ? [
      { position: [0, 0.75, -0.72], scale: [0.12, 1.5, 0.12] },
      { position: [0, 0.75, 0.72], scale: [0.12, 1.5, 0.12] },
      { position: [0, 1.47, 0], scale: [0.14, 0.14, 1.56] },
    ]
    : [
      { position: [-0.72, 0.75, 0], scale: [0.12, 1.5, 0.12] },
      { position: [0.72, 0.75, 0], scale: [0.12, 1.5, 0.12] },
      { position: [0, 1.47, 0], scale: [1.56, 0.14, 0.14] },
    ];
  archParts.forEach(({ position, scale }, index) => {
    archTransform.position.set(...position);
    archTransform.scale.set(...scale);
    archTransform.updateMatrix();
    arch.setMatrixAt(index, archTransform.matrix);
  });
  arch.instanceMatrix.needsUpdate = true;
  arch.computeBoundingBox();
  arch.computeBoundingSphere();
  goalGroup.add(ring, star, arch);
  if (world.goal && world.gameplay.mode === 'race') {
    goalGroup.position.set(world.goal.x, goalTopY, world.goal.z);
    scene.add(goalGroup);
  }

  // ----- Player -----
  let rig = new T.Group();
  scene.add(rig);
  const fallback = new T.Mesh(
    new T.CapsuleGeometry(0.45, 1.0, 6, 12),
    new T.MeshStandardMaterial({ color: PAL.cream, roughness: 0.6 })
  );
  fallback.position.y = 0.95; fallback.castShadow = true;
  rig.add(fallback);
  let disposed = false;
  let characterInstance = null;
  ctx.characters.createInstance(ctx.characters.equippedId(), {
    skinTone: ctx.save.settings.skinTone,
    lod: qaCharacterLod,
    shadow: 'hero',
  }).then((instance) => {
    if (disposed) {
      instance.dispose();
      return;
    }
    scene.remove(rig);
    fallback.geometry.dispose();
    fallback.material.dispose();
    characterInstance = instance;
    rig = instance.root;
    scene.add(rig);
  }).catch(() => { /* capsule fallback already in place */ });

  const sim = createPlayerState(world.spawn.x, world.spawn.z);
  const openingTarget = world.goal || scoreStars[0] || { x: world.spawn.x, z: world.spawn.z - 1 };
  sim.yaw = Math.atan2(openingTarget.x - world.spawn.x, openingTarget.z - world.spawn.z);
  let camYaw = sim.yaw;
  camera.position.set(
    sim.pos.x - Math.sin(camYaw) * 5.5, sim.pos.y + 3.4, sim.pos.z - Math.cos(camYaw) * 5.5
  );
  camera.lookAt(sim.pos.x, sim.pos.y + 1.4, sim.pos.z);
  if (visualQaPlayback) {
    if (world.gameplay.mode === 'race' && world.goal) {
      const dx = world.goal.x - world.spawn.x;
      const dz = world.goal.z - world.spawn.z;
      const length = Math.hypot(dx, dz) || 1;
      const ux = dx / length;
      const uz = dz / length;
      camera.position.set(
        world.spawn.x - ux * 5.2 - uz * 0.7,
        6.8,
        world.spawn.z - uz * 5.2 + ux * 0.7,
      );
      camera.lookAt(
        (world.spawn.x + world.goal.x) * 0.5,
        0.25,
        (world.spawn.z + world.goal.z) * 0.5,
      );
    } else {
      camera.position.set(-11.2, 9.2, 12.8);
      camera.lookAt(0, 0.15, 0);
    }
  }
  const camPos = camera.position.clone();
  const camTarget = new T.Vector3();

  // ----- HUD overlay -----
  const hud = document.createElement('div');
  hud.className = 'uvd-playhud';
  hud.setAttribute('role', 'group');
  hud.setAttribute('aria-label', 'World objective and elapsed time');
  const hudText = document.createElement('span');
  hud.appendChild(hudText);
  document.body.appendChild(hud);

  const view = { scene, camera };
  ctx.bus.emit('performance-scope', 'ugc');
  ctx.view.current = view;
  document.body.classList.add('in-game');
  if (modeName) {
    modeName.textContent = world.name;
    const detail = document.createElement('small');
    const modeLabel = UGC_GAMEPLAY_MODES[world.gameplay.mode]?.label || 'Race';
    detail.textContent = world.localOnly
      ? `${modeLabel} creator level · on-device local play`
      : 'Built-in featured level · local play';
    modeName.appendChild(detail);
  }

  let acc = 0, elapsed = 0, lastHudText = '', won = false;
  let lastPresentationTick = -1;
  let retryCount = 0, retryCueUntil = 0;
  let qaApi = null;
  const survivalDuration = query.get('qa') === '1'
    ? (visualQaPlayback ? UGC_GAMEPLAY_MODES.survival.durationSeconds : 3)
    : (world.gameplay.durationSeconds || UGC_GAMEPLAY_MODES.survival.durationSeconds);

  function scoreProgress() {
    return scoreStars.filter((score) => score.collected).length;
  }

  function characterAudit() {
    if (!characterInstance) {
      return {
        requestedLod: qaCharacterLod,
        loaded: false,
      };
    }
    let meshes = 0;
    let triangles = 0;
    const geometries = new Set();
    const materials = new Set();
    const geometryProfile = [];
    characterInstance.mesh.traverse((object) => {
      if (!object.isMesh) return;
      meshes += 1;
      const geometry = object.geometry;
      const meshTriangles = geometry?.index
        ? geometry.index.count / 3
        : (geometry?.attributes?.position?.count || 0) / 3;
      triangles += meshTriangles;
      geometryProfile.push(Math.round(meshTriangles));
      if (geometry?.uuid) geometries.add(geometry.uuid);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of meshMaterials) {
        if (material?.uuid) materials.add(material.uuid);
      }
    });
    return {
      requestedLod: qaCharacterLod,
      activeLod: characterInstance.lod,
      loaded: true,
      meshes,
      triangles: Math.round(triangles),
      uniqueGeometries: geometries.size,
      uniqueMaterials: materials.size,
      geometryProfile: geometryProfile.sort((a, b) => a - b),
      anchors: Object.keys(characterInstance.anchors).sort(),
      bounds: { ...characterInstance.bounds },
      animatorContract: ['update', 'signal', 'play', 'reset']
        .every((method) => typeof characterInstance.animator[method] === 'function'),
    };
  }

  function retryFromFall() {
    if (sim.pos.y >= -4) return false;
    sim.pos.x = world.spawn.x;
    sim.pos.y = 0;
    sim.pos.z = world.spawn.z;
    sim.vel.x = 0;
    sim.vel.y = 0;
    sim.vel.z = 0;
    sim.grounded = true;
    retryCount += 1;
    retryCueUntil = elapsed + 2;
    ctx.bus.emit('ugc-retry', {
      id: world.id,
      reason: 'fall',
      retryCount,
    });
    return true;
  }

  function updateHud() {
    let objective;
    if (world.gameplay.mode === 'survival') {
      objective = `🛡️ Stay in play · ${Math.max(0, survivalDuration - elapsed).toFixed(1)}s`;
    } else if (world.gameplay.mode === 'score') {
      objective = `⭐ Collect every Score Star · ${scoreProgress()}/${scoreStars.length}`;
    } else {
      objective = `🏁 Reach the glowing goal · ${Math.floor(elapsed)}s`;
    }
    const text = elapsed < retryCueUntil
      ? `↻ Back at the start · retry ${retryCount} · ${objective}`
      : objective;
    if (text === lastHudText) return;
    lastHudText = text;
    hudText.textContent = text;
  }

  function win() {
    won = true;
    characterInstance?.animator.play('celebrate');
    const reward = commitUgcWorldWinReward(ctx.save);
    if (!reward.rewardCommitted) {
      ctx.ui.toast('World completed, but its Coin reward could not be saved on this device.');
    }
    document.body.classList.add('ugc-result');
    let resultAction = false;
    const resultPanel = ctx.ui.panel({
      title: world.gameplay.mode === 'survival'
        ? '🎉 Survival complete!'
        : world.gameplay.mode === 'score' ? '🎉 All stars collected!' : '🎉 Goal reached!',
      closeLabel: 'Back to Discover',
      onClose: () => {
        if (resultAction) return;
        resultAction = true;
        cleanup();
        queueMicrotask(() => ctx.systems.get('discovery')?.open(ctx));
      },
    });
    resultPanel.el.classList.add('uvd-winbox');
    resultPanel.el.closest('.uv-panel-veil')?.classList.add('uvd-win');
    const p = document.createElement('p');
    p.className = 'uvd-result-copy';
    p.textContent = reward.rewardCommitted
      ? `${world.name} — completed in ${elapsed.toFixed(1)}s · +${reward.coins} Coins`
      : `${world.name} — completed in ${elapsed.toFixed(1)}s · Coin reward not saved on this device`;
    const row = document.createElement('div');
    row.className = 'uv-row uvd-win-actions';
    const leaveResult = (next) => {
      resultAction = true;
      resultPanel.close();
      cleanup();
      next();
    };
    row.append(
      ctx.ui.button('Back to Discover', () => leaveResult(() => {
        queueMicrotask(() => ctx.systems.get('discovery')?.open(ctx));
      }), { primary: true }),
      ctx.ui.button('My Worlds', () => leaveResult(() => {
        queueMicrotask(async () => {
          try {
            await import('./editor.js');
            ctx.systems.get('editor')?.open(ctx);
          } catch {
            ctx.ui.toast('My Worlds could not open. Please try again.');
          }
        });
      })),
      ctx.ui.button('Return to 67 Park', () => leaveResult(() => ctx.goHome())),
    );
    resultPanel.body.append(p, row);
    hud._resultPanel = resultPanel;
  }

  const simInput = {
    dirX: 0,
    dirZ: 0,
    moving: false,
    jumpHeld: false,
    grabPressed: false,
  };
  const stop = ctx.loop.add((dt) => {
    if (ctx.view.current !== view) { cleanup(); return; } // Escape / goHome
    if (won) return;
    elapsed += dt;

    const pad = ctx.input.poll();
    const forwardX = Math.sin(camYaw);
    const forwardZ = Math.cos(camYaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    let dirX = forwardX * -pad.my + rightX * pad.mx;
    let dirZ = forwardZ * -pad.my + rightZ * pad.mx;
    const dLen = Math.hypot(dirX, dirZ);
    if (dLen > 1e-4) { dirX /= Math.max(1, dLen); dirZ /= Math.max(1, dLen); }
    simInput.dirX = dirX;
    simInput.dirZ = dirZ;
    simInput.moving = pad.moving && dLen > 1e-4;
    simInput.jumpHeld = pad.jumpHeld;
    simInput.grabPressed = pad.grabPressed;

    acc += dt;
    while (acc >= SIM_DT) {
      const wasGrounded = sim.grounded;
      stepPlayer(sim, simInput, SIM_DT, env);
      if (sim.jumpEvent) characterInstance?.animator.signal('jump');
      if (!wasGrounded && sim.grounded) characterInstance?.animator.signal('land');
      for (const spinner of spinners) {
        spinner.cooldown = Math.max(0, spinner.cooldown - SIM_DT);
        const dx = sim.pos.x - spinner.x;
        const dz = sim.pos.z - spinner.z;
        const distance = Math.hypot(dx, dz);
        if (spinner.cooldown <= 0 && distance < 1.05 && sim.pos.y < 0.75) {
          const nx = distance > 1e-4 ? dx / distance : 1;
          const nz = distance > 1e-4 ? dz / distance : 0;
          sim.vel.x = nx * 7.5;
          sim.vel.z = nz * 7.5;
          sim.vel.y = 3.2;
          sim.grounded = false;
          spinner.cooldown = 0.6;
          characterInstance?.animator.signal('impact');
        }
      }
      for (const bounce of bouncePads) {
        bounce.cooldown = Math.max(0, bounce.cooldown - SIM_DT);
        const dx = sim.pos.x - bounce.x;
        const dz = sim.pos.z - bounce.z;
        if (
          bounce.cooldown <= 0 &&
          Math.hypot(dx, dz) < BOUNCE.triggerRadius &&
          sim.pos.y < BOUNCE.maxContactY &&
          sim.vel.y <= 0.5
        ) {
          sim.vel.y = BOUNCE.launchVelocity;
          sim.grounded = false;
          bounce.cooldown = BOUNCE.cooldown;
          characterInstance?.animator.signal('jump');
          ctx.bus.emit('sfx', 'jump');
        }
      }
      if (world.gameplay.mode === 'score') {
        for (const score of scoreStars) {
          if (score.collected) continue;
          const dx = sim.pos.x - score.x;
          const dz = sim.pos.z - score.z;
          if (Math.hypot(dx, dz) > LEVEL_ASSETS['play.score'].runtime.triggerRadius) continue;
          score.collected = true;
          setInstanceTransform(scoreStarBatch, score.index, score.x, 0.72, score.z, 0, 0, 0, 0);
          scoreStarBatch.instanceMatrix.needsUpdate = true;
          ctx.bus.emit('sfx', 'checkpoint');
        }
      }
      retryFromFall();
      acc -= SIM_DT;
    }

    if (world.gameplay.mode === 'race' && world.goal) {
      const gdx = sim.pos.x - world.goal.x, gdz = sim.pos.z - world.goal.z;
      if (Math.hypot(gdx, gdz) < 1.5 && sim.pos.y >= goalTopY - 0.6) {
        win();
        return;
      }
    } else if (
      world.gameplay.mode === 'score'
      && scoreStars.length > 0
      && scoreProgress() === scoreStars.length
    ) {
      win();
      return;
    } else if (world.gameplay.mode === 'survival' && elapsed >= survivalDuration) {
      win();
      return;
    }

    // Rig + goal animation.
    rig.position.set(sim.pos.x, sim.pos.y, sim.pos.z);
    rig.rotation.y = sim.yaw;
    characterInstance?.animator.update(dt, {
      speed: Math.hypot(sim.vel.x, sim.vel.z),
      grounded: sim.grounded,
    });
    const t = visualQaPlayback ? 1.25 : performance.now() / 1000;
    const presentationTick = Math.floor(t * 30);
    if (presentationTick !== lastPresentationTick) {
      lastPresentationTick = presentationTick;
      if (world.gameplay.mode === 'race') {
        star.rotation.y = t * 2.2;
        star.position.y = 1.6 + Math.sin(t * 3) * 0.15;
        const pulse = 1 + Math.sin(t * 3) * 0.08;
        ring.scale.setScalar(pulse);
      }
      for (const score of scoreStars) {
        if (!score.collected) {
          setInstanceTransform(
            scoreStarBatch,
            score.index,
            score.x,
            0.72 + Math.sin(t * 3 + score.x) * 0.1,
            score.z,
            0,
            t * 2.2,
          );
        }
      }
      if (scoreStarBatch) scoreStarBatch.instanceMatrix.needsUpdate = true;
      for (const spinner of spinners) {
        setInstanceTransform(
          spinnerArmBatch,
          spinner.index,
          spinner.x,
          0.42,
          spinner.z,
          0,
          t * 2.6,
        );
      }
      if (spinnerArmBatch) spinnerArmBatch.instanceMatrix.needsUpdate = true;
      const bouncePulse = 1 + Math.sin(t * 7) * 0.12;
      for (const bounce of bouncePads) {
        setInstanceTransform(
          bounceRingBatch,
          bounce.index,
          bounce.x,
          0.17,
          bounce.z,
          Math.PI / 2,
          0,
          0,
          bouncePulse,
        );
      }
      if (bounceRingBatch) bounceRingBatch.instanceMatrix.needsUpdate = true;
    }

    // Camera follow (hub pattern).
    if (simInput.moving) {
      camYaw = angleLerp(camYaw, Math.atan2(dirX, dirZ), 2.2 * dt);
    }
    if (!visualQaPlayback) {
      camTarget.set(
        sim.pos.x - Math.sin(camYaw) * 5.5,
        sim.pos.y + 3.4,
        sim.pos.z - Math.cos(camYaw) * 5.5
      );
      camPos.lerp(camTarget, 1 - Math.exp(-5 * dt));
      camera.position.copy(camPos);
      camera.lookAt(sim.pos.x, sim.pos.y + 1.4, sim.pos.z);
    }

    updateHud();
  });

  if (query.get('qa') === '1') {
    qaApi = Object.freeze({
      snapshot: () => ({
        id: world.id,
        name: world.name,
        pieces: world.pieceCount,
        retries: retryCount,
        won,
        position: { ...sim.pos },
        spawn: { ...world.spawn },
        goal: world.goal ? { ...world.goal } : null,
        mode: world.gameplay.mode,
        score: scoreProgress(),
        batching: { ...staticBatchStats },
        animatedBatching: { ...animatedBatchStats },
        animatedPieces: {
          spinners: spinners.length,
          bouncePads: bouncePads.length,
        },
        character: characterAudit(),
      }),
      animatedMatrices: () => {
        const firstAndLast = (batch) => {
          if (!batch?.count) return [];
          const matrix = new T.Matrix4();
          return [...new Set([0, batch.count - 1])].map((index) => {
            batch.getMatrixAt(index, matrix);
            return matrix.elements.map((value) => Number(value.toFixed(6)));
          });
        };
        return {
          spinnerArms: firstAndLast(spinnerArmBatch),
          bounceRings: firstAndLast(bounceRingBatch),
        };
      },
      sampleGround: (x, z, fromY = 10) => {
        if (![x, z, fromY].every(Number.isFinite)) return null;
        const sample = env.sampleGround(x, z, fromY);
        return {
          y: sample.y,
          box2: sample.box2 ? { ...sample.box2 } : null,
        };
      },
      forceFallRetry: () => {
        if (won) return false;
        sim.pos.y = -5;
        const retried = retryFromFall();
        updateHud();
        return retried;
      },
      finish: () => {
        if (won) return false;
        if (world.gameplay.mode === 'score') {
          for (const score of scoreStars) {
            score.collected = true;
            setInstanceTransform(scoreStarBatch, score.index, score.x, 0.72, score.z, 0, 0, 0, 0);
          }
          if (scoreStarBatch) scoreStarBatch.instanceMatrix.needsUpdate = true;
        } else if (world.gameplay.mode === 'survival') {
          elapsed = survivalDuration;
        } else if (world.goal) {
          sim.pos.x = world.goal.x;
          sim.pos.y = goalTopY;
          sim.pos.z = world.goal.z;
        }
        sim.vel.x = 0;
        sim.vel.y = 0;
        sim.vel.z = 0;
        sim.grounded = true;
        return true;
      },
    });
    window.__67VERSE_UGC_QA__ = qaApi;
  }
  if (query.get('qa') === '1' && query.get('ugcAutoplay') === '1') {
    if (world.gameplay.mode === 'score') {
      for (const score of scoreStars) {
        score.collected = true;
        setInstanceTransform(scoreStarBatch, score.index, score.x, 0.72, score.z, 0, 0, 0, 0);
      }
      if (scoreStarBatch) scoreStarBatch.instanceMatrix.needsUpdate = true;
    } else if (world.gameplay.mode === 'survival') {
      elapsed = survivalDuration;
    } else if (world.goal) {
      sim.pos.x = world.goal.x;
      sim.pos.y = goalTopY;
      sim.pos.z = world.goal.z;
    }
    sim.vel.x = 0;
    sim.vel.y = 0;
    sim.vel.z = 0;
    sim.grounded = true;
  }

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stop();
    window.removeEventListener('resize', onResize);
    hud.remove();
    hud._resultPanel?.close();
    hud._resultPanel = null;
    document.body.classList.remove('ugc-result');
    if (window.__67VERSE_UGC_QA__ === qaApi) delete window.__67VERSE_UGC_QA__;
    if (ctx.view.current === view) {
      ctx.view.current = null;
      document.body.classList.remove('in-game');
      ctx.bus.emit('performance-scope', 'hub');
    }
    if (modeName) {
      modeName.innerHTML = 'Game mode<small>Local play · training rivals</small>';
    }
    characterInstance?.dispose();
    characterInstance = null;
    scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material?.dispose?.();
      }
    });
  }

  updateHud();
}

// ---------- Discovery panel (system) ----------
let panel = null;
let styleEl = null;
let busUnsubs = [];
const likedThisSession = new Set();

function ensureStyles() {
  if (styleEl?.isConnected) return;
  styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

function closePanel() {
  if (!panel) return;
  for (const off of busUnsubs) off();
  busUnsubs = [];
  panel.close(); // triggers onClose -> panel = null
}

function loadFeed(ctx) {
  const saved = readLocalWorlds(ctx.save);
  const community = saved.filter(isLocallyPublished).map(normalizeWorld).filter(Boolean);
  const featured = FEATURED_WORLDS.map(normalizeWorld).filter(Boolean);
  const knownIds = [
    ...saved.map((world) => world.id),
    ...featured.map((world) => world.id),
  ];
  const plays = retainLocalCounterEntries(ctx.save, 'ugcPlays', knownIds);
  const likes = retainLocalCounterEntries(ctx.save, 'ugcLikes', knownIds);
  const all = [...featured, ...community];
  for (const w of all) {
    w.plays = (w.basePlays || 0) + (plays[w.id] || 0);
    w.likes = (w.baseLikes || 0) + (likes[w.id] || 0);
  }
  all.sort((a, b) => (b.featured - a.featured) || (b.likes + b.plays) - (a.likes + a.plays));
  return all;
}

function renderFeed(ctx, body) {
  body.textContent = '';
  const worlds = loadFeed(ctx);
  const localNotice = document.createElement('p');
  localNotice.style.cssText = 'margin:0 0 12px;color:#4e4d4d;font-size:12.5px;line-height:1.45';
  localNotice.textContent = 'On-device worlds · Published Creator levels stay in this browser. Online sharing is off in this build.';
  body.appendChild(localNotice);
  if (!worlds.length) {
    const e = document.createElement('div');
    e.className = 'uvd-empty';
    e.textContent = 'No worlds yet — build one in the World Builder!';
    body.appendChild(e);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'uvd-grid';
  const thumbColors = ['#0A84FF', '#9a9aa2', '#5a9c7a', '#8a6fb0', '#c46f8e'];

  worlds.forEach((w, i) => {
    const card = document.createElement('article');
    card.className = 'uvd-card';
    card.dataset.worldId = w.id;

    const thumb = document.createElement('div');
    thumb.className = 'uvd-thumb';
    thumb.style.background = `linear-gradient(135deg, ${thumbColors[i % thumbColors.length]}33, ${thumbColors[(i + 2) % thumbColors.length]}55)`;
    thumb.textContent = w.featured ? '⭐' : '🌍';
    card.appendChild(thumb);

    const info = document.createElement('div');
    info.className = 'uvd-info';
    const name = document.createElement('h3');
    name.className = 'uvd-name';
    name.id = `uvd-world-title-${i}`;
    name.textContent = w.name;
    card.setAttribute('aria-labelledby', name.id);
    const creator = document.createElement('div');
    creator.className = 'uvd-creator';
    creator.textContent = w.localOnly
      ? formatLocalCreatorAttribution(w.creator)
      : `by ${w.creator}`;
    const stats = document.createElement('div');
    stats.className = 'uvd-stats';
    stats.textContent = `▶ ${w.plays} plays · ♥ ${w.likes} likes`;
    info.append(name, creator, stats);
    if (w.localOnly) {
      const pieces = document.createElement('div');
      pieces.className = 'uvd-pieces';
      const names = w.assetLabels.slice(0, 3).join(', ');
      const modeLabel = UGC_GAMEPLAY_MODES[w.gameplay?.mode]?.label || 'Race';
      const tags = (w.discovery?.tags || []).slice(0, 3).map((tag) => `#${tag}`).join(' ');
      pieces.textContent =
        `${modeLabel} · ${w.pieceCount} pieces${names ? ` · ${names}` : ''}` +
        `${tags ? ` · ${tags}` : ''}`;
      info.appendChild(pieces);
    }
    if (w.featured) {
      const chip = document.createElement('span');
      chip.className = 'uv-chip';
      chip.textContent = 'Featured';
      info.appendChild(chip);
    } else if (w.localOnly) {
      const chip = document.createElement('span');
      chip.className = 'uv-chip';
      chip.textContent = 'Published on this device';
      info.appendChild(chip);
    }

    const actions = document.createElement('div');
    actions.className = 'uvd-actions';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'uvd-btn primary';
    playBtn.textContent = '▶ Play';
    playBtn.setAttribute('aria-label', `Play ${w.name}`);
    playBtn.onclick = () => { closePanel(); playWorld(ctx, w); };

    const likeBtn = document.createElement('button');
    likeBtn.type = 'button';
    likeBtn.className = 'uvd-btn';
    const liked = likedThisSession.has(w.id);
    likeBtn.textContent = liked ? '♥ Liked' : '♥ Like';
    likeBtn.setAttribute('aria-label', liked ? `Liked ${w.name}` : `Like ${w.name}`);
    likeBtn.disabled = liked;
    likeBtn.onclick = () => {
      const likeCount = incrementLocalCounter(ctx.save, 'ugcLikes', w.id);
      if (!Number.isFinite(likeCount)) {
        ctx.ui.toast('Like could not be saved on this device. Try again.');
        return;
      }
      likedThisSession.add(w.id);
      ctx.bus.emit('ugc-like', { id: w.id, likeCount });
      likeBtn.textContent = '♥ Liked';
      likeBtn.setAttribute('aria-label', `Liked ${w.name}`);
      likeBtn.disabled = true;
      stats.textContent = `▶ ${w.plays} plays · ♥ ${w.baseLikes + likeCount} likes`;
    };

    actions.append(playBtn, likeBtn);

    if (!w.featured) {
      const reportBtn = document.createElement('button');
      reportBtn.type = 'button';
      reportBtn.className = 'uvd-btn';
      reportBtn.textContent = '🚩 Flag locally';
      reportBtn.setAttribute('aria-label', `Flag ${w.name} on this device`);
      reportBtn.title = 'Add to this device’s review list';
      reportBtn.onclick = () => openReportFlow(ctx, w, body);
      actions.appendChild(reportBtn);
    }

    info.appendChild(actions);
    card.appendChild(info);
    grid.appendChild(card);
  });

  body.appendChild(grid);
}

function openReportFlow(ctx, world, feedBody) {
  const rp = ctx.ui.panel({ title: 'Flag level on this device' });
  rp.el.classList.add('uvd-report-panel');
  const msg = document.createElement('p');
  msg.textContent = `What is wrong with “${world.name}”? This only adds it to this device’s review list. Nothing is sent online.`;
  const reasons = document.createElement('div');
  reasons.className = 'uvd-reasons';
  for (const reason of REPORT_REASONS) {
    const b = ctx.ui.button(reason, () => {
      const saved = appendLocalModerationRecord(ctx.save, {
        id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        type: 'ugc-world',
        worldId: world.id,
        worldName: world.name,
        reason,
        reporter: ctx.save.profile.name,
        at: new Date().toISOString(),
        status: 'open',
      });
      if (!saved) {
        ctx.ui.toast('Could not save this flag on this device. Check browser storage and try again.');
        return;
      }
      ctx.bus.emit('ugc-report', { id: world.id, reason });
      rp.close();
      ctx.ui.toast('Flag saved on this device · reporter name kept as a local snapshot.');
    });
    reasons.appendChild(b);
  }
  rp.body.append(msg, reasons);
}

function renderModeration(ctx, body) {
  body.textContent = '';
  const localWorlds = readLocalWorlds(ctx.save);
  const queue = readLocalModerationQueue(ctx.save, {
    worldIds: localWorlds.map((world) => world.id),
  });
  const open = queue.filter((q) => q.status === 'open');

  const intro = document.createElement('p');
  intro.style.cssText = 'margin:0 0 12px;font-size:13px;color:#9a9aa2';
  intro.textContent = open.length
    ? `${open.length} locally flagged level${open.length === 1 ? '' : 's'} in this device’s review list.`
    : 'No levels are flagged in this device’s review list.';
  body.appendChild(intro);

  for (const item of open) {
    const card = document.createElement('div');
    card.className = 'uvd-mod';
    const h = document.createElement('h4');
    h.textContent = `🚩 ${item.worldName}`;
    const p = document.createElement('p');
    const reportTime = item.at ? new Date(item.at).toLocaleString() : 'time unavailable';
    p.textContent = `Reason: ${item.reason} · reported by ${
      formatLocalReporterAttribution(item.reporter)
    } · ${reportTime}`;
    const row = document.createElement('div');
    row.className = 'uv-row';

    const keepBtn = ctx.ui.button('✓ Keep world', async () => {
      const saved = setLocalModerationStatus(ctx.save, item.id, 'kept');
      if (!saved) {
        ctx.ui.toast('Could not update this device’s review list. Check browser storage and try again.');
        return;
      }
      ctx.ui.toast(`Kept “${item.worldName}”.`);
      renderModeration(ctx, body);
    });
    const removeBtn = ctx.ui.button('✕ Remove world', async () => {
      const ok = await ctx.ui.confirm(`Remove “${item.worldName}” from Discover? This can't be undone.`);
      if (!ok) return;
      const result = deleteLocalWorld(ctx.save, item.worldId, { reportStatus: 'removed' });
      if (result.status === 'removed') ctx.ui.toast(`Removed “${item.worldName}".`);
      else if (result.status === 'missing') {
        const saved = setLocalModerationStatus(ctx.save, item.id, 'unavailable');
        if (!saved) {
          ctx.ui.toast('Could not update this device’s review list. Check browser storage and try again.');
          return;
        }
        ctx.ui.toast('That local level is no longer available.');
      } else {
        ctx.ui.toast('Could not remove this level from this device. Check browser storage and try again.');
        return;
      }
      renderModeration(ctx, body);
    }, {});
    removeBtn.classList.add('danger');

    row.append(keepBtn, removeBtn);
    card.append(h, p, row);
    body.appendChild(card);
  }
}

registerSystem('discovery', {
  open(ctx) {
    if (panel) return;
    panel = ctx.ui.panel({
      title: '🌍 Discover Worlds',
      onClose: () => {
        panel = null;
        for (const off of busUnsubs) off();
        busUnsubs = [];
      },
    });
    panel.el.classList.add('uvd-panel');

    ensureStyles();

    const tabs = document.createElement('div');
    tabs.className = 'uvd-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'World browser sections');
    const tabFeed = document.createElement('button');
    tabFeed.className = 'uvd-tab on';
    tabFeed.type = 'button';
    tabFeed.textContent = 'Discover';
    tabFeed.id = 'uvd-tab-discover';
    tabFeed.setAttribute('role', 'tab');
    tabFeed.setAttribute('aria-selected', 'true');
    tabFeed.tabIndex = 0;
    const tabMod = document.createElement('button');
    tabMod.className = 'uvd-tab';
    tabMod.type = 'button';
    tabMod.textContent = 'Local review';
    tabMod.id = 'uvd-tab-review';
    tabMod.setAttribute('role', 'tab');
    tabMod.setAttribute('aria-selected', 'false');
    tabMod.tabIndex = -1;
    tabs.append(tabFeed, tabMod);

    const content = document.createElement('div');
    content.setAttribute('role', 'tabpanel');
    content.setAttribute('aria-labelledby', tabFeed.id);
    tabFeed.setAttribute('aria-controls', 'uvd-tabpanel');
    tabMod.setAttribute('aria-controls', 'uvd-tabpanel');
    content.id = 'uvd-tabpanel';
    panel.body.append(tabs, content);

    const showFeed = () => {
      tabFeed.classList.add('on'); tabMod.classList.remove('on');
      tabFeed.setAttribute('aria-selected', 'true');
      tabMod.setAttribute('aria-selected', 'false');
      tabFeed.tabIndex = 0;
      tabMod.tabIndex = -1;
      content.setAttribute('aria-labelledby', tabFeed.id);
      renderFeed(ctx, content);
    };
    const showMod = () => {
      tabMod.classList.add('on'); tabFeed.classList.remove('on');
      tabFeed.setAttribute('aria-selected', 'false');
      tabMod.setAttribute('aria-selected', 'true');
      tabFeed.tabIndex = -1;
      tabMod.tabIndex = 0;
      content.setAttribute('aria-labelledby', tabMod.id);
      renderModeration(ctx, content);
    };
    tabFeed.onclick = showFeed;
    tabMod.onclick = showMod;
    tabs.addEventListener('keydown', (event) => {
      if (![tabFeed, tabMod].includes(event.target)) return;
      let next = null;
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        next = event.target === tabFeed ? tabMod : tabFeed;
      } else if (event.code === 'Home') {
        next = tabFeed;
      } else if (event.code === 'End') {
        next = tabMod;
      }
      if (!next) return;
      event.preventDefault();
      if (next === tabFeed) showFeed();
      else showMod();
      next.focus();
    });
    showFeed();

    // Live refresh when the editor publishes a world while the feed is open.
    const onPublished = () => {
      if (panel && tabFeed.classList.contains('on')) {
        showFeed();
        ctx.ui.toast('A level was published on this device! ✨');
      }
    };
    ctx.bus.on('ugc-world-published', onPublished);
    busUnsubs.push(() => ctx.bus.off('ugc-world-published', onPublished));
  },
  close() { closePanel(); },
});
