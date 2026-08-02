// production-character.js — gated GLB adapter for externally authored rigs.
//
// This module never approves an asset. It validates and adapts a supplied
// development candidate to the canonical character instance contract. Public
// play remains on the safe QA Runner until a separate release decision changes
// that policy.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  classifyLocomotionState,
  createCharacterAnimator,
} from '../player-visuals.js';

export const CHARACTER_MANIFEST_VERSION = 1;
export const PRODUCTION_CLIP_KEYS = Object.freeze([
  'idle',
  'walk',
  'run',
  'jump',
  'fall',
  'land',
  'celebrate',
]);
export const CHARACTER_ANCHOR_KEYS = Object.freeze([
  'head',
  'face',
  'back',
  'handLeft',
  'handRight',
]);
export const DEFAULT_CHARACTER_BUDGETS = Object.freeze({
  maxFileBytes: 4_000_000,
  maxTriangles: 45_000,
  maxDrawCalls: 12,
  maxBones: 80,
  maxTextures: 8,
  maxTextureSize: 2048,
});
export const DEFAULT_CHARACTER_ANCHORS = Object.freeze({
  head: Object.freeze([0, 1.42, 0]),
  face: Object.freeze([0, 1.48, 0.42]),
  back: Object.freeze([0, 0.85, -0.3]),
  handLeft: Object.freeze([-0.46, 0.92, 0]),
  handRight: Object.freeze([0.46, 0.92, 0]),
});

const candidateBytes = new Map();

function finiteNumber(value) {
  return Number.isFinite(value);
}

function stringList(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry) => entry.trim());
}

function vector3(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every(finiteNumber);
}

export function validateProductionCharacterManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return Object.freeze(['manifest must be an object']);
  }
  if (manifest.schemaVersion !== CHARACTER_MANIFEST_VERSION) {
    errors.push(`schemaVersion must be ${CHARACTER_MANIFEST_VERSION}`);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(manifest.id || '')) {
    errors.push('id must be a 2-48 character lowercase slug');
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    errors.push('name is required');
  }
  if (typeof manifest.url !== 'string' || !manifest.url.trim().toLowerCase().endsWith('.glb')) {
    errors.push('url must point to one self-contained .glb');
  } else if (/^(?:https?:)?\/\//i.test(manifest.url.trim())) {
    errors.push('url must be a same-origin relative path');
  }
  if (manifest.activation !== 'development') {
    errors.push('activation must remain "development" until release approval');
  }
  if (manifest.releaseApproved === true) {
    errors.push('releaseApproved is not accepted by the development adapter');
  }
  if (!finiteNumber(manifest.targetHeight) || manifest.targetHeight < 1 || manifest.targetHeight > 2.6) {
    errors.push('targetHeight must be from 1.0 to 2.6 world units');
  }
  if (!['+z', '-z'].includes(manifest.forwardAxis)) {
    errors.push('forwardAxis must be "+z" or "-z"');
  }
  if (!manifest.clips || typeof manifest.clips !== 'object') {
    errors.push('clips mapping is required');
  } else {
    for (const key of PRODUCTION_CLIP_KEYS) {
      if (stringList(manifest.clips[key]).length === 0) {
        errors.push(`clips.${key} needs at least one exact clip-name candidate`);
      }
    }
  }
  if (manifest.anchors != null && typeof manifest.anchors !== 'object') {
    errors.push('anchors must be an object when provided');
  } else {
    for (const [key, value] of Object.entries(manifest.anchors || {})) {
      if (!CHARACTER_ANCHOR_KEYS.includes(key)) {
        errors.push(`anchors.${key} is not a supported anchor`);
        continue;
      }
      if (
        typeof value !== 'string'
        && (
          !value
          || typeof value !== 'object'
          || typeof value.node !== 'string'
          || (value.position != null && !vector3(value.position))
          || (value.rotation != null && !vector3(value.rotation))
        )
      ) {
        errors.push(`anchors.${key} must be a node name or node transform`);
      }
    }
  }
  for (const [key, fallback] of Object.entries(DEFAULT_CHARACTER_BUDGETS)) {
    const value = manifest.budgets?.[key] ?? fallback;
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(`budgets.${key} must be a positive integer`);
    }
  }
  return Object.freeze(errors);
}

