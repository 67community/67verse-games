export const PERFORMANCE_BUDGET = Object.freeze({
  // Remeasured 2026-08-08 after the venue-life expansion (five venues, the
  // hoop duel, weather, the phone, SkeletonUtils for rigged avatars): the
  // initial bundle builds at 923k raw / 252k gzip with everything heavier
  // riding the idle pass. The city chunk measured 44.0k once the water wave
  // shader and live traffic colliders joined it, so its ceiling sits a step
  // above that.
  initialJsRawBytes: 950_000,
  initialJsGzipBytes: 262_000,
  maxAsyncJsRawBytes: 45_000,
  requiredDeferredSources: Object.freeze([
    'src/core/performance-diagnostics.js',
    'src/systems/cosmetics.js',
    'src/systems/emotes.js',
    'src/systems/settings.js',
  ]),
  requiredDeferredSourceFragments: Object.freeze([
    'party-session',
  ]),
});
