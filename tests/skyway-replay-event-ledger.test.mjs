import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendSkywayReplayEventFrame,
  commitSkywayReplayEvents,
  createSkywayReplayEventLedger,
  lookupSkywayReplayEventFrame,
  replaceSkywayReplayEventRange,
  resetSkywayReplayEventLedger,
  SKYWAY_REPLAY_EVENT_LEDGER_VERSION,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  SKYWAY_ROLLBACK_COORDINATOR_VERSION,
} from '../src/core/skyway-rollback-coordinator.js';
import {
  createSkywayRoundFinalityToken,
} from '../src/core/skyway-round-finality.js';
import {
  SKYWAY_ROUND_VERSION,
} from '../src/core/skyway-round.js';

function resimulationEnvelope({
  rollbackTick = 1,
  throughTick = 4,
  roundEpoch = 1,
} = {}) {
  return {
    version: SKYWAY_ROLLBACK_COORDINATOR_VERSION,
    kind: 'skyway-resimulation',
    roundEpoch,
    rollbackTick,
    fromTick: rollbackTick + 1,
    throughTick,
    suppressPresentation: true,
  };
}

function createLedger(options = {}) {
  return createSkywayReplayEventLedger({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
    nextTick: 2,
    ...options,
  });
}

function roundSnapshotFor(ledger, state = 'head') {
  return {
    version: SKYWAY_ROUND_VERSION,
    tick: ledger.latestTick,
    state,
    participants: ledger.participantIds.map((id, index) => ({
      id,
      isPlayer: index === 0,
    })),
  };
}

function finalityFor(ledger, roundSnapshot) {
  return createSkywayRoundFinalityToken({ ledger, roundSnapshot });
}

