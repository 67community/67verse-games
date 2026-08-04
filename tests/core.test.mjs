import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cameraRelativeDirection } from '../src/input.js';
import {
  allowsDevelopmentGhost,
  createCharacters,
  resolvePlayableCharacterId,
} from '../src/core/characters.js';
import {
  activeDevelopmentCharacterCandidate,
  allowsDevelopmentCharacterCandidate,
  createProductionCharacterAnchors,
  defineProductionCharacterManifest,
  disposeCharacterObjectResources,
  fitProductionCharacter,
  inspectProductionCharacterAsset,
  loadProductionCharacterCandidateBytes,
  validateProductionCharacterManifest,
} from '../src/core/production-character.js';
import {
  compactCharacterAcceptanceReport,
  createCharacterAcceptanceReport,
  createCharacterManifestTemplate,
} from '../src/core/character-acceptance-report.js';
import {
  appendDevicePlaytestObservation,
  createDevicePlaytestSession,
  DEVICE_PLAYTEST_CHECKS,
  exportDevicePlaytestSession,
  updateDevicePlaytestCheck,
} from '../src/core/device-playtest-report.js';
import { attachCosmetic, COSMETICS } from '../src/systems/cosmetics.js';
import { createRateLimiter, normalizeControlMessage, sanitizePlayerName } from '../src/core/guard.js';
import { createPlayerState, stepPlayer } from '../src/player.js';
import { FEATURED_MODES, HUB_SPOTS, availableFeaturedModes } from '../src/core/navigation.js';
import { createGameLifecycle } from '../src/core/game-lifecycle.js';
import { createBus } from '../src/core/bus.js';
import {
  createLocalGuestName,
  createSave,
  recoverLocalProfile,
} from '../src/core/save.js';
import {
  commitLocalGameReward,
  localGameRewardStat,
  localGameResultFacts,
  localGameResultProgress,
} from '../src/core/game-result.js';
import {
  incrementLocalCounter,
  LOCAL_SAVE_SCHEMA_VERSION,
  readLocalCounterMap,
  recoverLocalCounterState,
  removeLocalCounterEntry,
  retainLocalCounterEntries,
} from '../src/core/local-save-schema.js';
import {
  appendLocalModerationRecord,
  formatLocalReporterAttribution,
  LOCAL_MODERATION_QUEUE_VERSION,
  readLocalModerationQueue,
  recoverLocalModerationQueue,
  resolveLocalWorldReports,
  setLocalModerationStatus,
} from '../src/core/local-moderation.js';
import {
  createRegistryRouteLoader,
  ensureGameLoaded,
  ensureSystemLoaded,
  GAME_ROUTE_IDS,
  hasGameRoute,
  hasSystemRoute,
  IDLE_MODULE_IDS,
  scheduleIdleModules,
  SYSTEM_ROUTE_IDS,
} from '../src/modules.js';
import { hasHookRun, registerHook, runHooks } from '../src/core/registry.js';
import {
  analyzeManifest,
  evaluateBudget,
} from '../scripts/check-performance-budget.mjs';
import {
  CAPTURE_POINTS,
  validateCaptureReport,
} from '../scripts/capture-visual-qa.mjs';
import {
  createRuntimePerformanceTelemetry,
  formatRuntimePerformance,
  percentile,
  RUNTIME_PERF_BUDGETS,
} from '../src/core/performance-telemetry.js';
import {
  applySceneQuality,
  createQualityController,
  normalizeQualityPreference,
  resolveQualityTier,
} from '../src/core/quality-tier.js';
import {
  analyzeSceneAttribution,
  formatAttributionSummary,
} from '../src/core/scene-attribution.js';
import {
  checkpointGateVisible,
  checkpointGateVisualState,
  createCheckpointGateGeometry,
  createCrownLoomGeometry,
  createFinishArchGeometry,
  createShutterFinGeometry,
  createSkywayGlazeData,
  createSkywayOpenRunwayGeometry,
  createSkywayRoundResult,
  createSkywayValleyGeometry,
  skywayAutoplayInput,
  skywayCheckpointCue,
  SKYWAY_CHECKPOINT_WAYPOINTS,
  SKYWAY_CIVIC_COMPOSITION,
  SKYWAY_COURSE_BEATS,
  SKYWAY_LEVEL_DESCRIPTION,
  SKYWAY_RENDER_TREATMENT,
  SKYWAY_RUN_SCALE,
  SKYWAY_WORLD_BOUND,
} from '../src/games/obstacle.js';
import {
  createSkywayCourseSimulation,
  isSkywayPlatformNear,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import { SKYWAY_PALETTE } from '../src/core/skyway-level.js';
import {
  createSkywayRound,
  stepSkywayRound,
} from '../src/core/skyway-round.js';
import {
  BALLOON_LEVEL_DESCRIPTION,
  balloonEscalationState,
} from '../src/games/balloon.js';
import {
  BALLOON_ARENA_HALF,
  BALLOON_ARENA_IDENTITY,
  BALLOON_ROLE_COLORS,
  buildBalloonArena,
  validateBalloonArenaIdentity,
} from '../src/games/balloon-arena.js';
import {
  checkpointTriggered,
  createPlatformRuntime,
  createSweeperRuntime,
  defineLevelDescription,
  fallHazardTriggered,
  goalZoneTriggered,
  samplePlatformGround,
  scoreZoneOverlap,
  stepLevelWidget,
  widgetsByType,
} from '../src/core/level-widgets.js';
import {
  commitHubActivityBest,
  createHubActivitySession,
  defineHubActivity,
  HUB_ACTIVITY_DEFINITIONS,
} from '../src/core/hub-activities.js';
import {
  createLocalSessionTelemetry,
  SESSION_EVENT_NAMES,
  SESSION_EVENT_SCHEMA_VERSION,
} from '../src/core/session-telemetry.js';
import {
  rankTagParticipants,
  TAG_RULES,
  tagParticipantScore,
  tagPacingState,
  tagResultCue,
} from '../src/core/tag-rules.js';
import {
  buildTagArena,
  TAG_ARENA_IDENTITY,
  TAG_ARENA_OBSTACLES,
  TAG_ARENA_ROUTES,
  tagArenaObstacleBounds,
  validateTagArenaLayout,
} from '../src/games/tag-arena.js';
import {
  commitQuickStartReward,
  commitSkyparkArrival,
  destinationFocusVisualState,
} from '../src/world/hub-plus.js';
import { buildWorld } from '../src/world.js';
import { buildCityDistricts } from '../src/world/city-districts.js';
import { buildStadium, STADIUM_PITCH } from '../src/world/stadium.js';

// The city and the stadium ship as their own chunks, so buildWorld takes their
// builders rather than importing them. Tests hand them over as the app does.
const buildHubWorld = (scene) => buildWorld(scene, {
  buildCity: buildCityDistricts,
  buildStadium,
  stadiumPitch: STADIUM_PITCH,
});
import {
  SKYPARK_LANDMARKS,
  SKYPARK_ROUTES,
  skyparkCompositionSnapshot,
  skyparkRouteSegments,
  validateSkyparkComposition,
} from '../src/world/skypark-composition.js';
import {
  createOrbitState,
  orbitCameraPosition,
  resolveCameraObstruction,
  updateOrbitState,
} from '../src/core/chase-camera.js';
import {
  compileLevelForPlay,
  editorPiecesFromLevel,
  formatLocalCreatorAttribution,
  isLocallyPublished,
  LEVEL_ASSETS,
  LEVEL_VERSION,
  MAX_LEVEL_PIECES,
  UGC_DISCOVERY_TAGS,
  UGC_GAMEPLAY_MODES,
  levelFromEditor,
  pieceSignature,
  validateLevel,
} from '../src/ugc/format.js';
import {
  deleteLocalWorld,
  LOCAL_WORLD_COLLECTION_VERSION,
  readLocalWorlds,
  recoverLocalWorldCollection,
  removeLocalWorld,
  upsertLocalWorld,
} from '../src/ugc/local-worlds.js';
import { UGC_TEMPLATES } from '../src/ugc/templates.js';
import {
  createUgcStage,
  ugcModeProfile,
  UGC_ASSET_COLORS,
} from '../src/ugc/presentation.js';
import {
  createPublishedTemplateLocalWorld,
  createNearMaxPublishedLocalWorld,
  NEAR_MAX_UGC_WORLD_NAME,
  templateLocalWorldId,
} from './fixtures/ugc-worlds.mjs';

test('base device-local save verifies writes and returns storage failure without false events', () => {
  const values = new Map();
  let blockedKey = null;
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (key !== blockedKey) values.set(key, value);
    },
  };
  const warnings = [];
  const bus = createBus();
  const settingsEvents = [];
  const coinEvents = [];
  bus.on('settings-changed', (settings) => settingsEvents.push(settings));
  bus.on('coins-earned', (event) => coinEvents.push(event));
  const save = createSave(bus, storage, (...args) => warnings.push(args));

  assert.equal(save.set('ugcWorlds', { version: 1, worlds: [] }), true);
  assert.deepEqual(save.get('ugcWorlds', null), { version: 1, worlds: [] });
  assert.equal(save.set('unsupported', undefined), false);

  blockedKey = '67v.settings';
  const settings = { volume: 0.5 };
  assert.equal(save.setSettings(settings), false);
  assert.deepEqual(settingsEvents, []);

  blockedKey = '67v.coins';
  assert.equal(save.addCoins(25, 'failed-round'), null);
  assert.equal(save.coins, 0);
  assert.deepEqual(coinEvents, []);

  blockedKey = null;
  assert.equal(save.setSettings(settings), true);
  assert.deepEqual(settingsEvents, [settings]);
  assert.equal(save.addCoins(25, 'saved-round'), 25);
  assert.deepEqual(coinEvents, [{
    amount: 25,
    why: 'saved-round',
    total: 25,
  }]);

  blockedKey = '67v.quests';
  assert.equal(save.commitCoins(10, 'failed-claim', () => (
    save.set('quests', { claimed: true })
  )), null);
  assert.equal(save.coins, 25);
  assert.equal(save.get('quests', null), null);
  assert.equal(coinEvents.length, 1);

  let persisted = false;
  blockedKey = '67v.coins';
  assert.equal(save.commitCoins(10, 'blocked-before-claim', () => {
    persisted = true;
    return true;
  }), null);
  assert.equal(persisted, false);
  assert.equal(save.coins, 25);
  assert.equal(warnings.length, 5);
});

test('device-local guest profile is canonical, session-stable, and retryable after rejection', () => {
  const values = new Map();
  let profileBlocked = true;
  let randomCalls = 0;
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (key !== '67v.profile' || !profileBlocked) values.set(key, value);
    },
  };
  const save = createSave(
    createBus(),
    storage,
    () => {},
    () => {
      randomCalls += 1;
      return 0.1234;
    },
  );

  assert.equal(createLocalGuestName(() => 0.1234), 'Guest2110');
  assert.equal(randomCalls, 1);
  assert.deepEqual(save.profileState, {
    profile: { name: 'Guest2110', guest: true, pn: null },
    persisted: false,
  });
  assert.strictEqual(save.profile, save.profile);
  assert.equal(save.profile.name, 'Guest2110');
  assert.equal(values.has('67v.profile'), false);

  profileBlocked = false;
  assert.equal(save.retryProfile(), true);
  assert.deepEqual(JSON.parse(values.get('67v.profile')), save.profile);
  assert.equal(save.profileState.persisted, true);
  assert.equal(randomCalls, 1);

  assert.deepEqual(recoverLocalProfile({
    name: ' Stable Guest ',
    guest: 'yes',
    pn: undefined,
    extra: true,
  }, 'Fallback').profile, {
    name: 'Stable Guest',
    guest: true,
    pn: null,
  });

  profileBlocked = true;
  assert.equal(save.setProfile({ name: 'Changed Guest', guest: true, pn: null }), false);
  assert.equal(save.profile.name, 'Guest2110');
  assert.equal(save.setProfile({ name: '', guest: true, pn: null }), false);
  assert.equal(save.profile.name, 'Guest2110');
});

test('camera-relative movement matches the visible screen axes', () => {
  const forward = cameraRelativeDirection({ mx: 0, my: -1, moving: true }, Math.PI);
  assert.ok(Math.abs(forward.x) < 1e-9);
  assert.ok(forward.z < -0.999);

  const right = cameraRelativeDirection({ mx: 1, my: 0, moving: true }, Math.PI);
  assert.ok(right.x > 0.999);
  assert.ok(Math.abs(right.z) < 1e-9);

  const oppositeViewRight = cameraRelativeDirection({ mx: 1, my: 0, moving: true }, 0);
  assert.ok(oppositeViewRight.x < -0.999);
});

test('manual camera look holds before auto-follow and keeps orbit pitch bounded', () => {
  const orbit = createOrbitState(Math.PI);
  updateOrbitState(orbit, {
    lookYaw: -0.5,
    lookPitch: 5,
    looking: true,
  }, 1 / 60, { autoYaw: 0, manualHold: 0.2 });
  assert.ok(orbit.yaw < Math.PI);
  assert.equal(orbit.pitch, 0.52);
  const heldYaw = orbit.yaw;
  updateOrbitState(orbit, { looking: false }, 0.1, { autoYaw: 0, manualHold: 0.2 });
  assert.equal(orbit.yaw, heldYaw);
  updateOrbitState(orbit, { looking: false }, 0.2, { autoYaw: 0, autoRate: 2, manualHold: 0.2 });
  assert.ok(orbit.yaw < heldYaw);
});

test('chase camera orbit and obstruction keep the lens in front of blocking geometry', () => {
  const focus = new THREE.Vector3(0, 1, 0);
  const desired = new THREE.Vector3();
  orbitCameraPosition(desired, focus, createOrbitState(Math.PI), 5, 0);
  assert.ok(Math.abs(desired.x) < 1e-9);
  assert.ok(desired.z > 4.99);

  const blocker = new THREE.Mesh(
    new THREE.BoxGeometry(4, 4, 0.5),
    new THREE.MeshBasicMaterial(),
  );
  blocker.position.set(0, 1, 2.5);
  blocker.updateWorldMatrix(true, false);
  const resolved = new THREE.Vector3();
  resolveCameraObstruction(
    new THREE.Raycaster(),
    focus,
    desired,
    [blocker],
    resolved,
  );
  assert.ok(resolved.z > 1.2);
  assert.ok(resolved.z < 2.25);
});

test('control messages are bounded and reject extra state', () => {
  const command = normalizeControlMessage({ mx: 2, my: 2, jump: true, grab: false, seq: 7 });
  assert.ok(command);
  assert.ok(Math.hypot(command.mx, command.my) <= 1.000001);
  assert.equal(command.jump, true);
  assert.equal(normalizeControlMessage({ mx: 0, my: 0, seq: 1, score: 99 }), null);
  assert.equal(normalizeControlMessage({ mx: 'bad', my: 0, seq: 1 }), null);
});

test('player names are normalized and capped', () => {
  assert.equal(sanitizePlayerName('  Sky   Kid!!!  '), 'Sky Kid');
  assert.equal(sanitizePlayerName(''), 'Guest');
  assert.equal(sanitizePlayerName('123456789012345678901'), '123456789012345678');
});

test('rate limiter allows a burst and recovers over time', () => {
  let clock = 0;
  const limiter = createRateLimiter({ rate: 2, burst: 2, now: () => clock });
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
  clock = 500;
  assert.equal(limiter.take(), true);
});

