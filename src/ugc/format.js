// format.js - canonical, backend-agnostic level document for local UGC.
//
// This module is deliberately pure: it validates/migrates JSON but does not
// read localStorage, claim network publication, or construct Three.js objects.

export const LEVEL_FORMAT = '67verse-level';
export const LEVEL_VERSION = 3;
export const GRID_SIZE = 16;
export const MAX_LEVEL_PIECES = 96;

export const LEVEL_ASSETS = Object.freeze({
  'block.basic': Object.freeze({
    id: 'block.basic', legacyType: 'block', label: 'Block', category: 'platform',
    maxPerLevel: 92,
  }),
  'ramp.basic': Object.freeze({
    id: 'ramp.basic', legacyType: 'ramp', label: 'Ramp', category: 'platform',
    maxPerLevel: 92,
  }),
  'hazard.spinner': Object.freeze({
    id: 'hazard.spinner', legacyType: 'spinner', label: 'Spinner', category: 'hazard',
    maxPerLevel: 24,
  }),
  'play.bounce': Object.freeze({
    id: 'play.bounce', legacyType: 'bounce', label: 'Bounce Pad', category: 'gameplay',
    maxPerLevel: 16,
    runtime: Object.freeze({
      triggerRadius: 0.62,
      maxContactY: 0.42,
      launchVelocity: 8.2,
      cooldown: 0.55,
    }),
  }),
  'play.score': Object.freeze({
    id: 'play.score', legacyType: 'score', label: 'Score Star', category: 'gameplay',
    maxPerLevel: 12,
    runtime: Object.freeze({ triggerRadius: 0.72 }),
  }),
  'marker.spawn': Object.freeze({
    id: 'marker.spawn', legacyType: 'spawn', label: 'Spawn', category: 'marker',
    maxPerLevel: 1,
  }),
  'marker.goal': Object.freeze({
    id: 'marker.goal', legacyType: 'goal', label: 'Goal', category: 'marker',
    maxPerLevel: 1,
  }),
});

export const UGC_GAMEPLAY_MODES = Object.freeze({
  race: Object.freeze({
    id: 'race',
    label: 'Race',
    objective: 'Reach the Goal as quickly as you can.',
  }),
  survival: Object.freeze({
    id: 'survival',
    label: 'Survival',
    objective: 'Stay in play for 20 seconds.',
    durationSeconds: 20,
  }),
  score: Object.freeze({
    id: 'score',
    label: 'Score',
    objective: 'Collect every Score Star.',
  }),
});

export const UGC_DISCOVERY_TAGS = Object.freeze([
  'race',
  'survival',
  'score',
  'beginner',
  'quick',
  'hazards',
  'precision',
]);

const MODE_IDS = new Set(Object.keys(UGC_GAMEPLAY_MODES));
const DISCOVERY_TAG_SET = new Set(UGC_DISCOVERY_TAGS);

const TYPE_TO_ASSET = Object.freeze(Object.fromEntries(
  Object.values(LEVEL_ASSETS).map((asset) => [asset.legacyType, asset.id])
));

