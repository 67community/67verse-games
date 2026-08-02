import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayAdmissionAckWatermark,
} from '../src/core/skyway-admission-ack-finality.js';
import {
  createSkywayAuthorityCheckpoint,
} from '../src/core/skyway-authority-checkpoint.js';
import {
  resetSkywayAuthoritativeLifecycle,
} from '../src/core/skyway-authoritative-lifecycle.js';
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
  SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE,
  snapshotSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  createSkywayOwnerResumeClaim,
  planSkywayOwnerResync,
  SKYWAY_OWNER_RESUME_CLAIM_MAX_BYTES,
  SKYWAY_OWNER_RESYNC_DIRECTIVE_MAX_BYTES,
  SKYWAY_RECONNECT_PLANNER_VERSION,
  validateSkywayOwnerResumeClaim,
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
  encodeClientRoomFrame,
} from '../src/core/room-protocol.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const SESSION = 'device-session:reconnect-planner';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});
const FORWARD = Object.freeze({
  ...IDLE,
  dirZ: -1,
  moving: true,
});
const encoder = new TextEncoder();

function createStack() {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const participantIds = ['player', 'guest', 'bot'];
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    inputCapacityTicks: 4,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'guest', isPlayer: false, spawn: { x: 2, z: 1 } },
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
  return {
    round,
    snapshotHistory,
    commandJournal: createSkywayCommandJournal({
      participantIds,
      capacityTicks: 4,
      roundEpoch: 1,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds,
      capacityTicks: 4,
      roundEpoch: 1,
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

function advanceThrough(stack, throughTick, roundEpoch = 1) {
  while (stack.round.tick < throughTick) {
    const tick = stack.round.tick + 1;
    const frame = stepSkywayRound(stack.round, {
      env: stack.env,
      inputFor: () => FORWARD,
    });
    appendSkywayCommandTick(stack.commandJournal, {
      roundEpoch,
      tick,
      commands: stack.round.participants.map((participant) => {
        const applied = frame.inputs.find(({ id }) => (
          id === participant.id
        ));
        return {
          participantId: participant.id,
          authority: applied ? 'predicted' : 'neutral',
          input: applied?.input ?? IDLE,
        };
      }),
    });
    appendSkywayReplayEventFrame(stack.replayEventLedger, {
      tick,
      events: frame.events,
    });
    recordSkywaySnapshot(
      stack.snapshotHistory,
      frame.snapshot,
      { roundEpoch },
    );
  }
}

function createAdmission({ currentTick = 3, roundEpoch = 1 } = {}) {
  return createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch,
    participantIds: ['player', 'guest', 'bot'],
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'guest', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
}

function command({
  participantId = 'player',
  ownerId = 'owner-a',
  clientSequence = 0,
  tick = 2,
} = {}) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId,
    participantId,
    clientSequence,
    tick,
    input: FORWARD,
  };
}

function seedAdmission(admissionWindow) {
  assert.equal(
    admitSkywayParticipantInput(admissionWindow, command()).accepted,
    true,
  );
  assert.equal(
    admitSkywayParticipantInput(admissionWindow, command({
      participantId: 'bot',
      ownerId: 'owner-b',
      tick: 3,
    })).accepted,
    true,
  );
}

function authorityCheckpoint(stack, admissionWindow, roundEpoch = 1) {
  return createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch,
    admissionWindow,
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
  });
}

function setup() {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const authority = authorityCheckpoint(stack, admissionWindow);
  const watermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: authority,
  });
  const claim = createSkywayOwnerResumeClaim({
    admissionAckWatermark: watermark,
    ownerId: 'owner-a',
  });
  return {
    stack,
    admissionWindow,
    authority,
    watermark,
    claim,
  };
}

function claimPayload(claim) {
  const { claimHash: ignored, ...payload } = claim;
  return payload;
}

function rehashClaim(claim) {
  claim.claimHash = hashSkywaySnapshot(claimPayload(claim));
  return claim;
}

function plan(fixture, overrides = {}) {
  return planSkywayOwnerResync({
    authenticatedOwnerId: 'owner-a',
    claim: fixture.claim,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
    ...overrides,
  });
}

