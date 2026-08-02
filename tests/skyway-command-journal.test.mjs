import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
  lookupSkywayCommandTick,
  reconstructSkywayInputTimeline,
  replaceSkywayJournalCommand,
  resetSkywayCommandJournal,
} from '../src/core/skyway-command-journal.js';
import {
  advanceSkywayInputTimeline,
  createSkywayInputTimeline,
  queueSkywayTimelineInput,
  readSkywayTimelineInput,
  snapshotSkywayInputTimeline,
} from '../src/core/skyway-input-timeline.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import {
  SKYWAY_COUNTDOWN_TICKS,
  createSkywayRound,
  restoreSkywayRound,
  snapshotSkywayRound,
  stepSkywayRound,
} from '../src/core/skyway-round.js';
import {
  createSkywaySnapshotHistory,
  hashSkywaySnapshot,
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
  truncateSkywaySnapshotHistory,
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
const ROUND_EPOCH = 1;

function command(participantId, authority, input = IDLE) {
  return { participantId, authority, input };
}

test('Skyway Command Journal retains accepted ticks and applies strict authority precedence', () => {
  const journal = createSkywayCommandJournal({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
  });
  const source = { ...IDLE, dirX: 2, moving: true };
  appendSkywayCommandTick(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 10,
    commands: [
      command('player', 'neutral'),
      command('bot', 'predicted', source),
    ],
  });
  source.dirX = -1;
  assert.equal(
    lookupSkywayCommandTick(journal, 10, { roundEpoch: ROUND_EPOCH })
      .commands[1].input.dirX,
    1,
  );

  assert.deepEqual(replaceSkywayJournalCommand(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 10,
    participantId: 'player',
    authority: 'predicted',
    input: FORWARD,
  }), {
    accepted: true,
    reason: null,
    previousAuthority: 'neutral',
    authority: 'predicted',
    changed: true,
    rollbackTick: 9,
  });
  assert.deepEqual(replaceSkywayJournalCommand(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 10,
    participantId: 'player',
    authority: 'predicted',
    input: { ...FORWARD, dirX: 0.2 },
  }), { accepted: false, reason: 'duplicate' });
  assert.deepEqual(replaceSkywayJournalCommand(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 10,
    participantId: 'player',
    authority: 'authoritative',
    input: FORWARD,
  }), {
    accepted: true,
    reason: null,
    previousAuthority: 'predicted',
    authority: 'authoritative',
    changed: false,
    rollbackTick: null,
  });
  assert.deepEqual(replaceSkywayJournalCommand(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 10,
    participantId: 'player',
    authority: 'predicted',
    input: IDLE,
  }), { accepted: false, reason: 'lower-authority' });
  assert.deepEqual(replaceSkywayJournalCommand(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 10,
    participantId: 'player',
    authority: 'authoritative',
    input: IDLE,
  }), { accepted: false, reason: 'authoritative-conflict' });

  for (let tick = 11; tick <= 13; tick++) {
    appendSkywayCommandTick(journal, {
      roundEpoch: ROUND_EPOCH,
      tick,
      commands: [
        command('player', 'predicted', FORWARD),
        command('bot', 'predicted', FORWARD),
      ],
    });
  }
  assert.equal(journal.oldestTick, 11);
  assert.equal(
    lookupSkywayCommandTick(journal, 10, { roundEpoch: ROUND_EPOCH }),
    null,
  );
  assert.deepEqual(replaceSkywayJournalCommand(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 10,
    participantId: 'player',
    authority: 'authoritative',
    input: FORWARD,
  }), { accepted: false, reason: 'unavailable' });
  assert.throws(
    () => appendSkywayCommandTick(journal, {
      roundEpoch: ROUND_EPOCH,
      tick: 15,
      commands: [
        command('player', 'predicted'),
        command('bot', 'predicted'),
      ],
    }),
    /expected tick 14/,
  );
  assert.equal(journal.latestTick, 13);

  resetSkywayCommandJournal(journal, { roundEpoch: ROUND_EPOCH });
  assert.equal(journal.roundEpoch, 2);
  assert.equal(journal.oldestTick, null);
  assert.equal(journal.latestTick, null);
  assert.ok(journal.slots.every((slot) => slot === null));
});

