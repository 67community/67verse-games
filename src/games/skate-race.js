// obstacle.js — 67VERSE Skyway Sprint.
//
// An original elevated civic-sculpture course built in three readable beats:
// Ribbon Run teaches the movement line, Shutter Relay escalates timing and
// recovery, and Crown Run pays off with twin sweepers and a landmark finish.
// Player + 4 training echoes race the shared stepPlayer sim; checkpoints catch
// falls/knockouts; first through the crown gate wins.
//
// Contract usage:
//   registerGame({ id:'obstacle', mount })           — self-registration
//   ctx.view.current = { scene, camera }             — full-screen view override
//   ctx.loop.add(fn)                                 — per-frame ticker (stopped on unmount)
//   ctx.input.poll()                                 — shared input
//   ctx.characters.buildMesh / equippedId            — racer visuals
//   low-poly training echoes                        — deterministic bot fallback
//   ctx.save.addCoins(n, why)                        — emits bus 'coins-earned'
//   ctx.goHome({ game, placement, coins })           — emits bus 'game-result'
//   ctx.ui.panel/button/toast/confirm                — HUD-adjacent DOM
//
// Ground is analytic (axis-aligned platform boxes), NOT the hub raycast —
// same env shape { sampleGround(x,z,fromY)->{y,box2|null}, bounds }.

import { registerGame } from '../core/registry.js';
import { loadWorldItems } from '../world-items.js';
import { angleLerp } from '../player.js';
import { SKYWAY_FIXED_DT } from '../core/skyway-simulation.js';
import { cameraRelativeDirection } from '../input.js';
import { createPartySession } from '../core/party-session.js';
import {
  createOrbitState,
  orbitCameraPosition,
  resolveCameraObstruction,
  updateOrbitState,
} from '../core/chase-camera.js';
import { createCloudSea, createSkyDome, SKY_HIGH, SKY_LOW } from '../core/sky.js';
import { widgetsByType } from '../core/level-widgets.js';
import {
  SKYWAY_CHECKPOINT_WIDGETS,
  SKYWAY_COURSE_BEATS,
  SKYWAY_FINISH_Z,
  SKYWAY_LEVEL_DESCRIPTION,
  SKYWAY_PALETTE,
  SKYWAY_WORLD_BOUND,
} from '../core/skyway-level.js';
import {
  createRoomSession,
  createRoomQaState,
  presentRoomRacer,
  reconcileRoomPlayer,
} from '../core/multiplayer.js';
import {
  createSkywayCourseSimulation,
  isSkywayPlatformNear,
  sampleSkywayCourseGround,
} from '../core/skyway-course-simulation.js';
import {
  commitLocalGameReward,
  localGameRewardStat,
} from '../core/game-result.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

if (typeof document !== 'undefined') import('./obstacle.css');

const {
  createSkywayRound,
  resetSkywayRound,
  stepSkywayRound,
} = await import('../core/skyway-round.js');

const FINISH_Z = SKYWAY_FINISH_Z;
export { SKYWAY_COURSE_BEATS, SKYWAY_LEVEL_DESCRIPTION, SKYWAY_WORLD_BOUND };
const BOT_COUNT = 4;
export const SKYWAY_RUN_SCALE = 1.06;
const COINS_BY_PLACE = [120, 80, 55, 40, 30]; // 1st..5th
const BOT_NAMES = ['Echo', 'Miso', 'Pulse', 'Sunny'];
const BOT_ACCENTS = [0xee806e, 0x56b9b1, 0x8b79c9, 0xe8b64a];
const BOT_LANES = [-1.35, -0.45, 0.45, 1.35];
const LANE_WAYPOINTS = new Set([0, 1, 5, 6, 7, 8, 9, 14, 17]);

