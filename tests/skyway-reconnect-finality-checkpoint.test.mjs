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
  assertSkywayReconnectAckCommitResult,
  commitSkywayReconnectAck,
} from '../src/core/skyway-reconnect-ack-commit.js';
import {
  advanceSkywayReconnectAckDeliveryFinality,
  advanceSkywayReconnectAckReceiptFinality,
  assertSkywayReconnectAckDeliveryFinalityRestore,
  assertSkywayReconnectAckDeliveryFinalityWatermark,
  assertSkywayReconnectAckReceiptFinalityForReclamation,
  createSkywayReconnectAckDeliveryFinalityWatermark,
  resetSkywayReconnectAckDeliveryFinality,
  SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_MAX_BYTES,
} from '../src/core/skyway-reconnect-ack-delivery-finality.js';
import {
  adoptSkywayReconnectAckWithReceiptFinality,
  SKYWAY_RECONNECT_ACK_RECLAMATION_ADOPTION_MAX_BYTES,
} from '../src/core/skyway-reconnect-ack-reclamation-adoption.js';
import {
  adoptSequentialSkywayReconnectAck,
  SKYWAY_RECONNECT_SEQUENTIAL_ACK_ADOPTION_MAX_BYTES,
} from '../src/core/skyway-reconnect-sequential-ack-adoption.js';
import {
  createSkywayReconnectAuthorityCheckpoint,
} from '../src/core/skyway-reconnect-authority-checkpoint.js';
import {
  applySkywayExclusiveReconnectOrchestration,
  SKYWAY_RECONNECT_EXCLUSIVE_ORCHESTRATION_MAX_BYTES,
} from '../src/core/skyway-reconnect-exclusive-orchestration.js';
import {
  adoptSkywayReconnectFinalityAck,
  assertSkywayReconnectFinalityCheckpoint,
  createSkywayReconnectFinalityCheckpoint,
  resetSkywayReconnectFinalityLifecycle,
  restoreSkywayReconnectFinalityCheckpoint,
  SKYWAY_RECONNECT_FINALITY_CHECKPOINT_MAX_BYTES,
} from '../src/core/skyway-reconnect-finality-checkpoint.js';
import {
  createSkywayReconnectLeaseWindow,
  reserveSkywayReconnectLease,
  snapshotSkywayReconnectLeaseWindow,
} from '../src/core/skyway-reconnect-lease.js';
import {
  reserveSkywayReconnectLeaseFinality,
  SKYWAY_RECONNECT_LEASE_FINALITY_RESERVATION_MAX_BYTES,
} from '../src/core/skyway-reconnect-lease-finality-reservation.js';
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

const SESSION = 'device-session:reconnect-finality';
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

function resumedCommand() {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId: 'owner-a',
    participantId: 'player',
    clientSequence: 0,
    tick: 3,
    input: RESUMED_INPUT,
  };
}

function createFixture({
  ackOutboxCapacity = 8,
  leaseCapacity = 2,
} = {}) {
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
    capacity: leaseCapacity,
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
  const correction = applySkywayAuthoritativeReconnectCorrection({
    authenticatedOwnerId: 'owner-a',
    lease,
    command: resumedCommand(),
    authorityCheckpoint,
    admissionAckWatermark,
    baseLeaseWindowSnapshot:
      snapshotSkywayReconnectLeaseWindow(leaseWindow),
    baseAdmissionSnapshot:
      snapshotSkywayInputAdmissionWindow(admissionWindow),
    environmentForRound: ({ course: scratchCourse }) => (
      environmentForCourse(scratchCourse)
    ),
    leaseWindow,
    admissionWindow,
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
  });
  const reconnectAuthorityCheckpoint =
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint: correction.authorityCheckpoint,
      leaseWindow,
      admissionAckWatermark,
    });
  const ackCommit = commitSkywayReconnectAck({
    reconnectCorrection: correction,
    reconnectAuthorityCheckpoint,
    expectedReconnectAuthorityCheckpointHash:
      reconnectAuthorityCheckpoint.reconnectAuthorityCheckpointHash,
  });
  const ackOutbox = createSkywayReconnectAckOutbox({
    reconnectAuthorityCheckpoint,
    capacity: ackOutboxCapacity,
  });
  const baseFinalityCheckpoint =
    createSkywayReconnectFinalityCheckpoint({
      reconnectAuthorityCheckpoint,
      ackOutbox,
    });
  return {
    ...stack,
    admissionWindow,
    admissionAckWatermark,
    leaseWindow,
    correction,
    reconnectAuthorityCheckpoint,
    ackCommit,
    ackOutbox,
    baseFinalityCheckpoint,
  };
}

function liveState(fixture) {
  return JSON.stringify({
    admissionWindow: fixture.admissionWindow,
    leaseWindow: fixture.leaseWindow,
    round: snapshotSkywayRound(fixture.round),
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
    ackOutbox: fixture.ackOutbox,
  });
}

function adopt(fixture) {
  return adoptSkywayReconnectFinalityAck({
    baseCheckpoint: fixture.baseFinalityCheckpoint,
    ackCommit: fixture.ackCommit,
    ackOutbox: fixture.ackOutbox,
  });
}

test('Reconnect Finality checkpoint deterministically binds one Authority head and Outbox image', () => {
  const first = createFixture();
  const second = createFixture();
  assert.deepEqual(
    first.baseFinalityCheckpoint,
    second.baseFinalityCheckpoint,
  );
  const checkpoint = first.baseFinalityCheckpoint;
  assert.equal(
    assertSkywayReconnectFinalityCheckpoint(checkpoint),
    checkpoint,
  );
  assert.equal(Object.isFrozen(checkpoint), true);
  assert.equal(Object.isFrozen(checkpoint.components), true);
  assert.equal(
    checkpoint.reconnectAuthorityCheckpointHash,
    checkpoint.components.ackOutboxSnapshot
      .adoptedReconnectAuthorityCheckpointHash,
  );
  assert.equal(
    checkpoint.components.reconnectAuthorityCheckpoint
      .admissionAckWatermarkHash,
    checkpoint.components.ackOutboxSnapshot
      .adoptedAdmissionAckWatermarkHash,
  );
  assert.equal(
    checkpoint.reconnectFinalityCheckpointHash,
    hashSkywaySnapshot(without(
      checkpoint,
      'reconnectFinalityCheckpointHash',
    )),
  );
  assert.equal(
    encoder.encode(JSON.stringify(checkpoint)).byteLength <=
      SKYWAY_RECONNECT_FINALITY_CHECKPOINT_MAX_BYTES,
    true,
  );
});

test('Reconnect Finality ACK adoption advances Authority and Outbox heads once without touching live sidecars', () => {
  const first = createFixture();
  const second = createFixture();
  const before = liveState(first);
  const firstResult = adopt(first);
  const secondResult = adopt(second);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.changed, true);
  assert.equal(firstResult.durablyAdopted, false);
  assert.equal(firstResult.ackDelivered, false);
  assert.equal(firstResult.receiptRecorded, false);
  assert.equal(firstResult.eventsCommitted, false);
  assert.equal(firstResult.suppressPresentation, true);
  assert.equal(
    firstResult.checkpoint.reconnectAuthorityCheckpointHash,
    first.ackCommit.reconnectAuthorityCheckpointHash,
  );
  assert.equal(firstResult.checkpoint.ackOutboxRevision, 1);
  assert.equal(first.ackOutbox.slots[0].status, 'pending');
  assert.equal(
    JSON.stringify({
      admissionWindow: first.admissionWindow,
      leaseWindow: first.leaseWindow,
      round: snapshotSkywayRound(first.round),
      snapshotHistory: first.snapshotHistory,
      commandJournal: first.commandJournal,
      replayEventLedger: first.replayEventLedger,
    }),
    JSON.stringify(JSON.parse(before, (key, value) => (
      key === 'ackOutbox' ? undefined : value
    ))),
  );

  const retry = adoptSkywayReconnectFinalityAck({
    baseCheckpoint: firstResult.checkpoint,
    ackCommit: first.ackCommit,
    ackOutbox: first.ackOutbox,
  });
  assert.equal(retry.changed, false);
  assert.deepEqual(retry.checkpoint, firstResult.checkpoint);
  assert.equal(first.ackOutbox.revision, 1);
});

test('Reconnect Finality adoption rejects stale aggregate and tamper without partial mutation', () => {
  const fixture = createFixture();
  const result = adopt(fixture);
  const after = liveState(fixture);
  assert.throws(() => adoptSkywayReconnectFinalityAck({
    baseCheckpoint: fixture.baseFinalityCheckpoint,
    ackCommit: fixture.ackCommit,
    ackOutbox: fixture.ackOutbox,
  }), /adoption base is stale/);

  const tampered = structuredClone(result.checkpoint);
  tampered.ackOutboxRevision += 1;
  assert.throws(
    () => assertSkywayReconnectFinalityCheckpoint(tampered),
    /checkpoint binding is invalid/,
  );
  assert.equal(liveState(fixture), after);
});

