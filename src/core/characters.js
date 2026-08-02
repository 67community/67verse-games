// characters.js — character instances plus the articulated proof-of-feel rig.
//
// The imported Ghost is intentionally development-only: it has no skin or
// animation clips, so showing it in normal play makes locomotion look like a
// glide. Public local play uses the low-cost QA Runner until an authored,
// skinned production character clears the character acceptance gate.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCharacterAnimator } from '../player-visuals.js';
import { CHARACTER_CANDIDATES, DEFAULT_CHARACTER_ID } from '../character-candidates.js';
import {
  activeDevelopmentCharacterCandidate,
  allowsDevelopmentCharacterCandidate,
  clearProductionCharacterByteCache,
  loadProductionCharacterCandidate,
} from './production-character.js';

export const ROSTER = [
  { id: 'qa-runner', name: 'QA Runner', color: 0xd86f5d, head: 'qa-runner', humanoid: true },
  { id: 'ghost',    name: 'Ghost',    color: 0xf6f6f3, head: 'ghost' },
  { id: 'kid',      name: 'Kid 1',    color: 0xf2c9a0, head: 'sphere', humanoid: true },
  { id: 'shark',    name: 'Shark',    color: 0x7fa8b8, head: 'fin' },
  { id: 'ramen',    name: 'Ramen',    color: 0xe8c46a, head: 'bowl' },
  { id: 'dumpling', name: 'Dumpling', color: 0xf0e4d0, head: 'sphere' },
  { id: 'bolt',     name: 'Bolt',     color: 0xe8b64a, head: 'bolt' },
  { id: 'alien',    name: 'Alien',    color: 0xa8e0b0, head: 'sphere' },
  { id: 'skeleton', name: 'Skeleton', color: 0xe8e4da, head: 'skull' },
  { id: 'cat',      name: 'Cat',      color: 0xd8a878, head: 'ears' },
  { id: 'robot',    name: 'Robot',    color: 0xb8c0c8, head: 'box' },
  { id: 'pumpkin',  name: 'Pumpkin',  color: 0xe08848, head: 'sphere' },
  { id: 'ninja',    name: 'Ninja',    color: 0x484850, head: 'sphere', humanoid: true },
];

const gltfLoader = new GLTFLoader();
let ghostTemplate = null;

export function allowsDevelopmentGhost(search = globalThis.location?.search || '') {
  const query = new URLSearchParams(search);
  return query.has('dev') && query.get('ghost') === '1';
}

export function resolvePlayableCharacterId(
  requestedId,
  search = globalThis.location?.search || '',
) {
  return requestedId === 'ghost' && !allowsDevelopmentGhost(search)
    ? 'qa-runner'
    : requestedId;
}

function loadGhost() {
  if (ghostTemplate) return Promise.resolve(ghostTemplate);
  return new Promise((resolve) => {
    gltfLoader.load('./ghost.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(1.9 / size.y);
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y = -box2.min.y;
      model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      ghostTemplate = model;
      resolve(model);
    }, undefined, () => resolve(null));
  });
}

function vinyl(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, ...extra });
}

function qaJoint(role, x, y, z) {
  const joint = new THREE.Group();
  joint.name = `qa-joint:${role}`;
  joint.position.set(x, y, z);
  joint.userData.walkRole = role;
  return joint;
}

