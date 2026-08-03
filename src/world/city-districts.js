// city-districts.js — the 67 city around the promenade (reference: Oscar's
// full city plan, 2026-08-04, second richer render).
//
// Layout on the enlarged r=62 island, promenade running north-south at x=0:
//   NW  kart track, parking lot, solar-roof gym, athletics oval, baseball
//   N-E the 67 skatepark (UNTOUCHED by explicit order)
//   NE  funfair — ferris wheel (animated), carousel, roller coaster, big top
//   E   coast — sea, beach with umbrellas, lighthouse, marina with boats
//   SE  the 67 stadium (walkable pitch) and the playground pond park
//   S   market square with tower and awning stalls
//   W   building blocks with the basketball court
//   SW  river with bridges and suburb houses
// Cars exist as parked rows and a slow ring-road loop — the no-traffic order
// applied to the skatepark zone, and the reference city is visibly driven.
// Everything is primitive-authored; Meshy GLBs swap in per piece later using
// the same placeholder-then-model pattern the avenue shops use.
import * as THREE from 'three';

const COPING = Object.freeze({ red: 0xe0745e, blue: 0x5a80d6, yellow: 0xf6c445 });

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

export function buildCityDistricts({ group, add, material, animated }) {
  const mats = {
    concrete: material(0xefe9df, { roughness: 0.62 }),
    concreteDeep: material(0xe2dbce, { roughness: 0.7 }),
    block: material(0xf1ece1, { roughness: 0.7 }),
    blockDark: material(0xded5c4, { roughness: 0.75 }),
    court: material(0x6fae72, { roughness: 0.9 }),
    pitch: material(0x74b06a, { roughness: 0.92 }),
    trackRed: material(0xd98a80, { roughness: 0.9 }),
    grass: material(0x8fca6a, { roughness: 0.95 }),
    sand: material(0xe8d9ae, { roughness: 0.95 }),
    water: material(0x8fd0e8, { roughness: 0.25, transparent: true, opacity: 0.9 }),
    road: material(0xb9b4ab, { roughness: 0.95 }),
    wood: material(0xb9854f, { flatShading: true, roughness: 1 }),
    rail: material(0x8a8f98, { roughness: 0.35, metalness: 0.4 }),
    white: material(0xf7f4ec, { roughness: 0.6 }),
    copingRed: material(COPING.red, { roughness: 0.35 }),
    copingBlue: material(COPING.blue, { roughness: 0.35 }),
    copingYellow: material(COPING.yellow, { roughness: 0.35 }),
    pink: material(0xe89ab8, { roughness: 0.7 }),
    glass: material(0xcfe9f5, { roughness: 0.3, emissive: 0x88b8cc, emissiveIntensity: 0.25 }),
  };
  const CAR_PAINT = [0xe0745e, 0x5a80d6, 0xf6c445, 0x6fae72, 0xd8d3c8, 0xa78bda];

  // -------------------------------------------------------------------
  // EAST — the 67 skatepark (x 17..41, z -16..16). UNTOUCHED.
  // -------------------------------------------------------------------
  const parkC = { x: 29, z: 0 };
  const slab = new THREE.Mesh(new THREE.BoxGeometry(24, 0.44, 32), mats.concrete);
  slab.position.set(parkC.x, 0.22, parkC.z);
  slab.name = 'district:skatepark-slab';
  add(slab, { walkable: true, camera: false, cast: false });

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
  bowl.position.set(parkC.x - 6, 0.22, parkC.z - 9);
  bowl.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  group.add(bowl);

  const flowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(parkC.x - 9, 0.62, parkC.z + 12),
    new THREE.Vector3(parkC.x - 4, 0.62, parkC.z + 6),
    new THREE.Vector3(parkC.x - 8, 0.62, parkC.z + 0),
    new THREE.Vector3(parkC.x - 2, 0.62, parkC.z - 4),
    new THREE.Vector3(parkC.x + 3, 0.62, parkC.z + 2),
    new THREE.Vector3(parkC.x + 8, 0.62, parkC.z - 2),
  ]);
  const flow = new THREE.Mesh(new THREE.TubeGeometry(flowCurve, 48, 0.16, 8), mats.copingBlue);
  flow.name = 'district:skatepark-flow';
  add(flow, { camera: false, cast: false });

  for (const [sx, sz, rot] of [[parkC.x + 6, parkC.z + 9, 0], [parkC.x + 7, parkC.z - 11, Math.PI / 6]]) {
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
    group.add(stairs);
  }

  const neQuarter = copingArc(mats.copingBlue, 3.4, 0.16, Math.PI / 2);
  neQuarter.position.set(parkC.x + 9, 0.66, parkC.z + 13);
  neQuarter.rotation.z = Math.PI;
  add(neQuarter, { camera: false, cast: false });
  const seQuarter = copingArc(mats.copingRed, 3.4, 0.16, Math.PI / 2);
  seQuarter.position.set(parkC.x + 9, 0.66, parkC.z - 13);
  seQuarter.rotation.z = Math.PI / 2;
  add(seQuarter, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // NW — kart track, parking, gym, athletics, baseball
  // -------------------------------------------------------------------
  const kartCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-44, 0.1, -26), new THREE.Vector3(-36, 0.1, -22),
    new THREE.Vector3(-28, 0.1, -26), new THREE.Vector3(-26, 0.1, -34),
    new THREE.Vector3(-32, 0.1, -40), new THREE.Vector3(-42, 0.1, -40),
    new THREE.Vector3(-47, 0.1, -33),
  ], true);
  const kart = new THREE.Mesh(new THREE.TubeGeometry(kartCurve, 72, 1.6, 8), mats.road);
  kart.scale.y = 0.06;
  kart.position.y = 0.08;
  kart.name = 'district:kart-track';
  add(kart, { camera: false, cast: false });

  const gym = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 6.5), mats.block);
  gym.position.set(-19, 2, -31);
  gym.name = 'district:gym';
  add(gym, { camera: true, cast: true });
  const gymRoof = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.3, 4.5), mats.glass);
  gymRoof.position.set(-19, 4.15, -31);
  add(gymRoof, { camera: false, cast: false });

  // Parking rows by the gym: one instanced mesh, colored per car.
  const PARKED = [[-13.5, -38], [-11, -38], [-8.5, -38], [-13.5, -34.5], [-11, -34.5], [-8.5, -34.5]];
  const parkedCars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.6, 2.6), mats.white, PARKED.length);
  PARKED.forEach(([x, z], i) => {
    parkedCars.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.34, z));
    parkedCars.setColorAt(i, new THREE.Color(CAR_PAINT[i % CAR_PAINT.length]));
  });
  parkedCars.instanceMatrix.needsUpdate = true;
  if (parkedCars.instanceColor) parkedCars.instanceColor.needsUpdate = true;
  parkedCars.name = 'district:parked-cars';
  add(parkedCars, { camera: false, cast: true });

  // Athletics oval with a green infield.
  const oval = copingArc(mats.trackRed, 6.2, 1.5, Math.PI * 2);
  oval.scale.set(1.4, 1, 0.05);
  oval.position.set(-31, 0.1, -17);
  oval.name = 'district:athletics-track';
  add(oval, { camera: false, cast: false });
  const infield = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.08, 20), mats.pitch);
  infield.scale.x = 1.4;
  infield.position.set(-31, 0.08, -17);
  add(infield, { walkable: true, camera: false, cast: false });

  // Baseball diamond: sand fan + green outfield wedge.
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.08, 14, 1, false, 0, Math.PI / 2), mats.sand);
  fan.position.set(-13, 0.08, -24);
  fan.rotation.y = Math.PI * 0.78;
  fan.name = 'district:baseball';
  add(fan, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // NE — funfair: ferris wheel, carousel, roller coaster, big top
  // -------------------------------------------------------------------
  const ferris = new THREE.Group();
  ferris.name = 'district:ferris-wheel';
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.22, 10, 36), mats.copingYellow);
  ferris.add(wheelRing);
  const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 10.2, 0.16), mats.rail, 4);
  for (let i = 0; i < 4; i += 1) {
    const m = new THREE.Matrix4().makeRotationZ((i / 4) * Math.PI);
    spokes.setMatrixAt(i, m);
  }
  spokes.instanceMatrix.needsUpdate = true;
  ferris.add(spokes);
  const gondolas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), mats.white, 8);
  for (let i = 0; i < 8; i += 1) gondolas.setColorAt(i, new THREE.Color(CAR_PAINT[i % CAR_PAINT.length]));
  if (gondolas.instanceColor) gondolas.instanceColor.needsUpdate = true;
  ferris.add(gondolas);
  const wheelSpin = ferris;
  wheelSpin.position.set(19, 6.4, -35);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 6.6, 8), mats.rail);
  legL.position.set(18.2, 3.3, -35);
  legL.rotation.z = 0.12;
  add(legL, { camera: false, cast: true });
  const legR = legL.clone();
  legR.position.x = 19.8;
  legR.rotation.z = -0.12;
  add(legR, { camera: false, cast: true });
  group.add(ferris);
  // Gondolas ride the rim but hang level: their instance matrix cancels the
  // group spin (Rz(-t)) after placing them at the spun rim position, so the
  // combined transform is a pure world translation.
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
  carousel.position.set(29, 0, -28);
  carousel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(carousel);

  const coasterCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(36, 0.8, -24), new THREE.Vector3(40, 3.4, -28),
    new THREE.Vector3(43, 1.2, -33), new THREE.Vector3(40, 4.6, -38),
    new THREE.Vector3(35, 1.4, -41), new THREE.Vector3(33, 3.2, -34),
    new THREE.Vector3(33, 0.9, -28),
  ], true);
  const coaster = new THREE.Mesh(new THREE.TubeGeometry(coasterCurve, 96, 0.14, 8), mats.copingRed);
  coaster.name = 'district:roller-coaster';
  add(coaster, { camera: false, cast: true });
  const coasterPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), mats.rail, 6);
  [[40, -28, 3.4], [40, -38, 4.6], [35, -41, 1.4], [33, -34, 3.2], [43, -33, 1.2], [36, -24, 0.8]]
    .forEach(([x, z, h], i) => {
      const m = new THREE.Matrix4().makeScale(1, h, 1);
      m.setPosition(x, h / 2, z);
      coasterPosts.setMatrixAt(i, m);
    });
  coasterPosts.instanceMatrix.needsUpdate = true;
  add(coasterPosts, { camera: false, cast: false });

  const tent = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.6, 12), mats.copingRed);
  tent.position.set(24, 1.3, -42);
  tent.name = 'district:big-top';
  add(tent, { camera: false, cast: true });
  const tentFlag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mats.copingYellow);
  tentFlag.position.set(24, 2.8, -42);
  add(tentFlag, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // EAST COAST — sea, beach, lighthouse, marina
  // -------------------------------------------------------------------
  const sea = new THREE.Mesh(new THREE.BoxGeometry(26, 0.1, 96), mats.water);
  sea.position.set(60, 0.02, 0);
  sea.name = 'district:sea';
  add(sea, { camera: false, cast: false });
  const beach = new THREE.Mesh(new THREE.BoxGeometry(7, 0.14, 34), mats.sand);
  beach.position.set(45.5, 0.07, 8);
  beach.name = 'district:beach';
  add(beach, { walkable: true, camera: false, cast: false });
  const umbrellas = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 0.5, 10), mats.copingRed, 4);
  [[44.5, 1], [46.5, 6], [44.8, 12], [46.2, 18]].forEach(([x, z], i) => {
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
  lighthouse.position.set(46, 0, 26);
  lighthouse.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(lighthouse);

  const docks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.24, 7), mats.wood, 3);
  [[47, -20], [47, -26], [47, -32]].forEach(([x, z], i) => {
    docks.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.2, z));
  });
  docks.instanceMatrix.needsUpdate = true;
  docks.name = 'district:marina-docks';
  add(docks, { camera: false, cast: false });
  const boats = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.5, 2.6), mats.white, 5);
  [[49.2, -19], [49.2, -23.5], [49.2, -28], [49.2, -33], [51.5, -25]].forEach(([x, z], i) => {
    boats.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.3, z));
    boats.setColorAt(i, new THREE.Color(CAR_PAINT[(i + 1) % CAR_PAINT.length]));
  });
  boats.instanceMatrix.needsUpdate = true;
  if (boats.instanceColor) boats.instanceColor.needsUpdate = true;
  boats.name = 'district:marina-boats';
  add(boats, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // SE — the 67 stadium (walkable pitch) + playground pond park
  // -------------------------------------------------------------------
  const stadium = new THREE.Group();
  stadium.name = 'district:stadium';
  const stand = copingArc(mats.blockDark, 8.6, 1.4, Math.PI * 2);
  stand.scale.set(1.25, 1, 0.5);
  stand.position.y = 0.7;
  stadium.add(stand);
  const pitch = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.1, 22), mats.pitch);
  pitch.scale.x = 1.25;
  pitch.position.y = 0.06;
  pitch.name = 'district:stadium-pitch';
  stadium.add(pitch);
  const pitchLabel = flatLabel('67', 6);
  if (pitchLabel) {
    pitchLabel.position.y = 0.13;
    stadium.add(pitchLabel);
  }
  stadium.position.set(31, 0, 33);
  stadium.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  group.add(stadium);

  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.1, 20), mats.grass);
  lawn.position.set(13, 0.05, 43);
  lawn.name = 'district:pond-lawn';
  add(lawn, { walkable: true, camera: false, cast: false });
  const pondShape = new THREE.Shape();
  pondShape.absellipse(0, 0, 3, 2, 0, Math.PI * 2);
  const pond = new THREE.Mesh(new THREE.ShapeGeometry(pondShape, 24), mats.water);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(14.5, 0.14, 42);
  pond.name = 'district:pond';
  add(pond, { camera: false, cast: false });
  // Teddy statue: the playground's landmark.
  const teddy = new THREE.Group();
  teddy.name = 'district:teddy';
  const tBody = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), mats.pink);
  tBody.position.y = 1;
  teddy.add(tBody);
  const tHead = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), mats.pink);
  tHead.position.y = 2.3;
  teddy.add(tHead);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mats.pink);
    ear.position.set(side * 0.55, 2.85, 0);
    teddy.add(ear);
  }
  teddy.position.set(10, 0, 40);
  teddy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(teddy);
  const TREES = [[8, 46], [12, 48], [18, 46.5], [19, 39], [7, 37]];
  const crownMat = material(0x67a854, { roughness: 0.95, flatShading: true });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 6), mats.wood, TREES.length);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 10, 8), crownMat, TREES.length);
  TREES.forEach(([x, z], i) => {
    trunks.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.55, z));
    crowns.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.6, z));
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  add(trunks, { camera: false, cast: true });
  add(crowns, { camera: false, cast: true });

  // -------------------------------------------------------------------
  // WEST — building blocks and the basketball court
  // -------------------------------------------------------------------
  const BLOCKS = [
    [-22, -8, 5, 3.2, 6], [-29, -6, 4, 2.6, 5], [-36, -2, 5, 3.6, 6],
    [-21, 12.5, 4, 2.4, 5], [-28, 15, 5, 3, 7], [-35, 10, 4, 2.2, 4],
    [-23, 2, 4, 4.2, 5], [-36, 4, 4, 2.8, 5], [-42, 14, 5, 3, 6], [-44, 4, 4, 2.4, 5],
  ];
  // One instanced draw for the whole quarter; scale carries each block's size
  // and instance color carries the two-tone facade rhythm.
  const blockBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.white, BLOCKS.length);
  BLOCKS.forEach(([x, z, w, h, d], i) => {
    const m = new THREE.Matrix4().makeScale(w, h, d);
    m.setPosition(x, h / 2, z);
    blockBodies.setMatrixAt(i, m);
    blockBodies.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0xded5c4 : 0xf1ece1));
  });
  blockBodies.instanceMatrix.needsUpdate = true;
  if (blockBodies.instanceColor) blockBodies.instanceColor.needsUpdate = true;
  blockBodies.name = 'district:blocks';
  add(blockBodies, { camera: true, cast: true });
  const court = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 11), mats.court);
  court.position.set(-29, 0.06, 2);
  court.name = 'district:basketball-court';
  add(court, { walkable: true, camera: false, cast: false });
  const hoopPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), mats.rail, 2);
  const hoopBoards = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), mats.block, 2);
  [-2.8, 6.8].forEach((hz, i) => {
    hoopPoles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-29, 1.3, hz));
    hoopBoards.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-29, 2.5, hz + (hz < 2 ? 0.12 : -0.12)));
  });
  hoopPoles.instanceMatrix.needsUpdate = true;
  hoopBoards.instanceMatrix.needsUpdate = true;
  add(hoopPoles, { camera: false, cast: true });
  add(hoopBoards, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // SOUTH — market square with the tower
  // -------------------------------------------------------------------
  const marketGround = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.12, 20), mats.concreteDeep);
  marketGround.position.set(-16, 0.06, 34);
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
  tower.position.set(-16, 0, 34);
  tower.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  tower.name = 'district:market-tower';
  group.add(tower);
  const STALLS = [[-20.5, 31], [-18, 38.5], [-12, 37.5], [-11.5, 31.5], [-16, 29]];
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
  // SW — river, bridges, suburb houses
  // -------------------------------------------------------------------
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-52, 0.05, -46), new THREE.Vector3(-47, 0.05, -28),
    new THREE.Vector3(-50, 0.05, -8), new THREE.Vector3(-46, 0.05, 14),
    new THREE.Vector3(-50, 0.05, 32), new THREE.Vector3(-44, 0.05, 50),
  ]);
  const river = new THREE.Mesh(new THREE.TubeGeometry(riverCurve, 64, 2.2, 6), mats.water);
  river.scale.y = 0.03;
  river.position.y = 0.04;
  river.name = 'district:river';
  add(river, { camera: false, cast: false });
  const bridges = new THREE.InstancedMesh(new THREE.BoxGeometry(6.5, 0.4, 2.4), mats.wood, 2);
  [[-48.5, -18, 0.25], [-47.5, 24, -0.2]].forEach(([x, z, rot], i) => {
    const m = new THREE.Matrix4().makeRotationY(rot);
    m.setPosition(x, 0.36, z);
    bridges.setMatrixAt(i, m);
  });
  bridges.instanceMatrix.needsUpdate = true;
  bridges.name = 'district:river-bridges';
  add(bridges, { camera: false, cast: false });
  const houseBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 2.2, 3.4), mats.block, 6);
  const houseRoofs = new THREE.InstancedMesh(new THREE.ConeGeometry(2.5, 1.5, 4), mats.copingRed, 6);
  [[-56, -30], [-57, -16], [-56, 0], [-55, 16], [-54, 30], [-51, 42]].forEach(([x, z], i) => {
    houseBodies.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.1, z));
    const rm = new THREE.Matrix4().makeRotationY(Math.PI / 4);
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
  // RING ROAD — a driven loop around the city with slow traffic
  // -------------------------------------------------------------------
  const ringRoad = copingArc(mats.road, 52, 2.2, Math.PI * 2);
  ringRoad.scale.z = 0.03;
  ringRoad.position.y = 0.06;
  ringRoad.name = 'district:ring-road';
  add(ringRoad, { camera: false, cast: false });
  const ringCars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.6, 2.7), mats.white, 5);
  for (let i = 0; i < 5; i += 1) ringCars.setColorAt(i, new THREE.Color(CAR_PAINT[i % CAR_PAINT.length]));
  if (ringCars.instanceColor) ringCars.instanceColor.needsUpdate = true;
  ringCars.name = 'district:ring-cars';
  add(ringCars, { camera: false, cast: true });
  animated?.push((time) => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < 5; i += 1) {
      const angle = time * 0.06 + (i / 5) * Math.PI * 2;
      e.set(0, -angle, 0);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(Math.cos(angle) * 52, 0.36, Math.sin(angle) * 52),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      ringCars.setMatrixAt(i, m);
    }
    ringCars.instanceMatrix.needsUpdate = true;
  });

  // -------------------------------------------------------------------
  // EDGE — four piers off the island edge
  // -------------------------------------------------------------------
  const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.4, 6.5), mats.wood, 4);
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((angle, i) => {
    const m = new THREE.Matrix4().makeRotationY(-angle + Math.PI / 2);
    m.setPosition(Math.cos(angle) * 64.5, 0.3, Math.sin(angle) * 64.5);
    piers.setMatrixAt(i, m);
  });
  piers.instanceMatrix.needsUpdate = true;
  piers.name = 'district:pier';
  add(piers, { camera: false, cast: false });

  return {
    skatepark: Object.freeze({ minX: 17, maxX: 41, minZ: -16, maxZ: 16, topY: 0.44 }),
    stadiumPitch: Object.freeze({ x: 31, z: 33, rx: 9.25, rz: 7.4, topY: 0.11 }),
    blockCount: BLOCKS.length,
  };
}
