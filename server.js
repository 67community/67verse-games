import { DurableObject } from 'cloudflare:workers';
import {
  decodeClientRoomFrame,
  encodeServerRoomFrame,
  ROOM_PROTOCOL_LIMITS,
  ROOM_PROTOCOL_VERSION,
} from './src/core/room-protocol.js';

const MAX_PLAYERS = ROOM_PROTOCOL_LIMITS.maxPlayers;
const INPUT_RATE = 30;
const INPUT_BURST = 12;
const SPEED = 6;
const BOUNDS = 100;
const TICK_MS = 50;

export class GameServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.sockets = new Map();
    this.timer = null;
    this.lastTick = Date.now();
    this.broadcastClock = 0;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('67VERSE Skyway room', { status: 200 });
    }
    if (this.sockets.size >= MAX_PLAYERS) {
      return new Response('Room full', { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    let playerId = '';
    server.addEventListener('message', (event) => {
      const decoded = decodeClientRoomFrame(event.data);
      if (!decoded.ok) {
        this.sendFrame(server, {
          v: ROOM_PROTOCOL_VERSION,
          type: 'error',
          error: decoded.code === 'invalid-json' ? 'Invalid JSON' : 'Invalid message',
        });
        return;
      }
      const message = decoded.message;

      if (message.type === 'join') {
        const nextId = message.playerId;
        if (!nextId || (this.sockets.has(nextId) && this.sockets.get(nextId) !== server)) {
          this.sendFrame(server, {
            v: ROOM_PROTOCOL_VERSION,
            type: 'error',
            error: 'Invalid identity',
          });
          return;
        }
        playerId = nextId;
        this.sockets.set(playerId, server);
        if (!this.players.has(playerId)) {
          const lane = this.players.size - (MAX_PLAYERS - 1) / 2;
          this.players.set(playerId, {
            id: playerId,
            name: message.name,
            x: lane * 1.15,
            z: 3,
            yaw: Math.PI,
            mx: 0,
            my: 0,
            seq: 0,
            tokens: INPUT_BURST,
            tokenAt: Date.now(),
          });
        }
        this.startTicking();
        this.broadcast();
        return;
      }

      if (message.type === 'input' && playerId) {
        const player = this.players.get(playerId);
        const input = message.input;
        if (!player || !input || input.seq <= player.seq || !this.takeToken(player)) {
          this.sendFrame(server, {
            v: ROOM_PROTOCOL_VERSION,
            type: 'error',
            error: 'Input rejected',
          });
          return;
        }
        player.mx = input.mx;
        player.my = input.my;
        player.seq = input.seq;
      }
    });

    const close = () => {
      if (!playerId) return;
      this.sockets.delete(playerId);
      this.players.delete(playerId);
      playerId = '';
      this.broadcast();
      if (!this.sockets.size) this.stopTicking();
    };
    server.addEventListener('close', close);
    server.addEventListener('error', close);

    return new Response(null, { status: 101, webSocket: client });
  }

  sendFrame(socket, message) {
    const encoded = encodeServerRoomFrame(message);
    if (!encoded.ok) return false;
    socket.send(encoded.text);
    return true;
  }

  takeToken(player) {
    const now = Date.now();
    player.tokens = Math.min(
      INPUT_BURST,
      player.tokens + Math.max(0, now - player.tokenAt) * INPUT_RATE / 1000,
    );
    player.tokenAt = now;
    if (player.tokens < 1) return false;
    player.tokens -= 1;
    return true;
  }

  startTicking() {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stopTicking() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    for (const player of this.players.values()) {
      player.x = Math.max(-BOUNDS, Math.min(BOUNDS, player.x + player.mx * SPEED * dt));
      player.z = Math.max(-BOUNDS, Math.min(BOUNDS, player.z + player.my * SPEED * dt));
      if (Math.hypot(player.mx, player.my) > 0.01) {
        player.yaw = Math.atan2(player.mx, player.my);
      }
    }
    this.broadcastClock += dt;
    if (this.broadcastClock >= 0.1) {
      this.broadcastClock = 0;
      this.broadcast();
    }
  }

  broadcast() {
    const encoded = encodeServerRoomFrame({
      v: ROOM_PROTOCOL_VERSION,
      type: 'snapshot',
      players: [...this.players.values()].map(({ id, name, x, z, yaw, seq }) => ({
        id, name, x, z, yaw, seq,
      })),
    });
    if (!encoded.ok) return;
    for (const [id, socket] of this.sockets) {
      try {
        socket.send(encoded.text);
      } catch {
        this.sockets.delete(id);
        this.players.delete(id);
      }
    }
  }
}
