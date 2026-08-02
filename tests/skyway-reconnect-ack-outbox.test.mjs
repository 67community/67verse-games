import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayAdmissionAckWatermark,
} from '../src/core/skyway-admission-ack-finality.js';
import {
  createSkywayAuthorityCheckpoint,
} from '../src/core/skyway-authority-checkpoint.js';
import {
  applySkywayAuthoritativeReconnectCorrection,
} from '../src/core/skyway-authoritative-reconnect-correction.js';
import {
  claimNextSkywayReconnectAckDelivery,
  consumeSkywayReconnectAckDeliveryClaim,
  createSkywayReconnectAckOutbox,
  recordSkywayReconnectAckAdoption,
  resetSkywayReconnectAckOutbox,
  SKYWAY_RECONNECT_ACK_OUTBOX_CLAIM_MAX_BYTES,
  SKYWAY_RECONNECT_ACK_OUTBOX_ENTRY_MAX_BYTES,
  SKYWAY_RECONNECT_ACK_OUTBOX_MAX_BYTES,
  SKYWAY_RECONNECT_ACK_OUTBOX_MAX_CAPACITY,
  snapshotSkywayReconnectAckOutbox,
  validateSkywayReconnectAckDeliveryClaim,
} from '../src/core/skyway-reconnect-ack-outbox.js';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
} from '../src/core/skyway-command-journal.js';
import {
  appendSkywayReplayEventFrame,
  createSkywayReplayEventLedger,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import {
  createSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  projectSkywayOwnerFullResyncSnapshot,
} from '../src/core/skyway-owner-resync-snapshot.js';
import {
  commitSkywayReconnectAck,
} from '../src/core/skyway-reconnect-ack-commit.js';
import {
  createSkywayReconnectAuthorityCheckpoint,
  resetSkywayReconnectAuthorityLifecycle,
} from '../src/core/skyway-reconnect-authority-checkpoint.js';
import {
  createSkywayReconnectLeaseWindow,
  reserveSkywayReconnectLease,
  snapshotSkywayReconnectLeaseWindow,
} from '../src/core/skyway-reconnect-lease.js';
import {
  createSkywayOwnerResumeClaim,
  planSkywayOwnerResync,
} from '../src/core/skyway-reconnect-planner.js';
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
import {
  encodeServerRoomFrame,
} from '../src/core/room-protocol.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const SESSION = 'device-session:reconnect-ack-outbox';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});
const RESUMED_INPUT = Object.freeze({
  ...IDLE,
  dirX: 0.2,
  dirZ: -0.8,
  moving: true,
});
const encoder = new TextEncoder();

function without(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
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
    inputCapacityTicks: 6,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({
    capacityTicks: 7,
    roundEpoch: 1,
  });
  recordSkywaySnapshot(
    snapshotHistory,
    snapshotSkywayRound(round),
    { roundEpoch: 1 },
  );
  const stack = {
    round,
    snapshotHistory,
    commandJournal: createSkywayCommandJournal({
      participantIds,
      capacityTicks: 6,
      roundEpoch: 1,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds,
      capacityTicks: 6,
      roundEpoch: 1,
    }),
  };
  while (round.tick < 3) {
    const tick = round.tick + 1;
    const frame = stepSkywayRound(round, {
      env: environmentForCourse(round.course),
      inputFor: () => IDLE,
    });
    appendSkywayCommandTick(stack.commandJournal, {
      roundEpoch: 1,
      tick,
      commands: participantIds.map((participantId) => ({
        participantId,
        authority: 'predicted',
        input: IDLE,
      })),
    });
    appendSkywayReplayEventFrame(stack.replayEventLedger, {
      tick,
      events: frame.events,
    });
    recordSkywaySnapshot(
      snapshotHistory,
      frame.snapshot,
      { roundEpoch: 1 },
    );
  }
  return stack;
}

function resumedCommand(input = RESUMED_INPUT) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId: 'owner-a',
    participantId: 'player',
    clientSequence: 0,
    tick: 3,
    input,
  };
}

