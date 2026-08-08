// arcade-oyunlar.js — the games inside the arcade cabinets.
//
// E at a cabinet opens one of these: a full-screen canvas the machine "plays"
// on, thirty seconds, one score, coins on a good run. They are deliberately
// one-input micro games — hop over the blocks, or switch lanes away from
// them — in the same pastel language as the hall.

import { commitLocalGameReward } from '../core/game-result.js';

const RENK = {
  zemin: '#f3ede1', cizgi: '#e0d5c4', oyuncu: '#5a9cd8',
  engel: '#e8827c', engel2: '#7fbf8e', metin: '#17223a', altin: '#c8892f',
};

// One shared shell: canvas + HUD + loop + input + countdown + result.
function mikroOyunKabuk({ ctx, baslik, ipucu, kur }) {
  const kok = document.createElement('div');
  kok.style.cssText = 'position:fixed;inset:0;z-index:130;background:#17223aee;'
    + 'display:flex;align-items:center;justify-content:center;font-family:inherit;';
  const cerceve = document.createElement('div');
  cerceve.style.cssText = 'background:#fff;border-radius:22px;padding:18px 18px 14px;'
    + 'box-shadow:0 30px 80px #0008;text-align:center;max-width:calc(100vw - 16px);';
  const ust = document.createElement('div');
  ust.style.cssText = 'display:flex;justify-content:space-between;align-items:center;'
    + 'margin:0 4px 10px;font-weight:700;color:#17223a;';
  const ad = document.createElement('span');
  ad.textContent = baslik;
  const skorEl = document.createElement('span');
  skorEl.style.cssText = 'font-variant-numeric:tabular-nums;';
  skorEl.textContent = '0';
  ust.append(ad, skorEl);
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 400;
  // Internal resolution stays 640x400; CSS scales it into small screens.
  canvas.style.cssText = 'border-radius:14px;display:block;width:min(640px, calc(100vw - 64px));height:auto;';
  const alt = document.createElement('p');
  alt.style.cssText = 'margin:10px 0 0;font-size:12.5px;color:#6b7280;';
  alt.textContent = ipucu;
  cerceve.append(ust, canvas, alt);
  kok.appendChild(cerceve);
  document.body.appendChild(kok);

  const c = canvas.getContext('2d');
  let bitti = false;
  let raf = 0;
  const oyun = { skor: 0, sure: 30, canvas, c };

  const kapat = () => {
    if (bitti) return;
    bitti = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', tusYakala, true);
    kok.remove();
  };

  const bitir = () => {
    if (bitti) return;
    const coins = Math.min(40, Math.max(5, Math.round(oyun.skor / 2)));
    const result = commitLocalGameReward(ctx.save, {
      gameId: baslik === 'SKY HOP' ? 'arcade-hop' : 'arcade-dodge',
      coins,
      score: oyun.skor,
    }, 'arcade-machine');
    kapat();
    ctx.ui.toast(result.rewardCommitted
      ? `${baslik}: ${oyun.skor} points — +${coins} coins.`
      : `${baslik}: ${oyun.skor} points.`);
  };

  const adim = kur(oyun);
  let son = 0;
  const dongu = (now) => {
    if (bitti) return;
    raf = requestAnimationFrame(dongu);
    const dt = Math.min(son ? (now - son) / 1000 : 1 / 60, 0.05);
    son = now;
    oyun.sure -= dt;
    if (oyun.sure <= 0) { bitir(); return; }
    adim(dt);
    skorEl.textContent = `${oyun.skor} · ${Math.ceil(oyun.sure)}s`;
  };
  const tusYakala = (e) => {
    if (e.code === 'Escape') { e.stopPropagation(); bitir(); return; }
    if (['Space', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyW', 'ArrowUp'].includes(e.code)) {
      e.stopPropagation();
      e.preventDefault();
      oyun.tus?.(e.code);
    }
  };
  window.addEventListener('keydown', tusYakala, true);
  canvas.addEventListener('pointerdown', () => oyun.tus?.('Space'));
  raf = requestAnimationFrame(dongu);
  return { kapat: bitir };
}

// SKY HOP — one button: hop the runner over the incoming blocks.
function skyHop(ctx) {
  return mikroOyunKabuk({
    ctx,
    baslik: 'SKY HOP',
    ipucu: 'Space / tap to hop the blocks. Esc ends the run.',
    kur(oyun) {
      const { c, canvas } = oyun;
      const yer = 320;
      const kosucu = { x: 110, y: yer, vy: 0 };
      let engeller = [];
      let sonrakiEngel = 0.8;
      let hiz = 240;
      oyun.tus = (kod) => {
        if (kod === 'Space' || kod === 'KeyW' || kod === 'ArrowUp') {
          if (kosucu.y >= yer - 0.5) kosucu.vy = -560;
        }
      };
      return (dt) => {
        hiz += dt * 6;
        sonrakiEngel -= dt;
        if (sonrakiEngel <= 0) {
          sonrakiEngel = 0.75 + Math.random() * 0.7;
          engeller.push({ x: canvas.width + 30, g: 26 + Math.random() * 26 });
        }
        kosucu.vy += 1500 * dt;
        kosucu.y = Math.min(yer, kosucu.y + kosucu.vy * dt);
        for (const e of engeller) e.x -= hiz * dt;
        for (const e of engeller) {
          if (!e.gecti && e.x + e.g < kosucu.x - 18) { e.gecti = true; oyun.skor += 5; }
          const carpti = Math.abs((e.x + e.g / 2) - kosucu.x) < e.g / 2 + 16
            && kosucu.y > yer - 34;
          if (carpti) {
            oyun.skor = Math.max(0, oyun.skor - 8);
            e.gecti = true;
            e.x = -100;
          }
        }
        engeller = engeller.filter((e) => e.x > -90);

        c.fillStyle = RENK.zemin;
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.fillStyle = RENK.cizgi;
        c.fillRect(0, yer + 22, canvas.width, 6);
        c.fillStyle = RENK.oyuncu;
        c.beginPath();
        c.roundRect(kosucu.x - 16, kosucu.y - 34, 32, 40, 10);
        c.fill();
        c.fillStyle = RENK.engel;
        for (const e of engeller) {
          c.beginPath();
          c.roundRect(e.x, yer - 8, e.g, 30, 8);
          c.fill();
        }
      };
    },
  });
}

// DODGE 67 — three lanes, blocks rain down, step out of their way.
function dodge67(ctx) {
  return mikroOyunKabuk({
    ctx,
    baslik: 'DODGE 67',
    ipucu: 'Left / right (A-D) to change lane. Esc ends the run.',
    kur(oyun) {
      const { c, canvas } = oyun;
      const seritX = [160, 320, 480];
      let serit = 1;
      let bloklar = [];
      let sonraki = 0.7;
      let hiz = 250;
      oyun.tus = (kod) => {
        if (kod === 'ArrowLeft' || kod === 'KeyA') serit = Math.max(0, serit - 1);
        if (kod === 'ArrowRight' || kod === 'KeyD') serit = Math.min(2, serit + 1);
        if (kod === 'Space') serit = (serit + 1) % 3;
      };
      return (dt) => {
        hiz += dt * 8;
        sonraki -= dt;
        if (sonraki <= 0) {
          sonraki = 0.55 + Math.random() * 0.5;
          bloklar.push({ serit: Math.floor(Math.random() * 3), y: -40 });
        }
        for (const b of bloklar) b.y += hiz * dt;
        for (const b of bloklar) {
          if (!b.islendi && b.y > 330) {
            b.islendi = true;
            if (b.serit === serit) oyun.skor = Math.max(0, oyun.skor - 8);
            else oyun.skor += 4;
          }
        }
        bloklar = bloklar.filter((b) => b.y < canvas.height + 60);

        c.fillStyle = RENK.zemin;
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.strokeStyle = RENK.cizgi;
        c.lineWidth = 4;
        for (const x of [240, 400]) {
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x, canvas.height); c.stroke();
        }
        c.fillStyle = RENK.oyuncu;
        c.beginPath();
        c.roundRect(seritX[serit] - 22, 330, 44, 44, 12);
        c.fill();
        c.fillStyle = RENK.engel2;
        for (const b of bloklar) {
          c.beginPath();
          c.roundRect(seritX[b.serit] - 24, b.y, 48, 34, 10);
          c.fill();
        }
      };
    },
  });
}

export function acMikroOyun(id, ctx) {
  if (id === 'arcade-hop') return skyHop(ctx);
  if (id === 'arcade-dodge') return dodge67(ctx);
  return null;
}
