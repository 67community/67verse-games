// online-dene.js — did the shared room actually put somebody else on my map?
// Reads the room's own tally rather than counting bodies: the ambient
// fRiENDSiES walking the park carry the same node names as a remote player.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.player && Date.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  await new Promise((r) => setTimeout(r, 10000));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

  const d = window.__67PARK_ONLINE__ || null;
  console.log('[online-qa]', JSON.stringify({
    oda: d ? { bagli: d.bagli, odadaki: d.sayi, uzakGovde: d.uzak, ben: d.self } : 'MODUL YOK',
    benimKarakter: qa.animation?.().characterId ?? null,
    konum: qa.player(),
  }));
  return 'armed';
})()
