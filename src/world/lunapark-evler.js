// lunapark-evler.js — the house row by the funfair.
//
// Oscar's pink-roof house (Nano -> Meshy, four angles, meshy-6) sits in
// public/assets/lunapark/ev.glb and is NOT modified — its own texture is the
// good one. Four of them stand where the reference circles, along the top edge
// beside the funfair. Two keep the pink roof; two turn yellow at DISPLAY time
// with a shader tweak, so the model file is never touched.

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const EV_BASE = `${import.meta.env?.BASE_URL ?? '/'}assets/lunapark/`;

// Measured off the model: 1.90 wide. Scaled down from the first pass — the
// houses were bigger than the blocks behind them — so a row reads as a little
// neighbourhood, not a wall.
const OLCEK = 2.7;

// A neat terrace of three, west of the x 18.7 vertical road so none straddles
// it — that road is what the right-hand house was spilling onto. They line up
// parallel to the z -50 avenue at a single setback, evenly spaced, facing it
// (doors south). All keep the model's own pink roof; the leftmost of the first
// four is dropped. z keeps the footprint clear of both the avenue in front and
// the map edge behind.
const EVLER = Object.freeze([
  { x: -3, z: -58 },
  { x: 5, z: -58 },
  { x: 13, z: -58 },
]);

export function buildLunaparkEvler({ THREE, scene }) {
  const kok = new THREE.Group();
  kok.name = 'lunapark:evler';
  scene.add(kok);

  const loader = new GLTFLoader();
  loader.load(`${EV_BASE}ev.glb`, (gltf) => {
    const kaynak = gltf.scene;
    // Model 0..h spanned; drop it so its base sits on the ground after scaling.
    const box = new THREE.Box3().setFromObject(kaynak);
    const tabanY = box.min.y;

    for (const ev of EVLER) {
      const kopya = kaynak.clone(true);
      kopya.scale.setScalar(OLCEK);
      kopya.position.set(ev.x, -tabanY * OLCEK, ev.z);
      kopya.rotation.y = 0;   // kapilar diger tarafa (ilk gecisin tersi)
      kok.add(kopya);
    }
  }, undefined, () => { /* model yoksa sessizce gec */ });

  return kok;
}
