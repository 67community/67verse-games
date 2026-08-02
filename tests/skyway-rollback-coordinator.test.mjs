import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
  replaceSkywayJournalCommand,
} from '../src/core/skyway-command-journal.js';
import {
  SKYWAY_ROLLBACK_COORDINATOR_VERSION,
  coordinateSkywayRollback,
} from '../src/core/skyway-rollback-coordinator.js';
import {
  appendSkywayReplayEventFrame,
  commitSkywayReplayEvents,
  createSkywayReplayEventLedger,
  replaceSkywayReplayEventRange,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  createSkywayRoundFinalityToken,
} from '../src/core/skyway-round-finality.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
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

const IDLE = {
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
};
const ROUND_EPOCH = 1;

function inputAt(participantId, tick) {
  const lane = participantId === 'player' ? 0.15 : -0.1;
  return {
    ...IDLE,
    dirX: tick === 2 && participantId === 'player' ? 0.7 : lane,
    dirZ: -0.9,
    moving: true,
    jumpHeld: tick === 3,
  };
}

function createRoundFixture() {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    inputCapacityTicks: 3,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
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
  stepSkywayRound(round, { env, includeSnapshot: false });
  return { round, env };
}

function createRollbackFixture({
  historyCapacity = 4,
  occupiedRollback = false,
  roundEpoch = ROUND_EPOCH,
} = {}) {
  const authoritative = createRoundFixture();
  const predicted = createRoundFixture();
  const history = createSkywaySnapshotHistory({
    capacityTicks: historyCapacity,
    roundEpoch,
  });
  const journal = createSkywayCommandJournal({
    participantIds: predicted.round.participants.map((participant) => participant.id),
    capacityTicks: 3,
    roundEpoch,
  });
  if (occupiedRollback) {
    predicted.round.inputTimeline.slots[0] = {
      tick: 3,
      inputs: new Map([['player', inputAt('player', 3)]]),
    };
  }
  recordSkywaySnapshot(
    history,
    snapshotSkywayRound(predicted.round),
    { roundEpoch },
  );

  const authoritativeFrames = new Map();
  const predictedFrames = new Map();
  for (let tick = 2; tick <= 4; tick++) {
    const authoritativeFrame = stepSkywayRound(authoritative.round, {
      env: authoritative.env,
      inputFor: (participant) => inputAt(participant.id, tick),
    });
    const predictedFrame = stepSkywayRound(predicted.round, {
      env: predicted.env,
      inputFor(participant) {
        return tick === 2 && participant.id === 'player'
          ? { ...inputAt(participant.id, tick), dirX: -0.7 }
          : inputAt(participant.id, tick);
      },
    });
    authoritativeFrames.set(tick, {
      tick: authoritativeFrame.tick,
      inputs: authoritativeFrame.inputs,
      events: authoritativeFrame.events,
    });
    predictedFrames.set(tick, {
      tick: predictedFrame.tick,
      events: predictedFrame.events,
    });
    appendSkywayCommandTick(journal, {
      roundEpoch,
      tick,
      commands: predictedFrame.inputs.map(({ id, input }) => ({
        participantId: id,
        authority: 'predicted',
        input,
      })),
    });
    recordSkywaySnapshot(
      history,
      predictedFrame.snapshot,
      { roundEpoch },
    );
  }
  replaceSkywayJournalCommand(journal, {
    roundEpoch,
    tick: 2,
    participantId: 'player',
    authority: 'authoritative',
    input: inputAt('player', 2),
  });
  return {
    authoritative,
    predicted,
    history,
    journal,
    authoritativeFrames,
    predictedFrames,
  };
}

function retainedHistory(history) {
  const entries = [];
  if (history.oldestTick === null) return entries;
  for (let tick = history.oldestTick; tick <= history.latestTick; tick++) {
    entries.push(lookupSkywaySnapshot(history, tick, {
      roundEpoch: history.roundEpoch,
    }));
  }
  return entries;
}

