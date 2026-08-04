// plan-verisi.js — Oscar'in kus bakisi sehir planindan OLCULEN yerlesim.
//
// Plan 1280x1280 piksel; dunya +/-62 birim. Donusum: w = (px/1280 - 0.5) * 124.
// Her satir plandan okunmus tek bir nesne: [x, z, genislik, derinlik, renk].
// Elle konumlandirma YOK — bu dosyadaki her sayi cizimden olculmustur.

export const PLAN_BINALAR = Object.freeze([
  [-24.41, -56.57, 3.58, 4.55], // havuz kulup binasi
  [-32.36, -44.56, 13.08, 9.01], // spor salonu / AVM ana blok
  [-23.64, -44.18, 4.17, 8.14], // AVM dogu ek blogu
  [-32.36, -38.17, 5.33, 3.1], // giris sacagi (kanopi)
  [-59.68, -34.2, 3.68, 4.07], // ev 1 (kuzey)
  [-57.06, -33.81, 2.52, 3.29], // ev 1 yan kanadi
  [-59.58, -29.06, 3.88, 4.17], // ev 2 (orta)
  [-56.96, -28.68, 2.52, 3.49], // ev 2 yan kanadi
  [-59.48, -23.83, 3.78, 4.17], // ev 3 (guney)
  [-56.87, -23.64, 2.52, 3.39], // ev 3 yan kanadi
  [-49.6, -30.71, 2.62, 8.53], // stadyum bati tribun binasi
  [-13.37, 23.25, 6.1, 7.17], // kuzeybati kose blogu
  [-6.49, 23.54, 6.3, 6.49], // mavi tenteli blok
  [6.88, 23.64, 6.1, 6.39], // kuzeydogu sari tenteli blok
  [13.47, 23.44, 5.91, 6.39], // kuzeydogu kose blogu
  [-13.37, 31.19, 6.01, 7.17], // bati orta ust blok
  [-13.37, 38.85, 5.81, 6.68], // bati orta alt blok
  [13.56, 31.19, 6.1, 6.88], // dogu orta ust blok
  [13.56, 38.56, 6.1, 6.78], // dogu orta alt blok
  [-13.27, 47.27, 6.3, 7.94], // guneybati blok 1
  [-6.49, 47.47, 5.91, 7.56], // guneybati blok 2
  [10.17, 47.47, 12.59, 7.17], // guneydogu genis blok
  [-22.96, 24.02, 2.13, 5.91], // sol kenar blok 1 (kesik)
  [-22.86, 31.0, 2.23, 6.2], // sol kenar blok 2 (kesik)
  [-22.96, 38.17, 2.13, 6.88], // sol kenar blok 3 (kesik)
  [-22.86, 44.56, 2.32, 5.52], // sol kenar blok 4 (kesik)
  [-23.25, 58.51, 1.74, 5.33], // banliyo evi 1 (kesik)
  [-13.27, 58.42, 4.17, 5.52], // banliyo evi 2
  [-6.1, 58.42, 4.55, 5.52], // banliyo evi 3
  [-3.29, 58.03, 1.26, 1.55], // banliyo evi 3 garaji
  [5.33, 58.51, 4.75, 5.81], // banliyo evi 4
  [13.37, 58.51, 4.84, 5.81], // banliyo evi 5
  [22.57, 58.03, 2.62, 5.91], // banliyo evi 6 (kesik)
  [-49.7, -14.34, 6.1, 5.13], // A1 kuzeybati blok binasi
  [-42.33, -14.24, 6.78, 5.04], // A2 kuzey blok binasi
  [-36.33, -13.76, 4.55, 3.88], // A3 hilal girintili bina
  [-31.19, -14.24, 5.23, 5.23], // A4 kuzey blok binasi
  [-24.51, -13.95, 5.62, 5.91], // A5 parlak beyaz kule
  [-50.08, -7.85, 6.2, 5.81], // B1 bati sira binasi
  [-40.88, -6.98, 9.88, 5.13], // B2 kubbeli genis bina
  [-30.71, -7.17, 6.3, 5.33], // B3 dogu sira binasi
  [-24.61, -6.98, 5.04, 4.94], // B4 kuzeydogu bina
  [-43.3, 0.39, 5.42, 4.36], // kort bati kubbeli bina
  [-24.51, -0.77, 3.97, 6.88], // B5 kort dogusu ince kule
  [-49.89, 0.29, 6.68, 8.43], // L3 bati uzun bina
  [-49.89, 7.75, 6.01, 5.72], // L4 bati sira binasi
  [-49.79, 14.34, 6.2, 5.52], // L5 bati sira binasi
  [-39.91, 7.75, 11.72, 5.23], // C1 genis yatay bina
  [-27.61, 7.56, 10.66, 5.13], // C2 kubbeli genis bina
  [-42.82, 14.34, 5.42, 4.75], // D1 guney sira binasi
  [-37.01, 14.53, 5.42, 4.26], // D2 tik isaretli bina
  [-30.61, 14.53, 4.55, 4.36], // D3 kubbeli guney bina
  [-24.61, 14.53, 5.23, 4.26], // D4 guneydogu bina
  [-45.43, 22.09, 6.39, 3.49], // E1 alt sira binasi
  [-38.85, 22.09, 6.1, 3.39], // E2 alt sira binasi
  [-28.19, 22.38, 12.21, 2.91], // E3 alt genis bina
  [-60.45, 21.89, 3.1, 3.88], // sol alt kiyi yapisi
  [-13.47, -13.76, 5.62, 6.39], // kademeli koni kule (kuzeybatı)
  [-6.1, -14.14, 5.42, 6.78], // L çatılı bina kuzey-1
  [6.2, -14.14, 5.52, 6.78], // L çatılı bina kuzey-2
  [13.47, -13.66, 5.42, 6.39], // kademeli silindir kule (kuzeydoğu)
  [-14.14, -6.68, 5.62, 5.62], // L çatılı bina batı-üst
  [13.47, -6.68, 5.81, 5.62], // L çatılı bina doğu-üst
  [-13.95, 6.01, 6.39, 5.23], // düz çatılı geniş bina batı-alt
  [13.95, 6.01, 6.39, 5.23], // düz çatılı geniş bina doğu-alt
  [-13.56, 13.27, 5.81, 6.01], // kubbe kule (güneybatı)
  [-6.1, 13.27, 5.62, 5.81], // kare çatılı bina güney-1
  [6.2, 13.17, 5.62, 5.81], // kare çatılı bina güney-2
  [13.37, 13.27, 5.81, 5.81], // kademeli silindir kule (güneydoğu)
  [-22.77, -13.76, 2.52, 5.62], // sol kenar binası A
  [-22.57, -1.45, 3.0, 5.91], // sol kenar avlulu bina C
  [-23.06, 7.75, 1.94, 5.23], // sol kenar binası D
  [-22.57, 14.24, 3.0, 4.84], // sol kenar binası E
  [-22.48, 21.7, 3.1, 4.36], // sol kenar binası F (turuncu çatılı)
  [21.89, -22.18, 3.88, 3.78], // sağ üst köşe bloğu (kırmızı yaylı)
  [21.99, -13.08, 3.68, 9.69], // sağ kenar büyük yuvarlak bina
  [22.57, -1.55, 2.52, 9.4], // sağ kenar dikdörtgen bina
  [22.48, -7.27, 2.71, 2.91], // sağ kenar kavisli yapı (üst kavis)
  [22.48, 5.81, 2.71, 4.84], // sağ kenar kavisli yapı (alt kavis)
  [22.77, 10.46, 2.13, 2.62], // eğik dikdörtgen yapı
  [21.8, 14.24, 4.07, 4.36], // sağ alt köşe bloğu
  [-6.39, 21.89, 6.49, 3.78], // alt sıra bina 2
  [22.57, -60.64, 3.58, 2.91], // varil catili bej ev
  [24.12, -56.09, 4.07, 3.88], // garajli bej ev
  [30.42, -55.99, 3.68, 4.94], // orta sirali bej ev
  [34.68, -55.8, 4.17, 4.65], // sagdaki bej ev
  [22.77, -35.84, 3.0, 5.42], // seritli carsi binasi
  [55.12, -19.28, 5.91, 3.88], // deniz feneri
  [-45.53, 23.83, 6.01, 6.01], // blok binasi A1 (beyaz kare)
  [-38.85, 24.02, 6.3, 5.62], // blok binasi A2 (bej, L isaretli)
  [-28.68, 24.22, 12.4, 5.81], // blok binasi A3 (uzun beyaz, L isaretli)
  [-38.75, 31.1, 6.2, 6.2], // blok binasi B1 (beyaz kare)
  [-28.48, 31.1, 12.4, 6.2], // blok binasi B2 (uzun bej)
  [-32.07, 37.98, 6.3, 6.2], // blok binasi C1 (beyaz kare)
  [-25.09, 37.98, 6.2, 6.2], // blok binasi C2 (bej, L isaretli)
  [-24.99, 44.85, 6.2, 5.81], // blok binasi D1 (bej, L isaretli)
  [-58.8, 29.26, 4.75, 4.46], // ev 2 govdesi (mor gri cati)
  [-56.96, 27.12, 2.32, 2.52], // ev 2 pembe catili kanat
  [-55.9, 39.72, 3.88, 4.94], // ev 3 (ust, gri cati)
  [-55.9, 46.69, 3.78, 5.13], // ev 4 (alt, gri cati)
  [-55.7, 58.03, 4.94, 5.42], // ev 5 (mavi catili, sol alt)
  [-44.95, 46.89, 5.04, 4.94], // park binasi (nehir kenari)
  [-45.43, 58.03, 4.17, 4.55], // ev 6 (alt orta sol)
  [-39.52, 58.12, 4.26, 4.84], // ev 7 (alt orta sag)
  [-26.16, 58.22, 2.13, 1.84], // ev 8 ucgen kanat
  [30.52, 14.14, 7.65, 3.2], // stadyum guney ek binasi
  [24.51, 57.54, 4.55, 6.49], // ev 1 - buyuk acik bej konut
  [31.87, 58.42, 5.13, 5.52], // ev 2 - gri kahve konut
  [43.11, 57.93, 5.13, 5.81], // ev 3 - somon catili konut
  [51.05, 57.83, 4.46, 6.2], // ev 4 - koyu garajli konut
  [58.22, 57.83, 6.98, 6.39], // ev 5 - sari catili genis konut
  [-13.47, -61.03, 3.97, 2.03], // arka bina B1 (ust kenardan kesik)
  [-13.47, -57.06, 3.49, 5.72], // sari tenteli bina B1
  [-9.11, -56.96, 3.78, 5.62], // sari cizgili tenteli bina B2
  [-4.65, -56.96, 3.68, 5.62], // mor-mavi cizgili tenteli bina B3
  [-4.55, -61.03, 3.68, 2.03], // arka bina B3 (ust kenardan kesik)
  [4.75, -61.03, 3.58, 2.03], // arka bina B4 (ust kenardan kesik)
  [4.75, -57.06, 3.58, 5.72], // pembe tenteli bina B4
  [9.3, -56.96, 3.68, 5.81], // mavi tenteli bina B5
  [13.85, -56.87, 3.49, 5.62], // buyuk L isaretli bina B6
  [13.85, -61.03, 3.49, 1.94], // arka bina B6 (ust kenardan kesik)
  [23.15, -42.62, 1.36, 4.55], // donme dolap yanindaki gri bina
]);