test('fixed-step player simulation jumps, lands, and respects bounds', () => {
  const player = createPlayerState(0, 0);
  const env = {
    bounds: 3,
    sampleGround() {
      return { y: 0, box2: null };
    },
  };
  const idle = { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
  stepPlayer(player, { ...idle, jumpHeld: true }, 1 / 60, env);
  assert.equal(player.jumpEvent, true);
  assert.equal(player.grounded, false);

  for (let i = 0; i < 120; i++) stepPlayer(player, idle, 1 / 60, env);
  assert.equal(player.grounded, true);
  assert.equal(player.pos.y, 0);

  const right = { dirX: 1, dirZ: 0, moving: true, jumpHeld: false, grabPressed: false };
  for (let i = 0; i < 120; i++) stepPlayer(player, right, 1 / 60, env);
  assert.equal(player.pos.x, 3);
});

test('player jump forgiveness supports coyote time and pre-landing buffering', () => {
  const noGround = {
    bounds: 10,
    sampleGround() { return { y: -10, box2: null }; },
  };
  const coyote = createPlayerState(0, 0);
  stepPlayer(coyote, {
    dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false,
  }, 1 / 60, noGround);
  assert.equal(coyote.grounded, false);
  stepPlayer(coyote, {
    dirX: 0, dirZ: 0, moving: false, jumpHeld: true, grabPressed: false,
  }, 1 / 60, noGround);
  assert.equal(coyote.jumpEvent, true);

  const flat = {
    bounds: 10,
    sampleGround() { return { y: 0, box2: null }; },
  };
  const buffered = createPlayerState(0, 0);
  buffered.grounded = false;
  buffered.coyoteTime = 0;
  buffered.pos.y = 0.04;
  buffered.vel.y = -2;
  stepPlayer(buffered, {
    dirX: 0, dirZ: 0, moving: false, jumpHeld: true, grabPressed: false,
  }, 1 / 60, flat);
  assert.equal(buffered.jumpEvent, true);
  assert.equal(buffered.grounded, false);
  assert.equal(buffered.vel.y, 4.5);
});

test('normal play navigation exposes the seven honest on-device modes', () => {
  assert.deepEqual(
    FEATURED_MODES.map((mode) => mode.id),
    ['obstacle', 'tag', 'balloon', 'skate', 'show67', 'squid67', 'creator'],
  );
  assert.ok(FEATURED_MODES.every((mode) => mode.status.startsWith('On this device')));

  // The menu is the intersection of featured order and registered games:
  // unregistered featured modes stay hidden, unknown registrations never leak in.
  const games = new Map([
    ['tag', { id: 'tag' }],
    ['balloon', { id: 'balloon' }],
    ['show67', { id: 'show67' }],
    ['debug-arena', { id: 'debug-arena' }],
  ]);
  const available = availableFeaturedModes(games);
  assert.deepEqual(available.map((mode) => mode.id), ['tag', 'balloon', 'show67']);
  assert.ok(available.every((mode) => mode.game === games.get(mode.id)));
});

test('hub fast-travel spots are authored, finite, and distinct from game modes', () => {
  assert.deepEqual(
    HUB_SPOTS.map((spot) => spot.id),
    ['beacon-line', 'ripple-steps', 'flow-steps', 'skyfold-canopy'],
  );
  assert.ok(Object.isFrozen(HUB_SPOTS));
  const modeIds = new Set(FEATURED_MODES.map((mode) => mode.id));
  for (const spot of HUB_SPOTS) {
    assert.ok(Object.isFrozen(spot));
    assert.ok(!modeIds.has(spot.id), `${spot.id} must not collide with a game mode`);
    for (const key of ['x', 'z', 'yaw']) {
      assert.ok(Number.isFinite(spot[key]), `${spot.id}.${key} must be finite`);
    }
    for (const key of ['name', 'place', 'description']) {
      assert.ok(
        typeof spot[key] === 'string' && spot[key].length > 0,
        `${spot.id}.${key} must be non-empty copy`,
      );
    }
  }
  // The two activity spots must sit exactly on their authored start markers so
  // arriving there always shows the opt-in prompt instead of a nearby miss.
  // Asserted against the definitions, not copied numbers: if an activity start
  // moves, this forces the travel spot to move with it.
  const startOf = (id) => {
    const definition = HUB_ACTIVITY_DEFINITIONS.find((entry) => entry.id === id);
    return { x: definition.start.x, z: definition.start.z };
  };
  const beacon = HUB_SPOTS.find((spot) => spot.id === 'beacon-line');
  assert.deepEqual({ x: beacon.x, z: beacon.z }, startOf('skate-line'));
  const ripple = HUB_SPOTS.find((spot) => spot.id === 'ripple-steps');
  assert.deepEqual({ x: ripple.x, z: ripple.z }, startOf('garden-steps'));
});

test('local progression reads one shared result schema across all proven modes', () => {
  const tag = localGameResultFacts({
    game: 'tag',
    gameId: 'tag',
    score: 42,
    coins: 14,
  });
  const balloon = localGameResultFacts({
    game: 'balloon',
    gameId: 'balloon',
    score: 3,
    placement: 1,
    coins: 64,
  });
  const skyway = localGameResultFacts({
    game: 'obstacle',
    gameId: 'obstacle',
    score: 750,
    placement: 2,
    coins: 80,
  });
  const show = localGameResultFacts({
    game: 'show67',
    gameId: 'show67',
    score: 8,
    placement: 1,
    coins: 100,
  });

  assert.deepEqual(tag, { gameId: 'tag', score: 42, placement: null });
  assert.deepEqual(balloon, { gameId: 'balloon', score: 3, placement: 1 });
  assert.deepEqual(skyway, { gameId: 'obstacle', score: 750, placement: 2 });
  assert.deepEqual(show, { gameId: 'show67', score: 8, placement: 1 });
  assert.deepEqual(localGameResultProgress(tag), { play: 1, score: 42, firstPlace: 0 });
  assert.deepEqual(localGameResultProgress(balloon), { play: 1, score: 3, firstPlace: 1 });
  assert.deepEqual(localGameResultProgress({ score: 500, placement: 1 }), {
    play: 0,
    score: 0,
    firstPlace: 0,
  });
  assert.equal(localGameResultFacts(null), null);
});

test('local reward commit marks failed writes and makes them ineligible for progression', () => {
  const base = {
    game: 'tag',
    gameId: 'tag',
    score: 42,
    coins: 14,
  };
  const saved = commitLocalGameReward({
    addCoins(amount, why) {
      assert.equal(amount, 14);
      assert.equal(why, 'tag-round');
      return 114;
    },
  }, base, 'tag-round');
  assert.equal(saved.rewardCommitted, true);
  assert.equal(saved.coins, 14);
  assert.equal(saved.attemptedCoins, 14);
  assert.equal(localGameRewardStat(saved), '+14 Coins');
  assert.deepEqual(localGameResultProgress(saved), {
    play: 1,
    score: 42,
    firstPlace: 0,
  });

  const failed = commitLocalGameReward({
    addCoins() { return null; },
  }, base, 'tag-round');
  assert.equal(failed.rewardCommitted, false);
  assert.equal(failed.coins, 0);
  assert.equal(failed.attemptedCoins, 14);
  assert.equal(localGameRewardStat(failed), 'Not saved');
  assert.equal(localGameResultFacts(failed), null);
  assert.deepEqual(localGameResultProgress(failed), {
    play: 0,
    score: 0,
    firstPlace: 0,
  });
});

test('quest and season progression consumers attach once per local bus', async () => {
  const { attachQuestProgression } = await import('../src/systems/quests.js');
  const { attachSeasonProgression } = await import('../src/systems/season.js');
  const listeners = new Map();
  const bus = {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
      return () => listeners.get(event)?.delete(listener);
    },
    emit(event, data) {
      for (const listener of [...(listeners.get(event) || [])]) listener(data);
    },
  };
  const values = new Map();
  const save = {
    get(key, fallback) {
      return values.has(key) ? values.get(key) : fallback;
    },
    set(key, value) {
      values.set(key, value);
      return true;
    },
  };
  const ctx = {
    bus,
    save,
    ui: { toast() {} },
  };

  assert.equal(attachQuestProgression(ctx), true);
  assert.equal(attachQuestProgression(ctx), false);
  assert.equal(attachSeasonProgression(ctx), true);
  assert.equal(attachSeasonProgression(ctx), false);
  assert.equal(listeners.get('game-result').size, 2);
  assert.equal(listeners.get('coins-earned').size, 2);
  assert.equal(listeners.get('season-xp').size, 1);

  const quests = values.get('quests');
  quests.daily.order = ['play3', 'score500', 'champ1'];
  quests.weekly.order = ['play15', 'score2500', 'champ3'];
  save.set('quests', quests);

  bus.emit('game-result', {
    game: 'balloon',
    gameId: 'balloon',
    score: 125,
    placement: 1,
  });
  assert.deepEqual(values.get('quests').daily.prog, {
    play3: 1,
    score500: 125,
    champ1: 1,
  });
  assert.deepEqual(values.get('quests').weekly.prog, {
    play15: 1,
    score2500: 125,
    champ3: 1,
  });
  assert.equal(values.get('season').xp, 37);

  const questsAfterSavedResult = structuredClone(values.get('quests'));
  const seasonAfterSavedResult = structuredClone(values.get('season'));
  bus.emit('game-result', {
    game: 'tag',
    gameId: 'tag',
    score: 900,
    placement: 1,
    coins: 0,
    attemptedCoins: 99,
    rewardCommitted: false,
  });
  assert.deepEqual(values.get('quests'), questsAfterSavedResult);
  assert.deepEqual(values.get('season'), seasonAfterSavedResult);

  bus.emit('game-result', { score: 900, placement: 1 });
  assert.deepEqual(values.get('quests').daily.prog, {
    play3: 1,
    score500: 125,
    champ1: 1,
  });
  assert.equal(values.get('season').xp, 37);
});

test('Quest and Season mutation events emit only after their local writes succeed', async () => {
  const { attachQuestProgression } = await import('../src/systems/quests.js');
  const { attachSeasonProgression } = await import('../src/systems/season.js');
  const raw = new Map();
  const blockedKeys = new Set();
  const storage = {
    getItem(key) {
      return raw.has(key) ? raw.get(key) : null;
    },
    setItem(key, value) {
      if (blockedKeys.has(key)) throw new Error(`blocked ${key}`);
      raw.set(key, value);
    },
  };
  const bus = createBus();
  const save = createSave(bus, storage, () => {});
  const toasts = [];
  const ctx = { bus, save, ui: { toast(message) { toasts.push(message); } } };
  const questEvents = [];
  const seasonEvents = [];
  bus.on('quest-progress', (event) => questEvents.push(event));
  bus.on('season-xp-gained', (event) => seasonEvents.push(event));
  attachQuestProgression(ctx);
  attachSeasonProgression(ctx);

  const quests = save.get('quests', null);
  quests.daily.order = ['ugcplay1', 'play3', 'score500'];
  quests.daily.prog = {};
  quests.daily.claimed = {};
  quests.weekly.order = ['ugclike5', 'ugcplay5', 'play15'];
  quests.weekly.prog = {};
  quests.weekly.claimed = {};
  assert.equal(save.set('quests', quests), true);
  const season = save.get('season', null);
  season.xp = 0;
  assert.equal(save.set('season', season), true);

  blockedKeys.add('67v.quests');
  blockedKeys.add('67v.season');
  bus.emit('ugc-like', { id: 'world-a', likeCount: 1 });
  assert.equal(save.get('quests', null).weekly.prog.ugclike5 || 0, 0);
  assert.equal(save.get('season', null).xp, 0);
  assert.deepEqual(questEvents, []);
  assert.deepEqual(seasonEvents, []);
  assert.deepEqual(toasts, []);

  blockedKeys.clear();
  bus.emit('ugc-like', { id: 'world-a', likeCount: 1 });
  assert.equal(save.get('quests', null).weekly.prog.ugclike5, 1);
  assert.equal(save.get('season', null).xp, 5);
  assert.deepEqual(questEvents, [{
    questId: 'weekly:ugclike5',
    n: 1,
  }]);
  assert.deepEqual(seasonEvents, [{
    amount: 5,
    why: 'ugc-like',
    total: 5,
  }]);
});

test('device-local social initialization and mutations remain stable across rejected writes', async () => {
  const {
    commitLocalSocialWrites,
    initializeLocalFriendCode,
  } = await import('../src/systems/social.js');
  const values = new Map([
    ['friends', [{ code: '67-OLD2', name: 'Existing Friend' }]],
    ['party', {
      code: 'P-OLD2',
      leader: '67-ME22',
      members: [
        { code: '67-ME22', name: 'Me' },
        { code: '67-OLD2', name: 'Existing Friend' },
      ],
    }],
  ]);
  let blockedKey = null;
  const save = {
    get(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : fallback;
    },
    set(key, value) {
      if (key === blockedKey) return false;
      values.set(key, structuredClone(value));
      return true;
    },
  };
  const nextFriends = [];
  const nextParty = {
    ...values.get('party'),
    members: [{ code: '67-ME22', name: 'Me' }],
  };

  blockedKey = 'friendCode';
  const firstCode = initializeLocalFriendCode(save, 'Guest1234');
  assert.equal(firstCode.persisted, false);
  assert.match(firstCode.code, /^67-[A-Z0-9]{4}$/);
  assert.equal(values.has('friendCode'), false);
  const stableRetry = initializeLocalFriendCode(save, 'Guest9999', firstCode.code);
  assert.deepEqual(stableRetry, firstCode);

  blockedKey = null;
  assert.deepEqual(initializeLocalFriendCode(save, 'Guest9999', firstCode.code), {
    code: firstCode.code,
    persisted: true,
  });
  assert.equal(values.get('friendCode'), firstCode.code);
  assert.deepEqual(initializeLocalFriendCode(save, 'Different Identity'), {
    code: firstCode.code,
    persisted: true,
  });

  blockedKey = 'friends';
  assert.equal(commitLocalSocialWrites(save, [
    { key: 'friends', value: nextFriends },
  ]), false);
  assert.equal(values.get('friends').length, 1);

  blockedKey = 'party';
  assert.equal(commitLocalSocialWrites(save, [
    { key: 'friends', value: nextFriends },
    { key: 'party', value: nextParty },
  ]), false);
  assert.equal(values.get('friends').length, 1);
  assert.equal(values.get('party').members.length, 2);

  blockedKey = null;
  assert.equal(commitLocalSocialWrites(save, [
    { key: 'friends', value: nextFriends },
    { key: 'party', value: nextParty },
  ]), true);
  assert.deepEqual(values.get('friends'), []);
  assert.deepEqual(values.get('party').members, [{ code: '67-ME22', name: 'Me' }]);
});

test('Skypark first-visit marker reports rejected persistence and remains retryable', () => {
  let seen = false;
  let allowWrite = false;
  const save = {
    get(key, fallback) {
      assert.equal(key, 'seenSkyparkArrival');
      return seen || fallback;
    },
    set(key, value) {
      assert.equal(key, 'seenSkyparkArrival');
      if (!allowWrite) return false;
      seen = value;
      return true;
    },
  };

  assert.deepEqual(commitSkyparkArrival(save), {
    firstVisit: true,
    committed: false,
  });
  assert.equal(seen, false);
  allowWrite = true;
  assert.deepEqual(commitSkyparkArrival(save), {
    firstVisit: true,
    committed: true,
  });
  assert.equal(seen, true);
  assert.deepEqual(commitSkyparkArrival(save), {
    firstVisit: false,
    committed: true,
  });
});

test('appearance and settings selections emit and apply only after verified persistence', async () => {
  const { updateSettings } = await import('../src/systems/settings.js');
  const { persistEquippedCosmetics } = await import('../src/systems/cosmetics.js');
  let settings = {
    volume: 0.7,
    quality: 'auto',
    chatEnabled: true,
    parentalGate: false,
    spendCap: 0,
    skinTone: '#f2c9a0',
  };
  let allowSettings = false;
  const appliedQuality = [];
  const settingsCtx = {
    save: {
      get(key, fallback) { return key === 'settings' ? settings : fallback; },
      setSettings(next) {
        if (!allowSettings) return false;
        settings = structuredClone(next);
        return true;
      },
    },
    quality: {
      applyPreference(value) {
        appliedQuality.push(value);
        return { preference: value };
      },
    },
  };
  assert.equal(updateSettings(settingsCtx, { quality: 'low' }), null);
  assert.equal(settings.quality, 'auto');
  assert.deepEqual(appliedQuality, []);
  allowSettings = true;
  assert.equal(updateSettings(settingsCtx, { quality: 'low' }).quality, 'low');
  assert.equal(settings.quality, 'low');
  assert.deepEqual(appliedQuality, ['low']);

  let equipped = 'ghost';
  let allowCharacter = false;
  const characterEvents = [];
  const characters = createCharacters({
    save: {
      get(key, fallback) { return key === 'equipped' ? equipped : fallback; },
      set(key, value) {
        if (key !== 'equipped' || !allowCharacter) return false;
        equipped = value;
        return true;
      },
    },
    bus: { emit(event, data) { characterEvents.push({ event, data }); } },
  });
  assert.equal(characters.equip('kid'), false);
  assert.equal(characters.selectedId(), 'ghost');
  assert.equal(characters.equippedId(), 'qa-runner');
  assert.deepEqual(characterEvents, []);
  allowCharacter = true;
  assert.equal(characters.equip('kid'), true);
  assert.equal(characters.equippedId(), 'kid');
  assert.deepEqual(characterEvents, [{
    event: 'character-equipped',
    data: { id: 'kid' },
  }]);

  let cosmeticState = { hat: null, glasses: null, backpack: null };
  let allowCosmetics = false;
  const cosmeticSave = {
    set(key, value) {
      if (key !== 'equippedCosmetics' || !allowCosmetics) return false;
      cosmeticState = structuredClone(value);
      return true;
    },
  };
  const nextCosmetics = { ...cosmeticState, hat: 'beanie_sunny' };
  assert.equal(persistEquippedCosmetics(cosmeticSave, nextCosmetics), false);
  assert.equal(cosmeticState.hat, null);
  allowCosmetics = true;
  assert.equal(persistEquippedCosmetics(cosmeticSave, nextCosmetics), true);
  assert.equal(cosmeticState.hat, 'beanie_sunny');
});

test('unrigged Ghost selection persists while public runtime uses the reversible QA fallback', () => {
  assert.equal(allowsDevelopmentGhost(''), false);
  assert.equal(allowsDevelopmentGhost('?dev=1&ghost=1'), true);
  assert.equal(allowsDevelopmentGhost('?ghost=1'), false);
  assert.equal(resolvePlayableCharacterId('ghost', ''), 'qa-runner');
  assert.equal(resolvePlayableCharacterId('ghost', '?dev=1&ghost=1'), 'ghost');
  assert.equal(resolvePlayableCharacterId('kid', ''), 'kid');

  let equipped = 'kid';
  const events = [];
  const characters = createCharacters({
    save: {
      get(key, fallback) { return key === 'equipped' ? equipped : fallback; },
      set(key, value) {
        if (key !== 'equipped') return false;
        equipped = value;
        return true;
      },
    },
    bus: { emit(event, data) { events.push({ event, data }); } },
  });

  assert.equal(characters.equip('ghost'), true);
  assert.equal(equipped, 'ghost');
  assert.equal(characters.selectedId(), 'ghost');
  assert.equal(characters.equippedId(), 'qa-runner');
  assert.deepEqual(events.at(-1), {
    event: 'character-equipped',
    data: { id: 'qa-runner' },
  });
});