test('Skyway Rollback Coordinator restores, reconstructs, and returns a suppression envelope', () => {
  const fixture = createRollbackFixture();
  const eventLedger = createSkywayReplayEventLedger({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
    nextTick: 2,
  });
  for (const frame of fixture.predictedFrames.values()) {
    appendSkywayReplayEventFrame(eventLedger, frame);
  }
  const envelope = coordinateSkywayRollback({
    round: fixture.predicted.round,
    snapshotHistory: fixture.history,
    commandJournal: fixture.journal,
    roundEpoch: ROUND_EPOCH,
    rollbackTick: 1,
    throughTick: 4,
  });

  assert.deepEqual(envelope, {
    version: SKYWAY_ROLLBACK_COORDINATOR_VERSION,
    kind: 'skyway-resimulation',
    roundEpoch: ROUND_EPOCH,
    rollbackTick: 1,
    fromTick: 2,
    throughTick: 4,
    tickCount: 3,
    commandCount: 6,
    restoredSnapshotHash: lookupSkywaySnapshot(
      fixture.history,
      1,
      { roundEpoch: ROUND_EPOCH },
    ).hash,
    suppressPresentation: true,
  });
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(fixture.predicted.round.tick, 1);
  assert.equal(fixture.predicted.round.inputTimeline.nextTick, 2);
  assert.equal(fixture.history.latestTick, 1);

  let publishedPresentationEvents = 0;
  const resimulatedEventFrames = [];
  for (let tick = envelope.fromTick; tick <= envelope.throughTick; tick++) {
    const frame = stepSkywayRound(fixture.predicted.round, {
      env: fixture.predicted.env,
    });
    if (!envelope.suppressPresentation) {
      publishedPresentationEvents += frame.events.length;
    }
    assert.deepEqual({
      tick: frame.tick,
      inputs: frame.inputs,
      events: frame.events,
    }, fixture.authoritativeFrames.get(tick));
    resimulatedEventFrames.push({ tick: frame.tick, events: frame.events });
    recordSkywaySnapshot(
      fixture.history,
      frame.snapshot,
      { roundEpoch: ROUND_EPOCH },
    );
  }
  assert.equal(publishedPresentationEvents, 0);
  const finalRoundSnapshot = snapshotSkywayRound(fixture.predicted.round);
  const replacementToken = createSkywayRoundFinalityToken({
    ledger: eventLedger,
    roundSnapshot: finalRoundSnapshot,
  });
  replaceSkywayReplayEventRange(eventLedger, {
    resimulationEnvelope: envelope,
    finalityToken: replacementToken,
    roundSnapshot: finalRoundSnapshot,
    frames: resimulatedEventFrames,
  });
  const commitToken = createSkywayRoundFinalityToken({
    ledger: eventLedger,
    roundSnapshot: finalRoundSnapshot,
  });
  const committedEvents = commitSkywayReplayEvents(eventLedger, {
    throughTick: envelope.throughTick,
    finalityToken: commitToken,
    roundSnapshot: finalRoundSnapshot,
  });
  assert.deepEqual(
    committedEvents.frames,
    [...fixture.authoritativeFrames.values()].map(({ tick, events }) => ({
      tick,
      events,
    })),
  );
  assert.deepEqual(
    snapshotSkywayRound(fixture.predicted.round),
    snapshotSkywayRound(fixture.authoritative.round),
  );
});

test('Skyway Rollback Coordinator rejects capacity, coverage, and occupied-range mismatches atomically', () => {
  for (const scenario of [
    {
      name: 'capacity',
      fixture: createRollbackFixture({ historyCapacity: 3 }),
      rollbackTick: 1,
      pattern: /retention capacities/,
    },
    {
      name: 'coverage',
      fixture: createRollbackFixture(),
      rollbackTick: 0,
      pattern: /outside retained coverage/,
    },
    {
      name: 'occupied restored range',
      fixture: createRollbackFixture({ occupiedRollback: true }),
      rollbackTick: 1,
      pattern: /empty restored input timeline range/,
    },
  ]) {
    const beforeRound = snapshotSkywayRound(scenario.fixture.predicted.round);
    const beforeHistory = retainedHistory(scenario.fixture.history);
    assert.throws(() => coordinateSkywayRollback({
      round: scenario.fixture.predicted.round,
      snapshotHistory: scenario.fixture.history,
      commandJournal: scenario.fixture.journal,
      roundEpoch: ROUND_EPOCH,
      rollbackTick: scenario.rollbackTick,
      throughTick: 4,
    }), scenario.pattern, scenario.name);
    assert.deepEqual(snapshotSkywayRound(scenario.fixture.predicted.round), beforeRound);
    assert.deepEqual(retainedHistory(scenario.fixture.history), beforeHistory);
  }
});

test('Skyway Rollback Coordinator rejects malformed reconstruction before commit', () => {
  const fixture = createRollbackFixture();
  const beforeRound = snapshotSkywayRound(fixture.predicted.round);
  const beforeHistory = retainedHistory(fixture.history);
  const firstSlot = fixture.journal.slots[2 % fixture.journal.capacityTicks];
  firstSlot.commands[0].input.dirX = Number.NaN;

  assert.throws(() => coordinateSkywayRollback({
    round: fixture.predicted.round,
    snapshotHistory: fixture.history,
    commandJournal: fixture.journal,
    roundEpoch: ROUND_EPOCH,
    rollbackTick: 1,
    throughTick: 4,
  }), /Invalid Skyway tick input/);
  assert.deepEqual(snapshotSkywayRound(fixture.predicted.round), beforeRound);
  assert.deepEqual(retainedHistory(fixture.history), beforeHistory);
});

test('Skyway Rollback Coordinator rejects a prior-round same-tick request atomically', () => {
  const fixture = createRollbackFixture({ roundEpoch: 2 });
  const beforeRound = snapshotSkywayRound(fixture.predicted.round);
  const beforeHistory = structuredClone(fixture.history);
  const beforeJournal = structuredClone(fixture.journal);

  assert.throws(() => coordinateSkywayRollback({
    round: fixture.predicted.round,
    snapshotHistory: fixture.history,
    commandJournal: fixture.journal,
    roundEpoch: ROUND_EPOCH,
    rollbackTick: 1,
    throughTick: 4,
  }), /round epochs/);
  assert.deepEqual(snapshotSkywayRound(fixture.predicted.round), beforeRound);
  assert.deepEqual(fixture.history, beforeHistory);
  assert.deepEqual(fixture.journal, beforeJournal);

  const currentEnvelope = coordinateSkywayRollback({
    round: fixture.predicted.round,
    snapshotHistory: fixture.history,
    commandJournal: fixture.journal,
    roundEpoch: 2,
    rollbackTick: 1,
    throughTick: 4,
  });
  assert.equal(currentEnvelope.roundEpoch, 2);
  assert.equal(currentEnvelope.rollbackTick, 1);
});
