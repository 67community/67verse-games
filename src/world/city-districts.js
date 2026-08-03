// city-districts.js — the island city around the promenade (reference: the
// circular town plan Oscar supplied on 2026-08-04).
//
// East: the cream-concrete skatepark with the 67 bowl, a flow line, stair
// sets with rails and corner quarters (his second reference image, applied to
// the right side of the park). West: building blocks with a basketball court.
// South: the market square with its tower. South-east: the pond park. Edge:
// four piers off the boardwalk ring. Everything is primitive-authored in the
// avenue's own material language; no traffic anywhere by explicit order.
import * as THREE from 'three';

const COPING = Object.freeze({ red: 0xe0745e, blue: 0x5a80d6, yellow: 0xf6c445 });

function copingArc(material, radius, tube, arc) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 24, arc), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function buildCityDistricts({ group, add, material }) {
  const mats = {
    concrete: material(0xefe9df, { roughness: 0.62 }),
    concreteDeep: material(0xe2dbce, { roughness: 0.7 }),
    block: material(0xf1ece1, { roughness: 0.7 }),
    blockDark: material(0xded5c4, { roughness: 0.75 }),
    court: material(0x6fae72, { roughness: 0.9 }),
    grass: material(0x8fca6a, { roughness: 0.95 }),
    water: material(0x6fc0e8, { roughness: 0.2, transparent: true, opacity: 0.85 }),
    wood: material(0xb9854f, { flatShading: true, roughness: 1 }),
    rail: material(0x8a8f98, { roughness: 0.35, metalness: 0.4 }),
    copingRed: material(COPING.red, { roughness: 0.35 }),
    copingBlue: material(COPING.blue, { roughness: 0.35 }),
    copingYellow: material(COPING.yellow, { roughness: 0.35 }),
  };

  // -------------------------------------------------------------------
  // EAST — the 67 skatepark (x 17..41, z -16..16)
  // -------------------------------------------------------------------
  const parkC = { x: 29, z: 0 };
  const slab = new THREE.Mesh(new THREE.BoxGeometry(24, 0.44, 32), mats.concrete);
  slab.position.set(parkC.x, 0.22, parkC.z);
  slab.name = 'district:skatepark-slab';
  add(slab, { walkable: true, camera: false, cast: false });

  // 67 bowl: oval rim with red coping, sunken-toned inset, painted 67.
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
  // Painted 67 in the bowl. The hub is also built headlessly by the
  // scene-attribution tests (no document there) — the label is presentation
  // only, so it simply stays off in that environment.
  if (typeof document !== 'undefined') {
    const label = document.createElement('canvas');
    label.width = 128; label.height = 128;
    const lc = label.getContext('2d');
    lc.fillStyle = '#ffffff';
    lc.font = '800 64px Figtree, Arial';
    lc.textAlign = 'center';
    lc.textBaseline = 'middle';
    lc.fillText('67', 64, 68);
    const labelTex = new THREE.CanvasTexture(label);
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false }),
    );
    labelMesh.rotation.x = -Math.PI / 2;
    labelMesh.position.y = 0.47;
    bowl.add(labelMesh);
  }
  bowl.position.set(parkC.x - 6, 0.22, parkC.z - 9);
  bowl.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  group.add(bowl);

  // Flow line: one blue S-curve coping snake across the middle of the slab.
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

  // Two stair sets with rails (blue posts, yellow caps), facing the slab.
  for (const [sx, sz, rot] of [[parkC.x + 6, parkC.z + 9, 0], [parkC.x + 7, parkC.z - 11, Math.PI / 6]]) {
    const stairs = new THREE.Group();
    for (let step = 0; step < 4; step += 1) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.7), mats.concreteDeep);
      tread.position.set(0, 0.11 + step * 0.22, step * 0.7);
      stairs.add(tread);
    }
    for (const railX of [-1.5, 1.5]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 8), mats.rail);
      rail.rotation.x = Math.atan2(0.88, 2.8);
      rail.position.set(railX, 1, 1.05);
      stairs.add(rail);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), railX < 0 ? mats.copingBlue : mats.copingYellow);
      cap.position.set(railX, 0.65, -0.2);
      stairs.add(cap);
    }
    stairs.position.set(sx, 0.44, sz);
    stairs.rotation.y = rot;
    stairs.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(stairs);
  }

  // Corner quarters: two coping arcs hugging the slab corners.
  const neQuarter = copingArc(mats.copingBlue, 3.4, 0.16, Math.PI / 2);
  neQuarter.position.set(parkC.x + 9, 0.66, parkC.z + 13);
  neQuarter.rotation.z = Math.PI;
  add(neQuarter, { camera: false, cast: false });
  const seQuarter = copingArc(mats.copingRed, 3.4, 0.16, Math.PI / 2);
  seQuarter.position.set(parkC.x + 9, 0.66, parkC.z - 13);
  seQuarter.rotation.z = Math.PI / 2;
  add(seQuarter, { camera: false, cast: false });

  // -------------------------------------------------------------------
  // WEST — building blocks and the basketball court (x -40..-17)
  // -------------------------------------------------------------------
  const BLOCKS = [
    [-22, -14, 5, 3.2, 6], [-29, -12, 4, 2.6, 5], [-36, -8, 5, 3.6, 6],
    [-21, 12.5, 4, 2.4, 5], [-28, 15, 5, 3, 7], [-35, 10, 4, 2.2, 4],
    [-23, 2, 4, 4.2, 5], [-36, 1, 4, 2.8, 5],
  ];
  BLOCKS.forEach(([x, z, w, h, d], i) => {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      i % 3 === 0 ? mats.blockDark : mats.block,
    );
    body.position.set(x, h / 2, z);
    body.name = `district:block-${i}`;
    add(body, { camera: true, cast: true });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.5, d * 0.6), mats.concreteDeep);
    cap.position.set(x, h + 0.25, z);
    add(cap, { camera: false, cast: false });
  });
  const court = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 11), mats.court);
  court.position.set(-29, 0.06, 2);
  court.name = 'district:basketball-court';
  add(court, { walkable: true, camera: false, cast: false });
  for (const hz of [-2.8, 6.8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), mats.rail);
    pole.position.set(-29, 1.3, hz);
    add(pole, { camera: false, cast: true });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), mats.block);
    board.position.set(-29, 2.5, hz + (hz < 2 ? 0.12 : -0.12));
    add(board, { camera: false, cast: false });
  }

  // -------------------------------------------------------------------
  // SOUTH — market square with the tower (around 0, 41 is out of bounds;
  // the square sits just past the plaza at z 38)
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
  STALLS.forEach(([x, z], i) => {
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.1), mats.wood);
    table.position.set(x, 0.4, z);
    add(table, { camera: false, cast: true });
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.12, 1.4),
      [mats.copingRed, mats.copingBlue, mats.copingYellow][i % 3],
    );
    awning.position.set(x, 1.5, z);
    add(awning, { camera: false, cast: false });
  });

  // -------------------------------------------------------------------
  // SOUTH-EAST — pond park (kidney pond, trees)
  // -------------------------------------------------------------------
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.1, 22), mats.grass);
  lawn.position.set(24, 0.05, 28);
  lawn.name = 'district:pond-lawn';
  add(lawn, { walkable: true, camera: false, cast: false });
  const pondShape = new THREE.Shape();
  pondShape.absellipse(0, 0, 3.4, 2.3, 0, Math.PI * 2);
  const pond = new THREE.Mesh(new THREE.ShapeGeometry(pondShape, 24), mats.water);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(24.5, 0.14, 27);
  pond.name = 'district:pond';
  add(pond, { camera: false, cast: false });
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 6);
  const crownGeo = new THREE.SphereGeometry(0.9, 10, 8);
  const crownMat = material(0x67a854, { roughness: 0.95, flatShading: true });
  const TREES = [[18.5, 24], [20, 31.5], [28.5, 32.5], [30.5, 25.5], [27, 22.5], [21, 21.5]];
  for (const [x, z] of TREES) {
    const trunk = new THREE.Mesh(trunkGeo, mats.wood);
    trunk.position.set(x, 0.55, z);
    add(trunk, { camera: false, cast: true });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 1.6, z);
    add(crown, { camera: false, cast: true });
  }

  // -------------------------------------------------------------------
  // EDGE — four piers off the boardwalk ring (N/E/S/W), decorative
  // -------------------------------------------------------------------
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 6.5), mats.wood);
    pier.position.set(Math.cos(angle) * 46.5, 0.3, Math.sin(angle) * 46.5);
    pier.rotation.y = -angle + Math.PI / 2;
    pier.name = 'district:pier';
    add(pier, { camera: false, cast: false });
  }

  return {
    skatepark: Object.freeze({ minX: 17, maxX: 41, minZ: -16, maxZ: 16, topY: 0.44 }),
    blockCount: BLOCKS.length,
  };
}
