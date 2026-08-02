import assert from 'node:assert/strict';
import test from 'node:test';
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
  resetSkywayRoundLifecycle,
  SKYWAY_ROUND_LIFECYCLE_VERSION,
} from '../src/core/skyway-round-lifecycle.js';
import {
  createSkywayRoundFinalityToken,
} from '../src/core/skyway-round-finality.js';
import {
  createSkywayRound,
  resetSkywayRound,
  snapshotSkywayRound,
  stepSkywayRound,
} from '../src/core/skyway-round.js';
import {
  createSkywaySnapshotHistory,
  hashSkywaySnapshot,
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
} from '../src/core/skyway-snapshot-history.js';
import { SKYWAY_LEVEL_DESCRIPTION } from '../src/games/obstacle.js';

const IDLE = {
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
};
const FORWARD = {
  ...IDLE,
  dirZ: -1,
  moving: true,
};

function createStack({ seedHistory = true } = {}) {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const round = createSkywayRound({
    course,
    countdownTicks: 1,
    inputCapacityTicks: 3,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot', isPlayer: false, spawn: { x: -2, z: 1 } },
    ],
  });
  const snapshotHistory = createSkywaySnapshotHistory({ capacityTicks: 4 });
  if (seedHistory) {
    recordSkywaySnapshot(
      snapshotHistory,
      snapshotSkywayRound(round),
      { roundEpoch: snapshotHistory.roundEpoch },
    );
  }
  const commandJournal = createSkywayCommandJournal({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
  });
  const replayEventLedger = createSkywayReplayEventLedger({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
  });
  const env = {
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
  return {
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    env,
  };
}

