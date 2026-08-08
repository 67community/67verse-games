// basket-atisi.js — the old-school hoop shot on the town court.
//
// Oscar's mechanic: E at the free-throw ring starts it; a power line sweeps
// and you press SPACE to freeze it — land inside the band and the ball drops
// through the hoop. Five shots each against a rival from the collection,
// alternating turns like a real shoot-out; the scoreboard settles it and the
// winner takes the bigger coin purse.

import * as THREE from 'three';
import { createFriendsieRival } from '../core/friendsie-bot.js';
import { commitLocalGameReward } from '../core/game-result.js';

const RIM = { x: -36, y: 2.62, z: -5.9 };
const ATIS_NOKTASI = { x: -36, z: -1.7 };
const RAKIP_NOKTASI = { x: -34.4, z: -2.1 };
const TUR_SAYISI = 5;

export function kurBasketAtisi({ ctx, scene, getSim }) {
  let aktif = null;   // the running challenge
  let rakip = null;   // friendsie instance, spawned on first play

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xe08a3c, roughness: 0.55 }),
  );
  top.visible = false;
  scene.add(top);

  function olcekKur() {
    const kok = document.createElement('div');
    kok.style.cssText = 'position:fixed;left:50%;bottom:60px;transform:translateX(-50%);'
      + 'z-index:120;background:#ffffffee;border-radius:16px;padding:12px 16px;'
      + 'box-shadow:0 12px 34px #0004;text-align:center;font-family:inherit;';
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
    c.fillStyle = '#e8b64a55';
    const b0 = 0.60, b1 = 0.80;
    c.fillRect(canvas.width * b0, 8, canvas.width * (b1 - b0), 24);
    c.fillStyle = '#c8892f';
    c.fillRect(canvas.width * 0.695, 6, 3, 28);
    c.fillStyle = '#17223a';
    c.fillRect(canvas.width * deger - 2, 2, 4, 36);
  }

  function atisiCoz(deger) {
    const sapma = Math.abs(deger - 0.70);
    if (sapma <= 0.045) return 'swish';
    if (sapma <= 0.105) return Math.random() < 0.5 ? 'rim-in' : 'rim-out';
    return 'miss';
  }

  // The ball flies a scripted arc; a make drops through the rim, a miss
  // clips the iron and bounces off court.
  function topuFirlat(cikis, sonuc, bitti) {
    const p0 = new THREE.Vector3(cikis.x, 1.15, cikis.z);
    const hedef = new THREE.Vector3(RIM.x, RIM.y + 0.15, RIM.z);
    if (sonuc === 'miss') hedef.add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.3, 0.5));
    if (sonuc === 'rim-out') hedef.add(new THREE.Vector3(0.3, 0.12, 0.12));
    const tepe = p0.clone().lerp(hedef, 0.55);
    tepe.y = Math.max(p0.y, hedef.y) + 1.6;
    let t = 0;
    top.visible = true;
    const kaldir = ctx.loop.add((dt) => {
      t += dt / 0.85;
      if (t >= 1) {
        kaldir();
        if (sonuc === 'swish' || sonuc === 'rim-in') {
          // drop through the net line
          let u = 0;
          const dusus = ctx.loop.add((dt2) => {
            u += dt2 * 3;
            top.position.set(RIM.x, RIM.y + 0.15 - u * 1.1, RIM.z);
            if (u >= 1) { dusus(); top.visible = false; bitti(); }
          });
        } else {
          top.visible = false;
          bitti();
        }
        return;
      }
      const a = p0.clone().lerp(tepe, t);
      const b = tepe.clone().lerp(hedef, t);
      top.position.copy(a.lerp(b, t));
    });
  }

  function sonucPaneli(sen, rakipSkor) {
    const kazandin = sen > rakipSkor;
    const berabere = sen === rakipSkor;
    const coins = kazandin ? 30 : berabere ? 15 : 10;
    const result = commitLocalGameReward(ctx.save, {
      gameId: 'hoop-shot', coins, score: sen,
    }, 'hoop-shot');
    const p = ctx.ui.panel({ title: 'Hoop Shot' });
    const baslik = document.createElement('p');
    baslik.style.cssText = 'font-size:19px;font-weight:700;margin:0 0 10px;';
    baslik.textContent = kazandin ? 'You take the court' : berabere ? 'Dead even' : 'The rival edges it';
    const skor = document.createElement('p');
    skor.style.cssText = 'font-size:15px;margin:0 0 12px;';
    skor.textContent = `You ${sen} — ${rakipSkor} No. 500`;
    const odul = document.createElement('p');
    odul.style.cssText = 'margin:0 0 14px;color:#6b7280;font-size:13px;';
    odul.textContent = result.rewardCommitted ? `+${coins} coins` : 'Coins could not be saved.';
    p.body.append(baslik, skor, odul);
    p.body.appendChild(ctx.ui.button('Done', () => p.close(), { primary: true }));
  }

  async function baslat() {
    if (aktif) return;
    if (!rakip) {
      rakip = await createFriendsieRival('friendsie:fr_500.glb', { height: 1.8 });
      if (rakip) {
        rakip.root.position.set(RAKIP_NOKTASI.x, 0, RAKIP_NOKTASI.z);
        scene.add(rakip.root);
      }
    }
    const sim = getSim();
    sim.pos.x = ATIS_NOKTASI.x;
    sim.pos.z = ATIS_NOKTASI.z;
    sim.vel.x = 0; sim.vel.z = 0;

    const ui = olcekKur();
    aktif = {
      ui, tur: 1, sen: 0, rakipSkor: 0, faz: 0, kilit: false, sira: 'sen', bekle: 0,
    };
    ui.baslikEl.textContent = `SHOT 1/${TUR_SAYISI} — you`;
    ctx.ui.toast('Hoop Shot — freeze the line in the gold band.');

    const tusYakala = (e) => {
      if (!aktif) return;
      if (e.code === 'Escape') { e.stopPropagation(); bitir(); return; }
      if (e.code !== 'Space' || aktif.sira !== 'sen' || aktif.kilit) return;
      e.stopPropagation();
      e.preventDefault();
      aktif.kilit = true;
      const deger = aktif.deger;
      const sonuc = atisiCoz(deger);
      const isabet = sonuc === 'swish' || sonuc === 'rim-in';
      if (window.__67VERSE_QA__) console.log('[basket-qa]', JSON.stringify({ tur: aktif.tur, deger: +deger.toFixed(3), sonuc }));
      topuFirlat(ATIS_NOKTASI, sonuc, () => {
        if (!aktif) return;
        if (isabet) aktif.sen += 1;
        ctx.ui.toast(sonuc === 'swish' ? 'SWISH.' : isabet ? 'Off the rim — in.' : 'No good.');
        aktif.sira = 'rakip';
        aktif.bekle = 0.7;
      });
    };
    window.addEventListener('keydown', tusYakala, true);
    aktif.tusYakala = tusYakala;

    aktif.kaldir = ctx.loop.add((dt) => {
      if (!aktif) return;
      const a = aktif;
      if (a.sira === 'sen' && !a.kilit) {
        a.faz += dt * 1.9;
        const ping = a.faz % 2;
        a.deger = ping < 1 ? ping : 2 - ping;
        olcekCiz(a.ui, a.deger);
      }
      if (a.sira === 'rakip' && a.bekle > 0) {
        a.bekle -= dt;
        if (a.bekle <= 0) {
          const sonuc = Math.random() < 0.55 ? (Math.random() < 0.6 ? 'swish' : 'rim-in') : 'miss';
          const isabet = sonuc !== 'miss';
          a.ui.baslikEl.textContent = `SHOT ${a.tur}/${TUR_SAYISI} — No. 500`;
          topuFirlat(RAKIP_NOKTASI, sonuc, () => {
            if (!aktif) return;
            if (isabet) aktif.rakipSkor += 1;
            aktif.tur += 1;
            if (aktif.tur > TUR_SAYISI) { bitir(true); return; }
            aktif.sira = 'sen';
            aktif.kilit = false;
            aktif.faz = 0;
            aktif.ui.baslikEl.textContent = `SHOT ${aktif.tur}/${TUR_SAYISI} — you`;
          });
          a.sira = 'rakip-atiyor';
        }
      }
    });

    function bitir(tamamlandi = false) {
      if (!aktif) return;
      const { sen, rakipSkor } = aktif;
      window.removeEventListener('keydown', aktif.tusYakala, true);
      aktif.kaldir();
      aktif.ui.kok.remove();
      aktif = null;
      top.visible = false;
      if (tamamlandi) sonucPaneli(sen, rakipSkor);
      else ctx.ui.toast('Left the court.');
    }
  }

  return { baslat };
}
