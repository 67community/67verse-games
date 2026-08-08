// plan-ek.js — plandan olculen ikinci grup: yollar, tesisler, spor,
// oyun alani, kucuk ogeler, kopruler ve su. plan-verisi.js ile ayni
// donusum: w = (px/1280 - 0.5) * 124. Her sayi cizimden okunmustur.

export const PLAN_ANA_YOLLAR = Object.freeze([
  // West end measured: at z = -51.9 the carriageway starts at x = -47.86 and
  // at z = -51.5 at -49.12. This row ran all the way to -62 and cut the kart
  // circuit's lawn in half; the drawing has lawn there, not road.
  [-32.97, -51.93, 31.06, 2.32, '#c3aeaa'], // ana bulvar (yatay)
  [-53.67, -28.58, 2.52, 22.47, '#c3aeaa'], // bati dikey cadde
  [-18.79, -39.72, 2.91, 44.56, '#c3aeaa'], // dogu dikey cadde
  [-39.72, -18.7, 44.56, 2.71, '#c3aeaa'], // guney yatay cadde
  [-18.5, 34.49, 3.88, 34.78, '#8a7683'], // bati kuzey-guney arteri
  [18.79, 32.55, 3.0, 30.52, '#dac7c4'], // dogu kuzey-guney arteri
  [-0.1, 52.89, 47.86, 2.23, '#8b8293'], // guney dogu-bati arteri
  [-53.67, -0.1, 2.42, 47.86, '#b39b98'], // nehir kenari kavisli cadde
  [-19.57, -0.1, 4.26, 47.86, '#8b8399'], // sag dikey ana cadde
  [-35.65, 18.6, 36.43, 2.62, '#b39b98'], // alt yatay cadde
  [18.5, -0.1, 3.49, 47.86, '#c1aeab'], // doğu ana bulvarı
  [-0.1, -18.41, 47.86, 3.39, '#c9aca5'], // kuzey doğu-batı caddesi
  [-0.1, 18.02, 47.86, 3.2, '#a8919a'], // güney doğu-batı caddesi
  [29.45, -51.83, 22.77, 3.49, '#cbb3af'], // ust yatay cadde
  [18.7, -39.72, 2.81, 44.56, '#cbb3af'], // sol dikey cadde
  [31.48, -19.28, 28.48, 3.68, '#cbb3af'], // alt yatay cadde
  [41.46, -38.75, 3.58, 20.54, '#d2b1a3'], // ahsap sahil promenadi
  [-55.02, 34.88, 14.05, 3.2, '#c3aaa6'], // ust yatay sokak
  [-50.18, 48.44, 3.49, 27.61, '#c3aaa6'], // dikey mahalle caddesi
  [-47.47, 51.83, 29.06, 4.07, '#c3aaa6'], // alt yatay ana cadde
  [32.45, 18.41, 31.0, 3.1, '#c8afaa'], // guney ana cadde
  [41.66, 0.0, 4.07, 38.75, '#cfb6b1'], // sahil caddesi
  [33.91, 22.86, 21.31, 1.94, '#cbb6b4'], // park yuruyus yolu
  [39.62, 18.41, 44.76, 2.52, '#cbb2ae'], // ust ana cadde
  [39.62, 51.63, 44.76, 3.68, '#cbb2ae'], // alt ana cadde
  [-0.1, -50.08, 47.86, 2.52, '#9c8d8c'], // ust yatay ana cadde
]);

export const PLAN_PATIKALAR = Object.freeze([
  [-41.46, -57.35, 2.91, 9.3, '#c3aeaa'], // kuzey dikey cadde
  [15.11, 49.79, 6.49, 6.1, '#e0c9cb'], // guneydogu yol viraji
  [-18.12, 57.74, 4.17, 8.53, '#c5ada8'], // banliyo sokagi 1
  [-0.1, 57.74, 5.23, 8.53, '#c8afab'], // banliyo sokagi 2
  [18.41, 57.74, 4.55, 8.53, '#ccb2ae'], // banliyo sokagi 3
  [37.78, 57.74, 3.49, 8.53, '#cbb2ae'], // bloklar arasi dikey sokak
  [27.9, 57.74, 0.39, 8.53, '#c9bcb6'], // konut ayirici sokak (sol ada)
  [46.31, 57.74, 0.39, 8.53, '#c9bcb6'], // konut ayirici sokak (orta)
  [53.67, 57.74, 0.39, 8.53, '#c9bcb6'], // konut ayirici sokak (sag)
  [0.19, -57.93, 4.94, 8.14, '#b0a09b'], // bloklar arasi ara sokak (ust)
]);

export const PLAN_ZEBRALAR = Object.freeze([
  [-17.73, -50.57, 4.07, 4.65], // doner kavsak (sag ust)
  [-18.21, -18.21, 3.49, 3.49], // doner kavsak (sag alt)
  [-18.79, -55.9, 2.13, 1.74], // yaya gecidi (dogu cadde ust)
  [-18.79, -46.69, 2.13, 2.13], // yaya gecidi (dogu cadde orta)
  [-18.79, -22.86, 2.13, 1.74], // yaya gecidi (dogu cadde alt)
  [-57.64, -18.79, 2.13, 1.94], // yaya gecidi (guney cadde bati)
  [-48.82, -18.79, 2.23, 1.94], // yaya gecidi (guney cadde orta)
  [-22.77, -18.89, 2.52, 1.94], // yaya gecidi (guney cadde dogu)
  [-22.77, 18.41, 2.62, 1.84], // yaya gecidi kuzeybati
  [-14.24, 18.41, 2.42, 1.84], // yaya gecidi kuzey-orta
  [14.14, 18.31, 2.52, 1.74], // yaya gecidi kuzeydogu
  [22.67, 18.41, 2.23, 1.74], // yaya gecidi kuzey sag kenar
  [-18.5, 22.09, 3.0, 2.32], // yaya gecidi bati ust
  [-18.5, 46.02, 3.0, 2.03], // yaya gecidi bati alt
  [18.5, 46.02, 3.0, 2.32], // yaya gecidi dogu alt
  [22.67, 51.34, 2.23, 1.94], // yaya gecidi sag kenar
  [-18.5, 55.32, 2.52, 2.13], // yaya gecidi banliyo 1
  [0.0, 55.41, 2.42, 2.32], // yaya gecidi banliyo 2
  [18.89, 55.41, 2.62, 2.23], // yaya gecidi banliyo 3
  [-18.89, -14.24, 2.23, 1.84], // yaya gecidi doneli alti
  [-18.7, 11.92, 2.32, 2.62], // yaya gecidi sag orta-alt
  [0.0, 21.89, 2.13, 4.26], // güney blok iç sokağı
  [-18.5, 18.02, 3.49, 3.29], // güneybatı dörtyol kavşağı
  [18.5, -55.9, 2.52, 1.74], // yaya gecidi bir
  [22.86, -51.34, 2.23, 2.91], // yaya gecidi iki
  [41.37, -22.67, 2.42, 2.23], // yaya gecidi uc
  [22.77, -18.41, 2.42, 2.23], // yaya gecidi dort
  [37.39, -18.41, 2.42, 2.23], // yaya gecidi bes
  [18.02, -51.34, 3.1, 3.29], // kuzeybati doner kavsagi
  [41.75, -18.31, 4.26, 3.2], // guney doner kavsagi
  [-53.57, 51.54, 2.42, 2.23], // yaya gecidi 7 (alt cadde sol)
  [-49.79, 55.51, 2.62, 2.23], // yaya gecidi 9 (dikey cadde alt)
  [41.95, -14.14, 3.0, 2.32], // yaya gecidi kavsak guneyi
  [37.78, 18.21, 3.39, 2.13], // yaya gecidi guney orta
  [42.24, 13.85, 3.0, 2.23], // yaya gecidi sahil caddesi guneyi
  [45.92, 17.63, 2.52, 1.84], // yaya gecidi sahil guneydogu
  [18.99, 20.15, 0.78, 1.07], // yaya gecidi (sol cadde, durak yani)
  [37.39, 55.41, 2.03, 2.03], // yaya gecidi (bloklar arasi sokak)
]);

