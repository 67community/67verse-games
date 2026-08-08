// karakter-secim.js — the character picker, modelled on fRiENDSiES.
//
// fRiENDSiES is a collection of finished 3D avatars; its own experience is one
// avatar on show at a time, turning on a stand, browsed left and right. This is
// that, over Oscar's fRiENDSiES roster: swipe through the characters, most are
// locked behind a price, the first two are free, and the pick is saved to the
// account so it is chosen once and kept. The chosen id is a `friendsie:` id the
// hub already knows how to mount.
//
// It runs its own tiny renderer so the pick happens before the game world is
// built; nothing here touches the hub scene.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COSMETICS } from './systems/cosmetics.js';

const FR_BASE = `${import.meta.env?.BASE_URL ?? '/'}friendsies/`;

// Trial phase: everything is free so the whole roster can be tested end to
// end. The fiyat numbers below stay as the future price list — flipping this
// flag back turns the paid flow on again.
const HERSEY_UCRETSIZ = true;

// The roster shown in the picker. The hero (gorilla) and the first fRiENDSiES
// are free; the rest carry a coin price so most of the collection is a purchase,
// the way Oscar wants it. price 0 = owned from the start.
export const KARAKTERLER = Object.freeze([
  // Display names never carry the source collection's brand — Oscar's rule:
  // "Friends ismi hicbir yerde gecmeyecek". They are numbered 67 pieces.
  { id: 'gorilla', ad: 'Gorilla', dosya: null, fiyat: 0 },
  { id: 'friendsie:fr_67.glb', ad: 'No. 67', dosya: 'fr_67.glb', fiyat: 0 },
  { id: 'friendsie:fr_1.glb', ad: 'No. 1', dosya: 'fr_1.glb', fiyat: 120 },
  { id: 'friendsie:fr_100.glb', ad: 'No. 100', dosya: 'fr_100.glb', fiyat: 120 },
  { id: 'friendsie:fr_500.glb', ad: 'No. 500', dosya: 'fr_500.glb', fiyat: 200 },
  { id: 'friendsie:fr_777.glb', ad: 'No. 777', dosya: 'fr_777.glb', fiyat: 250 },
  { id: 'friendsie:fr_1000.glb', ad: 'No. 1000', dosya: 'fr_1000.glb', fiyat: 300 },
  { id: 'friendsie:fr_2222.glb', ad: 'No. 2222', dosya: 'fr_2222.glb', fiyat: 400 },
  { id: 'friendsie:fr_4242.glb', ad: 'No. 4242', dosya: 'fr_4242.glb', fiyat: 500 },
  { id: 'friendsie:fr_8888.glb', ad: 'No. 8888', dosya: 'fr_8888.glb', fiyat: 888 },
]);