function coloredPart(geometry, color, {
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  geometry.applyMatrix4(matrix);
  const shade = new THREE.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergedColorMesh(parts, material) {
  const geometry = mergeGeometries(parts, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Five-renderable articulated QA avatar.
 *
 * One vertex-coloured body mesh plus four independently pivoted limbs keeps
 * the silhouette, 6/7 chest signal and readable walk/run motion while cutting
 * the former 21 draw calls to five. This same bounded representation is safe
 * for the hub, mobile play and crowd previews until an authored skinned asset
 * passes the production gate.
 */
function buildQARunner(skinTone) {
  const root = new THREE.Group();
  root.name = 'qa-runner:articulated-batched';
  root.userData.qaArticulated = true;
  root.userData.qaDrawBudget = 5;

  const coral = 0xd86f5d;
  const aqua = 0x58a9a4;
  const gold = 0xf2bf52;
  const ink = 0x242d38;
  const face = skinTone ? new THREE.Color(skinTone).getHex() : 0xf1caa9;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
  });

  const body = qaJoint('torso', 0, 0, 0);
  body.add(mergedColorMesh([
    coloredPart(new THREE.SphereGeometry(0.35, 12, 9), aqua, {
      position: [0, 0.78, 0],
      scale: [1.05, 0.72, 0.9],
    }),
    coloredPart(new THREE.CapsuleGeometry(0.36, 0.42, 4, 8), coral, {
      position: [0, 1.26, 0],
      scale: [1.08, 1, 0.86],
    }),
    coloredPart(new THREE.SphereGeometry(0.48, 12, 10), face, {
      position: [0, 1.66, 0],
      scale: [1.04, 0.92, 0.94],
    }),
    coloredPart(new THREE.SphereGeometry(0.055, 6, 5), ink, {
      position: [-0.17, 1.74, 0.435],
      scale: [1, 1.18, 1],
    }),
    coloredPart(new THREE.SphereGeometry(0.055, 6, 5), ink, {
      position: [0.17, 1.74, 0.435],
      scale: [1, 1.18, 1],
    }),
    coloredPart(new THREE.TorusGeometry(0.08, 0.014, 4, 9, Math.PI), ink, {
      position: [0, 1.575, 0.438],
      rotation: [0, 0, Math.PI],
    }),
    coloredPart(new THREE.TorusGeometry(0.075, 0.022, 4, 9), gold, {
      position: [-0.105, 1.29, 0.342],
      scale: [1, 1.15, 1],
    }),
    coloredPart(new THREE.BoxGeometry(0.14, 0.035, 0.028), aqua, {
      position: [0.115, 1.33, 0.345],
    }),
    coloredPart(new THREE.BoxGeometry(0.035, 0.15, 0.028), aqua, {
      position: [0.125, 1.275, 0.345],
      rotation: [0, 0, -0.45],
    }),
  ], material));

  const buildArm = (side) => {
    const sx = side === 'l' ? -1 : 1;
    const shoulder = qaJoint(`arm-${side}`, sx * 0.43, 1.37, 0);
    shoulder.rotation.z = sx * -0.12;
    shoulder.add(mergedColorMesh([
      coloredPart(new THREE.CapsuleGeometry(0.105, 0.3, 4, 8), side === 'l' ? aqua : gold, {
        position: [0, -0.24, 0],
      }),
      coloredPart(new THREE.CapsuleGeometry(0.095, 0.24, 4, 8), face, {
        position: [0, -0.66, 0],
      }),
      coloredPart(new THREE.SphereGeometry(0.125, 8, 6), face, {
        position: [0, -0.87, 0],
      }),
    ], material));
    return shoulder;
  };

  const buildLeg = (side) => {
    const sx = side === 'l' ? -1 : 1;
    const hip = qaJoint(`leg-${side}`, sx * 0.2, 0.78, 0);
    hip.add(mergedColorMesh([
      coloredPart(new THREE.CapsuleGeometry(0.13, 0.32, 4, 8), ink, {
        position: [0, -0.25, 0],
      }),
      coloredPart(new THREE.CapsuleGeometry(0.12, 0.27, 4, 8), ink, {
        position: [0, -0.7, 0],
      }),
      coloredPart(new THREE.CapsuleGeometry(0.13, 0.2, 4, 8), side === 'l' ? aqua : gold, {
        position: [0, -1.01, 0.1],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1.05, 1, 1.18],
      }),
    ], material));
    return hip;
  };

  root.add(body, buildArm('l'), buildArm('r'), buildLeg('l'), buildLeg('r'));
  return root;
}

function buildHead(type, color) {
  const g = new THREE.Group();
  const mat = vinyl(color);
  if (type === 'box') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.8), mat));
  } else if (type === 'skull') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), mat);
    s.scale.set(1, 0.95, 0.95); g.add(s);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.42), mat);
    jaw.position.set(0, -0.38, 0.08); g.add(jaw);
  } else if (type === 'ears') {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 16), mat));
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 10), mat);
      ear.position.set(sx * 0.3, 0.55, 0); g.add(ear);
    }
  } else if (type === 'fin') {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), mat));
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), mat);
    fin.rotation.x = -Math.PI / 2.4; fin.position.set(0, 0.5, -0.15); g.add(fin);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12), mat);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.05, 0.55); g.add(nose);
  } else if (type === 'bowl') {
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), vinyl(0xfbf8f2));
    bowl.scale.y = 0.75; g.add(bowl);
    const noodles = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), vinyl(color));
    noodles.position.y = 0.18; noodles.scale.y = 0.55; g.add(noodles);
  } else if (type === 'bolt') {
    const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat);
    b.scale.set(0.7, 1.25, 0.45); g.add(b);
  } else { // sphere
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 16), mat));
  }
  // face (front = +Z)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeMat);
    eye.position.set(sx * 0.18, 0.05, 0.48); g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
  mouth.position.set(0, -0.16, 0.5); g.add(mouth);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createCharacters(ctx, {
  candidateManifests = CHARACTER_CANDIDATES,
  candidateSearch = globalThis.location?.search || '',
  loadCandidate = loadProductionCharacterCandidate,
} = {}) {
  const stats = {
    activeInstances: 0,
    byLod: new Map(),
  };
  const candidateReports = new Map();

  function emitCandidateReport(id, report, fallback = null) {
    const detail = Object.freeze({
      id,
      status: report?.status || 'load-error',
      fallback,
      errors: Object.freeze([...(report?.errors || [])]),
      warnings: Object.freeze([...(report?.warnings || [])]),
      metrics: report?.metrics || Object.freeze({}),
      usedFallbackAnchors: report?.usedFallbackAnchors || Object.freeze([]),
    });
    candidateReports.set(id, detail);
    ctx.bus?.emit?.('character-candidate-report', detail);
    return detail;
  }

  function trackInstance(lod) {
    stats.activeInstances++;
    stats.byLod.set(lod, (stats.byLod.get(lod) || 0) + 1);
    let released = false;
    return () => {
      if (released) return false;
      released = true;
      stats.activeInstances = Math.max(0, stats.activeInstances - 1);
      stats.byLod.set(lod, Math.max(0, (stats.byLod.get(lod) || 0) - 1));
      return true;
    };
  }

  async function buildMesh(id, { skinTone } = {}) {
    const safeId = resolvePlayableCharacterId(id);
    const def = ROSTER.find((r) => r.id === safeId) || ROSTER[0];
    if (def.head === 'qa-runner') return buildQARunner(skinTone);
    if (def.head === 'ghost') {
      const tpl = await loadGhost();
      if (tpl) {
        const c = tpl.clone();
        const g = new THREE.Group();
        g.userData.sharedCharacterResources = true;
        g.add(c);
        return g;
      }
    }
    const bodyColor = def.humanoid && skinTone ? new THREE.Color(skinTone).getHex() : def.color;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 6, 14), vinyl(bodyColor));
    body.position.y = 0.86; body.castShadow = true;
    const head = buildHead(def.head, bodyColor);
    head.position.y = 1.7;
    head.userData.walkRole = 'head';
    // Separate limbs give the temporary roster a real readable gait. Final
    // authored character rigs can simply omit these tags and use their own
    // animation clips; player-visuals gracefully falls back to root motion.
    const limb = (radius, length, x, y, role, tilt = 0) => {
      const part = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 5, 10), vinyl(bodyColor));
      part.position.set(x, y, 0);
      part.rotation.z = tilt;
      part.userData.walkRole = role;
      part.castShadow = true;
      return part;
    };
    const legL = limb(0.13, 0.34, -0.19, 0.27, 'leg-l');
    const legR = limb(0.13, 0.34, 0.19, 0.27, 'leg-r');
    const armL = limb(0.11, 0.34, -0.43, 0.92, 'arm-l', -0.16);
    const armR = limb(0.11, 0.34, 0.43, 0.92, 'arm-r', 0.16);
    g.add(body, head, legL, legR, armL, armR);
    g.userData.sharedCharacterResources = false;
    return g;
  }

  async function createInstance(id, {
    skinTone,
    lod = 'hero',
    variant = 'default',
    shadow = 'hero',
  } = {}) {
    const candidateManifest = candidateManifests.find((entry) => entry.id === id);
    if (
      candidateManifest
      && (
        allowsDevelopmentCharacterCandidate(candidateManifest.id, candidateSearch)
        || candidateManifest.id === DEFAULT_CHARACTER_ID
      )
    ) {
      try {
        const candidate = await loadCandidate(candidateManifest);
        const root = new THREE.Group();
        root.name = `character:${candidate.id}:root`;
        root.userData.characterInstance = true;
        root.userData.characterId = candidate.id;
        root.userData.developmentCharacterCandidate = true;

        const visual = new THREE.Group();
        visual.name = `character:${candidate.id}:visual`;
        visual.add(candidate.model);
        root.add(visual);
        candidate.model.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = shadow === 'hero';
          object.receiveShadow = false;
        });

        const report = emitCandidateReport(candidate.id, candidate.report);
        const releaseInstance = trackInstance(lod);
        let disposed = false;
        return {
          id: candidate.id,
          def: Object.freeze({
            id: candidate.id,
            name: candidate.name,
            productionCandidate: true,
          }),
          lod,
          variant,
          root,
          visual,
          mesh: candidate.model,
          anchors: Object.freeze({ root, ...candidate.anchors }),
          animator: candidate.animator,
          bounds: candidate.bounds,
          candidateReport: report,
          dispose() {
            if (disposed) return;
            disposed = true;
            releaseInstance();
            root.removeFromParent();
            candidate.dispose();
          },
        };
      } catch (error) {
        const report = emitCandidateReport(
          candidateManifest.id,
          error?.report || {
            status: 'load-error',
            errors: [error instanceof Error ? error.message : String(error)],
          },
          'qa-runner',
        );
        const fallback = await createInstance('qa-runner', {
          skinTone,
          lod,
          variant,
          shadow,
        });
        fallback.requestedId = candidateManifest.id;
        fallback.candidateReport = report;
        fallback.root.userData.characterCandidateFallback = candidateManifest.id;
        return fallback;
      }
    }

    const safeId = resolvePlayableCharacterId(id);
    const def = ROSTER.find((entry) => entry.id === safeId) || ROSTER[0];
    const root = new THREE.Group();
    root.name = `character:${def.id}:root`;
    root.userData.characterInstance = true;
    root.userData.characterId = def.id;

    const visual = new THREE.Group();
    visual.name = `character:${def.id}:visual`;
    root.add(visual);

    const mesh = await buildMesh(def.id, { skinTone });
    mesh.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = shadow === 'hero';
      object.receiveShadow = false;
    });
    visual.add(mesh);

    const anchors = { root };
    const anchorDefs = {
      head: [0, 1.42, 0],
      face: [0, 1.48, 0.42],
      back: [0, 0.85, -0.3],
      handLeft: [-0.46, 0.92, 0],
      handRight: [0.46, 0.92, 0],
    };
    for (const [name, [x, y, z]] of Object.entries(anchorDefs)) {
      const anchor = new THREE.Group();
      anchor.name = `anchor:${name}`;
      anchor.position.set(x, y, z);
      anchor.userData.characterAnchor = name;
      visual.add(anchor);
      anchors[name] = anchor;
    }

    const animator = createCharacterAnimator(visual);
    const releaseInstance = trackInstance(lod);
    let disposed = false;
    return {
      id: def.id,
      def,
      lod,
      variant,
      root,
      visual,
      mesh,
      anchors: Object.freeze(anchors),
      animator,
      bounds: Object.freeze({ height: 1.9, radius: 0.46, groundOffset: 0 }),
      dispose() {
        if (disposed) return;
        disposed = true;
        releaseInstance();
        animator.reset();
        root.removeFromParent();
        if (mesh.userData.sharedCharacterResources) return;
        mesh.traverse((object) => {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material?.dispose?.();
        });
      },
    };
  }

  return {
    ROSTER,
    candidateManifests,
    buildMesh,
    createInstance,
    getStats() {
      return {
        activeInstances: stats.activeInstances,
        byLod: Object.fromEntries(stats.byLod),
      };
    },
    equippedId() {
      const candidate = activeDevelopmentCharacterCandidate(
        candidateManifests,
        candidateSearch,
      );
      if (candidate) return candidate.id;
      const requested = ctx.save.get('equipped', null);
      // First-run default: the project main character (hero-67) takes over
      // local play. An explicit later shop selection still wins.
      if (
        requested == null
        && candidateManifests.some((entry) => entry.id === DEFAULT_CHARACTER_ID)
      ) {
        return DEFAULT_CHARACTER_ID;
      }
      return resolvePlayableCharacterId(requested ?? 'qa-runner');
    },
    getCandidateReports() {
      return Object.freeze(Object.fromEntries(candidateReports));
    },
    clearCandidateByteCache() {
      return clearProductionCharacterByteCache();
    },
    selectedId() {
      const selected = ctx.save.get('equipped', 'qa-runner');
      return ROSTER.some(({ id }) => id === selected) ? selected : 'qa-runner';
    },
    equip(id) {
      const selectedId = ROSTER.some((entry) => entry.id === id) ? id : 'qa-runner';
      // Preserve the user's durable choice. Runtime normalization is a
      // reversible presentation fallback, not a destructive save migration:
      // when Ghost gains a production rig (or the dev toggle is enabled), the
      // saved selection becomes usable without asking the player again.
      if (!ctx.save.set('equipped', selectedId)) return false;
      ctx.bus.emit('character-equipped', {
        id: resolvePlayableCharacterId(selectedId),
      });
      return true;
    },
    applySkinTone(group, hex) {
      group.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.set(hex); });
    },
  };
}
