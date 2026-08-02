import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendSkywayReplayEventFrame,
  commitSkywayReplayEvents,
  createSkywayReplayEventLedger,
  replaceSkywayReplayEventRange,
  resetSkywayReplayEventLedger,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  assertSkywayRoundFinalityToken,
  createSkywayRoundFinalityToken,
} from '../src/core/skyway-round-finality.js';
import {
  SKYWAY_ROLLBACK_COORDINATOR_VERSION,
} from '../src/core/skyway-rollback-coordinator.js';
import {
  SKYWAY_ROUND_VERSION,
} from '../src/core/skyway-round.js';
import {
  hashSkywaySnapshot,
} from '../src/core/skyway-snapshot-history.js';

function createLedger(options = {}) {
  return createSkywayReplayEventLedger({
    participantIds: ['player'],
    capacityTicks: 2,
    ...options,
  });
}

function roundSnapshot(ledger, state = 'same-reset-state') {
  return {
    version: SKYWAY_ROUND_VERSION,
    tick: ledger.latestTick,
    state,
    participants: [{ id: 'player', isPlayer: true }],
  };
}

function oneTickEnvelope(roundEpoch = 1) {
  return {
    version: SKYWAY_ROLLBACK_COORDINATOR_VERSION,
    kind: 'skyway-resimulation',
    roundEpoch,
    rollbackTick: 0,
    fromTick: 1,
    throughTick: 1,
    suppressPresentation: true,
  };
}

test('Skyway Round Finality rejects prior-epoch ABA tokens before replacement or commit', () => {
  const ledger = createLedger();
  appendSkywayReplayEventFrame(ledger, { tick: 1, events: [] });
  const firstSnapshot = roundSnapshot(ledger);
  const firstToken = createSkywayRoundFinalityToken({
    ledger,
    roundSnapshot: firstSnapshot,
  });
  assert.equal(Object.isFrozen(firstToken), true);
  assert.equal(firstToken.roundEpoch, 1);
  assert.equal(firstToken.ledgerRevision, 1);

  resetSkywayReplayEventLedger(ledger, { roundEpoch: 1 });
  appendSkywayReplayEventFrame(ledger, { tick: 1, events: [] });
  const secondSnapshot = roundSnapshot(ledger);
  assert.equal(ledger.roundEpoch, 2);
  assert.equal(ledger.revision, 1);
  assert.equal(hashSkywaySnapshot(secondSnapshot), hashSkywaySnapshot(firstSnapshot));

  const before = structuredClone(ledger);
  assert.throws(() => replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: oneTickEnvelope(2),
    finalityToken: firstToken,
    roundSnapshot: secondSnapshot,
    frames: [{ tick: 1, events: [] }],
  }), /epoch is stale/);
  assert.deepEqual(ledger, before);
  assert.throws(() => commitSkywayReplayEvents(ledger, {
    throughTick: 1,
    finalityToken: firstToken,
    roundSnapshot: secondSnapshot,
  }), /epoch is stale/);
  assert.deepEqual(ledger, before);

  const secondToken = createSkywayRoundFinalityToken({
    ledger,
    roundSnapshot: secondSnapshot,
  });
  replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: oneTickEnvelope(2),
    finalityToken: secondToken,
    roundSnapshot: secondSnapshot,
    frames: [{ tick: 1, events: [] }],
  });
  const secondCommitToken = createSkywayRoundFinalityToken({
    ledger,
    roundSnapshot: secondSnapshot,
  });
  const committed = commitSkywayReplayEvents(ledger, {
    throughTick: 1,
    finalityToken: secondCommitToken,
    roundSnapshot: secondSnapshot,
  });
  assert.equal(committed.roundEpoch, 2);
  assert.equal(committed.eventCount, 0);
});

test('Skyway Round Finality binds the exact head snapshot and staged revision', () => {
  const ledger = createLedger();
  appendSkywayReplayEventFrame(ledger, {
    tick: 1,
    events: [{ participantId: 'player', type: 'jump' }],
  });
  const predictedSnapshot = roundSnapshot(ledger, 'predicted');
  const predictedToken = createSkywayRoundFinalityToken({
    ledger,
    roundSnapshot: predictedSnapshot,
  });
  const correctedSnapshot = roundSnapshot(ledger, 'corrected');
  const before = structuredClone(ledger);

  assert.throws(() => replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: oneTickEnvelope(),
    finalityToken: predictedToken,
    roundSnapshot: correctedSnapshot,
    frames: [{ tick: 1, events: [] }],
  }), /snapshot hash is stale/);
  assert.deepEqual(ledger, before);

  const correctedToken = createSkywayRoundFinalityToken({
    ledger,
    roundSnapshot: correctedSnapshot,
  });
  replaceSkywayReplayEventRange(ledger, {
    resimulationEnvelope: oneTickEnvelope(),
    finalityToken: correctedToken,
    roundSnapshot: correctedSnapshot,
    frames: [{ tick: 1, events: [] }],
  });
  assert.equal(ledger.revision, 2);

  const beforeCommit = structuredClone(ledger);
  assert.throws(() => commitSkywayReplayEvents(ledger, {
    throughTick: 1,
    finalityToken: correctedToken,
    roundSnapshot: correctedSnapshot,
  }), /revision is stale/);
  assert.deepEqual(ledger, beforeCommit);

  const commitToken = createSkywayRoundFinalityToken({
    ledger,
    roundSnapshot: correctedSnapshot,
  });
  const commit = commitSkywayReplayEvents(ledger, {
    throughTick: 1,
    finalityToken: commitToken,
    roundSnapshot: correctedSnapshot,
  });
  assert.equal(commit.roundSnapshotHash, hashSkywaySnapshot(correctedSnapshot));
  assert.equal(ledger.revision, 3);
});

test('Skyway Round Finality rejects malformed tokens and epoch exhaustion atomically', () => {
  const ledger = createLedger({ roundEpoch: Number.MAX_SAFE_INTEGER });
  appendSkywayReplayEventFrame(ledger, { tick: 1, events: [] });
  const snapshot = roundSnapshot(ledger);
  const token = createSkywayRoundFinalityToken({
    ledger,
    roundSnapshot: snapshot,
  });
  const malformed = { ...token, unexpected: true };
  assert.throws(() => assertSkywayRoundFinalityToken(malformed, {
    ledger,
    roundSnapshot: snapshot,
  }), /Invalid Skyway Round finality token/);

  const unsafe = {
    ...token,
    roundEpoch: Number.MAX_SAFE_INTEGER + 1,
  };
  assert.throws(() => assertSkywayRoundFinalityToken(unsafe, {
    ledger,
    roundSnapshot: snapshot,
  }), /Invalid Skyway Round finality token/);

  const before = structuredClone(ledger);
  assert.throws(
    () => resetSkywayReplayEventLedger(ledger, {
      roundEpoch: Number.MAX_SAFE_INTEGER,
    }),
    /round epoch is exhausted/,
  );
  assert.deepEqual(ledger, before);
});
