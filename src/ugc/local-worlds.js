// Versioned persistence boundary for Creator worlds stored on this device.
// Collection recovery is local resilience only; "published" continues to mean
// visible in this browser's prototype feed, never uploaded or online.

import {
  isLocallyPublished,
  validateLevel,
} from './format.js';
import {
  isPlainRecord,
  LOCAL_SAVE_SCHEMA_VERSION,
  removeLocalCounterEntry,
} from '../core/local-save-schema.js';
import { resolveLocalWorldReports } from '../core/local-moderation.js';

export const LOCAL_WORLD_COLLECTION_VERSION = LOCAL_SAVE_SCHEMA_VERSION;

function sameJson(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function recoverLevel(raw) {
  const base = validateLevel(raw);
  if (!base.ok) return null;
  let level = base.level;
  if (isLocallyPublished(level) && !validateLevel(level, { requireValidated: true }).ok) {
    level = {
      ...level,
      publication: { state: 'draft', publishedAt: null },
    };
  }
  return level;
}

export function recoverLocalWorldCollection(raw) {
  const legacy = Array.isArray(raw);
  const envelope = isPlainRecord(raw) && Array.isArray(raw.worlds);
  const source = legacy ? raw : (envelope ? raw.worlds : []);
  const byId = new Map();
  for (const candidate of source) {
    const level = recoverLevel(candidate);
    if (!level) continue;
    const previous = byId.get(level.id);
    if (!previous || level.updatedAt >= previous.updatedAt) byId.set(level.id, level);
  }
  const worlds = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  const state = {
    version: LOCAL_WORLD_COLLECTION_VERSION,
    worlds,
  };
  return { state, recovered: !sameJson(raw, state) };
}

export function readLocalWorlds(save) {
  const recovery = recoverLocalWorldCollection(save.get('ugcWorlds', null));
  if (recovery.recovered) save.set('ugcWorlds', recovery.state);
  return recovery.state.worlds;
}

export function upsertLocalWorld(save, rawWorld) {
  const level = recoverLevel(rawWorld);
  if (!level) return null;
  const worlds = readLocalWorlds(save);
  const index = worlds.findIndex((world) => world.id === level.id);
  if (index >= 0) worlds[index] = level;
  else worlds.push(level);
  worlds.sort((a, b) => a.createdAt - b.createdAt);
  const saved = save.set('ugcWorlds', {
    version: LOCAL_WORLD_COLLECTION_VERSION,
    worlds,
  });
  return saved === false ? null : level;
}

export function deleteLocalWorld(save, id, { reportStatus = 'unavailable' } = {}) {
  const worlds = readLocalWorlds(save);
  const filtered = worlds.filter((world) => world.id !== id);
  if (filtered.length === worlds.length) return { status: 'missing' };
  const saved = save.set('ugcWorlds', {
    version: LOCAL_WORLD_COLLECTION_VERSION,
    worlds: filtered,
  });
  if (saved === false) return { status: 'write-failed' };
  removeLocalCounterEntry(save, 'ugcPlays', id);
  removeLocalCounterEntry(save, 'ugcLikes', id);
  resolveLocalWorldReports(save, id, reportStatus);
  return { status: 'removed' };
}

export function removeLocalWorld(save, id, options) {
  return deleteLocalWorld(save, id, options).status === 'removed';
}
