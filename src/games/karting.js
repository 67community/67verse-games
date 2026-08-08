// karting.js — Kart 67: a first-person kart race.
//
// Oscar's brief: karting is not a prop on the park map, it is its own mini
// game — you sit IN the kart, see the track from the cockpit, steer, and race.
// The track follows the mini-game style reference (design/referans-mekanlar/
// minigame-pist-stili.png): cream rounded kerb walls, soft pastel obstacles,
// a checkered finish gate and toy trees on a warm plain.
//
// Same shell contract as tag/balloon: registerGame + mount(ctx) returning
// { unmount }; the scene/camera are handed to the main loop via ctx.view.
//
// The sim is deliberately simple and readable: every kart is a point on a
// sampled centreline loop with lateral freedom; laps and placements come from
// progress along that loop. Rivals steer at a lookahead point with a light
// rubber band so a race stays a race.

import { createCloudSea, createSkyDome, SKY_LOW } from '../core/sky.js';
import { registerGame } from '../core/registry.js';
import { commitLocalGameReward } from '../core/game-result.js';

// ---------- Track geometry (stadium loop) ----------
// Sized like a real outdoor kart circuit: long straights you can wind up on,
// wide sweeping caps — Oscar asked for a big field and a real karting feel.
const STRAIGHT = 34;      // half-length of each straight
const RADIUS = 21;        // end-cap radius
const WIDTH = 7.5;        // asphalt width
const SAMPLES = 240;      // centreline resolution

function centrelinePoint(t, out) {
  // t in [0,1) around a stadium: right straight up, top cap, left straight
  // down, bottom cap. Perimeter pieces sized by true length so speed reads
  // constant everywhere.
  const capLen = Math.PI * RADIUS;
  const total = 4 * STRAIGHT + 2 * capLen;
  let d = t * total;
  if (d < 2 * STRAIGHT) {                      // right straight, -z to +z
    out.set(RADIUS, 0, -STRAIGHT + d);
    return out;
  }
  d -= 2 * STRAIGHT;
  if (d < capLen) {                            // top cap
    const a = d / RADIUS;
    out.set(RADIUS * Math.cos(a), 0, STRAIGHT + RADIUS * Math.sin(a));
    return out;
  }
  d -= capLen;
  if (d < 2 * STRAIGHT) {                      // left straight, +z to -z
    out.set(-RADIUS, 0, STRAIGHT - d);
    return out;
  }
  d -= 2 * STRAIGHT;
  const a = d / RADIUS;                        // bottom cap
  out.set(-RADIUS * Math.cos(a), 0, -STRAIGHT - RADIUS * Math.sin(a));
  return out;
}

