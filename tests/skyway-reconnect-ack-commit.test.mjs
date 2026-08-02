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
  assertSkywayAuthoritativeReconnectCorrectionResult,
} from '../src/core/skyway-authoritative-reconnect-correction.js';
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
  admitSkywayParticipantInput,
  createSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  projectSkywayOwnerFullResyncSnapshot,
} from '../src/core/skyway-owner-resync-snapshot.js';
import {
  commitSkywayReconnectAck,
  SKYWAY_RECONNECT_ACK_COMMIT_VERSION,
  SKYWAY_RECONNECT_ACK_DELIVERY_INTENT_MAX_BYTES,
  validateSkywayReconnectAckDeliveryIntent,
} from '../src/core/skyway-reconnect-ack-commit.js';
import {
  createSkywayReconnectAuthorityCheckpoint,
} from '../src/core/skyway-reconnect-authority-checkpoint.js';
import {
  createSkywayReconnectLeaseWindow,
  reserveSkywayReconnectLease,
  restoreSkywayReconnectLeaseWindow,
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

const SESSION = 'device-session:reconnect-ack-commit';
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

function command({
  ownerId = 'owner-a',
  participantId = 'player',
  clientSequence = 0,
  tick = 3,
  input = RESUMED_INPUT,
} = {}) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId,
    participantId,
    clientSequence,
    tick,
    input,
  };
}

function createFixture({ otherOwnerFuture = false } = {}) {
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
  if (otherOwnerFuture) {
    assert.equal(admitSkywayParticipantInput(
      admissionWindow,
      command({
        ownerId: 'owner-b',
        participantId: 'bot',
        tick: 4,
        input: IDLE,
      }),
    ).accepted, true);
  }
  const currentAuthority = createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    admissionWindow,
    ...stack,
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
    authorityCheckpoint: currentAuthority,
    admissionAckWatermark,
  });
  const resyncSnapshot = projectSkywayOwnerFullResyncSnapshot({
    authenticatedOwnerId: 'owner-a',
    directive,
    authorityCheckpoint: currentAuthority,
    admissionAckWatermark,
  });
  const leaseWindow = createSkywayReconnectLeaseWindow({
    authorityCheckpoint: currentAuthority,
    admissionAckWatermark,
    capacity: 2,
    leaseDurationTicks: 4,
  });
  const lease = reserveSkywayReconnectLease(leaseWindow, {
    authenticatedOwnerId: 'owner-a',
    directive,
    resyncSnapshot,
    authorityCheckpoint: currentAuthority,
    admissionAckWatermark,
    expectedRevision: 0,
  });
  return {
    ...stack,
    admissionWindow,
    authorityCheckpoint: currentAuthority,
    admissionAckWatermark,
    leaseWindow,
    lease,
    command: command(),
  };
}

