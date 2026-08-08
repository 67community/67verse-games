// Presentation-only arena for Balloon Battle.
// Simulation bounds and combat rules remain owned by balloon.js.

export const BALLOON_ARENA_HALF = 15;

export const BALLOON_ARENA_IDENTITY = Object.freeze({
  id: 'ribbonwind-garden',
  name: 'Ribbonwind Garden',
  landmark: 'Aeolian Crown',
  intent: 'The toy arena off the balloon reference: cream rounded walls, teal soft blocks, one button in the middle of the ring.',
  assetLanguage: Object.freeze([
    'cream rounded walls',
    'teal soft blocks',
    'corner colour gates',
    'balloon posies',
  ]),
});

export const BALLOON_ROLE_COLORS = Object.freeze({
  floor: 0xf1ece2,     // cream terrace, from the reference
  court: 0x5fb3a4,     // teal inlay + blocks
  boundary: 0xf8f1dd,  // wall cream
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
  // Rebuilt to the balloon reference sheet: a cream octagonal court with a
  // teal inlay line, chunky rounded walls with a south gate, symmetric teal
  // soft blocks, an L-gate in each corner in its own colour, balloon posies
  // on teal planters, toy trees on the wall line, and the button podium in a
  // teal ring at the very centre. The Aeolian Crown is now the big cream
  // north gate the camera reads the final gust on.
  const root = new T.Group();
  root.name = 'Ribbonwind Garden';
  root.userData.perfGroup = 'balloon-arena';
  const resources = new Set();
  const marker = new T.Object3D();
  const cameraColliders = [];

  const geometry = (value) => { resources.add(value); return value; };
  const material = (value) => { resources.add(value); return value; };
  const standard = (color, roughness = 0.72, options = {}) => material(
    new T.MeshStandardMaterial({ color, roughness, ...options }),
  );

  // Shared unit squircle — every block, wall and gate scales this one geometry.
  const kutuGeo = geometry(new T.ExtrudeGeometry(
    roundedRectShape(T, 1, 1, 0.18),
    { depth: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.05, bevelThickness: 0.04, curveSegments: 2 },
  ));
  kutuGeo.rotateX(-Math.PI / 2);
  kutuGeo.translate(0, 0.5, 0);

  // Floor terrace.
  const terraceGeometry = geometry(new T.ExtrudeGeometry(
    roundedRectShape(T, 33, 33, 6.5),
    { depth: 0.42, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.2, bevelThickness: 0.16, curveSegments: 3 },
  ));
  terraceGeometry.rotateX(-Math.PI / 2);
  const terrace = new T.Mesh(terraceGeometry, standard(BALLOON_ROLE_COLORS.floor, 0.86));
  terrace.position.y = -0.44;
  terrace.receiveShadow = true;
  root.add(terrace);

  // Teal inlay line, a rounded-square stroke inset from the wall.
  const cizgi = new T.InstancedMesh(
    geometry(new T.BoxGeometry(1, 0.02, 0.16)),
    standard(BALLOON_ROLE_COLORS.court, 0.6),
    4,
  );
  [[0, -12.6, 0], [0, 12.6, 0], [-12.6, 0, Math.PI / 2], [12.6, 0, Math.PI / 2]]
    .forEach(([x, z, ry], index) => {
      setInstance(marker, cizgi, index, { x, y: 0.045, z, ry, sx: 21 });
    });
  cizgi.instanceMatrix.needsUpdate = true;
  root.add(cizgi);

  // Perimeter wall: straight runs, corner blocks, gate cheeks. One instanced
  // mesh, and the single camera collider.
  const duvarlar = new T.InstancedMesh(kutuGeo, standard(BALLOON_ROLE_COLORS.boundary, 0.8), 14);
  const duvarSeri = [
    { x: -4.4, z: -16, sx: 15.4, sz: 1.5, sy: 1.35 },          // north, gate split
    { x: 8.7, z: -16, sx: 6.8, sz: 1.5, sy: 1.35 },
    { x: 0, z: 16, sx: 23, sz: 1.5, sy: 1.1 },                 // south
    { x: -16, z: 0, sx: 1.5, sz: 23, sy: 1.1 },                // west
    { x: 16, z: 0, sx: 1.5, sz: 23, sy: 1.1 },                 // east
    { x: -14.6, z: -14.6, sx: 3.4, sz: 3.4, sy: 1.6 },         // corners
    { x: 14.6, z: -14.6, sx: 3.4, sz: 3.4, sy: 1.6 },
    { x: -14.6, z: 14.6, sx: 3.4, sz: 3.4, sy: 1.6 },
    { x: 14.6, z: 14.6, sx: 3.4, sz: 3.4, sy: 1.6 },
    { x: -3.2, z: 16.2, sx: 1.7, sz: 2.2, sy: 1.5 },           // south gate cheeks
    { x: 3.2, z: 16.2, sx: 1.7, sz: 2.2, sy: 1.5 },
    { x: 0, z: 16.6, sx: 4.6, sz: 1.4, sy: 0.28 },             // gate step
    { x: 2.2, z: -16.2, sx: 1.7, sz: 2.0, sy: 1.5 },           // north gate cheeks
    { x: -2.2 + 0, z: -16.2, sx: 1.7, sz: 2.0, sy: 1.5 },
  ];
  duvarSeri.forEach((k, index) => setInstance(marker, duvarlar, index, { y: 0, ...k }));
  duvarlar.instanceMatrix.needsUpdate = true;
  duvarlar.castShadow = true;
  duvarlar.receiveShadow = true;
  root.add(duvarlar);
  cameraColliders.push(duvarlar);

  // Teal soft blocks + the corner colour gates, tinted per instance.
  const bloklar = new T.InstancedMesh(kutuGeo, standard(0xffffff, 0.62), 26);
  const teal = '#5fb3a4';
  const mint = '#8fcabb';
  const blokSeri = [
    // angled long bars, mirrored
    { x: -7.2, z: -9.4, ry: 0.42, sx: 5.6, sz: 1.7, sy: 1.15, renk: teal },
    { x: 7.2, z: -9.4, ry: -0.42, sx: 5.6, sz: 1.7, sy: 1.15, renk: teal },
    { x: -7.6, z: 7.6, ry: -0.36, sx: 5.6, sz: 1.7, sy: 1.15, renk: teal },
    { x: 7.6, z: 7.6, ry: 0.36, sx: 5.6, sz: 1.7, sy: 1.15, renk: teal },
    // side slab pairs (a low slab with a smaller one on top)
    { x: -11.6, z: -6.4, sx: 3.4, sz: 2.3, sy: 0.75, renk: mint },
    { x: -11.2, z: -6.1, sx: 2.4, sz: 1.6, sy: 1.35, renk: mint },
    { x: 11.6, z: -6.4, sx: 3.4, sz: 2.3, sy: 0.75, renk: mint },
    { x: 11.2, z: -6.1, sx: 2.4, sz: 1.6, sy: 1.35, renk: mint },
    { x: -11.6, z: 5.6, sx: 3.4, sz: 2.3, sy: 0.75, renk: mint },
    { x: -11.2, z: 5.3, sx: 2.4, sz: 1.6, sy: 1.35, renk: mint },
    { x: 11.6, z: 5.6, sx: 3.4, sz: 2.3, sy: 0.75, renk: mint },
    { x: 11.2, z: 5.3, sx: 2.4, sz: 1.6, sy: 1.35, renk: mint },
    // short bars above and below the ring
    { x: 0, z: -6.6, sx: 3.4, sz: 1.2, sy: 0.85, renk: teal },
    { x: 0, z: 6.6, sx: 3.4, sz: 1.2, sy: 0.85, renk: teal },
    // ring guards, four curved-reading stubs
    { x: -4.6, z: -1.6, ry: 0.5, sx: 0.9, sz: 2.0, sy: 0.95, renk: teal },
    { x: 4.6, z: -1.6, ry: -0.5, sx: 0.9, sz: 2.0, sy: 0.95, renk: teal },
    { x: -4.6, z: 1.6, ry: -0.5, sx: 0.9, sz: 2.0, sy: 0.95, renk: teal },
    { x: 4.6, z: 1.6, ry: 0.5, sx: 0.9, sz: 2.0, sy: 0.95, renk: teal },
    // corner L gates: two pieces each — pink, yellow, blue, green
    { x: -11.4, z: -12.6, sx: 4.4, sz: 1.4, sy: 1.5, renk: '#e8a2a8' },
    { x: -13.0, z: -11.2, sx: 1.4, sz: 3.0, sy: 1.5, renk: '#e8a2a8' },
    { x: 11.4, z: -12.6, sx: 4.4, sz: 1.4, sy: 1.5, renk: '#eac36e' },
    { x: 13.0, z: -11.2, sx: 1.4, sz: 3.0, sy: 1.5, renk: '#eac36e' },
    { x: -11.4, z: 12.6, sx: 4.4, sz: 1.4, sy: 1.5, renk: '#8fb6d8' },
    { x: -13.0, z: 11.2, sx: 1.4, sz: 3.0, sy: 1.5, renk: '#8fb6d8' },
    { x: 11.4, z: 12.6, sx: 4.4, sz: 1.4, sy: 1.5, renk: '#93bd8a' },
    { x: 13.0, z: 11.2, sx: 1.4, sz: 3.0, sy: 1.5, renk: '#93bd8a' },
  ];
  blokSeri.forEach((k, index) => {
    setInstance(marker, bloklar, index, { y: 0, ...k });
    bloklar.setColorAt(index, new T.Color(k.renk));
  });
  bloklar.instanceMatrix.needsUpdate = true;
  if (bloklar.instanceColor) bloklar.instanceColor.needsUpdate = true;
  bloklar.castShadow = true;
  bloklar.receiveShadow = true;
  root.add(bloklar);

  // Colour pads on the inlay line: red north, green west, yellow east.
  const padlar = new T.InstancedMesh(
    geometry(new T.CylinderGeometry(1.35, 1.42, 0.09, 20)),
    standard(0xffffff, 0.55),
    3,
  );
  [[0, -12.6, '#e2766e'], [-12.6, 0, '#93bd8a'], [12.6, 0, '#eac36e']].forEach(([x, z, renk], index) => {
    setInstance(marker, padlar, index, { x, y: 0.07, z });
    padlar.setColorAt(index, new T.Color(renk));
  });
  padlar.instanceMatrix.needsUpdate = true;
  if (padlar.instanceColor) padlar.instanceColor.needsUpdate = true;
  root.add(padlar);

  // Centre: teal ring, podium, and the yellow button. This trio is the Wind
  // Dial the final gust lights up.
  const gustDial = new T.Group();
  gustDial.name = 'Wind Dial';
  gustDial.userData.perfGroup = 'balloon-arena';
  const halkaMat = standard(BALLOON_ROLE_COLORS.court, 0.5);
  const halka = new T.Mesh(geometry(new T.TorusGeometry(4.0, 0.16, 6, 22)), halkaMat);
  halka.rotation.x = Math.PI / 2;
  halka.position.y = 0.1;
  gustDial.add(halka);
  const podyumMat = standard(0x67aa9c, 0.6);
  const podyum = new T.Mesh(geometry(new T.CylinderGeometry(1.15, 1.3, 0.6, 20)), podyumMat);
  podyum.position.y = 0.3;
  gustDial.add(podyum);
  const dugmeMat = standard(0xeac36e, 0.45, { emissive: 0xeac36e, emissiveIntensity: 0.12 });
  const dugme = new T.Mesh(geometry(new T.CylinderGeometry(0.34, 0.4, 0.3, 14)), dugmeMat);
  dugme.position.y = 0.72;
  gustDial.add(dugme);
  root.add(gustDial);

  // Balloon posies: a teal planter with three balloons on sticks, six spots.
  const posyKok = [[-4.6, -6.9], [4.9, -7.6], [-6.4, 3.4], [6.6, 4.0], [-1.4, 10.7], [3.4, 10.4]];
  const saksilar = new T.InstancedMesh(
    geometry(new T.CylinderGeometry(0.34, 0.42, 0.62, 10)),
    standard(0x67aa9c, 0.7),
    posyKok.length,
  );
  posyKok.forEach(([x, z], index) => setInstance(marker, saksilar, index, { x, y: 0.31, z }));
  saksilar.instanceMatrix.needsUpdate = true;
  root.add(saksilar);
  const balonRenk = ['#e2766e', '#eac36e', '#93bd8a', '#c9a8dd'];
  const balonlar = new T.InstancedMesh(
    geometry(new T.SphereGeometry(0.34, 8, 6)),
    standard(0xffffff, 0.35),
    posyKok.length * 3,
  );
  const ipler = new T.InstancedMesh(
    geometry(new T.CylinderGeometry(0.016, 0.016, 1, 4)),
    standard(0xf6f1e7, 0.7),
    posyKok.length * 3,
  );
  posyKok.forEach(([x, z], p) => {
    for (let b = 0; b < 3; b += 1) {
      const index = p * 3 + b;
      const aci = (b / 3) * Math.PI * 2 + p;
      const bx = x + Math.cos(aci) * 0.3;
      const bz = z + Math.sin(aci) * 0.3;
      const by = 1.85 + (b % 2) * 0.3;
      setInstance(marker, balonlar, index, { x: bx, y: by, z: bz });
      balonlar.setColorAt(index, new T.Color(balonRenk[(p + b) % balonRenk.length]));
      setInstance(marker, ipler, index, { x: bx, y: (by + 0.62) / 2 - 0.31, z: bz, sy: by - 0.62 });
    }
  });
  balonlar.instanceMatrix.needsUpdate = true;
  if (balonlar.instanceColor) balonlar.instanceColor.needsUpdate = true;
  ipler.instanceMatrix.needsUpdate = true;
  root.add(balonlar);
  root.add(ipler);

  // Toy trees standing on the wall line.
  const agacKok = [[-14.6, -14.6], [14.6, -14.6], [-14.6, 14.6], [14.6, 14.6], [-8.6, -16], [12.6, 16]];
  const govdeler = new T.InstancedMesh(
    geometry(new T.CylinderGeometry(0.16, 0.2, 0.6, 7)),
    standard(0x8a6a4f, 0.85),
    agacKok.length,
  );
  const taclar = new T.InstancedMesh(
    geometry(new T.SphereGeometry(0.8, 8, 6)),
    standard(0x7b9e6a, 0.85, { flatShading: true }),
    agacKok.length,
  );
  agacKok.forEach(([x, z], index) => {
    setInstance(marker, govdeler, index, { x, y: 2.3, z });
    setInstance(marker, taclar, index, { x, y: 3.1, z, sy: 0.85 });
  });
  govdeler.instanceMatrix.needsUpdate = true;
  taclar.instanceMatrix.needsUpdate = true;
  root.add(govdeler);
  root.add(taclar);

  // Far landmark: the Aeolian Crown, now the big cream north gate — two
  // rounded towers and a beam with a coral cap, wide and tall enough to read
  // from anywhere on the court.
  const landmark = new T.Group();
  landmark.name = 'Aeolian Crown';
  landmark.position.set(0, 0, -20.4);
  landmark.userData.perfGroup = 'balloon-arena';
  const kapiMat = standard(0xfbf6e8, 0.6);
  const kapiKule = new T.InstancedMesh(kutuGeo, kapiMat, 3);
  setInstance(marker, kapiKule, 0, { x: -4.4, y: 0, z: 0, sx: 1.9, sz: 1.9, sy: 5.2 });
  setInstance(marker, kapiKule, 1, { x: 4.4, y: 0, z: 0, sx: 1.9, sz: 1.9, sy: 5.2 });
  setInstance(marker, kapiKule, 2, { x: 0, y: 4.4, z: 0, sx: 10.4, sz: 1.5, sy: 0.9 });
  kapiKule.instanceMatrix.needsUpdate = true;
  landmark.add(kapiKule);
  const crownMaterial = standard(0xe2766e, 0.55);
  const kapiSerit = new T.Mesh(geometry(new T.BoxGeometry(10.4, 0.5, 1.6)), crownMaterial);
  kapiSerit.position.y = 5.55;
  landmark.add(kapiSerit);
  root.add(landmark);

  let finalActive = false;
  function updateFinalGust(active, time, dt = 0) {
    finalActive = Boolean(active);
    if (finalActive) {
      gustDial.rotation.y += dt * 0.9;
      const pulse = 0.92 + Math.sin(time * 5) * 0.07;
      gustDial.scale.setScalar(pulse);
      halkaMat.color.setHex(BALLOON_ROLE_COLORS.finalGust);
      halkaMat.emissive?.setHex?.(BALLOON_ROLE_COLORS.finalGust);
      dugmeMat.emissiveIntensity = 0.6;
      crownMaterial.color.setHex(BALLOON_ROLE_COLORS.finalGust);
      crownMaterial.emissive.setHex(BALLOON_ROLE_COLORS.finalGust);
      crownMaterial.emissiveIntensity = 0.4;
    } else {
      gustDial.scale.setScalar(1);
      gustDial.rotation.y = 0;
      halkaMat.color.setHex(BALLOON_ROLE_COLORS.court);
      halkaMat.emissive?.setHex?.(0x000000);
      dugmeMat.emissiveIntensity = 0.12;
      crownMaterial.color.setHex(0xe2766e);
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
