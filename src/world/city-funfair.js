// city-funfair.js — the north-east fairground: the ferris wheel with its
// ground works, the two carousels and the coaster. Split out of
// city-districts.js because that file's chunk was within 250 bytes of the
// per-chunk budget and the coaster's traced centre line does not fit inside
// it. Every number here comes from PLAN_LUNAPARK, which measured them off the
// 1280 px reference; nothing is chosen.
import { PLAN_LUNAPARK } from './plan-ek.js';

// THREE and canvasTexture arrive as arguments rather than imports: a named
// rollup chunk that imports three has the entire library folded into it, and
// the chunk then lands in the initial graph.
export function buildFunfair({
  THREE, group, add, material, animated, mats,
  olculenRenk, ISIK_KAZANCI, CAR_PAINT, canvasTexture,
}) {
  // Ferris wheel. Everything here is PLAN_LUNAPARK's measurement of the
  // drawing: the envelope row puts the wheel at (26.6, -46.8) 10.2 across, its
  // rim and spokes read near-white with a pink cast rather than the saturated
  // yellow this was built in, and twelve pastel gondolas ride it. The drawing
  // carries about twenty thin spokes; sixteen arms is as close as eight
  // crossing bars get, and eight bars is one draw.
  const DOLAP = PLAN_LUNAPARK;
  const [dolapX, dolapZ, dolapEn] = DOLAP.dolapCark;
  const DOLAP_R = dolapEn / 2;
  const DOLAP_KABIN = DOLAP.dolapKabinRenk.length;
  const cemberTaban = new THREE.Color(DOLAP.dolapCemberRenk).multiplyScalar(1 / ISIK_KAZANCI);
  const ferris = new THREE.Group();
  ferris.name = 'district:ferris-wheel';
  const wheelMat = material(cemberTaban.getHex(), { roughness: 0.5 });
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(DOLAP_R, 0.22, 10, 36), wheelMat);
  ferris.add(wheelRing);
  // Sixteen arms, drawn as eight crossing bars so the hub stays one draw.
  const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, DOLAP_R * 2, 0.13), wheelMat, 8);
  for (let i = 0; i < 8; i += 1) spokes.setMatrixAt(i, new THREE.Matrix4().makeRotationZ((i / 8) * Math.PI));
  spokes.instanceMatrix.needsUpdate = true;
  ferris.add(spokes);
  const gondolas = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.8, 0.62, 0.62), mats.white, DOLAP_KABIN,
  );
  DOLAP.dolapKabinRenk.forEach((renk, i) => {
    gondolas.setColorAt(i, olculenRenk(renk));
  });
  if (gondolas.instanceColor) gondolas.instanceColor.needsUpdate = true;
  ferris.add(gondolas);
  // The axle sits a wheel radius above the base beam the drawing gives it.
  const DOLAP_EKSEN = 1.2 + DOLAP_R;
  ferris.position.set(dolapX, DOLAP_EKSEN, dolapZ);
  group.add(ferris);

  // Ground works, all measured. The A-frame's feet land on the base platform
  // row at x 22.4 and x 29.6 — 7.2 apart — and the pink boarding deck stands
  // in front of it. Legs, beam and deck ride one instanced box each so the
  // whole structure costs two draws.
  const [tabanX, tabanZ, tabanEn, tabanDerin] = DOLAP.dolapTaban;
  const ayakZ = DOLAP.dolapAyak.z;
  const dolapAyaklar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1, 0.22), wheelMat, 2);
  const ayakM = new THREE.Matrix4();
  const ayakQ = new THREE.Quaternion();
  const ayakYon = new THREE.Vector3();
  const ayakYukari = new THREE.Vector3(0, 1, 0);
  [DOLAP.dolapAyak.solX, DOLAP.dolapAyak.sagX].forEach((ayakX, i) => {
    ayakYon.set(dolapX - ayakX, DOLAP_EKSEN, dolapZ - ayakZ);
    const boy = ayakYon.length();
    ayakM.compose(
      new THREE.Vector3((ayakX + dolapX) / 2, DOLAP_EKSEN / 2, (ayakZ + dolapZ) / 2),
      ayakQ.setFromUnitVectors(ayakYukari, ayakYon.normalize()),
      new THREE.Vector3(1, boy, 1),
    );
    dolapAyaklar.setMatrixAt(i, ayakM);
  });
  dolapAyaklar.instanceMatrix.needsUpdate = true;
  add(dolapAyaklar, { camera: false, cast: true });
  const [peronX, peronZ, peronEn, peronDerin, peronRenk] = DOLAP.dolapPeron;
  const dolapZemin = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.white, 2);
  const zeminM = new THREE.Matrix4();
  zeminM.makeScale(tabanEn, 0.34, tabanDerin);
  zeminM.setPosition(tabanX, 0.17, tabanZ);
  dolapZemin.setMatrixAt(0, zeminM);
  dolapZemin.setColorAt(0, olculenRenk('#9e8e9f'));
  zeminM.makeScale(peronEn, 0.26, peronDerin);
  zeminM.setPosition(peronX, 0.13, peronZ);
  dolapZemin.setMatrixAt(1, zeminM);
  dolapZemin.setColorAt(1, olculenRenk(peronRenk));
  dolapZemin.instanceMatrix.needsUpdate = true;
  if (dolapZemin.instanceColor) dolapZemin.instanceColor.needsUpdate = true;
  add(dolapZemin, { camera: false, cast: false });

  const gondolaSpin = new THREE.Matrix4();
  const gondolaAt = new THREE.Matrix4();
  animated?.push((time) => {
    const theta = time * 0.14;
    ferris.rotation.z = theta;
    gondolaSpin.makeRotationZ(-theta);
    for (let i = 0; i < DOLAP_KABIN; i += 1) {
      const angle = (i / DOLAP_KABIN) * Math.PI * 2 + theta;
      gondolaAt.makeTranslation(Math.cos(angle) * DOLAP_R, Math.sin(angle) * DOLAP_R - 0.5, 0);
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
      map: canvasTexture(canvas),
      roughness: 0.6,
    });
  }
  // Measured off the plan: the big carousel fills PLAN_LUNAPARK's 6.49 x 7.07
  // footprint at (36.3, -45.8), the smaller one stands on its green lawn at
  // (34.1, -36.1). Both wear a twelve-wedge canopy — the ring sampled round
  // the big one at four radii counts twelve transitions every time — and the
  // big one's wedges are pink against cream, not the brick red they were.
  // Their shared parts — drums, decks, poles, seat rings — ride single
  // instanced meshes so two rides cost barely more than one; only the canopies
  // differ, each carrying its own wedge texture.
  const [karincaX, karincaZ, karincaEn] = PLAN_LUNAPARK.atlikarinca;
  const RIDES = [
    {
      x: karincaX,
      z: karincaZ,
      r: karincaEn / 2,
      govde: PLAN_LUNAPARK.atlikarincaGovde,
      canopy: wedgeCanopy(
        PLAN_LUNAPARK.atlikarincaPembe,
        PLAN_LUNAPARK.atlikarincaKrem,
        PLAN_LUNAPARK.atlikarincaDilim,
      ),
    },
    {
      x: 34.1, z: -36.1, r: 2.1, govde: 1.5, canopy: wedgeCanopy('#a87554', '#b6aaa1', 12),
    },
  ];
  // The drum the canopy stands on. Without it the ride read as a pinwheel
  // lying on the pavement: between the 0.5-high deck and the cone floating at
  // 3.15 there was nothing but a 0.28 pole. It replaces that pole, so the
  // carousels cost the same as before.
  const rideDrums = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 18), mats.cream, RIDES.length);
  const rideDecks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.06, 0.5, 16), mats.white, RIDES.length);
  const rideSeats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), mats.white, RIDES.length * 8);
  const rm4 = new THREE.Matrix4();
  RIDES.forEach((ride, i) => {
    rm4.makeScale(ride.r * 0.88, 1, ride.r * 0.88);
    rm4.setPosition(ride.x, 0.25, ride.z);
    rideDecks.setMatrixAt(i, rm4);
    rm4.makeScale(ride.r * 0.86, ride.govde, ride.r * 0.86);
    rm4.setPosition(ride.x, 0.5 + ride.govde / 2, ride.z);
    rideDrums.setMatrixAt(i, rm4);
    for (let s = 0; s < 8; s += 1) {
      const a = (s / 8) * Math.PI * 2;
      rideSeats.setMatrixAt(i * 8 + s, new THREE.Matrix4().makeTranslation(
        ride.x + Math.cos(a) * ride.r * 0.95,
        0.5 + ride.govde * 0.45,
        ride.z + Math.sin(a) * ride.r * 0.95,
      ));
      rideSeats.setColorAt(i * 8 + s, new THREE.Color(CAR_PAINT[s % CAR_PAINT.length]));
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(ride.r * 1.06, 1.5, 16), ride.canopy);
    roof.position.set(ride.x, 0.5 + ride.govde + 0.75, ride.z);
    add(roof, { camera: false, cast: true });
  });
  for (const mesh of [rideDrums, rideDecks, rideSeats]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  rideDecks.name = 'district:carousel';
  add(rideDrums, { camera: false, cast: true });
  add(rideDecks, { camera: false, cast: true });
  add(rideSeats, { camera: false, cast: true });
  const lawnDisc = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.1, 22), mats.grass);
  lawnDisc.position.set(34.1, 0.05, -36.1);
  add(lawnDisc, { camera: false, cast: false });

  // The swirling ride in the reference is a narrow RAIL, not a channel: a cut
  // straight across the west limb reads 1.21 units rail to rail with a 0.7
  // deck between them, so the ribbon is built 0.9 wide with a 0.15 lip riding
  // each edge — 1.2 overall against the 3.11 it used to be. Its centre line,
  // its width and the pad it may not leave all come from PLAN_LUNAPARK, which
  // traced them off the drawing: an outer loop over the west half, a tighter
  // loop nested inside it, and an east loop, crossing near (32.1, -23.6).
  // Built as a ribbon: sample the curve, step left and right along its
  // horizontal normal, and stitch the floor; the lips ride the same offsets.
  const RAY = PLAN_LUNAPARK;
  const raySinir = RAY.hizTreniSinir;
  const slideCurve = new THREE.CatmullRomCurve3(RAY.hizTreniHat.map(([x, z, y]) => new THREE.Vector3(
    Math.min(raySinir.maxX, Math.max(raySinir.minX, x)),
    y,
    Math.min(raySinir.maxZ, Math.max(raySinir.minZ, z)),
  )), true);
  const SLIDE_HALF = RAY.hizTreniYari;
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
  const slideFloor = new THREE.Mesh(ribbonGeometry(slideCurve, SLIDE_HALF, 420), mats.concrete);
  slideFloor.material.side = THREE.DoubleSide;
  slideFloor.name = 'district:funfair-slide';
  add(slideFloor, { camera: false, cast: false });
  // Pink rails: one tube down each edge, offset by tracing a parallel curve.
  // Sampled (244,193,198) and (233,186,194) on the drawing, so they take their
  // own measured tone rather than the orange coping the lips were wearing.
  // The frame under the wheel wears the same pale tone as its rim, which is
  // what the drawing shows: its uprights sample (159,138,153) in shadow and
  // (232,207,210) where the sun reaches them.
  const rayMat = material(RAY.hizTreniRayTaban, { roughness: 0.45 });
  for (const dir of [-1, 1]) {
    const edgePoints = [];
    const up = new THREE.Vector3(0, 1, 0);
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < 320; i += 1) {
      const t = i / 320;
      slideCurve.getPointAt(t, point);
      slideCurve.getTangentAt(t, tangent);
      side.crossVectors(tangent, up).normalize().multiplyScalar(SLIDE_HALF * dir);
      edgePoints.push(new THREE.Vector3(point.x + side.x, point.y + 0.08, point.z + side.z));
    }
    const lip = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePoints, true), 360, RAY.hizTreniDudak, 5),
      rayMat,
    );
    add(lip, { camera: false, cast: false });
  }
  // Slim supports under the raised sections.
  const slidePosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 1, 6), mats.concreteDeep, 24);
  for (let i = 0; i < 24; i += 1) {
    const p = slideCurve.getPointAt(i / 24);
    const m = new THREE.Matrix4().makeScale(1, Math.max(0.2, p.y), 1);
    m.setPosition(p.x, p.y / 2, p.z);
    slidePosts.setMatrixAt(i, m);
  }
  slidePosts.instanceMatrix.needsUpdate = true;
  add(slidePosts, { camera: false, cast: false });
}
