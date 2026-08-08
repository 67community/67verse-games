// telefon.js — the in-game phone.
//
// A real pocket phone for 67 Park: MESSAGES texts the collection characters
// on this device (they answer), CAMERA photographs the actual frame into a
// small gallery, WEATHER reads the live sky, and the rain alert lands here
// as a notification before the downpour. Opens from the floating button or
// the P key; Apple-plain, line icons only.

import { registerHook } from '../core/registry.js';
import { havaDurumu } from '../world/hava-durumu.js';

const KISILER = [
  { id: 'no67', ad: 'No. 67' },
  { id: 'no100', ad: 'No. 100' },
  { id: 'no500', ad: 'No. 500' },
  { id: 'no777', ad: 'No. 777' },
];
const YANITLAR = [
  'On my way to the funfair — race you there.',
  'The pool water is PERFECT today.',
  'Just lost at Hoop Shot again. Rematch?',
  'Meet me on the dance floor tonight.',
  'Did you see the new pieces at Boutique 67?',
  'Kart 67 lap record. It is mine now.',
];

const STIL = `
#tf-dugme { position: fixed; right: 18px; bottom: 18px; z-index: 90; width: 52px; height: 52px;
  border-radius: 16px; border: none; cursor: pointer; background: #17223a; color: #fff;
  box-shadow: 0 10px 26px #17223a66; display: flex; align-items: center; justify-content: center;
  transition: transform .12s; }
#tf-dugme:hover { transform: scale(1.06); }
#tf-dugme svg { width: 24px; height: 24px; }
#tf-rozet { position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px;
  border-radius: 9px; background: #d0584e; color: #fff; font-size: 11px; font-weight: 700;
  display: none; align-items: center; justify-content: center; padding: 0 4px; }
#tf-bildirim { position: fixed; right: 18px; bottom: 82px; z-index: 95; max-width: 300px;
  background: #fffffff2; border-radius: 14px; padding: 12px 14px; box-shadow: 0 14px 34px #0005;
  font-size: 13px; color: #17223a; display: none; }
#tf-bildirim b { display: block; font-size: 12px; letter-spacing: .04em; margin-bottom: 3px; }
#telefon { position: fixed; right: 18px; bottom: 82px; z-index: 96; width: 300px; height: 540px;
  background: #101623; border-radius: 34px; padding: 12px; box-shadow: 0 30px 70px #000a;
  display: none; font-family: inherit; }
#telefon.acik { display: block; }
#tf-ekran { width: 100%; height: 100%; background: #f4f6fa; border-radius: 24px; overflow: hidden;
  display: flex; flex-direction: column; }
#tf-ust { padding: 12px 14px 8px; display: flex; justify-content: space-between; align-items: center; }
#tf-saat { font-size: 12px; font-weight: 700; color: #17223a; }
#tf-kapat { border: none; background: none; cursor: pointer; color: #6b7280; font-size: 15px; }
#tf-icerik { flex: 1; overflow: auto; padding: 4px 12px 12px; }
.tf-baslik { font-size: 17px; font-weight: 800; color: #111827; margin: 4px 2px 10px; }
.tf-izgara { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.tf-app { background: #fff; border: none; border-radius: 16px; padding: 14px 10px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  box-shadow: 0 4px 14px #0000000d; font-size: 12.5px; font-weight: 650; color: #17223a; }
.tf-app svg { width: 26px; height: 26px; }
.tf-geri { border: none; background: none; color: #2d6cdf; font-weight: 650; font-size: 13px;
  cursor: pointer; padding: 2px; margin-bottom: 6px; }
.tf-kisi { width: 100%; text-align: left; background: #fff; border: none; border-radius: 12px;
  padding: 11px 12px; margin-bottom: 8px; cursor: pointer; font-size: 13.5px; font-weight: 650;
  color: #17223a; box-shadow: 0 3px 10px #0000000a; }
.tf-balon { max-width: 82%; border-radius: 14px; padding: 8px 11px; margin: 4px 0; font-size: 13px;
  line-height: 1.4; }
.tf-balon.ben { margin-left: auto; background: #2d6cdf; color: #fff; border-bottom-right-radius: 4px; }
.tf-balon.o { margin-right: auto; background: #e8ecf3; color: #17223a; border-bottom-left-radius: 4px; }
#tf-yaz { display: flex; gap: 6px; padding: 8px 10px; background: #fff; }
#tf-yaz input { flex: 1; border: 1px solid #dde3ec; border-radius: 999px; padding: 8px 12px;
  font-size: 13px; outline: none; }
#tf-yaz button { border: none; border-radius: 999px; background: #2d6cdf; color: #fff;
  padding: 8px 14px; font-weight: 650; font-size: 13px; cursor: pointer; }
.tf-foto { width: 100%; border-radius: 12px; margin-bottom: 8px; display: block; }
.tf-not { font-size: 12.5px; color: #6b7280; margin: 6px 2px; line-height: 1.5; }
.tf-buyuk { width: 100%; border: none; border-radius: 14px; background: #17223a; color: #fff;
  padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 4px; }
`;

