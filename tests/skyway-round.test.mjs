import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
  startSkywayRace,
  stepSkywayCourseClock,
  stepSkywayCourseParticipant,
} from '../src/core/skyway-course-simulation.js';
import {
  advanceSkywayInputTimeline,
} from '../src/core/skyway-input-timeline.js';
import {
  SKYWAY_COUNTDOWN_TICKS,
  createSkywayRound,
  queueSkywayRoundInput,
  resetSkywayRound,
  restoreSkywayRound,
  snapshotSkywayRound,
  stepSkywayRound,
  validateSkywayTickInput,
} from '../src/core/skyway-round.js';
import {
  SKYWAY_FIXED_DT,
  stepSkywaySimulation,
} from '../src/core/skyway-simulation.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const IDLE = {
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
};

function createRoundFixture({ countdownTicks } = {}) {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const round = createSkywayRound({ course, countdownTicks, participants: [
    {
      id: 'player',
      isPlayer: true,
      spawn: { x: 0, z: 3 },
    },
    {
      id: 'bot-a',
      isPlayer: false,
      spawn: { x: -2, z: 1 },
      resetSpawn: { x: -2, z: 1.4 },
    },
    {
      id: 'bot-b',
      isPlayer: false,
      spawn: { x: 2, z: 1 },
      resetSpawn: { x: 2, z: 1.4 },
    },
  ] });
  const env = {
    bounds: Math.ceil(Math.abs(course.goal.value)) + 10,
    sampleGround(x, z, fromY) {
      const ground = sampleSkywayCourseGround(course, x, z, fromY);
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
  return { round, env };
}

function scriptedInput(participant, tick) {
  const lane = participant.id === 'bot-a' ? -0.08 : participant.id === 'bot-b' ? 0.08 : 0;
  return {
    dirX: lane,
    dirZ: -0.96,
    moving: true,
    jumpHeld: tick === 250 || tick === 251 || tick === 430,
    grabPressed: tick === 300,
  };
}

function completeCountdown(round, env) {
  let startFrame = null;
  for (let tick = 0; tick < SKYWAY_COUNTDOWN_TICKS; tick++) {
    startFrame = stepSkywayRound(round, {
      env,
      inputFor: () => IDLE,
    });
  }
  return startFrame;
}

function legacyStepRound(round, { inputFor, env }) {
  round.tick += 1;
  stepSkywayCourseClock(round.course);
  const events = [];
  const inputs = [];
  if (round.course.phase !== 'countdown') {
    for (const participant of round.participants) {
      if (participant.isPlayer) {
        participant.race.stun = Math.max(0, participant.race.stun - SKYWAY_FIXED_DT);
      }
      const accepted = !participant.isPlayer || participant.race.stun <= 0;
      const input = accepted ? validateSkywayTickInput(inputFor(participant, round)) : IDLE;
      if (!input) throw new TypeError('Invalid reference input');
      const player = participant.simulation.player;
      const wasGrounded = player.grounded;
      stepSkywaySimulation(participant.simulation, input, env);
      const locomotionPose = {
        x: player.pos.x,
        y: player.pos.y,
        z: player.pos.z,
        yaw: player.yaw,
      };
      inputs.push({ id: participant.id, accepted, input, locomotionPose });
      if (player.jumpEvent) events.push({ participantId: participant.id, type: 'jump' });
      if (!wasGrounded && player.grounded) {
        events.push({ participantId: participant.id, type: 'land' });
      }
      for (const event of stepSkywayCourseParticipant(
        round.course,
        participant.race,
        player,
        { isPlayer: participant.isPlayer },
      )) {
        events.push({ participantId: participant.id, ...event });
      }
    }
  }
  advanceSkywayInputTimeline(round.inputTimeline, round.tick);
  return {
    tick: round.tick,
    inputs,
    events,
    snapshot: snapshotSkywayRound(round),
  };
}

test('SkywayRound matches the previous ordered local composition after its fixed start tick', () => {
  const current = createRoundFixture();
  const legacy = createRoundFixture();

  completeCountdown(current.round, current.env);
  for (let tick = 0; tick < SKYWAY_COUNTDOWN_TICKS; tick++) {
    legacy.round.tick += 1;
    legacy.round.countdown.elapsedTicks += 1;
    stepSkywayCourseClock(legacy.round.course);
    advanceSkywayInputTimeline(legacy.round.inputTimeline, legacy.round.tick);
  }
  startSkywayRace(legacy.round.course);
  assert.deepEqual(
    snapshotSkywayRound(current.round),
    snapshotSkywayRound(legacy.round),
  );

  for (let tick = SKYWAY_COUNTDOWN_TICKS; tick < 720; tick++) {
    const currentFrame = stepSkywayRound(current.round, {
      env: current.env,
      inputFor: (participant) => scriptedInput(participant, tick),
    });
    const legacyFrame = legacyStepRound(legacy.round, {
      env: legacy.env,
      inputFor: (participant) => scriptedInput(participant, tick),
    });
    assert.deepEqual(currentFrame, legacyFrame);
  }
});

test('SkywayRound preserves participant order and exposes one snapshot/event stream', () => {
  const { round, env } = createRoundFixture();
  completeCountdown(round, env);
  const finishZ = round.course.goal.value - 1;
  round.participants[0].simulation.player.pos.z = finishZ;
  round.participants[1].simulation.player.pos.z = finishZ;
  const decisions = [];
  const frame = stepSkywayRound(round, {
    env,
    inputFor(participant, activeRound) {
      decisions.push({
        id: participant.id,
        phase: activeRound.course.phase,
      });
      return IDLE;
    },
  });

  assert.deepEqual(decisions, [
    { id: 'player', phase: 'racing' },
    { id: 'bot-a', phase: 'finished' },
    { id: 'bot-b', phase: 'finished' },
  ]);
  assert.equal(frame.snapshot.course.phase, 'finished');
  assert.equal(frame.snapshot.course.finishCount, 2);
  assert.deepEqual(
    frame.events.filter((event) => event.type === 'finish')
      .map((event) => [event.participantId, event.place]),
    [['player', 1], ['bot-a', 2]],
  );
});

test('SkywayRound validates inputs, suppresses stunned player decisions, and keeps pre-hazard poses', () => {
  assert.equal(validateSkywayTickInput({ ...IDLE, reward: 10 }), null);
  assert.equal(validateSkywayTickInput({ ...IDLE, dirX: Infinity }), null);
  const normalized = validateSkywayTickInput({ ...IDLE, dirX: 2, dirZ: 2 });
  assert.ok(Math.hypot(normalized.dirX, normalized.dirZ) <= 1);

  const { round, env } = createRoundFixture();
  completeCountdown(round, env);
  round.participants[0].race.stun = 0.2;
  round.participants[1].simulation.player.pos.y = -7;
  let playerDecisionCalls = 0;
  const frame = stepSkywayRound(round, {
    env,
    includeSnapshot: false,
    inputFor(participant) {
      if (participant.isPlayer) playerDecisionCalls += 1;
      return IDLE;
    },
  });
  assert.equal(playerDecisionCalls, 0);
  assert.equal(frame.snapshot, null);
  assert.equal(frame.inputs[0].accepted, false);
  assert.ok(frame.inputs[1].locomotionPose.y < -6);
  assert.equal(round.participants[1].simulation.player.pos.y, 0);
  assert.ok(frame.events.some((event) => (
    event.participantId === 'bot-a' && event.type === 'fall'
  )));

  assert.throws(() => stepSkywayRound(round, {
    env,
    inputFor: () => ({ ...IDLE, score: 1 }),
  }), /Invalid Skyway tick input/);

  resetSkywayRound(round);
  assert.equal(round.tick, 0);
  assert.ok(round.participants.every((participant) => (
    participant.simulation.tick === 0 && participant.simulation.time === 0
  )));
});

test('SkywayRound consumes queued input in participant order and uses neutral input when missing', () => {
  const { round, env } = createRoundFixture();
  completeCountdown(round, env);
  const tick = round.tick + 1;
  const queuedPlayerInput = {
    ...IDLE,
    dirX: 0.6,
    moving: true,
    grabPressed: true,
  };
  assert.deepEqual(queueSkywayRoundInput(round, {
    tick,
    participantId: 'player',
    input: queuedPlayerInput,
  }), { accepted: true, reason: null });
  assert.deepEqual(queueSkywayRoundInput(round, {
    tick,
    participantId: 'player',
    input: { ...queuedPlayerInput, dirX: -0.6 },
  }), { accepted: false, reason: 'duplicate' });

  const decisions = [];
  const frame = stepSkywayRound(round, {
    env,
    inputFor(participant) {
      decisions.push(participant.id);
      return participant.id === 'bot-a'
        ? { ...IDLE, dirZ: -1, moving: true }
        : IDLE;
    },
  });
  assert.deepEqual(decisions, ['bot-a', 'bot-b']);
  assert.deepEqual(frame.inputs.map(({ id, input }) => ({ id, input })), [
    { id: 'player', input: queuedPlayerInput },
    { id: 'bot-a', input: { ...IDLE, dirZ: -1, moving: true } },
    { id: 'bot-b', input: IDLE },
  ]);
  assert.equal(round.inputTimeline.nextTick, round.tick + 1);
  assert.deepEqual(queueSkywayRoundInput(round, {
    tick,
    participantId: 'bot-b',
    input: IDLE,
  }), { accepted: false, reason: 'late' });

  const missingFrame = stepSkywayRound(round, { env });
  assert.deepEqual(
    missingFrame.inputs.map(({ input }) => input),
    round.participants.map(() => IDLE),
  );
});

test('SkywayRound discards queued input while stunned without invoking the local adapter', () => {
  const { round, env } = createRoundFixture();
  completeCountdown(round, env);
  const player = round.participants[0];
  player.race.stun = 0.2;
  const tick = round.tick + 1;
  queueSkywayRoundInput(round, {
    tick,
    participantId: 'player',
    input: { ...IDLE, dirZ: -1, moving: true, jumpHeld: true },
  });
  let playerDecisionCalls = 0;
  const frame = stepSkywayRound(round, {
    env,
    inputFor(participant) {
      if (participant.isPlayer) playerDecisionCalls += 1;
      return IDLE;
    },
  });
  assert.equal(playerDecisionCalls, 0);
  assert.equal(frame.inputs[0].accepted, false);
  assert.deepEqual(frame.inputs[0].input, IDLE);
  assert.deepEqual(queueSkywayRoundInput(round, {
    tick,
    participantId: 'player',
    input: IDLE,
  }), { accepted: false, reason: 'late' });
});

test('SkywayRound snapshots future queued input and replays without an input adapter', () => {
  const original = createRoundFixture();
  completeCountdown(original.round, original.env);
  const firstTick = original.round.tick + 1;
  queueSkywayRoundInput(original.round, {
    tick: firstTick,
    participantId: 'player',
    input: { ...IDLE, dirX: 0.5, moving: true },
  });
  queueSkywayRoundInput(original.round, {
    tick: firstTick + 2,
    participantId: 'bot-a',
    input: { ...IDLE, dirZ: -1, moving: true },
  });
  const saved = JSON.parse(JSON.stringify(snapshotSkywayRound(original.round)));
  const expected = [];
  for (let tick = 0; tick < 4; tick++) {
    expected.push(stepSkywayRound(original.round, { env: original.env }));
  }

  const restored = createRoundFixture();
  restoreSkywayRound(restored.round, saved);
  const actual = [];
  for (let tick = 0; tick < 4; tick++) {
    actual.push(stepSkywayRound(restored.round, { env: restored.env }));
  }
  assert.deepEqual(actual, expected);

  const beforeInvalid = snapshotSkywayRound(restored.round);
  const malformed = structuredClone(beforeInvalid);
  malformed.inputTimeline.nextTick += 1;
  assert.throws(
    () => restoreSkywayRound(restored.round, malformed),
    /Invalid Skyway round snapshot/,
  );
  assert.deepEqual(snapshotSkywayRound(restored.round), beforeInvalid);
});

test('SkywayRound owns the exact three-second countdown and starts on the fixed-tick seam', () => {
  const { round, env } = createRoundFixture();
  const cues = [];
  let decisionCalls = 0;

  for (let tick = 1; tick < SKYWAY_COUNTDOWN_TICKS; tick++) {
    const frame = stepSkywayRound(round, {
      env,
      inputFor() {
        decisionCalls += 1;
        return IDLE;
      },
    });
    assert.equal(frame.inputs.length, 0);
    cues.push(...frame.events.filter((event) => event.type === 'countdown'));
  }

  assert.equal(round.tick, 179);
  assert.equal(round.course.tick, 179);
  assert.equal(round.course.phase, 'countdown');
  assert.equal(round.course.raceTime, 0);
  assert.equal(round.participants[0].simulation.tick, 0);
  assert.equal(decisionCalls, 0);
  assert.deepEqual(cues, [
    { type: 'countdown', number: 3 },
    { type: 'countdown', number: 2 },
    { type: 'countdown', number: 1 },
  ]);

  const startFrame = stepSkywayRound(round, {
    env,
    inputFor() {
      decisionCalls += 1;
      return IDLE;
    },
  });
  assert.equal(round.tick, SKYWAY_COUNTDOWN_TICKS);
  assert.deepEqual(round.countdown, {
    durationTicks: SKYWAY_COUNTDOWN_TICKS,
    elapsedTicks: SKYWAY_COUNTDOWN_TICKS,
  });
  assert.equal(round.course.phase, 'racing');
  assert.equal(round.course.raceTime, 0);
  assert.equal(round.participants[0].simulation.tick, 0);
  assert.equal(decisionCalls, 0);
  assert.deepEqual(startFrame.events, [{ type: 'round-start' }]);
  assert.deepEqual(startFrame.inputs, []);

  const racingFrame = stepSkywayRound(round, {
    env,
    inputFor() {
      decisionCalls += 1;
      return IDLE;
    },
  });
  assert.equal(racingFrame.events.some((event) => event.type === 'round-start'), false);
  assert.equal(racingFrame.inputs.length, round.participants.length);
  assert.equal(decisionCalls, round.participants.length);
  assert.equal(round.course.raceTime, SKYWAY_FIXED_DT);
  assert.equal(round.participants[0].simulation.tick, 1);

  resetSkywayRound(round);
  assert.deepEqual(round.countdown, {
    durationTicks: SKYWAY_COUNTDOWN_TICKS,
    elapsedTicks: 0,
  });
  assert.equal(round.course.phase, 'countdown');
});

test('SkywayRound restores mid-countdown and reproduces cue, start, and racing streams', () => {
  const original = createRoundFixture();
  for (let tick = 0; tick < 59; tick++) {
    stepSkywayRound(original.round, {
      env: original.env,
      includeSnapshot: false,
      inputFor: () => IDLE,
    });
  }
  const saved = JSON.parse(JSON.stringify(snapshotSkywayRound(original.round)));
  const expected = [];
  for (let tick = 59; tick < 240; tick++) {
    expected.push(stepSkywayRound(original.round, {
      env: original.env,
      inputFor: (participant) => scriptedInput(participant, tick),
    }));
  }

  const restored = createRoundFixture();
  restoreSkywayRound(restored.round, saved);
  const actual = [];
  for (let tick = 59; tick < 240; tick++) {
    actual.push(stepSkywayRound(restored.round, {
      env: restored.env,
      inputFor: (participant) => scriptedInput(participant, tick),
    }));
  }
  assert.deepEqual(actual, expected);
  assert.deepEqual(
    actual.flatMap((frame) => frame.events)
      .filter((event) => event.type === 'countdown' || event.type === 'round-start'),
    [
      { type: 'countdown', number: 2 },
      { type: 'countdown', number: 1 },
      { type: 'round-start' },
    ],
  );

  const beforeInvalid = snapshotSkywayRound(restored.round);
  const malformed = structuredClone(beforeInvalid);
  malformed.countdown.elapsedTicks = malformed.countdown.durationTicks + 1;
  assert.throws(
    () => restoreSkywayRound(restored.round, malformed),
    /Invalid Skyway round snapshot/,
  );
  assert.deepEqual(snapshotSkywayRound(restored.round), beforeInvalid);
});

test('SkywayRound held countdown preserves visual-QA motion without starting participants', () => {
  const held = createRoundFixture({ countdownTicks: null });
  const initialWallX = held.round.course.walls[0].cx;
  for (let tick = 0; tick < SKYWAY_COUNTDOWN_TICKS * 2; tick++) {
    const frame = stepSkywayRound(held.round, {
      env: held.env,
      includeSnapshot: false,
      inputFor: () => {
        assert.fail('Held countdown must not request participant input.');
      },
    });
    assert.deepEqual(frame.events, []);
    assert.deepEqual(frame.inputs, []);
  }
  assert.deepEqual(held.round.countdown, {
    durationTicks: null,
    elapsedTicks: 0,
  });
  assert.equal(held.round.course.phase, 'countdown');
  assert.equal(held.round.course.raceTime, 0);
  assert.ok(held.round.course.time > 5.9);
  assert.notEqual(held.round.course.walls[0].cx, initialWallX);
  assert.ok(held.round.participants.every((participant) => (
    participant.simulation.tick === 0
  )));

  const saved = JSON.parse(JSON.stringify(snapshotSkywayRound(held.round)));
  const restored = createRoundFixture({ countdownTicks: null });
  restoreSkywayRound(restored.round, saved);
  assert.deepEqual(snapshotSkywayRound(restored.round), saved);
});

test('SkywayRound owns initial and replay spawns while preserving legacy reset semantics', () => {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const round = createSkywayRound({ course, participants: [
    {
      id: 'player',
      isPlayer: true,
      spawn: { x: 0, y: 0.25, z: -57, yaw: 1.2 },
      resetSpawn: { x: 0, z: 3 },
      race: { cp: 2 },
    },
    {
      id: 'bot',
      isPlayer: false,
      spawn: { x: -4.8, z: -3.6 },
      resetSpawn: { x: -4.8, z: -3 },
    },
  ] });
  const playerParticipant = round.participants[0];
  assert.deepEqual(playerParticipant.simulation.player.pos, { x: 0, y: 0.25, z: -57 });
  assert.equal(playerParticipant.simulation.player.yaw, 1.2);
  assert.equal(playerParticipant.race.cp, 2);

  playerParticipant.simulation.player.grabCooldown = 0.4;
  playerParticipant.simulation.player.coyoteTime = 0.03;
  playerParticipant.simulation.player.jumpBufferTime = 0.07;
  playerParticipant.simulation.player.jumpHeldLast = true;
  Object.assign(playerParticipant.race, {
    finished: true,
    place: 1,
    finishTime: 9,
    falls: 2,
    usedShortcut: true,
  });
  resetSkywayRound(round);
  assert.deepEqual(playerParticipant.simulation.player.pos, { x: 0, y: 0, z: 3 });
  assert.deepEqual(playerParticipant.simulation.player.vel, { x: 0, y: 0, z: 0 });
  assert.equal(playerParticipant.simulation.player.yaw, Math.PI);
  assert.deepEqual(playerParticipant.race, {
    cp: 0,
    finished: false,
    place: 0,
    finishTime: 0,
    knockCd: 0,
    stun: 0,
    falls: 0,
    usedShortcut: false,
  });
  assert.deepEqual({
    grabCooldown: playerParticipant.simulation.player.grabCooldown,
    coyoteTime: playerParticipant.simulation.player.coyoteTime,
    jumpBufferTime: playerParticipant.simulation.player.jumpBufferTime,
    jumpHeldLast: playerParticipant.simulation.player.jumpHeldLast,
  }, {
    grabCooldown: 0.4,
    coyoteTime: 0.03,
    jumpBufferTime: 0.07,
    jumpHeldLast: true,
  });
  assert.deepEqual(round.participants[1].simulation.player.pos, { x: -4.8, y: 0, z: -3 });
});

function replayRound(changeTick = -1) {
  const { round, env } = createRoundFixture();
  const stream = [];
  for (let tick = 0; tick < 660; tick++) {
    stream.push(stepSkywayRound(round, {
      env,
      inputFor(participant) {
        const input = scriptedInput(participant, tick);
        return tick === changeTick && participant.id === 'player'
          ? { ...input, dirX: 0.7 }
          : input;
      },
    }));
  }
  return stream;
}

test('SkywayRound replay is deterministic, JSON-stable, and input-sensitive', () => {
  const first = replayRound();
  const second = replayRound();
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), second);
  assert.notDeepEqual(first, replayRound(360));
});

