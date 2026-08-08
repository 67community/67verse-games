# Düşük üçgenli modeli kusursuz gösterme reçetesi

Oscar'ın sorusu: fRiENDSiES gibi koleksiyonlar, az üçgenli hatta "bozuk"
modelleri nasıl kusursuz gösteriyor? Araştırma + bizim oyunda doğrudan
uygulanabilir reçete. (2026-08-08)

## Kısa cevap

Kusursuzluk üçgen sayısından gelmiyor; beş şeyin toplamından geliyor:

1. **Doğru vertex normalleri** (yumuşak gölgeleme) — facet'leri silen şey bu.
2. **Yüksek kaliteli pişirilmiş doku + normal map** — detay meshte değil,
   haritada yaşıyor.
3. **IBL (environment) + ACES tonlama** — plastiğin "oyuncak" parlaması
   ışıktan geliyor; düz lambert her modeli ucuz gösterir.
4. **Silüet yuvarlaklığı** — kenar bevel'i ya da subdiv edilmiş kaynak;
   silüet köşeli ise içi ne kadar pürüzsüz olsa da "low poly" okunur.
5. **Temiz topoloji** — kaynak/çatlak/ters yüz onarımı; kırık normal, siyah
   leke ve dikiş bunlardan çıkar.

fRiENDSiES tam olarak bunu yapıyor: orta yoğunlukta ama TAMAMEN yumuşak
normal'li gövdeler, 2k-4k pişmiş dokular, güçlü stüdyo IBL'i. Model "az
poligonlu" ama hiçbir yerde facet ya da dikiş görünmüyor.

## Bizim motorda (three.js) uygulama

### 1) Yumuşak normal — facet silme

Meshy/AI çıkışı GLB'lerde üçgenler çoğu zaman AYRIK vertex'lerle gelir
(indexed değil ya da UV dikişlerinde kopuk). `computeVertexNormals` bu
yüzden düz (faceted) sonuç verir. Çözüm: önce kaynakla, sonra hesapla:

```js
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function yumusat(geometry, tolerans = 1e-4) {
  geometry.deleteAttribute('normal');
  const kaynakli = mergeVertices(geometry, tolerans);
  kaynakli.computeVertexNormals();
  return kaynakli;
}
```

Dikkat: bu HER kenarı yumuşatır. Kasıtlı sert kenarlar (kutu köşesi)
isteniyorsa crease-angle'lı bir akış gerekir — three çekirdeğinde yok;
pratik yol ya modellemede sert kenarlara UV/vertex kopuşu bırakmak ya da
`toCreasedNormals(geometry, aci)` (BufferGeometryUtils) kullanmak:
30-45 derece crease açısı oyuncak dili için iyi bir başlangıç.

### 2) Pipeline onarımı (gltf-transform — repoda zaten var)

Kırık AI meshleri için tek komutluk banyo:

```bash
npx @gltf-transform/cli weld girdi.glb kaynakli.glb --tolerance 0.0001
npx @gltf-transform/cli prune kaynakli.glb temiz.glb
# gerekiyorsa: npx @gltf-transform/cli simplify temiz.glb kucuk.glb --ratio 0.5
```

weld = çatlak kapatma (yakın vertexleri birleştirir), prune = ölü veri.
Sıfır alanlı üçgenler z-fighting/parlama yapar; weld+prune çoğunu süpürür.
Delikler için en sağlam yol yeniden remesh (Meshy remesh API — kuralımız
zaten bu; Blender decimate yasak).

### 3) Işık sahnesi

Hub'da zaten doğru kurulu ve karakter seçim ekranında kanıtlandı:
`RoomEnvironment + PMREM` → `scene.environment`, `ACESFilmicToneMapping`,
`SRGBColorSpace`, üç nokta ışık. Aynı reçete her model vitrini için
geçerli. Parlak plastik için malzemede `roughness 0.2-0.45`,
`envMapIntensity 0.8-1.2` bandı.

### 4) Matcap — garanti yumuşak okuma

Işıktan bağımsız, her açıda pürüzsüz "studio clay" görünümü istenirse
`MeshMatcapMaterial` + tek 512px matcap dokusu yeter. UI vitrinleri
(picker, Closet önizleme) için ucuz ve kusursuz; oyun içinde PBR kalsın.

### 5) Normal map pişirme (pro hat)

Meshy'nin yüksek poli çıktısından remesh ile düşük poli üret
(`input_task_id + target_polycount`), yükseği düşüğe normal map olarak
pişir. Detay haritada taşınır; 8k üçgenlik gövde 200k gibi okunur.
Bu, koleksiyon kalitesinin asıl endüstri sırrı: detay meshte değil,
tangent-space normal map'te.

### 6) Bizim oyuna somut aksiyonlar

- [ ] `friendsie-bot.js` yüklemesine opsiyonel `yumusat()` geçidi: facet
  görünen konuk modellerde (fr_500 yıldız yüzeyleri) bir kez dene, A/B
  ekran görüntüsüyle karşılaştır.
- [ ] Meshy üretim reçetesine "weld + prune" son adımı ekle (scriptler
  scratchpad'de; repoya scripts/model-banyo.mjs olarak alınabilir).
- [ ] Picker/Closet önizlemeleri için matcap seçeneği (tek doku, sıfır
  ışık maliyeti).
- [ ] Yeni karakter üretimlerinde: remesh(8k) + 2k doku + normal map
  pişirme akışını dene (Meshy API uçları mevcut).

## Kaynaklar

- three.js forum — mergeVertices + computeVertexNormals akışı ve crease
  tartışması: https://discourse.threejs.org/t/is-there-a-merge-vertices-smooth-normals-utility-with-a-crease-angle-argument-available/37679
  ve https://discourse.threejs.org/t/smooth-edge-for-glb-models/50144
- Normal map pişirme uçtan uca: https://halabaojia.com/notes/20260119-how-to-bake-normal-maps-complete-guide/
  ve https://nastyrodent.com/high-poly-to-low-poly-baking/
- Stilize pişmiş doku yaklaşımı (Sketchfab community):
  https://sketchfab.com/blogs/community/viking-shield-creating-stylized-textures-using-baked-maps/
- Weld/onarım pratiği: https://www.simplygon.com/posts/b6ed75c9-eaaf-4669-bee8-eeb16c1987e9
  ve https://polyvia3d.com/repair/glb
