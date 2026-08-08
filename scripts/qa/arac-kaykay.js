(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const rapor = {};
  qa.teleport(0, -19.0);
  setTimeout(() => { rapor.once = qa.player(); }, 1500);
  setTimeout(() => { rapor.sonra = qa.player(); }, 9000);
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' })), 9500);
  setTimeout(() => {
    rapor.kaykayToast = [...document.querySelectorAll('.uv-toast')].at(-1)?.textContent || null;
    console.log('[arac-qa]', JSON.stringify(rapor));
  }, 10800);
  return 'armed';
})()
