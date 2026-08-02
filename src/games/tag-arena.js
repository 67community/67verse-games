// tag-arena.js - authored presentation and pure layout contract for Tag.
//
// Gameplay remains in tag.js. This module owns only the Switchyard Court
// visual identity and the conservative AABBs used by the existing player sim.

export const TAG_ARENA_HALF = 13;
export const TAG_ARENA_IDENTITY = Object.freeze({
  id: 'switchyard-court',
  name: 'Switchyard Court',
  landmark: 'Broken Loop Bell',
  materialLanguage: 'matte civic ceramic with restrained glazed caps',
});

export const TAG_ARENA_OBSTACLES = Object.freeze([
  Object.freeze({
    id: 'moss-turn',
    x: -5.9, z: -5.1, width: 3.5, height: 1.25, depth: 1.55,
    color: 0x37c5f0, capColor: 0xa8e4fa,
  }),
  Object.freeze({
    id: 'amber-switch',
    x: 5.9, z: -4.0, width: 1.65, height: 1.3, depth: 3.5,
    color: 0xff9f43, capColor: 0xffd19a,
  }),
  Object.freeze({
    id: 'indigo-cut',
    x: 0, z: 1.85, width: 3.7, height: 0.84, depth: 1.12,
    color: 0x2b3a67, capColor: 0x8d9cc9,
  }),
  Object.freeze({
    id: 'sage-pocket',
    x: -5.05, z: 6.25, width: 1.55, height: 1.05, depth: 1.55,
    color: 0x7ed957, capColor: 0xc0f0a5,
  }),
  Object.freeze({
    id: 'blue-dash',
    x: 6.2, z: 5.8, width: 2.55, height: 1.3, depth: 1.4,
    color: 0xf95d9b, capColor: 0xfcb3d3,
  }),
]);

export const TAG_ARENA_ROUTES = Object.freeze([
  Object.freeze({
    id: 'left-cut',
    points: Object.freeze([
      Object.freeze([0, 8]),
      Object.freeze([-3.25, 6]),
      Object.freeze([-3, 2.8]),
      Object.freeze([-3.1, 0]),
      Object.freeze([-2.7, -3]),
      Object.freeze([0, -8.2]),
    ]),
  }),
  Object.freeze({
    id: 'right-cut',
    points: Object.freeze([
      Object.freeze([0, 8]),
      Object.freeze([3.25, 6.1]),
      Object.freeze([3, 2.8]),
      Object.freeze([3.35, 0]),
      Object.freeze([2.7, -7.2]),
      Object.freeze([0, -8.2]),
    ]),
  }),
]);

const COLLISION_INSET = 0.12;
const ROUTE_CLEARANCE = 0.62;

export function tagArenaObstacleBounds(obstacle, padding = 0) {
  const halfWidth = Math.max(0.05, obstacle.width / 2 - COLLISION_INSET) + padding;
  const halfDepth = Math.max(0.05, obstacle.depth / 2 - COLLISION_INSET) + padding;
  return Object.freeze({
    minX: obstacle.x - halfWidth,
    maxX: obstacle.x + halfWidth,
    minZ: obstacle.z - halfDepth,
    maxZ: obstacle.z + halfDepth,
  });
}

function pointInBounds([x, z], bounds) {
  return x > bounds.minX && x < bounds.maxX
    && z > bounds.minZ && z < bounds.maxZ;
}

function segmentSamples(start, end, spacing = 0.2) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const count = Math.max(1, Math.ceil(length / spacing));
  return Array.from({ length: count + 1 }, (_, index) => {
    const amount = index / count;
    return [
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount,
    ];
  });
}