export const PLAN_KAVSAKLAR = Object.freeze([
  [-17.73, -50.57, 4.07, 4.65], // doner kavsak (sag ust)
  [-18.21, -18.21, 3.49, 3.49], // doner kavsak (sag alt)
  [41.95, -14.14, 3.0, 2.32], // yaya gecidi kavsak guneyi
]);

export const PLAN_TESISLER = Object.freeze([
  [-30.23, -57.35, 19.76, 8.72, '#ddc9c5'], // yuzme havuzu tesisi platformu
  [-44.76, -43.59, 11.82, 9.88, '#c9b4b0'], // otopark alani
  [-52.41, -32.36, 0.87, 7.17, '#eac4b5'], // otobus/tramvay durak peronu
  [-58.71, -28.38, 6.78, 16.66, '#aeae92'], // konut adasi (yesil parsel)
  [-36.04, -30.03, 32.16, 20.15, '#c9b4b0'], // spor kampusu platformu
  [-39.43, -6.98, 3.68, 3.88, '#ecd7d6'], // B2 catisi kubbesi
  [-43.88, 0.39, 3.2, 3.49, '#ecd7d6'], // kort bati kubbesi
  [-25.57, 7.94, 3.88, 4.17, '#f1d7d4'], // C2 catisi kubbesi
  [-30.9, 14.82, 3.78, 4.07, '#f0d8d5'], // D3 catisi kubbesi
  [0.0, -0.19, 6.01, 5.62, '#c7b0b2'], // merkez çeşme havuzu
  [26.64, -46.79, 10.17, 6.49, '#d3b4bd'], // donme dolap
  [25.96, -42.92, 8.14, 1.84, '#c6b4b4'], // donme dolap taban iskelesi
  [36.33, -45.82, 6.49, 7.07, '#e8a8a5'], // kirmizi beyaz sirk cadiri
  [34.0, -36.91, 4.46, 4.36, '#f8dbbf'], // atlikarinca
  [30.13, -26.06, 17.24, 9.88, '#dbbbbb'], // hiz treni pisti
  [48.83, -47.47, 11.72, 1.26, '#d2b1a3'], // kuzey iskele
  [49.21, -38.94, 11.43, 1.16, '#d2b1a3'], // orta iskele
  [49.02, -28.97, 11.04, 1.07, '#d2b1a3'], // guney iskele
  [22.57, -1.65, 2.42, 9.49, '#d1b5b1'], // bati tribun blogu
  [39.14, -1.36, 2.32, 9.98, '#d1b8b4'], // dogu tribun blogu
  [36.52, -14.43, 1.84, 1.74, '#ddc9c6'], // stadyum kuzeydogu rampasi
  [54.06, -17.24, 4.36, 4.36, '#b9a8ab'], // fener kaidesi
  [37.39, 25.48, 2.03, 2.03, '#eabca4'], // piknik masasi 1
  [40.4, 25.48, 2.13, 2.03, '#eabca4'], // piknik masasi 2
  [40.78, 28.48, 2.13, 2.03, '#eabca4'], // piknik masasi 3
  [33.71, 36.72, 2.13, 2.13, '#e8cbb6'], // cizgili ahsap bank
  [35.75, 34.68, 1.36, 1.16, '#e8d2c2'], // acik renk kucuk bank
  [38.65, 36.52, 2.81, 2.52, '#ee8687'], // kirmizi bank
  [39.91, 31.77, 0.58, 1.16, '#6e6660'], // koyu kucuk bank (piknik alani guneyi)
  [36.52, 48.34, 0.48, 0.78, '#4e5a4a'], // cop kutusu (kopru yani)
  [52.8, 36.62, 2.52, 2.13, '#f88a78'], // kirmizi cadir
  [54.15, 39.04, 2.42, 2.03, '#7fb2d8'], // mavi cadir
  [52.6, 42.14, 2.42, 2.13, '#f7ca87'], // turuncu cadir
  [48.92, 29.26, 1.94, 1.45, '#506266'], // yesil ahsap kulube
  [18.02, 22.09, 0.78, 2.32, '#e6dcd6'], // durak platformu (bati)
  [4.46, -50.86, 4.65, 1.45, '#cfc0c2'], // tren istasyonu / peron
  [0.1, -34.2, 32.16, 29.16, '#e6d2ca'], // skatepark platformu (67 parki)
]);

