import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayAdmissionAckWatermark,
} from '../src/core/skyway-admission-ack-finality.js';
import {
  createSkywayAuthorityCheckpoint,
} from '../src/core/skyway-authority-checkpoint.js';
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
  advanceSkywayInputAdmissionHead,
  createSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  projectSkywayOwnerFullResyncSnapshot,
} from '../src/core/skyway-owner-resync-snapshot.js';
import {
  consumeSkywayReconnectLease,
  createSkywayReconnectLeaseWindow,
  reserveSkywayReconnectLease,
  SKYWAY_RECONNECT_LEASE_MAX_BYTES,
  SKYWAY_RECONNECT_LEASE_MAX_CAPACITY,
  SKYWAY_RECONNECT_LEASE_MAX_DURATION_TICKS,
  SKYWAY_RECONNECT_LEASE_VERSION,
  SKYWAY_RECONNECT_LEASE_WINDOW_MAX_BYTES,
  snapshotSkywayReconnectLeaseWindow,
  validateSkywayReconnectLease,
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

const SESSION = 'device-session:reconnect-lease';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});
const encoder = new TextEncoder();

function without(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function createStack(roundEpoch = 1) {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const participantIds = ['player', 'bot'];
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    inputCapacityTicks: 4,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({
    capacityTicks: 5,
    roundEpoch,
  });
  recordSkywaySnapshot(
    snapshotHistory,
    snapshotSkywayRound(round),
    { roundEpoch },
  );
  return {
    round,
    roundEpoch,
    snapshotHistory,
    commandJournal: createSkywayCommandJournal({
      participantIds,
      capacityTicks: 4,
      roundEpoch,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds,
      capacityTicks: 4,
      roundEpoch,
    }),
    env: {
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
    },
  };
}

function advanceStack(stack, throughTick) {
  while (stack.round.tick < throughTick) {
    const tick = stack.round.tick + 1;
    const frame = stepSkywayRound(stack.round, {
      env: stack.env,
      inputFor: () => IDLE,
    });
    appendSkywayCommandTick(stack.commandJournal, {
      roundEpoch: stack.roundEpoch,
      tick,
      commands: stack.round.participants.map((participant) => ({
        participantId: participant.id,
        authority: 'predicted',
        input: IDLE,
      })),
    });
    appendSkywayReplayEventFrame(stack.replayEventLedger, {
      tick,
      events: frame.events,
    });
    recordSkywaySnapshot(
      stack.snapshotHistory,
      frame.snapshot,
      { roundEpoch: stack.roundEpoch },
    );
  }
}

function createFixture({ roundEpoch = 1 } = {}) {
  const stack = createStack(roundEpoch);
  const admissionWindow = createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch,
    participantIds: ['player', 'bot'],
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick: 0,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
  const fixture = { stack, admissionWindow, roundEpoch };
  refreshAuthority(fixture);
  return fixture;
}

function refreshAuthority(fixture) {
  fixture.authority = createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: fixture.roundEpoch,
    admissionWindow: fixture.admissionWindow,
    round: fixture.stack.round,
    snapshotHistory: fixture.stack.snapshotHistory,
    commandJournal: fixture.stack.commandJournal,
    replayEventLedger: fixture.stack.replayEventLedger,
  });
  fixture.watermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: fixture.authority,
  });
  return fixture;
}

function advanceFixture(fixture, throughTick) {
  advanceStack(fixture.stack, throughTick);
  advanceSkywayInputAdmissionHead(fixture.admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: fixture.roundEpoch,
    currentTick: throughTick,
  });
  return refreshAuthority(fixture);
}

function ownerResync(fixture, ownerId) {
  const claim = createSkywayOwnerResumeClaim({
    admissionAckWatermark: fixture.watermark,
    ownerId,
  });
  const divergentClaim = {
    ...claim,
    authorityCheckpointHash: hashSkywaySnapshot('older-authority'),
  };
  divergentClaim.claimHash = hashSkywaySnapshot(
    without(divergentClaim, 'claimHash'),
  );
  const directive = planSkywayOwnerResync({
    authenticatedOwnerId: ownerId,
    claim: divergentClaim,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
  });
  const resyncSnapshot = projectSkywayOwnerFullResyncSnapshot({
    authenticatedOwnerId: ownerId,
    directive,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
  });
  return { directive, resyncSnapshot };
}

