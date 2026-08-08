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
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const BASE = `${import.meta.env?.BASE_URL ?? '/'}friendsies/`;

// Characters that are authored, rigged models rather than roster geometry.
// The key is what a game or the hub asks for; the value is where it lives.
export const RIGGED_CHARACTERS = Object.freeze({
  gorilla: `${import.meta.env?.BASE_URL ?? '/'}characters/gorilla.glb`,
});

export function isRiggedCharacter(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(RIGGED_CHARACTERS, id);
}

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

function loadModel(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve) => {
      loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    }));
  }
  return cache.get(url);
}

/**
 * Builds a rival that walks and runs on its own skeleton.
 * Returns the same surface spawnBot uses from a roster character.
 */
export async function createFriendsieRival(id, { height = 1.45 } = {}) {
  const url = isRiggedCharacter(id) ? RIGGED_CHARACTERS[id] : `${BASE}${id.slice('friendsie:'.length)}`;
  const template = await loadModel(url);
  if (!template) return null;

  // SkeletonUtils.clone, not Object3D.clone: a plain clone(true) leaves the
  // skinned mesh bound to the ORIGINAL template's skeleton, so the copy's own
  // bones do nothing and the body renders collapsed at the world origin —
  // the character is effectively invisible. SkeletonUtils rebinds properly.
  const model = cloneSkinned(template);
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

  // ---------- Cosmetic anchors ----------
  // The Closet dresses characters through named anchors (head / face / back).
  // Without them it falls back to offsets sized for the standard body — on a
  // big-headed fRiENDSiES the hat lands by the feet. The head-region bounding
  // box (top of the body, sampled from real vertices) gives both where the
  // head is and how much to scale each item to hug it.
  root.updateMatrixWorld(true);
  const govdeKutu = new THREE.Box3().setFromObject(model);
  const govde = govdeKutu.getSize(new THREE.Vector3());
  const kafaKutu = new THREE.Box3();   // top ~45%: face height + front of face
  const tepeKutu = new THREE.Box3();   // top ~18%: true head width — the
  const bedenKutu = new THREE.Box3();  //   bind-pose arms reach into the head
  kafaKutu.makeEmpty();                //   band but never up to the crown.
  tepeKutu.makeEmpty();                // beden: torso band, for the backpack —
  bedenKutu.makeEmpty();               //   the head is wider than the body, so
  {                                    //   the back surface is the TORSO's.
    const v = new THREE.Vector3();
    const kafaEsik = govdeKutu.min.y + govde.y * 0.55;
    const tepeEsik = govdeKutu.max.y - govde.y * 0.18;
    const bedenAlt = govdeKutu.min.y + govde.y * 0.14;
    model.traverse((object) => {
      if (!object.isMesh || !object.geometry?.attributes?.position) return;
      const pos = object.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 5) { // sparse sample is plenty
        v.fromBufferAttribute(pos, i);
        object.localToWorld(v);
        if (v.y >= kafaEsik) kafaKutu.expandByPoint(v);
        if (v.y >= tepeEsik) tepeKutu.expandByPoint(v);
        if (v.y >= bedenAlt && v.y < kafaEsik) bedenKutu.expandByPoint(v);
      }
    });
    if (kafaKutu.isEmpty()) kafaKutu.copy(govdeKutu);
    if (tepeKutu.isEmpty()) tepeKutu.copy(kafaKutu);
    if (bedenKutu.isEmpty()) bedenKutu.copy(govdeKutu);
  }
  const kafaG = kafaKutu.getSize(new THREE.Vector3());
  const tepeG = tepeKutu.getSize(new THREE.Vector3());
  const kafaMX = (tepeKutu.min.x + tepeKutu.max.x) / 2;
  const kafaMZ = (tepeKutu.min.z + tepeKutu.max.z) / 2;
  // Cosmetic defs are built for the standard ~0.84-wide head; scale with the
  // real head so a hat hugs a big toy head instead of floating above it.
  const olcek = THREE.MathUtils.clamp(Math.max(tepeG.x, tepeG.z) / 0.84, 0.85, 1.6);
  const anchors = {};
  const baglanti = (ad, x, y, z, s) => {
    const a = new THREE.Group();
    a.name = `anchor:${ad}`;
    a.position.set(x, y, z);
    a.scale.setScalar(s);
    visual.add(a);
    anchors[ad] = a;
  };
  // A hat's rim sits ~0.30*s above its anchor, so anchor just under the crown.
  baglanti('head', kafaMX, kafaKutu.max.y - 0.40 * olcek, kafaMZ, olcek);
  // Eyes sit just above the middle of the fRiENDSiES face.
  baglanti('face', kafaMX, kafaKutu.min.y + kafaG.y * 0.56, kafaKutu.max.z - 0.02, olcek);
  // Backpack flat against the TORSO's back surface, centred on the torso —
  // the head is wider and deeper than the body, so the full-body box would
  // float the pack behind and below the real back.
  const bedenMY = (bedenKutu.min.y + bedenKutu.max.y) / 2;
  baglanti('back', (bedenKutu.min.x + bedenKutu.max.x) / 2,
    Math.max(bedenMY, govde.y * 0.33), bedenKutu.min.z + 0.02,
    THREE.MathUtils.clamp(olcek * 0.75, 0.75, 1.25));

  let phase = Math.random() * Math.PI * 2;
  let airborne = 0;
  // The hub reads animator.contact every frame to fire a footstep sound when
  // the serial changes. A rival never touched it; the player does, so this
  // reports a real contact — one per half stride, alternating feet.
  const contact = { serial: 0, foot: 'left' };
  let lastStrideSign = 0;

  const animator = {
    contact,
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
      const strideSign = Math.sign(Math.sin(phase));
      if (running > 0.12 && strideSign !== 0 && strideSign !== lastStrideSign) {
        lastStrideSign = strideSign;
        contact.foot = strideSign > 0 ? 'left' : 'right';
        contact.serial += 1;
      }
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
    anchors,
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
