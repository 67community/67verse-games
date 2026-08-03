// main.js — 67VERSE Stage-1 vertical slice: skate-park hub, one ghost, three
// control schemes, fixed-timestep sim ready to be server-owned later.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSkyDome } from './core/sky.js';
import { buildWorld, PALETTE } from './world.js';
import { loadWorldItems } from './world-items.js';
import { cameraRelativeDirection, createInput } from './input.js';
import { createPlayerState, stepPlayer } from './player.js';
import { createCtx } from './core/ctx.js';
import { runHooks } from './core/registry.js';
import { FEATURED_MODES, HUB_SPOTS } from './core/navigation.js';
import {
  ensureGameLoaded,
  ensureSystemLoaded,
  hasGameRoute,
  hasSystemRoute,
  scheduleIdleModules,
} from './modules.js';
import { createGameLifecycle } from './core/game-lifecycle.js';
import {
  createOrbitState,
  orbitCameraPosition,
  resolveCameraObstruction,
  updateOrbitState,
} from './core/chase-camera.js';
import { createQualityController } from './core/quality-tier.js';
import {
  commitHubActivityBest,
  createHubActivitySession,
  HUB_ACTIVITY_DEFINITIONS,
} from './core/hub-activities.js';
import { createLocalSessionTelemetry } from './core/session-telemetry.js';

const SIM_DT = 1 / 60; // fixed timestep (server-compatible)

function wrappedAngleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// Safe pre-settings state. The persisted deterministic tier is applied before
// the first animation frame once the shared context exists.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
renderer.shadowMap.enabled = false;
// Soft, wide penumbra shadows — the Eggy-style look.
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// ACES filmic softens highlights into pastel; exposure lifts it back to bright.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ---------- Scene, sky and fog ----------
const scene = new THREE.Scene();
// The hub is a city park on the ground, not a floating island, so it keeps a
// calm daylight sky of its own rather than the Skyway course's gradient.
scene.fog = new THREE.Fog(PALETTE.sky, 76, 172);

// Image-based lighting is what gives toy-plastic surfaces their soft, rounded
// falloff: every ceramic face picks up gentle directional bounce instead of
// flat lambert shading. Generated once into a PMREM cube — no texture fetch,
// no asset dependency. scene.environment feeds every MeshStandardMaterial.
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;
scene.environmentIntensity = 0.55; // subtle: the sun still leads the key light
pmrem.dispose();

// Plain daylight dome over the park.
const skyDome = createSkyDome(THREE, 180);
skyDome.userData.perfGroup = 'hub-sky';
scene.add(skyDome);

// ---------- Camera ----------
const camera = new THREE.PerspectiveCamera(
  58, window.innerWidth / window.innerHeight, 0.1, 400
);

// ---------- Post-processing: ambient occlusion ----------
// AO is what stops props reading as stickers floating on the ground: it darkens
// the crease where a surface meets another, which is the depth cue soft shadows
// alone cannot supply.
//
// Deliberately AO-only. Bloom was evaluated and rejected — the character's
// texture is emissive-unlit and sits far above 1.0 in linear space, so every
// bloom threshold turned the white head into a lamp. AO reads depth and normals
// instead of brightness, so it is immune to that.
let composer = null;
let gtaoPass = null;
let renderPass = null;

function ensureComposer() {
  if (composer) return composer;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  // Tuned for the park's scale: a ~0.3-unit radius catches the contact line
  // under props, benches and plaza seams without smearing a grey halo across
  // open ground. Blend is held well under 1 so AO reads as grounding, not grime.
  gtaoPass.updateGtaoMaterial({
    radius: 0.3,
    distanceExponent: 1.6,
    thickness: 1.0,
    scale: 1.0,
    samples: 12,
  });
  gtaoPass.blendIntensity = 0.55;
  composer.addPass(gtaoPass);
  composer.addPass(new OutputPass());
  return composer;
}

/**
 * Single render entry so the hub and every mode share one pipeline. Falls back
 * to a direct render whenever AO is off, so the low tier pays nothing for a
 * composer it never uses.
 */
function renderFrame(activeScene, activeCamera) {
  const wantsAO = ctx?.quality?.getState?.()?.ambientOcclusion === true;
  if (!wantsAO) {
    renderer.render(activeScene, activeCamera);
    return;
  }
  const fx = ensureComposer();
  if (fx.__pixelRatio !== renderer.getPixelRatio()) {
    fx.__pixelRatio = renderer.getPixelRatio();
    fx.setPixelRatio(renderer.getPixelRatio());
    fx.setSize(window.innerWidth, window.innerHeight);
  }
  // Game views bring their own scene and camera; point the passes at whichever
  // pair is live this frame.
  renderPass.scene = activeScene;
  renderPass.camera = activeCamera;
  gtaoPass.scene = activeScene;
  gtaoPass.camera = activeCamera;
  fx.render();
}

