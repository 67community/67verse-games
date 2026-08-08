// arcade-tour.js — Arcade 67: enter, overview, play SKY HOP with real hops,
// close it, then the coffee gift at the cafe. Shots at 6 / 10 / 13 / 18s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.teleport) return { error: 'QA hooks never appeared' };
  const tus = (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), 110);
  };
  const rapor = {};

  qa.teleport(51, 16);
  setTimeout(() => tus('KeyE'), 2000);                        // arcade'e gir
  setTimeout(() => qa.birdseye(302, 0, 40), 3800);            // salon kusbakisi
  setTimeout(() => qa.birdseyeOff(), 6800);
  setTimeout(() => qa.teleport(297.06, -1.25), 7400);         // SKY HOP isaretinde
  setTimeout(() => tus('KeyE'), 8400);                        // makineyi ac
  setTimeout(() => { rapor.oyunAcik = Boolean(document.querySelector('canvas[width="640"]')); }, 9400);
  setTimeout(() => tus('Space'), 9600);                       // hop
  setTimeout(() => tus('Space'), 10600);                      // hop
  setTimeout(() => tus('Space'), 11600);                      // hop
  setTimeout(() => tus('Escape'), 12400);                     // bitir
  setTimeout(() => { rapor.oyunKapandi = !document.querySelector('canvas[width="640"]'); }, 13400);
  setTimeout(() => qa.teleport(305.6, 9.9), 14200);           // COFFEE isaretinde
  setTimeout(() => tus('KeyE'), 15200);                       // kahve panel
  setTimeout(() => {
    const panel = document.querySelector('.uv-panel');
    rapor.kahvePanel = panel?.querySelector('header span')?.textContent || null;
    const dugme = [...(panel?.querySelectorAll('button') || [])]
      .find((b) => b.textContent.startsWith('No.'));
    rapor.alici = dugme?.textContent || null;
    dugme?.click();
  }, 16800);
  setTimeout(() => console.log('[arcade-qa]', JSON.stringify(rapor)), 19000);
  return 'arcade tour armed';
})()