export const PLAN_BINA_RENK = Object.freeze([
  '#e6d2ce',
  '#e9d3d0',
  '#e9d3d0',
  '#e8d5d2',
  '#e9d3cc',
  '#d8c6ae',
  '#e9d3cc',
  '#d8c6ae',
  '#e9d3cc',
  '#d8c6ae',
  '#e7d3d1',
  '#e0cbcb',
  '#e5cfd1',
  '#ceb4b3',
  '#e7d1d2',
  '#ead0d1',
  '#cfb2af',
  '#e7d3d1',
  '#e8d3d1',
  '#caafac',
  '#b9a1a3',
  '#e6d2d1',
  '#d6c2c4',
  '#cfb9b4',
  '#bda5a5',
  '#d0bcc0',
  '#efd6d2',
  '#ceb4af',
  '#b7a2a6',
  '#dfc9c7',
  '#ab9696',
  '#c7b1b9',
  '#b7aaaf',
  '#ecd3cf',
  '#ead5d4',
  '#e8d2ce',
  '#e9d3d1',
  '#f3e3e1',
  '#e6d2d1',
  '#ead5d4',
  '#e9d3d1',
  '#ead5d4',
  '#e9d3d1',
  '#ead5d4',
  '#e6d2d1',
  '#e6d2d1',
  '#e7cdd0',
  '#e5d0cf',
  '#e8cecd',
  '#e7cdd0',
  '#dfc3c0',
  '#e9d3d1',
  '#e9d3d1',
  '#eed6d3',
  '#ead2d5',
  '#ead2d5',
  '#f5d9d6',
  '#e5cfcd',
  '#e0cbcb',
  '#e0cbcb',
  '#ddc8c9',
  '#e6d2d3',
  '#e2cdce',
  '#e6d2d3',
  '#e7d2d1',
  '#f6ddd9',
  '#e6cccd',
  '#edd9d6',
  '#dbc5ca',
  '#f5dfdb',
  '#dcc4c2',
  '#f0d5d1',
  '#d1bcbf',
  '#e3ccc8',
  '#9e8495',
  '#d8c5c1',
  '#d0b6b1',
  '#c8b1b4',
  '#b29ca8',
  '#ccaca4',
  '#c7b1b9',
  '#dcc6c9',
  '#cdb5b0',
  '#cdb5b0',
  '#cdb5b0',
  '#cdb5b0',
  '#eecdd4',
  '#d27c85',
  '#e6d2d4',
  '#cfb6b2',
  '#e6d2d1',
  '#e8d2d5',
  '#cfb5b4',
  '#e7d1d2',
  '#cdb4b0',
  '#e6d7d2',
  '#9d8e9a',
  '#fbcfcf',
  '#d4bab4',
  '#d8beba',
  '#c6c3c9',
  '#e7d1d1',
  '#d8bbb3',
  '#e7ceca',
  '#ece5e1',
  '#e6d2d1',
  '#eed2ce',
  '#b0a09e',
  '#e9d4cf',
  '#d0b7b0',
  '#d6bfb6',
  '#ddc9c3',
  '#e6d3ce',
  '#e8d4cf',
  '#e7d3d4',
  '#ddc9c3',
  '#dcc8c3',
  '#e8d4d5',
  '#e7d1d3',
  '#ddc9c4',
  '#dbc7c2',
  '#cfc4c9',
]);