test('Reconnect Finality same-epoch restore moves pre/post ACK and claim images together while preserving identities', () => {
  const fixture = createFixture();
  const preAck = fixture.baseFinalityCheckpoint;
  const adopted = adopt(fixture);
  const pending = adopted.checkpoint;
  const claimResult = claimNextSkywayReconnectAckDelivery(
    fixture.ackOutbox,
    { expectedRevision: fixture.ackOutbox.revision },
  );
  consumeSkywayReconnectAckDeliveryClaim(fixture.ackOutbox, {
    claim: claimResult.claim,
    expectedRevision: fixture.ackOutbox.revision,
  });
  const consumed = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: fixture.ackCommit.checkpoint,
    ackOutbox: fixture.ackOutbox,
  });
  const identities = {
    outbox: fixture.ackOutbox,
    lease: fixture.leaseWindow,
    admission: fixture.admissionWindow,
    round: fixture.round,
    course: fixture.round.course,
    timeline: fixture.round.inputTimeline,
    participant: fixture.round.participants[0],
    history: fixture.snapshotHistory,
    journal: fixture.commandJournal,
    ledger: fixture.replayEventLedger,
  };
  const restorePending = restoreSkywayReconnectFinalityCheckpoint({
    checkpoint: pending,
    currentReconnectAuthorityCheckpoint:
      fixture.ackCommit.checkpoint,
    expectedTargetReconnectFinalityCheckpointHash:
      consumed.reconnectFinalityCheckpointHash,
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
  assert.equal(restorePending.changed, true);
  assert.equal(fixture.ackOutbox.slots[0].status, 'pending');

  const restorePreAck = restoreSkywayReconnectFinalityCheckpoint({
    checkpoint: preAck,
    currentReconnectAuthorityCheckpoint:
      fixture.ackCommit.checkpoint,
    expectedTargetReconnectFinalityCheckpointHash:
      pending.reconnectFinalityCheckpointHash,
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
  assert.equal(
    restorePreAck.reconnectAuthorityCheckpointHash,
    preAck.reconnectAuthorityCheckpointHash,
  );
  assert.equal(fixture.ackOutbox.revision, 0);

  restoreSkywayReconnectFinalityCheckpoint({
    checkpoint: consumed,
    currentReconnectAuthorityCheckpoint:
      fixture.reconnectAuthorityCheckpoint,
    expectedTargetReconnectFinalityCheckpointHash:
      preAck.reconnectFinalityCheckpointHash,
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
  assert.equal(fixture.ackOutbox.slots[0].status, 'consumed');
  assert.equal(fixture.ackOutbox, identities.outbox);
  assert.equal(fixture.leaseWindow, identities.lease);
  assert.equal(fixture.admissionWindow, identities.admission);
  assert.equal(fixture.round, identities.round);
  assert.equal(fixture.round.course, identities.course);
  assert.equal(fixture.round.inputTimeline, identities.timeline);
  assert.equal(
    fixture.round.participants[0],
    identities.participant,
  );
  assert.equal(fixture.snapshotHistory, identities.history);
  assert.equal(fixture.commandJournal, identities.journal);
  assert.equal(fixture.replayEventLedger, identities.ledger);
});

test('Reconnect Finality restore rejects stale or incompatible targets before mutating either image', () => {
  const fixture = createFixture();
  const adopted = adopt(fixture);
  const before = liveState(fixture);
  assert.throws(() => restoreSkywayReconnectFinalityCheckpoint({
    checkpoint: fixture.baseFinalityCheckpoint,
    currentReconnectAuthorityCheckpoint:
      fixture.ackCommit.checkpoint,
    expectedTargetReconnectFinalityCheckpointHash:
      hashSkywaySnapshot('stale-finality'),
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  }), /restore target is stale/);

  const other = createFixture();
  other.ackOutbox.capacity = 1;
  other.ackOutbox.slots = [null];
  const incompatible = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint:
      other.reconnectAuthorityCheckpoint,
    ackOutbox: other.ackOutbox,
  });
  assert.throws(() => restoreSkywayReconnectFinalityCheckpoint({
    checkpoint: incompatible,
    currentReconnectAuthorityCheckpoint:
      fixture.ackCommit.checkpoint,
    expectedTargetReconnectFinalityCheckpointHash:
      adopted.checkpoint.reconnectFinalityCheckpointHash,
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  }), /configuration is not aligned/);
  assert.equal(liveState(fixture), before);
});

test('Reconnect Finality lifecycle resets Authority, Lease, Watermark, and unresolved Outbox evidence together', () => {
  const fixture = createFixture();
  const adopted = adopt(fixture);
  const claimResult = claimNextSkywayReconnectAckDelivery(
    fixture.ackOutbox,
    { expectedRevision: fixture.ackOutbox.revision },
  );
  const base = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: fixture.ackCommit.checkpoint,
    ackOutbox: fixture.ackOutbox,
  });
  const identities = {
    outbox: fixture.ackOutbox,
    lease: fixture.leaseWindow,
    admission: fixture.admissionWindow,
    round: fixture.round,
    history: fixture.snapshotHistory,
    journal: fixture.commandJournal,
    ledger: fixture.replayEventLedger,
  };
  const result = resetSkywayReconnectFinalityLifecycle({
    baseCheckpoint: base,
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
  assert.equal(result.previousRoundEpoch, 1);
  assert.equal(result.roundEpoch, 2);
  assert.equal(result.tick, 0);
  assert.equal(result.pendingDeliveryFinalized, false);
  assert.equal(result.ackDelivered, false);
  assert.equal(result.receiptRecorded, false);
  assert.equal(result.checkpoint.ackOutboxRevision, 0);
  assert.equal(
    result.checkpoint.components.ackOutboxSnapshot.slots.every(
      (slot) => slot === null,
    ),
    true,
  );
  assert.equal(fixture.ackOutbox, identities.outbox);
  assert.equal(fixture.leaseWindow, identities.lease);
  assert.equal(fixture.admissionWindow, identities.admission);
  assert.equal(fixture.round, identities.round);
  assert.equal(fixture.snapshotHistory, identities.history);
  assert.equal(fixture.commandJournal, identities.journal);
  assert.equal(fixture.replayEventLedger, identities.ledger);
  assert.throws(
    () => consumeSkywayReconnectAckDeliveryClaim(
      fixture.ackOutbox,
      {
        claim: claimResult.claim,
        expectedRevision: 0,
      },
    ),
    /claim lifecycle is stale/,
  );
  assert.throws(() => resetSkywayReconnectFinalityLifecycle({
    baseCheckpoint: adopted.checkpoint,
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  }), /outbox revision is stale/);
});

test('Reconnect Finality checkpoint remains opt-in and unknown to RoomProtocol', () => {
  const fixture = createFixture();
  const adopted = adopt(fixture);
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-finality-checkpoint',
    checkpoint: adopted.checkpoint,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});

function consumedFinality(fixture) {
  const adopted = adopt(fixture);
  const pending = adopted.checkpoint;
  const claimResult = claimNextSkywayReconnectAckDelivery(
    fixture.ackOutbox,
    { expectedRevision: fixture.ackOutbox.revision },
  );
  const claimed = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: fixture.ackCommit.checkpoint,
    ackOutbox: fixture.ackOutbox,
  });
  const consume = consumeSkywayReconnectAckDeliveryClaim(
    fixture.ackOutbox,
    {
      claim: claimResult.claim,
      expectedRevision: fixture.ackOutbox.revision,
    },
  );
  const consumed = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: fixture.ackCommit.checkpoint,
    ackOutbox: fixture.ackOutbox,
  });
  return {
    adopted,
    pending,
    claimed,
    claimResult,
    consume,
    consumed,
  };
}

