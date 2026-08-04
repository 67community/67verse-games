// plan-marina.js — the north-east bay, measured off Oscar's reference render.
//
// Same rule as the rest of the city: world = (pixel - 640) * 124 / 1280.
//
// The coastline is not eyeballed either. The reference's water was masked by
// colour (blue channel well over red, green over red) and the shore read off
// row by row, walking in from the map's east edge and skipping gaps under 55
// pixels so a moored boat or a pier does not read as land. What comes back is
// a bay that narrows from the north-west corner, runs straight down past the
// marina, juts east at the sand cape and closes at z = +16.5 — not the full
// right margin the old build filled with water.

const SCALE = 124 / 1280;
const w = (pixel) => +((pixel - 640) * SCALE).toFixed(3);
const span = (pixels) => +(pixels * SCALE).toFixed(3);

// [pixel x, pixel y] walking the shore from the north edge to where the bay
// closes in the south. Rows where a pier or a hull broke the scan are dropped.
export const MARINA_KIYI = Object.freeze([
  [993, 0], [1007, 20], [1040, 40], [1062, 60], [1073, 80], [1081, 100],
  [1085, 120], [1093, 140], [1092, 200], [1091, 260], [1092, 320], [1091, 380],
  [1097, 400], [1104, 410], [1120, 418], [1200, 425], [1245, 430], [1238, 460],
  [1217, 480], [1182, 500], [1172, 520], [1163, 540], [1157, 560], [1152, 580],
  [1149, 600], [1149, 620], [1150, 640], [1152, 660], [1160, 680], [1168, 700],
  [1188, 720], [1207, 740], [1217, 760], [1226, 780], [1232, 800],
].map(([px, py]) => Object.freeze([w(px), w(py)])));

// How far the sand runs inland from the waterline, and where the map's own
// east edge is, so the water can be closed into a polygon.
export const MARINA_KUM_GENISLIK = span(48);
export const MARINA_DOGU_KENAR = w(1279);

// The timber promenade along the shore, then the three piers reaching east.
// Deck extents come from a timber mask over the render (red well over green,
// green over blue), not from reading a zoomed screenshot: my first pass had
// the piers two and a half times too deep because it counted their shadow.
export const MARINA_PROMENAD = Object.freeze({
  x: w((1052 + 1087) / 2), z: w((130 + 352) / 2),
  width: span(1087 - 1052), depth: span(352 - 130),
});

export const MARINA_ISKELELER = Object.freeze([
  Object.freeze({ x: w((1088 + 1202) / 2), z: w((147 + 156) / 2), width: span(114), depth: span(10) }),
  Object.freeze({ x: w((1088 + 1201) / 2), z: w((234 + 242) / 2), width: span(113), depth: span(9) }),
  Object.freeze({ x: w((1088 + 1202) / 2), z: w((337 + 346) / 2), width: span(114), depth: span(10) }),
]);

// Finger docks: four columns, four rows, between and below the lower piers.
// They read dark in the render — floating decks in the pier's shadow — so the
// instanced deck tints these instances down rather than opening a draw.
export const MARINA_PARMAKLAR = Object.freeze([
  ...[1106, 1130, 1152, 1176].flatMap((px) => [
    Object.freeze({ x: w(px), z: w(218.5), width: span(4), depth: span(27) }),
    Object.freeze({ x: w(px), z: w(261), width: span(4), depth: span(33) }),
    Object.freeze({ x: w(px), z: w(319), width: span(4), depth: span(28) }),
    Object.freeze({ x: w(px), z: w(363), width: span(4), depth: span(30) }),
  ]),
]);

// Moored boats, with the hull colour read off each one.
export const MARINA_TEKNELER = Object.freeze([
  [1115, 178, '#c9c163'], [1140, 178, '#c9635e'], [1163, 178, '#7d93bb'],
  [1176, 172, '#d1a45c'], [1105, 192, '#d8d2c6'], [1138, 215, '#cdbd63'],
  [1180, 212, '#c4605c'], [1108, 262, '#c25a58'], [1152, 258, '#d9d4ca'],
  [1190, 262, '#cfc7bd'], [1118, 318, '#cbb95f'], [1140, 318, '#c85f5c'],
  [1132, 362, '#c65e5b'],
].map(([px, py, renk]) => Object.freeze({ x: w(px), z: w(py), renk })));

export const MARINA_TEKNE_BOY = Object.freeze({ length: span(24), width: span(13) });

// The one boat out on the water, with its dark sail up.
export const MARINA_YELKENLI = Object.freeze({
  x: w(1225), z: w(178),
  length: span(64), width: span(20),
  yaw: -Math.atan2(w(168) - w(190), w(1258) - w(1195)),
  yelken: '#8f4b4b',
});

// Parasols along the promenade sand, north of the cape.
export const MARINA_SEMSIYELER = Object.freeze([
  [1022, 148, '#d98a9a'], [1055, 162, '#d8cba8'], [1067, 205, '#8fa8ce'],
  [1050, 250, '#cf7d78'], [1052, 292, '#cfc3bb'], [1022, 378, '#7f8cb0'],
].map(([px, py, renk]) => Object.freeze({ x: w(px), z: w(py), renk })));

// The striped tower on the cape's north point.
export const MARINA_FENER = Object.freeze({ x: w(1179), z: w(446) });
