// hava-durumu.js — weather over 67 Park.
//
// A slow cycle: sunny, then clouding over, then rain, then clearing. Rain is
// an instanced streak field that follows the player, the sky dims through
// fog and light changes, and a minute before the rain the phone gets a
// forecast alert — the real-life beat Oscar asked for.

import * as THREE from 'three';
import { registerHook } from '../core/registry.js';

const DURUMLAR = ['gunes', 'bulut', 'yagmur'];
// Long, calm phases; the QA hook can jump the clock.
const SURELER = { gunes: 190, bulut: 80, yagmur: 70 };
const UYARI_ONCESI = 45;   // alert this many seconds before the rain starts

export const havaDurumu = {
  simdiki: 'gunes',
  kalan: SURELER.gunes,
  uyariVerildi: false,
  mevsim: 'yaz',
  dinleyiciler: new Set(),
};

export const MEVSIMLER = ['yaz', 'sonbahar', 'kis', 'ilkbahar'];
const MEVSIM_SURESI = 480;   // eight minutes each, a full year every half hour

function duyur(tur, veri) {
  for (const fn of havaDurumu.dinleyiciler) {
    try { fn(tur, veri); } catch { /* dinleyici hatasi hava durumunu durdurmaz */ }
  }
}

registerHook('hub', (ctx, { scene, getSim }) => {
  // ---------- rain field ----------
  const DAMLA = 420;
  const damlaGeo = new THREE.BoxGeometry(0.02, 0.5, 0.02);
  const damlaMat = new THREE.MeshBasicMaterial({
    color: 0x9fc4e8, transparent: true, opacity: 0.0, depthWrite: false,
  });
  const damlalar = new THREE.InstancedMesh(damlaGeo, damlaMat, DAMLA);
  damlalar.name = 'hava:yagmur';
  damlalar.frustumCulled = false;
  const m = new THREE.Matrix4();
  const noktalar = [];
  for (let i = 0; i < DAMLA; i += 1) {
    noktalar.push({
      x: (Math.random() - 0.5) * 44,
      y: Math.random() * 18,
      z: (Math.random() - 0.5) * 44,
      hiz: 9 + Math.random() * 5,
    });
  }
  scene.add(damlalar);

  // The sky and light handles this module dims during weather.
  const sis = scene.fog;
  const acikSis = sis ? { near: sis.near, far: sis.far, renk: sis.color.getHex() } : null;

  let yagmurGucu = 0;   // 0..1, eased so changes roll in like weather does

  function hedefGuc() {
    return havaDurumu.simdiki === 'yagmur' ? 1 : 0;
  }

  function faziIlerlet() {
    const sirada = DURUMLAR[(DURUMLAR.indexOf(havaDurumu.simdiki) + 1) % DURUMLAR.length];
    havaDurumu.simdiki = sirada;
    havaDurumu.kalan = SURELER[sirada];
    havaDurumu.uyariVerildi = false;
    duyur('degisti', { durum: sirada });
    if (sirada === 'yagmur') {
      ctx.ui.toast('Rain over 67 Park.');
      ctx.bus.emit('sfx', 'splash');
    }
    if (sirada === 'gunes') ctx.ui.toast('The sun is back.');
  }

  ctx.loop.add((dt) => {
    havaDurumu.kalan -= dt;

    // The forecast alert lands on the phone before the rain itself.
    if (havaDurumu.simdiki === 'bulut'
      && !havaDurumu.uyariVerildi
      && havaDurumu.kalan <= UYARI_ONCESI) {
      havaDurumu.uyariVerildi = true;
      duyur('uyari', {
        mesaj: `Rain expected over the park in about ${Math.round(havaDurumu.kalan)} seconds.`,
      });
    }
    if (havaDurumu.kalan <= 0) faziIlerlet();

    // Ease the weather in and out.
    const hedef = hedefGuc();
    yagmurGucu += (hedef - yagmurGucu) * Math.min(1, dt * 0.7);
    const bulutlu = havaDurumu.simdiki !== 'gunes' ? 1 : 0;

    damlaMat.opacity = yagmurGucu * 0.55;
    if (sis && acikSis) {
      sis.near = acikSis.near - bulutlu * 26 - yagmurGucu * 18;
      sis.far = acikSis.far - bulutlu * 40 - yagmurGucu * 46;
      const gri = new THREE.Color(acikSis.renk).lerp(new THREE.Color(0x9aa6b5), Math.max(bulutlu * 0.4, yagmurGucu * 0.75));
      sis.color.copy(gri);
    }

    if (yagmurGucu > 0.01) {
      const sim = getSim();
      for (let i = 0; i < DAMLA; i += 1) {
        const n = noktalar[i];
        n.y -= n.hiz * dt;
        if (n.y < 0) {
          n.y = 15 + Math.random() * 4;
          n.x = (Math.random() - 0.5) * 44;
          n.z = (Math.random() - 0.5) * 44;
        }
        m.makeTranslation(sim.pos.x + n.x, n.y, sim.pos.z + n.z);
        damlalar.setMatrixAt(i, m);
      }
      damlalar.instanceMatrix.needsUpdate = true;
      damlalar.visible = true;
    } else {
      damlalar.visible = false;
    }
  });

  // ---------- seasons ----------
  // A season is a light-and-foliage read over the whole town: every greenish
  // material in the scene is collected once and eased toward the season's
  // leaf tone; winter swaps the rain field to slow white flakes.
  const yesiller = [];        // shared materials with green colours
  const yesilOrnekler = [];   // per-instance greens on instanced meshes
  {
    const gorulen = new Set();
    const yesilMi = (r, g, b) => g > r * 1.08 && g > b * 1.08 && g > 0.22;
    const c = new THREE.Color();
    scene.traverse((o) => {
      // The town tints its instanced foliage through instanceColor, not the
      // material, so both layers are collected.
      if (o.isInstancedMesh && o.instanceColor) {
        const dizi = { mesh: o, renkler: [] };
        for (let i = 0; i < o.count; i += 1) {
          c.fromBufferAttribute(o.instanceColor, i);
          if (yesilMi(c.r, c.g, c.b)) dizi.renkler.push({ i, asil: c.clone() });
        }
        if (dizi.renkler.length) yesilOrnekler.push(dizi);
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (!mat?.color || gorulen.has(mat)) continue;
        gorulen.add(mat);
        if (yesilMi(mat.color.r, mat.color.g, mat.color.b)) {
          yesiller.push({ mat, asil: mat.color.clone() });
        }
      }
    });
  }
  const MEVSIM_YAPRAK = {
    yaz: null,
    sonbahar: new THREE.Color(0xc9884f),
    kis: new THREE.Color(0xc3cbcd),
    ilkbahar: new THREE.Color(0x93cf7d),
  };
  let mevsimKalan = MEVSIM_SURESI;
  let yaprakKarisim = 0;
  let sonUygulanan = -1;
  let sonHedefRenk = null;
  const gecici = new THREE.Color();

  function mevsimUygula(dt) {
    const hedefRenk = MEVSIM_YAPRAK[havaDurumu.mevsim];
    const hedef = hedefRenk ? 1 : 0;
    yaprakKarisim += (hedef - yaprakKarisim) * Math.min(1, dt * 0.5);
    const degisti = Math.abs(yaprakKarisim - sonUygulanan) > 0.01
      || hedefRenk !== sonHedefRenk;
    if (degisti) {
      sonUygulanan = yaprakKarisim;
      sonHedefRenk = hedefRenk;
      const boya = hedefRenk || MEVSIM_YAPRAK.sonbahar;
      for (const y of yesiller) {
        y.mat.color.copy(y.asil);
        if (yaprakKarisim > 0.001) y.mat.color.lerp(boya, yaprakKarisim);
      }
      for (const dizi of yesilOrnekler) {
        for (const kayit of dizi.renkler) {
          gecici.copy(kayit.asil);
          if (yaprakKarisim > 0.001) gecici.lerp(boya, yaprakKarisim);
          dizi.mesh.setColorAt(kayit.i, gecici);
        }
        dizi.mesh.instanceColor.needsUpdate = true;
      }
    }
    // Winter turns the precipitation white and slow.
    const kis = havaDurumu.mevsim === 'kis';
    damlaMat.color.setHex(kis ? 0xffffff : 0x9fc4e8);
    for (const n of noktalar) n.hiz = kis ? 2.4 + (n.hiz % 1.6) : 9 + (n.hiz % 5);
  }

  function mevsimIlerlet() {
    const sirada = MEVSIMLER[(MEVSIMLER.indexOf(havaDurumu.mevsim) + 1) % MEVSIMLER.length];
    havaDurumu.mevsim = sirada;
    mevsimKalan = MEVSIM_SURESI;
    duyur('mevsim', { mevsim: sirada });
    const AD = { yaz: 'Summer', sonbahar: 'Autumn', kis: 'Winter', ilkbahar: 'Spring' };
    ctx.ui.toast(`${AD[sirada]} settles over 67 Park.`);
  }

  ctx.loop.add((dt) => {
    mevsimKalan -= dt;
    if (mevsimKalan <= 0) mevsimIlerlet();
    mevsimUygula(dt);
  });

  // Deterministic QA control. Keyed off the query — the QA object itself
  // arrives on a deferred chunk after this hook has already run.
  const qaModu = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('qa');
  if (qaModu) {
    window.__67VERSE_HAVA__ = {
      zorla(durum) {
        if (!DURUMLAR.includes(durum)) return false;
        havaDurumu.simdiki = durum;
        havaDurumu.kalan = SURELER[durum];
        havaDurumu.uyariVerildi = false;
        duyur('degisti', { durum });
        return true;
      },
      uyariTetikle() {
        duyur('uyari', { mesaj: 'Rain expected over the park in about 45 seconds.' });
        return true;
      },
      oku() {
        return { durum: havaDurumu.simdiki, kalan: Math.round(havaDurumu.kalan), mevsim: havaDurumu.mevsim, yesil: yesiller.length + yesilOrnekler.reduce((t, d) => t + d.renkler.length, 0) };
      },
      mevsimZorla(m) {
        if (!MEVSIMLER.includes(m)) return false;
        havaDurumu.mevsim = m;
        duyur('mevsim', { mevsim: m });
        return true;
      },
    };
  }
}, { replay: true });
