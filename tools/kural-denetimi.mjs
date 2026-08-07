// tools/kural-denetimi.mjs — Oscar's road rule, checked against the plan
// instead of taken on trust.
//
//   "ağaçlar hiçbir zaman yolda olmayacak veya kumsala giden araba olmayacak
//    ... yolların olduğu her yer yolla bitecek kumsalla değil ... veya evin
//    içine girmeyecek yollar, bu en önemlisi"
//
// Three things are measured here:
//   1. no tree centre sits inside a carriageway,
//   2. every traffic route stays on asphalt for its whole span,
//   3. no road rectangle runs through a building footprint.
//
// A road entry is [centreX, centreZ, width, depth]; the rectangle is
// x ± width/2 by z ± depth/2, the same reading city-districts.js uses.

import { PLAN_AGACLAR, PLAN_BINALAR } from '../src/world/plan-verisi.js';
import { PLAN_ANA_YOLLAR, PLAN_PATIKALAR } from '../src/world/plan-ek.js';

const rect = ([x, z, g, d]) => ({
  minX: x - g / 2, maxX: x + g / 2, minZ: z - d / 2, maxZ: z + d / 2,
});
const inside = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

const ROADS = PLAN_ANA_YOLLAR.map(rect);
const WALKS = PLAN_PATIKALAR.map(rect);
const onRoad = (x, z) => ROADS.some((r) => inside(r, x, z));

// The routes are derived here exactly as city-districts.js derives them, so
// the check measures the renderer's own geometry rather than a stale copy.
const SEGMENTS = PLAN_ANA_YOLLAR.map(([x, z, g, d]) => (g >= d
  ? { axis: 'x', road: z, width: d, from: x - g / 2, to: x + g / 2 }
  : { axis: 'z', road: x, width: g, from: z - d / 2, to: z + d / 2 }));
const segmentFor = (axis, road) => SEGMENTS
  .filter((s) => s.axis === axis && Math.abs(s.road - road) < 1.6)
  .sort((a, b) => (b.to - b.from) - (a.to - a.from))[0] || null;
const ROUTES = [
  ['z', -19.5, 1], ['z', -19.5, -1],
  ['z', 18.5, 1], ['z', 18.5, -1],
  ['z', 41.5, 1], ['z', -53.5, -1],
  ['x', -18.5, 1], ['x', -18.5, -1],
  ['x', 18, 1], ['x', 51.5, -1],
].map(([axis, road, dir]) => {
  const seg = segmentFor(axis, road);
  if (!seg) return null;
  return { axis, road, dir, from: seg.from, to: seg.to, lane: seg.road + dir * seg.width * 0.26 };
}).filter(Boolean);

let fail = 0;

// --- 1. trees ---------------------------------------------------------------
const treesOnRoad = PLAN_AGACLAR.filter(([x, z]) => onRoad(x, z));
console.log(`1. AGAC / YOL      : ${PLAN_AGACLAR.length} agac, yolda olan ${treesOnRoad.length}`);
for (const [x, z, r] of treesOnRoad) console.log(`     YOLDA  (${x}, ${z}) r=${r}`);
if (treesOnRoad.length) fail += 1;

// Walks are for people, so a tree standing in one is the same complaint.
const treesOnWalk = PLAN_AGACLAR.filter(([x, z]) => WALKS.some((r) => inside(r, x, z)));
console.log(`   AGAC / PATIKA   : patikada olan ${treesOnWalk.length}`);
for (const [x, z] of treesOnWalk) console.log(`     PATIKADA  (${x}, ${z})`);
if (treesOnWalk.length) fail += 1;

// --- 2. traffic -------------------------------------------------------------
console.log('2. ARABA / ASFALT  :');
for (const route of ROUTES) {
  const { lane } = route;
  const steps = 200;
  let off = 0;
  let firstOff = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = route.from + ((route.to - route.from) * i) / steps;
    const [x, z] = route.axis === 'z' ? [lane, t] : [t, lane];
    if (!onRoad(x, z)) {
      off += 1;
      if (firstOff === null) firstOff = [x.toFixed(1), z.toFixed(1)];
    }
  }
  const pct = ((off / (steps + 1)) * 100).toFixed(0);
  const tag = off === 0 ? 'TAMAM' : 'ASFALT DISI';
  console.log(`     ${tag.padEnd(12)} ${route.axis}=${route.road} yon=${route.dir} ` +
    `${route.from}..${route.to}  serit=${lane.toFixed(2)}  disarida %${pct}` +
    (firstOff ? `  ilk sapma (${firstOff[0]}, ${firstOff[1]})` : ''));
  if (off > 0) fail += 1;
}

// --- 3. roads through buildings ---------------------------------------------
const BUILDINGS = PLAN_BINALAR.map(rect);
let clashes = 0;
for (const road of ROADS) {
  for (const b of BUILDINGS) if (overlap(road, b)) clashes += 1;
}
console.log(`3. YOL / BINA      : ${ROADS.length} yol x ${BUILDINGS.length} bina, cakisma ${clashes}`);
if (clashes) fail += 1;

console.log(fail === 0 ? '\nSONUC: kural tutuyor.' : `\nSONUC: ${fail} baslikta ihlal var.`);
process.exit(fail === 0 ? 0 : 1);
