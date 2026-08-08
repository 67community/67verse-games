// park-online.js — the shared map's client half.
//
// The room itself is a Cloudflare Durable Object (worker/park-room.js): the
// game is static files on GitHub Pages and cannot hold a socket, so the world
// is shared through a service deployed beside it. This module owns one socket,
// pushes the local player's position, and keeps a rigged avatar on the map for
// everyone else in the room.
//
// It rides the idle pass, so a player who never sees a friend pays nothing for
// it on first paint, and a room that cannot be reached is silent rather than
// fatal — the park is a complete single-player place either way.

import * as THREE from 'three';

const ODA_KOKU = 'wss://67park-room.67gamehub.workers.dev/ws';
const GONDER_HZ = 15;
const VARSAYILAN_ODA = 'park';

function odaAdi() {
  const istenen = new URLSearchParams(location.search).get('room');
  return istenen && /^[a-z0-9-]{1,24}$/i.test(istenen) ? istenen.toLowerCase() : VARSAYILAN_ODA;
}

// A name tag, drawn once per player into its own small canvas. Sprites always
// face the camera, so a tag stays readable from any angle without per-frame
// work of our own.
function etiketYap(ad) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const c = canvas.getContext('2d');
  c.font = '600 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const genislik = Math.min(240, c.measureText(ad).width + 34);
  c.fillStyle = 'rgba(6, 12, 33, 0.82)';
  c.beginPath();
  c.roundRect((256 - genislik) / 2, 12, genislik, 40, 20);
  c.fill();
  c.fillStyle = '#ffffff';
  c.fillText(ad, 128, 33);
  const doku = new THREE.CanvasTexture(canvas);
  doku.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, depthTest: true, transparent: true }));
  sprite.scale.set(1.5, 0.375, 1);
  return sprite;
}