function prepareLeaseFinalityReservation(fixture, {
  clientSequence = 1,
} = {}) {
  const authorityCheckpoint =
    fixture.ackCommit.checkpoint.components.authorityCheckpoint;
  const admissionAckWatermark =
    fixture.ackCommit.admissionAckWatermark;
  const claim = createSkywayOwnerResumeClaim({
    admissionAckWatermark,
    ownerId: 'owner-a',
  });
  const divergentClaim = {
    ...claim,
    authorityCheckpointHash: hashSkywaySnapshot(
      `next-reconnect-${clientSequence}`,
    ),
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
  return { directive, resyncSnapshot };
}

function exclusiveOrchestrationInput(
  fixture,
  baseCheckpoint,
  watermark,
  {
    clientSequence = 1,
    dirX = -0.35,
    tick = 2,
  } = {},
) {
  return {
    baseCheckpoint,
    expectedReconnectFinalityCheckpointHash:
      baseCheckpoint.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: watermark,
    expectedAckDeliveryFinalityWatermarkHash:
      watermark.watermarkHash,
    authenticatedOwnerId: 'owner-a',
    ...prepareLeaseFinalityReservation(fixture, {
      clientSequence,
    }),
    command: {
      ...resumedCommand(),
      clientSequence,
      tick,
      input: {
        ...RESUMED_INPUT,
        dirX,
      },
    },
    environmentForRound: ({ course: scratchCourse }) => (
      environmentForCourse(scratchCourse)
    ),
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
    ackOutbox: fixture.ackOutbox,
  };
}

function prepareNextAckCommit(fixture, {
  clientSequence = 1,
  dirX = -0.35,
  tick = 2,
} = {}) {
  const authorityCheckpoint =
    fixture.ackCommit.checkpoint.components.authorityCheckpoint;
  const admissionAckWatermark =
    fixture.ackCommit.admissionAckWatermark;
  const { directive, resyncSnapshot } =
    prepareLeaseFinalityReservation(fixture, { clientSequence });
  const lease = reserveSkywayReconnectLease(
    fixture.leaseWindow,
    {
      authenticatedOwnerId: 'owner-a',
      directive,
      resyncSnapshot,
      authorityCheckpoint,
      admissionAckWatermark,
      expectedRevision: fixture.leaseWindow.revision,
    },
  );
  const preCorrectionReconnectAuthorityCheckpoint =
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint,
      leaseWindow: fixture.leaseWindow,
      admissionAckWatermark,
    });
  const correction = applySkywayAuthoritativeReconnectCorrection({
    authenticatedOwnerId: 'owner-a',
    lease,
    command: {
      ...resumedCommand(),
      clientSequence,
      tick,
      input: {
        ...RESUMED_INPUT,
        dirX,
      },
    },
    authorityCheckpoint,
    admissionAckWatermark,
    baseLeaseWindowSnapshot:
      snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
    baseAdmissionSnapshot:
      snapshotSkywayInputAdmissionWindow(
        fixture.admissionWindow,
      ),
    environmentForRound: ({ course: scratchCourse }) => (
      environmentForCourse(scratchCourse)
    ),
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
  const reconnectAuthorityCheckpoint =
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint: correction.authorityCheckpoint,
      leaseWindow: fixture.leaseWindow,
      admissionAckWatermark,
    });
  const ackCommit = commitSkywayReconnectAck({
    reconnectCorrection: correction,
    reconnectAuthorityCheckpoint,
    expectedReconnectAuthorityCheckpointHash:
      reconnectAuthorityCheckpoint.reconnectAuthorityCheckpointHash,
  });
  return {
    ackCommit,
    correction,
    preCorrectionReconnectAuthorityCheckpoint,
    reconnectAuthorityCheckpoint,
  };
}

function prepareReclamationBase(fixture, next) {
  fixture.ackOutbox.adoptedReconnectAuthorityCheckpointHash =
    next.reconnectAuthorityCheckpoint
      .reconnectAuthorityCheckpointHash;
  fixture.ackOutbox.adoptedAdmissionAckWatermarkHash =
    next.reconnectAuthorityCheckpoint.admissionAckWatermarkHash;
  return createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint:
      next.reconnectAuthorityCheckpoint,
    ackOutbox: fixture.ackOutbox,
  });
}

function prepareSequentialBase(fixture, next) {
  fixture.ackOutbox.revision += 1;
  fixture.ackOutbox.adoptedReconnectAuthorityCheckpointHash =
    next.preCorrectionReconnectAuthorityCheckpoint
      .reconnectAuthorityCheckpointHash;
  fixture.ackOutbox.adoptedAdmissionAckWatermarkHash =
    next.preCorrectionReconnectAuthorityCheckpoint
      .admissionAckWatermarkHash;
  return createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint:
      next.preCorrectionReconnectAuthorityCheckpoint,
    ackOutbox: fixture.ackOutbox,
  });
}

test('Reconnect ACK Delivery Finality creates one deterministic bounded all-null owner floor', () => {
  const first = createFixture();
  const second = createFixture();
  const firstWatermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        first.baseFinalityCheckpoint,
    });
  const secondWatermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        second.baseFinalityCheckpoint,
    });
  assert.deepEqual(firstWatermark, secondWatermark);
  assert.equal(
    assertSkywayReconnectAckDeliveryFinalityWatermark(
      firstWatermark,
    ),
    firstWatermark,
  );
  assert.deepEqual(
    firstWatermark.owners.map(({ ownerId }) => ownerId),
    ['owner-a', 'owner-b'],
  );
  assert.equal(
    firstWatermark.owners.every(({ delivered, receipt }) => (
      delivered === null && receipt === null
    )),
    true,
  );
  assert.equal(Object.isFrozen(firstWatermark), true);
  assert.equal(Object.isFrozen(firstWatermark.owners), true);
  assert.equal(
    encoder.encode(JSON.stringify(firstWatermark)).byteLength <=
      SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_MAX_BYTES,
    true,
  );
});

test('Reconnect ACK Delivery and Receipt Finality require exact consumed evidence and remain explicit caller assertions', () => {
  const fixture = createFixture();
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        fixture.baseFinalityCheckpoint,
    });
  const evidence = consumedFinality(fixture);
  assert.throws(
    () => advanceSkywayReconnectAckDeliveryFinality({
      watermark,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: evidence.claimed,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: evidence.claimResult.claim,
    }),
    /evidence is stale/,
  );
  assert.throws(
    () => advanceSkywayReconnectAckReceiptFinality({
      watermark,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: evidence.consumed,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: evidence.claimResult.claim,
    }),
    /requires the exact current delivered frontier/,
  );

  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const deliveryStage = delivered.owners[0].delivered;
  assert.equal(deliveryStage.ackSequence, 0);
  assert.equal(
    deliveryStage.deliveryIntentHash,
    fixture.ackCommit.deliveryIntentHash,
  );
  assert.equal(
    deliveryStage.claimHash,
    evidence.claimResult.claim.claimHash,
  );
  assert.equal(deliveryStage.consumedRevision, 3);
  assert.equal(validHashForTest(deliveryStage.consumeHash), true);
  assert.equal(delivered.owners[0].receipt, null);
  assert.equal(
    advanceSkywayReconnectAckDeliveryFinality({
      watermark: delivered,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: evidence.consumed,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: evidence.claimResult.claim,
    }),
    delivered,
  );

  const receipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: delivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  assert.deepEqual(receipt.owners[0].receipt, deliveryStage);
  assert.equal(
    advanceSkywayReconnectAckReceiptFinality({
      watermark: receipt,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: evidence.consumed,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: evidence.claimResult.claim,
    }),
    receipt,
  );
  assert.equal(evidence.consume.ackDelivered, false);
  assert.equal(evidence.consume.receiptRecorded, false);
});

function validHashForTest(value) {
  return /^fnv1a64:[0-9a-f]{16}$/u.test(value);
}

test('Reconnect ACK Delivery Finality rejects owner, claim, and same-head tamper without changing its immutable floor', () => {
  const fixture = createFixture();
  const evidence = consumedFinality(fixture);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        fixture.baseFinalityCheckpoint,
    });
  const before = JSON.stringify(watermark);
  assert.throws(
    () => advanceSkywayReconnectAckDeliveryFinality({
      watermark,
      authenticatedOwnerId: 'owner-b',
      reconnectFinalityCheckpoint: evidence.consumed,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: evidence.claimResult.claim,
    }),
    /(evidence is stale|owner is unauthorized)/,
  );
  const forgedClaim = {
    ...evidence.claimResult.claim,
    ownerId: 'owner-b',
  };
  assert.throws(
    () => advanceSkywayReconnectAckDeliveryFinality({
      watermark,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: evidence.consumed,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: forgedClaim,
    }),
    /claim binding is invalid/,
  );
  const tamperedWatermark = structuredClone(watermark);
  tamperedWatermark.ackOutboxRevision += 1;
  assert.throws(
    () => assertSkywayReconnectAckDeliveryFinalityWatermark(
      tamperedWatermark,
    ),
    /watermark binding is invalid/,
  );
  assert.equal(JSON.stringify(watermark), before);
});

test('Reconnect ACK Delivery Finality guard blocks consumed-evidence rewind before Finality restore mutation', () => {
  const fixture = createFixture();
  const evidence = consumedFinality(fixture);
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        fixture.baseFinalityCheckpoint,
    });
  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark: initial,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const receipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: delivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  assert.equal(
    assertSkywayReconnectAckDeliveryFinalityRestore(receipt, {
      reconnectFinalityCheckpoint: evidence.consumed,
    }),
    receipt,
  );
  for (const candidate of [
    fixture.baseFinalityCheckpoint,
    evidence.pending,
    evidence.claimed,
  ]) {
    assert.throws(
      () => assertSkywayReconnectAckDeliveryFinalityRestore(
        receipt,
        { reconnectFinalityCheckpoint: candidate },
      ),
      /rewind/,
    );
  }
  const before = liveState(fixture);
  assert.throws(
    () => restoreSkywayReconnectFinalityCheckpoint({
      checkpoint: evidence.pending,
      currentReconnectAuthorityCheckpoint:
        fixture.ackCommit.checkpoint,
      expectedTargetReconnectFinalityCheckpointHash:
        evidence.consumed.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: receipt,
      ackOutbox: fixture.ackOutbox,
      leaseWindow: fixture.leaseWindow,
      admissionWindow: fixture.admissionWindow,
      round: fixture.round,
      snapshotHistory: fixture.snapshotHistory,
      commandJournal: fixture.commandJournal,
      replayEventLedger: fixture.replayEventLedger,
    }),
    /rewind/,
  );
  assert.equal(liveState(fixture), before);
});

