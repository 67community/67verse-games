import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySkywayAuthoritativeIntake,
  SKYWAY_AUTHORITATIVE_INTAKE_VERSION,
} from '../src/core/skyway-authoritative-intake.js';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
} from '../src/core/skyway-command-journal.js';
import {
  appendSkywayReplayEventFrame,
  createSkywayReplayEventLedger,
  lookupSkywayReplayEventFrame,
} from '../src/core/skyway-replay-event-ledger.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import {
  admitSkywayParticipantInput,
  advanceSkywayInputAdmissionHead,
  createSkywayInputAdmissionBatch,
  createSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  createSkywayRoundCheckpointBundle,
} from '../src/core/skyway-round-checkpoint.js';
import {
  createSkywayRound,
  snapshotSkywayRound,
  stepSkywayRound,
} from '../src/core/skyway-round.js';
import {
  createSkywaySnapshotHistory,
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
} from '../src/core/skyway-snapshot-history.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const SESSION = 'device-session:authoritative-intake';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});

function authoritativeInput(participantId, tick) {
  return {
    ...IDLE,
    dirX: participantId === 'player' ? 0.16 : -0.14,
    dirZ: -0.84,
    moving: true,
    jumpHeld: tick === 3,
  };
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
  const participantIds = ['player', 'bot'];
  const round = createSkywayRound({
    course: createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION),
    countdownTicks: 1,
    inputCapacityTicks: 6,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({ capacityTicks: 7 });
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
      capacityTicks: 6,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds,
      capacityTicks: 6,
    }),
  };
}

function advanceThrough(
  stack,
  throughTick,
  {
    wrongKeys = new Set(),
    authoritativeKeys = new Set(),
  } = {},
) {
  while (stack.round.tick < throughTick) {
    const tick = stack.round.tick + 1;
    const frame = stepSkywayRound(stack.round, {
      env: environmentForCourse(stack.round.course),
      inputFor(participant) {
        const canonical = authoritativeInput(participant.id, tick);
        return wrongKeys.has(`${tick}:${participant.id}`)
          ? { ...canonical, dirX: -canonical.dirX }
          : canonical;
      },
    });
    appendSkywayCommandTick(stack.commandJournal, {
      roundEpoch: 1,
      tick,
      commands: stack.round.participants.map((participant) => {
        const applied = frame.inputs.find(({ id }) => id === participant.id);
        return {
          participantId: participant.id,
          authority: applied
            ? (
                authoritativeKeys.has(`${tick}:${participant.id}`)
                  ? 'authoritative'
                  : 'predicted'
              )
            : 'neutral',
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
  }
}

function createAdmission({ participantIds = ['player', 'bot'] } = {}) {
  return createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    participantIds,
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick: 4,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
}

function admissionCommand(participantId, tick, overrides = {}) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId: participantId === 'player' ? 'owner-a' : 'owner-b',
    participantId,
    clientSequence: 0,
    tick,
    input: authoritativeInput(participantId, tick),
    ...overrides,
  };
}

function reserveCorrections(admissionWindow) {
  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      admissionCommand('player', 2),
    ).accepted,
    true,
  );
  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      admissionCommand('bot', 3),
    ).accepted,
    true,
  );
  return createSkywayInputAdmissionBatch(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
}

