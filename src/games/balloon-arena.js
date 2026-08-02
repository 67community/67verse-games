// Presentation-only arena for Balloon Battle.
// Simulation bounds and combat rules remain owned by balloon.js.

export const BALLOON_ARENA_HALF = 15;

export const BALLOON_ARENA_IDENTITY = Object.freeze({
  id: 'ribbonwind-garden',
  name: 'Ribbonwind Garden',
  landmark: 'Aeolian Crown',
  intent: 'An open wind garden where taut kite-glass and ribbon inlays make motion readable.',
  assetLanguage: Object.freeze([
    'celadon terraces',
    'white rounded spars',
    'translucent kite-glass',
    'coral wind ribbons',
  ]),
});

export const BALLOON_ROLE_COLORS = Object.freeze({
  floor: 0x5fd0e8,
  court: 0xf9c6e2,
  boundary: 0xf8f1dd,
  balloon: 0xf05b68,
  pickup: 0xffcf52,
  dash: 0xffffff,
  shield: 0x48b9d6,
  finalGust: 0xff6f61,
});

function roundedRectShape(T, width, depth, radius) {
  const x = width / 2;
  const z = depth / 2;
  const r = Math.min(radius, x, z);
  const shape = new T.Shape();
  shape.moveTo(-x + r, -z);
  shape.lineTo(x - r, -z);
  shape.quadraticCurveTo(x, -z, x, -z + r);
  shape.lineTo(x, z - r);
  shape.quadraticCurveTo(x, z, x - r, z);
  shape.lineTo(-x + r, z);
  shape.quadraticCurveTo(-x, z, -x, z - r);
  shape.lineTo(-x, -z + r);
  shape.quadraticCurveTo(-x, -z, -x + r, -z);
  return shape;
}

function setInstance(marker, mesh, index, {
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1,
}) {
  marker.position.set(x, y, z);
  marker.rotation.set(rx, ry, rz);
  marker.scale.set(sx, sy, sz);
  marker.updateMatrix();
  mesh.setMatrixAt(index, marker.matrix);
}