test('Reconnect ACK Delivery Finality lifecycle creates a fresh unpublished floor and rejects prior-epoch use', () => {
  const fixture = createFixture();
  const evidence = consumedFinality(fixture);
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        fixture.baseFinalityCheckpoint,
    });
  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark: initial,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const receipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: delivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const lifecycle = resetSkywayReconnectFinalityLifecycle({
    baseCheckpoint: evidence.consumed,
    ackOutbox: fixture.ackOutbox,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
  const reset = resetSkywayReconnectAckDeliveryFinality({
    watermark: receipt,
    previousReconnectFinalityCheckpoint: evidence.consumed,
    nextReconnectFinalityCheckpoint: lifecycle.checkpoint,
  });
  assert.equal(reset.previousRoundEpoch, 1);
  assert.equal(reset.roundEpoch, 2);
  assert.equal(reset.clearedDeliveredOwnerCount, 1);
  assert.equal(reset.clearedReceiptOwnerCount, 1);
  assert.equal(reset.priorDeliveryFinalityCarriedForward, false);
  assert.equal(reset.priorReceiptFinalityCarriedForward, false);
  assert.equal(reset.sendPerformed, false);
  assert.equal(reset.receiptAcquired, false);
  assert.equal(
    reset.watermark.owners.every(({ delivered, receipt: value }) => (
      delivered === null && value === null
    )),
    true,
  );
  assert.throws(
    () => assertSkywayReconnectAckDeliveryFinalityRestore(
      receipt,
      { reconnectFinalityCheckpoint: lifecycle.checkpoint },
    ),
    /lifecycle is stale/,
  );
});

test('delivery-aware ACK adoption rejects full Outbox reclamation until the exact tombstone has receipt finality', () => {
  const fixture = createFixture({ ackOutboxCapacity: 1 });
  const evidence = consumedFinality(fixture);
  const next = prepareNextAckCommit(fixture);
  const base = prepareReclamationBase(fixture, next);
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: base,
    });
  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark: initial,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: base,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const before = JSON.stringify(fixture.ackOutbox);
  assert.throws(
    () => adoptSkywayReconnectAckWithReceiptFinality({
      baseCheckpoint: base,
      expectedReconnectFinalityCheckpointHash:
        base.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: delivered,
      expectedAckDeliveryFinalityWatermarkHash:
        delivered.watermarkHash,
      ackCommit: next.ackCommit,
      ackOutbox: fixture.ackOutbox,
    }),
    /requires exact receipt finality/,
  );
  assert.equal(JSON.stringify(fixture.ackOutbox), before);
  assert.throws(
    () => assertSkywayReconnectAckReceiptFinalityForReclamation(
      delivered,
      {
        reconnectFinalityCheckpoint: base,
        adoptionHash: evidence.adopted.adoption.adoptionHash,
      },
    ),
    /requires exact receipt finality/,
  );
});

test('delivery-aware ACK adoption atomically reclaims the oldest exact receipt-finalized tombstone', () => {
  const first = createFixture({ ackOutboxCapacity: 1 });
  const second = createFixture({ ackOutboxCapacity: 1 });
  const run = (fixture) => {
    const evidence = consumedFinality(fixture);
    const next = prepareNextAckCommit(fixture);
    const base = prepareReclamationBase(fixture, next);
    const initial =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: base,
      });
    const delivered = advanceSkywayReconnectAckDeliveryFinality({
      watermark: initial,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: base,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: evidence.claimResult.claim,
    });
    const receipt = advanceSkywayReconnectAckReceiptFinality({
      watermark: delivered,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: base,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: evidence.claimResult.claim,
    });
    const receiptStage =
      assertSkywayReconnectAckReceiptFinalityForReclamation(
        receipt,
        {
          reconnectFinalityCheckpoint: base,
          adoptionHash:
            evidence.adopted.adoption.adoptionHash,
        },
      );
    const result =
      adoptSkywayReconnectAckWithReceiptFinality({
        baseCheckpoint: base,
        expectedReconnectFinalityCheckpointHash:
          base.reconnectFinalityCheckpointHash,
        ackDeliveryFinalityWatermark: receipt,
        expectedAckDeliveryFinalityWatermarkHash:
          receipt.watermarkHash,
        ackCommit: next.ackCommit,
        ackOutbox: fixture.ackOutbox,
      });
    return {
      evidence,
      receipt,
      receiptStage,
      nextAckCommit: next.ackCommit,
      result,
      outbox: structuredClone(fixture.ackOutbox),
    };
  };
  const firstRun = run(first);
  const secondRun = run(second);
  assert.deepEqual(firstRun.result, secondRun.result);
  assert.deepEqual(firstRun.outbox, secondRun.outbox);
  const { evidence, receipt, receiptStage, nextAckCommit, result } =
    firstRun;
  assert.equal(result.adoptionMode, 'receipt-finalized-reclamation');
  assert.equal(result.reclaimed, true);
  assert.equal(result.reclaimedOwnerId, 'owner-a');
  assert.equal(result.reclaimedAckSequence, 0);
  assert.equal(
    result.reclaimedAdoptionHash,
    evidence.adopted.adoption.adoptionHash,
  );
  assert.equal(
    result.reclaimedReceiptStageHash,
    receiptStage.stageHash,
  );
  assert.equal(result.previousAckOutboxRevision, 3);
  assert.equal(result.ackOutboxRevision, 4);
  assert.equal(first.ackOutbox.slots[0].status, 'pending');
  assert.equal(
    first.ackOutbox.slots[0].adoption.ackCommitTransactionHash,
    nextAckCommit.transactionHash,
  );
  assert.equal(
    first.ackOutbox.slots.some((slot) => (
      slot?.adoption.adoptionHash ===
        evidence.adopted.adoption.adoptionHash
    )),
    false,
  );
  assert.equal(
    result.ackDeliveryFinalityWatermark,
    receipt,
  );
  assert.equal(result.deliveryFinalityAdvanced, false);
  assert.equal(result.receiptFinalityAdvanced, false);
  assert.equal(result.storagePerformed, false);
  assert.equal(result.sendPerformed, false);
  assert.equal(result.receiptAcquired, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.checkpoint), true);
  assert.equal(
    encoder.encode(JSON.stringify(result)).byteLength <=
      SKYWAY_RECONNECT_ACK_RECLAMATION_ADOPTION_MAX_BYTES,
    true,
  );
  assert.equal(
    assertSkywayReconnectAckDeliveryFinalityRestore(receipt, {
      reconnectFinalityCheckpoint: result.checkpoint,
    }),
    receipt,
  );
});

test('delivery-aware ACK adoption never skips an unmatched oldest tombstone for a newer receipt-finalized one', () => {
  const fixture = createFixture({
    ackOutboxCapacity: 2,
    leaseCapacity: 3,
  });
  const firstEvidence = consumedFinality(fixture);
  const second = prepareNextAckCommit(fixture);
  const firstBase = prepareReclamationBase(fixture, second);
  const firstInitial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: firstBase,
    });
  const firstDelivered =
    advanceSkywayReconnectAckDeliveryFinality({
      watermark: firstInitial,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: firstBase,
      deliveryIntent: fixture.ackCommit.deliveryIntent,
      claim: firstEvidence.claimResult.claim,
    });
  const firstReceipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: firstDelivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: firstBase,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: firstEvidence.claimResult.claim,
  });
  adoptSkywayReconnectAckWithReceiptFinality({
    baseCheckpoint: firstBase,
    expectedReconnectFinalityCheckpointHash:
      firstBase.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: firstReceipt,
    expectedAckDeliveryFinalityWatermarkHash:
      firstReceipt.watermarkHash,
    ackCommit: second.ackCommit,
    ackOutbox: fixture.ackOutbox,
  });
  const secondClaim = claimNextSkywayReconnectAckDelivery(
    fixture.ackOutbox,
    { expectedRevision: fixture.ackOutbox.revision },
  );
  consumeSkywayReconnectAckDeliveryClaim(
    fixture.ackOutbox,
    {
      claim: secondClaim.claim,
      expectedRevision: fixture.ackOutbox.revision,
    },
  );
  const secondConsumed =
    createSkywayReconnectFinalityCheckpoint({
      reconnectAuthorityCheckpoint: second.ackCommit.checkpoint,
      ackOutbox: fixture.ackOutbox,
    });

  fixture.ackCommit = second.ackCommit;
  const third = prepareNextAckCommit(fixture, {
    clientSequence: 2,
    dirX: 0.45,
    tick: 1,
  });
  const secondBase = prepareReclamationBase(fixture, third);
  const secondInitial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: secondBase,
    });
  const secondDelivered =
    advanceSkywayReconnectAckDeliveryFinality({
      watermark: secondInitial,
      authenticatedOwnerId: 'owner-a',
      reconnectFinalityCheckpoint: secondBase,
      deliveryIntent: second.ackCommit.deliveryIntent,
      claim: secondClaim.claim,
    });
  const secondReceipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: secondDelivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: secondBase,
    deliveryIntent: second.ackCommit.deliveryIntent,
    claim: secondClaim.claim,
  });
  assert.notEqual(
    secondReceipt.owners[0].receipt.adoptionHash,
    firstEvidence.adopted.adoption.adoptionHash,
  );
  assert.equal(
    secondConsumed.components.ackOutboxSnapshot.slots.filter(
      (slot) => slot?.status === 'consumed',
    ).length,
    2,
  );
  const before = JSON.stringify(fixture.ackOutbox);
  assert.throws(
    () => adoptSkywayReconnectAckWithReceiptFinality({
      baseCheckpoint: secondBase,
      expectedReconnectFinalityCheckpointHash:
        secondBase.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: secondReceipt,
      expectedAckDeliveryFinalityWatermarkHash:
        secondReceipt.watermarkHash,
      ackCommit: third.ackCommit,
      ackOutbox: fixture.ackOutbox,
    }),
    /requires exact receipt finality/,
  );
  assert.equal(JSON.stringify(fixture.ackOutbox), before);
});

