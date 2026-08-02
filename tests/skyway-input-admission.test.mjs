import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySkywayAuthoritativeCorrectionBatch,
} from '../src/core/skyway-authoritative-correction.js';
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
  admitSkywayParticipantInput,
  commitSkywayInputAdmissionBatch,
  createSkywayInputAdmissionBatch,
  createSkywayInputAdmissionWindow,
  resetSkywayInputAdmissionWindow,
  restoreSkywayInputAdmissionWindow,
  SKYWAY_INPUT_ADMISSION_MAX_FUTURE_TICKS,
  SKYWAY_INPUT_ADMISSION_MAX_PARTICIPANTS,
  SKYWAY_INPUT_ADMISSION_VERSION,
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

const SESSION = 'device-session:input-admission';
const IDLE = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});

function input(seed = 0) {
  return {
    ...IDLE,
    dirX: seed * 0.1,
    dirZ: -0.8,
    moving: true,
    jumpHeld: seed % 2 === 1,
  };
}

function createWindow(overrides = {}) {
  return createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    participantIds: ['player', 'bot', 'guest'],
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
      { participantId: 'guest', ownerId: 'owner-a' },
    ],
    currentTick: 5,
    pastTickHorizon: 4,
    futureTickHorizon: 3,
    ...overrides,
  });
}

function command(overrides = {}) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId: 'owner-a',
    participantId: 'player',
    clientSequence: 0,
    tick: 3,
    input: input(1),
    ...overrides,
  };
}

test('Skyway Input Admission binds ownership and advances only contiguous acknowledged sequences', () => {
  const window = createWindow();
  const first = admitSkywayParticipantInput(window, command());
  assert.equal(first.version, SKYWAY_INPUT_ADMISSION_VERSION);
  assert.equal(first.kind, 'skyway-input-admission');
  assert.equal(first.accepted, true);
  assert.equal(first.queued, true);
  assert.equal(first.ackSequence, 0);
  assert.equal(first.expectedSequence, 1);
  assert.equal(Object.isFrozen(first), true);
  const afterFirst = snapshotSkywayInputAdmissionWindow(window);

  const duplicate = admitSkywayParticipantInput(window, command());
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.reason, 'duplicate');
  assert.deepEqual(window, afterFirst);

  const sequenceConflict = admitSkywayParticipantInput(window, command({
    input: input(2),
  }));
  assert.equal(sequenceConflict.reason, 'sequence-conflict');
  assert.deepEqual(window, afterFirst);

  const gap = admitSkywayParticipantInput(window, command({
    clientSequence: 2,
    tick: 4,
  }));
  assert.equal(gap.reason, 'sequence-gap');
  assert.equal(gap.ackSequence, 0);
  assert.deepEqual(window, afterFirst);

  const spoof = admitSkywayParticipantInput(window, command({
    ownerId: 'owner-b',
    clientSequence: 1,
  }));
  assert.equal(spoof.reason, 'not-owner');
  assert.deepEqual(window, afterFirst);

  const equivalent = admitSkywayParticipantInput(window, command({
    clientSequence: 1,
  }));
  assert.equal(equivalent.accepted, true);
  assert.equal(equivalent.reason, 'equivalent');
  assert.equal(equivalent.queued, false);
  assert.equal(equivalent.ackSequence, 1);

  const beforeCommandConflict = snapshotSkywayInputAdmissionWindow(window);
  const commandConflict = admitSkywayParticipantInput(window, command({
    clientSequence: 2,
    input: input(2),
  }));
  assert.equal(commandConflict.reason, 'command-conflict');
  assert.equal(commandConflict.ackSequence, 1);
  assert.deepEqual(window, beforeCommandConflict);

  const second = admitSkywayParticipantInput(window, command({
    clientSequence: 2,
    tick: 4,
    input: input(2),
  }));
  assert.equal(second.accepted, true);
  assert.equal(second.ackSequence, 2);

  const beforeBindingRejects = snapshotSkywayInputAdmissionWindow(window);
  assert.equal(admitSkywayParticipantInput(window, command({
    sessionIncarnation: 'device-session:other',
    clientSequence: 3,
  })).reason, 'stale-session');
  assert.equal(admitSkywayParticipantInput(window, command({
    roundEpoch: 2,
    clientSequence: 3,
  })).reason, 'stale-epoch');
  assert.deepEqual(window, beforeBindingRejects);
});

