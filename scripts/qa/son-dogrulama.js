// son-dogrulama.js — bowl descent, FAST via pointer, water motion, HUD fit.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const rapor = {};

  // 1) 67 bowl merkezine isinlan — y CUKURA inmeli (slab 0.44'un altina).
  // Merkez SKATE_BOWL outline centroid'i: (-7.53, -42.73), taban FLOOR_Y=0.02.
  qa.teleport(-7.53, -42.73);
  setTimeout(() => { rapor.bowlY = qa.player().y; }, 1500);
  // 1b) Cukurdan cikip guverteye tirman: kuzeye yuru + zipla — deck 0.44'e donmeli.
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })), 500);
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 620);
  }, 1600);
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    rapor.cikisY = +qa.player().y.toFixed(2);
  }, 3400);

  // 2) FAST: pointerdown ile bas, W ile 2sn yuru, hiz olc.
  setTimeout(() => { qa.teleport(0, -24); qa.orient(0); }, 3800);
  setTimeout(() => {
    const b = document.getElementById('btn-sprint');
    b?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    rapor.f0 = qa.player().z;
  }, 4400);
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    document.getElementById('btn-sprint')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    rapor.fastMesafe = +(qa.player().z - rapor.f0).toFixed(2);
  }, 6400);
  // referans: sprintsiz ayni sure
  setTimeout(() => { qa.teleport(0, -24); qa.orient(0); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); rapor.n0 = qa.player().z; }, 7000);
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    rapor.normalMesafe = +(qa.player().z - rapor.n0).toFixed(2);
    console.log('[son-qa]', JSON.stringify(rapor));
  }, 9000);
  return 'armed';
})()
