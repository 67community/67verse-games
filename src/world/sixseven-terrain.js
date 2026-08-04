// sixseven-terrain.js — the 67 World ground, ported verbatim.
//
// These height and biome functions are copied from the sixseven-world build
// (public/index.html) rather than re-derived: the whole point is that the
// lobby IS that map. Every constant matches, so the hills roll exactly where
// they roll there, and the avenue corridor is dead flat in the same footprint.
// The only adaptation is the mesh: their build streams infinite chunks, while
// the lobby has a fixed player bound, so one displaced plane covers it.

import * as THREE from 'three';

export const HOME_R = 46;
export const HOME_BLEND = 34;

function baseNoise(x, z) {
  return Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.9
       + Math.sin(x * 0.31 + 1.7) * Math.cos(z * 0.23 + 0.6) * 0.35
       + Math.sin((x + z) * 0.05) * 0.6;
}

function sstep(t) { return t * t * (3 - 2 * t); }

function homeHeight(x, z) {
  const d = Math.hypot(x, z);
  const amp = Math.min(1, Math.max(0.12, (d - 10) / 26));
  let h = baseNoise(x, z) * amp * 0.6;
  // Dead-flat corridor for the avenue and its buildings.
  const mx = sstep(Math.min(1, Math.max(0, (Math.abs(x) - 18) / 12)));
  const mz = sstep(Math.min(1, Math.max(0, (Math.abs(z) - 62) / 14)));
  h *= Math.max(mx, mz);
  return h;
}

// Deterministic hash noise so the whole world is reproducible from coordinates.
function hash2(ix, iz, s) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(s, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, z, scale, seed) {
  const fx = x / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = sstep(fx - x0);
  const tz = sstep(fz - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * tx;
  const cd2 = c + (d - c) * tx;
  return ab + (cd2 - ab) * tz;
}

export const BIOMES = Object.freeze({
  home: { tint: [1, 1, 1], label: '67 Avenue' },
  plains: { tint: [1, 1, 1], label: 'Green Meadows' },
  maria: { tint: [0.70, 0.88, 0.70], label: 'Forest Grove' },
  highlands: { tint: [1.04, 1.02, 0.88], label: 'Sunny Hills' },
  ice: { tint: [1.18, 1.12, 0.70], label: 'Golden Fields' },
  crystal: { tint: [1.10, 0.96, 1.06], label: 'Flower Fields' },
});

export function biomeAt(x, z) {
  // The cutoff must sit at HOME_R exactly: there the blend weight is 0, so the
  // biome-multiplier discontinuity in openHeight never shows in getHeight.
  if (Math.hypot(x, z) < HOME_R) return 'home';
  const m = vnoise(x, z, 340, 7);
  const c = vnoise(x, z, 220, 13);
  if (m < 0.33) return 'maria';
  if (m > 0.72) return 'highlands';
  if (c > 0.64) return 'crystal';
  if (c < 0.3) return 'ice';
  return 'plains';
}

function openHeight(x, z) {
  const biome = biomeAt(x, z);
  let h = (vnoise(x, z, 55, 1) - 0.5) * 2.2 + (vnoise(x, z, 17, 2) - 0.5) * 0.7;
  if (biome === 'highlands') h = h * 1.7 + (0.5 - Math.abs(vnoise(x, z, 90, 3) - 0.5)) * 2.6;
  else if (biome === 'maria') h *= 0.5;
  else if (biome === 'ice') h *= 0.4;
  return h;
}

export function getHeight(x, z) {
  // 2026-08-04 city plan: the reference is a SQUARE city, not a round island.
  // Everything inside the plan is dead flat so the grid, the districts and
  // the suburbs sit true; the sea bed shelves under the water plane on the
  // right margin; the countryside rolls only beyond the plan.
  if (x > 46 && Math.abs(z) < 70) {
    return -0.9 * sstep(Math.min(1, (x - 46) / 5));
  }
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d < 62) return 0;
  const islandBlend = sstep(Math.min(1, (d - 62) / 10));
  let h;
  if (d < HOME_R) h = homeHeight(x, z);
  else {
    const hOpen = openHeight(x, z);
    if (d < HOME_R + HOME_BLEND) {
      const t = sstep((d - HOME_R) / HOME_BLEND);
      h = homeHeight(x, z) * (1 - t) + hOpen * t;
    } else h = hOpen;
  }
  return h * islandBlend;
}

/**
 * One displaced, biome-tinted plane covering the playable area. Matches the
 * source's chunk ground: same base colour, flat shading, vertex colours from
 * the biome tint table.
 */
export function buildTerrainMesh(size = 150, segments = 120) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, getHeight(x, z));
    // The city floor is PAVED, not planted. In the reference only the parks
    // are green; everything between the blocks is the same warm taupe as the
    // roads, which is why buildings there read as a city and mine read as
    // sheds on a lawn. Measured to land on #c0b6b5 once lit; the countryside
    // outside the plan keeps its meadow.
    // Vertex-colour components above 1 are clamped, so a green base could
    // never be tinted to taupe however large the multiplier. The base is
    // neutral now and both tints sit under 1: paved #c0b6b5 inside the plan,
    // meadow #8b876d beyond it.
    const sehirIcinde = Math.abs(x) < 58 && Math.abs(z) < 58;
    const tint = sehirIcinde ? [0.753, 0.714, 0.710] : [0.545, 0.529, 0.427];
    colors[i * 3] = tint[0];
    colors[i * 3 + 1] = tint[1];
    colors[i * 3 + 2] = tint[2];
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  }));
  mesh.name = 'town:ground';
  return mesh;
}