// Funfair, re-measured off the 1280 px reference for this build. PLAN_TESISLER
// already carries the ride footprints but nothing reads them, so the rows the
// builder needs are named here, beside the table, instead of being retyped into
// city-districts.js. Same conversion as everything else: w = (px/1280 - .5)*124.
export const PLAN_LUNAPARK = Object.freeze({
  // [x, z, width, depth] straight out of the table above.
  dolapCark: PLAN_TESISLER[10], // [26.64, -46.79, 10.17, 6.49] wheel envelope
  dolapTaban: PLAN_TESISLER[11], // [25.96, -42.92, 8.14, 1.84] base platform
  atlikarinca: PLAN_TESISLER[12], // [36.33, -45.82, 6.49, 7.07] big carousel
  hizTreni: PLAN_TESISLER[14], // [30.13, -26.06, 17.24, 9.88] coaster footprint

  // The wheel is not a ring standing on nothing. Under it the drawing has a
  // pale beam along z -42.4 with an upright landing on each end at x 22.4 and
  // x 29.6, and a pink boarding deck in front of that: a pink mask (R-G > 22
  // with B > G) over the patch reads x 23.25..27.81 by z -42.35..-40.70, so
  // 4.56 x 1.65 centred (25.53, -41.53), sampled (207,171,183) on its lit half.
  dolapPeron: Object.freeze([25.53, -41.53, 4.56, 1.65, '#cfa5b1']),
  dolapAyak: Object.freeze({ solX: 22.4, sagX: 29.6, z: -42.4 }),
  // Rim and spokes are a near-white with a pink cast, not the saturated yellow
  // they were built in: sampled round the rim at (207,180,187), (212,188,188),
  // (228,214,227), (225,196,200) and (219,212,206).
  dolapCemberRenk: '#dac6ca',
  // Twelve gondolas are countable round the rim and every one is a pastel —
  // no channel under 139. Sampled clockwise from the west shoulder; these are
  // lit values, so the builder divides them back through the lighting gain.
  dolapKabinRenk: Object.freeze([
    '#d0bec0', '#a8a1c9', '#caba9a', '#b59c92', '#b8a3b9', '#e3bcbe',
    '#a9bbd0', '#ba8b9b', '#d9b0a3', '#ece1d2', '#b7bcc2', '#ceb2ba',
  ]),

  // The big carousel's canopy is pink and cream, not brick red. A ring sampled
  // at r 1.5, 1.9, 2.1 and 2.3 around (36.9, -46.5) counts twelve transitions
  // every time — six pink wedges against six cream — with the pink landing on
  // (218,140,146) and the cream on (222,207,197). Under the canopy there is a
  // drum: a warm cut at x 36.4 runs from z -49.2 down to -42.2 against a canopy
  // only 5.4 deep, so about 1.3 of the drawing's depth is standing wall, which
  // at the render's measured 0.56 depth-per-height is 2.3 units of cylinder.
  // Its lit east face samples (229,197,182).
  // The two tones are base colours, not the samples: the samples divided back
  // through the lighting, then corrected channel by channel against this
  // build's own capture, which came back (204,145,144) and (203,192,182) on
  // the first pass and (211,155,153) and (211,202,192) on the second.
  atlikarincaDilim: 12,
  atlikarincaPembe: '#c56f7a',
  atlikarincaKrem: '#d0beb4',
  atlikarincaGovde: 2.3,

  // The coaster is a rail, not a slide. A perpendicular cut at z -27 through
  // the west limb reads pad to x 21.99, dark rail 21.99..22.09, pale deck
  // 22.18..22.86, dark rail 22.86..22.96 and pink rail 23.06..23.20 — 1.21
  // across. The same cut at the east extreme (z -24) gives 37.39..38.75 and
  // across the flat top (x 25.5) 0.58, so the deck is 0.90 with a 0.15 lip on
  // each edge: 1.20 overall against the 3.11 the ribbon was built at.
  hizTreniYari: 0.45,
  hizTreniDudak: 0.15,
  // Rails sampled (244,193,198) and (233,186,194) on the drawing — pink, not
  // orange. This is the base that lands on them rather than the sample itself:
  // dividing by the usual 1.22 captured (203,175,174) on the rail crown and
  // the correction from that captured (213,176,177), so the base carries this
  // tube's own measured response instead of the flat gain.
  hizTreniRayTaban: '#de9da9',
  // Centre line traced off the drawing and checked by overlaying the sampled
  // curve back on it: an outer loop over the west half (flat top at z -30.8
  // between x 24 and 27, west extreme x 22.6 at z -27, bottom z -21.7), a
  // tighter loop nested inside it with its apex at (28.3, -27.9), and an east
  // loop (top z -26.7 at x 36.3, east extreme x 38.1 at z -24.4, bottom z
  // -22.1 at x 35.5), the strands crossing near (32.1, -23.6). [x, z, height];
  // the heights are the ride's own profile, which the drawing cannot show.
  hizTreniHat: Object.freeze([
    [27.40, -30.55, 2.30], [25.50, -30.75, 2.40], [23.90, -30.15, 2.20],
    [22.90, -28.85, 1.90], [22.60, -27.10, 1.60], [22.90, -25.30, 1.30],
    [23.80, -23.65, 1.10], [25.20, -22.45, 1.05], [27.00, -21.75, 1.10],
    [28.90, -21.75, 1.20], [30.60, -22.25, 1.50], [31.90, -23.05, 1.75],
    [33.30, -24.50, 1.90], [34.80, -26.00, 2.05], [36.30, -26.70, 2.10],
    [37.50, -26.20, 2.00], [38.10, -25.00, 1.80], [38.00, -23.70, 1.55],
    [37.00, -22.55, 1.25], [35.50, -22.10, 1.05], [33.90, -22.30, 0.95],
    [32.50, -22.85, 1.05], [31.20, -23.70, 1.15], [30.50, -24.70, 1.25],
    [30.30, -25.85, 1.55], [29.60, -27.00, 1.60], [28.30, -27.85, 1.60],
    [27.10, -27.20, 1.40], [26.20, -26.20, 1.20], [25.75, -24.95, 1.00],
    [26.20, -23.75, 0.75], [27.30, -22.95, 0.55], [29.20, -22.75, 0.45],
    [30.80, -23.50, 0.50], [31.50, -24.85, 0.60], [31.20, -26.45, 0.85],
    [30.40, -28.20, 1.55], [29.10, -29.50, 2.05],
  ]),
  // The fairground pad it has to stay on, PLAN_OYUN's lunapark platform inset
  // by the ribbon's own half width, so no part of the track can run onto the
  // carousel lawn to the north or the marina promenade to the east.
  hizTreniSinir: Object.freeze({ minX: 20.85, maxX: 39.41, minZ: -49.63, maxZ: -21.67 }),
});

export const PLAN_SPOR = Object.freeze([
  [-41.37, -29.45, 9.69, 16.66, '#dd8f89'], // atletizm kosu pisti (oval)
  [-41.37, -33.23, 1.26, 0.78, '#6f6f63'], // kale (kuzey)
  [-41.37, -25.09, 1.26, 0.87, '#6f6f63'], // kale (guney)
  [-47.37, -30.52, 1.65, 8.53, '#e4cbc6'], // bati tribun oturma basamaklari
  [-35.46, -30.03, 1.36, 7.94, '#e4cbc6'], // dogu tribun basamaklari
  [-26.74, -27.42, 12.59, 13.37, '#aeae92'], // beyzbol sahasi (dis saha cimi)
  [-24.99, -24.99, 0.97, 0.97, '#e6c8a6'], // atis tepesi (pitcher mound)
  [-23.15, -22.28, 1.26, 1.26, '#ecc29d'], // ev sahasi dairesi (home plate)
  [-42.43, -22.96, 7.94, 2.42, '#d78578'], // kirmizi kosu pisti
  [-26.93, -22.67, 11.62, 3.1, '#b7ae80'], // yesil beyzbol sahasi
  [-33.32, 0.1, 10.75, 5.62, '#6c745f'], // basketbol sahasi
  [29.74, 0.29, 19.18, 33.13, '#e2cecd'], // stadyum platformu
  [27.9, 37.59, 6.39, 6.01, '#d7c1bd'], // kaykay havuzu
  [-22.38, -27.32, 3.58, 13.17, '#a9ad83'], // beysbol sahasi
]);