test('delivery-aware ACK adoption uses an empty slot without receipt and rejects stale dual-CAS heads', () => {
  const fixture = createFixture({ ackOutboxCapacity: 2 });
  const evidence = consumedFinality(fixture);
  const next = prepareNextAckCommit(fixture);
  const base = prepareReclamationBase(fixture, next);
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: base,
    });
  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark: initial,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: base,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const before = JSON.stringify(fixture.ackOutbox);
  assert.throws(
    () => adoptSkywayReconnectAckWithReceiptFinality({
      baseCheckpoint: base,
      expectedReconnectFinalityCheckpointHash:
        base.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: delivered,
      expectedAckDeliveryFinalityWatermarkHash:
        hashSkywaySnapshot('stale-delivery-finality'),
      ackCommit: next.ackCommit,
      ackOutbox: fixture.ackOutbox,
    }),
    /Delivery Finality head is stale/,
  );
  assert.throws(
    () => adoptSkywayReconnectAckWithReceiptFinality({
      baseCheckpoint: base,
      expectedReconnectFinalityCheckpointHash:
        hashSkywaySnapshot('stale-finality'),
      ackDeliveryFinalityWatermark: delivered,
      expectedAckDeliveryFinalityWatermarkHash:
        delivered.watermarkHash,
      ackCommit: next.ackCommit,
      ackOutbox: fixture.ackOutbox,
    }),
    /Finality head is stale/,
  );
  assert.equal(JSON.stringify(fixture.ackOutbox), before);

  const result = adoptSkywayReconnectAckWithReceiptFinality({
    baseCheckpoint: base,
    expectedReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: delivered,
    expectedAckDeliveryFinalityWatermarkHash:
      delivered.watermarkHash,
    ackCommit: next.ackCommit,
    ackOutbox: fixture.ackOutbox,
  });
  assert.equal(result.adoptionMode, 'empty-slot');
  assert.equal(result.reclaimed, false);
  assert.equal(result.reclaimedAdoptionHash, null);
  assert.equal(fixture.ackOutbox.slots[0].status, 'consumed');
  assert.equal(fixture.ackOutbox.slots[1].status, 'pending');
});

test('delivery-aware ACK adoption retains exact retries and full unresolved work fails closed', () => {
  const consumedFixture =
    createFixture({ ackOutboxCapacity: 1 });
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        consumedFixture.baseFinalityCheckpoint,
    });
  const evidence = consumedFinality(consumedFixture);
  const beforeRetry = JSON.stringify(consumedFixture.ackOutbox);
  const retry = adoptSkywayReconnectAckWithReceiptFinality({
    baseCheckpoint: evidence.consumed,
    expectedReconnectFinalityCheckpointHash:
      evidence.consumed.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: initial,
    expectedAckDeliveryFinalityWatermarkHash:
      initial.watermarkHash,
    ackCommit: consumedFixture.ackCommit,
    ackOutbox: consumedFixture.ackOutbox,
  });
  assert.equal(retry.adoptionMode, 'retained-retry');
  assert.equal(retry.reclaimed, false);
  assert.equal(retry.checkpoint.reconnectFinalityCheckpointHash,
    evidence.consumed.reconnectFinalityCheckpointHash);
  assert.equal(JSON.stringify(consumedFixture.ackOutbox), beforeRetry);

  const pendingFixture =
    createFixture({ ackOutboxCapacity: 1 });
  const adopted = adopt(pendingFixture);
  const next = prepareNextAckCommit(pendingFixture);
  const base = prepareReclamationBase(pendingFixture, next);
  const pendingWatermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: base,
    });
  const beforePending = JSON.stringify(pendingFixture.ackOutbox);
  assert.throws(
    () => adoptSkywayReconnectAckWithReceiptFinality({
      baseCheckpoint: base,
      expectedReconnectFinalityCheckpointHash:
        base.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: pendingWatermark,
      expectedAckDeliveryFinalityWatermarkHash:
        pendingWatermark.watermarkHash,
      ackCommit: next.ackCommit,
      ackOutbox: pendingFixture.ackOutbox,
    }),
    /capacity is full/,
  );
  assert.equal(JSON.stringify(pendingFixture.ackOutbox), beforePending);
});

test('sequential Reconnect ACK adoption bridges the correction Authority head and adopts through an empty slot deterministically', () => {
  const run = () => {
    const fixture = createFixture({ ackOutboxCapacity: 2 });
    consumedFinality(fixture);
    const next = prepareNextAckCommit(fixture);
    const base = prepareSequentialBase(fixture, next);
    const watermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: base,
      });
    const result = adoptSequentialSkywayReconnectAck({
      baseCheckpoint: base,
      expectedReconnectFinalityCheckpointHash:
        base.reconnectFinalityCheckpointHash,
      reconnectCorrection: next.correction,
      postCorrectionReconnectAuthorityCheckpoint:
        next.reconnectAuthorityCheckpoint,
      ackCommit: next.ackCommit,
      ackDeliveryFinalityWatermark: watermark,
      expectedAckDeliveryFinalityWatermarkHash:
        watermark.watermarkHash,
      ackOutbox: fixture.ackOutbox,
    });
    return {
      fixture,
      base,
      watermark,
      next,
      result,
    };
  };
  const first = run();
  const second = run();
  assert.deepEqual(first.result, second.result);
  assert.deepEqual(first.fixture.ackOutbox, second.fixture.ackOutbox);
  const { fixture, base, watermark, next, result } = first;
  assert.equal(result.authorityHeadBridged, true);
  assert.equal(result.correctionAppliedByTransaction, false);
  assert.equal(result.adoptionMode, 'empty-slot');
  assert.equal(result.reclaimed, false);
  assert.equal(
    result.previousAckOutboxRevision,
    base.ackOutboxRevision,
  );
  assert.equal(
    result.bridgeAckOutboxRevision,
    base.ackOutboxRevision + 1,
  );
  assert.equal(
    result.ackOutboxRevision,
    base.ackOutboxRevision + 2,
  );
  assert.equal(
    result.postCorrectionReconnectAuthorityCheckpointHash,
    next.reconnectAuthorityCheckpoint
      .reconnectAuthorityCheckpointHash,
  );
  assert.equal(
    result.reconnectAuthorityCheckpointHash,
    next.ackCommit.reconnectAuthorityCheckpointHash,
  );
  assert.equal(
    fixture.ackOutbox.slots.filter((slot) => (
      slot?.status === 'consumed'
    )).length,
    1,
  );
  assert.equal(
    fixture.ackOutbox.slots.filter((slot) => (
      slot?.status === 'pending'
    )).length,
    1,
  );
  assert.equal(
    result.receiptAwareAdoption.ackDeliveryFinalityWatermark,
    watermark,
  );
  assert.equal(result.deliveryFinalityAdvanced, false);
  assert.equal(result.receiptFinalityAdvanced, false);
  assert.equal(result.storagePerformed, false);
  assert.equal(result.sendPerformed, false);
  assert.equal(result.receiptAcquired, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.receiptAwareAdoption), true);
  assert.equal(
    encoder.encode(JSON.stringify(result)).byteLength <=
      SKYWAY_RECONNECT_SEQUENTIAL_ACK_ADOPTION_MAX_BYTES,
    true,
  );
});

