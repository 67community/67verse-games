import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createSkywayRoomAuthority } from '../src/server/skyway-room-authority.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4174;
const ROOM_PATH = /^\/ws\/([a-z0-9-]{3,24})$/i;

export async function startLocalSkywayServer({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  maxPlayers,
} = {}) {
  const authority = createSkywayRoomAuthority({ maxPlayers });
  const webSockets = new WebSocketServer({ noServer: true });
  const server = http.createServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify({
        ok: true,
        service: '67verse-local-skyway',
        scope: 'development-only',
      }));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Local Skyway development server');
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || host}`);
    const match = ROOM_PATH.exec(url.pathname);
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSockets.emit('connection', webSocket, request, match[1].toLowerCase());
    });
  });

  webSockets.on('connection', (socket, _request, roomId) => {
    const connection = authority.attachConnection({
      send(text) {
        if (socket.readyState === socket.OPEN) socket.send(text);
      },
      close(code, reason) {
        if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
          socket.close(code, reason);
        }
      },
    }, roomId);
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(1003, 'Text frames only');
        return;
      }
      connection.receive(data.toString());
    });
    socket.on('close', () => connection.close());
  });

  const timer = setInterval(() => authority.step(), authority.fixedDt * 1000);
  timer.unref?.();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const resolvedPort = address && typeof address === 'object' ? address.port : port;

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    authority.stop();
    for (const client of webSockets.clients) client.terminate();
    webSockets.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return {
    host,
    port: resolvedPort,
    url: `ws://${host}:${resolvedPort}`,
    authority,
    stop,
  };
}

async function main() {
  const portArg = Number.parseInt(process.env.SKYWAY_LOCAL_PORT || '', 10);
  const local = await startLocalSkywayServer({
    port: Number.isInteger(portArg) ? portArg : DEFAULT_PORT,
  });
  console.log(
    `[67VERSE] Local-only Skyway room server: ${local.url} `
    + '(open the game with ?online=1)',
  );

  const shutdown = async () => {
    await local.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
