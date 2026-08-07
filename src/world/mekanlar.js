// mekanlar.js — the interiors, built off the map.
//
// Oscar's venue references are roofless rooms drawn from above: a pool club, a
// night club, an arcade with the 67 court, a clothing store. They are not part
// of the city plan and there is no room for them in it — the largest clear
// square left on the 124-unit plan is fourteen across, and dropping a venue on
// the measured plan would move things the reference put where they are.
//
// So each venue stands on its own plot out past the world edge and the player
// is carried there. The city keeps its geometry, the venue keeps its own, and
// the two never share ground.
//
// Every position is a fraction of its reference image, so the layouts read at
// whatever plot size a venue is given: measure once on the drawing, scale here.

export const MEKAN_PLOT = 26;          // a venue plot is 26 units square
export const MEKAN_BASLANGIC = 200;    // first plot centre, x; venues step east

// Where each venue sits, and which building on the map opens it.
export const MEKANLAR = Object.freeze([
  Object.freeze({ id: 'havuz', ad: 'Pool Club', x: MEKAN_BASLANGIC, z: 0 }),
]);

export function mekanMerkezi(id) {
  const m = MEKANLAR.find((v) => v.id === id);
  return m ? { x: m.x, z: m.z } : null;
}

// ---------------------------------------------------------------- pool club

// Read off design/referans-mekanlar/havuz-kulubu.jpg as fractions of the plot.
// The pool's turquoise mask gives x 0.340..0.662 and the deck below it runs to
// y 0.799; the bar's awning sits at y 0.014..0.045 across x 0.363..0.637.
const HAVUZ = Object.freeze({
  duvar: 0.030,                      // perimeter wall inset
  kapiGenislik: 0.16,                // the gap you walk in through, on the south
  havuz: Object.freeze([0.340, 0.262, 0.662, 0.799]),   // x0, z0, x1, z1
  barTezgah: Object.freeze([0.360, 0.055, 0.640, 0.150]),
  barTente: Object.freeze([0.355, 0.010, 0.645, 0.048]),
  tabure: Object.freeze([0.405, 0.455, 0.505, 0.555]),   // four, at z 0.200
  tabureZ: 0.200,
  // Four lounger bays down each side. Each bay is an umbrella, a lounger and a
  // side table; the reference alternates coral and yellow parasols.
  yatakZ: Object.freeze([0.262, 0.396, 0.548, 0.700]),
  solX: 0.205,
  sagX: 0.795,
  semsiyeRenk: Object.freeze(['#e8827c', '#f0c86a', '#e8827c', '#f0c86a']),
  yatakRenk: Object.freeze(['#8fb6d8', '#e79aa6', '#93b98c', '#f0c86a']),
  palmiye: Object.freeze([[0.115, 0.075], [0.885, 0.075], [0.110, 0.865], [0.890, 0.865]]),
});

export function buildMekanlar({ THREE, group, add, material, mats }) {
  const kok = new THREE.Group();
  kok.name = 'mekanlar';
  group.add(kok);
  for (const mekan of MEKANLAR) {
    if (mekan.id === 'havuz') havuzKulubu({ THREE, kok, add, material, mats, mekan });
  }
  return kok;
}

