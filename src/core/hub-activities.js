// Small, deterministic activities that run inside Skypark without mounting a
// separate game scene. Definitions are immutable; the session owns only local
// progress and reports events to the hub adapter for UI, sound, and rewards.

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function positive(value, label) {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero.`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function defineHubActivity({
  id,
  title,
  objective,
  start,
  checkpoints,
  timeLimit = null,
  reward,
}) {
  if (!id || typeof id !== 'string') throw new TypeError('Activity id must be a non-empty string.');
  if (!title || typeof title !== 'string') {
    throw new TypeError(`${id}.title must be a non-empty string.`);
  }
  if (!objective || typeof objective !== 'string') {
    throw new TypeError(`${id}.objective must be a non-empty string.`);
  }
  finite(start?.x, `${id}.start.x`);
  finite(start?.z, `${id}.start.z`);
  positive(start?.radius, `${id}.start.radius`);
  if (!Array.isArray(checkpoints) || checkpoints.length < 1) {
    throw new RangeError(`${id}.checkpoints must contain at least one checkpoint.`);
  }
  const ids = new Set();
  checkpoints.forEach((checkpoint, index) => {
    if (!checkpoint?.id || typeof checkpoint.id !== 'string') {
      throw new TypeError(`${id}.checkpoints[${index}].id must be a non-empty string.`);
    }
    if (ids.has(checkpoint.id)) {
      throw new RangeError(`${id} has duplicate checkpoint "${checkpoint.id}".`);
    }
    ids.add(checkpoint.id);
    finite(checkpoint.x, `${id}.${checkpoint.id}.x`);
    finite(checkpoint.z, `${id}.${checkpoint.id}.z`);
    positive(checkpoint.radius, `${id}.${checkpoint.id}.radius`);
    if (!['reach', 'jump'].includes(checkpoint.action)) {
      throw new RangeError(`${id}.${checkpoint.id}.action must be reach or jump.`);
    }
  });
  if (timeLimit != null) positive(timeLimit, `${id}.timeLimit`);
  positive(reward, `${id}.reward`);
  return deepFreeze({
    id,
    title,
    objective,
    start: { ...start },
    checkpoints: checkpoints.map((checkpoint) => ({ ...checkpoint })),
    timeLimit,
    reward,
  });
}

export const HUB_ACTIVITY_DEFINITIONS = Object.freeze([
  defineHubActivity({
    id: 'skate-line',
    title: 'Beacon Line',
    objective: 'Run the five gold gates in order before time runs out.',
    start: { x: 4, z: 7.5, radius: 2.7 },
    checkpoints: [
      { id: 'east-turn', label: 'East Turn', x: 11.7, z: -1.6, radius: 2.1, action: 'reach' },
      { id: 'funbox', label: 'Funbox', x: 5.5, z: -10.2, radius: 2.1, action: 'reach' },
      { id: 'south-line', label: 'South Line', x: -5.7, z: -10.4, radius: 2.1, action: 'reach' },
      { id: 'bank', label: 'Bank', x: -11.8, z: -5.2, radius: 2.1, action: 'reach' },
      { id: 'beacon', label: 'Beacon', x: 2.4, z: 3.2, radius: 2.2, action: 'reach' },
    ],
    timeLimit: 24,
    reward: 30,
  }),
  defineHubActivity({
    id: 'garden-steps',
    title: 'Echo Steps',
    objective: 'Jump on the three echo stones, then reach the water bridge.',
    start: { x: 11, z: 10.5, radius: 2.7 },
    checkpoints: [
      { id: 'echo-one', label: 'Echo 1', x: 8.9, z: 12.8, radius: 1.5, action: 'jump' },
      { id: 'echo-two', label: 'Echo 2', x: 11, z: 13.6, radius: 1.5, action: 'jump' },
      { id: 'echo-three', label: 'Echo 3', x: 13.1, z: 12.8, radius: 1.5, action: 'jump' },
      { id: 'water-bridge', label: 'Water Bridge', x: 8.6, z: -5, radius: 2.2, action: 'reach' },
    ],
    timeLimit: 40,
    reward: 25,
  }),
]);

export function commitHubActivityBest(save, activityId, elapsed) {
  if (!activityId || typeof activityId !== 'string' || !Number.isFinite(elapsed) || elapsed < 0) {
    throw new TypeError('Hub activity best requires an activity id and non-negative elapsed time.');
  }
  const stored = save.get('hubActivityBests', {});
  const bests = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const previousBest = Number.isFinite(bests[activityId]) && bests[activityId] >= 0
    ? bests[activityId]
    : null;
  if (previousBest != null && elapsed >= previousBest) {
    return Object.freeze({
      attempted: false,
      committed: true,
      previousBest,
      best: previousBest,
    });
  }
  const committed = save.set('hubActivityBests', { ...bests, [activityId]: elapsed });
  return Object.freeze({
    attempted: true,
    committed,
    previousBest,
    best: committed ? elapsed : previousBest,
  });
}

function indexDefinitions(definitions) {
  if (!Array.isArray(definitions) || !definitions.length) {
    throw new RangeError('Hub activities require at least one definition.');
  }
  const byId = new Map();
  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new RangeError(`Duplicate hub activity id "${definition.id}".`);
    }
    byId.set(definition.id, definition);
  }
  return byId;
}

export function createHubActivitySession(
  definitions = HUB_ACTIVITY_DEFINITIONS,
  { onEvent = () => {} } = {},
) {
  const byId = indexDefinitions(definitions);
  let state = {
    status: 'idle',
    activityId: null,
    checkpointIndex: 0,
    elapsed: 0,
    reason: null,
  };

  function definition() {
    return state.activityId ? byId.get(state.activityId) : null;
  }

  function snapshot() {
    const activity = definition();
    return Object.freeze({
      ...state,
      active: state.status === 'active',
      title: activity?.title || '',
      objective: activity?.objective || '',
      reward: activity?.reward || 0,
      timeLimit: activity?.timeLimit ?? null,
      checkpointCount: activity?.checkpoints.length || 0,
      nextCheckpoint: activity?.checkpoints[state.checkpointIndex] || null,
    });
  }

  function emit(type, extra = {}) {
    const event = Object.freeze({ type, ...snapshot(), ...extra });
    onEvent(event);
    return event;
  }

  function start(id) {
    const activity = byId.get(id);
    if (!activity) return null;
    state = {
      status: 'active',
      activityId: id,
      checkpointIndex: 0,
      elapsed: 0,
      reason: null,
    };
    return emit('started', { definition: activity });
  }

  function cancel(reason = 'player-exit') {
    if (state.status !== 'active') return null;
    state = { ...state, status: 'cancelled', reason };
    return emit('cancelled');
  }

  function step({ position, jumpEvent = false } = {}, dt = 0) {
    if (state.status !== 'active') return null;
    finite(dt, 'Hub activity dt');
    state = { ...state, elapsed: state.elapsed + Math.max(0, dt) };
    const activity = definition();
    if (activity.timeLimit != null && state.elapsed >= activity.timeLimit) {
      state = { ...state, status: 'failed', reason: 'time-limit' };
      return emit('failed');
    }

    const checkpoint = activity.checkpoints[state.checkpointIndex];
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
    const inRange = Math.hypot(position.x - checkpoint.x, position.z - checkpoint.z)
      <= checkpoint.radius;
    const actionReady = checkpoint.action === 'reach' || Boolean(jumpEvent);
    if (!inRange || !actionReady) return null;

    const completedIndex = state.checkpointIndex;
    state = { ...state, checkpointIndex: completedIndex + 1 };
    emit('checkpoint', { checkpoint, completedIndex });
    if (state.checkpointIndex < activity.checkpoints.length) return snapshot();

    state = { ...state, status: 'completed', reason: 'finished' };
    return emit('completed', { definition: activity });
  }

  return Object.freeze({
    definitions: Object.freeze([...definitions]),
    start,
    cancel,
    step,
    snapshot,
    getDefinition(id) {
      return byId.get(id) || null;
    },
  });
}
