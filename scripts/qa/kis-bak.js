(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_HAVA__?.mevsimZorla && Date.now() - t0 < 25000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  window.__67VERSE_HAVA__.mevsimZorla('kis');
  window.__67VERSE_HAVA__.zorla('yagmur');
  return 'armed';
})()
