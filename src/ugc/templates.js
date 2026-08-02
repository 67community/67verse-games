// Constrained, original starting points for the device-local Creator.
// Templates contain only allowlisted editor pieces and bounded objective data.

import { defineLevelDescription } from '../core/level-widgets.js';

export const UGC_TEMPLATE_IDS = Object.freeze([
  'race-starter',
  'survival-ring',
  'score-circuit',
]);

const templates = [
  {
    id: 'race-starter',
    mode: 'race',
    label: 'Race',
    icon: '🏁',
    name: 'Ribbon Run',
    objective: 'Reach the Goal as quickly as you can.',
    guidance: 'A bright slalom lane with two gates, two sweepers, one ramp, and one bounce.',
    tags: ['race', 'quick', 'beginner'],
    pieces: [
      { t: 'spawn', gx: 1, gz: 8, rot: 0 },
      { t: 'block', gx: 3, gz: 6, rot: 0 },
      { t: 'block', gx: 3, gz: 10, rot: 0 },
      { t: 'ramp', gx: 4, gz: 8, rot: 0 },
      { t: 'block', gx: 5, gz: 7, rot: 0 },
      { t: 'block', gx: 5, gz: 9, rot: 0 },
      { t: 'spinner', gx: 7, gz: 8, rot: 0 },
      { t: 'block', gx: 8, gz: 6, rot: 0 },
      { t: 'block', gx: 8, gz: 10, rot: 0 },
      { t: 'bounce', gx: 10, gz: 8, rot: 0 },
      { t: 'block', gx: 11, gz: 7, rot: 0 },
      { t: 'block', gx: 11, gz: 9, rot: 0 },
      { t: 'spinner', gx: 12, gz: 8, rot: 0 },
      { t: 'block', gx: 13, gz: 6, rot: 0 },
      { t: 'block', gx: 13, gz: 10, rot: 0 },
      { t: 'goal', gx: 14, gz: 8, rot: 0 },
    ],
    level: defineLevelDescription({
      id: 'ugc-template-race-starter',
      mode: 'race',
      metadata: { templateId: 'race-starter' },
      widgets: [
        {
          id: 'route',
          type: 'static-platform',
          position: { x: -2, y: 0.3, z: 0.5 },
          size: { x: 3, y: 0.6, z: 1 },
        },
        {
          id: 'hazard',
          type: 'sweeper',
          position: { x: 1.5, y: 0.2, z: 0.5 },
          length: 1.7,
          width: 0.2,
          speed: 2.6,
        },
        {
          id: 'finish',
          type: 'goal-zone',
          shape: 'line',
          axis: 'x',
          direction: 'positive',
          value: 6,
        },
      ],
    }),
  },
  {
    id: 'survival-ring',
    mode: 'survival',
    label: 'Survival',
    icon: '🛡️',
    name: 'Four Corners',
    objective: 'Stay in play for 20 seconds.',
    guidance: 'A symmetric arena with four readable sweepers and a protected center pocket.',
    tags: ['survival', 'hazards', 'beginner'],
    pieces: [
      { t: 'spawn', gx: 8, gz: 8, rot: 0 },
      { t: 'spinner', gx: 4, gz: 4, rot: 0 },
      { t: 'spinner', gx: 11, gz: 4, rot: 0 },
      { t: 'spinner', gx: 4, gz: 11, rot: 0 },
      { t: 'spinner', gx: 11, gz: 11, rot: 0 },
      { t: 'block', gx: 7, gz: 2, rot: 0 },
      { t: 'block', gx: 8, gz: 2, rot: 0 },
      { t: 'block', gx: 13, gz: 7, rot: 0 },
      { t: 'block', gx: 13, gz: 8, rot: 0 },
      { t: 'block', gx: 7, gz: 13, rot: 0 },
      { t: 'block', gx: 8, gz: 13, rot: 0 },
      { t: 'block', gx: 2, gz: 7, rot: 0 },
      { t: 'block', gx: 2, gz: 8, rot: 0 },
      { t: 'block', gx: 6, gz: 6, rot: 0 },
      { t: 'block', gx: 9, gz: 6, rot: 0 },
      { t: 'block', gx: 6, gz: 9, rot: 0 },
      { t: 'block', gx: 9, gz: 9, rot: 0 },
    ],
    level: defineLevelDescription({
      id: 'ugc-template-survival-ring',
      mode: 'survival',
      metadata: { templateId: 'survival-ring', durationSeconds: 20 },
      widgets: [
        ...[
          [-3.5, -3.5],
          [3.5, -3.5],
          [-3.5, 3.5],
          [3.5, 3.5],
        ].map(([x, z], index) => ({
          id: `sweeper-${index + 1}`,
          type: 'sweeper',
          position: { x, y: 0.2, z },
          length: 1.7,
          width: 0.2,
          speed: 2.6,
        })),
        { id: 'fall', type: 'fall-hazard', belowY: -4 },
      ],
    }),
  },
  {
    id: 'score-circuit',
    mode: 'score',
    label: 'Score',
    icon: '⭐',
    name: 'Star Loop',
    objective: 'Collect all 5 Score Stars.',
    guidance: 'Five landmarks form a clear loop around one bounce and one central sweeper.',
    tags: ['score', 'quick', 'precision'],
    pieces: [
      { t: 'spawn', gx: 8, gz: 8, rot: 0 },
      { t: 'score', gx: 3, gz: 3, rot: 0 },
      { t: 'score', gx: 8, gz: 2, rot: 0 },
      { t: 'score', gx: 12, gz: 4, rot: 0 },
      { t: 'score', gx: 12, gz: 12, rot: 0 },
      { t: 'score', gx: 3, gz: 12, rot: 0 },
      { t: 'spinner', gx: 8, gz: 11, rot: 0 },
      { t: 'bounce', gx: 8, gz: 5, rot: 0 },
      { t: 'block', gx: 2, gz: 5, rot: 0 },
      { t: 'block', gx: 5, gz: 2, rot: 0 },
      { t: 'block', gx: 11, gz: 2, rot: 0 },
      { t: 'block', gx: 13, gz: 6, rot: 0 },
      { t: 'block', gx: 13, gz: 10, rot: 0 },
      { t: 'block', gx: 10, gz: 13, rot: 0 },
      { t: 'block', gx: 5, gz: 13, rot: 0 },
      { t: 'block', gx: 2, gz: 10, rot: 0 },
    ],
    level: defineLevelDescription({
      id: 'ugc-template-score-circuit',
      mode: 'score',
      metadata: { templateId: 'score-circuit', targetScore: 5 },
      widgets: [
        ...[
          [-4.5, -4.5],
          [4.5, -4.5],
          [4.5, 4.5],
          [-4.5, 4.5],
          [0.5, -4.5],
        ].map(([x, z], index) => ({
          id: `score-${index + 1}`,
          type: 'score-zone',
          shape: 'circle',
          radius: 0.72,
          position: { x, y: 0, z },
        })),
      ],
    }),
  },
];

export const UGC_TEMPLATES = Object.freeze(
  templates.map((template) => Object.freeze({
    ...template,
    tags: Object.freeze([...template.tags]),
    pieces: Object.freeze(template.pieces.map((piece) => Object.freeze({ ...piece }))),
  })),
);

export function creatorTemplate(id) {
  return UGC_TEMPLATES.find((template) => template.id === id) || UGC_TEMPLATES[0];
}