test('SkywayRound restores a JSON snapshot and replays identically without partial invalid writes', () => {
  const original = createRoundFixture();
  for (let tick = 0; tick < 360; tick++) {
    stepSkywayRound(original.round, {
      env: original.env,
      includeSnapshot: false,
      inputFor: (participant) => scriptedInput(participant, tick),
    });
  }
  const saved = JSON.parse(JSON.stringify(snapshotSkywayRound(original.round)));
  const expected = [];
  for (let tick = 360; tick < 600; tick++) {
    expected.push(stepSkywayRound(original.round, {
      env: original.env,
      inputFor: (participant) => scriptedInput(participant, tick),
    }));
  }

  const restored = createRoundFixture();
  restoreSkywayRound(restored.round, saved);
  const actual = [];
  for (let tick = 360; tick < 600; tick++) {
    actual.push(stepSkywayRound(restored.round, {
      env: restored.env,
      inputFor: (participant) => scriptedInput(participant, tick),
    }));
  }
  assert.deepEqual(actual, expected);

  const beforeInvalid = snapshotSkywayRound(restored.round);
  const malformed = structuredClone(beforeInvalid);
  malformed.participants[1].simulation.player.pos.x = Infinity;
  assert.throws(() => restoreSkywayRound(restored.round, malformed), /Invalid Skyway round snapshot/);
  assert.deepEqual(snapshotSkywayRound(restored.round), beforeInvalid);
});
