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
import { PLAN_BINALAR, PLAN_BINA_RENK, PLAN_AGACLAR, PLAN_ARABALAR } from './plan-verisi.js';
import {
  PLAN_ANA_YOLLAR, PLAN_PATIKALAR, PLAN_ZEBRALAR, PLAN_KAVSAKLAR,
} from './plan-ek.js';
import {
  PLAN_BANKLAR, PLAN_SEMSIYELER, PLAN_LAMBALAR, PLAN_HEYKELLER,
  PLAN_COPLER, PLAN_UFAKLAR,
} from './plan-oge.js';
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
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
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
function roundedBoxGeometry(w, d, h, r) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// --- skatepark geometry helpers -------------------------------------------
// The park's shapes arrive from the drawing as outlines and centrelines, so
// these turn an outline into the three surfaces a carved bowl actually needs:
// a hole in the deck, a floor inset from the rim, and the wall between them.

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    area += x1 * z2 - x2 * z1;
  }
  return area / 2;
}

function inwardNormal(a, b, sign) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  return [(-sign * dz) / length, (sign * dx) / length];
}

// Miter offset towards the inside. The bowls are smooth and gently concave,
// so a bisector offset is exact enough; the cosine floor stops a tight corner
// from throwing its vertex across the shape.
function insetPolygon(points, distance) {
  const sign = polygonArea(points) > 0 ? 1 : -1;
  const count = points.length;
  return points.map((p1, i) => {
    const p0 = points[(i - 1 + count) % count];
    const p2 = points[(i + 1) % count];
    const n1 = inwardNormal(p0, p1, sign);
    const n2 = inwardNormal(p1, p2, sign);
    let bx = n1[0] + n2[0];
    let bz = n1[1] + n2[1];
    const length = Math.hypot(bx, bz) || 1;
    bx /= length;
    bz /= length;
    const cos = Math.max(0.4, bx * n1[0] + bz * n1[1]);
    return [p1[0] + (bx * distance) / cos, p1[1] + (bz * distance) / cos];
  });
}

// A centreline plus a half width becomes two rims; the run's outline is one
// rim followed by the other, reversed.
function ribbonSides(line, half) {
  const left = [];
  const right = [];
  for (let i = 0; i < line.length; i += 1) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    left.push([line[i][0] - dz * half, line[i][1] + dx * half]);
    right.push([line[i][0] + dz * half, line[i][1] - dx * half]);
  }
  return { left, right, outline: left.concat([...right].reverse()) };
}

function shapeFromPoints(points, Ctor) {
  const shape = new Ctor();
  // Shapes are authored in the XY plane and rotated flat, which maps shape y
  // to world -z. Every conversion in this file goes through here.
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  return shape;
}

function wallStripGeometry(rim, floor, rimY, floorY) {
  const position = [];
  const uv = [];
  for (let i = 0; i < rim.length; i += 1) {
    const j = (i + 1) % rim.length;
    const a = [rim[i][0], rimY, rim[i][1]];
    const b = [rim[j][0], rimY, rim[j][1]];
    const c = [floor[j][0], floorY, floor[j][1]];
    const d = [floor[i][0], floorY, floor[i][1]];
    position.push(...a, ...d, ...c, ...a, ...c, ...b);
    uv.push(0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function copingTube(points, y, radius, closed) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, y, z)),
    closed,
    'catmullrom',
    0.2,
  );
  const segments = Math.max(12, Math.round(curve.getLength() / 0.45));
  return new THREE.TubeGeometry(curve, segments, radius, 6, closed);
}

