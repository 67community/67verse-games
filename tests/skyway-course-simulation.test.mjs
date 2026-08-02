import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayCourseSimulation,
  resetSkywayCourseSimulation,
  SKYWAY_WALL_DEFINITIONS,
  snapshotSkywayCourseSimulation,
  startSkywayRace,
  stepSkywayCourseClock,
  stepSkywayCourseParticipant,
} from '../src/core/skyway-course-simulation.js';
import {
  checkpointTriggered,
  createPlatformRuntime,
  createSweeperRuntime,
  fallHazardTriggered,
  goalZoneTriggered,
  samplePlatformGround,
  stepLevelWidget,
  widgetsByType,
} from '../src/core/level-widgets.js';
import { SKYWAY_FIXED_DT } from '../src/core/skyway-simulation.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';
import { createPlayerState } from '../src/player.js';

const PLAYER_RADIUS = 0.35;
const BAR_CLEAR_Y = 0.55;
const PIT_Y = -100;

function createParticipant() {
  return {
    cp: 0,
    finished: false,
    place: 0,
    finishTime: 0,
    knockCd: 0,
    stun: 0,
    falls: 0,
    usedShortcut: false,
  };
}

function createLegacyCourse() {
  return {
    time: 0,
    raceTime: 0,
    phase: 'countdown',
    finishCount: 0,
    platforms: [
      ...widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'static-platform'),
      ...widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'moving-platform'),
    ].map((widget) => createPlatformRuntime(widget)),
    sweepers: widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'sweeper')
      .map((widget) => createSweeperRuntime(widget)),
    walls: SKYWAY_WALL_DEFINITIONS.map((definition) => ({
      ...definition,
      cx: 0,
      vx: 0,
      top: definition.h,
      bottom: 0,
    })),
    checkpoints: widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'checkpoint'),
    fallHazard: widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'fall-hazard')[0],
    goal: widgetsByType(SKYWAY_LEVEL_DESCRIPTION, 'goal-zone')[0],
  };
}

function legacyStepClock(course) {
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
    const angle = (Math.PI * 2 * course.time) / wall.period + wall.phase;
    wall.cx = wall.amp * Math.sin(angle);
    wall.vx = wall.amp * Math.cos(angle) * ((Math.PI * 2) / wall.period);
  }
}

function legacySpinnerHit(sweeper, player) {
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
  const magnitude = 5 + Math.abs(projection * sweeper.speed) * 0.9;
  return {
    x: -sine * side * spinDirection,
    z: cosine * side * spinDirection,
    magnitude,
  };
}