test('sequential Reconnect ACK adoption reclaims only an exact receipt-finalized full tombstone', () => {
  const fixture = createFixture({ ackOutboxCapacity: 1 });
  const evidence = consumedFinality(fixture);
  const next = prepareNextAckCommit(fixture);
  const base = prepareSequentialBase(fixture, next);
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: base,
    });
  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark: initial,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: base,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const before = JSON.stringify(fixture.ackOutbox);
  assert.throws(
    () => adoptSequentialSkywayReconnectAck({
      baseCheckpoint: base,
      expectedReconnectFinalityCheckpointHash:
        base.reconnectFinalityCheckpointHash,
      reconnectCorrection: next.correction,
      postCorrectionReconnectAuthorityCheckpoint:
        next.reconnectAuthorityCheckpoint,
      ackCommit: next.ackCommit,
      ackDeliveryFinalityWatermark: delivered,
      expectedAckDeliveryFinalityWatermarkHash:
        delivered.watermarkHash,
      ackOutbox: fixture.ackOutbox,
    }),
    /requires exact receipt finality/,
  );
  assert.equal(JSON.stringify(fixture.ackOutbox), before);

  const receipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: delivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: base,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const result = adoptSequentialSkywayReconnectAck({
    baseCheckpoint: base,
    expectedReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    reconnectCorrection: next.correction,
    postCorrectionReconnectAuthorityCheckpoint:
      next.reconnectAuthorityCheckpoint,
    ackCommit: next.ackCommit,
    ackDeliveryFinalityWatermark: receipt,
    expectedAckDeliveryFinalityWatermarkHash:
      receipt.watermarkHash,
    ackOutbox: fixture.ackOutbox,
  });
  assert.equal(result.adoptionMode, 'receipt-finalized-reclamation');
  assert.equal(result.reclaimed, true);
  assert.equal(
    result.reclaimedAdoptionHash,
    evidence.adopted.adoption.adoptionHash,
  );
  assert.equal(fixture.ackOutbox.slots[0].status, 'pending');
  assert.equal(
    fixture.ackOutbox.slots[0].adoption.ackCommitTransactionHash,
    next.ackCommit.transactionHash,
  );
});

test('sequential Reconnect ACK adoption rejects stale CAS and non-canonical transition evidence without Outbox mutation', () => {
  const fixture = createFixture({ ackOutboxCapacity: 2 });
  consumedFinality(fixture);
  const next = prepareNextAckCommit(fixture);
  const base = prepareSequentialBase(fixture, next);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: base,
    });
  const before = JSON.stringify(fixture.ackOutbox);
  const input = {
    baseCheckpoint: base,
    expectedReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    reconnectCorrection: next.correction,
    postCorrectionReconnectAuthorityCheckpoint:
      next.reconnectAuthorityCheckpoint,
    ackCommit: next.ackCommit,
    ackDeliveryFinalityWatermark: watermark,
    expectedAckDeliveryFinalityWatermarkHash:
      watermark.watermarkHash,
    ackOutbox: fixture.ackOutbox,
  };
  assert.throws(
    () => adoptSequentialSkywayReconnectAck({
      ...input,
      expectedReconnectFinalityCheckpointHash:
        hashSkywaySnapshot('stale-sequential-finality'),
    }),
    /Finality head is stale/,
  );
  assert.throws(
    () => adoptSequentialSkywayReconnectAck({
      ...input,
      expectedAckDeliveryFinalityWatermarkHash:
        hashSkywaySnapshot('stale-sequential-watermark'),
    }),
    /Delivery Finality head is stale/,
  );
  const forgedCorrection = structuredClone(next.correction);
  forgedCorrection.previousAdmissionSnapshotHash =
    hashSkywaySnapshot('other-admission');
  forgedCorrection.transactionHash = hashSkywaySnapshot(
    without(forgedCorrection, 'transactionHash'),
  );
  assert.throws(
    () => adoptSequentialSkywayReconnectAck({
      ...input,
      reconnectCorrection: forgedCorrection,
    }),
    /Authority transition is stale/,
  );
  const forgedCommit = structuredClone(next.ackCommit);
  forgedCommit.deliveryIntent.directiveHash =
    hashSkywaySnapshot('other-directive');
  forgedCommit.deliveryIntent.deliveryIntentHash =
    hashSkywaySnapshot(without(
      forgedCommit.deliveryIntent,
      'deliveryIntentHash',
    ));
  forgedCommit.deliveryIntentHash =
    forgedCommit.deliveryIntent.deliveryIntentHash;
  forgedCommit.transactionHash = hashSkywaySnapshot(
    without(forgedCommit, 'transactionHash'),
  );
  assert.equal(
    assertSkywayReconnectAckCommitResult(forgedCommit),
    forgedCommit,
  );
  assert.throws(
    () => adoptSequentialSkywayReconnectAck({
      ...input,
      ackCommit: forgedCommit,
    }),
    /Commit is not canonical/,
  );
  assert.equal(JSON.stringify(fixture.ackOutbox), before);
});

test('sequential Reconnect ACK adoption rejects stale live Outbox and remains unknown to RoomProtocol', () => {
  const fixture = createFixture({ ackOutboxCapacity: 2 });
  consumedFinality(fixture);
  const next = prepareNextAckCommit(fixture);
  const base = prepareSequentialBase(fixture, next);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: base,
    });
  fixture.ackOutbox.revision += 1;
  const before = JSON.stringify(fixture.ackOutbox);
  assert.throws(
    () => adoptSequentialSkywayReconnectAck({
      baseCheckpoint: base,
      expectedReconnectFinalityCheckpointHash:
        base.reconnectFinalityCheckpointHash,
      reconnectCorrection: next.correction,
      postCorrectionReconnectAuthorityCheckpoint:
        next.reconnectAuthorityCheckpoint,
      ackCommit: next.ackCommit,
      ackDeliveryFinalityWatermark: watermark,
      expectedAckDeliveryFinalityWatermarkHash:
        watermark.watermarkHash,
      ackOutbox: fixture.ackOutbox,
    }),
    /Outbox head is stale/,
  );
  assert.equal(JSON.stringify(fixture.ackOutbox), before);
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-sequential-ack-adoption',
    watermark,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});

test('Reconnect Lease Finality reservation deterministically advances only Lease, Outbox, and their checkpoint heads', () => {
  const runs = [createFixture(), createFixture()].map((fixture) => {
    const evidence = consumedFinality(fixture);
    const watermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: evidence.consumed,
      });
    const { directive, resyncSnapshot } =
      prepareLeaseFinalityReservation(fixture);
    const leaseIdentity = fixture.leaseWindow;
    const outboxIdentity = fixture.ackOutbox;
    const previousOutboxSlots =
      structuredClone(fixture.ackOutbox.slots);
    const previousAuthorityHash =
      evidence.consumed.components.reconnectAuthorityCheckpoint
        .authorityCheckpointHash;
    const previousAdmissionWatermarkHash =
      evidence.consumed.components.reconnectAuthorityCheckpoint
        .admissionAckWatermarkHash;
    const result = reserveSkywayReconnectLeaseFinality({
      baseCheckpoint: evidence.consumed,
      expectedReconnectFinalityCheckpointHash:
        evidence.consumed.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: watermark,
      expectedAckDeliveryFinalityWatermarkHash:
        watermark.watermarkHash,
      authenticatedOwnerId: 'owner-a',
      directive,
      resyncSnapshot,
      leaseWindow: fixture.leaseWindow,
      ackOutbox: fixture.ackOutbox,
    });
    assert.equal(fixture.leaseWindow, leaseIdentity);
    assert.equal(fixture.ackOutbox, outboxIdentity);
    assert.equal(result.reservationChanged, true);
    assert.equal(result.authorityHeadPromoted, true);
    assert.equal(result.previousLeaseRevision, 2);
    assert.equal(result.leaseRevision, 3);
    assert.equal(result.previousAckOutboxRevision, 3);
    assert.equal(result.ackOutboxRevision, 4);
    assert.equal(
      result.checkpoint.components.reconnectAuthorityCheckpoint
        .authorityCheckpointHash,
      previousAuthorityHash,
    );
    assert.equal(
      result.checkpoint.components.reconnectAuthorityCheckpoint
        .admissionAckWatermarkHash,
      previousAdmissionWatermarkHash,
    );
    assert.deepEqual(fixture.ackOutbox.slots, previousOutboxSlots);
    assert.equal(
      result.ackDeliveryFinalityWatermark,
      watermark,
    );
    assert.equal(
      assertSkywayReconnectFinalityCheckpoint(result.checkpoint),
      result.checkpoint,
    );
    assert.equal(
      assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
        reconnectFinalityCheckpoint: result.checkpoint,
      }),
      watermark,
    );
    assert.equal(result.deliveryFinalityAdvanced, false);
    assert.equal(result.storagePerformed, false);
    assert.equal(result.sendPerformed, false);
    assert.equal(result.receiptAcquired, false);
    assert.equal(result.suppressPresentation, true);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(
      encoder.encode(JSON.stringify(result)).byteLength <=
        SKYWAY_RECONNECT_LEASE_FINALITY_RESERVATION_MAX_BYTES,
      true,
    );
    return { result, fixture, watermark, directive, resyncSnapshot };
  });
  assert.deepEqual(runs[0].result, runs[1].result);
  assert.deepEqual(runs[0].fixture.leaseWindow, runs[1].fixture.leaseWindow);
  assert.deepEqual(runs[0].fixture.ackOutbox, runs[1].fixture.ackOutbox);
});