function createWindRibbonGeometry(T) {
  const positions = [];
  const normals = [];
  const indices = [];
  const segments = 12;
  const inner = 7.25;
  const outer = 7.78;
  for (let ribbon = 0; ribbon < 4; ribbon++) {
    const start = ribbon * (Math.PI / 2) + 0.2;
    const offset = positions.length / 3;
    for (let segment = 0; segment <= segments; segment++) {
      const angle = start + (segment / segments) * 0.95;
      for (const radius of [inner, outer]) {
        positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        normals.push(0, 1, 0);
      }
    }
    for (let segment = 0; segment < segments; segment++) {
      const a = offset + segment * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function validateBalloonArenaIdentity({
  identity = BALLOON_ARENA_IDENTITY,
  colors = BALLOON_ROLE_COLORS,
} = {}) {
  const issues = [];
  if (identity.assetLanguage?.length !== 4) {
    issues.push('arena must use one four-part reusable asset language');
  }
  if (new Set(Object.values(colors)).size !== Object.keys(colors).length) {
    issues.push('gameplay role colors must remain distinct');
  }
  if (identity.id !== 'ribbonwind-garden' || identity.landmark !== 'Aeolian Crown') {
    issues.push('authored arena identity or landmark is missing');
  }
  return issues;
}

export function buildBalloonArena(T, { highDetail = false } = {}) {
  const root = new T.Group();
  root.name = 'Ribbonwind Garden';
  root.userData.perfGroup = 'balloon-arena';
  const resources = new Set();
  const marker = new T.Object3D();
  const cameraColliders = [];

  const geometry = (value) => {
    resources.add(value);
    return value;
  };
  const material = (value) => {
    resources.add(value);
    return value;
  };
  const standard = (color, roughness = 0.72, options = {}) => material(
    new T.MeshStandardMaterial({ color, roughness, ...options }),
  );

  // Layer 1: a softly rounded terrace preserves the exact flat simulation.
  const terraceGeometry = geometry(new T.ExtrudeGeometry(
    roundedRectShape(T, 32, 32, 2.8),
    {
      depth: 0.42,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.18,
      bevelThickness: 0.14,
      curveSegments: 3,
    },
  ));
  terraceGeometry.rotateX(-Math.PI / 2);
  const terrace = new T.Mesh(terraceGeometry, standard(BALLOON_ROLE_COLORS.floor, 0.82));
  terrace.position.y = -0.48;
  terrace.receiveShadow = true;
  root.add(terrace);

  // Layer 2: an open cream court and inlaid wind routes.
  const court = new T.Mesh(
    geometry(new T.CylinderGeometry(11.8, 12.15, 0.08, 32)),
    standard(BALLOON_ROLE_COLORS.court, 0.88),
  );
  court.position.y = 0.075;
  court.receiveShadow = true;
  root.add(court);

  const ribbonMaterial = material(new T.MeshBasicMaterial({
    color: 0xff806f,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: T.DoubleSide,
  }));
  const ribbonGeometry = geometry(createWindRibbonGeometry(T));
  const floorRibbons = new T.Mesh(ribbonGeometry, ribbonMaterial);
  floorRibbons.position.y = 0.18;
  root.add(floorRibbons);

  // The Wind Dial is a low, combat-safe escalation signal.
  const gustDialMaterial = standard(0x4d92a2, 0.48, {
    emissive: 0x4d92a2,
    emissiveIntensity: 0.08,
    transparent: true,
    opacity: 0.46,
  });
  const gustDial = new T.Group();
  gustDial.name = 'Wind Dial';
  gustDial.userData.perfGroup = 'balloon-arena';
  gustDial.position.y = 0.09;
  const gustTicks = new T.InstancedMesh(
    geometry(new T.ConeGeometry(0.2, 0.72, 4)),
    gustDialMaterial,
    12,
  );
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2;
    setInstance(marker, gustTicks, index, {
      x: Math.sin(angle) * 3.55,
      z: Math.cos(angle) * 3.55,
      rx: Math.PI / 2,
      ry: -angle,
      sx: 1,
      sy: 0.32,
      sz: 1,
    });
  }
  gustTicks.instanceMatrix.needsUpdate = true;
  gustDial.add(gustTicks);
  root.add(gustDial);

  // Rounded spars form a low open silhouette instead of a box fence.
  const sparMaterial = standard(BALLOON_ROLE_COLORS.boundary, 0.68);
  const structuralGeometry = geometry(new T.CapsuleGeometry(0.13, 1, 3, 8));
  const postPositions = [];
  for (const side of [-1, 1]) {
    for (const offset of [-12, -7, 7, 12]) {
      postPositions.push([offset, side * 16.05], [side * 16.05, offset]);
    }
  }
  const islandPositions = [
    [-22, -12], [22, -12], [-23, 7], [23, 7], [-13, 22], [13, 22],
  ];
  const structuralTransforms = [
    { x: 0, z: -16.12, y: 0.38, rz: Math.PI / 2, sy: 23.5 },
    { x: 0, z: 16.12, y: 0.38, rz: Math.PI / 2, sy: 23.5 },
    { x: -16.12, z: 0, y: 0.38, rx: Math.PI / 2, sy: 23.5 },
    { x: 16.12, z: 0, y: 0.38, rx: Math.PI / 2, sy: 23.5 },
    ...postPositions.map(([x, z]) => ({ x, y: 1.35, z, sy: 2.05 })),
    ...islandPositions.map(([x, z]) => ({ x, y: 1.05, z, sx: 1.1, sy: 1.75, sz: 1.1 })),
    { x: -3.8, y: 1.35, z: -20.4, sx: 1.7, sy: 2.55, sz: 1.7 },
    { x: 3.8, y: 1.35, z: -20.4, sx: 1.7, sy: 2.55, sz: 1.7 },
    ...Array.from({ length: 5 }, (_, index) => ({
      x: (index - 2) * 0.82,
      y: 1.85 - Math.abs(index - 2) * 0.13,
      z: -20.4,
      sx: 0.95,
      sy: 1.3,
      sz: 0.95,
    })),
  ];
  const structures = new T.InstancedMesh(
    structuralGeometry,
    sparMaterial,
    structuralTransforms.length,
  );
  structuralTransforms.forEach((transform, index) => {
    setInstance(marker, structures, index, transform);
  });
  structures.instanceMatrix.needsUpdate = true;
  structures.castShadow = true;
  structures.receiveShadow = true;
  root.add(structures);
  cameraColliders.push(structures);

  // Translucent kite-glass panels repeat at the arena corners. Their centers
  // stay below combatant balloons and their open gaps preserve mobile sightlines.
  const kiteGeometry = geometry(new T.PlaneGeometry(1, 1));
  const kiteMaterial = material(new T.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.56,
    side: T.DoubleSide,
    depthWrite: false,
  }));
  const kiteTransforms = [
    [-11.8, 1.75, -16.02, 0], [-7.3, 1.55, -16.02, 0],
    [7.3, 1.55, -16.02, 0], [11.8, 1.75, -16.02, 0],
    [-11.8, 1.75, 16.02, 0], [-7.3, 1.55, 16.02, 0],
    [7.3, 1.55, 16.02, 0], [11.8, 1.75, 16.02, 0],
    [-16.02, 1.75, -11.8, Math.PI / 2], [-16.02, 1.55, -7.3, Math.PI / 2],
    [-16.02, 1.55, 7.3, Math.PI / 2], [-16.02, 1.75, 11.8, Math.PI / 2],
    [16.02, 1.75, -11.8, Math.PI / 2], [16.02, 1.55, -7.3, Math.PI / 2],
    [16.02, 1.55, 7.3, Math.PI / 2], [16.02, 1.75, 11.8, Math.PI / 2],
  ];
  const canopyTransforms = highDetail
    ? islandPositions.map(([x, z], index) => ({
        x, y: 2.85, z, rx: -Math.PI / 2, rz: index * 0.8, sx: 3.7, sy: 2.1,
      }))
    : [];
  const kites = new T.InstancedMesh(
    kiteGeometry,
    kiteMaterial,
    kiteTransforms.length + canopyTransforms.length,
  );
  kiteTransforms.forEach(([x, y, z, ry], index) => {
    setInstance(marker, kites, index, {
      x, y, z, ry, rz: (index % 2 ? -1 : 1) * 0.18, sx: 3.35, sy: 1.5,
    });
    kites.setColorAt(index, new T.Color(index % 2 ? 0xff8d7a : 0x7dd4d0));
  });
  canopyTransforms.forEach((transform, canopyIndex) => {
    const index = kiteTransforms.length + canopyIndex;
    setInstance(marker, kites, index, transform);
    kites.setColorAt(index, new T.Color(0xffb36b));
  });
  kites.instanceMatrix.needsUpdate = true;
  if (kites.instanceColor) kites.instanceColor.needsUpdate = true;
  root.add(kites);

  // Far landmark: the Aeolian Crown is a single legible silhouette, placed
  // beyond the arena so it never blocks active play.
  const landmark = new T.Group();
  landmark.name = 'Aeolian Crown';
  landmark.position.set(0, 0, -20.4);
  landmark.userData.perfGroup = 'balloon-arena';
  const crownMaterial = standard(0xfbf6e8, 0.56);
  const crownArc = new T.Mesh(
    geometry(new T.TorusGeometry(3.8, 0.23, 8, 32, Math.PI)),
    crownMaterial,
  );
  crownArc.position.y = -0.95;
  landmark.add(crownArc);
  root.add(landmark);

  let finalActive = false;
  function updateFinalGust(active, time, dt = 0) {
    finalActive = Boolean(active);
    if (finalActive) {
      gustDial.rotation.y += dt * 0.9;
      const pulse = 0.88 + Math.sin(time * 5) * 0.1;
      gustDial.scale.setScalar(pulse);
      gustDialMaterial.color.setHex(BALLOON_ROLE_COLORS.finalGust);
      gustDialMaterial.emissive.setHex(BALLOON_ROLE_COLORS.finalGust);
      gustDialMaterial.emissiveIntensity = 0.46;
      gustDialMaterial.opacity = 0.86;
      crownMaterial.color.setHex(BALLOON_ROLE_COLORS.finalGust);
      crownMaterial.emissive.setHex(BALLOON_ROLE_COLORS.finalGust);
      crownMaterial.emissiveIntensity = 0.35;
    } else {
      gustDial.scale.setScalar(1);
      gustDialMaterial.color.setHex(0x4d92a2);
      gustDialMaterial.emissive.setHex(0x4d92a2);
      gustDialMaterial.emissiveIntensity = 0.08;
      gustDialMaterial.opacity = 0.46;
      crownMaterial.color.setHex(0xfbf6e8);
      crownMaterial.emissive.setHex(0x000000);
      crownMaterial.emissiveIntensity = 0;
    }
  }

  function dispose() {
    root.removeFromParent();
    for (const resource of resources) resource.dispose?.();
    resources.clear();
  }

  return {
    root,
    cameraColliders,
    gustDial,
    landmark,
    updateFinalGust,
    isFinalGustActive: () => finalActive,
    dispose,
  };
}
