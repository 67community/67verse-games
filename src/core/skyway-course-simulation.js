import {
  checkpointTriggered,
  createPlatformRuntime,
  createSweeperRuntime,
  fallHazardTriggered,
  goalZoneTriggered,
  samplePlatformGround,
  stepLevelWidget,
  widgetsByType,
} from './level-widgets.js';
import { SKYWAY_FIXED_DT } from './skyway-simulation.js';

export const SKYWAY_COURSE_SIMULATION_VERSION = 2;

export const SKYWAY_WALL_DEFINITIONS = Object.freeze([
  Object.freeze({ z: -68.5, w: 3.8, h: 2.5, d: 0.9, amp: 3.25, period: 3.6, phase: 0.0 }),
  Object.freeze({ z: -77.0, w: 3.8, h: 2.5, d: 0.9, amp: 3.25, period: 2.9, phase: 2.1 }),
  Object.freeze({ z: -85.5, w: 3.8, h: 2.5, d: 0.9, amp: 3.25, period: 4.2, phase: 4.0 }),
]);

const PLAYER_RADIUS = 0.35;
const BAR_CLEAR_Y = 0.55;
const PIT_Y = -100;

export function createSkywayCourseSimulation(level) {
  const fallHazards = widgetsByType(level, 'fall-hazard');
  const goals = widgetsByType(level, 'goal-zone');
  if (fallHazards.length !== 1 || goals.length !== 1) {
    throw new RangeError('Skyway requires exactly one fall hazard and one goal zone.');
  }
  return {
    version: SKYWAY_COURSE_SIMULATION_VERSION,
    tick: 0,
    time: 0,
    raceTime: 0,
    phase: 'countdown',
    finishCount: 0,
    platforms: [
      ...widgetsByType(level, 'static-platform'),
      ...widgetsByType(level, 'moving-platform'),
    ].map((widget) => createPlatformRuntime(widget)),
    sweepers: widgetsByType(level, 'sweeper')
      .map((widget) => createSweeperRuntime(widget)),
    walls: SKYWAY_WALL_DEFINITIONS.map((definition, index) => ({
      id: `wall-${index}`,
      ...definition,
      cx: 0,
      vx: 0,
      top: definition.h,
      bottom: 0,
    })),
    checkpoints: widgetsByType(level, 'checkpoint'),
    fallHazard: fallHazards[0],
    goal: goals[0],
  };
}

export function startSkywayRace(course) {
  if (course.phase === 'countdown') course.phase = 'racing';
  return course;
}

export function resetSkywayCourseSimulation(course) {
  course.tick = 0;
  course.time = 0;
  course.raceTime = 0;
  course.phase = 'countdown';
  course.finishCount = 0;
  return course;
}

export function stepSkywayCourseClock(course) {
  course.tick += 1;
  course.time += SKYWAY_FIXED_DT;
  if (course.phase === 'racing' || course.phase === 'finished') {
    course.raceTime += SKYWAY_FIXED_DT;
  }
  for (const platform of course.platforms) {
    stepLevelWidget(platform, course.time, SKYWAY_FIXED_DT);
  }
  for (const sweeper of course.sweepers) {
    stepLevelWidget(sweeper, course.time, SKYWAY_FIXED_DT);
  }
  for (const wall of course.walls) {
    const angularSpeed = (Math.PI * 2) / wall.period;
    const angle = (Math.PI * 2 * course.time) / wall.period + wall.phase;
    wall.cx = wall.amp * Math.sin(angle);
    wall.vx = wall.amp * Math.cos(angle) * angularSpeed;
  }
  return course;
}

export function sampleSkywayCourseGround(course, x, z, fromY) {
  return samplePlatformGround(course.platforms, x, z, fromY, PIT_Y);
}

export function isSkywayPlatformNear(course, x, z) {
  return course.platforms.some((platform) => (
    platform.active &&
    x >= platform.minX &&
    x <= platform.maxX &&
    z >= platform.minZ &&
    z <= platform.maxZ
  ));
}