test('device-local chat safety list preserves block state when persistence is rejected', async () => {
  const {
    commitLocalChatBlock,
    readLocalChatBlocked,
  } = await import('../src/systems/chat.js');
  let blocked = ['Local Friend', 'Local Friend', '', 42];
  let allowWrite = false;
  const save = {
    get(key, fallback) {
      return key === 'chatBlocked' ? structuredClone(blocked) : fallback;
    },
    set(key, value) {
      if (key !== 'chatBlocked' || !allowWrite) return false;
      blocked = structuredClone(value);
      return true;
    },
  };
  assert.deepEqual(readLocalChatBlocked(save), ['Local Friend']);
  assert.equal(commitLocalChatBlock(save, 'Another Friend', true), false);
  assert.deepEqual(readLocalChatBlocked(save), ['Local Friend']);
  assert.equal(commitLocalChatBlock(save, 'Local Friend', false), false);
  assert.deepEqual(readLocalChatBlocked(save), ['Local Friend']);

  allowWrite = true;
  assert.equal(commitLocalChatBlock(save, 'Another Friend', true), true);
  assert.deepEqual(readLocalChatBlocked(save), ['Local Friend', 'Another Friend']);
  assert.equal(commitLocalChatBlock(save, 'Local Friend', false), true);
  assert.deepEqual(readLocalChatBlocked(save), ['Another Friend']);
  assert.equal(commitLocalChatBlock(save, '', true), false);
});

test('quest recovery preserves healthy current-period fields and replaces corrupt siblings', async () => {
  const { recoverQuestState } = await import('../src/systems/quests.js');
  const now = new Date('2026-07-27T12:00:00Z');
  const baseline = recoverQuestState(null, { now }).state;
  const recovery = recoverQuestState({
    version: 0,
    daily: {
      key: baseline.daily.key,
      order: ['play3', 'play3', 'not-a-quest'],
      prog: { play3: 2, score500: '400', champ1: 1 },
      claimed: { play3: 'true', champ1: true },
    },
    weekly: {
      key: baseline.weekly.key,
      order: ['play15', 'score2500', 'champ3'],
      prog: { play15: 4, score2500: -5, champ3: 2 },
      claimed: { play15: false, champ3: true },
    },
  }, { now });

  assert.equal(recovery.recovered, true);
  assert.equal(recovery.state.version, LOCAL_SAVE_SCHEMA_VERSION);
  assert.equal(recovery.state.daily.order[0], 'play3');
  assert.equal(new Set(recovery.state.daily.order).size, 3);
  assert.deepEqual(recovery.state.daily.prog, { play3: 2, champ1: 1 });
  assert.deepEqual(recovery.state.daily.claimed, { champ1: true });
  assert.deepEqual(recovery.state.weekly.order, ['play15', 'score2500', 'champ3']);
  assert.deepEqual(recovery.state.weekly.prog, { play15: 4, champ3: 3 });
  assert.deepEqual(recovery.state.weekly.claimed, { champ3: true });
  assert.equal(recoverQuestState('corrupt', { now }).state.daily.order.length, 3);
});

test('season recovery persists healthy current-season progress and rejects corrupt unlock fields', async () => {
  const { recoverSeasonState } = await import('../src/systems/season.js');
  const now = Date.UTC(2026, 6, 27);
  const current = recoverSeasonState(null, { now }).state;
  const recovery = recoverSeasonState({
    version: 0,
    id: current.id,
    xp: 480,
    premium: 'false',
    boostPct: 10,
    claimedFree: [1, 1, 30, 31, '2'],
    claimedPrem: [8, 16, -1],
    granted: ['sunny-hat', 'sunny-hat', '', 67],
  }, { now });

  assert.deepEqual(recovery.state, {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    id: current.id,
    xp: 480,
    premium: false,
    boostPct: 10,
    claimedFree: [1, 30],
    claimedPrem: [8, 16],
    granted: ['sunny-hat'],
  });
  assert.equal(recovery.recovered, true);
  assert.equal(recoverSeasonState({
    id: 'expired-season',
    xp: 999,
    premium: true,
  }, { now }).state.xp, 0);
});

test('quest and season claims remain unclaimed when local reward persistence fails', async () => {
  const {
    claimQuestReward,
    recoverQuestState,
  } = await import('../src/systems/quests.js');
  const {
    claimSeasonReward,
    recoverSeasonState,
  } = await import('../src/systems/season.js');
  const raw = new Map();
  let blockedKey = null;
  const storage = {
    getItem(key) {
      return raw.has(key) ? raw.get(key) : null;
    },
    setItem(key, value) {
      if (key === blockedKey) throw new Error(`blocked ${key}`);
      raw.set(key, value);
    },
  };
  const bus = createBus();
  const save = createSave(bus, storage, () => {});
  const toasts = [];
  const seasonXpEvents = [];
  const seasonRewardEvents = [];
  const cosmeticEvents = [];
  bus.on('season-xp', (event) => seasonXpEvents.push(event));
  bus.on('season-reward', (event) => seasonRewardEvents.push(event));
  bus.on('cosmetic-granted', (event) => cosmeticEvents.push(event));
  const ctx = {
    bus,
    save,
    ui: { toast(message) { toasts.push(message); } },
  };

  const quests = recoverQuestState(null).state;
  quests.daily.order = ['play3', 'score500', 'champ1'];
  quests.daily.prog.play3 = 3;
  assert.equal(save.set('quests', quests), true);
  const season = recoverSeasonState(null).state;
  assert.equal(save.set('season', season), true);

  blockedKey = '67v.coins';
  assert.equal(claimQuestReward(ctx, 'daily', 'play3'), false);
  assert.equal(save.coins, 0);
  assert.equal(save.get('quests', null).daily.claimed.play3, undefined);
  assert.deepEqual(seasonXpEvents, []);
  assert.match(toasts.at(-1), /Nothing was claimed/);

  assert.equal(claimSeasonReward(ctx, 1, 'free'), false);
  assert.equal(save.coins, 0);
  assert.deepEqual(save.get('season', null).claimedFree, []);
  assert.deepEqual(seasonRewardEvents, []);
  assert.match(toasts.at(-1), /Nothing was claimed/);

  const cosmeticSeason = save.get('season', null);
  cosmeticSeason.xp = 100_000;
  assert.equal(save.set('season', cosmeticSeason), true);
  blockedKey = '67v.ownedCosmetics';
  assert.equal(claimSeasonReward(ctx, 10, 'free'), false);
  assert.deepEqual(save.get('season', null).claimedFree, []);
  assert.deepEqual(save.get('season', null).granted, []);
  assert.deepEqual(save.get('ownedCosmetics', []), []);
  assert.deepEqual(cosmeticEvents, []);
  assert.deepEqual(seasonRewardEvents, []);

  blockedKey = null;
  assert.equal(claimQuestReward(ctx, 'daily', 'play3'), true);
  assert.equal(save.coins, 60);
  assert.equal(save.get('quests', null).daily.claimed.play3, true);
  assert.deepEqual(seasonXpEvents, [{
    amount: 30,
    why: 'quest:play3',
  }]);
  assert.equal(claimSeasonReward(ctx, 1, 'free'), true);
  assert.equal(save.coins, 110);
  assert.deepEqual(save.get('season', null).claimedFree, [1]);
  assert.equal(seasonRewardEvents.length, 1);
});

test('Coin shop commits debit, item grant, duplicate rebate, and purchase event together', async () => {
  const { commitCoinShopPurchase } = await import('../src/systems/shop.js');
  const raw = new Map();
  let blockedKey = null;
  const storage = {
    getItem(key) {
      return raw.has(key) ? raw.get(key) : null;
    },
    setItem(key, value) {
      if (key === blockedKey) throw new Error(`blocked ${key}`);
      raw.set(key, value);
    },
  };
  const bus = createBus();
  const save = createSave(bus, storage, () => {});
  const purchases = [];
  bus.on('shop-purchase', (event) => purchases.push(event));
  const ctx = { save, bus };
  const box = { id: 'box-test', price: 250 };
  assert.equal(save.set('coins', 1_000), true);

  blockedKey = '67v.coins';
  assert.deepEqual(
    commitCoinShopPurchase(ctx, box, 'cap-test'),
    {
      ok: false,
      reason: 'storage-failed',
      duplicate: false,
      refund: 0,
      netCost: 250,
    },
  );
  assert.equal(save.coins, 1_000);
  assert.deepEqual(save.get('ownedCosmetics', []), []);
  assert.deepEqual(purchases, []);

  blockedKey = '67v.ownedCosmetics';
  assert.deepEqual(
    commitCoinShopPurchase(ctx, box, 'cap-test'),
    {
      ok: false,
      reason: 'storage-failed',
      duplicate: false,
      refund: 0,
      netCost: 250,
    },
  );
  assert.equal(save.coins, 1_000);
  assert.deepEqual(save.get('ownedCosmetics', []), []);
  assert.deepEqual(purchases, []);

  blockedKey = null;
  const granted = commitCoinShopPurchase(ctx, box, 'cap-test');
  assert.equal(granted.ok, true);
  assert.equal(granted.duplicate, false);
  assert.equal(granted.refund, 0);
  assert.equal(granted.netCost, 250);
  assert.equal(granted.total, 750);
  assert.equal(save.coins, 750);
  assert.deepEqual(save.get('ownedCosmetics', []), ['cap-test']);
  assert.deepEqual(purchases, [granted.event]);

  const duplicate = commitCoinShopPurchase(ctx, box, 'cap-test');
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.refund, 100);
  assert.equal(duplicate.netCost, 150);
  assert.equal(duplicate.total, 600);
  assert.equal(save.coins, 600);
  assert.deepEqual(save.get('ownedCosmetics', []), ['cap-test']);
  assert.deepEqual(purchases, [granted.event, duplicate.event]);
  assert.deepEqual(duplicate.event, {
    kind: 'blindbox',
    itemId: 'box-test',
    prizeId: 'cap-test',
    currency: 'coins',
    amount: 250,
    refund: 100,
    netCost: 150,
  });

  assert.equal(save.set('coins', 100), true);
  assert.deepEqual(commitCoinShopPurchase(ctx, box, 'another-cap'), {
    ok: false,
    reason: 'insufficient-coins',
  });
  assert.equal(save.coins, 100);
  assert.deepEqual(save.get('ownedCosmetics', []), ['cap-test']);
  assert.equal(purchases.length, 2);
});

test('Quick Start and UGC win rewards suppress success and dependent state after failed Coin writes', async () => {
  const { commitUgcWorldWinReward } = await import('../src/ugc/discovery.js');
  const raw = new Map();
  let blockedKey = null;
  const storage = {
    getItem(key) {
      return raw.has(key) ? raw.get(key) : null;
    },
    setItem(key, value) {
      if (key === blockedKey) throw new Error(`blocked ${key}`);
      raw.set(key, value);
    },
  };
  const bus = createBus();
  const save = createSave(bus, storage, () => {});
  const coinEvents = [];
  bus.on('coins-earned', (event) => coinEvents.push(event));

  blockedKey = '67v.coins';
  assert.equal(commitQuickStartReward(save), null);
  assert.equal(save.coins, 0);
  assert.equal(save.get('quickStartDone', false), false);
  assert.deepEqual(coinEvents, []);

  blockedKey = '67v.quickStartDone';
  assert.equal(commitQuickStartReward(save), null);
  assert.equal(save.coins, 0);
  assert.equal(save.get('quickStartDone', false), false);
  assert.deepEqual(coinEvents, []);

  blockedKey = null;
  assert.equal(commitQuickStartReward(save), 25);
  assert.equal(save.coins, 25);
  assert.equal(save.get('quickStartDone', false), true);
  assert.deepEqual(coinEvents, [{
    amount: 25,
    why: 'Quick Start',
    total: 25,
  }]);

  assert.equal(save.set('coins', 0), true);
  blockedKey = '67v.coins';
  assert.deepEqual(commitUgcWorldWinReward(save), {
    rewardCommitted: false,
    coins: 0,
    attemptedCoins: 15,
    total: null,
  });
  assert.equal(save.coins, 0);
  assert.equal(coinEvents.length, 1);

  blockedKey = null;
  assert.deepEqual(commitUgcWorldWinReward(save), {
    rewardCommitted: true,
    coins: 15,
    attemptedCoins: 15,
    total: 15,
  });
  assert.equal(save.coins, 15);
  assert.deepEqual(coinEvents.at(-1), {
    amount: 15,
    why: 'ugc-world-win',
    total: 15,
  });
});

test('legacy UGC counters migrate field-by-field and preserve healthy world stats', () => {
  const legacy = {
    'world-a': 3,
    'world-b': '4',
    'world-c': -1,
    constructor: 2,
  };
  assert.deepEqual(recoverLocalCounterState(legacy), {
    state: {
      version: LOCAL_SAVE_SCHEMA_VERSION,
      counts: { 'world-a': 3 },
    },
    recovered: true,
  });

  const values = new Map([['ugcPlays', legacy]]);
  const save = {
    get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); return true; },
  };
  assert.deepEqual(readLocalCounterMap(save, 'ugcPlays'), { 'world-a': 3 });
  assert.equal(incrementLocalCounter(save, 'ugcPlays', 'world-a'), 4);
  assert.equal(incrementLocalCounter(save, 'ugcPlays', 'world-new'), 1);
  assert.equal(incrementLocalCounter(save, 'ugcPlays', '__proto__'), null);
  assert.deepEqual(values.get('ugcPlays'), {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    counts: { 'world-a': 4, 'world-new': 1 },
  });
  assert.equal(removeLocalCounterEntry(save, 'ugcPlays', 'world-a'), true);
  assert.equal(removeLocalCounterEntry(save, 'ugcPlays', 'missing'), false);
  assert.deepEqual(retainLocalCounterEntries(
    save,
    'ugcPlays',
    ['world-new', 'world-missing'],
  ), { 'world-new': 1 });

  const rejected = {
    get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    set() { return false; },
  };
  assert.equal(incrementLocalCounter(rejected, 'ugcPlays', 'world-new'), null);
  assert.equal(removeLocalCounterEntry(rejected, 'ugcPlays', 'world-new'), false);
  assert.deepEqual(values.get('ugcPlays'), {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    counts: { 'world-new': 1 },
  });
});

test('local moderation recovery isolates records and safely resolves missing world references', () => {
  const at = '2026-07-27T12:00:00.000Z';
  const legacy = [
    null,
    {
      id: 'world-report',
      worldId: 'world-a',
      worldName: 'Healthy World',
      reason: 'Looks copied',
      reporter: 'Guest67',
      at,
      status: 'open',
    },
    {
      id: 'orphan-report',
      type: 'ugc-world',
      worldId: 'world-missing',
      worldName: 'Gone World',
      reason: 'Something else',
      reporter: 'Guest67',
      at: 'not-a-date',
      status: 'open',
    },
    {
      id: 'chat-report',
      type: 'chat',
      from: 'Local Friend',
      text: 'hello',
      reporter: 'Guest67',
      reason: 'user-report',
      at,
      status: 'pending',
    },
    { id: '', type: 'chat', text: 'broken' },
  ];
  const recovered = recoverLocalModerationQueue(legacy);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.state.version, LOCAL_MODERATION_QUEUE_VERSION);
  assert.equal(recovered.state.records.length, 3);
  assert.equal(
    recovered.state.records.find((record) => record.id === 'orphan-report').at,
    null,
  );
  assert.equal(
    formatLocalReporterAttribution(
      recovered.state.records.find((record) => record.id === 'chat-report').reporter,
    ),
    'Guest67 (local name snapshot)',
  );

  const values = new Map([['modQueue', legacy]]);
  const save = {
    get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); },
  };
  const records = readLocalModerationQueue(save, { worldIds: ['world-a'] });
  assert.equal(records.find((record) => record.id === 'world-report').status, 'open');
  assert.equal(records.find((record) => record.id === 'orphan-report').status, 'unavailable');
  assert.equal(records.find((record) => record.id === 'chat-report').status, 'pending');
  assert.equal(setLocalModerationStatus(save, 'world-report', 'kept'), true);
  assert.equal(setLocalModerationStatus(save, 'world-report', 'pending'), false);
  assert.equal(appendLocalModerationRecord(save, {
    id: 'world-report-2',
    type: 'ugc-world',
    worldId: 'world-a',
    worldName: 'Healthy World',
    reason: 'Unkind words',
    reporter: 'Guest67',
    at,
    status: 'open',
  })?.id, 'world-report-2');
  assert.equal(resolveLocalWorldReports(save, 'world-a', 'removed'), 1);
  assert.equal(
    readLocalModerationQueue(save)
      .find((record) => record.id === 'world-report-2').status,
    'removed',
  );

  const failedSave = {
    get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    set() { return false; },
  };
  assert.equal(appendLocalModerationRecord(failedSave, {
    id: 'write-failure',
    type: 'chat',
    from: 'Local Friend',
    text: 'hello',
    reporter: 'Guest67',
    reason: 'user-report',
    at,
    status: 'pending',
  }), null);
  assert.equal(setLocalModerationStatus(failedSave, 'chat-report', 'kept'), false);
});