const STIL = `
#karakter-secim { position: fixed; inset: 0; z-index: 120; display: none;
  background: radial-gradient(120% 90% at 50% 15%, #eaf1fb 0%, #cdd9ec 60%, #b7c6e0 100%);
  font-family: inherit; color: #1a2740; }
#karakter-secim.on { display: block; }
#karakter-secim canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

/* sürüm seçimi (oyunun ilk adımı) */
#ks-surum { position: absolute; inset: 0; display: none; flex-direction: column;
  align-items: center; justify-content: center; gap: 34px; padding: 24px;
  background: inherit; z-index: 2; }
#karakter-secim.surum #ks-surum { display: flex; }
#ks-surum-baslik { font-size: 24px; font-weight: 700; letter-spacing: 0.06em; }
#ks-surum-kartlar { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; }
.ks-kart { width: 260px; max-width: 42vw; background: #ffffffdd; border: 2px solid transparent;
  border-radius: 20px; padding: 26px 22px; cursor: pointer; text-align: center;
  transition: transform .14s, border-color .14s, box-shadow .14s; box-shadow: 0 8px 24px #0001; }
.ks-kart:hover { transform: translateY(-4px); border-color: #2d6cdf; box-shadow: 0 14px 30px #2d6cdf22; }
.ks-kart.nft:hover { border-color: #c8892f; box-shadow: 0 14px 30px #c8892f22; }
.ks-kart-ust { display: flex; justify-content: center; margin-bottom: 14px; }
.ks-kart-ust svg { width: 46px; height: 46px; }
.ks-kart[data-surum="normal"] .ks-kart-ust { color: #2d6cdf; }
.ks-kart[data-surum="nft"] .ks-kart-ust { color: #c8892f; }
.ks-kart b { display: block; font-size: 19px; margin-bottom: 8px; }
.ks-kart span { display: block; font-size: 13.5px; line-height: 1.5; opacity: 0.7; }
#ks-geri { position: absolute; top: 22px; left: 22px; z-index: 3; background: #ffffffcc;
  border: none; border-radius: 10px; padding: 9px 16px; font-size: 14px; cursor: pointer;
  display: none; }
#karakter-secim.nft-secim #ks-geri { display: block; }
#ks-baslik { position: absolute; top: 24px; left: 0; right: 0; text-align: center;
  font-size: 20px; font-weight: 700; letter-spacing: 0.08em; }
#ks-baslik span { display: block; font-size: 12px; font-weight: 500; opacity: 0.6;
  letter-spacing: 0.14em; margin-top: 4px; }
.ks-ok { position: absolute; top: 50%; transform: translateY(-50%);
  width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer;
  background: #ffffffcc; color: #1a2740; font-size: 26px; line-height: 58px;
  box-shadow: 0 6px 18px #0002; transition: transform .12s, background .12s; }
.ks-ok:hover { background: #fff; transform: translateY(-50%) scale(1.06); }
#ks-sol { left: 5%; } #ks-sag { right: 5%; }
#ks-alt { position: absolute; left: 0; right: 0; bottom: 40px; text-align: center; }
#ks-ad { font-size: 26px; font-weight: 700; }
#ks-durum { margin-top: 6px; font-size: 15px; height: 22px; opacity: 0.85; }
#ks-nokta { display: flex; gap: 7px; justify-content: center; margin: 14px 0 18px; }
#ks-nokta i { width: 8px; height: 8px; border-radius: 50%; background: #1a274033; }
#ks-nokta i.on { background: #2d6cdf; }
#ks-sec { background: #17223a; color: #fff; border: none; border-radius: 14px;
  padding: 15px 46px; font-size: 17px; font-weight: 600; cursor: pointer;
  box-shadow: 0 8px 22px #17223a44; transition: transform .12s, opacity .12s; }
#ks-sec:hover { transform: scale(1.03); }
#ks-sec:disabled { opacity: 0.5; cursor: not-allowed; }
#ks-sec.kilitli { background: #c8892f; box-shadow: 0 8px 22px #c8892f55; }
#ks-bitti { display: none; margin-left: 10px; background: #ffffffd9; color: #17223a;
  border: none; border-radius: 14px; padding: 15px 34px; font-size: 16px; font-weight: 600;
  cursor: pointer; box-shadow: 0 6px 18px #0002; }
#karakter-secim.item-asamasi #ks-bitti { display: inline-block; }
/* Phones: tighter type, thumb-sized arrows kept clear of the edges, and the
   bottom block inside the safe area. */
@media (max-width: 600px) {
  #ks-surum { gap: 20px; padding: 18px; }
  #ks-surum-baslik { font-size: 18px; text-align: center; }
  #ks-surum-kartlar { gap: 12px; }
  .ks-kart { max-width: 44vw; padding: 18px 12px; border-radius: 16px; }
  .ks-kart-ust svg { width: 36px; height: 36px; }
  .ks-kart b { font-size: 15px; }
  .ks-kart span { font-size: 11.5px; }
  #ks-baslik { top: calc(env(safe-area-inset-top) + 15px); font-size: 15px; padding: 0 96px; }
  .ks-ok { width: 46px; height: 46px; font-size: 21px; line-height: 46px; }
  #ks-sol { left: 8px; } #ks-sag { right: 8px; }
  #ks-alt { bottom: calc(env(safe-area-inset-bottom) + 18px); }
  #ks-ad { font-size: 20px; }
  #ks-durum { font-size: 13px; }
  #ks-sec { padding: 13px 38px; font-size: 15px; }
  #ks-geri { top: calc(env(safe-area-inset-top) + 12px); left: 12px; }
}
`;

