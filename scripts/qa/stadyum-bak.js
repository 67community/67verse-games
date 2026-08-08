// stadyum-bak.js — stadium verification: gate walk-in stops at walls but the
// south gate admits; goals stand; GOAL SHOT plays. Shots at 4 / 9 / 13 / 20s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.birdseye && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const bas = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
  const birak = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
  const rapor = {};

  // 1) Bati duvarina yuru — durmali.
  qa.teleport(20.5, -0.15);
  qa.orient(Math.PI / 2);
  setTimeout(() => bas('KeyW'), 1200);
  setTimeout(() => { birak('KeyW'); rapor.batiDuvari = qa.player(); }, 3400);

  // 2) Guney kapisindan iceri yuru — girmeli.
  setTimeout(() => { qa.teleport(29.95, 16.5); qa.orient(Math.PI); }, 3800);
  setTimeout(() => bas('KeyW'), 4200);
  setTimeout(() => { birak('KeyW'); rapor.kapidanGiris = qa.player(); }, 7400);

  // 3) GOAL SHOT: E + bes SPACE.
  setTimeout(() => { qa.teleport(29.95, 5.2); bas('KeyE'); setTimeout(() => birak('KeyE'), 120); }, 8000);
  for (let i = 0; i < 6; i += 1) {
    setTimeout(() => { bas('Space'); setTimeout(() => birak('Space'), 100); }, 9600 + i * 1900);
  }
  setTimeout(() => qa.birdseye(29.95, 6, 26), 12200);
  setTimeout(() => {
    const panel = document.querySelector('.uv-panel');
    rapor.panel = panel?.textContent?.slice(0, 90) || null;
    console.log('[stadyum-qa]', JSON.stringify(rapor));
  }, 21500);
  return 'armed';
})()
