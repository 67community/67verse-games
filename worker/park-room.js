// park-room.js — the realtime room behind 67 Park's shared map.
//
// The game itself ships as static files on GitHub Pages, which cannot hold a
// socket open, so the shared world lives here instead: one Durable Object per
// room, every connected player relayed to every other at a fixed tick.
//
// Identity comes from the caller's IP, because that is the only stable handle
// a friend-test has without accounts: the same phone on the same network
// always gets the same character and the same colour, and two friends on two
// phones never collide. Cloudflare gives the address in CF-Connecting-IP, so
// the client never sees anyone's address — only the character it resolved to.

// The picker's roster, minus the free starter so a room reads as a crowd of
// different faces rather than everyone wearing No. 67.
const KARAKTERLER = [
  'friendsie:fr_1.glb',
  'friendsie:fr_100.glb',
  'friendsie:fr_500.glb',
  'friendsie:fr_777.glb',
  'friendsie:fr_1000.glb',
  'friendsie:fr_2222.glb',
  'friendsie:fr_4242.glb',
  'friendsie:fr_8888.glb',
  'friendsie:fr_67.glb',
  'gorilla',
];

const ADLAR = [
  'Bay', 'Kite', 'Nova', 'Echo', 'Pixel', 'Comet', 'Sable', 'Wren',
  'Onyx', 'Juno', 'Riff', 'Vega', 'Koi', 'Lumen', 'Bolt', 'Marlow',
];

// FNV-1a: small, dependency-free and stable across restarts, which matters —
// a player who reloads has to come back as the same character.
function karma(metin) {
  let h = 0x811c9dc5;
  for (let i = 0; i < metin.length; i += 1) {
    h ^= metin.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// The character is seeded by the address, so a household reads as a group of
// distinct faces before anyone has picked anything. The fallback NAME is
// seeded by the connection instead: two phones behind one router were both
// landing on the same word, which made the room unreadable.
function kimlikCoz(ip, tohum) {
  const h = karma(`67park:${ip}`);
  const n = karma(`ad:${tohum}`);
  return {
    characterId: KARAKTERLER[h % KARAKTERLER.length],
    name: `${ADLAR[n % ADLAR.length]}${(n >>> 16) % 90 + 10}`,
  };
}

const TICK_MS = 80;          // 12.5 Hz outbound; the client interpolates
const SESSIZ_KOPAR_MS = 30000;
const ODA_SINIRI = 24;

export class ParkRoom {
  constructor(state) {
    this.state = state;
    this.oyuncular = new Map();   // ws -> { id, characterId, name, poz, sonGoruldu }
    this.zamanlayici = null;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    if (this.oyuncular.size >= ODA_SINIRI) {
      return new Response('room full', { status: 503 });
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'yerel';
    const pair = new WebSocketPair();
    this.baglan(pair[1], ip);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  baglan(ws, ip) {
    ws.accept();
    // The address seeds the LOOK, never the connection id. Two friends testing
    // from the same house share one public address, and an address-derived id
    // made the second one kick the first out of the room — which is exactly
    // the pair of phones this is built for. Every socket gets its own id.
    const id = `p${karma(`${ip}:${Date.now()}:${Math.random()}`).toString(36)}`;
    const kimlik = kimlikCoz(ip, id);
    // If the address's own character is already walking around, step along the
    // roster until a free one turns up, so a household reads as a group rather
    // than as one person cloned.
    const kullanilan = new Set([...this.oyuncular.values()].map((v) => v.characterId));
    let characterId = kimlik.characterId;
    if (kullanilan.has(characterId)) {
      const bas = KARAKTERLER.indexOf(characterId);
      for (let adim = 1; adim <= KARAKTERLER.length; adim += 1) {
        const aday = KARAKTERLER[(bas + adim) % KARAKTERLER.length];
        if (!kullanilan.has(aday)) { characterId = aday; break; }
      }
    }
    const kayit = {
      id,
      characterId,
      name: kimlik.name,
      poz: { x: 0, y: 0, z: 8, yaw: Math.PI, hiz: 0, board: false },
      sonGoruldu: Date.now(),
    };
    this.oyuncular.set(ws, kayit);

    ws.send(JSON.stringify({ t: 'hos-geldin', self: { id, characterId, name: kimlik.name } }));

    ws.addEventListener('message', (event) => {
      const kendi = this.oyuncular.get(ws);
      if (!kendi) return;
      kendi.sonGoruldu = Date.now();
      let mesaj;
      try { mesaj = JSON.parse(event.data); } catch { return; }
      // A player who picked a character and typed a name owns both; the
      // address-derived pair is only the fallback for someone who has not.
      if (mesaj?.t === 'kimlik') {
        if (typeof mesaj.name === 'string') {
          const temiz = mesaj.name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
          if (temiz.length >= 2) kendi.name = temiz;
        }
        if (typeof mesaj.characterId === 'string' && KARAKTERLER.includes(mesaj.characterId)) {
          kendi.characterId = mesaj.characterId;
        }
        return;
      }
      if (mesaj?.t !== 'poz') return;
      const { x, y, z, yaw, hiz, board } = mesaj;
      // Anything off the map or not a number is dropped rather than relayed —
      // one bad client must not be able to teleport everyone's view.
      if (![x, y, z, yaw].every((n) => typeof n === 'number' && Number.isFinite(n))) return;
      if (Math.abs(x) > 400 || Math.abs(z) > 400 || y < -50 || y > 200) return;
      kendi.poz = {
        x, y, z, yaw,
        hiz: Number.isFinite(hiz) ? Math.max(0, Math.min(20, hiz)) : 0,
        board: Boolean(board),
      };
    });

    const kapat = () => {
      this.oyuncular.delete(ws);
      if (this.oyuncular.size === 0 && this.zamanlayici) {
        clearInterval(this.zamanlayici);
        this.zamanlayici = null;
      }
    };
    ws.addEventListener('close', kapat);
    ws.addEventListener('error', kapat);

    if (!this.zamanlayici) this.zamanlayici = setInterval(() => this.yayinla(), TICK_MS);
  }

  yayinla() {
    const simdi = Date.now();
    for (const [ws, veri] of this.oyuncular) {
      if (simdi - veri.sonGoruldu > SESSIZ_KOPAR_MS) {
        try { ws.close(1001, 'idle'); } catch { /* gone */ }
        this.oyuncular.delete(ws);
      }
    }
    if (this.oyuncular.size === 0) return;
    const hepsi = [...this.oyuncular.values()].map((v) => ({
      id: v.id, c: v.characterId, n: v.name, ...v.poz,
    }));
    const govde = JSON.stringify({ t: 'kare', oyuncular: hepsi });
    for (const ws of this.oyuncular.keys()) {
      try { ws.send(govde); } catch { this.oyuncular.delete(ws); }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/saglik') {
      // Carries the feature set, so a deploy that silently served stale code
      // is caught by a curl instead of by a confusing play test.
      return new Response(JSON.stringify({ ok: true, surum: 'kimlik-2' }), {
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
    const eslesme = url.pathname.match(/^\/ws\/([a-z0-9-]{1,24})$/i);
    if (!eslesme) return new Response('not found', { status: 404 });
    const oda = env.PARK_ROOM.idFromName(eslesme[1].toLowerCase());
    return env.PARK_ROOM.get(oda).fetch(request);
  },
};
