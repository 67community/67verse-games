// final-tur.js — the closing inspection: every district from above, then the
// venue row. Pair with shots at 4/7/10/13/16/19/22/25/28/31s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.birdseye && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.birdseye) return { error: 'QA hooks never appeared' };
  const duraklar = [
    [0, -6, 150],        // full town
    [26, -44, 46],       // funfair
    [-2, -38, 46],       // skatepark + north
    [0, 6, 44],          // 67 plaza
    [30, 2, 48],         // stadium + east
    [-38, 0, 42],        // court quarter
    [30, 30, 48],        // pond park + east lawn
    [-48, -48, 52],      // kart lawn corner
    [0, 52, 46],         // south suburbs
    [207, 0, 46],        // venue row: pool + club
  ];
  duraklar.forEach(([x, z, h], i) => {
    setTimeout(() => qa.birdseye(x, z, h), 2000 + i * 3000);
  });
  return 'final tour armed';
})()
