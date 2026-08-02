import { createRateLimiter, normalizeControlMessage, sanitizePlayerName } from './guard.js';
import {
  decodeServerRoomFrame,
  encodeClientRoomFrame,
  ROOM_PROTOCOL_VERSION,
} from './room-protocol.js';

const CONNECT_TIMEOUT_MS = 1400;
const SEND_HZ = 20;
const LOCAL_SKYWAY_PORT = 4174;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function roomFromLocation() {
  const params = new URLSearchParams(location.search);
  const requested = params.get('room');
  if (requested && /^[a-z0-9-]{3,24}$/i.test(requested)) return requested.toLowerCase();
  return 'skyway';
}

function socketUrl(roomId) {
  const params = new URLSearchParams(location.search);
  const requestedPort = Number.parseInt(params.get('skywayPort') || '', 10);
  const port = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535
    ? requestedPort
    : LOCAL_SKYWAY_PORT;
  const host = location.hostname === '::1' ? '[::1]' : location.hostname;
  return `ws://${host}:${port}/ws/${roomId}`;
}

export function createRoomSession({ profile, onStatus, onSnapshot } = {}) {
  const localPreview = LOCAL_HOSTS.has(location.hostname);
  const localRoomRequested = new URLSearchParams(location.search).get('online') === '1';
  // This adapter is intentionally a localhost development slice. Production
  // builds remain honest Echo Trials until a reviewed production service exists.
  const enabled = localPreview && localRoomRequested;
  const randomId = crypto.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const playerId = sessionStorage.getItem('67v.roomPlayer') ||
    `p-${randomId.slice(0, 8)}`;
  sessionStorage.setItem('67v.roomPlayer', playerId);

  let socket = null;
  let disposed = false;
  let status = 'echo';
  let lastSend = 0;
  let seq = 0;
  let connectTimer = 0;
  let reconnectTimer = 0;
  let connectionGeneration = 0;
  const limiter = createRateLimiter({ rate: 30, burst: 12 });

  function setStatus(next) {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  }

  function fallback({ retry = true } = {}) {
    if (disposed) return;
    connectionGeneration += 1;
    clearTimeout(connectTimer);
    clearTimeout(reconnectTimer);
    if (socket) {
      const closing = socket;
      socket = null;
      try { closing.close(); } catch {}
    }
    setStatus('echo');
    onSnapshot?.({
      v: ROOM_PROTOCOL_VERSION,
      type: 'snapshot',
      course: { tick: 0, phase: 'countdown', raceTime: 0 },
      players: [],
    });
    if (enabled && retry) {
      reconnectTimer = window.setTimeout(connect, 2500);
    }
  }

  function connect() {
    if (!enabled || disposed) {
      setStatus('echo');
      return;
    }
    const generation = ++connectionGeneration;
    setStatus('connecting');
    try {
      socket = new WebSocket(socketUrl(roomFromLocation()));
    } catch {
      fallback();
      return;
    }
    connectTimer = window.setTimeout(fallback, CONNECT_TIMEOUT_MS);
    socket.addEventListener('open', () => {
      if (disposed || generation !== connectionGeneration) return;
      clearTimeout(connectTimer);
      const encoded = encodeClientRoomFrame({
        v: ROOM_PROTOCOL_VERSION,
        type: 'join',
        playerId,
        name: sanitizePlayerName(profile?.name),
      });
      if (!encoded.ok) {
        fallback();
        return;
      }
      socket.send(encoded.text);
    });
    socket.addEventListener('message', (event) => {
      if (disposed || generation !== connectionGeneration) return;
      const decoded = decodeServerRoomFrame(event.data);
      if (!decoded.ok) return;
      if (decoded.message.type === 'snapshot') {
        if (!decoded.message.players.some((player) => player.id === playerId)) return;
        setStatus('local');
        onSnapshot?.(decoded.message);
      } else if (decoded.message.type === 'error') {
        // Policy/capacity/protocol errors require a deliberate new page entry;
        // do not hammer the local authority with an automatic reconnect loop.
        fallback({ retry: false });
      }
    });
    socket.addEventListener('close', () => {
      if (disposed || generation !== connectionGeneration) return;
      fallback();
    });
    socket.addEventListener('error', () => {
      if (disposed || generation !== connectionGeneration) return;
      fallback();
    });
  }

  function sendInput(frame) {
    if (status !== 'local' || !socket || socket.readyState !== WebSocket.OPEN) return false;
    const now = performance.now();
    if (now - lastSend < 1000 / SEND_HZ || !limiter.take()) return false;
    const command = normalizeControlMessage({
      mx: frame.mx,
      my: frame.my,
      jump: frame.jump === true,
      grab: frame.grab === true,
      seq: ++seq,
    });
    if (!command) return false;
    const encoded = encodeClientRoomFrame({
      v: ROOM_PROTOCOL_VERSION,
      type: 'input',
      input: command,
    });
    if (!encoded.ok) return false;
    lastSend = now;
    socket.send(encoded.text);
    return true;
  }

  connect();
  onStatus?.(status);

  return {
    get status() { return status; },
    get playerId() { return playerId; },
    sendInput,
    dispose() {
      disposed = true;
      connectionGeneration += 1;
      clearTimeout(connectTimer);
      clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }
    },
  };
}

export function reconcileRoomPlayer(authoritative, simulationPlayer, race) {
  const previousFalls = race.falls;
  const correction = Math.hypot(
    authoritative.x - simulationPlayer.pos.x,
    authoritative.y - simulationPlayer.pos.y,
    authoritative.z - simulationPlayer.pos.z,
  );
  const blend = correction > 1.2 ? 1 : 0.35;
  simulationPlayer.pos.x += (authoritative.x - simulationPlayer.pos.x) * blend;
  simulationPlayer.pos.y += (authoritative.y - simulationPlayer.pos.y) * blend;
  simulationPlayer.pos.z += (authoritative.z - simulationPlayer.pos.z) * blend;
  let yawDelta = authoritative.yaw - simulationPlayer.yaw;
  while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
  while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  simulationPlayer.yaw += yawDelta * blend;
  race.cp = authoritative.checkpoint;
  race.falls = authoritative.falls;
  race.finished = authoritative.finished;
  race.place = authoritative.place;
  race.finishTime = authoritative.finishTime;
  return {
    fell: authoritative.falls > previousFalls,
    finished: authoritative.finished,
    correction,
  };
}

export function presentRoomRacer(racer, checkpointColors, finishColor) {
  if (!racer.group) return;
  racer.group.userData.authoritativeCheckpoint = racer.checkpoint;
  racer.group.userData.authoritativeFinished = racer.finished;
  racer.group.traverse((object) => {
    if (!object.userData.rivalAccent || !object.material) return;
    const color = racer.finished
      ? finishColor
      : checkpointColors[racer.checkpoint % checkpointColors.length];
    object.material.color?.setHex(color);
    object.material.emissive?.setHex(color);
    object.material.emissiveIntensity = racer.finished ? 0.9 : 0.35;
  });
}

export function createRoomQaState(status, playerId, racers, course) {
  return {
    status,
    localPlayerId: playerId || null,
    remotes: [...racers].map(([id, racer]) => ({
      id,
      x: racer.target.x,
      y: racer.target.y,
      z: racer.target.z,
      yaw: racer.yaw,
      checkpoint: racer.checkpoint,
      finished: racer.finished,
      place: racer.place,
      finishTime: racer.finishTime,
      presentedCheckpoint: racer.group?.userData.authoritativeCheckpoint ?? null,
      presentedFinished: racer.group?.userData.authoritativeFinished ?? null,
    })),
    course,
  };
}
