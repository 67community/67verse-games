import {
  LEVEL_FORMAT,
  LEVEL_VERSION,
  MAX_LEVEL_PIECES,
  levelFromEditor,
  pieceSignature,
} from '../../src/ugc/format.js';
import { creatorTemplate } from '../../src/ugc/templates.js';

export const NEAR_MAX_UGC_WORLD_ID = 'qa-near-max-local-world';
export const NEAR_MAX_UGC_WORLD_NAME = 'A Very Long Local Skygarden Run!'.slice(0, 32);

export function createNearMaxPublishedLocalWorld({ now = 1_700_000_000_000 } = {}) {
  const pieces = [
    { assetId: 'marker.spawn', gx: 0, gz: 15, rot: 0 },
    { assetId: 'marker.goal', gx: 15, gz: 0, rot: 0 },
  ];
  const cells = [];
  for (let gz = 0; gz < 16; gz += 1) {
    for (let gx = 0; gx < 16; gx += 1) {
      if ((gx === 0 && gz === 15) || (gx === 15 && gz === 0)) continue;
      cells.push({ gx, gz });
    }
  }
  cells.slice(0, MAX_LEVEL_PIECES - 2).forEach(({ gx, gz }, index) => {
    const assetId = index < 24
      ? 'hazard.spinner'
      : index < 40
        ? 'play.bounce'
        : index % 2
          ? 'ramp.basic'
          : 'block.basic';
    pieces.push({ assetId, gx, gz, rot: index & 3 });
  });
  const signature = pieceSignature(pieces);
  return {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    id: NEAR_MAX_UGC_WORLD_ID,
    name: NEAR_MAX_UGC_WORLD_NAME,
    creator: 'QA Device Local Creator Snapshot',
    createdAt: now,
    updatedAt: now,
    grid: { size: 16, cellSize: 1 },
    gameplay: { mode: 'goal-run' },
    publication: { state: 'local', publishedAt: now },
    validation: { pieceSignature: signature, passedAt: now - 1 },
    pieces,
  };
}

export function nearMaxLocalWorldCollection(options) {
  return {
    version: 1,
    worlds: [createNearMaxPublishedLocalWorld(options)],
  };
}

export function templateLocalWorldId(templateId) {
  return `qa-template-${templateId}`;
}

export function createPublishedTemplateLocalWorld(
  templateId,
  { now = 1_700_000_000_000 } = {},
) {
  const template = creatorTemplate(templateId);
  const pieces = template.pieces.map((piece) => ({ ...piece }));
  return levelFromEditor({
    id: templateLocalWorldId(template.id),
    name: template.name,
    creator: '67VERSE Starter Kit',
    pieces,
    publicationState: 'local',
    publishedAt: now,
    validatedSignature: pieceSignature(pieces),
    validatedAt: now - 1,
    gameplayMode: template.mode,
    templateId: template.id,
    tags: template.tags,
    now,
  });
}

export function templateLocalWorldCollection(templateId, options) {
  return {
    version: 1,
    worlds: [createPublishedTemplateLocalWorld(templateId, options)],
  };
}