export const SKYWAY_CIVIC_COMPOSITION = Object.freeze({
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

const CP_TOTAL = SKYWAY_CHECKPOINT_WIDGETS.length - 1; // banked checkpoints beyond start
const CHECKPOINT_LABELS = ['START', 'SHUTTER RELAY', 'PETAL RELAY', 'CROWN RUN'];
const BAR_Y = 0.32;        // bar center height

// Bot waypoints down the course. `wait` = hold position until the blink
// platform under this waypoint is active. The checkpoint map restores route
// progress after the same fall/respawn event a human receives.
export const SKYWAY_AUTOPLAY_WAYPOINTS = Object.freeze([
  { x: 0, z: -8 },                        // 0
  { x: 0, z: -23 },                       // 1
  { x: 0, z: -34 },                       // 2
  { x: 3.4, z: -43 },                     // 3 — read timing sweep
  { x: -3.4, z: -52 },                    // 4
  { x: 0, z: -59 },                       // 5 — cp1 spawn
  { x: 0, z: -68 },                       // 6
  { x: 0, z: -76 },                       // 7
  { x: 0, z: -85 },                       // 8
  { x: 0, z: -93 },                       // 9 — cp2 spawn
  { x: -0.8, z: -99.0, wait: true },      // 10 — relay petal 1
  { x: 0.8, z: -105.4, wait: true },      // 11 — relay petal 2
  { x: -0.8, z: -111.8, wait: true },     // 12 — relay petal 3
  { x: 0.8, z: -118.2, wait: true },      // 13 — relay petal 4
  { x: 0, z: -124 },                      // 14 — cp3 / crown run
  { x: 3.0, z: -139 },                    // 15 — first payoff sweep
  { x: -3.0, z: -155 },                   // 16 — opposing payoff sweep
  { x: 0, z: -167 },                      // 17 — crown gate
].map(Object.freeze));
export const SKYWAY_CHECKPOINT_WAYPOINTS = Object.freeze([0, 5, 9, 14]);

const IDLE_INPUT = { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };

export function skywayAutoplayInput(racer, state, course, world) {
  if (course.phase !== 'racing' || racer.finished) return IDLE_INPUT;
  const waypointIndex = Math.min(
    racer.wpIndex,
    SKYWAY_AUTOPLAY_WAYPOINTS.length - 1,
  );
  const wp = SKYWAY_AUTOPLAY_WAYPOINTS[waypointIndex];
  const lane = racer.isPlayer || !LANE_WAYPOINTS.has(waypointIndex)
    ? 0
    : BOT_LANES[racer.gridSlot] || 0;
  const targetX = wp.x + lane;
  const dx = targetX - state.pos.x;
  const dz = wp.z - state.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.1) {
    if (racer.wpIndex < SKYWAY_AUTOPLAY_WAYPOINTS.length - 1) {
      racer.wpIndex++;
    }
    return IDLE_INPUT;
  }
  if (wp.wait && !world.platformNear(wp.x, wp.z)) return IDLE_INPUT;
  const nx = dx / dist;
  const nz = dz / dist;
  const ahead = world.groundAt(
    state.pos.x + nx * 0.6,
    state.pos.z + nz * 0.6,
    state.pos.y + 1.0,
  );
  const jump = state.grounded && ahead.y < state.pos.y - 0.5;
  return {
    dirX: nx * racer.speedScale,
    dirZ: nz * racer.speedScale,
    moving: true,
    jumpHeld: jump,
    grabPressed: false,
  };
}

function ordinal(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}
function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function createSkywayRoundResult(placement, finishTime) {
  return {
    game: 'obstacle',
    gameId: 'obstacle',
    score: Math.max(0, 1000 - Math.round(finishTime * 10)),
    placement,
    coins: COINS_BY_PLACE[placement - 1] || 20,
    time: finishTime,
  };
}

export function skywayCheckpointCue(checkpoint) {
  return [
    'START - follow the gold enamel line',
    'SHUTTERS - read the moving coral doors',
    'RELAY - jade petals pulse, gold stays on',
    'CROWN RUN - jump the opposing sweepers',
  ][checkpoint] || 'FINISH - cross the arch';
}

export function createFinishArchGeometry(T) {
  const parts = [];
  const compatible = (geometry) => {
    if (!geometry.index) return geometry;
    const result = geometry.toNonIndexed();
    geometry.dispose();
    return result;
  };
  for (const sx of [-3.2, 3.2]) {
    const post = compatible(new T.CylinderGeometry(0.3, 0.42, 4.1, 14));
    post.translate(sx, 2.05, FINISH_Z);
    parts.push(post);
  }
  const crownArc = compatible(new T.TorusGeometry(3.2, 0.32, 8, 36, Math.PI));
  crownArc.translate(0, 4.0, FINISH_Z);
  parts.push(crownArc);
  const crown = compatible(new T.OctahedronGeometry(0.58, 0));
  crown.translate(0, 7.65, FINISH_Z);
  parts.push(crown);
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Skyway finish arch geometry could not be merged.');
  return merged;
}

export function createCrownLoomGeometry(T) {
  const parts = [];
  const compatible = (geometry) => {
    if (!geometry.index) return geometry;
    const result = geometry.toNonIndexed();
    geometry.dispose();
    return result;
  };
  const ribs = [
    [-0.82, 11.5],
    [-0.4, 14],
    [0, 16],
    [0.4, 14],
    [0.82, 11.5],
  ];
  for (const [angle, length] of ribs) {
    const rib = compatible(new RoundedBoxGeometry(0.76, length, 0.72, 2, 0.28));
    rib.translate(0, length / 2, 0);
    rib.rotateZ(angle);
    parts.push(rib);
  }
  const civicBeam = compatible(new RoundedBoxGeometry(18, 0.82, 0.9, 2, 0.3));
  civicBeam.translate(0, 0.42, 0);
  parts.push(civicBeam);
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Crown Loom geometry could not be merged.');
  return merged;
}

export function createShutterFinGeometry(T, width, height, depth) {
  const shape = new T.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height * 0.68);
  shape.lineTo(0, height);
  shape.lineTo(-width / 2, height * 0.68);
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.08,
    bevelThickness: 0.08,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export function createCheckpointGateGeometry(T) {
  const parts = [];
  const compatible = (geometry) => {
    if (!geometry.index) return geometry;
    const result = geometry.toNonIndexed();
    geometry.dispose();
    return result;
  };
  for (const sx of [-2.55, 2.55]) {
    const post = compatible(new T.CylinderGeometry(0.14, 0.2, 3.1, 10));
    post.translate(sx, 1.55, 0);
    parts.push(post);
  }
  const beam = compatible(new RoundedBoxGeometry(5.5, 0.36, 0.36, 2, 0.14));
  beam.translate(0, 3.12, 0);
  parts.push(beam);
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Skyway checkpoint gate geometry could not be merged.');
  return merged;
}

export function createSkywayOpenRunwayGeometry(T, width, height, depth) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const vertices = new Float32Array([
    // Top.
    -x, y, z, x, y, z, x, y, -z,
    -x, y, z, x, y, -z, -x, y, -z,
    // Left side.
    -x, y, z, -x, y, -z, -x, -y, -z,
    -x, y, z, -x, -y, -z, -x, -y, z,
    // Right side.
    x, y, -z, x, y, z, x, -y, z,
    x, y, -z, x, -y, z, x, -y, -z,
    // Far end.
    -x, y, -z, x, y, -z, x, -y, -z,
    -x, y, -z, x, -y, -z, -x, -y, -z,
    // Underside. The near vertical face is intentionally open.
    -x, -y, -z, x, -y, -z, x, -y, z,
    -x, -y, -z, x, -y, z, -x, -y, z,
  ]);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

// Rolling low-poly valley: gentle sine hills in the middle, rising walls at
// the rim, so the course floats over sculpted terrain instead of flat paint.
// Deterministic — gameplay and snapshots depend on stable heights.
export function skywayValleyHeight(x, y, width = 220, depth = 360) {
  const nx = Math.abs(x) / (width * 0.5);
  const nz = Math.abs(y) / (depth * 0.5);
  const distance = Math.min(1, Math.hypot(nx * 0.72, nz));
  const hills =
    Math.sin(x * 0.045) * Math.cos(y * 0.038) * 1.15 +
    Math.sin(x * 0.105 + 2.1) * Math.sin(y * 0.066 + 1.3) * 0.75;
  const rim = distance > 0.55 ? (distance - 0.55) ** 2 * 34 : 0;
  return hills + rim;
}

export function createSkywayValleyGeometry(T, width = 220, depth = 360) {
  const geometry = new T.PlaneGeometry(width, depth, 40, 64);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const grass = new T.Color(SKYWAY_PALETTE.grass);
  const jade = new T.Color(SKYWAY_PALETTE.jade);
  const sky = new T.Color(SKYWAY_PALETTE.sky);
  const color = new T.Color();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    positions.setZ(index, skywayValleyHeight(x, y, width, depth));
    const nx = Math.abs(x) / (width * 0.5);
    const nz = Math.abs(y) / (depth * 0.5);
    const distance = Math.min(1, Math.hypot(nx * 0.72, nz));
    if (distance < 0.52) {
      color.copy(grass).lerp(jade, distance / 0.52 * 0.32);
    } else {
      color.copy(jade).lerp(sky, (distance - 0.52) / 0.48 * 0.9);
    }
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function checkpointGateVisualState(
  checkpointIndex,
  playerCheckpoint,
  time = 0,
  reducedMotion = false,
  target = {},
) {
  const completed = checkpointIndex <= playerCheckpoint;
  const next = checkpointIndex === playerCheckpoint + 1;
  const pulse = next && !reducedMotion ? 0.82 + Math.sin(time * 4.2) * 0.18 : 1;
  target.status = completed ? 'completed' : next ? 'next' : 'future';
  target.color = completed ? SKYWAY_PALETTE.jade : SKYWAY_PALETTE.gold;
  target.opacity = completed ? 0.3 : next ? 0.96 : 0.25;
  target.emissiveIntensity = completed ? 0.08 : next ? 0.9 * pulse : 0.12;
  return target;
}

export function checkpointGateVisible(status, phase) {
  return status !== 'completed' && phase !== 'finished';
}

export function skywayCameraFraming(aspect) {
  const portrait = Math.max(0, Math.min(1, (0.9 - aspect) / 0.4));
  return {
    portrait,
    fov: 55 + portrait * 9,
    chaseDistance: 5.2 + portrait * 2.3,
    chaseHeight: 3.4 + portrait * 1.8,
    lookAhead: 2 + portrait * 4,
    lookHeight: 1.4 + portrait * 0.2,
    relayBiasX: portrait * 0.45,
  };
}

export const SKYWAY_RENDER_TREATMENT = Object.freeze({
  glazeSize: 16,
  bumpScale: 0.018,
  fogNear: 82,
  fogFar: 218,
  hemisphereIntensity: 0.88,
  keyIntensity: 2.25,
  fillIntensity: 0.42,
});

export function createSkywayGlazeData(size = SKYWAY_RENDER_TREATMENT.glazeSize) {
  if (!Number.isInteger(size) || size < 4 || size > 64) {
    throw new RangeError('Skyway glaze size must be an integer from 4 to 64.');
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin(x * 1.73 + y * 0.61) * 12;
      const cross = Math.cos(x * 0.47 - y * 1.29) * 9;
      const grain = ((x * 17 + y * 31 + x * y * 7) % 19) - 9;
      const value = Math.max(148, Math.min(224, Math.round(188 + wave + cross + grain)));
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

registerGame({
  id: 'skate',
  name: 'Skate Race',
  hint: 'Board race to the finish',
  color: 0x5a9c7a,
  mount(ctx, opts = {}) {
    ctx.party ||= createPartySession(ctx);
    const T = ctx.THREE;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    let alive = true;
    document.body.classList.add('skyway-mode');

    // ---------- Scene / camera / lights ----------
    const scene = new T.Scene();
    // Shared 67VERSE atmosphere — see src/core/sky.js.
    scene.background = new T.Color(SKY_HIGH);
    const skyDome = createSkyDome(T);
    skyDome.userData.perfGroup = 'skyway-sky';
    scene.add(skyDome);
    // Fog matches the horizon haze so distant islands dissolve into the sky.
    scene.fog = new T.Fog(
      SKY_LOW,
      SKYWAY_RENDER_TREATMENT.fogNear,
      SKYWAY_RENDER_TREATMENT.fogFar,
    );
    const initialFraming = skywayCameraFraming(innerWidth / innerHeight);
    const camera = new T.PerspectiveCamera(
      initialFraming.fov,
      innerWidth / innerHeight,
      0.1,
      400,
    );

    scene.add(new T.HemisphereLight(
      0xdff3ff,
      0x86776b,
      SKYWAY_RENDER_TREATMENT.hemisphereIntensity,
    ));
    const sun = new T.DirectionalLight(
      0xffefd4,
      SKYWAY_RENDER_TREATMENT.keyIntensity,
    );
    sun.position.set(18, 36, -20);
    sun.target.position.set(0, 0, -48);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    const fill = new T.DirectionalLight(
      0x9ed8f2,
      SKYWAY_RENDER_TREATMENT.fillIntensity,
    );
    fill.position.set(-24, 18, 28);
    fill.target.position.set(0, 1, -92);
    scene.add(fill, fill.target);

    const glazeTexture = new T.DataTexture(
      createSkywayGlazeData(),
      SKYWAY_RENDER_TREATMENT.glazeSize,
      SKYWAY_RENDER_TREATMENT.glazeSize,
      T.RGBAFormat,
      T.UnsignedByteType,
    );
    glazeTexture.name = 'Skyway deterministic ceramic glaze';
    glazeTexture.wrapS = glazeTexture.wrapT = T.RepeatWrapping;
    glazeTexture.repeat.set(5, 5);
    glazeTexture.needsUpdate = true;
    const glazedColors = new Set([
      SKYWAY_PALETTE.ceramic,
      SKYWAY_PALETTE.terracotta,
      SKYWAY_PALETTE.jade,
      SKYWAY_PALETTE.gold,
    ]);
    const vinyl = (color, opts = {}) => {
      const glazed = opts.glaze ?? glazedColors.has(color);
      const settings = { ...opts };
      delete settings.glaze;
      const material = new T.MeshStandardMaterial({
        color,
        roughness: 0.34,
        metalness: 0,
        ...(glazed ? {
          roughnessMap: glazeTexture,
          bumpMap: glazeTexture,
          bumpScale: SKYWAY_RENDER_TREATMENT.bumpScale,
        } : {}),
        ...settings,
      });
      material.name = glazed
        ? `Skyway glaze ${new T.Color(color).getHexString()}`
        : `Skyway matte ${new T.Color(color).getHexString()}`;
      return material;
    };

    // ---------- Cloud sea (visual only; course fall widget handles knockout) ----------
    // The course is a cloud parkour: nothing solid sits under the route, just
    // an ocean of cloud far below. Falling reads as falling out of the sky.
    const cloudSea = createCloudSea(T, {
      layout: 'corridor',
      count: 168,
      startZ: 14,
      length: 210,
      halfWidth: 66,
      y: -17,
      yJitter: 9,
    });
    cloudSea.userData.perfGroup = 'skyway-environment';
    scene.add(cloudSea);

    const matrix = new T.Matrix4();
    const position = new T.Vector3();
    const scale = new T.Vector3();
    const rotation = new T.Quaternion();

    // Sky-lobby course: the valley terraces, promenade fragments, tree groves
    // and the 84-tower civic wall are gone. A cloud parkour has nothing beside
    // the route but sky — authored Meshy islands and props dress it instead.

    // Course-level floating clouds are GONE by request — they kept reading as
    // clutter no matter the shape. The sky stays clean; only the cloud sea far
    // below remains (falling still reads as falling out of the sky).

    // ---------- Pure course state + presentation adapters ----------
    const courseSimulation = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
    const platforms = courseSimulation.platforms;
    const platformWidgets = platforms.map((platform) => platform.spec);
    const platformViews = new Map();
    const toMergeGeometry = (geometry) => {
      if (!geometry.index) return geometry;
      const result = geometry.toNonIndexed();
      geometry.dispose();
      return result;
    };
    function createPlatformGeometry(widget) {
      const shape = widget.presentation?.shape;
      if (widget.id === 'crown-run') {
        return createSkywayOpenRunwayGeometry(
          T,
          widget.size.x,
          widget.size.y,
          widget.size.z,
        );
      }
      if (shape === 'disc' || shape === 'petal' || shape === 'lozenge') {
        const segments = shape === 'disc' ? 40 : shape === 'petal' ? 12 : 4;
        const geometry = new T.CylinderGeometry(1, 1, widget.size.y, segments);
        const inset = shape === 'lozenge' ? 0.72 : 1;
        geometry.scale(widget.size.x * 0.5 * inset, 1, widget.size.z * 0.5 * inset);
        if (shape === 'petal') geometry.rotateY(Math.PI / 4);
        if (shape === 'lozenge') geometry.rotateY(Math.PI / 4);
        return geometry;
      }
      const radius = shape === 'stadium' ? 0.46 : shape === 'ribbon' ? 0.34 : 0.24;
      return new RoundedBoxGeometry(
        widget.size.x,
        widget.size.y,
        widget.size.z,
        3,
        radius,
      );
    }
    for (const platform of platforms) {
      const widget = platform.spec;
      const geo = createPlatformGeometry(widget);
      const mat = widget.timing
        ? vinyl(widget.color, { transparent: true })
        : vinyl(widget.color);
      const mesh = new T.Mesh(geo, mat);
      mesh.userData.perfGroup = 'skyway-course';
      mesh.position.set(widget.position.x, widget.position.y, widget.position.z);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      scene.add(mesh);
      platformViews.set(platform.id, mesh);

      // Earth underbody: a tapered slab hung beneath the bright deck so each
      // piece reads as a solid floating chunk instead of a paper-thin tile.
      // Timed petals stay bare — their fade has to stay legible.
      if (!widget.timing && widget.route !== 'shortcut') {
        const depth = Math.min(2.6, 1.1 + Math.min(widget.size.x, widget.size.z) * 0.09);
        const under = new T.Mesh(
          new T.CylinderGeometry(1, 0.62, depth, 4, 1),
          vinyl(SKYWAY_PALETTE.soil, { roughness: 0.86, glaze: false }),
        );
        under.geometry.rotateY(Math.PI / 4);
        under.geometry.scale(widget.size.x * 0.5 * 1.02, 1, widget.size.z * 0.5 * 1.02);
        under.position.set(
          widget.position.x,
          widget.position.y - widget.size.y / 2 - depth / 2 + 0.06,
          widget.position.z,
        );
        under.userData.perfGroup = 'skyway-course';
        under.receiveShadow = true;
        under.castShadow = false;
        scene.add(under);
      }
    }

    // ---------- Candy race decor: lane dashes, warning chevrons, bubbles ----------
    // White centerline dashes stitch the runway pieces into a toy racetrack.
    const runwayWidgets = platformWidgets.filter((widget) => (
      ['ribbon', 'channel', 'threshold'].includes(widget.presentation?.shape)
    ));
    const dashMatrices = [];
    const dashRotation = new T.Quaternion();
    const dashCrossRotation = new T.Quaternion().setFromEuler(new T.Euler(0, Math.PI / 2, 0));
    for (const widget of runwayWidgets) {
      const { x, y, z } = widget.position;
      const { x: w, y: h, z: d } = widget.size;
      const top = y + h / 2 + 0.035;
      const alongZ = d >= w;
      const count = Math.max(1, Math.floor((alongZ ? d : w) / 3.4));
      for (let index = 0; index < count; index += 1) {
        const t = (index + 0.5) / count - 0.5;
        dashMatrices.push(new T.Matrix4().compose(
          new T.Vector3(alongZ ? x : x + t * w, top, alongZ ? z + t * d : z),
          alongZ ? dashRotation : dashCrossRotation,
          new T.Vector3(1, 1, 1),
        ));
      }
    }
    // Forward chevrons instead of plain dashes: the arrow shape states the
    // run direction on its own, so a player who joins mid-course never has to
    // guess which way the runway goes.
    const laneArrowShape = new T.Shape();
    laneArrowShape.moveTo(0, 1.15);      // tip (points -Z after the flat rotate)
    laneArrowShape.lineTo(0.95, 0.05);
    laneArrowShape.lineTo(0.95, -0.45);
    laneArrowShape.lineTo(0, 0.65);
    laneArrowShape.lineTo(-0.95, -0.45);
    laneArrowShape.lineTo(-0.95, 0.05);
    laneArrowShape.closePath();
    const laneArrowGeometry = new T.ExtrudeGeometry(laneArrowShape, {
      depth: 0.06,
      bevelEnabled: false,
    });
    // Lay flat, tip toward -Z (the direction of travel).
    laneArrowGeometry.rotateX(Math.PI / 2);
    laneArrowGeometry.rotateY(Math.PI);

    const dashes = new T.InstancedMesh(
      laneArrowGeometry,
      vinyl(0xffffff, { roughness: 0.28, glaze: false }),
      dashMatrices.length,
    );
    dashMatrices.forEach((m, index) => dashes.setMatrixAt(index, m));
    dashes.instanceMatrix.needsUpdate = true;
    dashes.userData.perfGroup = 'skyway-course';
    scene.add(dashes);

    // Alternating gold/navy edge ticks warn the runner before the drop.
    const chevronA = [];
    const chevronB = [];
    for (const widget of runwayWidgets) {
      const { x, y, z } = widget.position;
      const { x: w, y: h, z: d } = widget.size;
      const top = y + h / 2 + 0.03;
      const alongZ = d >= w;
      const length = alongZ ? d : w;
      const count = Math.max(2, Math.floor(length / 1.7));
      for (const side of [-1, 1]) {
        for (let index = 0; index < count; index += 1) {
          const t = (index + 0.5) / count - 0.5;
          const position = alongZ
            ? new T.Vector3(x + side * (w / 2 - 0.42), top, z + t * d)
            : new T.Vector3(x + t * w, top, z + side * (d / 2 - 0.42));
          const matrix = new T.Matrix4().compose(
            position,
            alongZ ? dashRotation : dashCrossRotation,
            new T.Vector3(1, 1, 1),
          );
          (index % 2 === 0 ? chevronA : chevronB).push(matrix);
        }
      }
    }
    const chevronGeometry = new T.BoxGeometry(0.5, 0.05, 1.15);
    for (const [matrices, color] of [
      [chevronA, SKYWAY_PALETTE.gold],
      [chevronB, SKYWAY_PALETTE.graphite],
    ]) {
      const ticks = new T.InstancedMesh(
        chevronGeometry,
        vinyl(color, { roughness: 0.3, glaze: false }),
        matrices.length,
      );
      matrices.forEach((m, index) => ticks.setMatrixAt(index, m));
      ticks.instanceMatrix.needsUpdate = true;
      ticks.userData.perfGroup = 'skyway-course';
      scene.add(ticks);
    }

    // Soap bubbles drift over the valley — soft carnival depth, zero hazard.
    const bubbleMaterial = new T.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      roughness: 0.12,
      metalness: 0,
      depthWrite: false,
    });
    const bubbles = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, 2),
      bubbleMaterial,
      16,
    );
    let bubbleSeed = 41;
    const nextBubble = () => {
      bubbleSeed = (bubbleSeed * 16807) % 2147483647;
      return bubbleSeed / 2147483647;
    };
    for (let index = 0; index < bubbles.count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const s = 0.7 + nextBubble() * 1.6;
      bubbles.setMatrixAt(index, new T.Matrix4().compose(
        new T.Vector3(
          side * (15 + nextBubble() * 26),
          2.5 + nextBubble() * 8,
          12 - index * 12.5 - nextBubble() * 6,
        ),
        dashRotation,
        new T.Vector3(s, s, s),
      ));
    }
    bubbles.instanceMatrix.needsUpdate = true;
    bubbles.userData.perfGroup = 'skyway-environment';
    scene.add(bubbles);

    // Each gameplay beat receives one continuous colored ceramic edge batch.
    // The visible lip makes the route read as a constructed object instead of
    // a tan plane, while keeping all analytic collision geometry untouched.
    const edgeColors = {
      learn: SKYWAY_PALETTE.jade,
      escalate: SKYWAY_PALETTE.terracotta,
      payoff: SKYWAY_PALETTE.graphite,
    };
    for (const beat of ['learn', 'escalate', 'payoff']) {
      const parts = platformWidgets
        .filter((widget) => widget.presentation?.beat === beat)
        .map((widget) => {
          const geometry = createPlatformGeometry(widget);
          geometry.scale(
            SKYWAY_CIVIC_COMPOSITION.edgeScale,
            1,
            SKYWAY_CIVIC_COMPOSITION.edgeScale,
          );
          geometry.translate(
            widget.position.x,
            widget.position.y - SKYWAY_CIVIC_COMPOSITION.edgeDrop,
            widget.position.z,
          );
          return toMergeGeometry(geometry);
        });
      const merged = mergeGeometries(parts, false);
      parts.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      const edge = new T.Mesh(
        merged,
        vinyl(edgeColors[beat], {
          roughness: 0.46,
          emissive: edgeColors[beat],
          emissiveIntensity: beat === 'payoff' ? 0.06 : 0.1,
        }),
      );
      edge.name = `Skyway ${beat} ceramic edge`;
      edge.userData.perfGroup = 'skyway-course';
      scene.add(edge);
    }

    // Gold intarsia is sparse and beat-specific: a start seal, the learned
    // center line, shutter lane rails, a relay threshold, and Crown cadence.
    const surfaceInlayParts = [];
    const addInlay = (geometry, x, z) => {
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(x, 0.025, z);
      surfaceInlayParts.push(toMergeGeometry(geometry));
    };
    addInlay(new T.TorusGeometry(1.6, 0.08, 6, 32), 0, 0.4);
    for (const [x, z, width, depth] of [
      [0, -9, 0.18, 6.0],
      [0, -19, 0.18, 5.2],
      [-3.6, -76, 0.14, 25.0],
      [3.6, -76, 0.14, 25.0],
      [0, -94.2, 5.8, 0.16],
      [0, -126, 2.2, 0.16],
      [0, -138, 3.8, 0.16],
      [0, -151, 5.2, 0.16],
      [0, -162.5, 6.8, 0.16],
    ]) {
      addInlay(new RoundedBoxGeometry(width, depth, 0.045, 2, 0.04), x, z);
    }
    const surfaceInlayGeometry = mergeGeometries(surfaceInlayParts, false);
    surfaceInlayParts.forEach((geometry) => geometry.dispose());
    if (surfaceInlayGeometry) {
      const surfaceInlays = new T.Mesh(
        surfaceInlayGeometry,
        vinyl(SKYWAY_PALETTE.gold, {
          emissive: SKYWAY_PALETTE.gold,
          emissiveIntensity: 0.28,
          roughness: 0.3,
        }),
      );
      surfaceInlays.name = 'Skyway civic gold intarsia';
      surfaceInlays.userData.perfGroup = 'skyway-course';
      scene.add(surfaceInlays);
    }
    const shoulderParts = [
      [-3.24, -15, 0.12, 16.5],
      [3.24, -15, 0.12, 16.5],
      [-4.22, -143.3, 0.14, 40.0],
      [4.22, -143.3, 0.14, 40.0],
    ].map(([x, z, width, depth]) => {
      const geometry = new RoundedBoxGeometry(width, depth, 0.04, 2, 0.035);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(x, 0.022, z);
      return toMergeGeometry(geometry);
    });
    const shoulderGeometry = mergeGeometries(shoulderParts, false);
    shoulderParts.forEach((geometry) => geometry.dispose());
    if (shoulderGeometry) {
      const shoulders = new T.Mesh(
        shoulderGeometry,
        vinyl(SKYWAY_PALETTE.jade, {
          emissive: SKYWAY_PALETTE.jade,
          emissiveIntensity: 0.12,
          roughness: 0.4,
        }),
      );
      shoulders.name = 'Skyway civic jade shoulders';
      shoulders.userData.perfGroup = 'skyway-course';
      scene.add(shoulders);
    }
    const timingCourtInlay = new T.Mesh(
      new T.TorusGeometry(7.25, 0.13, 8, 48),
      vinyl(SKYWAY_PALETTE.jade, {
        emissive: SKYWAY_PALETTE.jade,
        emissiveIntensity: 0.12,
        roughness: 0.34,
      }),
    );
    timingCourtInlay.rotation.x = Math.PI / 2;
    timingCourtInlay.position.set(0, 0.08, -46);
    timingCourtInlay.userData.perfGroup = 'skyway-course';
    scene.add(timingCourtInlay);

    for (const side of [-1, 1]) {
      const rail = new T.Mesh(
        new RoundedBoxGeometry(0.28, 0.58, 28, 2, 0.12),
        vinyl(SKYWAY_PALETTE.graphite, { roughness: 0.7 }),
      );
      rail.position.set(side * 4.78, 0.1, -76);
      rail.userData.perfGroup = 'skyway-course';
      scene.add(rail);
    }
    const shortcutWidgets = platformWidgets.filter((widget) => widget.route === 'shortcut');
    const shortcutInlays = new T.InstancedMesh(
      new T.BoxGeometry(0.48, 0.06, 0.48),
      vinyl(SKYWAY_PALETTE.graphite, { roughness: 0.48 }),
      shortcutWidgets.length,
    );
    shortcutInlays.userData.perfGroup = 'skyway-course';
    const shortcutMarker = new T.Object3D();
    shortcutWidgets.forEach((widget, index) => {
      shortcutMarker.position.set(widget.position.x, 0.035, widget.position.z);
      shortcutMarker.rotation.y = Math.PI / 4;
      shortcutMarker.updateMatrix();
      shortcutInlays.setMatrixAt(index, shortcutMarker.matrix);
    });
    shortcutInlays.instanceMatrix.needsUpdate = true;
    scene.add(shortcutInlays);

    // Vertical route gates replace the old flat floor rings. They stay visible
    // above hazards at the chase-camera angle without increasing course draws.
    const checkpointGateGeometry = createCheckpointGateGeometry(T);
    const checkpointWidgets = widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'checkpoint');
    const checkpointGates = checkpointWidgets.slice(1).map((cp, i) => {
      const mat = vinyl(SKYWAY_PALETTE.gold, {
        emissive: SKYWAY_PALETTE.gold,
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.25,
      });
      const gate = new T.Mesh(checkpointGateGeometry, mat);
      const cpIndex = i + 1;
      gate.name = `Skyway checkpoint ${cpIndex} gate`;
      gate.userData.perfGroup = 'skyway-course';
      gate.userData.routeSignal = 'checkpoint';
      gate.position.set(cp.spawn.x, 0, cp.trigger.value);
      gate.castShadow = false;
      scene.add(gate);
      return { gate, mat, cpIndex, visualState: {} };
    });

    // Crown Gate: one graphite landmark batch, one gold halo, and one enamel
    // threshold. It remains readable from the start of the payoff run.
    const archMat = vinyl(SKYWAY_PALETTE.graphite, {
      emissive: SKYWAY_PALETTE.graphite,
      emissiveIntensity: 0.22,
    });
    const finishArch = new T.Mesh(createFinishArchGeometry(T), archMat);
    finishArch.userData.perfGroup = 'skyway-course';
    finishArch.castShadow = true;
    scene.add(finishArch);

    // ---------- Authored Meshy props (async swap over placeholders) ----------
    // The procedural batches below stay visible until the GLB items resolve;
    // each swap keeps one InstancedMesh per prop family, so draw calls and
    // frame cost stay flat. Runs fire-and-forget; `alive` guards unmount.
    loadWorldItems('/assets/items/')
      .then((items) => {
        if (!alive || !items) return;

        const captureMatrices = (instancedMesh) => {
          const out = [];
          const scratch = new T.Matrix4();
          for (let index = 0; index < instancedMesh.count; index += 1) {
            instancedMesh.getMatrixAt(index, scratch);
            out.push(scratch.clone());
          }
          return out;
        };
        const swapInstanced = (placeholders, item, matrices, options = {}) => {
          if (!item?.geometry) return;
          const instanced = new T.InstancedMesh(item.geometry, item.material, matrices.length);
          matrices.forEach((m, index) => instanced.setMatrixAt(index, m));
          instanced.instanceMatrix.needsUpdate = true;
          instanced.castShadow = false;
          instanced.userData.perfGroup = options.perfGroup || 'skyway-environment';
          if (options.qualityMinimum) instanced.userData.qualityMinimum = options.qualityMinimum;
          for (const ph of placeholders) {
            scene.remove(ph);
            ph.geometry?.dispose?.();
          }
          scene.add(instanced);
        };

        // Valley props (groves, civic towers, promenade rails) are gone with
        // the terrain they stood on. The cloud parkour dresses its sky with
        // authored islands, crystals and flags instead — see below.
        // NOTE: the authored cloud.glb swap is intentionally gone — it flattened
        // every cluster into single blobs that read as floating white balls.
        // The procedural puffy cumulus above is the intended look now.

        // ---- Cloud-parkour dressing (authored Meshy props) ----
        // Deterministic placement: every runner sees the same skyline, and the
        // props sit outside the 17-unit gameplay footprint so none of them can
        // be mistaken for a landing surface.
        let dressSeed = 424242;
        const nextDress = () => {
          dressSeed = (dressSeed * 1103515245 + 12345) % 2147483648;
          return dressSeed / 2147483648;
        };

        // Authored deck tiles laid over every static platform. The procedural
        // slab stays as the collision surface but is hidden, so physics and
        // the course layout are untouched — only what the player sees changes.
        // A BoxGeometry deck cannot read as a candy platform however it is lit;
        // this is the one change that fixes the "modelling looks bad" gap.
        if (items.decktile?.geometry) {
          // world-items normalises every authored mesh so its LARGEST axis is
          // 1.0, which leaves the other two under 1. Read the real footprint
          // back off the geometry rather than assuming the authored size —
          // otherwise the tiles never fill their cell and the surface beneath
          // shows through as seams.
          items.decktile.geometry.computeBoundingBox();
          const tileBox = items.decktile.geometry.boundingBox;
          const tileW = Math.max(1e-4, tileBox.max.x - tileBox.min.x);
          const tileD = Math.max(1e-4, tileBox.max.z - tileBox.min.z);
          const tileH = Math.max(1e-4, tileBox.max.y - tileBox.min.y);
          const NOMINAL = 2.0; // target world size of one tile cell

          const tileMatrices = [];
          for (const platform of platforms) {
            const widget = platform.spec;
            if (widget.timing || widget.route === 'shortcut') continue;
            const view = platformViews.get(platform.id);
            if (view) view.visible = false; // collision stays, visual goes
            const cols = Math.max(1, Math.round(widget.size.x / NOMINAL));
            const rows = Math.max(1, Math.round(widget.size.z / NOMINAL));
            const stepX = widget.size.x / cols;
            const stepZ = widget.size.z / rows;
            // 1.03 overlap hides the bevelled edge gap between neighbours.
            const scaleX = (stepX / tileW) * 1.03;
            const scaleZ = (stepZ / tileD) * 1.03;
            // Height is scaled so the tile's top face lands on the deck plane
            // and its body hangs just below — the deck reads as thick without
            // raising the surface the player actually walks on.
            const scaleY = (widget.size.y * 1.6) / tileH;
            for (let cx = 0; cx < cols; cx += 1) {
              for (let cz = 0; cz < rows; cz += 1) {
                const x = widget.position.x - widget.size.x / 2 + (cx + 0.5) * stepX;
                const z = widget.position.z - widget.size.z / 2 + (cz + 0.5) * stepZ;
                // Only 0 or 180 degrees: a 90-degree turn would swap the
                // tile's width and depth and reopen the seams.
                const yaw = ((cx + cz) % 2) * Math.PI;
                tileMatrices.push(new T.Matrix4().compose(
                  new T.Vector3(
                    x,
                    widget.position.y + widget.size.y / 2 - (tileH * scaleY) / 2,
                    z,
                  ),
                  new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)),
                  new T.Vector3(scaleX, scaleY, scaleZ),
                ));
              }
            }
          }
          if (tileMatrices.length) {
            const decks = new T.InstancedMesh(
              items.decktile.geometry, items.decktile.material, tileMatrices.length,
            );
            tileMatrices.forEach((m, i) => decks.setMatrixAt(i, m));
            decks.instanceMatrix.needsUpdate = true;
            decks.castShadow = false;
            decks.receiveShadow = true;
            decks.userData.perfGroup = 'skyway-course';
            scene.add(decks);
          }
        }

        if (items.island?.geometry) {
          // Satellite islands drift beside and below the route, giving the sky
          // depth cues so the drop reads as real height.
          const islandMatrices = [];
          for (let i = 0; i < 22; i += 1) {
            const side = i % 2 === 0 ? -1 : 1;
            const x = side * (34 + nextDress() * 46);
            const z = 16 - i * 8.6 - nextDress() * 6;
            const y = -6 - nextDress() * 13;
            const s = 7 + nextDress() * 12;
            islandMatrices.push(new T.Matrix4().compose(
              new T.Vector3(x, y, z),
              new T.Quaternion().setFromEuler(new T.Euler(0, nextDress() * Math.PI * 2, 0)),
              new T.Vector3(s, s * (0.8 + nextDress() * 0.5), s),
            ));
          }
          const islands = new T.InstancedMesh(
            items.island.geometry, items.island.material, islandMatrices.length,
          );
          islandMatrices.forEach((m, i) => islands.setMatrixAt(i, m));
          islands.instanceMatrix.needsUpdate = true;
          islands.castShadow = false;
          islands.userData.perfGroup = 'skyway-environment';
          scene.add(islands);
        }

        if (items.crystal?.geometry) {
          // Crystals cluster under the deck edges, the reference's signature
          // "this chunk was torn out of the ground" cue.
          const crystalMatrices = [];
          for (const widget of platformWidgets) {
            if (widget.timing || widget.route === 'shortcut') continue;
            for (const side of [-1, 1]) {
              if (nextDress() < 0.45) continue;
              const s = 0.8 + nextDress() * 0.9;
              crystalMatrices.push(new T.Matrix4().compose(
                new T.Vector3(
                  widget.position.x + side * (widget.size.x * 0.5 - 0.3),
                  widget.position.y - 1.1 - nextDress() * 0.7,
                  widget.position.z + (nextDress() - 0.5) * widget.size.z * 0.7,
                ),
                new T.Quaternion().setFromEuler(new T.Euler(
                  (nextDress() - 0.5) * 0.7, nextDress() * Math.PI * 2, (nextDress() - 0.5) * 0.7,
                )),
                new T.Vector3(s, s, s),
              ));
            }
          }
          if (crystalMatrices.length) {
            const crystals = new T.InstancedMesh(
              items.crystal.geometry, items.crystal.material, crystalMatrices.length,
            );
            crystalMatrices.forEach((m, i) => crystals.setMatrixAt(i, m));
            crystals.instanceMatrix.needsUpdate = true;
            crystals.castShadow = false;
            crystals.userData.perfGroup = 'skyway-environment';
            scene.add(crystals);
          }
        }

        if (items.flag?.geometry) {
          // Flags mark each checkpoint spawn: a landmark the runner can aim at
          // and, after a knockout, immediately recognise as where they restart.
          const flagMatrices = [];
          for (const cp of SKYWAY_CHECKPOINT_WIDGETS) {
            if (!cp.spawn || cp.id === 'checkpoint-start') continue;
            for (const side of [-1, 1]) {
              flagMatrices.push(new T.Matrix4().compose(
                new T.Vector3(cp.spawn.x + side * 4.6, -0.05, cp.spawn.z),
                new T.Quaternion(),
                new T.Vector3(2.4, 2.4, 2.4),
              ));
            }
          }
          const flags = new T.InstancedMesh(
            items.flag.geometry, items.flag.material, flagMatrices.length,
          );
          flagMatrices.forEach((m, i) => flags.setMatrixAt(i, m));
          flags.instanceMatrix.needsUpdate = true;
          flags.castShadow = false;
          flags.userData.perfGroup = 'skyway-course';
          scene.add(flags);
        }
        if (items.gate?.geometry) {
          const crownGate = new T.Mesh(items.gate.geometry, items.gate.material);
          crownGate.position.set(0, 0, FINISH_Z);
          crownGate.scale.set(8.2, 8.2, 8.2);
          crownGate.userData.perfGroup = 'skyway-course';
          crownGate.castShadow = true;
          scene.remove(finishArch);
          finishArch.geometry?.dispose?.();
          scene.add(crownGate);
        }
      })
      .catch(() => {});
    const finishHalo = new T.Mesh(
      new T.TorusGeometry(2.28, 0.17, 8, 40),
      vinyl(SKYWAY_PALETTE.gold, {
        emissive: SKYWAY_PALETTE.gold,
        emissiveIntensity: 1.3,
        roughness: 0.3,
      }),
    );
    finishHalo.position.set(0, 3.9, FINISH_Z);
    finishHalo.userData.perfGroup = 'skyway-course';
    scene.add(finishHalo);
    const finishThreshold = new T.Mesh(
      new T.PlaneGeometry(8, 1.4),
      new T.MeshBasicMaterial({
        color: SKYWAY_PALETTE.gold,
        transparent: true,
        opacity: 0.88,
      }),
    );
    finishThreshold.userData.perfGroup = 'skyway-course';
    finishThreshold.rotation.x = -Math.PI / 2;
    finishThreshold.position.set(0, 0.035, FINISH_Z);
    scene.add(finishThreshold);

    // Crown Loom civic landmark: one fan silhouette, one enamel sun, one
    // orbit, and a three-lobe plinth. It sits beyond the goal line, so it
    // builds anticipation without becoming collision or hiding the payoff.
    const crownLoomZ = FINISH_Z - 16;
    const crownLoom = new T.Group();
    crownLoom.name = 'Crown Loom civic landmark';
    crownLoom.userData.perfGroup = 'skyway-landmark';
    const loomRibs = new T.Mesh(
      createCrownLoomGeometry(T),
      vinyl(SKYWAY_PALETTE.graphite, {
        emissive: SKYWAY_PALETTE.graphite,
        emissiveIntensity: 0.18,
        roughness: 0.52,
      }),
    );
    loomRibs.position.set(0, -2, crownLoomZ);
    const loomSun = new T.Mesh(
      new T.CylinderGeometry(3.15, 3.15, 0.62, 36),
      vinyl(SKYWAY_PALETTE.terracotta, {
        emissive: SKYWAY_PALETTE.terracotta,
        emissiveIntensity: 0.28,
        roughness: 0.38,
      }),
    );
    loomSun.rotation.x = Math.PI / 2;
    loomSun.position.set(0, 6.8, crownLoomZ - 0.5);
    const loomOrbit = new T.Mesh(
      new T.TorusGeometry(4.25, 0.24, 10, 52),
      vinyl(SKYWAY_PALETTE.gold, {
        emissive: SKYWAY_PALETTE.gold,
        emissiveIntensity: 1.25,
        roughness: 0.3,
      }),
    );
    loomOrbit.position.set(0, 6.8, crownLoomZ + 0.46);
    const loomPlinth = new T.InstancedMesh(
      new T.CylinderGeometry(1, 1.08, 1, 24),
      vinyl(SKYWAY_PALETTE.ceramic, { roughness: 0.72 }),
      3,
    );
    [
      [-8.2, -1.9, crownLoomZ + 1.4, 5.6, 3.8, 5.0],
      [0, -2.35, crownLoomZ - 0.3, 7.4, 4.7, 6.2],
      [8.2, -1.9, crownLoomZ + 1.4, 5.6, 3.8, 5.0],
    ].forEach(([x, y, z, sx, sy, sz], index) => {
      matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz));
      loomPlinth.setMatrixAt(index, matrix);
    });
    for (const object of [loomRibs, loomSun, loomOrbit, loomPlinth]) {
      object.castShadow = false;
      crownLoom.add(object);
    }
    const crownLight = new T.PointLight(SKYWAY_PALETTE.gold, 4.2, 34, 2);
    crownLight.position.set(0, 7, FINISH_Z - 4);
    crownLoom.add(crownLight);
    scene.add(crownLoom);

    // ---------- Spinner hazards ----------
    const spinners = courseSimulation.sweepers;
    const spinnerViews = new Map();

    // Candy-stripe wrap for the roller hazards: diagonal chevrons drawn once
    // into a small canvas, then repeated along the roller's length. Reads as a
    // spinning barber-pole at speed, which telegraphs the rotation direction.
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 64;
    stripeCanvas.height = 64;
    {
      const ctx2d = stripeCanvas.getContext('2d');
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillRect(0, 0, 64, 64);
      ctx2d.fillStyle = '#f9556f';
      ctx2d.lineWidth = 0;
      // Two diagonal bands per tile so the repeat is seamless.
      for (const offset of [0, 32]) {
        ctx2d.beginPath();
        ctx2d.moveTo(offset, 0);
        ctx2d.lineTo(offset + 16, 0);
        ctx2d.lineTo(offset + 16 - 64, 64);
        ctx2d.lineTo(offset - 64, 64);
        ctx2d.closePath();
        ctx2d.fill();
        ctx2d.beginPath();
        ctx2d.moveTo(offset + 64, 0);
        ctx2d.lineTo(offset + 80, 0);
        ctx2d.lineTo(offset + 16, 64);
        ctx2d.lineTo(offset, 64);
        ctx2d.closePath();
        ctx2d.fill();
      }
    }
    const stripeTexture = new T.CanvasTexture(stripeCanvas);
    stripeTexture.wrapS = T.RepeatWrapping;
    stripeTexture.wrapT = T.RepeatWrapping;
    stripeTexture.colorSpace = T.SRGBColorSpace;
    stripeTexture.anisotropy = 4;

    for (const spinner of spinners) {
      const widget = spinner.spec;
      const group = new T.Group();
      group.userData.perfGroup = 'skyway-hazards';
      group.position.set(widget.position.x, widget.position.y, widget.position.z);

      // Jade machine housing the roller is mounted into.
      const housing = new T.Mesh(
        new RoundedBoxGeometry(2.6, 0.9, 2.6, 3, 0.22),
        vinyl(SKYWAY_PALETTE.jade, { roughness: 0.36 }),
      );
      housing.position.y = 0.1;
      housing.castShadow = true;
      group.add(housing);

      // Chunky hub cap: the pivot the roller visibly turns around.
      const hub = new T.Mesh(
        new T.CylinderGeometry(0.46, 0.52, 0.66, 16),
        vinyl(SKYWAY_PALETTE.terracotta, { roughness: 0.3 }),
      );
      hub.position.y = BAR_Y + 0.42;
      hub.castShadow = true;
      group.add(hub);

      // The roller itself: a fat candy-striped cylinder laid along its length.
      const rollerRadius = Math.max(0.34, widget.width * 0.62);
      const rollerTexture = stripeTexture.clone();
      rollerTexture.needsUpdate = true;
      rollerTexture.repeat.set(Math.max(3, Math.round(widget.length / 1.6)), 1);
      const roller = new T.Mesh(
        new T.CylinderGeometry(rollerRadius, rollerRadius, widget.length, 20, 1),
        new T.MeshStandardMaterial({
          map: rollerTexture,
          roughness: 0.32,
          metalness: 0,
        }),
      );
      roller.rotation.z = Math.PI / 2; // lie along X, the sweep axis
      roller.position.y = BAR_Y;
      roller.castShadow = true;
      group.add(roller);

      // Rounded end caps stop the cylinder reading as a cut tube.
      for (const side of [-1, 1]) {
        const cap = new T.Mesh(
          new T.SphereGeometry(rollerRadius, 14, 10),
          vinyl(SKYWAY_PALETTE.terracotta, { roughness: 0.3 }),
        );
        cap.position.set(side * widget.length * 0.5, BAR_Y, 0);
        cap.castShadow = true;
        group.add(cap);
      }

      scene.add(group);
      spinnerViews.set(spinner.id, group);
    }

    // ---------- Sliding-wall hazards ----------
    const walls = courseSimulation.walls;
    const wallViews = new Map();
    for (const wall of walls) {
      const group = new T.Group();
      group.userData.perfGroup = 'skyway-hazards';
      group.position.set(0, 0, wall.z);
      const fin = new T.Mesh(
        createShutterFinGeometry(T, wall.w, wall.h, wall.d),
        vinyl(SKYWAY_PALETTE.terracotta, { roughness: 0.42 }),
      );
      group.add(fin);
      const medallion = new T.Mesh(
        new T.TorusGeometry(0.32, 0.08, 6, 20),
        vinyl(SKYWAY_PALETTE.gold, {
          emissive: SKYWAY_PALETTE.gold,
          emissiveIntensity: 0.45,
          roughness: 0.32,
        }),
      );
      medallion.position.set(0, wall.h * 0.62, wall.d / 2 + 0.09);
      group.add(medallion);
      scene.add(group);
      wallViews.set(wall.id, group);
    }

    // The course uses material shading but skips environment shadow passes.
    // Only the approved player mesh casts, keeping the mobile draw budget low.
    scene.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });

    // ---------- Analytic ground env (player + bots share it) ----------
    function groundAt(x, z, fromY) {
      return sampleSkywayCourseGround(courseSimulation, x, z, fromY);
    }
    const env = {
      bounds: SKYWAY_WORLD_BOUND,
      sampleGround(x, z, fromY) {
        const g = groundAt(x, z, fromY);
        return g.box
          ? { y: g.y, box2: { minX: g.box.minX, maxX: g.box.maxX, minZ: g.box.minZ, maxZ: g.box.maxZ } }
          : { y: g.y, box2: null };
      },
    };
    const botWorld = {
      groundAt: (x, z, fromY) => groundAt(x, z, fromY),
      platformNear(x, z) {
        return isSkywayPlatformNear(courseSimulation, x, z);
      },
    };

    // ---------- Race state ----------
    let playerPlace = 0;
    let finalTime = 0;
    let playerResult = null;
    let acc = 0;
    const camOrbit = createOrbitState(Math.PI);
    let flashUntil = -1;
    let impactUntil = -1;
    let resultsTimer = 0;
    let resultsPanel = null;
    let modeEl = null;
    let roomStatus = 'echo';
    let roomSession = null;
    let authoritativeFinishPresented = false;
    let authoritativeCourseState = null;
    const remoteRacers = new Map();
    const routeQuery = new URLSearchParams(location.search);
    const autoplay = routeQuery.get('autoplay') === '1';
    const visualQaMode = routeQuery.get('visualQa') === '1';
    const roomQaMode = routeQuery.get('qa') === '1';
    const visualQaAtBridge = visualQaMode && routeQuery.get('visualQaSpot') === 'bridge';
    const visualQaAtFinish = visualQaMode && routeQuery.get('visualQaSpot') === 'finish';
    const visualQaSpawnZ = visualQaAtFinish ? -124 : visualQaAtBridge ? -94 : 3;
    const visualQaCheckpoint = visualQaAtFinish ? 3 : visualQaAtBridge ? 2 : 0;
    let framePad = {
      mx: 0, my: 0, moving: false, jumpHeld: false, grabPressed: false,
      lookYaw: 0, lookPitch: 0, looking: false,
    };

    // ---------- Racers ----------
    const gridX = [-4.8, -2.4, 2.4, 4.8];
    const roundSimulation = createSkywayRound({
      course: courseSimulation,
      countdownTicks: visualQaMode ? null : undefined,
      participants: [
        {
          id: 'player',
          isPlayer: true,
          spawn: { x: 0, z: visualQaSpawnZ },
          resetSpawn: { x: 0, z: 3 },
          race: { cp: visualQaCheckpoint },
        },
        ...gridX.map((x, index) => ({
          id: `bot-${index}`,
          isPlayer: false,
          spawn: { x, z: -1.8 - (index % 2) * 1.8 },
          resetSpawn: { x, z: -1.8 - (index % 2) * 1.2 },
        })),
      ],
    });
    const roundParticipantsById = new Map(
      roundSimulation.participants.map((participant) => [participant.id, participant]),
    );
    function bindParticipantView(view, participant) {
      view.sim = participant.simulation.player;
      for (const key of Object.keys(participant.race)) {
        Object.defineProperty(view, key, {
          configurable: false,
          enumerable: true,
          get: () => participant.race[key],
          set: (value) => { participant.race[key] = value; },
        });
      }
      return view;
    }
    const playerParticipant = roundParticipantsById.get('player');
    const playerSimulation = playerParticipant.simulation;
    const playerSim = playerSimulation.player;
    let playerRig = new T.Group();
    playerRig.userData.perfGroup = 'characters';
    scene.add(playerRig);
    const player = bindParticipantView({
      name: 'You', isPlayer: true, sim: playerSim, rig: playerRig,
      wpIndex: SKYWAY_CHECKPOINT_WAYPOINTS[visualQaCheckpoint],
      bot: null, speedScale: SKYWAY_RUN_SCALE,
    }, playerParticipant);
    const racers = [player];
    const racerViewsById = new Map([['player', player]]);
    let playerCharacter = null;

    ctx.characters.createInstance(ctx.characters.equippedId(), {
      skinTone: ctx.save.settings.skinTone,
      lod: 'hero',
      shadow: 'hero',
    })
      .then((instance) => {
        if (!alive) {
          instance.dispose();
          return;
        }
        scene.remove(playerRig);
        playerCharacter = instance;
        playerRig = instance.root;
        player.rig = playerRig;
        scene.add(playerRig);
        attachBoard(playerRig);
      })
      .catch(() => {});

    // Skate Race twist: every racer stands on a board.
    function attachBoard(group) {
      if (group.userData.hasBoard) return;
      group.userData.hasBoard = true;
      const b = new T.Group();
      const deck = new T.Mesh(
        new T.BoxGeometry(0.46, 0.06, 1.5),
        vinyl(0x21242c, { roughness: 0.5 }),
      );
      deck.position.y = 0.16; b.add(deck);
      for (const tz of [-0.5, 0.5]) for (const wx of [-0.17, 0.17]) {
        const w = new T.Mesh(
          new T.CylinderGeometry(0.08, 0.08, 0.06, 10),
          vinyl(0xf2f2ee, { roughness: 0.35 }),
        );
        w.rotation.z = Math.PI / 2; w.position.set(wx, 0.08, tz); b.add(w);
      }
      b.userData.rivalAccent = true;
      group.add(b);
    }

    function addRacerAccent(group, color) {
      const ring = new T.Mesh(
        new T.TorusGeometry(0.46, 0.055, 8, 24),
        vinyl(color, { emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      ring.userData.rivalAccent = true;
      group.add(ring);
      return ring;
    }

    function buildTrainingEcho(color) {
      const group = new T.Group();
      group.userData.perfGroup = 'characters';
      const spirit = new T.Group();
      const shellParts = [];
      const shell = new T.OctahedronGeometry(0.56, 1);
      shell.scale(0.86, 1.28, 0.72);
      shell.translate(0, 1.02, 0);
      shellParts.push(toMergeGeometry(shell));
      const orbit = new T.TorusGeometry(0.66, 0.055, 6, 20);
      orbit.rotateX(Math.PI / 2);
      orbit.translate(0, 1.02, 0);
      shellParts.push(toMergeGeometry(orbit));
      const crest = new T.ConeGeometry(0.22, 0.48, 4);
      crest.translate(0, 1.78, 0);
      shellParts.push(toMergeGeometry(crest));
      const shellGeometry = mergeGeometries(shellParts, false);
      shellParts.forEach((geometry) => geometry.dispose());
      const echoShell = new T.Mesh(
        shellGeometry,
        vinyl(color, {
          emissive: color,
          emissiveIntensity: 0.22,
          opacity: 0.82,
          roughness: 0.3,
          transparent: true,
        }),
      );
      echoShell.castShadow = false;
      spirit.add(echoShell);

      const core = new T.Mesh(
        new T.OctahedronGeometry(0.2, 1),
        vinyl(SKYWAY_PALETTE.ceramic, {
          emissive: SKYWAY_PALETTE.gold,
          emissiveIntensity: 0.28,
          roughness: 0.38,
        }),
      );
      core.position.y = 1.02;
      spirit.add(core);
      group.add(spirit);
      group.userData.echoSpirit = spirit;
      addRacerAccent(group, color);
      attachBoard(group);
      // Upgrade the translucent spirit to a REAL 3D rider once the mesh is in.
      ctx.characters.buildMesh('kid', { skinTone: ctx.save.settings.skinTone })
        .then((mesh) => {
          if (!alive) return;
          spirit.visible = false;
          mesh.userData.rivalAccent = true;
          group.add(mesh);
        })
        .catch(() => {});
      return group;
    }

    function syncRemoteSnapshot(snapshot) {
      authoritativeCourseState = snapshot.course;
      const present = new Set();
      for (const remote of snapshot.players) {
        if (!remote) continue;
        if (remote.id === roomSession?.playerId) {
          const outcome = reconcileRoomPlayer(
            remote,
            playerSim,
            playerParticipant.race,
          );
          if (outcome.fell) {
            hudFlash('↩️ Authority returned you to checkpoint');
            impactFeedback();
          }
          if (outcome.finished && !authoritativeFinishPresented) {
            authoritativeFinishPresented = true;
            onPlayerFinish(remote.place, remote.finishTime);
          }
          continue;
        }
        if (![remote.x, remote.y, remote.z, remote.yaw].every(Number.isFinite)) continue;
        present.add(remote.id);
        let racer = remoteRacers.get(remote.id);
        if (!racer) {
          racer = {
            group: null,
            target: new T.Vector3(remote.x, remote.y, remote.z),
            yaw: remote.yaw,
            checkpoint: remote.checkpoint,
            finished: remote.finished,
            place: remote.place,
            finishTime: remote.finishTime,
            pending: true,
          };
          remoteRacers.set(remote.id, racer);
          ctx.characters.buildMesh('kid', { skinTone: ctx.save.settings.skinTone })
            .then((group) => {
              if (!alive || !remoteRacers.has(remote.id)) return;
              addRacerAccent(group, BOT_ACCENTS[remoteRacers.size % BOT_ACCENTS.length]);
              attachBoard(group);
              group.position.copy(racer.target);
              group.rotation.y = racer.yaw;
              scene.add(group);
              racer.group = group;
              racer.pending = false;
              presentRoomRacer(racer, BOT_ACCENTS, SKYWAY_PALETTE.gold);
            })
            .catch(() => remoteRacers.delete(remote.id));
        }
        racer.target.set(remote.x, remote.y, remote.z);
        racer.yaw = remote.yaw;
        racer.checkpoint = remote.checkpoint;
        racer.finished = remote.finished;
        racer.place = remote.place;
        racer.finishTime = remote.finishTime;
        presentRoomRacer(racer, BOT_ACCENTS, SKYWAY_PALETTE.gold);
      }
      for (const [id, racer] of remoteRacers) {
        if (present.has(id)) continue;
        if (racer.group) {
          racer.group.traverse((o) => {
            if (!o.userData.rivalAccent) return;
            o.geometry?.dispose();
            o.material?.dispose();
          });
          scene.remove(racer.group);
        }
        remoteRacers.delete(id);
      }
      if (roomQaMode) {
        window.__67VERSE_SKYWAY_ROOM_QA__ = createRoomQaState(
          roomStatus,
          roomSession?.playerId,
          remoteRacers,
          authoritativeCourseState,
        );
      }
    }

    roomSession = createRoomSession({
      profile: ctx.save.profile,
      onStatus(next) {
        roomStatus = next;
        if (modeEl) modeEl.textContent =
          next === 'local' ? 'LOCAL DEV ROOM' : next === 'connecting' ? 'CHECKING LOCAL ROOM' : 'ECHO TRIAL';
        if (roomQaMode && window.__67VERSE_SKYWAY_ROOM_QA__) {
          window.__67VERSE_SKYWAY_ROOM_QA__.status = next;
        }
      },
      onSnapshot: syncRemoteSnapshot,
    });

    function botBehavior(racer) {
      return (bot, dt, world) => skywayAutoplayInput(
        racer,
        bot.state,
        courseSimulation,
        world,
      );
    }

    // Training echoes are authored as a compact three-draw fallback character.
    // Remote humans still use the approved Ghost asset.
    for (let i = 0; i < BOT_COUNT; i++) {
      const participant = roundParticipantsById.get(`bot-${i}`);
      const simulation = participant.simulation;
      const state = simulation.player;
      const { x, z } = state.pos;
      const group = buildTrainingEcho(BOT_ACCENTS[i]);
      group.position.set(x, 0, z);
      group.rotation.y = Math.PI;
      scene.add(group);
      let behavior = null;
      const bot = {
        state, simulation,
        group,
        input: { ...IDLE_INPUT },
        decide(dt, world) {
          const next = behavior?.(bot, dt, world);
          Object.assign(bot.input, next || IDLE_INPUT);
          return bot.input;
        },
        dispose() { scene.remove(group); },
      };
      const racer = bindParticipantView({
        name: BOT_NAMES[i], isPlayer: false, sim: state, rig: group,
        wpIndex: 0, bot, gridSlot: i,
        sharedAsset: false,
        speedScale: [0.9, 0.95, 0.88, 0.93][i],
      }, participant);
      behavior = botBehavior(racer);
      racers.push(racer);
      racerViewsById.set(participant.id, racer);
    }
    const playerAutoBehavior = botBehavior(player);

    // ---------- Pure round stream -> local presentation side effects ----------
    function applyRoundFrame(frame) {
      for (const applied of frame.inputs) {
        const participant = roundParticipantsById.get(applied.id);
        const racer = racerViewsById.get(participant.id);
        if (!racer.isPlayer) {
          racer.rig.position.set(
            applied.locomotionPose.x,
            applied.locomotionPose.y,
            applied.locomotionPose.z,
          );
          racer.rig.rotation.y = applied.locomotionPose.yaw;
          const spirit = racer.rig.userData.echoSpirit;
          if (spirit) {
            spirit.position.y = 0.06 + Math.sin(
              courseSimulation.time * 3.4 + racer.gridSlot * 1.3,
            ) * 0.07;
            spirit.rotation.y = courseSimulation.time * 0.55 + racer.gridSlot;
          }
        } else if (!autoplay && applied.accepted) {
          roomSession?.sendInput({
            mx: applied.input.dirX,
            my: applied.input.dirZ,
            jump: applied.input.jumpHeld,
            grab: applied.input.grabPressed,
          });
        }
      }
      for (const event of frame.events) {
        if (event.type === 'countdown') {
          flashEl.textContent = String(event.number);
          flashEl.style.opacity = '1';
          ctx.bus.emit('sfx', 'countdown');
          continue;
        }
        if (event.type === 'round-start') {
          hudFlash('GO! 🏁', 0.8);
          ctx.bus.emit('sfx', 'go');
          if (ctx.input.isTouchDevice) {
            objectiveCard.close();
            setGuideHidden(false);
          }
          continue;
        }
        const racer = racerViewsById.get(event.participantId);
        if (event.type === 'jump' && racer.isPlayer) {
          playerCharacter?.animator.signal('jump');
        } else if (event.type === 'land' && racer.isPlayer) {
          playerCharacter?.animator.signal('land');
        } else if (event.type === 'impact' && racer.isPlayer) {
          hudFlash('💫 Knocked!');
          impactFeedback();
          playerCharacter?.animator.signal('impact');
        } else if (event.type === 'shortcut' && racer.isPlayer) {
          hudFlash('⚡ GOLD LINE - shortcut active', 1.25);
        } else if (event.type === 'checkpoint' && racer.isPlayer) {
          hudFlash(`✅ ${skywayCheckpointCue(event.checkpoint)}`, 1.35);
          ctx.ui.toast(`Checkpoint ${event.checkpoint}/${CP_TOTAL}`);
          ctx.bus.emit('sfx', 'checkpoint');
        } else if (event.type === 'fall') {
          if (racer.isPlayer) {
            hudFlash('↩️ Back to checkpoint');
            impactFeedback();
            playerCharacter?.animator.signal('land');
          } else {
            racer.wpIndex = SKYWAY_CHECKPOINT_WAYPOINTS[event.checkpoint];
          }
        } else if (event.type === 'finish' && racer.isPlayer && roomStatus !== 'local') {
          onPlayerFinish();
        }
      }
    }

    function onPlayerFinish(
      placement = player.place,
      finishTime = courseSimulation.raceTime,
    ) {
      playerPlace = placement;
      finalTime = finishTime;
      playerResult = commitLocalGameReward(
        ctx.save,
        createSkywayRoundResult(playerPlace, finalTime),
        `Skyway Sprint — ${ordinal(playerPlace)} place`,
      );
      if (!playerResult.rewardCommitted) {
        ctx.ui.toast('Coins could not be saved on this device. Quest and Season progress were not advanced.');
      }
      hudFlash(`🏁 ${ordinal(playerPlace)} place!`);
      ctx.bus.emit('sfx', 'finish');
      playerCharacter?.animator.play('celebrate');
      hud.classList.add('is-celebrating');
      resultsTimer = setTimeout(showResults, 1100);
    }

    // ---------- Fixed step ----------
    function fixedStep(dt) {
      const frame = stepSkywayRound(roundSimulation, {
        env,
        includeSnapshot: false,
        inputFor(participant) {
          const racer = racerViewsById.get(participant.id);
          if (!racer.isPlayer) return racer.bot.decide(dt, botWorld);
          if (autoplay) return playerAutoBehavior({ state: playerSim }, dt, botWorld);
          const pad = framePad;
          const direction = cameraRelativeDirection(pad, camOrbit.yaw);
          return {
            dirX: direction.x * player.speedScale,
            dirZ: direction.z * player.speedScale,
            moving: direction.moving,
            jumpHeld: pad.jumpHeld,
            sprintHeld: pad.sprintHeld,
            grabPressed: pad.grabPressed,
          };
        },
      });
      applyRoundFrame(frame);
    }

    // ---------- HUD ----------
    const hud = document.createElement('div');
    hud.className = 'sw-hud';
    hud.setAttribute('role', 'group');
    hud.setAttribute('aria-label', 'Skyway Sprint race status');
    hud.innerHTML = `
      <div class="sw-impact" aria-hidden="true"></div>
      <div class="sw-celebration" aria-hidden="true">${
        [
          ['4%', '#0A84FF', -18, '0s'], ['10%', '#56b9b1', 24, '.08s'],
          ['17%', '#9a9aa2', -12, '.18s'], ['24%', '#8b79c9', 20, '.03s'],
          ['31%', '#ffffff', -28, '.15s'], ['38%', '#0A84FF', 16, '.22s'],
          ['46%', '#56b9b1', -18, '.06s'], ['54%', '#9a9aa2', 22, '.16s'],
          ['61%', '#8b79c9', -24, '.01s'], ['68%', '#ffffff', 14, '.21s'],
          ['75%', '#0A84FF', -20, '.11s'], ['82%', '#56b9b1', 25, '.19s'],
          ['89%', '#9a9aa2', -14, '.04s'], ['96%', '#8b79c9', 18, '.13s'],
        ].map(([x, color, drift, delay]) =>
          `<i class="sw-confetti" style="--x:${x};--c:${color};--drift:${drift};--delay:${delay}"></i>`
        ).join('')
      }</div>
      <div class="sw-position" data-h="pos">
        <div class="sw-rank" data-h="rank">–</div>
        <div class="sw-checkpoint" data-h="cp">Checkpoint 0/${CP_TOTAL}</div>
        <div class="sw-next" data-h="next">NEXT · ${CHECKPOINT_LABELS[1]}</div>
        <div class="sw-progress" role="progressbar" aria-label="Course progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="sw-progress-fill" data-h="progress"></div>
        </div>
      </div>
      <div class="sw-time" data-h="time">0:00.0</div>
      <div class="sw-mode" data-h="mode">ECHO TRIAL</div>
      <div class="sw-flash" data-h="flash" aria-live="assertive"></div>
      <div class="sw-guide" data-h="guide">${
        ctx.input.isTouchDevice
          ? 'Steer left · JUMP petal gaps · gold lozenges stay on'
          : 'WASD / arrows to run · Space to jump · gold lozenges stay on'
      }</div>`;
    document.body.appendChild(hud);
    const objectiveCard = ctx.party.objective({
      icon: '🏁',
      title: 'Skyway Sprint',
      objective: 'Learn the ribbon, time the shutters, then cross the Crown Gate.',
      controls: ctx.input.isTouchDevice
        ? 'Drag left to steer, drag the right side to look, and tap JUMP.'
        : 'Move with WASD or arrows, drag to look, and press Space to jump.',
    });
    objectiveCard.el.classList.add('sw-start-objective');
    const rankEl = hud.querySelector('[data-h="rank"]');
    const cpEl = hud.querySelector('[data-h="cp"]');
    const timeEl = hud.querySelector('[data-h="time"]');
    const nextEl = hud.querySelector('[data-h="next"]');
    const flashEl = hud.querySelector('[data-h="flash"]');
    const progressEl = hud.querySelector('[data-h="progress"]');
    const progressBarEl = progressEl.parentElement;
    const guideEl = hud.querySelector('[data-h="guide"]');
    function setGuideHidden(hidden) {
      guideEl.classList.toggle('is-hidden', hidden);
      guideEl.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }
    // On a phone, the objective and guide otherwise repeat the same controls
    // while covering two parts of the course. Keep one instruction surface in
    // the safe bottom slot, then hand that slot to the guide when racing starts.
    if (ctx.input.isTouchDevice && !visualQaMode) setGuideHidden(true);
    modeEl = hud.querySelector('[data-h="mode"]');
    modeEl.textContent =
      roomStatus === 'local' ? 'LOCAL DEV ROOM' :
      roomStatus === 'connecting' ? 'CHECKING LOCAL ROOM' : 'ECHO TRIAL';

    function impactFeedback() {
      impactUntil = courseSimulation.time + 0.22;
      hud.classList.add('is-impact');
      ctx.bus.emit('sfx', 'impact');
    }

    function hudFlash(text, dur = 1.0) {
      flashEl.textContent = text;
      flashEl.style.opacity = '1';
      flashUntil = courseSimulation.time + dur;
    }

    function progressOf(r) {
      return r.finished ? 1e6 - r.place : r.cp * 1000 + (-r.sim.pos.z);
    }

    // ---------- Results ----------
    function showResults() {
      if (!alive || resultsPanel) return;
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:14px';
      const standings = [...racers].sort((a, b) => {
        if (a.finished && b.finished) return a.place - b.place;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return progressOf(b) - progressOf(a);
      });
      standings.forEach((r, i) => {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;justify-content:space-between;padding:8px 12px;border-radius:10px;border:1px solid #e5e5ea;${r.isPlayer ? 'background:#0A84FF33;font-weight:600' : 'background:#f5f5f7'}`;
        const left = document.createElement('span');
        left.textContent = `${ordinal(i + 1)} — ${r.name}`;
        const right = document.createElement('span');
        right.textContent = r.finished ? fmtTime(r.finishTime) : 'racing…';
        row.append(left, right);
        list.appendChild(row);
      });
      const result = playerResult;
      const nestedShowRound = opts.mode === 'show67';
      resultsPanel = ctx.party.result({
        title: 'Skyway Results',
        icon: playerPlace === 1 ? '🏆' : '🏁',
        outcome: `${ordinal(playerPlace)} place`,
        summary: `You crossed the Crown Gate in ${fmtTime(finalTime)}.`,
        note: nestedShowRound
          ? '67 Show · local round'
          : (roomStatus === 'local' ? 'Local dev room' : 'Local bot race · Echo Trial'),
        stats: [
          { label: 'Placement', value: ordinal(playerPlace) },
          { label: 'Finish time', value: fmtTime(finalTime) },
          { label: 'Route', value: player.usedShortcut ? 'Gold Line' : 'Petal Relay' },
          { label: 'Falls', value: String(player.falls) },
          { label: 'Coins earned', value: localGameRewardStat(result) },
        ],
        details: list,
        replayLabel: 'Race again',
        onReplay: nestedShowRound ? null : () => {
          resultsPanel = null;
          ctx.bus.emit('game-result', result);
          resetRace();
        },
        homeLabel: nestedShowRound ? 'Continue 67 Show' : 'Return to Skypark',
        onHome: () => {
          resultsPanel = null;
          exitGame();
        },
      });
    }

    function resetRace() {
      resetSkywayRound(roundSimulation);
      acc = 0;
      impactUntil = -1;
      playerPlace = 0; finalTime = 0;
      playerResult = null;
      authoritativeFinishPresented = false;
      hud.classList.remove('is-impact', 'is-celebrating');
      guideTime = 8;
      setGuideHidden(false);
      for (const racer of racers) {
        racer.wpIndex = 0;
      }
    }

    function exitGame() {
      if (player.finished) {
        ctx.goHome(playerResult); // emits 'game-result'
      } else {
        ctx.goHome();
      }
    }

    // ---------- Frame ticker ----------
    const camPos = new T.Vector3(0, 4, 10);
    const camTarget = new T.Vector3();
    const camFocus = new T.Vector3();
    const camLook = new T.Vector3();
    const camResolved = new T.Vector3();
    const cameraRay = new T.Raycaster();
    const cameraColliders = [
      ...platformViews.values(),
      ...wallViews.values(),
    ];
    const qaProjectionPoint = new T.Vector3();
    const qaProjectionDirection = new T.Vector3();
    const qaProjectionRay = new T.Raycaster();
    const qaRouteIds = Object.freeze([
      'relay-petal-a',
      'gold-line-a',
      'relay-petal-c',
    ]);
    const skywayQa = routeQuery.get('qa') === '1'
      ? Object.freeze({
          routeProjection() {
            const blockingRects = [
              document.querySelector('.sw-position'),
              document.querySelector('.sw-time'),
            ].filter(Boolean).map((element) => element.getBoundingClientRect());
            const bottomControls = [
              document.querySelector('#btn-jump'),
              document.querySelector('.sw-guide:not(.is-hidden)'),
            ].filter(Boolean).map((element) => element.getBoundingClientRect());
            const safeRect = {
              left: 20,
              top: Math.max(20, ...blockingRects.map((rect) => rect.bottom + 12)),
              right: innerWidth - 20,
              bottom: Math.min(
                innerHeight - 20,
                ...bottomControls.map((rect) => rect.top - 12),
              ),
            };
            const points = qaRouteIds.map((id) => {
              const platform = platforms.find((candidate) => candidate.id === id);
              qaProjectionPoint.set(
                platform.position.x,
                platform.top + 0.18,
                platform.position.z,
              );
              const distance = camera.position.distanceTo(qaProjectionPoint);
              qaProjectionDirection
                .copy(qaProjectionPoint)
                .sub(camera.position)
                .normalize();
              qaProjectionRay.set(camera.position, qaProjectionDirection);
              qaProjectionRay.far = Math.max(0, distance - 0.08);
              const occludedByPlayer = qaProjectionRay
                .intersectObject(playerRig, true)
                .some(({ object }) => object.visible);
              const ndc = qaProjectionPoint.clone().project(camera);
              const screen = {
                x: (ndc.x * 0.5 + 0.5) * innerWidth,
                y: (-ndc.y * 0.5 + 0.5) * innerHeight,
              };
              return {
                id,
                screen,
                inFront: ndc.z > -1 && ndc.z < 1,
                insideSafe: (
                  screen.x >= safeRect.left
                  && screen.x <= safeRect.right
                  && screen.y >= safeRect.top
                  && screen.y <= safeRect.bottom
                ),
                occludedByPlayer,
              };
            });
            return {
              viewport: { width: innerWidth, height: innerHeight },
              safeRect,
              points,
            };
          },
        })
      : null;
    if (skywayQa) window.__67VERSE_SKYWAY_QA__ = skywayQa;
    let guideTime = 8;
    let lastHudSignature = '';
    const stop = ctx.loop.add((dt) => {
      if (!alive) return;

      if (impactUntil > 0 && courseSimulation.time > impactUntil) {
        hud.classList.remove('is-impact');
        impactUntil = -1;
      }
      if (
        flashUntil > 0 &&
        courseSimulation.time > flashUntil &&
        courseSimulation.phase !== 'countdown'
      ) {
        flashEl.style.opacity = '0';
        flashUntil = -1;
      }

      // fixed-step sim
      framePad = ctx.input.poll();
      acc += dt;
      let guard = 0;
      while (acc >= SKYWAY_FIXED_DT && guard++ < 8) {
        fixedStep(SKYWAY_FIXED_DT);
        acc -= SKYWAY_FIXED_DT;
      }
      if (guard >= 8) acc = 0;

      // ----- visual sync -----
      playerRig.position.set(playerSim.pos.x, playerSim.pos.y, playerSim.pos.z);
      playerRig.rotation.y = playerSim.yaw;
      playerCharacter?.animator.update(dt, {
        speed: Math.hypot(playerSim.vel.x, playerSim.vel.z),
        grounded: playerSim.grounded,
      });
      for (const remote of remoteRacers.values()) {
        if (!remote.group) continue;
        remote.group.position.lerp(remote.target, 1 - Math.exp(-10 * dt));
        remote.group.rotation.y = angleLerp(remote.group.rotation.y, remote.yaw, 10 * dt);
      }
      for (const spinner of spinners) {
        spinnerViews.get(spinner.id).rotation.y = -spinner.angle;
      }
      for (const wall of walls) wallViews.get(wall.id).position.x = wall.cx;
      for (const p of platforms) {
        if (!p.spec.timing) continue;
        const mesh = platformViews.get(p.id);
        if (p.active) {
          const warn = p.timeLeft < 0.7; // flicker just before vanishing
          mesh.material.opacity = warn
            ? 0.45 + 0.4 * Math.abs(Math.sin(courseSimulation.time * 18))
            : 1;
          mesh.visible = true;
        } else {
          mesh.visible = false;
        }
      }
      for (const { gate, mat, cpIndex, visualState } of checkpointGates) {
        const state = checkpointGateVisualState(
          cpIndex,
          player.cp,
          courseSimulation.time,
          reducedMotion,
          visualState,
        );
        mat.color.setHex(state.color);
        mat.emissive.setHex(state.color);
        mat.opacity = state.opacity;
        mat.emissiveIntensity = state.emissiveIntensity;
        gate.visible = checkpointGateVisible(
          state.status,
          courseSimulation.phase,
        );
      }

      // ----- camera: chase cam down-course -----
      const framing = skywayCameraFraming(camera.aspect);
      if (Math.abs(camera.fov - framing.fov) > 0.01) {
        camera.fov = framing.fov;
        camera.updateProjectionMatrix();
      }
      updateOrbitState(camOrbit, framePad, dt, {
        autoYaw: Math.PI,
        autoRate: 2,
      });
      const relayBiasX = player.cp === 2 ? framing.relayBiasX : 0;
      camFocus.set(
        playerSim.pos.x + relayBiasX,
        playerSim.pos.y,
        playerSim.pos.z,
      );
      camLook.set(
        playerSim.pos.x + relayBiasX,
        playerSim.pos.y + framing.lookHeight,
        playerSim.pos.z - framing.lookAhead,
      );
      orbitCameraPosition(
        camTarget,
        camFocus,
        camOrbit,
        framing.chaseDistance,
        framing.chaseHeight,
      );
      resolveCameraObstruction(
        cameraRay, camLook, camTarget, cameraColliders, camResolved,
      );
      camPos.lerp(camResolved, 1 - Math.exp(-5 * dt));
      resolveCameraObstruction(
        cameraRay, camLook, camPos, cameraColliders, camResolved,
      );
      camera.position.copy(camResolved);
      camera.lookAt(camLook);

      // ----- HUD text -----
      const rank = 1 + racers.filter((r) => r !== player && progressOf(r) > progressOf(player)).length;
      const rankText =
        courseSimulation.phase === 'countdown' ? 'READY' :
        player.finished ? ordinal(playerPlace) : ordinal(rank);
      const checkpointText = `Checkpoint ${player.cp}/${CP_TOTAL}`;
      const nextText = player.cp < CP_TOTAL
        ? `NEXT · ${CHECKPOINT_LABELS[player.cp + 1]}`
        : 'NEXT · FINISH ARCH';
      const timeText = fmtTime(player.finished ? finalTime : courseSimulation.raceTime);
      const progress = Math.max(0, Math.min(100,
        Math.round(((3 - playerSim.pos.z) / (3 - FINISH_Z)) * 100)));
      const signature = `${rankText}|${checkpointText}|${nextText}|${timeText}|${progress}`;
      if (signature !== lastHudSignature) {
        rankEl.textContent = rankText;
        cpEl.textContent = checkpointText;
        nextEl.textContent = nextText;
        timeEl.textContent = timeText;
        progressEl.style.transform = `scaleX(${progress / 100})`;
        progressBarEl.setAttribute('aria-valuenow', String(progress));
        lastHudSignature = signature;
      }
      if (courseSimulation.phase === 'racing' && guideTime > 0) {
        guideTime -= dt;
        if (guideTime <= 0 || player.cp > 0) setGuideHidden(true);
      }
    });

    // ---------- Resize ----------
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.fov = skywayCameraFraming(camera.aspect).fov;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // ---------- View override + go ----------
    ctx.view.current = { scene, camera };

    return {
      unmount() {
        alive = false;
        stop();
        roomSession?.dispose();
        clearTimeout(resultsTimer);
        window.removeEventListener('resize', onResize);
        if (window.__67VERSE_SKYWAY_QA__ === skywayQa) {
          delete window.__67VERSE_SKYWAY_QA__;
        }
        delete window.__67VERSE_SKYWAY_ROOM_QA__;
        objectiveCard.close();
        if (resultsPanel) { resultsPanel.destroy(); resultsPanel = null; }
        // Training echoes own their compact procedural geometry.
        for (const racer of racers) {
          if (!racer.bot) continue;
          racer.bot.group.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
            }
          });
          racer.bot.dispose();
        }
        for (const remote of remoteRacers.values()) {
          if (remote.group) {
            remote.group.traverse((o) => {
              if (!o.userData.rivalAccent) return;
              o.geometry?.dispose();
              o.material?.dispose();
            });
            scene.remove(remote.group);
          }
        }
        remoteRacers.clear();
        // Character instances own their presentation lifecycle and preserve
        // shared Ghost resources while releasing procedural placeholders.
        playerCharacter?.dispose();
        playerCharacter = null;
        scene.remove(playerRig);
        hud.remove();
        document.body.classList.remove('skyway-mode');
        if (ctx.view.current && ctx.view.current.scene === scene) ctx.view.current = null;
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
          }
        });
        glazeTexture.dispose();
      },
    };
  },
});