function checkpoint(stack) {
  return createSkywayRoundCheckpointBundle({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
}

function stackState(stack) {
  return {
    round: snapshotSkywayRound(stack.round),
    snapshotHistory: structuredClone(stack.snapshotHistory),
    commandJournal: structuredClone(stack.commandJournal),
    replayEventLedger: structuredClone(stack.replayEventLedger),
  };
}

function eventFrames(ledger) {
  const frames = [];
  if (ledger.oldestTick === null) return frames;
  for (let tick = ledger.oldestTick; tick <= ledger.latestTick; tick++) {
    frames.push(lookupSkywayReplayEventFrame(ledger, tick));
  }
  return frames;
}

function applyIntake(stack, admissionWindow, admissionBatch, overrides = {}) {
  return applySkywayAuthoritativeIntake({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(stack),
    admissionWindow,
    admissionBatch,
    environmentForRound: ({ course }) => environmentForCourse(course),
    ...overrides,
  });
}

test('Skyway Authoritative Intake atomically corrects one reservation and commits its acknowledgements', () => {
  const authoritative = createStack();
  const predicted = createStack();
  advanceThrough(authoritative, 4);
  advanceThrough(predicted, 4, {
    wrongKeys: new Set(['2:player', '3:bot']),
  });
  const admissionWindow = createAdmission();
  const admissionBatch = reserveCorrections(admissionWindow);
  const identities = {
    round: predicted.round,
    timeline: predicted.round.inputTimeline,
    history: predicted.snapshotHistory,
    journal: predicted.commandJournal,
    ledger: predicted.replayEventLedger,
    admission: admissionWindow,
  };

  const result = applyIntake(
    predicted,
    admissionWindow,
    admissionBatch,
  );

  assert.equal(result.version, SKYWAY_AUTHORITATIVE_INTAKE_VERSION);
  assert.equal(result.kind, 'skyway-authoritative-intake');
  assert.equal(result.status, 'resimulated');
  assert.equal(result.suppressPresentation, true);
  assert.equal(result.admissionBatchHash, admissionBatch.batchHash);
  assert.equal(result.checkpointHash, result.checkpointBundle.bundleHash);
  assert.equal(result.admissionRevision, admissionBatch.admissionRevision + 1);
  assert.deepEqual(result.acks, [
    { ownerId: 'owner-a', ackSequence: 0 },
    { ownerId: 'owner-b', ackSequence: 0 },
  ]);
  assert.deepEqual(
    result.admissionSnapshot,
    snapshotSkywayInputAdmissionWindow(admissionWindow),
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.admissionSnapshot), true);

  assert.deepEqual(
    snapshotSkywayRound(predicted.round),
    snapshotSkywayRound(authoritative.round),
  );
  assert.equal(
    lookupSkywaySnapshot(predicted.snapshotHistory, 4, { roundEpoch: 1 }).hash,
    lookupSkywaySnapshot(authoritative.snapshotHistory, 4, { roundEpoch: 1 }).hash,
  );
  assert.deepEqual(
    eventFrames(predicted.replayEventLedger),
    eventFrames(authoritative.replayEventLedger),
  );
  assert.equal(
    createSkywayInputAdmissionBatch(admissionWindow, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }).correctionCount,
    0,
  );
  assert.equal(predicted.round, identities.round);
  assert.equal(predicted.round.inputTimeline, identities.timeline);
  assert.equal(predicted.snapshotHistory, identities.history);
  assert.equal(predicted.commandJournal, identities.journal);
  assert.equal(predicted.replayEventLedger, identities.ledger);
  assert.equal(admissionWindow, identities.admission);
});

test('Skyway Authoritative Intake leaves both live states unchanged when correction preparation fails', () => {
  const stack = createStack();
  advanceThrough(stack, 4, {
    wrongKeys: new Set(['2:player', '3:bot']),
  });
  const admissionWindow = createAdmission();
  const admissionBatch = reserveCorrections(admissionWindow);
  const baseCheckpointBundle = checkpoint(stack);
  const beforeStack = stackState(stack);
  const beforeAdmission = snapshotSkywayInputAdmissionWindow(admissionWindow);

  assert.throws(() => applySkywayAuthoritativeIntake({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle,
    admissionWindow,
    admissionBatch,
    environmentForRound() {
      throw new Error('intake environment failed');
    },
  }), /intake environment failed/);
  assert.deepEqual(stackState(stack), beforeStack);
  assert.deepEqual(admissionWindow, beforeAdmission);
  assert.deepEqual(
    createSkywayInputAdmissionBatch(admissionWindow, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }),
    admissionBatch,
  );
});

