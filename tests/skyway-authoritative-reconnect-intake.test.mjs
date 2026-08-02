import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayAdmissionAckWatermark,
} from '../src/core/skyway-admission-ack-finality.js';
import {
  createSkywayAuthorityCheckpoint,
} from '../src/core/skyway-authority-checkpoint.js';
import {
  applySkywayAuthoritativeReconnectIntake,
  SKYWAY_AUTHORITATIVE_RECONNECT_INTAKE_VERSION,
} from '../src/core/skyway-authoritative-reconnect-intake.js';
import {
  createSkywayCommandJournal,
} from '../src/core/skyway-command-journal.js';
import {
  createSkywayReplayEventLedger,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  createSkywayCourseSimulation,
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

const SESSION = 'device-session:authoritative-reconnect-intake';
const FORWARD = Object.freeze({
  dirX: 0,
  dirZ: -1,
  moving: true,
  jumpHeld: false,
  grabPressed: false,
});

function without(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function createFixture() {
  const participantIds = ['player', 'bot'];
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
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
    roundEpoch: 1,
  });
  recordSkywaySnapshot(
    snapshotHistory,
    snapshotSkywayRound(round),
    { roundEpoch: 1 },
  );
  const commandJournal = createSkywayCommandJournal({
    participantIds,
    capacityTicks: 4,
    roundEpoch: 1,
  });
  const replayEventLedger = createSkywayReplayEventLedger({
    participantIds,
    capacityTicks: 4,
    roundEpoch: 1,
  });
  const admissionWindow = createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    participantIds,
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick: 0,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
  const authorityCheckpoint = createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
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
    leaseDurationTicks: 3,
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
    admissionWindow,
    authorityCheckpoint,
    admissionAckWatermark,
    leaseWindow,
    lease,
    command: {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
      ownerId: 'owner-a',
      participantId: 'player',
      clientSequence: 0,
      tick: 1,
      input: FORWARD,
    },
  };
}

function bases(fixture) {
  return {
    baseLeaseWindowSnapshot:
      snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
    baseAdmissionSnapshot:
      snapshotSkywayInputAdmissionWindow(fixture.admissionWindow),
  };
}

function apply(fixture, overrides = {}) {
  return applySkywayAuthoritativeReconnectIntake({
    authenticatedOwnerId: 'owner-a',
    lease: fixture.lease,
    command: fixture.command,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    ...bases(fixture),
    ...overrides,
  });
}

function state(fixture) {
  return {
    lease: snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
    admission: snapshotSkywayInputAdmissionWindow(
      fixture.admissionWindow,
    ),
  };
}

test('authoritative reconnect intake consumes the lease and admits the first command atomically', () => {
  const first = createFixture();
  const second = createFixture();
  const before = state(first);
  const firstResult = apply(first);
  const secondResult = apply(second);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(
    firstResult.version,
    SKYWAY_AUTHORITATIVE_RECONNECT_INTAKE_VERSION,
  );
  assert.equal(
    firstResult.kind,
    'skyway-authoritative-reconnect-intake',
  );
  assert.equal(firstResult.ownerId, 'owner-a');
  assert.equal(firstResult.nextClientSequence, 0);
  assert.equal(firstResult.participantId, 'player');
  assert.equal(firstResult.commandTick, 1);
  assert.equal(firstResult.previousLeaseRevision, 1);
  assert.equal(firstResult.leaseRevision, 2);
  assert.equal(firstResult.previousAdmissionRevision, 0);
  assert.equal(firstResult.admissionRevision, 1);
  assert.equal(firstResult.leaseConsume.consumed, true);
  assert.equal(firstResult.admission.accepted, true);
  assert.equal(firstResult.admission.queued, true);
  assert.equal(
    firstResult.transactionHash,
    hashSkywaySnapshot(without(firstResult, 'transactionHash')),
  );
  assert.equal(Object.isFrozen(firstResult), true);
  assert.equal(Object.isFrozen(firstResult.admission), true);

  const after = state(first);
  assert.equal(after.lease.revision, 2);
  assert.equal(after.lease.slots[0].status, 'consumed');
  assert.equal(after.admission.revision, 1);
  assert.equal(after.admission.owners[0].ackSequence, 0);
  assert.equal(
    after.admission.slots
      .filter(Boolean)
      .flatMap(({ decisions }) => decisions).length,
    1,
  );
  assert.deepEqual(
    Object.keys(after.admission).sort(),
    Object.keys(before.admission).sort(),
  );
});

