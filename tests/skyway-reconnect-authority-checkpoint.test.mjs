import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceSkywayAdmissionAckWatermark,
  createSkywayAdmissionAckWatermark,
} from '../src/core/skyway-admission-ack-finality.js';
import {
  createSkywayAuthorityCheckpoint,
} from '../src/core/skyway-authority-checkpoint.js';
import {
  applySkywayAuthoritativeReconnectCorrection,
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
  consumeSkywayReconnectLease,
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
  createSkywayReconnectAuthorityCheckpoint,
  resetSkywayReconnectAuthorityLifecycle,
  restoreSkywayReconnectAuthorityCheckpoint,
  SKYWAY_RECONNECT_AUTHORITY_CHECKPOINT_VERSION,
} from '../src/core/skyway-reconnect-authority-checkpoint.js';
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

const SESSION = 'device-session:reconnect-authority-checkpoint';
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

function command(clientSequence = 0) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId: 'owner-a',
    participantId: 'player',
    clientSequence,
    tick: 3,
    input: RESUMED_INPUT,
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
    command: command(),
  };
}

function reserveOwnerLease(fixture, ownerId) {
  const claim = createSkywayOwnerResumeClaim({
    admissionAckWatermark: fixture.admissionAckWatermark,
    ownerId,
  });
  const divergentClaim = {
    ...claim,
    authorityCheckpointHash: hashSkywaySnapshot(
      `older-authority:${ownerId}`,
    ),
  };
  divergentClaim.claimHash = hashSkywaySnapshot(
    without(divergentClaim, 'claimHash'),
  );
  const directive = planSkywayOwnerResync({
    authenticatedOwnerId: ownerId,
    claim: divergentClaim,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
  });
  const resyncSnapshot = projectSkywayOwnerFullResyncSnapshot({
    authenticatedOwnerId: ownerId,
    directive,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
  });
  return reserveSkywayReconnectLease(fixture.leaseWindow, {
    authenticatedOwnerId: ownerId,
    directive,
    resyncSnapshot,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
    expectedRevision: fixture.leaseWindow.revision,
  });
}

function authority(fixture, roundEpoch = fixture.round.roundEpoch ?? 1) {
  return createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
}