function createFixture() {
  const stack = createStack();
  const admissionWindow = createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    participantIds: ['player', 'bot'],
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick: 3,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
  const authorityCheckpoint = createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    admissionWindow,
    ...stack,
  });
  const admissionAckWatermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint,
  });
  const claim = createSkywayOwnerResumeClaim({
    admissionAckWatermark,
    ownerId: 'owner-a',
  });
  const divergentClaim = {
    ...claim,
    authorityCheckpointHash: hashSkywaySnapshot('older-authority'),
  };
  divergentClaim.claimHash = hashSkywaySnapshot(
    without(divergentClaim, 'claimHash'),
  );
  const directive = planSkywayOwnerResync({
    authenticatedOwnerId: 'owner-a',
    claim: divergentClaim,
    authorityCheckpoint,
    admissionAckWatermark,
  });
  const resyncSnapshot = projectSkywayOwnerFullResyncSnapshot({
    authenticatedOwnerId: 'owner-a',
    directive,
    authorityCheckpoint,
    admissionAckWatermark,
  });
  const leaseWindow = createSkywayReconnectLeaseWindow({
    authorityCheckpoint,
    admissionAckWatermark,
    capacity: 2,
    leaseDurationTicks: 4,
  });
  const lease = reserveSkywayReconnectLease(leaseWindow, {
    authenticatedOwnerId: 'owner-a',
    directive,
    resyncSnapshot,
    authorityCheckpoint,
    admissionAckWatermark,
    expectedRevision: 0,
  });
  return {
    ...stack,
    admissionWindow,
    authorityCheckpoint,
    admissionAckWatermark,
    leaseWindow,
    lease,
  };
}

function prepareFixture({
  input = RESUMED_INPUT,
} = {}) {
  const fixture = createFixture();
  const correction = applySkywayAuthoritativeReconnectCorrection({
    authenticatedOwnerId: 'owner-a',
    lease: fixture.lease,
    command: resumedCommand(input),
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
    baseLeaseWindowSnapshot:
      snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
    baseAdmissionSnapshot:
      snapshotSkywayInputAdmissionWindow(fixture.admissionWindow),
    environmentForRound: ({ course }) => environmentForCourse(course),
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
  const currentCheckpoint =
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint: correction.authorityCheckpoint,
      leaseWindow: fixture.leaseWindow,
      admissionAckWatermark: fixture.admissionAckWatermark,
    });
  const ackCommit = commitSkywayReconnectAck({
    reconnectCorrection: correction,
    reconnectAuthorityCheckpoint: currentCheckpoint,
    expectedReconnectAuthorityCheckpointHash:
      currentCheckpoint.reconnectAuthorityCheckpointHash,
  });
  return {
    fixture,
    correction,
    currentCheckpoint,
    ackCommit,
  };
}

function recordPrepared(prepared, capacity = 8) {
  const outbox = createSkywayReconnectAckOutbox({
    reconnectAuthorityCheckpoint: prepared.currentCheckpoint,
    capacity,
  });
  const adoption = recordSkywayReconnectAckAdoption(outbox, {
    ackCommit: prepared.ackCommit,
    currentReconnectAuthorityCheckpoint:
      prepared.currentCheckpoint,
    expectedRevision: 0,
    expectedAdoptedReconnectAuthorityCheckpointHash:
      prepared.currentCheckpoint.reconnectAuthorityCheckpointHash,
  });
  return { outbox, adoption };
}

test('Reconnect ACK Outbox deterministically CAS-adopts one exact bounded transition', () => {
  const first = prepareFixture();
  const second = prepareFixture();
  const firstLedger = JSON.stringify(
    first.fixture.replayEventLedger,
  );
  const firstCommit = JSON.stringify(first.ackCommit);
  const firstRecord = recordPrepared(first);
  const secondRecord = recordPrepared(second);

  assert.deepEqual(firstRecord, secondRecord);
  assert.equal(firstRecord.outbox.revision, 1);
  assert.equal(firstRecord.outbox.slots[0].status, 'pending');
  assert.equal(
    firstRecord.outbox.adoptedReconnectAuthorityCheckpointHash,
    first.ackCommit.reconnectAuthorityCheckpointHash,
  );
  assert.equal(
    firstRecord.outbox.adoptedAdmissionAckWatermarkHash,
    first.ackCommit.admissionAckWatermarkHash,
  );
  assert.equal(firstRecord.adoption.durablyAdopted, false);
  assert.equal(firstRecord.adoption.ackDelivered, false);
  assert.equal(firstRecord.adoption.receiptRecorded, false);
  assert.equal(firstRecord.adoption.eventsCommitted, false);
  assert.deepEqual(
    firstRecord.adoption.deliveryIntent,
    first.ackCommit.deliveryIntent,
  );
  assert.equal(
    encoder.encode(JSON.stringify(firstRecord.adoption)).byteLength <=
      SKYWAY_RECONNECT_ACK_OUTBOX_ENTRY_MAX_BYTES,
    true,
  );
  assert.equal(
    encoder.encode(
      JSON.stringify(snapshotSkywayReconnectAckOutbox(
        firstRecord.outbox,
      )),
    ).byteLength <= SKYWAY_RECONNECT_ACK_OUTBOX_MAX_BYTES,
    true,
  );
  assert.equal(JSON.stringify(first.ackCommit), firstCommit);
  assert.equal(
    JSON.stringify(first.fixture.replayEventLedger),
    firstLedger,
  );
});

