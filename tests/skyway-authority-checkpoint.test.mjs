import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceSkywayAdmissionAckWatermark,
  assertSkywayAdmissionAckRestore,
  createSkywayAdmissionAckWatermark,
  SKYWAY_ADMISSION_ACK_WATERMARK_VERSION,
} from '../src/core/skyway-admission-ack-finality.js';
import {
  createSkywayAuthorityCheckpoint,
  restoreSkywayAuthorityCheckpoint,
  SKYWAY_AUTHORITY_CHECKPOINT_VERSION,
} from '../src/core/skyway-authority-checkpoint.js';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
} from '../src/core/skyway-command-journal.js';
import {
  appendSkywayReplayEventFrame,
  commitSkywayReplayEvents,
  createSkywayReplayEventLedger,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import {
  admitSkywayParticipantInput,
  advanceSkywayInputAdmissionHead,
  commitSkywayInputAdmissionBatch,
  createSkywayInputAdmissionBatch,
  createSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  createSkywayRoundCheckpointBundle,
  SKYWAY_ROUND_CHECKPOINT_VERSION,
} from '../src/core/skyway-round-checkpoint.js';
import {
  resetSkywayAuthoritativeLifecycle,
} from '../src/core/skyway-authoritative-lifecycle.js';
import {
  createSkywayRoundFinalityToken,
} from '../src/core/skyway-round-finality.js';
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

const SESSION = 'device-session:authority-checkpoint';
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

function createStack({ commandCapacity = 4 } = {}) {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    inputCapacityTicks: commandCapacity,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({
    capacityTicks: commandCapacity + 1,
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
      participantIds: ['player', 'bot'],
      capacityTicks: commandCapacity,
      roundEpoch: 1,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds: ['player', 'bot'],
      capacityTicks: commandCapacity,
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

function advanceOne(stack) {
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
    { roundEpoch: 1 },
  );
  return frame;
}

function advanceThrough(stack, tick) {
  while (stack.round.tick < tick) advanceOne(stack);
}

function createAdmission({
  currentTick = 3,
  pastTickHorizon = 4,
  futureTickHorizon = 2,
  ownership = [
    { participantId: 'player', ownerId: 'owner-a' },
    { participantId: 'bot', ownerId: 'owner-b' },
  ],
} = {}) {
  return createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    participantIds: ['player', 'bot'],
    ownership,
    currentTick,
    pastTickHorizon,
    futureTickHorizon,
  });
}

function command(participantId, tick, clientSequence = 0) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId: participantId === 'player' ? 'owner-a' : 'owner-b',
    participantId,
    clientSequence,
    tick,
    input: FORWARD,
  };
}

function seedAdmission(admissionWindow) {
  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      command('player', 2),
    ).accepted,
    true,
  );
  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      command('bot', 3),
    ).accepted,
    true,
  );
  const first = createSkywayInputAdmissionBatch(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    limit: 1,
  });
  commitSkywayInputAdmissionBatch(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    batch: first,
  });
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

function authorityState(stack, admissionWindow) {
  return {
    round: snapshotSkywayRound(stack.round),
    snapshotHistory: structuredClone(stack.snapshotHistory),
    commandJournal: structuredClone(stack.commandJournal),
    replayEventLedger: structuredClone(stack.replayEventLedger),
    admissionWindow: snapshotSkywayInputAdmissionWindow(admissionWindow),
  };
}

function checkpointPayload(checkpoint) {
  const { authorityCheckpointHash: ignored, ...payload } = checkpoint;
  return payload;
}

function rosterPayload(checkpoint) {
  return {
    participantIds: checkpoint.participantIds,
    ownership: checkpoint.components.admissionSnapshot.ownership,
  };
}

function rehashAuthorityCheckpoint(checkpoint) {
  checkpoint.roundCheckpointHash =
    checkpoint.components.roundCheckpointBundle.bundleHash;
  checkpoint.admissionSnapshotHash =
    hashSkywaySnapshot(checkpoint.components.admissionSnapshot);
  checkpoint.rosterHash = hashSkywaySnapshot(rosterPayload(checkpoint));
  checkpoint.authorityCheckpointHash =
    hashSkywaySnapshot(checkpointPayload(checkpoint));
}

