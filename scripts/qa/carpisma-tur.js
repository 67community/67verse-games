// carpisma-tur.js — walk INTO things and prove they stop you: the carousel, a
// parked car, the pool wall; then E-swim still gets into the water.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.teleport) return { error: 'QA hooks never appeared' };
  const bas = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  const birak = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  const basE = () => { bas('KeyE'); setTimeout(() => birak('KeyE'), 120); };
  const rapor = {};

  // 1) Atlikarincaya guneyden yuru (hedef z -45.8; guneyden yaklas).
  qa.teleport(36.3, -39.5);
  qa.orient(Math.PI);            // yaw PI: -z yonune (kuzeye) bak/yuru
  setTimeout(() => bas('KeyW'), 1500);
  setTimeout(() => { birak('KeyW'); rapor.atlikarinca = qa.player(); }, 4200);

  // 2) Otopark 1A'daki sari arabaya bat: (-48.44, -46.31), guneyden yuru.
  setTimeout(() => { qa.teleport(-48.44, -42.6); qa.orient(Math.PI); }, 4600);
  setTimeout(() => bas('KeyW'), 5000);
  setTimeout(() => { birak('KeyW'); rapor.araba = qa.player(); }, 7000);

  // 3) Kapidan mekana gir (boundsBox kurulsun), sonra havuza yuru.
  setTimeout(() => { qa.teleport(51, -5); basE(); }, 7400);
  setTimeout(() => { qa.teleport(200, 10.5); qa.orient(Math.PI); }, 8600);
  setTimeout(() => bas('KeyW'), 9000);
  setTimeout(() => { birak('KeyW'); rapor.havuzOnu = qa.player(); }, 11600);

  // 4) SWIM halkasindan E ile suya gir — pin su icinde tutmali.
  setTimeout(() => { qa.teleport(200.1, 8.7); basE(); }, 12200);
  setTimeout(() => { rapor.yuzme = qa.player(); }, 13800);

  setTimeout(() => console.log('[carpisma-qa]', JSON.stringify(rapor)), 14600);
  return 'carpisma turu armed';
})()
