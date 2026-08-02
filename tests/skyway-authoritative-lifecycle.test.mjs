import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resetSkywayAuthoritativeLifecycle,
  SKYWAY_AUTHORITATIVE_LIFECYCLE_VERSION,
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
  commitSkywayInputAdmissionBatch,
  createSkywayInputAdmissionBatch,
  createSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from '../src/core/skyway-input-admission.js';
import {
  createSkywayRoundCheckpointBundle,
} from '../src/core/skyway-round-checkpoint.js';
import {
  resetSkywayRoundLifecycle,
} from '../src/core/skyway-round-lifecycle.js';
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

const SESSION = 'device-session:authoritative-lifecycle';
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

function createStack() {
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
  const snapshotHistory = createSkywaySnapshotHistory({ capacityTicks: 5 });
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
      capacityTicks: 4,
    }),
    replayEventLedger: createSkywayReplayEventLedger({
      participantIds: ['player', 'bot'],
      capacityTicks: 4,
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

function advanceStack(stack, throughTick, roundEpoch = 1) {
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
      { roundEpoch },
    );
  }
}

function createAdmission({
  currentTick = 3,
  roundEpoch = 1,
  participantIds = ['player', 'bot'],
} = {}) {
  return createSkywayInputAdmissionWindow({
    sessionIncarnation: SESSION,
    roundEpoch,
    participantIds,
    ownership: [
      { participantId: 'player', ownerId: 'owner-a' },
      { participantId: 'bot', ownerId: 'owner-b' },
    ],
    currentTick,
    pastTickHorizon: 4,
    futureTickHorizon: 2,
  });
}

