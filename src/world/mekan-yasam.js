// mekan-yasam.js — life inside the venues: doors on the map, travel to the
// off-map plots, and what E does once you are there.
//
// mekanlar.js builds the rooms (pool club, night club) on plots past the
// world edge; this module is everything that makes them places rather than
// dioramas. It appends door destinations to world.destinations (the existing
// E/GRAB system in main.js), handles the 'travel' hop with a bounds box so
// the sim accepts coordinates outside the town square, and runs the venue
// verbs: swim in the pool, take a drink at the bar, lie on a sunbed.
//
// The verbs steer the shared hub sim/visual directly and undo themselves the
// moment the player moves or presses E again — nothing here owns the player.

import * as THREE from 'three';
import { registerHook } from '../core/registry.js';
import { MEKAN_PLOT, mekanMerkezi } from './mekanlar.js';
import { COSMETICS } from '../systems/cosmetics.js';

const PLOT = MEKAN_PLOT;

// Pool geometry facts, derived from mekanlar.js's reference fractions.
function havuzDunya() {
  const m = mekanMerkezi('havuz');
  const f = (u, v) => ({ x: m.x + (u - 0.5) * PLOT, z: m.z + (v - 0.5) * PLOT });
  const p0 = f(0.340, 0.262);
  const p1 = f(0.662, 0.799);
  return {
    merkez: m,
    su: { minX: p0.x, maxX: p1.x, minZ: p0.z, maxZ: p1.z, seviye: 0.33 },
    kapi: f(0.5, 0.985),
    bar: f(0.5, 0.185),
    // Bed centres, not parasol posts: mekanlar.js builds the bed at
    // u = solX/sagX minus yon*0.03, so the lie-down targets use that. yon is
    // which way the head points while lying (toward the parasol).
    solYataklar: [0.262, 0.396, 0.548, 0.700].map((v) => ({ ...f(0.235, v + 0.028), yon: -1 })),
    sagYataklar: [0.262, 0.396, 0.548, 0.700].map((v) => ({ ...f(0.765, v + 0.028), yon: 1 })),
  };
}

// A soft ring on the ground plus a floating label — the venue markers, so a
// door reads as a door without borrowing the gold proof octahedra.
function isaret({ scene, x, z, metin, renk = 0x2d6cdf }) {
  const grup = new THREE.Group();
  grup.name = `mekan-isaret:${metin}`;
  const halka = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.07, 8, 28),
    new THREE.MeshStandardMaterial({
      color: renk, emissive: renk, emissiveIntensity: 1.1, roughness: 0.4,
    }),
  );
  halka.rotation.x = -Math.PI / 2;
  halka.position.y = 0.06;
  grup.add(halka);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const cx = c.getContext('2d');
    cx.fillStyle = '#17223aee';
    cx.beginPath();
    cx.roundRect(6, 6, 500, 84, 26);
    cx.fill();
    cx.fillStyle = '#ffffff';
    cx.font = '600 44px Figtree, Arial';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(metin, 256, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const etiket = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    etiket.scale.set(3.1, 0.58, 1);
    etiket.position.y = 1.7;
    grup.add(etiket);
  }
  grup.position.set(x, 0, z);
  scene.add(grup);
  return grup;
}