// ---------- Lighting ----------
// The hemisphere fill is deliberately low: scene.environment (IBL) already
// supplies ambient bounce, and stacking both washes every surface flat.
const hemi = new THREE.HemisphereLight(0xdff3ff, 0x86776b, 0.42);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffefd4, 2.15);
sun.position.set(18, 36, -20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
sun.shadow.bias = -0.0006;
sun.shadow.radius = 7; // wide soft penumbra (PCFSoft)
scene.add(sun);
scene.add(sun.target);
const skyFill = new THREE.DirectionalLight(0x9ed8f2, 0.38);
skyFill.position.set(-24, 18, 28);
skyFill.target.position.set(0, 1, -28);
scene.add(skyFill, skyFill.target);

// Low back-light: separates silhouettes from the sky with a warm edge, the
// trick that keeps candy-toy characters readable against a bright backdrop.
const rim = new THREE.DirectionalLight(0xffd9a8, 0.55);
rim.position.set(-14, 9, -34);
rim.target.position.set(0, 1.2, 6);
scene.add(rim, rim.target);

// ---------- World ----------
const world = buildWorld(scene);
// Authored Meshy props load in parallel and swap in when ready; the
// procedural placeholders keep the hub fully visible in the meantime.
loadWorldItems('/assets/items/')
  .then((items) => { world.applyItems?.(items); })
  .catch(() => {});
queueMicrotask(() => {
  runHooks('hub', ctx, { scene, world, getSim: () => sim });
  ctx.quality?.applyScene(scene);
  // World meshes keep their curated per-object shadow flags from world.js —
  // soft contact shadows are a core part of the Eggy-style look. The quality
  // tier still disables shadowMap entirely on low-end devices.
});

// ---------- Player visual (canonical character instance contract) ----------
let playerRig = new THREE.Group(); // replaced after the async instance resolves
scene.add(playerRig);
let hubCharacter = null;

// ---------- Grab/Push feedback (stub: scale pop + particle ring) ----------
const grabRing = new THREE.Mesh(
  new THREE.RingGeometry(0.45, 0.62, 32),
  new THREE.MeshBasicMaterial({
    color: PALETTE.yellow, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
  })
);
grabRing.rotation.x = -Math.PI / 2;
grabRing.userData.perfGroup = 'hub-feedback';
scene.add(grabRing);
let grabAnim = -1; // 0..1 progress, -1 idle

function fireGrabFeedback() {
  grabAnim = 0;
  console.log('[67VERSE] GRAB/SHOVE! (stub — real interaction ships with multiplayer)');
}

// ---------- Sim + input ----------
// Spawn at the authored arrival court, facing the Play portal and 67 Beacon.
const sim = createPlayerState(0, 28);
const input = createInput();

// ---------- Shared ctx + module shell ----------
const ctx = createCtx({ renderer, input, THREE });
const sessionTelemetry = createLocalSessionTelemetry();
ctx.sessionTelemetry = sessionTelemetry;
let performanceDiagnostics = null;
const hubActivityEl = document.getElementById('hub-activity');
const hubActivityTitleEl = document.getElementById('hub-activity-title');
const hubActivityStatusEl = document.getElementById('hub-activity-status');
const hubActivityExitButton = document.getElementById('hub-activity-exit');
let hubActivityOutcomeTimer = 0;
let hubActivityUiKey = '';

function hideHubActivityUi() {
  clearTimeout(hubActivityOutcomeTimer);
  hubActivityOutcomeTimer = 0;
  hubActivityUiKey = '';
  if (hubActivityEl) hubActivityEl.hidden = true;
}

function renderHubActivity(snapshot, outcome = '') {
  if (!hubActivityEl || !hubActivityTitleEl || !hubActivityStatusEl) return;
  const remaining = snapshot.timeLimit == null
    ? ''
    : ` · ${Math.max(0, Math.ceil(snapshot.timeLimit - snapshot.elapsed))}s`;
  const next = snapshot.nextCheckpoint;
  const action = next?.action === 'jump' ? 'Jump at ' : 'Reach ';
  const status = outcome || (
    next
      ? `${action}${next.label} · ${snapshot.checkpointIndex + 1}/${snapshot.checkpointCount}${remaining}`
      : snapshot.objective
  );
  const uiKey = `${snapshot.title}|${status}|${snapshot.active}`;
  if (uiKey !== hubActivityUiKey) {
    hubActivityTitleEl.textContent = snapshot.title;
    hubActivityStatusEl.textContent = status;
    hubActivityUiKey = uiKey;
  }
  hubActivityExitButton.textContent = snapshot.active ? 'EXIT' : 'DISMISS';
  hubActivityEl.hidden = false;
}

function commitHubActivityReward(event) {
  const claimed = ctx.save.get('hubActivityRewards', {});
  if (claimed[event.activityId]) return 0;
  const next = { ...claimed, [event.activityId]: true };
  const total = ctx.save.commitCoins(
    event.reward,
    `Skypark activity: ${event.title}`,
    () => ctx.save.set('hubActivityRewards', next),
  );
  return total == null ? 0 : event.reward;
}

function onHubActivityEvent(event) {
  world.hubActivityVisuals?.setState(event);
  clearTimeout(hubActivityOutcomeTimer);
  if (event.type === 'started') {
    sessionTelemetry.record('hub_activity_start', {
      activityId: event.activityId,
    });
    renderHubActivity(event);
    ctx.bus.emit('sfx', 'launch');
    ctx.ui.toast(`${event.title} · ${event.objective}`);
  } else if (event.type === 'checkpoint') {
    renderHubActivity(event);
    ctx.bus.emit('sfx', 'checkpoint');
  } else if (event.type === 'completed') {
    const reward = commitHubActivityReward(event);
    sessionTelemetry.record('hub_activity_complete', {
      activityId: event.activityId,
      durationMs: event.elapsed * 1000,
      reward,
    });
    const best = commitHubActivityBest(ctx.save, event.activityId, event.elapsed);
    const completion = reward
      ? `Complete in ${event.elapsed.toFixed(1)}s · +${reward} local Coins`
      : `Complete in ${event.elapsed.toFixed(1)}s · reward already claimed`;
    const result = best.attempted && !best.committed
      ? `${completion} · best time not saved`
      : completion;
    renderHubActivity(event, result);
    ctx.ui.toast(`${event.title} · ${result}`);
    hubActivityOutcomeTimer = setTimeout(hideHubActivityUi, 5000);
  } else if (event.type === 'failed') {
    sessionTelemetry.record('hub_activity_exit', {
      activityId: event.activityId,
      reason: event.reason || 'time-limit',
    });
    const result = 'Time expired · return to the marker to retry';
    renderHubActivity(event, result);
    ctx.ui.toast(`${event.title} · ${result}`);
    hubActivityOutcomeTimer = setTimeout(hideHubActivityUi, 5000);
  } else if (event.type === 'cancelled') {
    sessionTelemetry.record('hub_activity_exit', {
      activityId: event.activityId,
      reason: event.reason || 'player-exit',
    });
    hideHubActivityUi();
    if (!['game-launch', 'panel-open'].includes(event.reason)) {
      ctx.ui.toast(`${event.title} exited`);
    }
  }
}

const hubActivities = createHubActivitySession(
  HUB_ACTIVITY_DEFINITIONS,
  { onEvent: onHubActivityEvent },
);
hubActivityExitButton?.addEventListener('click', () => {
  if (hubActivities.snapshot().active) hubActivities.cancel('exit-button');
  else hideHubActivityUi();
});
// Start the secondary Closet chunk in parallel without blocking the hub. This
// keeps audio's trusted-gesture listeners eager while moving the much larger
// thumbnail/panel implementation off the critical parse path.
const closetReady = ensureSystemLoaded('cosmetics')
  .catch((error) => {
    console.warn('[67VERSE] optional Closet failed to load', error);
    sessionTelemetry.record('recoverable_error', {
      area: 'route-load',
      code: 'optional-system-load',
      routeKind: 'system',
      routeId: 'cosmetics',
    });
    return null;
  });
ctx.quality = createQualityController({
  renderer,
  getScenes: () => [scene, ctx.view.current?.scene],
  capabilities: {
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1,
    touch: ctx.input.isTouchDevice,
    saveData: navigator.connection?.saveData,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  },
  onApplied(state) {
    document.body.dataset.qualityTier = state.tier;
    document.body.dataset.qualityPreference = state.preference;
    performanceDiagnostics?.setQualityMeta();
    sessionTelemetry.record('quality_tier', {
      preference: state.preference,
      tier: state.tier,
      pixelRatio: state.pixelRatio,
    });
  },
});
ctx.quality.applyPreference(ctx.save.settings.quality);
let hubCharacterLoadToken = 0;
async function mountHubCharacter(id = ctx.characters.equippedId()) {
  const loadToken = ++hubCharacterLoadToken;
  try {
    const instance = await ctx.characters.createInstance(id, {
      skinTone: ctx.save.settings.skinTone,
      lod: 'hero',
      shadow: 'hero',
    });
    if (loadToken !== hubCharacterLoadToken) {
      instance.dispose();
      return;
    }
    scene.remove(playerRig);
    hubCharacter?.dispose();
    hubCharacter = instance;
    ctx.hubCharacter = instance;
    playerRig = instance.root;
    playerRig.position.set(sim.pos.x, sim.pos.y, sim.pos.z);
    playerRig.rotation.y = sim.yaw;
    scene.add(playerRig);
    ctx.bus.emit('player-ready', { instance, group: instance.root });
    // The Closet is secondary UI and loads after the hero. Hook replay lets
    // saved accessories attach without making the base hub wait on the chunk.
    closetReady.then((system) => {
      if (system) ctx.bus.emit('player-ready', { instance, group: instance.root });
    });
    console.log('[67VERSE] hub character:', instance.id);
  } catch (error) {
    console.error('[67VERSE] character instance failed to load', error);
    sessionTelemetry.record('recoverable_error', {
      area: 'character-load',
      code: 'instance-fallback',
      routeKind: 'character',
      routeId: id,
    });
    if (hubCharacter) return;
    const fallback = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 1.0, 6, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.6 })
    );
    fallback.position.y = 0.95;
    fallback.castShadow = true;
    playerRig.add(fallback);
  }
}
mountHubCharacter();
ctx.bus.on('character-equipped', ({ id } = {}) => mountHubCharacter(id));
const entryGate = document.getElementById('entry-gate');
const enterButton = document.getElementById('enter-game');
const entrySummary = document.getElementById('entry-summary');
// The tagline is derived from the same list that builds the play chooser, so
// the public promise on the entry gate can never drift from what the menu
// actually offers. The static index.html text is only a pre-boot fallback.
if (entrySummary) {
  entrySummary.textContent = `INSTANT LOCAL PLAY · ${
    FEATURED_MODES.map((mode) => mode.name.toUpperCase()).join(' · ')
  }`;
}
const primaryPlayButton = document.getElementById('primary-play');
const primaryChatButton = document.getElementById('primary-chat');
const returnSkyparkButton = document.getElementById('return-skypark');
const modeName = document.getElementById('mode-name');
const hubStatus = document.getElementById('hub-status');
const devOverlay = document.getElementById('dev-overlay');
let releaseEntryIsolation = entryGate
  ? ctx.ui.isolateModalLayer(entryGate)
  : null;
