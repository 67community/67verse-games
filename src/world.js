// world.js — the 67VERSE lobby: a town street.
//
// Deliberately spare. The lobby is grass, one avenue, the shops along it and
// the traffic passing through — nothing else. The previous build layered a
// civic plaza, an arrival court, four themed districts, a landmark canopy, a
// neighbourhood ring and a route of guide lights on top of each other, and the
// result read as a showroom rather than a place to stand around in.
//
// Ground stays procedural (a disc of grass with a soil edge); everything the
// player actually looks at is authored geometry loaded by world/city-avenue.js.

import * as THREE from 'three';
import { AVENUE, buildCityAvenue } from './world/city-avenue.js';
import { buildCityDistricts } from './world/city-districts.js';
import { buildTerrainMesh, getHeight } from './world/sixseven-terrain.js';

export const PALETTE = Object.freeze({
  cream: 0xf3ead8,
  terracotta: 0xf95d9b,
  aqua: 0x37c5f0,
  yellow: 0xffc93c,
  graphite: 0x2b3a67,
  sky: 0x78bde0,
  grass: 0x7ed957,
});

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0,
    ...options,
  });
}

function bounds2Of(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  return {
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
  };
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  group.name = 'town-lobby';
  group.userData.perfGroup = 'hub-town';
  scene.add(group);

  const walkables = [];
  const cameraColliders = [];
  const animated = [];

  const MAT = {
    grass: material(PALETTE.grass, { roughness: 0.95 }),
    soil: material(0x9a7658, { roughness: 0.95, flatShading: true }),
    kerb: material(0xe8dfcd, { roughness: 0.76 }),
  };

  function registerWalkable(mesh, { camera = true } = {}) {
    mesh.updateWorldMatrix(true, false);
    mesh.userData.box2 = bounds2Of(mesh);
    if (!walkables.includes(mesh)) walkables.push(mesh);
    if (camera && !cameraColliders.includes(mesh)) cameraColliders.push(mesh);
    return mesh;
  }

  function registerCameraCollider(mesh) {
    if (mesh && !cameraColliders.includes(mesh)) cameraColliders.push(mesh);
    return mesh;
  }

  function add(mesh, {
    walkable = false,
    camera = walkable,
    cast = true,
    receive = true,
  } = {}) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    if (walkable) registerWalkable(mesh, { camera });
    else if (camera) registerCameraCollider(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------------
  // GROUND — the 67 World terrain, verbatim
  // ---------------------------------------------------------------------
  // Rolling biome-tinted countryside with a dead-flat corridor where the
  // avenue runs. See world/sixseven-terrain.js for the ported functions.
  const terrain = buildTerrainMesh(150, 120);
  add(terrain, { camera: false, cast: false });

  // ---------------------------------------------------------------------
  // MAIN STREET
  // ---------------------------------------------------------------------
  const avenue = buildCityAvenue({ group, add, material, animated });
  const solids = avenue.colliders ?? [];

  // ---------------------------------------------------------------------
  // CITY DISTRICTS — skatepark east, blocks west, market south, pond park
  // ---------------------------------------------------------------------
  const districts = buildCityDistricts({ group, add, material, animated });

  // Low kerb ring at the world edge: the invisible bound needs something
  // visible, or players walk into a wall that is not there.
  const EDGE_COUNT = 124;
  const edge = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.25, 0.5, 0.3),
    MAT.kerb,
    EDGE_COUNT,
  );
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < EDGE_COUNT; i += 1) {
      const angle = (i / EDGE_COUNT) * Math.PI * 2;
      e.set(0, -(angle + Math.PI / 2), 0);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(Math.cos(angle) * 61.5, 0.25 + getHeight(Math.cos(angle) * 61.5, Math.sin(angle) * 61.5), Math.sin(angle) * 61.5),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      edge.setMatrixAt(i, m);
    }
    edge.instanceMatrix.needsUpdate = true;
  }
  edge.name = 'town:world-edge';
  add(edge, { camera: false, cast: false });

  group.userData.visualSystem = Object.freeze({
    id: 'town-street',
    materialMetaphor: 'a plain town avenue: grass, asphalt, shopfronts',
    palette: Object.freeze(Object.values(PALETTE)),
    hierarchy: Object.freeze(['town:lawn', 'city:avenue-road', 'city:shop-body']),
  });

  // ---------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------
  // Ground height is analytic, exactly as the source build does it — no
  // raycast against a 28k-triangle terrain every simulation step. Street
  // surfaces override the terrain inside the flat corridor, and the solid
  // footprints (shops, fountain) come back as AABBs so the player simulation
  // pushes out of them.
  function sampleGround(x, z) {
    for (const solid of solids) {
      if (x > solid.minX && x < solid.maxX && z > solid.minZ && z < solid.maxZ) {
        return {
          y: solid.topY,
          box2: { minX: solid.minX, maxX: solid.maxX, minZ: solid.minZ, maxZ: solid.maxZ },
        };
      }
    }
    const onAvenueZ = z >= AVENUE.startZ && z <= AVENUE.endZ;
    if (onAvenueZ && Math.abs(x) <= AVENUE.kerbX) {
      return { y: AVENUE.y + 0.08, box2: null };           // carriageway
    }
    if (onAvenueZ && Math.abs(x) <= 8.8) {
      return { y: AVENUE.y + 0.14, box2: null };           // pavement
    }
    const plazaDx = x;
    const plazaDz = z - AVENUE.plazaZ;
    if (Math.hypot(plazaDx, plazaDz) <= AVENUE.plazaR) {
      return { y: AVENUE.y + 0.12, box2: null };           // plaza disc
    }
    const park = districts.skatepark;
    if (x > park.minX && x < park.maxX && z > park.minZ && z < park.maxZ) {
      return { y: park.topY, box2: null };                 // skatepark slab
    }
    const pitch = districts.stadiumPitch;
    const pdx = (x - pitch.x) / pitch.rx;
    const pdz = (z - pitch.z) / pitch.rz;
    if (pdx * pdx + pdz * pdz <= 1) {
      return { y: pitch.topY, box2: null };                // stadium pitch
    }
    return { y: getHeight(x, z), box2: null };
  }

  // Kept for API compatibility: the town has no procedural props left to swap
  // for authored ones — city-avenue.js loads its own models directly.
  function applyItems() {
    return 0;
  }

  return {
    group,
    sampleGround,
    registerWalkable,
    registerCameraCollider,
    applyItems,
    // Enlarged from 44 for the 2026-08-04 island-city references: the funfair,
    // coast, stadium and suburbs need the extra ring.
    bounds: 62,
    boundsCircle: true,
    // The street runs along -z, so the far end of the avenue is where players
    // head for. Audio and the optional hub-plus layer read this.
    portalPos: new THREE.Vector3(0, 0, -22),
    animated,
    cameraColliders,
    destinations: [],
  };
}
