// club-tour.js — Night Club verbs: dance on the lit floor, drink at the bar,
// sit in the VIP. Shots at 6 / 8 / 9 / 14 / 19s (two dance frames should show
// different bounce phases).
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

  qa.teleport(51, 2);
  setTimeout(() => basE(), 2000);                       // kapidan gir
  setTimeout(() => qa.teleport(233.3, 2.6), 4000);      // DANCE isaretinde
  setTimeout(() => basE(), 5000);                       // dansa basla
  setTimeout(() => qa.birdseye(233.5, 4.6, 7, [233.3, 0.8, 0.2]), 5600);
  setTimeout(() => qa.birdseyeOff(), 9600);
  setTimeout(() => { qa.teleport(227.4, -2.9); basE(); }, 10400); // dans kapali... once dansi birakmak icin E
  setTimeout(() => basE(), 12000);                      // barda icecek
  setTimeout(() => qa.teleport(241.0, -7.1), 14500);    // VIP LOUNGE isaretinde
  setTimeout(() => basE(), 15500);                      // otur
  setTimeout(() => qa.birdseye(243.5, -5.2, 6, [241, 0.9, -8.3]), 16500);
  setTimeout(() => console.log('[club-qa]', JSON.stringify(qa.player())), 19500);
  return 'club tour armed';
})()
