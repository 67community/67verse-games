// world/friendsies.js — fRiENDSiES walking around 67 Park.
//
// Guests, not the player: Oscar's own collection, dropped into the hub so the
// park has people in it. The models are posed meshes with no skeleton and no
// clips, so a walk cycle is not available — what sells the walk is the route,
// the facing, and a step bob, which is the same trick the 67VERSE lobby uses
// for its standers.
//
// They cost roughly five draw calls each and carry their own textures, so they
// load on the high quality tier only and after the world is already on screen.
// A phone gets the park without them rather than a slower park with them.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = `${import.meta.env?.BASE_URL ?? '/'}friendsies/`;

// Each guest walks a there-and-back line on open ground, clear of the roads
// and of the activity markers, so nobody blocks a start or strolls into
// traffic. Height is the hub's own character height.
export const FRIENDSIE_GUESTS = Object.freeze([
  Object.freeze({ file: 'fs_67.glb', from: [-7, 6], to: [7, 6], speed: 1.05 }),
  Object.freeze({ file: 'friendsie.glb', from: [4, 28], to: [-6, 30], speed: 0.9 }),
  Object.freeze({ file: 'fs_8888.glb', from: [-9, -21.5], to: [7, -21.5], speed: 1.15 }),
  Object.freeze({ file: 'fs_2222.glb', from: [40.5, -44], to: [40.5, -31], speed: 0.95 }),
]);

const GUEST_HEIGHT = 1.8;

function groundGuest(model) {
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0) model.scale.multiplyScalar(GUEST_HEIGHT / size.y);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z);
  return box;
}

export function loadFriendsies({ group, animated, sampleGround }) {
  if (typeof document === 'undefined') return Promise.resolve(0);
  const loader = new GLTFLoader();
  return Promise.all(FRIENDSIE_GUESTS.map((guest, index) => new Promise((resolve) => {
    loader.load(`${BASE}${guest.file}`, (gltf) => {
      const model = gltf.scene;
      const box = groundGuest(model);
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      const holder = new THREE.Group();
      holder.name = `guest:${guest.file.replace('.glb', '')}`;
      holder.userData.perfGroup = 'hub-guests';
      holder.add(model);

      const [ax, az] = guest.from;
      const [bx, bz] = guest.to;
      const span = Math.hypot(bx - ax, bz - az) || 1;
      // Each guest starts somewhere else along its own line, so four of them
      // do not walk in step.
      let travelled = (index / FRIENDSIE_GUESTS.length) * span * 2;
      group.add(holder);

      animated?.push((time, delta) => {
        const step = Number.isFinite(delta) ? delta : 1 / 60;
        travelled = (travelled + guest.speed * step) % (span * 2);
        // Out along the line, then back: a fold of the distance travelled.
        const forward = travelled <= span;
        const t = (forward ? travelled : span * 2 - travelled) / span;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        holder.position.set(x, sampleGround?.(x, z) ?? 0, z);
        holder.rotation.y = Math.atan2(
          forward ? bx - ax : ax - bx,
          forward ? bz - az : az - bz,
        );
        model.position.y = -box.min.y + Math.abs(Math.sin(travelled * 3.4)) * 0.05;
      });
      resolve(1);
    }, undefined, () => resolve(0));
  }))).then((loaded) => loaded.reduce((sum, one) => sum + one, 0));
}
