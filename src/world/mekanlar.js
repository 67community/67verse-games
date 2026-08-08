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

import { roundedBoxGeometry } from './sekil.js';

export const MEKAN_PLOT = 26;          // a venue plot is 26 units square
export const MEKAN_BASLANGIC = 200;    // first plot centre, x; venues step east

// Where each venue sits, and which building on the map opens it.
export const MEKANLAR = Object.freeze([
  Object.freeze({ id: 'havuz', ad: 'Pool Club', x: MEKAN_BASLANGIC, z: 0 }),
  Object.freeze({ id: 'kulup', ad: 'Night Club', x: MEKAN_BASLANGIC + 34, z: 0 }),
  Object.freeze({ id: 'magaza', ad: 'Boutique 67', x: MEKAN_BASLANGIC + 68, z: 0 }),
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


// A geometry handed to a vertexColors material must carry a colour attribute.
// Without one the shader reads the missing attribute as (0,0,0) and multiplies
// the instance colour away — the whole loungers-and-parasols row went black the
// moment the boxes became squircle extrusions, the same fault that turned the
// marina's hulls into leaves. White here leaves the instance tint alone.
function beyazRenk(THREE, geo) {
  const n = geo.attributes.position.count;
  if (!geo.attributes.color) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return geo;
}

export function buildMekanlar({ THREE, group, add, material, mats }) {
  const kok = new THREE.Group();
  kok.name = 'mekanlar';
  group.add(kok);
  for (const mekan of MEKANLAR) {
    if (mekan.id === 'havuz') havuzKulubu({ THREE, kok, add, material, mats, mekan });
    if (mekan.id === 'kulup') geceKulubu({ THREE, kok, add, material, mekan });
    if (mekan.id === 'magaza') butik({ THREE, kok, add, material, mekan });
  }
  return kok;
}

function havuzKulubu({ THREE, kok, add, material, mats, mekan }) {
  const S = MEKAN_PLOT;
  // Fraction of the drawing to a world point on this plot.
  const P = (u, v) => [mekan.x + (u - 0.5) * S, mekan.z + (v - 0.5) * S];
  // Every box in the reference has a rounded edge — that soft toy-plastic
  // corner is most of what the drawing's look is. Built from raw BoxGeometry
  // the club read flat and painted, so each one is a squircle extrusion with
  // a bevel, which sekil.js already had and this file was not using.
  // roundedBoxGeometry spans 0..h, so the caller's centre y shifts down by h/2.
  const kutu = (g, y, d) => {
    const r = Math.min(g, d) * 0.16;
    const geo = roundedBoxGeometry(g, d, y, r, Math.min(y, Math.min(g, d)) * 0.13);
    geo.translate(0, -y / 2, 0);
    return beyazRenk(THREE, geo);
  };
  const koy = (mesh, u, v, y) => {
    const [x, z] = P(u, v);
    mesh.position.set(x, y, z);
    kok.add(mesh);
    return mesh;
  };

  // Everything that repeats rides an instanced mesh. Built as separate meshes
  // the club cost about sixty draws on its own and pushed the lobby over the
  // 120 budget; instanced it is under twenty for the same furniture.
  const M4 = new THREE.Matrix4();
  const seri = (geo, mat, n, yerlestir) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i += 1) yerlestir(i, M4, mesh);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
  // South wall comes in two pieces so the doorway stays open; all five run on
  // one unit box scaled per instance.
  const acik = HAVUZ.kapiGenislik;
  const yan = (0.5 - d - acik / 2);
  const duvarlar = [
    ...kenar,
    { g: S * yan, d: duvarKalin, u: d + yan / 2, v: 1 - d },
    { g: S * yan, d: duvarKalin, u: 1 - d - yan / 2, v: 1 - d },
  ];
  seri(kutu(1, 1, 1), duvarMat, duvarlar.length, (i, m, mesh) => {
    const k = duvarlar[i];
    const [x, z] = P(k.u, k.v);
    m.makeScale(k.g, duvarYuk, k.d);
    m.setPosition(x, duvarYuk / 2, z);
    mesh.setMatrixAt(i, m);
  });

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
  const barDirekU = [tx0 + 0.02, tx1 - 0.02];
  seri(new THREE.CylinderGeometry(0.09, 0.09, 2.3, 6),
    material(0xe79aa6, { roughness: 0.6 }), 2, (i, m, mesh) => {
      const [x, z] = P(barDirekU[i], (tz0 + tz1) / 2);
      m.identity(); m.setPosition(x, 1.15, z); mesh.setMatrixAt(i, m);
    });
  const tabureRenk = ['#7fb6d8', '#e79aa6', '#7fb6d8', '#e79aa6'];
  seri(beyazRenk(THREE, new THREE.CylinderGeometry(0.34, 0.3, 0.62, 10)),
    material(0xffffff, { roughness: 0.6, vertexColors: true }), HAVUZ.tabure.length,
    (i, m, mesh) => {
      const [x, z] = P(HAVUZ.tabure[i], HAVUZ.tabureZ);
      m.identity();
      m.setPosition(x, 0.31, z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(tabureRenk[i]));
    });

  // Lounger bays. Umbrella, lounger and side table, four down each side, the
  // parasols alternating the two tones the reference uses.
  // Eight bays: four down each side, each an umbrella, a lounger and a table.
  // One instanced mesh per part rather than four meshes per bay.
  const BAY = [];
  for (const [u, yon] of [[HAVUZ.solX, -1], [HAVUZ.sagX, 1]]) {
    HAVUZ.yatakZ.forEach((v, i) => BAY.push({ u, v, yon, i }));
  }
  const tint = material(0xffffff, { roughness: 0.62, vertexColors: true });
  seri(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6), mats.cream, BAY.length, (i, m, mesh) => {
    const b = BAY[i];
    const [x, z] = P(b.u + b.yon * 0.045, b.v);
    m.identity(); m.setPosition(x, 1.05, z); mesh.setMatrixAt(i, m);
  });
  seri(beyazRenk(THREE, new THREE.CylinderGeometry(1.55, 1.55, 0.11, 14)), tint, BAY.length, (i, m, mesh) => {
    const b = BAY[i];
    const [x, z] = P(b.u + b.yon * 0.045, b.v);
    m.identity(); m.setPosition(x, 2.05, z); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(HAVUZ.semsiyeRenk[b.i]));
  });
  seri(kutu(2.4, 0.34, 1.05), tint, BAY.length, (i, m, mesh) => {
    const b = BAY[i];
    const [x, z] = P(b.u - b.yon * 0.03, b.v + 0.028);
    m.identity(); m.setPosition(x, 0.42, z); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(HAVUZ.yatakRenk[b.i]));
  });
  seri(new THREE.CylinderGeometry(0.34, 0.3, 0.5, 8), ahsapMat, BAY.length, (i, m, mesh) => {
    const b = BAY[i];
    const [x, z] = P(b.u + b.yon * 0.075, b.v + 0.045);
    m.identity(); m.setPosition(x, 0.25, z); mesh.setMatrixAt(i, m);
  });

  // Palms in their round planters at the four corners.
  const PALM = HAVUZ.palmiye;
  seri(new THREE.CylinderGeometry(0.85, 0.85, 0.3, 12), duvarMat, PALM.length, (i, m, mesh) => {
    const [x, z] = P(PALM[i][0], PALM[i][1]);
    m.identity(); m.setPosition(x, 0.15, z); mesh.setMatrixAt(i, m);
  });
  seri(new THREE.CylinderGeometry(0.16, 0.22, 2.1, 7), material(0x9a7550, { roughness: 0.85 }),
    PALM.length, (i, m, mesh) => {
      const [x, z] = P(PALM[i][0], PALM[i][1]);
      m.identity(); m.setPosition(x, 1.35, z); mesh.setMatrixAt(i, m);
    });
  seri(new THREE.SphereGeometry(1.05, 8, 6),
    material(0x7fa86a, { roughness: 0.9, flatShading: true }), PALM.length, (i, m, mesh) => {
      const [x, z] = P(PALM[i][0], PALM[i][1]);
      m.makeScale(1, 0.52, 1); m.setPosition(x, 2.6, z); mesh.setMatrixAt(i, m);
    });

  // Two ladders on the pool's long sides.
  const merdivenU = [px0 - 0.012, px1 + 0.012];
  seri(new THREE.TorusGeometry(0.34, 0.055, 6, 10, Math.PI),
    material(0xc9ccd2, { roughness: 0.4 }), 2, (i, m, mesh) => {
      const [x, z] = P(merdivenU[i], (pz0 + pz1) / 2);
      m.makeRotationY(Math.PI / 2); m.setPosition(x, 0.62, z); mesh.setMatrixAt(i, m);
    });

  // Steps into the shallow end — three shrinking treads inside the south lobe,
  // like the reference's corner stairs.
  seri(kutu(1, 1, 1), material(0xf6f2ec, { roughness: 0.7 }), 3, (i, m, mesh) => {
    const [x, z] = P(pu, pz1 - 0.012 - i * 0.017);
    m.makeScale(2.2 - i * 0.5, 0.14, 0.5);
    m.setPosition(x, 0.46 - i * 0.13, z);
    mesh.setMatrixAt(i, m);
  });

  // Two low deck chairs by the pool's waist — the small pair the reference
  // parks between the lounger rows and the water.
  const sandalyeU = [px0 - 0.055, px1 + 0.055];
  seri(kutu(1, 1, 1), ahsapMat, 4, (i, m, mesh) => {
    const koltuk = i < 2;
    const [x, z] = P(sandalyeU[i % 2], (pz0 + pz1) / 2 - (koltuk ? 0.06 : 0.083));
    m.makeScale(0.72, koltuk ? 0.16 : 0.5, koltuk ? 0.95 : 0.14);
    m.setPosition(x, koltuk ? 0.3 : 0.62, z);
    mesh.setMatrixAt(i, m);
  });

  // A cocktail on every side table, and a bottle rank along the back bar.
  const icecekMat = material(0xf2a45c, { roughness: 0.3 });
  seri(new THREE.CylinderGeometry(0.075, 0.062, 0.2, 8), icecekMat, BAY.length, (i, m, mesh) => {
    const b = BAY[i];
    const [x, z] = P(b.u + b.yon * 0.075, b.v + 0.045);
    m.identity(); m.setPosition(x, 0.6, z); mesh.setMatrixAt(i, m);
  });
  const siseRenk = ['#5a9c7a', '#d0775e', '#8a6fb0', '#e8b64a', '#7fb6d8'];
  seri(beyazRenk(THREE, new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8)),
    material(0xffffff, { roughness: 0.25, vertexColors: true }), siseRenk.length,
    (i, m, mesh) => {
      const [x, z] = P(0.44 + i * 0.03, 0.075);
      m.identity(); m.setPosition(x, 1.25, z); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(siseRenk[i]));
    });

  add?.(deck, { walkable: true, camera: false, cast: false });
}

