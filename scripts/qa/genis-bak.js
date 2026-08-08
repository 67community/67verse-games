// genis-bak.js — bird's-eye + street-level look at the widened arterials.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.birdseye && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;

  // ~4s: whole-town audit shot.
  qa.birdseye(0, 0, 150);

  // ~9s: centre grid closer.
  setTimeout(() => qa.birdseye(0, 0, 78), 6000);

  // ~14s: street level down an avenue.
  setTimeout(() => { qa.birdseyeOff(); qa.teleport(-19.5, 10); qa.orient(Math.PI); }, 11000);
  return 'armed';
})()
