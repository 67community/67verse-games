import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import WebSocket from 'ws';
import {
  decodeServerRoomFrame,
  encodeClientRoomFrame,
  ROOM_PROTOCOL_VERSION,
} from '../src/core/room-protocol.js';
import { createSkywayRoomAuthority } from '../src/server/skyway-room-authority.js';
import { startLocalSkywayServer } from '../scripts/local-skyway-server.mjs';

const runningServers = new Set();

afterEach(async () => {
  await Promise.all([...runningServers].map((server) => server.stop()));
  runningServers.clear();
});

function clientFrame(message) {
  const encoded = encodeClientRoomFrame({
    v: ROOM_PROTOCOL_VERSION,
    ...message,
  });
  assert.equal(encoded.ok, true);
  return encoded.text;
}

function createFakeConnection() {
  return {
    sent: [],
    closed: [],
    send(text) {
      const decoded = decodeServerRoomFrame(text);
      assert.equal(decoded.ok, true);
      this.sent.push(decoded.message);
    },
    close(code, reason) {
      this.closed.push({ code, reason });
    },
  };
}

function joinFrame(id, name = id) {
  return clientFrame({ type: 'join', playerId: id, name });
}

function inputFrame(seq, overrides = {}) {
  return clientFrame({
    type: 'input',
    input: {
      mx: 0,
      my: -1,
      jump: false,
      grab: false,
      seq,
      ...overrides,
    },
  });
}

test('local authority joins named rooms, advances validated input, snapshots, and leaves', () => {
  const authority = createSkywayRoomAuthority({ snapshotEveryTicks: 1 });
  const firstConnection = createFakeConnection();
  const secondConnection = createFakeConnection();
  const first = authority.attachConnection(firstConnection, 'skyway-test');
  const second = authority.attachConnection(secondConnection, 'skyway-test');

  assert.equal(first.receive(joinFrame('p-local-a', 'A!')), true);
  assert.equal(second.receive(joinFrame('p-local-b', 'B')), true);
  assert.equal(authority.roomCount, 1);
  assert.deepEqual(
    authority.inspectRoom('skyway-test').players.map((player) => player.id),
    ['p-local-a', 'p-local-b'],
  );

  const before = authority.inspectRoom('skyway-test')
    .players.find((player) => player.id === 'p-local-a');
  assert.equal(first.receive(inputFrame(1)), true);
  for (let tick = 0; tick < 24; tick += 1) authority.step();
  const after = authority.inspectRoom('skyway-test')
    .players.find((player) => player.id === 'p-local-a');
  assert.ok(after.z < before.z, 'authoritative fixed-step input should move the player');
  assert.equal(after.seq, 1);
  assert.equal(after.checkpoint, 0);
  assert.equal(after.finished, false);
  assert.equal(secondConnection.sent.at(-1).course.phase, 'racing');
  assert.equal(secondConnection.sent.at(-1).type, 'snapshot');
  assert.equal(secondConnection.sent.at(-1).players.length, 2);

  first.close();
  assert.deepEqual(
    secondConnection.sent.at(-1).players.map((player) => player.id),
    ['p-local-b'],
  );
  second.close();
  assert.equal(authority.roomCount, 0);
  assert.equal(authority.connectionCount, 0);
  authority.stop();
});

test('course authority alone advances checkpoints and rejects client checkpoint or finish claims', () => {
  let now = 0;
  const authority = createSkywayRoomAuthority({
    snapshotEveryTicks: 6,
    now: () => now,
  });
  const connection = createFakeConnection();
  const observerConnection = createFakeConnection();
  const player = authority.attachConnection(connection, 'course-truth');
  const observer = authority.attachConnection(observerConnection, 'course-truth');
  assert.equal(player.receive(joinFrame('p-course-truth')), true);
  assert.equal(observer.receive(joinFrame('p-course-observer')), true);

  const claimed = JSON.stringify({
    v: ROOM_PROTOCOL_VERSION,
    type: 'input',
    input: {
      mx: 0,
      my: -1,
      jump: false,
      grab: false,
      seq: 1,
      checkpoint: 3,
      finished: true,
    },
  });
  assert.equal(player.receive(claimed), false);
  assert.equal(observer.receive(JSON.stringify({
    ...JSON.parse(claimed),
    input: { ...JSON.parse(claimed).input, seq: 2 },
  })), false);
  let snapshot = authority.inspectRoom('course-truth');
  for (const coursePlayer of snapshot.players) {
    assert.equal(coursePlayer.checkpoint, 0);
    assert.equal(coursePlayer.finished, false);
    assert.equal(coursePlayer.place, 0);
  }

  assert.equal(player.receive(inputFrame(2, { mx: 0, my: -1 })), true);
  for (let tick = 0; tick < 800; tick += 1) {
    now += 1000 / 60;
    authority.step();
  }
  snapshot = authority.inspectRoom('course-truth');
  assert.ok(snapshot.players[0].checkpoint >= 1, 'valid course movement should bank checkpoint one');
  assert.equal(snapshot.players[0].finished, false);
  assert.equal(snapshot.players[0].place, 0);
  assert.ok(snapshot.course.raceTime > 0);
  player.close();
  observer.close();
  authority.stop();
});

