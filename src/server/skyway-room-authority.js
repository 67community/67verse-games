import { createRateLimiter } from '../core/guard.js';
import {
  decodeClientRoomFrame,
  encodeServerRoomFrame,
  ROOM_PROTOCOL_LIMITS,
  ROOM_PROTOCOL_VERSION,
} from '../core/room-protocol.js';
import {
  createSkywayCourseSimulation,
  sampleSkywayCourseGround,
  startSkywayRace,
  stepSkywayCourseClock,
  stepSkywayCourseParticipant,
} from '../core/skyway-course-simulation.js';
import {
  SKYWAY_LEVEL_DESCRIPTION,
  SKYWAY_WORLD_BOUND,
} from '../core/skyway-level.js';
import {
  createSkywaySimulationState,
  SKYWAY_FIXED_DT,
  skywayInputFromControl,
  stepSkywaySimulation,
} from '../core/skyway-simulation.js';

const ROOM_ID_PATTERN = /^[a-z0-9-]{3,24}$/i;
const EMPTY_CONTROL = Object.freeze({
  mx: 0,
  my: 0,
  jump: false,
  grab: false,
  seq: 0,
});

function createSkywayEnvironment(course) {
  return {
    bounds: SKYWAY_WORLD_BOUND,
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

function spawnForIndex(index) {
  const columns = [-3, -1, 1, 3];
  return {
    x: columns[index % columns.length],
    z: 3 + Math.floor(index / columns.length) * 1.5,
  };
}

function sendFrame(connection, message) {
  const encoded = encodeServerRoomFrame(message);
  if (!encoded.ok) return false;
  connection.send(encoded.text);
  return true;
}

function sendError(connection, error) {
  sendFrame(connection, {
    v: ROOM_PROTOCOL_VERSION,
    type: 'error',
    error,
  });
}

/**
 * Minimal in-memory authority for localhost development only.
 *
 * It intentionally has no accounts, persistence, rewards, matchmaking, chat,
 * payments, or production transport assumptions. Connections are trusted only
 * as byte pipes: every accepted frame still passes RoomProtocol validation.
 */
export function createSkywayRoomAuthority({
  maxPlayers = ROOM_PROTOCOL_LIMITS.maxPlayers,
  snapshotEveryTicks = 6,
  now,
} = {}) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > ROOM_PROTOCOL_LIMITS.maxPlayers) {
    throw new RangeError(`maxPlayers must be between 1 and ${ROOM_PROTOCOL_LIMITS.maxPlayers}`);
  }
  if (!Number.isInteger(snapshotEveryTicks) || snapshotEveryTicks < 1) {
    throw new RangeError('snapshotEveryTicks must be a positive integer');
  }

  const rooms = new Map();
  const connections = new Set();
  let tick = 0;
  let stopped = false;

  function getRoom(roomId) {
    let room = rooms.get(roomId);
    if (!room) {
      const course = createSkywayCourseSimulation(SKYWAY_LEVEL_DESCRIPTION);
      startSkywayRace(course);
      room = {
        id: roomId,
        players: new Map(),
        course,
        environment: createSkywayEnvironment(course),
      };
      rooms.set(roomId, room);
    }
    return room;
  }

  function snapshot(room) {
    return {
      v: ROOM_PROTOCOL_VERSION,
      type: 'snapshot',
      course: {
        tick: room.course.tick,
        phase: room.course.phase,
        raceTime: room.course.raceTime,
      },
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        x: player.simulation.player.pos.x,
        y: player.simulation.player.pos.y,
        z: player.simulation.player.pos.z,
        yaw: player.simulation.player.yaw,
        seq: player.lastSeq,
        checkpoint: player.race.cp,
        finished: player.race.finished,
        place: player.race.place,
        finishTime: player.race.finishTime,
        falls: player.race.falls,
      })),
    };
  }

  function broadcast(room) {
    const frame = snapshot(room);
    for (const player of room.players.values()) sendFrame(player.connection, frame);
  }

  function leave(state) {
    if (state.closed) return;
    state.closed = true;
    connections.delete(state);
    if (!state.player || !state.room) return;
    state.room.players.delete(state.player.id);
    if (state.room.players.size === 0) {
      rooms.delete(state.room.id);
    } else {
      broadcast(state.room);
    }
    state.player = null;
    state.room = null;
  }

  function attachConnection(connection, roomId) {
    if (stopped) throw new Error('Skyway authority is stopped');
    if (
      !connection ||
      typeof connection.send !== 'function' ||
      typeof connection.close !== 'function'
    ) {
      throw new TypeError('connection must provide send(text) and close(code, reason)');
    }
    if (typeof roomId !== 'string' || !ROOM_ID_PATTERN.test(roomId)) {
      sendError(connection, 'Invalid room');
      connection.close(1008, 'Invalid room');
      return { receive() {}, close() {} };
    }

    const state = {
      connection,
      roomId: roomId.toLowerCase(),
      room: null,
      player: null,
      closed: false,
      limiter: createRateLimiter({ rate: 30, burst: 12, ...(now ? { now } : {}) }),
    };
    connections.add(state);

    function receive(raw) {
      if (state.closed) return false;
      const decoded = decodeClientRoomFrame(raw);
      if (!decoded.ok) {
        sendError(connection, `Rejected frame: ${decoded.code}`);
        return false;
      }
      const message = decoded.message;

      if (message.type === 'join') {
        if (state.player) {
          sendError(connection, 'Already joined');
          return false;
        }
        const room = getRoom(state.roomId);
        if (room.players.size >= maxPlayers) {
          sendError(connection, 'Room full');
          connection.close(1008, 'Room full');
          leave(state);
          return false;
        }
        if (room.players.has(message.playerId)) {
          sendError(connection, 'Player already present');
          connection.close(1008, 'Duplicate player');
          leave(state);
          return false;
        }
        const spawn = spawnForIndex(room.players.size);
        state.room = room;
        state.player = {
          id: message.playerId,
          name: message.name,
          connection,
          simulation: createSkywaySimulationState(spawn),
          race: {
            cp: 0,
            finished: false,
            place: 0,
            finishTime: 0,
            knockCd: 0,
            stun: 0,
            falls: 0,
            usedShortcut: false,
          },
          control: { ...EMPTY_CONTROL },
          lastSeq: 0,
        };
        room.players.set(state.player.id, state.player);
        // The first snapshot is also the join acknowledgement. The browser
        // stays in "connecting" until it sees its own validated player id.
        broadcast(room);
        return true;
      }

      if (!state.player) {
        sendError(connection, 'Join required');
        return false;
      }
      if (!state.limiter.take()) {
        sendError(connection, 'Input rate exceeded');
        return false;
      }
      if (message.input.seq <= state.player.lastSeq) return false;
      state.player.control = message.input;
      state.player.lastSeq = message.input.seq;
      return true;
    }

    return {
      receive,
      close() {
        leave(state);
      },
    };
  }

  function step() {
    if (stopped) return;
    tick += 1;
    for (const room of rooms.values()) {
      stepSkywayCourseClock(room.course);
      for (const player of room.players.values()) {
        player.race.stun = Math.max(0, player.race.stun - SKYWAY_FIXED_DT);
        stepSkywaySimulation(
          player.simulation,
          player.race.stun > 0
            ? skywayInputFromControl(EMPTY_CONTROL)
            : skywayInputFromControl(player.control),
          room.environment,
        );
        stepSkywayCourseParticipant(
          room.course,
          player.race,
          player.simulation.player,
          { isPlayer: true },
        );
        player.control.grab = false;
      }
      if (tick % snapshotEveryTicks === 0) broadcast(room);
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    for (const state of [...connections]) {
      state.connection.close(1001, 'Local Skyway server stopped');
      leave(state);
    }
    rooms.clear();
  }

  return {
    attachConnection,
    step,
    stop,
    get roomCount() { return rooms.size; },
    get connectionCount() { return connections.size; },
    inspectRoom(roomId) {
      const room = rooms.get(String(roomId).toLowerCase());
      return room ? snapshot(room) : null;
    },
    fixedDt: SKYWAY_FIXED_DT,
  };
}
