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
  SKYWAY_AUTHORITATIVE_RECONNECT_CORRECTION_VERSION,
} from '../src/core/skyway-authoritative-reconnect-correction.js';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
  lookupSkywayCommandTick,
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

const SESSION = 'device-session:authoritative-reconnect-correction';
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

function createFixture({ competingPending = false } = {}) {
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
  if (competingPending) {
    assert.equal(admitSkywayParticipantInput(
      admissionWindow,
      command({
        ownerId: 'owner-b',
        participantId: 'bot',
        tick: 2,
        input: IDLE,
      }),
    ).accepted, true);
  }
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
    ...stack,
    admissionWindow,
    authorityCheckpoint,
    admissionAckWatermark,
    leaseWindow,
    lease,
    command: command(),
  };
}

function baseArguments(fixture) {
  return {
    baseLeaseWindowSnapshot:
      snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
    baseAdmissionSnapshot:
      snapshotSkywayInputAdmissionWindow(fixture.admissionWindow),
  };
}

function apply(fixture, overrides = {}) {
  return applySkywayAuthoritativeReconnectCorrection({
    authenticatedOwnerId: 'owner-a',
    lease: fixture.lease,
    command: fixture.command,
    authorityCheckpoint: fixture.authorityCheckpoint,
    admissionAckWatermark: fixture.admissionAckWatermark,
    environmentForRound: ({ course }) => environmentForCourse(course),
    leaseWindow: fixture.leaseWindow,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
    ...baseArguments(fixture),
    ...overrides,
  });
}

function liveAuthority(fixture) {
  return createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    admissionWindow: fixture.admissionWindow,
    round: fixture.round,
    snapshotHistory: fixture.snapshotHistory,
    commandJournal: fixture.commandJournal,
    replayEventLedger: fixture.replayEventLedger,
  });
}

function state(fixture) {
  return {
    lease: snapshotSkywayReconnectLeaseWindow(fixture.leaseWindow),
    authority: liveAuthority(fixture),
  };
}

test('authoritative reconnect correction commits Lease, Admission, and corrected Round as one deterministic Authority', () => {
  const first = createFixture();
  const second = createFixture();
  const beforePlayer = snapshotSkywayRound(first.round)
    .participants[0].simulation.player;
  const watermarkBefore = JSON.stringify(first.admissionAckWatermark);
  const firstResult = apply(first);
  const secondResult = apply(second);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(
    firstResult.version,
    SKYWAY_AUTHORITATIVE_RECONNECT_CORRECTION_VERSION,
  );
  assert.equal(
    firstResult.kind,
    'skyway-authoritative-reconnect-correction',
  );
  assert.equal(firstResult.ownerId, 'owner-a');
  assert.equal(firstResult.admissionBatch.correctionCount, 1);
  assert.equal(firstResult.admissionBatch.decisions[0].ownerId, 'owner-a');
  assert.equal(
    firstResult.admissionBatch.decisions[0].clientSequence,
    0,
  );
  assert.equal(firstResult.reconnectIntake.admission.accepted, true);
  assert.equal(firstResult.authoritativeIntake.status, 'resimulated');
  assert.equal(firstResult.ackWatermarkAdvanced, false);
  assert.equal(firstResult.requiresAckWatermarkAdvance, true);
  assert.equal(firstResult.suppressPresentation, true);
  assert.equal(
    firstResult.transactionHash,
    hashSkywaySnapshot(without(firstResult, 'transactionHash')),
  );
  assert.equal(Object.isFrozen(firstResult), true);

  const finalAuthority = liveAuthority(first);
  assert.deepEqual(finalAuthority, firstResult.authorityCheckpoint);
  assert.equal(first.leaseWindow.slots[0].status, 'consumed');
  assert.equal(
    finalAuthority.components.admissionSnapshot.owners[0].ackSequence,
    0,
  );
  const playerDecision = finalAuthority.components.admissionSnapshot.slots
    .filter(Boolean)
    .flatMap(({ decisions }) => decisions)
    .find(({ participantId }) => participantId === 'player');
  assert.equal(playerDecision.status, 'emitted');
  assert.equal(
    lookupSkywayCommandTick(first.commandJournal, 3, {
      roundEpoch: 1,
    }).commands[0].authority,
    'authoritative',
  );
  assert.notDeepEqual(
    snapshotSkywayRound(first.round)
      .participants[0].simulation.player,
    beforePlayer,
  );
  assert.equal(JSON.stringify(first.admissionAckWatermark), watermarkBefore);
  assert.equal(
    first.admissionAckWatermark.authorityCheckpointHash,
    firstResult.previousAuthorityCheckpointHash,
  );
  const explicitlyAdvanced = advanceSkywayAdmissionAckWatermark({
    watermark: first.admissionAckWatermark,
    authorityCheckpoint: finalAuthority,
  });
  assert.notEqual(
    explicitlyAdvanced.watermarkHash,
    first.admissionAckWatermark.watermarkHash,
  );
});

test('authoritative reconnect correction rejects a future first command without consuming its lease', () => {
  const fixture = createFixture();
  const before = state(fixture);
  assert.throws(
    () => apply(fixture, {
      command: command({ tick: 4 }),
    }),
    /requires one canonical resumed-command batch/,
  );
  assert.deepEqual(state(fixture), before);
  assert.equal(fixture.leaseWindow.slots[0].status, 'active');
});

test('authoritative reconnect correction rejects competing ready Admission work instead of widening its batch', () => {
  const fixture = createFixture({ competingPending: true });
  const before = state(fixture);
  assert.throws(
    () => apply(fixture),
    /requires one canonical resumed-command batch/,
  );
  assert.deepEqual(state(fixture), before);
});

test('authoritative reconnect correction aborts correction failure across all three targets', () => {
  const fixture = createFixture();
  const before = state(fixture);
  assert.throws(
    () => apply(fixture, {
      environmentForRound() {
        throw new Error('reconnect environment unavailable');
      },
    }),
    /reconnect environment unavailable/,
  );
  assert.deepEqual(state(fixture), before);
  assert.equal(fixture.leaseWindow.slots[0].status, 'active');
});

test('authoritative reconnect correction rejects a live lease change during scratch resimulation', () => {
  const fixture = createFixture();
  const authorityBefore = liveAuthority(fixture);
  let changed = false;
  assert.throws(
    () => apply(fixture, {
      environmentForRound({ course }) {
        if (!changed) {
          fixture.leaseWindow.revision += 1;
          changed = true;
        }
        return environmentForCourse(course);
      },
    }),
    /lease target changed during preparation/,
  );
  assert.deepEqual(liveAuthority(fixture), authorityBefore);
  assert.equal(fixture.leaseWindow.revision, 2);
  assert.equal(fixture.leaseWindow.slots[0].status, 'active');
});

test('authoritative reconnect correction rejects replay after success without a second mutation', () => {
  const fixture = createFixture();
  apply(fixture);
  const afterCommit = state(fixture);
  assert.throws(
    () => apply(fixture),
    /Authority CAS is stale/,
  );
  assert.deepEqual(state(fixture), afterCommit);
});

test('authoritative reconnect correction remains unwired from RoomProtocol', () => {
  const fixture = createFixture();
  const result = apply(fixture);
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'authoritative-reconnect-correction',
    result,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