// Sports quarter, re-measured off the render's own masks rather than traced by
// eye. PLAN_SPOR above holds the coloured plates the drawing shows; these are
// the pieces a builder needs — the band the track is painted on, the shapes
// set into it, and the sand fan's own geometry. Every number below came from
// a colour mask on referans-sehir.png:
//   red track  (R-G > 22, R > 160) -> x -46.31..-36.62, z -37.88..-20.83
//   olive infield                  -> x -44.18..-38.56, z -35.94..-22.86
//   olive outfield                 -> x -33.23..-21.02, z -33.03..-20.92
//   tan infield fan                -> x -29.74..-21.70, z -29.84..-21.51
//   green diamond inside the fan   -> x -27.12..-22.77, z -27.12..-22.67
export const PLAN_SPOR_OLCU = Object.freeze({
  // [x, z, w, d] of the track's OUTER edge, and the width of the painted band.
  // A cut at z = -29.4 crosses the west band at x -46.06..-44.37 and the north
  // band at z -37.83..-36.09, so the band is 1.75 and carries four lanes:
  // pale lines fall at -46.02, -45.53, -45.14, -44.76 and -44.37, spaced 0.39.
  pist: [-41.37, -29.45, 9.69, 16.66],
  pistBant: 1.75,
  pistKose: 3.8,
  pistSerit: 4,
  // The west straight runs on north past the arc as a set of sprint lanes.
  sprint: [-45.34, -34.8, 1.75, 5.6],
  cim: [-41.37, -29.4, 5.62, 13.08, 2.4],
  disSaha: [-27.13, -26.98, 12.21, 12.11, 2.9],
  kum: { x: -21.7, z: -21.51, r: 8.15 },
  elmas: [-24.95, -24.9, 4.35, 4.45],
  tepe: [-24.99, -24.99, 0.49],
});

// North-west corner: a serpentine kart circuit on a lawn, not a river and a
// housing estate. The centreline below is the skeleton of the render's own
// track mask (pale surface, R > 188 and B > 163, closed and opened by a 3x3
// kernel), thinned, pruned of spurs, walked as one loop and resampled every
// two units. A cut at z = -50 crosses the surface at x -60.84..-59.29 and
// -56.58..-55.02, so the ribbon is 1.55 wide with a dark kerb about 0.2 down
// each side; the loop runs 53.8 long inside x -61.0..-45.4, z -60.1..-43.8.
export const PLAN_KART = Object.freeze({
  bant: 0.775,
  bordur: 0.97,
  hat: Object.freeze([
    [-57.01, -59.13], [-58.67, -57.95], [-59.65, -56.14], [-59.93, -54.10],
    [-59.97, -52.03], [-60.16, -49.98], [-60.26, -47.93], [-59.76, -45.93],
    [-58.29, -44.59], [-56.31, -44.94], [-55.13, -46.58], [-55.23, -48.61],
    [-56.15, -50.45], [-56.81, -52.40], [-56.71, -54.41], [-55.28, -55.81],
    [-53.23, -55.99], [-51.18, -55.85], [-49.30, -55.00], [-47.31, -55.06],
    [-46.17, -56.69], [-46.89, -58.56], [-48.79, -59.26], [-50.86, -59.27],
    [-52.91, -59.02], [-54.96, -59.29],
  ]),
  // The lawn under it. Its east edge is where the render's olive stops, read
  // row by row: -43.5 down to z -53, then in to -50.9 at z -51, -53.7 at
  // z -47 and -56.7 at z -46, with the last of it under the south hairpin.
  cim: Object.freeze([
    [-62.0, -61.9], [-43.6, -61.9], [-43.6, -53.2], [-50.9, -51.0],
    [-53.7, -47.2], [-54.3, -46.0], [-55.6, -44.6], [-55.6, -43.4],
    [-62.0, -43.4],
  ]),
});

export const PLAN_OYUN = Object.freeze([
  [30.13, -35.65, 19.76, 29.16, '#dec9c8'], // lunapark platformu
  [30.03, -22.77, 18.89, 3.88, '#d98f93'], // lunapark hiz treni
  // Oyun kosesi: planin olctugu (28.6, 27.7) parseli sonradan gelen bohrek
  // goletin bati lobuyla ayni hucreye dusuyordu — zemin golet bordurune
  // gomulup uniteler yari suya batiyordu. Ayni kume, ayni oranlar; ring
  // patikasinin disindaki cimen kosesine, ayi heykellerinin yanina tasindi.
  [26.5, 19.3, 5.5, 3.7, '#ddbdb8'],  // oyun alani zemini
  [25.4, 18.4, 2.8, 1.5, '#f7a860'],  // turuncu oyun unitesi (uzun)
  [27.9, 18.6, 2.4, 2.1, '#f9b268'],  // turuncu oyun unitesi (yuvarlak)
  [26.6, 20.2, 2.6, 1.7, '#f07ab4'],  // pembe oyun unitesi
  [28.6, 20.3, 0.97, 0.97, '#e070a8'], // kucuk pembe koni
  [-7.56, -43.01, 13.17, 9.4, '#d9605e'], // kirmizi kenarli buyuk kase (67 havuzu)
  [2.62, -44.47, 5.81, 7.07, '#8cb2d6'], // mavi kenarli ust kanal/kase
  [-9.11, -35.17, 9.78, 5.42, '#8cb2d6'], // mavi kenarli sol-alt kase (C bicimli)
  [-4.55, -30.13, 10.27, 7.46, '#d9605e'], // kirmizi kenarli S kanali
  [-9.01, -23.73, 10.46, 3.68, '#dfa363'], // turuncu kenarli alt kanal
  [4.75, -42.24, 0.58, 4.65, '#3a3138'], // siyah grind rayi
  [12.3, -45.24, 7.75, 7.07, '#8cb2d6'], // mavi kenarli kavisli quarter-pipe (sag ust)
  [9.3, -37.49, 4.65, 4.46, '#e3d3cd'], // ledge + merdiven-korkuluk modulu 1
  [9.3, -31.39, 4.65, 4.46, '#e3d3cd'], // ledge + merdiven-korkuluk modulu 2
  [4.17, -31.19, 4.55, 4.84, '#e3cfc9'], // kirmizi kenarli capraz kicker rampa
  [13.66, -33.42, 2.23, 8.14, '#c9bdbe'], // koyu banked duvar rampa
  [-0.1, -24.41, 5.62, 5.42, '#5c4f52'], // dikey korkuluk-parmaklik modulu
  [12.3, -23.25, 7.75, 5.33, '#d9605e'], // kirmizi kenarli kavisli quarter-pipe (alt sa
]);

