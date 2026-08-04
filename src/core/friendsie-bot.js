// friendsie-bot.js — Oscar's fRiENDSiES as the rivals you race.
//
// The roster characters are procedural: a merged body plus four pivoted limbs
// that createCharacterAnimator drives by name. A fRiENDSiE is an authored,
// rigged model instead, so it cannot use that animator — but it does not need
// a different one either. It carries Root, Spine, ThighL/R and ArmL/R and no
// animation clip, so the gait is written here and driven from the bot's own
// speed, exactly as the guests in the park and the lobby are driven.
//
// This deliberately exposes the same shape spawnBot already expects from a
// character — root, animator.signal, animator.update, dispose — so nothing in
// the games has to know which kind of rival it is holding.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = `${import.meta.env?.BASE_URL ?? '/'}friendsies/`;

// The four lightest of Oscar's rigged collection, textures resized to 512.
export const FRIENDSIE_RIVALS = Object.freeze([
  'rig_21.glb', 'rig_18.glb', 'rig_6.glb', 'rig_56.glb',
]);

export function friendsieRivalId(index) {
  return `friendsie:${FRIENDSIE_RIVALS[index % FRIENDSIE_RIVALS.length]}`;
}

export function isFriendsieRival(id) {
  return typeof id === 'string' && id.startsWith('friendsie:');
}

const loader = new GLTFLoader();
const cache = new Map();

function loadModel(file) {
  if (!cache.has(file)) {
    cache.set(file, new Promise((resolve) => {
      loader.load(`${BASE}${file}`, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    }));
  }
  return cache.get(file);
}

/**
 * Builds a rival that walks and runs on its own skeleton.
 * Returns the same surface spawnBot uses from a roster character.
 */
export async function createFriendsieRival(id, { height = 1.8 } = {}) {
  const file = id.slice('friendsie:'.length);
  const template = await loadModel(file);
  if (!template) return null;

  const model = template.clone(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0) model.scale.multiplyScalar(height / size.y);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
  });

  // Bind pose per bone. An absolute rotation folds the character up on the
  // first frame, because the bind pose is not zero.
  const bones = new Map();
  model.traverse((object) => {
    if (!object.isBone || bones.has(object.name)) return;
    object.userData.restX = object.rotation.x;
    bones.set(object.name, object);
  });
  const swing = (name, amount) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.x = bone.userData.restX + amount;
  };

  const root = new THREE.Group();
  root.name = `character:${id}:root`;
  root.userData.characterInstance = true;
  root.userData.characterId = id;
  const visual = new THREE.Group();
  visual.name = `character:${id}:visual`;
  visual.add(model);
  root.add(visual);

  let phase = Math.random() * Math.PI * 2;
  let airborne = 0;

  const animator = {
    signal(event) {
      // A jump is the one moment the legs should stop cycling and tuck.
      if (event === 'jump') airborne = 0.42;
    },
    update(dt, { speed = 0, grounded = true } = {}) {
      if (airborne > 0) airborne = Math.max(0, airborne - dt);
      const running = Math.min(speed / 4.2, 1.6);
      phase += dt * (2.4 + running * 6.2);
      if (!grounded || airborne > 0) {
        // Tucked: both legs forward, arms up.
        swing('ThighL', 0.62);
        swing('ThighR', 0.48);
        swing('ArmL', -0.9);
        swing('ArmR', -0.9);
        return;
      }
      // Standing still still breathes a little, so a waiting rival is not a statue.
      const stride = Math.sin(phase) * (0.1 + running * 0.42);
      swing('ThighL', stride);
      swing('ThighR', -stride);
      swing('ArmL', -stride * 0.8);
      swing('ArmR', stride * 0.8);
      swing('Spine1', running * 0.09);
    },
  };

  return {
    id,
    root,
    visual,
    mesh: model,
    animator,
    dispose() {
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => material.dispose?.());
      });
    },
  };
}
