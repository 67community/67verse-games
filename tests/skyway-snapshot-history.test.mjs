import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
} from '../src/core/skyway-course-simulation.js';
import {
  SKYWAY_COUNTDOWN_TICKS,
  createSkywayRound,
  queueSkywayRoundInput,
  restoreSkywayRound,
  snapshotSkywayRound,
  stepSkywayRound,
} from '../src/core/skyway-round.js';
import {
  canonicalizeSkywaySnapshot,
  createSkywaySnapshotHistory,
  hashSkywaySnapshot,
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
  resetSkywaySnapshotHistory,
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
const ROUND_EPOCH = 1;

test('Skyway snapshot canonicalization is key-stable and locks its internal hash vector', () => {
  const first = {
    tick: 7,
    b: { z: [3, 2, 1], a: true },
    a: 'skyway',
  };
  const reordered = {
    a: 'skyway',
    b: { a: true, z: [3, 2, 1] },
    tick: 7,
  };
  assert.equal(
    canonicalizeSkywaySnapshot(first),
    '{"a":"skyway","b":{"a":true,"z":[3,2,1]},"tick":7}',
  );
  assert.equal(canonicalizeSkywaySnapshot(first), canonicalizeSkywaySnapshot(reordered));
  assert.equal(hashSkywaySnapshot(first), 'fnv1a64:99c3df4a1c933b0b');
  assert.equal(hashSkywaySnapshot(first), hashSkywaySnapshot(reordered));
  assert.notEqual(hashSkywaySnapshot(first), hashSkywaySnapshot({
    ...reordered,
    b: { a: true, z: [1, 2, 3] },
  }));

  assert.throws(() => canonicalizeSkywaySnapshot({ tick: 1, value: NaN }), /finite/);
  assert.throws(() => canonicalizeSkywaySnapshot({ tick: 1, value: undefined }), /JSON/);
  const cyclic = { tick: 1 };
  cyclic.self = cyclic;
  assert.throws(() => canonicalizeSkywaySnapshot(cyclic), /cycles/);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => canonicalizeSkywaySnapshot({ tick: 1, sparse }), /dense/);
});

test('Skyway snapshot history evicts, looks up, detaches, truncates, and replaces exact ticks', () => {
  const history = createSkywaySnapshotHistory({ capacityTicks: 3 });
  const source = { tick: 10, value: { route: 'gold' } };
  const recorded = recordSkywaySnapshot(history, source, { roundEpoch: ROUND_EPOCH });
  source.value.route = 'bridge';
  recorded.snapshot.value.route = 'mutated';
  assert.equal(
    lookupSkywaySnapshot(history, 10, { roundEpoch: ROUND_EPOCH }).snapshot.value.route,
    'gold',
  );

  recordSkywaySnapshot(history, { tick: 11, value: 11 }, { roundEpoch: ROUND_EPOCH });
  recordSkywaySnapshot(history, { tick: 12, value: 12 }, { roundEpoch: ROUND_EPOCH });
  recordSkywaySnapshot(history, { tick: 13, value: 13 }, { roundEpoch: ROUND_EPOCH });
  assert.equal(history.oldestTick, 11);
  assert.equal(history.latestTick, 13);
  assert.equal(lookupSkywaySnapshot(history, 10, { roundEpoch: ROUND_EPOCH }), null);
  assert.deepEqual(
    [11, 12, 13].map((tick) => (
      lookupSkywaySnapshot(history, tick, { roundEpoch: ROUND_EPOCH }).snapshot.value
    )),
    [11, 12, 13],
  );

  const beforeGap = lookupSkywaySnapshot(history, 13, { roundEpoch: ROUND_EPOCH });
  assert.throws(
    () => recordSkywaySnapshot(
      history,
      { tick: 15, value: 15 },
      { roundEpoch: ROUND_EPOCH },
    ),
    /expected tick 14/,
  );
  assert.deepEqual(
    lookupSkywaySnapshot(history, 13, { roundEpoch: ROUND_EPOCH }),
    beforeGap,
  );
  truncateSkywaySnapshotHistory(history, 12, { roundEpoch: ROUND_EPOCH });
  assert.equal(lookupSkywaySnapshot(history, 13, { roundEpoch: ROUND_EPOCH }), null);
  const replacement = recordSkywaySnapshot(
    history,
    { tick: 13, value: 'replacement' },
    { roundEpoch: ROUND_EPOCH },
  );
  assert.notEqual(replacement.hash, beforeGap.hash);
  assert.equal(
    lookupSkywaySnapshot(history, 13, { roundEpoch: ROUND_EPOCH }).snapshot.value,
    'replacement',
  );

  resetSkywaySnapshotHistory(history, { roundEpoch: ROUND_EPOCH });
  assert.equal(history.roundEpoch, 2);
  assert.equal(history.oldestTick, null);
  assert.equal(history.latestTick, null);
  assert.ok(history.slots.every((slot) => slot === null));
});

