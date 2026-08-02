import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySkywayAuthoritativeCorrection,
  SKYWAY_AUTHORITATIVE_CORRECTION_VERSION,
} from '../src/core/skyway-authoritative-correction.js';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
  lookupSkywayCommandTick,
} from '../src/core/skyway-command-journal.js';
import {
  appendSkywayReplayEventFrame,
  commitSkywayReplayEvents,
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
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
} from '../src/core/skyway-snapshot-history.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const SESSION = 'device-session:authoritative-correction';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});

function inputAt(participantId, tick, { wrong = false } = {}) {
  const playerCorrection = tick === 2 && participantId === 'player';
  return {
    ...IDLE,
    dirX: playerCorrection ? (wrong ? -0.7 : 0.7) : (
      participantId === 'player' ? 0.12 : -0.1
    ),
    dirZ: -0.9,
    moving: true,
    jumpHeld: tick === 3,
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
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const participantIds = ['player', 'bot'];
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    inputCapacityTicks: 5,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({ capacityTicks: 6 });
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
      capacityTicks: 5,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds,
      capacityTicks: 5,
    }),
  };
}

function advanceOne(
  stack,
  tick,
  {
    wrong = false,
    authorityFor = () => 'predicted',
  } = {},
) {
  const frame = stepSkywayRound(stack.round, {
    env: environmentForCourse(stack.round.course),
    inputFor: (participant) => inputAt(participant.id, tick, { wrong }),
  });
  appendSkywayCommandTick(stack.commandJournal, {
    roundEpoch: stack.commandJournal.roundEpoch,
    tick,
    commands: stack.round.participants.map((participant) => {
      const applied = frame.inputs.find(({ id }) => id === participant.id);
      return {
        participantId: participant.id,
        authority: applied ? authorityFor(participant.id, tick) : 'neutral',
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

function advanceThrough(stack, throughTick, options = {}) {
  while (stack.round.tick < throughTick) {
    const tick = stack.round.tick + 1;
    advanceOne(stack, tick, options);
  }
}

function checkpoint(stack) {
  return createSkywayRoundCheckpointBundle({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: stack.commandJournal.roundEpoch,
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

function correction() {
  return {
    tick: 2,
    participantId: 'player',
    input: inputAt('player', 2),
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

test('Skyway Authoritative Correction resimulates to the independent authoritative Round atomically', () => {
  const authoritative = createStack();
  const predicted = createStack();
  advanceThrough(authoritative, 4);
  advanceThrough(predicted, 4, { wrong: true });
  const base = checkpoint(predicted);
  const identities = {
    round: predicted.round,
    timeline: predicted.round.inputTimeline,
    history: predicted.snapshotHistory,
    journal: predicted.commandJournal,
    ledger: predicted.replayEventLedger,
  };

  const result = applySkywayAuthoritativeCorrection({
    ...predicted,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: base,
    correction: correction(),
    environmentForRound: ({ course }) => environmentForCourse(course),
  });

  assert.equal(result.version, SKYWAY_AUTHORITATIVE_CORRECTION_VERSION);
  assert.equal(result.kind, 'skyway-authoritative-correction');
  assert.equal(result.status, 'resimulated');
  assert.equal(result.accepted, true);
  assert.equal(result.changed, true);
  assert.equal(result.rollbackTick, 1);
  assert.equal(result.tickCount, 3);
  assert.equal(result.suppressPresentation, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.abortCheckpointHash, base.bundleHash);
  assert.equal(result.checkpointHash, result.checkpointBundle.bundleHash);

  assert.deepEqual(
    snapshotSkywayRound(predicted.round),
    snapshotSkywayRound(authoritative.round),
  );
  const predictedHead = lookupSkywaySnapshot(
    predicted.snapshotHistory,
    4,
    { roundEpoch: 1 },
  );
  const authoritativeHead = lookupSkywaySnapshot(
    authoritative.snapshotHistory,
    4,
    { roundEpoch: 1 },
  );
  assert.equal(predictedHead.hash, authoritativeHead.hash);
  assert.deepEqual(
    eventFrames(predicted.replayEventLedger),
    eventFrames(authoritative.replayEventLedger),
  );
  assert.equal(
    lookupSkywayCommandTick(
      predicted.commandJournal,
      2,
      { roundEpoch: 1 },
    ).commands[0].authority,
    'authoritative',
  );
  assertSkywayRoundFinalityToken(result.finalityToken, {
    ledger: predicted.replayEventLedger,
    roundSnapshot: snapshotSkywayRound(predicted.round),
  });

  assert.equal(predicted.round, identities.round);
  assert.equal(predicted.round.inputTimeline, identities.timeline);
  assert.equal(predicted.snapshotHistory, identities.history);
  assert.equal(predicted.commandJournal, identities.journal);
  assert.equal(predicted.replayEventLedger, identities.ledger);
});

test('Skyway Authoritative Correction upgrades matching provenance without resimulation and supports no-op retry', () => {
  const stack = createStack();
  advanceThrough(stack, 4);
  const base = checkpoint(stack);
  const before = stackState(stack);
  const first = applySkywayAuthoritativeCorrection({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: base,
    correction: correction(),
  });
  assert.equal(first.status, 'authority-upgraded');
  assert.equal(first.changed, false);
  assert.equal(first.tickCount, 0);
  assert.equal(first.finalityToken, null);
  assert.deepEqual(snapshotSkywayRound(stack.round), before.round);
  assert.deepEqual(stack.snapshotHistory, before.snapshotHistory);
  assert.deepEqual(stack.replayEventLedger, before.replayEventLedger);
  assert.equal(
    lookupSkywayCommandTick(stack.commandJournal, 2, { roundEpoch: 1 })
      .commands[0].authority,
    'authoritative',
  );

  const afterUpgrade = stackState(stack);
  const retried = applySkywayAuthoritativeCorrection({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: first.checkpointBundle,
    correction: correction(),
  });
  assert.equal(retried.status, 'no-op');
  assert.equal(retried.accepted, false);
  assert.equal(retried.reason, 'duplicate');
  assert.deepEqual(stackState(stack), afterUpgrade);

  assert.throws(() => applySkywayAuthoritativeCorrection({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: base,
    correction: correction(),
  }), /base is stale/);
  assert.deepEqual(stackState(stack), afterUpgrade);
});

test('Skyway Authoritative Correction aborts environment and committed-window failures without live mutation', () => {
  const environmentFailure = createStack();
  advanceThrough(environmentFailure, 4, { wrong: true });
  const environmentBase = checkpoint(environmentFailure);
  const environmentBefore = stackState(environmentFailure);
  assert.throws(() => applySkywayAuthoritativeCorrection({
    ...environmentFailure,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: environmentBase,
    correction: correction(),
    environmentForRound() {
      throw new Error('deterministic environment failed');
    },
  }), /deterministic environment failed/);
  assert.deepEqual(stackState(environmentFailure), environmentBefore);

  const committed = createStack();
  advanceThrough(committed, 4, { wrong: true });
  const roundSnapshot = snapshotSkywayRound(committed.round);
  const token = createSkywayRoundFinalityToken({
    ledger: committed.replayEventLedger,
    roundSnapshot,
  });
  commitSkywayReplayEvents(committed.replayEventLedger, {
    throughTick: 2,
    finalityToken: token,
    roundSnapshot,
  });
  const committedBase = checkpoint(committed);
  const committedBefore = stackState(committed);
  assert.throws(() => applySkywayAuthoritativeCorrection({
    ...committed,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: committedBase,
    correction: correction(),
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /already committed across the rollback tick/);
  assert.deepEqual(stackState(committed), committedBefore);
});

test('Skyway Authoritative Correction rejects conflict, cross-incarnation, and prior-round work atomically', () => {
  const conflict = createStack();
  advanceThrough(conflict, 4, {
    wrong: true,
    authorityFor(participantId, tick) {
      return participantId === 'player' && tick === 2
        ? 'authoritative'
        : 'predicted';
    },
  });
  const conflictBase = checkpoint(conflict);
  const conflictBefore = stackState(conflict);
  assert.throws(() => applySkywayAuthoritativeCorrection({
    ...conflict,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: conflictBase,
    correction: correction(),
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /authoritative-conflict/);
  assert.deepEqual(stackState(conflict), conflictBefore);

  const crossSession = createStack();
  advanceThrough(crossSession, 4, { wrong: true });
  const crossSessionBase = checkpoint(crossSession);
  const crossSessionBefore = stackState(crossSession);
  assert.throws(() => applySkywayAuthoritativeCorrection({
    ...crossSession,
    sessionIncarnation: 'device-session:other',
    roundEpoch: 1,
    baseCheckpointBundle: crossSessionBase,
    correction: correction(),
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /session incarnation is stale/);
  assert.deepEqual(stackState(crossSession), crossSessionBefore);

  resetSkywayRoundLifecycle({ ...crossSession, roundEpoch: 1 });
  advanceThrough(crossSession, 4, { wrong: true });
  const priorRoundBefore = stackState(crossSession);
  assert.throws(() => applySkywayAuthoritativeCorrection({
    ...crossSession,
    sessionIncarnation: SESSION,
    roundEpoch: 2,
    baseCheckpointBundle: crossSessionBase,
    correction: correction(),
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /round epoch is stale/);
  assert.deepEqual(stackState(crossSession), priorRoundBefore);
});