function legacyPushOutOfWall(wall, player) {
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

function legacyStepParticipant(course, participant, player, isPlayer) {
  const events = [];
  if (!participant.finished) {
    participant.knockCd = Math.max(0, participant.knockCd - SKYWAY_FIXED_DT);
    if (participant.knockCd <= 0) {
      for (const sweeper of course.sweepers) {
        const hit = legacySpinnerHit(sweeper, player);
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
    for (const wall of course.walls) legacyPushOutOfWall(wall, player);
  }

  if (!participant.usedShortcut) {
    const ground = samplePlatformGround(
      course.platforms,
      player.pos.x,
      player.pos.z,
      player.pos.y + 0.5,
      PIT_Y,
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
    const checkpoint = course.checkpoints[participant.cp];
    participant.falls += 1;
    Object.assign(player.pos, checkpoint.spawn);
    Object.assign(player.vel, { x: 0, y: 0, z: 0 });
    player.yaw = Math.PI;
    player.grounded = true;
    participant.knockCd = 0.6;
    participant.stun = 0;
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

function courseNumerics(course) {
  return {
    time: course.time,
    raceTime: course.raceTime,
    phase: course.phase,
    finishCount: course.finishCount,
    platforms: course.platforms.map((platform) => ({
      active: platform.active,
      timeLeft: platform.timeLeft,
      position: { ...platform.position },
    })),
    sweepers: course.sweepers.map((sweeper) => sweeper.angle),
    walls: course.walls.map((wall) => ({ cx: wall.cx, vx: wall.vx })),
  };
}

test('Skyway course clock matches the previous fixed-step implementation exactly', () => {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const legacy = createLegacyCourse();
  for (let tick = 0; tick < 720; tick++) {
    if (tick === 180) {
      startSkywayRace(course);
      legacy.phase = 'racing';
    }
    if (tick === 600) {
      course.phase = 'finished';
      legacy.phase = 'finished';
    }
    stepSkywayCourseClock(course);
    legacyStepClock(legacy);
    assert.deepEqual(courseNumerics(course), courseNumerics(legacy));
  }
  assert.ok(Math.abs(course.raceTime - 540 * SKYWAY_FIXED_DT) < 1e-12);
});

test('Skyway participant hazards and transitions preserve legacy order and state', () => {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const legacy = createLegacyCourse();
  startSkywayRace(course);
  legacy.phase = 'racing';
  for (let index = 0; index < 45; index++) {
    stepSkywayCourseClock(course);
    legacyStepClock(legacy);
  }
  const participant = createParticipant();
  const legacyParticipant = createParticipant();
  const player = createPlayerState(course.sweepers[0].x, course.sweepers[0].z);
  const legacyPlayer = structuredClone(player);

  const stages = [
    () => {},
    () => {
      participant.knockCd = legacyParticipant.knockCd = 1;
      player.pos.x = legacyPlayer.pos.x = course.walls[0].cx;
      player.pos.z = legacyPlayer.pos.z = course.walls[0].z;
      player.pos.y = legacyPlayer.pos.y = 0;
    },
    () => {
      participant.knockCd = legacyParticipant.knockCd = 1;
      player.pos.x = legacyPlayer.pos.x = 3.15;
      player.pos.z = legacyPlayer.pos.z = -69.5;
      player.pos.y = legacyPlayer.pos.y = 0;
    },
    () => {
      player.pos.x = legacyPlayer.pos.x = 0;
      player.pos.z = legacyPlayer.pos.z = -80;
      player.pos.y = legacyPlayer.pos.y = 0;
    },
    () => {
      player.pos.y = legacyPlayer.pos.y = -7;
    },
    () => {
      player.pos.z = legacyPlayer.pos.z = course.goal.value - 1;
      player.pos.y = legacyPlayer.pos.y = 0;
    },
  ];

  for (const arrange of stages) {
    arrange();
    const events = stepSkywayCourseParticipant(
      course,
      participant,
      player,
      { isPlayer: true },
    );
    const legacyEvents = legacyStepParticipant(
      legacy,
      legacyParticipant,
      legacyPlayer,
      true,
    );
    assert.deepEqual(events, legacyEvents);
    assert.deepEqual(participant, legacyParticipant);
    assert.deepEqual(player, legacyPlayer);
    assert.deepEqual(courseNumerics(course), courseNumerics(legacy));
  }

  assert.equal(participant.cp, 3);
  assert.equal(participant.falls, 1);
  assert.equal(participant.finished, true);
  assert.equal(course.phase, 'finished');
});

test('Skyway finish ordering stays player-first and does not require checkpoints', () => {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  startSkywayRace(course);
  stepSkywayCourseClock(course);
  const playerRace = createParticipant();
  const botRace = createParticipant();
  const finishZ = course.goal.value - 1;
  const player = createPlayerState(0, finishZ);
  const bot = createPlayerState(0, finishZ);

  const playerEvents = stepSkywayCourseParticipant(
    course,
    playerRace,
    player,
    { isPlayer: true },
  );
  const botEvents = stepSkywayCourseParticipant(course, botRace, bot);
  assert.equal(playerRace.cp, 3);
  assert.equal(playerRace.place, 1);
  assert.equal(botRace.place, 2);
  assert.equal(course.phase, 'finished');
  assert.deepEqual(playerEvents.map((event) => event.type), [
    'checkpoint', 'checkpoint', 'checkpoint', 'finish',
  ]);
  assert.equal(botEvents.at(-1).type, 'finish');
});

test('Skyway reset preserves accumulated spinner angles while restarting clocks', () => {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  startSkywayRace(course);
  for (let tick = 0; tick < 120; tick++) stepSkywayCourseClock(course);
  const angles = course.sweepers.map((sweeper) => sweeper.angle);
  resetSkywayCourseSimulation(course);
  assert.deepEqual(course.sweepers.map((sweeper) => sweeper.angle), angles);
  assert.deepEqual({
    tick: course.tick,
    time: course.time,
    raceTime: course.raceTime,
    phase: course.phase,
    finishCount: course.finishCount,
  }, {
    tick: 0,
    time: 0,
    raceTime: 0,
    phase: 'countdown',
    finishCount: 0,
  });
});

function replayCourseTape({ fallTick = 410 } = {}) {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const participant = createParticipant();
  const player = createPlayerState(0, 3);
  const events = [];
  const courseTicks = Math.ceil((player.pos.z - course.goal.value + 1) / 0.22);
  const maxTicks = 180 + courseTicks * 2;
  for (let tick = 0; tick < maxTicks && !participant.finished; tick++) {
    if (tick === 180) startSkywayRace(course);
    stepSkywayCourseClock(course);
    if (course.phase !== 'countdown' && !participant.finished) {
      player.pos.z -= 0.22;
      player.pos.y = tick === fallTick ? -7 : 0;
      events.push(...stepSkywayCourseParticipant(
        course,
        participant,
        player,
        { isPlayer: true },
      ));
    }
  }
  return {
    course: snapshotSkywayCourseSimulation(course, [participant]),
    player: structuredClone(player),
    events,
  };
}

test('Skyway course and race-state replay is deterministic and input-sensitive', () => {
  const first = replayCourseTape();
  const second = replayCourseTape();
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), second);
  assert.notDeepEqual(first, replayCourseTape({ fallTick: 470 }));
  assert.ok(first.events.some((event) => event.type === 'fall'));
  assert.ok(first.events.some((event) => event.type === 'finish'));
});