test('67 Show stats recover partial local state and advance once per verified finalize write', async () => {
  const {
    commitShow67Stats,
    nextShow67Stats,
    recoverShow67Stats,
  } = await import('../src/games/show67.js');
  assert.deepEqual(recoverShow67Stats({
    plays: 5,
    wins: 8,
    podiums: 3,
    bestPlacement: 2,
  }), {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    plays: 5,
    wins: 5,
    podiums: 3,
    bestPlacement: 2,
  });
  const first = nextShow67Stats({
    plays: null,
    wins: -2,
    podiums: Number.NaN,
    bestPlacement: 99,
  }, 1);
  assert.deepEqual(first, {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    plays: 1,
    wins: 1,
    podiums: 1,
    bestPlacement: 1,
  });
  assert.deepEqual(nextShow67Stats(first, 4), {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    plays: 2,
    wins: 1,
    podiums: 1,
    bestPlacement: 1,
  });

  let saved = first;
  let writesBlocked = true;
  const save = {
    get(key, fallback) {
      assert.equal(key, 'show67Stats');
      return saved ?? fallback;
    },
    set(key, value) {
      assert.equal(key, 'show67Stats');
      if (writesBlocked) return false;
      saved = value;
      return true;
    },
  };
  assert.deepEqual(commitShow67Stats(save, 4), {
    committed: false,
    stats: null,
  });
  assert.deepEqual(saved, first);
  writesBlocked = false;
  assert.deepEqual(commitShow67Stats(save, 4), {
    committed: true,
    stats: {
      version: LOCAL_SAVE_SCHEMA_VERSION,
      plays: 2,
      wins: 1,
      podiums: 1,
      bestPlacement: 1,
    },
  });
  assert.deepEqual(saved, {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    plays: 2,
    wins: 1,
    podiums: 1,
    bestPlacement: 1,
  });
});

test('featured local modes share one deterministic mount and return lifecycle', async () => {
  const mounted = [];
  const unmounted = [];
  const games = new Map(FEATURED_MODES.map(({ id, name }) => [
    id,
    { id, name },
  ]));
  const lifecycle = createGameLifecycle({
    load: async (id) => games.get(id) || null,
    mount(game, id) {
      mounted.push(id);
      return { unmount: () => unmounted.push(id), game };
    },
  });

  for (const id of ['obstacle', 'tag', 'balloon']) {
    const result = await lifecycle.start(id);
    assert.equal(result.status, 'mounted');
    assert.equal(lifecycle.getActive()?.id, id);
  }
  assert.deepEqual(mounted, ['obstacle', 'tag', 'balloon']);
  assert.deepEqual(unmounted, ['obstacle', 'tag']);

  assert.equal(lifecycle.stop('home').status, 'stopped');
  assert.equal(lifecycle.stop('home-again').status, 'idle');
  assert.deepEqual(unmounted, ['obstacle', 'tag', 'balloon']);
  assert.equal(lifecycle.getActive(), null);
});

test('return to hub cancels a slow route before it can mount', async () => {
  let resolveLoad;
  const slowLoad = new Promise((resolve) => { resolveLoad = resolve; });
  let mounts = 0;
  const lifecycle = createGameLifecycle({
    load: () => slowLoad,
    mount: () => {
      mounts += 1;
      return { unmount() {} };
    },
  });

  const pending = lifecycle.start('obstacle');
  assert.equal(lifecycle.stop('home').status, 'idle');
  resolveLoad({ id: 'obstacle', name: 'Skyway Sprint' });
  assert.equal((await pending).status, 'superseded');
  assert.equal(mounts, 0);
  assert.equal(lifecycle.getActive(), null);
});

test('newer route requests win and failed routes remain recoverable', async () => {
  let resolveTag;
  const tagLoad = new Promise((resolve) => { resolveTag = resolve; });
  const unmounted = [];
  const lifecycle = createGameLifecycle({
    load(id) {
      if (id === 'tag') return tagLoad;
      if (id === 'missing') return null;
      if (id === 'broken-load') throw new Error('chunk failed');
      return { id, name: id };
    },
    mount(game) {
      if (game.id === 'broken-mount') throw new Error('mount failed');
      return { unmount: () => unmounted.push(game.id) };
    },
  });

  const pendingTag = lifecycle.start('tag');
  assert.equal((await lifecycle.start('balloon')).status, 'mounted');
  resolveTag({ id: 'tag', name: 'Tag' });
  assert.equal((await pendingTag).status, 'superseded');
  assert.equal(lifecycle.getActive()?.id, 'balloon');
  assert.equal((await lifecycle.start('missing')).status, 'unavailable');
  assert.equal(lifecycle.getActive()?.id, 'balloon');
  assert.equal((await lifecycle.start('broken-load')).status, 'load-error');
  assert.equal(lifecycle.getActive()?.id, 'balloon');
  assert.equal((await lifecycle.start('broken-mount')).status, 'mount-error');
  assert.deepEqual(unmounted, ['balloon']);
  assert.equal(lifecycle.getActive(), null);

  assert.equal((await lifecycle.start('obstacle')).status, 'mounted');
  assert.equal(lifecycle.getActive()?.id, 'obstacle');
});

test('an unmount exception is reported without blocking the next local mode', async () => {
  const errors = [];
  const lifecycle = createGameLifecycle({
    load: async (id) => ({ id, name: id }),
    mount: (game) => ({
      unmount() {
        if (game.id === 'tag') throw new Error('cleanup failed');
      },
    }),
    onUnmountError(error, entry, reason) {
      errors.push({ message: error.message, id: entry.id, reason });
    },
  });

  assert.equal((await lifecycle.start('tag')).status, 'mounted');
  assert.equal((await lifecycle.start('balloon')).status, 'mounted');
  assert.deepEqual(errors, [{ message: 'cleanup failed', id: 'tag', reason: 'switch' }]);
  assert.equal(lifecycle.getActive()?.id, 'balloon');
  assert.equal(lifecycle.stop('home').status, 'stopped');
  assert.equal(lifecycle.getActive(), null);
});

test('playable routes load on demand and share concurrent registration work', async () => {
  assert.deepEqual(GAME_ROUTE_IDS, ['tag', 'balloon', 'obstacle', 'skate', 'creator', 'show67', 'squid67']);
  assert.equal(hasGameRoute('obstacle'), true);
  assert.equal(hasGameRoute('missing'), false);

  const [first, second] = await Promise.all([
    ensureGameLoaded('tag'),
    ensureGameLoaded('tag'),
  ]);
  assert.equal(first?.id, 'tag');
  assert.equal(second, first);
  assert.equal(await ensureGameLoaded('missing'), null);
});

test('panel-only systems load on demand without changing hub hook timing', async () => {
  assert.deepEqual(
    SYSTEM_ROUTE_IDS,
    [
      'cosmetics', 'settings', 'emotes', 'quests', 'season', 'collection', 'shop',
      'social', 'chat', 'harita', 'market', 'discovery', 'editor', 'character-lab',
      'device-playtest',
    ],
  );
  assert.equal(hasSystemRoute('chat'), true);
  // The park map is a panel like any other, so it loads on demand too — the
  // hub must not pay for a map nobody opened.
  assert.equal(hasSystemRoute('harita'), true);
  assert.equal(hasSystemRoute('settings'), true);

  const [first, second, cosmetics, settings, emotes] = await Promise.all([
    ensureSystemLoaded('chat'),
    ensureSystemLoaded('chat'),
    ensureSystemLoaded('cosmetics'),
    ensureSystemLoaded('settings'),
    ensureSystemLoaded('emotes'),
  ]);
  assert.equal(typeof first?.open, 'function');
  assert.equal(second, first);
  assert.equal(typeof cosmetics?.open, 'function');
  assert.equal(typeof settings?.open, 'function');
  assert.equal(typeof emotes?.open, 'function');
  assert.equal(typeof (await ensureSystemLoaded('character-lab'))?.open, 'function');
  assert.equal(typeof (await ensureSystemLoaded('device-playtest'))?.open, 'function');
  assert.equal(await ensureSystemLoaded('missing'), null);
});

test('deferred route loader deduplicates concurrent work and retries a failed import', async () => {
  const registry = new Map();
  let attempts = 0;
  let release;
  const firstAttempt = new Promise((resolve) => { release = resolve; });
  const ensureLoaded = createRegistryRouteLoader(registry, {
    panel: async () => {
      attempts += 1;
      if (attempts === 1) {
        await firstAttempt;
        throw new Error('network unavailable');
      }
      const system = { open() {} };
      registry.set('panel', system);
    },
  });

  const first = ensureLoaded('panel');
  const duplicate = ensureLoaded('panel');
  release();
  await assert.rejects(first, /network unavailable/);
  await assert.rejects(duplicate, /network unavailable/);
  assert.equal(attempts, 1);

  const recovered = await ensureLoaded('panel');
  assert.equal(typeof recovered.open, 'function');
  assert.equal(attempts, 2);
  assert.equal(await ensureLoaded('missing'), null);
});

test('late hooks replay only their own latest lifecycle context', () => {
  const name = `late-hook-${Date.now()}`;
  const calls = [];
  runHooks(name, 'boot-context');
  assert.equal(hasHookRun(name), true);

  registerHook(name, (value) => calls.push(`late:${value}`), { replay: true });
  registerHook(name, (value) => calls.push(`normal:${value}`));
  assert.deepEqual(calls, ['late:boot-context']);

  runHooks(name, 'next-context');
  assert.deepEqual(calls, [
    'late:boot-context',
    'late:next-context',
    'normal:next-context',
  ]);
});

test('idle progression pair registers through a deterministic scheduler', async () => {
  assert.deepEqual(IDLE_MODULE_IDS, ['quests', 'season']);
  let scheduled = false;
  const results = await scheduleIdleModules({
    schedule(work) {
      scheduled = true;
      work();
    },
  });
  assert.equal(scheduled, true);
  // Three settled entries, not two: the idle pass now also carries the audio
  // system, which is synthesized rather than fetched and inaudible until the
  // player is through the entry gate, so it does not belong in the first load.
  assert.equal(results.length, 3);
  assert.ok(results.every((result) => result.status === 'fulfilled'));
  assert.equal(typeof await ensureSystemLoaded('quests').then((system) => system?.open), 'function');
  assert.equal(typeof await ensureSystemLoaded('season').then((system) => system?.open), 'function');
});

test('bundle budget analysis follows static imports and isolates dynamic entries', async () => {
  const manifest = {
    'index.html': {
      file: 'assets/index.js',
      isEntry: true,
      imports: ['_shared.js'],
    },
    '_shared.js': {
      file: 'assets/shared.js',
    },
    'src/games/tag.js': {
      file: 'assets/tag.js',
      isDynamicEntry: true,
    },
  };
  const assets = new Map([
    ['assets/index.js', Buffer.alloc(50, 1)],
    ['assets/shared.js', Buffer.alloc(25, 2)],
    ['assets/tag.js', Buffer.alloc(30, 3)],
  ]);
  const report = await analyzeManifest(manifest, {
    readAsset: async (file) => assets.get(file),
  });
  assert.equal(report.initial.rawBytes, 75);
  assert.deepEqual(report.initial.files.map((item) => item.file), [
    'assets/index.js',
    'assets/shared.js',
  ]);
  assert.deepEqual(report.asyncEntries.map((item) => item.file), ['assets/tag.js']);
  assert.deepEqual(report.deferredChunks.map((item) => item.file), ['assets/tag.js']);
  assert.deepEqual(evaluateBudget(report, {
    initialJsRawBytes: 75,
    initialJsGzipBytes: 1_000,
    maxAsyncJsRawBytes: 30,
  }), []);
  assert.equal(evaluateBudget(report, {
    initialJsRawBytes: 74,
    initialJsGzipBytes: 1_000,
    maxAsyncJsRawBytes: 29,
  }).length, 2);
  assert.deepEqual(evaluateBudget(report, {
    initialJsRawBytes: 75,
    initialJsGzipBytes: 1_000,
    maxAsyncJsRawBytes: 30,
    requiredDeferredSources: ['src/games/tag.js'],
  }), []);
  assert.match(evaluateBudget(report, {
    initialJsRawBytes: 75,
    initialJsGzipBytes: 1_000,
    maxAsyncJsRawBytes: 30,
    requiredDeferredSources: ['src/systems/settings.js'],
  })[0], /required deferred source/);
});

test('Skypark composition connects its original arrival landmark to purposeful routes', () => {
  assert.deepEqual(validateSkyparkComposition(), []);
  assert.deepEqual(
    SKYPARK_LANDMARKS.map(({ id }) => id),
    ['skyfold-canopy'],
  );
  assert.equal(SKYPARK_ROUTES.filter(({ primary }) => primary).length, 1);
  assert.equal(SKYPARK_ROUTES.find(({ primary }) => primary).id, 'play-lozenges');
  for (const landmark of SKYPARK_LANDMARKS) {
    assert.ok(SKYPARK_ROUTES.some(({ id }) => id === landmark.routeId));
    assert.match(landmark.purpose, /\S/);
    assert.match(landmark.silhouette, /\S/);
  }
  assert.deepEqual(skyparkRouteSegments(SKYPARK_ROUTES[2]), [
    { start: [0, 7.2], end: [-13, 10.2] },
  ]);
  assert.deepEqual(skyparkCompositionSnapshot(), {
    landmarkIds: ['skyfold-canopy'],
    routeIds: [
      'arrival-court',
      'play-lozenges',
      'creator-terrace',
      'echo-commons',
      'flow-steps',
    ],
    primaryRouteId: 'play-lozenges',
    validationIssues: [],
  });
});

test('Skypark composition rejects disconnected or duplicated authored content', () => {
  const issues = validateSkyparkComposition({
    routes: [
      { id: 'play-lozenges', name: 'Play Lozenges', purpose: 'First play', primary: true, nodes: [[0, 0], [0, 1]] },
      { id: 'play-lozenges', name: 'Copy', purpose: 'Duplicate', nodes: [[0, 0], [1, 1]] },
    ],
    landmarks: [{
      id: 'lost',
      name: '',
      purpose: '',
      silhouette: '',
      routeId: 'missing',
    }],
  });
  assert.ok(issues.some((issue) => issue.includes('duplicate or missing route id')));
  assert.ok(issues.some((issue) => issue.includes('missing authored intent')));
  assert.ok(issues.some((issue) => issue.includes('has no connected route')));
});

test('visual QA plan covers fixed Hub activities plus desktop/mobile game and UGC evidence', () => {
  assert.deepEqual(CAPTURE_POINTS.map(({ id }) => id), [
    'entry-desktop',
    'entry-mobile',
    'hub-desktop',
    'hub-mobile',
    'hub-landscape-mobile',
    'hub-flow-steps-desktop',
    'hub-skyfold-canopy-desktop',
    'hub-beacon-line-desktop',
    'hub-echo-steps-mobile',
    'tag-runner-desktop',
    'tag-runner-mobile',
    'tag-final-mobile',
    'tag-return-modal-mobile',
    'skyway-desktop',
    'skyway-mobile',
    'skyway-bridge-desktop',
    'skyway-bridge-mobile',
    'skyway-finish-desktop',
    'skyway-finish-mobile',
    'balloon-desktop',
    'balloon-mobile',
    'balloon-late-mobile',
    'show67-intro-desktop',
    'show67-intro-mobile',
    'show67-transition-desktop',
    'show67-ceremony-desktop',
    'show67-podium-mobile',
    'ugc-playback-mobile',
    'ugc-result-mobile',
    'ugc-near-max-retry-mobile',
    'ugc-near-max-result-mobile',
    'ugc-near-max-crowd-lod-mobile',
    'ugc-template-race-playback-desktop',
    'ugc-template-race-playback-mobile',
    'ugc-template-survival-playback-desktop',
    'ugc-template-survival-playback-mobile',
    'ugc-template-score-playback-desktop',
    'ugc-template-score-playback-mobile',
    'creator-templates-desktop',
    'creator-templates-mobile',
  ]);
  const validReport = {
    captures: CAPTURE_POINTS.map(({ id }) => ({
      id,
      scope: CAPTURE_POINTS.find((point) => point.id === id)?.scope,
      errors: [],
      screenshotSha256: 'hash',
      visualEvidence: {
        sampledPixels: 4_000,
        rgbVariance: 4_000,
        quantizedColorCount: 120,
      },
      runtime: {
        status: 'within-guardrails',
        scope: (
          id.startsWith('ugc-') || id.startsWith('creator-')
            ? 'ugc'
            : 'hub'
        ),
        metrics: {
          characters: {
            crowd: id === 'ugc-near-max-crowd-lod-mobile' ? 1 : 0,
          },
        },
      },
      attribution: {
        estimatedDraws: 10,
        groups: id.startsWith('ugc-near-max-')
          ? [
            { group: 'ugc-static', estimatedDraws: 2, instances: 54 },
            { group: 'ugc-animated', estimatedDraws: 4, instances: 80 },
            {
              group: 'characters',
              estimatedDraws: 5,
              triangles: 2_416,
            },
          ]
          : [],
      },
      quality: { tier: 'low', pixelRatio: 1 },
    })),
  };
  assert.equal(validateCaptureReport(validReport).length, 0);
  const blankHubReport = structuredClone(validReport);
  blankHubReport.captures.find(({ id }) => id === 'hub-desktop').visualEvidence = {
    sampledPixels: 4_000,
    rgbVariance: 35,
    quantizedColorCount: 4,
  };
  assert.ok(validateCaptureReport(blankHubReport).some((failure) => (
    failure.includes('hub-desktop: hub screenshot is effectively blank')
  )));
  assert.ok(validateCaptureReport({ captures: [] }).length >= CAPTURE_POINTS.length);
});

