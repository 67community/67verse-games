// Privacy-safe, device-local session diagnostics.
//
// This log is memory-only: it has no storage or transport dependency, accepts
// only an explicit allowlist of low-cardinality gameplay fields, and never
// records profile, chat, free-form error, network, or device identity data.

export const SESSION_EVENT_SCHEMA_VERSION = 1;
export const SESSION_EVENT_NAMES = Object.freeze([
  'onboarding_stage',
  'hub_activity_start',
  'hub_activity_complete',
  'hub_activity_exit',
  'destination_enter',
  'game_start',
  'game_result',
  'game_replay',
  'game_phase',
  'quality_tier',
  'recoverable_error',
]);

const EVENT_SET = new Set(SESSION_EVENT_NAMES);
const TOKEN = /^[a-z0-9][a-z0-9_-]{0,47}$/;

function token(value) {
  return typeof value === 'string' && TOKEN.test(value) ? value : null;
}

function oneOf(value, values) {
  return values.includes(value) ? value : null;
}

function boundedNumber(value, min, max, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const clamped = Math.max(min, Math.min(max, value));
  const scale = 10 ** digits;
  return Math.round(clamped * scale) / scale;
}

function required(data, fields) {
  return fields.every((field) => data[field] != null);
}

function normalizeEvent(name, input = {}) {
  const data = {};
  if (name === 'onboarding_stage') {
    data.stage = boundedNumber(input.stage, 0, 20);
    data.phase = oneOf(input.phase, ['started', 'movement', 'jump', 'completed']);
    return required(data, ['stage', 'phase']) ? data : null;
  }
  if (name === 'hub_activity_start') {
    data.activityId = token(input.activityId);
    return required(data, ['activityId']) ? data : null;
  }
  if (name === 'hub_activity_complete') {
    data.activityId = token(input.activityId);
    data.durationMs = boundedNumber(input.durationMs, 0, 3_600_000);
    data.reward = boundedNumber(input.reward ?? 0, 0, 100_000);
    return required(data, ['activityId', 'durationMs', 'reward']) ? data : null;
  }
  if (name === 'hub_activity_exit') {
    data.activityId = token(input.activityId);
    data.reason = token(input.reason);
    return required(data, ['activityId', 'reason']) ? data : null;
  }
  if (name === 'destination_enter') {
    data.destinationId = token(input.destinationId);
    data.kind = oneOf(input.kind, ['game', 'game-select', 'system', 'onboarding', 'activity']);
    const target = token(input.target);
    if (target) data.target = target;
    return required(data, ['destinationId', 'kind']) ? data : null;
  }
  if (name === 'game_start' || name === 'game_replay') {
    data.gameId = token(input.gameId);
    if (name === 'game_start') {
      data.source = oneOf(input.source, ['direct', 'destination', 'replay', 'show']);
      if (!data.source) data.source = 'direct';
    }
    return required(data, ['gameId']) ? data : null;
  }
  if (name === 'game_phase') {
    data.gameId = token(input.gameId);
    data.phase = token(input.phase);
    return required(data, ['gameId', 'phase']) ? data : null;
  }
  if (name === 'game_result') {
    data.gameId = token(input.gameId);
    data.completed = Boolean(input.completed);
    const placement = boundedNumber(input.placement, 1, 1000);
    const score = boundedNumber(input.score, 0, 1_000_000_000);
    const coins = boundedNumber(input.coins, 0, 100_000);
    const interactions = boundedNumber(input.interactions, 0, 100_000);
    const safeTimeMs = boundedNumber(input.safeTimeMs, 0, 3_600_000);
    const roleChanges = boundedNumber(input.roleChanges, 0, 100_000);
    if (placement != null) data.placement = placement;
    if (score != null) data.score = score;
    if (coins != null) data.coins = coins;
    if (interactions != null) data.interactions = interactions;
    if (safeTimeMs != null) data.safeTimeMs = safeTimeMs;
    if (roleChanges != null) data.roleChanges = roleChanges;
    if (typeof input.escalationReached === 'boolean') {
      data.escalationReached = input.escalationReached;
    }
    return required(data, ['gameId']) ? data : null;
  }
  if (name === 'quality_tier') {
    data.preference = oneOf(input.preference, ['auto', 'high', 'low']);
    data.tier = oneOf(input.tier, ['high', 'low']);
    data.pixelRatio = boundedNumber(input.pixelRatio, 0.5, 4, 2);
    return required(data, ['preference', 'tier', 'pixelRatio']) ? data : null;
  }
  if (name === 'recoverable_error') {
    data.area = token(input.area);
    data.code = token(input.code);
    const routeKind = oneOf(input.routeKind, ['game', 'system', 'character', 'diagnostics']);
    const routeId = token(input.routeId);
    if (routeKind) data.routeKind = routeKind;
    if (routeId) data.routeId = routeId;
    return required(data, ['area', 'code']) ? data : null;
  }
  return null;
}

export function createLocalSessionTelemetry({
  maxEvents = 128,
  now = () => performance.now(),
} = {}) {
  const capacity = Math.max(1, Math.min(512, Math.floor(maxEvents) || 128));
  const startedAt = now();
  const events = [];
  const counts = Object.create(null);
  let sequence = 0;
  let droppedEventCount = 0;

  function elapsedMs() {
    return Math.max(0, Math.round(now() - startedAt));
  }

  function record(name, input = {}) {
    if (!EVENT_SET.has(name)) return null;
    const data = normalizeEvent(name, input);
    if (!data) return null;
    sequence += 1;
    counts[name] = (counts[name] || 0) + 1;
    const event = Object.freeze({
      schemaVersion: SESSION_EVENT_SCHEMA_VERSION,
      sequence,
      atMs: elapsedMs(),
      name,
      data: Object.freeze(data),
    });
    events.push(event);
    if (events.length > capacity) {
      events.shift();
      droppedEventCount += 1;
    }
    return event;
  }

  function summary() {
    return Object.freeze({
      kind: '67verse-local-session-summary',
      schemaVersion: SESSION_EVENT_SCHEMA_VERSION,
      durationMs: elapsedMs(),
      totalEventCount: sequence,
      retainedEventCount: events.length,
      droppedEventCount,
      capacity,
      counts: Object.freeze({ ...counts }),
    });
  }

  function exportDiagnostic() {
    return {
      kind: '67verse-local-session-diagnostic',
      schemaVersion: SESSION_EVENT_SCHEMA_VERSION,
      privacy: {
        storage: 'memory-only',
        transmission: 'none',
        identity: 'not-collected',
        freeFormContent: 'not-collected',
      },
      summary: structuredClone(summary()),
      events: events.map((event) => structuredClone(event)),
    };
  }

  return Object.freeze({
    capacity,
    record,
    summary,
    events: () => events.map((event) => structuredClone(event)),
    exportDiagnostic,
  });
}