test('Reconnect Lease Finality exact active reservation retry is a zero-churn no-op', () => {
  const fixture = createFixture();
  const evidence = consumedFinality(fixture);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: evidence.consumed,
    });
  const { directive, resyncSnapshot } =
    prepareLeaseFinalityReservation(fixture);
  const input = {
    baseCheckpoint: evidence.consumed,
    expectedReconnectFinalityCheckpointHash:
      evidence.consumed.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: watermark,
    expectedAckDeliveryFinalityWatermarkHash:
      watermark.watermarkHash,
    authenticatedOwnerId: 'owner-a',
    directive,
    resyncSnapshot,
    leaseWindow: fixture.leaseWindow,
    ackOutbox: fixture.ackOutbox,
  };
  const first = reserveSkywayReconnectLeaseFinality(input);
  const leaseBefore = JSON.stringify(fixture.leaseWindow);
  const outboxBefore = JSON.stringify(fixture.ackOutbox);
  const retry = reserveSkywayReconnectLeaseFinality({
    ...input,
    baseCheckpoint: first.checkpoint,
    expectedReconnectFinalityCheckpointHash:
      first.reconnectFinalityCheckpointHash,
  });
  assert.equal(retry.reservationChanged, false);
  assert.equal(retry.authorityHeadPromoted, false);
  assert.equal(retry.leaseHash, first.leaseHash);
  assert.equal(
    retry.reconnectFinalityCheckpointHash,
    first.reconnectFinalityCheckpointHash,
  );
  assert.equal(retry.previousLeaseRevision, retry.leaseRevision);
  assert.equal(
    retry.previousAckOutboxRevision,
    retry.ackOutboxRevision,
  );
  assert.equal(JSON.stringify(fixture.leaseWindow), leaseBefore);
  assert.equal(JSON.stringify(fixture.ackOutbox), outboxBefore);
});

test('Reconnect Lease Finality reservation preserves receipt-finalized Outbox tombstones and immutable Delivery floor', () => {
  const fixture = createFixture();
  const evidence = consumedFinality(fixture);
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: evidence.consumed,
    });
  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark: initial,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const receipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: delivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const tombstonesBefore =
    structuredClone(fixture.ackOutbox.slots);
  const { directive, resyncSnapshot } =
    prepareLeaseFinalityReservation(fixture);
  const result = reserveSkywayReconnectLeaseFinality({
    baseCheckpoint: evidence.consumed,
    expectedReconnectFinalityCheckpointHash:
      evidence.consumed.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: receipt,
    expectedAckDeliveryFinalityWatermarkHash:
      receipt.watermarkHash,
    authenticatedOwnerId: 'owner-a',
    directive,
    resyncSnapshot,
    leaseWindow: fixture.leaseWindow,
    ackOutbox: fixture.ackOutbox,
  });
  assert.deepEqual(fixture.ackOutbox.slots, tombstonesBefore);
  assert.equal(result.ackDeliveryFinalityWatermark, receipt);
  assert.equal(
    assertSkywayReconnectAckDeliveryFinalityRestore(receipt, {
      reconnectFinalityCheckpoint: result.checkpoint,
    }),
    receipt,
  );
});

test('Reconnect Lease Finality reservation rejects stale, unauthorized, forged, and full-capacity work atomically', () => {
  for (const mutate of [
    (input) => {
      input.expectedReconnectFinalityCheckpointHash =
        hashSkywaySnapshot('stale-finality');
    },
    (input) => {
      input.expectedAckDeliveryFinalityWatermarkHash =
        hashSkywaySnapshot('stale-delivery');
    },
    (input) => {
      input.authenticatedOwnerId = 'owner-b';
    },
    (input) => {
      input.resyncSnapshot = structuredClone(input.resyncSnapshot);
      input.resyncSnapshot.ownerId = 'owner-b';
      input.resyncSnapshot.snapshotHash = hashSkywaySnapshot(
        without(input.resyncSnapshot, 'snapshotHash'),
      );
    },
  ]) {
    const fixture = createFixture();
    const evidence = consumedFinality(fixture);
    const watermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: evidence.consumed,
      });
    const projection = prepareLeaseFinalityReservation(fixture);
    const input = {
      baseCheckpoint: evidence.consumed,
      expectedReconnectFinalityCheckpointHash:
        evidence.consumed.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: watermark,
      expectedAckDeliveryFinalityWatermarkHash:
        watermark.watermarkHash,
      authenticatedOwnerId: 'owner-a',
      ...projection,
      leaseWindow: fixture.leaseWindow,
      ackOutbox: fixture.ackOutbox,
    };
    mutate(input);
    const leaseBefore = JSON.stringify(fixture.leaseWindow);
    const outboxBefore = JSON.stringify(fixture.ackOutbox);
    assert.throws(
      () => reserveSkywayReconnectLeaseFinality(input),
    );
    assert.equal(JSON.stringify(fixture.leaseWindow), leaseBefore);
    assert.equal(JSON.stringify(fixture.ackOutbox), outboxBefore);
  }

  const full = createFixture({ leaseCapacity: 1 });
  const evidence = consumedFinality(full);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: evidence.consumed,
    });
  const projection = prepareLeaseFinalityReservation(full);
  const leaseBefore = JSON.stringify(full.leaseWindow);
  const outboxBefore = JSON.stringify(full.ackOutbox);
  assert.throws(
    () => reserveSkywayReconnectLeaseFinality({
      baseCheckpoint: evidence.consumed,
      expectedReconnectFinalityCheckpointHash:
        evidence.consumed.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: watermark,
      expectedAckDeliveryFinalityWatermarkHash:
        watermark.watermarkHash,
      authenticatedOwnerId: 'owner-a',
      ...projection,
      leaseWindow: full.leaseWindow,
      ackOutbox: full.ackOutbox,
    }),
    /capacity is full/,
  );
  assert.equal(JSON.stringify(full.leaseWindow), leaseBefore);
  assert.equal(JSON.stringify(full.ackOutbox), outboxBefore);

  for (const staleTarget of ['lease', 'outbox']) {
    const fixture = createFixture();
    const staleEvidence = consumedFinality(fixture);
    const staleWatermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: staleEvidence.consumed,
      });
    const staleProjection =
      prepareLeaseFinalityReservation(fixture);
    fixture[
      staleTarget === 'lease' ? 'leaseWindow' : 'ackOutbox'
    ].revision += 1;
    const staleLeaseBefore = JSON.stringify(fixture.leaseWindow);
    const staleOutboxBefore = JSON.stringify(fixture.ackOutbox);
    assert.throws(
      () => reserveSkywayReconnectLeaseFinality({
        baseCheckpoint: staleEvidence.consumed,
        expectedReconnectFinalityCheckpointHash:
          staleEvidence.consumed
            .reconnectFinalityCheckpointHash,
        ackDeliveryFinalityWatermark: staleWatermark,
        expectedAckDeliveryFinalityWatermarkHash:
          staleWatermark.watermarkHash,
        authenticatedOwnerId: 'owner-a',
        ...staleProjection,
        leaseWindow: fixture.leaseWindow,
        ackOutbox: fixture.ackOutbox,
      }),
      /head is stale/,
    );
    assert.equal(
      JSON.stringify(fixture.leaseWindow),
      staleLeaseBefore,
    );
    assert.equal(
      JSON.stringify(fixture.ackOutbox),
      staleOutboxBefore,
    );
  }
});

test('Reconnect Lease Finality reservation remains opt-in and unknown to RoomProtocol', () => {
  const fixture = createFixture();
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        fixture.baseFinalityCheckpoint,
    });
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-lease-finality-reservation',
    watermark,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});