// ---------- Kart mesh ----------
function buildKart(T, color, { driver = true } = {}) {
  // DoubleSide: the cockpit camera sits inside the kart's own shell, and
  // culled back faces read as black holes from the seat.
  const mat = (c, extra = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.06, side: T.DoubleSide, ...extra });
  const g = new T.Group();
  const tub = new T.Mesh(new T.BoxGeometry(1.04, 0.34, 1.9), mat(color));
  tub.position.y = 0.34;
  const nose = new T.Mesh(new T.BoxGeometry(0.7, 0.22, 0.5), mat(color));
  nose.position.set(0, 0.3, 1.12);
  const bumper = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.98, 10), mat(0xf6f1e7));
  bumper.rotation.z = Math.PI / 2;
  bumper.position.set(0, 0.3, 1.4);
  const seatBack = new T.Mesh(new T.BoxGeometry(0.78, 0.5, 0.16), mat(0x2c2f38, { roughness: 0.7 }));
  seatBack.position.set(0, 0.68, -0.62);
  const wing = new T.Mesh(new T.BoxGeometry(1.06, 0.08, 0.3), mat(0xf6f1e7));
  wing.position.set(0, 0.72, -0.98);
  g.add(tub, nose, bumper, seatBack, wing);

  const wheelGeo = new T.CylinderGeometry(0.26, 0.26, 0.22, 14);
  const wheelMat = mat(0x2c2f38, { roughness: 0.85 });
  const hubMat = mat(0xf6f1e7);
  const wheels = [];
  for (const [sx, sz] of [[-0.62, 0.72], [0.62, 0.72], [-0.62, -0.66], [0.62, -0.66]]) {
    const w = new T.Group();
    const tire = new T.Mesh(wheelGeo, wheelMat);
    tire.rotation.z = Math.PI / 2;
    const hub = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.24, 10), hubMat);
    hub.rotation.z = Math.PI / 2;
    w.add(tire, hub);
    w.position.set(sx, 0.26, sz);
    g.add(w);
    wheels.push({ group: w, front: sz > 0 });
  }

  // Steering column + wheel — what the cockpit camera actually sees. The
  // group carries the wheel's place and tilt so steering spins the rim about
  // its own axle instead of orbiting the kart origin.
  const column = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.42, 8), mat(0x2c2f38));
  column.rotation.x = Math.PI / 3.2;
  column.position.set(0, 0.66, 0.42);
  const wheelGroup = new T.Group();
  wheelGroup.position.set(0, 0.78, 0.30);
  wheelGroup.rotation.x = Math.PI / 3.2;
  const rim = new T.Mesh(new T.TorusGeometry(0.185, 0.04, 10, 22), mat(0x2c2f38, { roughness: 0.4 }));
  const spoke = new T.Mesh(new T.BoxGeometry(0.33, 0.045, 0.045), mat(0xf6f1e7));
  wheelGroup.add(rim, spoke);
  g.add(column, wheelGroup);

  let driverParts = null;
  if (driver) {
    const body = new T.Mesh(new T.CapsuleGeometry(0.26, 0.34, 6, 12), mat(0xf6f1e7));
    body.position.set(0, 0.72, -0.32);
    const helmet = new T.Mesh(new T.SphereGeometry(0.27, 16, 12), mat(color, { roughness: 0.25 }));
    helmet.position.set(0, 1.12, -0.32);
    const visor = new T.Mesh(new T.SphereGeometry(0.22, 12, 8, -Math.PI / 3.2, Math.PI / 1.6, Math.PI / 3.4, Math.PI / 3.4), mat(0x2c2f38, { roughness: 0.2 }));
    visor.position.copy(helmet.position);
    visor.position.z += 0.02;
    g.add(body, helmet, visor);
    driverParts = { body, helmet, visor };
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, wheelGroup, driverParts };
}