const IKON = {
  telefon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M11 18.5h2"/></svg>',
  mesaj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2.4-2.7A8 8 0 1 1 21 12z"/></svg>',
  kamera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="14" r="3.4"/></svg>',
  hava: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17a5 5 0 1 1 1-9.9A6 6 0 1 1 18 17z"/><path d="M8 20.5v.01M12 21.5v.01M16 20.5v.01"/></svg>',
  galeri: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17.5 9.5 13l4 3.5 3-2.5 3.5 3"/></svg>',
};

registerHook('boot', (ctx) => {
  if (typeof document === 'undefined') return;
  const stil = document.createElement('style');
  stil.textContent = STIL;
  document.head.appendChild(stil);

  // ---------- state ----------
  const sohbetler = new Map(KISILER.map((k) => [k.id, []]));
  let okunmamis = 0;
  const fotolar = [];   // dataURL'ler, en yeni basta, en cok 10

  // ---------- floating button + notification ----------
  const dugme = document.createElement('button');
  dugme.id = 'tf-dugme';
  dugme.type = 'button';
  dugme.setAttribute('aria-label', 'Phone');
  dugme.innerHTML = `${IKON.telefon}<span id="tf-rozet"></span>`;
  document.body.appendChild(dugme);
  const rozet = dugme.querySelector('#tf-rozet');

  const bildirim = document.createElement('div');
  bildirim.id = 'tf-bildirim';
  document.body.appendChild(bildirim);
  let bildirimZaman = null;
  function bildirimGoster(baslik, mesaj) {
    bildirim.innerHTML = `<b>${baslik}</b>${mesaj}`;
    bildirim.style.display = 'block';
    clearTimeout(bildirimZaman);
    bildirimZaman = setTimeout(() => { bildirim.style.display = 'none'; }, 7000);
  }

  function rozetGuncelle() {
    rozet.style.display = okunmamis > 0 ? 'flex' : 'none';
    rozet.textContent = okunmamis > 9 ? '9+' : String(okunmamis);
  }

  // ---------- the phone ----------
  const telefon = document.createElement('div');
  telefon.id = 'telefon';
  telefon.innerHTML = `
    <div id="tf-ekran">
      <div id="tf-ust">
        <span id="tf-saat"></span>
        <button id="tf-kapat" type="button" aria-label="Close phone">Close</button>
      </div>
      <div id="tf-icerik"></div>
    </div>`;
  document.body.appendChild(telefon);
  const icerik = telefon.querySelector('#tf-icerik');
  const saatEl = telefon.querySelector('#tf-saat');
  setInterval(() => {
    const t = new Date();
    saatEl.textContent = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  }, 1000);

  function anaEkran() {
    okunmamis = 0;
    rozetGuncelle();
    icerik.innerHTML = '<div class="tf-baslik">67 Phone</div>';
    const izgara = document.createElement('div');
    izgara.className = 'tf-izgara';
    const uygulamalar = [
      ['Messages', IKON.mesaj, mesajlarEkrani],
      ['Camera', IKON.kamera, kameraEkrani],
      ['Weather', IKON.hava, havaEkrani],
      ['Photos', IKON.galeri, galeriEkrani],
    ];
    for (const [ad, ikon, ac] of uygulamalar) {
      const app = document.createElement('button');
      app.type = 'button';
      app.className = 'tf-app';
      app.innerHTML = `${ikon}<span>${ad}</span>`;
      app.addEventListener('click', ac);
      izgara.appendChild(app);
    }
    icerik.appendChild(izgara);
  }

  const geriDugme = (hedef) => {
    const g = document.createElement('button');
    g.type = 'button';
    g.className = 'tf-geri';
    g.textContent = 'Back';
    g.addEventListener('click', hedef);
    return g;
  };

  // ---------- Messages ----------
  function mesajlarEkrani() {
    icerik.innerHTML = '';
    icerik.append(geriDugme(anaEkran));
    const baslik = document.createElement('div');
    baslik.className = 'tf-baslik';
    baslik.textContent = 'Messages';
    icerik.appendChild(baslik);
    for (const kisi of KISILER) {
      const satir = document.createElement('button');
      satir.type = 'button';
      satir.className = 'tf-kisi';
      const son = sohbetler.get(kisi.id).at(-1);
      satir.innerHTML = `${kisi.ad}<br><span style="font-weight:400;color:#6b7280;font-size:12px;">${
        son ? son.metin.slice(0, 34) : 'Say hi'
      }</span>`;
      satir.addEventListener('click', () => sohbetEkrani(kisi));
      icerik.appendChild(satir);
    }
  }

  function sohbetEkrani(kisi) {
    icerik.innerHTML = '';
    icerik.append(geriDugme(mesajlarEkrani));
    const baslik = document.createElement('div');
    baslik.className = 'tf-baslik';
    baslik.textContent = kisi.ad;
    icerik.appendChild(baslik);
    const akis = document.createElement('div');
    icerik.appendChild(akis);
    const ciz = () => {
      akis.innerHTML = '';
      for (const m of sohbetler.get(kisi.id)) {
        const b = document.createElement('div');
        b.className = `tf-balon ${m.benden ? 'ben' : 'o'}`;
        b.textContent = m.metin;
        akis.appendChild(b);
      }
      akis.lastChild?.scrollIntoView?.({ block: 'nearest' });
    };
    ciz();
    const yaz = document.createElement('div');
    yaz.id = 'tf-yaz';
    const giris = document.createElement('input');
    giris.placeholder = 'Message';
    giris.maxLength = 90;
    const gonder = document.createElement('button');
    gonder.type = 'button';
    gonder.textContent = 'Send';
    const yolla = () => {
      const metin = giris.value.trim();
      if (!metin) return;
      giris.value = '';
      sohbetler.get(kisi.id).push({ benden: true, metin });
      ciz();
      setTimeout(() => {
        const yanit = YANITLAR[Math.floor(Math.random() * YANITLAR.length)];
        sohbetler.get(kisi.id).push({ benden: false, metin: yanit });
        if (telefon.classList.contains('acik')) ciz();
        else {
          okunmamis += 1;
          rozetGuncelle();
          bildirimGoster(kisi.ad, yanit);
        }
      }, 1400 + Math.random() * 1800);
    };
    gonder.addEventListener('click', yolla);
    giris.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') yolla();
    });
    giris.addEventListener('keyup', (e) => e.stopPropagation());
    yaz.append(giris, gonder);
    icerik.appendChild(yaz);
  }

  // ---------- Camera + Photos ----------
  function fotoCek() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    try {
      const kucuk = document.createElement('canvas');
      const oran = Math.min(1, 900 / canvas.width);
      kucuk.width = Math.round(canvas.width * oran);
      kucuk.height = Math.round(canvas.height * oran);
      kucuk.getContext('2d').drawImage(canvas, 0, 0, kucuk.width, kucuk.height);
      return kucuk.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }

  function kameraEkrani() {
    icerik.innerHTML = '';
    icerik.append(geriDugme(anaEkran));
    const baslik = document.createElement('div');
    baslik.className = 'tf-baslik';
    baslik.textContent = 'Camera';
    const not = document.createElement('p');
    not.className = 'tf-not';
    not.textContent = 'Frames the park exactly as you see it. Photos land in the gallery.';
    const cek = document.createElement('button');
    cek.type = 'button';
    cek.className = 'tf-buyuk';
    cek.textContent = 'Take photo';
    cek.addEventListener('click', () => {
      const foto = fotoCek();
      if (!foto) { ctx.ui.toast('The camera could not read the frame.'); return; }
      fotolar.unshift(foto);
      if (fotolar.length > 10) fotolar.pop();
      ctx.ui.toast('Saved to Photos.');
      galeriEkrani();
    });
    icerik.append(baslik, not, cek);
  }

  function galeriEkrani() {
    icerik.innerHTML = '';
    icerik.append(geriDugme(anaEkran));
    const baslik = document.createElement('div');
    baslik.className = 'tf-baslik';
    baslik.textContent = 'Photos';
    icerik.appendChild(baslik);
    if (!fotolar.length) {
      const bos = document.createElement('p');
      bos.className = 'tf-not';
      bos.textContent = 'No photos yet — the camera is one tap away.';
      icerik.appendChild(bos);
      return;
    }
    for (const f of fotolar) {
      const img = document.createElement('img');
      img.src = f;
      img.className = 'tf-foto';
      img.alt = 'Park photo';
      icerik.appendChild(img);
    }
  }

  // ---------- Weather ----------
  const DURUM_AD = { gunes: 'Sunny', bulut: 'Clouding over', yagmur: 'Raining' };
  function havaEkrani() {
    icerik.innerHTML = '';
    icerik.append(geriDugme(anaEkran));
    const baslik = document.createElement('div');
    baslik.className = 'tf-baslik';
    baslik.textContent = 'Weather';
    const simdiki = document.createElement('p');
    simdiki.className = 'tf-not';
    simdiki.style.fontSize = '15px';
    const detay = document.createElement('p');
    detay.className = 'tf-not';
    const tazele = () => {
      simdiki.textContent = `67 Park — ${DURUM_AD[havaDurumu.simdiki] || havaDurumu.simdiki}`;
      detay.textContent = `Next change in about ${Math.max(0, Math.round(havaDurumu.kalan))} seconds.`;
    };
    tazele();
    const zaman = setInterval(() => {
      if (!document.body.contains(simdiki)) { clearInterval(zaman); return; }
      tazele();
    }, 1000);
    icerik.append(baslik, simdiki, detay);
  }

  // ---------- open/close ----------
  function ac() {
    telefon.classList.add('acik');
    anaEkran();
  }
  function kapat() { telefon.classList.remove('acik'); }
  dugme.addEventListener('click', () => {
    if (telefon.classList.contains('acik')) kapat(); else ac();
  });
  telefon.querySelector('#tf-kapat').addEventListener('click', kapat);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && !e.repeat && e.target === document.body) {
      if (telefon.classList.contains('acik')) kapat(); else ac();
    }
  });

  // ---------- weather alerts land on the phone ----------
  havaDurumu.dinleyiciler.add((tur, veri) => {
    if (tur === 'uyari') {
      okunmamis += 1;
      rozetGuncelle();
      bildirimGoster('Weather', veri.mesaj);
      ctx.bus.emit('sfx', 'notify');
    }
  });
});
