(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_HAVA__?.oku && Date.now() - t0 < 25000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  window.__67VERSE_HAVA__.mevsimZorla('sonbahar');
  setTimeout(() => console.log('[mevsim-qa]', JSON.stringify(window.__67VERSE_HAVA__.oku())), 4000);
  return 'armed';
})()