test('authoritative reconnect intake rejects owner and sequence mismatch before mutation', () => {
  const scenarios = [
    {
      command: {
        ...createFixture().command,
        ownerId: 'owner-b',
      },
      error: /owner is not authorized/,
    },
    {
      command: {
        ...createFixture().command,
        clientSequence: 1,
      },
      error: /sequence does not match the lease/,
    },
  ];
  for (const scenario of scenarios) {
    const fixture = createFixture();
    const before = state(fixture);
    assert.throws(
      () => apply(fixture, { command: scenario.command }),
      scenario.error,
    );
    assert.deepEqual(state(fixture), before);
  }
});

test('authoritative reconnect intake leaves the lease active when Admission rejects', () => {
  const scenarios = [
    {
      participantId: 'bot',
      error: /not-owner/,
    },
    {
      tick: 3,
      error: /future-window/,
    },
    {
      input: { ...FORWARD, dirZ: 'invalid' },
      error: /invalid-input/,
    },
  ];
  for (const changes of scenarios) {
    const fixture = createFixture();
    const before = state(fixture);
    const { error, ...commandChanges } = changes;
    assert.throws(
      () => apply(fixture, {
        command: {
          ...fixture.command,
          ...commandChanges,
        },
      }),
      error,
    );
    assert.deepEqual(state(fixture), before);
    assert.equal(fixture.leaseWindow.slots[0].status, 'active');
  }
});

test('authoritative reconnect intake requires exact lease and Admission base-image CAS', () => {
  const fixture = createFixture();
  const before = state(fixture);
  const staleLeaseBase = structuredClone(before.lease);
  staleLeaseBase.revision = 0;
  assert.throws(
    () => apply(fixture, {
      baseLeaseWindowSnapshot: staleLeaseBase,
    }),
    /lease-window CAS is stale/,
  );
  assert.deepEqual(state(fixture), before);

  const staleAdmissionBase = structuredClone(before.admission);
  staleAdmissionBase.revision = 1;
  assert.throws(
    () => apply(fixture, {
      baseAdmissionSnapshot: staleAdmissionBase,
    }),
    /Admission snapshot CAS is stale/,
  );
  assert.deepEqual(state(fixture), before);
});

test('authoritative reconnect intake detects a target change during scratch preparation', () => {
  const fixture = createFixture();
  const before = state(fixture);
  let changed = false;
  const input = {};
  for (const [key, value] of Object.entries(FORWARD)) {
    Object.defineProperty(input, key, {
      enumerable: true,
      get() {
        if (!changed) {
          fixture.admissionWindow.revision += 1;
          changed = true;
        }
        return value;
      },
    });
  }
  assert.throws(
    () => apply(fixture, {
      command: { ...fixture.command, input },
    }),
    /Admission target CAS is stale/,
  );
  assert.equal(fixture.leaseWindow.revision, before.lease.revision);
  assert.equal(fixture.leaseWindow.slots[0].status, 'active');
  assert.equal(
    fixture.admissionWindow.revision,
    before.admission.revision + 1,
  );
  assert.equal(fixture.admissionWindow.owners[0].ackSequence, -1);
});

test('authoritative reconnect intake rejects a consumed-lease retry without changing Admission', () => {
  const fixture = createFixture();
  apply(fixture);
  const afterCommit = state(fixture);
  assert.throws(
    () => apply(fixture),
    /already consumed/,
  );
  assert.deepEqual(state(fixture), afterCommit);
});

test('authoritative reconnect intake remains unwired from RoomProtocol', () => {
  const fixture = createFixture();
  const result = apply(fixture);
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'authoritative-reconnect-intake',
    result,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
