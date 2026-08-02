import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceSkywayInputTimeline,
  createSkywayInputTimeline,
  queueSkywayTimelineInput,
  readSkywayTimelineInput,
  resetSkywayInputTimeline,
  restoreSkywayInputTimeline,
  SKYWAY_IDLE_INPUT,
  snapshotSkywayInputTimeline,
} from '../src/core/skyway-input-timeline.js';

const FORWARD = {
  dirX: 0,
  dirZ: -1,
  moving: true,
  jumpHeld: false,
  grabPressed: false,
};

test('Skyway Input Timeline bounds ticks and applies neutral-missing, late, and first-write policies', () => {
  const timeline = createSkywayInputTimeline({
    participantIds: ['player', 'bot'],
    capacityTicks: 3,
  });
  const source = { ...FORWARD, dirX: 2, dirZ: 0 };
  assert.deepEqual(queueSkywayTimelineInput(timeline, {
    tick: 1,
    participantId: 'player',
    input: source,
  }), { accepted: true, reason: null });
  source.dirX = -1;

  assert.deepEqual(queueSkywayTimelineInput(timeline, {
    tick: 1,
    participantId: 'player',
    input: { ...FORWARD, dirX: -1, dirZ: 0 },
  }), { accepted: false, reason: 'duplicate' });
  assert.deepEqual(readSkywayTimelineInput(timeline, 1, 'player'), {
    source: 'queued',
    input: { ...FORWARD, dirX: 1, dirZ: 0 },
  });
  assert.deepEqual(readSkywayTimelineInput(timeline, 1, 'bot'), {
    source: 'missing',
    input: { ...SKYWAY_IDLE_INPUT },
  });
  assert.equal(timeline.slots.length, 3);

  advanceSkywayInputTimeline(timeline, 1);
  assert.deepEqual(queueSkywayTimelineInput(timeline, {
    tick: 1,
    participantId: 'player',
    input: FORWARD,
  }), { accepted: false, reason: 'late' });
  assert.deepEqual(queueSkywayTimelineInput(timeline, {
    tick: 5,
    participantId: 'player',
    input: FORWARD,
  }), { accepted: false, reason: 'too-far' });
  assert.deepEqual(queueSkywayTimelineInput(timeline, {
    tick: 4,
    participantId: 'player',
    input: FORWARD,
  }), { accepted: true, reason: null });
  assert.throws(
    () => queueSkywayTimelineInput(timeline, {
      tick: 2,
      participantId: 'unknown',
      input: FORWARD,
    }),
    /Unknown Skyway participant/,
  );
  assert.throws(
    () => queueSkywayTimelineInput(timeline, {
      tick: 2,
      participantId: 'bot',
      input: { ...FORWARD, reward: 10 },
    }),
    /Invalid Skyway tick input/,
  );
  assert.throws(
    () => advanceSkywayInputTimeline(timeline, 3),
    /expected tick 2/,
  );

  advanceSkywayInputTimeline(timeline, 2);
  advanceSkywayInputTimeline(timeline, 3);
  assert.equal(readSkywayTimelineInput(timeline, 4, 'player').source, 'queued');
  advanceSkywayInputTimeline(timeline, 4);
  assert.deepEqual(queueSkywayTimelineInput(timeline, {
    tick: 5,
    participantId: 'player',
    input: FORWARD,
  }), { accepted: true, reason: null });
  assert.equal(readSkywayTimelineInput(timeline, 5, 'player').source, 'queued');
});

function consumeTrace(timeline, throughTick) {
  const trace = [];
  while (timeline.nextTick <= throughTick) {
    const tick = timeline.nextTick;
    trace.push({
      tick,
      player: readSkywayTimelineInput(timeline, tick, 'player'),
      bot: readSkywayTimelineInput(timeline, tick, 'bot'),
    });
    advanceSkywayInputTimeline(timeline, tick);
  }
  return trace;
}

test('Skyway Input Timeline snapshots future ring entries and replays deterministically', () => {
  const original = createSkywayInputTimeline({
    participantIds: ['player', 'bot'],
    capacityTicks: 4,
  });
  queueSkywayTimelineInput(original, {
    tick: 1,
    participantId: 'player',
    input: FORWARD,
  });
  queueSkywayTimelineInput(original, {
    tick: 3,
    participantId: 'bot',
    input: { ...FORWARD, dirX: 0.5 },
  });
  queueSkywayTimelineInput(original, {
    tick: 4,
    participantId: 'player',
    input: { ...FORWARD, jumpHeld: true },
  });
  const saved = JSON.parse(JSON.stringify(snapshotSkywayInputTimeline(original)));

  const restored = createSkywayInputTimeline({
    participantIds: ['player', 'bot'],
    capacityTicks: 4,
  });
  restoreSkywayInputTimeline(restored, saved);
  assert.deepEqual(snapshotSkywayInputTimeline(restored), saved);
  assert.deepEqual(consumeTrace(restored, 4), consumeTrace(original, 4));

  resetSkywayInputTimeline(restored);
  assert.deepEqual(snapshotSkywayInputTimeline(restored), {
    version: 1,
    capacityTicks: 4,
    nextTick: 1,
    participantIds: ['player', 'bot'],
    entries: [],
  });
});

test('Skyway Input Timeline rejects malformed snapshots without partial mutation', () => {
  const timeline = createSkywayInputTimeline({
    participantIds: ['player', 'bot'],
    capacityTicks: 4,
  });
  queueSkywayTimelineInput(timeline, {
    tick: 2,
    participantId: 'player',
    input: FORWARD,
  });
  const before = snapshotSkywayInputTimeline(timeline);
  const malformed = structuredClone(before);
  malformed.entries[0].inputs[0].input.dirX = 2;
  assert.throws(
    () => restoreSkywayInputTimeline(timeline, malformed),
    /Invalid Skyway input timeline snapshot/,
  );
  assert.deepEqual(snapshotSkywayInputTimeline(timeline), before);
});