function restoreAuthority(
  stack,
  admissionWindow,
  checkpoint,
  expectedHash,
  options = {},
) {
  return restoreSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    checkpoint,
    expectedTargetAuthorityHash: expectedHash,
    admissionWindow,
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
    ...options,
  });
}

test('Skyway Authority Checkpoint binds unchanged Round and Admission formats deterministically', () => {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const directRound = createSkywayRoundCheckpointBundle({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  const directAdmission =
    snapshotSkywayInputAdmissionWindow(admissionWindow);

  const first = authorityCheckpoint(stack, admissionWindow);
  const second = authorityCheckpoint(stack, admissionWindow);
  const wire = JSON.parse(JSON.stringify(first));

  assert.deepEqual(first, second);
  assert.equal(first.version, SKYWAY_AUTHORITY_CHECKPOINT_VERSION);
  assert.equal(first.kind, 'skyway-authority-checkpoint');
  assert.equal(first.tick, 3);
  assert.deepEqual(first.participantIds, ['player', 'bot']);
  assert.deepEqual(first.components.roundCheckpointBundle, directRound);
  assert.deepEqual(first.components.admissionSnapshot, directAdmission);
  assert.equal(
    first.components.roundCheckpointBundle.version,
    SKYWAY_ROUND_CHECKPOINT_VERSION,
  );
  assert.equal(
    first.roundCheckpointHash,
    first.components.roundCheckpointBundle.bundleHash,
  );
  assert.equal(
    first.admissionSnapshotHash,
    hashSkywaySnapshot(first.components.admissionSnapshot),
  );
  assert.equal(first.rosterHash, hashSkywaySnapshot(rosterPayload(first)));
  assert.equal(
    first.authorityCheckpointHash,
    hashSkywaySnapshot(checkpointPayload(first)),
  );
  assert.deepEqual(wire, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.components.roundCheckpointBundle), true);
  assert.equal(Object.isFrozen(first.components.admissionSnapshot), true);
});

test('Skyway Authority Checkpoint restores both halves atomically with replay and identity parity', () => {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const savedState = authorityState(stack, admissionWindow);
  const saved = authorityCheckpoint(stack, admissionWindow);
  const identities = {
    round: stack.round,
    course: stack.round.course,
    timeline: stack.round.inputTimeline,
    participant: stack.round.participants[0],
    simulation: stack.round.participants[0].simulation,
    history: stack.snapshotHistory,
    journal: stack.commandJournal,
    ledger: stack.replayEventLedger,
    admission: admissionWindow,
  };

  const originalNext = advanceOne(stack);
  advanceSkywayInputAdmissionHead(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 4,
  });
  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      command('player', 4, 1),
    ).accepted,
    true,
  );
  const target = authorityCheckpoint(stack, admissionWindow);
  const result = restoreAuthority(
    stack,
    admissionWindow,
    JSON.parse(JSON.stringify(saved)),
    target.authorityCheckpointHash,
  );

  assert.equal(result.kind, 'skyway-authority-checkpoint-restore');
  assert.equal(result.previousTick, 4);
  assert.equal(result.tick, 3);
  assert.equal(
    result.previousAuthorityCheckpointHash,
    target.authorityCheckpointHash,
  );
  assert.equal(result.authorityCheckpointHash, saved.authorityCheckpointHash);
  assert.equal(
    result.previousAdmissionRevision,
    target.components.admissionSnapshot.revision,
  );
  assert.equal(
    result.admissionRevision,
    saved.components.admissionSnapshot.revision,
  );
  assert.deepEqual(authorityState(stack, admissionWindow), savedState);
  assert.equal(stack.round, identities.round);
  assert.equal(stack.round.course, identities.course);
  assert.equal(stack.round.inputTimeline, identities.timeline);
  assert.equal(stack.round.participants[0], identities.participant);
  assert.equal(stack.round.participants[0].simulation, identities.simulation);
  assert.equal(stack.snapshotHistory, identities.history);
  assert.equal(stack.commandJournal, identities.journal);
  assert.equal(stack.replayEventLedger, identities.ledger);
  assert.equal(admissionWindow, identities.admission);
  assert.deepEqual(advanceOne(stack), originalNext);
});