export const PLAN_OGELER = Object.freeze([
  [-38.46, -57.16, 1.45, 5.62, '#e0d0a2'], // sezlong/kabin sirasi
  [-36.72, -59.48, 1.36, 2.91, '#ddc9c5'], // havuz merdiveni ve baslama bloklari (bati)
  [-27.03, -58.9, 1.45, 2.71, '#ddc9c5'], // havuz merdiveni (dogu)
  [-33.81, -58.42, 0.78, 0.78, '#7fa8d8'], // yuzucu figuru
  [-32.55, -44.66, 7.94, 4.55, '#8f95ad'], // cam kafes cati (tavan penceresi)
  [-23.64, -41.37, 2.13, 1.16, '#e2cdc9'], // cati kutusu (dogu kanat)
  [-23.93, -39.52, 2.13, 0.78, '#ddc48a'], // sari tente
  [-21.22, -43.59, 0.97, 7.36, '#f2c1bf'], // kirmizi-beyaz cizgili tente sirasi
  [-6.49, 27.03, 4.17, 0.78, '#6a82ad'], // mavi cizgili tente
  [6.49, 26.93, 4.55, 0.58, '#ae8b6a'], // sari cizgili tente
  [-9.98, 31.0, 0.87, 3.2, '#e3bfbc'], // pembe cizgili tente (bati ust)
  [-10.07, 39.04, 0.87, 3.68, '#f9c4c6'], // pembe cizgili tente (bati alt)
  [10.08, 30.61, 0.97, 3.78, '#9f648d'], // macenta cizgili tente
  [9.98, 38.94, 1.16, 3.58, '#a58872'], // turuncu cizgili tente
  [-6.39, 43.4, 4.46, 0.97, '#f4bdc0'], // pembe tente (guneybati)
  [6.68, 43.4, 5.42, 1.16, '#cbccad'], // yesil cati terasi
  [12.69, 43.5, 4.75, 1.07, '#cba376'], // sari cati paneli
  [-23.15, 20.54, 1.74, 0.78, '#c39f87'], // turuncu tente (sol kenar)
  [-21.22, 37.01, 0.97, 3.97, '#bbc1d5'], // mavi cizgili tente (sol kenar)
  [0.1, 35.07, 19.57, 14.82, '#c9b2b7'], // merkez pazar meydani
  [-4.75, 28.97, 2.32, 0.68, '#aba18b'], // pazar tezgahi kuzey-1
  [4.75, 28.97, 2.13, 0.58, '#81837d'], // pazar tezgahi kuzey-2
  [-8.23, 32.07, 0.87, 1.94, '#c6be9d'], // pazar tezgahi bati-1
  [-8.23, 37.3, 0.87, 1.94, '#b39f7e'], // pazar tezgahi bati-2
  [8.43, 32.16, 0.78, 1.84, '#616154'], // pazar tezgahi dogu-1
  [8.43, 37.3, 0.78, 1.84, '#4b4b45'], // pazar tezgahi dogu-2
  [-4.84, 40.69, 2.23, 0.78, '#b5ae8d'], // pazar tezgahi guney-1
  [4.65, 40.69, 2.13, 0.78, '#b3a78b'], // pazar tezgahi guney-2
  [17.53, 21.89, 1.07, 2.03, '#e6d5d2'], // otobus duragi peronu (bati)
  [19.96, 21.89, 0.68, 2.03, '#f0dcd6'], // otobus duragi peronu (dogu)
  [22.09, 27.8, 3.39, 17.05, '#ccd2a6'], // dogu park seridi (kuzey)
  [22.28, 44.85, 3.0, 9.98, '#c3cb9f'], // dogu park seridi (guney)
  [-9.69, 23.54, 14.34, 8.33, '#cbb5b8'], // kuzeybati blok platformu
  [9.69, 23.44, 15.21, 8.04, '#baa3a4'], // kuzeydogu blok platformu
  [-12.88, 34.97, 7.85, 15.02, '#c2a8a7'], // bati blok platformu
  [13.56, 34.97, 7.65, 15.02, '#d2b9b9'], // dogu blok platformu
  [-9.69, 47.18, 14.34, 9.4, '#b59d9b'], // guneybati blok platformu
  [9.78, 46.98, 15.02, 9.11, '#e3cecf'], // guneydogu blok platformu
  [-57.25, -23.06, 1.26, 2.03, '#ccb298'], // ahsap teras yapisi
  [-40.78, -10.37, 7.17, 1.84, '#e5cfcd'], // uc kemerli arkad
  [-33.23, 0.19, 13.76, 9.49, '#d9c3c1'], // basketbol meydani platformu
  [-21.99, -0.1, 1.55, 2.23, '#e2c9c6'], // kucuk kare avlu anneksi
  [-30.81, 20.63, 4.75, 0.78, '#c9d6b4'], // yesil tente
  [-25.09, 20.63, 5.04, 0.68, '#ebc9a0'], // sari tente
  [-60.35, 8.62, 3.68, 34.78, '#d3cea8'], // nehir bati parki
  [-59.0, -20.63, 6.3, 2.81, '#d3cea8'], // sol ust cim alani
  [-37.68, 0.19, 32.45, 35.07, '#e2cac6'], // merkez sehir blogu zemini
  [-44.08, -3.39, 0.87, 3.0, '#e5cfcd'], // baglanti gecidi B2-bati
  [-42.43, -3.39, 0.97, 3.0, '#e5cfcd'], // baglanti gecidi B2-dogu
  [-44.18, 4.17, 0.87, 2.81, '#e5cfcd'], // baglanti gecidi kubbe-C1 bati
  [-42.33, 4.17, 0.87, 2.81, '#e5cfcd'], // baglanti gecidi kubbe-C1 dogu
  [-25.09, 3.97, 0.97, 2.62, '#e5cfcd'], // baglanti gecidi B5-C2 bati
  [-37.49, 11.43, 1.94, 2.62, '#e8d2d0'], // baglanti gecidi C1-D2
  [-30.61, 11.33, 1.94, 2.52, '#e8d2d0'], // baglanti gecidi C2-D3
  [-25.19, -4.75, 0.78, 1.26, '#e5cfcd'], // baglanti gecidi B4-B5
  [0.0, -0.19, 10.46, 10.46, '#dcc7c6'], // dairesel merkez meydan
  [0.19, 7.17, 5.42, 3.49, '#ece0dc'], // 67 yer yazısı
  [-4.75, -9.78, 5.04, 0.78, '#b15e65'], // kırmızı bariyer / peron kuzeybatı
  [5.04, -9.78, 4.65, 0.58, '#5a5a98'], // mavi bariyer / peron kuzeydoğu
  [-5.43, 9.49, 4.94, 0.78, '#c47a78'], // kırmızı bariyer / peron güneybatı
  [5.04, 9.49, 4.84, 0.58, '#7d7ba0'], // mavi bariyer / peron güneydoğu
  [-10.46, 5.52, 0.68, 4.07, '#ece0dc'], // beyaz duvar panosu (batı-alt bina yanı)
  [-10.66, -4.65, 0.97, 2.52, '#e6d2d3'], // beyaz duvar panosu (batı-üst bina yanı)
  [11.24, 5.62, 0.87, 4.46, '#e6d2d3'], // beyaz duvar dilimleri (doğu-alt bina yanı)
  [-18.41, -22.57, 3.1, 2.32, '#f0e2dc'], // yaya geçidi kavşak kuzey
  [-22.77, -18.5, 2.52, 2.42, '#f0e2dc'], // yaya geçidi kavşak batı
  [-14.14, -18.5, 2.32, 2.42, '#f0e2dc'], // yaya geçidi kavşak doğu
  [-18.6, -14.14, 2.91, 2.13, '#f0e2dc'], // yaya geçidi kavşak güney
  [14.14, -18.5, 2.52, 2.42, '#f2e4de'], // yaya geçidi bulvar kuzeybatı
  [22.67, -18.41, 2.32, 2.52, '#f2e4de'], // yaya geçidi bulvar kuzeydoğu
  [-18.5, 14.05, 2.91, 2.32, '#e6d6d8'], // yaya geçidi güney kavşak kuzey
  [-22.67, 18.02, 2.71, 2.52, '#e6d6d8'], // yaya geçidi güney kavşak batı
  [-14.05, 18.02, 2.62, 2.52, '#e6d6d8'], // yaya geçidi güney kavşak doğu
  [-18.5, 22.18, 2.91, 2.42, '#e6d6d8'], // yaya geçidi güney kavşak güney
  [14.24, 18.02, 2.52, 2.13, '#eadada'], // yaya geçidi güneydoğu bulvar batı
  [22.57, 18.02, 2.32, 2.13, '#eadada'], // yaya geçidi güneydoğu bulvar doğu
  [12.21, -21.6, 7.75, 2.23, '#d9585e'], // kırmızı ray/korkuluk kavisi
  [-10.07, -22.77, 7.65, 1.84, '#d0a35e'], // altın hat kavisi
  [-0.77, -23.06, 2.91, 1.94, '#c9b3b0'], // dikey korkuluk dizisi (megablok)
  [39.82, -55.32, 7.27, 13.56, '#d4cfb3'], // kumsal
  [29.45, -57.74, 19.96, 8.72, '#cdcdb0'], // konut yesil alani
  [52.6, -20.25, 18.7, 5.72, '#d3bdb8'], // sahil rihtimi meydani
  [33.81, -34.78, 10.95, 10.37, '#cdc3ab'], // atlikarinca yesil dairesi
  [46.6, -45.14, 1.07, 2.62, '#c0bf98'], // yesil tekne
  [50.47, -44.95, 1.16, 3.49, '#c8a08c'], // krem guverteli buyuk tekne
  [48.05, -40.98, 0.87, 2.03, '#cec5a5'], // sari tekne
  [52.22, -41.07, 0.97, 2.13, '#bf7d93'], // kirmizi tekne iki
  [44.56, -37.01, 0.87, 2.62, '#db878f'], // kirmizi tekne uc
  [49.31, -36.91, 0.78, 2.81, '#e2dfe4'], // beyaz tekne
  [53.67, -36.91, 2.03, 3.0, '#b1868a'], // bordo yelkenli tekne
  [46.21, -30.81, 0.78, 1.45, '#d6cf9e'], // kucuk sari kayik
  [48.05, -30.9, 0.97, 2.23, '#cc8495'], // kirmizi tekne dort
  [47.57, -26.74, 1.26, 2.81, '#f4aab1'], // kirmizi tekne bes
  [58.22, -45.34, 3.29, 3.1, '#b1868a'], // acik denizde yelkenli
  [45.34, -40.78, 0.39, 1.84, '#8b93ad'], // iskele babasi kuzey-bati
  [49.79, -40.78, 0.39, 1.84, '#8b93ad'], // iskele babasi kuzey-dogu
  [47.47, -37.01, 0.39, 2.52, '#8b93ad'], // iskele babasi orta iki
  [49.89, -30.71, 0.39, 1.94, '#8b93ad'], // iskele babasi guney iki
  [52.12, -30.71, 0.39, 1.94, '#8b93ad'], // iskele babasi guney uc
  [45.34, -26.83, 0.39, 2.62, '#8b93ad'], // iskele babasi en guney bir
  [49.89, -26.83, 0.39, 2.62, '#8b93ad'], // iskele babasi en guney iki
  [52.12, -26.83, 0.39, 2.62, '#8b93ad'], // iskele babasi en guney uc
  [41.27, -46.79, 1.74, 1.65, '#e2bdab'], // krem plaj semsiyesi
  [41.17, -42.14, 1.74, 1.74, '#c9bac1'], // mavi beyaz semsiye
  [41.17, -37.78, 1.74, 1.74, '#e2b3ab'], // pembe semsiye
  [41.17, -33.32, 1.74, 1.74, '#bec3ca'], // acik mavi semsiye
  [28.48, -39.04, 1.84, 1.26, '#d9bfa4'], // pazar tezgahi bir
  [37.88, -41.46, 1.26, 0.87, '#8c7f80'], // pazar tezgahi uc
  [38.46, -38.85, 1.84, 0.97, '#e0b0a6'], // pazar tezgahi dort
  [30.81, -36.13, 1.07, 2.81, '#7f7375'], // kavisli bank
  [27.32, -35.55, 0.58, 1.07, '#d9bfa4'], // pazar tezgahi bes
  [27.61, -33.03, 0.58, 0.78, '#d9bfa4'], // pazar tezgahi alti
  [29.06, -30.52, 2.23, 1.94, '#d8c58a'], // sari tenteli tezgah
  [38.36, -30.23, 1.74, 1.26, '#e0b8a0'], // pazar tezgahi yedi
  [34.1, -28.97, 1.74, 0.87, '#dcc191'], // pazar tezgahi sekiz
  [36.23, -28.97, 0.68, 0.48, '#a1918c'], // kucuk kavisli bank
  [42.62, -29.06, 1.07, 0.78, '#7b6a68'], // promenad kayigi uc
  [-55.99, 30.03, 2.03, 1.16, '#e2b59f'], // ev 2 turuncu veranda saçagi
  [-53.38, 46.6, 1.45, 2.13, '#e8a89c'], // pembe tente cifti (ev 4)
  [-54.73, 55.99, 1.65, 0.97, '#dfae8e'], // ev 5 turuncu sacak
  [-45.92, 55.61, 1.45, 0.58, '#cb9f86'], // turuncu tezgah (ev 6)
  [-38.46, 55.61, 1.16, 0.58, '#cb9f86'], // turuncu tezgah (ev 7)
  [-42.62, 42.14, 11.14, 14.53, '#c4c09e'], // nehir kenari ucgen park
  [-58.32, 26.64, 8.72, 13.56, '#c4c09e'], // konut adasi yesili (sol ust)
  [-56.67, 42.14, 10.66, 15.5, '#c4c09e'], // konut adasi yesili (sol orta)
  [-56.19, 58.12, 11.62, 8.23, '#c4c09e'], // konut adasi yesili (sol alt)
  [-42.62, 58.61, 11.62, 7.75, '#c4c09e'], // konut adasi yesili (alt orta)
  [-24.22, 58.12, 9.2, 9.2, '#c4c09e'], // konut adasi yesili (sag alt)
  [-58.8, 58.12, 0.29, 8.23, '#9d9091'], // gri cit/duvar hatti (sol alt)
  [46.5, -20.34, 13.56, 7.27, '#d3bcbb'], // sahil meydani
  [49.89, 0.0, 12.59, 33.42, '#f2d8c3'], // kumsal
  [44.27, -0.97, 1.55, 31.0, '#d6b1a1'], // ahsap sahil yolu (kuzey-guney)
  [51.34, 15.69, 11.82, 1.94, '#d6b1a1'], // ahsap sahil yolu (guney kol)
  [47.95, -16.66, 6.98, 1.55, '#d6b1a1'], // ahsap sahil yolu (kuzey kol)
  [56.58, 16.66, 1.36, 0.97, '#c69a86'], // iskele rampasi
  [53.96, -17.24, 6.01, 6.01, '#dcc6b6'], // kayalik burun
  [51.73, -16.27, 0.48, 0.39, '#f2ece8'], // sahil isaret kulubesi
  [47.57, -9.88, 1.16, 0.48, '#8a6a5c'], // ahsap bank 1
  [47.08, -6.01, 1.45, 1.45, '#e05a52'], // kirmizi-beyaz semsiye 1
  [47.18, 4.55, 1.36, 1.36, '#6fae7d'], // yesil-beyaz semsiye
  [46.69, 6.68, 1.07, 0.68, '#d8c2c4'], // sezlong 1
  [48.05, 8.33, 1.45, 1.45, '#5b93c9'], // mavi-beyaz semsiye
  [49.79, 10.27, 1.07, 0.68, '#e0d3d0'], // sezlong 2
  [51.73, 11.14, 1.45, 1.45, '#e05a52'], // kirmizi-beyaz semsiye 2
  [41.17, 21.89, 41.66, 4.36, '#d1ccac'], // alt park cimenligi
  [28.87, 23.64, 6.39, 1.36, '#d6c0bf'], // park dairesel meydani
  [50.67, 38.36, 0.87, 0.48, '#5c4f4c'], // kucuk koyu obje (cadir alani ust)
  [50.57, 42.14, 0.39, 1.16, '#5c4f4c'], // kucuk koyu obje (cadir alani alt)
  [23.25, 54.83, 1.55, 0.97, '#e0cfc9'], // ev 1 cati bacalari
  [42.04, 55.51, 1.94, 0.78, '#ffc7bd'], // ev 3 somon cati seridi
  [41.27, 34.78, 41.46, 30.13, '#cbcaa4'], // park yesil alani
  [29.06, 57.74, 13.85, 8.53, '#c6c9a2'], // sol konut adasi
  [50.76, 57.74, 22.38, 8.53, '#c6c9a2'], // sag konut adasi
  [0.0, -52.41, 3.78, 1.16, '#ece0e0'], // monoray beyaz vagon 1 (yatay hat)
  [4.55, -52.6, 4.46, 1.65, '#d6bba4'], // monoray bej vagon (yatay hat, orta)
  [8.82, -52.41, 3.49, 1.26, '#ece0e0'], // monoray beyaz vagon 3 (yatay hat)
  [18.89, -41.27, 1.07, 2.91, '#ece0e0'], // monoray beyaz vagon (dikey hat, ust)
  [18.99, -37.39, 1.26, 4.55, '#d6bba4'], // monoray bej vagon (dikey hat, orta)
  [18.89, -33.42, 1.07, 3.1, '#ece0e0'], // monoray beyaz vagon (dikey hat, alt)
  [-18.5, -55.8, 2.71, 2.03, '#f2e8e3'], // yaya gecidi (sol ust, dikey seritli)
  [-23.06, -50.38, 2.03, 1.55, '#f2e8e3'], // yaya gecidi (sol kenar, yatay seritli)
  [-13.76, -50.38, 2.13, 1.55, '#f2e8e3'], // yaya gecidi (ust cadde, orta sol)
  [18.41, -55.7, 2.81, 2.13, '#f2e8e3'], // yaya gecidi (sag ust, dikey seritli)
  [13.95, -51.25, 2.03, 3.1, '#f2e8e3'], // yaya gecidi (sag kavsak bati)
  [22.86, -51.05, 1.84, 3.1, '#f2e8e3'], // yaya gecidi (sag kavsak dogu)
  [-9.3, -42.92, 2.81, 1.65, '#f4ece8'], // 67 yer yazisi
  [22.57, -46.6, 2.52, 6.01, '#c9a765'], // donme dolap (lunapark)
  [-9.2, -57.64, 13.95, 8.72, '#cfbcb8'], // ust-sol yapi adasi (platform)
  [9.4, -57.64, 13.66, 8.72, '#cfbcb8'], // ust-sag yapi adasi (platform)
  [-7.46, -50.86, 0.87, 0.68, '#5a4a48'], // sokak lambasi 2 (ust cadde)
  [-2.91, -50.76, 0.87, 0.68, '#5a4a48'], // sokak lambasi 3 (ust cadde)
]);