if (entryGate && !entryGate.hidden) {
  queueMicrotask(() => enterButton?.focus());
}
const query = new URLSearchParams(location.search);
// External lobby hand-off: when a game is deep-linked with ?return=<url> (the
// skate-world lobby launches games this way), "Return to Skypark" goes back to
// that lobby instead of the town hub — the hub never appears in that flow.
const EXTERNAL_LOBBY_URL = (() => {
  const raw = query.get('return');
  if (!raw) return null;
  try {
    const u = new URL(raw, location.href);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch { return null; }
})();
const devMode = query.has('dev');
const characterLabEnabled = import.meta.env.DEV && query.get('dev') === '1';
const devicePlaytestEnabled = import.meta.env.DEV && query.get('dev') === '1';
const DEV_ONLY_SYSTEMS = new Set(import.meta.env.DEV
  ? ['character-lab', 'device-playtest']
  : []);
function devSystemEnabled(id) {
  if (!import.meta.env.DEV) return false;
  if (id === 'character-lab') return characterLabEnabled;
  if (id === 'device-playtest') return devicePlaytestEnabled;
  return true;
}
const perfMode = devMode || query.get('perf') === '1';
let performanceScope = 'hub';
const PERFORMANCE_SCOPES = new Set(['hub', 'skyway', 'balloon', 'tag', 'show67', 'ugc']);
function setPerformanceScope(scope) {
  if (!PERFORMANCE_SCOPES.has(scope)) return false;
  performanceScope = scope;
  performanceDiagnostics?.setScope(performanceScope);
  return true;
}
ctx.bus.on('performance-scope', setPerformanceScope);
if (perfMode && devOverlay) {
  devOverlay.style.display = 'block';
  devOverlay.textContent = 'Loading local performance diagnostics…';
}
if (perfMode) {
  import('./core/performance-diagnostics.js')
    .then(({ createPerformanceDiagnostics }) => {
      performanceDiagnostics = createPerformanceDiagnostics({
        ctx,
        renderer,
        devOverlay,
        sessionTelemetry,
        getScene: () => ctx.view.current?.scene || scene,
        meta: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          devicePixelRatio: window.devicePixelRatio || 1,
          touch: ctx.input.isTouchDevice,
          userAgent: navigator.userAgent,
        },
      });
      performanceDiagnostics.setScope(performanceScope);
      window.__67VERSE_PERF__ = performanceDiagnostics.api;
    })
    .catch((error) => {
      console.error('[67VERSE] performance diagnostics failed to load', error);
      sessionTelemetry.record('recoverable_error', {
        area: 'diagnostics-load',
        code: 'optional-chunk-load',
        routeKind: 'diagnostics',
        routeId: 'performance',
      });
      if (devOverlay) {
        devOverlay.textContent =
          'Performance diagnostics could not load. Reload this local page to retry.';
      }
    });
}

