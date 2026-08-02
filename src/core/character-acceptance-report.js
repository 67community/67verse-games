import {
  CHARACTER_ANCHOR_KEYS,
  CHARACTER_MANIFEST_VERSION,
  DEFAULT_CHARACTER_BUDGETS,
  PRODUCTION_CLIP_KEYS,
  validateProductionCharacterManifest,
} from './production-character.js';

export const CHARACTER_ACCEPTANCE_REPORT_VERSION = 1;

function slugFromFileName(fileName = 'candidate.glb') {
  const stem = String(fileName).replace(/\.glb$/i, '');
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (slug.length >= 2) return slug;
  return `candidate-${slug || '01'}`.slice(0, 48);
}

function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export function createCharacterManifestTemplate(fileName = 'candidate.glb') {
  const id = slugFromFileName(fileName);
  return {
    schemaVersion: CHARACTER_MANIFEST_VERSION,
    id,
    name: titleFromSlug(id),
    url: `/characters/${id}.glb`,
    activation: 'development',
    releaseApproved: false,
    targetHeight: 1.9,
    forwardAxis: '+z',
    clips: Object.fromEntries(PRODUCTION_CLIP_KEYS.map((key) => [
      key,
      [key[0].toUpperCase() + key.slice(1)],
    ])),
    anchors: {
      head: 'Head',
      face: 'Face',
      back: 'Spine2',
      handLeft: 'Hand_L',
      handRight: 'Hand_R',
    },
    budgets: { ...DEFAULT_CHARACTER_BUDGETS },
  };
}

function clipNames(report) {
  return Object.fromEntries(PRODUCTION_CLIP_KEYS.map((key) => [
    key,
    report?.clips?.[key]?.name || null,
  ]));
}

function anchorFacts(report) {
  return Object.fromEntries(CHARACTER_ANCHOR_KEYS.map((key) => {
    const anchor = report?.anchors?.[key];
    return [key, {
      requestedNode: anchor?.requestedNode || null,
      found: anchor ? anchor.found === true : null,
      fallback: anchor ? anchor.fallback === true : null,
    }];
  }));
}

export function createCharacterAcceptanceReport({
  fileName = null,
  fileBytes = null,
  manifest = null,
  inspection = null,
  loadError = null,
} = {}) {
  const manifestErrors = validateProductionCharacterManifest(manifest);
  const status = manifestErrors.length
    ? 'rejected'
    : inspection?.status || (loadError ? 'load-error' : 'not-run');
  return {
    schema: '67verse-character-acceptance-report',
    schemaVersion: CHARACTER_ACCEPTANCE_REPORT_VERSION,
    localOnly: true,
    releaseApproved: false,
    file: {
      name: fileName,
      bytes: Number.isFinite(fileBytes) ? fileBytes : null,
    },
    manifest,
    automatedInspection: {
      status,
      canPreview: inspection?.canPreview === true,
      errors: [
        ...manifestErrors,
        ...(inspection?.errors || []),
        ...(loadError ? [String(loadError)] : []),
      ],
      warnings: [...(inspection?.warnings || [])],
      metrics: inspection?.metrics || {},
      clips: clipNames(inspection),
      anchors: anchorFacts(inspection),
      usedFallbackAnchors: [...(inspection?.usedFallbackAnchors || [])],
    },
    humanSignoffRequired: [
      'identity turntable against approved 2D art',
      'rig weights, deformation, loops, and root motion',
      'in-game movement and grounding',
      'all five cosmetic anchors from every side',
      'hub, Skyway, Tag, Balloon, UGC, and results',
      'representative phone and laptop performance',
    ],
    decision: 'NOT APPROVED - automated inspection is only one acceptance gate',
  };
}

export function compactCharacterAcceptanceReport(report) {
  return JSON.stringify(report, null, 2);
}