test('runtime telemetry warms up, computes percentiles, and reports guardrail breaches', () => {
  assert.deepEqual(RUNTIME_PERF_BUDGETS.ugc, {
    frameP95Ms: 33.3,
    drawCalls: 160,
    triangles: 240_000,
  });
  assert.equal(percentile([30, 10, 20, 40], 0.5), 20);
  let clock = 1000;
  const telemetry = createRuntimePerformanceTelemetry({
    budgets: {
      hub: { frameP95Ms: 25, drawCalls: 10, triangles: 1000 },
      skyway: { frameP95Ms: 30, drawCalls: 8, triangles: 800 },
    },
    warmupFrames: 2,
    minimumSamples: 3,
    maxSamples: 4,
    now: () => clock++,
    meta: { viewport: 'test' },
  });

  telemetry.setScope('hub');
  telemetry.sample({ frameMs: 99, drawCalls: 99, triangles: 99 }); // warmup
  telemetry.sample({ frameMs: 99, drawCalls: 99, triangles: 99 }); // warmup
  telemetry.sample({
    frameMs: 10,
    drawCalls: 8,
    triangles: 900,
    characters: { activeInstances: 2, byLod: { hero: 1, game: 1 } },
  });
  assert.equal(telemetry.snapshot().status, 'warming-up');
  telemetry.sample({ frameMs: 20, drawCalls: 11, triangles: 950 });
  telemetry.sample({ frameMs: 30, drawCalls: 9, triangles: 1100 });

  const snapshot = telemetry.snapshot('unit');
  assert.equal(snapshot.sampleCount, 3);
  assert.equal(snapshot.metrics.frameMs.p50, 20);
  assert.equal(snapshot.metrics.frameMs.p95, 30);
  assert.deepEqual(snapshot.breaches, ['frame-p95', 'draw-calls', 'triangles']);
  assert.equal(snapshot.status, 'over-budget');
  assert.equal(snapshot.metrics.characters.active, 2);
  telemetry.setMeta({ qualityTier: 'low', qualityPixelRatio: 1 });
  assert.equal(telemetry.snapshot().meta.qualityTier, 'low');
  assert.equal(telemetry.snapshot().meta.qualityPixelRatio, 1);
  assert.match(formatRuntimePerformance(snapshot), /not production benchmark/);

  telemetry.setScope('skyway');
  assert.equal(telemetry.currentScope(), 'skyway');
  assert.equal(telemetry.history().at(-1).label, 'scope-change');
});

test('quality preference resolves once from safe capability signals and explicit choices win', () => {
  assert.equal(normalizeQualityPreference('mystery'), 'auto');
  assert.deepEqual(
    resolveQualityTier('auto', {
      viewportWidth: 390,
      devicePixelRatio: 3,
      touch: true,
      hardwareConcurrency: 8,
    }).tier,
    'low',
  );
  assert.equal(resolveQualityTier('auto', {
    viewportWidth: 1440,
    devicePixelRatio: 2,
    touch: false,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  }).tier, 'high');
  assert.equal(resolveQualityTier('auto', {
    viewportWidth: 1440,
    saveData: true,
  }).tier, 'low');
  assert.equal(resolveQualityTier('high', {
    viewportWidth: 390,
    touch: true,
    saveData: true,
  }).tier, 'high');
});

test('quality controller deterministically applies DPR, shadows, and decorative density', () => {
  const renderer = {
    pixelRatio: 0,
    shadowMap: { enabled: true, needsUpdate: false },
    setPixelRatio(value) { this.pixelRatio = value; },
  };
  const scene = new THREE.Scene();
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  const decorative = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial(),
  );
  decorative.userData.qualityMinimum = 'high';
  scene.add(core, decorative);
  const applied = [];
  const controller = createQualityController({
    renderer,
    getScenes: () => [scene],
    capabilities: {
      viewportWidth: 390,
      devicePixelRatio: 3,
      touch: true,
    },
    onApplied: (state) => applied.push(state),
  });

  const low = controller.applyPreference('auto');
  assert.equal(low.tier, 'low');
  assert.equal(renderer.pixelRatio, 1);
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(decorative.visible, false);
  assert.equal(core.visible, true);

  const high = controller.applyPreference('high');
  assert.equal(high.preference, 'high');
  assert.equal(high.tier, 'high');
  assert.equal(renderer.pixelRatio, 1.5);
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(decorative.visible, true);
  assert.equal(applied.length, 2);

  decorative.visible = true;
  assert.deepEqual(applySceneQuality(scene, 'low'), {
    managedObjects: 1,
    visibleObjects: 0,
  });
  assert.equal(decorative.visible, false);
  core.geometry.dispose();
  core.material.dispose();
  decorative.geometry.dispose();
  decorative.material.dispose();
});

test('scene attribution accounts for instances, groups, materials, and hidden objects', () => {
  const scene = new THREE.Scene();
  const environment = new THREE.Group();
  environment.userData.perfGroup = 'environment';
  scene.add(environment);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const instances = new THREE.InstancedMesh(geometry, material, 3);
  environment.add(instances);

  const character = new THREE.Group();
  character.userData.characterInstance = true;
  character.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
  scene.add(character);

  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  hidden.visible = false;
  scene.add(hidden);

  const report = analyzeSceneAttribution(scene, { scope: 'unit' });
  const env = report.groups.find((entry) => entry.group === 'environment');
  const chars = report.groups.find((entry) => entry.group === 'characters');
  assert.equal(env.estimatedDraws, 1);
  assert.equal(env.instances, 3);
  assert.equal(env.triangles, 36);
  assert.equal(chars.triangles, 12);
  assert.equal(report.estimatedDraws, 2);
  assert.equal(report.uniqueMaterials, 1);
  assert.match(formatAttributionSummary(report), /environment 1d/);

  geometry.dispose();
  material.dispose();
  character.children[0].geometry.dispose();
  hidden.geometry.dispose();
});

test('town lobby stays inside the draw budget at both quality tiers', () => {
  const scene = new THREE.Scene();
  const world = buildHubWorld(scene);

  // The lobby is grass, one avenue, its shopfronts and traffic. Nothing else
  // ships, so there is no high-tier-only layer to toggle any more; what the
  // budget has to survive is the street itself.
  applySceneQuality(scene, 'low');
  const low = analyzeSceneAttribution(scene, { scope: 'hub-low' });
  applySceneQuality(scene, 'high');
  const high = analyzeSceneAttribution(scene, { scope: 'hub-high' });

  assert.ok(high.estimatedDraws <= 120);
  assert.ok(low.estimatedDraws <= high.estimatedDraws);

  world.group.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((item) => item.dispose?.());
  });
});

test('town lobby ships the pedestrian city and nothing left over from the old hub', () => {
  const scene = new THREE.Scene();
  const world = buildHubWorld(scene);

  // What the lobby is: the faithful island city from the 2026-08-04 rich
  // reference — street grid with crosswalks and street cars, the framed 67
  // plaza with towers, and every district in its referenced position.
  assert.ok(world.group.getObjectByName('town:ground'));
  assert.ok(world.group.getObjectByName('district:road-grid'));
  assert.ok(world.group.getObjectByName('district:cross-roads')?.isInstancedMesh);
  assert.ok(world.group.getObjectByName('district:crosswalks')?.isInstancedMesh);
  assert.ok(world.group.getObjectByName('district:lane-dashes')?.isInstancedMesh);
  assert.ok(world.group.getObjectByName('district:street-cars')?.isInstancedMesh);
  assert.ok(world.group.getObjectByName('district:marina-boats')?.isInstancedMesh);
  assert.ok(world.group.getObjectByName('district:beach'));
  assert.ok(world.group.getObjectByName('district:lighthouse'));
  assert.ok(world.group.getObjectByName('district:plaza'));
  assert.ok(world.group.getObjectByName('district:plaza-towers')?.isInstancedMesh);
  assert.ok(world.group.getObjectByName('district:skatepark-slab'));
  // The park's carved surfaces, painted lips, ledges and rails each merge
  // into one mesh, so these four names are the whole skatepark.
  assert.ok(world.group.getObjectByName('district:skatepark-basins'));
  assert.ok(world.group.getObjectByName('district:skatepark-coping'));
  assert.ok(world.group.getObjectByName('district:skatepark-props'));
  assert.ok(world.group.getObjectByName('district:skatepark-rails'));
  assert.ok(world.group.getObjectByName('district:basketball-court'));
  assert.ok(world.group.getObjectByName('district:market-pavilion'));
  assert.ok(world.group.getObjectByName('district:pond'));
  assert.ok(world.group.getObjectByName('district:stadium'));
  assert.ok(world.group.getObjectByName('district:ferris-wheel'));
  assert.ok(world.group.getObjectByName('district:sea'));
  assert.ok(world.group.getObjectByName('district:river'));

  // What it is not: nothing from the old town ships on the main map by
  // explicit order — no shop strip, no old avenue, no benches — and every
  // landmark or route prop from the older civic-plaza hub stays gone too.
  for (const removed of [
    'city:avenue-road',
    'city:shop-body',
    'city:pavement',
    'city:kerb',
    'city:plaza',
    'city:fountain',
    'city:bench-seats',
    'city:bench-backs',
    'city:traffic-bodies',
    'city:traffic-wheels',
    'city:lane-dashes',
    'city:crossing',
    'hierarchy:confluence-plaza',
    'hierarchy:arrival-court',
    'landmark:skyfold-canopy',
    'district:beacon-skate-garden',
  ]) {
    assert.equal(world.group.getObjectByName(removed), undefined, removed);
  }

  // The reference plan is a square city, so the reachable area is the square
  // clamp; the analytic terrain covers it, so the clamp always lands the
  // player on a surface — flat inside the plan, rolling only beyond it.
  assert.equal(world.boundsCircle, false);
  assert.ok(typeof world.sampleGround === 'function');
  for (const [x, z] of [[0, 0], [61, 61], [-61, 61], [61, -61], [-61, -61]]) {
    assert.equal(Number.isFinite(world.sampleGround(x, z).y), true, `${x},${z}`);
  }

  world.group.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((item) => item.dispose?.());
  });
});

test('hub destination focus strengthens labels and remains static with reduced motion', () => {
  const idle = destinationFocusVisualState(false, false, 1.25, 0.4);
  const focused = destinationFocusVisualState(true, false, 1.25, 0.4);
  assert.ok(focused.labelScale > idle.labelScale);
  assert.ok(focused.labelOpacity > idle.labelOpacity);
  assert.ok(focused.diamondScale > idle.diamondScale);

  const reducedA = destinationFocusVisualState(true, true, 1, 0.7);
  const reducedB = destinationFocusVisualState(true, true, 9, 0.7);
  assert.deepEqual(reducedA, reducedB);
  assert.equal(reducedA.diamondY, 1.35);
  assert.equal(reducedA.diamondRotationY, 0.7);

  const movingA = destinationFocusVisualState(true, false, 1, 0.7);
  const movingB = destinationFocusVisualState(true, false, 9, 0.7);
  assert.notEqual(movingA.diamondRotationY, movingB.diamondRotationY);
});

test('hub activity definitions are immutable, original authored routes with explicit actions', () => {
  assert.deepEqual(HUB_ACTIVITY_DEFINITIONS.map(({ id }) => id), [
    'skate-line',
    'garden-steps',
  ]);
  assert.ok(HUB_ACTIVITY_DEFINITIONS.every(Object.isFrozen));
  assert.ok(HUB_ACTIVITY_DEFINITIONS.every(({ checkpoints }) => Object.isFrozen(checkpoints)));
  assert.equal(
    HUB_ACTIVITY_DEFINITIONS.find(({ id }) => id === 'garden-steps')
      .checkpoints.filter(({ action }) => action === 'jump').length,
    3,
  );
  assert.throws(() => defineHubActivity({
    id: 'bad',
    title: 'Bad',
    objective: 'Bad route',
    start: { x: 0, z: 0, radius: 2 },
    checkpoints: [{ id: 'x', x: 0, z: 0, radius: 1, action: 'swim' }],
    reward: 1,
  }), /action must be reach or jump/);
});

test('hub activity bests change only after a verified device-local write', () => {
  let bests = { 'skate-line': 12.5 };
  let writesBlocked = false;
  const save = {
    get(key, fallback) {
      assert.equal(key, 'hubActivityBests');
      return bests ?? fallback;
    },
    set(key, value) {
      assert.equal(key, 'hubActivityBests');
      if (writesBlocked) return false;
      bests = value;
      return true;
    },
  };

  assert.deepEqual(commitHubActivityBest(save, 'skate-line', 13), {
    attempted: false,
    committed: true,
    previousBest: 12.5,
    best: 12.5,
  });
  assert.deepEqual(bests, { 'skate-line': 12.5 });

  writesBlocked = true;
  assert.deepEqual(commitHubActivityBest(save, 'skate-line', 10), {
    attempted: true,
    committed: false,
    previousBest: 12.5,
    best: 12.5,
  });
  assert.deepEqual(bests, { 'skate-line': 12.5 });

  writesBlocked = false;
  assert.deepEqual(commitHubActivityBest(save, 'skate-line', 10), {
    attempted: true,
    committed: true,
    previousBest: 12.5,
    best: 10,
  });
  assert.deepEqual(bests, { 'skate-line': 10 });
});

test('hub activity session supports opt-in, ordered progress, jump gates, exit, and timeout', () => {
  const events = [];
  const session = createHubActivitySession(HUB_ACTIVITY_DEFINITIONS, {
    onEvent: (event) => events.push(event.type),
  });
  assert.equal(session.snapshot().status, 'idle');
  assert.equal(session.start('missing'), null);
  session.start('garden-steps');
  assert.equal(session.snapshot().active, true);

  const first = session.snapshot().nextCheckpoint;
  session.step({ position: first, jumpEvent: false }, 0.1);
  assert.equal(session.snapshot().checkpointIndex, 0);
  session.step({ position: first, jumpEvent: true }, 0.1);
  assert.equal(session.snapshot().checkpointIndex, 1);
  assert.equal(session.cancel('unit-exit').reason, 'unit-exit');
  assert.equal(session.snapshot().status, 'cancelled');

  session.start('skate-line');
  for (const checkpoint of session.getDefinition('skate-line').checkpoints) {
    session.step({ position: checkpoint }, 0.25);
  }
  assert.equal(session.snapshot().status, 'completed');
  assert.deepEqual(events.slice(-7), [
    'started',
    'checkpoint',
    'checkpoint',
    'checkpoint',
    'checkpoint',
    'checkpoint',
    'completed',
  ]);

  session.start('skate-line');
  session.step({ position: { x: 99, z: 99 } }, 24);
  assert.equal(session.snapshot().status, 'failed');
  assert.equal(session.snapshot().reason, 'time-limit');
});

test('local session telemetry uses one bounded privacy-safe event envelope', () => {
  let clock = 100;
  const telemetry = createLocalSessionTelemetry({
    maxEvents: 3,
    now: () => clock,
  });
  clock += 12;
  const quality = telemetry.record('quality_tier', {
    preference: 'auto',
    tier: 'low',
    pixelRatio: 1,
    email: 'must-not-survive@example.com',
  });
  assert.deepEqual(quality, {
    schemaVersion: SESSION_EVENT_SCHEMA_VERSION,
    sequence: 1,
    atMs: 12,
    name: 'quality_tier',
    data: { preference: 'auto', tier: 'low', pixelRatio: 1 },
  });
  telemetry.record('destination_enter', {
    destinationId: 'activity-skate-line',
    kind: 'activity',
    target: 'skate-line',
  });
  telemetry.record('hub_activity_start', { activityId: 'skate-line' });
  telemetry.record('hub_activity_exit', {
    activityId: 'skate-line',
    reason: 'player-exit',
  });

  const summary = telemetry.summary();
  assert.equal(summary.totalEventCount, 4);
  assert.equal(summary.retainedEventCount, 3);
  assert.equal(summary.droppedEventCount, 1);
  assert.equal(summary.capacity, 3);
  assert.equal(summary.counts.quality_tier, 1);
  assert.deepEqual(telemetry.events().map(({ sequence }) => sequence), [2, 3, 4]);
  assert.equal(telemetry.record('unknown_event', {}), null);
});

test('local session diagnostic export rejects identity, free-form errors, and invalid semantics', () => {
  const telemetry = createLocalSessionTelemetry({ now: () => 42 });
  assert.equal(telemetry.record('game_start', {
    gameId: 'bad id with spaces',
    name: 'Somebody',
  }), null);
  assert.deepEqual(telemetry.record('game_phase', {
    gameId: 'tag',
    phase: 'final-chase',
    player: 'must-not-survive',
  }).data, { gameId: 'tag', phase: 'final-chase' });
  telemetry.record('recoverable_error', {
    area: 'route-load',
    code: 'load-error',
    routeKind: 'game',
    routeId: 'tag',
    message: 'private stack or URL',
    stack: 'must not be exported',
  });
  telemetry.record('game_result', {
    gameId: 'tag',
    completed: true,
    placement: 2,
    score: 67,
    coins: 12,
    playerName: 'Must Not Survive',
  });
  const exported = telemetry.exportDiagnostic();
  assert.equal(exported.privacy.transmission, 'none');
  assert.equal(exported.privacy.storage, 'memory-only');
  assert.deepEqual(exported.events.find(({ name }) => name === 'recoverable_error').data, {
    area: 'route-load',
    code: 'load-error',
    routeKind: 'game',
    routeId: 'tag',
  });
  const serialized = JSON.stringify(exported);
  for (const prohibited of [
    'private stack',
    'Must Not Survive',
    'playerName',
    'message',
    'stack',
  ]) {
    assert.equal(serialized.includes(prohibited), false);
  }
  assert.deepEqual([...SESSION_EVENT_NAMES].sort(), [...new Set(SESSION_EVENT_NAMES)].sort());
});