export function defineProductionCharacterManifest(manifest) {
  const errors = validateProductionCharacterManifest(manifest);
  if (errors.length) {
    throw new TypeError(`Invalid production character manifest: ${errors.join('; ')}`);
  }
  const anchors = Object.fromEntries(
    Object.entries(manifest.anchors || {}).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? Object.freeze({ node: value })
        : Object.freeze({
          node: value.node,
          ...(value.position ? { position: Object.freeze([...value.position]) } : {}),
          ...(value.rotation ? { rotation: Object.freeze([...value.rotation]) } : {}),
        }),
    ]),
  );
  return Object.freeze({
    ...manifest,
    clips: Object.freeze(Object.fromEntries(
      PRODUCTION_CLIP_KEYS.map((key) => [
        key,
        Object.freeze(stringList(manifest.clips[key])),
      ]),
    )),
    anchors: Object.freeze(anchors),
    budgets: Object.freeze({
      ...DEFAULT_CHARACTER_BUDGETS,
      ...(manifest.budgets || {}),
    }),
  });
}

export function allowsDevelopmentCharacterCandidate(
  id,
  search = globalThis.location?.search || '',
) {
  const query = new URLSearchParams(search);
  const developmentSurface = query.get('dev') === '1' || query.get('qa') === '1';
  return developmentSurface && query.get('characterCandidate') === id;
}

export function activeDevelopmentCharacterCandidate(
  manifests,
  search = globalThis.location?.search || '',
) {
  return (manifests || []).find((manifest) => (
    allowsDevelopmentCharacterCandidate(manifest.id, search)
  )) || null;
}

function textureMetrics(material, textures) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) textures.add(value);
  }
}

function triangleCount(geometry) {
  if (!geometry?.attributes?.position) return 0;
  return geometry.index
    ? geometry.index.count / 3
    : geometry.attributes.position.count / 3;
}

function resolveClipMap(animations, clips) {
  const byName = new Map((animations || []).map((clip) => [clip.name, clip]));
  return Object.freeze(Object.fromEntries(PRODUCTION_CLIP_KEYS.map((key) => {
    const clip = stringList(clips?.[key])
      .map((name) => byName.get(name))
      .find(Boolean);
    return [key, clip || null];
  })));
}

function anchorDefinition(value) {
  return typeof value === 'string' ? { node: value } : value;
}