test('Skyway reconnect planner returns one deterministic bounded owner-only resume directive', () => {
  const fixture = setup();
  const beforeAuthority = JSON.stringify(fixture.authority);
  const beforeWatermark = JSON.stringify(fixture.watermark);
  const first = plan(fixture);
  const second = plan(fixture);

  assert.deepEqual(first, second);
  assert.equal(first.version, SKYWAY_RECONNECT_PLANNER_VERSION);
  assert.equal(first.kind, 'skyway-owner-resync-directive');
  assert.equal(first.action, 'resume');
  assert.equal(first.reason, 'exact-match');
  assert.equal(first.ownerId, 'owner-a');
  assert.deepEqual(first.ownedParticipantIds, ['player', 'guest']);
  assert.equal(first.serverAckSequence, 0);
  assert.equal(first.nextClientSequence, 1);
  assert.equal(first.tick, 3);
  assert.equal(
    first.authorityCheckpointHash,
    fixture.authority.authorityCheckpointHash,
  );
  assert.equal(
    first.admissionAckWatermarkHash,
    fixture.watermark.watermarkHash,
  );
  assert.equal(first.requiresAuthoritySnapshot, false);
  const { directiveHash, ...directivePayload } = first;
  assert.equal(directiveHash, hashSkywaySnapshot(directivePayload));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.ownedParticipantIds), true);
  assert.equal(
    encoder.encode(JSON.stringify(first)).byteLength <=
      SKYWAY_OWNER_RESYNC_DIRECTIVE_MAX_BYTES,
    true,
  );
  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes(SESSION), false);
  assert.equal(serialized.includes('owner-b'), false);
  assert.equal(serialized.includes('"bot"'), false);
  assert.equal(JSON.stringify(fixture.authority), beforeAuthority);
  assert.equal(JSON.stringify(fixture.watermark), beforeWatermark);
});

test('Skyway reconnect planner applies conservative lifecycle, Authority, and Watermark precedence', () => {
  const fixture = setup();
  const lifecycle = rehashClaim({
    ...fixture.claim,
    sessionIncarnationHash: hashSkywaySnapshot('other-session'),
    authorityCheckpointHash: hashSkywaySnapshot('other-authority'),
    admissionAckWatermarkHash: hashSkywaySnapshot('other-watermark'),
  });
  assert.deepEqual(
    {
      action: plan(fixture, { claim: lifecycle }).action,
      reason: plan(fixture, { claim: lifecycle }).reason,
    },
    { action: 'full-resync', reason: 'lifecycle-changed' },
  );

  const authority = rehashClaim({
    ...fixture.claim,
    authorityCheckpointHash: hashSkywaySnapshot('other-authority'),
    admissionAckWatermarkHash: hashSkywaySnapshot('other-watermark'),
  });
  assert.equal(
    plan(fixture, { claim: authority }).reason,
    'authority-changed',
  );

  const watermark = rehashClaim({
    ...fixture.claim,
    admissionAckWatermarkHash: hashSkywaySnapshot('other-watermark'),
  });
  const result = plan(fixture, { claim: watermark });
  assert.equal(result.action, 'full-resync');
  assert.equal(result.reason, 'watermark-changed');
  assert.equal(result.nextClientSequence, null);
  assert.equal(result.requiresAuthoritySnapshot, true);
});

test('Skyway reconnect planner coarsens ACK behind, ahead, and fork into one resync reason', () => {
  const fixture = setup();
  const scenarios = [
    rehashClaim({
      ...fixture.claim,
      ackSequence: -1,
      lastAcceptedCommandHash: null,
    }),
    rehashClaim({
      ...fixture.claim,
      ackSequence: 1,
      lastAcceptedCommandHash: hashSkywaySnapshot('ahead'),
    }),
    rehashClaim({
      ...fixture.claim,
      lastAcceptedCommandHash: hashSkywaySnapshot('fork'),
    }),
  ];
  for (const claim of scenarios) {
    const result = plan(fixture, { claim });
    assert.equal(result.action, 'full-resync');
    assert.equal(result.reason, 'ack-diverged');
    assert.equal(result.nextClientSequence, null);
  }
});

