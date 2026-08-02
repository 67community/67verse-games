// world-items.js — Meshy-authored prop assets for the hub world.
//
// Each GLB ships one mesh + one material + one texture (validated at import
// time), which makes every prop type a single InstancedMesh swap. The world
// keeps its procedural placeholders until these finish loading, so first
// paint is never blocked on the network.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const WORLD_ITEM_FILES = Object.freeze({
  // tree3 is the authored candy tree; tree2 was the older park tree kept on
  // disk for reference.
  tree: 'tree3.glb',
  lozenge: 'lozenge.glb',
  cloud: 'cloud.glb',
  post: 'post.glb',
  gate: 'gate.glb',
  grass: 'grass.glb',
  building: 'building.glb',
  // Cloud-parkour dressing: authored sky props for the Skyway course.
  island: 'island.glb',
  crystal: 'crystal.glb',
  flag: 'flag.glb',
  // Authored map geometry. These replace procedural primitives on the surfaces
  // the player actually looks at — a BoxGeometry deck cannot read as a candy
  // platform no matter how it is lit.
  decktile: 'decktile.glb',
  archgate: 'archgate.glb',
});

// Grounded items stand on y=0 (tree, post, gate, grass, building); floating
// items stay centered on their local origin (cloud, lozenge) so instance
// matrices keep working exactly like the procedural versions they replace.
const GROUNDED = Object.freeze({
  tree: true,
  lozenge: false,
  cloud: false,
  post: true,
  gate: true,
  grass: true,
  building: true,
  // Islands and crystals hang in open sky from their own centre; flags are
  // planted, so their base sits on the deck.
  island: false,
  crystal: false,
  flag: true,
  // Deck tiles are laid from their own centre so an instance matrix can place
  // them flush with a platform's top face; the arch is planted on the ground.
  decktile: false,
  archgate: true,
});

function extractItemGeometry(gltf, { grounded }) {
  const root = gltf?.scene;
  if (!root) return null;
  root.updateMatrixWorld(true);
  let source = null;
  root.traverse((object) => {
    if (!source && object.isMesh) source = object;
  });
  if (!source?.geometry) return null;

  const geometry = source.geometry.clone();
  geometry.applyMatrix4(source.matrixWorld);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!(maxDim > 0)) {
    geometry.dispose();
    return null;
  }

  const recenter = grounded
    ? new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z)
    : new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
  geometry.applyMatrix4(recenter);
  const normalize = 1 / maxDim;
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(normalize, normalize, normalize));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = source.material?.clone?.() || source.material;
  return Object.freeze({ geometry, material });
}

export function loadWorldItems(baseUrl = '/assets/items/') {
  const loader = new GLTFLoader();
  const jobs = Object.entries(WORLD_ITEM_FILES).map(([key, file]) => (
    new Promise((resolve) => {
      loader.load(
        `${baseUrl}${file}`,
        (gltf) => resolve([key, extractItemGeometry(gltf, { grounded: GROUNDED[key] })]),
        undefined,
        () => resolve([key, null]),
      );
    })
  ));
  return Promise.all(jobs).then((pairs) => Object.freeze(Object.fromEntries(pairs)));
}