export function inspectProductionCharacterAsset(
  gltf,
  manifest,
  { fileBytes = null } = {},
) {
  const manifestErrors = validateProductionCharacterManifest(manifest);
  if (manifestErrors.length) {
    return Object.freeze({
      status: 'rejected',
      canPreview: false,
      errors: manifestErrors,
      warnings: Object.freeze([]),
      metrics: Object.freeze({}),
      clips: Object.freeze({}),
      anchors: Object.freeze({}),
    });
  }
  const normalized = defineProductionCharacterManifest(manifest);
  const root = gltf?.scene;
  const errors = [];
  const criticalErrors = [];
  const warnings = [];
  if (!root?.isObject3D) {
    criticalErrors.push('GLB has no scene root');
    errors.push('GLB has no scene root');
  }

  let drawCalls = 0;
  let triangles = 0;
  let skinnedMeshes = 0;
  let bones = 0;
  const textures = new Set();
  root?.traverse((object) => {
    if (object.isMesh) {
      drawCalls += Array.isArray(object.material) ? object.material.length : 1;
      triangles += triangleCount(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((item) => textureMetrics(item, textures));
    }
    if (object.isSkinnedMesh) skinnedMeshes += 1;
    if (object.isBone) bones += 1;
  });
  if (root && skinnedMeshes < 1) {
    criticalErrors.push('asset needs at least one SkinnedMesh');
    errors.push('asset needs at least one SkinnedMesh');
  }
  if (root && bones < 1) {
    criticalErrors.push('asset needs at least one Bone');
    errors.push('asset needs at least one Bone');
  }

  const bounds = root
    ? new THREE.Box3().setFromObject(root)
    : new THREE.Box3();
  const size = bounds.getSize(new THREE.Vector3());
  if (
    ![size.x, size.y, size.z].every(finiteNumber)
    || size.y <= 0.001
    || Math.max(size.x, size.z) <= 0.001
  ) {
    criticalErrors.push('asset bounds must be finite and non-zero');
    errors.push('asset bounds must be finite and non-zero');
  }

  let maxTextureSize = 0;
  for (const texture of textures) {
    const width = Number(texture.image?.width || texture.source?.data?.width || 0);
    const height = Number(texture.image?.height || texture.source?.data?.height || 0);
    maxTextureSize = Math.max(maxTextureSize, width, height);
  }
  const metrics = Object.freeze({
    fileBytes,
    drawCalls,
    triangles: Math.round(triangles),
    skinnedMeshes,
    bones,
    textures: textures.size,
    maxTextureSize,
    authoredBounds: Object.freeze({
      width: size.x,
      height: size.y,
      depth: size.z,
    }),
  });
  for (const [metric, budgetKey] of [
    ['fileBytes', 'maxFileBytes'],
    ['triangles', 'maxTriangles'],
    ['drawCalls', 'maxDrawCalls'],
    ['bones', 'maxBones'],
    ['textures', 'maxTextures'],
    ['maxTextureSize', 'maxTextureSize'],
  ]) {
    if (metrics[metric] != null && metrics[metric] > normalized.budgets[budgetKey]) {
      errors.push(`${metric} ${metrics[metric]} exceeds ${normalized.budgets[budgetKey]}`);
    }
  }

  const clips = resolveClipMap(gltf?.animations, normalized.clips);
  for (const key of PRODUCTION_CLIP_KEYS) {
    if (!clips[key]) errors.push(`missing mapped ${key} animation clip`);
  }

  const anchors = {};
  for (const key of CHARACTER_ANCHOR_KEYS) {
    const definition = anchorDefinition(normalized.anchors[key]);
    const node = definition?.node ? root?.getObjectByName(definition.node) : null;
    anchors[key] = Object.freeze({
      requestedNode: definition?.node || null,
      found: Boolean(node),
      fallback: !node,
    });
    if (!node) warnings.push(`${key} uses the canonical fallback anchor`);
  }

  return Object.freeze({
    status: errors.length ? 'rejected' : 'passed',
    canPreview: criticalErrors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    metrics,
    clips,
    anchors: Object.freeze(anchors),
  });
}

export function fitProductionCharacter(model, manifest) {
  if (!model?.isObject3D) throw new TypeError('character model must be an Object3D');
  const targetHeight = manifest?.targetHeight;
  if (!finiteNumber(targetHeight) || targetHeight <= 0) {
    throw new TypeError('character targetHeight must be positive');
  }
  if (manifest.forwardAxis === '-z') model.rotation.y += Math.PI;
  model.updateWorldMatrix(true, true);
  const before = new THREE.Box3().setFromObject(model);
  const size = before.getSize(new THREE.Vector3());
  if (!finiteNumber(size.y) || size.y <= 0.001) {
    throw new RangeError('character has no measurable height');
  }
  const scale = targetHeight / size.y;
  model.scale.multiplyScalar(scale);
  model.updateWorldMatrix(true, true);
  const scaled = new THREE.Box3().setFromObject(model);
  const center = scaled.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= scaled.min.y;
  model.position.z -= center.z;
  model.updateWorldMatrix(true, true);
  const fitted = new THREE.Box3().setFromObject(model);
  const fittedSize = fitted.getSize(new THREE.Vector3());
  return Object.freeze({
    scale,
    groundOffset: model.position.y,
    bounds: Object.freeze({
      height: fittedSize.y,
      radius: Math.max(fittedSize.x, fittedSize.z) / 2,
      groundOffset: 0,
    }),
  });
}

export function createProductionCharacterAnchors(model, manifest) {
  const anchors = {};
  const usedFallbacks = [];
  for (const key of CHARACTER_ANCHOR_KEYS) {
    const definition = anchorDefinition(manifest.anchors?.[key]);
    const node = definition?.node ? model.getObjectByName(definition.node) : null;
    const anchor = new THREE.Group();
    anchor.name = `anchor:${key}`;
    anchor.userData.characterAnchor = key;
    if (node) {
      node.add(anchor);
    } else {
      anchor.position.fromArray(DEFAULT_CHARACTER_ANCHORS[key]);
      model.add(anchor);
      usedFallbacks.push(key);
    }
    if (definition?.position) anchor.position.add(
      new THREE.Vector3().fromArray(definition.position),
    );
    if (definition?.rotation) anchor.rotation.fromArray(definition.rotation);
    anchors[key] = anchor;
  }
  return Object.freeze({
    anchors: Object.freeze(anchors),
    usedFallbacks: Object.freeze(usedFallbacks),
  });
}

function createClipAnimator(model, clips, report) {
  const fallback = createCharacterAnimator(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(PRODUCTION_CLIP_KEYS.map((key) => [
    key,
    clips[key] ? mixer.clipAction(clips[key]) : null,
  ]));
  for (const [key, action] of Object.entries(actions)) {
    if (!action) continue;
    if (['land', 'celebrate'].includes(key)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
  }
  let currentKey = null;
  let oneShotKey = null;
  let oneShotRemaining = 0;
  let locomotionState = 'idle';
  let contactSerial = 0;
  let contactFoot = 'right';
  let cadencePhase = 0;

  function useClip(key, fade = 0.12) {
    const next = actions[key];
    if (!next) return false;
    if (currentKey === key && next.isRunning()) return true;
    const prior = actions[currentKey];
    next.reset().fadeIn(fade).play();
    prior?.fadeOut(fade);
    currentKey = key;
    fallback.reset();
    return true;
  }

  function startOneShot(key) {
    const action = actions[key];
    if (!action) return false;
    oneShotKey = key;
    oneShotRemaining = Math.max(0.01, action.getClip().duration);
    useClip(key, 0.08);
    return true;
  }

  return {
    update(dt, state = {}) {
      const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
      const classified = classifyLocomotionState(state);
      locomotionState = classified;
      if (oneShotKey) {
        oneShotRemaining -= safeDt;
        if (oneShotRemaining <= 0) oneShotKey = null;
      }
      const desired = oneShotKey || (
        classified === 'turn' || classified === 'emote' ? 'idle' : classified
      );
      if (useClip(desired)) {
        const action = actions[desired];
        if (desired === 'walk' || desired === 'run') {
          const speed = Math.max(0, Number(state.speed) || 0);
          action.timeScale = Math.max(0.55, Math.min(1.6, speed / (desired === 'run' ? 5 : 2.4)));
        } else {
          action.timeScale = 1;
        }
        mixer.update(safeDt);
      } else {
        if (currentKey) {
          actions[currentKey]?.stop();
          currentKey = null;
        }
        fallback.update(safeDt, state);
      }

      const speed = Math.max(0, Number(state.speed) || 0);
      if (state.grounded !== false && speed > 0.65) {
        const previousHalfStep = Math.floor(cadencePhase / Math.PI);
        cadencePhase += safeDt * (3.2 + Math.min(1, speed / 6) * 7.2);
        const halfStep = Math.floor(cadencePhase / Math.PI);
        if (halfStep !== previousHalfStep) {
          contactSerial += 1;
          contactFoot = halfStep % 2 === 0 ? 'right' : 'left';
        }
      }
    },
    signal(name, details) {
      if (name === 'land') return startOneShot('land') || fallback.signal(name, details);
      if (name === 'jump') return Boolean(actions.jump) || fallback.signal(name, details);
      return fallback.signal(name, details);
    },
    play(name, details) {
      if (name === 'celebrate') {
        return startOneShot('celebrate') || fallback.play(name, details);
      }
      return fallback.play(name, details);
    },
    reset() {
      mixer.stopAllAction();
      fallback.reset();
      currentKey = null;
      oneShotKey = null;
      oneShotRemaining = 0;
      locomotionState = 'idle';
      contactSerial = 0;
      contactFoot = 'right';
      cadencePhase = 0;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      fallback.reset();
    },
    get currentAction() { return oneShotKey || currentKey || fallback.currentAction; },
    get locomotionState() { return locomotionState; },
    get pose() {
      return Object.freeze({
        state: locomotionState,
        source: actions[currentKey] ? 'clip' : 'procedural-fallback',
        clip: currentKey,
        joints: Object.freeze({}),
      });
    },
    get taggedJointCount() { return report.metrics.bones || 0; },
    get contact() {
      return Object.freeze({ serial: contactSerial, foot: contactFoot });
    },
  };
}

export function disposeCharacterObjectResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of entries.filter(Boolean)) {
      materials.add(item);
      textureMetrics(item, textures);
    }
  });
  geometries.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  textures.forEach((item) => item.dispose());
  return Object.freeze({
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  });
}

