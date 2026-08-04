// world/sekil.js — the shape helpers the city and its districts share.
//
// These moved out of city-districts.js when the stadium was rebuilt: the
// district file crossed the 40 kB per-chunk budget, and a shared module is
// both the honest split and the one that lets the stadium live on its own.

import * as THREE from 'three';

// Every canvas in this file is authored in sRGB — hex colours picked to match
// the reference — but three treats a CanvasTexture as linear data unless it is
// told otherwise, which reads every one of them back far too light and washed
// out. The basketball court was rendering 170,181,146 against a reference of
// 102,107,93 for exactly this reason.
export function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A squircle as an explicit point loop, with no repeated closing point.
// Curve-built paths end where they began, and that duplicated vertex breaks
// the cap triangulation when the path is used as a hole: the stadium bowl came
// out as a solid oval with four huge triangles lying across the pitch, even
// though the hole was in the shape.
export function squirclePoints(w, d, r, perCorner = 6) {
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.max(0.001, Math.min(r, hw - 0.001, hd - 0.001));
  const points = [];
  const corners = [
    [hw - rr, hd - rr, 0],
    [-hw + rr, hd - rr, Math.PI / 2],
    [-hw + rr, -hd + rr, Math.PI],
    [hw - rr, -hd + rr, Math.PI * 1.5],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= perCorner; i += 1) {
      const a = start + (i / perCorner) * (Math.PI / 2);
      points.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
  }
  // Drop the closing duplicate: the last corner ends on the first point.
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.distanceToSquared(last) < 1e-8) points.pop();
  }
  return points;
}

export function squirclePath(w, d, r, Ctor = THREE.Shape) {
  const path = new Ctor();
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.max(0.01, Math.min(r, hw - 0.01, hd - 0.01));
  path.moveTo(-hw + rr, -hd);
  path.lineTo(hw - rr, -hd);
  path.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  path.lineTo(hw, hd - rr);
  path.quadraticCurveTo(hw, hd, hw - rr, hd);
  path.lineTo(-hw + rr, hd);
  path.quadraticCurveTo(-hw, hd, -hw, hd - rr);
  path.lineTo(-hw, -hd + rr);
  path.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  return path;
}

// The reference's blocks are not slabs — every top edge carries a fat fillet
// that catches the key light as a bright rim, which is most of why they read
// as soft clay rather than cut paper. `bevel` builds that fillet; the shape and
// depth are shrunk by it first so the finished size is still exactly w x d x h
// and the layout solver's footprints stay true. `hole` turns the result into a
// frame, which is how a roof gets its tray.
export function roundedBoxGeometry(w, d, h, r, bevel = 0, hole = 0) {
  const b = Math.max(0, Math.min(bevel, w / 4, d / 4, h / 3));
  const shape = squirclePath(w - b * 2, d - b * 2, r - b);
  if (hole > 0) {
    shape.holes.push(squirclePath((w - b * 2) * hole, (d - b * 2) * hole, (r - b) * hole, THREE.Path));
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, h - b * 2),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geometry.rotateX(-Math.PI / 2);
  // Bevelled extrusion starts a bevel below zero; lift it so the box still
  // spans 0..h and every caller's positioning is unchanged.
  if (b > 0) geometry.translate(0, b, 0);
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
export function insetPolygon(points, distance) {
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
export function ribbonSides(line, half) {
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

export function shapeFromPoints(points, Ctor) {
  const shape = new Ctor();
  // Shapes are authored in the XY plane and rotated flat, which maps shape y
  // to world -z. Every conversion in this file goes through here.
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  return shape;
}

export function wallStripGeometry(rim, floor, rimY, floorY) {
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

export function copingTube(points, y, radius, closed) {
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
export function tinted(geometry, hex) {
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
export function tintedByHeight(geometry, topHex, bottomHex, topY, bottomY) {
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