function enterWorld() {
  const wasEntryOpen = document.body.classList.contains('entry-open');
  releaseEntryIsolation?.();
  releaseEntryIsolation = null;
  document.body.classList.remove('entry-open');
  entryGate?.classList.add('hidden');
  entryGate?.setAttribute('aria-hidden', 'true');
  entryGate?.removeAttribute('role');
  entryGate?.removeAttribute('aria-modal');
  entryGate?.removeAttribute('aria-labelledby');
  entryGate?.removeAttribute('aria-describedby');
  const touchUi = document.getElementById('touch-ui');
  if (!document.body.classList.contains('modal-open')) {
    touchUi?.removeAttribute('inert');
    touchUi?.removeAttribute('aria-hidden');
  }
  if (enterButton) enterButton.tabIndex = -1;
  setTimeout(() => {
    if (entryGate?.classList.contains('hidden')) entryGate.hidden = true;
  }, 260);
  if (wasEntryOpen) {
    primaryPlayButton?.focus();
    ctx.bus.emit('world-entered');
  }
}

enterButton?.addEventListener('click', enterWorld);
primaryPlayButton?.addEventListener('click', () => {
  enterWorld();
  openGameSelect();
});

async function openSystem(id, label = 'That panel') {
  if (DEV_ONLY_SYSTEMS.has(id) && !devSystemEnabled(id)) return false;
  if (hubActivities.snapshot().active) hubActivities.cancel('panel-open');
  let system = ctx.systems.get(id);
  let loadError = null;
  try {
    system ||= await ensureSystemLoaded(id);
  } catch (error) {
    loadError = error;
    console.error('[67VERSE] system route failed to load:', id, error);
  }
  if (!system) {
    sessionTelemetry.record('recoverable_error', {
      area: 'route-load',
      code: loadError ? 'system-load-error' : 'system-unavailable',
      routeKind: 'system',
      routeId: id,
    });
    ctx.ui.toast(loadError
      ? `${label} could not load. Check your connection and try again.`
      : `${label} is not available in this build.`);
    return false;
  }
  system.open(ctx);
  return true;
}

primaryChatButton?.addEventListener('click', async () => {
  if (primaryChatButton.getAttribute('aria-busy') === 'true') return;
  enterWorld();
  primaryChatButton.setAttribute('aria-busy', 'true');
  primaryChatButton.setAttribute('aria-disabled', 'true');
  try {
    await openSystem('chat', 'Local chat');
  } finally {
    primaryChatButton.removeAttribute('aria-busy');
    primaryChatButton.removeAttribute('aria-disabled');
  }
});