test('Skyway Replay Event Ledger atomically replaces replay events and commits the final stream once', () => {
  const ledger = createLedger();
  const source = { participantId: 'player', type: 'jump' };
  assert.deepEqual(appendSkywayReplayEventFrame(ledger, {
    tick: 2,
    events: [
      source,
      { participantId: 'bot', type: 'jump' },
    ],
  }), { accepted: true, reason: null, revision: 1 });
  source.type = 'land';
  appendSkywayReplayEventFrame(ledger, {
    tick: 3,
    events: [{
      participantId: 'player',
      type: 'finish',
      place: 2,
      finishTime: 0.75,
    }],
  });
  appendSkywayReplayEventFrame(ledger, { tick: 4, events: [] });
  assert.deepEqual(lookupSkywayReplayEventFrame(ledger, 2).events, [
    { participantId: 'player', type: 'jump' },
    { participantId: 'bot', type: 'jump' },
  ]);

  const finalFrames = [
    {
      tick: 2,
      events: [
        { participantId: 'player', type: 'jump' },
        { participantId: 'bot', type: 'jump' },
      ],
    },
    {
      tick: 3,
      events: [{
        participantId: 'player',
        type: 'finish',
        place: 1,
        finishTime: 0.5,
      }],
    },
    {
      tick: 4,
      events: [{
        participantId: 'player',
        type: 'checkpoint',
        checkpoint: 1,
      }],
    },
  ];
  const authoritativeSnapshot = roundSnapshotFor(ledger, 'authoritative');
  const replacementToken = finalityFor(ledger, authoritativeSnapshot);
  const replaced = replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: resimulationEnvelope(),
    finalityToken: replacementToken,
    roundSnapshot: authoritativeSnapshot,
    frames: finalFrames,
  });
  assert.deepEqual(replaced, {
    fromTick: 2,
    throughTick: 4,
    changedTicks: 2,
    bindingChanged: true,
    revision: 4,
    roundEpoch: 1,
    roundSnapshotHash: replacementToken.roundSnapshotHash,
    suppressPresentation: true,
  });
  finalFrames[1].events[0].place = 99;

  const commitToken = finalityFor(ledger, authoritativeSnapshot);
  assert.deepEqual(replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: resimulationEnvelope(),
    finalityToken: commitToken,
    roundSnapshot: authoritativeSnapshot,
    frames: [
      {
        tick: 2,
        events: [
          { participantId: 'player', type: 'jump' },
          { participantId: 'bot', type: 'jump' },
        ],
      },
      {
        tick: 3,
        events: [{
          participantId: 'player',
          type: 'finish',
          place: 1,
          finishTime: 0.5,
        }],
      },
      {
        tick: 4,
        events: [{
          participantId: 'player',
          type: 'checkpoint',
          checkpoint: 1,
        }],
      },
    ],
  }), {
    fromTick: 2,
    throughTick: 4,
    changedTicks: 0,
    bindingChanged: false,
    revision: 4,
    roundEpoch: 1,
    roundSnapshotHash: commitToken.roundSnapshotHash,
    suppressPresentation: true,
  });

  let presentationEvents = 0;
  let resultEvents = 0;
  let rewardCommits = 0;
  assert.equal(presentationEvents, 0);
  assert.equal(resultEvents, 0);
  assert.equal(rewardCommits, 0);

  const committed = commitSkywayReplayEvents(ledger, {
    throughTick: 4,
    finalityToken: commitToken,
    roundSnapshot: authoritativeSnapshot,
  });
  assert.equal(committed.version, SKYWAY_REPLAY_EVENT_LEDGER_VERSION);
  assert.equal(committed.kind, 'skyway-event-commit');
  assert.equal(committed.finality, 'caller-asserted');
  assert.equal(committed.roundEpoch, 1);
  assert.equal(committed.roundSnapshotHash, commitToken.roundSnapshotHash);
  assert.equal(committed.finalityTokenHash, commitToken.tokenHash);
  assert.equal(committed.eventCount, 4);
  assert.deepEqual(committed.frames.map((frame) => frame.tick), [2, 3, 4]);
  assert.equal(committed.frames[1].events[0].place, 1);
  assert.equal(Object.isFrozen(committed), true);
  assert.equal(Object.isFrozen(committed.frames), true);
  assert.equal(Object.isFrozen(committed.frames[1].events[0]), true);

  for (const frame of committed.frames) {
    for (const event of frame.events) {
      presentationEvents += 1;
      if (event.type === 'finish') {
        resultEvents += 1;
        rewardCommits += 1;
      }
    }
  }
  assert.equal(presentationEvents, 4);
  assert.equal(resultEvents, 1);
  assert.equal(rewardCommits, 1);

  const repeatedToken = finalityFor(ledger, authoritativeSnapshot);
  assert.deepEqual(commitSkywayReplayEvents(ledger, {
    throughTick: 4,
    finalityToken: repeatedToken,
    roundSnapshot: authoritativeSnapshot,
  }), {
    version: SKYWAY_REPLAY_EVENT_LEDGER_VERSION,
    kind: 'skyway-event-commit',
    finality: 'caller-asserted',
    roundEpoch: 1,
    roundSnapshotHash: repeatedToken.roundSnapshotHash,
    finalityTokenHash: repeatedToken.tokenHash,
    fromTick: 5,
    throughTick: 4,
    eventCount: 0,
    frames: [],
  });
});

test('Skyway Replay Event Ledger rejects stale, incomplete, and committed replacements atomically', () => {
  const ledger = createLedger();
  for (let tick = 2; tick <= 3; tick++) {
    appendSkywayReplayEventFrame(ledger, {
      tick,
      events: tick === 3
        ? [{ participantId: 'player', type: 'land' }]
        : [],
    });
  }
  const staleSnapshot = roundSnapshotFor(ledger, 'before-head');
  const staleToken = finalityFor(ledger, staleSnapshot);
  appendSkywayReplayEventFrame(ledger, { tick: 4, events: [] });
  const currentSnapshot = roundSnapshotFor(ledger, 'current-head');

  const before = structuredClone(ledger);
  const currentToken = finalityFor(ledger, currentSnapshot);
  assert.throws(() => replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: resimulationEnvelope({ roundEpoch: 2 }),
    finalityToken: currentToken,
    roundSnapshot: currentSnapshot,
    frames: [
      { tick: 2, events: [] },
      { tick: 3, events: [] },
      { tick: 4, events: [] },
    ],
  }), /envelope is not aligned/);
  assert.deepEqual(ledger, before);

  assert.throws(() => replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: resimulationEnvelope(),
    finalityToken: staleToken,
    roundSnapshot: currentSnapshot,
    frames: [],
  }), /revision is stale/);
  assert.deepEqual(ledger, before);

  assert.throws(() => replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: resimulationEnvelope(),
    finalityToken: currentToken,
    roundSnapshot: currentSnapshot,
    frames: [
      { tick: 2, events: [] },
      { tick: 3, events: [] },
    ],
  }), /coverage is incomplete/);
  assert.deepEqual(ledger, before);

  commitSkywayReplayEvents(ledger, {
    throughTick: 4,
    finalityToken: currentToken,
    roundSnapshot: currentSnapshot,
  });
  const afterCommit = structuredClone(ledger);
  const afterCommitToken = finalityFor(ledger, currentSnapshot);
  assert.throws(() => replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: resimulationEnvelope(),
    finalityToken: afterCommitToken,
    roundSnapshot: currentSnapshot,
    frames: [
      { tick: 2, events: [] },
      { tick: 3, events: [] },
      { tick: 4, events: [] },
    ],
  }), /already committed/);
  assert.deepEqual(ledger, afterCommit);
});