test('Skyway Authority Checkpoint requires an exact live target CAS and restores idempotently', () => {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  const saved = authorityCheckpoint(stack, admissionWindow);
  const before = authorityState(stack, admissionWindow);

  assert.throws(() => restoreAuthority(
    stack,
    admissionWindow,
    saved,
    'fnv1a64:0000000000000000',
  ), /target revision is stale/);
  assert.deepEqual(authorityState(stack, admissionWindow), before);

  const first = restoreAuthority(
    stack,
    admissionWindow,
    saved,
    saved.authorityCheckpointHash,
  );
  const second = restoreAuthority(
    stack,
    admissionWindow,
    saved,
    saved.authorityCheckpointHash,
  );
  assert.deepEqual(first, second);
  assert.deepEqual(authorityState(stack, admissionWindow), before);

  advanceOne(stack);
  advanceSkywayInputAdmissionHead(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 4,
  });
  const newer = authorityState(stack, admissionWindow);
  assert.throws(() => restoreAuthority(
    stack,
    admissionWindow,
    saved,
    saved.authorityCheckpointHash,
  ), /target revision is stale/);
  assert.deepEqual(authorityState(stack, admissionWindow), newer);
});

test('Skyway Authority Checkpoint rejects tampered bindings and embedded state without partial work', () => {
  const source = createStack();
  advanceThrough(source, 3);
  const sourceAdmission = createAdmission();
  seedAdmission(sourceAdmission);
  const checkpoint = authorityCheckpoint(source, sourceAdmission);

  const scenarios = [
    {
      name: 'outer hash',
      mutate(copy) {
        copy.authorityCheckpointHash = 'fnv1a64:0000000000000000';
      },
      pattern: /checkpoint hash is invalid/,
    },
    {
      name: 'Round component',
      mutate(copy) {
        copy.components.roundCheckpointBundle.components
          .roundSnapshot.course.time += 0.001;
        rehashAuthorityCheckpoint(copy);
      },
      pattern: /bundle hash is invalid/,
    },
    {
      name: 'Admission component',
      mutate(copy) {
        copy.components.admissionSnapshot.owners[0].ackSequence = 99;
        rehashAuthorityCheckpoint(copy);
      },
      pattern: /Invalid Skyway input-admission acknowledgement/,
    },
    {
      name: 'head',
      mutate(copy) {
        copy.components.admissionSnapshot.currentTick = 2;
        rehashAuthorityCheckpoint(copy);
      },
      pattern: /heads are not aligned/,
    },
    {
      name: 'roster',
      mutate(copy) {
        copy.participantIds.reverse();
        rehashAuthorityCheckpoint(copy);
      },
      pattern: /Invalid Skyway Authority checkpoint binding/,
    },
  ];

  for (const scenario of scenarios) {
    const target = createStack();
    advanceThrough(target, 3);
    const targetAdmission = createAdmission();
    const targetCheckpoint = authorityCheckpoint(target, targetAdmission);
    const before = authorityState(target, targetAdmission);
    const copy = structuredClone(checkpoint);
    scenario.mutate(copy);
    assert.throws(() => restoreAuthority(
      target,
      targetAdmission,
      copy,
      targetCheckpoint.authorityCheckpointHash,
    ), scenario.pattern, scenario.name);
    assert.deepEqual(
      authorityState(target, targetAdmission),
      before,
      scenario.name,
    );
  }
});