function havuzKulubu({ THREE, kok, add, material, mats, mekan }) {
  const S = MEKAN_PLOT;
  // Fraction of the drawing to a world point on this plot.
  const P = (u, v) => [mekan.x + (u - 0.5) * S, mekan.z + (v - 0.5) * S];
  const kutu = (g, y, d) => new THREE.BoxGeometry(g, y, d);
  const koy = (mesh, u, v, y) => {
    const [x, z] = P(u, v);
    mesh.position.set(x, y, z);
    kok.add(mesh);
    return mesh;
  };

  const deckMat = material(0xefe9e2, { roughness: 0.9 });
  const suMat = material(0x6fc9d8, { roughness: 0.25 });
  const ahsapMat = material(0xd8bc94, { roughness: 0.8 });

  // The deck the whole venue stands on.
  const deck = new THREE.Mesh(kutu(S, 0.4, S), deckMat);
  koy(deck, 0.5, 0.5, -0.2);
  deck.name = 'mekan:havuz-zemin';

  // Perimeter wall, with the south side left open where you walk in.
  const d = HAVUZ.duvar;
  const duvarMat = material(0xf6f2ec, { roughness: 0.85 });
  const duvarKalin = 0.34;
  const duvarYuk = 0.62;
  const kenar = [
    { g: S * (1 - d * 2), d: duvarKalin, u: 0.5, v: d },              // north
    { g: duvarKalin, d: S * (1 - d * 2), u: d, v: 0.5 },              // west
    { g: duvarKalin, d: S * (1 - d * 2), u: 1 - d, v: 0.5 },          // east
  ];
  for (const k of kenar) {
    koy(new THREE.Mesh(kutu(k.g, duvarYuk, k.d), duvarMat), k.u, k.v, duvarYuk / 2);
  }
  // South wall in two pieces so the doorway stays open.
  const acik = HAVUZ.kapiGenislik;
  const yan = (0.5 - d - acik / 2);
  for (const u of [d + yan / 2, 1 - d - yan / 2]) {
    koy(new THREE.Mesh(kutu(S * yan, duvarYuk, duvarKalin), duvarMat), u, 1 - d, duvarYuk / 2);
  }

  // The pool: a coping ring with the water set inside and below it.
  const [px0, pz0, px1, pz1] = HAVUZ.havuz;
  const pw = (px1 - px0) * S;
  const pd = (pz1 - pz0) * S;
  const pu = (px0 + px1) / 2;
  const pv = (pz0 + pz1) / 2;
  koy(new THREE.Mesh(kutu(pw + 0.9, 0.5, pd + 0.9), material(0xffffff, { roughness: 0.8 })), pu, pv, 0.05);
  // The water has to finish above the coping. Sunk level with it the coping's
  // own top face won the whole pool and the water did not show at all.
  const su = koy(new THREE.Mesh(kutu(pw, 0.42, pd), suMat), pu, pv, 0.12);
  su.name = 'mekan:havuz-su';

  // Bar: counter, awning on posts, and the stools along it.
  const [bx0, bz0, bx1, bz1] = HAVUZ.barTezgah;
  koy(new THREE.Mesh(kutu((bx1 - bx0) * S, 1.05, (bz1 - bz0) * S), ahsapMat),
    (bx0 + bx1) / 2, (bz0 + bz1) / 2, 0.52);
  const [tx0, tz0, tx1, tz1] = HAVUZ.barTente;
  koy(new THREE.Mesh(kutu((tx1 - tx0) * S, 0.16, (tz1 - tz0) * S), suMat),
    (tx0 + tx1) / 2, (tz0 + tz1) / 2, 2.3);
  const direkGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.3, 6);
  for (const u of [tx0 + 0.02, tx1 - 0.02]) {
    koy(new THREE.Mesh(direkGeo, material(0xe79aa6, { roughness: 0.6 })), u, (tz0 + tz1) / 2, 1.15);
  }
  const tabureGeo = new THREE.CylinderGeometry(0.34, 0.3, 0.62, 10);
  const tabureRenk = ['#7fb6d8', '#e79aa6', '#7fb6d8', '#e79aa6'];
  HAVUZ.tabure.forEach((u, i) => {
    koy(new THREE.Mesh(tabureGeo, material(tabureRenk[i], { roughness: 0.6 })), u, HAVUZ.tabureZ, 0.31);
  });

  // Lounger bays. Umbrella, lounger and side table, four down each side, the
  // parasols alternating the two tones the reference uses.
  const semsiyeGolge = new THREE.CylinderGeometry(1.55, 1.55, 0.11, 14);
  const semsiyeDirek = new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6);
  const yatakGeo = kutu(2.4, 0.34, 1.05);
  const masaGeo = new THREE.CylinderGeometry(0.34, 0.3, 0.5, 8);
  [['sol', HAVUZ.solX, -1], ['sag', HAVUZ.sagX, 1]].forEach(([, u, yon]) => {
    HAVUZ.yatakZ.forEach((v, i) => {
      const semU = u + yon * 0.045;
      koy(new THREE.Mesh(semsiyeDirek, mats.cream), semU, v, 1.05);
      koy(new THREE.Mesh(semsiyeGolge, material(HAVUZ.semsiyeRenk[i], { roughness: 0.6 })), semU, v, 2.05);
      koy(new THREE.Mesh(yatakGeo, material(HAVUZ.yatakRenk[i], { roughness: 0.7 })), u - yon * 0.03, v + 0.028, 0.42);
      koy(new THREE.Mesh(masaGeo, ahsapMat), u + yon * 0.075, v + 0.045, 0.25);
    });
  });

  // Palms in their round planters at the four corners.
  const govdeGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.1, 7);
  const yaprakGeo = new THREE.SphereGeometry(1.05, 8, 6);
  const saksiGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.3, 12);
  HAVUZ.palmiye.forEach(([u, v]) => {
    koy(new THREE.Mesh(saksiGeo, duvarMat), u, v, 0.15);
    koy(new THREE.Mesh(govdeGeo, material(0x9a7550, { roughness: 0.85 })), u, v, 1.35);
    const yaprak = koy(new THREE.Mesh(yaprakGeo, material(0x7fa86a, { roughness: 0.9, flatShading: true })), u, v, 2.6);
    yaprak.scale.set(1, 0.52, 1);
  });

  // Two ladders on the pool's long sides.
  const merdivenGeo = new THREE.TorusGeometry(0.34, 0.055, 6, 10, Math.PI);
  for (const u of [px0 - 0.012, px1 + 0.012]) {
    const m = koy(new THREE.Mesh(merdivenGeo, material(0xc9ccd2, { roughness: 0.4 })), u, (pz0 + pz1) / 2, 0.62);
    m.rotation.y = Math.PI / 2;
  }

  add?.(deck, { walkable: true, camera: false, cast: false });
}
