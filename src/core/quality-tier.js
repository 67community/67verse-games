// Deterministic renderer quality selection.
//
// Auto resolves from coarse, stable capability signals when the page boots.
// It never switches from frame timing, so gameplay and visuals cannot oscillate
// during a round. Explicit High/Low preferences always win.

export const QUALITY_PREFERENCES = Object.freeze(['auto', 'high', 'low']);

export const QUALITY_TIERS = Object.freeze({
  high: Object.freeze({
    id: 'high',
    maxPixelRatio: 1.5,
    shadows: true,
    visualDensity: 'full',
    // Ground-contact darkening. It costs a depth-normal prepass plus a
    // denoise, so it stays off on the low tier where the frame budget is
    // already spent on the scene itself.
    ambientOcclusion: true,
  }),
  low: Object.freeze({
    id: 'low',
    maxPixelRatio: 1,
    shadows: false,
    visualDensity: 'reduced',
    ambientOcclusion: false,
  }),
});

export function normalizeQualityPreference(value) {
  return QUALITY_PREFERENCES.includes(value) ? value : 'auto';
}

export function normalizeQualityCapabilities(capabilities = {}) {
  const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  return Object.freeze({
    viewportWidth: Math.max(0, numberOrNull(capabilities.viewportWidth) ?? 0),
    devicePixelRatio: Math.max(0.5, numberOrNull(capabilities.devicePixelRatio) ?? 1),
    touch: Boolean(capabilities.touch),
    saveData: Boolean(capabilities.saveData),
    deviceMemory: numberOrNull(capabilities.deviceMemory),
    hardwareConcurrency: numberOrNull(capabilities.hardwareConcurrency),
  });
}

export function resolveQualityTier(preference, capabilities = {}) {
  const normalizedPreference = normalizeQualityPreference(preference);
  const normalizedCapabilities = normalizeQualityCapabilities(capabilities);
  if (normalizedPreference === 'high' || normalizedPreference === 'low') {
    return {
      preference: normalizedPreference,
      tier: normalizedPreference,
      reason: 'user-override',
      capabilities: normalizedCapabilities,
    };
  }

  const constrained =
    normalizedCapabilities.saveData
    || normalizedCapabilities.touch
    || normalizedCapabilities.viewportWidth < 760
    || (
      normalizedCapabilities.deviceMemory !== null
      && normalizedCapabilities.deviceMemory <= 4
    )
    || (
      normalizedCapabilities.hardwareConcurrency !== null
      && normalizedCapabilities.hardwareConcurrency <= 4
    );
  return {
    preference: 'auto',
    tier: constrained ? 'low' : 'high',
    reason: constrained ? 'auto-constrained-device' : 'auto-roomy-device',
    capabilities: normalizedCapabilities,
  };
}

export function applySceneQuality(scene, tier) {
  if (!scene?.traverse) return { managedObjects: 0, visibleObjects: 0 };
  const showHighDensity = tier === 'high';
  let managedObjects = 0;
  let visibleObjects = 0;
  scene.traverse((object) => {
    if (object.userData?.qualityMinimum !== 'high') return;
    managedObjects += 1;
    object.visible = showHighDensity;
    if (object.visible) visibleObjects += 1;
  });
  return { managedObjects, visibleObjects };
}

export function createQualityController({
  renderer,
  getScenes = () => [],
  capabilities = {},
  onApplied = () => {},
} = {}) {
  if (!renderer) throw new TypeError('Quality controller requires a renderer.');
  const stableCapabilities = normalizeQualityCapabilities(capabilities);
  let state = null;

  function scenes() {
    return [...new Set((getScenes() || []).filter(Boolean))];
  }

  function recompileSceneMaterials(scene) {
    scene?.traverse?.((object) => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => { material.needsUpdate = true; });
    });
  }

  function applyScene(scene) {
    if (!state) return { managedObjects: 0, visibleObjects: 0 };
    return applySceneQuality(scene, state.tier);
  }

  function densitySnapshot() {
    let managedObjects = 0;
    let visibleManagedObjects = 0;
    scenes().forEach((scene) => {
      scene.traverse?.((object) => {
        if (object.userData?.qualityMinimum !== 'high') return;
        managedObjects += 1;
        if (object.visible) visibleManagedObjects += 1;
      });
    });
    return { managedObjects, visibleManagedObjects };
  }

  function applyPreference(preference) {
    const resolved = resolveQualityTier(preference, stableCapabilities);
    const config = QUALITY_TIERS[resolved.tier];
    const previousShadows = renderer.shadowMap.enabled;
    const pixelRatio = Math.min(stableCapabilities.devicePixelRatio, config.maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = config.shadows;
    if (renderer.shadowMap.needsUpdate !== undefined) renderer.shadowMap.needsUpdate = true;

    const density = scenes().map((scene) => applySceneQuality(scene, resolved.tier));
    if (previousShadows !== config.shadows) scenes().forEach(recompileSceneMaterials);
    state = Object.freeze({
      preference: resolved.preference,
      tier: resolved.tier,
      reason: resolved.reason,
      pixelRatio,
      shadows: config.shadows,
      ambientOcclusion: config.ambientOcclusion === true,
      visualDensity: config.visualDensity,
      managedObjects: density.reduce((sum, item) => sum + item.managedObjects, 0),
      visibleManagedObjects: density.reduce((sum, item) => sum + item.visibleObjects, 0),
    });
    onApplied(state);
    return state;
  }

  return Object.freeze({
    applyPreference,
    applyScene,
    getState: () => state && { ...state, ...densitySnapshot() },
    capabilities: stableCapabilities,
  });
}
