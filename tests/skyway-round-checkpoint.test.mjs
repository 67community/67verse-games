import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
} from '../src/core/skyway-command-journal.js';
import {
  appendSkywayReplayEventFrame,
  commitSkywayReplayEvents,
  createSkywayReplayEventLedger,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import {
  createSkywayRoundCheckpointBundle,
  restoreSkywayRoundCheckpointBundle,
  SKYWAY_ROUND_CHECKPOINT_VERSION,
} from '../src/core/skyway-round-checkpoint.js';
import {
  createSkywayRoundFinalityToken,
} from '../src/core/skyway-round-finality.js';
import {
  resetSkywayRoundLifecycle,
} from '../src/core/skyway-round-lifecycle.js';
import {
  createSkywayRound,
  snapshotSkywayRound,
  stepSkywayRound,
} from '../src/core/skyway-round.js';
import {
  createSkywaySnapshotHistory,
  hashSkywaySnapshot,
  recordSkywaySnapshot,
} from '../src/core/skyway-snapshot-history.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const SESSION = 'device-session:checkpoint-tests';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});

function inputAt(participantId, tick) {
  return {
    ...IDLE,
    dirX: participantId === 'player' ? 0.15 : -0.1,
    dirZ: -0.9,
    moving: true,
    jumpHeld: tick === 3,
  };
}

function createStack({
  commandCapacity = 5,
  roundEpoch = 1,
} = {}) {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const participantIds = ['player', 'bot'];
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    inputCapacityTicks: commandCapacity,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({
    capacityTicks: commandCapacity + 1,
    roundEpoch,
  });
  recordSkywaySnapshot(
    snapshotHistory,
    snapshotSkywayRound(round),
    { roundEpoch },
  );
  const commandJournal = createSkywayCommandJournal({
    participantIds,
    capacityTicks: commandCapacity,
    roundEpoch,
  });
  const replayEventLedger = createSkywayReplayEventLedger({
    participantIds,
    capacityTicks: commandCapacity,
    roundEpoch,
  });
  const env = {
    bounds: 100,
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
  return {
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    env,
  };
}

function advanceOne(stack) {
  const tick = stack.round.tick + 1;
  const frame = stepSkywayRound(stack.round, {
    env: stack.env,
    inputFor: (participant) => inputAt(participant.id, tick),
  });
  appendSkywayCommandTick(stack.commandJournal, {
    roundEpoch: stack.commandJournal.roundEpoch,
    tick,
    commands: stack.round.participants.map((participant) => {
      const applied = frame.inputs.find(({ id }) => id === participant.id);
      return {
        participantId: participant.id,
        authority: applied ? 'predicted' : 'neutral',
        input: applied?.input ?? IDLE,
      };
    }),
  });
  appendSkywayReplayEventFrame(stack.replayEventLedger, {
    tick,
    events: frame.events,
  });
  recordSkywaySnapshot(
    stack.snapshotHistory,
    frame.snapshot,
    { roundEpoch: stack.snapshotHistory.roundEpoch },
  );
  return frame;
}

function advanceThrough(stack, throughTick) {
  const frames = [];
  while (stack.round.tick < throughTick) frames.push(advanceOne(stack));
  return frames;
}

function stackState(stack) {
  return {
    round: snapshotSkywayRound(stack.round),
    snapshotHistory: structuredClone(stack.snapshotHistory),
    commandJournal: structuredClone(stack.commandJournal),
    replayEventLedger: structuredClone(stack.replayEventLedger),
  };
}

function bundlePayload(bundle) {
  const { bundleHash: ignored, ...payload } = bundle;
  return payload;
}

test('Skyway Round Checkpoint Bundle round-trips, restores atomically, and replays identically', () => {
  const source = createStack();
  advanceThrough(source, 3);
  const checkpointState = stackState(source);
  const identities = {
    round: source.round,
    timeline: source.round.inputTimeline,
    history: source.snapshotHistory,
    journal: source.commandJournal,
    ledger: source.replayEventLedger,
  };
  const bundle = createSkywayRoundCheckpointBundle({
    ...source,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.equal(bundle.version, SKYWAY_ROUND_CHECKPOINT_VERSION);
  assert.equal(bundle.kind, 'skyway-round-checkpoint-bundle');
  assert.equal(bundle.tick, 3);
  assert.equal(bundle.roundEpoch, 1);
  assert.equal(bundle.components.roundSnapshot.inputTimeline.nextTick, 4);
  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(Object.isFrozen(bundle.components.commandJournal), true);
  assert.equal(
    bundle.roundSnapshotHash,
    hashSkywaySnapshot(bundle.components.roundSnapshot),
  );
  assert.equal(bundle.bundleHash, hashSkywaySnapshot(bundlePayload(bundle)));

  const originalNext = advanceOne(source);
  assert.deepEqual(stackState(source).round.tick, 4);
  assert.deepEqual(bundle.components.roundSnapshot, checkpointState.round);
  const wireBundle = JSON.parse(JSON.stringify(bundle));
  const restored = restoreSkywayRoundCheckpointBundle({
    ...source,
    bundle: wireBundle,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.deepEqual(restored, {
    version: SKYWAY_ROUND_CHECKPOINT_VERSION,
    kind: 'skyway-round-checkpoint-restore',
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    tick: 3,
    roundSnapshotHash: bundle.roundSnapshotHash,
    bundleHash: bundle.bundleHash,
  });
  assert.deepEqual(stackState(source), checkpointState);
  assert.equal(source.round, identities.round);
  assert.equal(source.round.inputTimeline, identities.timeline);
  assert.equal(source.snapshotHistory, identities.history);
  assert.equal(source.commandJournal, identities.journal);
  assert.equal(source.replayEventLedger, identities.ledger);

  const replayedNext = advanceOne(source);
  assert.deepEqual(replayedNext, originalNext);
});

test('Skyway Round Checkpoint Bundle rejects partial, tampered, and incompatible restores without mutation', () => {
  const source = createStack();
  advanceThrough(source, 3);
  const bundle = createSkywayRoundCheckpointBundle({
    ...source,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });

  const scenarios = [
    {
      name: 'partial component',
      target: createStack(),
      mutate(copy) {
        delete copy.components.commandJournal;
      },
      pattern: /Invalid Skyway Round checkpoint bundle/,
    },
    {
      name: 'stale hash',
      target: createStack(),
      mutate(copy) {
        copy.components.roundSnapshot.course.time += 0.001;
      },
      pattern: /bundle hash is invalid/,
    },
    {
      name: 'recomputed malformed command',
      target: createStack(),
      mutate(copy) {
        const retained = copy.components.commandJournal.slots
          .find((slot) => slot !== null);
        retained.commands[0].authority = 'fabricated';
        copy.bundleHash = hashSkywaySnapshot(bundlePayload(copy));
      },
      pattern: /authority is invalid/,
    },
    {
      name: 'capacity mismatch',
      target: createStack({ commandCapacity: 4 }),
      mutate() {},
      pattern: /target capacities/,
    },
  ];

  for (const scenario of scenarios) {
    const copy = structuredClone(bundle);
    scenario.mutate(copy);
    const before = stackState(scenario.target);
    assert.throws(() => restoreSkywayRoundCheckpointBundle({
      ...scenario.target,
      bundle: copy,
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }), scenario.pattern, scenario.name);
    assert.deepEqual(stackState(scenario.target), before, scenario.name);
  }
});

test('Skyway Round Checkpoint Bundle rejects cross-session and prior-round ABA restores', () => {
  const source = createStack();
  advanceThrough(source, 3);
  const bundle = createSkywayRoundCheckpointBundle({
    ...source,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });

  const otherSession = createStack();
  advanceThrough(otherSession, 3);
  const beforeOtherSession = stackState(otherSession);
  assert.throws(() => restoreSkywayRoundCheckpointBundle({
    ...otherSession,
    bundle,
    sessionIncarnation: 'device-session:other',
    roundEpoch: 1,
  }), /session incarnation is stale/);
  assert.deepEqual(stackState(otherSession), beforeOtherSession);

  resetSkywayRoundLifecycle({ ...source, roundEpoch: 1 });
  advanceThrough(source, 3);
  const beforeNewRound = stackState(source);
  assert.throws(() => restoreSkywayRoundCheckpointBundle({
    ...source,
    bundle,
    sessionIncarnation: SESSION,
    roundEpoch: 2,
  }), /round epoch is stale/);
  assert.deepEqual(stackState(source), beforeNewRound);
});

test('Skyway Round Checkpoint Bundle preserves retained rings and never uncommits presentation effects', () => {
  const source = createStack({ commandCapacity: 3 });
  advanceThrough(source, 3);
  const headSnapshot = snapshotSkywayRound(source.round);
  const commitToken = createSkywayRoundFinalityToken({
    ledger: source.replayEventLedger,
    roundSnapshot: headSnapshot,
  });
  commitSkywayReplayEvents(source.replayEventLedger, {
    throughTick: 2,
    finalityToken: commitToken,
    roundSnapshot: headSnapshot,
  });
  advanceThrough(source, 5);
  const bundle = createSkywayRoundCheckpointBundle({
    ...source,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.equal(bundle.components.snapshotHistory.oldestTick, 2);
  assert.equal(bundle.components.commandJournal.oldestTick, 3);
  assert.equal(bundle.components.replayEventLedger.oldestTick, 3);
  assert.equal(bundle.components.replayEventLedger.committedThroughTick, 2);

  const fresh = createStack({ commandCapacity: 3 });
  restoreSkywayRoundCheckpointBundle({
    ...fresh,
    bundle,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.deepEqual(stackState(fresh), stackState(source));

  const earlier = createStack();
  advanceThrough(earlier, 2);
  const earlierBundle = createSkywayRoundCheckpointBundle({
    ...earlier,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  advanceOne(earlier);
  const laterSnapshot = snapshotSkywayRound(earlier.round);
  const laterToken = createSkywayRoundFinalityToken({
    ledger: earlier.replayEventLedger,
    roundSnapshot: laterSnapshot,
  });
  commitSkywayReplayEvents(earlier.replayEventLedger, {
    throughTick: 2,
    finalityToken: laterToken,
    roundSnapshot: laterSnapshot,
  });
  const before = stackState(earlier);
  assert.throws(() => restoreSkywayRoundCheckpointBundle({
    ...earlier,
    bundle: earlierBundle,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  }), /cannot restore behind committed presentation effects/);
  assert.deepEqual(stackState(earlier), before);
});
