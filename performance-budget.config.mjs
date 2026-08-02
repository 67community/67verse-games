export const PERFORMANCE_BUDGET = Object.freeze({
  initialJsRawBytes: 900_000,
  initialJsGzipBytes: 240_000,
  maxAsyncJsRawBytes: 40_000,
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
