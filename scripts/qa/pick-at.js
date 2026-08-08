// pick-at.js — identify the meshes standing at the given world spots.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.pick && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.pick) return { error: 'QA hooks never appeared' };
  const SPOTS = [
    ['golet-buyuk-kutu', 25.5, 27.6],
    ['golet-kucuk-kutu', 26.9, 30.3],
    ['golet-ic-kutu', 33.6, 32.4],
  ];
  const out = {};
  for (const [tag, x, z] of SPOTS) {
    out[tag] = qa.pick(x, z);
  }
  return out;
})()