function spinnerHit(sweeper, player) {
  if (player.pos.y > BAR_CLEAR_Y) return null;
  const dx = player.pos.x - sweeper.x;
  const dz = player.pos.z - sweeper.z;
  const reach = sweeper.len / 2 + PLAYER_RADIUS;
  if (dx * dx + dz * dz > reach * reach + 1) return null;
  const cosine = Math.cos(sweeper.angle);
  const sine = Math.sin(sweeper.angle);
  const projection = dx * cosine + dz * sine;
  const perpendicular = -dx * sine + dz * cosine;
  if (
    Math.abs(projection) > sweeper.len / 2 + PLAYER_RADIUS ||
    Math.abs(perpendicular) > sweeper.width / 2 + PLAYER_RADIUS
  ) {
    return null;
  }
  const side = perpendicular >= 0 ? 1 : -1;
  const spinDirection = sweeper.speed >= 0 ? 1 : -1;
  return {
    x: -sine * side * spinDirection,
    z: cosine * side * spinDirection,
    magnitude: 5 + Math.abs(projection * sweeper.speed) * 0.9,
  };
}

function pushOutOfWall(wall, player) {
  if (player.pos.y > wall.top || player.pos.y < wall.bottom - 0.6) return;
  const minX = wall.cx - wall.w / 2 - PLAYER_RADIUS;
  const maxX = wall.cx + wall.w / 2 + PLAYER_RADIUS;
  const minZ = wall.z - wall.d / 2 - PLAYER_RADIUS;
  const maxZ = wall.z + wall.d / 2 + PLAYER_RADIUS;
  const { x, z } = player.pos;
  if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) return;
  const dxMin = x - minX;
  const dxMax = maxX - x;
  const dzMin = z - minZ;
  const dzMax = maxZ - z;
  const penetration = Math.min(dxMin, dxMax, dzMin, dzMax);
  if (penetration === dxMin) {
    player.pos.x = minX;
    if (player.vel.x > 0) player.vel.x = 0;
    if (wall.vx < 0) player.vel.x = wall.vx;
  } else if (penetration === dxMax) {
    player.pos.x = maxX;
    if (player.vel.x < 0) player.vel.x = 0;
    if (wall.vx > 0) player.vel.x = wall.vx;
  } else if (penetration === dzMin) {
    player.pos.z = minZ;
    if (player.vel.z > 0) player.vel.z = 0;
  } else {
    player.pos.z = maxZ;
    if (player.vel.z < 0) player.vel.z = 0;
  }
}

function respawnParticipant(course, participant, player) {
  const checkpoint = course.checkpoints[participant.cp];
  participant.falls += 1;
  player.pos.x = checkpoint.spawn.x;
  player.pos.y = 0;
  player.pos.z = checkpoint.spawn.z;
  player.vel.x = 0;
  player.vel.y = 0;
  player.vel.z = 0;
  player.yaw = Math.PI;
  player.grounded = true;
  participant.knockCd = 0.6;
  participant.stun = 0;
}

export function stepSkywayCourseParticipant(
  course,
  participant,
  player,
  { isPlayer = false } = {},
) {
  const events = [];

  if (!participant.finished) {
    participant.knockCd = Math.max(0, participant.knockCd - SKYWAY_FIXED_DT);
    if (participant.knockCd <= 0) {
      for (const sweeper of course.sweepers) {
        const hit = spinnerHit(sweeper, player);
        if (!hit) continue;
        player.vel.x = hit.x * hit.magnitude;
        player.vel.z = hit.z * hit.magnitude;
        player.vel.y = 3.8;
        player.grounded = false;
        participant.knockCd = 0.8;
        if (isPlayer) participant.stun = 0.35;
        events.push({ type: 'impact' });
        break;
      }
    }
    for (const wall of course.walls) pushOutOfWall(wall, player);
  }

  if (!participant.usedShortcut) {
    const ground = sampleSkywayCourseGround(
      course,
      player.pos.x,
      player.pos.z,
      player.pos.y + 0.5,
    );
    if (ground.box?.spec.route === 'shortcut') {
      participant.usedShortcut = true;
      events.push({ type: 'shortcut' });
    }
  }

  while (
    participant.cp < course.checkpoints.length - 1 &&
    checkpointTriggered(course.checkpoints[participant.cp + 1], player.pos)
  ) {
    participant.cp += 1;
    events.push({ type: 'checkpoint', checkpoint: participant.cp });
  }

  if (fallHazardTriggered(course.fallHazard, player.pos)) {
    respawnParticipant(course, participant, player);
    events.push({ type: 'fall', checkpoint: participant.cp });
  }

  if (!participant.finished && goalZoneTriggered(course.goal, player.pos)) {
    participant.finished = true;
    participant.place = ++course.finishCount;
    participant.finishTime = course.raceTime;
    if (isPlayer) course.phase = 'finished';
    events.push({
      type: 'finish',
      place: participant.place,
      finishTime: participant.finishTime,
    });
  }

  return events;
}

