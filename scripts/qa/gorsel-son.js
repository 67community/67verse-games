// gorsel-son.js — final visual sweep for the feedback batch. Timed poses for
// the shot list: water close-up, west row paving (houses removed), road bands,
// bowl interior from ground level.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;

  // ~4s: pond water from the west shore, facing +x — waves should read.
  qa.teleport(22, 36);
  qa.orient(-Math.PI / 2);

  // ~9s: west row birdseye centred on the removed pair (z -21..-1).
  setTimeout(() => qa.birdseye(-52, -11, 40), 6000);

  // ~14s: road band area from street level (z-fight lift check).
  setTimeout(() => { qa.birdseyeOff(); qa.teleport(-2, 12); qa.orient(Math.PI); }, 11000);

  // ~19s: inside the 67 bowl, looking at the wall — descent view.
  setTimeout(() => { qa.teleport(-7.53, -42.73); qa.orient(0.8); }, 16000);
  return 'armed';
})()
