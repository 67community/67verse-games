// su-yuzme.js — walk off a bank into the river and prove you SWIM: the body
// must drop to the surface while crossing, not stay at walking height and not
// stop dead at a wall. Sampled DURING the crossing, because the far bank
// looks identical to never having been in the water.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const rapor = { enDusukY: 99, suOrnek: [], kopruY: null };

  qa.teleport(-52, 12);
  qa.orient(-Math.PI / 2);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  const ornek = setInterval(() => {
    const p = qa.player();
    rapor.enDusukY = Math.min(rapor.enDusukY, +p.y.toFixed(2));
    if (p.y < -0.05) rapor.suOrnek.push([+p.x.toFixed(1), +p.y.toFixed(2)]);
  }, 60);
  await new Promise((r) => setTimeout(r, 5000));
  clearInterval(ornek);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  rapor.suOrnek = rapor.suOrnek.slice(0, 6);
  rapor.bitis = qa.player();

  // A bridge deck must keep you dry: stand on one and the body stays up.
  qa.teleport(-57.6, 19);
  await new Promise((r) => setTimeout(r, 900));
  rapor.kopruY = +qa.player().y.toFixed(2);

  console.log('[yuzme-qa]', JSON.stringify(rapor));
  return 'armed';
})()
