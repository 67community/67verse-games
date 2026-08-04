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
    concrete: material(0xc4beb4, { roughness: 0.62 }),
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
  const ROAD_W = 4.6;
  const V_ROADS = [-20, 16, 44, -51];          // x positions, z span -51..46
  const H_ROADS = [-19, 16, 46, -51];          // z positions, x span -51..44
  const vRoads = new THREE.InstancedMesh(new THREE.BoxGeometry(ROAD_W, 0.08, 100), mats.road, V_ROADS.length);
  V_ROADS.forEach((x, i) => {
    vRoads.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.04, -2.5));
  });
  vRoads.instanceMatrix.needsUpdate = true;
  vRoads.name = 'district:road-grid';
  add(vRoads, { walkable: true, camera: false, cast: false });
  const hRoads = new THREE.InstancedMesh(new THREE.BoxGeometry(98, 0.08, ROAD_W), mats.road, H_ROADS.length);
  H_ROADS.forEach((z, i) => {
    hRoads.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-3.5, 0.04, z));
  });
  hRoads.instanceMatrix.needsUpdate = true;
  hRoads.name = 'district:cross-roads';
  add(hRoads, { camera: false, cast: false });

  // Kerb edge strips: the light lip both sides of every road.
  const kerbCount = (V_ROADS.length + H_ROADS.length) * 2;
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.1, 100), mats.kerbLight, kerbCount);
  let kerbIndex = 0;
  const kerbM = new THREE.Matrix4();
  for (const x of V_ROADS) {
    for (const side of [-1, 1]) {
      kerbM.identity();
      kerbM.setPosition(x + side * (ROAD_W / 2 + 0.25), 0.05, -2.5);
      kerbs.setMatrixAt(kerbIndex, kerbM);
      kerbIndex += 1;
    }
  }
  for (const z of H_ROADS) {
    for (const side of [-1, 1]) {
      kerbM.makeRotationY(Math.PI / 2);
      kerbM.setPosition(-3.5, 0.05, z + side * (ROAD_W / 2 + 0.25));
      kerbs.setMatrixAt(kerbIndex, kerbM);
      kerbIndex += 1;
    }
  }
  kerbs.instanceMatrix.needsUpdate = true;
  add(kerbs, { camera: false, cast: false });

  // Dashed center lines along every road.
  const dashPositions = [];
  for (const x of V_ROADS) {
    for (let z = -49; z <= 44; z += 4.4) dashPositions.push([x, z, 0]);
  }
  for (const z of H_ROADS) {
    for (let x = -49; x <= 42; x += 4.4) dashPositions.push([x, z, Math.PI / 2]);
  }
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.02, 1.9), mats.paint, dashPositions.length);
  dashPositions.forEach(([x, z, rot], i) => {
    const m = new THREE.Matrix4().makeRotationY(rot);
    m.setPosition(x, 0.1, z);
    dashes.setMatrixAt(i, m);
  });
  dashes.instanceMatrix.needsUpdate = true;
  dashes.name = 'district:lane-dashes';
  add(dashes, { camera: false, cast: false });

  // Crosswalks at every internal junction.
  const junctions = [];
  for (const x of [-20, 16]) for (const z of [-19, 16, 46]) junctions.push([x, z]);
  junctions.push([-20, -51], [16, -51], [44, -19], [44, 16], [-51, -19], [-51, 16]);
  const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.02, 3.4), mats.paint, junctions.length * 10);
  let stripeIndex = 0;
  const stripeM = new THREE.Matrix4();
  junctions.forEach(([cx, cz]) => {
    for (let s = 0; s < 5; s += 1) {
      const offset = (s - 2) * 1.0;
      stripeM.identity();
      stripeM.setPosition(cx + offset, 0.1, cz + ROAD_W / 2 + 2.1);
      stripes.setMatrixAt(stripeIndex, stripeM);
      stripeIndex += 1;
      stripeM.makeRotationY(Math.PI / 2);
      stripeM.setPosition(cx + ROAD_W / 2 + 2.1, 0.1, cz + offset);
      stripes.setMatrixAt(stripeIndex, stripeM);
      stripeIndex += 1;
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
  const V = Math.PI / 2;
  const PARKED = [
    // gym parking lot rows (reference top-left)
    [-46, -44, 0], [-43, -44, 0], [-40, -44, 0], [-37, -44, 0],
    [-46, -40.5, 0], [-43, -40.5, 0], [-40, -40.5, 0], [-37, -40.5, 0],
    // kerbs along the north-south boulevards
    [-17.2, -34, 0], [-17.2, -22, 0], [-17.2, -6, 0], [-17.2, 4, 0], [-17.2, 26, 0],
    [-22.8, -12, 0], [-22.8, 12, 0], [-22.8, 34, 0],
    [13.2, -30, 0], [13.2, -8, 0], [13.2, 12, 0], [13.2, 34, 0],
    [18.8, -20, 0], [18.8, 6, 0], [18.8, 30, 0],
    [41.2, -8, 0], [46.8, 22, 0], [-48.2, -6, 0], [-53.8, 24, 0],
    // kerbs along the east-west streets
    [-38, -16.2, V], [-30, -16.2, V], [-8, -16.2, V], [6, -16.2, V], [26, -16.2, V],
    [-34, -21.8, V], [-14, -21.8, V], [10, -21.8, V], [34, -21.8, V],
    [-40, 18.8, V], [-24, 18.8, V], [4, 18.8, V], [22, 18.8, V], [38, 18.8, V],
    [-30, 13.2, V], [-6, 13.2, V], [18, 13.2, V], [30, 13.2, V],
    [-20, 48.8, V], [8, 48.8, V], [30, 48.8, V], [-40, 43.2, V], [16, 43.2, V],
  ];
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
  for (let i = 0; i < CAR_N; i += 1) carBodies.setColorAt(i, new THREE.Color(CAR_PAINT[i % CAR_PAINT.length]));
  if (carBodies.instanceColor) carBodies.instanceColor.needsUpdate = true;
  carBodies.name = 'district:street-cars';
  add(carBodies, { camera: false, cast: true });
  add(carCabins, { camera: false, cast: false });
  add(carWheels, { camera: false, cast: false });
  // Traffic on every avenue of the grid, both directions: six run the
  // north-south roads and four run the east-west streets, each in its own
  // lane and offset along the road so they never travel as a convoy.
  const ROUTES = [
    { axis: 'z', road: -20, dir: 1 }, { axis: 'z', road: -20, dir: -1 },
    { axis: 'z', road: 16, dir: 1 }, { axis: 'z', road: 16, dir: -1 },
    { axis: 'z', road: 44, dir: 1 }, { axis: 'z', road: -51, dir: -1 },
    { axis: 'x', road: -19, dir: 1 }, { axis: 'x', road: -19, dir: -1 },
    { axis: 'x', road: 16, dir: 1 }, { axis: 'x', road: 46, dir: -1 },
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
  // N CENTER — the 67 skatepark, moved whole into its reference cell
  // (x -17..16, z -48..-21). Geometry untouched: same slab, bowl, flow
  // line, stair sets and corner quarters, rotated to the cell's aspect.
  // -------------------------------------------------------------------
  const skate = new THREE.Group();
  skate.name = 'district:skatepark';
  const skAdd = (mesh, opts = {}) => {
    skate.add(mesh);
    if (opts.cast) mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const slab = new THREE.Mesh(new THREE.BoxGeometry(32, 0.44, 26), mats.concrete);
  slab.position.set(0, 0.22, 0);
  slab.name = 'district:skatepark-slab';
  skAdd(slab);
  const bowl = new THREE.Group();
  bowl.name = 'district:skatepark-bowl';
  const rim = copingArc(mats.copingRed, 4.6, 0.18, Math.PI * 2);
  rim.scale.set(1.25, 1, 1);
  rim.position.y = 0.5;
  bowl.add(rim);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 3.4, 0.3, 24), mats.concreteDeep);
  basin.scale.x = 1.25;
  basin.position.y = 0.3;
  bowl.add(basin);
  const bowlLabel = flatLabel('67', 3);
  if (bowlLabel) {
    bowlLabel.position.y = 0.47;
    bowl.add(bowlLabel);
  }
  bowl.position.set(-9, 0.22, -6);
  skate.add(bowl);
  const flowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-12, 0.62, 9), new THREE.Vector3(-5, 0.62, 4),
    new THREE.Vector3(-9, 0.62, -1), new THREE.Vector3(-2, 0.62, -5),
    new THREE.Vector3(4, 0.62, 1), new THREE.Vector3(10, 0.62, -3),
  ]);
  const flow = new THREE.Mesh(new THREE.TubeGeometry(flowCurve, 48, 0.16, 8), mats.copingBlue);
  flow.name = 'district:skatepark-flow';
  skAdd(flow);
  for (const [sx, sz, rot] of [[8, 8, 0], [10, -9, Math.PI / 6]]) {
    const stairs = new THREE.Group();
    for (let step = 0; step < 4; step += 1) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.7), mats.concreteDeep);
      tread.position.set(0, 0.11 + step * 0.22, step * 0.7);
      stairs.add(tread);
    }
    for (const railX of [-1.5, 1.5]) {
      const railMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 8), mats.rail);
      railMesh.rotation.x = Math.atan2(0.88, 2.8);
      railMesh.position.set(railX, 1, 1.05);
      stairs.add(railMesh);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), railX < 0 ? mats.copingBlue : mats.copingYellow);
      cap.position.set(railX, 0.65, -0.2);
      stairs.add(cap);
    }
    stairs.position.set(sx, 0.44, sz);
    stairs.rotation.y = rot;
    stairs.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    skate.add(stairs);
  }
  const neQuarter = copingArc(mats.copingBlue, 3.4, 0.16, Math.PI / 2);
  neQuarter.position.set(13, 0.66, 10);
  neQuarter.rotation.z = Math.PI;
  skAdd(neQuarter);
  const seQuarter = copingArc(mats.copingRed, 3.4, 0.16, Math.PI / 2);
  seQuarter.position.set(13, 0.66, -10);
  seQuarter.rotation.z = Math.PI / 2;
  skAdd(seQuarter);
  skate.position.set(-0.5, 0, -34.5);
  group.add(skate);

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

  const oval = copingArc(mats.trackRed, 6, 1.5, Math.PI * 2);
  oval.scale.set(1.3, 1, 0.05);
  oval.position.set(-38, 0.1, -28);
  oval.name = 'district:athletics-track';
  add(oval, { camera: false, cast: false });
  const infield = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.08, 20), mats.pitch);
  infield.scale.x = 1.3;
  infield.position.set(-38, 0.08, -28);
  add(infield, { walkable: true, camera: false, cast: false });

  const fan = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.08, 14, 1, false, 0, Math.PI / 2), mats.sand);
  fan.position.set(-25, 0.08, -27);
  fan.rotation.y = Math.PI * 0.78;
  fan.name = 'district:baseball';
  add(fan, { camera: false, cast: false });

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
  ferris.position.set(25, 6.4, -42);
  for (const legX of [24.2, 25.8]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 6.6, 8), mats.rail);
    leg.position.set(legX, 3.3, -42);
    leg.rotation.z = legX < 25 ? 0.12 : -0.12;
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

  const carousel = new THREE.Group();
  carousel.name = 'district:carousel';
  const carBase = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.5, 14), mats.white);
  carBase.position.y = 0.25;
  carousel.add(carBase);
  const carRoof = new THREE.Mesh(new THREE.ConeGeometry(3, 1.6, 14), mats.copingRed);
  carRoof.position.y = 3.4;
  carousel.add(carRoof);
  const carPole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.8, 8), mats.rail);
  carPole.position.y = 1.8;
  carousel.add(carPole);
  carousel.position.set(33, 0, -33);
  carousel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(carousel);

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
  tent.position.set(38, 1.3, -36);
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
  lighthouse.position.set(55, 0, -16);
  lighthouse.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(lighthouse);

  const docks = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 0.24, 1.3), mats.wood, 4);
  [[52, -30], [52, -34], [52, -38], [52, -42]].forEach(([x, z], i) => {
    docks.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.2, z));
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
  const stand = copingArc(mats.blockDark, 8.6, 1.4, Math.PI * 2);
  stand.scale.set(1.2, 1, 0.5);
  stand.position.y = 0.7;
  stadium.add(stand);
  const pitch = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.1, 22), mats.pitch);
  pitch.scale.x = 1.2;
  pitch.position.y = 0.06;
  pitch.name = 'district:stadium-pitch';
  stadium.add(pitch);
  const pitchLabel = flatLabel('67', 6);
  if (pitchLabel) {
    pitchLabel.position.y = 0.13;
    stadium.add(pitchLabel);
  }
  stadium.position.set(31, 0, -1);
  stadium.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  group.add(stadium);

  // -------------------------------------------------------------------
  // WEST + SOUTH CELLS — dense blocks, the basketball court, the market
  // -------------------------------------------------------------------
  const BLOCKS = [
    // middle-left dense quarter
    [-28, -12, 5, 3.2, 6], [-38, -14, 4, 2.6, 5], [-46, -10, 5, 3.6, 6],
    [-27, 10, 4, 2.4, 5], [-36, 12, 5, 3, 7], [-45, 8, 4, 2.2, 4],
    [-46, 0, 4, 4.2, 5], [-27, -2, 4, 2.8, 5],
    // bottom-left quarter
    [-45, 24, 5, 3, 6], [-36, 28, 4, 2.4, 5], [-27, 24, 4, 3.4, 5],
    [-45, 36, 4, 2.8, 5], [-34, 38, 5, 2.2, 5], [-25, 36, 4, 2.6, 4],
    // bottom-center around the market
    [-12, 24, 4, 3, 5], [8, 24, 4, 2.6, 5], [-12, 40, 4, 2.4, 5], [8, 40, 4, 3.2, 5],
    // top-right small pair by the funfair entrance
    [20, -14, 4, 2.4, 4], [38, 8, 4, 2.6, 5],
  ];
  // Blocks carry the reference building's actual anatomy, read off a 4x crop
  // of the map: a soft squircle body on a wider plinth, a raised lip framing
  // the roof, an L-shaped recess inside that lip, and a striped awning at the
  // street face. Five instanced meshes cover every block in the city.
  const blockGeo = roundedBoxGeometry(1, 1, 1, 0.16);
  const blockBodies = new THREE.InstancedMesh(blockGeo, mats.white, BLOCKS.length);
  const blockPlinths = new THREE.InstancedMesh(roundedBoxGeometry(1, 1, 1, 0.22), mats.concrete, BLOCKS.length);
  const blockLips = new THREE.InstancedMesh(roundedBoxGeometry(1, 1, 1, 0.16), mats.white, BLOCKS.length);
  const blockNotchLong = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.blockDark, BLOCKS.length);
  const blockNotchShort = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.blockDark, BLOCKS.length);
  const awnings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 0.55), mats.white, BLOCKS.length);
  // Glazing, in the building's own language: a cream surround with the glass
  // set into it, mullions so it reads as a door rather than a mirror, and an
  // upper window band in the same glass the gym roof uses.
  const doorFrames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.white, BLOCKS.length);
  const doorGlass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.glass, BLOCKS.length);
  const doorMullions = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.white, BLOCKS.length * 2);
  const windowBands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.glass, BLOCKS.length);
  const AWNING_TONE = [COPING.red, COPING.blue, 0xd7cfc2];
  const bm = new THREE.Matrix4();
  BLOCKS.forEach(([x, z, w, h, d], i) => {
    bm.makeScale(w, h, d);
    bm.setPosition(x, h / 2, z);
    blockBodies.setMatrixAt(i, bm);
    blockBodies.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0xb9aaa5 : 0xc9bcb8));
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
    blockNotchLong.setMatrixAt(i, bm);
    bm.makeScale(0.16, 0.07, d * 0.34);
    bm.setPosition(x - w * 0.36, h + 0.15, z - d * 0.06);
    blockNotchShort.setMatrixAt(i, bm);
    // Awning across the street face.
    bm.makeScale(w * 0.62, 1, 1);
    bm.setPosition(x, 0.62, z + d / 2 + 0.2);
    awnings.setMatrixAt(i, bm);
    awnings.setColorAt(i, new THREE.Color(AWNING_TONE[i % AWNING_TONE.length]));
    // Glazed shopfront under the awning.
    bm.makeScale(w * 0.46, 1.9, 0.14);
    bm.setPosition(x, 0.95, z + d / 2 + 0.03);
    doorFrames.setMatrixAt(i, bm);
    bm.makeScale(w * 0.38, 1.6, 0.1);
    bm.setPosition(x, 0.9, z + d / 2 + 0.12);
    doorGlass.setMatrixAt(i, bm);
    bm.makeScale(0.09, 1.6, 0.08);
    bm.setPosition(x - w * 0.1, 0.9, z + d / 2 + 0.16);
    doorMullions.setMatrixAt(i * 2, bm);
    bm.setPosition(x + w * 0.1, 0.9, z + d / 2 + 0.16);
    doorMullions.setMatrixAt(i * 2 + 1, bm);
    // Upper-floor window band.
    bm.makeScale(w * 0.66, 0.55, 0.09);
    bm.setPosition(x, h * 0.66, z + d / 2 + 0.06);
    windowBands.setMatrixAt(i, bm);
  });
  for (const mesh of [
    blockBodies, blockPlinths, blockLips, blockNotchLong, blockNotchShort,
    awnings, doorFrames, doorGlass, doorMullions, windowBands,
  ]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  blockBodies.name = 'district:blocks';
  add(blockBodies, { camera: true, cast: true });
  add(blockPlinths, { camera: false, cast: false });
  add(blockLips, { camera: false, cast: true });
  add(blockNotchLong, { camera: false, cast: false });
  add(blockNotchShort, { camera: false, cast: false });
  add(awnings, { camera: false, cast: true });
  doorGlass.name = 'district:block-glass';
  add(doorFrames, { camera: false, cast: false });
  add(doorGlass, { camera: false, cast: false });
  add(doorMullions, { camera: false, cast: false });
  add(windowBands, { camera: false, cast: false });

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
  const stallTables = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.8, 1.1), mats.wood, STALLS.length);
  const stallAwnings = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.12, 1.4), mats.white, STALLS.length);
  const AWNING = [COPING.red, COPING.blue, COPING.yellow];
  STALLS.forEach(([x, z], i) => {
    stallTables.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.4, z));
    stallAwnings.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.5, z));
    stallAwnings.setColorAt(i, new THREE.Color(AWNING[i % 3]));
  });
  stallTables.instanceMatrix.needsUpdate = true;
  stallAwnings.instanceMatrix.needsUpdate = true;
  if (stallAwnings.instanceColor) stallAwnings.instanceColor.needsUpdate = true;
  add(stallTables, { camera: false, cast: true });
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
  const TREES = [
    // pond-park groves
    [40, 21, 1.15], [42, 23.5, 0.9], [38.5, 24, 1], [43.5, 40, 1.1], [41, 42, 0.95],
    [21, 22, 1.05], [19.5, 24.5, 0.85], [20, 41, 1.1], [22.5, 43, 0.9],
    [31, 45.5, 1], [34, 44, 0.85], [45, 31, 1.05], [44.5, 34.5, 0.9],
    // suburb + coast belts
    [-56, -44, 1], [-57, -20, 1.1], [-58, 2, 0.95], [-57, 22, 1.05], [-56, 40, 1],
    [-14, 52, 1], [2, 53, 1.1], [18, 52, 0.95], [34, 50, 1.05],
    [48, -20, 0.9], [46, 10, 0.95], [-46, 50, 1], [-30, 55, 0.9],
  ];
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
  // A bridge wherever a street meets the water, as the reference has.
  const BRIDGES = [
    [-54, -19, 0], [-54, 16, 0], [-53, -44, 0], [-52, 38, 0],
    [-30, 54.5, 0.35], [-6, 56, 0.1], [16, 55, -0.1],
  ];
  const bridges = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 0.4, 2.6), mats.wood, BRIDGES.length);
  BRIDGES.forEach(([x, z, rot], i) => {
    const m = new THREE.Matrix4().makeRotationY(rot);
    m.setPosition(x, 0.36, z);
    bridges.setMatrixAt(i, m);
  });
  bridges.instanceMatrix.needsUpdate = true;
  bridges.name = 'district:river-bridges';
  add(bridges, { camera: false, cast: false });

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
    skatepark: Object.freeze({ minX: -16.5, maxX: 15.5, minZ: -47.5, maxZ: -21.5, topY: 0.44 }),
    stadiumPitch: Object.freeze({ x: 31, z: -1, rx: 8.9, rz: 7.4, topY: 0.11 }),
    blockCount: BLOCKS.length,
    colliders,
  };
}
