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

  // 2) FAST: tek dokunus KILITLER (latch), ikincisi cozer. W ile 2sn yuru.
  setTimeout(() => { qa.teleport(0, -24); qa.orient(0); }, 3800);
  setTimeout(() => {
    const b = document.getElementById('btn-sprint');
    b?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    rapor.fastKilit = b?.classList.contains('on') ?? null;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    rapor.f0 = qa.player().z;
  }, 4400);
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    const b = document.getElementById('btn-sprint');
    b?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    rapor.fastCozuldu = b ? !b.classList.contains('on') : null;
    rapor.fastMesafe = +(qa.player().z - rapor.f0).toFixed(2);
  }, 6400);
  // referans: sprintsiz ayni sure
  setTimeout(() => { qa.teleport(0, -24); qa.orient(0); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); rapor.n0 = qa.player().z; }, 7000);
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    rapor.normalMesafe = +(qa.player().z - rapor.n0).toFixed(2);
  }, 9000);

  // 3) Duvara bastirirken kamera titremesi: kare-kare kamera deltasi kucuk
  // kalmali (pop = tek karede buyuk sicrama).
  setTimeout(() => {
    qa.teleport(-48.44, -43.8);
    qa.orient(Math.PI);           // otoparktaki sari arabaya kuzey yuruyus
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  }, 9400);
  let oncekiKamera = null;
  let enBuyukDelta = 0;
  const kameraOrnekle = setInterval(() => {
    const k = qa.camera().position;
    if (oncekiKamera) {
      const delta = Math.hypot(k[0] - oncekiKamera[0], k[1] - oncekiKamera[1], k[2] - oncekiKamera[2]);
      enBuyukDelta = Math.max(enBuyukDelta, delta);
    }
    oncekiKamera = k;
  }, 90);
  setTimeout(() => { oncekiKamera = null; enBuyukDelta = 0; }, 10600); // ilk carpma otursun
  setTimeout(() => {
    clearInterval(kameraOrnekle);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    rapor.kameraMaxDelta = +enBuyukDelta.toFixed(3);
    console.log('[son-qa]', JSON.stringify(rapor));
  }, 12800);
  return 'armed';
})()