// Market square, re-measured off the 1280 px reference for this build. The
// square is the open ground between the four block columns: pixels 533..745
// across by 925..1078 down, which is the paving row PLAN_OGELER already
// carries. Inside it the drawing shows a ring of bright bollards, eight
// stalls in facing pairs, and a two-tier canopy pavilion at the centre.
export const PLAN_PAZAR = Object.freeze({
  // [x, z, width, depth, colour]. Colour sampled on the lit paving at three
  // points — (206,175,168), (205,174,166), (203,174,164) — a warm pink that
  // reads clearly darker than the street it sits in, (232,210,208).
  zemin: Object.freeze([0.1, 35.07, 19.57, 14.82, '#cdaea6']),
  // Bollard ring. The posts are the brightest pixels in the square: the top
  // run sits at y 938 and spans x 551..729, the bottom run at y 1063, and the
  // side runs at x 552 and x 728. Pitch read off the top run is 178 px over
  // 22 gaps = 8.09 px = 0.78 world units, so 23 posts to a long edge and 17
  // to a short one, 76 in all.
  cit: Object.freeze({ minX: -8.62, maxX: 8.62, minZ: 28.87, maxZ: 40.98, adim: 0.78 }),
  // Eight stalls, two to a side, each an olive canopy with a white table slab
  // beside it on the plaza side. [x, z, width, depth]; the canopy extents were
  // re-read off an olive mask (G - B > 16), which puts them about half a unit
  // deeper than the PLAN_OGELER rows recorded. North-west canopy measured
  // x 581..601 by y 933..942 = 2.04 x 1.07; west-upper canopy x 550..557 by
  // y 959..983 = 0.78 x 2.42. Canopy colour sampled (189,173,150).
  tezgahlar: Object.freeze([
    Object.freeze([-4.70, 28.92, 2.20, 1.00]), // north-west
    Object.freeze([4.75, 28.95, 2.20, 1.00]), // north-east
    Object.freeze([-8.33, 32.11, 0.85, 2.40]), // west-upper
    Object.freeze([-8.33, 37.20, 0.85, 2.40]), // west-lower
    Object.freeze([8.43, 32.16, 0.85, 2.40]), // east-upper
    Object.freeze([8.43, 37.30, 0.85, 2.40]), // east-lower
    Object.freeze([-4.60, 40.69, 2.20, 1.00]), // south-west
    Object.freeze([4.55, 40.69, 2.20, 1.00]), // south-east
  ]),
  // The table beside each stall: 1.5 long by 0.68 across, its centre 0.9
  // toward the middle of the square from the canopy's. Measured on the
  // north-west pair, canopy centre z 28.92 against table centre z 29.83, and
  // on the west-upper pair, canopy centre x -8.38 against table centre -7.56.
  tezgahMasa: Object.freeze({ boy: 1.5, en: 0.68, kacis: 0.9 }),
  // Centre pavilion, two tiers of the same near-white the blocks are roofed
  // in — lit roof sampled (233,208,204), core top (240,211,207), and no
  // yellow anywhere on it. Outer canopy pixels 602..678 by 957..1032; the
  // raised core inside it pixels 618..661 by 978..1020. [x, z, w, d, height].
  kosk: Object.freeze({
    cati: Object.freeze([0.0, 34.34, 7.36, 7.27, 2.7]),
    cekirdek: Object.freeze([0.0, 34.83, 4.20, 4.07, 3.6]),
  }),
});