test('Skyway Input Admission holds future input, protects pending expiry, and evicts only emitted history', () => {
  const window = createWindow({
    currentTick: 10,
    pastTickHorizon: 3,
    futureTickHorizon: 2,
  });
  const beforeRejects = snapshotSkywayInputAdmissionWindow(window);
  assert.equal(admitSkywayParticipantInput(window, command({
    tick: 6,
  })).reason, 'past-window');
  assert.equal(admitSkywayParticipantInput(window, command({
    tick: 13,
  })).reason, 'future-window');
  assert.deepEqual(window, beforeRejects);

  const future = admitSkywayParticipantInput(window, command({ tick: 12 }));
  assert.equal(future.accepted, true);
  assert.equal(
    createSkywayInputAdmissionBatch(window, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }).correctionCount,
    0,
  );

  advanceSkywayInputAdmissionHead(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 12,
  });
  const batch = createSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.equal(batch.correctionCount, 1);
  const beforeExpiry = snapshotSkywayInputAdmissionWindow(window);
  assert.throws(() => advanceSkywayInputAdmissionHead(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 16,
  }), /expire pending input/);
  assert.deepEqual(window, beforeExpiry);

  commitSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    batch,
  });
  advanceSkywayInputAdmissionHead(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 16,
  });
  assert.equal(window.slots.every((slot) => slot === null), true);
});

test('Skyway Input Admission emits one canonical batch across owner arrival permutations', () => {
  const first = createWindow({ currentTick: 4 });
  const second = createWindow({ currentTick: 4 });
  const commands = {
    guest: command({
      participantId: 'guest',
      clientSequence: 0,
      tick: 4,
      input: input(3),
    }),
    player: command({
      clientSequence: 1,
      tick: 2,
      input: input(1),
    }),
    bot: command({
      ownerId: 'owner-b',
      participantId: 'bot',
      clientSequence: 0,
      tick: 2,
      input: input(2),
    }),
  };
  for (const name of ['guest', 'bot', 'player']) {
    assert.equal(
      admitSkywayParticipantInput(first, commands[name]).accepted,
      true,
    );
  }
  for (const name of ['bot', 'guest', 'player']) {
    assert.equal(
      admitSkywayParticipantInput(second, commands[name]).accepted,
      true,
    );
  }

  const firstBatch = createSkywayInputAdmissionBatch(first, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  const secondBatch = createSkywayInputAdmissionBatch(second, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.deepEqual(firstBatch, secondBatch);
  assert.deepEqual(
    firstBatch.corrections.map(({ tick, participantId }) => ({
      tick,
      participantId,
    })),
    [
      { tick: 2, participantId: 'player' },
      { tick: 2, participantId: 'bot' },
      { tick: 4, participantId: 'guest' },
    ],
  );
  assert.equal(firstBatch.fromTick, 2);
  assert.equal(firstBatch.correctionCount, 3);
  assert.match(firstBatch.batchHash, /^fnv1a64:[0-9a-f]{16}$/);
  assert.equal(Object.isFrozen(firstBatch.corrections), true);
});

test('Skyway Input Admission reserves non-destructively and commits only the exact current batch', () => {
  const window = createWindow({ currentTick: 4 });
  admitSkywayParticipantInput(window, command({ tick: 2 }));
  const original = createSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.deepEqual(
    createSkywayInputAdmissionBatch(window, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }),
    original,
  );

  admitSkywayParticipantInput(window, command({
    participantId: 'guest',
    clientSequence: 1,
    tick: 6,
    input: input(2),
  }));
  assert.throws(() => commitSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    batch: original,
  }), /stale or invalid/);

  const current = createSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  const committed = commitSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    batch: current,
  });
  assert.equal(committed.correctionCount, 1);
  assert.equal(
    createSkywayInputAdmissionBatch(window, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }).correctionCount,
    0,
  );
  assert.throws(() => commitSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    batch: current,
  }), /stale or invalid/);
});

test('Skyway Input Admission snapshots, restores, and resets without cross-round ABA', () => {
  const window = createWindow();
  admitSkywayParticipantInput(window, command());
  const saved = snapshotSkywayInputAdmissionWindow(window);
  admitSkywayParticipantInput(window, command({
    clientSequence: 1,
    tick: 4,
    input: input(2),
  }));
  advanceSkywayInputAdmissionHead(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    currentTick: 6,
  });
  restoreSkywayInputAdmissionWindow(window, saved, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.deepEqual(window, saved);

  const tampered = structuredClone(saved);
  const retained = tampered.slots.find(Boolean);
  retained.decisions[0].input.dirX = Number.NaN;
  const beforeTamperedRestore = snapshotSkywayInputAdmissionWindow(window);
  assert.throws(() => restoreSkywayInputAdmissionWindow(window, tampered, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  }), /Invalid Skyway input-admission decision/);
  assert.deepEqual(window, beforeTamperedRestore);

  const priorBatch = createSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  const reset = resetSkywayInputAdmissionWindow(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  assert.equal(reset.roundEpoch, 2);
  assert.equal(window.currentTick, 0);
  assert.equal(window.revision, 0);
  assert.equal(window.owners.every(({ ackSequence }) => ackSequence === -1), true);
  assert.equal(admitSkywayParticipantInput(window, command()).reason, 'stale-epoch');
  assert.throws(() => commitSkywayInputAdmissionBatch(window, {
    sessionIncarnation: SESSION,
    roundEpoch: 2,
    batch: priorBatch,
  }), /stale or invalid/);
  const nextRound = admitSkywayParticipantInput(window, command({
    roundEpoch: 2,
    tick: 1,
  }));
  assert.equal(nextRound.accepted, true);
  assert.equal(nextRound.ackSequence, 0);
});

