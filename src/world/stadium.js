// world/stadium.js — the 67 stadium, measured off the reference render.
//
// Measured at 3x with a grid over the drawing: the bowl's outer oval runs
// pixels 865..1035 by 480..775, its track ring 885..1015 by 495..765, and the
// pitch 903..1000 by 512..745, with a grandstand outside each long side and an
// entrance block at the south end. Pitch and bowl are concentric there — the
// pitch centres on pixel row 628.5 and the bowl on 627.5 — so nothing in here
// carries an offset.
//
// It lives in its own module because the district file it came from crossed
// the 40 kB per-chunk budget when this was rebuilt.

import * as THREE from 'three';
import { canvasTexture, squirclePath, roundedBoxGeometry } from './sekil.js';

export const STADIUM_PITCH = Object.freeze({
  x: 29.9, z: -1.5, rx: 4.7, rz: 11.3, topY: 0.16,
});

// Built from main.js's own import rather than from inside the city module, so
// the bundler has a real split point here: with a single importer it folds
// this straight back into the district chunk, and that chunk is at its limit.
export function buildStadium(mats) {
  const stadium = new THREE.Group();
  stadium.name = 'district:stadium';
  // Measured off the reference at 3x with a grid: the bowl's outer oval runs
  // px 865..1035 by 480..775, its track ring 885..1015 by 495..765, and the
  // pitch 903..1000 by 512..745, with a grandstand outside each long side.
  // What was here was a torus scaled into an oval — a rubber ring, not a
  // stadium — and a bare green cylinder for the pitch.
  const BOWL = { rx: 8.25, rz: 14.3, inner: { rx: 6.4, rz: 13.1 }, height: 2.35 };
  // Pitch and bowl are concentric in the drawing — its pitch centres on py
  // 628.5 and its bowl on 627.5 — so nothing here carries an offset. An
  // earlier attempt shifted the track ring twice and hung the pitch off the
  // north end of the oval.
  const PITCH = { w: 9.4, d: 22.6 };

  function ovalRing(rx, rz, innerRx, innerRz) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, innerRx, innerRz, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    return shape;
  }

  // The bowl wall: a real wall with a flat top, bevelled like every other
  // block in the city so it catches the same rim of light.
  const bowlGeometry = new THREE.ExtrudeGeometry(
    ovalRing(BOWL.rx, BOWL.rz, BOWL.inner.rx, BOWL.inner.rz),
    {
      depth: BOWL.height - 0.24,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.12,
      bevelOffset: 0,
      bevelSegments: 1,
      curveSegments: 26,
    },
  );
  bowlGeometry.rotateX(-Math.PI / 2);
  bowlGeometry.translate(0, 0.12, 0);
  const bowl = new THREE.Mesh(bowlGeometry, mats.white);
  bowl.name = 'district:stadium-bowl';
  stadium.add(bowl);

  // The running track inside the wall, which reads as the dark band around
  // the pitch in the reference.
  // The track's inner edge is the pitch itself, not a second ellipse: an
  // ellipse there cuts the pitch's corners off, because a 9.4 x 22.6 rectangle
  // does not fit inside a 6.4 x 13.1 oval — its corners sit well outside it.
  const trackShape = new THREE.Shape();
  trackShape.absellipse(0, 0, BOWL.inner.rx, BOWL.inner.rz, 0, Math.PI * 2, false, 0);
  trackShape.holes.push(squirclePath(PITCH.w + 0.3, PITCH.d + 0.3, 1.1, THREE.Path));
  const trackGeometry = new THREE.ShapeGeometry(trackShape, 22);
  trackGeometry.rotateX(-Math.PI / 2);
  trackGeometry.translate(0, 0.12, 0);
  const track = new THREE.Mesh(trackGeometry, mats.stadiumTrack);
  track.name = 'district:stadium-track';
  stadium.add(track);

  // The pitch carries real markings, the way the basketball court does: the
  // reference draws both penalty areas, both goal areas, the halfway line,
  // the centre circle, corner arcs and 67 across the middle.
  function pitchMaterial() {
    if (typeof document === 'undefined') return mats.pitch;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 616;
    const c = canvas.getContext('2d');
    // Measured off the reference pitch: 162,168,134 lit, a soft sage rather
    // than the bottle green this started as.
    c.fillStyle = '#878c70';
    c.fillRect(0, 0, 256, 616);
    // Mown bands, which is most of what makes a pitch read as a pitch.
    c.fillStyle = '#8d9276';
    for (let band = 0; band < 8; band += 1) {
      if (band % 2 === 0) c.fillRect(0, band * 77, 256, 77);
    }
    c.strokeStyle = '#dedbcb';
    c.lineWidth = 3;
    c.strokeRect(12, 12, 232, 592);
    c.beginPath();                               // halfway line
    c.moveTo(12, 308);
    c.lineTo(244, 308);
    c.stroke();
    c.beginPath();                               // centre circle and spot
    c.arc(128, 308, 42, 0, Math.PI * 2);
    c.stroke();
    for (const top of [true, false]) {
      const line = top ? 12 : 604;
      const dir = top ? 1 : -1;
      c.strokeRect(52, top ? 12 : 484, 152, 108);        // penalty area
      c.strokeRect(92, top ? 12 : 556, 72, 36);          // goal area
      c.beginPath();                                     // penalty arc
      c.arc(128, line + dir * 78, 36, top ? 0.35 : Math.PI + 0.35, top ? Math.PI - 0.35 : -0.35);
      c.stroke();
      for (const corner of [12, 244]) {                  // corner arcs
        c.beginPath();
        c.arc(corner, line, 12, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.fillStyle = '#e2ded0';
    c.font = '800 78px Figtree, Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('67', 128, 308);
    return new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.95 });
  }
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.w, PITCH.d), pitchMaterial());
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.16, 0);
  pitch.name = 'district:stadium-pitch';
  stadium.add(pitch);

  // Grandstands outside each long side, and the entrance block at the south
  // end. All three are the same pale box, so they ride one instanced mesh.
  // Offsets from the stadium's own centre, each read off the drawing: the two
  // grandstands outside the long sides, and the entrance block at the south.
  const STANDS_67 = [
    [-7.5, 0.55, 2.6, 10.1, 2.3],
    [7.5, 0.55, 2.8, 10.1, 2.3],
    [0.7, 16.05, 7.8, 2.9, 1.9],
  ];
  const standMesh = new THREE.InstancedMesh(
    roundedBoxGeometry(1, 1, 1, 0.18, 0.06), mats.white, STANDS_67.length,
  );
  const sm = new THREE.Matrix4();
  STANDS_67.forEach(([sx, sz, sw, sd, sh], i) => {
    sm.makeScale(sw, sh, sd);
    sm.setPosition(sx, 0, sz);
    standMesh.setMatrixAt(i, sm);
  });
  standMesh.instanceMatrix.needsUpdate = true;
  standMesh.name = 'district:stadium-stands';
  stadium.add(standMesh);

  stadium.position.set(29.9, 0, -1.5);
  stadium.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return stadium;
}
