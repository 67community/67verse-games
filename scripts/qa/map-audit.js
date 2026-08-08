// map-audit.js — page-side audit for the hub map (run via headless-qa --script).
// Reads named scene nodes from __67VERSE_QA__.sceneBoxes(), intersects their
// ground footprints, and reports overlapping pairs — the numeric version of
// "iç içe geçen şeyler" so fixes target real coordinates, not impressions.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.sceneBoxes && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.sceneBoxes) return { error: 'QA hooks never appeared' };

  const boxes = qa.sceneBoxes(3);

  // Only ground-level furniture matters for the untangling pass; the sky,
  // clouds and full-world wrappers span everything and would drown the list.
  const skip = /sky|cloud|atmosphere|light|fog|world$|^Scene|group$|root$|hub$|character:|anchor:|cosmetic:/i;
  const leaf = boxes.filter((b) => !skip.test(b.name)
    && (b.max[0] - b.min[0]) < 60 && (b.max[2] - b.min[2]) < 60
    && b.min[1] < 4);

  const area = (b) => (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]);
  // Layers of one authored feature (skatepark-slab vs skatepark-coping,
  // havuz-su vs havuz-zemin) stack on purpose; only cross-feature overlap is
  // a tangle. The feature stem is the leaf name up to its last dash group.
  const stemOf = (name) => {
    const leafName = name.split('/').pop().replace(/^(district|mekan|activity|proof-destination):/, '');
    return leafName.split('-')[0];
  };
  const pairs = [];
  for (let i = 0; i < leaf.length; i++) {
    for (let j = i + 1; j < leaf.length; j++) {
      const a = leaf[i], b = leaf[j];
      if (a.name.startsWith(b.name) || b.name.startsWith(a.name)) continue; // nested
      if (stemOf(a.name) === stemOf(b.name)) continue; // same feature's layers
      const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
      const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
      const oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
      if (ox <= 0.12 || oz <= 0.12 || oy <= 0.05) continue;
      const overlap = ox * oz;
      const smaller = Math.min(area(a), area(b));
      const share = overlap / Math.max(smaller, 0.01);
      if (share < 0.06) continue; // touching edges is fine
      pairs.push({
        a: a.name, b: b.name,
        overlap: +overlap.toFixed(1),
        share: +share.toFixed(2),
        at: [+((Math.max(a.min[0], b.min[0]) + Math.min(a.max[0], b.max[0])) / 2).toFixed(1),
             +((Math.max(a.min[2], b.min[2]) + Math.min(a.max[2], b.max[2])) / 2).toFixed(1)],
      });
    }
  }
  pairs.sort((x, y) => y.share - x.share);
  // Leave the full-map bird's-eye on for the screenshots that follow.
  qa.birdseye(0, -8, 175);
  return {
    namedNodes: boxes.length,
    checked: leaf.length,
    overlapPairs: pairs.length,
    worst: pairs.slice(0, 45),
  };
})()