// --------------------------------------------------------------- night club

// Read off design/referans-mekanlar/gece-kulubu.jpg. The floor's lit tiles
// mask to x 0.322..0.626; the rooms around it are the labelled boxes the
// drawing names — VIP LOUNGE top right, VIP AREA bottom left, KARAOKE bottom
// right, the toilets down the east wall and the bar along the west.
const KULUP = Object.freeze({
  duvar: 0.028,
  kapi: Object.freeze([0.33, 0.47]),                    // doorway span, south wall
  pist: Object.freeze([0.322, 0.360, 0.626, 0.655]),    // x0, z0, x1, z1
  pistKare: 8,                                          // 8 x 8 lit tiles
  djKursu: Object.freeze([0.360, 0.100, 0.600, 0.280]),
  hoparlor: Object.freeze([[0.300, 0.185], [0.660, 0.185]]),
  bar: Object.freeze([0.130, 0.175, 0.205, 0.600]),
  barTabure: 9,
  odalar: Object.freeze([
    { ad: 'VIP LOUNGE', k: [0.655, 0.095, 0.885, 0.265], renk: '#7b4f96' },
    { ad: 'VIP AREA', k: [0.070, 0.650, 0.255, 0.815], renk: '#7b4f96' },
    { ad: 'KARAOKE', k: [0.550, 0.670, 0.860, 0.860], renk: '#8a4f8f' },
    { ad: 'MEN', k: [0.660, 0.295, 0.900, 0.450], renk: '#3f5f8f' },
    { ad: 'WOMEN', k: [0.660, 0.470, 0.900, 0.625], renk: '#8f4f77' },
  ]),
});