test('Switchyard Court preserves two collision-clear chase routes and a reserved role palette', () => {
  assert.equal(TAG_ARENA_IDENTITY.id, 'switchyard-court');
  assert.equal(TAG_ARENA_IDENTITY.landmark, 'Broken Loop Bell');
  assert.equal(TAG_ARENA_OBSTACLES.length, 5);
  assert.equal(TAG_ARENA_ROUTES.length, 2);
  assert.deepEqual(validateTagArenaLayout(), []);
  for (const obstacle of TAG_ARENA_OBSTACLES) {
    const bounds = tagArenaObstacleBounds(obstacle);
    assert.ok(bounds.minX < bounds.maxX);
    assert.ok(bounds.minZ < bounds.maxZ);
    assert.notEqual(obstacle.color, 0xd0775e);
  }
  assert.match(
    validateTagArenaLayout({
      routes: [{ id: 'blocked', points: [[0, 8], [0, 2.5]] }],
    }).join(' '),
    /loses runner clearance/,
  );
});

test('Switchyard Court has one bounded authored arena group and state-reactive landmark', () => {
  const scene = new THREE.Scene();
  const arena = buildTagArena(THREE, { highDetail: false });
  scene.add(arena.root);
  const report = analyzeSceneAttribution(scene, { scope: 'tag' });
  const arenaGroup = report.groups.find(({ group }) => group === 'tag-arena');
  assert.ok(arenaGroup);
  assert.ok(arenaGroup.estimatedDraws <= 28);
  assert.ok(arenaGroup.triangles <= 10_500);
  assert.equal(arena.walkables.length, TAG_ARENA_OBSTACLES.length);
  assert.equal(
    arena.walkables.every((mesh) => (
      mesh.userData.tagObstacleId && mesh.userData.box2
    )),
    true,
  );
  const landmarkBounds = new THREE.Box3().setFromObject(arena.landmark);
  const landmarkSize = landmarkBounds.getSize(new THREE.Vector3());
  assert.ok(landmarkSize.x > 6);
  assert.ok(landmarkSize.y > 5);
  const normalInlay = arena.inlayMaterial.color.getHex();
  arena.setFinalChase(true, 0.5);
  assert.notEqual(arena.inlayMaterial.color.getHex(), normalInlay);
  assert.ok(arena.bell.material.emissiveIntensity > 0.05);
  arena.dispose();
  assert.equal(arena.root.parent, null);
});

test('Tag pacing has one bounded Final Chase and symmetric gradual chase assist', () => {
  const opening = tagPacingState(TAG_RULES.roundSeconds, TAG_RULES.roundSeconds, 0);
  assert.equal(opening.finalChase, false);
  assert.equal(opening.assistActive, false);
  assert.equal(opening.tagRadius, TAG_RULES.baseTagRadius);
  assert.equal(opening.transferLockSeconds, TAG_RULES.baseTransferLockSeconds);

  const final = tagPacingState(
    TAG_RULES.roundSeconds * TAG_RULES.finalChaseRatio,
    TAG_RULES.roundSeconds,
    TAG_RULES.assistStartsAfterSeconds + TAG_RULES.assistRampSeconds,
  );
  assert.equal(final.finalChase, true);
  assert.equal(final.assistActive, true);
  assert.equal(
    final.tagRadius,
    TAG_RULES.baseTagRadius + TAG_RULES.finalRadiusBonus + TAG_RULES.assistRadiusMax,
  );
  assert.equal(final.transferLockSeconds, TAG_RULES.finalTransferLockSeconds);
  assert.ok(final.tagRadius < 2);
});

test('Tag ranks every local participant by the same safe-time and transfer rule', () => {
  const participants = [
    { safeTime: 50, tagsMade: 1 },
    { safeTime: 42, tagsMade: 3 },
    { safeTime: 58, tagsMade: 0 },
  ];
  assert.equal(tagParticipantScore(participants[0]), 58);
  assert.deepEqual(rankTagParticipants(participants), [
    { index: 1, score: 66, safeTime: 42, tagsMade: 3, placement: 1 },
    { index: 0, score: 58, safeTime: 50, tagsMade: 1, placement: 2 },
    { index: 2, score: 58, safeTime: 58, tagsMade: 0, placement: 3 },
  ]);
  assert.match(tagResultCue({
    placement: 3,
    longestItSeconds: 14,
    tagsMade: 1,
  }), /chase assist/i);
});

test('level descriptions validate and freeze reusable widget authoring data', () => {
  const level = defineLevelDescription({
    id: 'widget-contract',
    mode: 'race',
    metadata: { owner: 'unit' },
    widgets: [{
      id: 'pad',
      type: 'static-platform',
      position: { x: 1, y: -0.5, z: 2 },
      size: { x: 4, y: 1, z: 6 },
    }],
  });
  assert.ok(Object.isFrozen(level));
  assert.ok(Object.isFrozen(level.widgets[0].position));
  assert.equal(widgetsByType(level, 'static-platform').length, 1);
  assert.throws(() => defineLevelDescription({
    id: 'duplicate',
    mode: 'race',
    widgets: [
      { ...level.widgets[0] },
      { ...level.widgets[0] },
    ],
  }), /Duplicate level widget id/);
  assert.throws(() => defineLevelDescription({
    id: 'unknown',
    mode: 'race',
    widgets: [{ id: 'mystery', type: 'teleporter' }],
  }), /Unsupported level widget type/);
});

test('platform and sweeper widgets step deterministically without rendering dependencies', () => {
  const moving = defineLevelDescription({
    id: 'moving-widget',
    mode: 'race',
    widgets: [{
      id: 'lift',
      type: 'moving-platform',
      position: { x: 2, y: 1, z: -4 },
      size: { x: 4, y: 1, z: 6 },
      motion: { axis: 'x', distance: 3, period: 4, phase: 0 },
      timing: { on: 3, off: 1, phase: 0 },
    }],
  }).widgets[0];
  const meshPosition = { values: null, set(...values) { this.values = values; } };
  const platform = createPlatformRuntime(moving, { position: meshPosition });
  stepLevelWidget(platform, 1, 1 / 60);
  assert.equal(platform.position.x, 5);
  assert.equal(platform.minX, 3);
  assert.equal(platform.maxX, 7);
  assert.deepEqual(meshPosition.values, [5, 1, -4]);
  assert.equal(platform.active, true);
  stepLevelWidget(platform, 3.5, 1 / 60);
  assert.equal(platform.active, false);

  const sweeperSpec = defineLevelDescription({
    id: 'sweeper-widget',
    mode: 'race',
    widgets: [{
      id: 'bar',
      type: 'sweeper',
      position: { x: 1, y: 0, z: 2 },
      length: 8,
      width: 0.5,
      speed: 2,
      startAngle: 0.25,
    }],
  }).widgets[0];
  const group = { rotation: { y: 0 } };
  const sweeper = createSweeperRuntime(sweeperSpec, group);
  stepLevelWidget(sweeper, 10, 0.5);
  assert.equal(sweeper.angle, 1.25);
  assert.equal(group.rotation.y, 1.25);
});

test('shared checkpoint, fall, goal, ground, and score-zone rules preserve boundary semantics', () => {
  const widgets = [
    { id: 'cp', type: 'checkpoint', trigger: { axis: 'z', direction: 'negative', value: -10 }, spawn: { x: 0, y: 0, z: -11 } },
    { id: 'fall', type: 'fall-hazard', belowY: -6 },
    { id: 'goal', type: 'goal-zone', shape: 'line', axis: 'z', direction: 'negative', value: -20 },
    { id: 'score', type: 'score-zone', shape: 'circle', radius: 1.05 },
  ];
  const level = defineLevelDescription({ id: 'rules', mode: 'race', widgets });
  assert.equal(checkpointTriggered(level.widgets[0], { z: -10.01 }), true);
  assert.equal(checkpointTriggered(level.widgets[0], { z: -10 }), false);
  assert.equal(fallHazardTriggered(level.widgets[1], { y: -6.01 }), true);
  assert.equal(fallHazardTriggered(level.widgets[1], { y: -6 }), false);
  assert.equal(goalZoneTriggered(level.widgets[2], { z: -20.01 }), true);
  assert.equal(scoreZoneOverlap(level.widgets[3], { x: 0, z: 0 }, { x: 1.05, z: 0 }), true);
  assert.equal(scoreZoneOverlap(level.widgets[3], { x: 0, z: 0 }, { x: 1.051, z: 0 }), false);

  const platform = createPlatformRuntime({
    id: 'ground',
    type: 'static-platform',
    position: { x: 0, y: -0.5, z: 0 },
    size: { x: 4, y: 1, z: 4 },
  });
  assert.equal(samplePlatformGround([platform], 0, 0, 2, -100).y, 0);
  assert.equal(samplePlatformGround([platform], 3, 0, 2, -100).y, -100);
});

test('Skyway and Balloon migrate existing mechanics into the shared widget contract', () => {
  assert.equal(SKYWAY_LEVEL_DESCRIPTION.id, 'skyway-sprint-v1');
  assert.equal(widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'static-platform').length, 16);
  assert.equal(widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'checkpoint').length, 4);
  assert.equal(widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'sweeper').length, 3);
  assert.equal(widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'fall-hazard').length, 1);
  assert.equal(widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'goal-zone').length, 1);

  const startPad = createPlatformRuntime(
    widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'static-platform')[0],
  );
  assert.deepEqual(
    { minX: startPad.minX, maxX: startPad.maxX, minZ: startPad.minZ, maxZ: startPad.maxZ, top: startPad.top },
    { minX: -7, maxX: 7, minZ: -6, maxZ: 6, top: 0 },
  );

  const contact = widgetsByType(BALLOON_LEVEL_DESCRIPTION, 'score-zone');
  assert.equal(contact.length, 1);
  assert.equal(contact[0].event, 'balloon-pop');
  assert.equal(contact[0].radius, 1.05);
});

test('Ribbonwind Garden keeps a distinct authored identity and reserved gameplay palette', () => {
  assert.equal(BALLOON_ARENA_HALF, 15);
  assert.equal(BALLOON_ARENA_IDENTITY.id, 'ribbonwind-garden');
  assert.equal(BALLOON_ARENA_IDENTITY.landmark, 'Aeolian Crown');
  assert.deepEqual(validateBalloonArenaIdentity(), []);
  assert.equal(BALLOON_ARENA_IDENTITY.assetLanguage.length, 4);
  assert.equal(
    new Set(Object.values(BALLOON_ROLE_COLORS)).size,
    Object.keys(BALLOON_ROLE_COLORS).length,
  );
  assert.match(
    validateBalloonArenaIdentity({
      colors: { ...BALLOON_ROLE_COLORS, pickup: BALLOON_ROLE_COLORS.balloon },
    }).join(' '),
    /role colors must remain distinct/,
  );
});

test('Ribbonwind Garden is one bounded arena group with a state-readable far landmark', () => {
  const scene = new THREE.Scene();
  const arena = buildBalloonArena(THREE, { highDetail: false });
  scene.add(arena.root);
  const report = analyzeSceneAttribution(scene, { scope: 'balloon' });
  const arenaGroup = report.groups.find(({ group }) => group === 'balloon-arena');
  assert.ok(arenaGroup);
  assert.ok(arenaGroup.estimatedDraws <= 18);
  assert.ok(arenaGroup.triangles <= 5_200);
  assert.equal(arena.cameraColliders.length, 1);

  const landmarkBounds = new THREE.Box3().setFromObject(arena.landmark);
  const landmarkCenter = landmarkBounds.getCenter(new THREE.Vector3());
  assert.ok(landmarkBounds.max.y - landmarkBounds.min.y > 4);
  assert.ok(landmarkBounds.max.x - landmarkBounds.min.x > 7);
  assert.ok(landmarkCenter.z < -19);

  arena.updateFinalGust(true, 1, 1 / 60);
  assert.equal(arena.isFinalGustActive(), true);
  arena.updateFinalGust(false, 2, 1 / 60);
  assert.equal(arena.isFinalGustActive(), false);
  arena.dispose();
  assert.equal(arena.root.parent, null);
});

test('Skyway simulation envelope contains the Petal Relay and Crown Gate route', () => {
  const routeWidgets = [
    ...widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'static-platform'),
    ...widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'checkpoint'),
  ];
  for (const widget of routeWidgets) {
    const z = widget.position?.z ?? widget.spawn?.z;
    assert.ok(
      Math.abs(z) < SKYWAY_WORLD_BOUND,
      `${widget.id} must remain inside the shared player simulation bound`,
    );
  }
  const [goal] = widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'goal-zone');
  assert.ok(Math.abs(goal.value) < SKYWAY_WORLD_BOUND);
  assert.equal(
    SKYWAY_LEVEL_DESCRIPTION.widgets
      .filter((widget) => widget.id.startsWith('relay-petal-'))
      .every((widget) => widget.position.z < -95 && widget.position.z > -125),
    true,
  );
});

test('Skyway production autoplay contract crosses Petal Relay from checkpoint 2 to 3', () => {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    participants: [{
      id: 'player',
      isPlayer: true,
      spawn: { x: 0, z: -93 },
      race: { cp: 2 },
    }],
  });
  const participant = round.participants[0];
  const state = participant.simulation.player;
  const racer = {
    isPlayer: true,
    finished: false,
    wpIndex: SKYWAY_CHECKPOINT_WAYPOINTS[2],
    speedScale: SKYWAY_RUN_SCALE,
  };
  const groundAt = (x, z, fromY) => (
    sampleSkywayCourseGround(course, x, z, fromY)
  );
  const world = {
    groundAt,
    platformNear: (x, z) => isSkywayPlatformNear(course, x, z),
  };
  const env = {
    bounds: SKYWAY_WORLD_BOUND,
    sampleGround(x, z, fromY) {
      const ground = groundAt(x, z, fromY);
      return ground.box
        ? {
            y: ground.y,
            box2: {
              minX: ground.box.minX,
              maxX: ground.box.maxX,
              minZ: ground.box.minZ,
              maxZ: ground.box.maxZ,
            },
          }
        : { y: ground.y, box2: null };
    },
  };
  let falls = 0;
  for (let tick = 0; tick < 60 * 30 && participant.race.cp < 3; tick++) {
    const frame = stepSkywayRound(round, {
      env,
      includeSnapshot: false,
      inputFor() {
        racer.finished = participant.race.finished;
        return skywayAutoplayInput(racer, state, course, world);
      },
    });
    for (const event of frame.events) {
      if (event.type !== 'fall') continue;
      falls++;
      racer.wpIndex = SKYWAY_CHECKPOINT_WAYPOINTS[event.checkpoint];
    }
  }
  assert.equal(participant.race.cp, 3);
  assert.ok(course.raceTime < 30);
  assert.ok(falls <= 1);
});

test('mode quality rules expose a learnable Skyway route and one bounded Balloon escalation', () => {
  const platforms = widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'static-platform');
  const shortcut = platforms.filter((widget) => widget.route === 'shortcut');
  assert.equal(shortcut.length, 4);
  assert.ok(shortcut.every((widget) => widget.color === SKYWAY_PALETTE.gold));
  assert.ok(shortcut.every((widget) => widget.size.x < 2));
  assert.deepEqual(
    SKYWAY_COURSE_BEATS.map(({ role }) => role),
    ['learn', 'escalate', 'payoff'],
  );
  assert.deepEqual(
    SKYWAY_LEVEL_DESCRIPTION.metadata.expectedDurationSeconds,
    [45, 90],
  );
  assert.match(skywayCheckpointCue(2), /jade petals pulse/i);
  assert.match(skywayCheckpointCue(3), /opposing sweepers/i);

  assert.deepEqual(balloonEscalationState(46, 150), {
    active: false,
    threshold: 45,
    dashCooldown: 1.6,
    itemInterval: 3.5,
  });
  assert.deepEqual(balloonEscalationState(45, 150), {
    active: true,
    threshold: 45,
    dashCooldown: 0.95,
    itemInterval: 2,
  });
  assert.equal(balloonEscalationState(1.5, 5).active, true);
  assert.equal(balloonEscalationState(1.51, 5).active, false);
});

test('Skyway finish arch is one co-located geometry batch', () => {
  const geometry = createFinishArchGeometry(THREE);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  assert.ok(bounds.min.x < -3.4);
  assert.ok(bounds.max.x > 3.4);
  assert.ok(bounds.max.y > 8);
  assert.ok(Math.abs((bounds.min.z + bounds.max.z) / 2 + 165.5) < 1e-6);

  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData.perfGroup = 'skyway-course';
  scene.add(mesh);
  const report = analyzeSceneAttribution(scene, { scope: 'skyway' });
  assert.equal(report.estimatedDraws, 1);
  assert.equal(report.groups[0].renderables, 1);
  assert.ok(report.triangles > 100);
  geometry.dispose();
  mesh.material.dispose();

  const shutter = createShutterFinGeometry(THREE, 3.8, 2.5, 0.9);
  shutter.computeBoundingBox();
  assert.ok(shutter.boundingBox.max.y > 2.5);
  assert.ok(shutter.boundingBox.max.z - shutter.boundingBox.min.z > 0.9);
  assert.ok(shutter.getAttribute('position').count > 40);
  shutter.dispose();
});

