import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeClientRoomFrame,
  decodeServerRoomFrame,
  encodeClientRoomFrame,
  encodeServerRoomFrame,
  ROOM_PROTOCOL_LIMITS,
  ROOM_PROTOCOL_VERSION,
} from '../src/core/room-protocol.js';
import { reconcileRoomPlayer } from '../src/core/multiplayer.js';
import {
  createSkywaySimulationState,
  replaySkywaySimulation,
  SKYWAY_FIXED_DT,
  SKYWAY_SIMULATION_VERSION,
  skywayInputFromControl,
  snapshotSkywaySimulation,
  stepSkywaySimulation,
} from '../src/core/skyway-simulation.js';
import { createPlayerState, stepPlayer } from '../src/player.js';

const join = {
  v: ROOM_PROTOCOL_VERSION,
  type: 'join',
  playerId: 'p-player-1',
  name: '  Sky   Kid!!!  ',
};

const input = {
  v: ROOM_PROTOCOL_VERSION,
  type: 'input',
  input: { mx: 1, my: 1, jump: true, grab: false, seq: 7 },
};

const snapshot = {
  v: ROOM_PROTOCOL_VERSION,
  type: 'snapshot',
  course: {
    tick: 42,
    phase: 'racing',
    raceTime: 0.7,
  },
  players: [{
    id: 'p-player-1',
    name: 'Sky Kid',
    x: 1.25,
    y: 0,
    z: -4.5,
    yaw: Math.PI,
    seq: 7,
    checkpoint: 0,
    finished: false,
    place: 0,
    finishTime: 0,
    falls: 0,
  }],
};

test('current RoomProtocol round-trips normalized client and authoritative server frames', () => {
  const encodedJoin = encodeClientRoomFrame(join);
  assert.equal(encodedJoin.ok, true);
  assert.deepEqual(decodeClientRoomFrame(encodedJoin.text), {
    ok: true,
    message: { ...join, name: 'Sky Kid' },
  });

  const encodedInput = encodeClientRoomFrame(input);
  assert.equal(encodedInput.ok, true);
  const decodedInput = decodeClientRoomFrame(encodedInput.text);
  assert.equal(decodedInput.ok, true);
  assert.ok(Math.hypot(decodedInput.message.input.mx, decodedInput.message.input.my) <= 1);
  assert.equal(decodedInput.message.input.seq, 7);

  const encodedSnapshot = encodeServerRoomFrame(snapshot);
  assert.equal(encodedSnapshot.ok, true);
  assert.deepEqual(decodeServerRoomFrame(encodedSnapshot.text), {
    ok: true,
    message: snapshot,
  });
  const finishedSnapshot = {
    ...snapshot,
    players: [{
      ...snapshot.players[0],
      checkpoint: 3,
      finished: true,
      place: 1,
      finishTime: 42.5,
    }],
  };
  const encodedFinish = encodeServerRoomFrame(finishedSnapshot);
  assert.equal(encodedFinish.ok, true);
  assert.deepEqual(decodeServerRoomFrame(encodedFinish.text).message, finishedSnapshot);

  const encodedError = encodeServerRoomFrame({
    v: ROOM_PROTOCOL_VERSION,
    type: 'error',
    error: 'Input rejected',
  });
  assert.equal(encodedError.ok, true);
  assert.deepEqual(decodeServerRoomFrame(encodedError.text).message, {
    v: ROOM_PROTOCOL_VERSION,
    type: 'error',
    error: 'Input rejected',
  });
});

test('RoomProtocol rejects malformed, unversioned, unknown, and oversized client frames', () => {
  assert.equal(decodeClientRoomFrame(new Uint8Array()).code, 'invalid-transport');
  assert.equal(decodeClientRoomFrame('{').code, 'invalid-json');
  assert.equal(decodeClientRoomFrame('null').code, 'invalid-frame');
  assert.equal(decodeClientRoomFrame(JSON.stringify({ type: 'join' })).code, 'unsupported-version');
  assert.equal(decodeClientRoomFrame(JSON.stringify({
    v: 99,
    type: 'join',
    playerId: 'p-player-1',
    name: 'Sky Kid',
  })).code, 'unsupported-version');
  assert.equal(decodeClientRoomFrame(JSON.stringify({
    v: ROOM_PROTOCOL_VERSION,
    type: 'reward',
  })).code, 'unknown-type');
  assert.equal(decodeClientRoomFrame(JSON.stringify({
    ...join,
    score: 999,
  })).code, 'invalid-frame');
  assert.equal(
    decodeClientRoomFrame('界'.repeat(ROOM_PROTOCOL_LIMITS.clientMessageBytes)).code,
    'message-too-large',
  );
});

test('RoomProtocol rejects malformed identities and control payloads', () => {
  assert.equal(encodeClientRoomFrame({ ...join, playerId: 'admin' }).code, 'invalid-join');
  assert.equal(encodeClientRoomFrame({ ...join, name: null }).code, 'invalid-join');
  assert.equal(decodeClientRoomFrame(JSON.stringify({
    ...input,
    input: { ...input.input, mx: '1' },
  })).code, 'invalid-input');
  assert.equal(decodeClientRoomFrame(JSON.stringify({
    ...input,
    input: { ...input.input, seq: 1.5 },
  })).code, 'invalid-input');
  assert.equal(decodeClientRoomFrame(JSON.stringify({
    ...input,
    input: { ...input.input, score: 99 },
  })).code, 'invalid-input');
  assert.equal(decodeClientRoomFrame(JSON.stringify({
    ...input,
    input: { mx: 0, my: 0, jump: false, seq: 1 },
  })).code, 'invalid-input');
});