export const PLAN_AGACLAR = Object.freeze([
  [-22.77, -59.97, 3.58], // agac kumesi (havuz kuzeydogusu)
  [-59.48, -59.87, 5.33], // agac kumesi (sol ust kose)
  [-51.93, -61.32, 1.94], // tek agac (ust kenar)
  [-58.42, -41.66, 6.01], // agac kumesi (sol orta)
  [-47.95, -37.01, 2.23], // agac kumesi (pist kuzeybatisi)
  [-48.53, -22.96, 2.91], // agac kumesi (pist guneybatisi)
  [-31.48, -32.84, 2.91], // agac kumesi (beyzbol kuzeybatisi)
  [-35.65, -22.67, 3.39], // agac kumesi (beyzbol guneybatisi)
  [-7.46, 29.55, 1.36], // yuvarlak agac saksisi (KB kose)
  [7.36, 29.64, 1.45], // yuvarlak agac saksisi (KD kose)
  [-7.46, 39.91, 1.36], // yuvarlak agac saksisi (GB kose)
  [7.36, 39.91, 1.45], // yuvarlak agac saksisi (GD kose)
  [22.48, 21.22, 1.26], // park agaci kuzey-1
  [22.67, 23.15, 1.26], // park agaci kuzey-3
  [21.99, 33.81, 1.26], // park agaci orta-1
  [22.57, 41.17, 1.36], // park agaci guney-1
  [22.86, 42.92, 1.26], // park agaci guney-2
  [22.18, 46.02, 1.26], // park agaci guney-3
  [22.57, 48.34, 1.26], // park agaci guney-5
  [-22.28, 55.8, 2.13], // banliyo agac kumesi 1
  [-14.53, 55.41, 0.97], // koyu agac (ev 2 bati)
  [-10.85, 55.8, 1.55], // agac kumesi (ev 2 dogu)
  [-4.84, 61.61, 2.42], // agac kumesi (ev 3 guney)
  [8.72, 55.7, 2.13], // buyuk agac (ev 4 dogu)
  [10.56, 55.51, 1.07], // koyu kucuk agac (ev 5 bati)
  [3.2, 60.55, 1.65], // agac kumesi (ev 4 guney)
  [11.24, 60.74, 2.13], // agac kumesi (ev 5 guney)
  [21.7, 56.19, 1.26], // koyu agac (ev 6 bati)
  [-57.45, -14.05, 4.46], // nehir kiyisi agac obegi
  [-60.93, -0.77, 2.23], // sol kiyi agac sirasi ust
  [-61.03, 13.17, 2.03], // sol kiyi agac sirasi alt
  [-6.88, -6.98, 2.91], // yuvarlak saksıda ağaç kuzeybatı
  [6.98, -6.98, 2.91], // yuvarlak saksıda ağaç kuzeydoğu
  [-6.88, 6.59, 2.91], // yuvarlak saksıda ağaç güneybatı
  [6.98, 6.59, 2.91], // yuvarlak saksıda ağaç güneydoğu
  [-22.48, -22.57, 3.2], // sol üst yeşil park
  [27.61, -60.35, 2.71], // agac kumesi bir
  [30.32, -60.45, 2.23], // agac kumesi iki
  [38.07, -54.73, 2.03], // tek agac
  [-61.23, 18.5, 1.74], // agac kumesi (sol ust kose)
  [-61.03, 30.71, 1.55], // acik renkli yuvarlak agac (ev 2 yani)
  [-59.87, 42.72, 1.94], // agac (ev 3 altinda)
  [-46.31, 39.43, 1.65], // park agaci 1
  [-45.34, 41.27, 2.23], // park agaci 2
  [-46.79, 43.01, 1.16], // park agaci 4
  [-42.04, 43.5, 1.84], // kucuk konik agac (park ortasi)
  [-40.2, 47.18, 1.94], // park agaci 5
  [-38.56, 48.63, 2.32], // park agaci 6
  [-40.78, 48.92, 1.26], // park agaci 7
  [-60.93, 55.51, 1.26], // agac (sol alt 1)
  [-59.38, 60.26, 1.45], // agac (sol alt 4)
  [-55.41, 61.42, 1.55], // agac (ev 5 guneyi)
  [-27.51, 60.16, 1.65], // agac (sag alt 3)
  [-25.57, 61.61, 1.45], // agac (sag alt 4)
  [38.07, 14.34, 3.58], // agac kumesi stadyum guneydogu
  [36.33, 21.31, 4.36], // park agac kumesi 3
  [43.98, 21.89, 4.26], // park agac kumesi 4
  [50.08, 21.89, 6.01], // park agac kumesi 5
  [57.16, 22.28, 5.33], // park agac kumesi 6
  [60.64, 22.28, 2.62], // park agac kumesi 7
  [36.62, 29.16, 2.03], // tek agac - piknik alani batisi
  [52.02, 26.25, 3.68], // orman kumesi - bati orta
  [55.8, 28.19, 4.26], // orman kumesi - merkez
  [60.16, 28.48, 3.68], // orman kumesi - dogu orta
  [51.44, 32.55, 4.84], // orman kumesi - guneybati
  [56.96, 33.13, 4.46], // orman kumesi - guney orta
  [60.74, 33.33, 2.42], // orman kumesi - guneydogu ust
  [59.0, 41.08, 5.91], // orman kumesi - dogu alt
  [59.0, 46.5, 5.91], // orman kumesi - guneydogu kose
  [51.92, 47.47, 7.94], // agac kumesi - park guney bandi
  [26.64, 55.41, 2.71], // konut agaci - ev1 dogusu
  [27.8, 57.93, 1.55], // konut agaci - ev1 guneydogusu
  [34.49, 55.9, 2.13], // konut agaci - ev2 dogusu
  [40.2, 55.7, 1.26], // konut agaci - ev3 batisi
  [45.43, 55.32, 1.65], // konut agaci - ev3 dogusu
  [47.66, 60.64, 2.13], // konut agaci - ev4 guneybatisi
  [55.9, 60.26, 1.65], // konut agaci - ev5 guneybatisi
  [21.99, -57.54, 3.68], // yesil park adasi (sag ust)
]);