test('Skyway Crown Loom is one original civic silhouette batch', () => {
  const geometry = createCrownLoomGeometry(THREE);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  assert.ok(bounds.min.x < -8);
  assert.ok(bounds.max.x > 8);
  assert.ok(bounds.min.y >= -0.2);
  assert.ok(bounds.max.y > 15.5);
  assert.ok(bounds.max.z - bounds.min.z < 1);

  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData.perfGroup = 'skyway-landmark';
  scene.add(mesh);
  const report = analyzeSceneAttribution(scene, { scope: 'skyway' });
  assert.equal(report.estimatedDraws, 1);
  assert.equal(report.groups[0].group, 'skyway-landmark');
  assert.equal(report.groups[0].renderables, 1);
  assert.ok(report.triangles > 500);
  geometry.dispose();
  mesh.material.dispose();
});

test('Skyway glaze and lighting treatment is deterministic and restrained', () => {
  const first = createSkywayGlazeData();
  const second = createSkywayGlazeData();
  assert.deepEqual(first, second);
  assert.equal(
    first.length,
    SKYWAY_RENDER_TREATMENT.glazeSize ** 2 * 4,
  );
  const values = [];
  for (let index = 0; index < first.length; index += 4) {
    assert.equal(first[index], first[index + 1]);
    assert.equal(first[index], first[index + 2]);
    assert.equal(first[index + 3], 255);
    values.push(first[index]);
  }
  assert.ok(Math.min(...values) >= 148);
  assert.ok(Math.max(...values) <= 224);
  assert.ok(Math.max(...values) - Math.min(...values) >= 48);
  assert.deepEqual(SKYWAY_RENDER_TREATMENT, {
    glazeSize: 16,
    bumpScale: 0.018,
    fogNear: 82,
    fogFar: 218,
    hemisphereIntensity: 0.88,
    keyIntensity: 2.25,
    fillIntensity: 0.42,
  });
  assert.throws(() => createSkywayGlazeData(2), RangeError);
});

test('Skyway civic presentation keeps a bounded authored composition', () => {
  assert.deepEqual(SKYWAY_CIVIC_COMPOSITION, {
    edgeScale: 1.035,
    edgeDrop: 0.14,
    terraceCount: 12,
    promenadeSegmentCount: 10,
    groveTreeCount: 30,
    skylineTowerCount: 24,
    skylineCrownCount: 6,
    surfaceInlayCount: 10,
    surfaceShoulderCount: 4,
  });
  assert.ok(SKYWAY_CIVIC_COMPOSITION.edgeScale < 1.05);
  assert.ok(SKYWAY_CIVIC_COMPOSITION.skylineTowerCount <= 24);
});

test('Skyway Crown runway omits the portrait-camera-facing wall', () => {
  const geometry = createSkywayOpenRunwayGeometry(THREE, 9, 1, 44.2);
  const normals = geometry.getAttribute('normal');
  for (let index = 0; index < normals.count; index++) {
    assert.ok(normals.getZ(index) < 0.5);
  }
  assert.equal(geometry.getAttribute('position').count, 30);
  assert.ok(Math.abs(geometry.boundingBox.max.z - 22.1) < 1e-5);
  assert.ok(Math.abs(geometry.boundingBox.min.z + 22.1) < 1e-5);
  geometry.dispose();
});

test('Skyway retires passed checkpoint beams before they cross the chase camera', () => {
  assert.equal(checkpointGateVisible('completed', 'racing'), false);
  assert.equal(checkpointGateVisible('next', 'racing'), true);
  assert.equal(checkpointGateVisible('future', 'racing'), true);
  assert.equal(checkpointGateVisible('next', 'finished'), false);
});

test('Skyway valley shades from park green into the shared sky color', () => {
  const geometry = createSkywayValleyGeometry(THREE);
  const colors = geometry.getAttribute('color');
  const samples = new Set();
  for (let index = 0; index < colors.count; index++) {
    samples.add([
      colors.getX(index).toFixed(3),
      colors.getY(index).toFixed(3),
      colors.getZ(index).toFixed(3),
    ].join(','));
  }
  assert.ok(samples.size > 12);
  geometry.dispose();
});

test('Skyway result payload accounts for only the completed replay round', () => {
  const first = createSkywayRoundResult(1, 24.96);
  const replay = createSkywayRoundResult(2, 27.04);

  assert.deepEqual(first, {
    game: 'obstacle',
    gameId: 'obstacle',
    score: 750,
    placement: 1,
    coins: 120,
    time: 24.96,
  });
  assert.equal(replay.coins, 80);
  assert.equal(replay.score, 730);
  assert.notEqual(replay.coins, first.coins + replay.coins);
});

test('Skyway checkpoint gate is a vertical single-draw route signal with static reduced motion', () => {
  const geometry = createCheckpointGateGeometry(THREE);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  assert.ok(bounds.min.x < -2.65);
  assert.ok(bounds.max.x > 2.65);
  assert.ok(bounds.min.y >= -1e-6);
  assert.ok(bounds.max.y > 3.25);
  assert.ok(bounds.max.z < 0.25);

  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData.perfGroup = 'skyway-course';
  scene.add(mesh);
  const report = analyzeSceneAttribution(scene, { scope: 'skyway' });
  assert.equal(report.estimatedDraws, 1);

  const nextA = checkpointGateVisualState(1, 0, 0);
  const nextB = checkpointGateVisualState(1, 0, Math.PI / (2 * 4.2));
  assert.equal(nextA.status, 'next');
  assert.notEqual(nextA.emissiveIntensity, nextB.emissiveIntensity);

  const reducedA = checkpointGateVisualState(1, 0, 0, true);
  const reducedB = checkpointGateVisualState(1, 0, 100, true);
  assert.equal(reducedA.emissiveIntensity, reducedB.emissiveIntensity);
  assert.equal(checkpointGateVisualState(1, 1).status, 'completed');
  assert.equal(checkpointGateVisualState(3, 0).status, 'future');

  geometry.dispose();
  mesh.material.dispose();
});

function productionCharacterManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'mav-candidate',
    name: 'Mav Candidate',
    url: '/characters/mav-candidate.glb',
    activation: 'development',
    releaseApproved: false,
    targetHeight: 1.9,
    forwardAxis: '+z',
    clips: {
      idle: ['Idle'],
      walk: ['Walk'],
      run: ['Run'],
      jump: ['Jump'],
      fall: ['Fall'],
      land: ['Land'],
      celebrate: ['Celebrate'],
    },
    anchors: {
      head: 'Head',
      face: 'Face',
      back: 'Back',
      handLeft: 'Hand_L',
      handRight: 'Hand_R',
    },
    ...overrides,
  };
}

function syntheticRiggedCharacter({ omitClip = null } = {}) {
  const geometry = new THREE.BoxGeometry(1, 2, 0.8);
  const vertexCount = geometry.attributes.position.count;
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4),
  );
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index++) weights[index * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));

  const rootBone = new THREE.Bone();
  rootBone.name = 'Root';
  const namedBones = ['Head', 'Face', 'Back', 'Hand_L', 'Hand_R'].map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    rootBone.add(bone);
    return bone;
  });
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(rootBone);
  mesh.bind(new THREE.Skeleton([rootBone, ...namedBones]));
  const scene = new THREE.Group();
  scene.add(mesh);
  const animations = ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Celebrate']
    .filter((name) => name !== omitClip)
    .map((name) => new THREE.AnimationClip(name, 1, []));
  return { scene, animations };
}

test('production character manifests and activation remain explicitly development-only', () => {
  const manifest = productionCharacterManifest();
  assert.deepEqual(validateProductionCharacterManifest(manifest), []);
  assert.equal(defineProductionCharacterManifest(manifest).clips.walk[0], 'Walk');
  assert.match(
    validateProductionCharacterManifest({
      ...manifest,
      activation: 'public',
      releaseApproved: true,
    }).join(' '),
    /activation.*releaseApproved/,
  );
  assert.equal(allowsDevelopmentCharacterCandidate(manifest.id, ''), false);
  assert.equal(
    allowsDevelopmentCharacterCandidate(
      manifest.id,
      '?dev=1&characterCandidate=mav-candidate',
    ),
    true,
  );
  assert.equal(
    allowsDevelopmentCharacterCandidate(
      manifest.id,
      '?qa=1&characterCandidate=mav-candidate',
    ),
    true,
  );
  assert.equal(
    allowsDevelopmentCharacterCandidate(
      manifest.id,
      '?characterCandidate=mav-candidate',
    ),
    false,
  );
  assert.equal(
    activeDevelopmentCharacterCandidate(
      [manifest],
      '?qa=1&characterCandidate=mav-candidate',
    ),
    manifest,
  );
});

test('production character inspection enforces rig, clip, anchor, and budget acceptance', () => {
  const manifest = productionCharacterManifest();
  const passing = syntheticRiggedCharacter();
  const report = inspectProductionCharacterAsset(passing, manifest, {
    fileBytes: 120_000,
  });
  assert.equal(report.status, 'passed');
  assert.equal(report.canPreview, true);
  assert.equal(report.metrics.skinnedMeshes, 1);
  assert.equal(report.metrics.bones, 6);
  assert.equal(report.anchors.handRight.fallback, false);

  const missingClip = syntheticRiggedCharacter({ omitClip: 'Land' });
  const rejected = inspectProductionCharacterAsset(missingClip, manifest);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.canPreview, true);
  assert.match(rejected.errors.join(' '), /missing mapped land/);

  const overBudget = inspectProductionCharacterAsset(
    syntheticRiggedCharacter(),
    productionCharacterManifest({
      budgets: { maxTriangles: 1 },
    }),
  );
  assert.equal(overBudget.status, 'rejected');
  assert.equal(overBudget.canPreview, true);
  assert.match(overBudget.errors.join(' '), /triangles .* exceeds 1/);

  const unriggedScene = new THREE.Group();
  unriggedScene.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshStandardMaterial(),
  ));
  const unrigged = inspectProductionCharacterAsset(
    { scene: unriggedScene, animations: passing.animations },
    manifest,
  );
  assert.equal(unrigged.status, 'rejected');
  assert.equal(unrigged.canPreview, false);
  assert.match(unrigged.errors.join(' '), /SkinnedMesh.*Bone/);

  disposeCharacterObjectResources(passing.scene);
  disposeCharacterObjectResources(missingClip.scene);
  disposeCharacterObjectResources(unriggedScene);
});

test('Character Acceptance Lab report stays local, compact, and bound to the production inspection', async () => {
  const template = createCharacterManifestTemplate('Mav Final 07.GLB');
  assert.equal(template.id, 'mav-final-07');
  assert.equal(template.url, '/characters/mav-final-07.glb');
  assert.equal(template.activation, 'development');
  assert.equal(template.releaseApproved, false);
  assert.deepEqual(validateProductionCharacterManifest(template), []);

  const manifest = productionCharacterManifest();
  const fixture = syntheticRiggedCharacter();
  const inspection = inspectProductionCharacterAsset(fixture, manifest, {
    fileBytes: 123_456,
  });
  const report = createCharacterAcceptanceReport({
    fileName: 'mav-candidate.glb',
    fileBytes: 123_456,
    manifest,
    inspection,
  });
  assert.equal(report.localOnly, true);
  assert.equal(report.releaseApproved, false);
  assert.equal(report.automatedInspection.status, 'passed');
  assert.equal(report.automatedInspection.clips.walk, 'Walk');
  assert.deepEqual(report.automatedInspection.anchors.handRight, {
    requestedNode: 'Hand_R',
    found: true,
    fallback: false,
  });
  assert.match(report.decision, /NOT APPROVED/);
  assert.ok(report.humanSignoffRequired.includes('identity turntable against approved 2D art'));
  assert.deepEqual(JSON.parse(compactCharacterAcceptanceReport(report)), report);
  await assert.rejects(
    loadProductionCharacterCandidateBytes(manifest, 'not bytes'),
    /ArrayBuffer or typed array/,
  );
  disposeCharacterObjectResources(fixture.scene);
});

test('device playtest reports append bounded human evidence without self-approving', () => {
  let report = createDevicePlaytestSession({
    now: 100,
    sessionId: 'phone-session',
  });
  assert.equal(report.checklist.length, DEVICE_PLAYTEST_CHECKS.length);
  assert.equal(report.summary.untested, DEVICE_PLAYTEST_CHECKS.length);
  assert.equal(report.physicalDeviceTestCompleted, false);
  assert.equal(report.automatedReleaseApproval, false);

  report = appendDevicePlaytestObservation(report, {
    now: 200,
    note: 'Observed on a real phone.',
    evidence: {
      route: { kind: 'game', id: 'obstacle' },
      performance: { frameP95Ms: 24.5, drawCallsCurrent: 52 },
    },
  });
  report = updateDevicePlaytestCheck(report, 'skyway', {
    now: 300,
    status: 'pass',
    note: 'Completed one lap.',
  });
  const exported = exportDevicePlaytestSession(report);
  assert.equal(exported.observations.length, 1);
  assert.equal(exported.observations[0].evidence.route.id, 'obstacle');
  assert.equal(exported.checklist.find(({ id }) => id === 'skyway').status, 'pass');
  assert.equal(exported.summary.pass, 1);
  assert.equal(exported.summary.untested, DEVICE_PLAYTEST_CHECKS.length - 1);
  assert.equal(exported.physicalDeviceTestCompleted, false);
  assert.equal(exported.automatedReleaseApproval, false);
  assert.match(exported.caveat, /does not prove release readiness/i);
  assert.throws(
    () => updateDevicePlaytestCheck(report, 'skyway', { status: 'approved' }),
    /Unsupported device playtest status/,
  );
});

test('production character fitting is deterministic and anchors have named fallbacks', () => {
  const model = new THREE.Group();
  const authored = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 4, 1),
    new THREE.MeshStandardMaterial(),
  );
  mesh.position.set(3, 2, -4);
  authored.add(mesh);
  model.add(authored);
  const fitted = fitProductionCharacter(authored, productionCharacterManifest());
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(fitted.bounds.height - 1.9) < 1e-6);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(center.x) < 1e-6);
  assert.ok(Math.abs(center.z) < 1e-6);

  const head = new THREE.Group();
  head.name = 'Head';
  authored.add(head);
  const anchors = createProductionCharacterAnchors(model, {
    anchors: { head: 'Head' },
  });
  assert.equal(anchors.anchors.head.parent, head);
  assert.equal(anchors.anchors.face.parent, model);
  assert.ok(anchors.usedFallbacks.includes('face'));
  const fallbackWorldPosition = anchors.anchors.face.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(fallbackWorldPosition.y - 1.48) < 1e-6);
  disposeCharacterObjectResources(model);
});

test('production character disposal releases unique geometry, material, and texture resources once', () => {
  const root = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let textureDisposals = 0;
  geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  material.addEventListener('dispose', () => { materialDisposals += 1; });
  texture.addEventListener('dispose', () => { textureDisposals += 1; });
  root.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  assert.deepEqual(disposeCharacterObjectResources(root), {
    geometries: 1,
    materials: 1,
    textures: 1,
  });
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(textureDisposals, 1);
});

test('production candidate adapter preserves the canonical instance seam and QA fallback', async () => {
  const manifest = productionCharacterManifest();
  const events = [];
  let disposed = false;
  const ctx = {
    save: { get(_key, fallback) { return fallback; }, set() {} },
    bus: { emit(event, detail) { events.push({ event, detail }); } },
  };
  const makeCandidate = async () => {
    const model = new THREE.Group();
    const anchors = {};
    for (const name of ['head', 'face', 'back', 'handLeft', 'handRight']) {
      anchors[name] = new THREE.Group();
      model.add(anchors[name]);
    }
    return {
      id: manifest.id,
      name: manifest.name,
      model,
      anchors,
      animator: {
        reset() {},
        update() {},
        signal() { return true; },
        play() { return true; },
      },
      bounds: Object.freeze({ height: 1.9, radius: 0.5, groundOffset: 0 }),
      report: Object.freeze({
        status: 'passed',
        errors: Object.freeze([]),
        warnings: Object.freeze([]),
        metrics: Object.freeze({ bones: 24 }),
        usedFallbackAnchors: Object.freeze([]),
      }),
      dispose() { disposed = true; },
    };
  };
  const characters = createCharacters(ctx, {
    candidateManifests: [manifest],
    candidateSearch: '?qa=1&characterCandidate=mav-candidate',
    loadCandidate: makeCandidate,
  });
  assert.equal(characters.equippedId(), manifest.id);
  const candidate = await characters.createInstance(manifest.id, { lod: 'game' });
  assert.equal(candidate.id, manifest.id);
  assert.equal(candidate.root.userData.developmentCharacterCandidate, true);
  assert.equal(candidate.anchors.root, candidate.root);
  assert.equal(candidate.candidateReport.status, 'passed');
  assert.equal(characters.getStats().activeInstances, 1);
  candidate.dispose();
  assert.equal(disposed, true);
  assert.equal(characters.getStats().activeInstances, 0);
  assert.equal(events.at(-1).event, 'character-candidate-report');

  let publicLoadAttempted = false;
  const publicCharacters = createCharacters(ctx, {
    candidateManifests: [manifest],
    candidateSearch: '',
    loadCandidate: async () => {
      publicLoadAttempted = true;
      throw new Error('public play must not load a development candidate');
    },
  });
  const publicFallback = await publicCharacters.createInstance(manifest.id);
  assert.equal(publicFallback.id, 'qa-runner');
  assert.equal(publicLoadAttempted, false);
  publicFallback.dispose();

  const failedCharacters = createCharacters(ctx, {
    candidateManifests: [manifest],
    candidateSearch: '?dev=1&characterCandidate=mav-candidate',
    loadCandidate: async () => {
      const error = new Error('fixture could not load');
      error.report = {
        status: 'rejected',
        errors: ['fixture could not load'],
      };
      throw error;
    },
  });
  const fallback = await failedCharacters.createInstance(manifest.id);
  assert.equal(fallback.id, 'qa-runner');
  assert.equal(fallback.requestedId, manifest.id);
  assert.equal(fallback.root.userData.characterCandidateFallback, manifest.id);
  assert.equal(fallback.candidateReport.fallback, 'qa-runner');
  fallback.dispose();
});