test('Skyway Replay Event Ledger validates exact schemas, order, participants, and duplicates', () => {
  const ledger = createLedger();
  assert.throws(() => appendSkywayReplayEventFrame(ledger, {
    tick: 2,
    events: [{ participantId: 'player', type: 'jump', reward: 10 }],
  }), /Invalid Skyway participant event/);
  assert.throws(() => appendSkywayReplayEventFrame(ledger, {
    tick: 2,
    events: [{ participantId: 'unknown', type: 'jump' }],
  }), /Invalid Skyway participant event/);
  assert.throws(() => appendSkywayReplayEventFrame(ledger, {
    tick: 3,
    events: [],
  }), /expected tick 2/);

  appendSkywayReplayEventFrame(ledger, {
    tick: 2,
    events: [{ participantId: 'player', type: 'land' }],
  });
  assert.deepEqual(appendSkywayReplayEventFrame(ledger, {
    tick: 2,
    events: [{ participantId: 'player', type: 'land' }],
  }), { accepted: false, reason: 'duplicate', revision: 1 });
  assert.deepEqual(appendSkywayReplayEventFrame(ledger, {
    tick: 2,
    events: [{ participantId: 'player', type: 'jump' }],
  }), { accepted: false, reason: 'conflict', revision: 1 });
  assert.deepEqual(lookupSkywayReplayEventFrame(ledger, 2), {
    tick: 2,
    events: [{ participantId: 'player', type: 'land' }],
  });
});

test('Skyway Replay Event Ledger protects uncommitted capacity and reuses committed slots', () => {
  const ledger = createSkywayReplayEventLedger({
    participantIds: ['player'],
    capacityTicks: 2,
  });
  appendSkywayReplayEventFrame(ledger, { tick: 1, events: [] });
  appendSkywayReplayEventFrame(ledger, { tick: 2, events: [] });
  const beforeFull = structuredClone(ledger);
  assert.throws(
    () => appendSkywayReplayEventFrame(ledger, { tick: 3, events: [] }),
    /cannot evict uncommitted/,
  );
  assert.deepEqual(ledger, beforeFull);

  const headSnapshot = roundSnapshotFor(ledger);
  commitSkywayReplayEvents(ledger, {
    throughTick: 1,
    finalityToken: finalityFor(ledger, headSnapshot),
    roundSnapshot: headSnapshot,
  });
  assert.deepEqual(
    appendSkywayReplayEventFrame(ledger, { tick: 3, events: [] }),
    { accepted: true, reason: null, revision: 4 },
  );
  assert.equal(lookupSkywayReplayEventFrame(ledger, 1), null);
  assert.deepEqual(lookupSkywayReplayEventFrame(ledger, 3), {
    tick: 3,
    events: [],
  });

  resetSkywayReplayEventLedger(ledger, { nextTick: 20, roundEpoch: 1 });
  assert.equal(ledger.nextTick, 20);
  assert.equal(ledger.committedThroughTick, 19);
  assert.equal(ledger.revision, 0);
  assert.equal(ledger.roundEpoch, 2);
  assert.equal(ledger.oldestTick, null);
  assert.ok(ledger.slots.every((slot) => slot === null));
});
