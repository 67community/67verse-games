// mekan-ici.js — step into a venue and prove the outside world is gone: the
// town, its ground and the sky must all be hidden, and the fog pulled in.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const rapor = {};
  const oku = () => {
    const b = qa.sceneBoxes(1);
    return {
      sehir: b.some((n) => n.name === 'town-lobby'),
      zemin: b.some((n) => n.name === 'town:ground'),
      gok: b.some((n) => n.name === 'sky-dome'),
    };
  };
  rapor.disarida = oku();

  // Walk into the clothes shop door and press E.
  qa.teleport(51, -5);
  await new Promise((r) => setTimeout(r, 700));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })), 120);
  await new Promise((r) => setTimeout(r, 1800));
  rapor.icerideKonum = qa.player();
  rapor.iceride = oku();

  console.log('[mekan-qa]', JSON.stringify(rapor));
  return 'armed';
})()
