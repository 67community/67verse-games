// Local runtime performance observations for developer builds.
// Nothing is uploaded or persisted, and these guardrails are prototype
// regression limits rather than claims about production devices.

export const RUNTIME_PERF_BUDGETS = Object.freeze({
  hub: Object.freeze({
    frameP95Ms: 33.3,
    drawCalls: 120,
    triangles: 400_000,
  }),
  skyway: Object.freeze({
    frameP95Ms: 33.3,
    drawCalls: 80,
    triangles: 380_000,
  }),
  balloon: Object.freeze({
    frameP95Ms: 33.3,
    drawCalls: 80,
    triangles: 380_000,
  }),
  tag: Object.freeze({
    frameP95Ms: 33.3,
    // Five independently animated participants plus the explicit IT/recovery
    // signals make Tag's intended high-quality desktop scene denser than the
    // solo modes. The fixed capture remains under this measured ceiling.
    drawCalls: 130,
    triangles: 380_000,
  }),
  show67: Object.freeze({
    frameP95Ms: 33.3,
    drawCalls: 80,
    triangles: 380_000,
  }),
  ugc: Object.freeze({
    frameP95Ms: 33.3,
    // Canonical local levels allow 96 pieces. A maximum-density mix can
    // render blocks/ramps once and spinner/bounce groups twice, plus the
    // player, ground, and goal marker. Keep a small ceiling above that
    // authored maximum without inheriting Hub samples.
    drawCalls: 160,
    triangles: 240_000,
  }),
});

export function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(fraction * ordered.length) - 1),
  );
  return ordered[index];
}

export function createRuntimePerformanceTelemetry({
  budgets = RUNTIME_PERF_BUDGETS,
  maxSamples = 600,
  warmupFrames = 45,
  minimumSamples = 120,
  now = () => Date.now(),
  meta = {},
} = {}) {
  let current = null;
  let currentMeta = { ...meta };
  const history = [];

  function makeScope(scope) {
    return {
      scope,
      startedAt: now(),
      framesSeen: 0,
      samples: [],
      drawCalls: [],
      triangles: [],
      characterPeaks: { active: 0, hero: 0, game: 0, crowd: 0 },
    };
  }

  function setScope(scope) {
    if (current?.scope === scope) return;
    if (current) capture('scope-change');
    current = scope && budgets[scope] ? makeScope(scope) : null;
  }

  function sample({ frameMs, drawCalls, triangles, characters } = {}) {
    if (!current) return;
    current.framesSeen += 1;
    if (current.framesSeen <= warmupFrames) return;
    const frame = Number(frameMs);
    const draws = Number(drawCalls);
    const tris = Number(triangles);
    if (![frame, draws, tris].every(Number.isFinite)) return;
    current.samples.push(Math.max(0, frame));
    current.drawCalls.push(Math.max(0, draws));
    current.triangles.push(Math.max(0, tris));
    if (current.samples.length > maxSamples) {
      current.samples.shift();
      current.drawCalls.shift();
      current.triangles.shift();
    }
    if (characters) {
      current.characterPeaks.active = Math.max(
        current.characterPeaks.active,
        Number(characters.activeInstances) || 0,
      );
      for (const lod of ['hero', 'game', 'crowd']) {
        current.characterPeaks[lod] = Math.max(
          current.characterPeaks[lod],
          Number(characters.byLod?.[lod]) || 0,
        );
      }
    }
  }

  function snapshot(label = 'live') {
    if (!current) return null;
    const budget = budgets[current.scope];
    const frames = current.samples;
    const draws = current.drawCalls;
    const tris = current.triangles;
    const measured = frames.length >= minimumSamples;
    const metrics = {
      frameMs: {
        current: frames.at(-1) || 0,
        p50: percentile(frames, 0.5),
        p95: percentile(frames, 0.95),
        max: frames.length ? Math.max(...frames) : 0,
      },
      drawCalls: {
        current: draws.at(-1) || 0,
        peak: draws.length ? Math.max(...draws) : 0,
      },
      triangles: {
        current: tris.at(-1) || 0,
        peak: tris.length ? Math.max(...tris) : 0,
      },
      characters: { ...current.characterPeaks },
    };
    const breaches = [];
    if (measured && metrics.frameMs.p95 > budget.frameP95Ms) breaches.push('frame-p95');
    if (metrics.drawCalls.peak > budget.drawCalls) breaches.push('draw-calls');
    if (metrics.triangles.peak > budget.triangles) breaches.push('triangles');
    return {
      kind: '67verse-local-performance-observation',
      label,
      scope: current.scope,
      capturedAt: now(),
      startedAt: current.startedAt,
      sampleCount: frames.length,
      warmupFrames,
      minimumSamples,
      status: measured ? (breaches.length ? 'over-budget' : 'within-guardrails') : 'warming-up',
      breaches,
      budget: { ...budget },
      metrics,
      meta: { ...currentMeta },
      caveat: 'Local browser observation only; not a production benchmark.',
    };
  }

  function capture(label = 'manual') {
    const result = snapshot(label);
    if (!result) return null;
    history.push(result);
    if (history.length > 12) history.shift();
    return result;
  }

  return {
    budgets,
    setMeta(patch = {}) {
      currentMeta = { ...currentMeta, ...patch };
      return { ...currentMeta };
    },
    setScope,
    sample,
    snapshot,
    capture,
    history: () => history.map((entry) => structuredClone(entry)),
    currentScope: () => current?.scope || null,
  };
}

export function formatRuntimePerformance(snapshot) {
  if (!snapshot) return 'perf paused · Hub/Tag/Skyway/Balloon/Show/UGC only';
  const { metrics, budget } = snapshot;
  const status = snapshot.status === 'warming-up'
    ? `warming ${snapshot.sampleCount}/${snapshot.minimumSamples}`
    : snapshot.status === 'within-guardrails'
      ? 'within prototype guardrails'
      : `over: ${snapshot.breaches.join(', ')}`;
  return [
    `${snapshot.scope.toUpperCase()} · ${status}`,
    `frame p50 ${metrics.frameMs.p50.toFixed(1)} ms · p95 ${metrics.frameMs.p95.toFixed(1)}/${budget.frameP95Ms.toFixed(1)} ms`,
    `draws ${metrics.drawCalls.current} · peak ${metrics.drawCalls.peak}/${budget.drawCalls}`,
    `tris ${Math.round(metrics.triangles.current / 1000)}k · peak ${Math.round(metrics.triangles.peak / 1000)}k/${Math.round(budget.triangles / 1000)}k`,
    `P capture · local observation, not production benchmark`,
  ].join('\n');
}