export function snapshotSkywayCourseSimulation(course, participants = []) {
  return {
    version: course.version,
    tick: course.tick,
    time: course.time,
    raceTime: course.raceTime,
    phase: course.phase,
    finishCount: course.finishCount,
    platforms: course.platforms.map((platform) => ({
      id: platform.id,
      active: platform.active,
      timeLeft: Number.isFinite(platform.timeLeft) ? platform.timeLeft : null,
      position: { ...platform.position },
      minX: platform.minX,
      maxX: platform.maxX,
      minZ: platform.minZ,
      maxZ: platform.maxZ,
      top: platform.top,
    })),
    sweepers: course.sweepers.map((sweeper) => ({
      id: sweeper.id,
      angle: sweeper.angle,
    })),
    walls: course.walls.map((wall) => ({
      id: wall.id,
      cx: wall.cx,
      vx: wall.vx,
    })),
    participants: participants.map((participant) => ({
      cp: participant.cp,
      finished: participant.finished,
      place: participant.place,
      finishTime: participant.finishTime,
      knockCd: participant.knockCd,
      stun: participant.stun,
      falls: participant.falls,
      usedShortcut: participant.usedShortcut,
    })),
  };
}

export function restoreSkywayCourseSimulation(course, snapshot) {
  const validPhase = ['countdown', 'racing', 'finished'].includes(snapshot?.phase);
  const arraysMatch = (
    current,
    saved,
  ) => Array.isArray(saved) &&
    saved.length === current.length &&
    current.every((value, index) => saved[index]?.id === value.id);
  if (
    !snapshot ||
    snapshot.version !== SKYWAY_COURSE_SIMULATION_VERSION ||
    !Number.isInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    ![snapshot.time, snapshot.raceTime].every(Number.isFinite) ||
    !validPhase ||
    !Number.isInteger(snapshot.finishCount) ||
    snapshot.finishCount < 0 ||
    !arraysMatch(course.platforms, snapshot.platforms) ||
    !arraysMatch(course.sweepers, snapshot.sweepers) ||
    !arraysMatch(course.walls, snapshot.walls)
  ) {
    throw new TypeError('Invalid Skyway course snapshot');
  }
  for (const platform of snapshot.platforms) {
    if (
      typeof platform.active !== 'boolean' ||
      !(platform.timeLeft === null || Number.isFinite(platform.timeLeft)) ||
      ![
        platform.position?.x,
        platform.position?.y,
        platform.position?.z,
        platform.minX,
        platform.maxX,
        platform.minZ,
        platform.maxZ,
        platform.top,
      ].every(Number.isFinite)
    ) {
      throw new TypeError('Invalid Skyway course snapshot');
    }
  }
  if (
    snapshot.sweepers.some((sweeper) => !Number.isFinite(sweeper.angle)) ||
    snapshot.walls.some((wall) => ![wall.cx, wall.vx].every(Number.isFinite))
  ) {
    throw new TypeError('Invalid Skyway course snapshot');
  }

  course.tick = snapshot.tick;
  course.time = snapshot.time;
  course.raceTime = snapshot.raceTime;
  course.phase = snapshot.phase;
  course.finishCount = snapshot.finishCount;
  course.platforms.forEach((platform, index) => {
    const saved = snapshot.platforms[index];
    platform.active = saved.active;
    platform.timeLeft = saved.timeLeft === null ? Infinity : saved.timeLeft;
    Object.assign(platform.position, saved.position);
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ', 'top']) {
      platform[key] = saved[key];
    }
  });
  course.sweepers.forEach((sweeper, index) => {
    sweeper.angle = snapshot.sweepers[index].angle;
  });
  course.walls.forEach((wall, index) => {
    wall.cx = snapshot.walls[index].cx;
    wall.vx = snapshot.walls[index].vx;
  });
  return course;
}
