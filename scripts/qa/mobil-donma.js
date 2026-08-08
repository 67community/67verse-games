// mobil-donma.js — press every touch control and watch whether the frame loop
// keeps ticking. A freeze shows up as the RAF counter flatlining after a press.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.player && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const rapor = { hatalar: [] };
  window.addEventListener('error', (e) => rapor.hatalar.push(String(e.message).slice(0, 120)));
  window.addEventListener('unhandledrejection', (e) => rapor.hatalar.push('rej: ' + String(e.reason).slice(0, 120)));

  // Independent RAF counter: if the app's loop dies, this keeps running, so
  // the app's own progress is measured through the player clock instead.
  let kare = 0;
  const say = () => { kare += 1; requestAnimationFrame(say); };
  requestAnimationFrame(say);

  const dokun = (id) => {
    const el = document.getElementById(id);
    if (!el) return 'YOK';
    const r = el.getBoundingClientRect();
    const ortak = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', ortak));
    setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', ortak)), 140);
    return 'ok';
  };

  const olc = async (etiket, id) => {
    const kare0 = kare;
    const sonuc = dokun(id);
    await new Promise((r) => setTimeout(r, 900));
    rapor[etiket] = { dokunma: sonuc, kare: kare - kare0 };
  };

  await olc('board', 'btn-board');
  await olc('fast', 'btn-sprint');
  await olc('jump', 'btn-jump');
  await olc('telefon', 'tf-dugme');

  // Bare screen tap (camera look) on the right half — the drag path.
  const kare0 = kare;
  const opt = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 9,
    clientX: innerWidth * 0.75, clientY: innerHeight * 0.5 };
  window.dispatchEvent(new PointerEvent('pointerdown', opt));
  window.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: innerWidth * 0.6 }));
  window.dispatchEvent(new PointerEvent('pointerup', opt));
  await new Promise((r) => setTimeout(r, 900));
  rapor.ekranSurukle = { kare: kare - kare0 };

  rapor.oyuncu = qa.player();
  console.log('[donma-qa]', JSON.stringify(rapor));
  return 'armed';
})()