test('Skyway Command Journal reconstructs only a matching empty timeline range', () => {
  const journal = createSkywayCommandJournal({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
  });
  for (let tick = 1; tick <= 3; tick++) {
    appendSkywayCommandTick(journal, {
      roundEpoch: ROUND_EPOCH,
      tick,
      commands: [
        command('player', tick === 2 ? 'authoritative' : 'predicted', {
          ...FORWARD,
          jumpHeld: tick === 2,
        }),
        command('bot', 'predicted', tick === 3 ? IDLE : FORWARD),
      ],
    });
  }

  const timeline = createSkywayInputTimeline({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
  });
  assert.deepEqual(reconstructSkywayInputTimeline(journal, timeline, {
    roundEpoch: ROUND_EPOCH,
    fromTick: 1,
    throughTick: 3,
  }), { fromTick: 1, throughTick: 3, commandCount: 6 });
  for (let tick = 1; tick <= 3; tick++) {
    assert.deepEqual(
      readSkywayTimelineInput(timeline, tick, 'player').input,
      lookupSkywayCommandTick(journal, tick, { roundEpoch: ROUND_EPOCH })
        .commands[0].input,
    );
    assert.deepEqual(
      readSkywayTimelineInput(timeline, tick, 'bot').input,
      lookupSkywayCommandTick(journal, tick, { roundEpoch: ROUND_EPOCH })
        .commands[1].input,
    );
    advanceSkywayInputTimeline(timeline, tick);
  }

  const occupied = createSkywayInputTimeline({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
  });
  queueSkywayTimelineInput(occupied, {
    tick: 2,
    participantId: 'player',
    input: FORWARD,
  });
  const before = snapshotSkywayInputTimeline(occupied);
  assert.throws(
    () => reconstructSkywayInputTimeline(journal, occupied, {
      roundEpoch: ROUND_EPOCH,
      fromTick: 1,
      throughTick: 3,
    }),
    /empty timeline range/,
  );
  assert.deepEqual(snapshotSkywayInputTimeline(occupied), before);
});

test('Skyway Command Journal rejects prior-round same-tick work and epoch exhaustion atomically', () => {
  const journal = createSkywayCommandJournal({
    participantIds: ['player', 'bot'],
    capacityTicks: 2,
  });
  const commands = [
    command('player', 'predicted', FORWARD),
    command('bot', 'predicted', FORWARD),
  ];
  appendSkywayCommandTick(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: 1,
    commands,
  });
  resetSkywayCommandJournal(journal, { roundEpoch: ROUND_EPOCH });
  const before = structuredClone(journal);
  const timeline = createSkywayInputTimeline({
    participantIds: ['player', 'bot'],
    capacityTicks: 2,
  });

  assert.throws(
    () => appendSkywayCommandTick(journal, {
      roundEpoch: ROUND_EPOCH,
      tick: 1,
      commands,
    }),
    /round epoch is stale/,
  );
  assert.throws(
    () => lookupSkywayCommandTick(journal, 1, { roundEpoch: ROUND_EPOCH }),
    /round epoch is stale/,
  );
  assert.throws(
    () => replaceSkywayJournalCommand(journal, {
      roundEpoch: ROUND_EPOCH,
      tick: 1,
      participantId: 'player',
      authority: 'authoritative',
      input: FORWARD,
    }),
    /round epoch is stale/,
  );
  assert.throws(
    () => reconstructSkywayInputTimeline(journal, timeline, {
      roundEpoch: ROUND_EPOCH,
      fromTick: 1,
      throughTick: 1,
    }),
    /round epoch is stale/,
  );
  assert.throws(
    () => resetSkywayCommandJournal(journal, { roundEpoch: ROUND_EPOCH }),
    /round epoch is stale/,
  );
  assert.deepEqual(journal, before);

  const current = appendSkywayCommandTick(journal, {
    roundEpoch: 2,
    tick: 1,
    commands,
  });
  assert.equal(current.roundEpoch, 2);

  const exhausted = createSkywayCommandJournal({
    participantIds: ['player'],
    capacityTicks: 1,
    roundEpoch: Number.MAX_SAFE_INTEGER,
  });
  const exhaustedBefore = structuredClone(exhausted);
  assert.throws(
    () => resetSkywayCommandJournal(exhausted, {
      roundEpoch: Number.MAX_SAFE_INTEGER,
    }),
    /round epoch is exhausted/,
  );
  assert.deepEqual(exhausted, exhaustedBefore);
});