function createWindow(fixture, overrides = {}) {
  return createSkywayReconnectLeaseWindow({
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
    ...overrides,
  });
}

function reserve(window, fixture, resync, overrides = {}) {
  return reserveSkywayReconnectLease(window, {
    authenticatedOwnerId: 'owner-a',
    directive: resync.directive,
    resyncSnapshot: resync.resyncSnapshot,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
    expectedRevision: window.revision,
    ...overrides,
  });
}

function consume(window, fixture, lease, overrides = {}) {
  return consumeSkywayReconnectLease(window, {
    authenticatedOwnerId: 'owner-a',
    lease,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
    expectedRevision: window.revision,
    ...overrides,
  });
}

test('reconnect lease reserves one deterministic bounded token and retries idempotently', () => {
  const fixture = createFixture();
  const resync = ownerResync(fixture, 'owner-a');
  const window = createWindow(fixture, {
    capacity: 2,
    leaseDurationTicks: 3,
  });
  const beforeSnapshot = JSON.stringify(resync.resyncSnapshot);
  const lease = reserve(window, fixture, resync);
  const retry = reserve(window, fixture, resync);

  assert.strictEqual(retry, lease);
  assert.equal(window.revision, 1);
  assert.equal(lease.version, SKYWAY_RECONNECT_LEASE_VERSION);
  assert.equal(lease.kind, 'skyway-reconnect-lease');
  assert.equal(lease.ownerId, 'owner-a');
  assert.equal(lease.issuedAtTick, 0);
  assert.equal(lease.expiresAtTick, 3);
  assert.equal(lease.nextClientSequence, 0);
  assert.equal(lease.reservationRevision, 1);
  assert.equal(lease.directiveHash, resync.directive.directiveHash);
  assert.equal(
    lease.resyncSnapshotHash,
    resync.resyncSnapshot.snapshotHash,
  );
  assert.equal(lease.leaseHash, hashSkywaySnapshot(
    without(lease, 'leaseHash'),
  ));
  assert.equal(validateSkywayReconnectLease(lease), lease);
  assert.equal(Object.isFrozen(lease), true);
  assert.equal(
    encoder.encode(JSON.stringify(lease)).byteLength <=
      SKYWAY_RECONNECT_LEASE_MAX_BYTES,
    true,
  );
  assert.equal(JSON.stringify(resync.resyncSnapshot), beforeSnapshot);

  const saved = snapshotSkywayReconnectLeaseWindow(window);
  assert.equal(Object.isFrozen(saved), true);
  assert.equal(Object.isFrozen(saved.slots[0]), true);
  assert.equal(
    encoder.encode(JSON.stringify(saved)).byteLength <=
      SKYWAY_RECONNECT_LEASE_WINDOW_MAX_BYTES,
    true,
  );
  const serialized = JSON.stringify(saved);
  assert.equal(serialized.includes(SESSION), false);
  assert.equal(serialized.includes('"publicRound"'), false);
  assert.equal(serialized.includes('"admission"'), false);
});

test('reconnect lease consumes once and preserves a duplicate-rejection tombstone', () => {
  const fixture = createFixture();
  const resync = ownerResync(fixture, 'owner-a');
  const window = createWindow(fixture);
  const lease = reserve(window, fixture, resync);
  const consumed = consume(window, fixture, lease);

  assert.deepEqual(consumed, {
    version: SKYWAY_RECONNECT_LEASE_VERSION,
    kind: 'skyway-reconnect-lease-consume',
    consumed: true,
    ownerId: 'owner-a',
    roundEpoch: 1,
    tick: 0,
    leaseHash: lease.leaseHash,
    directiveHash: lease.directiveHash,
    resyncSnapshotHash: lease.resyncSnapshotHash,
    authorityCheckpointHash: lease.authorityCheckpointHash,
    admissionAckWatermarkHash:
      lease.admissionAckWatermarkHash,
    nextClientSequence: 0,
    previousRevision: 1,
    revision: 2,
  });
  assert.equal(Object.isFrozen(consumed), true);
  const beforeDuplicate = JSON.stringify(window);
  assert.throws(
    () => consume(window, fixture, lease),
    /already consumed/,
  );
  assert.equal(JSON.stringify(window), beforeDuplicate);
});