function advanceStack(stack, throughTick = 3) {
  while (stack.round.tick < throughTick) {
    const tick = stack.round.tick + 1;
    const frame = stepSkywayRound(stack.round, {
      env: stack.env,
      inputFor: () => FORWARD,
    });
    appendSkywayCommandTick(stack.commandJournal, {
      roundEpoch: stack.commandJournal.roundEpoch,
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
      { roundEpoch: stack.snapshotHistory.roundEpoch },
    );
  }
}

function stackSnapshot(stack) {
  return {
    round: snapshotSkywayRound(stack.round),
    snapshotHistory: structuredClone(stack.snapshotHistory),
    commandJournal: structuredClone(stack.commandJournal),
    replayEventLedger: structuredClone(stack.replayEventLedger),
  };
}

test('Skyway Round Lifecycle atomically resets aligned state and seeds its exact legacy reset snapshot', () => {
  const stack = createStack();
  advanceStack(stack);
  const expectedRound = structuredClone(stack.round);
  resetSkywayRound(expectedRound);
  const expectedSnapshot = snapshotSkywayRound(expectedRound);
  const oldToken = createSkywayRoundFinalityToken({
    ledger: stack.replayEventLedger,
    roundSnapshot: snapshotSkywayRound(stack.round),
  });
  const identities = {
    course: stack.round.course,
    timeline: stack.round.inputTimeline,
    participant: stack.round.participants[0],
    simulation: stack.round.participants[0].simulation,
    player: stack.round.participants[0].simulation.player,
  };

  const result = resetSkywayRoundLifecycle({ ...stack, roundEpoch: 1 });
  assert.deepEqual(result, {
    version: SKYWAY_ROUND_LIFECYCLE_VERSION,
    kind: 'skyway-round-lifecycle-reset',
    previousTick: 3,
    tick: 0,
    nextTick: 1,
    previousRoundEpoch: 1,
    roundEpoch: 2,
    initialSnapshotHash: hashSkywaySnapshot(expectedSnapshot),
  });
  assert.deepEqual(snapshotSkywayRound(stack.round), expectedSnapshot);
  assert.equal(stack.round.course, identities.course);
  assert.equal(stack.round.inputTimeline, identities.timeline);
  assert.equal(stack.round.participants[0], identities.participant);
  assert.equal(stack.round.participants[0].simulation, identities.simulation);
  assert.equal(stack.round.participants[0].simulation.player, identities.player);

  assert.equal(stack.snapshotHistory.oldestTick, 0);
  assert.equal(stack.snapshotHistory.latestTick, 0);
  assert.equal(stack.snapshotHistory.roundEpoch, 2);
  assert.equal(
    lookupSkywaySnapshot(stack.snapshotHistory, 0, { roundEpoch: 2 }).hash,
    result.initialSnapshotHash,
  );
  assert.equal(stack.commandJournal.oldestTick, null);
  assert.equal(stack.commandJournal.latestTick, null);
  assert.equal(stack.commandJournal.roundEpoch, 2);
  assert.equal(stack.replayEventLedger.roundEpoch, 2);
  assert.equal(stack.replayEventLedger.revision, 0);
  assert.equal(stack.replayEventLedger.nextTick, 1);
  assert.equal(stack.replayEventLedger.committedThroughTick, 0);
  assert.equal(stack.replayEventLedger.pendingFinality, null);
  assert.ok(stack.replayEventLedger.slots.every((slot) => slot === null));

  const beforeStaleWork = stackSnapshot(stack);
  assert.throws(() => appendSkywayCommandTick(stack.commandJournal, {
    roundEpoch: 1,
    tick: 1,
    commands: [
      { participantId: 'player', authority: 'predicted', input: FORWARD },
      { participantId: 'bot', authority: 'predicted', input: FORWARD },
    ],
  }), /round epoch is stale/);
  assert.throws(() => recordSkywaySnapshot(
    stack.snapshotHistory,
    snapshotSkywayRound(stack.round),
    { roundEpoch: 1 },
  ), /round epoch is stale/);
  assert.throws(
    () => resetSkywayRoundLifecycle({ ...stack, roundEpoch: 1 }),
    /epochs are not aligned/,
  );
  assert.deepEqual(stackSnapshot(stack), beforeStaleWork);

  advanceStack(stack, 1);
  const currentSnapshot = snapshotSkywayRound(stack.round);
  assert.throws(() => commitSkywayReplayEvents(stack.replayEventLedger, {
    throughTick: 1,
    finalityToken: oldToken,
    roundSnapshot: currentSnapshot,
  }), /epoch is stale/);
  const currentToken = createSkywayRoundFinalityToken({
    ledger: stack.replayEventLedger,
    roundSnapshot: currentSnapshot,
  });
  const committed = commitSkywayReplayEvents(stack.replayEventLedger, {
    throughTick: 1,
    finalityToken: currentToken,
    roundSnapshot: currentSnapshot,
  });
  assert.equal(committed.roundEpoch, 2);
});

test('Skyway Round Lifecycle seeds an empty tick-zero stack and rotates epoch on every reset', () => {
  const stack = createStack({ seedHistory: false });
  const first = resetSkywayRoundLifecycle({ ...stack, roundEpoch: 1 });
  assert.equal(first.roundEpoch, 2);
  assert.equal(stack.snapshotHistory.oldestTick, 0);
  assert.equal(stack.snapshotHistory.latestTick, 0);
  assert.equal(
    lookupSkywaySnapshot(stack.snapshotHistory, 0, { roundEpoch: 2 }).hash,
    first.initialSnapshotHash,
  );

  const second = resetSkywayRoundLifecycle({ ...stack, roundEpoch: 2 });
  assert.equal(second.previousRoundEpoch, 2);
  assert.equal(second.roundEpoch, 3);
  assert.equal(stack.snapshotHistory.oldestTick, 0);
  assert.equal(stack.snapshotHistory.latestTick, 0);
  assert.equal(
    lookupSkywaySnapshot(stack.snapshotHistory, 0, { roundEpoch: 3 }).hash,
    second.initialSnapshotHash,
  );
});

test('Skyway Round Lifecycle rejects alignment and validation failures without mutation', () => {
  const scenarios = [
    {
      name: 'participant order',
      mutate(stack) {
        stack.commandJournal.participantIds.reverse();
      },
      pattern: /participant order/,
    },
    {
      name: 'capacity',
      mutate(stack) {
        stack.snapshotHistory.capacityTicks = 3;
        stack.snapshotHistory.slots.length = 3;
      },
      pattern: /capacities/,
    },
    {
      name: 'head',
      mutate(stack) {
        stack.replayEventLedger.latestTick -= 1;
      },
      pattern: /heads/,
    },
    {
      name: 'epoch',
      mutate(stack) {
        stack.commandJournal.roundEpoch += 1;
      },
      pattern: /epochs/,
    },
    {
      name: 'history hash',
      mutate(stack) {
        stack.round.participants[0].simulation.player.pos.x += 1;
      },
      pattern: /snapshot head/,
    },
    {
      name: 'malformed journal',
      mutate(stack) {
        stack.commandJournal.slots.pop();
      },
      pattern: /Invalid Skyway command journal/,
    },
  ];

  for (const scenario of scenarios) {
    const stack = createStack();
    advanceStack(stack);
    scenario.mutate(stack);
    const before = stackSnapshot(stack);
    assert.throws(
      () => resetSkywayRoundLifecycle({ ...stack, roundEpoch: 1 }),
      scenario.pattern,
      scenario.name,
    );
    assert.deepEqual(stackSnapshot(stack), before, scenario.name);
  }
});

test('Skyway Round Lifecycle rejects exhausted epoch before changing any module', () => {
  const stack = createStack();
  advanceStack(stack);
  stack.replayEventLedger.roundEpoch = Number.MAX_SAFE_INTEGER;
  stack.snapshotHistory.roundEpoch = Number.MAX_SAFE_INTEGER;
  stack.commandJournal.roundEpoch = Number.MAX_SAFE_INTEGER;
  const before = stackSnapshot(stack);
  assert.throws(
    () => resetSkywayRoundLifecycle({
      ...stack,
      roundEpoch: Number.MAX_SAFE_INTEGER,
    }),
    /round epoch is exhausted/,
  );
  assert.deepEqual(stackSnapshot(stack), before);
});