const baseGoHome = ctx.goHome;
const gameLifecycle = createGameLifecycle({
  load: ensureGameLoaded,
  mount(g) {
    ctx.systems.get('chat')?.close?.();
    document.body.classList.add('in-game');
    const profileState = ctx.save.profileState;
    if (modeName) {
      modeName.textContent = g.name;
      const detail = document.createElement('small');
      detail.textContent = `Local play · ${profileState.profile.name} · ${
        profileState.persisted ? 'saved guest' : 'session-only guest'
      }`;
      modeName.appendChild(detail);
    }
    return g.mount(ctx, {});
  },
  onUnmountError(error, entry) {
    console.error('[game] unmount', error);
    sessionTelemetry.record('recoverable_error', {
      area: 'game-lifecycle',
      code: 'unmount-error',
      routeKind: 'game',
      routeId: entry?.id,
    });
  },
});
if (devicePlaytestEnabled) {
  // This development-only bridge supplies truthful route context to the local
  // physical-device handoff without publishing a runtime diagnostics API.
  ctx.devicePlaytestRuntime = Object.freeze({
    getRouteState() {
      const active = gameLifecycle.getActive();
      if (active) return { kind: 'game', id: active.id };
      const activity = hubActivities.snapshot();
      if (activity.active) {
        return { kind: 'hub-activity', id: 'hub', activityId: activity.activityId };
      }
      const entryOpen = Boolean(
        entryGate
        && !entryGate.hidden
        && !entryGate.classList.contains('hidden'),
      );
      return { kind: entryOpen ? 'entry' : 'hub', id: entryOpen ? 'fresh-entry' : 'hub' };
    },
  });
}
ctx.bus.on('game-result', (result = {}) => {
  sessionTelemetry.record('game_result', {
    gameId: result.gameId || result.game,
    completed: true,
    placement: result.placement,
    score: result.score,
    coins: result.coins,
    interactions: result.tags ?? result.pops,
    safeTimeMs: result.safeTimeMs,
    roleChanges: result.roleChanges,
    escalationReached: result.finalChaseReached,
  });
});
ctx.goHome = (result) => {
  if (EXTERNAL_LOBBY_URL) {
    // Launched from the external skate lobby — hand control straight back.
    gameLifecycle.stop('home');
    location.href = EXTERNAL_LOBBY_URL;
    return;
  }
  gameLifecycle.stop('home');
  baseGoHome(result);
  setPerformanceScope('hub');
  if (modeName) modeName.innerHTML = 'Game mode<small>Local play · training rivals</small>';
  if (hubStatus) hubStatus.textContent = '';
  requestAnimationFrame(() => {
    if (hubStatus) {
      hubStatus.textContent = 'Returned to Skypark. Choose a local game or explore the hub.';
    }
    primaryPlayButton?.focus();
  });
};
async function mountGame(id, { source = 'direct' } = {}) {
  if (hubActivities.snapshot().active) hubActivities.cancel('game-launch');
  enterWorld();
  const routeMeta = FEATURED_MODES.find((mode) => mode.id === id);
  if (modeName) {
    const loadingName = routeMeta?.name || (id === 'creator' ? 'Creator' : 'Game mode');
    modeName.innerHTML = `${loadingName}<small>Loading local mode…</small>`;
  }
  const result = await gameLifecycle.start(id);
  if (result.status === 'superseded') return;
  if (result.status === 'load-error') {
    console.error('[67VERSE] game route failed to load:', id, result.error);
  }
  if (result.status === 'unavailable' || result.status === 'load-error') {
    sessionTelemetry.record('recoverable_error', {
      area: 'route-load',
      code: result.status,
      routeKind: 'game',
      routeId: id,
    });
    if (modeName) modeName.innerHTML = 'Game mode<small>Local play · training rivals</small>';
    ctx.ui.toast(result.status === 'load-error'
      ? 'That game could not load. Check your connection and try again.'
      : 'That game is not available in this build.');
    return;
  }
  if (result.status === 'mount-error') {
    console.error('[67VERSE] game mount failed:', id, result.error);
    sessionTelemetry.record('recoverable_error', {
      area: 'game-lifecycle',
      code: 'mount-error',
      routeKind: 'game',
      routeId: id,
    });
    baseGoHome();
    setPerformanceScope('hub');
    if (modeName) modeName.innerHTML = 'Game mode<small>Local play · training rivals</small>';
    ctx.ui.toast(`${result.game.name} could not start. Please try again.`);
    return;
  }
  const nextPerformanceScope =
    id === 'obstacle' ? 'skyway' :
      id === 'balloon' ? 'balloon' :
        id === 'tag' ? 'tag' :
          id === 'show67' ? 'show67' :
          id === 'creator' ? 'ugc' : null;
  if (nextPerformanceScope) setPerformanceScope(nextPerformanceScope);
  else {
    performanceScope = null;
    performanceDiagnostics?.setScope(null);
  }
  ctx.quality.applyScene(ctx.view.current?.scene);
  sessionTelemetry.record('game_start', { gameId: id, source });
  console.log('[67VERSE] mounted game:', id);
}
ctx.replayGame = (id, result) => {
  if (result) ctx.bus.emit('game-result', result);
  sessionTelemetry.record('game_replay', { gameId: id });
  return mountGame(id, { source: 'replay' });
};
// Fast travel to an authored hub spot. The panel only opens from the hub, so
// no game can be active here; the guard keeps that assumption explicit. An
// activity is never auto-started — the player still opts in at the marker.
function travelToSpot(spot) {
  if (gameLifecycle.getActive()) return;
  if (hubActivities.snapshot().active) hubActivities.cancel('spot-travel');
  sim.pos.x = spot.x;
  sim.pos.z = spot.z;
  sim.pos.y = 0;
  sim.vel.x = 0;
  sim.vel.y = 0;
  sim.vel.z = 0;
  sim.grounded = true;
  sim.yaw = spot.yaw;
  camOrbit.yaw = spot.yaw;
  ctx.bus.emit('sfx', 'launch');
  sessionTelemetry.record('spot_travel', { spotId: spot.id });
  ctx.ui.toast(`${spot.name} · ${spot.place}`);
}
function openGameSelect() {
  if (hubActivities.snapshot().active) hubActivities.cancel('panel-open');
  const p = ctx.ui.panel({ title: 'Play in Skypark' });
  const intro = document.createElement('p');
  intro.className = 'uv-play-intro';
  intro.textContent = 'Choose a game. Training rivals run on this device; online rooms are off in this build.';
  const grid = document.createElement('div');
  grid.className = 'uv-game-grid';
  for (const mode of FEATURED_MODES) {
    const card = document.createElement('article');
    card.className = 'uv-game-card';
    const icon = document.createElement('span');
    icon.className = 'uv-game-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = mode.icon;
    const name = document.createElement('h3');
    name.textContent = mode.name;
    const description = document.createElement('p');
    description.textContent = mode.description;
    const status = document.createElement('span');
    status.className = 'uv-chip';
    status.textContent = mode.status;
    const play = ctx.ui.button(`Play ${mode.name}`, () => {
      p.close();
      mountGame(mode.id);
    }, { primary: mode.id === 'obstacle' });
    card.append(icon, name, description, status, play);
    grid.appendChild(card);
  }
  const spotsHeading = document.createElement('h3');
  spotsHeading.className = 'uv-spot-heading';
  spotsHeading.textContent = 'Skypark spots';
  const spotsIntro = document.createElement('p');
  spotsIntro.className = 'uv-play-intro';
  spotsIntro.textContent = 'Fast travel inside the hub. Activities still start at their own marker with E / GRAB.';
  const spotList = document.createElement('div');
  spotList.className = 'uv-spot-list';
  for (const spot of HUB_SPOTS) {
    const row = document.createElement('article');
    row.className = 'uv-spot-row';
    const info = document.createElement('div');
    info.className = 'uv-spot-info';
    const name = document.createElement('h4');
    name.textContent = `${spot.name} · ${spot.place}`;
    const description = document.createElement('p');
    description.textContent = spot.description;
    info.append(name, description);
    const go = ctx.ui.button(`Go to ${spot.name}`, () => {
      p.close();
      travelToSpot(spot);
    });
    row.append(info, go);
    spotList.appendChild(row);
  }
  p.body.append(intro, grid, spotsHeading, spotsIntro, spotList);
}
// The public proof has one promise: play the course. Secondary systems remain
// registered and reachable through explicit dev/QA routes, but do not compete
// for attention or imply online services that are not connected.
const HUD = devMode
  ? [
      ['collection', 'CHARACTERS', 'Characters'],
      ['chat', 'CHAT', 'Local chat'],
      ['social', 'FRIENDS', 'Friends'],
      ['discovery', 'WORLDS', 'Worlds'],
      ['settings', 'SETTINGS', 'Settings'],
      ['cosmetics', 'CLOSET', 'Closet'],
      ['emotes', 'EMOTES', 'Emotes'],
      ...(characterLabEnabled
        ? [['character-lab', 'LAB', 'Character Acceptance Lab']]
        : []),
      ...(devicePlaytestEnabled
        ? [['device-playtest', 'DEVICE', 'Physical-device playtest']]
        : []),
    ]
  : [['settings', 'SETTINGS', 'Settings']];
