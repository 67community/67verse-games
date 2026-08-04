// plan-skate.js — the 67 skatepark, measured off Oscar's reference render.
//
// The park is the plan's north-centre cell, pixels (480,132)-(822,430) of the
// 1280x1280 drawing. Every number below is a pixel coordinate read off that
// drawing at 7x zoom with a labelled grid overlay, then converted here by the
// same rule the rest of the city uses:
//
//     world = (pixel - 640) * 124 / 1280
//
// Nothing here is placed by eye. Where the drawing paints a coping line I
// recorded its colour with it, because the colour is what tells a bowl lip
// from a kerb from a ramp edge in the render.

const SCALE = 124 / 1280;
const w = (pixel) => +((pixel - 640) * SCALE).toFixed(3);
const span = (pixels) => +(pixels * SCALE).toFixed(3);
const path = (pixels) => Object.freeze(pixels.map(([px, py]) => Object.freeze([w(px), w(py)])));

// The raised deck the whole park sits on: a squircle with a chunky kerb, the
// same shape the drawing gives every civic slab.
// East edge: the drawing's kerb reads at pixel 822, but the measured
// carriageway beside it starts at 813, and a deck that runs to 822 puts a lane
// of northbound traffic across its corner. It stops at the kerb line instead —
// nine pixels, under a metre, and no car on the park.
export const SKATE_PLAZA = Object.freeze({
  x: w((480 + 813) / 2),
  z: w((132 + 430) / 2),
  width: span(813 - 480),
  depth: span(430 - 132),
  radius: span(26),
  topY: 0.44,
  floorY: 0.02,
});

// The big red-coped bowl in the north-west of the deck, with 67 painted on
// its floor. Traced clockwise from its north-west corner.
export const SKATE_BOWL = Object.freeze({
  outline: path([
    [512, 151], [555, 150], [585, 152], [600, 155], [615, 161], [625, 174],
    [627, 184], [624, 195], [615, 205], [605, 212], [597, 216], [594, 222],
    [587, 232], [580, 239], [569, 243], [537, 244], [519, 243], [505, 237],
    [496, 227], [494, 215], [494, 187], [496, 172], [501, 160],
  ]),
  lip: 'red',
  label: Object.freeze({ x: w(545), z: w(198), size: span(30) }),
});

// The two carved runs. Each is a centreline plus a half width, because that
// is how they read in the drawing: a trough of even width that winds, with a
// painted lip on each rim. Lip colours are per rim, left first, where "left"
// is the side the centreline turns away from at its start.
export const SKATE_TROUGHS = Object.freeze([
  // Centre snake: drops from the deck's north edge, swings west, runs south.
  Object.freeze({
    line: path([
      [661, 150], [661, 192], [655, 212], [640, 226], [622, 235],
      [610, 244], [605, 256], [605, 276], [607, 293],
    ]),
    half: span(21),
    lips: Object.freeze(['blue', 'blue']),
  }),
  // South-west run: a long S that finishes under the south ledge.
  Object.freeze({
    line: path([
      [512, 272], [540, 272], [558, 277], [564, 290], [555, 303],
      [544, 314], [542, 326], [550, 339], [567, 347], [586, 350], [601, 352],
    ]),
    half: span(17),
    lips: Object.freeze(['blue', 'red']),
  }),
]);

// Painted kerb lines that sit at deck level — no recess behind them, so they
// are drawn as lips alone. The long one wraps the south-west quarter and
// changes colour halfway, exactly as the drawing does.
export const SKATE_KERBS = Object.freeze([
  Object.freeze({
    line: path([[560, 257], [520, 257], [505, 265], [500, 280], [500, 330]]),
    lip: 'blue',
  }),
  Object.freeze({
    line: path([[500, 330], [502, 370], [508, 395], [520, 408], [540, 414], [600, 414]]),
    lip: 'yellow',
  }),
]);

// Quarter pipes: a lip line, the point the ramp falls towards, how far it
// runs and how high it stands. Both hug a corner of the deck.
export const SKATE_RAMPS = Object.freeze([
  Object.freeze({
    lip: path([[738, 139], [770, 139], [786, 144], [795, 155], [798, 170], [798, 199]]),
    towards: Object.freeze([w(755), w(190)]),
    run: span(12),
    height: 1.05,
    colour: 'blue',
  }),
  Object.freeze({
    lip: path([[795, 372], [795, 384], [788, 398], [775, 410], [760, 417], [722, 417]]),
    towards: Object.freeze([w(745), w(390)]),
    run: span(12),
    height: 1.05,
    colour: 'red',
  }),
]);

// Ledges, banks and the angled funbox. `yaw` is measured from the drawing's
// own edge, not chosen; `lip` names the painted long edge where there is one.
export const SKATE_LEDGES = Object.freeze([
  // The angled funbox in the middle of the deck.
  Object.freeze({
    x: w(664), z: w(313), width: span(66), depth: span(15), height: 0.55,
    yaw: -Math.atan2(23, 62), lip: 'red', lipEdge: 'north',
  }),
  // North flat bar: a low hubba with a rail on top, red edge to the west.
  Object.freeze({
    x: w(689), z: w(200), width: span(6), depth: span(44), height: 0.5,
    yaw: 0, lip: 'red', lipEdge: 'west', rail: true,
  }),
  // Side walls of the two stair sets.
  Object.freeze({ x: w(723), z: w(251), width: span(13), depth: span(40), height: 0.52, yaw: 0 }),
  Object.freeze({ x: w(717), z: w(313), width: span(11), depth: span(42), height: 0.52, yaw: 0 }),
]);

// Bank ramps standing along the deck's east side: flat top, one sloped face.
export const SKATE_BANKS = Object.freeze([
  Object.freeze({ x: w(779), z: w(268), width: span(14), depth: span(45), height: 0.8 }),
  Object.freeze({ x: w(778), z: w(313), width: span(16), depth: span(41), height: 0.8 }),
]);

// Stair sets. Steps run across `width` and descend along `depth`.
export const SKATE_STAIRS = Object.freeze([
  Object.freeze({
    x: w(743), z: w(254), width: span(33), depth: span(36), steps: 6,
    rails: Object.freeze([span(-2), span(14)]),
  }),
  Object.freeze({
    x: w(738), z: w(315), width: span(28), depth: span(34), steps: 6,
    rails: Object.freeze([span(-1), span(13)]),
  }),
]);

// The rail garden south of the deck: parallel grind rails with one cross bar
// laid over them. Rails run north-south, the cross bar east-west.
export const SKATE_RAIL_GARDEN = Object.freeze({
  x: w(618), z: w(387), width: span(42), length: span(54), count: 7,
  cross: Object.freeze({ z: w(388), width: span(53) }),
});

// Ledge with a blue lip closing the south-west run, and its return.
export const SKATE_LEDGE_WALL = Object.freeze({
  line: path([[578, 350], [627, 350], [627, 360]]),
  lip: 'blue',
  width: span(8),
  height: 0.42,
});