export const PLAN_KOPRULER = Object.freeze([
  [-57.93, -0.48, 5.23, 3.49], // ahsap yaya koprusu
  [-0.1, -14.63, 6.59, 0.48], // ince yaya köprüsü / ray (kuzey aks)
  [-50.96, 28.48, 6.1, 6.2], // ust ahsap kopru
  [-32.94, 51.54, 6.78, 3.88], // alt ahsap kopru
  [44.08, 35.17, 7.36, 5.81], // buyuk ahsap kopru
  [38.65, 47.08, 4.65, 2.62], // kucuk ahsap kopru
  [-0.1, -52.22, 47.86, 1.65], // yukseltilmis monoray viyadugu (yatay)
  [14.14, -48.05, 7.56, 9.4], // monoray viraji (yataydan dikeye donus)
  [18.6, -30.81, 1.74, 26.74], // yukseltilmis monoray hatti (dikey)
]);

export const PLAN_SU = Object.freeze([
  [-34.29, -57.35, 3.49, 5.81, '#b9c8e3'], // buyuk yuzme havuzu
  [-29.55, -57.35, 4.46, 5.81, '#b9c8e3'], // ikinci yuzme havuzu
  [-57.93, 4.26, 6.49, 39.82, '#8a9dc8'], // kavisli nehir
  [52.22, -42.92, 20.34, 40.88, '#c2cce4'], // deniz
  [-43.79, 39.62, 26.83, 44.76, '#6f87b3'], // nehir
  [55.99, -3.88, 12.01, 40.2, '#bec9df'], // deniz
  [39.23, 38.85, 16.57, 12.98, '#bdc5dc'], // buyuk gol
  [45.24, 32.65, 5.62, 5.62, '#bdc4d7'], // kucuk yuvarlak golet
]);