function geceKulubu({ THREE, kok, add, material, mekan }) {
  const S = MEKAN_PLOT;
  const P = (u, v) => [mekan.x + (u - 0.5) * S, mekan.z + (v - 0.5) * S];
  const kutu = (g, y, d) => new THREE.BoxGeometry(g, y, d);
  const M4 = new THREE.Matrix4();
  const seri = (geo, mat, n, yerlestir) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i += 1) yerlestir(i, M4, mesh);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    kok.add(mesh);
    return mesh;
  };
  const tek = (geo, mat, u, v, y) => {
    const m = new THREE.Mesh(geo, mat);
    const [x, z] = P(u, v);
    m.position.set(x, y, z);
    kok.add(m);
    return m;
  };
  const alan = (k) => ({
    g: (k[2] - k[0]) * S, d: (k[3] - k[1]) * S, u: (k[0] + k[2]) / 2, v: (k[1] + k[3]) / 2,
  });

  // A club floor is dark; the light in the reference comes off the fittings.
  const zemin = tek(kutu(S, 0.4, S), material(0x2a2431, { roughness: 0.85 }), 0.5, 0.5, -0.2);
  zemin.name = 'mekan:kulup-zemin';

  // Perimeter, with the doorway left open on the south wall.
  const d = KULUP.duvar;
  const duvarMat = material(0xe8e2dc, { roughness: 0.85 });
  const yuk = 1.15;
  const kal = 0.34;
  const [ka, kb] = KULUP.kapi;
  const duvarlar = [
    { g: S * (1 - d * 2), d: kal, u: 0.5, v: d },
    { g: kal, d: S * (1 - d * 2), u: d, v: 0.5 },
    { g: kal, d: S * (1 - d * 2), u: 1 - d, v: 0.5 },
    { g: S * (ka - d), d: kal, u: (d + ka) / 2, v: 1 - d },
    { g: S * (1 - d - kb), d: kal, u: (kb + 1 - d) / 2, v: 1 - d },
  ];
  seri(kutu(1, 1, 1), duvarMat, duvarlar.length, (i, m, mesh) => {
    const k = duvarlar[i];
    const [x, z] = P(k.u, k.v);
    m.makeScale(k.g, yuk, k.d);
    m.setPosition(x, yuk / 2, z);
    mesh.setMatrixAt(i, m);
  });

  // The dance floor: sixty-four lit tiles, brightest at the centre, which is
  // how the reference's grid reads. One instanced plane carries all of them.
  const [fx0, fz0, fx1, fz1] = KULUP.pist;
  const N = KULUP.pistKare;
  const kareG = ((fx1 - fx0) * S) / N;
  const kareD = ((fz1 - fz0) * S) / N;
  // A club is lit by its own fittings, not by the sun the city runs under.
  // Without emissive every tile, sign and strip renders as the dark material
  // it is and the room reads black, which is what the first build did.
  const pistMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.35, vertexColors: true,
    // Emissive is not multiplied by the instance colour, so a white glow ate
    // the grid: every tile came back the same white. A violet glow at half
    // strength lets the blue-cored diffuse show through it.
    emissive: 0x7a3fc8, emissiveIntensity: 0.5,
  });
  const mor = new THREE.Color('#c060e8');
  const mavi = new THREE.Color('#6fa8ff');
  seri(kutu(kareG * 0.94, 0.12, kareD * 0.94), pistMat, N * N, (i, m, mesh) => {
    const sx = i % N;
    const sz = Math.floor(i / N);
    const u = fx0 + ((sx + 0.5) / N) * (fx1 - fx0);
    const v = fz0 + ((sz + 0.5) / N) * (fz1 - fz0);
    const [x, z] = P(u, v);
    m.identity();
    m.setPosition(x, 0.06, z);
    mesh.setMatrixAt(i, m);
    // Distance from the middle decides the tone: blue core, violet edges.
    const rr = Math.hypot(sx - (N - 1) / 2, sz - (N - 1) / 2) / (N / 2);
    mesh.setColorAt(i, mor.clone().lerp(mavi, Math.max(0, 1 - rr)));
  });

  // DJ booth on its riser, with a speaker stack each side.
  const dj = alan(KULUP.djKursu);
  tek(kutu(dj.g, 0.5, dj.d),
    new THREE.MeshStandardMaterial({ color: 0x3a2f4a, roughness: 0.7, emissive: 0x7b3fd4, emissiveIntensity: 0.55 }),
    dj.u, dj.v, 0.25);
  tek(kutu(dj.g * 0.55, 0.36, dj.d * 0.34), material(0x14121a, { roughness: 0.5 }), dj.u, dj.v + 0.02, 0.68);
  seri(kutu(1.15, 2.3, 0.8), material(0x1b1822, { roughness: 0.6 }), KULUP.hoparlor.length,
    (i, m, mesh) => {
      const [x, z] = P(KULUP.hoparlor[i][0], KULUP.hoparlor[i][1]);
      m.identity(); m.setPosition(x, 1.15, z); mesh.setMatrixAt(i, m);
    });
  // The mirror ball over the middle of the floor.
  tek(new THREE.SphereGeometry(0.42, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8d8e8, roughness: 0.12, emissive: 0x8899cc, emissiveIntensity: 0.5 }),
    (fx0 + fx1) / 2, KULUP.djKursu[3] + 0.02, 3.1);

  // Bar: counter down the west wall with its stools.
  const bar = alan(KULUP.bar);
  tek(kutu(bar.g, 1.1, bar.d),
    new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 0.6, emissive: 0xd08a3a, emissiveIntensity: 0.3 }),
    bar.u, bar.v, 0.55);
  const [, bz0, bx1, bz1] = KULUP.bar;
  seri(new THREE.CylinderGeometry(0.3, 0.26, 0.66, 8), material(0x6d5f7a, { roughness: 0.6 }),
    KULUP.barTabure, (i, m, mesh) => {
      const v = bz0 + ((i + 0.5) / KULUP.barTabure) * (bz1 - bz0);
      const [x, z] = P(bx1 + 0.045, v);
      m.identity(); m.setPosition(x, 0.33, z); mesh.setMatrixAt(i, m);
    });

  // The named rooms: a low partition round each, a banquette inside it and a
  // sign colour that matches the neon the drawing gives that room.
  const bolmeMat = material(0xdcd6d0, { roughness: 0.85 });
  const kanepeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.7, vertexColors: true,
    emissive: 0x6a3f8a, emissiveIntensity: 0.34,
  });
  const oda = KULUP.odalar;
  const bolmeler = [];
  oda.forEach((o) => {
    const a = alan(o.k);
    bolmeler.push({ g: a.g, d: 0.26, u: a.u, v: o.k[1] });
    bolmeler.push({ g: 0.26, d: a.d, u: o.k[0], v: a.v });
    bolmeler.push({ g: 0.26, d: a.d, u: o.k[2], v: a.v });
  });
  seri(kutu(1, 1, 1), bolmeMat, bolmeler.length, (i, m, mesh) => {
    const b = bolmeler[i];
    const [x, z] = P(b.u, b.v);
    m.makeScale(b.g, 0.85, b.d);
    m.setPosition(x, 0.42, z);
    mesh.setMatrixAt(i, m);
  });
  seri(kutu(1, 1, 1), kanepeMat, oda.length, (i, m, mesh) => {
    const a = alan(oda[i].k);
    const [x, z] = P(a.u, a.v);
    m.makeScale(a.g * 0.66, 0.6, a.d * 0.42);
    m.setPosition(x, 0.3, z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(oda[i].renk));
  });

  add?.(zemin, { walkable: true, camera: false, cast: false });
}

