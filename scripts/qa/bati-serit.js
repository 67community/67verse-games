// bati-serit.js — reproduce Oscar's phone view: west edge, facing south with
// the river on the left. Three stations down the strip, then a bird's-eye.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  qa.teleport(-56, -18);
  qa.orient(0);
  setTimeout(() => { qa.teleport(-56, 0); qa.orient(0); }, 6000);
  setTimeout(() => { qa.teleport(-56, 22); qa.orient(0); }, 11000);
  setTimeout(() => qa.birdseye(-54, 5, 44), 16000);
  return 'armed';
})()
