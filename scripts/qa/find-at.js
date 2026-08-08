// find-at.js — name every scene node whose footprint centre falls in the
// query rectangles; the fastest way to identify a mystery object seen in a
// bird's-eye shot. Edit RECTS per hunt.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.sceneBoxes && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  const RECTS = [
    { tag: 'golet-kb-kutu', minX: 23, maxX: 30, minZ: 25, maxZ: 31 },
    { tag: 'gozlemevi-aday', minX: 45, maxX: 53, minZ: 16, maxZ: 24 },
    { tag: 'karusel', minX: 32, maxX: 42, minZ: -52, maxZ: -42 },
  ];
  const boxes = qa.sceneBoxes(4);
  const out = {};
  for (const r of RECTS) {
    out[r.tag] = boxes.filter((b) => {
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      const w = b.max[0] - b.min[0];
      return cx >= r.minX && cx <= r.maxX && cz >= r.minZ && cz <= r.maxZ && w < 30;
    }).map((b) => `${b.name} @ [${((b.min[0]+b.max[0])/2).toFixed(1)},${((b.min[2]+b.max[2])/2).toFixed(1)}] y${b.min[1].toFixed(1)}..${b.max[1].toFixed(1)}`);
  }
  return out;
})()