test('RoomProtocol rejects malformed, duplicate, and oversized snapshots', () => {
  assert.equal(decodeServerRoomFrame(JSON.stringify({
    ...snapshot,
    players: [{ ...snapshot.players[0], x: null }],
  })).code, 'invalid-snapshot');
  assert.equal(decodeServerRoomFrame(JSON.stringify({
    ...snapshot,
    players: [{ ...snapshot.players[0], reward: 100 }],
  })).code, 'invalid-snapshot');
  assert.equal(decodeServerRoomFrame(JSON.stringify({
    ...snapshot,
    players: [{
      ...snapshot.players[0],
      finished: true,
      place: 0,
      finishTime: 42,
    }],
  })).code, 'invalid-snapshot');
  assert.equal(decodeServerRoomFrame(JSON.stringify({
    ...snapshot,
    course: { ...snapshot.course, tick: -1 },
  })).code, 'invalid-snapshot');
  assert.equal(decodeServerRoomFrame(JSON.stringify({
    ...snapshot,
    players: [snapshot.players[0], { ...snapshot.players[0] }],
  })).code, 'duplicate-player');

  const players = Array.from(
    { length: ROOM_PROTOCOL_LIMITS.maxPlayers + 1 },
    (_, index) => ({
      ...snapshot.players[0],
      id: `p-player-${index}`,
    }),
  );
  assert.equal(decodeServerRoomFrame(JSON.stringify({
    ...snapshot,
    players,
  })).code, 'too-many-players');
  assert.equal(
    decodeServerRoomFrame('界'.repeat(ROOM_PROTOCOL_LIMITS.serverMessageBytes)).code,
    'message-too-large',
  );
});

function createFlatEnvironment() {
  return {
    bounds: 40,
    sampleGround() {
      return { y: 0, box2: null };
    },
  };
}

function createInputTape(length = 480) {
  return Array.from({ length }, (_, tick) => ({
    dirX: tick < 180 ? 0.6 : tick < 320 ? -0.35 : 0,
    dirZ: tick < 320 ? -0.8 : 1,
    moving: tick < 420,
    jumpHeld: tick === 35 || tick === 36 || tick === 245,
    grabPressed: tick === 90 || tick === 330,
  }));
}

test('SkywaySimulation preserves direct fixed-step player behavior tick for tick', () => {
  const env = createFlatEnvironment();
  const simulation = createSkywaySimulationState({ x: 2, z: 3 });
  const direct = createPlayerState(2, 3);
  const inputs = createInputTape();

  for (const command of inputs) {
    stepSkywaySimulation(simulation, command, env);
    stepPlayer(direct, command, SKYWAY_FIXED_DT, env);
    assert.deepEqual(simulation.player, direct);
  }

  assert.equal(simulation.version, SKYWAY_SIMULATION_VERSION);
  assert.equal(simulation.tick, inputs.length);
  assert.equal(simulation.time, inputs.length * SKYWAY_FIXED_DT);
});

test('SkywaySimulation replay is deterministic and snapshots are detached', () => {
  const inputs = createInputTape();
  const first = replaySkywaySimulation({ x: -1, z: 3, inputs, env: createFlatEnvironment() });
  const second = replaySkywaySimulation({ x: -1, z: 3, inputs, env: createFlatEnvironment() });
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), second);

  const simulation = createSkywaySimulationState();
  stepSkywaySimulation(simulation, inputs[0], createFlatEnvironment());
  const detached = snapshotSkywaySimulation(simulation);
  detached.player.pos.x = 999;
  assert.notEqual(simulation.player.pos.x, 999);

  const changed = [...inputs];
  changed[120] = { ...changed[120], dirX: 1 };
  assert.notDeepEqual(
    first,
    replaySkywaySimulation({ x: -1, z: 3, inputs: changed, env: createFlatEnvironment() }),
  );
});

test('SkywaySimulation maps validated room controls to world-space simulation input', () => {
  assert.deepEqual(skywayInputFromControl({
    mx: 0.6,
    my: -0.8,
    jump: true,
    grab: false,
  }), {
    dirX: 0.6,
    dirZ: -0.8,
    moving: true,
    jumpHeld: true,
    grabPressed: false,
  });
  const clamped = skywayInputFromControl({ mx: 2, my: 2, jump: false, grab: true });
  assert.ok(Math.hypot(clamped.dirX, clamped.dirZ) <= 1);
  assert.equal(clamped.grabPressed, true);
});

test('room reconciliation replaces impossible prediction drift and adopts authoritative race state', () => {
  const simulation = createSkywaySimulationState();
  const race = {
    cp: 0,
    falls: 1,
    finished: false,
    place: 0,
    finishTime: 0,
  };
  const outcome = reconcileRoomPlayer({
    x: 4,
    y: 0,
    z: -59,
    yaw: Math.PI / 2,
    checkpoint: 1,
    falls: 2,
    finished: false,
    place: 0,
    finishTime: 0,
  }, simulation.player, race);
  assert.equal(outcome.fell, true);
  assert.ok(outcome.correction > 1.2);
  assert.deepEqual(simulation.player.pos, { x: 4, y: 0, z: -59 });
  assert.equal(race.cp, 1);
  assert.equal(race.falls, 2);
  assert.equal(race.finished, false);
});