export function buildKarakterSecim({ ctx, onConfirm }) {
  if (typeof document === 'undefined') return { show() {}, hide() {} };

  const stil = document.createElement('style');
  stil.textContent = STIL;
  document.head.appendChild(stil);

  const kok = document.createElement('div');
  kok.id = 'karakter-secim';
  kok.innerHTML = `
    <div id="ks-surum">
      <div id="ks-surum-baslik">HOW DO YOU WANT TO PLAY?</div>
      <div id="ks-surum-kartlar">
        <button class="ks-kart" data-surum="normal">
          <div class="ks-kart-ust">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>
            </svg>
          </div>
          <b>Standard</b>
          <span>Jump in with a ready character. Free.</span>
        </button>
        <button class="ks-kart nft" data-surum="nft">
          <div class="ks-kart-ust">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 3h14l3 6-10 12L2 9z"/>
              <path d="M2 9h20"/>
              <path d="M8.5 3 6 9l6 12 6-12-2.5-6"/>
            </svg>
          </div>
          <b>NFT Edition</b>
          <span>Pick your character from the 67 collection. NFTs in your wallet unlock.</span>
        </button>
      </div>
    </div>
    <canvas id="ks-canvas"></canvas>
    <div id="ks-baslik">CHOOSE YOUR CHARACTER<span>Chosen once — saved to your account</span></div>
    <button class="ks-ok" id="ks-sol" aria-label="previous">‹</button>
    <button class="ks-ok" id="ks-sag" aria-label="next">›</button>
    <div id="ks-alt">
      <div id="ks-ad">—</div>
      <div id="ks-durum"></div>
      <div id="ks-nokta"></div>
      <button id="ks-sec">SELECT</button><button id="ks-bitti" type="button">DONE</button>
    </div>`;
  document.body.appendChild(kok);

  const canvas = kok.querySelector('#ks-canvas');
  const adEl = kok.querySelector('#ks-ad');
  const durumEl = kok.querySelector('#ks-durum');
  const noktaEl = kok.querySelector('#ks-nokta');
  const secBtn = kok.querySelector('#ks-sec');

  KARAKTERLER.forEach(() => {
    const i = document.createElement('i');
    noktaEl.appendChild(i);
  });

  // --- premium studio sahnesi ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.55, 4.7);
  camera.lookAt(0, 1.05, 0);

  // Environment map for real reflections on the podium and any glossy trim —
  // the difference between a plastic toy and a rendered product shot.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  // Three-point studio light: warm key with a soft shadow, cool rim behind for
  // a clean silhouette, low fill so the shadows never go black.
  const key = new THREE.DirectionalLight(0xfff3e2, 2.1);
  key.position.set(3.2, 5.4, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 18;
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4);
  rim.position.set(-3.5, 3.2, -4);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa2c0, 0.55));

  // The podium: a dark glossy disc that catches the environment, a soft cream
  // top the avatar stands on, and a thin glowing accent ring around it.
  const podium = new THREE.Group();
  const govde = new THREE.Mesh(
    new THREE.CylinderGeometry(1.28, 1.4, 0.42, 64),
    new THREE.MeshStandardMaterial({ color: 0x141b2b, roughness: 0.18, metalness: 0.85 }),
  );
  govde.position.y = 0.21; govde.receiveShadow = true;
  podium.add(govde);
  const kapak = new THREE.Mesh(
    new THREE.CylinderGeometry(1.16, 1.2, 0.12, 64),
    new THREE.MeshStandardMaterial({ color: 0xece5da, roughness: 0.55, metalness: 0.05 }),
  );
  kapak.position.y = 0.47; kapak.receiveShadow = true;
  podium.add(kapak);
  const halka = new THREE.Mesh(
    new THREE.TorusGeometry(1.29, 0.028, 16, 80),
    new THREE.MeshStandardMaterial({
      color: 0x2d6cdf, emissive: 0x2d6cdf, emissiveIntensity: 2.4, roughness: 0.4,
    }),
  );
  halka.rotation.x = Math.PI / 2; halka.position.y = 0.42;
  podium.add(halka);
  scene.add(podium);

  // A wide, soft floor that only takes shadow — grounds the avatar without a
  // hard edge, like a seamless studio sweep.
  const zemin = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.ShadowMaterial({ opacity: 0.22 }),
  );
  zemin.rotation.x = -Math.PI / 2;
  zemin.position.y = 0.02; zemin.receiveShadow = true;
  scene.add(zemin);

  const donenGrup = new THREE.Group();
  scene.add(donenGrup);
  const loader = new GLTFLoader();
  const onbellek = new Map();
  let aktifModel = null;

  function boyutlandir() {
    const w = kok.clientWidth || window.innerWidth;
    const h = kok.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function modelGoster(kar) {
    if (aktifModel) { donenGrup.remove(aktifModel); aktifModel = null; }
    if (!kar.dosya) {
      // Goril ana karakter — burada basit bir yer tutucu silueti gostermek
      // yerine, roster'daki ilk fRiENDSiES gibi yuklenemedigi icin bos gecilir;
      // isim/fiyat yine dogru. (Goril modeli hub'da yuklenir.)
      const yer = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.42, 0.9, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x6f5a44, roughness: 0.8 }),
      );
      yer.position.y = 1.05;
      donenGrup.add(yer);
      aktifModel = yer;
      return;
    }
    const url = `${FR_BASE}${kar.dosya}`;
    const yerlestir = (gltf) => {
      // fRiENDSiES are skinned; THREE's clone(true) does not rebind the
      // skeleton, so a cloned avatar renders collapsed or invisible. The picker
      // only ever shows one at a time, so the loaded scene is used directly and
      // simply re-parented when the choice changes.
      const m = gltf.scene;
      // The fit must be idempotent: the same cached object can be shown again
      // (e.g. after a purchase refresh), so clear any transform from a previous
      // show before measuring — otherwise we'd measure an already-scaled model
      // and the fit would compound, throwing the avatar out of frame.
      m.scale.setScalar(1);
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m);
      const h = box.max.y - box.min.y || 1;
      const s = 1.7 / h;
      m.scale.setScalar(s);
      const merkez = box.getCenter(new THREE.Vector3());
      m.position.set(-merkez.x * s, -box.min.y * s + 0.28, -merkez.z * s);
      donenGrup.add(m);
      aktifModel = m;
    };
    if (onbellek.has(url)) { yerlestir(onbellek.get(url)); return; }
    loader.load(url, (gltf) => {
      onbellek.set(url, gltf);
      // yalnizca hala bu karakter aktifse goster
      if (KARAKTERLER[indeks].dosya === kar.dosya) yerlestir(gltf);
    });
  }

  // --- durum ---
  let indeks = 0;
  let asama = 'karakter';   // 'karakter' -> 'item'
  let itemIndeks = 0;
  const bittiBtn = kok.querySelector('#ks-bitti');

  const itemSahipleri = () => ctx?.save?.get?.('ownedCosmetics', []) || [];
  const itemGiyilenler = () => ({
    hat: null, glasses: null, backpack: null,
    ...(ctx?.save?.get?.('equippedCosmetics', {}) || {}),
  });
  const SLOT_AD = { hat: 'Hat', glasses: 'Glasses', backpack: 'Backpack' };

  function itemGoster(def) {
    if (aktifModel) { donenGrup.remove(aktifModel); aktifModel = null; }
    const grup = def.build(THREE);
    const kutu = new THREE.Box3().setFromObject(grup);
    const merkez = kutu.getCenter(new THREE.Vector3());
    const boy = kutu.getSize(new THREE.Vector3());
    const olcek = 1.15 / Math.max(boy.x, boy.y, boy.z, 0.2);
    grup.scale.setScalar(olcek);
    grup.position.set(-merkez.x * olcek, -kutu.min.y * olcek + 0.72, -merkez.z * olcek);
    donenGrup.add(grup);
    aktifModel = grup;
  }

  function noktalariKur(adet) {
    noktaEl.innerHTML = '';
    for (let i = 0; i < adet; i += 1) noktaEl.appendChild(document.createElement('i'));
  }
  const kayitliSahip = (kar) => kar.fiyat === 0 || (ctx?.save?.get?.('sahipKarakterler', []) || []).includes(kar.id);
  const sahipMi = (kar) => HERSEY_UCRETSIZ || kayitliSahip(kar);

  function tazele() {
    if (asama === 'item') {
      const def = COSMETICS[itemIndeks];
      const giyili = itemGiyilenler()[def.slot] === def.id;
      adEl.textContent = def.name;
      [...noktaEl.children].forEach((n, i) => n.classList.toggle('on', i === itemIndeks));
      durumEl.textContent = giyili
        ? `${SLOT_AD[def.slot]} — equipped`
        : `${SLOT_AD[def.slot]} — free during the trial`;
      secBtn.textContent = giyili ? 'REMOVE' : 'WEAR';
      secBtn.classList.toggle('kilitli', !giyili);
      secBtn.disabled = false;
      itemGoster(def);
      return;
    }
    const kar = KARAKTERLER[indeks];
    adEl.textContent = kar.ad;
    [...noktaEl.children].forEach((n, i) => n.classList.toggle('on', i === indeks));
    if (sahipMi(kar)) {
      durumEl.textContent = kar.fiyat === 0 ? 'Unlocked'
        : (kayitliSahip(kar) ? 'Owned' : 'Free — trial');
      secBtn.textContent = 'SELECT';
      secBtn.classList.remove('kilitli');
      secBtn.disabled = false;
    } else {
      durumEl.textContent = `Locked — ${kar.fiyat} coins`;
      secBtn.textContent = `BUY (${kar.fiyat})`;
      secBtn.classList.add('kilitli');
      secBtn.disabled = false;
    }
    modelGoster(kar);
  }

  function git(yon) {
    if (asama === 'item') {
      itemIndeks = (itemIndeks + yon + COSMETICS.length) % COSMETICS.length;
    } else {
      indeks = (indeks + yon + KARAKTERLER.length) % KARAKTERLER.length;
    }
    tazele();
  }

  kok.querySelector('#ks-sol').addEventListener('click', () => git(-1));
  kok.querySelector('#ks-sag').addEventListener('click', () => git(1));

  // kaydirma (dokunmatik + fare)
  let baslangicX = null;
  const bas = (x) => { baslangicX = x; };
  const birak = (x) => {
    if (baslangicX == null) return;
    const dx = x - baslangicX;
    if (Math.abs(dx) > 45) git(dx < 0 ? 1 : -1);
    baslangicX = null;
  };
  canvas.addEventListener('pointerdown', (e) => bas(e.clientX));
  canvas.addEventListener('pointerup', (e) => birak(e.clientX));

  secBtn.addEventListener('click', () => {
    if (asama === 'item') {
      const def = COSMETICS[itemIndeks];
      const giyilen = itemGiyilenler();
      if (giyilen[def.slot] === def.id) {
        giyilen[def.slot] = null;
      } else {
        giyilen[def.slot] = def.id;
        const sahip = itemSahipleri();
        if (!sahip.includes(def.id)) ctx?.save?.set?.('ownedCosmetics', [...sahip, def.id]);
      }
      ctx?.save?.set?.('equippedCosmetics', giyilen);
      tazele();
      return;
    }
    const kar = KARAKTERLER[indeks];
    if (!sahipMi(kar)) {
      const sahip = ctx?.save?.get?.('sahipKarakterler', []) || [];
      if (!sahip.includes(kar.id)) ctx?.save?.set?.('sahipKarakterler', [...sahip, kar.id]);
      tazele();
      return;
    }
    // Character locked in; the same stage now browses the wardrobe.
    ctx?.save?.set?.('equipped', kar.id);
    asama = 'item';
    itemIndeks = 0;
    kok.classList.add('item-asamasi');
    kok.querySelector('#ks-baslik').firstChild.textContent = 'PICK YOUR ITEMS';
    noktalariKur(COSMETICS.length);
    tazele();
  });

  bittiBtn.addEventListener('click', () => {
    const kar = KARAKTERLER[indeks];
    ctx?.save?.set?.('karakterSecildi', true);
    hide();
    onConfirm?.(kar.id);
  });

  let calisiyor = false;
  const clock = new THREE.Clock();
  function dongu() {
    if (!calisiyor) return;
    requestAnimationFrame(dongu);
    donenGrup.rotation.y += clock.getDelta() * 0.6;
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => { if (calisiyor) boyutlandir(); });

  // --- surum secimi (Normal / NFT), oyunun ilk adimi ---
  function nftPickeriBaslat() {
    kok.classList.remove('surum');
    kok.classList.add('nft-secim');
    calisiyor = true;
    boyutlandir();
    const kayitli = ctx?.save?.get?.('equipped', null);
    const bulunan = KARAKTERLER.findIndex((k) => k.id === kayitli);
    indeks = bulunan >= 0 ? bulunan : 1;   // 0 = goril (normal), NFT tarafinda ilk fRiENDSiES
    tazele();
    clock.getDelta();
    dongu();
  }
  kok.querySelectorAll('[data-surum]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const surum = btn.dataset.surum;
      ctx?.save?.set?.('oyunSurumu', surum);
      // Both editions choose on the same premium stage now — Oscar's call:
      // the Standard path picks a character and items too.
      nftPickeriBaslat();
    });
  });
  // geri: NFT secimden surum secimine don
  const geriBtn = document.createElement('button');
  geriBtn.id = 'ks-geri';
  geriBtn.textContent = '‹ Back';
  kok.appendChild(geriBtn);
  geriBtn.addEventListener('click', () => {
    calisiyor = false;
    kok.classList.remove('nft-secim');
    kok.classList.add('surum');
  });

  function show() {
    kok.classList.add('on', 'surum');
    kok.classList.remove('nft-secim', 'item-asamasi');
    asama = 'karakter';
    kok.querySelector('#ks-baslik').firstChild.textContent = 'CHOOSE YOUR CHARACTER';
    noktalariKur(KARAKTERLER.length);
    calisiyor = false;   // surum ekraninda 3B donmez; secim yapilinca baslar
  }
  function hide() {
    kok.classList.remove('on', 'surum', 'nft-secim');
    calisiyor = false;
  }

  return { show, hide, el: kok };
}
