// shop-tour.js — Boutique 67 end to end: door, overview, buy with E (real
// Closet inventory), fitting room opens the Closet panel.
// Shots at 6 / 10 / 15 / 20s.
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
  const sahip = () => {
    try { return JSON.parse(localStorage.getItem('67v.ownedCosmetics') || '[]').length; }
    catch { return 'parse-hata'; }
  };
  const rapor = { oncesi: sahip() };

  qa.teleport(51, 9);
  setTimeout(() => basE(), 2000);                                   // kapidan gir
  setTimeout(() => qa.birdseye(268, 0, 40), 4000);                  // butik kusbakisi
  setTimeout(() => qa.birdseyeOff(), 7500);
  setTimeout(() => { qa.teleport(266.6, 1.3); }, 8200);             // BUY isaretinde
  setTimeout(() => basE(), 9200);                                   // satin al 1
  setTimeout(() => basE(), 11000);                                  // satin al 2
  setTimeout(() => { rapor.sonrasi = sahip(); }, 12500);
  setTimeout(() => { qa.teleport(271.6, -8.8); }, 13000);           // kabin
  setTimeout(() => basE(), 14000);                                  // Closet paneli
  setTimeout(() => {
    rapor.panelAcik = Boolean(document.querySelector('.closet-premium'));
    console.log('[shop-qa]', JSON.stringify(rapor));
  }, 19000);
  return 'shop tour armed';
})()
