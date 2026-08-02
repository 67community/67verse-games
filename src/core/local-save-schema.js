// Shared primitives for versioned, device-local save recovery.
// These helpers repair JSON read from localStorage. They do not make local
// progression authoritative, tamper-proof, synchronized, or online-safe.

export const LOCAL_SAVE_SCHEMA_VERSION = 1;
export const MAX_LOCAL_COUNTER = 1_000_000_000;

export function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function nonNegativeInteger(value, fallback = 0, max = MAX_LOCAL_COUNTER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fallback;
}

export function uniqueBoundedIntegers(values, min, max) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => (
    Number.isInteger(value) && value >= min && value <= max
  )))];
}

export function uniqueStrings(values, maxLength = 128) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => (
    typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
  )))];
}

function sameJson(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function validCounterKey(key) {
  return typeof key === 'string'
    && key.length > 0
    && key.length <= 128
    && key !== '__proto__'
    && key !== 'prototype'
    && key !== 'constructor';
}

export function recoverLocalCounterState(raw) {
  const record = isPlainRecord(raw);
  const looksLikeEnvelope = record
    && (Object.hasOwn(raw, 'version') || Object.hasOwn(raw, 'counts'));
  const source = looksLikeEnvelope
    ? (isPlainRecord(raw.counts) ? raw.counts : {})
    : (record ? raw : {});
  const counts = {};
  for (const [key, value] of Object.entries(source)) {
    if (!validCounterKey(key)) continue;
    const count = nonNegativeInteger(value, -1);
    if (count >= 0) counts[key] = count;
  }
  const state = { version: LOCAL_SAVE_SCHEMA_VERSION, counts };
  return { state, recovered: !sameJson(raw, state) };
}

export function readLocalCounterMap(save, key) {
  const recovery = recoverLocalCounterState(save.get(key, null));
  if (recovery.recovered) save.set(key, recovery.state);
  return recovery.state.counts;
}

export function incrementLocalCounter(save, key, id) {
  if (!validCounterKey(id)) return null;
  const counts = readLocalCounterMap(save, key);
  const next = Math.min(MAX_LOCAL_COUNTER, nonNegativeInteger(counts[id]) + 1);
  counts[id] = next;
  return save.set(key, { version: LOCAL_SAVE_SCHEMA_VERSION, counts })
    ? next
    : null;
}

export function removeLocalCounterEntry(save, key, id) {
  if (!validCounterKey(id)) return false;
  const counts = readLocalCounterMap(save, key);
  if (!Object.hasOwn(counts, id)) return false;
  delete counts[id];
  return save.set(key, { version: LOCAL_SAVE_SCHEMA_VERSION, counts });
}

export function retainLocalCounterEntries(save, key, ids) {
  const allowed = new Set(
    Array.from(ids || []).filter(validCounterKey),
  );
  const counts = readLocalCounterMap(save, key);
  let changed = false;
  for (const id of Object.keys(counts)) {
    if (allowed.has(id)) continue;
    delete counts[id];
    changed = true;
  }
  if (changed) save.set(key, { version: LOCAL_SAVE_SCHEMA_VERSION, counts });
  return counts;
}
