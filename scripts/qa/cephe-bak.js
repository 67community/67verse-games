(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.birdseye && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  qa.teleport(48, 5.5);
  setTimeout(() => qa.birdseye(49.5, 5.5, 16, [53.3, 1.6, 5.5]), 2500);
  return 'armed';
})()
