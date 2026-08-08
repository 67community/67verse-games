// map-zones.js — timed bird's-eye tour for headless captures: full map first,
// then the tangle zones the audit flagged. Pair with shots at 8/12/16/20s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.birdseye && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.birdseye) return { error: 'QA hooks never appeared' };
  qa.birdseye(0, -6, 150);                                   // full town
  setTimeout(() => qa.birdseye(30, 30, 52), 10000);          // pond + teddies
  setTimeout(() => qa.birdseye(47, 26, 44), 14000);          // gozlemevi lawn
  setTimeout(() => qa.birdseye(0, -6, 150), 18000);          // full town, final
  return 'tour armed';
})()
