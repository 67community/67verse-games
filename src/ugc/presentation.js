// Shared, code-authored presentation for Creator and local UGC playback.
//
// The stage is intentionally non-interactive. It frames the canonical editor
// grid but never adds a walkable, collectible, hazard, or objective. Every
// playable silhouette inside the grid still comes from a real level piece.

export const UGC_ASSET_COLORS = Object.freeze({
  block: 0xd96f55,
  ramp: 0xf0b83f,
  spinner: 0xc75d86,
  bounce: 0x35ada7,
  score: 0xf2bd3e,
  spawn: 0x4f9a72,
  goal: 0x8066ad,
});

const MODE_PROFILES = Object.freeze({
  race: Object.freeze({
    sky: 0xb8dded,
    fog: 0xcce7ef,
    horizon: 0x8fbc7c,
    island: 0xf1dec0,
    playfield: 0xf7ead4,
    hills: 0x6f9f78,
  }),
  survival: Object.freeze({
    sky: 0xc9d9ee,
    fog: 0xdbe6f1,
    horizon: 0x8aac86,
    island: 0xead8c9,
    playfield: 0xf5e7dc,
    hills: 0x718c83,
  }),
  score: Object.freeze({
    sky: 0xbce3e0,
    fog: 0xd4ece7,
    horizon: 0x89b983,
    island: 0xf1dfb8,
    playfield: 0xf8eccd,
    hills: 0x6f9f7d,
  }),
});

const TEMPLATE_MARKS = Object.freeze({
  'race-starter': Object.freeze(
    Array.from({ length: 18 }, (_, index) => {
      const progress = index / 17;
      return {
        x: -6 + progress * 12,
        z: 0.5 + Math.sin(progress * Math.PI * 2) * 0.72,
      };
    }),
  ),
  'survival-ring': Object.freeze(
    Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * Math.PI * 2;
      return { x: Math.cos(angle) * 4.8, z: Math.sin(angle) * 4.8 };
    }),
  ),
  'score-circuit': Object.freeze(
    Array.from({ length: 28 }, (_, index) => {
      const angle = index / 28 * Math.PI * 2;
      return {
        x: Math.cos(angle) * 5.35,
        z: Math.sin(angle) * 5.35,
      };
    }),
  ),
});

export function ugcModeProfile(mode) {
  return MODE_PROFILES[mode] || MODE_PROFILES.race;
}

export function createUgcStage(THREE, scene, {
  mode = 'race',
  plotSize = 16,
  templateId = '',
  dynamicTemplate = false,
} = {}) {
  const resources = [];
  const group = new THREE.Group();
  group.name = 'ugc-presentation-stage';
  scene.add(group);

  const own = (resource) => {
    resources.push(resource);
    return resource;
  };
  const horizonMaterial = own(new THREE.MeshStandardMaterial({
    roughness: 0.98,
    metalness: 0,
  }));
  const islandMaterial = own(new THREE.MeshStandardMaterial({
    roughness: 0.86,
    metalness: 0,
  }));
  const hillMaterial = own(new THREE.MeshStandardMaterial({
    roughness: 0.96,
    flatShading: true,
    metalness: 0,
  }));
  const markMaterial = own(new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  }));

  // Background plane establishes a horizon without implying playable space.
  const horizon = new THREE.Mesh(
    own(new THREE.CircleGeometry(92, 40)),
    horizonMaterial,
  );
  horizon.name = 'ugc-horizon';
  horizon.userData.perfGroup = 'ugc-stage';
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = -0.48;
  horizon.receiveShadow = true;
  group.add(horizon);

  // The raised island frames the exact square grid. Its top remains below y=0,
  // so it is never part of collision or ground sampling.
  const islandRadius = Math.SQRT2 * plotSize * 0.5 + 0.9;
  const island = new THREE.Mesh(
    own(new THREE.CylinderGeometry(
      islandRadius,
      islandRadius + 0.45,
      0.48,
      40,
    )),
    islandMaterial,
  );
  island.name = 'ugc-grid-island';
  island.userData.perfGroup = 'ugc-stage';
  island.position.y = -0.25;
  island.receiveShadow = true;
  group.add(island);

  // One batched distant silhouette gives the stage a background layer for a
  // single draw. It sits far outside the editor bounds and has no collision.
  const transform = new THREE.Object3D();
  const supportsTemplatePresentation = dynamicTemplate || !!TEMPLATE_MARKS[templateId];
  if (supportsTemplatePresentation) {
    const hillGeometry = own(new THREE.DodecahedronGeometry(4.2, 0));
    const hills = new THREE.InstancedMesh(hillGeometry, hillMaterial, 9);
    hills.name = 'ugc-distant-hills';
    hills.userData.perfGroup = 'ugc-stage';
    const hillPositions = [
      [-29, -31, 0.95], [-18, -34, 0.72], [-5, -36, 1.05],
      [10, -35, 0.78], [24, -31, 1.12], [33, -20, 0.7],
      [-34, -18, 0.82], [-32, 1, 0.68], [34, 2, 0.78],
    ];
    hillPositions.forEach(([x, z, scale], index) => {
      transform.position.set(x, 1.25 * scale - 0.42, z);
      transform.rotation.set(0, (index * 0.61) % Math.PI, 0);
      transform.scale.set(scale * 1.65, scale * 0.62, scale * 1.18);
      transform.updateMatrix();
      hills.setMatrixAt(index, transform.matrix);
    });
    hills.instanceMatrix.needsUpdate = true;
    hills.computeBoundingBox();
    hills.computeBoundingSphere();
    group.add(hills);
  }

  let marks = null;
  if (supportsTemplatePresentation) {
    const markGeometry = own(new THREE.CircleGeometry(0.26, 12));
    marks = new THREE.InstancedMesh(markGeometry, markMaterial, 28);
    marks.name = 'ugc-template-ground-marks';
    marks.userData.perfGroup = 'ugc-stage';
    marks.frustumCulled = false;
    group.add(marks);
  }

  function setTemplate(nextTemplateId) {
    if (!marks) return;
    const points = TEMPLATE_MARKS[nextTemplateId] || [];
    marks.count = points.length;
    points.forEach(({ x, z }, index) => {
      transform.position.set(x, 0.024, z);
      transform.rotation.set(-Math.PI / 2, 0, 0);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      marks.setMatrixAt(index, transform.matrix);
    });
    marks.instanceMatrix.needsUpdate = true;
  }

  function setMode(nextMode) {
    const profile = ugcModeProfile(nextMode);
    scene.background = new THREE.Color(profile.sky);
    scene.fog = new THREE.Fog(profile.fog, 34, 105);
    horizonMaterial.color.setHex(profile.horizon);
    islandMaterial.color.setHex(profile.island);
    hillMaterial.color.setHex(profile.hills);
    markMaterial.color.setHex(
      nextMode === 'survival'
        ? UGC_ASSET_COLORS.spinner
        : nextMode === 'score'
          ? UGC_ASSET_COLORS.score
          : UGC_ASSET_COLORS.bounce,
    );
  }

  setMode(mode);
  setTemplate(templateId);

  return {
    group,
    setMode,
    setTemplate,
    playfieldColor(nextMode) {
      return ugcModeProfile(nextMode).playfield;
    },
    dispose() {
      scene.remove(group);
      for (const resource of resources) resource.dispose?.();
    },
  };
}
