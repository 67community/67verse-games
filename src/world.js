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

// The city is the single largest thing this app ships, and it is loaded as its
// own chunk rather than in the first bundle. Its builder is therefore passed
// in rather than imported here — and it is required, so a caller cannot end up
// with a silently empty island.
export function buildWorld(scene, { buildCity, buildStadium, stadiumPitch } = {}) {
  if (typeof buildCity !== 'function') {
    throw new TypeError('buildWorld needs the city builder: import world/city-districts.js and pass buildCity.');
  }
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
  // CITY DISTRICTS — the whole island city (2026-08-04 references). The old
  // main-street module (shops, benches, promenade) is gone by explicit order:
  // nothing from the previous town ships on the main map.
  // ---------------------------------------------------------------------
  const districts = buildCity({ group, add, material, animated, buildStadium, stadiumPitch });
  // Ray plumbing for the skatepark's shaped ground.
  const parkRay = new THREE.Raycaster();
  const ASAGI = new THREE.Vector3(0, -1, 0);
  const parkIsini = new THREE.Vector3();
  const parkYuzeyleri = ['district:skatepark-basins', 'district:skatepark-props']
    .map((ad) => group.getObjectByName(ad))
    .filter(Boolean);
  const solids = districts.colliders ?? [];
  const isWater = districts.isWater ?? (() => false);

  // Low kerb along the world edge: the invisible bound needs something
  // visible, or players walk into a wall that is not there. The plan is
  // square, so the kerb is a square perimeter — four runs of segments.
  const EDGE_PER_SIDE = 30;
  const EDGE_COUNT = EDGE_PER_SIDE * 4;
  const EDGE_LIMIT = 61.5;
  const edge = new THREE.InstancedMesh(
    new THREE.BoxGeometry(EDGE_LIMIT * 2 / EDGE_PER_SIDE, 0.5, 0.3),
    MAT.kerb,
    EDGE_COUNT,
  );
  {
    const m = new THREE.Matrix4();
    const step = (EDGE_LIMIT * 2) / EDGE_PER_SIDE;
    // The ring is opened where a road runs off the map. Twelve kerb sections
    // were sitting across road mouths — the last of the things standing in a
    // lane, and the one case where moving the prop is the wrong answer: a
    // kerb belongs on the edge, so the edge gets a gap instead.
    const yolAgzi = districts.yolKutulari ?? [];
    const agizdaMi = (x, z) => yolAgzi.some((r) => (
      x > r.minX - 0.6 && x < r.maxX + 0.6 && z > r.minZ - 0.6 && z < r.maxZ + 0.6
    ));
    let index = 0;
    for (let i = 0; i < EDGE_PER_SIDE; i += 1) {
      const t = -EDGE_LIMIT + step * (i + 0.5);
      for (const [x, z, rot] of [
        [t, -EDGE_LIMIT, 0], [t, EDGE_LIMIT, 0],
        [-EDGE_LIMIT, t, Math.PI / 2], [EDGE_LIMIT, t, Math.PI / 2],
      ]) {
        m.makeRotationY(rot);
        if (agizdaMi(x, z)) m.scale(new THREE.Vector3(0, 0, 0));
        m.setPosition(x, 0.25 + getHeight(x, z), z);
        edge.setMatrixAt(index, m);
        index += 1;
      }
    }
    edge.instanceMatrix.needsUpdate = true;
  }
  edge.name = 'town:world-edge';
  add(edge, { camera: false, cast: false });

  group.userData.visualSystem = Object.freeze({
    id: 'island-city',
    materialMetaphor: 'a pastel island city: sage lawns, taupe streets, cream blocks',
    palette: Object.freeze(Object.values(PALETTE)),
    hierarchy: Object.freeze(['town:lawn', 'district:road-grid', 'district:blocks']),
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
    const park = districts.skatepark;
    if (x > park.minX && x < park.maxX && z > park.minZ && z < park.maxZ) {
      // The bowls are real ground now: inside the park the surface comes off
      // the basin meshes by ray, so walking or boarding in actually descends
      // into the 67 bowl instead of hovering on a flat slab.
      if (parkYuzeyleri.length) {
        parkIsini.set(x, park.topY + 6, z);
        parkRay.set(parkIsini, ASAGI);
        parkRay.far = 14;
        const vurus = parkRay.intersectObjects(parkYuzeyleri, false);
        if (vurus.length) return { y: vurus[0].point.y, box2: null };
      }
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

  // The road sweep, run once more over the WHOLE world now that the map edge,
  // the trees and the lobby's own props are all in. The districts run it on
  // themselves, but a district can only clean its own group — twenty-two
  // objects were still standing in a lane after that pass, which is why
  // Oscar kept finding things in the middle of the road.
  // The city hands the sweep back rather than the world importing it: the
  // city is a deferred chunk and importing it here would drag the whole
  // district into the first bundle.
  districts.yoldanTemizle?.(group);

  return {
    group,
    // Live solid list — venue verbs (swimming) lift their own entries while
    // active, so the pool blocks walkers but not swimmers.
    solids,
    sampleGround,
    isWater,
    registerWalkable,
    registerCameraCollider,
    applyItems,
    // The reference plan is a square city, not a round island: the reachable
    // area is the square that holds the grid, the coast and the suburbs.
    bounds: 62,
    boundsCircle: false,
    // Hub-only movement feel: a stronger hop and one extra jump in the air.
    // Game modes build their own env without these, so their tuned physics
    // and deterministic replays are untouched.
    jumpScale: 1.24,
    airJumps: 1,
    // Oscar: the skate park's controls are the good ones — make the map grip
    // and go like that. The lobby has NO acceleration ramp at all; you press
    // and you are already at speed. Softening the ramp to 0.72 here was the
    // wrong read of "glide": it made the town feel like it was catching up
    // with the stick. The ramp is sharper than the base tuning now, not
    // softer, and the walk itself is quicker.
    accelScale: 1.55,
    speedScale: 1.22,
    // The street runs along -z, so the far end of the avenue is where players
    // head for. Audio and the optional hub-plus layer read this.
    // North gate of the boulevard — the reference city's top exit.
    portalPos: new THREE.Vector3(0, 0, -50),
    animated,
    cameraColliders,
    destinations: [],
  };
}