test('Skyway Authoritative Intake rejects stale Admission and checkpoint revisions without partial work', () => {
  const staleAdmissionStack = createStack();
  advanceThrough(staleAdmissionStack, 4, {
    wrongKeys: new Set(['2:player', '3:bot']),
  });
  const staleAdmission = createAdmission();
  const oldAdmissionBatch = reserveCorrections(staleAdmission);
  admitSkywayParticipantInput(staleAdmission, admissionCommand('player', 4, {
    clientSequence: 1,
  }));
  const admissionBefore = snapshotSkywayInputAdmissionWindow(staleAdmission);
  const stackBefore = stackState(staleAdmissionStack);
  assert.throws(() => applySkywayAuthoritativeIntake({
    ...staleAdmissionStack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(staleAdmissionStack),
    admissionWindow: staleAdmission,
    admissionBatch: oldAdmissionBatch,
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /batch is stale or invalid/);
  assert.deepEqual(stackState(staleAdmissionStack), stackBefore);
  assert.deepEqual(staleAdmission, admissionBefore);

  const staleCheckpointStack = createStack();
  advanceThrough(staleCheckpointStack, 4, {
    wrongKeys: new Set(['2:player', '3:bot']),
  });
  const staleCheckpointAdmission = createAdmission();
  const checkpointAdmissionBatch =
    reserveCorrections(staleCheckpointAdmission);
  const oldCheckpoint = checkpoint(staleCheckpointStack);
  advanceThrough(staleCheckpointStack, 5);
  const staleCheckpointBefore = stackState(staleCheckpointStack);
  const checkpointAdmissionBefore =
    snapshotSkywayInputAdmissionWindow(staleCheckpointAdmission);
  assert.throws(() => applySkywayAuthoritativeIntake({
    ...staleCheckpointStack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: oldCheckpoint,
    admissionWindow: staleCheckpointAdmission,
    admissionBatch: checkpointAdmissionBatch,
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /checkpoint revision is stale/);
  assert.deepEqual(stackState(staleCheckpointStack), staleCheckpointBefore);
  assert.deepEqual(staleCheckpointAdmission, checkpointAdmissionBefore);
});

test('Skyway Authoritative Intake commits no-op corrections and handles an exact empty reservation', () => {
  const authoritativeStack = createStack();
  advanceThrough(authoritativeStack, 4, {
    authoritativeKeys: new Set(['2:player', '3:bot']),
  });
  const admissionWindow = createAdmission();
  const admissionBatch = reserveCorrections(admissionWindow);
  const committed = applySkywayAuthoritativeIntake({
    ...authoritativeStack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(authoritativeStack),
    admissionWindow,
    admissionBatch,
  });
  assert.equal(committed.status, 'no-op');
  assert.equal(committed.correctionBatch.status, 'no-op');
  assert.notEqual(committed.admissionCommit, null);
  assert.equal(
    createSkywayInputAdmissionBatch(admissionWindow, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }).correctionCount,
    0,
  );

  const emptyStack = createStack();
  advanceThrough(emptyStack, 4);
  const emptyAdmission = createAdmission();
  const emptyBatch = createSkywayInputAdmissionBatch(emptyAdmission, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  const emptyStackBefore = stackState(emptyStack);
  const emptyAdmissionBefore =
    snapshotSkywayInputAdmissionWindow(emptyAdmission);
  const empty = applySkywayAuthoritativeIntake({
    ...emptyStack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(emptyStack),
    admissionWindow: emptyAdmission,
    admissionBatch: emptyBatch,
  });
  assert.equal(empty.status, 'no-op');
  assert.equal(empty.correctionBatch, null);
  assert.equal(empty.admissionCommit, null);
  assert.equal(empty.checkpointHash, empty.abortCheckpointHash);
  assert.equal(empty.admissionSnapshotHash, empty.abortAdmissionHash);
  assert.deepEqual(stackState(emptyStack), emptyStackBefore);
  assert.deepEqual(emptyAdmission, emptyAdmissionBefore);
});

test('Skyway Authoritative Intake dual CAS preserves an independently changed Admission target', () => {
  const stack = createStack();
  advanceThrough(stack, 4, {
    wrongKeys: new Set(['2:player', '3:bot']),
  });
  const admissionWindow = createAdmission();
  const admissionBatch = reserveCorrections(admissionWindow);
  const baseCheckpointBundle = checkpoint(stack);
  const stackBefore = stackState(stack);
  let externalAdmission = null;

  assert.throws(() => applySkywayAuthoritativeIntake({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle,
    admissionWindow,
    admissionBatch,
    environmentForRound({ course }) {
      externalAdmission = admitSkywayParticipantInput(
        admissionWindow,
        admissionCommand('player', 4, { clientSequence: 1 }),
      );
      return environmentForCourse(course);
    },
  }), /admission target changed during preparation/);
  assert.equal(externalAdmission.accepted, true);
  assert.deepEqual(stackState(stack), stackBefore);
  assert.equal(admissionWindow.owners[0].ackSequence, 1);
  assert.equal(
    createSkywayInputAdmissionBatch(admissionWindow, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }).correctionCount,
    3,
  );
});

test('Skyway Authoritative Intake rejects head and roster misalignment before mutation', () => {
  const stack = createStack();
  advanceThrough(stack, 4, {
    wrongKeys: new Set(['2:player', '3:bot']),
  });
  const admissionWindow = createAdmission();
  const admissionBatch = reserveCorrections(admissionWindow);
  advanceSkywayInputAdmissionHead(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 5,
  });
  const before = stackState(stack);
  const admissionBefore = snapshotSkywayInputAdmissionWindow(admissionWindow);
  assert.throws(() => applySkywayAuthoritativeIntake({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(stack),
    admissionWindow,
    admissionBatch,
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /admission head is stale or misaligned/);
  assert.deepEqual(stackState(stack), before);
  assert.deepEqual(admissionWindow, admissionBefore);

  const reversedAdmission = createAdmission({
    participantIds: ['bot', 'player'],
  });
  const reversedBatch = reserveCorrections(reversedAdmission);
  const reversedBefore = snapshotSkywayInputAdmissionWindow(reversedAdmission);
  assert.throws(() => applySkywayAuthoritativeIntake({
    ...stack,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(stack),
    admissionWindow: reversedAdmission,
    admissionBatch: reversedBatch,
    environmentForRound: ({ course }) => environmentForCourse(course),
  }), /participants are not aligned/);
  assert.deepEqual(stackState(stack), before);
  assert.deepEqual(reversedAdmission, reversedBefore);
});