function applyCorrection(fixture) {
  return applySkywayAuthoritativeReconnectCorrection({
    authenticatedOwnerId: 'owner-a',
    lease: fixture.lease,
    command: fixture.command,
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
}

function currentCheckpoint(fixture, correction) {
  return createSkywayReconnectAuthorityCheckpoint({
    authorityCheckpoint: correction.authorityCheckpoint,
    leaseWindow: fixture.leaseWindow,
    admissionAckWatermark: fixture.admissionAckWatermark,
  });
}

function commit(correction, checkpoint, overrides = {}) {
  return commitSkywayReconnectAck({
    reconnectCorrection: correction,
    reconnectAuthorityCheckpoint: checkpoint,
    expectedReconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    ...overrides,
  });
}

test('Reconnect ACK Commit deterministically advances only the resumed owner and returns one bounded delivery intent', () => {
  const first = createFixture();
  const second = createFixture();
  const firstCorrection = applyCorrection(first);
  const secondCorrection = applyCorrection(second);
  const firstCheckpoint = currentCheckpoint(first, firstCorrection);
  const secondCheckpoint = currentCheckpoint(second, secondCorrection);
  const ledgerBefore = JSON.stringify(first.replayEventLedger);
  const oldWatermarkBefore = JSON.stringify(
    first.admissionAckWatermark,
  );
  const firstResult = commit(firstCorrection, firstCheckpoint);
  const secondResult = commit(secondCorrection, secondCheckpoint);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.version, SKYWAY_RECONNECT_ACK_COMMIT_VERSION);
  assert.equal(firstResult.kind, 'skyway-reconnect-ack-commit');
  assert.equal(firstResult.ownerId, 'owner-a');
  assert.equal(firstResult.participantId, 'player');
  assert.equal(firstResult.ackSequence, 0);
  assert.equal(firstResult.ackWatermarkAdvanced, true);
  assert.equal(firstResult.ackWatermarkAdopted, false);
  assert.equal(firstResult.ackWatermarkPublished, false);
  assert.equal(firstResult.ackDelivered, false);
  assert.equal(firstResult.eventsCommitted, false);
  assert.equal(firstResult.suppressPresentation, true);
  assert.equal(firstResult.requiresDurableWatermarkAdoption, true);
  assert.equal(
    firstResult.authorityCheckpointHash,
    firstCheckpoint.authorityCheckpointHash,
  );
  assert.equal(
    firstResult.leaseWindowSnapshotHash,
    firstCheckpoint.leaseWindowSnapshotHash,
  );
  assert.notEqual(
    firstResult.admissionAckWatermarkHash,
    firstCheckpoint.admissionAckWatermarkHash,
  );
  assert.notEqual(
    firstResult.reconnectAuthorityCheckpointHash,
    firstCheckpoint.reconnectAuthorityCheckpointHash,
  );
  assert.equal(
    firstResult.admissionAckWatermark.acknowledgements[0].ackSequence,
    0,
  );
  assert.equal(
    firstResult.admissionAckWatermark.acknowledgements[1].ackSequence,
    -1,
  );
  assert.equal(
    firstResult.transactionHash,
    hashSkywaySnapshot(without(firstResult, 'transactionHash')),
  );
  assert.equal(Object.isFrozen(firstResult), true);
  assert.equal(Object.isFrozen(firstResult.deliveryIntent), true);
  assert.equal(
    validateSkywayReconnectAckDeliveryIntent(
      firstResult.deliveryIntent,
    ),
    firstResult.deliveryIntent,
  );
  assert.equal(firstResult.deliveryIntent.scope, 'input-admission');
  assert.equal(firstResult.deliveryIntent.durablyAdopted, false);
  assert.equal(
    encoder.encode(JSON.stringify(firstResult.deliveryIntent)).byteLength <=
      SKYWAY_RECONNECT_ACK_DELIVERY_INTENT_MAX_BYTES,
    true,
  );
  const serializedIntent = JSON.stringify(firstResult.deliveryIntent);
  assert.equal(serializedIntent.includes(SESSION), false);
  assert.equal(serializedIntent.includes('owner-b'), false);
  assert.equal(serializedIntent.includes('"input"'), false);
  assert.equal(serializedIntent.includes('"components"'), false);
  assert.equal(
    JSON.stringify(first.admissionAckWatermark),
    oldWatermarkBefore,
  );
  assert.equal(JSON.stringify(first.replayEventLedger), ledgerBefore);
});

test('Reconnect ACK Commit exact retry is pure while replay against its post-checkpoint is stale', () => {
  const fixture = createFixture();
  const correction = applyCorrection(fixture);
  const checkpoint = currentCheckpoint(fixture, correction);
  const first = commit(correction, checkpoint);
  const retry = commit(correction, checkpoint);
  assert.deepEqual(retry, first);

  assert.throws(() => commit(correction, first.checkpoint), {
    message: /correction, Lease, or Authority binding is invalid/,
  });
});

test('Reconnect ACK Commit rejects stale checkpoint intent and correction tamper without mutation', () => {
  const fixture = createFixture();
  const correction = applyCorrection(fixture);
  const checkpoint = currentCheckpoint(fixture, correction);
  const before = {
    watermark: JSON.stringify(fixture.admissionAckWatermark),
    lease: JSON.stringify(fixture.leaseWindow),
    ledger: JSON.stringify(fixture.replayEventLedger),
  };
  assert.throws(() => commit(correction, checkpoint, {
    expectedReconnectAuthorityCheckpointHash:
      hashSkywaySnapshot('stale'),
  }), /checkpoint revision is stale/);

  const tampered = structuredClone(correction);
  tampered.leaseHash = hashSkywaySnapshot('other-lease');
  assert.throws(
    () => commit(tampered, checkpoint),
    /result (binding|hash) is invalid/,
  );
  assert.deepEqual({
    watermark: JSON.stringify(fixture.admissionAckWatermark),
    lease: JSON.stringify(fixture.leaseWindow),
    ledger: JSON.stringify(fixture.replayEventLedger),
  }, before);
});

test('Reconnect ACK Commit rejects a validly rehashed correction that does not bind the consumed Lease', () => {
  const fixture = createFixture();
  const correction = applyCorrection(fixture);
  const checkpoint = currentCheckpoint(fixture, correction);
  const forged = structuredClone(correction);
  forged.leaseHash = hashSkywaySnapshot('other-lease');
  forged.reconnectIntake.leaseHash = forged.leaseHash;
  forged.transactionHash = hashSkywaySnapshot(
    without(forged, 'transactionHash'),
  );
  assert.equal(
    assertSkywayAuthoritativeReconnectCorrectionResult(forged),
    forged,
  );
  assert.throws(
    () => commit(forged, checkpoint),
    /correction, Lease, or Authority binding is invalid/,
  );
});

test('Reconnect ACK Commit refuses to finalize another owner hidden behind the global Watermark advance', () => {
  const fixture = createFixture({ otherOwnerFuture: true });
  const correction = applyCorrection(fixture);
  const checkpoint = currentCheckpoint(fixture, correction);
  const before = JSON.stringify(fixture.admissionAckWatermark);
  assert.throws(
    () => commit(correction, checkpoint),
    /exactly one resumed-owner frontier advance/,
  );
  assert.equal(JSON.stringify(fixture.admissionAckWatermark), before);
});

test('Reconnect ACK delivery intent rejects tamper and remains descriptive rather than delivered', () => {
  const fixture = createFixture();
  const correction = applyCorrection(fixture);
  const checkpoint = currentCheckpoint(fixture, correction);
  const result = commit(correction, checkpoint);
  const tampered = {
    ...result.deliveryIntent,
    ackDelivered: true,
  };
  assert.throws(
    () => validateSkywayReconnectAckDeliveryIntent(tampered),
    /Invalid Skyway reconnect ACK delivery intent/,
  );
  assert.equal(result.deliveryIntent.ackDelivered, false);
  assert.equal(
    result.deliveryIntent.requiresDurableWatermarkAdoption,
    true,
  );
});

test('Reconnect ACK Commit remains unwired from RoomProtocol', () => {
  const fixture = createFixture();
  const correction = applyCorrection(fixture);
  const checkpoint = currentCheckpoint(fixture, correction);
  const result = commit(correction, checkpoint);
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-ack',
    intent: result.deliveryIntent,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