test('exclusive Reconnect orchestration deterministically commits reservation, correction, and ACK adoption through one restore Seam', () => {
  const runs = [createFixture(), createFixture()].map((fixture) => {
    const evidence = consumedFinality(fixture);
    const watermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: evidence.consumed,
      });
    const identities = {
      leaseWindow: fixture.leaseWindow,
      admissionWindow: fixture.admissionWindow,
      round: fixture.round,
      snapshotHistory: fixture.snapshotHistory,
      commandJournal: fixture.commandJournal,
      replayEventLedger: fixture.replayEventLedger,
      ackOutbox: fixture.ackOutbox,
    };
    const input = exclusiveOrchestrationInput(
      fixture,
      evidence.consumed,
      watermark,
    );
    const environmentForRound = input.environmentForRound;
    let environmentCalls = 0;
    input.environmentForRound = (arguments_) => {
      environmentCalls += 1;
      return environmentForRound(arguments_);
    };
    const result =
      applySkywayExclusiveReconnectOrchestration(input);
    assert.equal(environmentCalls, 1);
    for (const [key, identity] of Object.entries(identities)) {
      assert.equal(fixture[key], identity);
    }
    assert.equal(result.reservationApplied, true);
    assert.equal(result.correctionApplied, true);
    assert.equal(result.ackCommitted, true);
    assert.equal(result.ackAdopted, true);
    assert.equal(result.previousLeaseRevision, 2);
    assert.equal(result.reservedLeaseRevision, 3);
    assert.equal(result.leaseRevision, 4);
    assert.equal(result.previousAckOutboxRevision, 3);
    assert.equal(result.reservationAckOutboxRevision, 4);
    assert.equal(result.bridgeAckOutboxRevision, 5);
    assert.equal(result.ackOutboxRevision, 6);
    assert.equal(
      result.checkpoint.components.reconnectAuthorityCheckpoint
        .components.admissionAckWatermark
        .acknowledgements[0].ackSequence,
      1,
    );
    assert.equal(
      result.checkpoint.components.ackOutboxSnapshot.slots
        .some((slot) => (
          slot?.status === 'pending' &&
          slot.adoption.ownerId === 'owner-a' &&
          slot.adoption.ackSequence === 1
        )),
      true,
    );
    assert.equal(
      assertSkywayReconnectFinalityCheckpoint(result.checkpoint),
      result.checkpoint,
    );
    assert.equal(
      assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
        reconnectFinalityCheckpoint: result.checkpoint,
      }),
      watermark,
    );
    assert.equal(result.deliveryFinalityAdvanced, false);
    assert.equal(result.eventsCommitted, false);
    assert.equal(result.storagePerformed, false);
    assert.equal(result.sendPerformed, false);
    assert.equal(result.receiptAcquired, false);
    assert.equal(result.suppressPresentation, true);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(
      encoder.encode(JSON.stringify(result)).byteLength <=
        SKYWAY_RECONNECT_EXCLUSIVE_ORCHESTRATION_MAX_BYTES,
      true,
    );
    return { result, fixture };
  });
  assert.deepEqual(runs[0].result, runs[1].result);
  assert.deepEqual(runs[0].fixture.leaseWindow, runs[1].fixture.leaseWindow);
  assert.deepEqual(runs[0].fixture.admissionWindow, runs[1].fixture.admissionWindow);
  assert.deepEqual(runs[0].fixture.ackOutbox, runs[1].fixture.ackOutbox);
});

test('exclusive Reconnect orchestration consumes an exact active reservation without Lease or Outbox reservation churn', () => {
  const fixture = createFixture();
  const evidence = consumedFinality(fixture);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: evidence.consumed,
    });
  const projection = prepareLeaseFinalityReservation(fixture);
  const reservation = reserveSkywayReconnectLeaseFinality({
    baseCheckpoint: evidence.consumed,
    expectedReconnectFinalityCheckpointHash:
      evidence.consumed.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: watermark,
    expectedAckDeliveryFinalityWatermarkHash:
      watermark.watermarkHash,
    authenticatedOwnerId: 'owner-a',
    ...projection,
    leaseWindow: fixture.leaseWindow,
    ackOutbox: fixture.ackOutbox,
  });
  const result = applySkywayExclusiveReconnectOrchestration({
    ...exclusiveOrchestrationInput(
      fixture,
      reservation.checkpoint,
      watermark,
    ),
    ...projection,
  });
  assert.equal(result.reservationApplied, false);
  assert.equal(result.previousLeaseRevision, 3);
  assert.equal(result.reservedLeaseRevision, 3);
  assert.equal(result.leaseRevision, 4);
  assert.equal(result.previousAckOutboxRevision, 4);
  assert.equal(result.reservationAckOutboxRevision, 4);
  assert.equal(result.bridgeAckOutboxRevision, 5);
  assert.equal(result.ackOutboxRevision, 6);
  assert.equal(result.leaseHash, reservation.leaseHash);
});

test('exclusive Reconnect orchestration fails closed before live mutation when final ACK adoption lacks receipt capacity', () => {
  const fixture = createFixture({
    ackOutboxCapacity: 1,
    leaseCapacity: 2,
  });
  const evidence = consumedFinality(fixture);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: evidence.consumed,
    });
  const before = liveState(fixture);
  assert.throws(
    () => applySkywayExclusiveReconnectOrchestration(
      exclusiveOrchestrationInput(
        fixture,
        evidence.consumed,
        watermark,
      ),
    ),
    /requires exact receipt finality/,
  );
  assert.equal(liveState(fixture), before);
});

test('exclusive Reconnect orchestration composes receipt-aware reclamation without advancing the immutable Delivery floor', () => {
  const fixture = createFixture({
    ackOutboxCapacity: 1,
    leaseCapacity: 2,
  });
  const evidence = consumedFinality(fixture);
  const initial =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: evidence.consumed,
    });
  const delivered = advanceSkywayReconnectAckDeliveryFinality({
    watermark: initial,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const receipt = advanceSkywayReconnectAckReceiptFinality({
    watermark: delivered,
    authenticatedOwnerId: 'owner-a',
    reconnectFinalityCheckpoint: evidence.consumed,
    deliveryIntent: fixture.ackCommit.deliveryIntent,
    claim: evidence.claimResult.claim,
  });
  const result = applySkywayExclusiveReconnectOrchestration(
    exclusiveOrchestrationInput(
      fixture,
      evidence.consumed,
      receipt,
    ),
  );
  assert.equal(result.ackOutboxRevision, 6);
  assert.equal(
    fixture.ackOutbox.slots[0].status,
    'pending',
  );
  assert.equal(
    fixture.ackOutbox.slots[0].adoption.ackSequence,
    1,
  );
  assert.equal(
    result.ackDeliveryFinalityWatermarkHash,
    receipt.watermarkHash,
  );
  assert.equal(result.deliveryFinalityAdvanced, false);
  assert.equal(result.receiptFinalityAdvanced, false);
});

test('exclusive Reconnect orchestration rejects stale heads, owner/projection tamper, and Lease capacity atomically', () => {
  for (const mutate of [
    (input) => {
      input.expectedReconnectFinalityCheckpointHash =
        hashSkywaySnapshot('exclusive-stale-finality');
    },
    (input) => {
      input.expectedAckDeliveryFinalityWatermarkHash =
        hashSkywaySnapshot('exclusive-stale-delivery');
    },
    (input) => {
      input.authenticatedOwnerId = 'owner-b';
    },
    (input) => {
      input.resyncSnapshot = structuredClone(input.resyncSnapshot);
      input.resyncSnapshot.ownerId = 'owner-b';
      input.resyncSnapshot.snapshotHash = hashSkywaySnapshot(
        without(input.resyncSnapshot, 'snapshotHash'),
      );
    },
  ]) {
    const fixture = createFixture();
    const evidence = consumedFinality(fixture);
    const watermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: evidence.consumed,
      });
    const input = exclusiveOrchestrationInput(
      fixture,
      evidence.consumed,
      watermark,
    );
    mutate(input);
    const before = liveState(fixture);
    assert.throws(
      () => applySkywayExclusiveReconnectOrchestration(input),
    );
    assert.equal(liveState(fixture), before);
  }

  const full = createFixture({ leaseCapacity: 1 });
  const evidence = consumedFinality(full);
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: evidence.consumed,
    });
  const before = liveState(full);
  assert.throws(
    () => applySkywayExclusiveReconnectOrchestration(
      exclusiveOrchestrationInput(
        full,
        evidence.consumed,
        watermark,
      ),
    ),
    /capacity is full/,
  );
  assert.equal(liveState(full), before);
});

test('exclusive Reconnect orchestration contains environment failure and rejects callback-induced live drift without adding mutation', () => {
  {
    const fixture = createFixture();
    const evidence = consumedFinality(fixture);
    const watermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: evidence.consumed,
      });
    const input = exclusiveOrchestrationInput(
      fixture,
      evidence.consumed,
      watermark,
    );
    input.environmentForRound = () => {
      throw new Error('environment rejected');
    };
    const before = liveState(fixture);
    assert.throws(
      () => applySkywayExclusiveReconnectOrchestration(input),
      /environment rejected/,
    );
    assert.equal(liveState(fixture), before);
  }

  {
    const fixture = createFixture();
    const evidence = consumedFinality(fixture);
    const watermark =
      createSkywayReconnectAckDeliveryFinalityWatermark({
        reconnectFinalityCheckpoint: evidence.consumed,
      });
    const input = exclusiveOrchestrationInput(
      fixture,
      evidence.consumed,
      watermark,
    );
    const environmentForRound = input.environmentForRound;
    let injectedState = null;
    input.environmentForRound = (arguments_) => {
      fixture.ackOutbox.revision += 1;
      injectedState = liveState(fixture);
      return environmentForRound(arguments_);
    };
    assert.throws(
      () => applySkywayExclusiveReconnectOrchestration(input),
      /base image is stale/,
    );
    assert.equal(liveState(fixture), injectedState);
  }
});

test('exclusive Reconnect orchestration remains opt-in and unknown to RoomProtocol', () => {
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-exclusive-orchestration',
  }), {
    ok: false,
    code: 'unknown-type',
  });
});

test('Reconnect ACK Delivery Finality remains opt-in and unknown to RoomProtocol', () => {
  const fixture = createFixture();
  const watermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint:
        fixture.baseFinalityCheckpoint,
    });
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-ack-delivery-finality',
    watermark,
  }), {
    ok: false,
    code: 'unknown-type',
  });
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-ack-reclamation-adoption',
    watermark,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