export const PLAN_ARABALAR = Object.freeze([
  [-41.95, -57.93, 1, '#ddc48a'], // sari otobus
  [-56.57, -51.44, 1, '#e88b8f'], // kirmizi yaris arabasi
  [-59.38, -48.82, 1, '#ded1b8'], // krem yaris arabasi
  [-48.44, -46.31, 0, '#f0daa9'], // sari araba (otopark 1A)
  [-48.44, -42.43, 0, '#9db4dd'], // mavi araba (otopark 1C)
  [-44.56, -46.31, 0, '#9db4dd'], // mavi araba (otopark 2A)
  [-44.56, -42.43, 0, '#f0daa9'], // sari araba (otopark 2B)
  [-40.69, -44.95, 0, '#9db4dd'], // mavi araba (otopark 3A)
  [-40.78, -40.01, 0, '#9db4dd'], // mavi araba (otopark 3C)
  [-19.28, -41.85, 1, '#f8918e'], // turuncu araba (dogu cadde)
  [-27.9, -37.1, 1, '#6a7ab0'], // lacivert araba (AVM guney cebi)
  [-25.96, -37.1, 1, '#f58589'], // kirmizi araba (AVM guney cebi)
  [-22.86, -37.1, 1, '#9db4dd'], // mavi araba (AVM guney cebi)
  [-19.28, -29.74, 1, '#9db4dd'], // mavi araba (dogu cadde alt)
  [-53.57, -36.62, 1, '#ead8d8'], // beyaz otobus (kuzey)
  [-53.57, -29.64, 0, '#ead8d8'], // kucuk beyaz minibus
  [-34.2, -18.89, 0, '#d5d2a5'], // yesil kamyon (guney cadde)
  [-3.97, 18.89, 0, '#7d9b96'], // yesil minivan (kuzey yol)
  [0.0, 48.53, 1, '#af6082'], // pembe araba (park halinde)
  [0.19, 52.99, 0, '#bfa199'], // kahverengi kamyonet (alt arter)
  [1.16, 59.19, 1, '#98aabc'], // mavi araba (banliyo sokagi)
  [-19.47, -7.46, 1, '#c96159'], // kirmizi araba
  [-17.82, 6.68, 1, '#a277ab'], // mor araba
  [-10.75, -17.44, 0, '#b7bcd6'], // beyaz-mavi sedan (kuzey cadde)
  [-17.53, 8.43, 1, '#8f709a'], // mor sedan (batı cadde)
  [18.79, 1.26, 1, '#e2cdd2'], // beyaz kamyon/otobüs bulvar-1
  [18.7, 5.23, 1, '#dcc6c8'], // beyaz kamyon/otobüs bulvar-2
  [18.89, 15.31, 1, '#bfa9ae'], // kısa araç bulvar-4
  [18.89, 17.73, 1, '#d6c2c4'], // beyaz kamyon bulvar-5
  [19.28, -59.68, 1, '#a7accf'], // lacivert araba
  [33.33, -51.83, 0, '#ecc5ca'], // pembe araba
  [18.99, -41.17, 1, '#d6c4c9'], // beyaz otobus bir
  [37.1, -33.13, 1, '#c3c2b2'], // nane yesili minibus
  [-50.96, 42.33, 1, '#d98a86'], // kirmizi araba
  [-57.35, 52.31, 0, '#c6cbae'], // yesil araba
  [-43.01, 50.47, 0, '#7b83a8'], // mavi araba
  [-39.14, 60.35, 0, '#a197a4'], // gri araba
  [40.88, -7.85, 1, '#dbceb1'], // sari minibus
  [42.43, 9.69, 1, '#c9706c'], // kirmizi araba
  [39.23, 51.05, 0, '#7a9a98'], // yesil araba
  [38.17, 59.09, 1, '#e8969f'], // kirmizi park etmis araba
  [-0.87, -56.87, 1, '#9cc0a2'], // yesil araba (bloklar arasi sokakta)
]);