// Colour rides on the vertices so every painted lip in the park — three
// different colours across bowls, kerbs and ramps — is still one draw call.
function tinted(geometry, hex) {
  const colour = new THREE.Color(hex);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

// A bowl in the reference is not a darker floor — the floor is the same
// concrete as the deck, and what you read as depth is the shade down its
// wall. This paints that gradient onto the wall's own vertices, so the recess
// reads from the air without a shadow map fine enough to resolve it.
function tintedByHeight(geometry, topHex, bottomHex, topY, bottomY) {
  const top = new THREE.Color(topHex);
  const bottom = new THREE.Color(bottomHex);
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  const mix = new THREE.Color();
  const range = topY - bottomY || 1;
  for (let i = 0; i < position.count; i += 1) {
    const t = Math.min(1, Math.max(0, (position.getY(i) - bottomY) / range));
    mix.copy(bottom).lerp(top, t);
    colours[i * 3] = mix.r;
    colours[i * 3 + 1] = mix.g;
    colours[i * 3 + 2] = mix.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
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

export function buildCityDistricts({ group, add, material, animated }) {
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
    block: material(0xb5a9a6, { roughness: 0.7 }),
    blockDark: material(0xa39590, { roughness: 0.75 }),
    court: material(0x748560, { roughness: 0.9 }),
    pitch: material(0x475142, { roughness: 0.92 }),
    trackRed: material(0xa9736a, { roughness: 0.9 }),
    grass: material(0x868b6e, { roughness: 0.95 }),
    sand: material(0xaaa27f, { roughness: 0.95 }),
    water: material(0x8db2d6, { roughness: 0.25, transparent: true, opacity: 0.97 }),
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
    wood: material(0x96693c, { flatShading: true, roughness: 1 }),
    rail: material(0x70757e, { roughness: 0.35, metalness: 0.4 }),
    white: material(0xc0b7ad, { roughness: 0.6 }),
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
  const V_ROADS = [...new Set(PLAN_ANA_YOLLAR.filter(([, , g, d]) => !yatayMi(g, d))
    .map(([x]) => Math.round(x * 2) / 2))];
  const H_ROADS = [...new Set(PLAN_ANA_YOLLAR.filter(([, , g, d]) => yatayMi(g, d))
    .map(([, z]) => Math.round(z * 2) / 2))];

  // Nothing from the plan may stand on a road. A footprint that lands on a
  // carriageway is not deleted — the plan drew a building there and it should
  // exist — it is pushed clear along whichever axis needs the smaller move,
  // the way a site plan resolves a clash.
  // The plan builds right up to the kerb, so the setback is a kerb's width,
  // not a garden. A larger margin was rejecting terraces that genuinely fit.
  const YOL_PAYI = ROAD_W / 2 + 0.35;
  function yoldanKaydir(x, z, w = 0, d = 0) {
    let nx = x;
    let nz = z;
    for (let tur = 0; tur < 3; tur += 1) {
      let carpisma = false;
      for (const rx of V_ROADS) {
        const bindirme = YOL_PAYI + w / 2 - Math.abs(nx - rx);
        if (bindirme > 0) { nx += nx >= rx ? bindirme : -bindirme; carpisma = true; }
      }
      for (const rz of H_ROADS) {
        const bindirme = YOL_PAYI + d / 2 - Math.abs(nz - rz);
        if (bindirme > 0) { nz += nz >= rz ? bindirme : -bindirme; carpisma = true; }
      }
      if (!carpisma) break;
    }
    return [nx, nz];
  }
  function yolUstunde(x, z, w = 0, d = 0) {
    for (const rx of V_ROADS) if (Math.abs(x - rx) < YOL_PAYI + w / 2) return true;
    for (const rz of H_ROADS) if (Math.abs(z - rz) < YOL_PAYI + d / 2) return true;
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
  const PARKED = PLAN_ARABALAR.map(([x, z, dikey]) => [x, z, dikey ? 0 : V]);
  const PARKED_RENK = PLAN_ARABALAR.map(([, , , renk]) => renk);
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
  // The carriageways come from the plan, so the traffic has to as well. These
  // used to be hand-written numbers two to six units off the measured axes,
  // which drove one lane of northbound cars straight across the skatepark
  // deck. Each route now names a road the drawing actually has.
  const ROUTES = [
    { axis: 'z', road: -19.5, dir: 1 }, { axis: 'z', road: -19.5, dir: -1 },
    { axis: 'z', road: 18.5, dir: 1 }, { axis: 'z', road: 18.5, dir: -1 },
    { axis: 'z', road: 41.5, dir: 1 }, { axis: 'z', road: -53.5, dir: -1 },
    { axis: 'x', road: -18.5, dir: 1 }, { axis: 'x', road: -18.5, dir: -1 },
    { axis: 'x', road: 18, dir: 1 }, { axis: 'x', road: 51.5, dir: -1 },
  ];
  animated?.push((time) => {
    ROUTES.forEach((route, d) => {
      const index = PARKED.length + d;
      const lane = route.road + route.dir * 1.15;
      const span = 96;
      const along = ((time * 4.5 + d * 19) % span) - span / 2;
      const travel = route.dir > 0 ? along : -along;
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
    [29.7, 0.3, 19.2, 33.1],
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
    [22.6, -1.6, 2.4, 9.5], [39.1, -1.4, 2.3, 10.0],      // stadium
    [-52.4, -32.4, 0.9, 7.2],                              // tram platform
  ];
  // Grandstands share the pale concrete box with the street furniture below,
  // so they are appended to that mesh rather than drawn on their own.

  // -------------------------------------------------------------------
  // NW — kart loop in the corner, parking + solar gym, athletics, baseball
  // -------------------------------------------------------------------
  const kartCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-58, 0.1, -52), new THREE.Vector3(-50, 0.1, -55),
    new THREE.Vector3(-44, 0.1, -51), new THREE.Vector3(-47, 0.1, -45),
    new THREE.Vector3(-54, 0.1, -43), new THREE.Vector3(-59, 0.1, -47),
  ], true);
  const kart = new THREE.Mesh(new THREE.TubeGeometry(kartCurve, 72, 1.5, 8), mats.road);
  kart.scale.y = 0.06;
  kart.position.y = 0.08;
  kart.name = 'district:kart-track';
  add(kart, { camera: false, cast: false });

  const gym = new THREE.Mesh(new THREE.BoxGeometry(11, 4.2, 7), mats.block);
  gym.position.set(-31, 2.1, -42);
  gym.name = 'district:gym';
  add(gym, { camera: true, cast: true });
  const gymRoof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 5), mats.glass);
  gymRoof.position.set(-31, 4.35, -42);
  add(gymRoof, { camera: false, cast: false });

  // Measured: the oval sits at (-41.4, -29.4) and runs 9.7 x 16.7 — taller
  // than wide, which is why an oval scaled the other way looked wrong. Lane
  // lines are painted into the ring's texture, one draw for the whole track.
  function lanesTexture() {
    if (typeof document === 'undefined') return mats.trackRed;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 64;
    const c = canvas.getContext('2d');
    c.fillStyle = '#a9736a';
    c.fillRect(0, 0, 8, 64);
    c.strokeStyle = '#d8ccc4';
    c.lineWidth = 1;
    for (let i = 1; i < 6; i += 1) {
      c.beginPath();
      c.moveTo(0, (i * 64) / 6);
      c.lineTo(8, (i * 64) / 6);
      c.stroke();
    }
    return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.9 });
  }
  const oval = copingArc(lanesTexture(), 4.85, 2.4, Math.PI * 2);
  oval.scale.set(1, 1, 0.06);
  oval.position.set(-41.4, 0.12, -29.4);
  oval.rotation.z = Math.PI / 2;
  oval.name = 'district:athletics-track';
  add(oval, { camera: false, cast: false });
  const infield = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.08, 20), mats.pitch);
  infield.scale.z = 1.9;
  infield.position.set(-41.4, 0.1, -29.4);
  add(infield, { walkable: true, camera: false, cast: false });

  // Baseball, measured at (-26.7, -27.4): a green outfield wedge with the
  // sand infield fan set into its corner, the way the plan draws it.
  const outfield = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 6.5, 0.08, 16, 1, false, 0, Math.PI / 2), mats.court,
  );
  outfield.position.set(-26.7, 0.08, -27.4);
  outfield.rotation.y = Math.PI * 0.75;
  outfield.name = 'district:baseball';
  add(outfield, { camera: false, cast: false });
  const infieldFan = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 0.06, 14, 1, false, 0, Math.PI / 2), mats.sand,
  );
  infieldFan.position.set(-24.6, 0.11, -24.6);
  infieldFan.rotation.y = Math.PI * 0.75;
  add(infieldFan, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // NE — funfair, and the marina against the coast road
  // -------------------------------------------------------------------
  const ferris = new THREE.Group();
  ferris.name = 'district:ferris-wheel';
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.22, 10, 36), mats.copingYellow);
  ferris.add(wheelRing);
  const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 10.2, 0.16), mats.rail, 4);
  for (let i = 0; i < 4; i += 1) spokes.setMatrixAt(i, new THREE.Matrix4().makeRotationZ((i / 4) * Math.PI));
  spokes.instanceMatrix.needsUpdate = true;
  ferris.add(spokes);
  const gondolas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), mats.white, 8);
  for (let i = 0; i < 8; i += 1) gondolas.setColorAt(i, new THREE.Color(CAR_PAINT[i % CAR_PAINT.length]));
  if (gondolas.instanceColor) gondolas.instanceColor.needsUpdate = true;
  ferris.add(gondolas);
  // Measured off the reference: its centre lands at world (27, -46.8) once
  // the 1280px plan is mapped onto the +/-62 world.
  ferris.position.set(27, 6.4, -46.8);
  for (const legX of [26.2, 27.8]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 6.6, 8), mats.rail);
    leg.position.set(legX, 3.3, -46.8);
    leg.rotation.z = legX < 27 ? 0.12 : -0.12;
    add(leg, { camera: false, cast: true });
  }
  group.add(ferris);
  const gondolaSpin = new THREE.Matrix4();
  const gondolaAt = new THREE.Matrix4();
  animated?.push((time) => {
    const theta = time * 0.14;
    ferris.rotation.z = theta;
    gondolaSpin.makeRotationZ(-theta);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + theta;
      gondolaAt.makeTranslation(Math.cos(angle) * 5.2, Math.sin(angle) * 5.2 - 0.55, 0);
      gondolas.setMatrixAt(i, gondolaAt.premultiply(gondolaSpin));
    }
    gondolas.instanceMatrix.needsUpdate = true;
  });

  // Both carousels in the reference wear a segmented canopy — alternating
  // wedges, not a flat cone. Painting the wedges into a texture keeps that
  // read at one draw instead of a dozen.
  function wedgeCanopy(toneA, toneB, wedges) {
    if (typeof document === 'undefined') return mats.copingRed;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 16;
    const c = canvas.getContext('2d');
    for (let i = 0; i < wedges; i += 1) {
      c.fillStyle = i % 2 === 0 ? toneA : toneB;
      c.fillRect((i * 256) / wedges, 0, 256 / wedges + 1, 16);
    }
    return new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(canvas),
      roughness: 0.6,
    });
  }
  // Measured off the plan: the big red-and-white carousel at (36.6, -45.8),
  // the smaller orange one on its green lawn at (34.1, -36.1). Their shared
  // parts — decks, poles, seat rings — ride single instanced meshes so two
  // rides cost barely more than one; only the canopies differ, each carrying
  // its own wedge texture.
  const RIDES = [
    { x: 36.6, z: -45.8, r: 2.8, canopy: wedgeCanopy('#c0564a', '#e6dcd0', 12) },
    { x: 34.1, z: -36.1, r: 2.1, canopy: wedgeCanopy('#d08a4a', '#e6dcd0', 12) },
  ];
  const rideDecks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.06, 0.5, 16), mats.white, RIDES.length);
  const ridePoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8), mats.rail, RIDES.length);
  const rideSeats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), mats.white, RIDES.length * 8);
  const rm4 = new THREE.Matrix4();
  RIDES.forEach((ride, i) => {
    rm4.makeScale(ride.r * 0.88, 1, ride.r * 0.88);
    rm4.setPosition(ride.x, 0.25, ride.z);
    rideDecks.setMatrixAt(i, rm4);
    ridePoles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(ride.x, 1.6, ride.z));
    for (let s = 0; s < 8; s += 1) {
      const a = (s / 8) * Math.PI * 2;
      rideSeats.setMatrixAt(i * 8 + s, new THREE.Matrix4().makeTranslation(
        ride.x + Math.cos(a) * ride.r * 0.66, 0.78, ride.z + Math.sin(a) * ride.r * 0.66,
      ));
      rideSeats.setColorAt(i * 8 + s, new THREE.Color(CAR_PAINT[s % CAR_PAINT.length]));
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(ride.r * 1.12, 1.5, 16), ride.canopy);
    roof.position.set(ride.x, 3.15, ride.z);
    add(roof, { camera: false, cast: true });
  });
  for (const mesh of [rideDecks, ridePoles, rideSeats]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  rideDecks.name = 'district:carousel';
  add(rideDecks, { camera: false, cast: true });
  add(ridePoles, { camera: false, cast: false });
  add(rideSeats, { camera: false, cast: true });
  const lawnDisc = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.1, 22), mats.grass);
  lawnDisc.position.set(34.1, 0.05, -36.1);
  add(lawnDisc, { camera: false, cast: false });

  // The swirling ride in the reference is not a rail coaster: it is a wide
  // skate CHANNEL — a flat grey floor you could ride, with an orange lip
  // running down both sides — that folds back over itself in a long loop.
  // Built as a ribbon: sample the curve, step left and right along its
  // horizontal normal, and stitch the floor; the lips ride the same offsets.
  const slideCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(22, 0.7, -30), new THREE.Vector3(28, 1.5, -32.5),
    new THREE.Vector3(35, 0.9, -30), new THREE.Vector3(39, 1.7, -26),
    new THREE.Vector3(35, 1.0, -22.5), new THREE.Vector3(29, 1.9, -24),
    new THREE.Vector3(25, 1.1, -27), new THREE.Vector3(30, 1.6, -28.5),
    new THREE.Vector3(36, 0.8, -27),
  ], true);
  const SLIDE_HALF = 1.5;
  function ribbonGeometry(curve, halfWidth, segments) {
    const positions = [];
    const indices = [];
    const up = new THREE.Vector3(0, 1, 0);
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      curve.getPointAt(t, point);
      curve.getTangentAt(t, tangent);
      side.crossVectors(tangent, up).normalize().multiplyScalar(halfWidth);
      positions.push(point.x - side.x, point.y, point.z - side.z);
      positions.push(point.x + side.x, point.y, point.z + side.z);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const slideFloor = new THREE.Mesh(ribbonGeometry(slideCurve, SLIDE_HALF, 220), mats.concrete);
  slideFloor.material.side = THREE.DoubleSide;
  slideFloor.name = 'district:funfair-slide';
  add(slideFloor, { camera: false, cast: false });
  // Orange lips: one tube down each edge, offset by tracing a parallel curve.
  for (const dir of [-1, 1]) {
    const edgePoints = [];
    const up = new THREE.Vector3(0, 1, 0);
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < 160; i += 1) {
      const t = i / 160;
      slideCurve.getPointAt(t, point);
      slideCurve.getTangentAt(t, tangent);
      side.crossVectors(tangent, up).normalize().multiplyScalar(SLIDE_HALF * dir);
      edgePoints.push(new THREE.Vector3(point.x + side.x, point.y + 0.16, point.z + side.z));
    }
    const lip = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePoints, true), 200, 0.17, 6),
      mats.copingRed,
    );
    add(lip, { camera: false, cast: false });
  }
  // Slim supports under the raised sections.
  const slidePosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.13, 1, 6), mats.concreteDeep, 12);
  for (let i = 0; i < 12; i += 1) {
    const p = slideCurve.getPointAt(i / 12);
    const m = new THREE.Matrix4().makeScale(1, Math.max(0.2, p.y), 1);
    m.setPosition(p.x, p.y / 2, p.z);
    slidePosts.setMatrixAt(i, m);
  }
  slidePosts.instanceMatrix.needsUpdate = true;
  add(slidePosts, { camera: false, cast: false });
  const tent = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.6, 12), mats.copingRed);
  tent.position.set(41, 1.3, -41);
  tent.name = 'district:big-top';
  add(tent, { camera: false, cast: true });

  // -------------------------------------------------------------------
  // EAST MARGIN — the SEA fills the whole right edge; beach cape with
  // umbrellas; the lighthouse on the point; marina rows off the coast road.
  // -------------------------------------------------------------------
  // The sea fills the right margin exactly: from the coastline at x=46 to the
  // terrain plane's own edge at x=75, and the full depth of that plane. Sized
  // to the land, so the waterline is a coast rather than a slab on a lawn.
  const sea = new THREE.Mesh(new THREE.BoxGeometry(29, 0.1, 150), mats.water);
  sea.position.set(60.5, 0.02, 0);
  sea.name = 'district:sea';
  add(sea, { camera: false, cast: false });

  const capeShape = new THREE.Shape();
  capeShape.moveTo(0, -14);
  capeShape.quadraticCurveTo(9, -12, 10, -2);
  capeShape.quadraticCurveTo(10.5, 8, 6, 14);
  capeShape.quadraticCurveTo(1, 12, 0, 6);
  capeShape.lineTo(0, -14);
  const cape = new THREE.Mesh(new THREE.ShapeGeometry(capeShape, 18), mats.sand);
  cape.rotation.x = -Math.PI / 2;
  cape.position.set(47, 0.09, -2);
  cape.name = 'district:beach';
  add(cape, { walkable: true, camera: false, cast: false });
  const umbrellas = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 0.5, 10), mats.copingRed, 5);
  [[50, -10], [53, -5], [54, 1], [52, 7], [49, 3]].forEach(([x, z], i) => {
    umbrellas.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.15, z));
    umbrellas.setColorAt(i, new THREE.Color(CAR_PAINT[(i * 2) % CAR_PAINT.length]));
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
  lighthouse.position.set(55.1, 0, -19.9);
  lighthouse.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(lighthouse);

  // Piers and river bridges are the same timber deck, so one instanced mesh
  // carries both: the three piers first, then a bridge wherever the plan puts
  // a street across the water.
  const AHSAP_KOPRU = [
    [-54, -19, 7, 0.4, 2.6, 0], [-54, 16, 7, 0.4, 2.6, 0], [-53, -44, 7, 0.4, 2.6, 0],
    [-52, 38, 7, 0.4, 2.6, 0], [-30, 54.5, 7, 0.4, 2.6, 0.35], [-6, 56, 7, 0.4, 2.6, 0.1],
    [16, 55, 7, 0.4, 2.6, -0.1],
  ];
  const AHSAP_BASLANGIC = 4 + AHSAP_KOPRU.length;
  const docks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), mats.wood, AHSAP_BASLANGIC + 5,
  );
  const dkm = new THREE.Matrix4();
  [[48.8, -47.5], [49.2, -38.9], [49.0, -29.0], [49.0, -20.0]].forEach(([x, z], i) => {
    dkm.makeScale(11.5, 0.24, 1.3);
    dkm.setPosition(x, 0.2, z);
    docks.setMatrixAt(i, dkm);
  });
  AHSAP_KOPRU.forEach(([x, z, w, h, d, rot], i) => {
    dkm.makeRotationY(rot);
    dkm.scale(new THREE.Vector3(w, h, d));
    dkm.setPosition(x, 0.36, z);
    docks.setMatrixAt(4 + i, dkm);
  });
  docks.instanceMatrix.needsUpdate = true;
  docks.name = 'district:marina-docks';
  add(docks, { camera: false, cast: false });
  const boats = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.5, 1.05), mats.white, 8);
  [[50.6, -31.9], [54.2, -31.9], [50.6, -35.9], [54.2, -35.9], [50.6, -39.9], [54.2, -39.9], [51, -44], [57, -27]]
    .forEach(([x, z], i) => {
      boats.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.3, z));
      boats.setColorAt(i, new THREE.Color(CAR_PAINT[(i + 1) % CAR_PAINT.length]));
    });
  boats.instanceMatrix.needsUpdate = true;
  if (boats.instanceColor) boats.instanceColor.needsUpdate = true;
  boats.name = 'district:marina-boats';
  add(boats, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // CENTER — the framed 67 plaza with fountain, tree ring, corner towers
  // -------------------------------------------------------------------
  const plazaPlate = new THREE.Mesh(new THREE.BoxGeometry(30, 0.16, 30), mats.stone);
  plazaPlate.position.set(-2, 0.08, -1.5);
  plazaPlate.name = 'district:plaza';
  add(plazaPlate, { walkable: true, camera: false, cast: false });
  const plazaFrame = new THREE.InstancedMesh(new THREE.BoxGeometry(30.8, 0.3, 0.5), mats.white, 4);
  [[-2, -16.65, 0], [-2, 13.65, 0], [-17.15, -1.5, Math.PI / 2], [13.15, -1.5, Math.PI / 2]].forEach(([x, z, rot], i) => {
    const m = new THREE.Matrix4().makeRotationY(rot);
    m.setPosition(x, 0.18, z);
    plazaFrame.setMatrixAt(i, m);
  });
  plazaFrame.instanceMatrix.needsUpdate = true;
  add(plazaFrame, { camera: false, cast: false });
  const fBase = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.6, 16), mats.stone);
  fBase.position.set(-2, 0.46, -1.5);
  add(fBase, { camera: false, cast: false });
  const fPool = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.12, 16), mats.water);
  fPool.position.set(-2, 0.78, -1.5);
  add(fPool, { camera: false, cast: false });
  const fColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 1.5, 10), mats.stone);
  fColumn.position.set(-2, 1.4, -1.5);
  add(fColumn, { camera: false, cast: true });
  const plazaLabel = flatLabel('67', 6);
  if (plazaLabel) {
    plazaLabel.position.set(-2, 0.17, 6.5);
    group.add(plazaLabel);
  }
  const PLAZA_TREES = [[-11, -10, 0.8], [7, -10, 0.8], [-11, 7, 0.8], [7, 7, 0.8],
    [-2, -12, 0.75], [-2, 9, 0.75], [-14, -1.5, 0.8], [10, -1.5, 0.8]];
  // Sage-olive canopy, matched against the reference by eye after a numeric
  // pass proved unreliable: the "darkest green" sampler kept landing on
  // shadowed lawn rather than foliage, so its answer pulled the trees toward
  // a dark teal the reference never had.
  const crownMat = material(0x87946f, { roughness: 0.95, flatShading: true });
  const TOWERS = [[-15.5, -15], [11.5, -15], [-15.5, 12], [11.5, 12]];
  const towerShafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.05, 1.15, 4.6, 12), mats.white, TOWERS.length);
  const towerCaps = new THREE.InstancedMesh(new THREE.SphereGeometry(1.05, 12, 8), mats.cream, TOWERS.length);
  TOWERS.forEach(([x, z], i) => {
    towerShafts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.3, z));
    towerCaps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 4.7, z));
  });
  towerShafts.instanceMatrix.needsUpdate = true;
  towerCaps.instanceMatrix.needsUpdate = true;
  towerShafts.name = 'district:plaza-towers';
  add(towerShafts, { camera: true, cast: true });
  add(towerCaps, { camera: false, cast: true });

  // -------------------------------------------------------------------
  // E CELL — the 67 stadium in its reference position right of the plaza
  // -------------------------------------------------------------------
  const stadium = new THREE.Group();
  stadium.name = 'district:stadium';
  // Measured: the stadium footprint is 19.2 x 33.1, so its ring runs long
  // north-south rather than the near-circle I had.
  const stand = copingArc(mats.blockDark, 8.6, 1.6, Math.PI * 2);
  stand.scale.set(1.12, 1, 1.92);
  stand.position.y = 0.7;
  stadium.add(stand);
  const pitch = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.1, 22), mats.pitch);
  pitch.scale.set(1.15, 1, 1.9);
  pitch.position.y = 0.16;
  pitch.name = 'district:stadium-pitch';
  stadium.add(pitch);
  const pitchLabel = flatLabel('67', 6);
  if (pitchLabel) {
    pitchLabel.position.y = 0.13;
    stadium.add(pitchLabel);
  }
  stadium.position.set(29.7, 0, 0.3);
  stadium.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  group.add(stadium);

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
    { minX: 20, maxX: 44, minZ: -12, maxZ: 12 },     // stadium
    { minX: -10, maxX: 6, minZ: 24, maxZ: 39 },      // market square
    { minX: 18, maxX: 46, minZ: -50, maxZ: -18 },    // funfair
    { minX: 18, maxX: 46, minZ: 18, maxZ: 46 },      // pond park
    { minX: -40, maxX: -22, minZ: -50, maxZ: -34 },  // gym + parking
  ];
  const ozelIcinde = (x, z) => OZEL_BOLGELER.some(
    (b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ,
  );
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
      .filter(({ x, z }) => !ozelIcinde(x, z));

    // The plan draws terraces that touch, so neighbours may share a wall;
    // only a real overlap is a fault.
    const BOSLUK = 0.05;
    for (let tur = 0; tur < 60; tur += 1) {
      let oynadi = false;
      for (const b of adaylar) {
        const [nx, nz] = yoldanKaydir(b.x, b.z, b.w, b.d);
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
          // Separate along the axis that needs the smaller correction.
          if (bindirX < bindirZ) {
            const yon = a.x <= b.x ? -1 : 1;
            a.x += (yon * bindirX) / 2;
            b.x -= (yon * bindirX) / 2;
          } else {
            const yon = a.z <= b.z ? -1 : 1;
            a.z += (yon * bindirZ) / 2;
            b.z -= (yon * bindirZ) / 2;
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
      let kondu = false;
      for (const olcek of [1, 0.86, 0.72, 0.6]) {
        const w = b.w * olcek;
        const d = b.d * olcek;
        if (yolUstunde(b.x, b.z, w, d)) continue;
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
  const blockGeo = roundedBoxGeometry(1, 1, 1, 0.16);
  const blockBodies = new THREE.InstancedMesh(blockGeo, mats.white, BLOCKS.length);
  const blockPlinths = new THREE.InstancedMesh(roundedBoxGeometry(1, 1, 1, 0.22), mats.concrete, BLOCKS.length);
  const blockLips = new THREE.InstancedMesh(roundedBoxGeometry(1, 1, 1, 0.16), mats.white, BLOCKS.length);
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
    blockBodies.setColorAt(i, new THREE.Color(BLOCKS[i][5] || '#c9bcb8').multiplyScalar(0.82));
    // Plinth: a slightly wider, very low pad the body sits on.
    bm.makeScale(w + 1.1, 0.26, d + 1.1);
    bm.setPosition(x, 0.13, z);
    blockPlinths.setMatrixAt(i, bm);
    // Roof lip: a thin raised frame just inside the roof edge.
    bm.makeScale(w * 0.9, 0.16, d * 0.9);
    bm.setPosition(x, h + 0.06, z);
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
    c.fillStyle = '#3f5130';
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
      map: new THREE.CanvasTexture(canvas),
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

  const marketGround = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.12, 20), mats.concreteDeep);
  marketGround.position.set(-2, 0.06, 31);
  marketGround.name = 'district:market-ground';
  add(marketGround, { walkable: true, camera: false, cast: false });
  const tower = new THREE.Group();
  const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 2.4, 10), mats.block);
  towerBase.position.y = 1.2;
  tower.add(towerBase);
  const towerTop = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 1.6, 10), mats.blockDark);
  towerTop.position.y = 3.2;
  tower.add(towerTop);
  const towerCrown = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), mats.copingYellow);
  towerCrown.position.y = 4.3;
  tower.add(towerCrown);
  tower.position.set(-2, 0, 31);
  tower.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  tower.name = 'district:market-tower';
  group.add(tower);
  const STALLS = [[-7, 28], [-6.5, 34.5], [3, 34], [3.5, 28], [-2, 25.5]];
  // Market tables are the same timber as the piers and bridges, so they join
  // that instanced mesh rather than opening a fourth wood draw.
  const stallAwnings = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.12, 1.4), mats.white, STALLS.length);
  const AWNING = [COPING.red, COPING.blue, COPING.yellow];
  STALLS.forEach(([x, z], i) => {
    dkm.makeScale(1.6, 0.8, 1.1);
    dkm.setPosition(x, 0.4, z);
    docks.setMatrixAt(AHSAP_BASLANGIC + i, dkm);
    stallAwnings.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.5, z));
    stallAwnings.setColorAt(i, new THREE.Color(AWNING[i % 3]));
  });
  stallAwnings.instanceMatrix.needsUpdate = true;
  docks.instanceMatrix.needsUpdate = true;
  if (stallAwnings.instanceColor) stallAwnings.instanceColor.needsUpdate = true;
  add(stallAwnings, { camera: false, cast: false });

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
  });
  const allTrees = [...TREES, ...PLAZA_TREES];
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
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-54, 0.05, -58), new THREE.Vector3(-55, 0.05, -34),
    new THREE.Vector3(-53, 0.05, -8), new THREE.Vector3(-55, 0.05, 18),
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
  const HOUSES = [
    // west of the river, two staggered rows
    [-59, -46], [-59, -36], [-60, -26], [-60, -16], [-59, -6],
    [-59, 4], [-60, 14], [-60, 24], [-59, 34], [-58, 44],
    [-52, -41], [-53, -21], [-53, -1], [-53, 19], [-52, 39],
    // south edge
    [-46, 52], [-36, 53], [-26, 52], [-16, 53], [-6, 52],
    [4, 53], [14, 52], [24, 53], [34, 52], [44, 53],
    [-40, 59], [-20, 59], [0, 59], [20, 59], [40, 59],
    // north edge, past the kart track
    [-48, -57], [-36, -57], [-24, -58], [-12, -57], [0, -58],
    [12, -57], [24, -58], [36, -57], [46, -56],
    // east, behind the coast road
    [52, 40], [54, 50], [50, 30],
  ];
  const houseBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 2.2, 3.4), mats.block, HOUSES.length);
  const houseRoofs = new THREE.InstancedMesh(new THREE.ConeGeometry(2.5, 1.5, 4), mats.copingRed, HOUSES.length);
  HOUSES.forEach(([x, z], i) => {
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
  const ufakMi = ([x, z, g, d]) => g <= 3.2 && d <= 3.2 && !skateIcinde(x, z);
  const RENKLI = [...PLAN_BANKLAR, ...PLAN_SEMSIYELER, ...PLAN_HEYKELLER]
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
  colliders.push(...landmarkFootprints);
  for (const [dx, dz, w, d, h] of COURT_BLOCKS) {
    const x = COURT.x + dx;
    const z = COURT.z + dz;
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, topY: h });
  }
  for (const [x, z] of TOWERS) {
    colliders.push({ minX: x - 1.15, maxX: x + 1.15, minZ: z - 1.15, maxZ: z + 1.15, topY: 4.6 });
  }

  return {
    skatepark: Object.freeze({ minX: -15.5, maxX: 16.76, minZ: -49.21, maxZ: -20.34, topY: 0.44 }),
    stadiumPitch: Object.freeze({ x: 29.7, z: 0.3, rx: 8.5, rz: 14, topY: 0.21 }),
    blockCount: BLOCKS.length,
    colliders,
  };
}
