import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayAdmissionAckWatermark,
} from '../src/core/skyway-admission-ack-finality.js';
import {
  encodeServerRoomFrame,
} from '../src/core/room-protocol.js';
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
  admitSkywayParticipantInput,
  createSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  projectSkywayOwnerFullResyncSnapshot,
  SKYWAY_OWNER_RESYNC_PUBLIC_ROUND_MAX_BYTES,
  SKYWAY_OWNER_RESYNC_SNAPSHOT_MAX_BYTES,
  SKYWAY_OWNER_RESYNC_SNAPSHOT_VERSION,
} from '../src/core/skyway-owner-resync-snapshot.js';
import {
  createSkywayOwnerResumeClaim,
  planSkywayOwnerResync,
  validateSkywayOwnerResyncDirective,
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
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const SESSION = 'device-session:owner-resync-snapshot';
const FORWARD = Object.freeze({
  dirX: 0,
  dirZ: -1,
  moving: true,
  jumpHeld: false,
  grabPressed: false,
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

function advanceThrough(stack, throughTick) {
  while (stack.round.tick < throughTick) {
    const tick = stack.round.tick + 1;
    const frame = stepSkywayRound(stack.round, {
      env: stack.env,
      inputFor: () => FORWARD,
    });
    appendSkywayCommandTick(stack.commandJournal, {
      roundEpoch: 1,
      tick,
      commands: stack.round.participants.map((participant) => {
        const applied = frame.inputs.find(({ id }) => id === participant.id);
        return {
          participantId: participant.id,
          authority: applied ? 'predicted' : 'neutral',
          input: applied?.input ?? FORWARD,
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
      { roundEpoch: 1 },
    );
  }
}

function command({
  ownerId = 'owner-a',
  participantId = 'player',
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

function createFixture() {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    participantIds: ['player', 'guest', 'bot'],
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'guest', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick: 3,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
  assert.equal(
    admitSkywayParticipantInput(admissionWindow, command()).accepted,
    true,
  );
  assert.equal(
    admitSkywayParticipantInput(admissionWindow, command({
      ownerId: 'owner-b',
      participantId: 'bot',
      tick: 3,
    })).accepted,
    true,
  );
  const authority = createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    admissionWindow,
    ...stack,
  });
  const watermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: authority,
  });
  const claim = createSkywayOwnerResumeClaim({
    admissionAckWatermark: watermark,
    ownerId: 'owner-a',
  });
  const divergentClaim = {
    ...claim,
    authorityCheckpointHash: hashSkywaySnapshot('older-authority'),
  };
  divergentClaim.claimHash = hashSkywaySnapshot(
    payloadWithout(divergentClaim, 'claimHash'),
  );
  const directive = planSkywayOwnerResync({
    authenticatedOwnerId: 'owner-a',
    claim: divergentClaim,
    authorityCheckpoint: authority,
    admissionAckWatermark: watermark,
  });
  return {
    stack,
    admissionWindow,
    authority,
    watermark,
    claim,
    directive,
  };
}

function payloadWithout(value, key) {
  const result = { ...value };
  delete result[key];
  return result;
}

function project(fixture, overrides = {}) {
  return projectSkywayOwnerFullResyncSnapshot({
    authenticatedOwnerId: 'owner-a',
    directive: fixture.directive,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
    ...overrides,
  });
}

function rebindAlteredAuthority(fixture, mutateRoundSnapshot) {
  const authority = structuredClone(fixture.authority);
  const bundle = authority.components.roundCheckpointBundle;
  mutateRoundSnapshot(bundle.components.roundSnapshot);
  bundle.roundSnapshotHash =
    hashSkywaySnapshot(bundle.components.roundSnapshot);
  bundle.bundleHash = hashSkywaySnapshot(
    payloadWithout(bundle, 'bundleHash'),
  );
  authority.roundCheckpointHash = bundle.bundleHash;
  authority.authorityCheckpointHash = hashSkywaySnapshot(
    payloadWithout(authority, 'authorityCheckpointHash'),
  );

  const watermark = structuredClone(fixture.watermark);
  watermark.authorityCheckpointHash =
    authority.authorityCheckpointHash;
  watermark.watermarkHash = hashSkywaySnapshot(
    payloadWithout(watermark, 'watermarkHash'),
  );

  const directive = structuredClone(fixture.directive);
  directive.authorityCheckpointHash =
    authority.authorityCheckpointHash;
  directive.admissionAckWatermarkHash = watermark.watermarkHash;
  directive.directiveHash = hashSkywaySnapshot(
    payloadWithout(directive, 'directiveHash'),
  );
  return { ...fixture, authority, watermark, directive };
}

test('owner full-resync projection is deterministic, bounded, immutable, and owner-safe', () => {
  const fixture = createFixture();
  const beforeAuthority = JSON.stringify(fixture.authority);
  const first = project(fixture);
  const second = project(fixture);

  assert.deepEqual(first, second);
  assert.equal(first.version, SKYWAY_OWNER_RESYNC_SNAPSHOT_VERSION);
  assert.equal(first.kind, 'skyway-owner-full-resync-snapshot');
  assert.equal(first.ownerId, 'owner-a');
  assert.equal(first.directiveHash, fixture.directive.directiveHash);
  assert.equal(
    first.authorityCheckpointHash,
    fixture.authority.authorityCheckpointHash,
  );
  assert.equal(first.tick, fixture.authority.tick);
  assert.deepEqual(
    first.publicRound.participants.map(({ id }) => id),
    ['player', 'guest', 'bot'],
  );
  assert.deepEqual(first.admission.owner.participantIds, ['player', 'guest']);
  assert.equal(first.admission.owner.admittedAckSequence, 0);
  assert.equal(first.admission.owner.committedAckSequence, 0);
  assert.equal(
    first.publicRoundHash,
    hashSkywaySnapshot(first.publicRound),
  );
  assert.equal(
    first.snapshotHash,
    hashSkywaySnapshot(payloadWithout(first, 'snapshotHash')),
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.publicRound.participants[0]), true);
  assert.equal(Object.isFrozen(first.admission.owner.participantIds), true);
  assert.equal(
    encoder.encode(JSON.stringify(first.publicRound)).byteLength <=
      SKYWAY_OWNER_RESYNC_PUBLIC_ROUND_MAX_BYTES,
    true,
  );
  assert.equal(
    encoder.encode(JSON.stringify(first)).byteLength <=
      SKYWAY_OWNER_RESYNC_SNAPSHOT_MAX_BYTES,
    true,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(JSON.stringify(fixture.authority), beforeAuthority);

  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes(SESSION), false);
  assert.equal(serialized.includes('owner-b'), false);
  assert.equal(serialized.includes('"inputTimeline"'), false);
  assert.equal(serialized.includes('"commandJournal"'), false);
  assert.equal(serialized.includes('"snapshotHistory"'), false);
  assert.equal(serialized.includes('"replayEventLedger"'), false);
  assert.equal(serialized.includes('"slots"'), false);
  assert.equal(serialized.includes('"lastAcceptedCommand"'), false);
});

test('owner projection distinguishes admitted ACK state from the committed watermark floor', () => {
  const fixture = createFixture();
  assert.equal(
    admitSkywayParticipantInput(fixture.admissionWindow, command({
      participantId: 'guest',
      clientSequence: 1,
      tick: 3,
    })).accepted,
    true,
  );
  fixture.authority = createSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    admissionWindow: fixture.admissionWindow,
    ...fixture.stack,
  });
  fixture.directive = planSkywayOwnerResync({
    authenticatedOwnerId: 'owner-a',
    claim: fixture.claim,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
  });
  assert.equal(fixture.directive.action, 'full-resync');

  const snapshot = project(fixture);
  assert.equal(snapshot.admission.owner.admittedAckSequence, 1);
  assert.equal(snapshot.admission.owner.committedAckSequence, 0);
  assert.notEqual(
    snapshot.admission.owner.admittedLastAcceptedCommandHash,
    snapshot.admission.owner.committedLastAcceptedCommandHash,
  );
});

test('owner projection rejects resume, tampered, stale, and unauthorized directives', () => {
  const fixture = createFixture();
  const resumeDirective = planSkywayOwnerResync({
    authenticatedOwnerId: 'owner-a',
    claim: fixture.claim,
    authorityCheckpoint: fixture.authority,
    admissionAckWatermark: fixture.watermark,
  });
  assert.equal(resumeDirective.action, 'resume');
  assert.throws(
    () => project(fixture, { directive: resumeDirective }),
    /requires a full-resync directive/,
  );
  assert.throws(
    () => project(fixture, { authenticatedOwnerId: 'owner-b' }),
    /owner is not authorized/,
  );

  const tampered = {
    ...fixture.directive,
    tick: fixture.directive.tick + 1,
  };
  assert.throws(
    () => validateSkywayOwnerResyncDirective(tampered),
    /directive hash/,
  );
  const stale = {
    ...fixture.directive,
    authorityCheckpointHash: hashSkywaySnapshot('stale'),
  };
  stale.directiveHash = hashSkywaySnapshot(
    payloadWithout(stale, 'directiveHash'),
  );
  assert.throws(
    () => project(fixture, { directive: stale }),
    /directive is stale/,
  );
});

test('owner projection allowlists public Round fields even when authority state gains private internals', () => {
  const fixture = rebindAlteredAuthority(
    createFixture(),
    (roundSnapshot) => {
      roundSnapshot.course.futurePrivateState = 'course-secret';
      roundSnapshot.participants[0].simulation.futurePrivateState =
        'simulation-secret';
      roundSnapshot.participants[0].race.futurePrivateState = 'race-secret';
    },
  );
  const snapshot = project(fixture);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('course-secret'), false);
  assert.equal(serialized.includes('simulation-secret'), false);
  assert.equal(serialized.includes('race-secret'), false);
  assert.equal(serialized.includes('futurePrivateState'), false);
});

test('owner projection rejects public Round state beyond its explicit byte budget', () => {
  const fixture = rebindAlteredAuthority(
    createFixture(),
    (roundSnapshot) => {
      roundSnapshot.course.platforms[0].id =
        `oversized-${'x'.repeat(SKYWAY_OWNER_RESYNC_PUBLIC_ROUND_MAX_BYTES)}`;
    },
  );
  assert.throws(
    () => project(fixture),
    /public Round resync state exceeds its bound/,
  );
});

test('owner projection does not activate production imports or protocol formats', () => {
  const fixture = createFixture();
  assert.equal(fixture.directive.action, 'full-resync');
  assert.equal(fixture.directive.requiresAuthoritySnapshot, true);
  const snapshot = project(fixture);
  assert.equal(snapshot.kind, 'skyway-owner-full-resync-snapshot');
  assert.deepEqual(encodeServerRoomFrame({
    v: 1,
    type: 'resync-snapshot',
    snapshot,
  }), {
    ok: false,
    code: 'unknown-type',
  });
});