// ------------------------------------------------------------------ boutique

// Read off design/referans-mekanlar/kiyafet-magazasi.jpg. Beige rounded shell,
// pale tile floor; folded-stack shelves down the west wall, a long shelf-and-
// rail unit across the north, two rack islands mid-floor and one lower, two
// display tables of folded piles, two fitting rooms with pink curtains, a
// standing mirror, and the rounded counter with its till by the east wall.
const BUTIK = Object.freeze({
  duvar: 0.035,
  kapi: Object.freeze([0.62, 0.80]),          // doorway span on the south wall
  batiRaf: Object.freeze({ u: 0.085, z0: 0.10, z1: 0.88, adet: 9 }),
  kuzeyRaf: Object.freeze([0.16, 0.075, 0.50, 0.185]),   // x0, z0, x1, z1
  askiAda: Object.freeze([
    [0.225, 0.30, 0.415, 0.415],
    [0.475, 0.30, 0.665, 0.415],
    [0.215, 0.545, 0.345, 0.655],
    [0.545, 0.545, 0.675, 0.655],
  ]),
  masa: Object.freeze([[0.415, 0.50, 0.575, 0.60], [0.375, 0.68, 0.545, 0.775]]),
  kabinler: Object.freeze([[0.575, 0.075], [0.70, 0.075]]),
  ayna: Object.freeze([0.82, 0.20]),
  puf: Object.freeze([0.72, 0.33]),
  hali: Object.freeze([0.72, 0.33]),
  kasa: Object.freeze([0.80, 0.55, 0.885, 0.76]),
});

