// city-avenue.js — the hub's main street.
//
// Ported from the 67 World town build (sixseven-world): one straight avenue
// with pavements, shopfronts facing the promenade on both sides, and
// traffic moving through. That layout is what makes the lobby read as a place
// people wait around in rather than an empty plaza — there is somewhere to
// stand, something to look at, and constant motion at the edge of vision.
//
// Adapted rather than copied wholesale: the source avenue runs z=-60..+8 on an
// open plane, while this hub is a round island of radius ~34 with a plaza,
// skate garden and arrival court already placed. The street is shortened and
// centred so it threads between them without crossing a walkable district.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Authored town models carried over from the 67 World build. Three shop
// variants and two car variants, already optimised there (~0.8 MB, ~8k tris
// each) — the procedural boxes below stay as the placeholder until these land,
// so the street is never empty while they load.
const CITY_MODELS = Object.freeze({
  shop: Object.freeze({
    urls: ['/assets/city/shop_a.glb', '/assets/city/shop_b.glb', '/assets/city/shop_c.glb'],
    height: 5.4,
  }),
  car: Object.freeze({
    urls: ['/assets/city/car_a.glb', '/assets/city/car_b.glb'],
    height: 1.55,
  }),
});

/**
 * Scales a loaded model to a target height and re-seats it so its base sits on
 * y=0 and its footprint is centred. Returns a wrapper carrying the measured
 * footprint, which callers need to place signs and colliders against the real
 * facade rather than the raw bounding box.
 */
function normalizeCityModel(gltf, targetHeight) {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0) model.scale.setScalar(targetHeight / size.y);

  const scaled = new THREE.Box3().setFromObject(model);
  const centre = scaled.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -scaled.min.y, -centre.z);

  const wrap = new THREE.Group();
  wrap.add(model);
  const finalSize = scaled.getSize(new THREE.Vector3());
  wrap.userData.width = finalSize.x;
  wrap.userData.depth = finalSize.z;
  wrap.userData.maxZ = scaled.max.z - centre.z;

  // The overall bounding box includes porches and awnings, so a sign hung off
  // it floats in mid-air. Ray back into the facade at sign height to find the
  // wall it should actually sit on.
  wrap.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, targetHeight * 0.68, 10),
    new THREE.Vector3(0, 0, -1),
  );
  const hits = ray.intersectObject(model, true);
  wrap.userData.signZ = hits.length ? hits[0].point.z + 0.07 : wrap.userData.maxZ + 0.15;

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
    if (object.material?.map) object.material.map.anisotropy = 8;
  });
  return wrap;
}

export const AVENUE = Object.freeze({
  // The 67 World avenue, exact: carriageway along Z at x=0 from -60 to +8,
  // pavements at x=+/-7, kerbs at 5.15, shops at +/-12, and the plaza disc
  // where the road meets the park at z=+30.
  startZ: -60,
  endZ: 8,
  roadHalfWidth: 5,
  pavementWidth: 3.6,
  kerbX: 5.15,
  shopX: 12,
  plazaZ: 30,
  plazaR: 11,
  y: 0.03,
});

const SHOPS = Object.freeze([
  // [z, name, body colour, awning colour] — the 67 World storefronts at their
  // original addresses. Index < 4 is the west side (x=-12), the rest east.
  [-46, '67 EMLAK', 0xf3e6cf, 0xe0745e],
  [-33, 'MARKET', 0xcfe6f0, 0x5a80d6],
  [-20, 'FIRIN', 0xf0dcb8, 0xd9a95e],
  [-7, 'CICEKCI', 0xf7dce8, 0xe884b0],
  [-46, 'KAFE 67', 0xe8d9c4, 0x8a6a4a],
  [-33, 'BERBER', 0xf5f5f5, 0x5a80d6],
  [-20, 'OYUNCAKCI', 0xe3d4f5, 0xa78bda],
  [-7, 'PET SHOP', 0xd6eed4, 0x6fae72],
]);

/**
 * Shop sign face. Drawn once per shop into a small canvas — cheaper and
 * sharper than geometry lettering, and it keeps the names readable at the
 * distance players actually stand.
 */