test('Skyway Authority Checkpoint rejects incompatible target configuration before either live half changes', () => {
  const source = createStack();
  advanceThrough(source, 3);
  const sourceAdmission = createAdmission();
  const checkpoint = authorityCheckpoint(source, sourceAdmission);

  const admissionTarget = createStack();
  advanceThrough(admissionTarget, 3);
  const incompatibleAdmission = createAdmission({ pastTickHorizon: 3 });
  const admissionTargetCheckpoint =
    authorityCheckpoint(admissionTarget, incompatibleAdmission);
  const admissionBefore =
    authorityState(admissionTarget, incompatibleAdmission);
  assert.throws(() => restoreAuthority(
    admissionTarget,
    incompatibleAdmission,
    checkpoint,
    admissionTargetCheckpoint.authorityCheckpointHash,
  ), /snapshot configuration is incompatible/);
  assert.deepEqual(
    authorityState(admissionTarget, incompatibleAdmission),
    admissionBefore,
  );

  const capacityTarget = createStack({ commandCapacity: 3 });
  advanceThrough(capacityTarget, 3);
  const capacityAdmission = createAdmission();
  const capacityTargetCheckpoint =
    authorityCheckpoint(capacityTarget, capacityAdmission);
  const capacityBefore = authorityState(capacityTarget, capacityAdmission);
  assert.throws(() => restoreAuthority(
    capacityTarget,
    capacityAdmission,
    checkpoint,
    capacityTargetCheckpoint.authorityCheckpointHash,
  ), /target capacities are not aligned/);
  assert.deepEqual(
    authorityState(capacityTarget, capacityAdmission),
    capacityBefore,
  );

  const finalityTarget = createStack();
  advanceThrough(finalityTarget, 2);
  const finalityAdmission = createAdmission({ currentTick: 2 });
  const rewindCheckpoint =
    authorityCheckpoint(finalityTarget, finalityAdmission);
  advanceOne(finalityTarget);
  advanceSkywayInputAdmissionHead(finalityAdmission, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 3,
  });
  const finalityToken = createSkywayRoundFinalityToken({
    ledger: finalityTarget.replayEventLedger,
    roundSnapshot: snapshotSkywayRound(finalityTarget.round),
  });
  commitSkywayReplayEvents(finalityTarget.replayEventLedger, {
    throughTick: 2,
    finalityToken,
    roundSnapshot: snapshotSkywayRound(finalityTarget.round),
  });
  const finalityTargetCheckpoint =
    authorityCheckpoint(finalityTarget, finalityAdmission);
  const finalityBefore =
    authorityState(finalityTarget, finalityAdmission);
  assert.throws(() => restoreAuthority(
    finalityTarget,
    finalityAdmission,
    rewindCheckpoint,
    finalityTargetCheckpoint.authorityCheckpointHash,
  ), /cannot restore behind committed presentation effects/);
  assert.deepEqual(
    authorityState(finalityTarget, finalityAdmission),
    finalityBefore,
  );

  const sessionTarget = createStack();
  advanceThrough(sessionTarget, 3);
  const sessionAdmission = createAdmission();
  const sessionBefore = authorityState(sessionTarget, sessionAdmission);
  assert.throws(() => restoreSkywayAuthorityCheckpoint({
    sessionIncarnation: 'device-session:other',
    roundEpoch: 1,
    checkpoint,
    expectedTargetAuthorityHash: checkpoint.authorityCheckpointHash,
    admissionWindow: sessionAdmission,
    round: sessionTarget.round,
    snapshotHistory: sessionTarget.snapshotHistory,
    commandJournal: sessionTarget.commandJournal,
    replayEventLedger: sessionTarget.replayEventLedger,
  }), /session incarnation is stale/);
  assert.deepEqual(
    authorityState(sessionTarget, sessionAdmission),
    sessionBefore,
  );
  assert.throws(() => restoreSkywayAuthorityCheckpoint({
    sessionIncarnation: SESSION,
    roundEpoch: 2,
    checkpoint,
    expectedTargetAuthorityHash: checkpoint.authorityCheckpointHash,
    admissionWindow: sessionAdmission,
    round: sessionTarget.round,
    snapshotHistory: sessionTarget.snapshotHistory,
    commandJournal: sessionTarget.commandJournal,
    replayEventLedger: sessionTarget.replayEventLedger,
  }), /round epoch is stale/);
  assert.deepEqual(
    authorityState(sessionTarget, sessionAdmission),
    sessionBefore,
  );
});

