// Versioned recovery for the mixed, device-local moderation queue.
// Records never leave this browser. Recovery provides local resilience only;
// it is not an online moderation service or an authoritative audit log.

import {
  isPlainRecord,
  LOCAL_SAVE_SCHEMA_VERSION,
} from './local-save-schema.js';

export const LOCAL_MODERATION_QUEUE_VERSION = LOCAL_SAVE_SCHEMA_VERSION;

const WORLD_STATUSES = new Set(['open', 'kept', 'removed', 'unavailable']);
const CHAT_STATUSES = new Set(['pending', 'kept', 'removed']);

function sameJson(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function boundedString(value, maxLength, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : fallback;
}

export function formatLocalReporterAttribution(value) {
  return `${boundedString(value, 64, 'Local player')} (local name snapshot)`;
}

function recordId(value) {
  return boundedString(value, 128);
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function recoverChatRecord(raw) {
  const id = recordId(raw.id);
  if (!id) return null;
  const from = boundedString(raw.from, 64, 'Unknown local sender');
  const text = boundedString(raw.text, 500, '[message unavailable]');
  const reporter = boundedString(raw.reporter, 64, 'Local player');
  const reason = boundedString(raw.reason, 80, 'user-report');
  return {
    id,
    type: 'chat',
    from,
    text,
    reporter,
    reason,
    status: CHAT_STATUSES.has(raw.status) ? raw.status : 'pending',
    at: canonicalTimestamp(raw.at),
  };
}

function recoverWorldRecord(raw) {
  const id = recordId(raw.id);
  const worldId = recordId(raw.worldId);
  if (!id || !worldId) return null;
  return {
    id,
    type: 'ugc-world',
    worldId,
    worldName: boundedString(raw.worldName, 64, 'Unavailable local level'),
    reason: boundedString(raw.reason, 80, 'Unspecified local flag'),
    reporter: boundedString(raw.reporter, 64, 'Local player'),
    at: canonicalTimestamp(raw.at),
    status: WORLD_STATUSES.has(raw.status)
      ? raw.status
      : (raw.status == null ? 'open' : 'unavailable'),
  };
}

function recoverRecord(raw) {
  if (!isPlainRecord(raw)) return null;
  if (raw.type === 'chat') return recoverChatRecord(raw);
  if (raw.type === 'ugc-world' || Object.hasOwn(raw, 'worldId')) {
    return recoverWorldRecord(raw);
  }
  return null;
}

export function recoverLocalModerationQueue(raw) {
  const legacy = Array.isArray(raw);
  const envelope = isPlainRecord(raw) && Array.isArray(raw.records);
  const source = legacy ? raw : (envelope ? raw.records : []);
  const byId = new Map();
  for (const candidate of source) {
    const record = recoverRecord(candidate);
    if (!record) continue;
    const previous = byId.get(record.id);
    const previousTime = previous?.at ? Date.parse(previous.at) : -1;
    const recordTime = record.at ? Date.parse(record.at) : -1;
    if (!previous || recordTime >= previousTime) byId.set(record.id, record);
  }
  const records = [...byId.values()];
  const state = {
    version: LOCAL_MODERATION_QUEUE_VERSION,
    records,
  };
  return { state, recovered: !sameJson(raw, state) };
}

export function readLocalModerationQueue(save, { worldIds } = {}) {
  const recovery = recoverLocalModerationQueue(save.get('modQueue', null));
  const allowedWorlds = worldIds == null ? null : new Set(worldIds);
  let orphanRecovered = false;
  if (allowedWorlds) {
    for (const record of recovery.state.records) {
      if (
        record.type === 'ugc-world'
        && record.status === 'open'
        && !allowedWorlds.has(record.worldId)
      ) {
        record.status = 'unavailable';
        orphanRecovered = true;
      }
    }
  }
  if (recovery.recovered || orphanRecovered) {
    save.set('modQueue', recovery.state);
  }
  return recovery.state.records;
}

export function appendLocalModerationRecord(save, rawRecord) {
  const record = recoverRecord(rawRecord);
  if (!record) return null;
  const records = readLocalModerationQueue(save);
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) records[index] = record;
  else records.push(record);
  const saved = save.set('modQueue', {
    version: LOCAL_MODERATION_QUEUE_VERSION,
    records,
  });
  return saved === false ? null : record;
}

export function setLocalModerationStatus(save, id, status) {
  const records = readLocalModerationQueue(save);
  const record = records.find((item) => item.id === id);
  if (!record) return false;
  const statuses = record.type === 'chat' ? CHAT_STATUSES : WORLD_STATUSES;
  if (!statuses.has(status)) return false;
  record.status = status;
  const saved = save.set('modQueue', {
    version: LOCAL_MODERATION_QUEUE_VERSION,
    records,
  });
  return saved !== false;
}

export function resolveLocalWorldReports(save, worldId, status = 'unavailable') {
  if (!WORLD_STATUSES.has(status)) return 0;
  const records = readLocalModerationQueue(save);
  let changed = 0;
  for (const record of records) {
    if (
      record.type === 'ugc-world'
      && record.worldId === worldId
      && record.status === 'open'
    ) {
      record.status = status;
      changed += 1;
    }
  }
  if (changed) {
    const saved = save.set('modQueue', {
      version: LOCAL_MODERATION_QUEUE_VERSION,
      records,
    });
    if (saved === false) return 0;
  }
  return changed;
}
