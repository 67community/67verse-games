// nehir-dene.js — walk WEST into the river from dry land; the player must
// stop at the bank. Then walk across a bridge, which must still work.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const bas = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
  const birak = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
  const rapor = {};

  // 1) Dry east bank at (-50, 0); walk west (-x) straight at the channel.
  qa.teleport(-50, 0);
  qa.orient(-Math.PI / 2);          // yaw -PI/2 faces -x
  setTimeout(() => bas('KeyW'), 900);
  setTimeout(() => {
    birak('KeyW');
    const p = qa.player();
    rapor.nehreYuruyus = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), suda: Boolean(window.__67VERSE_SU__?.(p.x, p.z)) };
  }, 4200);

  // 2) The bridge at (-54, 16): stand east of it and walk west across.
  setTimeout(() => { qa.teleport(-49, 16); qa.orient(-Math.PI / 2); }, 4600);
  setTimeout(() => bas('KeyW'), 5000);
  setTimeout(() => {
    birak('KeyW');
    const p = qa.player();
    rapor.kopruGecisi = { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
    console.log('[nehir-qa]', JSON.stringify(rapor));
  }, 9000);
  return 'armed';
})()