for (const [id, badge, label] of HUD) {
  const button = ctx.ui.hudIcon(id, badge, label);
  if (hasSystemRoute(id)) {
    button.onclick = async () => {
      if (button.getAttribute('aria-busy') === 'true') return;
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-disabled', 'true');
      try {
        await openSystem(id, label);
      } finally {
        button.removeAttribute('aria-busy');
        button.removeAttribute('aria-disabled');
      }
    };
  }
}
runHooks('boot', ctx);
scheduleIdleModules();
async function requestReturnToSkypark() {
  if (!ctx.view.current || ctx.ui.hasAnyModal()) return;
  if (await ctx.ui.confirm('Return to Skypark? Current round progress will be lost.')) ctx.goHome();
}
returnSkyparkButton?.addEventListener('click', requestReturnToSkypark);
window.addEventListener('keydown', (e) => {
  if (
    e.code === 'Escape' &&
    !ctx.view.current &&
    !ctx.ui.hasAnyModal() &&
    hubActivities.snapshot().active
  ) {
    e.preventDefault();
    e.stopImmediatePropagation();
    hubActivities.cancel('escape-key');
    return;
  }
  if (e.code === 'Escape' && ctx.view.current && !ctx.ui.hasAnyModal()) {
    e.preventDefault();
    requestReturnToSkypark();
  }
  if (e.code === 'KeyQ' && !e.repeat && !ctx.view.current && !ctx.ui.hasAnyModal()) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (devMode) {
      openSystem('emotes', 'Emotes');
    } else if (hubCharacter?.animator.play('wave')) {
      ctx.bus.emit('emote', { id: 'wave' });
    }
  }
});
const camOrbit = createOrbitState(sim.yaw);
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camFocus = new THREE.Vector3();
const camResolved = new THREE.Vector3();
const cameraRay = new THREE.Raycaster();
const camPos = new THREE.Vector3(sim.pos.x, sim.pos.y + 4.2, sim.pos.z + 6.35);
camera.position.copy(camPos);
let destinationCooldown = 0;
let nearbyDestination = null;
let queuedGrabPressed = false;
let lastVisualYaw = sim.yaw;
let lastFootContactSerial = 0;
const hintEl = document.getElementById('hint');
const grabButton = document.getElementById('btn-grab');

console.log('[67VERSE] hub ready — WASD/arrows move, drag to look, Space jump, E/Shift grab. Touch + gamepad live.');

// ---------- Test hooks (integration QA): deterministic route/panel/focus entry ----------
{
  const q = new URLSearchParams(location.search);
  const testGame = q.get('game');
  const testPanel = q.get('panel');
  const testHubDestination = q.get('hubDestination');
  const testHubActivity = q.get('hubActivity');
  if (q.get('qa') === '1') {
    import('./core/hub-qa.js')
      .then(({ installHubQa }) => installHubQa({
        camera,
        camOrbit,
        camTarget,
        camLook,
        sim,
        getCharacter: () => hubCharacter,
        hubActivities,
        world,
        bus: ctx.bus,
      }))
      .catch((error) => console.error('[67VERSE] deferred QA hooks failed', error));
  }
  if (testGame && hasGameRoute(testGame)) setTimeout(() => mountGame(testGame), 600);
  if (testPanel && (!DEV_ONLY_SYSTEMS.has(testPanel) || devSystemEnabled(testPanel))) {
    setTimeout(async () => {
      const system = ctx.systems.get(testPanel) || await ensureSystemLoaded(testPanel);
      system?.open(ctx);
    }, 600);
  }
  if (q.get('qa') === '1' && testHubDestination) {
    setTimeout(() => {
      const destination = world.destinations?.find(({ id }) => id === testHubDestination);
      if (!destination) return;
      sim.pos.x = destination.x;
      sim.pos.z = destination.z;
      sim.pos.y = 0;
      sim.vel.x = 0;
      sim.vel.y = 0;
      sim.vel.z = 0;
      sim.grounded = true;
    }, 600);
  }
  if (q.get('qa') === '1' && testHubActivity) {
    setTimeout(() => {
      const definition = hubActivities.getDefinition(testHubActivity);
      if (!definition) return;
      window.__67VERSE_QA__?.teleport(definition.start.x, definition.start.z);
      const first = definition.checkpoints[0];
      const routeYaw = Math.atan2(
        first.x - definition.start.x,
        first.z - definition.start.z,
      );
      sim.yaw = routeYaw;
      camOrbit.yaw = routeYaw;
      if (q.get('hubActivityActive') === '1') hubActivities.start(testHubActivity);
    }, 600);
  }
}
document.body.dataset.appReady = 'true';