test('reconnect lease rejects stale CAS and changed Authority heads without mutation', () => {
  const fixture = createFixture();
  const resync = ownerResync(fixture, 'owner-a');
  const window = createWindow(fixture, { leaseDurationTicks: 3 });
  const lease = reserve(window, fixture, resync);
  const reservedState = JSON.stringify(window);

  assert.throws(
    () => consume(window, fixture, lease, { expectedRevision: 0 }),
    /revision is stale/,
  );
  assert.equal(JSON.stringify(window), reservedState);

  advanceFixture(fixture, 1);
  assert.throws(
    () => consume(window, fixture, lease),
    /head is stale/,
  );
  assert.equal(JSON.stringify(window), reservedState);
});

test('reconnect lease expires exclusively by the current authoritative tick', () => {
  const fixture = createFixture();
  const resync = ownerResync(fixture, 'owner-a');
  const window = createWindow(fixture, { leaseDurationTicks: 2 });
  const lease = reserve(window, fixture, resync);
  advanceFixture(fixture, 2);

  const beforeExpired = JSON.stringify(window);
  assert.throws(
    () => consume(window, fixture, lease),
    /lease has expired/,
  );
  assert.equal(JSON.stringify(window), beforeExpired);
});

test('reconnect lease capacity fails closed and reclaims only expired slots deterministically', () => {
  const fixture = createFixture();
  const ownerA = ownerResync(fixture, 'owner-a');
  const ownerB = ownerResync(fixture, 'owner-b');
  const window = createWindow(fixture, {
    capacity: 1,
    leaseDurationTicks: 1,
  });
  const leaseA = reserve(window, fixture, ownerA);
  assert.throws(
    () => reserve(window, fixture, ownerB, {
      authenticatedOwnerId: 'owner-b',
    }),
    /capacity is full/,
  );
  assert.equal(window.revision, 1);

  advanceFixture(fixture, 1);
  const currentOwnerB = ownerResync(fixture, 'owner-b');
  const leaseB = reserve(window, fixture, currentOwnerB, {
    authenticatedOwnerId: 'owner-b',
  });
  assert.equal(leaseB.ownerId, 'owner-b');
  assert.equal(leaseB.reservationRevision, 2);
  assert.notEqual(leaseB.leaseHash, leaseA.leaseHash);
  assert.equal(window.slots[0].token.leaseHash, leaseB.leaseHash);
});

test('reconnect lease rejects prior-epoch tokens, tamper, and invalid bounds', () => {
  const first = createFixture();
  const resync = ownerResync(first, 'owner-a');
  const firstWindow = createWindow(first);
  const oldLease = reserve(firstWindow, first, resync);

  const second = createFixture({ roundEpoch: 2 });
  const secondWindow = createWindow(second);
  assert.throws(
    () => consume(secondWindow, second, oldLease),
    /lifecycle is stale/,
  );
  assert.equal(secondWindow.revision, 0);

  const tampered = {
    ...oldLease,
    nextClientSequence: 1,
  };
  assert.throws(
    () => validateSkywayReconnectLease(tampered),
    /lease hash/,
  );
  assert.throws(
    () => createWindow(first, {
      capacity: SKYWAY_RECONNECT_LEASE_MAX_CAPACITY + 1,
    }),
    /configuration is invalid/,
  );
  assert.throws(
    () => createWindow(first, {
      leaseDurationTicks:
        SKYWAY_RECONNECT_LEASE_MAX_DURATION_TICKS + 1,
    }),
    /configuration is invalid/,
  );
});

test('reconnect lease remains unwired from the existing RoomProtocol', () => {
  const fixture = createFixture();
  const resync = ownerResync(fixture, 'owner-a');
  const window = createWindow(fixture);
  const lease = reserve(window, fixture, resync);
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'reconnect-lease',
    lease,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
