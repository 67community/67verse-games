// kaykay-tur.js — mount the board at the RIDE ring, prove the speed, see it.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const bas = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
  const birak = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
  const rapor = {};

  // yurume hizi olc
  qa.teleport(2, -28);
  qa.orient(0);
  setTimeout(() => { rapor.y0 = qa.player(); bas('KeyW'); }, 1200);
  setTimeout(() => { birak('KeyW'); rapor.y1 = qa.player(); }, 3200);
  // binis + surus hizi olc
  setTimeout(() => { qa.teleport(2, -33.5); bas('KeyE'); setTimeout(() => birak('KeyE'), 120); }, 3600);
  setTimeout(() => { qa.teleport(2, -28); qa.orient(0); rapor.k0 = qa.player(); bas('KeyW'); }, 4600);
  setTimeout(() => { birak('KeyW'); rapor.k1 = qa.player();
    rapor.yurume = +(rapor.y1.z - rapor.y0.z).toFixed(2);
    rapor.kaykay = +(rapor.k1.z - rapor.k0.z).toFixed(2);
    console.log('[kaykay-qa]', JSON.stringify(rapor.yurume + ' vs ' + rapor.kaykay));
  }, 6600);
  return 'armed';
})()