function butik({ THREE, kok, add, material, mekan }) {
  const S = MEKAN_PLOT;
  const P = (u, v) => [mekan.x + (u - 0.5) * S, mekan.z + (v - 0.5) * S];
  const uz = (a, b) => (b - a) * S;
  const M4 = new THREE.Matrix4();
  const seri = (geo, mat, n, yerlestir) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i += 1) yerlestir(i, M4, mesh);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    kok.add(mesh);
    return mesh;
  };

  const zeminMat = material(0xdde4e4, { roughness: 0.85 });
  const duvarMat = material(0xe6d9c8, { roughness: 0.9 });
  const ahsap = material(0xcaa877, { roughness: 0.75 });
  const metal = material(0x8a8f98, { roughness: 0.4 });
  const kumasRenk = ['#e8a8a5', '#a8c3e0', '#b9d3b2', '#e7cfa1', '#c9b6dd', '#f0e6da', '#9fb9d8', '#e0b6ad'];

  // The whole boutique is nine draws of furniture: every wooden box, every
  // pole and every hanging piece rides a shared instanced mesh — the first
  // pass built them one mesh each and blew the lobby's draw budget.
  const ahsapKutular = [];   // [u, v, y, w, h, d]
  const silindirler = [];    // [u, v, y, r, len, yatay]
  const askilar = [];        // [u, v, y, renkIdx]
  const katlar = [];         // [u, v, y, renkIdx, olcek]

  const zemin = new THREE.Mesh(new THREE.BoxGeometry(S, 0.4, S), zeminMat);
  {
    const [x, z] = P(0.5, 0.5);
    zemin.position.set(x, -0.2, z);
  }
  zemin.name = 'mekan:magaza-zemin';
  kok.add(zemin);

  // Shell walls with the south doorway.
  const d = BUTIK.duvar;
  const yuk = 1.5;
  const kal = 0.4;
  const [ka, kb] = BUTIK.kapi;
  const duvarlar = [
    { g: S * (1 - d * 2), dd: kal, u: 0.5, v: d },
    { g: kal, dd: S * (1 - d * 2), u: d, v: 0.5 },
    { g: kal, dd: S * (1 - d * 2), u: 1 - d, v: 0.5 },
    { g: S * (ka - d), dd: kal, u: d + (ka - d) / 2, v: 1 - d },
    { g: S * (1 - d - kb), dd: kal, u: kb + (1 - d - kb) / 2, v: 1 - d },
    // Fitting-room shells share the wall material and mesh.
    { g: 2.2 / S * S, dd: 2.0, u: BUTIK.kabinler[0][0], v: BUTIK.kabinler[0][1], h: 2.1 },
    { g: 2.2, dd: 2.0, u: BUTIK.kabinler[1][0], v: BUTIK.kabinler[1][1], h: 2.1 },
  ];
  seri(new THREE.BoxGeometry(1, 1, 1), duvarMat, duvarlar.length, (i, m, mesh) => {
    const k = duvarlar[i];
    const [x, z] = P(k.u, k.v);
    const h = k.h || yuk;
    m.makeScale(k.g, h, k.dd);
    m.setPosition(x, h / 2, z);
    mesh.setMatrixAt(i, m);
  });

  // West wall cubbies with folded stacks.
  const raf = BUTIK.batiRaf;
  for (let i = 0; i < raf.adet; i += 1) {
    const v = raf.z0 + ((i + 0.5) / raf.adet) * (raf.z1 - raf.z0);
    ahsapKutular.push([raf.u, v, 0.55, 1.3, 1.05, uz(raf.z0, raf.z1) / raf.adet - 0.12]);
    for (let kat = 0; kat < 4; kat += 1) {
      katlar.push([
        raf.u + 0.012, v + (kat % 2 === 0 ? -0.006 : 0.006), 0.28 + Math.floor(kat / 2) * 0.5,
        (i * 3 + kat) % kumasRenk.length, 1,
      ]);
    }
  }

  // North unit: shelf over a rail of hangers.
  const [nx0, nz0, nx1, nz1] = BUTIK.kuzeyRaf;
  ahsapKutular.push([(nx0 + nx1) / 2, (nz0 + nz1) / 2, 1.28, uz(nx0, nx1), 0.1, uz(nz0, nz1)]);
  silindirler.push([(nx0 + nx1) / 2, (nz0 + nz1) / 2, 1.05, 0.035, uz(nx0, nx1), true]);
  const kuzeyAski = 14;
  for (let i = 0; i < kuzeyAski; i += 1) {
    askilar.push([nx0 + ((i + 0.5) / kuzeyAski) * (nx1 - nx0), (nz0 + nz1) / 2 + 0.012, 0.66,
      i % kumasRenk.length]);
  }

  // Rack islands.
  for (const [ax0, az0, ax1, az1] of BUTIK.askiAda) {
    const orta = (az0 + az1) / 2;
    ahsapKutular.push([(ax0 + ax1) / 2, orta, 0.04, uz(ax0, ax1), 0.08, 0.5]);
    silindirler.push([ax0 + 0.012, orta, 0.65, 0.035, 1.3, false]);
    silindirler.push([ax1 - 0.012, orta, 0.65, 0.035, 1.3, false]);
    silindirler.push([(ax0 + ax1) / 2, orta, 1.28, 0.03, uz(ax0, ax1) - 0.3, true]);
    const adet = Math.max(4, Math.round(uz(ax0, ax1) / 0.42));
    for (let i = 0; i < adet; i += 1) {
      askilar.push([ax0 + 0.02 + ((i + 0.5) / adet) * (ax1 - ax0 - 0.04), orta, 0.88,
        (i * 5 + 2) % kumasRenk.length]);
    }
  }

  // Display tables with piles.
  for (const [tx0, tz0, tx1, tz1] of BUTIK.masa) {
    ahsapKutular.push([(tx0 + tx1) / 2, (tz0 + tz1) / 2, 0.62, uz(tx0, tx1), 0.09, uz(tz0, tz1)]);
    for (const u of [tx0 + 0.02, tx1 - 0.02]) {
      for (const v of [tz0 + 0.015, tz1 - 0.015]) silindirler.push([u, v, 0.3, 0.035, 0.6, false]);
    }
    for (let i = 0; i < 6; i += 1) {
      katlar.push([
        tx0 + 0.025 + ((i % 3 + 0.5) / 3) * (tx1 - tx0 - 0.05),
        tz0 + 0.02 + ((Math.floor(i / 3) + 0.5) / 2) * (tz1 - tz0 - 0.04),
        0.74, (i * 7 + 1) % kumasRenk.length, 0.8,
      ]);
    }
  }

  // Mirror frame, counter and till ride the wooden instanced mesh too.
  ahsapKutular.push([BUTIK.ayna[0], BUTIK.ayna[1], 0.95, 0.8, 1.9, 0.08]);
  const [cx0, cz0, cx1, cz1] = BUTIK.kasa;
  ahsapKutular.push([(cx0 + cx1) / 2, cz0 + (cz1 - cz0) * 0.18, 0.5, uz(cx0, cx1), 1.0, uz(cz0, cz1) * 0.35]);

  seri(new THREE.BoxGeometry(1, 1, 1), ahsap, ahsapKutular.length, (i, m, mesh) => {
    const [u, v, y, w, h, dd] = ahsapKutular[i];
    const [x, z] = P(u, v);
    m.makeScale(w, h, dd);
    m.setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
  });
  seri(new THREE.CylinderGeometry(1, 1, 1, 8), metal, silindirler.length, (i, m, mesh) => {
    const [u, v, y, r, len, yatay] = silindirler[i];
    const [x, z] = P(u, v);
    if (yatay) m.makeRotationZ(Math.PI / 2); else m.identity();
    const olcekM = new THREE.Matrix4().makeScale(r, len, r);
    m.multiply(olcekM);
    m.setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
  });
  const askiGeo = beyazRenk(THREE, new THREE.BoxGeometry(0.34, 0.72, 0.06));
  const kumas = material(0xffffff, { roughness: 0.75, vertexColors: true });
  seri(askiGeo, kumas, askilar.length, (i, m, mesh) => {
    const [u, v, y, renk] = askilar[i];
    const [x, z] = P(u, v);
    m.identity();
    m.setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(kumasRenk[renk]));
  });
  const katGeo = beyazRenk(THREE, new THREE.BoxGeometry(0.5, 0.14, 0.6));
  seri(katGeo, kumas, katlar.length, (i, m, mesh) => {
    const [u, v, y, renk, olcek] = katlar[i];
    const [x, z] = P(u, v);
    m.makeScale(olcek, 1, olcek * 0.9);
    m.setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(kumasRenk[renk]));
  });

  // The handful of one-offs: curtains, mirror glass, rug, pouf, bag, hat, till.
  const tekil = (geo, mat, u, v, y, rotY = 0) => {
    const m = new THREE.Mesh(geo, mat);
    const [x, z] = P(u, v);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    kok.add(m);
    return m;
  };
  const perdeGeo = new THREE.BoxGeometry(1.7, 1.7, 0.06);
  const perdeMat = material(0xe8a8a5, { roughness: 0.85 });
  seri(perdeGeo, perdeMat, BUTIK.kabinler.length, (i, m, mesh) => {
    const [ku, kv] = BUTIK.kabinler[i];
    const [x, z] = P(ku, kv);
    m.identity();
    m.setPosition(x, 0.95, z + 1.03);
    mesh.setMatrixAt(i, m);
  });
  tekil(new THREE.BoxGeometry(0.62, 1.7, 0.02),
    material(0xbfd9dd, { roughness: 0.1, metalness: 0.6 }),
    BUTIK.ayna[0] - 0.002, BUTIK.ayna[1] + 0.004, 0.95, -0.4);
  // Rug, pouf and the straw hat share one tinted cylinder mesh; the bag and
  // the till share one tinted box mesh — six one-offs down to two draws.
  const renkliSilindir = [
    [BUTIK.hali[0], BUTIK.hali[1], 0.03, 1.5, 0.04, '#c9a8bb'],
    [BUTIK.puf[0], BUTIK.puf[1], 0.25, 0.47, 0.5, '#9db4c9'],
    [BUTIK.masa[0][2] - 0.03, BUTIK.masa[0][1] + 0.028, 0.72, 0.26, 0.1, '#e7cfa1'],
  ];
  seri(beyazRenk(THREE, new THREE.CylinderGeometry(1, 1, 1, 20)), kumas,
    renkliSilindir.length, (i, m, mesh) => {
      const [u, v, y, r, h, renk] = renkliSilindir[i];
      const [x, z] = P(u, v);
      m.makeScale(r, h, r);
      m.setPosition(x, y, z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(renk));
    });
  const renkliKutu = [
    [(BUTIK.masa[0][0] + BUTIK.masa[0][2]) / 2, BUTIK.masa[0][1] + 0.028, 0.9, 0.34, 0.4, 0.2, '#9a86c9'],
    [(cx0 + cx1) / 2, cz0 + (cz1 - cz0) * 0.14, 1.14, 0.34, 0.26, 0.3, '#2c2f38'],
  ];
  seri(beyazRenk(THREE, new THREE.BoxGeometry(1, 1, 1)), kumas,
    renkliKutu.length, (i, m, mesh) => {
      const [u, v, y, w, h, dd, renk] = renkliKutu[i];
      const [x, z] = P(u, v);
      m.makeScale(w, h, dd);
      m.setPosition(x, y, z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(renk));
    });

  add?.(zemin, { walkable: true, camera: false, cast: false });
}
