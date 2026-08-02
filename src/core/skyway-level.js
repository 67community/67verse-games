import { defineLevelDescription } from './level-widgets.js';

export const SKYWAY_FINISH_Z = -165.5;
export const SKYWAY_WORLD_BOUND = Math.ceil(Math.abs(SKYWAY_FINISH_Z)) + 10;

export const SKYWAY_COURSE_BEATS = Object.freeze([
  Object.freeze({
    id: 'ribbon-run',
    role: 'learn',
    startZ: 3,
    endZ: -56.5,
    lesson: 'Read the gold line, jump one seam, then time one broad sweeper.',
  }),
  Object.freeze({
    id: 'shutter-relay',
    role: 'escalate',
    startZ: -56.5,
    endZ: -121,
    lesson: 'Read moving shutters, then chain four pulsing jade petals.',
  }),
  Object.freeze({
    id: 'crown-run',
    role: 'payoff',
    startZ: -121,
    endZ: SKYWAY_FINISH_Z,
    lesson: 'Carry momentum through opposing sweepers into the crown gate.',
  }),
]);

export const SKYWAY_PALETTE = Object.freeze({
  // Candy cloud-parkour treatment: lilac platform tops over a warm soil
  // underbody, candy-stripe hazards, jade machine housings, bright gold
  // gate, navy structure, and an open blue sky the islands float in.
  ceramic: 0xb97fe8,
  terracotta: 0xf9556f,
  jade: 0x4fd0bd,
  gold: 0xffc93c,
  graphite: 0x2b3a67,
  sky: 0x3fa9f5,
  grass: 0x7ed957,
  // Platform underbody + rim: bright tops read against a darker earth edge,
  // which is what makes the tiles look like solid floating chunks.
  soil: 0x8b5e6d,
  soilDeep: 0x6b4353,
});

const PLATFORM_WIDGETS = [
  {
    id: 'start-pad', type: 'static-platform',
    position: { x: 0, y: -0.5, z: 0 }, size: { x: 14, y: 1, z: 12 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'stadium', beat: 'learn' },
  },
  {
    id: 'ribbon-approach', type: 'static-platform',
    position: { x: 0, y: -0.5, z: -15 }, size: { x: 7, y: 1, z: 18 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'ribbon', beat: 'learn' },
  },
  {
    id: 'ribbon-rise', type: 'static-platform',
    position: { x: -0.8, y: -0.5, z: -29.5 }, size: { x: 7, y: 1, z: 10 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'ribbon', beat: 'learn' },
  },
  {
    id: 'timing-court', type: 'static-platform',
    position: { x: 0, y: -0.5, z: -46 }, size: { x: 17, y: 1, z: 22 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'disc', beat: 'learn' },
  },
  {
    id: 'shutter-threshold', type: 'static-platform',
    position: { x: 0, y: -0.5, z: -61 }, size: { x: 7, y: 1, z: 8 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'threshold', beat: 'escalate' },
  },
  {
    id: 'shutter-hall', type: 'static-platform',
    position: { x: 0, y: -0.5, z: -76 }, size: { x: 10, y: 1, z: 28 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'channel', beat: 'escalate' },
  },
  {
    id: 'shutter-exit', type: 'static-platform',
    position: { x: 0, y: -0.5, z: -93 }, size: { x: 7, y: 1, z: 6 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'threshold', beat: 'escalate' },
  },
  ...[
    ['a', -0.8, -99.0, 0.0],
    ['b', 0.8, -105.4, 3.3],
    ['c', -0.8, -111.8, 2.1],
    ['d', 0.8, -118.2, 0.9],
  ].map(([suffix, x, z, phase]) => ({
    id: `relay-petal-${suffix}`,
    type: 'static-platform',
    position: { x, y: -0.5, z },
    size: { x: 3.6, y: 1, z: 4.0 },
    color: SKYWAY_PALETTE.jade,
    timing: { on: 3.2, off: 1.3, phase },
    presentation: { shape: 'petal', beat: 'escalate' },
  })),
  ...[
    ['a', -99.3, 3.2],
    ['b', -105.9, 3.0],
    ['c', -112.5, 2.9],
    ['d', -119.0, 2.8],
  ].map(([suffix, z, depth]) => ({
    id: `gold-line-${suffix}`,
    type: 'static-platform',
    route: 'shortcut',
    position: { x: 3.25, y: -0.5, z },
    size: { x: 1.6, y: 1, z: depth },
    color: SKYWAY_PALETTE.gold,
    presentation: { shape: 'lozenge', beat: 'escalate' },
  })),
  {
    id: 'crown-run', type: 'static-platform',
    position: { x: 0, y: -0.5, z: -143.3 }, size: { x: 9, y: 1, z: 44.2 },
    color: SKYWAY_PALETTE.ceramic, presentation: { shape: 'stadium', beat: 'payoff' },
  },
];

export const SKYWAY_CHECKPOINT_WIDGETS = Object.freeze([
  { id: 'checkpoint-start', type: 'checkpoint', trigger: { axis: 'z', direction: 'negative', value: 1e9 }, spawn: { x: 0, y: 0, z: 3 } },
  { id: 'checkpoint-ribbon-exit', type: 'checkpoint', trigger: { axis: 'z', direction: 'negative', value: -56.5 }, spawn: { x: 0, y: 0, z: -59 } },
  { id: 'checkpoint-shutter-exit', type: 'checkpoint', trigger: { axis: 'z', direction: 'negative', value: -90.5 }, spawn: { x: 0, y: 0, z: -93 } },
  { id: 'checkpoint-crown-run', type: 'checkpoint', trigger: { axis: 'z', direction: 'negative', value: -121.0 }, spawn: { x: 0, y: 0, z: -124 } },
]);

const SWEEPER_WIDGETS = [
  { id: 'timing-sweep', type: 'sweeper', position: { x: 0, y: 0, z: -46 }, length: 14, width: 0.52, speed: 1.55, startAngle: 0.0 },
  { id: 'crown-sweep-a', type: 'sweeper', position: { x: 0, y: 0, z: -139 }, length: 8.4, width: 0.5, speed: 2.25, startAngle: 0.5 },
  { id: 'crown-sweep-b', type: 'sweeper', position: { x: 0, y: 0, z: -155 }, length: 8.4, width: 0.5, speed: -2.7, startAngle: 1.7 },
];

export const SKYWAY_LEVEL_DESCRIPTION = defineLevelDescription({
  id: 'skyway-sprint-v1',
  mode: 'race',
  metadata: {
    title: 'Skyway Sprint',
    direction: '-z',
    expectedDurationSeconds: [45, 90],
    beats: SKYWAY_COURSE_BEATS,
    visualSystem: 'cast-ceramic-enamel',
  },
  widgets: [
    ...PLATFORM_WIDGETS,
    ...SKYWAY_CHECKPOINT_WIDGETS,
    ...SWEEPER_WIDGETS,
    { id: 'course-fall', type: 'fall-hazard', belowY: -4.2 },
    {
      id: 'finish-line',
      type: 'goal-zone',
      shape: 'line',
      axis: 'z',
      direction: 'negative',
      value: SKYWAY_FINISH_Z,
    },
  ],
});
