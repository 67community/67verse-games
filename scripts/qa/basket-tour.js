// basket-tour.js — Hoop Shot on the town court: E starts the duel, five
// timed SPACE presses shoot, the rival answers, the scoreboard settles it.
// Shots at 5 / 8 / 14 / 30s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.teleport) return { error: 'QA hooks never appeared' };
  const tus = (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), 110);
  };

  qa.teleport(-36, -1.7);
  setTimeout(() => tus('KeyE'), 2500);          // duello baslasin
  // Bes atis: olcer ~1.05s'de tepeden doner; farkli anlarda bas.
  for (let i = 0; i < 8; i += 1) {
    setTimeout(() => tus('Space'), 4000 + i * 3300);
  }
  setTimeout(() => {
    const panel = document.querySelector('.uv-panel');
    console.log('[basket-son]', JSON.stringify({
      panel: panel?.querySelector('header span')?.textContent || null,
      metin: panel?.textContent?.slice(0, 140) || null,
    }));
  }, 31000);
  return 'basket tour armed';
})()