test('Skyway Admission ACK watermark is deterministic, frozen, and advances only one monotonic owner frontier', () => {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const firstCheckpoint = authorityCheckpoint(stack, admissionWindow);
  const first = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: firstCheckpoint,
  });

  assert.equal(first.version, SKYWAY_ADMISSION_ACK_WATERMARK_VERSION);
  assert.equal(first.kind, 'skyway-admission-ack-watermark');
  assert.equal(first.sessionIncarnation, SESSION);
  assert.equal(first.roundEpoch, 1);
  assert.equal(first.rosterHash, firstCheckpoint.rosterHash);
  assert.equal(
    first.authorityCheckpointHash,
    firstCheckpoint.authorityCheckpointHash,
  );
  assert.equal(
    first.admissionSnapshotHash,
    firstCheckpoint.admissionSnapshotHash,
  );
  assert.deepEqual(
    first.acknowledgements.map(({ ownerId, ackSequence }) => ({
      ownerId,
      ackSequence,
    })),
    [
      { ownerId: 'owner-a', ackSequence: 0 },
      { ownerId: 'owner-b', ackSequence: 0 },
    ],
  );
  assert.equal(
    first.acknowledgements[0].lastAcceptedCommandHash,
    hashSkywaySnapshot(
      firstCheckpoint.components.admissionSnapshot
        .owners[0].lastAcceptedCommand,
    ),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(first)),
    first,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.acknowledgements), true);
  assert.equal(
    advanceSkywayAdmissionAckWatermark({
      watermark: first,
      authorityCheckpoint: firstCheckpoint,
    }),
    first,
  );

  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      command('player', 3, 1),
    ).accepted,
    true,
  );
  const secondCheckpoint = authorityCheckpoint(stack, admissionWindow);
  const second = advanceSkywayAdmissionAckWatermark({
    watermark: first,
    authorityCheckpoint: secondCheckpoint,
  });
  assert.equal(second.acknowledgements[0].ackSequence, 1);
  assert.equal(second.acknowledgements[1].ackSequence, 0);
  assert.notEqual(second.watermarkHash, first.watermarkHash);
  assert.throws(() => advanceSkywayAdmissionAckWatermark({
    watermark: second,
    authorityCheckpoint: firstCheckpoint,
  }), /cannot move backwards/);

  const forkedAdmission = structuredClone(admissionWindow);
  forkedAdmission.owners[0].lastAcceptedCommand.input.jumpHeld = true;
  const forkedCheckpoint =
    authorityCheckpoint(stack, forkedAdmission);
  assert.throws(() => advanceSkywayAdmissionAckWatermark({
    watermark: second,
    authorityCheckpoint: forkedCheckpoint,
  }), /cannot fork an acknowledged command/);
});

test('Skyway Authority Checkpoint optionally rejects an externally committed ACK rewind atomically', () => {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  const rewindCheckpoint = authorityCheckpoint(stack, admissionWindow);
  seedAdmission(admissionWindow);
  const committedCheckpoint =
    authorityCheckpoint(stack, admissionWindow);
  const watermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: committedCheckpoint,
  });
  const before = authorityState(stack, admissionWindow);

  assert.throws(() => restoreAuthority(
    stack,
    admissionWindow,
    rewindCheckpoint,
    committedCheckpoint.authorityCheckpointHash,
    { admissionAckWatermark: watermark },
  ), /restore would rewind owner/);
  assert.deepEqual(authorityState(stack, admissionWindow), before);

  const restored = restoreAuthority(
    stack,
    admissionWindow,
    rewindCheckpoint,
    committedCheckpoint.authorityCheckpointHash,
  );
  assert.equal(
    restored.authorityCheckpointHash,
    rewindCheckpoint.authorityCheckpointHash,
  );
  assert.deepEqual(
    snapshotSkywayInputAdmissionWindow(admissionWindow),
    rewindCheckpoint.components.admissionSnapshot,
  );
});

