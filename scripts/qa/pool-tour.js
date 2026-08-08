// pool-tour.js — walk the Pool Club end to end: door, travel, swim, drink,
// sunbed. Pair with shots at 6/11/17/21s.
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
  const adimlar = [];
  const log = (m) => adimlar.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);

  qa.teleport(51, -5);
  log('kapida');
  setTimeout(() => { basE(); log('E: kapi'); }, 2000);
  setTimeout(() => { qa.birdseye(200, 0, 42); log('kusbakisi acik'); }, 4500);
  setTimeout(() => { qa.birdseyeOff(); log('kusbakisi kapali'); }, 7500);
  setTimeout(() => { qa.teleport(200.1, 8.7); log('yuzme isaretinde'); }, 8000);
  setTimeout(() => { basE(); log('E: yuzme'); }, 9000);
  setTimeout(() => { qa.teleport(200, 7.2); basE(); log('E: sudan cik'); }, 12200);
  setTimeout(() => { qa.teleport(200, -6.7); log('barda'); }, 13500);
  setTimeout(() => { basE(); log('E: icecek'); }, 15000);
  setTimeout(() => { qa.teleport(193.6, -1); log('sezlong isaretinde'); }, 17500);
  setTimeout(() => { basE(); log('E: uzan'); }, 18500);
  setTimeout(() => { qa.birdseye(196.5, 2.2, 5, [192.6, 0.6, -1.5]); log('uzanma yan bakis'); }, 19500);
  setTimeout(() => {
    const govde = qa.sceneBoxes(2).find((b) => b.name.endsWith('character:gorilla:root'));
    console.log('[pool-qa]', JSON.stringify({ adimlar, oyuncu: qa.player(), govde }));
  }, 21500);
  return 'pool tour armed';
})()
