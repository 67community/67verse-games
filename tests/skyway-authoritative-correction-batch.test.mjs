import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySkywayAuthoritativeCorrectionBatch,
  SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY,
  SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_VERSION,
} from '../src/core/skyway-authoritative-correction.js';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
  lookupSkywayCommandTick,
} from '../src/core/skyway-command-journal.js';
import {
  appendSkywayReplayEventFrame,
  createSkywayReplayEventLedger,
  lookupSkywayReplayEventFrame,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import {
  createSkywayRoundCheckpointBundle,
} from '../src/core/skyway-round-checkpoint.js';
import {
  assertSkywayRoundFinalityToken,
} from '../src/core/skyway-round-finality.js';
import {
  createSkywayRound,
  snapshotSkywayRound,
  stepSkywayRound,
} from '../src/core/skyway-round.js';
import {
  createSkywaySnapshotHistory,
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
} from '../src/core/skyway-snapshot-history.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const SESSION = 'device-session:authoritative-correction-batch';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});

function canonicalInput(participantId, tick) {
  return {
    ...IDLE,
    dirX: participantId === 'player'
      ? 0.1 + tick * 0.04
      : -0.08 - tick * 0.03,
    dirZ: -0.84,
    moving: true,
    jumpHeld: tick === 3,
  };
}

function changedInput(participantId, tick) {
  const input = canonicalInput(participantId, tick);
  return {
    ...input,
    dirX: -input.dirX,
    jumpHeld: !input.jumpHeld,
  };
}

function environmentForCourse(course) {
  return {
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
}

function createStack() {
  const participantIds = ['player', 'bot'];
  const round = createSkywayRound({
    course: createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION),
    countdownTicks: 1,
    inputCapacityTicks: 6,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({ capacityTicks: 7 });
  recordSkywaySnapshot(
    snapshotHistory,
    snapshotSkywayRound(round),
    { roundEpoch: 1 },
  );
  return {
    round,
    snapshotHistory,
    commandJournal: createSkywayCommandJournal({
      participantIds,
      capacityTicks: 6,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds,
      capacityTicks: 6,
    }),
  };
}

function advanceThrough(
  stack,
  throughTick,
  {
    wrongKeys = new Set(),
    authoritativeKeys = new Set(),
  } = {},
) {
  while (stack.round.tick < throughTick) {
    const tick = stack.round.tick + 1;
    const frame = stepSkywayRound(stack.round, {
      env: environmentForCourse(stack.round.course),
      inputFor(participant) {
        const key = `${tick}:${participant.id}`;
        return wrongKeys.has(key)
          ? changedInput(participant.id, tick)
          : canonicalInput(participant.id, tick);
      },
    });
    appendSkywayCommandTick(stack.commandJournal, {
      roundEpoch: 1,
      tick,
      commands: stack.round.participants.map((participant) => {
        const applied = frame.inputs.find(({ id }) => id === participant.id);
        const key = `${tick}:${participant.id}`;
        return {
          participantId: participant.id,
          authority: applied
            ? (authoritativeKeys.has(key) ? 'authoritative' : 'predicted')
            : 'neutral',
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
      { roundEpoch: 1 },
    );
  }
}

function checkpoint(stack) {
  return createSkywayRoundCheckpointBundle({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
}

function stackState(stack) {
  return {
    round: snapshotSkywayRound(stack.round),
    snapshotHistory: structuredClone(stack.snapshotHistory),
    commandJournal: structuredClone(stack.commandJournal),
    replayEventLedger: structuredClone(stack.replayEventLedger),
  };
}

function correction(tick, participantId) {
  return {
    tick,
    participantId,
    input: canonicalInput(participantId, tick),
  };
}

function eventFrames(ledger) {
  const frames = [];
  if (ledger.oldestTick === null) return frames;
  for (let tick = ledger.oldestTick; tick <= ledger.latestTick; tick++) {
    frames.push(lookupSkywayReplayEventFrame(ledger, tick));
  }
  return frames;
}

function applyBatch(stack, baseCheckpointBundle, corrections, overrides = {}) {
  return applySkywayAuthoritativeCorrectionBatch({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle,
    corrections,
    environmentForRound: ({ course }) => environmentForCourse(course),
    ...overrides,
  });
}

test('Skyway Authoritative Correction Batch canonicalizes, deduplicates, and resimulates once from the earliest change', () => {
  const wrongKeys = new Set(['2:player', '3:bot', '4:player']);
  const authoritative = createStack();
  const predicted = createStack();
  advanceThrough(authoritative, 5);
  advanceThrough(predicted, 5, { wrongKeys });
  const base = checkpoint(predicted);
  const ledgerRevision = predicted.replayEventLedger.revision;
  let environmentCalls = 0;

  const result = applyBatch(predicted, base, [
    correction(4, 'player'),
    correction(2, 'player'),
    correction(3, 'bot'),
    correction(2, 'player'),
  ], {
    environmentForRound({ course }) {
      environmentCalls += 1;
      return environmentForCourse(course);
    },
  });

  assert.equal(result.version, SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_VERSION);
  assert.equal(result.kind, 'skyway-authoritative-correction-batch');
  assert.equal(result.status, 'resimulated');
  assert.equal(result.accepted, true);
  assert.equal(result.inputCount, 4);
  assert.equal(result.correctionCount, 3);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.appliedCount, 3);
  assert.equal(result.changedCount, 3);
  assert.equal(result.earliestRollbackTick, 1);
  assert.equal(result.tickCount, 4);
  assert.equal(result.suppressPresentation, true);
  assert.equal(environmentCalls, 1);
  assert.deepEqual(
    result.corrections.map(({ tick, participantId, status }) => ({
      tick,
      participantId,
      status,
    })),
    [
      { tick: 2, participantId: 'player', status: 'resimulated' },
      { tick: 3, participantId: 'bot', status: 'resimulated' },
      { tick: 4, participantId: 'player', status: 'resimulated' },
    ],
  );
  assert.equal(
    predicted.replayEventLedger.revision,
    ledgerRevision + 1,
  );
  assert.deepEqual(
    snapshotSkywayRound(predicted.round),
    snapshotSkywayRound(authoritative.round),
  );
  assert.equal(
    lookupSkywaySnapshot(predicted.snapshotHistory, 5, { roundEpoch: 1 }).hash,
    lookupSkywaySnapshot(authoritative.snapshotHistory, 5, { roundEpoch: 1 }).hash,
  );
  assert.deepEqual(
    eventFrames(predicted.replayEventLedger),
    eventFrames(authoritative.replayEventLedger),
  );
  assertSkywayRoundFinalityToken(result.finalityToken, {
    ledger: predicted.replayEventLedger,
    roundSnapshot: snapshotSkywayRound(predicted.round),
  });
  assert.equal(result.checkpointHash, result.checkpointBundle.bundleHash);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.corrections), true);
});

test('Skyway Authoritative Correction Batch output is permutation deterministic after normalized deduplication', () => {
  const first = createStack();
  const second = createStack();
  const wrongKeys = new Set(['2:player', '3:bot']);
  advanceThrough(first, 5, { wrongKeys });
  advanceThrough(second, 5, { wrongKeys });
  const firstBase = checkpoint(first);
  const secondBase = checkpoint(second);
  const unitCorrection = {
    tick: 2,
    participantId: 'player',
    input: {
      ...IDLE,
      dirX: 1,
      dirZ: 0,
      moving: true,
    },
  };
  const normalizedDuplicate = {
    tick: 2,
    participantId: 'player',
    input: {
      ...unitCorrection.input,
      dirX: 2,
    },
  };

  const firstResult = applyBatch(first, firstBase, [
    correction(3, 'bot'),
    normalizedDuplicate,
    unitCorrection,
  ]);
  const secondResult = applyBatch(second, secondBase, [
    unitCorrection,
    correction(3, 'bot'),
    normalizedDuplicate,
  ]);

  assert.deepEqual(firstResult, secondResult);
  assert.deepEqual(stackState(first), stackState(second));
  assert.equal(firstResult.duplicateCount, 1);
});

test('Skyway Authoritative Correction Batch combines changed, provenance-only, and existing-authority entries', () => {
  const stack = createStack();
  advanceThrough(stack, 5, {
    wrongKeys: new Set(['2:player']),
    authoritativeKeys: new Set(['4:bot']),
  });
  const base = checkpoint(stack);
  const historyBefore = structuredClone(stack.snapshotHistory);
  let environmentCalls = 0;

  const result = applyBatch(stack, base, [
    correction(4, 'bot'),
    correction(3, 'player'),
    correction(2, 'player'),
  ], {
    environmentForRound({ course }) {
      environmentCalls += 1;
      return environmentForCourse(course);
    },
  });

  assert.equal(result.status, 'resimulated');
  assert.equal(result.appliedCount, 2);
  assert.equal(result.changedCount, 1);
  assert.equal(result.earliestRollbackTick, 1);
  assert.equal(environmentCalls, 1);
  assert.deepEqual(
    result.corrections.map(({ tick, participantId, status, accepted }) => ({
      tick,
      participantId,
      status,
      accepted,
    })),
    [
      {
        tick: 2,
        participantId: 'player',
        status: 'resimulated',
        accepted: true,
      },
      {
        tick: 3,
        participantId: 'player',
        status: 'authority-upgraded',
        accepted: true,
      },
      {
        tick: 4,
        participantId: 'bot',
        status: 'no-op',
        accepted: false,
      },
    ],
  );
  assert.notDeepEqual(stack.snapshotHistory, historyBefore);
  assert.equal(
    lookupSkywayCommandTick(stack.commandJournal, 3, { roundEpoch: 1 })
      .commands[0].authority,
    'authoritative',
  );
});

test('Skyway Authoritative Correction Batch skips resimulation for upgrades and all-no-op retries', () => {
  const stack = createStack();
  advanceThrough(stack, 5);
  const base = checkpoint(stack);
  const roundBefore = snapshotSkywayRound(stack.round);
  const historyBefore = structuredClone(stack.snapshotHistory);
  const ledgerBefore = structuredClone(stack.replayEventLedger);
  const corrections = [correction(3, 'bot'), correction(2, 'player')];
  const failIfCalled = () => {
    throw new Error('environment must not be called');
  };

  const upgraded = applyBatch(stack, base, corrections, {
    environmentForRound: failIfCalled,
  });
  assert.equal(upgraded.status, 'authority-upgraded');
  assert.equal(upgraded.accepted, true);
  assert.equal(upgraded.appliedCount, 2);
  assert.equal(upgraded.changedCount, 0);
  assert.equal(upgraded.tickCount, 0);
  assert.equal(upgraded.finalityToken, null);
  assert.equal(upgraded.eventReplacement, null);
  assert.equal(upgraded.suppressPresentation, false);
  assert.deepEqual(snapshotSkywayRound(stack.round), roundBefore);
  assert.deepEqual(stack.snapshotHistory, historyBefore);
  assert.deepEqual(stack.replayEventLedger, ledgerBefore);

  const afterUpgrade = stackState(stack);
  const retried = applyBatch(
    stack,
    upgraded.checkpointBundle,
    corrections,
    { environmentForRound: failIfCalled },
  );
  assert.equal(retried.status, 'no-op');
  assert.equal(retried.accepted, false);
  assert.equal(retried.appliedCount, 0);
  assert.equal(retried.changedCount, 0);
  assert.equal(retried.checkpointHash, upgraded.checkpointHash);
  assert.deepEqual(stackState(stack), afterUpgrade);
});

test('Skyway Authoritative Correction Batch rejects conflicts, coverage, capacity, and resimulation failures atomically', () => {
  const cases = [
    {
      name: 'intra-batch conflict',
      prepare: {},
      corrections: [
        correction(2, 'player'),
        {
          ...correction(2, 'player'),
          input: changedInput('player', 2),
        },
      ],
      pattern: /deterministic conflict/,
    },
    {
      name: 'late authoritative conflict',
      prepare: {
        wrongKeys: new Set(['2:player', '3:bot']),
        authoritativeKeys: new Set(['3:bot']),
      },
      corrections: [correction(2, 'player'), correction(3, 'bot')],
      pattern: /authoritative-conflict/,
    },
    {
      name: 'unavailable coverage',
      prepare: { wrongKeys: new Set(['2:player']) },
      corrections: [correction(2, 'player'), correction(99, 'bot')],
      pattern: /unavailable/,
    },
    {
      name: 'capacity overflow',
      prepare: {},
      corrections: Array.from(
        { length: SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY + 1 },
        () => correction(2, 'player'),
      ),
      pattern: /requires 1-32 corrections/,
    },
  ];

  for (const scenario of cases) {
    const stack = createStack();
    advanceThrough(stack, 5, scenario.prepare);
    const base = checkpoint(stack);
    const before = stackState(stack);
    assert.throws(
      () => applyBatch(stack, base, scenario.corrections),
      scenario.pattern,
      scenario.name,
    );
    assert.deepEqual(stackState(stack), before, scenario.name);
  }

  const environmentFailure = createStack();
  advanceThrough(environmentFailure, 5, {
    wrongKeys: new Set(['2:player', '3:bot']),
  });
  const environmentBase = checkpoint(environmentFailure);
  const environmentBefore = stackState(environmentFailure);
  assert.throws(() => applyBatch(
    environmentFailure,
    environmentBase,
    [correction(2, 'player'), correction(3, 'bot')],
    {
      environmentForRound() {
        throw new Error('batch environment failed');
      },
    },
  ), /batch environment failed/);
  assert.deepEqual(stackState(environmentFailure), environmentBefore);
});