function basePathOf(url) {
  const absolute = new URL(url, globalThis.location?.href || 'http://localhost/');
  return absolute.href.slice(0, absolute.href.lastIndexOf('/') + 1);
}

async function fetchCandidateBytes(manifest) {
  const absolute = new URL(
    manifest.url,
    globalThis.location?.href || 'http://localhost/',
  ).href;
  if (!candidateBytes.has(absolute)) {
    candidateBytes.set(absolute, fetch(absolute, {
      credentials: 'same-origin',
      cache: 'force-cache',
    }).then(async (response) => {
      if (!response.ok) throw new Error(`GLB request failed with ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > manifest.budgets.maxFileBytes) {
        throw new Error(
          `GLB fileBytes ${bytes.byteLength} exceeds ${manifest.budgets.maxFileBytes}`,
        );
      }
      return bytes;
    }).catch((error) => {
      candidateBytes.delete(absolute);
      throw error;
    }));
  }
  const bytes = await candidateBytes.get(absolute);
  if (bytes.byteLength > manifest.budgets.maxFileBytes) {
    throw new Error(
      `GLB fileBytes ${bytes.byteLength} exceeds ${manifest.budgets.maxFileBytes}`,
    );
  }
  return bytes;
}

export function clearProductionCharacterByteCache() {
  const count = candidateBytes.size;
  candidateBytes.clear();
  return count;
}

function candidateBytesView(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (ArrayBuffer.isView(bytes)) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  throw new TypeError('character candidate bytes must be an ArrayBuffer or typed array');
}

async function adaptProductionCharacterBytes(manifest, bytes, basePath) {
  const normalized = defineProductionCharacterManifest(manifest);
  const source = candidateBytesView(bytes);
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(source.slice(0), basePath);
  const report = inspectProductionCharacterAsset(gltf, normalized, {
    fileBytes: source.byteLength,
  });
  if (!report.canPreview) {
    disposeCharacterObjectResources(gltf.scene);
    const error = new Error(`Character candidate "${normalized.id}" cannot be previewed`);
    error.report = report;
    throw error;
  }

  const model = new THREE.Group();
  model.name = `production-candidate:${normalized.id}`;
  model.add(gltf.scene);
  // Normalize the authored scene below an identity-scale runtime root. Named
  // bone anchors remain on the rig, while canonical fallback anchors can live
  // on `model` in stable world-unit coordinates instead of inheriting the
  // source file's correction scale.
  const fit = fitProductionCharacter(gltf.scene, normalized);
  const anchorResult = createProductionCharacterAnchors(model, normalized);
  const animator = createClipAnimator(model, report.clips, report);
  let disposed = false;
  return {
    id: normalized.id,
    name: normalized.name,
    model,
    animator,
    anchors: anchorResult.anchors,
    bounds: fit.bounds,
    report: Object.freeze({
      ...report,
      fit,
      usedFallbackAnchors: anchorResult.usedFallbacks,
    }),
    dispose() {
      if (disposed) return Object.freeze({ geometries: 0, materials: 0, textures: 0 });
      disposed = true;
      animator.dispose();
      model.removeFromParent();
      return disposeCharacterObjectResources(model);
    },
  };
}

/**
 * Parse and adapt browser-local candidate bytes through the same production
 * contract as the same-origin development loader. This entry point does not
 * fetch, upload, cache, or create an object URL.
 */
export async function loadProductionCharacterCandidateBytes(
  manifest,
  bytes,
  { basePath = null } = {},
) {
  const normalized = defineProductionCharacterManifest(manifest);
  return adaptProductionCharacterBytes(
    normalized,
    bytes,
    basePath || basePathOf(normalized.url),
  );
}

export async function loadProductionCharacterCandidate(manifest) {
  const normalized = defineProductionCharacterManifest(manifest);
  const bytes = await fetchCandidateBytes(normalized);
  return adaptProductionCharacterBytes(
    normalized,
    bytes,
    basePathOf(normalized.url),
  );
}