function signTexture(text) {
  // The hub is also constructed headlessly by the scene-attribution tests,
  // where there is no DOM. Returning null there keeps the sign as a plain
  // board — the geometry, draw count and layout under test stay identical.
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fdf6e7';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = '#3a3428';
  ctx.font = '800 62px Figtree, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Builds the avenue into `group`.
 *
 * @param {object} api - { group, add, material, animated }
 *   `add` registers walkability/shadow flags the same way the rest of the hub
 *   does, so the street participates in ground sampling without special cases.
 */
export function buildCityAvenue({ group, add, material, animated }) {
  const A = AVENUE;
  const length = A.endZ - A.startZ;
  const midZ = (A.startZ + A.endZ) / 2;

  const MAT = {
    pavement: material(0xc3c6cb, { roughness: 1, flatShading: true }),
    kerb: material(0x9da1a8, { roughness: 1 }),
    paint: material(0xf2efe6, { roughness: 1 }),
    roof: material(0xd8d3c8, { roughness: 1, flatShading: true }),
    wood: material(0xb9854f, { roughness: 1, flatShading: true }),
    glass: material(0xcfe9f5, {
      roughness: 0.3,
      emissive: 0x88b8cc,
      emissiveIntensity: 0.25,
    }),
  };

  // ---- Promenade ----
  // The carriageway is gone by explicit order (no traffic in the hub). The
  // same strip is now a cream pedestrian promenade between the shopfronts.
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(A.roadHalfWidth * 2, 0.1, length),
    material(0xe9e2d2, { roughness: 0.8 }),
  );
  road.position.set(0, A.y, midZ);
  road.name = 'city:avenue-road';
  add(road, { walkable: true, camera: false, cast: false });

  // ---- Pavements and kerbs ----
  for (const side of [-1, 1]) {
    const pavement = new THREE.Mesh(
      new THREE.BoxGeometry(A.pavementWidth, 0.22, length),
      MAT.pavement,
    );
    pavement.position.set(side * 7, A.y + 0.03, midZ);
    pavement.name = 'city:pavement';
    add(pavement, { walkable: true, camera: false, cast: false });

    const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, length), MAT.kerb);
    kerb.position.set(side * A.kerbX, A.y + 0.04, midZ);
    kerb.name = 'city:kerb';
    add(kerb, { camera: false, cast: false });
  }

  // ---- Plaza where the road meets the park (z=+30), with the fountain ----
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(A.plazaR, A.plazaR, 0.16, 26),
    MAT.pavement,
  );
  plaza.position.set(0, A.y + 0.01, A.plazaZ);
  plaza.name = 'city:plaza';
  add(plaza, { walkable: true, camera: false, cast: false });

  {
    const stone = material(0xd8d3c8, { flatShading: true, roughness: 1 });
    const water = material(0x6fc0e8, { roughness: 0.2, transparent: true, opacity: 0.85 });
    const fountain = new THREE.Group();
    fountain.name = 'city:fountain';
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.7, 18), stone);
    base.position.y = 0.35;
    fountain.add(base);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.12, 18), water);
    pool.position.y = 0.72;
    fountain.add(pool);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 10), stone);
    column.position.y = 1.4;
    fountain.add(column);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.4, 12), stone);
    bowl.position.y = 2.3;
    fountain.add(bowl);
    fountain.position.set(0, A.y, A.plazaZ);
    fountain.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    group.add(fountain);
  }

  // Benches at their original spots: two along the avenue, two on the plaza.
  {
    const wood = material(0xb9854f, { flatShading: true, roughness: 1 });
    const BENCHES = [
      [-8.6, -36, Math.PI / 2], [8.6, -16, -Math.PI / 2],
      [-4, 33, 0.8], [5, 35, -0.8],
    ];
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), wood, BENCHES.length);
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), wood, BENCHES.length);
    const bm = new THREE.Matrix4();
    const bq = new THREE.Quaternion();
    const be = new THREE.Euler();
    BENCHES.forEach(([x, z, rot], i) => {
      be.set(0, rot, 0);
      bq.setFromEuler(be);
      bm.compose(new THREE.Vector3(x, 0.55, z), bq, new THREE.Vector3(1, 1, 1));
      seats.setMatrixAt(i, bm);
      const backOffset = new THREE.Vector3(0, 0.3, -0.28).applyQuaternion(bq);
      bm.compose(new THREE.Vector3(x + backOffset.x, 0.55 + backOffset.y, z + backOffset.z), bq, new THREE.Vector3(1, 1, 1));
      backs.setMatrixAt(i, bm);
    });
    seats.instanceMatrix.needsUpdate = true;
    backs.instanceMatrix.needsUpdate = true;
    seats.name = 'city:bench-seats';
    backs.name = 'city:bench-backs';
    add(seats, { camera: false, cast: false });
    add(backs, { camera: false, cast: false });
  }

  // ---- Shopfronts ----
  // Bodies, roofs, windows, doors and awnings are one mesh family each so the
  // whole parade stays a handful of draw calls; only the signs carry their own
  // texture, which is unavoidable because each one reads a different name.
  const SHOP_W = 7;
  const SHOP_H = 4.6;
  const SHOP_D = 6;

  // One instanced family per shop part. Eight shops built as groups would cost
  // ~48 draw calls on their own; batched they cost five, which is what keeps
  // the hub inside its 120-draw budget.
  const parts = {
    body: new THREE.InstancedMesh(
      new THREE.BoxGeometry(SHOP_W, SHOP_H, SHOP_D),
      material(0xffffff, { roughness: 0.95, flatShading: true }), SHOPS.length,
    ),
    roof: new THREE.InstancedMesh(
      new THREE.BoxGeometry(SHOP_W + 0.6, 0.4, SHOP_D + 0.6), MAT.roof, SHOPS.length,
    ),
    window: new THREE.InstancedMesh(
      new THREE.BoxGeometry(SHOP_W * 0.5, 1.7, 0.12), MAT.glass, SHOPS.length,
    ),
    door: new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.3, 2.3, 0.14), MAT.wood, SHOPS.length,
    ),
    awning: new THREE.InstancedMesh(
      new THREE.BoxGeometry(SHOP_W * 0.9, 0.12, 1.6),
      material(0xffffff, { roughness: 0.9, flatShading: true }), SHOPS.length,
    ),
  };

  const scratch = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const shopQuat = new THREE.Quaternion();
  const shopEuler = new THREE.Euler();
  const unit = new THREE.Vector3(1, 1, 1);
  // Recorded per shop so the authored model can be dropped onto the exact same
  // spot the placeholder occupies, and its sign re-seated on the real facade.
  const shopSites = [];

  /** Collapses a placeholder shop to zero scale once its model has landed. */
  function hidePlaceholders(variantIndex) {
    const empty = new THREE.Matrix4().makeScale(0, 0, 0);
    shopSites.forEach((site) => {
      if (site.variant !== variantIndex) return;
      for (const mesh of Object.values(parts)) mesh.setMatrixAt(site.index, empty);
    });
    for (const mesh of Object.values(parts)) mesh.instanceMatrix.needsUpdate = true;
  }

  SHOPS.forEach(([z, name, bodyColor, awningColor], index) => {
    const side = index < 4 ? -1 : 1;
    const x = side * A.shopX;
    // Storefront faces the road.
    shopEuler.set(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    shopQuat.setFromEuler(shopEuler);
    const shopMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z), shopQuat, unit,
    );

    // Each part's offset is expressed in the shop's own space, then folded
    // into the shop transform — the same result as parenting, without the
    // per-shop Group.
    const place = (mesh, offset, tilt = 0) => {
      local.makeRotationX(tilt);
      local.setPosition(offset);
      scratch.multiplyMatrices(shopMatrix, local);
      mesh.setMatrixAt(index, scratch);
    };

    place(parts.body, new THREE.Vector3(0, SHOP_H / 2, 0));
    place(parts.roof, new THREE.Vector3(0, SHOP_H + 0.2, 0));
    place(parts.window, new THREE.Vector3(-SHOP_W * 0.17, 1.6, SHOP_D / 2 + 0.04));
    place(parts.door, new THREE.Vector3(SHOP_W * 0.3, 1.15, SHOP_D / 2 + 0.05));
    place(parts.awning, new THREE.Vector3(0, 2.8, SHOP_D / 2 + 0.75), -0.18);

    parts.body.setColorAt(index, new THREE.Color(bodyColor));
    parts.awning.setColorAt(index, new THREE.Color(awningColor));

    // Signs keep their own mesh: each carries a different name texture, so
    // they cannot share a material without an atlas.
    const signMap = signTexture(name);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(SHOP_W * 0.86, 0.95),
      new THREE.MeshStandardMaterial(
        signMap ? { map: signMap, roughness: 0.9 } : { color: 0xfdf6e7, roughness: 0.9 },
      ),
    );
    sign.position.set(0, 3.7, SHOP_D / 2 + 0.07);
    sign.applyMatrix4(shopMatrix);
    sign.name = `city:sign-${name.toLowerCase().replace(/\s+/g, '-')}`;
    add(sign, { camera: false, cast: false });

    shopSites.push({
      index,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      matrix: shopMatrix,
      sign,
      // Three shop models cycle across the eight storefronts.
      variant: index % CITY_MODELS.shop.urls.length,
    });
  });

  for (const [key, mesh] of Object.entries(parts)) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = `city:shop-${key}`;
    add(mesh, { camera: false, cast: false });
  }

  // ---- Authored model swap ----
  // Each variant loads once and is cloned onto the sites that asked for it.
  // Failure is silent by design: the procedural street already reads correctly,
  // so a missing model degrades to the placeholder instead of an empty lot.
  // The hub is also built headlessly by the scene-attribution tests, where a
  // root-relative URL has no origin to resolve against. Skip the fetch there:
  // the placeholder street is exactly what those tests measure.
  if (typeof document === 'undefined') {
    return { shopCount: SHOPS.length, carCount: 0 };
  }

  const loader = new GLTFLoader();

  for (const [variantIndex, url] of CITY_MODELS.shop.urls.entries()) {
    loader.load(url, (gltf) => {
      const proto = normalizeCityModel(gltf, CITY_MODELS.shop.height);
      shopSites.forEach((site) => {
        if (site.variant !== variantIndex) return;
        const instance = proto.clone();
        instance.applyMatrix4(site.matrix);
        instance.name = `city:shop-model-${site.name}`;
        group.add(instance);
        // Re-seat the sign onto the model's real facade and keep it inside the
        // shopfront's width.
        if (site.sign) {
          site.sign.position.set(0, Math.min(3.7, CITY_MODELS.shop.height * 0.74), proto.userData.signZ);
          const maxWidth = proto.userData.width * 0.82;
          const signWidth = site.sign.geometry.parameters.width;
          if (signWidth > maxWidth) site.sign.scale.x = maxWidth / signWidth;
          site.sign.position.applyMatrix4(site.matrix);
          site.sign.quaternion.setFromRotationMatrix(site.matrix);
        }
      });
      // Hide the placeholder parts for the sites this variant covered.
      hidePlaceholders(variantIndex);
    }, undefined, () => { /* keep the procedural shop */ });
  }

  // Solid footprints the player cannot walk through: the eight shops and the
  // fountain. Shops rotate +/-90 degrees, so width and depth swap in world
  // space (7x6 local becomes 6x7 on the ground).
  const colliders = SHOPS.map(([z], index) => {
    const side = index < 4 ? -1 : 1;
    const x = side * A.shopX;
    return { minX: x - 3.2, maxX: x + 3.2, minZ: z - 3.7, maxZ: z + 3.7, topY: 5.4 };
  });
  colliders.push({
    minX: -3.6, maxX: 3.6,
    minZ: A.plazaZ - 3.6, maxZ: A.plazaZ + 3.6,
    topY: 2.6,
  });

  return { shopCount: SHOPS.length, carCount: 0, colliders };
}
