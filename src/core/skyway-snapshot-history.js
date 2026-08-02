export const SKYWAY_SNAPSHOT_HISTORY_VERSION = 2;
export const SKYWAY_SNAPSHOT_HISTORY_CAPACITY = 120;

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function canonicalValue(value, seen) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical snapshots require finite numbers.');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError('Canonical snapshots require JSON values.');
  }
  if (seen.has(value)) throw new TypeError('Canonical snapshots cannot contain cycles.');
  seen.add(value);
  let encoded;
  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError('Canonical snapshots require dense arrays.');
      }
      items.push(canonicalValue(value[index], seen));
    }
    encoded = `[${items.join(',')}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical snapshots require plain objects.');
    }
    encoded = `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key], seen)}`)
      .join(',')}}`;
  }
  seen.delete(value);
  return encoded;
}

export function canonicalizeSkywaySnapshot(snapshot) {
  return canonicalValue(snapshot, new Set());
}

function hashCanonicalSnapshot(canonical) {
  let hash = FNV_OFFSET_64;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & UINT64_MASK;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function hashSkywaySnapshot(snapshot) {
  return hashCanonicalSnapshot(canonicalizeSkywaySnapshot(snapshot));
}

function assertHistory(history) {
  if (
    !history ||
    history.version !== SKYWAY_SNAPSHOT_HISTORY_VERSION ||
    !Number.isSafeInteger(history.roundEpoch) ||
    history.roundEpoch < 1 ||
    !Number.isInteger(history.capacityTicks) ||
    history.capacityTicks < 1 ||
    !Array.isArray(history.slots) ||
    history.slots.length !== history.capacityTicks ||
    (history.oldestTick !== null && (
      !Number.isInteger(history.oldestTick) ||
      !Number.isInteger(history.latestTick) ||
      history.oldestTick < 0 ||
      history.latestTick < history.oldestTick ||
      history.latestTick - history.oldestTick >= history.capacityTicks
    )) ||
    (history.oldestTick === null && history.latestTick !== null)
  ) {
    throw new TypeError('Invalid Skyway snapshot history.');
  }
}

function assertRoundEpoch(history, roundEpoch) {
  if (!Number.isSafeInteger(roundEpoch) || roundEpoch !== history.roundEpoch) {
    throw new RangeError('Skyway snapshot history round epoch is stale.');
  }
}

function slotIndex(history, tick) {
  return tick % history.capacityTicks;
}

function detachedEntry(entry) {
  if (!entry) return null;
  return {
    roundEpoch: entry.roundEpoch,
    tick: entry.tick,
    hash: entry.hash,
    snapshot: JSON.parse(entry.canonical),
  };
}

export function createSkywaySnapshotHistory({
  capacityTicks = SKYWAY_SNAPSHOT_HISTORY_CAPACITY,
  roundEpoch = 1,
} = {}) {
  if (
    !Number.isInteger(capacityTicks) ||
    capacityTicks < 1 ||
    !Number.isSafeInteger(roundEpoch) ||
    roundEpoch < 1
  ) {
    throw new TypeError(
      'Skyway snapshot history requires positive capacity and round epoch.',
    );
  }
  return {
    version: SKYWAY_SNAPSHOT_HISTORY_VERSION,
    capacityTicks,
    roundEpoch,
    oldestTick: null,
    latestTick: null,
    slots: Array(capacityTicks).fill(null),
  };
}

export function recordSkywaySnapshot(history, snapshot, { roundEpoch } = {}) {
  assertHistory(history);
  assertRoundEpoch(history, roundEpoch);
  const tick = snapshot?.tick;
  if (!Number.isInteger(tick) || tick < 0) {
    throw new TypeError('Skyway history snapshots require a non-negative tick.');
  }
  if (history.latestTick !== null && tick !== history.latestTick + 1) {
    throw new RangeError(`Skyway snapshot history expected tick ${history.latestTick + 1}.`);
  }
  const canonical = canonicalizeSkywaySnapshot(snapshot);
  const entry = {
    roundEpoch: history.roundEpoch,
    tick,
    hash: hashCanonicalSnapshot(canonical),
    canonical,
  };
  history.slots[slotIndex(history, tick)] = entry;
  if (history.oldestTick === null) {
    history.oldestTick = tick;
  } else if (tick - history.oldestTick >= history.capacityTicks) {
    history.oldestTick = tick - history.capacityTicks + 1;
  }
  history.latestTick = tick;
  return detachedEntry(entry);
}

export function lookupSkywaySnapshot(history, tick, { roundEpoch } = {}) {
  assertHistory(history);
  assertRoundEpoch(history, roundEpoch);
  if (
    !Number.isInteger(tick) ||
    history.oldestTick === null ||
    tick < history.oldestTick ||
    tick > history.latestTick
  ) {
    return null;
  }
  const entry = history.slots[slotIndex(history, tick)];
  return entry?.tick === tick ? detachedEntry(entry) : null;
}

export function truncateSkywaySnapshotHistory(
  history,
  tick,
  { roundEpoch } = {},
) {
  assertHistory(history);
  assertRoundEpoch(history, roundEpoch);
  if (
    !Number.isInteger(tick) ||
    history.oldestTick === null ||
    tick < history.oldestTick ||
    tick > history.latestTick
  ) {
    throw new RangeError('Skyway snapshot history cannot truncate to an unavailable tick.');
  }
  for (let removed = tick + 1; removed <= history.latestTick; removed++) {
    const index = slotIndex(history, removed);
    if (history.slots[index]?.tick === removed) history.slots[index] = null;
  }
  history.latestTick = tick;
  return history;
}

export function resetSkywaySnapshotHistory(history, { roundEpoch } = {}) {
  assertHistory(history);
  assertRoundEpoch(history, roundEpoch);
  if (history.roundEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Skyway snapshot history round epoch is exhausted.');
  }
  history.oldestTick = null;
  history.latestTick = null;
  history.slots.fill(null);
  history.roundEpoch += 1;
  return history;
}
