// futbol-atisi.js — the goal shot on the stadium pitch.
//
// Same power-line family as Hoop Shot, football edition: E at the penalty
// ring, the line sweeps, SPACE freezes it — inside the gold band the ball
// flies low and hard into the south goal, outside it sails wide. Five shots,
// a score line, coins for a clean sheet of goals.

import * as THREE from 'three';
import { commitLocalGameReward } from '../core/game-result.js';
import { STADIUM_PITCH } from './stadium.js';

const KALE = { x: STADIUM_PITCH.x, y: 0.62, z: STADIUM_PITCH.z + 9.6 };
const ATIS = { x: STADIUM_PITCH.x, z: STADIUM_PITCH.z + 5.2 };
const TUR_SAYISI = 5;

export function kurFutbolAtisi({ ctx, scene, getSim }) {
  let aktif = null;

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf6f2ec, roughness: 0.4 }),
  );
  top.visible = false;
  scene.add(top);

  function olcekKur() {
    const kok = document.createElement('div');
    kok.style.cssText = 'position:fixed;left:50%;bottom:60px;transform:translateX(-50%);'
      + 'z-index:120;background:#ffffffee;border-radius:16px;padding:12px 16px;'
      + 'box-shadow:0 12px 34px #0004;text-align:center;font-family:inherit;'
      + 'max-width:calc(100vw - 16px);';
    if (matchMedia('(max-width: 600px)').matches) {
      kok.style.bottom = 'calc(env(safe-area-inset-bottom) + 136px)';
    }
    const baslikEl = document.createElement('div');
    baslikEl.style.cssText = 'font-weight:700;font-size:13px;color:#17223a;margin-bottom:8px;';
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 40;
    canvas.style.cssText = 'display:block;border-radius:10px;';
    const ipucu = document.createElement('div');
    ipucu.style.cssText = 'font-size:11.5px;color:#6b7280;margin-top:7px;';
    ipucu.textContent = 'SPACE — freeze the line inside the gold band';
    kok.append(baslikEl, canvas, ipucu);
    document.body.appendChild(kok);
    return { kok, canvas, c: canvas.getContext('2d'), baslikEl };
  }

  function olcekCiz(ui, deger) {
    const { c, canvas } = ui;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#eef1f6';
    c.beginPath(); c.roundRect(0, 8, canvas.width, 24, 12); c.fill();
    c.fillStyle = '#93bd8a66';
    c.fillRect(canvas.width * 0.58, 8, canvas.width * 0.24, 24);
    c.fillStyle = '#5a9c7a';
    c.fillRect(canvas.width * 0.695, 6, 3, 28);
    c.fillStyle = '#17223a';
    c.fillRect(canvas.width * deger - 2, 2, 4, 36);
  }

  function atisiCoz(deger) {
    const sapma = Math.abs(deger - 0.70);
    if (sapma <= 0.05) return 'gol';
    if (sapma <= 0.115) return Math.random() < 0.5 ? 'gol' : 'direk';
    return 'disari';
  }

  function topuVur(sonuc, bitti) {
    const p0 = new THREE.Vector3(ATIS.x, 0.22, ATIS.z);
    const hedef = new THREE.Vector3(KALE.x, KALE.y, KALE.z);
    if (sonuc === 'disari') hedef.add(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (1.9 + Math.random()), 0.5, 0.6));
    if (sonuc === 'direk') hedef.add(new THREE.Vector3(Math.random() < 0.5 ? -1.32 : 1.32, 0.45, 0));
    const tepe = p0.clone().lerp(hedef, 0.5);
    tepe.y = 1.15;
    let t = 0;
    top.visible = true;
    const kaldir = ctx.loop.add((dt) => {
      t += dt / 0.55;
      if (t >= 1) {
        kaldir();
        top.visible = false;
        bitti();
        return;
      }
      const a = p0.clone().lerp(tepe, t);
      const b = tepe.clone().lerp(hedef, t);
      top.position.copy(a.lerp(b, t));
    });
  }

  function sonucPaneli(gol) {
    const coins = 8 + gol * 8;
    const result = commitLocalGameReward(ctx.save, {
      gameId: 'goal-shot', coins, score: gol,
    }, 'goal-shot');
    const p = ctx.ui.panel({ title: 'Goal Shot' });
    const baslik = document.createElement('p');
    baslik.style.cssText = 'font-size:19px;font-weight:700;margin:0 0 10px;';
    baslik.textContent = gol >= 4 ? 'Clinical.' : gol >= 2 ? 'Decent boots.' : 'The keeper thanks you.';
    const skor = document.createElement('p');
    skor.style.cssText = 'font-size:15px;margin:0 0 12px;';
    skor.textContent = `${gol}/${TUR_SAYISI} in the net`;
    const odul = document.createElement('p');
    odul.style.cssText = 'margin:0 0 14px;color:#6b7280;font-size:13px;';
    odul.textContent = result.rewardCommitted ? `+${coins} coins` : 'Coins could not be saved.';
    p.body.append(baslik, skor, odul);
    p.body.appendChild(ctx.ui.button('Done', () => p.close(), { primary: true }));
  }

  function baslat() {
    if (aktif) return;
    const sim = getSim();
    sim.pos.x = ATIS.x;
    sim.pos.z = ATIS.z;
    sim.vel.x = 0; sim.vel.z = 0;

    const ui = olcekKur();
    aktif = { ui, tur: 1, gol: 0, faz: 0, kilit: false };
    ui.baslikEl.textContent = `SHOT 1/${TUR_SAYISI}`;
    ctx.ui.toast('Goal Shot — freeze the line in the band.');

    const tusYakala = (e) => {
      if (!aktif) return;
      if (e.code === 'Escape') { e.stopPropagation(); bitir(false); return; }
      if (e.code !== 'Space' || aktif.kilit) return;
      e.stopPropagation();
      e.preventDefault();
      aktif.kilit = true;
      const sonuc = atisiCoz(aktif.deger);
      if (window.__67VERSE_QA__) console.log('[futbol-qa]', JSON.stringify({ tur: aktif.tur, deger: +aktif.deger.toFixed(3), sonuc }));
      topuVur(sonuc, () => {
        if (!aktif) return;
        if (sonuc === 'gol') aktif.gol += 1;
        ctx.ui.toast(sonuc === 'gol' ? 'GOAL.' : sonuc === 'direk' ? 'Off the post.' : 'Wide.');
        aktif.tur += 1;
        if (aktif.tur > TUR_SAYISI) { bitir(true); return; }
        aktif.kilit = false;
        aktif.faz = 0;
        aktif.ui.baslikEl.textContent = `SHOT ${aktif.tur}/${TUR_SAYISI}`;
      });
    };
    window.addEventListener('keydown', tusYakala, true);
    aktif.tusYakala = tusYakala;

    aktif.kaldir = ctx.loop.add((dt) => {
      if (!aktif || aktif.kilit) return;
      aktif.faz += dt * 2.1;
      const ping = aktif.faz % 2;
      aktif.deger = ping < 1 ? ping : 2 - ping;
      olcekCiz(aktif.ui, aktif.deger);
    });

    function bitir(tamamlandi) {
      if (!aktif) return;
      const { gol } = aktif;
      window.removeEventListener('keydown', aktif.tusYakala, true);
      aktif.kaldir();
      aktif.ui.kok.remove();
      aktif = null;
      top.visible = false;
      if (tamamlandi) sonucPaneli(gol);
      else ctx.ui.toast('Left the pitch.');
    }
  }

  return { baslat };
}
