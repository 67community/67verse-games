export const SKYWAY_INPUT_TIMELINE_VERSION = 1;
export const SKYWAY_INPUT_TIMELINE_CAPACITY = 120;

const INPUT_KEYS = new Set(['dirX', 'dirZ', 'moving', 'jumpHeld', 'grabPressed']);
export const SKYWAY_IDLE_INPUT = Object.freeze({
  dirX: 0,
  dirZ: 0,
  moving: false,
  jumpHeld: false,
  grabPressed: false,
});

export function validateSkywayTickInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== INPUT_KEYS.size || keys.some((key) => !INPUT_KEYS.has(key))) return null;
  if (
    !Number.isFinite(value.dirX) ||
    !Number.isFinite(value.dirZ) ||
    typeof value.moving !== 'boolean' ||
    typeof value.jumpHeld !== 'boolean' ||
    typeof value.grabPressed !== 'boolean'
  ) {
    return null;
  }
  let dirX = Math.max(-1, Math.min(1, value.dirX));
  let dirZ = Math.max(-1, Math.min(1, value.dirZ));
  const length = Math.hypot(dirX, dirZ);
  if (length > 1) {
    dirX /= length;
    dirZ /= length;
  }
  return {
    dirX,
    dirZ,
    moving: value.moving,
    jumpHeld: value.jumpHeld,
    grabPressed: value.grabPressed,
  };
}

function validParticipantIds(participantIds) {
  return Array.isArray(participantIds) &&
    participantIds.length > 0 &&
    participantIds.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(participantIds).size === participantIds.length;
}

function assertTimeline(timeline) {
  if (
    !timeline ||
    timeline.version !== SKYWAY_INPUT_TIMELINE_VERSION ||
    !Number.isInteger(timeline.capacityTicks) ||
    timeline.capacityTicks < 1 ||
    !Number.isInteger(timeline.nextTick) ||
    timeline.nextTick < 1 ||
    !validParticipantIds(timeline.participantIds) ||
    !Array.isArray(timeline.slots) ||
    timeline.slots.length !== timeline.capacityTicks
  ) {
    throw new TypeError('Invalid Skyway input timeline.');
  }
}

function participantIndex(timeline, participantId) {
  const index = timeline.participantIds.indexOf(participantId);
  if (index < 0) throw new RangeError(`Unknown Skyway participant "${participantId}".`);
  return index;
}

function slotIndex(timeline, tick) {
  return tick % timeline.capacityTicks;
}

function inputIsCanonical(input) {
  const normalized = validateSkywayTickInput(input);
  return normalized &&
    normalized.dirX === input.dirX &&
    normalized.dirZ === input.dirZ &&
    normalized.moving === input.moving &&
    normalized.jumpHeld === input.jumpHeld &&
    normalized.grabPressed === input.grabPressed;
}

export function createSkywayInputTimeline({
  participantIds,
  capacityTicks = SKYWAY_INPUT_TIMELINE_CAPACITY,
}) {
  if (
    !validParticipantIds(participantIds) ||
    !Number.isInteger(capacityTicks) ||
    capacityTicks < 1
  ) {
    throw new TypeError('Skyway input timeline requires participants and positive capacity.');
  }
  return {
    version: SKYWAY_INPUT_TIMELINE_VERSION,
    capacityTicks,
    nextTick: 1,
    participantIds: [...participantIds],
    slots: Array(capacityTicks).fill(null),
  };
}

export function queueSkywayTimelineInput(
  timeline,
  { tick, participantId, input },
) {
  assertTimeline(timeline);
  participantIndex(timeline, participantId);
  if (!Number.isInteger(tick) || tick < 1) {
    throw new TypeError('Skyway input tick must be a positive integer.');
  }
  const normalized = validateSkywayTickInput(input);
  if (!normalized) throw new TypeError('Invalid Skyway tick input.');
  if (tick < timeline.nextTick) return { accepted: false, reason: 'late' };
  if (tick >= timeline.nextTick + timeline.capacityTicks) {
    return { accepted: false, reason: 'too-far' };
  }

  const index = slotIndex(timeline, tick);
  let slot = timeline.slots[index];
  if (!slot || slot.tick !== tick) {
    slot = { tick, inputs: new Map() };
    timeline.slots[index] = slot;
  }
  if (slot.inputs.has(participantId)) {
    return { accepted: false, reason: 'duplicate' };
  }
  slot.inputs.set(participantId, normalized);
  return { accepted: true, reason: null };
}

