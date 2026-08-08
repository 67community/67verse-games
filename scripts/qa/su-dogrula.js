// su-dogrula.js — proves the water actually moves (two pixel-region hashes a
// second apart over the pond, camera frozen) and that a walking character is
// mid-stride at the 8s screenshot.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const rapor = {};

  // Pond at (30,33): stand on the west lip, face +x so water fills mid-frame.
  qa.teleport(25.5, 33);
  qa.orient(-Math.PI / 2);

  const bolgeOzeti = () => {
    const kaynak = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = 220; c.height = 120;
    const cc = c.getContext('2d');
    // Mid-lower band of the frame — pond surface, no sky, no character.
    cc.drawImage(kaynak,
      kaynak.width * 0.42, kaynak.height * 0.55, kaynak.width * 0.3, kaynak.height * 0.2,
      0, 0, 220, 120);
    const veri = cc.getImageData(0, 0, 220, 120).data;
    let ozet = 0;
    for (let i = 0; i < veri.length; i += 97) ozet = (ozet * 31 + veri[i]) >>> 0;
    return ozet;
  };

  setTimeout(() => { rapor.su1 = bolgeOzeti(); }, 3200);
  setTimeout(() => {
    rapor.su2 = bolgeOzeti();
    rapor.suHareketli = rapor.su1 !== rapor.su2;
  }, 4400);

  // Walk south from 6s so the 8s shot lands mid-stride.
  setTimeout(() => {
    qa.teleport(0, -6);
    qa.orient(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  }, 6000);
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    console.log('[su-qa]', JSON.stringify(rapor));
  }, 9500);
  return 'armed';
})()