registerGame({
  id: 'karting',
  name: 'Kart 67',
  hint: 'First-person kart race',
  color: 0x5a9cd8,

  mount(ctx, opts = {}) {
    const T = ctx.THREE;
    const query = new URLSearchParams(location.search);
    const qaRun = query.get('qa') === '1';
    const TOTAL_LAPS = qaRun ? 1 : 3;

    // ---------- Scene ----------
    const scene = new T.Scene();
    scene.add(createSkyDome(T));
    scene.add(createCloudSea(T, { layout: 'radial', radius: 96, seed: 670707 }));
    scene.fog = new T.Fog(SKY_LOW, 60, 170);
    // far must clear the sky dome's far side (r=300 around the origin) from
    // anywhere on the track, or the dome clips into a black hole ahead.
    const camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 520);

    scene.add(new T.HemisphereLight(0xfff2de, 0xd8c4a8, 0.95));
    const sun = new T.DirectionalLight(0xffe2b8, 1.45);
    sun.position.set(26, 34, 14);
    const lowTier = ctx.quality.getState().tier === 'low';
    if (!lowTier) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
      sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 110;
      sun.shadow.bias = -0.0006;
    }
    scene.add(sun);

    const disposables = [];
    const keep = (obj) => {
      obj.traverse?.((o) => {
        if (o.geometry) disposables.push(o.geometry);
        if (o.material) disposables.push(...(Array.isArray(o.material) ? o.material : [o.material]));
      });
      return obj;
    };

    // ---------- Ground + road ----------
    const ground = new T.Mesh(
      new T.CircleGeometry(150, 48),
      new T.MeshStandardMaterial({ color: 0xf3ede1, roughness: 0.96 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(keep(ground));

    // Road ring: a triangle strip between the inner and outer edge of the
    // centreline. Slightly deeper cream than the plain, like the reference.
    const centre = [];
    {
      const p = new T.Vector3();
      for (let i = 0; i < SAMPLES; i++) {
        centrelinePoint(i / SAMPLES, p);
        centre.push(p.clone());
      }
    }
    const tangentOf = (i) => {
      const a = centre[(i + 1) % SAMPLES];
      const b = centre[(i - 1 + SAMPLES) % SAMPLES];
      return new T.Vector3().subVectors(a, b).normalize();
    };
    const normalOf = (i) => {
      const t = tangentOf(i);
      return new T.Vector3(-t.z, 0, t.x); // left-hand normal
    };
    function buildRing(halfInner, halfOuter, y, color, roughness = 0.92) {
      const positions = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const idx = i % SAMPLES;
        const n = normalOf(idx);
        const c = centre[idx];
        positions.push(
          c.x + n.x * halfInner, y, c.z + n.z * halfInner,
          c.x + n.x * halfOuter, y, c.z + n.z * halfOuter,
        );
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      const index = [];
      for (let i = 0; i < SAMPLES; i++) {
        const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
        index.push(a, b, c2, b, d, c2);
      }
      geo.setIndex(index);
      geo.computeVertexNormals();
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color, roughness }));
      mesh.receiveShadow = true;
      return keep(mesh);
    }
    // Real asphalt, per the video reference: a warm dark grey ribbon with a
    // soft shoulder, solid white edge lines and a dashed centre line — the
    // road reads as a road, not a painted band.
    scene.add(buildRing(-WIDTH / 2 - 0.5, WIDTH / 2 + 0.5, -0.005, 0xb9b3a6, 0.95)); // shoulder
    scene.add(buildRing(-WIDTH / 2, WIDTH / 2, 0, 0x83868c, 0.96));                  // asphalt
    scene.add(buildRing(-WIDTH / 2 + 0.16, -WIDTH / 2 + 0.30, 0.012, 0xf2efe8, 0.85));
    scene.add(buildRing(WIDTH / 2 - 0.30, WIDTH / 2 - 0.16, 0.012, 0xf2efe8, 0.85));
    {
      // Dashed centre line: short instanced strips along the loop.
      const cizgiGeo = new T.BoxGeometry(0.14, 0.015, 1.5);
      const cizgiMat = new T.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.85 });
      disposables.push(cizgiGeo, cizgiMat);
      const adet = Math.floor(SAMPLES / 6);
      const cizgiler = new T.InstancedMesh(cizgiGeo, cizgiMat, adet);
      const yerlestirici = new T.Object3D();
      for (let i = 0; i < adet; i += 1) {
        const idx = i * 6;
        const t = tangentOf(idx);
        yerlestirici.position.set(centre[idx].x, 0.012, centre[idx].z);
        yerlestirici.rotation.set(0, Math.atan2(t.x, t.z), 0);
        yerlestirici.updateMatrix();
        cizgiler.setMatrixAt(i, yerlestirici.matrix);
      }
      cizgiler.instanceMatrix.needsUpdate = true;
      scene.add(cizgiler);
    }

    // ---------- Kerb walls (instanced rounded studs, cream) ----------
    const kerbGeo = new T.CapsuleGeometry(0.34, 0.5, 4, 10);
    kerbGeo.rotateZ(Math.PI / 2); // lie along tangent
    const kerbMat = new T.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.7 });
    disposables.push(kerbGeo, kerbMat);
    const STEP = 2;
    const kerbCount = Math.ceil(SAMPLES / STEP);
    const kerbs = new T.InstancedMesh(kerbGeo, kerbMat, kerbCount * 2);
    const placer = new T.Object3D();
    let ki = 0;
    for (let i = 0; i < SAMPLES; i += STEP) {
      const n = normalOf(i);
      const t = tangentOf(i);
      const yaw = Math.atan2(t.x, t.z);
      for (const side of [-1, 1]) {
        const off = (WIDTH / 2 + 0.42) * side;
        placer.position.set(centre[i].x + n.x * off, 0.3, centre[i].z + n.z * off);
        placer.rotation.set(0, yaw + Math.PI / 2, 0);
        placer.updateMatrix();
        kerbs.setMatrixAt(ki++, placer.matrix);
      }
    }
    kerbs.instanceMatrix.needsUpdate = true;
    kerbs.castShadow = !lowTier;
    scene.add(kerbs);

    // ---------- Start gate: cream posts, pink beams, checkered banner ----------
    const startIdx = 0; // right straight, heading +z
    {
      const gate = new T.Group();
      const n = normalOf(startIdx);
      const c = centre[startIdx];
      const postGeo = new T.CylinderGeometry(0.3, 0.34, 4.6, 12);
      const postMat = new T.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.7 });
      for (const side of [-1, 1]) {
        const post = new T.Mesh(postGeo, postMat);
        post.position.set(c.x + n.x * (WIDTH / 2 + 0.8) * side, 2.3, c.z + n.z * (WIDTH / 2 + 0.8) * side);
        gate.add(post);
      }
      const checker = document.createElement('canvas');
      checker.width = 128; checker.height = 16;
      const cx = checker.getContext('2d');
      for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
        cx.fillStyle = (x + y) % 2 ? '#2e2e34' : '#f5f2ea';
        cx.fillRect(x * 8, y * 8, 8, 8);
      }
      const checkerTex = new T.CanvasTexture(checker);
      checkerTex.colorSpace = T.SRGBColorSpace;
      const bannerW = WIDTH + 1.6;
      const banner = new T.Mesh(
        new T.BoxGeometry(bannerW, 0.72, 0.1),
        new T.MeshStandardMaterial({ map: checkerTex, roughness: 0.8 }),
      );
      banner.position.set(c.x, 3.6, c.z);
      const beamGeo = new T.BoxGeometry(bannerW, 0.2, 0.14);
      const beamMat = new T.MeshStandardMaterial({ color: 0xe98a97, roughness: 0.6 });
      const beamTop = new T.Mesh(beamGeo, beamMat);
      beamTop.position.set(c.x, 4.06, c.z);
      const beamBottom = new T.Mesh(beamGeo, beamMat);
      beamBottom.position.set(c.x, 3.14, c.z);
      // The whole gate faces along the track (start is on the +z-heading straight).
      banner.rotation.y = beamTop.rotation.y = beamBottom.rotation.y = Math.PI / 2;
      gate.add(banner, beamTop, beamBottom);
      // Painted start line on the asphalt.
      const line = new T.Mesh(
        new T.PlaneGeometry(WIDTH, 0.8),
        new T.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.85 }),
      );
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = Math.PI / 2;
      line.position.set(c.x, 0.015, c.z);
      gate.add(line);
      gate.traverse((o) => { if (o.isMesh) o.castShadow = !lowTier; });
      scene.add(keep(gate));
    }

    // ---------- Toy trees outside the track ----------
    {
      const trunkGeo = new T.CylinderGeometry(0.16, 0.2, 0.5, 8);
      const crownGeo = new T.ConeGeometry(0.85, 1.5, 9);
      const trunkMat = new T.MeshStandardMaterial({ color: 0x8a6a4f, roughness: 0.9 });
      const crownMat = new T.MeshStandardMaterial({ color: 0x86b07a, roughness: 0.85 });
      disposables.push(trunkGeo, crownGeo, trunkMat, crownMat);
      const trees = new T.Group();
      for (let i = 0; i < 16; i++) {
        const idx = Math.floor((i / 16) * SAMPLES);
        const n = normalOf(idx);
        const c = centre[idx];
        const side = i % 2 ? 1 : -1;
        const dist = WIDTH / 2 + 3.4 + (i % 3) * 1.3;
        const trunk = new T.Mesh(trunkGeo, trunkMat);
        const crown = new T.Mesh(crownGeo, crownMat);
        const x = c.x + n.x * dist * side;
        const z = c.z + n.z * dist * side;
        trunk.position.set(x, 0.25, z);
        crown.position.set(x, 1.35, z);
        crown.castShadow = !lowTier;
        trees.add(trunk, crown);
      }
      scene.add(trees); // shared geos already tracked
    }

    // ---------- Karts ----------
    const KART_COLORS = [0x5a9cd8, 0xe98a97, 0xe8b64a, 0x7fbf8e];
    const NAMES = ['You', 'Rival Rose', 'Rival Sun', 'Rival Mint'];
    const karts = [];
    for (let i = 0; i < 4; i++) {
      const isPlayer = i === 0;
      const built = buildKart(T, KART_COLORS[i], { driver: !isPlayer });
      keep(built.group);
      scene.add(built.group);
      // Grid: two columns just behind the start line, player at the front row.
      const row = Math.floor(i / 2), col = i % 2;
      const gridIdx = (SAMPLES - 3 - row * 4 + SAMPLES) % SAMPLES;
      const n = normalOf(gridIdx);
      const c = centre[gridIdx];
      const lateral = (col === 0 ? -1.5 : 1.5);
      karts.push({
        name: NAMES[i],
        isPlayer,
        built,
        pos: new T.Vector3(c.x + n.x * lateral, 0, c.z + n.z * lateral),
        heading: Math.atan2(tangentOf(gridIdx).x, tangentOf(gridIdx).z),
        speed: 0,
        steer: 0,
        idx: gridIdx,          // nearest centreline sample
        // The grid sits BEHIND the line, so everyone starts on lap -1: the
        // opening crossing arms lap 0 (racing lap 1) instead of finishing.
        lap: -1,
        progress: 0,           // lap * SAMPLES + idx, for placement
        finished: false,
        finishTime: 0,
        laneOffset: isPlayer ? 0 : (i - 2) * 1.15,  // rivals hold staggered lines
        wander: Math.random() * Math.PI * 2,
        topSpeed: 19.6 + (isPlayer ? 0 : (i * 0.25) - 0.4),
      });
    }

    // ---------- HUD ----------
    const hud = document.createElement('div');
    hud.id = 'karting-hud';
    hud.innerHTML = `
      <style>
        #karting-hud { position: fixed; inset: 0; pointer-events: none; z-index: 40;
          font-family: inherit; color: #17223a; }
        #karting-hud .kh-chip { position: absolute; background: #ffffffd9; border-radius: 12px;
          padding: 9px 16px; font-weight: 700; font-size: 15px; letter-spacing: 0.04em;
          box-shadow: 0 6px 18px #0002; }
        #kh-lap { top: 18px; left: 50%; transform: translateX(-50%); }
        #kh-pos { top: 18px; right: 18px; }
        #kh-speed { bottom: 20px; right: 18px; font-variant-numeric: tabular-nums; }
        #kh-center { position: absolute; top: 34%; left: 0; right: 0; text-align: center;
          font-size: 84px; font-weight: 800; color: #fff;
          text-shadow: 0 6px 26px #0005; letter-spacing: 0.04em; }
        #kh-wrong { position: absolute; top: 22%; left: 0; right: 0; text-align: center;
          font-size: 22px; font-weight: 700; color: #b8503c; opacity: 0;
          transition: opacity .2s; text-shadow: 0 2px 12px #fff8; }
      </style>
      <div class="kh-chip" id="kh-lap">LAP 1/${TOTAL_LAPS}</div>
      <div class="kh-chip" id="kh-time" style="top:18px;left:18px;font-variant-numeric:tabular-nums;">0:00.0</div>
      <div class="kh-chip" id="kh-pos">4/4</div>
      <div class="kh-chip" id="kh-speed">0 km/h</div>
      <div id="kh-center"></div>
      <div id="kh-wrong">Wrong way</div>`;
    document.body.appendChild(hud);
    const lapEl = hud.querySelector('#kh-lap');
    const timeEl = hud.querySelector('#kh-time');
    const posEl = hud.querySelector('#kh-pos');
    const speedEl = hud.querySelector('#kh-speed');
    const centerEl = hud.querySelector('#kh-center');
    const wrongEl = hud.querySelector('#kh-wrong');
    const clockText = (s) => {
      const m = Math.floor(s / 60);
      return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
    };

    // ---------- Race state ----------
    let ended = false;
    let departed = false;
    let raceTime = 0;
    let countdown = 3.6;       // 3-2-1-GO
    let started = false;
    let resultShown = false;
    const autoThrottle = ctx.input.isTouchDevice || qaRun;

    const nearestIdx = (kart) => {
      // Local search around the previous nearest sample — the loop never jumps.
      let best = kart.idx, bestD = Infinity;
      for (let o = -6; o <= 6; o++) {
        const i = (kart.idx + o + SAMPLES) % SAMPLES;
        const d = kart.pos.distanceToSquared(centre[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };

    const fwd = new T.Vector3();
    const toPoint = new T.Vector3();

    function stepKart(kart, dt, input) {
      const ACCEL = 11.5, DRAG = 0.55, BRAKE = 14;
      let throttle = input.throttle, brake = input.brake;
      if (!started) { throttle = 0; brake = 1; }
      kart.speed += (throttle * ACCEL - DRAG - (kart.speed * kart.speed) * 0.021) * dt;
      if (brake > 0) kart.speed -= BRAKE * brake * dt;
      kart.speed = Math.max(0, Math.min(kart.speed, kart.topSpeed));

      const steerMax = 0.85;
      kart.steer += (T.MathUtils.clamp(input.steer, -1, 1) * steerMax - kart.steer) * Math.min(1, dt * 7);
      // Steering authority scales down with speed a touch, like a real kart.
      const turnRate = kart.steer * (1.6 - Math.min(kart.speed / kart.topSpeed, 1) * 0.5);
      kart.heading -= turnRate * dt * Math.min(kart.speed / 2.2, 1);

      fwd.set(Math.sin(kart.heading), 0, Math.cos(kart.heading));
      kart.pos.addScaledVector(fwd, kart.speed * dt);

      // Track containment: lateral clamp against the kerbs.
      kart.idx = nearestIdx(kart);
      const n = normalOf(kart.idx);
      toPoint.subVectors(kart.pos, centre[kart.idx]);
      const lat = toPoint.x * n.x + toPoint.z * n.z;
      const latMax = WIDTH / 2 - 0.62;
      if (Math.abs(lat) > latMax) {
        const over = lat - Math.sign(lat) * latMax;
        kart.pos.addScaledVector(n, -over);
        kart.speed *= (1 - Math.min(0.9, Math.abs(over)) * 0.16);
      }

      // Lap + progress. A wrap from the last samples to the first few is a lap.
      const prev = kart.prevIdx ?? kart.idx;
      if (prev > SAMPLES - 12 && kart.idx < 12) {
        kart.lap += 1;
        if (kart.isPlayer && started && kart.lap > 0 && kart.lap < TOTAL_LAPS) {
          lapEl.textContent = `LAP ${kart.lap + 1}/${TOTAL_LAPS}`;
        }
        if (kart.lap >= TOTAL_LAPS && !kart.finished) {
          kart.finished = true;
          kart.finishTime = raceTime;
        }
      } else if (prev < 12 && kart.idx > SAMPLES - 12) {
        kart.lap -= 1; // reversed over the line
      }
      kart.prevIdx = kart.idx;
      kart.progress = kart.lap * SAMPLES + kart.idx;

      // Visual pose
      const g = kart.built.group;
      g.position.copy(kart.pos);
      g.rotation.y = kart.heading;
      for (const w of kart.built.wheels) {
        w.group.rotation.x += kart.speed * dt * 3.4;
        if (w.front) w.group.rotation.y = kart.steer * 0.55;
      }
      kart.built.wheelGroup.rotation.z = -kart.steer * 1.6;
    }

    function rivalInput(kart, playerProgress) {
      // Aim at a lookahead point offset by the rival's preferred lane plus a
      // slow wander, brake for the caps, rubber-band around the player.
      kart.wander += 0.008;
      const look = 7 + Math.floor(kart.speed * 0.55);
      const li = (kart.idx + look) % SAMPLES;
      const n = normalOf(li);
      const lane = kart.laneOffset + Math.sin(kart.wander) * 0.5;
      const target = toPoint.set(
        centre[li].x + n.x * lane, 0, centre[li].z + n.z * lane,
      );
      const dx = target.x - kart.pos.x, dz = target.z - kart.pos.z;
      const desired = Math.atan2(dx, dz);
      let err = desired - kart.heading;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;

      // Corner awareness: on the caps the tangent turns fast, so ease off.
      const straight = Math.abs(centre[kart.idx].x) > RADIUS - 0.5 && Math.abs(centre[kart.idx].z) < STRAIGHT;
      let throttle = straight ? 1 : 0.62;
      const gap = playerProgress - kart.progress;
      if (gap > 18) throttle = Math.min(1, throttle + 0.22);       // catch up
      else if (gap < -24) throttle = Math.max(0.45, throttle - 0.18); // ease up
      // heading -= steer*k in stepKart, so steering TOWARD the error means
      // feeding the NEGATED error.
      return { steer: T.MathUtils.clamp(-err * 2.2, -1, 1), throttle, brake: 0 };
    }

    // Kart-vs-kart: gentle radial separation, arcade style.
    function separateKarts(dt) {
      for (let a = 0; a < karts.length; a++) {
        for (let b = a + 1; b < karts.length; b++) {
          const A = karts[a], B = karts[b];
          const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z;
          const d2 = dx * dx + dz * dz;
          const min = 2.05;
          if (d2 > min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const ux = dx / d, uz = dz / d;
          A.pos.x -= ux * push; A.pos.z -= uz * push;
          B.pos.x += ux * push; B.pos.z += uz * push;
          A.speed *= 0.985; B.speed *= 0.985;
        }
      }
    }

    function placements() {
      return [...karts].sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return b.progress - a.progress;
      });
    }

    function showResults() {
      resultShown = true;
      const order = placements();
      const place = order.indexOf(karts[0]) + 1;
      const coins = [60, 40, 25, 15][place - 1] ?? 15;
      const result = commitLocalGameReward(ctx.save, {
        gameId: 'karting',
        placement: place,
        coins,
        score: Math.round(karts[0].finishTime * 1000),
      }, 'karting-race');
      if (!result.rewardCommitted) {
        ctx.ui.toast('Coins could not be saved on this device.');
      }
      const p = ctx.ui.panel({ title: 'Race complete' });
      const headline = document.createElement('p');
      headline.style.cssText = 'font-size:20px;font-weight:700;margin:0 0 12px;';
      headline.textContent = place === 1 ? 'P1 — you won the race' : `P${place} — nice driving`;
      p.body.appendChild(headline);
      const list = document.createElement('ol');
      list.style.cssText = 'margin:0 0 16px;padding-left:22px;line-height:1.9;font-size:15px;';
      for (const k of order) {
        const li = document.createElement('li');
        const time = k.finished ? `${k.finishTime.toFixed(2)}s` : 'running';
        li.textContent = `${k.name} — ${time}`;
        if (k.isPlayer) li.style.fontWeight = '700';
        list.appendChild(li);
      }
      p.body.appendChild(list);
      const reward = document.createElement('p');
      reward.style.cssText = 'margin:0 0 14px;color:#6b7280;font-size:13.5px;';
      reward.textContent = `+${coins} coins`;
      p.body.appendChild(reward);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;';
      row.appendChild(ctx.ui.button('Back to 67 Park', () => {
        if (departed) return;
        departed = true;
        p.close();
        ctx.goHome(result);
      }, { primary: true }));
      row.appendChild(ctx.ui.button('Race again', () => {
        if (departed) return;
        departed = true;
        p.close();
        ctx.replayGame?.('karting', result);
      }));
      p.body.appendChild(row);
    }

    // ---------- Cockpit camera ----------
    const camBase = new T.Vector3();
    function placeCamera(dt) {
      const player = karts[0];
      const g = player.built.group;
      // Seat position, just behind the wheel; the kart nose stays in frame.
      camBase.set(0, 1.16, -0.06).applyAxisAngle(new T.Vector3(0, 1, 0), player.heading).add(player.pos);
      camera.position.lerp(camBase, Math.min(1, dt * 22));
      const lookAhead = fwd.set(
        Math.sin(player.heading), 0.085, Math.cos(player.heading),
      ).multiplyScalar(8).add(player.pos);
      lookAhead.y += 0.6;
      camera.lookAt(lookAhead);
      // Speed reads as a gentle FOV kick.
      const target = 66 + (player.speed / player.topSpeed) * 9;
      camera.fov += (target - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }

    // ---------- Loop ----------
    // RAF timestamps, not THREE.Clock (deprecated in this three build). The
    // delta is clamped so a background pause cannot teleport the race.
    let raf = 0;
    let lastNow = 0;
    function frame(now = 0) {
      if (ended) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(lastNow ? (now - lastNow) / 1000 : 1 / 60, 0.05);
      lastNow = now;

      if (countdown > 0) {
        countdown -= dt;
        const n = Math.ceil(countdown - 0.6);
        centerEl.textContent = countdown <= 0.6 ? 'GO' : String(Math.max(1, n));
        if (countdown <= 0) {
          started = true;
          centerEl.textContent = '';
        }
      }

      if (started && !resultShown) raceTime += dt;

      // poll() speaks screen-space: mx (right +) is the steer, my (down +)
      // means W/up is NEGATIVE — forward throttle is -my. A QA run has no
      // hands at all, so the player kart drives itself like a rival.
      const pad = ctx.input.poll();
      const player = karts[0];
      const playerInput = qaRun ? rivalInput(player, player.progress) : {
        steer: pad.mx || 0,
        throttle: autoThrottle ? 0.92 : (pad.my < -0.05 ? -pad.my : 0),
        brake: pad.my > 0.05 ? pad.my : 0,
      };
      if (qaRun && Math.floor(raceTime) !== Math.floor(raceTime - dt)) {
        console.log('[kart-qa]', JSON.stringify({
          t: +raceTime.toFixed(1), speed: +player.speed.toFixed(1),
          x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1),
          heading: +player.heading.toFixed(2), lap: player.lap, idx: player.idx,
          camY: +camera.position.y.toFixed(2),
        }));
      }
      stepKart(player, dt, playerInput);
      for (let i = 1; i < karts.length; i++) {
        stepKart(karts[i], dt, rivalInput(karts[i], player.progress));
      }
      separateKarts(dt);

      // HUD
      const order = placements();
      posEl.textContent = `${order.indexOf(player) + 1}/4`;
      speedEl.textContent = `${Math.round(player.speed * 4)} km/h`;
      timeEl.textContent = clockText(raceTime);
      // Wrong-way hint: moving against the tangent.
      const t = tangentOf(player.idx);
      const facing = Math.sin(player.heading) * t.x + Math.cos(player.heading) * t.z;
      wrongEl.style.opacity = (started && facing < -0.35 && player.speed > 2) ? '1' : '0';

      placeCamera(dt);

      if (player.finished && !resultShown) showResults();
    }
    ctx.view.current = { scene, camera };
    frame();

    function unmount() {
      ended = true;
      cancelAnimationFrame(raf);
      hud.remove();
      for (const d of disposables) d.dispose?.();
      if (ctx.view.current && ctx.view.current.scene === scene) ctx.view.current = null;
    }
    return { unmount };
  },
});
