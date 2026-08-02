import { normalizeControlMessage, sanitizePlayerName } from './guard.js';

export const ROOM_PROTOCOL_VERSION = 1;

export const ROOM_PROTOCOL_LIMITS = Object.freeze({
  clientMessageBytes: 512,
  serverMessageBytes: 16_384,
  maxPlayers: 8,
});

const JOIN_KEYS = new Set(['v', 'type', 'playerId', 'name']);
const INPUT_KEYS = new Set(['v', 'type', 'input']);
const CONTROL_KEYS = new Set(['mx', 'my', 'jump', 'grab', 'seq']);
const SNAPSHOT_KEYS = new Set(['v', 'type', 'course', 'players']);
const SNAPSHOT_COURSE_KEYS = new Set(['tick', 'phase', 'raceTime']);
const ERROR_KEYS = new Set(['v', 'type', 'error']);
const SNAPSHOT_PLAYER_KEYS = new Set([
  'id',
  'name',
  'x',
  'y',
  'z',
  'yaw',
  'seq',
  'checkpoint',
  'finished',
  'place',
  'finishTime',
  'falls',
]);
const PLAYER_ID_PATTERN = /^p-[a-z0-9-]{4,32}$/i;
const encoder = new TextEncoder();

function failure(code) {
  return { ok: false, code };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function cleanPlayerId(value) {
  return typeof value === 'string' && PLAYER_ID_PATTERN.test(value) ? value : '';
}

function normalizeSequence(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000_000
    ? value
    : null;
}

function normalizeClientMessage(message) {
  if (!isRecord(message)) return failure('invalid-frame');
  if (message.v !== ROOM_PROTOCOL_VERSION) return failure('unsupported-version');

  if (message.type === 'join') {
    if (!hasExactKeys(message, JOIN_KEYS)) return failure('invalid-frame');
    const playerId = cleanPlayerId(message.playerId);
    if (!playerId || typeof message.name !== 'string') return failure('invalid-join');
    return {
      ok: true,
      message: {
        v: ROOM_PROTOCOL_VERSION,
        type: 'join',
        playerId,
        name: sanitizePlayerName(message.name),
      },
    };
  }

  if (message.type === 'input') {
    if (!hasExactKeys(message, INPUT_KEYS)) return failure('invalid-frame');
    if (
      !hasExactKeys(message.input, CONTROL_KEYS) ||
      typeof message.input.mx !== 'number' ||
      typeof message.input.my !== 'number' ||
      typeof message.input.jump !== 'boolean' ||
      typeof message.input.grab !== 'boolean' ||
      normalizeSequence(message.input.seq) === null
    ) {
      return failure('invalid-input');
    }
    const input = normalizeControlMessage(message.input);
    if (!input) return failure('invalid-input');
    return {
      ok: true,
      message: { v: ROOM_PROTOCOL_VERSION, type: 'input', input },
    };
  }

  return failure('unknown-type');
}

function normalizeSnapshotPlayer(value) {
  if (!hasExactKeys(value, SNAPSHOT_PLAYER_KEYS)) return null;
  const id = cleanPlayerId(value.id);
  const seq = normalizeSequence(value.seq);
  if (
    !id ||
    typeof value.name !== 'string' ||
    seq === null ||
    ![value.x, value.y, value.z, value.yaw, value.finishTime].every(Number.isFinite) ||
    ![value.checkpoint, value.place, value.falls].every(Number.isInteger) ||
    value.checkpoint < 0 ||
    value.checkpoint > 64 ||
    value.place < 0 ||
    value.place > ROOM_PROTOCOL_LIMITS.maxPlayers ||
    value.falls < 0 ||
    value.falls > 1_000_000 ||
    typeof value.finished !== 'boolean' ||
    value.finishTime < 0 ||
    (value.finished ? value.place < 1 : value.place !== 0 || value.finishTime !== 0)
  ) {
    return null;
  }
  return {
    id,
    name: sanitizePlayerName(value.name),
    x: value.x,
    y: value.y,
    z: value.z,
    yaw: value.yaw,
    seq,
    checkpoint: value.checkpoint,
    finished: value.finished,
    place: value.place,
    finishTime: value.finishTime,
    falls: value.falls,
  };
}

function normalizeSnapshotCourse(value) {
  if (
    !hasExactKeys(value, SNAPSHOT_COURSE_KEYS) ||
    !Number.isInteger(value.tick) ||
    value.tick < 0 ||
    !['countdown', 'racing', 'finished'].includes(value.phase) ||
    !Number.isFinite(value.raceTime) ||
    value.raceTime < 0
  ) {
    return null;
  }
  return {
    tick: value.tick,
    phase: value.phase,
    raceTime: value.raceTime,
  };
}

function normalizeServerMessage(message) {
  if (!isRecord(message)) return failure('invalid-frame');
  if (message.v !== ROOM_PROTOCOL_VERSION) return failure('unsupported-version');

  if (message.type === 'snapshot') {
    if (!hasExactKeys(message, SNAPSHOT_KEYS) || !Array.isArray(message.players)) {
      return failure('invalid-snapshot');
    }
    const course = normalizeSnapshotCourse(message.course);
    if (!course) return failure('invalid-snapshot');
    if (message.players.length > ROOM_PROTOCOL_LIMITS.maxPlayers) {
      return failure('too-many-players');
    }
    const players = message.players.map(normalizeSnapshotPlayer);
    if (players.some((player) => !player)) return failure('invalid-snapshot');
    if (new Set(players.map((player) => player.id)).size !== players.length) {
      return failure('duplicate-player');
    }
    return {
      ok: true,
      message: { v: ROOM_PROTOCOL_VERSION, type: 'snapshot', course, players },
    };
  }

  if (message.type === 'error') {
    if (
      !hasExactKeys(message, ERROR_KEYS) ||
      typeof message.error !== 'string' ||
      message.error.length < 1 ||
      message.error.length > 120
    ) {
      return failure('invalid-error');
    }
    return {
      ok: true,
      message: { v: ROOM_PROTOCOL_VERSION, type: 'error', error: message.error },
    };
  }

  return failure('unknown-type');
}

function decode(raw, maxBytes, normalize) {
  if (typeof raw !== 'string') return failure('invalid-transport');
  if (encoder.encode(raw).byteLength > maxBytes) return failure('message-too-large');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure('invalid-json');
  }
  return normalize(parsed);
}

function encode(message, maxBytes, normalize) {
  const result = normalize(message);
  if (!result.ok) return result;
  const text = JSON.stringify(result.message);
  if (encoder.encode(text).byteLength > maxBytes) return failure('message-too-large');
  return { ...result, text };
}

export function decodeClientRoomFrame(raw) {
  return decode(raw, ROOM_PROTOCOL_LIMITS.clientMessageBytes, normalizeClientMessage);
}

export function encodeClientRoomFrame(message) {
  return encode(message, ROOM_PROTOCOL_LIMITS.clientMessageBytes, normalizeClientMessage);
}

export function decodeServerRoomFrame(raw) {
  return decode(raw, ROOM_PROTOCOL_LIMITS.serverMessageBytes, normalizeServerMessage);
}

export function encodeServerRoomFrame(message) {
  return encode(message, ROOM_PROTOCOL_LIMITS.serverMessageBytes, normalizeServerMessage);
}
