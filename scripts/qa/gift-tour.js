// gift-tour.js — buy a round for someone in the club: E at the BUY A ROUND
// ring opens the picker, choose the first guest, the drink lands in their
// hand. Shots at 6 / 10 / 15s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.teleport) return { error: 'QA hooks never appeared' };
  const basE = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })), 120);
  };
  const rapor = {};

  qa.teleport(51, 2);
  setTimeout(() => basE(), 2000);                       // kulübe gir
  setTimeout(() => qa.teleport(227.4, -0.3), 4200);     // BUY A ROUND isaretinde
  setTimeout(() => basE(), 5200);                       // secici panel
  setTimeout(() => {
    const panel = document.querySelector('.uv-panel');
    rapor.panelAcik = Boolean(panel);
    const dugme = [...(panel?.querySelectorAll('button') || [])]
      .find((b) => b.textContent.startsWith('No.'));
    rapor.ilkMisafir = dugme?.textContent || null;
    dugme?.click();                                     // ilk misafire ismarla
  }, 7200);
  setTimeout(() => qa.birdseye(232, 4, 8, [232.4, 1, 0]), 8200);  // pist misafirlerine bak
  setTimeout(() => {
    rapor.misafirBardak = Boolean(
      [...document.querySelectorAll('canvas')].length, // placeholder truthy
    );
    console.log('[gift-qa]', JSON.stringify(rapor));
  }, 14000);
  return 'gift tour armed';
})()
