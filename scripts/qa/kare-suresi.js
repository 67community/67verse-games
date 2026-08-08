// kare-suresi.js — frame-time histogram while walking, then again while
// pressing the touch controls. A phone-only freeze shows up here as a long
// tail once the CPU is throttled.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.player && Date.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const rapor = {};

  const olc = async (etiket, sure = 2500) => {
    const sureler = [];
    let once = performance.now();
    let calisiyor = true;
    const tik = () => {
      const simdi = performance.now();
      sureler.push(simdi - once);
      once = simdi;
      if (calisiyor) requestAnimationFrame(tik);
    };
    requestAnimationFrame(tik);
    await new Promise((r) => setTimeout(r, sure));
    calisiyor = false;
    sureler.sort((a, b) => a - b);
    const p = (q) => +(sureler[Math.floor(sureler.length * q)] || 0).toFixed(1);
    rapor[etiket] = { kare: sureler.length, ort: +(sureler.reduce((a, b) => a + b, 0) / sureler.length).toFixed(1), p50: p(0.5), p95: p(0.95), enKotu: +(sureler[sureler.length - 1] || 0).toFixed(1) };
  };

  // Downtown, where the block count and the window count are highest.
  qa.teleport(-2, 6);
  qa.orient(Math.PI);
  await olc('duruyor');

  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  await olc('yuruyor');
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

  // Press each control mid-walk, the way a player actually does.
  const bas = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 3,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', o)), 120);
  };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  bas('btn-sprint');
  setTimeout(() => bas('btn-jump'), 700);
  setTimeout(() => bas('btn-board'), 1500);
  await olc('basarken');
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

  console.log('[kare-qa]', JSON.stringify(rapor));
  return 'armed';
})()