test('Reconnect ACK Outbox exact retained adoption retry is a no-op while stale or tampered work aborts atomically', () => {
  const prepared = prepareFixture();
  const { outbox, adoption } = recordPrepared(prepared);
  const afterRecord = JSON.stringify(outbox);
  const retry = recordSkywayReconnectAckAdoption(outbox, {
    ackCommit: prepared.ackCommit,
    currentReconnectAuthorityCheckpoint:
      prepared.currentCheckpoint,
    expectedRevision: outbox.revision,
    expectedAdoptedReconnectAuthorityCheckpointHash:
      outbox.adoptedReconnectAuthorityCheckpointHash,
  });
  assert.deepEqual(retry, adoption);
  assert.equal(JSON.stringify(outbox), afterRecord);

  assert.throws(() => recordSkywayReconnectAckAdoption(outbox, {
    ackCommit: prepared.ackCommit,
    currentReconnectAuthorityCheckpoint:
      prepared.currentCheckpoint,
    expectedRevision: 0,
    expectedAdoptedReconnectAuthorityCheckpointHash:
      outbox.adoptedReconnectAuthorityCheckpointHash,
  }), /revision is stale/);
  const tampered = structuredClone(prepared.ackCommit);
  tampered.deliveryIntent = {
    ...tampered.deliveryIntent,
    ackDelivered: true,
  };
  assert.throws(() => recordSkywayReconnectAckAdoption(outbox, {
    ackCommit: tampered,
    currentReconnectAuthorityCheckpoint:
      prepared.currentCheckpoint,
    expectedRevision: outbox.revision,
    expectedAdoptedReconnectAuthorityCheckpointHash:
      outbox.adoptedReconnectAuthorityCheckpointHash,
  }), /Invalid Skyway reconnect ACK delivery intent/);
  assert.equal(JSON.stringify(outbox), afterRecord);
});

test('Reconnect ACK Outbox claim and consume are deterministic, ordered, single-use releases rather than delivery receipts', () => {
  const prepared = prepareFixture();
  const { outbox, adoption } = recordPrepared(prepared);
  const claimResult = claimNextSkywayReconnectAckDelivery(outbox, {
    expectedRevision: outbox.revision,
  });
  assert.equal(claimResult.claimed, true);
  assert.equal(claimResult.outboxConsumed, false);
  assert.equal(claimResult.ackDelivered, false);
  assert.equal(claimResult.receiptRecorded, false);
  assert.deepEqual(claimResult.deliveryIntent, adoption.deliveryIntent);
  assert.equal(
    validateSkywayReconnectAckDeliveryClaim(claimResult.claim),
    claimResult.claim,
  );
  assert.equal(
    encoder.encode(JSON.stringify(claimResult.claim)).byteLength <=
      SKYWAY_RECONNECT_ACK_OUTBOX_CLAIM_MAX_BYTES,
    true,
  );
  const claimedRevision = outbox.revision;
  const claimRetry = claimNextSkywayReconnectAckDelivery(outbox, {
    expectedRevision: claimedRevision,
  });
  assert.deepEqual(claimRetry, claimResult);
  assert.equal(outbox.revision, claimedRevision);

  const consume = consumeSkywayReconnectAckDeliveryClaim(outbox, {
    claim: claimResult.claim,
    expectedRevision: outbox.revision,
  });
  assert.equal(consume.outboxConsumed, true);
  assert.equal(consume.ackDelivered, false);
  assert.equal(consume.receiptRecorded, false);
  const consumedRevision = outbox.revision;
  const consumeRetry =
    consumeSkywayReconnectAckDeliveryClaim(outbox, {
      claim: claimResult.claim,
      expectedRevision: consumedRevision,
    });
  assert.deepEqual(consumeRetry, consume);
  assert.equal(outbox.revision, consumedRevision);

  const forged = {
    ...claimResult.claim,
    ownerId: 'owner-b',
  };
  assert.throws(
    () => consumeSkywayReconnectAckDeliveryClaim(outbox, {
      claim: forged,
      expectedRevision: outbox.revision,
    }),
    /claim binding is invalid/,
  );
});