test('Skyway snapshot history rejects prior-round same-tick work and epoch exhaustion atomically', () => {
  const history = createSkywaySnapshotHistory({ capacityTicks: 2 });
  recordSkywaySnapshot(
    history,
    { tick: 0, state: 'same' },
    { roundEpoch: ROUND_EPOCH },
  );
  resetSkywaySnapshotHistory(history, { roundEpoch: ROUND_EPOCH });
  const before = structuredClone(history);

  assert.throws(
    () => recordSkywaySnapshot(
      history,
      { tick: 0, state: 'same' },
      { roundEpoch: ROUND_EPOCH },
    ),
    /round epoch is stale/,
  );
  assert.throws(
    () => lookupSkywaySnapshot(history, 0, { roundEpoch: ROUND_EPOCH }),
    /round epoch is stale/,
  );
  assert.throws(
    () => truncateSkywaySnapshotHistory(history, 0, { roundEpoch: ROUND_EPOCH }),
    /round epoch is stale/,
  );
  assert.throws(
    () => resetSkywaySnapshotHistory(history, { roundEpoch: ROUND_EPOCH }),
    /round epoch is stale/,
  );
  assert.deepEqual(history, before);

  const current = recordSkywaySnapshot(
    history,
    { tick: 0, state: 'same' },
    { roundEpoch: 2 },
  );
  assert.equal(current.roundEpoch, 2);

  const exhausted = createSkywaySnapshotHistory({
    capacityTicks: 1,
    roundEpoch: Number.MAX_SAFE_INTEGER,
  });
  const exhaustedBefore = structuredClone(exhausted);
  assert.throws(
    () => resetSkywaySnapshotHistory(exhausted, {
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
  const lane = participantId === 'bot-a' ? -0.12 : participantId === 'bot-b' ? 0.12 : 0.1;
  return {
    dirX: tick === 200 && participantId === 'player' ? 0.7 : lane,
    dirZ: tick === 200 && participantId === 'player' ? -0.7 : -0.9,
    moving: true,
    jumpHeld: tick === 214,
    grabPressed: tick === 226 && participantId === 'player',
  };
}

function queueHorizon(round, fromTick, throughTick, { omit = null } = {}) {
  for (let tick = fromTick; tick <= throughTick; tick++) {
    for (const participant of round.participants) {
      if (omit?.tick === tick && omit.participantId === participant.id) continue;
      const result = queueSkywayRoundInput(round, {
        tick,
        participantId: participant.id,
        input: inputAt(participant.id, tick),
      });
      assert.equal(result.accepted, true);
    }
  }
}

test('Skyway history rolls back a missing input and resimulates to the authoritative hash', () => {
  const authoritative = createRoundFixture();
  const predicted = createRoundFixture();
  const firstTick = authoritative.round.tick + 1;
  const finalTick = firstTick + 59;
  const correctedTick = firstTick + 19;
  queueHorizon(authoritative.round, firstTick, finalTick);
  queueHorizon(predicted.round, firstTick, finalTick, {
    omit: { tick: correctedTick, participantId: 'player' },
  });

  const authoritativeHistory = createSkywaySnapshotHistory({ capacityTicks: 90 });
  const predictedHistory = createSkywaySnapshotHistory({ capacityTicks: 90 });
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
    const authoritativeFrame = stepSkywayRound(authoritative.round, { env: authoritative.env });
    const predictedFrame = stepSkywayRound(predicted.round, { env: predicted.env });
    authoritativeFrames.set(tick, authoritativeFrame);
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
  assert.notDeepEqual(
    snapshotSkywayRound(predicted.round),
    snapshotSkywayRound(authoritative.round),
  );

  const rollbackTick = correctedTick - 1;
  const rollback = lookupSkywaySnapshot(
    predictedHistory,
    rollbackTick,
    { roundEpoch: ROUND_EPOCH },
  );
  assert.equal(rollback.tick, rollbackTick);
  restoreSkywayRound(predicted.round, rollback.snapshot);
  truncateSkywaySnapshotHistory(
    predictedHistory,
    rollbackTick,
    { roundEpoch: ROUND_EPOCH },
  );
  assert.deepEqual(queueSkywayRoundInput(predicted.round, {
    tick: correctedTick,
    participantId: 'player',
    input: inputAt('player', correctedTick),
  }), { accepted: true, reason: null });

  for (let tick = correctedTick; tick <= finalTick; tick++) {
    const replacement = stepSkywayRound(predicted.round, { env: predicted.env });
    assert.deepEqual(replacement, authoritativeFrames.get(tick));
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
  assert.equal(
    correctedFinal.hash,
    hashSkywaySnapshot(snapshotSkywayRound(predicted.round)),
  );
});
