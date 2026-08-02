// Developer-only performance diagnostics.
//
// This module is loaded only for ?perf=1 / ?dev sessions. Its small interface
// keeps telemetry, scene attribution, the dev overlay, and the public QA hook
// behind one lazy seam so none of that implementation is paid for by normal
// first-session play.

import {
  createRuntimePerformanceTelemetry,
  formatRuntimePerformance,
} from './performance-telemetry.js';
import {
  analyzeSceneAttribution,
  formatAttributionSummary,
} from './scene-attribution.js';

export function createPerformanceDiagnostics({
  ctx,
  renderer,
  devOverlay,
  sessionTelemetry = null,
  getScene,
  meta = {},
} = {}) {
  if (!ctx || !renderer || typeof getScene !== 'function') {
    throw new TypeError('Performance diagnostics require ctx, renderer, and getScene.');
  }

  const telemetry = createRuntimePerformanceTelemetry({ meta });
  const captures = [];
  let lastAttributionSummary = '';

  function syncQualityMeta() {
    const quality = ctx.quality.getState();
    telemetry.setMeta({
      qualityPreference: quality.preference,
      qualityTier: quality.tier,
      qualityPixelRatio: quality.pixelRatio,
      qualityShadows: quality.shadows,
      qualityVisualDensity: quality.visualDensity,
    });
    return quality;
  }

  function capture(label = 'manual') {
    const runtime = telemetry.capture(label);
    if (!runtime) return null;
    const attribution = analyzeSceneAttribution(getScene(), {
      scope: runtime.scope,
    });
    const result = {
      kind: '67verse-local-performance-capture',
      runtime,
      attribution,
      quality: ctx.quality.getState(),
      session: sessionTelemetry?.summary?.() || null,
    };
    captures.push(result);
    if (captures.length > 12) captures.shift();
    lastAttributionSummary = formatAttributionSummary(attribution);
    if (devOverlay) devOverlay.dataset.performanceCapture = JSON.stringify(result);
    return result;
  }

  function sample(frameDt) {
    const characterStats = ctx.characters.getStats();
    telemetry.sample({
      frameMs: frameDt * 1000,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      characters: characterStats,
    });
    if (!devOverlay) return;
    const snapshot = telemetry.snapshot();
    const quality = ctx.quality.getState();
    const session = sessionTelemetry?.summary?.();
    devOverlay.textContent = `${formatRuntimePerformance(snapshot)}\n` +
      `quality ${quality.tier.toUpperCase()} (${quality.preference}) · ` +
      `${quality.pixelRatio.toFixed(2)}x · shadows ${quality.shadows ? 'on' : 'off'} · ${quality.visualDensity}\n` +
      `${characterStats.activeInstances} chars ` +
      `(H${characterStats.byLod.hero || 0}/G${characterStats.byLod.game || 0}/C${characterStats.byLod.crowd || 0})` +
      (session
        ? `\nsession ${session.totalEventCount} local events · ` +
          `${session.counts.recoverable_error || 0} recoverable errors`
        : '') +
      (lastAttributionSummary ? `\nscene ${lastAttributionSummary}` : '');
  }

  syncQualityMeta();
  telemetry.setScope('hub');

  return Object.freeze({
    budgets: telemetry.budgets,
    setScope: telemetry.setScope,
    setQualityMeta: syncQualityMeta,
    sample,
    capture,
    api: Object.freeze({
      budgets: telemetry.budgets,
      snapshot: () => telemetry.snapshot('devtools'),
      scene: () => analyzeSceneAttribution(getScene(), {
        scope: telemetry.currentScope() || 'paused',
      }),
      capture: (label = 'devtools') => capture(label),
      history: () => captures.map((entry) => structuredClone(entry)),
      runtimeHistory: () => telemetry.history(),
      quality: () => ctx.quality.getState(),
      sessionSummary: () => sessionTelemetry?.summary?.() || null,
      sessionEvents: () => sessionTelemetry?.events?.() || [],
      exportSession: () => sessionTelemetry?.exportDiagnostic?.() || null,
      exportSessionJson: () => {
        const exported = sessionTelemetry?.exportDiagnostic?.();
        return exported ? JSON.stringify(exported, null, 2) : null;
      },
    }),
  });
}