export function createParkOnline({ scene, getSim, ctx }) {
  let soket = null;
  let benimId = null;
  let kapandi = false;
  const uzaktakiler = new Map();   // id -> { root, animator, hedef, ad, etiket, sonHiz }
  const yukleniyor = new Set();
  let gonderBirikim = 0;

  const durum = { bagli: false, sayi: 0, self: null, uzak: 0 };
  // The ambient fRiENDSiES walking the park carry the same node names as a
  // remote player's body, so counting bodies in the scene cannot tell a friend
  // from an NPC. QA reads the room's own tally instead.
  if (typeof window !== 'undefined') window.__67PARK_ONLINE__ = durum;

  // The player's own choices, which outrank whatever the room guessed from
  // the address. Both are saved locally so a reload keeps you yourself.
  function kimligimiGonder() {
    if (soket?.readyState !== WebSocket.OPEN) return;
    const ad = (localStorage.getItem('67v.playerName') || '').trim();
    // Only a REAL pick overrides the room. `equippedId()` answers 'gorilla'
    // for anyone who never chose, so sending it unconditionally turned every
    // fresh visitor into the same gorilla — the exact case this is for.
    const secildi = ctx?.save?.get?.('equipped', null) != null;
    const karakter = secildi ? ctx.characters.equippedId() : null;
    if (!ad && !karakter) return;
    soket.send(JSON.stringify({ t: 'kimlik', name: ad || undefined, characterId: karakter || undefined }));
    if (durum.self) {
      if (ad) durum.self.name = ad;
      if (karakter) durum.self.characterId = karakter;
    }
  }

  function bagla() {
    if (kapandi) return;
    try {
      soket = new WebSocket(`${ODA_KOKU}/${odaAdi()}`);
    } catch {
      return;                        // no socket, no shared world, no crash
    }
    soket.addEventListener('message', (event) => {
      let mesaj;
      try { mesaj = JSON.parse(event.data); } catch { return; }
      if (mesaj.t === 'hos-geldin') {
        benimId = mesaj.self.id;
        durum.self = mesaj.self;
        durum.bagli = true;
        // The room offers an address-derived character and name; whatever the
        // player actually picked and typed wins over both.
        kimligimiGonder();
        ctx?.bus?.emit('park-online', { self: durum.self });
        return;
      }
      if (mesaj.t !== 'kare' || !Array.isArray(mesaj.oyuncular)) return;
      durum.sayi = mesaj.oyuncular.length;
      const goruldu = new Set();
      for (const o of mesaj.oyuncular) {
        if (!o || o.id === benimId) continue;
        goruldu.add(o.id);
        const mevcut = uzaktakiler.get(o.id);
        if (mevcut) {
          mevcut.hedef.set(o.x, o.y, o.z);
          mevcut.hedefYaw = o.yaw;
          mevcut.sonHiz = o.hiz || 0;
        } else {
          avatarYukle(o);
        }
      }
      for (const [id, kayit] of uzaktakiler) {
        if (goruldu.has(id)) continue;
        scene.remove(kayit.root);
        kayit.dispose?.();
        uzaktakiler.delete(id);
      }
      durum.uzak = uzaktakiler.size;
    });
    // A dropped room comes back on its own; a friend walking out of a tunnel
    // should not have to reload the page.
    const yenidenDene = () => {
      durum.bagli = false;
      for (const [, kayit] of uzaktakiler) { scene.remove(kayit.root); kayit.dispose?.(); }
      uzaktakiler.clear();
      if (!kapandi) setTimeout(bagla, 2500);
    };
    soket.addEventListener('close', yenidenDene);
    soket.addEventListener('error', () => { try { soket.close(); } catch { /* gone */ } });
  }

  async function avatarYukle(o) {
    if (yukleniyor.has(o.id) || uzaktakiler.has(o.id)) return;
    yukleniyor.add(o.id);
    try {
      const rigged = await import('./friendsie-bot.js');
      if (kapandi || uzaktakiler.has(o.id)) return;
      const ornek = await rigged.createFriendsieRival(o.c, { height: 1.38 });
      if (!ornek || kapandi) return;
      const etiket = etiketYap(o.n || 'player');
      etiket.position.y = 1.95;
      ornek.root.add(etiket);
      ornek.root.position.set(o.x, o.y, o.z);
      ornek.root.rotation.y = o.yaw ?? 0;
      scene.add(ornek.root);
      uzaktakiler.set(o.id, {
        root: ornek.root,
        animator: ornek.animator,
        dispose: ornek.dispose,
        hedef: new THREE.Vector3(o.x, o.y, o.z),
        hedefYaw: o.yaw ?? 0,
        sonHiz: 0,
        etiket,
      });
    } catch {
      /* a rig that will not load simply has no body in the room */
    } finally {
      yukleniyor.delete(o.id);
    }
  }

  function guncelle(dt) {
    // Push our own position at a fixed rate rather than every frame; the room
    // ticks at 12.5 Hz and a 60 Hz firehose only costs battery.
    gonderBirikim += dt;
    if (soket?.readyState === WebSocket.OPEN && gonderBirikim >= 1 / GONDER_HZ) {
      gonderBirikim = 0;
      const sim = getSim();
      soket.send(JSON.stringify({
        t: 'poz',
        x: +sim.pos.x.toFixed(2),
        y: +sim.pos.y.toFixed(2),
        z: +sim.pos.z.toFixed(2),
        yaw: +sim.yaw.toFixed(3),
        hiz: +Math.hypot(sim.vel.x, sim.vel.z).toFixed(2),
      }));
    }
    // Remote bodies are interpolated toward their last known spot, so a 12.5 Hz
    // feed reads as walking rather than teleporting.
    const k = 1 - Math.exp(-9 * dt);
    for (const kayit of uzaktakiler.values()) {
      kayit.root.position.lerp(kayit.hedef, k);
      let fark = (kayit.hedefYaw - kayit.root.rotation.y) % (Math.PI * 2);
      if (fark > Math.PI) fark -= Math.PI * 2;
      if (fark < -Math.PI) fark += Math.PI * 2;
      kayit.root.rotation.y += fark * k;
      kayit.animator?.update(dt, { speed: kayit.sonHiz, grounded: true });
    }
  }

  bagla();

  // Changing character or name mid-session pushes straight to the room, so a
  // friend sees the change without anyone reloading.
  ctx?.bus?.on?.('character-equipped', kimligimiGonder);
  ctx?.bus?.on?.('player-name', kimligimiGonder);

  return {
    guncelle,
    durum,
    kimligimiGonder,
    kapat() {
      kapandi = true;
      try { soket?.close(); } catch { /* gone */ }
      for (const [, kayit] of uzaktakiler) { scene.remove(kayit.root); kayit.dispose?.(); }
      uzaktakiler.clear();
    },
  };
}