test('Reconnect ACK Outbox capacity is fixed and applies backpressure without eviction of pending work', () => {
  const prepared = prepareFixture();
  const { outbox } = recordPrepared(prepared, 1);
  const before = JSON.stringify(outbox);
  assert.throws(() => createSkywayReconnectAckOutbox({
    reconnectAuthorityCheckpoint: prepared.currentCheckpoint,
    capacity: SKYWAY_RECONNECT_ACK_OUTBOX_MAX_CAPACITY + 1,
  }), /capacity is invalid/);

  const other = prepareFixture({
    input: {
      ...RESUMED_INPUT,
      dirX: -0.4,
    },
  });
  assert.throws(() => recordSkywayReconnectAckAdoption(outbox, {
    ackCommit: other.ackCommit,
    currentReconnectAuthorityCheckpoint: other.currentCheckpoint,
    expectedRevision: outbox.revision,
    expectedAdoptedReconnectAuthorityCheckpointHash:
      outbox.adoptedReconnectAuthorityCheckpointHash,
  }), /transition is stale/);
  assert.equal(JSON.stringify(outbox), before);
  assert.equal(outbox.slots[0].status, 'pending');
});

test('Reconnect ACK Outbox epoch reset clears unresolved in-memory work and rejects old claims', () => {
  const prepared = prepareFixture();
  const { outbox } = recordPrepared(prepared);
  const claimResult = claimNextSkywayReconnectAckDelivery(outbox, {
    expectedRevision: outbox.revision,
  });
  const base = snapshotSkywayReconnectAckOutbox(outbox);
  const lifecycle = resetSkywayReconnectAuthorityLifecycle({
    baseReconnectAuthorityCheckpoint: prepared.ackCommit.checkpoint,
    admissionAckWatermark:
      prepared.ackCommit.admissionAckWatermark,
    leaseWindow: prepared.fixture.leaseWindow,
    admissionWindow: prepared.fixture.admissionWindow,
    round: prepared.fixture.round,
    snapshotHistory: prepared.fixture.snapshotHistory,
    commandJournal: prepared.fixture.commandJournal,
    replayEventLedger: prepared.fixture.replayEventLedger,
  });
  const result = resetSkywayReconnectAckOutbox(outbox, {
    baseOutboxSnapshot: base,
    previousReconnectAuthorityCheckpoint:
      prepared.ackCommit.checkpoint,
    nextReconnectAuthorityCheckpoint: lifecycle.checkpoint,
  });
  assert.equal(result.clearedClaimedCount, 1);
  assert.equal(result.pendingDeliveryFinalized, false);
  assert.equal(result.ackDeliveredCount, 0);
  assert.equal(result.receiptRecordedCount, 0);
  assert.equal(outbox.roundEpoch, 2);
  assert.equal(outbox.revision, 0);
  assert.equal(outbox.slots.every((slot) => slot === null), true);
  assert.throws(
    () => consumeSkywayReconnectAckDeliveryClaim(outbox, {
      claim: claimResult.claim,
      expectedRevision: 0,
    }),
    /claim lifecycle is stale/,
  );
});

test('Reconnect ACK Outbox stays opt-in and unknown to RoomProtocol', () => {
  const prepared = prepareFixture();
  const { outbox } = recordPrepared(prepared);
  const claim = claimNextSkywayReconnectAckDelivery(outbox, {
    expectedRevision: outbox.revision,
  });
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-ack-delivery',
    claim,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