test('canonical character instances expose stable anchors, animator, and lifecycle', async () => {
  const ctx = {
    save: {
      get(key, fallback) { return key === 'equipped' ? 'kid' : fallback; },
      set() {},
    },
    bus: { emit() {} },
  };
  const characters = createCharacters(ctx);
  const instance = await characters.createInstance('kid', {
    skinTone: '#e0b28a',
    lod: 'game',
    shadow: 'none',
  });
  assert.equal(instance.id, 'kid');
  assert.equal(characters.getStats().activeInstances, 1);
  assert.equal(characters.getStats().byLod.game, 1);
  assert.equal(instance.lod, 'game');
  assert.equal(instance.root.userData.characterInstance, true);
  assert.deepEqual(
    Object.keys(instance.anchors),
    ['root', 'head', 'face', 'back', 'handLeft', 'handRight'],
  );
  assert.equal(instance.animator.signal('impact'), true);
  assert.equal(instance.animator.play('celebrate'), false);
  instance.animator.update(1 / 60, { speed: 3, grounded: true });

  const scene = new THREE.Scene();
  scene.add(instance.root);
  instance.dispose();
  assert.equal(instance.root.parent, null);
  assert.equal(characters.getStats().activeInstances, 0);
});

test('cosmetics clone per wearer and attach to canonical named anchors', async () => {
  const ctx = {
    save: { get(_key, fallback) { return fallback; }, set() {} },
    bus: { emit() {} },
  };
  const characters = createCharacters(ctx);
  const first = await characters.createInstance('kid', { shadow: 'none' });
  const second = await characters.createInstance('robot', { shadow: 'none' });
  const firstHat = attachCosmetic(first, COSMETICS[0]);
  const secondHat = attachCosmetic(second, COSMETICS[0]);
  assert.equal(firstHat.parent, first.anchors.head);
  assert.equal(secondHat.parent, second.anchors.head);
  assert.notEqual(firstHat.children[0], secondHat.children[0]);
  first.dispose();
  second.dispose();
});

test('Creator templates expose three original bounded objectives through shared widgets', () => {
  assert.deepEqual(UGC_TEMPLATES.map(({ mode }) => mode), [
    'race',
    'survival',
    'score',
  ]);
  assert.equal(new Set(UGC_TEMPLATES.map(({ id }) => id)).size, 3);
  for (const template of UGC_TEMPLATES) {
    assert.equal(template.level.mode, template.mode);
    assert.ok(template.objective.length > 10);
    assert.ok(template.pieces.length >= 5);
    assert.equal(template.pieces.filter(({ t }) => t === 'spawn').length, 1);
    assert.ok(template.tags.includes(template.mode));
    assert.ok(template.tags.every((tag) => UGC_DISCOVERY_TAGS.includes(tag)));
    assert.equal(
      new Set(template.pieces.map(({ gx, gz }) => `${gx},${gz}`)).size,
      template.pieces.length,
    );
    assert.ok(template.pieces.length <= 24);
  }
  assert.equal(
    UGC_TEMPLATES.find(({ mode }) => mode === 'race')
      .pieces.filter(({ t }) => t === 'goal').length,
    1,
  );
  assert.ok(
    UGC_TEMPLATES.find(({ mode }) => mode === 'survival')
      .pieces.filter(({ t }) => t === 'spinner').length >= 2,
  );
  assert.ok(
    UGC_TEMPLATES.find(({ mode }) => mode === 'score')
      .pieces.filter(({ t }) => t === 'score').length >= 3,
  );
  for (const template of UGC_TEMPLATES) {
    const world = createPublishedTemplateLocalWorld(template.id);
    assert.equal(world.id, templateLocalWorldId(template.id));
    assert.equal(world.discovery.templateId, template.id);
    assert.equal(validateLevel(world, { requireValidated: true }).ok, true);
    assert.equal(isLocallyPublished(world), true);
  }
});

test('UGC presentation frames the grid without introducing hidden gameplay collision', () => {
  const scene = new THREE.Scene();
  const presentation = createUgcStage(THREE, scene, {
    mode: 'score',
    plotSize: 16,
    templateId: 'score-circuit',
  });
  assert.equal(scene.children.includes(presentation.group), true);
  assert.equal(presentation.group.name, 'ugc-presentation-stage');
  assert.equal(presentation.group.children.length, 4);
  assert.equal(
    presentation.group.children.every((object) => (
      object.userData.perfGroup === 'ugc-stage'
      && object.userData.box2 === undefined
    )),
    true,
  );
  assert.equal(scene.background.getHex(), ugcModeProfile('score').sky);
  assert.equal(
    presentation.playfieldColor('survival'),
    ugcModeProfile('survival').playfield,
  );
  assert.equal(new Set(Object.values(UGC_ASSET_COLORS)).size, 7);
  presentation.setMode('survival');
  assert.equal(scene.background.getHex(), ugcModeProfile('survival').sky);
  presentation.setTemplate('survival-ring');
  assert.equal(
    presentation.group.getObjectByName('ugc-template-ground-marks').count,
    24,
  );
  presentation.dispose();
  assert.equal(scene.children.includes(presentation.group), false);
});

test('UGC objective validation is mode-specific and local discovery metadata is allowlisted', () => {
  const survival = levelFromEditor({
    id: 'survival',
    name: 'Safe Ring',
    creator: 'Unit',
    gameplayMode: 'survival',
    templateId: 'survival-ring',
    tags: ['survival', 'hazards', 'online', 'survival', 'precision', 'quick'],
    pieces: [
      { t: 'spawn', gx: 8, gz: 8, rot: 0 },
      { t: 'spinner', gx: 4, gz: 4, rot: 0 },
      { t: 'spinner', gx: 11, gz: 11, rot: 0 },
    ],
  });
  assert.equal(validateLevel(survival).ok, true);
  assert.equal(survival.gameplay.mode, 'survival');
  assert.equal(survival.gameplay.durationSeconds, UGC_GAMEPLAY_MODES.survival.durationSeconds);
  assert.deepEqual(survival.discovery.tags, ['survival', 'hazards', 'precision', 'quick']);
  assert.equal(survival.discovery.scope, 'local-device');
  assert.equal(compileLevelForPlay(survival).goal, null);

  const undersuppliedScore = levelFromEditor({
    id: 'score',
    name: 'Two Stars',
    creator: 'Unit',
    gameplayMode: 'score',
    pieces: [
      { t: 'spawn', gx: 8, gz: 8, rot: 0 },
      { t: 'score', gx: 3, gz: 3, rot: 0 },
      { t: 'score', gx: 12, gz: 12, rot: 0 },
    ],
  });
  assert.match(validateLevel(undersuppliedScore).errors[0], /at least three Score Stars/);
  const score = levelFromEditor({
    id: 'score',
    name: 'Three Stars',
    creator: 'Unit',
    gameplayMode: 'score',
    pieces: [
      ...editorPiecesFromLevel(undersuppliedScore).pieces,
      { t: 'score', gx: 3, gz: 12, rot: 0 },
    ],
  });
  assert.equal(validateLevel(score).ok, true);
  assert.equal(score.gameplay.targetScore, 3);
  assert.equal(
    compileLevelForPlay(score).runtimePieces.filter(({ assetId }) => assetId === 'play.score').length,
    3,
  );
});

test('UGC format migrates editor v1 pieces into a bounded canonical level', () => {
  const legacy = {
    id: 'w1',
    name: '  First   Course ',
    author: 'Guest67',
    version: 1,
    pieces: [
      { t: 'spawn', gx: 1, gz: 2, rot: 0 },
      { t: 'block', gx: 3, gz: 4, rot: 0 },
      { t: 'goal', gx: 14, gz: 13, rot: 0 },
      { t: 'unknown', gx: 6, gz: 6, rot: 0 },
      { t: 'ramp', gx: 3, gz: 4, rot: 1 },
    ],
  };
  const { level, pieces } = editorPiecesFromLevel(legacy);
  assert.equal(level.format, '67verse-level');
  assert.equal(level.version, LEVEL_VERSION);
  assert.equal(level.name, 'First Course');
  assert.equal(level.creator, 'Guest67');
  assert.deepEqual(pieces.map((piece) => piece.t), ['spawn', 'block', 'goal']);
  assert.equal(level.publication.state, 'draft');
});

test('near-max UGC QA fixture partitions static batches without absorbing animated pieces', async () => {
  const { partitionUgcStaticPieces } = await import('../src/ugc/discovery.js');
  const world = createNearMaxPublishedLocalWorld();
  const checked = validateLevel(world, { requireValidated: true });
  assert.equal(checked.ok, true);
  assert.equal(checked.level.name, NEAR_MAX_UGC_WORLD_NAME);
  assert.equal(checked.level.name.length, 32);
  assert.equal(checked.level.pieces.length, MAX_LEVEL_PIECES);
  assert.equal(
    checked.level.pieces.filter(({ assetId }) => assetId === 'hazard.spinner').length,
    24,
  );
  assert.equal(
    checked.level.pieces.filter(({ assetId }) => assetId === 'play.bounce').length,
    16,
  );
  assert.equal(isLocallyPublished(checked.level), true);
  const runtimePieces = compileLevelForPlay(checked.level).runtimePieces;
  assert.equal(runtimePieces.length, MAX_LEVEL_PIECES - 2);
  const partitioned = partitionUgcStaticPieces(runtimePieces);
  assert.equal(partitioned.blocks.length, 27);
  assert.equal(partitioned.ramps.length, 27);
  assert.equal(partitioned.dynamic.length, 40);
  assert.equal(
    partitioned.dynamic.filter(({ assetId }) => assetId === 'hazard.spinner').length,
    24,
  );
  assert.equal(
    partitioned.dynamic.filter(({ assetId }) => assetId === 'play.bounce').length,
    16,
  );
  const partitionedPieces = new Set([
    ...partitioned.blocks,
    ...partitioned.ramps,
    ...partitioned.dynamic,
  ]);
  assert.equal(partitionedPieces.size, runtimePieces.length);
  assert.equal(runtimePieces.every((piece) => partitionedPieces.has(piece)), true);
});

test('UGC local publish validation requires a current successful play test', () => {
  const pieces = [
    { t: 'spawn', gx: 1, gz: 8, rot: 0 },
    { t: 'block', gx: 7, gz: 8, rot: 0 },
    { t: 'bounce', gx: 9, gz: 8, rot: 0 },
    { t: 'goal', gx: 14, gz: 8, rot: 0 },
  ];
  const signature = pieceSignature(pieces);
  const draft = levelFromEditor({
    id: 'w2',
    name: 'Bridge Run',
    creator: 'Guest67',
    pieces,
    validatedSignature: signature,
  });
  assert.equal(validateLevel(draft, { requireValidated: true }).ok, true);
  assert.equal(isLocallyPublished(draft), false);

  const published = levelFromEditor({
    id: draft.id,
    name: draft.name,
    creator: 'Different Current Guest',
    pieces,
    previous: draft,
    publicationState: 'local',
    publishedAt: 100,
    validatedSignature: signature,
    validatedAt: 90,
    now: 110,
  });
  assert.equal(isLocallyPublished(published), true);
  assert.equal(published.creator, 'Guest67');
  assert.equal(
    formatLocalCreatorAttribution(published.creator),
    'by Guest67 · local name snapshot',
  );
  assert.equal(
    formatLocalCreatorAttribution('Session Guest', { sessionOnly: true }),
    'by Session Guest · local name snapshot · session-only identity',
  );
  const runtime = compileLevelForPlay(published);
  assert.deepEqual(runtime.spawn, { x: -6.5, z: 0.5 });
  assert.deepEqual(runtime.goal, { x: 6.5, z: 0.5 });
  assert.equal(runtime.runtimePieces[0].assetId, 'block.basic');
  assert.equal(runtime.runtimePieces[1].assetId, 'play.bounce');
  assert.equal(LEVEL_ASSETS['play.bounce'].runtime.launchVelocity, 8.2);

  const edited = { ...published, pieces: [...published.pieces, { assetId: 'ramp.basic', gx: 8, gz: 8, rot: 0 }] };
  assert.equal(validateLevel(edited, { requireValidated: true }).ok, false);
});

test('UGC collection recovery isolates malformed worlds and preserves valid local creations', () => {
  const pieces = [
    { t: 'spawn', gx: 1, gz: 8, rot: 0 },
    { t: 'block', gx: 7, gz: 8, rot: 0 },
    { t: 'goal', gx: 14, gz: 8, rot: 0 },
  ];
  const signature = pieceSignature(pieces);
  const published = levelFromEditor({
    id: 'published',
    name: 'Healthy Published',
    creator: 'Guest67',
    pieces,
    publicationState: 'local',
    publishedAt: 12,
    validatedSignature: signature,
    validatedAt: 11,
    now: 12,
  });
  const olderDuplicate = levelFromEditor({
    id: 'duplicate',
    name: 'Older Draft',
    creator: 'Guest67',
    pieces,
    now: 20,
  });
  const newerDuplicate = levelFromEditor({
    id: 'duplicate',
    name: 'Newer Draft',
    creator: 'Guest67',
    pieces,
    previous: olderDuplicate,
    now: 30,
  });
  const stalePublished = {
    ...published,
    id: 'stale-publish',
    name: 'Keep as Draft',
    publication: { state: 'local', publishedAt: 40 },
    validation: { pieceSignature: 'outdated', passedAt: 39 },
    updatedAt: 40,
  };

  const recovery = recoverLocalWorldCollection([
    null,
    { id: 'broken', name: 'Missing Goal', pieces: [{ t: 'spawn', gx: 1, gz: 1 }] },
    olderDuplicate,
    published,
    'not-a-world',
    newerDuplicate,
    stalePublished,
  ]);
  assert.equal(recovery.recovered, true);
  assert.equal(recovery.state.version, LOCAL_WORLD_COLLECTION_VERSION);
  assert.equal(recovery.state.worlds.length, 3);
  assert.equal(
    recovery.state.worlds.find((world) => world.id === 'published').publication.state,
    'local',
  );
  assert.equal(
    recovery.state.worlds.find((world) => world.id === 'duplicate').name,
    'Newer Draft',
  );
  assert.equal(
    recovery.state.worlds.find((world) => world.id === 'stale-publish').publication.state,
    'draft',
  );

  const values = new Map([
    ['ugcWorlds', [null, published, { id: '', pieces: [] }]],
    ['ugcPlays', { published: 4 }],
    ['ugcLikes', { published: 2 }],
    ['modQueue', [{
      id: 'published-report',
      worldId: 'published',
      worldName: published.name,
      reason: 'Something else',
      reporter: 'Guest67',
      at: '2026-07-27T12:00:00.000Z',
      status: 'open',
    }]],
  ]);
  const save = {
    get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); },
  };
  assert.deepEqual(readLocalWorlds(save).map((world) => world.id), ['published']);
  assert.equal(upsertLocalWorld(save, newerDuplicate)?.id, 'duplicate');
  assert.deepEqual(readLocalWorlds(save).map((world) => world.id), ['published', 'duplicate']);
  assert.equal(removeLocalWorld(save, 'published'), true);
  assert.deepEqual(readLocalWorlds(save).map((world) => world.id), ['duplicate']);
  assert.deepEqual(readLocalCounterMap(save, 'ugcPlays'), {});
  assert.deepEqual(readLocalCounterMap(save, 'ugcLikes'), {});
  assert.equal(readLocalModerationQueue(save)[0].status, 'unavailable');
  assert.equal(removeLocalWorld(save, 'missing'), false);

  const failedValues = new Map([[
    'ugcWorlds',
    { version: LOCAL_WORLD_COLLECTION_VERSION, worlds: [published] },
  ]]);
  const failedSave = {
    get(key, fallback) { return failedValues.has(key) ? failedValues.get(key) : fallback; },
    set() { return false; },
  };
  assert.equal(upsertLocalWorld(failedSave, newerDuplicate), null);
  assert.deepEqual(deleteLocalWorld(failedSave, 'published'), { status: 'write-failed' });
  assert.deepEqual(readLocalWorlds(failedSave).map((world) => world.id), ['published']);
});
