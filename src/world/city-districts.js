// city-districts.js — Oscar's 67 city, copied cell-for-cell from the rich
// reference render (2026-08-04). No interpretation: the reference is a square
// street GRID, sea filling the whole right margin, river down the left and
// along the bottom with suburb houses outside the grid. Every position below
// is the reference's pixel fraction mapped onto world units (image fx,fy ->
// x=(fx-0.5)*120, z=(fy-0.5)*120), and every color is sampled from the
// render's lit pixels.
//
// Cells (world coords, roads at x=-20/+16/+44/-51, z=-19/+16/+46/-51):
//   NW corner  kart loop; then parking + solar gym; athletics; baseball
//   N center   the 67 skatepark (moved whole, not altered)
//   NE         funfair (ferris, carousel, coaster); marina on the coast road
//   E margin   SEA, beach cape with umbrellas and the lighthouse
//   center     framed 67 plaza; left dense blocks + court; right the stadium
//   S center   market square; SW/SE blocks and the playground with pools
//   edges      river + bridges + suburb houses
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  canvasTexture, squirclePoints, roundedBoxGeometry, insetPolygon,
  ribbonSides, shapeFromPoints, wallStripGeometry, copingTube, tinted, tintedByHeight,
} from './sekil.js';

import { PLAN_BINALAR, PLAN_BINA_RENK, PLAN_AGACLAR, PLAN_ARABALAR } from './plan-verisi.js';
import {
  PLAN_ANA_YOLLAR, PLAN_PATIKALAR, PLAN_ZEBRALAR, PLAN_KAVSAKLAR, PLAN_PAZAR,
  PLAN_SPOR_OLCU, PLAN_KART,
  PLAN_MERKEZ_MEYDAN, PLAN_MERKEZ_CESME, PLAN_PLAZA_KULELERI,
} from './plan-ek.js';
import { buildFunfair } from './city-funfair.js';
import {
  PLAN_BANKLAR, PLAN_SEMSIYELER, PLAN_LAMBALAR, PLAN_HEYKELLER,
  PLAN_COPLER, PLAN_UFAKLAR,
} from './plan-oge.js';
import {
  MARINA_KIYI, MARINA_KUM_GENISLIK, MARINA_DOGU_KENAR, MARINA_PROMENAD,
  MARINA_ISKELELER, MARINA_PARMAKLAR, MARINA_TEKNELER, MARINA_TEKNE_BOY,
  MARINA_YELKENLI, MARINA_FENER,
} from './plan-marina.js';
import {
  SKATE_PLAZA, SKATE_BOWL, SKATE_TROUGHS, SKATE_KERBS, SKATE_RAMPS,
  SKATE_LEDGES, SKATE_BANKS, SKATE_STAIRS, SKATE_RAIL_GARDEN, SKATE_LEDGE_WALL,
} from './plan-skate.js';
const COPING = Object.freeze({ red: 0xe0745e, blue: 0x5a80d6, yellow: 0xf6c445 });

// Landmark buildings generated from the map itself: single-object crops of
// Oscar's reference were run through Meshy image-to-3D, so the geometry comes
// from his own drawing rather than from a text prompt. Only the three that
// actually reproduced their crop are here — crops holding more than one
// building came back as nonsense and were discarded. Textures are resized to
// 256px and meshes simplified, which took each from ~2MB to under 200KB; no
// mesh compression, because this project ships neither a DRACO nor a meshopt
// decoder and meshopt fails silently.
const LANDMARK_MODELS = Object.freeze({
  // [file, target height, sites]
  gozlemevi: { height: 5.2, sites: [{ x: -46, z: -10, yaw: 0 }] },
  'bina-krmz': { height: 4.4, sites: [{ x: -32, z: 10, yaw: Math.PI }, { x: 9, z: 24, yaw: 0 }] },
  'bina-mavi': { height: 4, sites: [{ x: -42, z: 8, yaw: Math.PI / 2 }, { x: -12, z: 40, yaw: 0 }] },
});

function normalizeLandmark(gltf, targetHeight) {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0) model.scale.setScalar(targetHeight / size.y);
  const scaled = new THREE.Box3().setFromObject(model);
  const centre = scaled.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -scaled.min.y, -centre.z);
  // Meshy renders its own lighting into the texture, so these arrive brighter
  // than the procedural blocks beside them. Tinting the material multiplies
  // the map down into the same cream family without flattening the awning
  // stripes, which are the part worth keeping.
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) {
      if (!item) continue;
      item.color?.setHex(0xb9aaa5);
      item.roughness = 0.75;
      item.metalness = 0;
    }
  });
  const wrap = new THREE.Group();
  wrap.add(model);
  return wrap;
}