test('valid bounded controls can produce an authoritative checkpointed finish result', () => {
  let now = 0;
  let sequence = 0;
  const authority = createSkywayRoomAuthority({
    snapshotEveryTicks: 6,
    now: () => now,
  });
  const connection = createFakeConnection();
  const player = authority.attachConnection(connection, 'course-finish');
  assert.equal(player.receive(joinFrame('p-course-finish')), true);
  const waypoints = [
    [0, -8], [0, -23], [0, -34], [3.4, -43], [-3.4, -52], [0, -59],
    [0, -68], [0, -76], [0, -85], [0, -93], [-0.8, -99], [0.8, -105.4],
    [-0.8, -111.8], [0.8, -118.2], [0, -124], [3, -139], [-3, -155], [0, -167],
  ];
  let waypoint = 0;
  let result = authority.inspectRoom('course-finish').players[0];
  for (let tick = 0; tick < 10_000 && !result.finished; tick += 1) {
    now += 1000 / 60;
    let [targetX, targetZ] = waypoints[waypoint];
    let dx = targetX - result.x;
    let dz = targetZ - result.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 1.1 && waypoint < waypoints.length - 1) {
      waypoint += 1;
      [targetX, targetZ] = waypoints[waypoint];
      dx = targetX - result.x;
      dz = targetZ - result.z;
      distance = Math.hypot(dx, dz);
    }
    if (tick % 3 === 0) {
      assert.equal(player.receive(inputFrame(++sequence, {
        mx: dx / (distance || 1) * 0.84,
        my: dz / (distance || 1) * 0.84,
        jump: tick % 36 < 3,
      })), true);
    }
    authority.step();
    result = authority.inspectRoom('course-finish').players[0];
  }
  const snapshot = authority.inspectRoom('course-finish');
  assert.equal(result.checkpoint, 3);
  assert.equal(result.finished, true);
  assert.equal(result.place, 1);
  assert.ok(result.finishTime > 0);
  assert.equal(snapshot.course.phase, 'finished');
  assert.ok(snapshot.course.raceTime >= result.finishTime);
  player.close();
  authority.stop();
});

test('local authority rejects pre-join input, duplicate sequence, capacity overflow, and duplicate ids', () => {
  const authority = createSkywayRoomAuthority({ maxPlayers: 1, snapshotEveryTicks: 1 });
  const firstConnection = createFakeConnection();
  const waitingConnection = createFakeConnection();
  const first = authority.attachConnection(firstConnection, 'capacity');
  const waiting = authority.attachConnection(waitingConnection, 'capacity');

  assert.equal(first.receive(inputFrame(1)), false);
  assert.equal(firstConnection.sent.at(-1).error, 'Join required');
  assert.equal(first.receive(joinFrame('p-capacity-a')), true);
  assert.equal(first.receive(inputFrame(5)), true);
  assert.equal(first.receive(inputFrame(5)), false);
  assert.equal(waiting.receive(joinFrame('p-capacity-b')), false);
  assert.equal(waitingConnection.sent.at(-1).error, 'Room full');
  assert.equal(waitingConnection.closed.at(-1).code, 1008);

  first.close();
  const duplicateAConnection = createFakeConnection();
  const duplicateBConnection = createFakeConnection();
  const duplicateA = authority.attachConnection(duplicateAConnection, 'duplicates');
  const duplicateB = authority.attachConnection(duplicateBConnection, 'duplicates');
  assert.equal(duplicateA.receive(joinFrame('p-duplicate')), true);
  // Capacity is checked before duplicate identity when maxPlayers is one.
  assert.equal(duplicateB.receive(joinFrame('p-duplicate')), false);
  assert.equal(duplicateBConnection.sent.at(-1).error, 'Room full');
  authority.stop();
});

function openClient(url, id) {
  const socket = new WebSocket(url);
  const messages = [];
  let resolveMessage;
  socket.on('message', (raw) => {
    const decoded = decodeServerRoomFrame(raw.toString());
    if (!decoded.ok) return;
    messages.push(decoded.message);
    resolveMessage?.();
    resolveMessage = null;
  });
  return {
    socket,
    messages,
    async join() {
      if (socket.readyState !== WebSocket.OPEN) {
        await new Promise((resolve, reject) => {
          socket.once('open', resolve);
          socket.once('error', reject);
        });
      }
      socket.send(joinFrame(id, id));
      await this.waitFor((message) => (
        message.type === 'snapshot'
        && message.players.some((player) => player.id === id)
      ));
    },
    sendInput(seq, overrides) {
      socket.send(inputFrame(seq, overrides));
    },
    async waitFor(predicate, timeoutMs = 2000) {
      const existing = messages.find(predicate);
      if (existing) return existing;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await Promise.race([
          new Promise((resolve) => { resolveMessage = resolve; }),
          new Promise((resolve) => setTimeout(resolve, 50)),
        ]);
        const found = messages.find(predicate);
        if (found) return found;
      }
      throw new Error(`Timed out waiting for local room message for ${id}`);
    },
    close() {
      socket.close();
    },
  };
}

test('two isolated WebSocket sessions see each other move through the local-only server', async () => {
  const local = await startLocalSkywayServer({ port: 0 });
  runningServers.add(local);
  const roomUrl = `${local.url}/ws/browser-proof`;
  const first = openClient(roomUrl, 'p-browser-a');
  const second = openClient(roomUrl, 'p-browser-b');

  await first.join();
  await second.join();
  const shared = await first.waitFor((message) => (
    message.type === 'snapshot' && message.players.length === 2
  ));
  const start = shared.players.find((player) => player.id === 'p-browser-b');
  second.sendInput(1, { mx: 1, my: 0 });
  const moved = await first.waitFor((message) => {
    if (message.type !== 'snapshot') return false;
    const remote = message.players.find((player) => player.id === 'p-browser-b');
    return remote && remote.x > start.x + 0.02 && remote.seq === 1;
  });
  assert.equal(moved.players.length, 2);

  second.close();
  await first.waitFor((message) => (
    message.type === 'snapshot'
    && message.players.length === 1
    && message.players[0].id === 'p-browser-a'
  ));
  first.close();

  await local.stop();
  runningServers.delete(local);
  assert.equal(local.authority.roomCount, 0);
  assert.equal(local.authority.connectionCount, 0);
});