test('Skyway Input Admission rejects unbounded configuration', () => {
  assert.throws(() => createWindow({
    participantIds: Array.from(
      { length: SKYWAY_INPUT_ADMISSION_MAX_PARTICIPANTS + 1 },
      (_, index) => `participant-${index}`,
    ),
    ownership: [
      { participantId: 'participant-0', ownerId: 'owner-a' },
    ],
  }), /Invalid Skyway input-admission configuration/);
  assert.throws(() => createWindow({
    futureTickHorizon: SKYWAY_INPUT_ADMISSION_MAX_FUTURE_TICKS + 1,
  }), /Invalid Skyway input-admission configuration/);
  assert.throws(() => createSkywayInputAdmissionBatch(createWindow(), {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    limit: 33,
  }), /Invalid Skyway input-admission batch range/);
});

function authoritativeInput(participantId, tick) {
  return {
    ...IDLE,
    dirX: participantId === 'player' ? 0.18 : -0.16,
    dirZ: -0.82,
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

function createRoundStack() {
  const participantIds = ['player', 'bot'];
  const round = createSkywayRound({
    course: createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION),
    countdownTicks: 1,
    inputCapacityTicks: 5,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({ capacityTicks: 6 });
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
      capacityTicks: 5,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds,
      capacityTicks: 5,
    }),
  };
}

function advanceRound(stack, wrongKeys = new Set()) {
  while (stack.round.tick < 4) {
    const tick = stack.round.tick + 1;
    const frame = stepSkywayRound(stack.round, {
      env: environmentForCourse(stack.round.course),
      inputFor(participant) {
        const applied = authoritativeInput(participant.id, tick);
        return wrongKeys.has(`${tick}:${participant.id}`)
          ? { ...applied, dirX: -applied.dirX }
          : applied;
      },
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
  }
}

test('Skyway Input Admission output feeds the correction transaction and commits only after success', () => {
  const authoritative = createRoundStack();
  const predicted = createRoundStack();
  advanceRound(authoritative);
  advanceRound(predicted, new Set(['2:player', '3:bot']));
  const admission = createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    participantIds: ['player', 'bot'],
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick: 4,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
  admitSkywayParticipantInput(admission, command({
    participantId: 'player',
    tick: 2,
    input: authoritativeInput('player', 2),
  }));
  admitSkywayParticipantInput(admission, command({
    ownerId: 'owner-b',
    participantId: 'bot',
    tick: 3,
    input: authoritativeInput('bot', 3),
  }));
  const batch = createSkywayInputAdmissionBatch(admission, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  const baseCheckpointBundle = createSkywayRoundCheckpointBundle({
    ...predicted,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
  const admissionBeforeFailure = snapshotSkywayInputAdmissionWindow(admission);

  assert.throws(() => applySkywayAuthoritativeCorrectionBatch({
    ...predicted,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle,
    corrections: batch.corrections,
    environmentForRound() {
      throw new Error('admission integration failure');
    },
  }), /admission integration failure/);
  assert.deepEqual(admission, admissionBeforeFailure);
  assert.deepEqual(
    createSkywayInputAdmissionBatch(admission, {
      sessionIncarnation: SESSION,
      roundEpoch: 1,
    }),
    batch,
  );

  const corrected = applySkywayAuthoritativeCorrectionBatch({
    ...predicted,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle,
    corrections: batch.corrections,
    environmentForRound: ({ course }) => environmentForCourse(course),
  });
  assert.equal(corrected.status, 'resimulated');
  commitSkywayInputAdmissionBatch(admission, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    batch,
  });
  assert.deepEqual(
    snapshotSkywayRound(predicted.round),
    snapshotSkywayRound(authoritative.round),
  );
  assert.equal(
    lookupSkywaySnapshot(predicted.snapshotHistory, 4, { roundEpoch: 1 }).hash,
    lookupSkywaySnapshot(authoritative.snapshotHistory, 4, { roundEpoch: 1 }).hash,
  );
});