// --- 67 meydani -----------------------------------------------------------
// These three were measured once before and the file that held them was lost
// with the iCloud eviction, so they are read off the same render again with
// the same transform. Treat the numbers as re-measured, not as the originals.

// The plate the plaza sits on. Its edge runs x -16.6..16.6 and z -16.7..16.5
// on the render; the brighter perimeter walk is 2.75 wide inside that edge
// and the warmer floor is laid inside the walk.
export const PLAN_MERKEZ_MEYDAN = Object.freeze({
  merkez: Object.freeze([0.0, -0.1]),
  genislik: 33.2,
  derinlik: 33.2,
  yurumeYolu: 2.75,
});

// The fountain, read across its own centre line: the apron spans x -3.93..4.16,
// the basin x -2.96..2.75 and the water x -1.91..1.83. The basin sits a third
// of a unit south of the apron, which is why it carries its own centre.
export const PLAN_MERKEZ_CESME = Object.freeze({
  merkez: Object.freeze([0.1, 0.0]),
  havuzMerkez: Object.freeze([-0.05, 0.3]),
  avluCapi: 8.4,
  havuzCapi: 5.6,
  suCapi: 3.8,
  heykelCapi: 2.2,
});

// The four round towers on the block's corners. The lathe profile is built to
// a 5.7 base, so the width and depth here are read as diameters against it.
// The render's four tints differ by up to 60 levels, but that is the sun
// crossing the block, not four materials — so they all carry the same stone.
export const PLAN_PLAZA_KULELERI = Object.freeze([
  Object.freeze([-13.8, -14.1, 5.7, 5.7, '#f1e9e2']),
  Object.freeze([13.7, -14.1, 5.9, 5.9, '#f1e9e2']),
  Object.freeze([-13.8, 13.8, 5.6, 5.6, '#f1e9e2']),
  Object.freeze([13.7, 13.8, 5.8, 5.8, '#f1e9e2']),
]);