function wrapper(fixture, {
  authorityCheckpoint = authority(fixture),
  admissionAckWatermark = fixture.admissionAckWatermark,
  leaseWindow = fixture.leaseWindow,
} = {}) {
  return createSkywayReconnectAuthorityCheckpoint({
    authorityCheckpoint,
    leaseWindow,
    admissionAckWatermark,
  });
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

function liveState(fixture) {
  return {
    authority: authority(
      fixture,
      fixture.snapshotHistory.roundEpoch,
    ),
    lease: snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
  };
}

function restore(fixture, checkpoint, expectedHash, watermark) {
  return restoreSkywayReconnectAuthorityCheckpoint({
    checkpoint,
    expectedTargetReconnectAuthorityHash: expectedHash,
    admissionAckWatermark: watermark,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
}

test('Reconnect Authority Checkpoint deterministically binds corrected Authority, consumed Lease, and lagging ACK Watermark', () => {
  const first = createFixture();
  const second = createFixture();
  const firstCorrection = applyCorrection(first);
  const secondCorrection = applyCorrection(second);
  const firstCheckpoint = wrapper(first, {
    authorityCheckpoint: firstCorrection.authorityCheckpoint,
  });
  const secondCheckpoint = wrapper(second, {
    authorityCheckpoint: secondCorrection.authorityCheckpoint,
  });

  assert.deepEqual(firstCheckpoint, secondCheckpoint);
  assert.equal(
    firstCheckpoint.version,
    SKYWAY_RECONNECT_AUTHORITY_CHECKPOINT_VERSION,
  );
  assert.equal(
    firstCheckpoint.kind,
    'skyway-reconnect-authority-checkpoint',
  );
  assert.equal(
    firstCheckpoint.authorityCheckpointHash,
    firstCorrection.authorityCheckpoint.authorityCheckpointHash,
  );
  assert.equal(
    firstCheckpoint.admissionAckWatermarkHash,
    first.admissionAckWatermark.watermarkHash,
  );
  assert.notEqual(
    firstCheckpoint.authorityCheckpointHash,
    first.admissionAckWatermark.authorityCheckpointHash,
  );
  assert.equal(
    firstCheckpoint.components.leaseWindowSnapshot.slots[0].status,
    'consumed',
  );
  assert.equal(
    firstCheckpoint.reconnectAuthorityCheckpointHash,
    hashSkywaySnapshot(without(
      firstCheckpoint,
      'reconnectAuthorityCheckpointHash',
    )),
  );
  assert.equal(Object.isFrozen(firstCheckpoint), true);
  assert.equal(Object.isFrozen(firstCheckpoint.components), true);
  assert.equal(
    JSON.parse(JSON.stringify(firstCheckpoint))
      .reconnectAuthorityCheckpointHash,
    firstCheckpoint.reconnectAuthorityCheckpointHash,
  );
});

test('Reconnect Authority Checkpoint restores Authority and Lease together without changing ACK finality', () => {
  const fixture = createFixture();
  const activeLeaseImage =
    snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow);
  const correction = applyCorrection(fixture);
  const source = wrapper(fixture, {
    authorityCheckpoint: correction.authorityCheckpoint,
  });
  const watermarkBefore = JSON.stringify(fixture.admissionAckWatermark);
  const identities = {
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

  assert.equal(
    admitSkywayParticipantInput(
      fixture.admissionWindow,
      command(1),
    ).accepted,
    true,
  );
  const consumedLeaseHash = hashSkywaySnapshot(
    snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
  );
  restoreSkywayReconnectLeaseWindow(
    fixture.leaseWindow,
    activeLeaseImage,
    {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
      expectedTargetLeaseWindowHash: consumedLeaseHash,
    },
  );
  const target = wrapper(fixture);
  const result = restore(
    fixture,
    source,
    target.reconnectAuthorityCheckpointHash,
    fixture.admissionAckWatermark,
  );

  assert.equal(result.ackWatermarkAdvanced, false);
  assert.equal(result.ackWatermarkPublished, false);
  assert.deepEqual(
    wrapper(fixture, {
      authorityCheckpoint: correction.authorityCheckpoint,
    }),
    source,
  );
  assert.equal(JSON.stringify(fixture.admissionAckWatermark), watermarkBefore);
  assert.equal(fixture.leaseWindow, identities.lease);
  assert.equal(fixture.admissionWindow, identities.admission);
  assert.equal(fixture.round, identities.round);
  assert.equal(fixture.round.course, identities.course);
  assert.equal(fixture.round.inputTimeline, identities.timeline);
  assert.equal(fixture.round.participants[0], identities.participant);
  assert.equal(fixture.snapshotHistory, identities.history);
  assert.equal(fixture.commandJournal, identities.journal);
  assert.equal(fixture.replayEventLedger, identities.ledger);
});

test('Reconnect Authority Checkpoint rejects stale aggregate CAS and Watermark mismatch without partial work', () => {
  const fixture = createFixture();
  const source = wrapper(fixture, {
    authorityCheckpoint: fixture.authorityCheckpoint,
  });
  consumeSkywayReconnectLease(fixture.leaseWindow, {
    authenticatedOwnerId: 'owner-a',
    lease: fixture.lease,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
    expectedRevision: fixture.leaseWindow.revision,
  });
  const changed = liveState(fixture);
  assert.throws(() => restore(
    fixture,
    source,
    source.reconnectAuthorityCheckpointHash,
    fixture.admissionAckWatermark,
  ), /target revision is stale/);
  assert.deepEqual(liveState(fixture), changed);

  const correctedFixture = createFixture();
  const correction = applyCorrection(correctedFixture);
  const corrected = wrapper(correctedFixture, {
    authorityCheckpoint: correction.authorityCheckpoint,
  });
  const advanced = advanceSkywayAdmissionAckWatermark({
    watermark: correctedFixture.admissionAckWatermark,
    authorityCheckpoint: correction.authorityCheckpoint,
  });
  const beforeMismatch = liveState(correctedFixture);
  assert.throws(() => restore(
    correctedFixture,
    corrected,
    corrected.reconnectAuthorityCheckpointHash,
    advanced,
  ), /ACK watermark is stale/);
  assert.deepEqual(liveState(correctedFixture), beforeMismatch);
});

test('Reconnect Authority Checkpoint rejects tamper and Lease configuration mismatch atomically', () => {
  const fixture = createFixture();
  const source = wrapper(fixture, {
    authorityCheckpoint: fixture.authorityCheckpoint,
  });
  const tampered = structuredClone(source);
  tampered.tick += 1;
  const beforeTamper = liveState(fixture);
  assert.throws(() => restore(
    fixture,
    tampered,
    source.reconnectAuthorityCheckpointHash,
    fixture.admissionAckWatermark,
  ), /binding is invalid/);
  assert.deepEqual(liveState(fixture), beforeTamper);

  const embeddedAuthorityTamper = structuredClone(source);
  embeddedAuthorityTamper.components.authorityCheckpoint.tick += 1;
  assert.throws(() => restore(
    fixture,
    embeddedAuthorityTamper,
    source.reconnectAuthorityCheckpointHash,
    fixture.admissionAckWatermark,
  ), /Authority checkpoint binding/);
  assert.deepEqual(liveState(fixture), beforeTamper);

  const incompatibleFixture = createFixture();
  const incompatibleSource = wrapper(incompatibleFixture, {
    authorityCheckpoint: incompatibleFixture.authorityCheckpoint,
  });
  incompatibleFixture.leaseWindow = createSkywayReconnectLeaseWindow({
    authorityCheckpoint: incompatibleFixture.authorityCheckpoint,
    admissionAckWatermark: incompatibleFixture.admissionAckWatermark,
    capacity: 1,
    leaseDurationTicks: 4,
  });
  const incompatibleTarget = wrapper(incompatibleFixture, {
    authorityCheckpoint: incompatibleFixture.authorityCheckpoint,
  });
  const beforeIncompatible = liveState(incompatibleFixture);
  assert.throws(() => restore(
    incompatibleFixture,
    incompatibleSource,
    incompatibleTarget.reconnectAuthorityCheckpointHash,
    incompatibleFixture.admissionAckWatermark,
  ), /configuration is incompatible/);
  assert.deepEqual(liveState(incompatibleFixture), beforeIncompatible);
});

test('Reconnect Authority lifecycle atomically resets Authority and clears active Leases into a fresh unpublished epoch floor', () => {
  const fixture = createFixture();
  consumeSkywayReconnectLease(fixture.leaseWindow, {
    authenticatedOwnerId: 'owner-a',
    lease: fixture.lease,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
    expectedRevision: fixture.leaseWindow.revision,
  });
  const ownerBLease = reserveOwnerLease(fixture, 'owner-b');
  const base = wrapper(fixture, {
    authorityCheckpoint: fixture.authorityCheckpoint,
  });
  const previousWatermark = JSON.stringify(
    fixture.admissionAckWatermark,
  );
  const identities = {
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
  const result = resetSkywayReconnectAuthorityLifecycle({
    baseReconnectAuthorityCheckpoint: base,
    admissionAckWatermark: fixture.admissionAckWatermark,
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
  assert.equal(result.clearedActiveLeaseCount, 1);
  assert.equal(result.clearedConsumedLeaseCount, 1);
  assert.equal(result.ackWatermarkAdvanced, false);
  assert.equal(result.ackWatermarkPublished, false);
  assert.equal(result.priorAckFinalityCarriedForward, false);
  assert.equal(
    result.admissionAckWatermark.acknowledgements.every(
      ({ ackSequence }) => ackSequence === -1,
    ),
    true,
  );
  assert.equal(
    JSON.stringify(fixture.admissionAckWatermark),
    previousWatermark,
  );
  assert.equal(fixture.leaseWindow.roundEpoch, 2);
  assert.equal(fixture.leaseWindow.revision, 0);
  assert.equal(
    fixture.leaseWindow.slots.every((slot) => slot === null),
    true,
  );
  assert.deepEqual(
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint: authority(fixture, 2),
      leaseWindow: fixture.leaseWindow,
      admissionAckWatermark: result.admissionAckWatermark,
    }),
    result.checkpoint,
  );
  assert.equal(fixture.leaseWindow, identities.lease);
  assert.equal(fixture.admissionWindow, identities.admission);
  assert.equal(fixture.round, identities.round);
  assert.equal(fixture.round.course, identities.course);
  assert.equal(fixture.round.inputTimeline, identities.timeline);
  assert.equal(fixture.round.participants[0], identities.participant);
  assert.equal(fixture.snapshotHistory, identities.history);
  assert.equal(fixture.commandJournal, identities.journal);
  assert.equal(fixture.replayEventLedger, identities.ledger);
  assert.throws(() => consumeSkywayReconnectLease(
    fixture.leaseWindow,
    {
      authenticatedOwnerId: 'owner-a',
      lease: fixture.lease,
      authorityCheckpoint: result.authorityCheckpoint,
      admissionAckWatermark: result.admissionAckWatermark,
      expectedRevision: 0,
    },
  ), /lifecycle is stale/);
  assert.throws(() => consumeSkywayReconnectLease(
    fixture.leaseWindow,
    {
      authenticatedOwnerId: 'owner-b',
      lease: ownerBLease,
      authorityCheckpoint: result.authorityCheckpoint,
      admissionAckWatermark: result.admissionAckWatermark,
      expectedRevision: 0,
    },
  ), /lifecycle is stale/);
});

test('Reconnect Authority lifecycle stale Lease base aborts every live target', () => {
  const fixture = createFixture();
  const staleBase = wrapper(fixture, {
    authorityCheckpoint: fixture.authorityCheckpoint,
  });
  consumeSkywayReconnectLease(fixture.leaseWindow, {
    authenticatedOwnerId: 'owner-a',
    lease: fixture.lease,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
    expectedRevision: fixture.leaseWindow.revision,
  });
  const before = liveState(fixture);
  assert.throws(() => resetSkywayReconnectAuthorityLifecycle({
    baseReconnectAuthorityCheckpoint: staleBase,
    admissionAckWatermark: fixture.admissionAckWatermark,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  }), /lifecycle revision is stale/);
  assert.deepEqual(liveState(fixture), before);
});

test('Reconnect Authority Checkpoint remains unwired from RoomProtocol', () => {
  const fixture = createFixture();
  const checkpoint = wrapper(fixture, {
    authorityCheckpoint: fixture.authorityCheckpoint,
  });
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-authority-checkpoint',
    checkpoint,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