function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanText(value, fallback, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

export function formatLocalCreatorAttribution(value, { sessionOnly = false } = {}) {
  const creator = cleanText(value, 'Local Creator', 32);
  return `by ${creator} · local name snapshot${
    sessionOnly ? ' · session-only identity' : ''
  }`;
}

export function pieceSignature(pieces) {
  return (Array.isArray(pieces) ? pieces : [])
    .map((piece) => {
      const assetId = piece.assetId || TYPE_TO_ASSET[piece.t] || '';
      return `${assetId}:${int(piece.gx)}:${int(piece.gz)}:${int(piece.rot) & 3}`;
    })
    .sort()
    .join('|');
}

function normalizePiece(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const assetId = String(raw.assetId || TYPE_TO_ASSET[raw.t] || '');
  if (!LEVEL_ASSETS[assetId]) return null;
  const gx = int(raw.gx, -1);
  const gz = int(raw.gz, -1);
  if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return null;
  return { assetId, gx, gz, rot: int(raw.rot) & 3 };
}

export function normalizeLevel(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sourcePieces = Array.isArray(raw.pieces) ? raw.pieces : [];
  const pieces = [];
  const occupied = new Set();
  const counts = new Map();
  for (const source of sourcePieces) {
    const piece = normalizePiece(source);
    if (!piece) continue;
    const cell = `${piece.gx},${piece.gz}`;
    if (occupied.has(cell)) continue;
    const asset = LEVEL_ASSETS[piece.assetId];
    const count = counts.get(piece.assetId) || 0;
    if (count >= asset.maxPerLevel || pieces.length >= MAX_LEVEL_PIECES) continue;
    occupied.add(cell);
    counts.set(piece.assetId, count + 1);
    pieces.push(piece);
  }

  const legacyPublished = raw.published === true;
  const publicationState =
    raw.publication?.state === 'local' || legacyPublished ? 'local' : 'draft';
  const creator = cleanText(raw.creator ?? raw.author, 'Local Creator', 32);
  const createdAt = Number.isFinite(+raw.createdAt) ? +raw.createdAt : Date.now();
  const updatedAt = Number.isFinite(+raw.updatedAt) ? +raw.updatedAt : createdAt;
  const validatedSignature = String(
    raw.validation?.pieceSignature || raw.validatedSignature || ''
  );
  const legacyMode = raw.gameplay?.mode === 'goal-run' ? 'race' : raw.gameplay?.mode;
  const mode = MODE_IDS.has(legacyMode) ? legacyMode : 'race';
  const scoreCount = pieces.filter((piece) => piece.assetId === 'play.score').length;
  const templateId = cleanText(raw.discovery?.templateId, '', 32);
  const tags = [...new Set(
    (Array.isArray(raw.discovery?.tags) ? raw.discovery.tags : [])
      .map((tag) => String(tag).trim().toLowerCase())
      .filter((tag) => DISCOVERY_TAG_SET.has(tag)),
  )].slice(0, 4);
  if (!tags.includes(mode)) tags.unshift(mode);

  return {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    id: cleanText(raw.id, '', 64),
    name: cleanText(raw.name, 'Untitled Level', 32),
    creator,
    createdAt,
    updatedAt,
    grid: { size: GRID_SIZE, cellSize: 1 },
    gameplay: {
      mode,
      objective: UGC_GAMEPLAY_MODES[mode].objective,
      durationSeconds: mode === 'survival'
        ? UGC_GAMEPLAY_MODES.survival.durationSeconds
        : null,
      targetScore: mode === 'score' ? scoreCount : null,
    },
    discovery: {
      scope: 'local-device',
      templateId,
      tags: tags.slice(0, 4),
    },
    publication: {
      state: publicationState,
      publishedAt: publicationState === 'local' && Number.isFinite(+raw.publication?.publishedAt)
        ? +raw.publication.publishedAt
        : null,
    },
    validation: {
      pieceSignature: validatedSignature,
      passedAt: Number.isFinite(+raw.validation?.passedAt) ? +raw.validation.passedAt : null,
    },
    pieces,
  };
}

export function validateLevel(raw, { requireValidated = false } = {}) {
  const level = normalizeLevel(raw);
  const errors = [];
  if (!level) return { ok: false, errors: ['Level data is missing or invalid.'], level: null };
  if (!level.id) errors.push('Save the level before publishing.');
  const spawnCount = level.pieces.filter((p) => p.assetId === 'marker.spawn').length;
  const goalCount = level.pieces.filter((p) => p.assetId === 'marker.goal').length;
  const spinnerCount = level.pieces.filter((p) => p.assetId === 'hazard.spinner').length;
  const scoreCount = level.pieces.filter((p) => p.assetId === 'play.score').length;
  if (spawnCount !== 1) errors.push('Place exactly one Spawn marker.');
  if (level.gameplay.mode === 'race' && goalCount !== 1) {
    errors.push('Race templates need exactly one Goal marker.');
  }
  if (level.gameplay.mode === 'survival' && spinnerCount < 2) {
    errors.push('Survival templates need at least two Spinner hazards.');
  }
  if (level.gameplay.mode === 'score' && scoreCount < 3) {
    errors.push('Score templates need at least three Score Stars.');
  }
  if (requireValidated && level.validation.pieceSignature !== pieceSignature(level.pieces)) {
    errors.push('Finish a successful play test after the latest edit.');
  }
  return { ok: errors.length === 0, errors, level };
}

export function levelFromEditor({
  id,
  name,
  creator,
  pieces,
  previous = null,
  publicationState = 'draft',
  publishedAt = null,
  validatedSignature = '',
  validatedAt = null,
  gameplayMode = 'race',
  templateId = '',
  tags = [],
  now = Date.now(),
}) {
  const prior = normalizeLevel(previous);
  return normalizeLevel({
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    id,
    name,
    // Authorship is an immutable local snapshot. Editing or republishing a
    // saved level under a later guest fallback must not rewrite its history.
    creator: prior?.creator || creator,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    publication: { state: publicationState, publishedAt },
    validation: { pieceSignature: validatedSignature, passedAt: validatedAt },
    gameplay: { mode: gameplayMode },
    discovery: { scope: 'local-device', templateId, tags },
    pieces: (Array.isArray(pieces) ? pieces : []).map((piece) => ({
      assetId: piece.assetId || TYPE_TO_ASSET[piece.t],
      gx: piece.gx,
      gz: piece.gz,
      rot: piece.rot,
    })),
  });
}

export function editorPiecesFromLevel(raw) {
  const level = normalizeLevel(raw);
  if (!level) return { level: null, pieces: [] };
  return {
    level,
    pieces: level.pieces.map((piece) => ({
      t: LEVEL_ASSETS[piece.assetId].legacyType,
      gx: piece.gx,
      gz: piece.gz,
      rot: piece.rot,
    })),
  };
}

export function compileLevelForPlay(raw) {
  const level = normalizeLevel(raw);
  if (!level) return null;
  const toWorld = (cell) => cell - GRID_SIZE / 2 + 0.5;
  const spawnPiece = level.pieces.find((piece) => piece.assetId === 'marker.spawn');
  const goalPiece = level.pieces.find((piece) => piece.assetId === 'marker.goal');
  return {
    ...level,
    spawn: spawnPiece
      ? { x: toWorld(spawnPiece.gx), z: toWorld(spawnPiece.gz) }
      : { x: -GRID_SIZE / 2 + 2.5, z: 0.5 },
    goal: goalPiece
      ? { x: toWorld(goalPiece.gx), z: toWorld(goalPiece.gz) }
      : null,
    runtimePieces: level.pieces
      .filter((piece) => !piece.assetId.startsWith('marker.'))
      .map((piece) => ({
        ...piece,
        x: toWorld(piece.gx),
        z: toWorld(piece.gz),
      })),
  };
}

export function isLocallyPublished(raw) {
  return normalizeLevel(raw)?.publication.state === 'local';
}