// ---------- Main loop: fixed-step sim, per-frame render ----------
let last = performance.now();
let acc = 0;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  // requestAnimationFrame is suspended in a background tab. Resume from a
  // clean clock/input edge so a hidden interval cannot become movement,
  // camera drift, or a burst of fixed simulation steps on return.
  last = performance.now();
  acc = 0;
  ctx.input.resetTransient?.();
});

function updateDevStats(frameDt) {
  performanceDiagnostics?.sample(frameDt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  // Local gameplay pauses behind modal decisions. Rendering continues so the
  // scene remains visible, but timers, hazards, and bots cannot advance while
  // the player is reading a result or return confirmation.
  const pauseGameForModal = Boolean(ctx.view.current && ctx.ui.hasModal());
  if (!pauseGameForModal) ctx.loop._run(frameDt);
  if (ctx.view.current) {
    renderFrame(ctx.view.current.scene, ctx.view.current.camera);
    updateDevStats(frameDt);
    return;
  }

  const pad = input.poll();

  const direction = cameraRelativeDirection(pad, camOrbit.yaw);
  const dirX = direction.x;
  const dirZ = direction.z;
  // Input is sampled on render frames, while gameplay advances at a fixed
  // timestep. Latch the rising edge so a fast E/touch tap cannot land on a
  // render frame with no simulation step and disappear before the next one.
  queuedGrabPressed ||= pad.grabPressed;

  const simInput = {
    dirX, dirZ,
    moving: direction.moving,
    jumpHeld: pad.jumpHeld,
    sprintHeld: pad.sprintHeld,
    grabPressed: queuedGrabPressed,
  };

  // Fixed-timestep accumulator — the sim never sees variable dt.
  acc += frameDt;
  while (acc >= SIM_DT) {
    const wasGrounded = sim.grounded;
    const landingVelocity = sim.vel.y;
    stepPlayer(sim, simInput, SIM_DT, world);
    acc -= SIM_DT;

    if (sim.jumpEvent) hubCharacter?.animator.signal('jump');
    if (!wasGrounded && sim.grounded) {
      hubCharacter?.animator.signal('land', {
        strength: THREE.MathUtils.clamp(Math.abs(landingVelocity) / 10, 0.35, 1),
      });
    }
    if (sim.grabEvent) fireGrabFeedback();

    // Contextual hub destinations use the existing E / GRAB action. Keeping
    // entry explicit prevents panels from opening just because a player walks
    // past a marker and maps cleanly to the existing mobile button.
    destinationCooldown = Math.max(0, destinationCooldown - SIM_DT);
    nearbyDestination = null;
    const activityAtTickStart = hubActivities.snapshot();
    if (activityAtTickStart.active) {
      if (simInput.grabPressed && destinationCooldown <= 0) {
        destinationCooldown = 0.6;
        hubActivities.cancel('grab-control');
      }
    } else {
      let nearestDistance = Infinity;
      for (const destination of world.destinations || []) {
        if (
          destination.kind === 'onboarding' &&
          (world.onboarding?.active || (world.onboarding?.stage || 0) >= 3)
        ) continue;
        const distance = Math.hypot(sim.pos.x - destination.x, sim.pos.z - destination.z);
        if (distance < destination.radius && distance < nearestDistance) {
          nearbyDestination = destination;
          nearestDistance = distance;
        }
      }
      if (nearbyDestination && simInput.grabPressed && destinationCooldown <= 0) {
        destinationCooldown = 1;
        ctx.bus.emit('sfx', 'launch');
        sessionTelemetry.record('destination_enter', {
          destinationId: nearbyDestination.id,
          kind: nearbyDestination.kind,
          target: nearbyDestination.target,
        });
        if (nearbyDestination.kind === 'game-select') {
          openGameSelect();
        } else if (nearbyDestination.kind === 'game') {
          mountGame(nearbyDestination.target, { source: 'destination' });
        } else if (nearbyDestination.kind === 'system') {
          openSystem(nearbyDestination.target, nearbyDestination.label);
        } else if (nearbyDestination.kind === 'onboarding') {
          world.onboarding?.start();
        } else if (nearbyDestination.kind === 'activity') {
          hubActivities.start(nearbyDestination.target);
        } else if (nearbyDestination.kind === 'emote') {
          if (hubCharacter?.animator.play('wave')) {
            ctx.bus.emit('emote', { id: 'wave' });
          }
        }
      } else if (sim.grabEvent && destinationCooldown <= 0) {
        destinationCooldown = 0.8;
        if (hubCharacter?.animator.play('wave')) {
          ctx.bus.emit('emote', { id: 'wave' });
        }
      }
    }
    hubActivities.step(
      { position: sim.pos, jumpEvent: sim.jumpEvent },
      SIM_DT,
    );
    queuedGrabPressed = false;
    simInput.grabPressed = false;
  }

  world.onboarding?.update(sim);
  const hubActivity = hubActivities.snapshot();
  // Activity events (start, checkpoint, completion, cancellation) already
  // update the checkpoint visual. Re-walking every checkpoint mesh on every
  // render frame only repeats the same visibility assignments while the
  // runner is between gates.
  if (hubActivity.active) renderHubActivity(hubActivity);
  const onboardingPrompt = world.onboarding?.prompt || '';
  if (hintEl) {
    const enterControl = ctx.input.isTouchDevice ? 'Tap ENTER' : 'E / GRAB';
    const exitControl = ctx.input.isTouchDevice ? 'Tap EXIT' : 'E / GRAB';
    hintEl.textContent = hubActivity.active
      ? `Follow the lit route · ${exitControl} to exit`
      : nearbyDestination
        ? `${nearbyDestination.label} · ${enterControl} to enter`
        : onboardingPrompt || 'Follow the gold lozenges to SKYWAY';
    hintEl.classList.toggle('destination', Boolean(nearbyDestination || hubActivity.active));
  }
  world.focusDestination = hubActivity.active ? null : nearbyDestination?.id || null;
  if (grabButton) {
    grabButton.textContent = hubActivity.active
      ? 'EXIT'
      : nearbyDestination
        ? 'ENTER'
        : devMode ? 'GRAB' : 'WAVE';
  }

  // ----- Rig from sim state -----
  playerRig.position.set(sim.pos.x, sim.pos.y, sim.pos.z);
  playerRig.rotation.y = sim.yaw;

  // Run lean + idle bob (cheap juice, purely visual).
  const speed = Math.hypot(sim.vel.x, sim.vel.z);
  if (hubCharacter) {
    let pop = 1;
    if (grabAnim >= 0) pop = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, grabAnim * 1.6));
    hubCharacter.animator.update(frameDt, {
      speed,
      grounded: sim.grounded,
      verticalSpeed: sim.vel.y,
      turnAmount: wrappedAngleDelta(lastVisualYaw, sim.yaw) / Math.max(frameDt, 1 / 120),
      scaleMultiplier: pop,
    });
    const contact = hubCharacter.animator.contact;
    if (contact.serial !== lastFootContactSerial) {
      lastFootContactSerial = contact.serial;
      ctx.bus.emit('sfx', { id: 'step', foot: contact.foot, speed });
    }
  }
  lastVisualYaw = sim.yaw;

  // Grab ring animation.
  if (grabAnim >= 0) {
    grabAnim += frameDt / 0.45;
    if (grabAnim >= 1) { grabAnim = -1; grabRing.material.opacity = 0; }
    else {
      grabRing.position.set(sim.pos.x, sim.pos.y + 0.06, sim.pos.z);
      const s = 0.4 + grabAnim * 2.2;
      grabRing.scale.setScalar(s);
      grabRing.material.opacity = 0.85 * (1 - grabAnim);
    }
  }

  // ----- Camera: elevated city-view chase framing -----
  // Pulling the lens a little farther back keeps the character readable while
  // revealing the district routes and skyline the player is moving through.
  const autoCameraYaw = simInput.moving && Math.abs(pad.my) > 0.12
    ? Math.atan2(dirX, dirZ)
    : null;
  updateOrbitState(camOrbit, pad, frameDt, {
    autoYaw: autoCameraYaw,
    autoRate: 1.7,
  });
  const portrait = THREE.MathUtils.clamp((0.9 - camera.aspect) / 0.4, 0, 1);
  const chaseDistance = 5.45 + portrait * 1.45;
  const chaseHeight = 3.65 + portrait * 0.8;
  camFocus.set(sim.pos.x, sim.pos.y, sim.pos.z);
  camLook.set(
    sim.pos.x + sim.vel.x * 0.11,
    sim.pos.y + 1.55,
    sim.pos.z + sim.vel.z * 0.11
  );
  orbitCameraPosition(camTarget, camFocus, camOrbit, chaseDistance, chaseHeight);
  resolveCameraObstruction(
    cameraRay, camLook, camTarget, world.cameraColliders, camResolved,
    { padding: 0.5, minDistance: 2.15 },
  );
  // Most Skypark frames have a completely clear chase line. In that case the
  // first cast leaves `camResolved` equal to the desired target, so a second
  // identical mesh-raycast against the hub adds work without changing the
  // camera. Keep the conservative second cast only when the desired path was
  // actually shortened by an obstruction; that is the case where smoothing
  // could otherwise drift the lens back through the blocker.
  const desiredWasObstructed = camResolved.distanceToSquared(camTarget) > 1e-6;
  camPos.lerp(camResolved, 1 - Math.exp(-5 * frameDt));
  if (desiredWasObstructed) {
    resolveCameraObstruction(
      cameraRay, camLook, camPos, world.cameraColliders, camResolved,
      { padding: 0.5, minDistance: 2.15 },
    );
  } else {
    camResolved.copy(camPos);
  }
  camera.position.copy(camResolved);
  camera.lookAt(camLook);

  // World animation hooks (portal pulse, label bob).
  for (const fn of world.animated) fn(t, frameDt);

  renderFrame(scene, camera);
  updateDevStats(frameDt);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // The composer owns its own render targets; without this the AO buffer keeps
  // the old size and the effect drifts out of register after a rotate/resize.
  composer?.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (event) => {
  if (!performanceDiagnostics || event.code !== 'KeyP' || event.repeat) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  const capture = performanceDiagnostics.capture('keyboard');
  if (!capture) return;
  console.info('[67VERSE perf capture]', capture);
  ctx.ui.toast(
    `${capture.runtime.scope} performance + scene captured locally ` +
    `(${capture.runtime.sampleCount} samples).`,
  );
});