export function validateTagArenaLayout({
  obstacles = TAG_ARENA_OBSTACLES,
  routes = TAG_ARENA_ROUTES,
  arenaHalf = TAG_ARENA_HALF,
} = {}) {
  const failures = [];
  const ids = new Set();
  for (const obstacle of obstacles) {
    if (!obstacle?.id || ids.has(obstacle.id)) {
      failures.push(`obstacle id must be unique: ${obstacle?.id || 'missing'}`);
    }
    ids.add(obstacle?.id);
    if (
      ![obstacle.x, obstacle.z, obstacle.width, obstacle.height, obstacle.depth]
        .every(Number.isFinite)
      || obstacle.width <= 0
      || obstacle.height <= 0
      || obstacle.depth <= 0
    ) {
      failures.push(`${obstacle.id}: dimensions must be finite and positive`);
      continue;
    }
    const bounds = tagArenaObstacleBounds(obstacle);
    if (
      bounds.minX < -arenaHalf + 0.7
      || bounds.maxX > arenaHalf - 0.7
      || bounds.minZ < -arenaHalf + 0.7
      || bounds.maxZ > arenaHalf - 0.7
    ) {
      failures.push(`${obstacle.id}: collision exceeds the safe court inset`);
    }
    if (pointInBounds([0, 8], tagArenaObstacleBounds(obstacle, 1))) {
      failures.push(`${obstacle.id}: blocks the player spawn envelope`);
    }
  }

  for (const route of routes) {
    if (!route?.id || !Array.isArray(route.points) || route.points.length < 2) {
      failures.push(`${route?.id || 'route'}: needs at least two points`);
      continue;
    }
    for (let index = 1; index < route.points.length; index++) {
      for (const point of segmentSamples(route.points[index - 1], route.points[index])) {
        if (
          Math.abs(point[0]) > arenaHalf - ROUTE_CLEARANCE
          || Math.abs(point[1]) > arenaHalf - ROUTE_CLEARANCE
        ) {
          failures.push(`${route.id}: exits the playable chase envelope`);
          break;
        }
        const blocked = obstacles.find((obstacle) => (
          pointInBounds(point, tagArenaObstacleBounds(obstacle, ROUTE_CLEARANCE))
        ));
        if (blocked) {
          failures.push(`${route.id}: loses runner clearance at ${blocked.id}`);
          break;
        }
      }
    }
  }
  return Object.freeze(failures);
}