function command(participantId, tick, overrides = {}) {
  return {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    ownerId: participantId === 'player' ? 'owner-a' : 'owner-b',
    participantId,
    clientSequence: 0,
    tick,
    input: FORWARD,
    ...overrides,
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
}

function checkpoint(stack, roundEpoch) {
  return createSkywayRoundCheckpointBundle({
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
    sessionIncarnation: SESSION,
    roundEpoch,
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

function resetAuthoritative(
  stack,
  admissionWindow,
  roundEpoch,
  overrides = {},
) {
  return resetSkywayAuthoritativeLifecycle({
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
    sessionIncarnation: SESSION,
    roundEpoch,
    baseCheckpointBundle: checkpoint(stack, roundEpoch),
    baseAdmissionSnapshot:
      snapshotSkywayInputAdmissionWindow(admissionWindow),
    admissionWindow,
    ...overrides,
  });
}

test('Skyway Authoritative Lifecycle rotates Round and Admission epochs in one identity-preserving reset', () => {
  const stack = createStack();
  advanceStack(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const emittedBatch = createSkywayInputAdmissionBatch(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    limit: 1,
  });
  commitSkywayInputAdmissionBatch(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    batch: emittedBatch,
  });
  const oldAdmissionBatch = createSkywayInputAdmissionBatch(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 1,
  });
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

  const result = resetAuthoritative(stack, admissionWindow, 1);

  assert.equal(result.version, SKYWAY_AUTHORITATIVE_LIFECYCLE_VERSION);
  assert.equal(result.kind, 'skyway-authoritative-lifecycle-reset');
  assert.equal(result.previousRoundEpoch, 1);
  assert.equal(result.roundEpoch, 2);
  assert.equal(result.previousTick, 3);
  assert.equal(result.tick, 0);
  assert.equal(result.nextTick, 1);
  assert.equal(result.previousAdmissionRevision, 3);
  assert.equal(result.admissionRevision, 0);
  assert.equal(result.clearedDecisionCount, 2);
  assert.equal(result.clearedPendingDecisionCount, 1);
  assert.equal(result.clearedAckCount, 2);
  assert.equal(result.checkpointHash, result.checkpointBundle.bundleHash);
  assert.deepEqual(result.acks, [
    { ownerId: 'owner-a', ackSequence: -1 },
    { ownerId: 'owner-b', ackSequence: -1 },
  ]);
  assert.deepEqual(
    result.admissionSnapshot,
    snapshotSkywayInputAdmissionWindow(admissionWindow),
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.checkpointBundle), true);
  assert.equal(Object.isFrozen(result.admissionSnapshot), true);

  assert.equal(stack.round, identities.round);
  assert.equal(stack.round.course, identities.course);
  assert.equal(stack.round.inputTimeline, identities.timeline);
  assert.equal(stack.round.participants[0], identities.participant);
  assert.equal(stack.round.participants[0].simulation, identities.simulation);
  assert.equal(stack.snapshotHistory, identities.history);
  assert.equal(stack.commandJournal, identities.journal);
  assert.equal(stack.replayEventLedger, identities.ledger);
  assert.equal(admissionWindow, identities.admission);

  assert.equal(stack.round.tick, 0);
  assert.equal(stack.snapshotHistory.roundEpoch, 2);
  assert.equal(stack.commandJournal.roundEpoch, 2);
  assert.equal(stack.replayEventLedger.roundEpoch, 2);
  assert.equal(admissionWindow.roundEpoch, 2);
  assert.equal(admissionWindow.currentTick, 0);
  assert.equal(admissionWindow.revision, 0);
  assert.equal(admissionWindow.slots.every((slot) => slot === null), true);
  assert.equal(
    admissionWindow.owners.every(({ ackSequence }) => ackSequence === -1),
    true,
  );
  assert.equal(stack.snapshotHistory.oldestTick, 0);
  assert.equal(stack.snapshotHistory.latestTick, 0);
  assert.equal(
    lookupSkywaySnapshot(stack.snapshotHistory, 0, { roundEpoch: 2 }).hash,
    result.initialSnapshotHash,
  );
  assert.equal(stack.commandJournal.latestTick, null);
  assert.equal(stack.replayEventLedger.latestTick, null);
  assert.equal(stack.replayEventLedger.nextTick, 1);
  assert.equal(stack.replayEventLedger.committedThroughTick, 0);

  assert.equal(
    admitSkywayParticipantInput(
      admissionWindow,
      command('player', 1),
    ).reason,
    'stale-epoch',
  );
  assert.throws(() => commitSkywayInputAdmissionBatch(admissionWindow, {
    sessionIncarnation: SESSION,
    roundEpoch: 2,
    batch: oldAdmissionBatch,
  }), /stale or invalid/);
  assert.throws(() => resetSkywayRoundLifecycle({
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
    roundEpoch: 1,
  }), /epochs are not aligned/);
});

test('Skyway Authoritative Lifecycle rotates an empty tick-zero state repeatedly', () => {
  const stack = createStack();
  const admissionWindow = createAdmission({ currentTick: 0 });

  const first = resetAuthoritative(stack, admissionWindow, 1);
  assert.equal(first.roundEpoch, 2);
  assert.equal(first.previousTick, 0);

  const second = resetAuthoritative(stack, admissionWindow, 2);
  assert.equal(second.previousRoundEpoch, 2);
  assert.equal(second.roundEpoch, 3);
  assert.equal(second.previousTick, 0);
  assert.equal(stack.snapshotHistory.roundEpoch, 3);
  assert.equal(stack.commandJournal.roundEpoch, 3);
  assert.equal(stack.replayEventLedger.roundEpoch, 3);
  assert.equal(admissionWindow.roundEpoch, 3);
  assert.equal(
    lookupSkywaySnapshot(stack.snapshotHistory, 0, { roundEpoch: 3 }).hash,
    second.initialSnapshotHash,
  );
});

test('Skyway Authoritative Lifecycle rejects stale checkpoint and Admission abort images', () => {
  const checkpointStack = createStack();
  advanceStack(checkpointStack, 3);
  const checkpointAdmission = createAdmission();
  seedAdmission(checkpointAdmission);
  const oldCheckpoint = checkpoint(checkpointStack, 1);
  const admissionBase =
    snapshotSkywayInputAdmissionWindow(checkpointAdmission);
  advanceStack(checkpointStack, 4);
  const checkpointBefore = stackState(checkpointStack);
  const admissionBefore =
    snapshotSkywayInputAdmissionWindow(checkpointAdmission);
  assert.throws(() => resetSkywayAuthoritativeLifecycle({
    round: checkpointStack.round,
    snapshotHistory: checkpointStack.snapshotHistory,
    commandJournal: checkpointStack.commandJournal,
    replayEventLedger: checkpointStack.replayEventLedger,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: oldCheckpoint,
    baseAdmissionSnapshot: admissionBase,
    admissionWindow: checkpointAdmission,
  }), /checkpoint revision is stale/);
  assert.deepEqual(stackState(checkpointStack), checkpointBefore);
  assert.deepEqual(checkpointAdmission, admissionBefore);

  const admissionStack = createStack();
  advanceStack(admissionStack, 3);
  const staleAdmission = createAdmission();
  seedAdmission(staleAdmission);
  const staleAdmissionBase =
    snapshotSkywayInputAdmissionWindow(staleAdmission);
  admitSkywayParticipantInput(staleAdmission, command('player', 4, {
    clientSequence: 1,
  }));
  const staleStackBefore = stackState(admissionStack);
  const staleAdmissionBefore =
    snapshotSkywayInputAdmissionWindow(staleAdmission);
  assert.throws(() => resetSkywayAuthoritativeLifecycle({
    round: admissionStack.round,
    snapshotHistory: admissionStack.snapshotHistory,
    commandJournal: admissionStack.commandJournal,
    replayEventLedger: admissionStack.replayEventLedger,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(admissionStack, 1),
    baseAdmissionSnapshot: staleAdmissionBase,
    admissionWindow: staleAdmission,
  }), /admission revision is stale/);
  assert.deepEqual(stackState(admissionStack), staleStackBefore);
  assert.deepEqual(staleAdmission, staleAdmissionBefore);
});

test('Skyway Authoritative Lifecycle rejects head, roster, session, and epoch misalignment atomically', () => {
  const scenarios = [
    {
      name: 'head',
      admission: createAdmission({ currentTick: 2 }),
      pattern: /heads or participants are not aligned/,
    },
    {
      name: 'roster',
      admission: createAdmission({ participantIds: ['bot', 'player'] }),
      pattern: /heads or participants are not aligned/,
    },
    {
      name: 'epoch',
      admission: createAdmission({ roundEpoch: 2 }),
      pattern: /round epoch is stale/,
    },
  ];

  for (const scenario of scenarios) {
    const stack = createStack();
    advanceStack(stack, 3);
    const before = stackState(stack);
    const admissionBefore =
      snapshotSkywayInputAdmissionWindow(scenario.admission);
    assert.throws(() => resetSkywayAuthoritativeLifecycle({
      round: stack.round,
      snapshotHistory: stack.snapshotHistory,
      commandJournal: stack.commandJournal,
      replayEventLedger: stack.replayEventLedger,
      sessionIncarnation: SESSION,
      roundEpoch: 1,
      baseCheckpointBundle: checkpoint(stack, 1),
      baseAdmissionSnapshot: admissionBefore,
      admissionWindow: scenario.admission,
    }), scenario.pattern, scenario.name);
    assert.deepEqual(stackState(stack), before, scenario.name);
    assert.deepEqual(
      scenario.admission,
      admissionBefore,
      scenario.name,
    );
  }

  const sessionStack = createStack();
  advanceStack(sessionStack, 3);
  const sessionAdmission = createAdmission();
  const sessionBefore = stackState(sessionStack);
  const sessionAdmissionBefore =
    snapshotSkywayInputAdmissionWindow(sessionAdmission);
  assert.throws(() => resetSkywayAuthoritativeLifecycle({
    round: sessionStack.round,
    snapshotHistory: sessionStack.snapshotHistory,
    commandJournal: sessionStack.commandJournal,
    replayEventLedger: sessionStack.replayEventLedger,
    sessionIncarnation: 'device-session:other',
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(sessionStack, 1),
    baseAdmissionSnapshot: sessionAdmissionBefore,
    admissionWindow: sessionAdmission,
  }), /session incarnation is stale/);
  assert.deepEqual(stackState(sessionStack), sessionBefore);
  assert.deepEqual(sessionAdmission, sessionAdmissionBefore);
});

test('Skyway Authoritative Lifecycle rejects malformed Admission abort state before reset', () => {
  const stack = createStack();
  advanceStack(stack, 3);
  const admissionWindow = createAdmission();
  seedAdmission(admissionWindow);
  const malformed = snapshotSkywayInputAdmissionWindow(admissionWindow);
  malformed.slots.find(Boolean).decisions[0].input.dirX = Number.NaN;
  const before = stackState(stack);
  const admissionBefore =
    snapshotSkywayInputAdmissionWindow(admissionWindow);

  assert.throws(() => resetSkywayAuthoritativeLifecycle({
    round: stack.round,
    snapshotHistory: stack.snapshotHistory,
    commandJournal: stack.commandJournal,
    replayEventLedger: stack.replayEventLedger,
    sessionIncarnation: SESSION,
    roundEpoch: 1,
    baseCheckpointBundle: checkpoint(stack, 1),
    baseAdmissionSnapshot: malformed,
    admissionWindow,
  }), /Invalid Skyway input-admission decision/);
  assert.deepEqual(stackState(stack), before);
  assert.deepEqual(admissionWindow, admissionBefore);
});
