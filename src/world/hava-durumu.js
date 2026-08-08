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
  dinleyiciler: new Set(),
};

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
        return { durum: havaDurumu.simdiki, kalan: Math.round(havaDurumu.kalan) };
      },
    };
  }
});
