// kamera-titreme.js — isolates the collision-camera jitter: walks into the
// parked car and samples BOTH the player and the camera; whichever carries
// the big frame deltas is the guilty half.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  qa.teleport(-48.44, -43.8);
  qa.orient(Math.PI);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));

  let onceKam = null;
  let onceOyn = null;
  let kamMax = 0;
  let oynMax = 0;
  let kamMesafeMin = 99;
  let kamMesafeMax = 0;
  const ornek = setInterval(() => {
    const kam = qa.camera();
    const k = kam.position;
    const o = qa.player();
    if (onceKam) {
      kamMax = Math.max(kamMax, Math.hypot(k[0] - onceKam[0], k[1] - onceKam[1], k[2] - onceKam[2]));
      oynMax = Math.max(oynMax, Math.hypot(o.x - onceOyn.x, o.y - onceOyn.y, o.z - onceOyn.z));
    }
    kamMesafeMin = Math.min(kamMesafeMin, kam.resolvedDistance);
    kamMesafeMax = Math.max(kamMesafeMax, kam.resolvedDistance);
    onceKam = k;
    onceOyn = o;
  }, 90);
  // Carpma ~0.3s icinde; 1.5s sonra olcum penceresini sifirla.
  setTimeout(() => { onceKam = null; onceOyn = null; kamMax = 0; oynMax = 0; kamMesafeMin = 99; kamMesafeMax = 0; }, 1500);
  setTimeout(() => {
    clearInterval(ornek);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    console.log('[titreme-qa]', JSON.stringify({
      kamMax: +kamMax.toFixed(3),
      oynMax: +oynMax.toFixed(3),
      cozulmusMesafe: [+kamMesafeMin.toFixed(2), +kamMesafeMax.toFixed(2)],
      oyuncu: qa.player(),
    }));
  }, 5000);
  return 'armed';
})()