registerHook('hub', (ctx, { scene, world, getSim }) => {
  const havuz = havuzDunya();
  const kulup = mekanMerkezi('kulup');
  const magaza = mekanMerkezi('magaza');
  let karakter = null;
  ctx.bus.on('player-ready', (data) => { karakter = data?.instance || karakter; });

  // ---------- state ----------
  const durum = {
    mekanda: null,       // 'havuz' | 'kulup' | null
    yuzuyor: false,
    uzanan: null,        // { x, z } of the sunbed while lying
    icecek: null,        // drink prop + timer
  };

  const donusNoktasi = { x: 51, z: -2 };   // the promenade, in front of the doors

  function gorselDuzelt() {
    const v = karakter?.visual;
    if (!v) return;
    v.rotation.order = 'XYZ';
    v.rotation.set(0, 0, 0);
    v.position.y = 0;
  }

  function yuzmeyiBirak() {
    if (!durum.yuzuyor) return;
    durum.yuzuyor = false;
    gorselDuzelt();
    const sim = getSim();
    sim.pos.z = havuz.su.maxZ + 1.6;
    sim.pos.x = Math.min(Math.max(sim.pos.x, havuz.su.minX), havuz.su.maxX);
    sim.pos.y = 0.2;
    sim.vel.y = 0;
    ctx.ui.toast('Out of the pool.');
  }

  function uzanmayiBirak() {
    if (!durum.uzanan) return;
    durum.uzanan = null;
    gorselDuzelt();
    const sim = getSim();
    sim.pos.x += 1.1;
    ctx.ui.toast('Up you get.');
  }

  function seyahat(target) {
    const sim = getSim();
    yuzmeyiBirak();
    uzanmayiBirak();
    sim.pos.x = target.x;
    sim.pos.z = target.z;
    sim.pos.y = 0.4;
    sim.vel.x = 0; sim.vel.y = 0; sim.vel.z = 0;
    durum.mekanda = target.mekan || null;
    if (durum.mekanda) {
      const m = mekanMerkezi(durum.mekanda);
      world.boundsBox = {
        minX: m.x - PLOT / 2 + 0.6, maxX: m.x + PLOT / 2 - 0.6,
        minZ: m.z - PLOT / 2 + 0.6, maxZ: m.z + PLOT / 2 - 0.6,
      };
    } else {
      world.boundsBox = null;
    }
    if (target.label) ctx.ui.toast(target.label);
    ctx.bus.emit('sfx', 'launch');
    return true;
  }

  function icecekVer() {
    if (!karakter?.root || durum.icecek) {
      ctx.ui.toast(durum.icecek ? 'You already have a drink.' : 'Fresh juice.');
      return;
    }
    const bardak = new THREE.Group();
    bardak.name = 'mekan:icecek';
    const cam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.075, 0.24, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2a45c, roughness: 0.25 }),
    );
    const pipet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8827c, roughness: 0.5 }),
    );
    pipet.position.set(0.04, 0.2, 0);
    pipet.rotation.z = -0.3;
    bardak.add(cam, pipet);
    bardak.position.set(0.42, 0.95, 0.28);
    karakter.root.add(bardak);
    durum.icecek = { prop: bardak, kalan: 40 };
    ctx.ui.toast('Fresh juice — enjoy.');
  }

  function yuzmeyeGir() {
    const sim = getSim();
    durum.yuzuyor = true;
    sim.pos.x = Math.min(Math.max(sim.pos.x, havuz.su.minX + 0.8), havuz.su.maxX - 0.8);
    sim.pos.z = havuz.su.maxZ - 1.4;
    sim.pos.y = havuz.su.seviye;
    ctx.ui.toast('In the water — swim to the edge and press E to climb out.');
  }

  function sezlongaUzan(noktalar) {
    const sim = getSim();
    let enYakin = noktalar[0];
    let enKisa = Infinity;
    for (const n of noktalar) {
      const d = Math.hypot(sim.pos.x - n.x, sim.pos.z - n.z);
      if (d < enKisa) { enKisa = d; enYakin = n; }
    }
    durum.uzanan = enYakin;
    ctx.ui.toast('Lying back — press E or move to get up.');
  }

  // Boutique purchase: E at the racks hands over the next piece the player
  // does not own yet, straight into the real Closet inventory. Free while the
  // trial phase is on, exactly like the Closet itself.
  function kiyafetSat() {
    const sahip = ctx.save.get('ownedCosmetics', []);
    const sirada = COSMETICS.find((c) => !sahip.includes(c.id));
    if (!sirada) {
      ctx.ui.toast('You own every piece in the boutique.');
      return;
    }
    if (ctx.save.set('ownedCosmetics', [...sahip, sirada.id]) !== true) {
      ctx.ui.toast('Purchase could not be saved on this device.');
      return;
    }
    ctx.bus.emit('sfx', 'reward');
    ctx.ui.toast(`${sirada.name} is yours — it is hanging in your Closet.`);
  }

  // ---------- doors + verbs, through the existing destination system ----------
  world.destinations.push(
    {
      id: 'mekan-havuz-kapi', label: 'Pool Club', kind: 'travel', radius: 2.6,
      x: 51, z: -5,
      target: { x: havuz.kapi.x, z: havuz.kapi.z - 1.2, mekan: 'havuz', label: 'Pool Club' },
    },
    {
      id: 'mekan-kulup-kapi', label: 'Night Club', kind: 'travel', radius: 2.6,
      x: 51, z: 2,
      target: { x: kulup.x, z: kulup.z + PLOT * 0.485 - 1.2, mekan: 'kulup', label: 'Night Club' },
    },
    {
      id: 'mekan-havuz-cikis', label: 'Back to 67 Park', kind: 'travel', radius: 2.2,
      x: havuz.kapi.x, z: havuz.kapi.z,
      target: { ...donusNoktasi, mekan: null, label: '67 Park' },
    },
    {
      id: 'mekan-kulup-cikis', label: 'Back to 67 Park', kind: 'travel', radius: 2.2,
      x: kulup.x, z: kulup.z + PLOT * 0.485,
      target: { ...donusNoktasi, x: donusNoktasi.x, mekan: null, label: '67 Park' },
    },
    {
      id: 'mekan-magaza-kapi', label: 'Boutique 67', kind: 'travel', radius: 2.6,
      x: 51, z: 9,
      target: { x: magaza.x, z: magaza.z + PLOT * 0.485 - 1.2, mekan: 'magaza', label: 'Boutique 67' },
    },
    {
      id: 'mekan-magaza-cikis', label: 'Back to 67 Park', kind: 'travel', radius: 2.2,
      x: magaza.x + PLOT * 0.21, z: magaza.z + PLOT * 0.485,
      target: { ...donusNoktasi, mekan: null, label: '67 Park' },
    },
    {
      id: 'mekan-magaza-alisveris', label: 'Buy clothes', kind: 'venue', radius: 2.8,
      x: magaza.x - PLOT * 0.055, z: magaza.z + PLOT * 0.05,
      target: 'shop-buy',
    },
    {
      id: 'mekan-magaza-kabin', label: 'Fitting room — open Closet', kind: 'system', radius: 2.4,
      x: magaza.x + PLOT * 0.137, z: magaza.z - PLOT * 0.425 + 2.2,
      target: 'cosmetics',
    },
    {
      id: 'mekan-havuz-yuzme', label: 'Swim', kind: 'venue', radius: 2.6,
      x: (havuz.su.minX + havuz.su.maxX) / 2, z: havuz.su.maxZ + 1.0,
      target: 'swim',
    },
    {
      id: 'mekan-havuz-bar', label: 'Take a drink', kind: 'venue', radius: 2.4,
      x: havuz.bar.x, z: havuz.bar.z + 1.4,
      target: 'drink',
    },
    {
      id: 'mekan-havuz-sol-yatak', label: 'Lie on a sunbed', kind: 'venue', radius: 3.0,
      x: havuz.solYataklar[1].x + 1.2, z: (havuz.solYataklar[1].z + havuz.solYataklar[2].z) / 2,
      target: 'sunbed-sol',
    },
    {
      id: 'mekan-havuz-sag-yatak', label: 'Lie on a sunbed', kind: 'venue', radius: 3.0,
      x: havuz.sagYataklar[1].x - 1.2, z: (havuz.sagYataklar[1].z + havuz.sagYataklar[2].z) / 2,
      target: 'sunbed-sag',
    },
  );

  // Door + verb markers so each point reads on the ground.
  isaret({ scene, x: 51, z: -5, metin: 'POOL CLUB', renk: 0x3fa9b6 });
  isaret({ scene, x: 51, z: 2, metin: 'NIGHT CLUB', renk: 0x7b4f96 });
  isaret({ scene, x: 51, z: 9, metin: 'BOUTIQUE 67', renk: 0xc9829a });
  isaret({ scene, x: havuz.kapi.x, z: havuz.kapi.z, metin: 'EXIT', renk: 0x17223a });
  isaret({ scene, x: magaza.x + PLOT * 0.21, z: magaza.z + PLOT * 0.485, metin: 'EXIT', renk: 0x17223a });
  isaret({ scene, x: magaza.x - PLOT * 0.055, z: magaza.z + PLOT * 0.05, metin: 'BUY', renk: 0xc9829a });
  isaret({ scene, x: magaza.x + PLOT * 0.137, z: magaza.z - PLOT * 0.425 + 2.2, metin: 'FITTING ROOM', renk: 0xe8a8a5 });
  isaret({ scene, x: kulup.x, z: kulup.z + PLOT * 0.485, metin: 'EXIT', renk: 0x17223a });
  isaret({
    scene, x: (havuz.su.minX + havuz.su.maxX) / 2, z: havuz.su.maxZ + 1.0,
    metin: 'SWIM', renk: 0x6fc9d8,
  });
  isaret({ scene, x: havuz.bar.x, z: havuz.bar.z + 1.4, metin: 'BAR', renk: 0xe8b64a });

  // main.js routes unknown destination kinds here.
  world.mekanYasam = {
    seyahat,
    eylem(target) {
      if (target === 'swim') {
        if (durum.yuzuyor) yuzmeyiBirak();
        else yuzmeyeGir();
        return;
      }
      if (target === 'drink') { icecekVer(); return; }
      if (target === 'shop-buy') { kiyafetSat(); return; }
      if (target === 'sunbed-sol') { sezlongaUzan(havuz.solYataklar); return; }
      if (target === 'sunbed-sag') { sezlongaUzan(havuz.sagYataklar); }
    },
  };

  // ---------- per-frame venue behaviour ----------
  ctx.loop.add((dt) => {
    const sim = getSim();
    if (durum.icecek) {
      durum.icecek.kalan -= dt;
      if (durum.icecek.kalan <= 0) {
        durum.icecek.prop.removeFromParent();
        durum.icecek = null;
      }
    }
    if (durum.yuzuyor) {
      // Water carries the player: pinned to the surface, penned by the pool.
      sim.pos.y = havuz.su.seviye;
      sim.vel.y = 0;
      sim.grounded = true;
      sim.pos.x = Math.min(Math.max(sim.pos.x, havuz.su.minX + 0.35), havuz.su.maxX - 0.35);
      sim.pos.z = Math.min(Math.max(sim.pos.z, havuz.su.minZ + 0.35), havuz.su.maxZ - 0.35);
      const v = karakter?.visual;
      if (v) {
        v.rotation.x = -1.25;                      // prone, face down the water
        v.position.y = -0.55;                      // body sits in the water
      }
    }
    if (durum.uzanan) {
      // Feet toward the pool so the body lies along the bed's long axis, the
      // head up by the parasol end.
      sim.pos.x = durum.uzanan.x - durum.uzanan.yon * 0.95;
      sim.pos.z = durum.uzanan.z;
      // The venue deck's top sits at y -0.2; own the vertical too, or the
      // ground ray loses the deck under the bed and the body sinks.
      sim.pos.y = -0.2;
      sim.vel.x = 0; sim.vel.y = 0; sim.vel.z = 0;
      sim.grounded = true;
      const v = karakter?.visual;
      if (v) {
        // Yaw first, then pitch flat — in default XYZ order the second axis
        // becomes a roll and the body corkscrews off the bed.
        v.rotation.order = 'YXZ';
        v.rotation.set(-Math.PI / 2, durum.uzanan.yon * Math.PI / 2, 0);
        v.position.y = 0.97;
      }
      // Any real movement input gets the player up again.
      const pad = ctx.input.poll();
      if (Math.abs(pad.mx) > 0.3 || Math.abs(pad.my) > 0.3) uzanmayiBirak();
    }
  });

  // E is also the exit for swim/sunbed when standing at their markers — the
  // venue verb handler above toggles; movement handles the sunbed too.
});