test('Skyway Admission ACK finality permits equal floors and newer ACKs but rejects an already-corrupt target', () => {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const floorCheckpoint = authorityCheckpoint(stack, admissionWindow);
  const watermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: floorCheckpoint,
  });
  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      command('player', 3, 1),
    ).accepted,
    true,
  );
  const newerCheckpoint = authorityCheckpoint(stack, admissionWindow);

  restoreAuthority(
    stack,
    admissionWindow,
    floorCheckpoint,
    newerCheckpoint.authorityCheckpointHash,
    { admissionAckWatermark: watermark },
  );
  assert.deepEqual(
    snapshotSkywayInputAdmissionWindow(admissionWindow),
    floorCheckpoint.components.admissionSnapshot,
  );

  const corruptTarget = createStack();
  advanceThrough(corruptTarget, 3);
  const corruptAdmission = createAdmission();
  const corruptCheckpoint =
    authorityCheckpoint(corruptTarget, corruptAdmission);
  const corruptBefore =
    authorityState(corruptTarget, corruptAdmission);
  assert.throws(() => restoreAuthority(
    corruptTarget,
    corruptAdmission,
    newerCheckpoint,
    corruptCheckpoint.authorityCheckpointHash,
    { admissionAckWatermark: watermark },
  ), /restore would rewind owner/);
  assert.deepEqual(
    authorityState(corruptTarget, corruptAdmission),
    corruptBefore,
  );
});

test('Skyway Admission ACK watermark rejects tamper, ownership changes, and prior-epoch reuse', () => {
  const stack = createStack();
  advanceThrough(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const checkpoint = authorityCheckpoint(stack, admissionWindow);
  const watermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: checkpoint,
  });

  const unexpected = {
    ...structuredClone(watermark),
    unexpected: true,
  };
  assert.throws(
    () => assertSkywayAdmissionAckRestore(unexpected, {
      authorityCheckpoint: checkpoint,
    }),
    /Invalid Skyway Admission ACK watermark/,
  );
  const tampered = structuredClone(watermark);
  tampered.acknowledgements[0].ackSequence = -1;
  tampered.acknowledgements[0].lastAcceptedCommandHash = null;
  assert.throws(
    () => assertSkywayAdmissionAckRestore(tampered, {
      authorityCheckpoint: checkpoint,
    }),
    /watermark hash/,
  );

  const ownershipAdmission = createAdmission({
    ownership: [
      { participantId: 'player', ownerId: 'owner-b' },
      { participantId: 'bot', ownerId: 'owner-a' },
    ],
  });
  const ownershipCheckpoint =
    authorityCheckpoint(stack, ownershipAdmission);
  const ownershipWatermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: ownershipCheckpoint,
  });
  assert.throws(
    () => assertSkywayAdmissionAckRestore(ownershipWatermark, {
      authorityCheckpoint: checkpoint,
    }),
    /ownership is incompatible/,
  );

  resetSkywayAuthoritativeLifecycle({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle:
      checkpoint.components.roundCheckpointBundle,
    baseAdmissionSnapshot:
      checkpoint.components.admissionSnapshot,
    admissionWindow,
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
  });
  const nextCheckpoint = authorityCheckpoint(stack, admissionWindow, 2);
  assert.throws(
    () => assertSkywayAdmissionAckRestore(watermark, {
      authorityCheckpoint: nextCheckpoint,
    }),
    /lifecycle binding is stale/,
  );
  const nextWatermark = createSkywayAdmissionAckWatermark({
    authorityCheckpoint: nextCheckpoint,
  });
  assert.equal(nextWatermark.roundEpoch, 2);
  assert.deepEqual(
    nextWatermark.acknowledgements.map(({ ackSequence }) => ackSequence),
    [-1, -1],
  );
});
