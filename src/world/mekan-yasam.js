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
import { createFriendsieRival } from '../core/friendsie-bot.js';
import { acMikroOyun } from './arcade-oyunlar.js';
import { kurBasketAtisi } from './basket-atisi.js';
import { kurFutbolAtisi } from './futbol-atisi.js';

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
  // Club spots, from the night-club reference fractions in mekanlar.js.
  const kf = (u, v) => ({ x: kulup.x + (u - 0.5) * PLOT, z: kulup.z + (v - 0.5) * PLOT });
  const kulupPist = kf(0.474, 0.507);        // lit dance floor centre
  const kulupBar = kf(0.245, 0.39);          // in front of the west bar
  const kulupVipUst = kf(0.77, 0.18);        // VIP LOUNGE sofa
  const kulupVipAlt = kf(0.16, 0.73);        // VIP AREA sofa
  const arcade = mekanMerkezi('arcade');
  const af = (u, v) => ({ x: arcade.x + (u - 0.5) * PLOT, z: arcade.z + (v - 0.5) * PLOT });
  const arcadeHop = af(0.31, 0.352);         // first sit-in cabinet row
  const arcadeDodge = af(0.41, 0.522);       // second row
  const arcadeKafe = af(0.64, 0.88);         // cafe corner table
  // Riding the idle pass means 'player-ready' may have fired already, so the
  // current character is read off ctx first and the bus keeps it fresh.
  let karakter = ctx.hubCharacter || null;
  ctx.bus.on('player-ready', (data) => { karakter = data?.instance || karakter; });

  const basket = kurBasketAtisi({ ctx, scene, getSim });
  const futbol = kurFutbolAtisi({ ctx, scene, getSim });

  // ---------- venue guests ----------
  // The rooms are not dioramas: a few of Oscar's collection hang out in them,
  // and they are who a bought round goes to. Club guests dance on the lit
  // floor; pool guests take the water and a sunbed.
  const misafirler = [];
  const MISAFIR_TANIM = [
    { ad: 'No. 100', dosya: 'friendsie:fr_100.glb', x: kulup.x - 1.6, z: kulup.z + 0.4, tarz: 'dans' },
    { ad: 'No. 500', dosya: 'friendsie:fr_500.glb', x: kulup.x + 1.4, z: kulup.z - 0.9, tarz: 'dans' },
    { ad: 'No. 777', dosya: 'friendsie:fr_777.glb', x: kulupVipUst.x - 1.1, z: kulupVipUst.z, tarz: 'otur' },
    { ad: 'No. 2222', dosya: 'friendsie:fr_2222.glb', x: havuz.sagYataklar[2].x - 0.95, z: havuz.sagYataklar[2].z, tarz: 'uzan' },
    { ad: 'No. 8888', dosya: 'friendsie:fr_8888.glb', x: havuz.bar.x - 1.6, z: havuz.bar.z + 1.4, tarz: 'ayakta' },
    { ad: 'No. 1000', dosya: 'friendsie:fr_1000.glb', x: 302 + (0.16 - 0.5) * 26, z: (0.72 - 0.5) * 26, tarz: 'otur' },
  ];
  for (const tanim of MISAFIR_TANIM) {
    createFriendsieRival(tanim.dosya, { height: 1.45 }).then((instance) => {
      if (!instance) return;
      instance.root.position.set(tanim.x, tanim.tarz === 'uzan' ? -0.2 : -0.2, tanim.z);
      if (tanim.tarz === 'uzan') {
        instance.visual.rotation.order = 'YXZ';
        instance.visual.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
        instance.visual.position.y = 0.97;
        instance.root.position.x = havuz.sagYataklar[2].x - 1 * 0.95;
      }
      if (tanim.tarz === 'otur') {
        instance.visual.position.y = 0.34;
        instance.visual.rotation.x = -0.28;
      }
      scene.add(instance.root);
      misafirler.push({ ad: tanim.ad, instance, tarz: tanim.tarz, faz: Math.random() * 6 });
    });
  }

  // ---------- state ----------
  const durum = {
    mekanda: null,       // 'havuz' | 'kulup' | 'magaza' | null
    yuzuyor: false,
    uzanan: null,        // { x, z } of the sunbed while lying
    icecek: null,        // drink prop + timer
    dans: null,          // { x, z, sure } while dancing
    oturan: null,        // { x, z } while sitting
    kaykay: null,        // { board, bekleme } while riding
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
    if (Array.isArray(world.solids) && havuzKatilari.length) {
      world.solids.push(...havuzKatilari);
      havuzKatilari = [];
    }
    gorselDuzelt();
    const sim = getSim();
    sim.pos.z = havuz.su.maxZ + 1.6;
    sim.pos.x = Math.min(Math.max(sim.pos.x, havuz.su.minX), havuz.su.maxX);
    sim.pos.y = 0.2;
    sim.vel.y = 0;
    ctx.ui.toast('Out of the pool.');
  }

  function dansiBirak() {
    if (!durum.dans) return;
    durum.dans = null;
    gorselDuzelt();
  }

  function oturmayiBirak() {
    if (!durum.oturan) return;
    durum.oturan = null;
    gorselDuzelt();
    const sim = getSim();
    sim.pos.x += 0.9;
    ctx.ui.toast('Up you get.');
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
    dansiBirak();
    oturmayiBirak();
    kaykaydanIn();
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

  function kahveYap() {
    const fincan = new THREE.Group();
    fincan.name = 'mekan:kahve';
    const govde = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.07, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: 0xf6f2ec, roughness: 0.4 }),
    );
    const kapak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.035, 10),
      new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.6 }),
    );
    kapak.position.y = 0.115;
    fincan.add(govde, kapak);
    return fincan;
  }

  function icecekYap() {
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
    return bardak;
  }

  function icecekVer() {
    if (!karakter?.root || durum.icecek) {
      ctx.ui.toast(durum.icecek ? 'You already have a drink.' : 'Fresh juice.');
      return;
    }
    const bardak = icecekYap();
    bardak.position.set(0.42, 0.95, 0.28);
    karakter.root.add(bardak);
    durum.icecek = { prop: bardak, kalan: 40 };
    ctx.ui.toast('Fresh juice — enjoy.');
  }

  let havuzKatilari = [];
  function yuzmeyeGir() {
    const sim = getSim();
    durum.yuzuyor = true;
    // Lift the pool's own collider while swimming; walkers stay blocked.
    if (Array.isArray(world.solids)) {
      havuzKatilari = world.solids.filter((k) => k.id === 'havuz-su');
      for (const k of havuzKatilari) {
        const i = world.solids.indexOf(k);
        if (i >= 0) world.solids.splice(i, 1);
      }
    }
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

  function kaykayaBin() {
    if (!karakter?.root || durum.kaykay) return;
    const board = new THREE.Group();
    board.name = 'mekan:kaykay';
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.05, 0.92),
      new THREE.MeshStandardMaterial({ color: 0xe8827c, roughness: 0.55 }),
    );
    deck.position.y = 0.11;
    board.add(deck);
    const tekerGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8);
    const tekerMat = new THREE.MeshStandardMaterial({ color: 0xf6f2ec, roughness: 0.5 });
    for (const [sx, sz] of [[-0.12, 0.32], [0.12, 0.32], [-0.12, -0.32], [0.12, -0.32]]) {
      const teker = new THREE.Mesh(tekerGeo, tekerMat);
      teker.rotation.z = Math.PI / 2;
      teker.position.set(sx, 0.05, sz);
      board.add(teker);
    }
    karakter.root.add(board);
    durum.kaykay = { board, bekleme: 0.6 };
    world.speedScale = 1.8;
    ctx.ui.toast('On the board — E hops off.');
  }

  function kaykaydanIn() {
    if (!durum.kaykay) return;
    durum.kaykay.board.removeFromParent();
    durum.kaykay = null;
    world.speedScale = 1;
    ctx.ui.toast('Board pocketed.');
  }

  function dansaBasla() {
    const sim = getSim();
    durum.dans = { x: sim.pos.x, z: sim.pos.z, sure: 0 };
    ctx.ui.toast('Dancing — move or press E to stop.');
  }

  function otur(nokta) {
    durum.oturan = { ...nokta };
    ctx.ui.toast('Taking a seat — press E or move to stand.');
  }

  // A round for someone in the room: pick who from the people actually here,
  // and the drink lands in their hand.
  function birineIsmarla(yapici = icecekYap, tur = 'drink') {
    const buradakiler = misafirler.filter((g) => {
      const d = Math.hypot(g.instance.root.position.x - getSim().pos.x,
        g.instance.root.position.z - getSim().pos.z);
      return d < PLOT;   // the same room
    });
    if (!buradakiler.length) {
      ctx.ui.toast('Nobody else is here right now.');
      return;
    }
    const panel = ctx.ui.panel({ title: tur === 'coffee' ? 'Buy a coffee for...' : 'Buy a drink for...' });
    const not = document.createElement('p');
    not.textContent = 'Pick someone in the room — it goes straight to them.';
    not.style.cssText = 'margin:0 0 12px;color:#6b7280;font-size:13.5px;';
    panel.body.appendChild(not);
    for (const g of buradakiler) {
      panel.body.appendChild(ctx.ui.button(g.ad, () => {
        panel.close();
        const bardak = yapici();
        bardak.position.set(0.42, 0.95, 0.28);
        g.instance.root.add(bardak);
        setTimeout(() => bardak.removeFromParent(), 40000);
        ctx.bus.emit('sfx', 'reward');
        ctx.ui.toast(tur === 'coffee'
          ? `Delivered — ${g.ad} warms both hands on it.`
          : `Delivered — ${g.ad} raises the glass to you.`);
      }, { primary: true }));
      panel.body.lastChild.style.margin = '0 8px 8px 0';
    }
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
      x: 50.6, z: -5,
      target: { x: havuz.kapi.x, z: havuz.kapi.z - 1.2, mekan: 'havuz', label: 'Pool Club' },
    },
    {
      id: 'mekan-kulup-kapi', label: 'Night Club', kind: 'travel', radius: 2.6,
      x: 50.6, z: 2,
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
      x: 50.6, z: 9,
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
      id: 'kaykay-al', label: 'Ride the board', kind: 'venue', radius: 2.6,
      x: 2, z: -33.5,
      target: 'skate-ride',
    },
    {
      id: 'basket-atisi', label: 'Hoop Shot', kind: 'venue', radius: 2.4,
      x: -36, z: -1.7,
      target: 'hoop-shot',
    },
    {
      id: 'futbol-atisi', label: 'Goal Shot', kind: 'venue', radius: 2.4,
      x: 29.95, z: 5.2,
      target: 'goal-shot',
    },
    {
      id: 'mekan-arcade-kapi', label: 'Arcade 67', kind: 'travel', radius: 2.6,
      x: 50.6, z: 16,
      target: { x: arcade.x + (0.49 - 0.5) * PLOT, z: arcade.z + PLOT * 0.485 - 1.2, mekan: 'arcade', label: 'Arcade 67' },
    },
    {
      id: 'mekan-arcade-cikis', label: 'Back to 67 Park', kind: 'travel', radius: 2.2,
      x: arcade.x + (0.49 - 0.5) * PLOT, z: arcade.z + PLOT * 0.485,
      target: { ...donusNoktasi, mekan: null, label: '67 Park' },
    },
    {
      id: 'mekan-arcade-hop', label: 'Play SKY HOP', kind: 'venue', radius: 2.2,
      x: arcadeHop.x, z: arcadeHop.z + 1.4,
      target: 'arcade-hop',
    },
    {
      id: 'mekan-arcade-dodge', label: 'Play DODGE 67', kind: 'venue', radius: 2.2,
      x: arcadeDodge.x, z: arcadeDodge.z + 1.4,
      target: 'arcade-dodge',
    },
    {
      id: 'mekan-arcade-kahve', label: 'Buy a coffee for someone', kind: 'venue', radius: 2.6,
      x: arcadeKafe.x, z: arcadeKafe.z,
      target: 'gift-kahve',
    },
    {
      id: 'mekan-kulup-dans', label: 'Dance', kind: 'venue', radius: 3.2,
      x: kulupPist.x, z: kulupPist.z + 2.4,
      target: 'dance',
    },
    {
      id: 'mekan-kulup-bar', label: 'Take a drink', kind: 'venue', radius: 2.6,
      x: kulupBar.x, z: kulupBar.z,
      target: 'drink',
    },
    {
      id: 'mekan-kulup-ismarla', label: 'Buy a round', kind: 'venue', radius: 2.6,
      x: kulupBar.x, z: kulupBar.z + 2.6,
      target: 'gift',
    },
    {
      id: 'mekan-havuz-ismarla', label: 'Buy a round', kind: 'venue', radius: 2.4,
      x: havuz.bar.x + 3.2, z: havuz.bar.z + 1.4,
      target: 'gift',
    },
    {
      id: 'mekan-kulup-vip-ust', label: 'Sit down', kind: 'venue', radius: 2.4,
      x: kulupVipUst.x, z: kulupVipUst.z + 1.2,
      target: 'sit-vip-ust',
    },
    {
      id: 'mekan-kulup-vip-alt', label: 'Sit down', kind: 'venue', radius: 2.4,
      x: kulupVipAlt.x + 1.2, z: kulupVipAlt.z,
      target: 'sit-vip-alt',
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

  // ---------- venue facades on the promenade ----------
  // The doors are not floating rings in the sand: each venue has a small
  // storefront on the beach strip, its ring on the doormat, its name over
  // the door. E at the mat still carries you to the room.
  {
    const CEPHELER = [
      { z: -5, govde: '#f1e9dc', serit: '#6fc9d8', ad: 'POOL CLUB' },
      { z: 2, govde: '#2a2431', serit: '#b45cd6', ad: 'NIGHT CLUB' },
      { z: 9, govde: '#e6d9c8', serit: '#c9829a', ad: 'BOUTIQUE 67' },
      { z: 16, govde: '#8fc4cf', serit: '#17223a', ad: 'ARCADE 67' },
    ];
    const CX = 53.3;
    const G = 4.6, D = 3.6, H = 3.4;
    const govdeler = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
      CEPHELER.length,
    );
    const seritler = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
      CEPHELER.length,
    );
    const kapilar = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.15, 2.0, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.7 }),
      CEPHELER.length,
    );
    const ym = new THREE.Matrix4();
    // One atlas holds all four signs; each plane picks its strip with UVs.
    const atlas = document.createElement('canvas');
    atlas.width = 512; atlas.height = 256;
    const ac = atlas.getContext('2d');
    CEPHELER.forEach((c, i) => {
      ac.fillStyle = '#17223a';
      ac.fillRect(0, i * 64 + 8, 512, 48);
      ac.fillStyle = '#ffffff';
      ac.font = '700 34px Figtree, Arial';
      ac.textAlign = 'center';
      ac.textBaseline = 'middle';
      ac.fillText(c.ad, 256, i * 64 + 32);
    });
    const atlasTex = new THREE.CanvasTexture(atlas);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    const tabelaMat = new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true });
    CEPHELER.forEach((c, i) => {
      ym.makeScale(G, H, D);
      ym.setPosition(CX, H / 2, c.z);
      govdeler.setMatrixAt(i, ym);
      govdeler.setColorAt(i, new THREE.Color(c.govde));
      ym.makeScale(G + 0.2, 0.5, D + 0.2);
      ym.setPosition(CX, H - 0.2, c.z);
      seritler.setMatrixAt(i, ym);
      seritler.setColorAt(i, new THREE.Color(c.serit));
      ym.identity();
      ym.setPosition(CX - G / 2 - 0.02, 1.0, c.z);
      kapilar.setMatrixAt(i, ym);
      const tabela = new THREE.PlaneGeometry(3.4, 0.62);
      const uv = tabela.attributes.uv;
      for (let k = 0; k < uv.count; k += 1) {
        uv.setY(k, (uv.getY(k) * 48 + (3 - i) * 64 + 8) / 256);
      }
      const tabelaMesh = new THREE.Mesh(tabela, tabelaMat);
      tabelaMesh.position.set(CX - G / 2 - 0.05, 2.55, c.z);
      tabelaMesh.rotation.y = -Math.PI / 2;
      scene.add(tabelaMesh);
      if (Array.isArray(world.solids)) {
        world.solids.push({
          minX: CX - G / 2, maxX: CX + G / 2,
          minZ: c.z - D / 2, maxZ: c.z + D / 2, topY: H,
        });
      }
    });
    govdeler.instanceMatrix.needsUpdate = true;
    seritler.instanceMatrix.needsUpdate = true;
    kapilar.instanceMatrix.needsUpdate = true;
    if (govdeler.instanceColor) govdeler.instanceColor.needsUpdate = true;
    if (seritler.instanceColor) seritler.instanceColor.needsUpdate = true;
    scene.add(govdeler, seritler, kapilar);
  }

  // Door + verb markers so each point reads on the ground.
  isaret({ scene, x: 50.6, z: -5, metin: 'POOL CLUB', renk: 0x3fa9b6 });
  isaret({ scene, x: 50.6, z: 2, metin: 'NIGHT CLUB', renk: 0x7b4f96 });
  isaret({ scene, x: 50.6, z: 9, metin: 'BOUTIQUE 67', renk: 0xc9829a });
  isaret({ scene, x: havuz.kapi.x, z: havuz.kapi.z, metin: 'EXIT', renk: 0x17223a });
  isaret({ scene, x: magaza.x + PLOT * 0.21, z: magaza.z + PLOT * 0.485, metin: 'EXIT', renk: 0x17223a });
  isaret({ scene, x: magaza.x - PLOT * 0.055, z: magaza.z + PLOT * 0.05, metin: 'BUY', renk: 0xc9829a });
  isaret({ scene, x: 50.6, z: 16, metin: 'ARCADE 67', renk: 0x8fc4cf });
  isaret({ scene, x: -36, z: -1.7, metin: 'HOOP SHOT', renk: 0xe08a3c });
  isaret({ scene, x: 2, z: -33.5, metin: 'RIDE', renk: 0xe8827c });
  isaret({ scene, x: 29.95, z: 5.2, metin: 'GOAL SHOT', renk: 0x5a9c7a });
  isaret({ scene, x: arcade.x + (0.49 - 0.5) * PLOT, z: arcade.z + PLOT * 0.485, metin: 'EXIT', renk: 0x17223a });
  isaret({ scene, x: arcadeHop.x, z: arcadeHop.z + 1.4, metin: 'SKY HOP', renk: 0x5a9cd8 });
  isaret({ scene, x: arcadeDodge.x, z: arcadeDodge.z + 1.4, metin: 'DODGE 67', renk: 0x7fbf8e });
  isaret({ scene, x: arcadeKafe.x, z: arcadeKafe.z, metin: 'COFFEE', renk: 0xb98a5a });
  isaret({ scene, x: kulupPist.x, z: kulupPist.z + 2.4, metin: 'DANCE', renk: 0xb45cd6 });
  isaret({ scene, x: kulupBar.x, z: kulupBar.z + 2.6, metin: 'BUY A ROUND', renk: 0xe8b64a });
  isaret({ scene, x: havuz.bar.x + 3.2, z: havuz.bar.z + 1.4, metin: 'BUY A ROUND', renk: 0xe8b64a });
  isaret({ scene, x: kulupBar.x, z: kulupBar.z, metin: 'BAR', renk: 0xe8b64a });
  isaret({ scene, x: kulupVipUst.x, z: kulupVipUst.z + 1.2, metin: 'VIP', renk: 0x7b4f96 });
  isaret({ scene, x: kulupVipAlt.x + 1.2, z: kulupVipAlt.z, metin: 'VIP', renk: 0x7b4f96 });
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
      if (target === 'gift') { birineIsmarla(); return; }
      if (target === 'gift-kahve') { birineIsmarla(kahveYap, 'coffee'); return; }
      if (target === 'hoop-shot') { basket.baslat(); return; }
      if (target === 'goal-shot') { futbol.baslat(); return; }
      if (target === 'skate-ride') {
        if (durum.kaykay) kaykaydanIn(); else kaykayaBin();
        return;
      }
      if (target === 'arcade-hop' || target === 'arcade-dodge') {
        acMikroOyun(target, ctx);
        return;
      }
      if (target === 'dance') {
        if (durum.dans) dansiBirak(); else dansaBasla();
        return;
      }
      if (target === 'sit-vip-ust') { otur(kulupVipUst); return; }
      if (target === 'sit-vip-alt') { otur(kulupVipAlt); return; }
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
    for (const g of misafirler) {
      if (g.tarz === 'dans') {
        g.faz += dt * 13.4;
        const v = g.instance.visual;
        v.position.y = Math.abs(Math.sin(g.faz)) * 0.22;
        v.rotation.z = Math.sin(g.faz / 2) * 0.14;
        v.rotation.y = Math.sin(g.faz / 4) * 0.7;
        g.instance.animator?.update?.(dt, { speed: 3.4, grounded: true });
      } else if (g.tarz === 'ayakta') {
        g.faz += dt;
        g.instance.animator?.update?.(dt, { speed: 0, grounded: true });
      }
    }
    if (durum.kaykay) {
      durum.kaykay.bekleme = Math.max(0, durum.kaykay.bekleme - dt);
      const pad = ctx.input.poll();
      if (pad.grabPressed && durum.kaykay.bekleme <= 0) kaykaydanIn();
    }
    if (durum.dans) {
      const sim = getSim();
      // An external jump (venue travel, QA teleport) releases the pin — only
      // the pin itself keeps the player within a step of the dance spot.
      if (Math.hypot(sim.pos.x - durum.dans.x, sim.pos.z - durum.dans.z) > 2.5) {
        dansiBirak();
      } else {
      durum.dans.sure += dt;
      const t = durum.dans.sure;
      sim.pos.x = durum.dans.x;
      sim.pos.z = durum.dans.z;
      sim.vel.x = 0; sim.vel.z = 0;
      const v = karakter?.visual;
      if (v) {
        // Beat at ~128bpm: bounce, sway, and quarter-turn hips; the walk
        // animator drives arms and legs like a fast step in place.
        const vurus = t * 13.4;
        v.position.y = Math.abs(Math.sin(vurus)) * 0.22;
        v.rotation.z = Math.sin(vurus / 2) * 0.14;
        v.rotation.y = Math.sin(vurus / 4) * 0.7;
      }
      karakter?.animator?.update?.(dt, { speed: 3.4, grounded: true });
      const pad = ctx.input.poll();
      if (Math.abs(pad.mx) > 0.3 || Math.abs(pad.my) > 0.3) dansiBirak();
      }
    }
    if (durum.oturan) {
      const sim = getSim();
      if (Math.hypot(sim.pos.x - durum.oturan.x, sim.pos.z - durum.oturan.z) > 2.5) {
        oturmayiBirak();
        return;
      }
      sim.pos.x = durum.oturan.x;
      sim.pos.z = durum.oturan.z;
      sim.pos.y = -0.2;
      sim.vel.x = 0; sim.vel.y = 0; sim.vel.z = 0;
      sim.grounded = true;
      const v = karakter?.visual;
      if (v) {
        // A seated read without rig surgery: sunk to the cushion, a light
        // recline against the sofa back.
        v.position.y = 0.34;
        v.rotation.x = -0.28;
      }
      const pad = ctx.input.poll();
      if (Math.abs(pad.mx) > 0.3 || Math.abs(pad.my) > 0.3) oturmayiBirak();
    }
    if (durum.uzanan) {
      if (Math.hypot(sim.pos.x - durum.uzanan.x, sim.pos.z - durum.uzanan.z) > 3.4) {
        uzanmayiBirak();
        return;
      }
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

  // The board opens anywhere, not only at the skatepark ring: B on a
  // keyboard, the BOARD touch button on a phone.
  window.addEventListener('keydown', (e) => {
    const hedefSerbest = e.target === document.body || e.target === window || e.target === document;
    if (e.code === 'KeyB' && !e.repeat && hedefSerbest) {
      if (durum.kaykay) kaykaydanIn(); else kaykayaBin();
    }
  });
  document.getElementById('btn-board')?.addEventListener('click', () => {
    if (durum.kaykay) kaykaydanIn(); else kaykayaBin();
  });

  // E is also the exit for swim/sunbed when standing at their markers — the
  // venue verb handler above toggles; movement handles the sunbed too.
}, { replay: true });