function copingArc(material, radius, tube, arc) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 24, arc), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// A flat band laid along a centreline. u runs the length of the band and v
// runs across it, so a texture of rows paints stripes parallel to the running
// direction — which is what a lane-marked running track is. A torus cannot do
// this: its tube wraps the wrong way and its footprint is a circle.
// `repeat` is how many times the texture tiles along the length.
function flatRibbonGeometry(line, half, y, repeat = 1, closed = true) {
  const points = line.slice();
  // Two windings are possible for the same loop and only one of them faces
  // the sky. Normalise on the signed area so the triangle order below is
  // always right way up.
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    area += x1 * z2 - x2 * z1;
  }
  if (area < 0) points.reverse();
  const count = points.length;
  const last = closed ? count : count - 1;
  const dist = [0];
  for (let i = 1; i <= last; i += 1) {
    const a = points[i - 1];
    const b = points[i % count];
    dist.push(dist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = dist[last] || 1;
  const rims = points.map((p, i) => {
    const a = points[closed ? (i - 1 + count) % count : Math.max(0, i - 1)];
    const b = points[closed ? (i + 1) % count : Math.min(count - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    return [[p[0] - dz * half, p[1] + dx * half], [p[0] + dz * half, p[1] - dx * half]];
  });
  const position = [];
  const normal = [];
  const uv = [];
  for (let i = 0; i < last; i += 1) {
    const j = (i + 1) % count;
    const [l0, r0] = rims[i];
    const [l1, r1] = rims[j];
    const u0 = (dist[i] / total) * repeat;
    const u1 = (dist[i + 1] / total) * repeat;
    position.push(l0[0], y, l0[1], r1[0], y, r1[1], r0[0], y, r0[1]);
    position.push(l0[0], y, l0[1], l1[0], y, l1[1], r1[0], y, r1[1]);
    uv.push(u0, 0, u1, 1, u0, 1, u0, 0, u1, 0, u1, 1);
    for (let k = 0; k < 6; k += 1) normal.push(0, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

// A shape from world-space [x, z] points. Shapes are authored in XY and laid
// flat by a -90 degree turn about X, which maps shape y to world -z.
function groundShape(points, Ctor = THREE.Shape) {
  const shape = new Ctor();
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  return shape;
}

// A flat slab from one or more ground shapes: one draw for the whole set.
function slabGeometry(shapes, thickness, y) {
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: thickness, bevelEnabled: false, curveSegments: 16,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

function flatLabel(text, size) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffffff';
  c.font = '800 64px Figtree, Arial';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 64, 68);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// Trees in the reference are not single spheres: each is a cluster of five to
// eight overlapping blobs of varying size, which is what gives the park its
// broccoli-canopy read. One InstancedMesh holds every blob on the map, so the
// whole planting is a single draw call. Layout is deterministic (hashed from
// the tree's own coordinates) so the world is reproducible.
// The reference's buildings are squircles, not boxes: soft rounded corners
// with a flat top. One unit-sized geometry, scaled per instance.
// The reference's ground is not one flat tone: beside a building it reads
// 170,142,151 and out in the open 235,211,211, a sixty-five level spread that
// is contact shading. Mine measured 217,204,199 everywhere, which is exactly
// why the city looked like cut paper. A shadow map alone does not give this —
// it is ambient occlusion, and AO is post-process and tier-gated here, so the
// pool under each block is baked instead: one soft radial decal, one draw for
// the whole city, present on every device.
// Anything the plan puts seaward of the measured shore would be standing in
// the water. One four-storey block was, a hundred metres offshore, because the
// old sea was a slab nobody tested against. This is the test.
function kiyiX(z) {
  const K = MARINA_KIYI;
  if (z <= K[0][1] || z >= K[K.length - 1][1]) return Infinity;
  for (let i = 1; i < K.length; i += 1) {
    if (z <= K[i][1]) {
      const t = (z - K[i - 1][1]) / (K[i][1] - K[i - 1][1] || 1);
      return K[i - 1][0] + (K[i][0] - K[i - 1][0]) * t;
    }
  }
  return Infinity;
}
const denizdeMi = (x, z) => x > kiyiX(z);

function contactShadowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  // Multiply blending, so the decal darkens whatever it lies on and white
  // costs nothing. The dark core has to reach well past the block's own
  // plinth or the only part anyone sees is the tail of the falloff.
  const gradient = c.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, '#4a3d46');
  gradient.addColorStop(0.74, '#574a53');
  gradient.addColorStop(0.9, '#a2969d');
  gradient.addColorStop(1, '#ffffff');
  c.fillStyle = gradient;
  c.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

const BLOBS_PER_TREE = 6;
function treeBlobs(positions, THREE_, blobMaterial) {
  const blobs = new THREE_.InstancedMesh(
    new THREE_.SphereGeometry(1, 9, 7),
    blobMaterial,
    positions.length * BLOBS_PER_TREE,
  );
  const m = new THREE_.Matrix4();
  positions.forEach(([x, z, scale = 1], t) => {
    // Cheap deterministic hash per tree, so clusters differ but never drift.
    let seed = Math.abs(Math.round(x * 73856093) ^ Math.round(z * 19349663));
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed % 1000) / 1000;
    };
    for (let b = 0; b < BLOBS_PER_TREE; b += 1) {
      const angle = (b / BLOBS_PER_TREE) * Math.PI * 2 + rand() * 0.9;
      const spread = b === 0 ? 0 : (0.5 + rand() * 0.55) * scale;
      const radius = (b === 0 ? 0.95 : 0.5 + rand() * 0.4) * scale;
      m.makeScale(radius, radius * 0.86, radius);
      m.setPosition(
        x + Math.cos(angle) * spread,
        (b === 0 ? 1.35 : 1.05 + rand() * 0.75) * scale,
        z + Math.sin(angle) * spread,
      );
      blobs.setMatrixAt(t * BLOBS_PER_TREE + b, m);
    }
  });
  blobs.instanceMatrix.needsUpdate = true;
  return blobs;
}

export function buildCityDistricts({ group, add, material, animated, buildStadium, stadiumPitch }) {
  // Calibrated, not guessed: the first pass was measured against the
  // reference by sampling matching zones in both renders. The hub lighting
  // lifts everything ~1.22x, so each base color is the reference color
  // divided back down by its measured ratio. Water needed the most: it was
  // washing out to near-white, so its base is a real blue now.
  const mats = {
    // Measured against the reference, not picked: the drawing's paving is a
    // warm pink-grey (221,197,195 lit) and mine was landing near-neutral
    // (213,209,200). Dividing the target back through the measured lighting
    // gain puts the base here.
    concrete: material(0xcbb5b2, { roughness: 0.62 }),
    concreteDeep: material(0xb8b2a6, { roughness: 0.7 }),
    // The market square's paving is the warmest ground in the reference —
    // (205,174,166) on its lit half against (232,210,208) for the street it
    // sits in. The square used concreteDeep and captured (207,201,190), a
    // flat grey with no warmth in it at all. concreteDeep's base against that
    // capture gives the gain this surface sees, 1.13; the first base off that
    // division landed ten green and six blue high, so both are trimmed and
    // the square now captures (206,178,171).
    marketPaving: material(0xb59290, { roughness: 0.72 }),
    // Stall canopies, sampled off the reference's olive awnings at
    // (189,173,150) and trimmed the same way — captured (191,176,151).
    stallCanopy: material(0xa1917c, { roughness: 0.8 }),
    block: material(0xb5a9a6, { roughness: 0.7 }),
    blockDark: material(0xa39590, { roughness: 0.75 }),
    // The reference's court is a deep muted olive, 102,107,93 lit.
    court: material(0x5c6b48, { roughness: 0.9 }),
    // Sports turf: the athletics infield, the baseball outfield and the
    // diamond inside its sand fan. Sampled off the reference at (176,175,145)
    // in the oval, (176,172,143) in the outfield and (184,168,134) in the
    // diamond, so one olive carries all three. The old base captured
    // (84,93,70) — a forest green nothing in the drawing is.
    pitch: material(0x959276, { roughness: 0.92 }),
    // Baseball dirt, sampled (227,198,164) on the fan and (234,200,165) on
    // the pitcher's mound. mats.sand is the beach and stays where it is; this
    // is a warmer, more saturated tan than wet sand.
    ballDirt: material(0xe1ae84, { roughness: 0.95 }),
    // The kart circuit's lawn in the north-west corner, sampled (177,177,153)
    // at (-53,-50) and (179,178,147) at (-58,-46).
    kartLawn: material(0x95967d, { roughness: 0.95 }),
    // Its kerbs: the dark line down each side of the ribbon, (103,108,104)
    // and (91,91,89) at z = -50.
    kartKerb: material(0x565d5f, { roughness: 0.9 }),
    // Its surface. Warmer than the city's tarmac — the render puts the roads
    // at a neutral (216,204,204) and this ribbon at (202,181,177).
    kartYol: material(0xb79b9e, { roughness: 0.95 }),
    // The gym's roof light is glazing, not a white lid: the reference reads
    // (145,151,175) and (161,168,196) across it, a cool blue-grey.
    roofGlass: material(0x6d7595, { roughness: 0.35, metalness: 0.1 }),
    trackRed: material(0xa9736a, { roughness: 0.9 }),
    // The stadium's track reads 122,112,129 in the reference — a purple-grey,
    // most of it the bowl wall's own shadow, so the base sits above that and
    // lets the shadow do the rest.
    stadiumTrack: material(0x645c6a, { roughness: 0.92 }),
    grass: material(0x868b6e, { roughness: 0.95 }),
    sand: material(0xd8bcae, { roughness: 0.95 }),
    water: material(0x8caddf, { roughness: 0.25, transparent: true, opacity: 0.97 }),
    // The reference's roads are a warm NEUTRAL grey — its green and blue
    // channels are equal (#d8cccc). Mine had blue well under green, which is
    // exactly what read as brown. Measured and corrected: green and blue now
    // match on the road, its kerb and its paint.
    // The sun is warm (0xffefd4), so it drags blue down on every surface it
    // touches; the base colours carry extra blue to land neutral once lit.
    road: material(0xc7b6c1, { roughness: 0.95 }),
    kerbLight: material(0xd8c6d1, { roughness: 0.9 }),
    paint: material(0xf0e2ea, { roughness: 0.9 }),
    stone: material(0xaf9f9e, { roughness: 0.8 }),
    // The reference's timber is a soft warm tan (212,180,170 lit), not the
    // saturated orange this was; measured off the piers and divided back
    // through the lighting gain.
    wood: material(0xb09492, { flatShading: true, roughness: 1 }),
    rail: material(0x70757e, { roughness: 0.35, metalness: 0.4 }),
    white: material(0xbeb3b7, { roughness: 0.6 }),
    cream: material(0xbeb0a9, { roughness: 0.5 }),
    // Skatepark surfaces are one-sided sheets — bowl walls, ramp faces — so
    // they are drawn from both sides rather than gambling on winding, and the
    // painted lips carry their colour on the vertices so bowls, kerbs and
    // ramps in three colours still cost a single draw.
    skateDeep: material(0xffffff, { roughness: 0.75, side: THREE.DoubleSide, vertexColors: true }),
    skatePale: material(0xc0b7ad, { roughness: 0.6, side: THREE.DoubleSide }),
    skateLip: material(0xffffff, { vertexColors: true, roughness: 0.35 }),
    copingRed: material(COPING.red, { roughness: 0.35 }),
    copingBlue: material(COPING.blue, { roughness: 0.35 }),
    copingYellow: material(COPING.yellow, { roughness: 0.35 }),
    pink: material(0xe89ab8, { roughness: 0.7 }),
    carDark: material(0x3f4652, { roughness: 0.35 }),
    tire: material(0x2c2f34, { roughness: 0.9 }),
    glass: material(0xcfe9f5, { roughness: 0.3, emissive: 0x88b8cc, emissiveIntensity: 0.25 }),
  };
  const CAR_PAINT = [0xe0745e, 0x5a80d6, 0xf6c445, 0x6fae72, 0xd8d3c8, 0xa78bda];

  // The hub lighting lifts every surface by the same measured 1.22, and an
  // instanced mesh multiplies its per-instance colour by the material's own.
  // The plan files store colours as they were sampled off the lit reference,
  // so anything going onto a mats.white instance has to be divided back
  // through both or it lands dark. Written once here rather than at each site.
  const ISIK_KAZANCI = 1.22;
  const beyazTers = new THREE.Color(
    1 / (ISIK_KAZANCI * mats.white.color.r),
    1 / (ISIK_KAZANCI * mats.white.color.g),
    1 / (ISIK_KAZANCI * mats.white.color.b),
  );
  const olculenRenk = (renk) => new THREE.Color(renk).multiply(beyazTers);

  // -------------------------------------------------------------------
  // STREET GRID — reference-exact: light warm asphalt, dashed center
  // lines, kerb edge strips, crosswalks at every junction.
  // -------------------------------------------------------------------
  // Axes measured off the plan, not chosen: the drawing puts its verticals at
  // x = -53.7, -19, 18.6 and 41.7 and its horizontals at z = -51, -18.5, 18.2
  // and 52. Several earlier guesses were two to six units out, which is what
  // pushed plan-placed buildings onto the carriageway.
  const ROAD_W = 4.6;
  // Roads come from the plan: PLAN_ANA_YOLLAR holds every arterial the drawing
  // shows with its measured centre, length and width — twenty-six of them, not
  // the four-by-four grid I had drawn by hand. Each is laid along its longer
  // axis. PLAN_PATIKALAR carries the park walks and neighbourhood lanes.
  const yatayMi = (g, d) => g >= d;
  // A road is a segment, not an infinite line. The plan gives each one a
  // length as well as a centre, and that length has to be carried into the
  // clash test: the drawing's z = 34.88 street is fourteen units long out at
  // x = -55, and the z = 22.86 park walk is twenty-one units long out at
  // x = 34, but both were being treated as full-width barriers across the
  // whole map. Between those two phantom lines the market square's flanking
  // blocks — 6.7 and 7.2 deep, standing at z 27.6..42.2 — had nowhere to sit,
  // so the solver shrank them to two thirds, shoved them north into the
  // plaza, and gave up on one of them entirely. Each road now carries the
  // span it actually covers along its own long axis.
  const V_ROADS = PLAN_ANA_YOLLAR.filter(([, , g, d]) => !yatayMi(g, d))
    .map(([x, z, , d]) => [x, z - d / 2, z + d / 2]);
  const H_ROADS = PLAN_ANA_YOLLAR.filter(([, , g, d]) => yatayMi(g, d))
    .map(([x, z, g]) => [z, x - g / 2, x + g / 2]);

  // Nothing from the plan may stand on a road. A footprint that lands on a
  // carriageway is not deleted — the plan drew a building there and it should
  // exist — it is pushed clear along whichever axis needs the smaller move,
  // the way a site plan resolves a clash.
  // The plan builds right up to the kerb, so the setback is a kerb's width,
  // not a garden. A larger margin was rejecting terraces that genuinely fit.
  const YOL_PAYI = ROAD_W / 2 + 0.35;
  // A footprint only clashes with a road if it overlaps the road's own length
  // as well as crossing its centre line.
  const boyunca = (c, half, min, max) => c + half > min && c - half < max;
  function yoldanKaydir(x, z, w = 0, d = 0) {
    let nx = x;
    let nz = z;
    for (let tur = 0; tur < 3; tur += 1) {
      let carpisma = false;
      for (const [rx, z0, z1] of V_ROADS) {
        if (!boyunca(nz, d / 2, z0, z1)) continue;
        const bindirme = YOL_PAYI + w / 2 - Math.abs(nx - rx);
        if (bindirme > 0) { nx += nx >= rx ? bindirme : -bindirme; carpisma = true; }
      }
      for (const [rz, x0, x1] of H_ROADS) {
        if (!boyunca(nx, w / 2, x0, x1)) continue;
        const bindirme = YOL_PAYI + d / 2 - Math.abs(nz - rz);
        if (bindirme > 0) { nz += nz >= rz ? bindirme : -bindirme; carpisma = true; }
      }
      if (!carpisma) break;
    }
    return [nx, nz];
  }
  function yolUstunde(x, z, w = 0, d = 0) {
    for (const [rx, z0, z1] of V_ROADS) {
      if (boyunca(z, d / 2, z0, z1) && Math.abs(x - rx) < YOL_PAYI + w / 2) return true;
    }
    for (const [rz, x0, x1] of H_ROADS) {
      if (boyunca(x, w / 2, x0, x1) && Math.abs(z - rz) < YOL_PAYI + d / 2) return true;
    }
    return false;
  }

  // One instanced mesh carries every arterial; scale gives each its measured
  // length and width, so the network is the plan's rather than a grid.
  const anaYollar = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.08, 1), mats.road, PLAN_ANA_YOLLAR.length,
  );
  const ym = new THREE.Matrix4();
  PLAN_ANA_YOLLAR.forEach(([x, z, g, d], i) => {
    ym.makeScale(Math.max(g, ROAD_W * 0.7), 1, Math.max(d, ROAD_W * 0.7));
    ym.setPosition(x, 0.04, z);
    anaYollar.setMatrixAt(i, ym);
  });
  anaYollar.instanceMatrix.needsUpdate = true;
  anaYollar.name = 'district:road-grid';
  add(anaYollar, { walkable: true, camera: false, cast: false });

  // Park walks and neighbourhood lanes: narrower, and they never carry traffic.
  // Park walks and the kerb lips share the pale material and a unit box, so
  // both live in one instanced mesh: the walks first, then two lips per road.
  const patikalar = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), mats.kerbLight,
    PLAN_PATIKALAR.length + PLAN_ANA_YOLLAR.length * 2,
  );
  PLAN_PATIKALAR.forEach(([x, z, g, d], i) => {
    ym.makeScale(Math.max(g, 1.2), 0.07, Math.max(d, 1.2));
    ym.setPosition(x, 0.05, z);
    patikalar.setMatrixAt(i, ym);
  });
  patikalar.name = 'district:cross-roads';

  // Roundabouts where the plan marks them, each with its green island.
  const kavsaklar = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 0.1, 18), mats.road, Math.max(1, PLAN_KAVSAKLAR.length),
  );
  const kavsakYesil = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 0.14, 14), mats.grass, Math.max(1, PLAN_KAVSAKLAR.length),
  );
  PLAN_KAVSAKLAR.forEach(([x, z, g, d], i) => {
    const r = Math.max(2.2, (g + d) / 4);
    ym.makeScale(r, 1, r);
    ym.setPosition(x, 0.05, z);
    kavsaklar.setMatrixAt(i, ym);
    ym.makeScale(r * 0.42, 1, r * 0.42);
    ym.setPosition(x, 0.09, z);
    kavsakYesil.setMatrixAt(i, ym);
  });
  kavsaklar.instanceMatrix.needsUpdate = true;
  kavsakYesil.instanceMatrix.needsUpdate = true;
  add(kavsaklar, { walkable: true, camera: false, cast: false });
  add(kavsakYesil, { camera: false, cast: false });

  // Kerb lips down both sides of every arterial, and the dashed centre line
  // along its length — both derived from the plan's own road records.
  const kerbTaban = PLAN_PATIKALAR.length;
  const dashList = [];
  PLAN_ANA_YOLLAR.forEach(([x, z, g, d], i) => {
    const yatay = yatayMi(g, d);
    const uzun = Math.max(g, d);
    const genis = Math.max(Math.min(g, d), ROAD_W * 0.7);
    for (const yon of [-1, 1]) {
      if (yatay) {
        ym.makeScale(uzun, 0.1, 0.5);
        ym.setPosition(x, 0.05, z + yon * (genis / 2 + 0.25));
      } else {
        ym.makeScale(0.5, 0.1, uzun);
        ym.setPosition(x + yon * (genis / 2 + 0.25), 0.05, z);
      }
      patikalar.setMatrixAt(kerbTaban + i * 2 + (yon < 0 ? 0 : 1), ym);
    }
    const adim = 4.4;
    for (let t = -uzun / 2 + 2; t < uzun / 2 - 1; t += adim) {
      dashList.push(yatay ? [x + t, z, Math.PI / 2] : [x, z + t, 0]);
    }
  });

  const dashes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.28, 0.02, 1.9), mats.paint, Math.max(1, dashList.length),
  );
  dashList.forEach(([x, z, rot], i) => {
    const m = new THREE.Matrix4().makeRotationY(rot);
    m.setPosition(x, 0.1, z);
    dashes.setMatrixAt(i, m);
  });
  dashes.instanceMatrix.needsUpdate = true;
  dashes.name = 'district:lane-dashes';
  add(dashes, { camera: false, cast: false });
  patikalar.instanceMatrix.needsUpdate = true;
  add(patikalar, { camera: false, cast: false });

  // Crosswalks exactly where the plan paints them: each record becomes a set
  // of five stripes laid across the road it belongs to.
  const stripes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.02, 3.4), mats.paint, Math.max(1, PLAN_ZEBRALAR.length * 5),
  );
  PLAN_ZEBRALAR.forEach(([x, z, g, d], c) => {
    const yatay = g >= d;
    for (let sIdx = 0; sIdx < 5; sIdx += 1) {
      const offset = (sIdx - 2) * 0.95;
      const m = new THREE.Matrix4().makeRotationY(yatay ? 0 : Math.PI / 2);
      m.setPosition(yatay ? x + offset : x, 0.1, yatay ? z : z + offset);
      stripes.setMatrixAt(c * 5 + sIdx, m);
    }
  });
  stripes.instanceMatrix.needsUpdate = true;
  stripes.name = 'district:crosswalks';
  add(stripes, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // CARS — real three-part cars (body + cabin + four wheels), exactly the
  // silhouette the reference draws. Parked in the gym lot and at kerbs;
  // four slow drivers loop the two inner avenues.
  // -------------------------------------------------------------------
  // Every parked car comes from the plan: plan-verisi.js carries the measured
  // centre, orientation and paint of each one Oscar's drawing shows — the
  // parking-lot rows, the kerbside cars, the racers on the kart track.
  const V = Math.PI / 2;
  const KARADA = PLAN_ARABALAR.filter(([x, z]) => !denizdeMi(x, z));
  const PARKED = KARADA.map(([x, z, dikey]) => [x, z, dikey ? 0 : V]);
  const PARKED_RENK = KARADA.map(([, , , renk]) => renk);
  const DRIVERS = 10;
  const CAR_N = PARKED.length + DRIVERS;
  const carBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.55, 3.1), mats.white, CAR_N);
  const carCabins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 0.45, 1.5), mats.carDark, CAR_N);
  const carWheels = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10),
    mats.tire,
    CAR_N * 4,
  );
  const WHEEL_OFFSETS = [[-0.72, 1.0], [0.72, 1.0], [-0.72, -1.0], [0.72, -1.0]];
  const carM = new THREE.Matrix4();
  const carQ = new THREE.Quaternion();
  const carE = new THREE.Euler();
  const wheelSpin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  function placeCar(index, x, z, yaw) {
    carE.set(0, yaw, 0);
    carQ.setFromEuler(carE);
    carM.compose(new THREE.Vector3(x, 0.55, z), carQ, new THREE.Vector3(1, 1, 1));
    carBodies.setMatrixAt(index, carM);
    carM.compose(new THREE.Vector3(x, 0.98, z).add(new THREE.Vector3(0, 0, -0.25).applyQuaternion(carQ)), carQ, new THREE.Vector3(1, 1, 1));
    carCabins.setMatrixAt(index, carM);
    for (let w = 0; w < 4; w += 1) {
      const [ox, oz] = WHEEL_OFFSETS[w];
      const offset = new THREE.Vector3(ox, 0, oz).applyQuaternion(carQ);
      carM.compose(
        new THREE.Vector3(x + offset.x, 0.28, z + offset.z),
        carQ.clone().multiply(wheelSpin),
        new THREE.Vector3(1, 1, 1),
      );
      carWheels.setMatrixAt(index * 4 + w, carM);
    }
  }
  PARKED.forEach(([x, z, yaw], i) => placeCar(i, x, z, yaw));
  for (let i = 0; i < CAR_N; i += 1) {
    // Parked cars keep the paint measured off the plan; the drivers, which
    // the plan cannot fix in place, cycle the shared palette.
    const renk = PARKED_RENK[i] || CAR_PAINT[i % CAR_PAINT.length];
    carBodies.setColorAt(i, new THREE.Color(renk).multiplyScalar(0.85));
  }
  if (carBodies.instanceColor) carBodies.instanceColor.needsUpdate = true;
  carBodies.name = 'district:street-cars';
  add(carBodies, { camera: false, cast: true });
  add(carCabins, { camera: false, cast: false });
  add(carWheels, { camera: false, cast: false });
  // Traffic on every avenue of the grid, both directions: six run the
  // north-south roads and four run the east-west streets, each in its own
  // lane and offset along the road so they never travel as a convoy.
  // The carriageways come from the plan, so the traffic has to as well —
  // including where each road ENDS. A route without a span drove its car over
  // the whole map width: at x 41.5 the asphalt stops at z 19.4 and the car
  // kept going, across the pond park and onto the beach. Oscar's rule is that
  // a road never ends into sand or a house, and neither does a car: every
  // route now carries the measured extent of its own carriageway and the car
  // loops inside it.
  // The spans above were typed by hand and five of the ten did not match the
  // asphalt underneath them. The z 51.5 street exists out to x -32.9 and again
  // from x 17.2; the car drove the fifty units of sand in between, which is the
  // beach Oscar saw. The 1.15 lane offset had the same fault — it is wider than
  // half of a 2.32 carriageway, so those cars rode the verge.
  // So a route now names its carriageway and takes the extent, the width and
  // therefore the lane off the plan. A car cannot leave the asphalt because its
  // route IS a measured piece of asphalt.
  const SEGMENTS = PLAN_ANA_YOLLAR.map(([x, z, g, d]) => (g >= d
    ? { axis: 'x', road: z, width: d, from: x - g / 2, to: x + g / 2 }
    : { axis: 'z', road: x, width: g, from: z - d / 2, to: z + d / 2 }));
  // The longest carriageway within a lane's reach of the named centre line;
  // the short stubs that share a centre would strand the car at their end.
  const segmentFor = (axis, road) => SEGMENTS
    .filter((s) => s.axis === axis && Math.abs(s.road - road) < 1.6)
    .sort((a, b) => (b.to - b.from) - (a.to - a.from))[0] || null;
  const ROUTES = [
    ['z', -19.5, 1], ['z', -19.5, -1],
    ['z', 18.5, 1], ['z', 18.5, -1],
    ['z', 41.5, 1], ['z', -53.5, -1],
    ['x', -18.5, 1], ['x', -18.5, -1],
    ['x', 18, 1], ['x', 51.5, -1],
  ].map(([axis, road, dir]) => {
    const seg = segmentFor(axis, road);
    if (!seg) return null;
    // A quarter of the width keeps the car inside its own half of the road
    // whatever that road measures, where a fixed offset could not.
    return { axis, dir, from: seg.from, to: seg.to, lane: seg.road + dir * seg.width * 0.26 };
  }).filter(Boolean);
  animated?.push((time) => {
    ROUTES.forEach((route, d) => {
      const index = PARKED.length + d;
      const lane = route.lane;
      const span = route.to - route.from;
      const phase = (time * 4.5 + d * 19) % span;
      // Direction decides which end of the measured carriageway the car
      // enters from; either way it never leaves the asphalt.
      const travel = route.dir > 0 ? route.from + phase : route.to - phase;
      if (route.axis === 'z') {
        placeCar(index, lane, travel, route.dir > 0 ? Math.PI : 0);
      } else {
        placeCar(index, travel, lane, route.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    });
    carBodies.instanceMatrix.needsUpdate = true;
    carCabins.instanceMatrix.needsUpdate = true;
    carWheels.instanceMatrix.needsUpdate = true;
  });

  // -------------------------------------------------------------------
  // N CENTER — the 67 skatepark, built from the drawing instead of
  // sketched. The measurements live in plan-skate.js; this block only
  // turns them into surfaces. It merges hard on the way: two bowls, two
  // runs, two quarter pipes, four ledges, two banks, two stair sets and a
  // rail garden come to six draw calls, where the old placeholder — one
  // ellipse, a tube and two stairs — cost twenty-three.
  // -------------------------------------------------------------------
  const skate = new THREE.Group();
  skate.name = 'district:skatepark';
  const LIP_COLOUR = { red: COPING.red, blue: COPING.blue, yellow: COPING.yellow };
  const DECK_Y = SKATE_PLAZA.topY;
  const FLOOR_Y = SKATE_PLAZA.floorY;
  const WALL_INSET = 0.4;
  // Shades of the deck's own colour: the floor barely under it, the wall
  // falling to a third down, the stair treads a touch under the deck.
  const BASIN_FLOOR_TINT = 0xc1acaa;
  const BASIN_RIM_TINT = 0xc9b3b0;
  const BASIN_DEEP_TINT = 0x8a7b79;
  const STAIR_TINT = 0xbba7a4;

  // Deck outline: the same squircle the drawing gives every civic slab.
  const deckShape = (() => {
    const shape = new THREE.Shape();
    // Authored in world units, because the holes carved into it below are
    // measured world outlines; a centred shape plus a translate would cut
    // every bowl in the wrong place, which is exactly what it did.
    const x0 = SKATE_PLAZA.x - SKATE_PLAZA.width / 2;
    const x1 = SKATE_PLAZA.x + SKATE_PLAZA.width / 2;
    // Shape y runs against world z, so the near edge is the larger z negated.
    const y0 = -(SKATE_PLAZA.z + SKATE_PLAZA.depth / 2);
    const y1 = -(SKATE_PLAZA.z - SKATE_PLAZA.depth / 2);
    const r = SKATE_PLAZA.radius;
    shape.moveTo(x0 + r, y0);
    shape.lineTo(x1 - r, y0);
    shape.quadraticCurveTo(x1, y0, x1, y0 + r);
    shape.lineTo(x1, y1 - r);
    shape.quadraticCurveTo(x1, y1, x1 - r, y1);
    shape.lineTo(x0 + r, y1);
    shape.quadraticCurveTo(x0, y1, x0, y1 - r);
    shape.lineTo(x0, y0 + r);
    shape.quadraticCurveTo(x0, y0, x0 + r, y0);
    return shape;
  })();

  // Every carved run and bowl, as an outline plus the rims that carry paint.
  const carved = [
    { outline: SKATE_BOWL.outline, rims: [{ points: SKATE_BOWL.outline, lip: SKATE_BOWL.lip, closed: true }] },
    ...SKATE_TROUGHS.map((trough) => {
      const { left, right, outline } = ribbonSides(trough.line, trough.half);
      return {
        outline,
        rims: [
          { points: left, lip: trough.lips[0], closed: false },
          { points: right, lip: trough.lips[1], closed: false },
        ],
      };
    }),
  ];

  const deepParts = [];
  const copingParts = [];
  const paleParts = [];
  const railParts = [];

  carved.forEach(({ outline, rims }) => {
    const floor = insetPolygon(outline, WALL_INSET);
    // The deck is holed where the run is, so the floor below shows through
    // instead of a slab sitting on top of one.
    deckShape.holes.push(shapeFromPoints(outline, THREE.Path));
    const floorGeometry = new THREE.ShapeGeometry(shapeFromPoints(floor, THREE.Shape));
    floorGeometry.rotateX(-Math.PI / 2);
    floorGeometry.translate(0, FLOOR_Y, 0);
    deepParts.push(tinted(floorGeometry, BASIN_FLOOR_TINT));
    deepParts.push(tintedByHeight(
      wallStripGeometry(outline, floor, DECK_Y, FLOOR_Y),
      BASIN_RIM_TINT, BASIN_DEEP_TINT, DECK_Y, FLOOR_Y,
    ));
    rims.forEach(({ points, lip, closed }) => {
      copingParts.push(tinted(copingTube(points, DECK_Y + 0.04, 0.13, closed), LIP_COLOUR[lip]));
    });
  });

  const deckGeometry = new THREE.ExtrudeGeometry(deckShape, {
    depth: DECK_Y, bevelEnabled: false, curveSegments: 6,
  });
  deckGeometry.rotateX(-Math.PI / 2);
  const skateDeck = new THREE.Mesh(deckGeometry, mats.concrete);
  skateDeck.name = 'district:skatepark-slab';
  skateDeck.receiveShadow = true;
  skate.add(skateDeck);

  // Painted kerbs sit on the deck with nothing carved behind them.
  SKATE_KERBS.forEach(({ line, lip }) => {
    copingParts.push(tinted(copingTube(line, DECK_Y + 0.04, 0.11, false), LIP_COLOUR[lip]));
  });

  // Quarter pipes: the lip stands at `height`, and the face falls towards the
  // point the drawing shows it facing.
  SKATE_RAMPS.forEach(({ lip, towards, run, height, colour }) => {
    const base = lip.map(([x, z]) => {
      const dx = towards[0] - x;
      const dz = towards[1] - z;
      const length = Math.hypot(dx, dz) || 1;
      return [x + (dx / length) * run, z + (dz / length) * run];
    });
    const position = [];
    const uv = [];
    for (let i = 0; i < lip.length - 1; i += 1) {
      const a = [lip[i][0], DECK_Y + height, lip[i][1]];
      const b = [lip[i + 1][0], DECK_Y + height, lip[i + 1][1]];
      const c = [base[i + 1][0], DECK_Y, base[i + 1][1]];
      const d = [base[i][0], DECK_Y, base[i][1]];
      // The riding face...
      position.push(...a, ...d, ...c, ...a, ...c, ...b);
      // ...then the short outer cheek, so the ramp is a wall and not a sheet.
      const a0 = [lip[i][0], DECK_Y, lip[i][1]];
      const b0 = [lip[i + 1][0], DECK_Y, lip[i + 1][1]];
      position.push(...a, ...b, ...b0, ...a, ...b0, ...a0);
      for (let k = 0; k < 12; k += 1) uv.push(0, 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    paleParts.push(geometry);
    copingParts.push(tinted(copingTube(lip, DECK_Y + height + 0.04, 0.13, false), LIP_COLOUR[colour]));
  });

  // Ledges and funboxes.
  SKATE_LEDGES.forEach(({ x, z, width, depth, height, yaw, lip, lipEdge, rail }) => {
    const box = new THREE.BoxGeometry(width, height, depth);
    box.rotateY(yaw);
    box.translate(x, DECK_Y + height / 2, z);
    paleParts.push(box);
    if (!lip) return;
    // The painted edge runs along whichever face the drawing paints.
    const half = lipEdge === 'west' ? width / 2 : depth / 2;
    const along = lipEdge === 'west' ? depth / 2 : width / 2;
    const ends = lipEdge === 'west'
      ? [[-half, -along], [-half, along]]
      : [[-along, -half], [along, -half]];
    const line = ends.map(([lx, lz]) => [
      x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
      z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
    ]);
    copingParts.push(tinted(copingTube(line, DECK_Y + height + 0.03, 0.09, false), LIP_COLOUR[lip]));
    if (rail) {
      const bar = copingTube(line, DECK_Y + height + 0.42, 0.06, false);
      railParts.push(bar);
      [0, 1].forEach((end) => {
        const post = new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6);
        post.translate(line[end][0], DECK_Y + height + 0.21, line[end][1]);
        railParts.push(post);
      });
    }
  });

  // Bank ramps along the east edge: flat top, one face falling west.
  SKATE_BANKS.forEach(({ x, z, width, depth, height }) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(x, DECK_Y, z - depth / 2);
    paleParts.push(geometry);
  });

  // Stair sets: treads climbing north, with handrails over them.
  SKATE_STAIRS.forEach(({ x, z, width, depth, steps, rails }) => {
    const tread = depth / steps;
    for (let step = 0; step < steps; step += 1) {
      const height = 0.14 * (steps - step);
      const box = new THREE.BoxGeometry(width, height, tread);
      box.translate(x, DECK_Y + height / 2, z - depth / 2 + (step + 0.5) * tread);
      deepParts.push(tinted(box, STAIR_TINT));
    }
    rails.forEach((offset) => {
      const bar = copingTube(
        [[x + offset, z - depth / 2], [x + offset, z + depth / 2]],
        DECK_Y + 0.55,
        0.055,
        false,
      );
      railParts.push(bar);
    });
  });

  // The rail garden: parallel grind rails with one bar laid across them.
  {
    const { x, z, width, length, count, cross } = SKATE_RAIL_GARDEN;
    for (let i = 0; i < count; i += 1) {
      const rx = x - width / 2 + (width * (i + 0.5)) / count;
      const bar = new THREE.CylinderGeometry(0.06, 0.06, length, 6);
      bar.rotateX(Math.PI / 2);
      bar.translate(rx, DECK_Y + 0.24, z);
      railParts.push(bar);
    }
    const crossBar = new THREE.CylinderGeometry(0.06, 0.06, cross.width, 6);
    crossBar.rotateZ(Math.PI / 2);
    crossBar.translate(x, DECK_Y + 0.36, cross.z);
    railParts.push(crossBar);
  }

  // Ledge wall closing the south-west run.
  {
    const { line, lip, width, height } = SKATE_LEDGE_WALL;
    for (let i = 0; i < line.length - 1; i += 1) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const segment = Math.hypot(bx - ax, bz - az);
      const box = new THREE.BoxGeometry(segment + width, height, width);
      box.rotateY(-Math.atan2(bz - az, bx - ax));
      box.translate((ax + bx) / 2, DECK_Y + height / 2, (az + bz) / 2);
      paleParts.push(box);
    }
    copingParts.push(tinted(copingTube(line, DECK_Y + height + 0.03, 0.1, false), LIP_COLOUR[lip]));
  }

  const skateMeshes = [
    ['district:skatepark-basins', deepParts, mats.skateDeep, true],
    ['district:skatepark-coping', copingParts, mats.skateLip, false],
    ['district:skatepark-props', paleParts, mats.skatePale, true],
    ['district:skatepark-rails', railParts, mats.rail, true],
  ];
  skateMeshes.forEach(([name, parts, mat, cast]) => {
    if (!parts.length) return;
    // The park mixes indexed primitives with the hand-built strips for bowl
    // walls and ramp faces, and merging refuses that mix, so everything is
    // flattened to non-indexed first.
    const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)), false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    skate.add(mesh);
  });

  const skateLabel = flatLabel('67', SKATE_BOWL.label.size);
  if (skateLabel) {
    skateLabel.position.set(SKATE_BOWL.label.x, FLOOR_Y + 0.02, SKATE_BOWL.label.z);
    skateLabel.name = 'district:skatepark-label';
    skate.add(skateLabel);
  }
  group.add(skate);

  // -------------------------------------------------------------------
  // MEASURED FACILITIES — the paved decks, the pool complex and the
  // grandstands the plan shows and I had never built. Positions and
  // footprints below are read off the drawing, not chosen.
  // -------------------------------------------------------------------
  const DECKS = [
    // [x, z, w, d] — sports campus, pool deck, car park, stadium apron
    [-36.0, -30.0, 32.2, 20.1],
    [-30.2, -57.4, 19.8, 8.7],
    [-44.8, -43.6, 11.8, 9.9],
    // Pulled in off four carriageways: the drawing's apron runs 19.2..40.5 by
    // -18.6..15.5, and the roads measured from the same drawing sit at x
    // 16.75..20.25 and 39.63..43.69 and z -21.12..-17.44 and 16.42..19.62. The
    // apron was over all four.
    [29.95, -0.15, 19.1, 32.9],
  ];
  const decks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1), mats.concreteDeep, DECKS.length);
  const dm = new THREE.Matrix4();
  DECKS.forEach(([x, z, w, d], i) => {
    // Sits just under the pitches and courts that share its footprint, so a
    // deck never covers the surface it is meant to support.
    dm.makeScale(w, 1, d);
    dm.setPosition(x, 0.03, z);
    decks.setMatrixAt(i, dm);
  });
  decks.instanceMatrix.needsUpdate = true;
  decks.name = 'district:decks';
  add(decks, { walkable: true, camera: false, cast: false });

  // The two pools, and the grandstand blocks flanking the running track.
  const POOLS = [[-34.3, -57.4, 3.5, 5.8], [-29.6, -57.4, 4.5, 5.8]];
  const pools = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 1), mats.water, POOLS.length);
  POOLS.forEach(([x, z, w, d], i) => {
    dm.makeScale(w, 1, d);
    dm.setPosition(x, 0.13, z);
    pools.setMatrixAt(i, dm);
  });
  pools.instanceMatrix.needsUpdate = true;
  pools.name = 'district:pools';
  add(pools, { camera: false, cast: false });

  const STANDS = [
    [-47.4, -30.5, 1.6, 8.5], [-35.5, -30.0, 1.4, 7.9],   // athletics
    [-52.4, -32.4, 0.9, 7.2],                              // tram platform
  ];
  // Grandstands share the pale concrete box with the street furniture below,
  // so they are appended to that mesh rather than drawn on their own.

  // -------------------------------------------------------------------
  // NW — kart loop in the corner, parking + solar gym, athletics, baseball
  // -------------------------------------------------------------------
  // The corner is a lawn with a serpentine kart circuit on it. It had been a
  // six-point blob three units wide sitting on bare pavement, with the river
  // running through the middle of it. Both the lawn outline and the circuit's
  // centreline are traced off the render — see PLAN_KART.
  const kartLawn = new THREE.Mesh(
    slabGeometry([groundShape(PLAN_KART.cim)], 0.06, 0.015), mats.kartLawn,
  );
  kartLawn.name = 'district:kart-lawn';
  add(kartLawn, { walkable: true, camera: false, cast: false });

  // Traced control points every two units read as a polygon at this scale, so
  // the loop is run through a closed spline and resampled fine enough that the
  // hairpins come out round.
  const kartLine = (() => {
    const curve = new THREE.CatmullRomCurve3(
      PLAN_KART.hat.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5,
    );
    return curve.getSpacedPoints(104).slice(0, 104).map((p) => [p.x, p.z]);
  })();
  const kartKerb = new THREE.Mesh(
    flatRibbonGeometry(kartLine, PLAN_KART.bordur, 0.09), mats.kartKerb,
  );
  kartKerb.name = 'district:kart-kerbs';
  add(kartKerb, { camera: false, cast: false });
  const kart = new THREE.Mesh(
    flatRibbonGeometry(kartLine, PLAN_KART.bant, 0.105), mats.kartYol,
  );
  kart.name = 'district:kart-track';
  add(kart, { walkable: true, camera: false, cast: false });

  // Gym / leisure block. The old one was a hand-typed 11 x 7 box at (-31,-42)
  // — under half the mass the drawing gives it, with no annex and no entrance
  // canopy. All three footprints are PLAN_BINALAR's own measured rows.
  const GYM_ANA = PLAN_BINALAR[1];
  const GYM_EK = PLAN_BINALAR[2];
  const GYM_SACAK = PLAN_BINALAR[3];
  const gymParts = [
    [GYM_ANA, 4.2], [GYM_EK, 3.6], [GYM_SACAK, 2.7],
  ].map(([[x, z, w, d], h]) => {
    const part = roundedBoxGeometry(w, d, h, 0.7, 0.18);
    part.translate(x, 0, z);
    return part;
  });
  const gym = new THREE.Mesh(mergeGeometries(gymParts, false), mats.block);
  gym.name = 'district:gym';
  add(gym, { camera: true, cast: true });

  // The roof light is glazing with a five-by-three mullion grid, not a blank
  // white lid. Measured 6.97 x 3.68 at (-32.46, -44.66); the bars are painted
  // into its texture so the whole panel is still one draw.
  function mullionTexture() {
    if (typeof document === 'undefined') return mats.roofGlass;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 96;
    const c = canvas.getContext('2d');
    c.fillStyle = '#6d7595';
    c.fillRect(0, 0, 160, 96);
    c.fillStyle = '#d4d5d5';
    for (let i = 0; i <= 5; i += 1) c.fillRect((i * 160) / 5 - 2, 0, 4, 96);
    for (let i = 0; i <= 3; i += 1) c.fillRect(0, (i * 96) / 3 - 2, 160, 4);
    return new THREE.MeshStandardMaterial({
      map: canvasTexture(canvas), roughness: 0.35, metalness: 0.1,
    });
  }
  const gymRoof = new THREE.Mesh(new THREE.BoxGeometry(6.97, 0.3, 3.68), mullionTexture());
  gymRoof.position.set(-32.46, 4.3, -44.66);
  gymRoof.name = 'district:gym-roof-light';
  add(gymRoof, { camera: false, cast: false });

  // A run of pink awnings down the annex's east face, measured at x -21.4
  // where the render alternates (255,226,218) and (192,158,156) between
  // z -48.05 and -40.88.
  function awningTexture() {
    if (typeof document === 'undefined') return mats.copingRed;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 64;
    const c = canvas.getContext('2d');
    c.fillStyle = '#ffb2b0';
    c.fillRect(0, 0, 8, 64);
    c.fillStyle = '#ffdfda';
    for (let i = 0; i < 8; i += 1) c.fillRect(0, i * 8, 8, 4);
    return new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.85 });
  }
  const awnings = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 7.17), awningTexture());
  awnings.position.set(-21.3, 2.6, -44.47);
  awnings.name = 'district:gym-awnings';
  add(awnings, { camera: false, cast: true });

  // The athletics track is a stadium oval — two straights closed by rounded
  // ends — not the donut a torus makes. The torus put a 14.5 x 14.5 circle
  // where the drawing has a 9.69 x 16.66 ring, and its tube wrapped the lane
  // texture the wrong way, so only two of the five lines ever showed.
  // Lane lines are painted across the band's own v axis instead, so the whole
  // track is still one draw.
  function lanesTexture() {
    if (typeof document === 'undefined') return mats.trackRed;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    // Between the lines the render reads (218,148,136); the lines themselves
    // read (248,195,185). Both divided back through the lighting.
    c.fillStyle = '#c8726b';
    c.fillRect(0, 0, 8, 128);
    c.fillStyle = '#ffa9a0';
    // Four lanes: a line on each rim and three between them, 0.39 apart on a
    // band 1.75 across.
    for (let i = 0; i <= 4; i += 1) c.fillRect(0, (i * 128) / 4 - 3, 8, 6);
    c.fillRect(0, 122, 8, 6);
    return new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.9 });
  }
  const [ovalX, ovalZ, ovalW, ovalD] = PLAN_SPOR_OLCU.pist;
  const bantYari = PLAN_SPOR_OLCU.pistBant / 2;
  const kutuNoktalari = (x, z, w, d, r, perCorner = 7) => squirclePoints(w, d, r, perCorner)
    .map((p) => [x + p.x, z + p.y]);
  // The centreline is the measured outer edge pulled in by half the band, so
  // the finished ribbon lands exactly on the drawing's footprint.
  const ovalLine = kutuNoktalari(
    ovalX, ovalZ,
    ovalW - PLAN_SPOR_OLCU.pistBant,
    ovalD - PLAN_SPOR_OLCU.pistBant,
    PLAN_SPOR_OLCU.pistKose - bantYari,
    9,
  );
  const [spX, spZ, , spD] = PLAN_SPOR_OLCU.sprint;
  const trackParts = [
    flatRibbonGeometry(ovalLine, bantYari, 0.12, 24),
    flatRibbonGeometry(
      [[spX, spZ - spD / 2], [spX, spZ + spD / 2]], bantYari, 0.118, 8, false,
    ),
  ];
  const oval = new THREE.Mesh(mergeGeometries(trackParts, false), lanesTexture());
  oval.name = 'district:athletics-track';
  add(oval, { camera: false, cast: false });

  // Every olive plate in the sports quarter is the same turf, so the oval's
  // infield, the baseball outfield and the diamond inside its sand fan are
  // one merged mesh and one draw.
  const [cimX, cimZ, cimW, cimD, cimR] = PLAN_SPOR_OLCU.cim;
  const [ofX, ofZ, ofW, ofD, ofR] = PLAN_SPOR_OLCU.disSaha;
  const [dmX, dmZ, dmW, dmD] = PLAN_SPOR_OLCU.elmas;
  const turf = new THREE.Mesh(slabGeometry([
    kutuNoktalari(cimX, cimZ, cimW, cimD, cimR),
    kutuNoktalari(ofX, ofZ, ofW, ofD, ofR),
    [[dmX - dmW / 2, dmZ - dmD / 2], [dmX + dmW / 2, dmZ - dmD / 2],
      [dmX + dmW / 2, dmZ + dmD / 2], [dmX - dmW / 2, dmZ + dmD / 2]],
  ].map((points) => groundShape(points)), 0.06, 0.06), mats.pitch);
  turf.name = 'district:sports-turf';
  add(turf, { walkable: true, camera: false, cast: false });

  // The sand fan is a quarter disc struck from home plate at (-21.7,-21.51)
  // with the diamond cut out of it, so the turf below shows through as the
  // green square the drawing has there. The mound rides in the middle of it.
  const kum = PLAN_SPOR_OLCU.kum;
  const fan = new THREE.Shape();
  fan.moveTo(kum.x, -kum.z);
  fan.lineTo(kum.x, -kum.z + kum.r);
  fan.absarc(kum.x, -kum.z, kum.r, Math.PI / 2, Math.PI, false);
  fan.lineTo(kum.x, -kum.z);
  fan.holes.push(groundShape([
    [dmX - dmW / 2, dmZ - dmD / 2], [dmX - dmW / 2, dmZ + dmD / 2],
    [dmX + dmW / 2, dmZ + dmD / 2], [dmX + dmW / 2, dmZ - dmD / 2],
  ], THREE.Path));
  const mound = new THREE.Shape();
  mound.absarc(
    PLAN_SPOR_OLCU.tepe[0], -PLAN_SPOR_OLCU.tepe[1], PLAN_SPOR_OLCU.tepe[2],
    0, Math.PI * 2, false,
  );
  const dirt = new THREE.Mesh(slabGeometry([fan, mound], 0.05, 0.115), mats.ballDirt);
  dirt.name = 'district:baseball';
  add(dirt, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // NE — funfair, and the marina against the coast road
  // -------------------------------------------------------------------
  buildFunfair({
    THREE, group, add, material, animated, mats,
    olculenRenk, ISIK_KAZANCI, CAR_PAINT, canvasTexture,
  });

  // -------------------------------------------------------------------
  // EAST MARGIN — the SEA fills the whole right edge; beach cape with
  // umbrellas; the lighthouse on the point; marina rows off the coast road.
  // -------------------------------------------------------------------
  // The old sea was a 29x150 slab down the whole right margin. The reference's
  // water is a bay: it narrows in from the north-west corner, runs straight
  // past the marina, swings east around the sand cape and closes at z = +16.5,
  // with the pond park below it standing on dry land. MARINA_KIYI is that
  // shore, read off the render's own water mask row by row.
  const KIYI = MARINA_KIYI;
  const kiyiSon = KIYI[KIYI.length - 1];
  const seaShape = new THREE.Shape();
  seaShape.moveTo(KIYI[0][0], -KIYI[0][1]);
  KIYI.slice(1).forEach(([x, z]) => seaShape.lineTo(x, -z));
  // Past the terrain's own edge, so the water never stops short of the map.
  const suKenar = MARINA_DOGU_KENAR + 8;
  seaShape.lineTo(suKenar, -(kiyiSon[1] + 1.2));
  seaShape.lineTo(suKenar, -KIYI[0][1] + 8);
  seaShape.closePath();
  const seaGeometry = new THREE.ShapeGeometry(seaShape);
  seaGeometry.rotateX(-Math.PI / 2);
  seaGeometry.translate(0, 0.06, 0);
  const sea = new THREE.Mesh(seaGeometry, mats.water);
  sea.name = 'district:sea';
  add(sea, { camera: false, cast: false });

  // Sand follows the same shore inland, so the beach is the coast's own shape
  // rather than a blob dropped near it. Every sample taken just inland of the
  // waterline in the reference came back sand, right down the bay.
  const kumIc = KIYI.map(([x, z], i) => {
    const a = KIYI[Math.max(0, i - 1)];
    const b = KIYI[Math.min(KIYI.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    return [x - dz * MARINA_KUM_GENISLIK, z + dx * MARINA_KUM_GENISLIK];
  });
  const capeShape = new THREE.Shape();
  capeShape.moveTo(KIYI[0][0], -KIYI[0][1]);
  KIYI.slice(1).forEach(([x, z]) => capeShape.lineTo(x, -z));
  [...kumIc].reverse().forEach(([x, z]) => capeShape.lineTo(x, -z));
  capeShape.closePath();
  const capeGeometry = new THREE.ShapeGeometry(capeShape);
  capeGeometry.rotateX(-Math.PI / 2);
  capeGeometry.translate(0, 0.1, 0);
  const cape = new THREE.Mesh(capeGeometry, mats.sand);
  cape.name = 'district:beach';
  add(cape, { walkable: true, camera: false, cast: false });

  // Parasols, from the plan's own measured row. The promenade run it draws
  // sits at x 41.2 all the way down — sampled (220,182,163) cream, (161,160,174)
  // blue-white, (211,153,149) pink and (186,202,217) pale blue — where the
  // marina list had two of its six at x 37.0, which lands them inside the
  // fairground, one of them on top of the carousel. The cone rides a neutral
  // base now: on mats.copingRed every instance colour came out crimson, which
  // is why the promenade was a row of red mushrooms.
  const UMBRELLA_SITES = PLAN_SEMSIYELER
    .map(([x, z, , , , renk]) => [x, z, renk])
    .filter(([x, z]) => !denizdeMi(x, z));
  const umbrellas = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.85, 0.5, 10), mats.white, UMBRELLA_SITES.length,
  );
  UMBRELLA_SITES.forEach(([x, z, renk], i) => {
    umbrellas.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.15, z));
    umbrellas.setColorAt(i, olculenRenk(renk));
  });
  umbrellas.instanceMatrix.needsUpdate = true;
  if (umbrellas.instanceColor) umbrellas.instanceColor.needsUpdate = true;
  add(umbrellas, { camera: false, cast: true });

  const lighthouse = new THREE.Group();
  lighthouse.name = 'district:lighthouse';
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 2.2, 12), mats.white);
  lhBase.position.y = 1.1;
  lighthouse.add(lhBase);
  const lhMid = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1, 2, 12), mats.copingRed);
  lhMid.position.y = 3.2;
  lighthouse.add(lhMid);
  const lhTop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.6, 12), mats.white);
  lhTop.position.y = 5;
  lighthouse.add(lhTop);
  const lhLamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mats.copingYellow);
  lhLamp.position.y = 6.1;
  lighthouse.add(lhLamp);
  lighthouse.position.set(MARINA_FENER.x, 0, MARINA_FENER.z);
  lighthouse.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(lighthouse);

  // Piers and river bridges are the same timber deck, so one instanced mesh
  // carries both: the three piers first, then a bridge wherever the plan puts
  // a street across the water.
  // The bridges at (-54,-19) and (-53,-44) are gone with the water they used
  // to span: the river's head is at z = -14 now, so both were standing on dry
  // ground — the second of them out on the kart circuit's lawn.
  const AHSAP_KOPRU = [
    [-54, 16, 7, 0.4, 2.6, 0],
    [-52, 38, 7, 0.4, 2.6, 0], [-30, 54.5, 7, 0.4, 2.6, 0.35], [-6, 56, 7, 0.4, 2.6, 0.1],
    [16, 55, 7, 0.4, 2.6, -0.1],
  ];
  // Three piers reaching east off a timber promenade, twelve finger docks
  // between them, and the river bridges — all one instanced deck.
  const AHSAP = [
    { ...MARINA_PROMENAD, y: 0.22, tint: '#ffffff' },
    ...MARINA_ISKELELER.map((p) => ({ ...p, y: 0.2, tint: '#ffffff' })),
    ...MARINA_PARMAKLAR.map((p) => ({ ...p, y: 0.16, tint: '#92bef0' })),
  ];
  const docks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), mats.wood, AHSAP.length + AHSAP_KOPRU.length,
  );
  const dkm = new THREE.Matrix4();
  const beyaz = new THREE.Color('#ffffff');
  AHSAP.forEach(({ x, z, width, depth, y, tint }, i) => {
    dkm.makeScale(width, 0.24, depth);
    dkm.setPosition(x, y, z);
    docks.setMatrixAt(i, dkm);
    docks.setColorAt(i, new THREE.Color(tint));
  });
  AHSAP_KOPRU.forEach(([x, z, w, h, d, rot], i) => {
    dkm.makeRotationY(rot);
    dkm.scale(new THREE.Vector3(w, h, d));
    dkm.setPosition(x, 0.36, z);
    docks.setMatrixAt(AHSAP.length + i, dkm);
    docks.setColorAt(AHSAP.length + i, beyaz);
  });
  if (docks.instanceColor) docks.instanceColor.needsUpdate = true;
  docks.instanceMatrix.needsUpdate = true;
  docks.name = 'district:marina-docks';
  add(docks, { camera: false, cast: false });

  // A boat in the drawing is two things, not one: a pale hull with its gunwale
  // showing all the way round, and a vivid deck set inside it. Painting the
  // whole hull one colour is what made these read as leaves floating on the
  // bay. Measured off the render at 7x — hull about 10 x 24 pixels, the
  // coloured deck about 7 x 18 inside it.
  function hullShape(width, length, waist) {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hl = length / 2;
    shape.moveTo(0, -hl);
    shape.bezierCurveTo(hw * waist, -hl * 0.55, hw, hl * 0.1, hw * 0.62, hl * 0.78);
    shape.quadraticCurveTo(0, hl * 1.02, -hw * 0.62, hl * 0.78);
    shape.bezierCurveTo(-hw, hl * 0.1, -hw * waist, -hl * 0.55, 0, -hl);
    return shape;
  }
  function flatHull(width, length, waist, depth) {
    const geometry = new THREE.ExtrudeGeometry(hullShape(width, length, waist), {
      depth, bevelEnabled: false, curveSegments: 4,
    });
    geometry.rotateX(-Math.PI / 2);
    // The decks ride a material with vertexColors on, and an extruded shape
    // carries no colour attribute. The shader then reads the missing attribute
    // as (0,0,0) and multiplies the instance colour away: every measured hull
    // in the marina came out black, which is what read as leaves on the water.
    // A white attribute leaves the instance colour as the only tint.
    const white = new Float32Array(geometry.attributes.position.count * 3).fill(1);
    geometry.setAttribute('color', new THREE.BufferAttribute(white, 3));
    return geometry;
  }

  const MOORED = [
    ...MARINA_TEKNELER.map(({ x, z, renk }) => ({
      x, z, renk, yaw: 0, length: MARINA_TEKNE_BOY.length, width: MARINA_TEKNE_BOY.width,
    })),
    {
      x: MARINA_YELKENLI.x, z: MARINA_YELKENLI.z, renk: '#d9d2c6',
      yaw: MARINA_YELKENLI.yaw, length: MARINA_YELKENLI.length, width: MARINA_YELKENLI.width,
    },
  ];

  const hulls = new THREE.InstancedMesh(flatHull(1, 1, 1.05, 0.34), mats.white, MOORED.length);
  const boatDecks = new THREE.InstancedMesh(flatHull(0.7, 0.76, 1.0, 0.16), mats.skateLip, MOORED.length);
  MOORED.forEach(({ x, z, renk, yaw, length, width }, i) => {
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.scale(new THREE.Vector3(width, 1, length));
    m.setPosition(x, 0.12, z);
    hulls.setMatrixAt(i, m);
    hulls.setColorAt(i, new THREE.Color('#ddd6cc'));
    const d = new THREE.Matrix4().makeRotationY(yaw);
    d.scale(new THREE.Vector3(width, 1, length));
    d.setPosition(x, 0.34, z);
    boatDecks.setMatrixAt(i, d);
    boatDecks.setColorAt(i, new THREE.Color(renk));
  });
  hulls.instanceMatrix.needsUpdate = true;
  boatDecks.instanceMatrix.needsUpdate = true;
  if (hulls.instanceColor) hulls.instanceColor.needsUpdate = true;
  if (boatDecks.instanceColor) boatDecks.instanceColor.needsUpdate = true;
  hulls.name = 'district:marina-boats';
  boatDecks.name = 'district:marina-decks';
  add(hulls, { camera: false, cast: true });
  add(boatDecks, { camera: false, cast: false });

  // The one boat under sail, out past the piers.
  // Seen from above, a sail is a triangle lying over its hull, which is how
  // the reference draws it — so this is flat, not a vertical sheet that would
  // vanish to a line in a bird's-eye view.
  const sailShape = new THREE.Shape();
  sailShape.moveTo(-MARINA_YELKENLI.length * 0.4, -MARINA_YELKENLI.width * 0.1);
  sailShape.lineTo(MARINA_YELKENLI.length * 0.42, -MARINA_YELKENLI.width * 0.45);
  sailShape.lineTo(MARINA_YELKENLI.length * 0.1, MARINA_YELKENLI.width * 0.75);
  const sailGeometry = new THREE.ExtrudeGeometry(sailShape, { depth: 0.1, bevelEnabled: false });
  sailGeometry.rotateX(-Math.PI / 2);
  const sail = new THREE.Mesh(
    sailGeometry,
    material(MARINA_YELKENLI.yelken, { roughness: 0.7, side: THREE.DoubleSide }),
  );
  sail.rotation.y = MARINA_YELKENLI.yaw;
  sail.position.set(MARINA_YELKENLI.x, 0.72, MARINA_YELKENLI.z);
  sail.name = 'district:marina-sail';
  sail.castShadow = true;
  group.add(sail);

  // -------------------------------------------------------------------
  // CENTER — the 67 plaza: platform, fountain, planted trees, round towers
  // -------------------------------------------------------------------
  // Every piece of this used to be built around (-2, -1.5), which is why the
  // whole centre of the map sat off its own axis. It comes off the plan now:
  // PLAN_MERKEZ_MEYDAN for the platform, PLAN_MERKEZ_CESME for the fountain
  // and PLAN_PLAZA_KULELERI for the corners, all measured on the reference.
  //
  // The platform is two plates rather than a plate with a bar around it: the
  // reference has a brighter perimeter walk (218,197,196) about 2.75 wide
  // inside the edge and a warmer floor (198,169,163) inside that, so the
  // lower plate is the walk and the inner one is laid on top of it.
  const [meydanX, meydanZ] = PLAN_MERKEZ_MEYDAN.merkez;
  const { genislik: meydanW, derinlik: meydanD, yurumeYolu: yuruyus } = PLAN_MERKEZ_MEYDAN;
  // The walk runs 1.10x the floor in red and 1.17x in green and blue, so it
  // is brighter and cooler, not the near-white bar the old frame laid down.
  // Stone captures (201,188,182) here, so the walk has to capture (221,219,219).
  // Set at that ratio the tone map gave back only half of it — (210,205,203)
  // against the floor, 1.05 where 1.10 was wanted — so the base carries the
  // shortfall as well as the ratio.
  const plazaWalkMat = material(0xcac5cd, { roughness: 0.85 });
  const plazaPlate = new THREE.Mesh(new THREE.BoxGeometry(meydanW, 0.16, meydanD), plazaWalkMat);
  plazaPlate.position.set(meydanX, 0.08, meydanZ);
  plazaPlate.name = 'district:plaza';
  add(plazaPlate, { walkable: true, camera: false, cast: false });
  // Laid a centimetre proud of the walk. Sunk into it, the walk's own top face
  // wins the whole plate and the two tones collapse into one.
  const plazaFloor = new THREE.Mesh(
    new THREE.BoxGeometry(meydanW - yuruyus * 2, 0.16, meydanD - yuruyus * 2),
    mats.stone,
  );
  plazaFloor.position.set(meydanX, 0.09, meydanZ);
  add(plazaFloor, { camera: false, cast: false });

  // The fountain is four rings, not three plain cylinders. The apron was
  // missing entirely — beyond the old kerb the floor sampled the same value
  // in every direction — and the water was sky blue where the reference has
  // a violet slate.
  const [cesmeX, cesmeZ] = PLAN_MERKEZ_CESME.merkez;
  const [havuzX, havuzZ] = PLAN_MERKEZ_CESME.havuzMerkez;
  // The apron reads (172,147,151) against the plaza floor's (185,165,174) in
  // the same light: darker and warmer, not lighter. That is stone taken down
  // to 0.9 with its blue pulled under its red by the same margin.
  const apronMat = material(0x9f8b86, { roughness: 0.9 });
  const fApron = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAN_MERKEZ_CESME.avluCapi / 2, PLAN_MERKEZ_CESME.avluCapi / 2, 0.1, 40),
    apronMat,
  );
  fApron.position.set(cesmeX, 0.2, cesmeZ);
  add(fApron, { camera: false, cast: false });
  const fBase = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAN_MERKEZ_CESME.havuzCapi / 2, PLAN_MERKEZ_CESME.havuzCapi / 2 + 0.05, 0.5, 28),
    mats.stone,
  );
  fBase.position.set(havuzX, 0.49, havuzZ);
  add(fBase, { camera: false, cast: true });
  // Water: the reference's mean over the ring r 1.2..2.0 is (137,126,141) —
  // red and blue level with each other and green a dozen under both, a violet
  // slate. Against its own paving that is 0.74 of the floor, so here it has to
  // capture (149,144,147), which is this base once the scene lifts it. The old
  // 0x8caddf captured as a flat pale blue disc, which is what read as a
  // swimming pool dropped into the square. It also sat below the basin's rim
  // and so was not visible at all from above.
  const fountainWaterMat = material(0x747179, { roughness: 0.6 });
  const fPool = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAN_MERKEZ_CESME.suCapi / 2, PLAN_MERKEZ_CESME.suCapi / 2, 0.12, 28),
    fountainWaterMat,
  );
  fPool.position.set(havuzX, 0.7, havuzZ);
  add(fPool, { camera: false, cast: false });
  // The sculpture is 2.2 across, not the 0.9 stub that was here, and stepped:
  // seen from above the tiers are the concentric rings the reference draws
  // around its centre. Height is not in a top-down plan, so the profile keeps
  // the tiers in proportion to the measured base radius.
  const heykelR = PLAN_MERKEZ_CESME.heykelCapi / 2;
  const heykelProfil = [
    [1, 0], [1, 0.13], [0.78, 0.17], [0.78, 0.33], [0.56, 0.39],
    [0.56, 0.58], [0.36, 0.66], [0.36, 0.85], [0.16, 0.96], [0, 1.02],
  ].map(([r, y]) => new THREE.Vector2(r * heykelR, y * heykelR * 1.3));
  const fSculpture = new THREE.Mesh(new THREE.LatheGeometry(heykelProfil, 20), mats.cream);
  fSculpture.position.set(havuzX, 0.76, havuzZ);
  add(fSculpture, { camera: false, cast: true });

  // The glyphs run x -2.62..2.52 by z 5.62..8.91 in the reference, centre
  // (-0.05, 7.27). The old label was both off-centre and half that size.
  const plazaLabel = flatLabel('67', 9.8);
  if (plazaLabel) {
    plazaLabel.position.set(-0.05, 0.19, 7.27);
    group.add(plazaLabel);
  }
  // Foliage is 0.86 of what it was. The reference's lit plaza crown reads
  // (133,139,106) against the paving's (214,188,185) beside it, and the
  // game's read (158,166,126) in the same place — a fifth too bright. The
  // suburb crowns confirm the same scale: (145,150,131) there against a
  // canopy that was landing near (165,172,140).
  const crownMat = material(0x747f63, { roughness: 0.95, flatShading: true });
  // Each plaza tree stands in a round planter. Radially around the lit
  // south-west one the kerb is the band from r 1.5 to 1.65, peaking at
  // (213,189,188) nine levels over the (204,180,180) paving outside it, with
  // the planter's own shade at (168,153,143) inside — so the ring is a little
  // wider than the 2.91 PLAN_AGACLAR carries for the canopy. One thin annulus
  // per tree, four in a single draw.
  // Shifted the same way the canopy shifts them, so a kerb never ends up
  // beside the tree it is meant to hold.
  const PLAZA_SAKSILAR = PLAN_AGACLAR
    .filter(([x, z]) => Math.abs(x) < 9 && Math.abs(z) < 9)
    .map(([x, z]) => yoldanKaydir(x, z, 1.8, 1.8));
  const planterGeo = new THREE.RingGeometry(1.48, 1.7, 26);
  planterGeo.rotateX(-Math.PI / 2);
  // The kerb is only 1.045 of the paving beside it, far short of the walk's
  // 1.10, so it gets its own tone rather than borrowing the walk's — carrying
  // the same doubling for the tone map that the walk needs.
  const planterMat = material(0xbfadac, { roughness: 0.85 });
  const planters = new THREE.InstancedMesh(planterGeo, planterMat, PLAZA_SAKSILAR.length);
  PLAZA_SAKSILAR.forEach(([x, z], i) => {
    planters.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.19, z));
  });
  planters.instanceMatrix.needsUpdate = true;
  planters.name = 'district:plaza-planters';
  add(planters, { camera: false, cast: false });

  // The corners are round towers. The four capped posts that used to stand at
  // (-15.5,-15), (11.5,-15), (-15.5,12) and (11.5,12) were inside the ring's
  // buildings — three of them sampled roof, not sky — and the reference has
  // nothing at any of those points. One stepped lathe, four instances, one
  // draw, replacing two draws of hidden posts.
  const kuleProfil = [
    [0, 0], [2.85, 0], [2.85, 1.9], [2.62, 2.05], [2.62, 3.5],
    [2.42, 3.65], [2.42, 4.9], [2.25, 5.05], [2.25, 5.3], [0, 5.3],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const plazaTowers = new THREE.InstancedMesh(
    new THREE.LatheGeometry(kuleProfil, 24), mats.white, PLAN_PLAZA_KULELERI.length,
  );
  PLAN_PLAZA_KULELERI.forEach(([x, z, w, d, renk], i) => {
    const m = new THREE.Matrix4().makeScale(w / 5.7, 1, d / 5.7);
    m.setPosition(x, 0.15, z);
    plazaTowers.setMatrixAt(i, m);
    plazaTowers.setColorAt(i, new THREE.Color(renk));
  });
  plazaTowers.instanceMatrix.needsUpdate = true;
  if (plazaTowers.instanceColor) plazaTowers.instanceColor.needsUpdate = true;
  plazaTowers.name = 'district:plaza-towers';
  add(plazaTowers, { camera: true, cast: true });

  // -------------------------------------------------------------------
  // E CELL — the 67 stadium in its reference position right of the plaza
  // -------------------------------------------------------------------
  group.add(buildStadium(mats));

  // -------------------------------------------------------------------
  // WEST + SOUTH CELLS — dense blocks, the basketball court, the market
  // -------------------------------------------------------------------
  // Every block comes from the plan, not from a guess: plan-verisi.js holds
  // the position and footprint of each building measured off Oscar's drawing.
  // Height is not in a top-down plan, so it is derived from footprint area —
  // a big block reads as a taller mass, a small one as a low shopfront —
  // clamped to the range the reference's shadows imply.
  //
  // Buildings whose own district authors them (skatepark, court ring, stadium,
  // market, funfair, pond park) are skipped so nothing is built twice.
  const OZEL_BOLGELER = [
    { minX: -16.5, maxX: 17.8, minZ: -50.2, maxZ: -19.3 },   // skatepark
    { minX: -48, maxX: -24, minZ: -12, maxZ: 12 },   // basketball court ring
    // The whole measured apron, not just the oval: the old box stopped at
    // z = +/-12 and the apron runs -18.6..15.5, so the layout solver was free
    // to stand a house on the stadium's west wall and another on its south
    // corner. That is what "the wall is tangled up with the houses" was.
    { minX: 18.6, maxX: 41.2, minZ: -19.4, maxZ: 16.2 },     // stadium
    // The measured paving, not a guess at it: the old box ran x -10..6 by
    // z 24..39 and left the square's whole southern and eastern strips open,
    // so the solver could stand a block on the paving and did.
    {
      minX: PLAN_PAZAR.zemin[0] - PLAN_PAZAR.zemin[2] / 2,
      maxX: PLAN_PAZAR.zemin[0] + PLAN_PAZAR.zemin[2] / 2,
      minZ: PLAN_PAZAR.zemin[1] - PLAN_PAZAR.zemin[3] / 2,
      maxZ: PLAN_PAZAR.zemin[1] + PLAN_PAZAR.zemin[3] / 2,
    },                                               // market square
    { minX: 18, maxX: 46, minZ: -50, maxZ: -18 },    // funfair
    { minX: 18, maxX: 46, minZ: 18, maxZ: 46 },      // pond park
    { minX: -40, maxX: -22, minZ: -50, maxZ: -34 },  // gym + parking
    // The plaza's four corner towers are lathed above, so their own rows are
    // held back from the block loop rather than boxed by it a second time.
    ...PLAN_PLAZA_KULELERI.map(([x, z, w, d]) => ({
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2,
    })),
  ];
  const ozelIcinde = (x, z) => OZEL_BOLGELER.some(
    (b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ,
  );
  // A keep-out box the block did not already stand in is an obstacle, not a
  // suggestion. Shifting for a road or for a neighbour used to be free to end
  // inside one, which is how a terrace drawn north of the market square ended
  // up on the market's paving. Overlaps the plan itself draws are left alone —
  // a district's own apron often runs under the edge of a block — so each
  // block only has to stay out of the boxes it started clear of.
  const kutuBindirmesi = (x, z, w, d, b) => (
    x + w / 2 > b.minX && x - w / 2 < b.maxX && z + d / 2 > b.minZ && z - d / 2 < b.maxZ
  );
  const bolgedenKaydir = (x, z, w, d, yasak) => {
    let nx = x;
    let nz = z;
    for (const b of yasak) {
      if (!kutuBindirmesi(nx, nz, w, d, b)) continue;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const bindirX = (b.maxX - b.minX) / 2 + w / 2 - Math.abs(nx - cx);
      const bindirZ = (b.maxZ - b.minZ) / 2 + d / 2 - Math.abs(nz - cz);
      // Out along whichever wall is nearer, so a block leaves by the edge it
      // came in through instead of being flung across the district.
      if (bindirX < bindirZ) nx += nx >= cx ? bindirX : -bindirX;
      else nz += nz >= cz ? bindirZ : -bindirZ;
    }
    return [nx, nz];
  };
  // Placement is resolved, not just nudged. Two constraints have to hold at
  // once — clear of every carriageway, and clear of each other — and shifting
  // for one used to break the other, which left buildings both on the road and
  // inside their neighbours. So both are relaxed together over several passes:
  // each round pushes a block off any road it touches, then pushes apart any
  // pair that overlaps, until the layout settles. A block that still cannot be
  // placed after all that is dropped rather than shipped inside another.
  const BLOCKS = (() => {
    const adaylar = PLAN_BINALAR
      .map(([x, z, w, d], i) => {
        const h = Math.max(2, Math.min(6.5, 1.6 + Math.sqrt(w * d) * 0.62));
        return { x, z, w, h, d, renk: PLAN_BINA_RENK[i] };
      })
      .filter(({ x, z }) => !ozelIcinde(x, z) && !denizdeMi(x, z));
    for (const b of adaylar) {
      b.yasak = OZEL_BOLGELER.filter((k) => !kutuBindirmesi(b.x, b.z, b.w, b.d, k));
    }

    // The plan draws terraces that touch, so neighbours may share a wall;
    // only a real overlap is a fault.
    const BOSLUK = 0.05;
    for (let tur = 0; tur < 60; tur += 1) {
      let oynadi = false;
      for (const b of adaylar) {
        const [rx, rz] = yoldanKaydir(b.x, b.z, b.w, b.d);
        const [nx, nz] = bolgedenKaydir(rx, rz, b.w, b.d, b.yasak);
        if (nx !== b.x || nz !== b.z) { b.x = nx; b.z = nz; oynadi = true; }
      }
      for (let i = 0; i < adaylar.length; i += 1) {
        for (let j = i + 1; j < adaylar.length; j += 1) {
          const a = adaylar[i];
          const b = adaylar[j];
          const bindirX = (a.w + b.w) / 2 + BOSLUK - Math.abs(a.x - b.x);
          const bindirZ = (a.d + b.d) / 2 + BOSLUK - Math.abs(a.z - b.z);
          if (bindirX <= 0 || bindirZ <= 0) continue;
          oynadi = true;
          // Separate along the axis that needs the smaller correction, and
          // share the correction only between blocks that have somewhere to
          // go. Halving it blindly is what walked a terrace drawn north of
          // the market out onto the market's paving: its neighbour pushed it
          // south, the square pushed it back, and after sixty rounds of that
          // neither of the pair could be placed at all. A block with a
          // keep-out box behind it stands still and its neighbour takes the
          // whole move.
          const eksen = bindirX < bindirZ ? 'x' : 'z';
          const miktar = bindirX < bindirZ ? bindirX : bindirZ;
          const yon = a[eksen] <= b[eksen] ? -1 : 1;
          const gidebilir = (blok, delta) => {
            const nx = eksen === 'x' ? blok.x + delta : blok.x;
            const nz = eksen === 'z' ? blok.z + delta : blok.z;
            return !blok.yasak.some((k) => kutuBindirmesi(nx, nz, blok.w, blok.d, k));
          };
          const aSerbest = gidebilir(a, yon * miktar);
          const bSerbest = gidebilir(b, -yon * miktar);
          if (aSerbest && !bSerbest) a[eksen] += yon * miktar;
          else if (bSerbest && !aSerbest) b[eksen] -= yon * miktar;
          else {
            a[eksen] += (yon * miktar) / 2;
            b[eksen] -= (yon * miktar) / 2;
          }
        }
      }
      if (!oynadi) break;
    }

    // Final sweep. A block that still will not fit is shrunk rather than
    // deleted — losing a building the plan drew is worse than building it a
    // size smaller — and only something that cannot fit even at two-thirds
    // scale, or that has been pushed off the plan, is given up.
    const yerlesen = [];
    for (const b of adaylar) {
      if (Math.abs(b.x) > 60 || Math.abs(b.z) > 60) continue;
      // The shore is checked again here, not only on the way in: relaxation
      // can push a block a long way, and one of them ended up eleven units
      // offshore standing in the bay.
      if (denizdeMi(b.x, b.z)) continue;
      let kondu = false;
      for (const olcek of [1, 0.86, 0.72, 0.6]) {
        const w = b.w * olcek;
        const d = b.d * olcek;
        if (yolUstunde(b.x, b.z, w, d)) continue;
        if (b.yasak.some((k) => kutuBindirmesi(b.x, b.z, w, d, k))) continue;
        const cakisiyor = yerlesen.some((o) => (
          Math.abs(b.x - o.x) < (w + o.w) / 2 - 0.25
          && Math.abs(b.z - o.z) < (d + o.d) / 2 - 0.25
        ));
        if (cakisiyor) continue;
        yerlesen.push({ ...b, w, d });
        kondu = true;
        break;
      }
      if (!kondu) continue;
    }
    return yerlesen.map((b) => [b.x, b.z, b.w, b.h, b.d, b.renk]);
  })();
  // Blocks carry the reference building's actual anatomy, read off a 4x crop
  // of the map: a soft squircle body on a wider plinth, a raised lip framing
  // the roof, an L-shaped recess inside that lip, and a striped awning at the
  // street face. Five instanced meshes cover every block in the city.
  const blockGeo = roundedBoxGeometry(1, 1, 1, 0.16, 0.075);
  const blockBodies = new THREE.InstancedMesh(blockGeo, mats.white, BLOCKS.length);
  const blockPlinths = new THREE.InstancedMesh(roundedBoxGeometry(1, 1, 1, 0.22, 0.05), mats.concrete, BLOCKS.length);
  // The roof lip is a frame, not a lid: the tray it encloses is what the
  // reference shows inside every parapet.
  const blockLips = new THREE.InstancedMesh(roundedBoxGeometry(1, 1, 1, 0.16, 0.045, 0.74), mats.white, BLOCKS.length);
  // The L recess is two arms of the same material and geometry, so both ride
  // one instanced mesh: index 2i is the long arm, 2i+1 the short.
  const blockNotches = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.blockDark, BLOCKS.length * 2);
  // Awnings are the same painted box as the street furniture, so they are
  // carried by that mesh instead of opening their own draw.
  const AWNING_SLOT = [];
  // Glazing, in the building's own language: a cream surround with the glass
  // set into it, mullions so it reads as a door rather than a mirror, and an
  // upper window band in the same glass the gym roof uses.
  // Surround and mullions are the same cream box geometry, so they share one
  // instanced mesh: three slots per block — the surround then two mullions.
  const doorFrames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.white, BLOCKS.length * 3);
  // Shopfront glazing and the upper window band are the same glass box, so
  // they share one instanced mesh: slot 2i is the door, 2i+1 the band.
  const doorGlass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.glass, BLOCKS.length * 2);
  const AWNING_TONE = [COPING.red, COPING.blue, 0xd7cfc2];
  const bm = new THREE.Matrix4();
  BLOCKS.forEach(([x, z, w, h, d], i) => {
    bm.makeScale(w, h, d);
    bm.setPosition(x, h / 2, z);
    blockBodies.setMatrixAt(i, bm);
    // Each block wears the colour measured off its own footprint in the plan,
    // divided back through this scene's exposure so it lands on the drawing's
    // value once lit.
    // Measured, not tuned by eye: the reference's roofs sit at 230,206,205
    // and the 0.82 that used to be here landed them at 191,172,159 — forty
    // levels dark, which is most of why the city read as cardboard.
    blockBodies.setColorAt(i, new THREE.Color(BLOCKS[i][5] || '#c9bcb8'));
    // Plinth: a slightly wider, very low pad the body sits on.
    bm.makeScale(w + 1.1, 0.26, d + 1.1);
    bm.setPosition(x, 0.13, z);
    blockPlinths.setMatrixAt(i, bm);
    // Roof lip: a thin raised frame just inside the roof edge.
    bm.makeScale(w * 0.9, 0.24, d * 0.9);
    bm.setPosition(x, h + 0.02, z);
    blockLips.setMatrixAt(i, bm);
    // The L recess inside the lip: one long arm, one short.
    bm.makeScale(w * 0.5, 0.07, 0.16);
    bm.setPosition(x - w * 0.14, h + 0.15, z - d * 0.22);
    blockNotches.setMatrixAt(i * 2, bm);
    bm.makeScale(0.16, 0.07, d * 0.34);
    bm.setPosition(x - w * 0.36, h + 0.15, z - d * 0.06);
    blockNotches.setMatrixAt(i * 2 + 1, bm);
    // Awning across the street face.
    AWNING_SLOT.push([x, 0.62, z + d / 2 + 0.2, w * 0.62, 0.22, 0.55,
      AWNING_TONE[i % AWNING_TONE.length]]);
    // Glazed shopfront under the awning.
    bm.makeScale(w * 0.46, 1.9, 0.14);
    bm.setPosition(x, 0.95, z + d / 2 + 0.03);
    doorFrames.setMatrixAt(i * 3, bm);
    bm.makeScale(w * 0.38, 1.6, 0.1);
    bm.setPosition(x, 0.9, z + d / 2 + 0.12);
    doorGlass.setMatrixAt(i * 2, bm);
    bm.makeScale(0.09, 1.6, 0.08);
    bm.setPosition(x - w * 0.1, 0.9, z + d / 2 + 0.16);
    doorFrames.setMatrixAt(i * 3 + 1, bm);
    bm.setPosition(x + w * 0.1, 0.9, z + d / 2 + 0.16);
    doorFrames.setMatrixAt(i * 3 + 2, bm);
    // Upper-floor window band.
    bm.makeScale(w * 0.66, 0.55, 0.09);
    bm.setPosition(x, h * 0.66, z + d / 2 + 0.06);
    doorGlass.setMatrixAt(i * 2 + 1, bm);
  });
  for (const mesh of [
    blockBodies, blockPlinths, blockLips, blockNotches,
    doorFrames, doorGlass,
  ]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  // The pool of shade each block sits in. Sized from the block's own
  // footprint so a long terrace gets a long pool, and laid just over the
  // paving with depth writes off so it darkens rather than z-fights.
  const contactMap = contactShadowTexture();
  if (contactMap) {
    const contactGeo = new THREE.PlaneGeometry(1, 1);
    contactGeo.rotateX(-Math.PI / 2);
    const contacts = new THREE.InstancedMesh(
      contactGeo,
      new THREE.MeshBasicMaterial({
        map: contactMap,
        transparent: true,
        blending: THREE.MultiplyBlending,
        // three refuses to set up multiply blending without this and the
        // decal silently renders almost invisible, which is exactly what it
        // did on the first two passes.
        premultipliedAlpha: true,
        depthWrite: false,
      }),
      BLOCKS.length,
    );
    contacts.renderOrder = 2;
    const cm = new THREE.Matrix4();
    BLOCKS.forEach(([x, z, w, h, d], i) => {
      cm.makeScale(w + 2.8, 1, d + 2.8);
      // Above the plaza plate and the plinth, both of which would otherwise
      // hide the pool inside themselves, and far enough under the block that
      // nothing floats at eye level.
      cm.setPosition(x, 0.29, z);
      contacts.setMatrixAt(i, cm);
    });
    contacts.instanceMatrix.needsUpdate = true;
    contacts.name = 'district:block-contact';
    add(contacts, { camera: false, cast: false });
  }

  blockBodies.name = 'district:blocks';
  add(blockBodies, { camera: true, cast: true });
  add(blockPlinths, { camera: false, cast: false });
  add(blockLips, { camera: false, cast: true });
  add(blockNotches, { camera: false, cast: false });
  doorGlass.name = 'district:block-glass';
  add(doorFrames, { camera: false, cast: false });
  add(doorGlass, { camera: false, cast: false });

  // --- Basketball court, built from the close-up reference ---
  // A painted court on a rounded concrete apron, ringed by rounded-corner
  // blocks — some domed, all with small roof units. Markings are drawn to a
  // canvas so the court carries real lines (key, arcs, center 67) instead of
  // reading as a green rectangle.
  const COURT = { x: -36, z: 0, w: 8.5, d: 13 };
  const apronShape = new THREE.Shape();
  {
    const w = COURT.w / 2 + 2.2;
    const d = COURT.d / 2 + 2.2;
    const r = 1.8;
    apronShape.moveTo(-w + r, -d);
    apronShape.lineTo(w - r, -d);
    apronShape.quadraticCurveTo(w, -d, w, -d + r);
    apronShape.lineTo(w, d - r);
    apronShape.quadraticCurveTo(w, d, w - r, d);
    apronShape.lineTo(-w + r, d);
    apronShape.quadraticCurveTo(-w, d, -w, d - r);
    apronShape.lineTo(-w, -d + r);
    apronShape.quadraticCurveTo(-w, -d, -w + r, -d);
  }
  const apron = new THREE.Mesh(new THREE.ShapeGeometry(apronShape, 8), mats.concrete);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(COURT.x, 0.05, COURT.z);
  apron.name = 'district:court-apron';
  add(apron, { camera: false, cast: false });

  function courtMaterial() {
    if (typeof document === 'undefined') return mats.court;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const c = canvas.getContext('2d');
    // The canvas is a lit surface, so its base sits well below the reference
    // court green — at the hub's exposure this is what lands on it.
    // Measured with the colour space correct: this lands 106,110,96, which is
    // the reference court to four levels. The old value was picked against a
    // texture three was decoding as linear, so it was compensating for a bug.
    c.fillStyle = '#5a5f58';
    c.fillRect(0, 0, 256, 384);
    c.strokeStyle = '#cfcbb8';
    c.lineWidth = 4;
    c.strokeRect(14, 14, 228, 356);
    c.beginPath();               // center line
    c.moveTo(14, 192);
    c.lineTo(242, 192);
    c.stroke();
    c.beginPath();               // center circle
    c.arc(128, 192, 34, 0, Math.PI * 2);
    c.stroke();
    for (const top of [true, false]) {
      const baseY = top ? 14 : 370;
      const dir = top ? 1 : -1;
      c.strokeRect(88, top ? 14 : 274, 80, 96);          // the key
      c.beginPath();             // free-throw circle
      c.arc(128, baseY + dir * 96, 30, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();             // three-point arc
      c.arc(128, baseY + dir * 18, 96, top ? 0 : Math.PI, top ? Math.PI : 0);
      c.stroke();
    }
    c.fillStyle = '#cfcbb8';     // center 67
    c.font = '700 30px Figtree, Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('67', 128, 193);
    return new THREE.MeshStandardMaterial({
      map: canvasTexture(canvas),
      roughness: 0.9,
    });
  }
  const court = new THREE.Mesh(new THREE.PlaneGeometry(COURT.w, COURT.d), courtMaterial());
  court.rotation.x = -Math.PI / 2;
  // Clear of the floor box's top face (0.05 + 0.08/2 = 0.09). Sitting exactly
  // on it made the two surfaces coplanar, and the depth buffer flickered
  // between them as the camera moved.
  court.position.set(COURT.x, 0.14, COURT.z);
  court.name = 'district:basketball-court';
  add(court, { walkable: false, camera: false, cast: false });
  const courtFloor = new THREE.Mesh(new THREE.BoxGeometry(COURT.w, 0.08, COURT.d), mats.court);
  courtFloor.position.set(COURT.x, 0.05, COURT.z);
  add(courtFloor, { walkable: true, camera: false, cast: false });

  // Hoops: pole, arm, backboard, rim — one instanced set per part.
  const HOOPS = [[COURT.x, COURT.z - COURT.d / 2 - 0.6, 1], [COURT.x, COURT.z + COURT.d / 2 + 0.6, -1]];
  const hoopPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 3, 8), mats.rail, 2);
  const hoopArms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), mats.rail, 2);
  const hoopBoards = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.9, 0.08), mats.white, 2);
  const hoopRims = new THREE.InstancedMesh(new THREE.TorusGeometry(0.32, 0.05, 6, 14), mats.copingRed, 2);
  HOOPS.forEach(([hx, hz, dir], i) => {
    hoopPoles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(hx, 1.5, hz));
    hoopArms.setMatrixAt(i, new THREE.Matrix4().makeTranslation(hx, 2.9, hz + dir * 0.45));
    hoopBoards.setMatrixAt(i, new THREE.Matrix4().makeTranslation(hx, 2.9, hz + dir * 0.85));
    const rimM = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    rimM.setPosition(hx, 2.62, hz + dir * 1.2);
    hoopRims.setMatrixAt(i, rimM);
  });
  for (const mesh of [hoopPoles, hoopArms, hoopBoards, hoopRims]) mesh.instanceMatrix.needsUpdate = true;
  hoopBoards.name = 'district:hoop-boards';
  add(hoopPoles, { camera: false, cast: true });
  add(hoopArms, { camera: false, cast: false });
  add(hoopBoards, { camera: false, cast: true });
  add(hoopRims, { camera: false, cast: false });

  // The ring of rounded-corner blocks that frames the court in the close-up,
  // half of them domed. Extruded rounded rectangles, one draw for the bodies.
  const COURT_BLOCKS = [
    // [dx, dz, w, d, h, domed]
    [-9.5, -8, 6, 4.5, 3.2, true], [-1, -10.5, 5, 4, 2.8, false], [7, -9, 5.5, 4.5, 3, false],
    [-10.5, 0, 5, 5, 2.6, true], [10, 1.5, 5, 5.5, 3.4, false],
    [-8.5, 9, 6.5, 4.5, 2.9, false], [0.5, 10.5, 5.5, 4, 3.1, true], [8.5, 9.5, 5, 4.5, 2.7, false],
  ];
  const courtBlockGeo = roundedBoxGeometry(1, 1, 1, 0.22);
  const courtBlocks = new THREE.InstancedMesh(courtBlockGeo, mats.white, COURT_BLOCKS.length);
  const domeCount = COURT_BLOCKS.filter(([, , , , , domed]) => domed).length;
  const courtDomes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mats.white, domeCount);
  const courtRoofUnits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), mats.blockDark, COURT_BLOCKS.length);
  let domeIndex = 0;
  COURT_BLOCKS.forEach(([dx, dz, w, d, h, domed], i) => {
    const x = COURT.x + dx;
    const z = COURT.z + dz;
    const m = new THREE.Matrix4().makeScale(w, h, d);
    m.setPosition(x, 0, z);
    courtBlocks.setMatrixAt(i, m);
    courtBlocks.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0xb0a49f : 0xc0b5ae));
    const unit = new THREE.Matrix4().makeTranslation(x + w * 0.28, h + 0.17, z - d * 0.28);
    courtRoofUnits.setMatrixAt(i, unit);
    if (domed) {
      const dm = new THREE.Matrix4().makeScale(Math.min(w, d) * 0.34, Math.min(w, d) * 0.34, Math.min(w, d) * 0.34);
      dm.setPosition(x - w * 0.12, h + Math.min(w, d) * 0.16, z);
      courtDomes.setMatrixAt(domeIndex, dm);
      domeIndex += 1;
    }
  });
  courtBlocks.instanceMatrix.needsUpdate = true;
  if (courtBlocks.instanceColor) courtBlocks.instanceColor.needsUpdate = true;
  courtDomes.instanceMatrix.needsUpdate = true;
  courtRoofUnits.instanceMatrix.needsUpdate = true;
  courtBlocks.name = 'district:court-blocks';
  add(courtBlocks, { camera: true, cast: true });
  add(courtDomes, { camera: false, cast: true });
  add(courtRoofUnits, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // MARKET SQUARE — paving, bollard ring, eight stalls, centre pavilion
  // -------------------------------------------------------------------
  // Every number here is PLAN_PAZAR's, measured off the reference. What stood
  // here was a fourteen-unit disc at (-2, 31) that missed the square's whole
  // southern and eastern strips, five stalls at coordinates that matched none
  // of the eight the drawing shows, a round tower with a yellow ball on top
  // that appears nowhere in the reference, and no boundary at all.
  const [pazarX, pazarZ, pazarW, pazarD] = PLAN_PAZAR.zemin;
  const marketGround = new THREE.Mesh(
    roundedBoxGeometry(pazarW, pazarD, 0.12, 0.5, 0.03), mats.marketPaving,
  );
  marketGround.position.set(pazarX, 0.005, pazarZ);
  marketGround.name = 'district:market-ground';
  add(marketGround, { walkable: true, camera: false, cast: false });

  // One instanced box carries every small white fixture in the square — the
  // bollards and the rope between them, the stall legs and tables, and the
  // pavilion's four pillars — so the whole boundary costs a single draw.
  const CIT = PLAN_PAZAR.cit;
  const citX = Math.max(2, Math.round((CIT.maxX - CIT.minX) / CIT.adim) + 1);
  const citZ = Math.max(2, Math.round((CIT.maxZ - CIT.minZ) / CIT.adim) + 1);
  const DIREKLER = [];
  for (let i = 0; i < citX; i += 1) {
    const t = i / (citX - 1);
    const x = CIT.minX + (CIT.maxX - CIT.minX) * t;
    DIREKLER.push([x, CIT.minZ], [x, CIT.maxZ]);
  }
  for (let i = 1; i < citZ - 1; i += 1) {
    const t = i / (citZ - 1);
    const z = CIT.minZ + (CIT.maxZ - CIT.minZ) * t;
    DIREKLER.push([CIT.minX, z], [CIT.maxX, z]);
  }
  const DIREK_Y = 0.85;
  const HALAT_Y = 0.62;
  const TEZGAHLAR = PLAN_PAZAR.tezgahlar;
  const MASA = PLAN_PAZAR.tezgahMasa;
  const KOSK = PLAN_PAZAR.kosk;
  const CATI_KALIN = 0.35;
  const TENTE_Y = 2.1;
  const fixtures = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    mats.paint,
    // bollards + rope runs + four legs and one table a stall + four pillars
    DIREKLER.length * 2 + TEZGAHLAR.length * 5 + 4,
  );
  let fx = 0;
  const koy = (w, h, d, x, y, z) => {
    dkm.makeScale(w, h, d);
    dkm.setPosition(x, y, z);
    fixtures.setMatrixAt(fx, dkm);
    fx += 1;
  };
  // Two pixels across at the reference's scale is 0.19 world units.
  DIREKLER.forEach(([x, z]) => koy(0.17, DIREK_Y, 0.17, x, DIREK_Y / 2, z));
  // The rope runs from each post to the next along the same edge, so a run is
  // one flat box spanning the pitch.
  for (let i = 0; i < citX - 1; i += 1) {
    const x = CIT.minX + (CIT.maxX - CIT.minX) * ((i + 0.5) / (citX - 1));
    const uzunluk = (CIT.maxX - CIT.minX) / (citX - 1);
    koy(uzunluk, 0.05, 0.05, x, HALAT_Y, CIT.minZ);
    koy(uzunluk, 0.05, 0.05, x, HALAT_Y, CIT.maxZ);
  }
  for (let i = 0; i < citZ - 1; i += 1) {
    const z = CIT.minZ + (CIT.maxZ - CIT.minZ) * ((i + 0.5) / (citZ - 1));
    const uzunluk = (CIT.maxZ - CIT.minZ) / (citZ - 1);
    koy(0.05, 0.05, uzunluk, CIT.minX, HALAT_Y, z);
    koy(0.05, 0.05, uzunluk, CIT.maxX, HALAT_Y, z);
  }

  // Stalls: an olive canopy on four legs with its white table beside it, on
  // the plaza side. The canopies keep the plan's orientation — the north and
  // south pairs run east-west, the east and west pairs north-south — and the
  // table steps toward the middle of the square by the measured offset.
  const stallAwnings = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.14, 1), mats.stallCanopy, TEZGAHLAR.length,
  );
  TEZGAHLAR.forEach(([x, z, w, d], i) => {
    dkm.makeScale(w, 1, d);
    dkm.setPosition(x, TENTE_Y, z);
    stallAwnings.setMatrixAt(i, dkm);
    const ayakX = w / 2 - 0.12;
    const ayakZ = d / 2 - 0.12;
    for (const sx of [-ayakX, ayakX]) {
      for (const sz of [-ayakZ, ayakZ]) {
        koy(0.1, TENTE_Y, 0.1, x + sx, TENTE_Y / 2, z + sz);
      }
    }
    // Toward the centre of the square, along whichever axis the stall faces.
    const yatay = w >= d;
    const yonZ = yatay ? Math.sign(pazarZ - z) : 0;
    const yonX = yatay ? 0 : Math.sign(pazarX - x);
    koy(
      yatay ? MASA.boy : MASA.en, 0.8, yatay ? MASA.en : MASA.boy,
      x + yonX * MASA.kacis, 0.4, z + yonZ * MASA.kacis,
    );
  });
  stallAwnings.instanceMatrix.needsUpdate = true;
  stallAwnings.name = 'district:market-stalls';
  add(stallAwnings, { camera: false, cast: true });

  // Centre pavilion: a rounded-square canopy with a raised core on it, both
  // the same near-white the blocks are roofed in. Two instances of one
  // rounded box, so the whole thing is one draw.
  const pavilion = new THREE.InstancedMesh(
    roundedBoxGeometry(1, 1, 1, 0.18, 0.06), mats.white, 2,
  );
  // roundedBoxGeometry stands on y = 0, so each tier is positioned by its own
  // underside rather than its middle.
  dkm.makeScale(KOSK.cati[2], CATI_KALIN, KOSK.cati[3]);
  dkm.setPosition(KOSK.cati[0], KOSK.cati[4] - CATI_KALIN, KOSK.cati[1]);
  pavilion.setMatrixAt(0, dkm);
  const cekirdekH = KOSK.cekirdek[4] - KOSK.cati[4] + CATI_KALIN;
  dkm.makeScale(KOSK.cekirdek[2], cekirdekH, KOSK.cekirdek[3]);
  dkm.setPosition(KOSK.cekirdek[0], KOSK.cekirdek[4] - cekirdekH, KOSK.cekirdek[1]);
  pavilion.setMatrixAt(1, dkm);
  pavilion.instanceMatrix.needsUpdate = true;
  pavilion.name = 'district:market-pavilion';
  add(pavilion, { camera: true, cast: true });
  // Four pillars, one at the middle of each canopy edge, which is where the
  // reference shows them.
  const ayakY = KOSK.cati[4] - CATI_KALIN;
  [[KOSK.cati[2] / 2 - 0.3, 0], [-KOSK.cati[2] / 2 + 0.3, 0],
    [0, KOSK.cati[3] / 2 - 0.3], [0, -KOSK.cati[3] / 2 + 0.3]].forEach(([dx, dz]) => {
    koy(0.28, ayakY, 0.28, KOSK.cati[0] + dx, ayakY / 2, KOSK.cati[1] + dz);
  });
  fixtures.instanceMatrix.needsUpdate = true;
  fixtures.name = 'district:market-fixtures';
  add(fixtures, { camera: false, cast: true });

  // -------------------------------------------------------------------
  // SE CELL — playground with pools, teddy statues, dense trees
  // -------------------------------------------------------------------
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(26, 0.1, 28), mats.grass);
  lawn.position.set(31, 0.05, 31);
  lawn.name = 'district:pond-lawn';
  add(lawn, { walkable: true, camera: false, cast: false });

  // Kidney pond, straight off the close-up: a peanut outline with a raised
  // concrete rim, stepping stones across its waist and a deck on the east
  // bank, ringed by a looping park path with benches along it.
  const POND = { x: 30, z: 33 };
  function kidneyShape(scale) {
    const s = new THREE.Shape();
    s.moveTo(0 * scale, 5.6 * scale);
    s.bezierCurveTo(3.4 * scale, 5.6 * scale, 4.6 * scale, 3.6 * scale, 4.4 * scale, 1.4 * scale);
    s.bezierCurveTo(4.2 * scale, -0.6 * scale, 2.2 * scale, -0.8 * scale, 2.4 * scale, -2.6 * scale);
    s.bezierCurveTo(2.6 * scale, -4.8 * scale, 1.2 * scale, -6.4 * scale, -1.2 * scale, -6.4 * scale);
    s.bezierCurveTo(-3.8 * scale, -6.4 * scale, -5.2 * scale, -4.4 * scale, -4.8 * scale, -2 * scale);
    s.bezierCurveTo(-4.5 * scale, -0.2 * scale, -3.2 * scale, 0.6 * scale, -3.4 * scale, 2.2 * scale);
    s.bezierCurveTo(-3.6 * scale, 4.2 * scale, -2.4 * scale, 5.6 * scale, 0 * scale, 5.6 * scale);
    return s;
  }
  const pondRim = new THREE.Mesh(new THREE.ShapeGeometry(kidneyShape(1.16), 20), mats.concrete);
  pondRim.rotation.x = -Math.PI / 2;
  pondRim.position.set(POND.x, 0.13, POND.z);
  pondRim.name = 'district:pond-rim';
  add(pondRim, { camera: false, cast: false });
  const pond = new THREE.Mesh(new THREE.ShapeGeometry(kidneyShape(1), 20), mats.water);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(POND.x, 0.16, POND.z);
  pond.name = 'district:pond';
  add(pond, { camera: false, cast: false });

  // Stepping stones across the waist.
  const stones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 0.14, 0.72), mats.concrete, 5);
  [[-2.2, 0.9], [-1.1, 0.4], [0, 0.1], [1.1, 0.35], [2.2, 0.8]].forEach(([sx, sz], i) => {
    stones.setMatrixAt(i, new THREE.Matrix4().makeTranslation(POND.x + sx, 0.2, POND.z + sz));
  });
  stones.instanceMatrix.needsUpdate = true;
  stones.name = 'district:pond-stones';
  add(stones, { camera: false, cast: false });

  // East-bank deck.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 3), mats.concrete);
  deck.position.set(POND.x + 5.4, 0.2, POND.z + 0.6);
  deck.name = 'district:pond-deck';
  add(deck, { walkable: true, camera: false, cast: false });

  // The looping park path: a rounded-rectangle ring around the pond, plus a
  // branch running west across the lawn.
  const pathRing = new THREE.Shape();
  {
    const w = 9.5;
    const d = 11;
    const r = 4;
    pathRing.moveTo(-w + r, -d);
    pathRing.lineTo(w - r, -d);
    pathRing.quadraticCurveTo(w, -d, w, -d + r);
    pathRing.lineTo(w, d - r);
    pathRing.quadraticCurveTo(w, d, w - r, d);
    pathRing.lineTo(-w + r, d);
    pathRing.quadraticCurveTo(-w, d, -w, d - r);
    pathRing.lineTo(-w, -d + r);
    pathRing.quadraticCurveTo(-w, -d, -w + r, -d);
  }
  const ringPoints = pathRing.getPoints(56).map((p) => new THREE.Vector3(POND.x + p.x, 0.11, POND.z + p.y));
  const ringPath = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPoints, true), 96, 0.72, 4),
    mats.road,
  );
  ringPath.scale.y = 0.09;
  ringPath.position.y = 0.1;
  ringPath.name = 'district:park-path';
  add(ringPath, { camera: false, cast: false });
  const branchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(POND.x - 9.5, 0.11, POND.z - 2),
    new THREE.Vector3(POND.x - 14, 0.11, POND.z - 5),
    new THREE.Vector3(POND.x - 18, 0.11, POND.z + 1),
    new THREE.Vector3(POND.x - 21, 0.11, POND.z + 8),
  ]);
  const branchPath = new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 40, 0.72, 4), mats.road);
  branchPath.scale.y = 0.09;
  branchPath.position.y = 0.1;
  add(branchPath, { camera: false, cast: false });

  // Benches: the little colored bars dotted along the paths.
  const BENCHES = [
    [POND.x - 3, POND.z - 12.5, 0], [POND.x + 1, POND.z - 12.5, 0],
    [POND.x + 10.5, POND.z - 8, Math.PI / 2], [POND.x + 10.5, POND.z + 6, Math.PI / 2],
    [POND.x - 5.5, POND.z - 1.5, 0.5], [POND.x - 6.5, POND.z + 1, 0.5],
    [POND.x + 5, POND.z + 12.5, 0],
  ];
  const benches = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.3, 0.5), mats.white, BENCHES.length);
  BENCHES.forEach(([bx, bz, rot], i) => {
    const m = new THREE.Matrix4().makeRotationY(rot);
    m.setPosition(bx, 0.28, bz);
    benches.setMatrixAt(i, m);
    benches.setColorAt(i, new THREE.Color([COPING.red, COPING.blue, COPING.yellow][i % 3]));
  });
  benches.instanceMatrix.needsUpdate = true;
  if (benches.instanceColor) benches.instanceColor.needsUpdate = true;
  benches.name = 'district:park-benches';
  add(benches, { camera: false, cast: true });
  function teddyAt(x, z, materialTone) {
    const teddy = new THREE.Group();
    const tBody = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), materialTone);
    tBody.position.y = 1;
    teddy.add(tBody);
    const tHead = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), materialTone);
    tHead.position.y = 2.3;
    teddy.add(tHead);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), materialTone);
      ear.position.set(side * 0.55, 2.85, 0);
      teddy.add(ear);
    }
    teddy.position.set(x, 0, z);
    teddy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(teddy);
    return teddy;
  }
  teddyAt(23, 21, material(0xe8a45e, { roughness: 0.7 })).name = 'district:teddy';
  teddyAt(26.5, 22.5, mats.pink).scale.setScalar(0.7);

  // -------------------------------------------------------------------
  // TREES — playground cluster, suburb and coast greens, one instanced set
  // -------------------------------------------------------------------
  // Park groves match the close-up: clumps of two or three clustered trees at
  // the corners of the pond lawn, singles along the walks, and the belts that
  // line the suburbs and the coast.
  // Every tree comes from the plan: plan-verisi.js carries the measured
  // centre and canopy width of each one the drawing shows. Width becomes the
  // cluster's scale, so a broad grove reads broad and a street tree reads small.
  // Trees are small enough that a clash is best solved by moving them to the
  // verge rather than dropping them from the planting.
  const TREES = PLAN_AGACLAR.map(([x, z, g]) => {
    const [nx, nz] = yoldanKaydir(x, z, 1.8, 1.8);
    return [nx, nz, Math.max(0.7, Math.min(1.6, g / 5.5))];
  }).filter(([x, z]) => !denizdeMi(x, z));
  // The plaza's own trees are PLAN_AGACLAR rows like every other tree — the
  // eight extra crowns that used to be spread in here put twelve trees in a
  // window the reference gives four.
  const allTrees = TREES;
  const canopy = treeBlobs(allTrees, THREE, crownMat);
  canopy.name = 'district:tree-canopy';
  add(canopy, { camera: false, cast: true });
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6),
    mats.wood,
    allTrees.length,
  );
  allTrees.forEach(([x, z, scale = 1], i) => {
    const m = new THREE.Matrix4().makeScale(scale, scale, scale);
    m.setPosition(x, 0.6 * scale, z);
    trunks.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  add(trunks, { camera: false, cast: true });

  // -------------------------------------------------------------------
  // EDGES — river down the left and along the bottom, bridges, suburbs
  // -------------------------------------------------------------------
  // The river's head, measured: the northernmost water anywhere on the west
  // margin is a component running x -62..-55.32 by z -15.60..-2.23, and there
  // is not one blue pixel above z = -15.6. The curve used to start at
  // (-54,-58), which drove 4.6 units of water straight through the middle of
  // the kart circuit. Row centres down the west reach read -57.2 at z = -8,
  // -56.6 at z = -4, -56.5 at z = 10 and -55.6 at z = 20, so the northern
  // control points are those rather than the guesses they replace.
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-59.5, 0.05, -14), new THREE.Vector3(-57.2, 0.05, -8),
    new THREE.Vector3(-56.6, 0.05, -1), new THREE.Vector3(-56.4, 0.05, 10),
    new THREE.Vector3(-55.4, 0.05, 19), new THREE.Vector3(-53.5, 0.05, 25),
    new THREE.Vector3(-52, 0.05, 38), new THREE.Vector3(-44, 0.05, 52),
    new THREE.Vector3(-24, 0.05, 56), new THREE.Vector3(0, 0.05, 57),
  ]);
  const river = new THREE.Mesh(new THREE.TubeGeometry(riverCurve, 72, 2.4, 6), mats.water);
  river.scale.y = 0.03;
  river.position.y = 0.05;
  river.name = 'district:river';
  add(river, { camera: false, cast: false });

  // The suburbs ring the whole plan in the reference, not just one strip:
  // rows outside the river to the west, along the south edge, up the north
  // edge past the kart track, and behind the coast road to the east. Rows
  // alternate their roof angle so the belt reads as streets, not a fence.
  // Four rows are gone: [-59,-46], [-52,-41], [-48,-57] and [-36,-57]. Those
  // belong to the sports quarter, and the drawing has no house in any of it —
  // a red-roof mask over x -62..-40 by z -62..-40 returns nothing at all, and
  // the west margin returns nothing between z -50 and -20 either.
  const HOUSES = [
    // west of the river, two staggered rows
    [-59, -36], [-60, -26], [-60, -16], [-59, -6],
    [-59, 4], [-60, 14], [-60, 24], [-59, 34], [-58, 44],
    [-53, -21], [-53, -1], [-53, 19], [-52, 39],
    // south edge
    [-46, 52], [-36, 53], [-26, 52], [-16, 53], [-6, 52],
    [4, 53], [14, 52], [24, 53], [34, 52], [44, 53],
    [-40, 59], [-20, 59], [0, 59], [20, 59], [40, 59],
    // north edge, past the pool complex
    [-24, -58], [-12, -57], [0, -58],
    [12, -57], [24, -58], [36, -57], [46, -56],
    // east, behind the coast road
    [52, 40], [54, 50], [50, 30],
  ];
  // The north-east row ran past the shore, so one house stood in the bay.
  // The suburb belt goes through the same placement the blocks do, which it
  // never did before: the row above was a hand-written list that nothing
  // checked, so twenty-four of these stood in a carriageway and ten sat inside
  // a block. Every house is pushed clear of the roads, then apart from its
  // neighbours and from the blocks already placed, and anything that still
  // cannot fit is dropped rather than shipped inside something else.
  //
  // The footprint is the roof, not the walls: the body is 3 x 3.4 but the
  // pyramid over it reaches 2.5 to the corner, so a house measured by its
  // walls still hangs over the kerb.
  //
  // Blocks were the only fixed thing a house had to keep out of, so the belt
  // put four pyramid roofs on the kart lawn, one in the car park, one on the
  // sports campus beside the running track and one standing in the west
  // swimming pool. The reference has no house in any of them — the whole
  // north-west corner returns zero red-roof pixels. So the decks and the kart
  // lawn are fixed obstacles now too, and a house that cannot clear them is
  // dropped by the sweep below like any other misfit.
  const EV_G = 3.7;
  const EV_D = 4.1;
  const EV_YASAK = [
    // Sports campus, pool deck and car park; the stadium apron is left out
    // because the stadium already carries its own keep-out box.
    ...DECKS.slice(0, 3).map(([x, z, w, d]) => ({ x, z, w, d, sabit: true })),
    { x: -52.8, z: -52.65, w: 18.4, d: 18.5, sabit: true },   // kart lawn
  ];
  const KARADAKI_EVLER = (() => {
    const yerlesik = [
      ...BLOCKS.map(([x, z, w, , d]) => ({ x, z, w, d, sabit: true })),
      ...EV_YASAK,
    ];
    const evler = HOUSES
      .filter(([x, z]) => !denizdeMi(x, z))
      .map(([x, z]) => ({ x, z, w: EV_G, d: EV_D, sabit: false }));
    const hepsi = [...yerlesik, ...evler];
    for (let tur = 0; tur < 40; tur += 1) {
      let oynadi = false;
      for (const ev of evler) {
        const [nx, nz] = yoldanKaydir(ev.x, ev.z, ev.w, ev.d);
        if (nx !== ev.x || nz !== ev.z) { ev.x = nx; ev.z = nz; oynadi = true; }
      }
      for (const ev of evler) {
        for (const other of hepsi) {
          if (other === ev) continue;
          const bindirX = (ev.w + other.w) / 2 + 0.15 - Math.abs(ev.x - other.x);
          const bindirZ = (ev.d + other.d) / 2 + 0.15 - Math.abs(ev.z - other.z);
          if (bindirX <= 0 || bindirZ <= 0) continue;
          oynadi = true;
          // A block never yields; two houses share the correction.
          const pay = other.sabit ? 1 : 0.5;
          if (bindirX < bindirZ) {
            const yon = ev.x <= other.x ? -1 : 1;
            ev.x += yon * bindirX * pay;
            if (!other.sabit) other.x -= yon * bindirX * pay;
          } else {
            const yon = ev.z <= other.z ? -1 : 1;
            ev.z += yon * bindirZ * pay;
            if (!other.sabit) other.z -= yon * bindirZ * pay;
          }
        }
      }
      if (!oynadi) break;
    }
    // Relaxation alone does not finish the job: pushing a house off a road can
    // shove it into a block, and the next round pushes it back. So the last
    // word is a sweep — a house that is still on a carriageway, still inside a
    // block, or still inside another house is dropped. The belt is decorative
    // and forty-odd houses long; losing a few beats shipping one inside a
    // building, which is what "the houses have got into each other" was.
    const tutulan = [];
    for (const ev of evler) {
      if (Math.abs(ev.x) > 61 || Math.abs(ev.z) > 61) continue;
      if (denizdeMi(ev.x, ev.z)) continue;
      if (yolUstunde(ev.x, ev.z, ev.w, ev.d)) continue;
      const cakisiyor = [...yerlesik, ...tutulan].some((o) => (
        Math.abs(ev.x - o.x) < (ev.w + o.w) / 2 - 0.2
        && Math.abs(ev.z - o.z) < (ev.d + o.d) / 2 - 0.2
      ));
      if (cakisiyor) continue;
      tutulan.push(ev);
    }
    return tutulan.map((ev) => [ev.x, ev.z]);
  })();
  const houseBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 2.2, 3.4), mats.block, KARADAKI_EVLER.length);
  const houseRoofs = new THREE.InstancedMesh(new THREE.ConeGeometry(2.5, 1.5, 4), mats.copingRed, KARADAKI_EVLER.length);
  KARADAKI_EVLER.forEach(([x, z], i) => {
    // Alternate the plan rotation so a row of houses reads as a street of
    // separate homes rather than one repeated stamp.
    const turn = (i % 2) * (Math.PI / 2);
    const bodyM = new THREE.Matrix4().makeRotationY(turn);
    bodyM.setPosition(x, 1.1, z);
    houseBodies.setMatrixAt(i, bodyM);
    const rm = new THREE.Matrix4().makeRotationY(Math.PI / 4 + turn);
    rm.setPosition(x, 2.95, z);
    houseRoofs.setMatrixAt(i, rm);
    houseRoofs.setColorAt(i, new THREE.Color(CAR_PAINT[i % 3]));
  });
  houseBodies.instanceMatrix.needsUpdate = true;
  houseRoofs.instanceMatrix.needsUpdate = true;
  if (houseRoofs.instanceColor) houseRoofs.instanceColor.needsUpdate = true;
  houseBodies.name = 'district:suburb-houses';
  add(houseBodies, { camera: false, cast: true });
  add(houseRoofs, { camera: false, cast: true });

  // -------------------------------------------------------------------
  // LANDMARK BUILDINGS — drop the map-derived models onto their corners.
  // These are additions, not replacements: the procedural blocks still carry
  // the city's mass, so a failed fetch costs nothing. Skipped headlessly, as
  // the attribution tests measure the primitives.
  // -------------------------------------------------------------------
  const landmarkFootprints = [];
  for (const [, spec] of Object.entries(LANDMARK_MODELS)) {
    for (const site of spec.sites) {
      landmarkFootprints.push({
        minX: site.x - 3, maxX: site.x + 3, minZ: site.z - 3, maxZ: site.z + 3, topY: spec.height,
      });
    }
  }
  if (typeof document !== 'undefined') {
    const loader = new GLTFLoader();
    for (const [name, spec] of Object.entries(LANDMARK_MODELS)) {
      loader.load(`/assets/city67/${name}.glb`, (gltf) => {
        const proto = normalizeLandmark(gltf, spec.height);
        for (const site of spec.sites) {
          const instance = proto.clone();
          instance.position.set(site.x, 0, site.z);
          instance.rotation.y = site.yaw || 0;
          instance.name = `city67:${name}`;
          group.add(instance);
        }
      }, undefined, () => { /* procedural blocks already hold the city */ });
    }
  }

  // -------------------------------------------------------------------
  // MEASURED STREET FURNITURE — the benches, parasols, lamps, bins,
  // statues and the many small props the plan dots across the city. Two
  // instanced meshes carry the lot: one for the coloured pieces, one for
  // the pale ones, so 180 objects cost two draws.
  // -------------------------------------------------------------------
  // Street furniture is small by definition. Some records in the plan's
  // catch-all bucket measure ten units or more — those are roofs and decks
  // that belong to their own districts, not props, and rendering them as
  // boxes dropped pale slabs across the city and out over the sea.
  // The skatepark authors every object on its deck straight from the drawing,
  // so seventeen records the catch-all buckets read inside that cell are its
  // own bowls and ledges seen a second time. Dropping boxes on them stacked
  // pale slabs across the park.
  const skateIcinde = (x, z) => (
    Math.abs(x - SKATE_PLAZA.x) < SKATE_PLAZA.width / 2
    && Math.abs(z - SKATE_PLAZA.z) < SKATE_PLAZA.depth / 2
  );
  // Clearing the road comes first and the park test second, because the two
  // props that ended up sitting on the bowl lip started outside the deck and
  // were pushed onto it by the road setback. Testing the record's original
  // spot let them through.
  const yerlestir = ([x, z, ...rest]) => {
    const [nx, nz] = yoldanKaydir(x, z, rest[0], rest[1]);
    return [nx, nz, ...rest];
  };
  const ufakMi = ([x, z, g, d]) => g <= 3.2 && d <= 3.2 && !skateIcinde(x, z) && !denizdeMi(x, z);
  // PLAN_SEMSIYELER is deliberately not in here: the parasols are drawn as
  // cones by the beach and promenade run above, and dropping a coloured slab
  // on each of them as well stacked a box under every umbrella.
  const RENKLI = [...PLAN_BANKLAR, ...PLAN_HEYKELLER]
    .map(yerlestir).filter(ufakMi);
  const SOLUK = [...PLAN_LAMBALAR, ...PLAN_COPLER, ...PLAN_UFAKLAR]
    .map(yerlestir).filter(ufakMi);
  const om = new THREE.Matrix4();
  const renkliOge = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), mats.white, RENKLI.length + AWNING_SLOT.length,
  );
  RENKLI.forEach(([x, z, g, d, , renk], i) => {
    om.makeScale(Math.max(g, 0.5), 0.42, Math.max(d, 0.5));
    om.setPosition(x, 0.24, z);
    renkliOge.setMatrixAt(i, om);
    renkliOge.setColorAt(i, new THREE.Color(renk || '#d0c4bc').multiplyScalar(0.85));
  });
  AWNING_SLOT.forEach(([x, y, z, w, h, d, renk], i) => {
    om.makeScale(w, h, d);
    om.setPosition(x, y, z);
    renkliOge.setMatrixAt(RENKLI.length + i, om);
    renkliOge.setColorAt(RENKLI.length + i, new THREE.Color(renk).multiplyScalar(0.85));
  });
  renkliOge.instanceMatrix.needsUpdate = true;
  if (renkliOge.instanceColor) renkliOge.instanceColor.needsUpdate = true;
  renkliOge.name = 'district:street-furniture';
  add(renkliOge, { camera: false, cast: true });

  const solukOge = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), mats.concrete, SOLUK.length + STANDS.length,
  );
  solukOge.name = 'district:stands';
  SOLUK.forEach(([x, z, g, d], i) => {
    const yuksek = Math.min(1.4, 0.3 + Math.max(g, d) * 0.2);
    om.makeScale(Math.max(g, 0.45), yuksek, Math.max(d, 0.45));
    om.setPosition(x, yuksek / 2, z);
    solukOge.setMatrixAt(i, om);
  });
  STANDS.forEach(([x, z, w, d], i) => {
    om.makeScale(w, 1.1, d);
    om.setPosition(x, 0.55, z);
    solukOge.setMatrixAt(SOLUK.length + i, om);
  });
  solukOge.instanceMatrix.needsUpdate = true;
  add(solukOge, { camera: true, cast: true });

  // -------------------------------------------------------------------
  // Solid footprints for the player sim.
  // -------------------------------------------------------------------
  const colliders = BLOCKS.map(([x, z, w, h, d]) => (
    { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, topY: h }
  ));
  colliders.push({ minX: -36.5, maxX: -25.5, minZ: -45.5, maxZ: -38.5, topY: 4.2 });
  // The suburb belt was the one kind of building the player could walk
  // straight through: every other block is in this list and the houses were
  // not. Same rule now — a building is solid unless you enter it with E.
  for (const [x, z] of KARADAKI_EVLER) {
    colliders.push({ minX: x - EV_G / 2, maxX: x + EV_G / 2, minZ: z - EV_D / 2, maxZ: z + EV_D / 2, topY: 2.2 });
  }
  colliders.push(...landmarkFootprints);
  for (const [dx, dz, w, d, h] of COURT_BLOCKS) {
    const x = COURT.x + dx;
    const z = COURT.z + dz;
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, topY: h });
  }
  // The plaza's corner towers are solid to the player the same way a block
  // is, on their own measured footprints rather than the posts' old ones.
  for (const [x, z, w, d] of PLAN_PLAZA_KULELERI) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, topY: 5.65 });
  }

  return {
    skatepark: Object.freeze({ minX: -15.5, maxX: 16.76, minZ: -49.21, maxZ: -20.34, topY: 0.44 }),
    stadiumPitch,
    blockCount: BLOCKS.length,
    // The map lets you tap anywhere, so it needs the same shore test the
    // city uses to keep buildings out of the bay.
    isWater: denizdeMi,
    colliders,
  };
}