function createRoundFixture() {
  const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
  const round = createSkywayRound({
    course,
    participants: [
      { id: 'player', isPlayer: true, spawn: { x: 0, z: 3 } },
      { id: 'bot-a', isPlayer: false, spawn: { x: -2, z: 1 } },
      { id: 'bot-b', isPlayer: false, spawn: { x: 2, z: 1 } },
    ],
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
  for (let tick = 0; tick < SKYWAY_COUNTDOWN_TICKS; tick++) {
    stepSkywayRound(round, { env, includeSnapshot: false });
  }
  return { round, env };
}

function inputAt(participantId, tick) {
  const lane = participantId === 'bot-a' ? -0.12 : participantId === 'bot-b' ? 0.12 : 0.08;
  return {
    dirX: tick === 181 && participantId === 'player' ? 0.7 : lane,
    dirZ: tick === 181 && participantId === 'player' ? -0.7 : -0.9,
    moving: true,
    jumpHeld: tick === 205,
    grabPressed: tick === 219 && participantId === 'player',
  };
}

function frameCommands(frame, authorityFor) {
  return frame.inputs.map(({ id, input }) => ({
    participantId: id,
    authority: authorityFor(id),
    input,
  }));
}

test('Skyway journal replaces an applied prediction and reconstructs authoritative rollback', () => {
  const authoritative = createRoundFixture();
  const predicted = createRoundFixture();
  const firstTick = authoritative.round.tick + 1;
  const finalTick = firstTick + 59;
  const authoritativeHistory = createSkywaySnapshotHistory({ capacityTicks: 61 });
  const predictedHistory = createSkywaySnapshotHistory({ capacityTicks: 61 });
  const journal = createSkywayCommandJournal({
    participantIds: predicted.round.participants.map((participant) => participant.id),
    capacityTicks: 60,
  });
  recordSkywaySnapshot(
    authoritativeHistory,
    snapshotSkywayRound(authoritative.round),
    { roundEpoch: ROUND_EPOCH },
  );
  recordSkywaySnapshot(
    predictedHistory,
    snapshotSkywayRound(predicted.round),
    { roundEpoch: ROUND_EPOCH },
  );

  const authoritativeFrames = new Map();
  for (let tick = firstTick; tick <= finalTick; tick++) {
    const authoritativeFrame = stepSkywayRound(authoritative.round, {
      env: authoritative.env,
      inputFor: (participant) => inputAt(participant.id, tick),
    });
    const predictedFrame = stepSkywayRound(predicted.round, {
      env: predicted.env,
      inputFor(participant) {
        return tick === firstTick && participant.id === 'player'
          ? { ...FORWARD, dirX: -0.7, dirZ: -0.7 }
          : inputAt(participant.id, tick);
      },
    });
    authoritativeFrames.set(tick, {
      tick: authoritativeFrame.tick,
      inputs: authoritativeFrame.inputs,
      events: authoritativeFrame.events,
    });
    appendSkywayCommandTick(journal, {
      roundEpoch: ROUND_EPOCH,
      tick,
      commands: frameCommands(predictedFrame, () => 'predicted'),
    });
    recordSkywaySnapshot(
      authoritativeHistory,
      authoritativeFrame.snapshot,
      { roundEpoch: ROUND_EPOCH },
    );
    recordSkywaySnapshot(
      predictedHistory,
      predictedFrame.snapshot,
      { roundEpoch: ROUND_EPOCH },
    );
  }
  assert.equal(journal.oldestTick, firstTick);
  assert.equal(authoritativeHistory.oldestTick, firstTick - 1);
  assert.notDeepEqual(
    snapshotSkywayRound(predicted.round),
    snapshotSkywayRound(authoritative.round),
  );

  assert.deepEqual(replaceSkywayJournalCommand(journal, {
    roundEpoch: ROUND_EPOCH,
    tick: firstTick,
    participantId: 'player',
    authority: 'authoritative',
    input: inputAt('player', firstTick),
  }), {
    accepted: true,
    reason: null,
    previousAuthority: 'predicted',
    authority: 'authoritative',
    changed: true,
    rollbackTick: firstTick - 1,
  });

  const rollback = lookupSkywaySnapshot(
    predictedHistory,
    firstTick - 1,
    { roundEpoch: ROUND_EPOCH },
  );
  restoreSkywayRound(predicted.round, rollback.snapshot);
  truncateSkywaySnapshotHistory(
    predictedHistory,
    firstTick - 1,
    { roundEpoch: ROUND_EPOCH },
  );
  assert.deepEqual(reconstructSkywayInputTimeline(
    journal,
    predicted.round.inputTimeline,
    { roundEpoch: ROUND_EPOCH, fromTick: firstTick, throughTick: finalTick },
  ), {
    fromTick: firstTick,
    throughTick: finalTick,
    commandCount: 180,
  });

  for (let tick = firstTick; tick <= finalTick; tick++) {
    const replacement = stepSkywayRound(predicted.round, { env: predicted.env });
    assert.deepEqual({
      tick: replacement.tick,
      inputs: replacement.inputs,
      events: replacement.events,
    }, authoritativeFrames.get(tick));
    recordSkywaySnapshot(
      predictedHistory,
      replacement.snapshot,
      { roundEpoch: ROUND_EPOCH },
    );
  }
  const authoritativeFinal = lookupSkywaySnapshot(
    authoritativeHistory,
    finalTick,
    { roundEpoch: ROUND_EPOCH },
  );
  const correctedFinal = lookupSkywaySnapshot(
    predictedHistory,
    finalTick,
    { roundEpoch: ROUND_EPOCH },
  );
  assert.deepEqual(correctedFinal.snapshot, authoritativeFinal.snapshot);
  assert.equal(correctedFinal.hash, authoritativeFinal.hash);
  assert.equal(correctedFinal.hash, hashSkywaySnapshot(snapshotSkywayRound(predicted.round)));
});