test('Skyway reconnect planner fails closed on authorization and bounds claim validation', () => {
  const fixture = setup();
  const mismatch = () => plan(fixture, {
    authenticatedOwnerId: 'owner-b',
  });
  assert.throws(mismatch, /owner is not authorized/);

  const unknownClaim = rehashClaim({
    ...fixture.claim,
    ownerId: 'owner-c',
  });
  assert.throws(() => plan(fixture, {
    authenticatedOwnerId: 'owner-c',
    claim: unknownClaim,
  }), /owner is not authorized/);

  const unexpected = {
    ...fixture.claim,
    unexpected: true,
  };
  assert.throws(
    () => validateSkywayOwnerResumeClaim(unexpected),
    /Invalid Skyway owner resume claim/,
  );
  const tampered = {
    ...fixture.claim,
    ackSequence: 1,
    lastAcceptedCommandHash: hashSkywaySnapshot('tampered'),
  };
  assert.throws(
    () => validateSkywayOwnerResumeClaim(tampered),
    /claim hash/,
  );
  assert.equal(
    encoder.encode(JSON.stringify(fixture.claim)).byteLength <=
      SKYWAY_OWNER_RESUME_CLAIM_MAX_BYTES,
    true,
  );
  const tamperedWatermark = {
    ...fixture.watermark,
    watermarkHash: hashSkywaySnapshot('tampered-watermark'),
  };
  assert.throws(() => plan(fixture, {
    admissionAckWatermark: tamperedWatermark,
  }), /watermark hash/);
});

test('Skyway reconnect planner requires full resync at sequence exhaustion', () => {
  const fixture = setup();
  const owner = fixture.admissionWindow.owners.find(({ ownerId }) => (
    ownerId === 'owner-a'
  ));
  owner.ackSequence = SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE;
  owner.lastAcceptedCommand.clientSequence =
    SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE;
  fixture.authority = authorityCheckpoint(
    fixture.stack,
    fixture.admissionWindow,
  );
  fixture.watermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: fixture.authority,
  });
  fixture.claim = createSkywayOwnerResumeClaim({
    admissionAckWatermark: fixture.watermark,
    ownerId: 'owner-a',
  });

  const result = plan(fixture);
  assert.equal(result.action, 'full-resync');
  assert.equal(result.reason, 'sequence-exhausted');
  assert.equal(result.serverAckSequence, SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE);
  assert.equal(result.nextClientSequence, null);
});

test('Skyway reconnect planner makes lifecycle reset resync and fresh epoch claims resume from zero', () => {
  const fixture = setup();
  resetSkywayAuthoritativeLifecycle({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle:
      fixture.authority.components.roundCheckpointBundle,
    baseAdmissionSnapshot:
      fixture.authority.components.admissionSnapshot,
    admissionWindow: fixture.admissionWindow,
    round: fixture.stack.round,
    snapshotHistory: fixture.stack.snapshotHistory,
    commandJournal: fixture.stack.commandJournal,
    replayEventLedger: fixture.stack.replayEventLedger,
  });
  const nextAuthority = authorityCheckpoint(
    fixture.stack,
    fixture.admissionWindow,
    2,
  );
  const nextWatermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: nextAuthority,
  });
  const oldResult = plan(fixture, {
    authorityCheckpoint: nextAuthority,
    admissionAckWatermark: nextWatermark,
  });
  assert.equal(oldResult.action, 'full-resync');
  assert.equal(oldResult.reason, 'lifecycle-changed');

  const nextClaim = createSkywayOwnerResumeClaim({
    admissionAckWatermark: nextWatermark,
    ownerId: 'owner-a',
  });
  const nextResult = plan(fixture, {
    claim: nextClaim,
    authorityCheckpoint: nextAuthority,
    admissionAckWatermark: nextWatermark,
  });
  assert.equal(nextResult.action, 'resume');
  assert.equal(nextResult.serverAckSequence, -1);
  assert.equal(nextResult.nextClientSequence, 0);
});

test('Skyway reconnect planner does not activate the existing RoomProtocol', () => {
  const fixture = setup();
  assert.deepEqual(encodeClientRoomFrame({
    v: 1,
    type: 'resume',
    claim: fixture.claim,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