export function hasSkywayTimelineInput(timeline, tick, participantId) {
  assertTimeline(timeline);
  participantIndex(timeline, participantId);
  if (tick !== timeline.nextTick) return false;
  const slot = timeline.slots[slotIndex(timeline, tick)];
  return slot?.tick === tick && slot.inputs.has(participantId);
}

export function readSkywayTimelineInput(timeline, tick, participantId) {
  assertTimeline(timeline);
  participantIndex(timeline, participantId);
  if (tick !== timeline.nextTick) {
    throw new RangeError(`Skyway input timeline expected tick ${timeline.nextTick}.`);
  }
  const slot = timeline.slots[slotIndex(timeline, tick)];
  const queued = slot?.tick === tick ? slot.inputs.get(participantId) : null;
  return queued
    ? { source: 'queued', input: { ...queued } }
    : { source: 'missing', input: { ...SKYWAY_IDLE_INPUT } };
}

export function advanceSkywayInputTimeline(timeline, tick) {
  assertTimeline(timeline);
  if (tick !== timeline.nextTick) {
    throw new RangeError(`Skyway input timeline expected tick ${timeline.nextTick}.`);
  }
  const index = slotIndex(timeline, tick);
  if (timeline.slots[index]?.tick === tick) timeline.slots[index] = null;
  timeline.nextTick += 1;
  return timeline;
}

export function resetSkywayInputTimeline(timeline) {
  assertTimeline(timeline);
  timeline.nextTick = 1;
  timeline.slots.fill(null);
  return timeline;
}

export function snapshotSkywayInputTimeline(timeline) {
  assertTimeline(timeline);
  return {
    version: timeline.version,
    capacityTicks: timeline.capacityTicks,
    nextTick: timeline.nextTick,
    participantIds: [...timeline.participantIds],
    entries: timeline.slots
      .filter((slot) => slot !== null)
      .sort((a, b) => a.tick - b.tick)
      .map((slot) => ({
        tick: slot.tick,
        inputs: timeline.participantIds
          .filter((id) => slot.inputs.has(id))
          .map((id) => ({ id, input: { ...slot.inputs.get(id) } })),
      })),
  };
}

export function restoreSkywayInputTimeline(timeline, snapshot) {
  assertTimeline(timeline);
  if (
    !snapshot ||
    snapshot.version !== SKYWAY_INPUT_TIMELINE_VERSION ||
    snapshot.capacityTicks !== timeline.capacityTicks ||
    !Number.isInteger(snapshot.nextTick) ||
    snapshot.nextTick < 1 ||
    !Array.isArray(snapshot.participantIds) ||
    snapshot.participantIds.length !== timeline.participantIds.length ||
    timeline.participantIds.some((id, index) => snapshot.participantIds[index] !== id) ||
    !Array.isArray(snapshot.entries) ||
    snapshot.entries.length > timeline.capacityTicks
  ) {
    throw new TypeError('Invalid Skyway input timeline snapshot.');
  }

  const restoredSlots = Array(timeline.capacityTicks).fill(null);
  let previousTick = snapshot.nextTick - 1;
  for (const entry of snapshot.entries) {
    if (
      !Number.isInteger(entry?.tick) ||
      entry.tick <= previousTick ||
      entry.tick < snapshot.nextTick ||
      entry.tick >= snapshot.nextTick + timeline.capacityTicks ||
      !Array.isArray(entry.inputs) ||
      entry.inputs.length > timeline.participantIds.length
    ) {
      throw new TypeError('Invalid Skyway input timeline snapshot.');
    }
    previousTick = entry.tick;
    const inputs = new Map();
    let previousParticipant = -1;
    for (const saved of entry.inputs) {
      const index = timeline.participantIds.indexOf(saved?.id);
      if (
        index <= previousParticipant ||
        !inputIsCanonical(saved.input)
      ) {
        throw new TypeError('Invalid Skyway input timeline snapshot.');
      }
      previousParticipant = index;
      inputs.set(saved.id, { ...saved.input });
    }
    restoredSlots[slotIndex(timeline, entry.tick)] = {
      tick: entry.tick,
      inputs,
    };
  }

  timeline.nextTick = snapshot.nextTick;
  timeline.slots = restoredSlots;
  return timeline;
}