function roundedSlabGeometry(T, width, depth, height, radius = 0.42) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const corner = Math.min(radius, halfWidth - 0.02, halfDepth - 0.02);
  const shape = new T.Shape();
  shape.moveTo(-halfWidth + corner, -halfDepth);
  shape.lineTo(halfWidth - corner, -halfDepth);
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + corner);
  shape.lineTo(halfWidth, halfDepth - corner);
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - corner, halfDepth);
  shape.lineTo(-halfWidth + corner, halfDepth);
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - corner);
  shape.lineTo(-halfWidth, -halfDepth + corner);
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + corner, -halfDepth);
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    curveSegments: 3,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.1, height * 0.12),
    bevelThickness: Math.min(0.1, height * 0.12),
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function ceramicMaterial(T, color, {
  roughness = 0.68,
  metalness = 0,
  emissive = 0x000000,
  emissiveIntensity = 0,
} = {}) {
  return new T.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

export function buildTagArena(T, { highDetail = true } = {}) {
  const root = new T.Group();
  root.name = 'tag-arena:switchyard-court';
  root.userData.perfGroup = 'tag-arena';
  root.userData.tagArenaIdentity = TAG_ARENA_IDENTITY.id;
  const resources = new Set();
  const walkables = [];
  const own = (resource) => {
    resources.add(resource);
    return resource;
  };
  const addMesh = (geometry, material, {
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    castShadow = false,
    receiveShadow = false,
  } = {}) => {
    const mesh = new T.Mesh(own(geometry), own(material));
    mesh.position.fromArray(position);
    mesh.rotation.fromArray(rotation);
    mesh.scale.fromArray(scale);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    root.add(mesh);
    return mesh;
  };

  const ground = addMesh(
    roundedSlabGeometry(T, TAG_ARENA_HALF * 2 + 2, TAG_ARENA_HALF * 2 + 2, 0.46, 1.65),
    ceramicMaterial(T, 0xa9e2f5, { roughness: 0.5 }),
    { position: [0, -0.52, 0], receiveShadow: true },
  );
  ground.name = 'tag-arena:courtyard-floor';

  const centerCourt = new T.Mesh(
    own(new T.CircleGeometry(5.12, 64)),
    own(new T.MeshStandardMaterial({
      color: 0xeee6d8,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })),
  );
  centerCourt.name = 'tag-arena:center-court';
  centerCourt.rotation.x = -Math.PI / 2;
  centerCourt.position.y = 0.006;
  centerCourt.receiveShadow = true;
  root.add(centerCourt);

  const inlayMaterial = own(new T.MeshBasicMaterial({
    color: 0x6f958c,
    transparent: true,
    opacity: 0.42,
    side: T.DoubleSide,
    depthWrite: false,
  }));
  const outerInlay = new T.Mesh(
    own(new T.RingGeometry(9.75, 10.08, 64)),
    inlayMaterial,
  );
  outerInlay.rotation.x = -Math.PI / 2;
  outerInlay.position.y = 0.018;
  root.add(outerInlay);
  const innerInlay = new T.Mesh(
    own(new T.RingGeometry(4.75, 5.02, 48)),
    inlayMaterial,
  );
  innerInlay.rotation.x = -Math.PI / 2;
  innerInlay.position.y = 0.019;
  root.add(innerInlay);
  const routeAxis = addMesh(
    new T.BoxGeometry(0.1, 0.008, 18.5),
    ceramicMaterial(T, 0xc89c4d, { roughness: 0.72 }),
    { position: [0, 0.012, -0.1] },
  );
  routeAxis.name = 'tag-arena:exchange-line';

  const parapetGeometry = own(new T.CapsuleGeometry(0.42, 1.64, 2, 4));
  const parapetMaterial = own(ceramicMaterial(T, 0xf95d9b, { roughness: 0.42 }));
  const modulesPerSide = 10;
  const parapet = new T.InstancedMesh(
    parapetGeometry,
    parapetMaterial,
    modulesPerSide * 4,
  );
  parapet.name = 'tag-arena:ceramic-parapet';
  const dummy = new T.Object3D();
  const edge = TAG_ARENA_HALF + 0.54;
  let instanceIndex = 0;
  for (let index = 0; index < modulesPerSide; index++) {
    const offset = -11.7 + index * 2.6;
    for (const [x, z, rz, rx] of [
      [offset, -edge, Math.PI / 2, 0],
      [offset, edge, Math.PI / 2, 0],
      [-edge, offset, 0, Math.PI / 2],
      [edge, offset, 0, Math.PI / 2],
    ]) {
      dummy.position.set(x, 0.48, z);
      dummy.rotation.set(rx, 0, rz);
      dummy.updateMatrix();
      parapet.setMatrixAt(instanceIndex++, dummy.matrix);
    }
  }
  parapet.castShadow = highDetail;
  parapet.receiveShadow = true;
  root.add(parapet);

  const pylonGeometry = own(new T.CylinderGeometry(0.34, 0.48, 1.35, 8));
  const pylonMaterial = own(ceramicMaterial(T, 0xff9f43, { roughness: 0.46 }));
  const pylons = new T.InstancedMesh(pylonGeometry, pylonMaterial, 4);
  pylons.name = 'tag-arena:corner-pylons';
  const pylonPositions = [
    [-edge, -edge], [edge, -edge], [-edge, edge], [edge, edge],
  ];
  pylonPositions.forEach(([x, z], index) => {
    dummy.position.set(x, 0.68, z);
    dummy.rotation.set(0, Math.PI / 8, 0);
    dummy.updateMatrix();
    pylons.setMatrixAt(index, dummy.matrix);
  });
  pylons.castShadow = highDetail;
  root.add(pylons);

  for (const obstacle of TAG_ARENA_OBSTACLES) {
    const base = addMesh(
      roundedSlabGeometry(
        T,
        obstacle.width,
        obstacle.depth,
        obstacle.height,
        Math.min(0.48, obstacle.depth * 0.32),
      ),
      ceramicMaterial(T, obstacle.color, { roughness: 0.58 }),
      {
        position: [obstacle.x, 0, obstacle.z],
        castShadow: true,
        receiveShadow: true,
      },
    );
    base.name = `tag-arena:chase-island:${obstacle.id}`;
    base.userData.box2 = tagArenaObstacleBounds(obstacle);
    base.userData.tagObstacleId = obstacle.id;
    walkables.push(base);

    const cap = addMesh(
      roundedSlabGeometry(
        T,
        obstacle.width - 0.16,
        obstacle.depth - 0.16,
        0.12,
        Math.min(0.4, obstacle.depth * 0.26),
      ),
      ceramicMaterial(T, obstacle.capColor, { roughness: 0.38 }),
      {
        position: [obstacle.x, obstacle.height - 0.02, obstacle.z],
        castShadow: false,
        receiveShadow: true,
      },
    );
    cap.name = `tag-arena:glazed-cap:${obstacle.id}`;
  }

  const landmark = new T.Group();
  landmark.name = 'tag-arena:broken-loop-bell';
  landmark.position.set(0, 0, -15.25);
  root.add(landmark);
  const landmarkClay = own(ceramicMaterial(T, 0xf95d9b, { roughness: 0.4 }));
  const landmarkTeal = own(ceramicMaterial(T, 0x17b8a6, { roughness: 0.36 }));
  const landmarkGold = own(ceramicMaterial(T, 0xd5a443, {
    roughness: 0.34,
    metalness: 0.12,
    emissive: 0x6b3b0f,
    emissiveIntensity: 0.05,
  }));
  const plinth = new T.Mesh(
    own(roundedSlabGeometry(T, 6.65, 1.55, 0.68, 0.48)),
    landmarkClay,
  );
  plinth.position.y = 0;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  landmark.add(plinth);
  const pillarGeometry = own(new T.CylinderGeometry(0.3, 0.48, 2.3, 8));
  for (const x of [-1.9, 1.9]) {
    const pillar = new T.Mesh(pillarGeometry, landmarkClay);
    pillar.position.set(x, 1.68, 0);
    pillar.castShadow = true;
    landmark.add(pillar);
  }
  const leftArc = new T.Mesh(
    own(new T.TorusGeometry(1.78, 0.26, 8, 32, Math.PI * 0.78)),
    landmarkTeal,
  );
  leftArc.position.y = 3.05;
  leftArc.rotation.z = Math.PI * 0.11;
  leftArc.castShadow = true;
  landmark.add(leftArc);
  const rightArc = new T.Mesh(
    own(new T.TorusGeometry(1.78, 0.26, 8, 32, Math.PI * 0.78)),
    landmarkClay,
  );
  rightArc.position.y = 3.05;
  rightArc.rotation.z = Math.PI * 1.11;
  rightArc.castShadow = true;
  landmark.add(rightArc);
  const bell = new T.Mesh(
    own(new T.OctahedronGeometry(0.64, 0)),
    landmarkGold,
  );
  bell.name = 'tag-arena:exchange-bell';
  bell.position.set(0, 3.05, 0.08);
  bell.scale.set(0.78, 1.05, 0.44);
  bell.castShadow = true;
  landmark.add(bell);

  const skylineGeometry = own(new T.CylinderGeometry(0.68, 0.96, 1, 6));
  const horizon = addMesh(
    new T.PlaneGeometry(64, 32),
    ceramicMaterial(T, 0xa9e0b8, { roughness: 0.9 }),
    {
      position: [0, -0.42, -24],
      rotation: [-Math.PI / 2, 0, 0],
      receiveShadow: false,
    },
  );
  horizon.name = 'tag-arena:distant-terrace';

  // The distant terrace is a floating landmass too: one tapered cliff skirt
  // under the flat top (single draw), so its rim reads as rock, not a sheet.
  const horizonSkirt = addMesh(
    new T.CylinderGeometry(1, 0.86, 1.55, 4),
    ceramicMaterial(T, 0x7d6853, { roughness: 0.97 }),
    { position: [0, -1.21, -24], receiveShadow: false },
  );
  horizonSkirt.rotation.y = Math.PI / 4;
  horizonSkirt.scale.set(32, 1, 16);
  horizonSkirt.name = 'tag-arena:terrace-cliff-skirt';

  const skylineMaterial = own(ceramicMaterial(T, 0x9db8d9, { roughness: 0.7 }));
  const skylinePositions = [
    [-19, -25, 3.4], [-16, -29, 5.2], [-12.8, -25.5, 4.1],
    [-9.2, -30, 6.1], [-5.8, -27, 3.5], [5.8, -27, 4.2],
    [9.2, -30, 5.8], [12.8, -25.5, 4.5], [16, -29, 5], [19, -25, 3.2],
    [-18, -17, 2.6], [18, -17, 2.8],
  ];
  const skyline = new T.InstancedMesh(
    skylineGeometry,
    skylineMaterial,
    highDetail ? 10 : 8,
  );
  skyline.name = 'tag-arena:ceramic-skyline';
  skyline.count = highDetail ? 10 : 8;
  skylinePositions.slice(0, skyline.count).forEach(([x, z, height], index) => {
    const width = 1 + (index % 2) * 0.35;
    dummy.position.set(x, height / 2 - 0.2, z);
    dummy.rotation.set(0, (index % 3) * Math.PI / 6, 0);
    dummy.scale.set(width, height, 1);
    dummy.updateMatrix();
    skyline.setMatrixAt(index, dummy.matrix);
  });
  root.add(skyline);

  const roofGeometry = own(new T.ConeGeometry(0.82, 0.62, 6));
  const roofMaterial = own(ceramicMaterial(T, 0x6b7fb3, { roughness: 0.6 }));
  const roofs = new T.InstancedMesh(roofGeometry, roofMaterial, skyline.count);
  roofs.name = 'tag-arena:ceramic-roofs';
  skylinePositions.slice(0, skyline.count).forEach(([x, z, height], index) => {
    const width = 1 + (index % 2) * 0.35;
    dummy.position.set(x, height + 0.02, z);
    dummy.rotation.set(0, (index % 3) * Math.PI / 6, 0);
    dummy.scale.set(width, 1, 1);
    dummy.updateMatrix();
    roofs.setMatrixAt(index, dummy.matrix);
  });
  root.add(roofs);

  const windowGeometry = own(new T.PlaneGeometry(0.3, 0.42));
  const windowMaterial = own(new T.MeshBasicMaterial({ color: 0xe6c879 }));
  const windows = new T.InstancedMesh(windowGeometry, windowMaterial, skyline.count * 2);
  windows.name = 'tag-arena:city-windows';
  let windowIndex = 0;
  skylinePositions.slice(0, skyline.count).forEach(([x, z, height]) => {
    for (const ratio of [0.42, 0.68]) {
      dummy.position.set(x, height * ratio, z + 0.97);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      windows.setMatrixAt(windowIndex++, dummy.matrix);
    }
  });
  root.add(windows);

  let disposed = false;
  return Object.freeze({
    root,
    walkables: Object.freeze(walkables),
    // Frozen copy of the authored skyline layout so an async Meshy building
    // swap can rebuild the same row without touching the placeholder meshes.
    skylineLayout: Object.freeze(
      skylinePositions.slice(0, skyline.count).map(([x, z, height], index) => Object.freeze({
        x, z, height, width: 1 + (index % 2) * 0.35,
      })),
    ),
    landmark,
    bell,
    inlayMaterial,
    setFinalChase(active, phase = 0) {
      inlayMaterial.color.setHex(active ? 0xb45d70 : 0x6f958c);
      inlayMaterial.opacity = active ? 0.56 + Math.sin(phase * 4) * 0.08 : 0.42;
      landmarkGold.emissiveIntensity = active
        ? 0.32 + Math.sin(phase * 5) * 0.12
        : 0.05;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const resource of resources) resource.dispose?.();
    },
  });
}
