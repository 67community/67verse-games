// balloon.js — Balloon Battle (SPEC-GAME §7).
// Battle-royale in the plaza arena: you + 4 bots, each with 3 floating
// balloons = lives. Bump/dash into rivals to pop their balloons. Item
// pickups (speed boost / shield / extra balloon) spawn periodically with
// position-based catch-up rolls: trailing players get stronger items,
// leaders get defensive ones. Last character with balloons wins.
//
// Owns ONLY this file. Uses shared stepPlayer sim (../player.js) for the
// player and every bot (via core/bots.js), ctx.view.current for the
// full-screen view, ctx.loop for ticking, ctx.ui for results panel/toasts.
// Bus: 'coins-earned' via ctx.save.addCoins, 'game-result' via ctx.goHome.

import { createCloudSea, createSkyDome, SKY_LOW } from '../core/sky.js';
import { registerGame } from '../core/registry.js';
import { spawnBot } from '../core/bots.js';
import { createPlayerState, stepPlayer } from '../player.js';
import { cameraRelativeDirection } from '../input.js';
import { createPartySession } from '../core/party-session.js';
import {
  commitLocalGameReward,
  localGameRewardStat,
} from '../core/game-result.js';
import {
  createOrbitState,
  orbitCameraPosition,
  resolveCameraObstruction,
  updateOrbitState,
} from '../core/chase-camera.js';
import {
  defineLevelDescription,
  scoreZoneOverlap,
  widgetsByType,
} from '../core/level-widgets.js';
import {
  BALLOON_ARENA_HALF,
  BALLOON_ROLE_COLORS,
  buildBalloonArena,
} from './balloon-arena.js';
import { loadWorldItems } from '../world-items.js';

// ---------- Tuning ----------
const SIM_DT = 1 / 60;
const ARENA = BALLOON_ARENA_HALF; // half-size of the square plaza; sim bounds
const BOT_COUNT = 4;           // 3-5 allowed; player + 4 bots = 5 combatants
const START_BALLOONS = 3;
const MAX_BALLOONS = 5;
const DASH_TIME = 0.30;        // s of dash burst
const DASH_CD = 1.6;           // s between dashes
const FINAL_GUST_DASH_CD = 0.95;
const DASH_SPEED = 11.5;       // units/s while dashing
const DASH_TRAIL_EVERY = 0.07; // s between dash rings
const BOOST_MULT = 1.45;       // speed-boost item multiplier
const BOOST_TIME = 5;          // s
const CONTACT_R = 1.05;        // center distance that counts as a bump
const POP_IMMUNE = 1.2;        // per-target cooldown after losing a balloon
const BUMP_POP_SPEED = 7.5;    // relative speed for a non-dash bump to pop
const MATCH_TIME = 150;        // s safety timer
const ITEM_FIRST = 4;          // s until first item
const ITEM_EVERY = 3.5;        // s between spawns
const FINAL_GUST_ITEM_EVERY = 2.0;
const ITEM_MAX = 4;            // max live pickups
const FINAL_GUST_AT = 45;       // final 30% of the standard 150s round
const PLACEMENT_COINS = { 1: 40, 2: 28, 3: 18, 4: 12, 5: 8 };
const COINS_PER_POP = 5;

export const BALLOON_LEVEL_DESCRIPTION = defineLevelDescription({
  id: 'balloon-battle-v1',
  mode: 'survival',
  metadata: { title: 'Balloon Battle' },
  widgets: [{
    id: 'balloon-contact-pop',
    type: 'score-zone',
    shape: 'circle',
    radius: CONTACT_R,
    event: 'balloon-pop',
  }],
});
const CONTACT_SCORE_ZONE = widgetsByType(BALLOON_LEVEL_DESCRIPTION, 'score-zone')[0];

export function balloonEscalationState(timeRemaining, matchDuration = MATCH_TIME) {
  const threshold = Math.min(FINAL_GUST_AT, Math.max(0, matchDuration) * 0.3);
  const active = timeRemaining <= threshold;
  return {
    active,
    threshold,
    dashCooldown: active ? FINAL_GUST_DASH_CD : DASH_CD,
    itemInterval: active ? FINAL_GUST_ITEM_EVERY : ITEM_EVERY,
  };
}

// Balloon colors per combatant slot (palette: yellow, terracotta, sage, plum, rose).
const BALLOON_COLORS = [0xe8b64a, 0xd0775e, 0x5a9c7a, 0x8a6fb0, 0xc46f8e];
const BOT_POOL = ['shark', 'ramen', 'bolt', 'cat', 'alien', 'pumpkin', 'robot', 'dumpling'];

registerGame({
  id: 'balloon',
  name: 'Balloon Battle',
  hint: 'Pop their balloons',
  color: 0xe8b64a,

  mount(ctx, opts = {}) {
    ctx.party ||= createPartySession(ctx);
    const T = ctx.THREE;
    let disposed = false;
    document.body.classList.add('balloon-mode');
    const routeParams = new URLSearchParams(location.search);
    const visualQaBalloon = routeParams.get('visualQaBalloon');
    const matchDuration = visualQaBalloon === 'runner'
      ? 30
      : visualQaBalloon === 'late'
        ? 12
        : routeParams.get('qa') === '1'
          ? 5
          : MATCH_TIME;

    // ---------- Scene / camera / lights ----------
    const scene = new T.Scene();
    // Shared 67VERSE atmosphere: same gradient sky and cloud sea as the hub
    // and the Skyway course, so every mode reads as one world.
    scene.add(createSkyDome(T));
    scene.add(createCloudSea(T, { layout: 'radial', radius: 78, seed: 612165 }));
    scene.fog = new T.Fog(SKY_LOW, 54, 118);
    const camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
    camera.position.set(0, 11, 22);

    scene.add(new T.HemisphereLight(0xf8ffff, 0x6f9f96, 1.15));
    const sun = new T.DirectionalLight(0xfff1cf, 1.35);
    sun.position.set(18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); // budget: <=2048
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
    sun.shadow.camera.far = 80;
    scene.add(sun);
    scene.add(sun.target);

    // ---------- Arena presentation ----------
    // The builder owns visuals only. Rules and the flat simulation envelope
    // remain in this file.
    const sharedGeos = [];
    const sharedMats = [];
    function geo(g) { sharedGeos.push(g); return g; }
    function mat(m) { sharedMats.push(m); return m; }
    const arena = buildBalloonArena(T, {
      highDetail: ctx.quality.getState().tier !== 'low',
    });
    scene.add(arena.root);
    const { cameraColliders } = arena;

    // Authored Meshy garden props dress the terrace once the GLBs resolve:
    // corner trees + grass tufts on the terrace, clouds drifting beyond the
    // rim. Shared item geometry is never disposed here — arena.dispose drops
    // the whole root on unmount.
    loadWorldItems()
      .then((worldItems) => {
        if (disposed || !worldItems) return;
        const placer = new T.Object3D();
        const addInstanced = (item, specs, name) => {
          if (!item?.geometry || !specs.length) return;
          const instanced = new T.InstancedMesh(item.geometry, item.material, specs.length);
          specs.forEach(([x, y, z, s, yaw], index) => {
            placer.position.set(x, y, z);
            placer.rotation.set(0, yaw || 0, 0);
            placer.scale.set(s, s, s);
            placer.updateMatrix();
            instanced.setMatrixAt(index, placer.matrix);
          });
          instanced.instanceMatrix.needsUpdate = true;
          instanced.name = name;
          instanced.castShadow = false;
          arena.root.add(instanced);
        };
        addInstanced(worldItems.tree, [
          [14, 0.06, 14, 2.5, 0.4], [-14, 0.06, 14, 2.5, 2.1],
          [14, 0.06, -14, 2.5, 3.4], [-14, 0.06, -14, 2.5, 5.1],
        ], 'balloon-arena:meshy-corner-trees');
        addInstanced(worldItems.grass, [
          [13, 0.08, 12.4, 0.55, 0.2], [12.2, 0.08, 13.4, 0.5, 1.4],
          [-13, 0.08, 12.6, 0.55, 2.8], [-12.4, 0.08, 13.2, 0.5, 4.0],
          [13.2, 0.08, -12.6, 0.55, 5.3], [12.4, 0.08, -13.4, 0.5, 0.9],
          [-13.2, 0.08, -12.4, 0.55, 1.9], [-12.6, 0.08, -13.4, 0.5, 3.6],
        ], 'balloon-arena:meshy-grass-tufts');
        addInstanced(worldItems.cloud, [
          [22, 9, -18, 2.6, 0.3], [-24, 10.5, -10, 2.2, 1.2],
          [25, 8.5, 9, 2.9, 2.2], [-22, 11.5, 14, 2.4, 4.4],
          [2, 12.5, -26, 3.1, 0.8],
        ], 'balloon-arena:meshy-drifting-clouds');
      })
      .catch(() => {});

    // Flat arena -> trivial ground sampler, same env shape as the hub world.
    const env = { sampleGround: () => ({ y: 0, box2: null }), bounds: ARENA - 0.4 };

    // ---------- Shared combatant visuals ----------
    const balloonGeo = geo(new T.SphereGeometry(0.24, 14, 10));
    const stringGeo = geo(new T.CylinderGeometry(0.012, 0.012, 1, 4));
    const stringMat = mat(new T.MeshStandardMaterial({ color: 0x7a736a, roughness: 0.8 }));
    const balloonMats = BALLOON_COLORS.map((c) => mat(new T.MeshStandardMaterial({ color: c, roughness: 0.3, emissive: c, emissiveIntensity: 0.12 })));
    const ringGeo = geo(new T.RingGeometry(0.3, 0.42, 24));
    const shieldGeo = geo(new T.TorusGeometry(0.62, 0.05, 8, 24));
    const shieldMat = mat(new T.MeshStandardMaterial({ color: 0x5a9c7a, roughness: 0.3, emissive: 0x5a9c7a, emissiveIntensity: 0.35 }));
    const itemGeo = geo(new T.OctahedronGeometry(0.48, 0));
    const itemMat = mat(new T.MeshStandardMaterial({
      color: BALLOON_ROLE_COLORS.pickup,
      roughness: 0.3,
      emissive: BALLOON_ROLE_COLORS.pickup,
      emissiveIntensity: 0.48,
    }));
    const itemRingGeo = geo(new T.RingGeometry(0.5, 0.62, 24));
    const itemRingMat = mat(new T.MeshBasicMaterial({
      color: BALLOON_ROLE_COLORS.pickup,
      transparent: true,
      opacity: 0.78,
      side: T.DoubleSide,
      depthWrite: false,
    }));
    const itemPickupMesh = new T.InstancedMesh(itemGeo, itemMat, ITEM_MAX);
    const itemPickupRings = new T.InstancedMesh(itemRingGeo, itemRingMat, ITEM_MAX);
    itemPickupMesh.userData.perfGroup = 'balloon-effects';
    itemPickupRings.userData.perfGroup = 'balloon-effects';
    itemPickupMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    itemPickupRings.instanceMatrix.setUsage(T.DynamicDrawUsage);
    itemPickupMesh.count = 0;
    itemPickupRings.count = 0;
    scene.add(itemPickupMesh, itemPickupRings);
    const dashTrailMat = mat(new T.MeshBasicMaterial({
      color: BALLOON_ROLE_COLORS.dash,
      transparent: true,
      opacity: 0.76,
      side: T.DoubleSide,
      depthWrite: false,
    }));
    const dashTrailMesh = new T.InstancedMesh(ringGeo, dashTrailMat, 28);
    dashTrailMesh.userData.perfGroup = 'balloon-effects';
    dashTrailMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    dashTrailMesh.count = 0;
    scene.add(dashTrailMesh);
    const popEffectMat = mat(new T.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      side: T.DoubleSide,
      depthWrite: false,
    }));
    const popEffectMesh = new T.InstancedMesh(ringGeo, popEffectMat, 20);
    popEffectMesh.userData.perfGroup = 'balloon-effects';
    popEffectMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    popEffectMesh.count = 0;
    scene.add(popEffectMesh);

    // Balloon anchor offsets above the head, by index (up to MAX_BALLOONS).
    const BALLOON_OFFSETS = [
      [-0.38, 2.5, 0], [0.38, 2.5, 0], [0, 2.92, 0], [-0.74, 2.74, 0], [0.74, 2.74, 0],
    ];

    const combatants = [];
    const anims = [];   // batched transient pop/shield flashes
    const dashTrails = []; // batched transient motion marks
    const items = [];   // live pickups: { mesh, ring, x, z, phase }

    function makeBalloonRig(colorIdx) {
      const rig = new T.Group();
      rig.userData.perfGroup = 'balloon-rigs';
      const balloons = new T.InstancedMesh(balloonGeo, balloonMats[colorIdx], MAX_BALLOONS);
      const strings = new T.InstancedMesh(stringGeo, stringMat, MAX_BALLOONS);
      balloons.userData.perfGroup = strings.userData.perfGroup = 'balloon-rigs';
      balloons.instanceMatrix.setUsage(T.DynamicDrawUsage);
      strings.instanceMatrix.setUsage(T.DynamicDrawUsage);
      balloons.castShadow = true;
      balloons.count = 0;
      strings.count = 0;
      rig.add(balloons, strings);
      scene.add(rig);
      return { rig, colorIdx, slots: [], balloons, strings };
    }

    function addBalloon(c) {
      const i = c.br.slots.length;
      if (i >= MAX_BALLOONS) return;
      const holder = {
        position: new T.Vector3(),
        userData: {},
      };
      c.br.slots.push(holder);
      layoutBalloon(c, holder, i);
      c.br.balloons.count = c.br.slots.length;
      c.br.strings.count = c.br.slots.length;
    }
    function layoutBalloon(c, holder, i) {
      const [ox, oy, oz] = BALLOON_OFFSETS[i];
      holder.userData.off = { x: ox, y: oy, z: oz, phase: Math.random() * Math.PI * 2 };
      holder.position.set(ox, oy, oz);
    }

    const balloonMarker = new T.Object3D();
    function syncBalloonRig(c, time) {
      for (let i = 0; i < c.br.slots.length; i++) {
        const holder = c.br.slots[i];
        const o = holder.userData.off;
        const y = o.y + Math.sin(time * 2 + o.phase) * 0.07;
        holder.position.set(o.x, y, o.z);

        balloonMarker.position.copy(holder.position);
        balloonMarker.rotation.set(0, 0, 0);
        balloonMarker.scale.set(1, 1, 1);
        balloonMarker.updateMatrix();
        c.br.balloons.setMatrixAt(i, balloonMarker.matrix);

        const stringLength = o.y - 1.75;
        balloonMarker.position.set(o.x, y - stringLength / 2, o.z);
        balloonMarker.scale.set(1, stringLength, 1);
        balloonMarker.updateMatrix();
        c.br.strings.setMatrixAt(i, balloonMarker.matrix);
      }
      c.br.balloons.count = c.br.slots.length;
      c.br.strings.count = c.br.slots.length;
      c.br.balloons.instanceMatrix.needsUpdate = true;
      c.br.strings.instanceMatrix.needsUpdate = true;
    }

    function spawnPopAnim(x, y, z, color) {
      if (anims.length >= 20) anims.shift();
      anims.push({ x, y, z, color, t: 0, dur: 0.4, grow: 3.2 });
    }

    function spawnDashTrail(c) {
      if (dashTrails.length >= 28) dashTrails.shift();
      dashTrails.push({
        x: c.state.pos.x,
        z: c.state.pos.z,
        t: 0,
        dur: 0.28,
        grow: 1.7,
      });
    }

    function removeBalloon(c) {
      const holder = c.br.slots.pop();
      if (!holder) return;
      const p = holder.position;
      spawnPopAnim(c.state.pos.x + p.x, c.state.pos.y + p.y, c.state.pos.z + p.z, BALLOON_COLORS[c.br.colorIdx]);
      c.br.balloons.count = c.br.slots.length;
      c.br.strings.count = c.br.slots.length;
    }

    function makeCombatant({ id, name, colorIdx, isPlayer, state, group, bot = null }) {
      const c = {
        id, name, colorIdx, isPlayer, state, group, bot,
        br: makeBalloonRig(colorIdx),
        shield: 0, shieldMesh: null,
        boostT: 0, dashT: 0, dashCd: 0, dashDir: { x: 0, z: 1 },
        dashTrailT: 0,
        popImmune: 0, alive: true, placement: 0, pops: 0,
      };
      for (let i = 0; i < START_BALLOONS; i++) addBalloon(c);
      combatants.push(c);
      return c;
    }

    function balloonCount(c) { return c.br.slots.length; }
    function aliveList() { return combatants.filter((c) => c.alive); }

    // ---------- Items ----------
    let itemTimer = ITEM_FIRST;
    function spawnItem() {
      if (items.length >= ITEM_MAX) return;
      const a = Math.random() * Math.PI * 2;
      const r = 2.5 + Math.random() * 8.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      items.push({
        x,
        z,
        phase: Math.random() * Math.PI * 2,
        rotation: 0,
      });
    }
    function removeItem(it) {
      items.splice(items.indexOf(it), 1);
    }

    // Position-based catch-up: the further behind the picker is, the
    // stronger the roll. Leaders get defensive/utility items instead.
    function rollItem(c) {
      const alive = aliveList();
      const maxB = Math.max(...alive.map(balloonCount));
      const deficit = maxB - balloonCount(c);
      const canBalloon = balloonCount(c) < MAX_BALLOONS;
      const r = Math.random();
      if (deficit >= 1) {
        // trailing: strong catch-up
        if (canBalloon && r < 0.45) return 'balloon';
        if (r < 0.75) return 'shield';
        return 'boost';
      }
      // leader: defensive
      if (r < 0.40) return 'shield';
      if (canBalloon && r < 0.52) return 'balloon';
      return 'boost';
    }
    function applyItem(c) {
      const type = rollItem(c);
      if (type === 'balloon') {
        addBalloon(c);
        if (c.isPlayer) ctx.ui.toast('🎈 Extra balloon!');
      } else if (type === 'shield') {
        c.shield = 1;
        if (!c.shieldMesh) {
          c.shieldMesh = new T.Mesh(shieldGeo, shieldMat);
          c.shieldMesh.rotation.x = Math.PI / 2;
          c.group.add(c.shieldMesh);
        }
        c.shieldMesh.visible = true;
        if (c.isPlayer) ctx.ui.toast('🛡 Shield up — blocks one pop!');
      } else {
        c.boostT = BOOST_TIME;
        if (c.isPlayer) ctx.ui.toast('⚡ Speed boost!');
      }
    }

    // ---------- Popping ----------
    function popVictim(att, vic) {
      if (!vic.alive || vic.popImmune > 0) return;
      vic.popImmune = POP_IMMUNE;
      // knockback away from attacker
      const dx = vic.state.pos.x - att.state.pos.x;
      const dz = vic.state.pos.z - att.state.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      vic.state.vel.x += (dx / d) * 6;
      vic.state.vel.z += (dz / d) * 6;
      att.state.vel.x -= (dx / d) * 2.5;
      att.state.vel.z -= (dz / d) * 2.5;

      if (vic.shield > 0) {
        vic.shield = 0;
        if (vic.shieldMesh) vic.shieldMesh.visible = false;
        spawnPopAnim(vic.state.pos.x, vic.state.pos.y + 1.1, vic.state.pos.z, 0x5a9c7a);
        if (vic.isPlayer) {
          vic.character?.animator.signal('impact', { strength: 0.5 });
          flashImpact('shield');
          ctx.ui.toast('🛡 Shield saved your balloon!');
        }
        return;
      }
      removeBalloon(vic);
      att.pops += 1;
      if (vic.isPlayer) {
        vic.character?.animator.signal('impact');
        flashImpact('hit');
        ctx.ui.toast(`💥 Balloon popped! ${balloonCount(vic)} left`);
      }
      else if (att.isPlayer) ctx.ui.toast(`🎯 You popped ${vic.name}!`);
      if (balloonCount(vic) <= 0) eliminate(vic);
    }

    function eliminate(vic) {
      vic.alive = false;
      vic.placement = aliveList().length + 1; // rank just outside the survivors
      // little farewell burst where they stood
      spawnPopAnim(vic.state.pos.x, vic.state.pos.y + 1.2, vic.state.pos.z, BALLOON_COLORS[vic.colorIdx]);
      vic.group.visible = false;
      vic.br.rig.visible = false;
      if (vic.isPlayer) {
        banner(`💥 Out! #${vic.placement}`, 1.4);
        pendingEndT = 1.4;
      } else if (aliveList().length === 1 && player && player.alive) {
        player.placement = 1;
        banner('🏆 Last balloons floating!', 1.2);
        pendingEndT = 1.2;
      }
    }

    function startDash(c, dx, dz) {
      if (c.dashCd > 0 || c.dashT > 0) {
        if (c.isPlayer) dashDeniedT = 0.28;
        return false;
      }
      const d = Math.hypot(dx, dz);
      if (d < 1e-3) { dx = Math.sin(c.state.yaw); dz = Math.cos(c.state.yaw); }
      else { dx /= d; dz /= d; }
      c.dashDir.x = dx; c.dashDir.z = dz;
      c.dashT = DASH_TIME;
      c.dashCd = balloonEscalationState(matchT, matchDuration).dashCooldown;
      c.dashTrailT = 0;
      if (c.isPlayer) tutorialT = Math.min(tutorialT, 1.1);
      return true;
    }

    // ---------- Bot brain ----------
    // Steers toward the nearest rival (or a nearby item when trailing).
    // Dashing is decided centrally each tick so bots and player share rules.
    function botBehavior(me) {
      return (_bot, _dt, _world) => {
        if (phase !== 'play' || !me.alive) return { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
        const p = me.state.pos;
        // pick target: nearest living rival
        let tgt = null, best = 1e9;
        for (const c of combatants) {
          if (c === me || !c.alive) continue;
          const d = Math.hypot(c.state.pos.x - p.x, c.state.pos.z - p.z);
          if (d < best) { best = d; tgt = c; }
        }
        // trailing bots value items more
        const alive = aliveList();
        const maxB = Math.max(...alive.map(balloonCount));
        const trailing = maxB - balloonCount(me) >= 1;
        let item = null, ibest = trailing ? 9 : 4.5;
        for (const it of items) {
          const d = Math.hypot(it.x - p.x, it.z - p.z);
          if (d < ibest) { ibest = d; item = it; }
        }
        let gx, gz;
        if (item && (trailing || best > 6)) { gx = item.x; gz = item.z; }
        else if (tgt) { gx = tgt.state.pos.x; gz = tgt.state.pos.z; }
        else { gx = 0; gz = 0; }
        // stay off the walls
        if (Math.abs(p.x) > ARENA - 2.5 || Math.abs(p.z) > ARENA - 2.5) { gx = 0; gz = 0; }
        let dx = gx - p.x, dz = gz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) return { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
        dx /= d; dz /= d;
        if (me.boostT > 0) { dx *= BOOST_MULT; dz *= BOOST_MULT; }
        return { dirX: dx, dirZ: dz, moving: true, jumpHeld: false, grabPressed: false };
      };
    }

    // ---------- Roster ----------
    let player = null;
    let ready = false;
    const equipped = ctx.characters.equippedId();
    const botIds = BOT_POOL.filter((id) => id !== equipped).slice(0, BOT_COUNT);
    const skinTone = ctx.save.settings.skinTone;

    (async () => {
      // player
      const character = await ctx.characters.createInstance(equipped, {
        skinTone,
        lod: 'game',
        shadow: 'hero',
      });
      if (disposed) {
        character.dispose();
        return;
      }
      const pGroup = character.root;
      scene.add(pGroup);
      const pState = createPlayerState(0, 8);
      pState.yaw = Math.PI; // face arena center
      player = makeCombatant({
        id: 'player', name: ctx.save.profile.name || 'You', colorIdx: 0,
        isPlayer: true, state: pState, group: pGroup,
      });
      player.character = character;

      // bots on a ring, spaced from the player
      for (let i = 0; i < botIds.length; i++) {
        const a = (i + 1) * ((Math.PI * 2) / (botIds.length + 1));
        const x = Math.sin(a) * 8, z = Math.cos(a) * 8;
        let meRef = null;
        const bot = await spawnBot(ctx, scene, env, {
          charId: botIds[i], x, z,
          behavior: (b, dt, w) => (meRef ? botBehavior(meRef)(b, dt, w) : { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false }),
        });
        if (disposed) { bot.dispose(); return; }
        bot.state.yaw = Math.atan2(-x, -z); // face center
        const def = ctx.characters.ROSTER.find((r) => r.id === botIds[i]);
        meRef = makeCombatant({
          id: botIds[i], name: def ? def.name : 'Bot', colorIdx: (i + 1) % BALLOON_COLORS.length,
          isPlayer: false, state: bot.state, group: bot.group, bot,
        });
      }
      if (disposed) return;
      ready = true;
      hudDirty = true;
    })().catch((e) => console.error('[balloon] setup failed', e));

    // ---------- DOM: HUD + onboarding / ability feedback ----------
    const localStyles = document.createElement('style');
    localStyles.textContent = `
      .bb-ability {
        position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom) + 18px);
        z-index: 42; width: min(250px, calc(100vw - 32px)); transform: translateX(-50%);
        pointer-events: none; padding: 9px 11px 10px; border-radius: 14px;
        color: #060c21; background: rgba(255,255,255,.9);
        border: 1px solid rgba(6,12,33,.14); box-shadow: 0 7px 24px rgba(6,12,33,.16);
        backdrop-filter: blur(8px); font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
        transition: border-color .12s, transform .12s;
      }
      .bb-ability.bb-denied { border-color: #9a9aa2; transform: translateX(-50%) scale(.97); }
      .bb-ability-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; }
      .bb-ability-title { font-size:12px; font-weight:600; letter-spacing:.06em; }
      .bb-ability-state { color:#9a9aa2; font-size:11px; font-weight:600; }
      .bb-ability-track { height:6px; overflow:hidden; border-radius:999px; background:#e5e5ea; }
      .bb-ability-fill { width:100%; height:100%; transform-origin:left center; border-radius:inherit; background:#0A84FF; }
      .bb-tutorial {
        position:fixed; left:50%; bottom:88px; z-index:43; transform:translateX(-50%);
        width:max-content; max-width:calc(100vw - 28px); padding:11px 15px; border-radius:10px;
        color:#ffffff; background:rgba(6,12,33,.88); box-shadow:0 8px 28px rgba(6,12,33,.24);
        text-align:center; font:500 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
        pointer-events:none; opacity:1; transition:opacity .3s, transform .3s;
      }
      .bb-tutorial b { color:#3395ff; }
      .bb-tutorial.bb-hidden { opacity:0; transform:translate(-50%, 8px); }
      .bb-impact {
        position:fixed; inset:0; z-index:41; pointer-events:none; opacity:0;
        box-shadow:inset 0 0 70px 18px rgba(208,119,94,.8);
      }
      .bb-hud {
        position:fixed; top:12px; left:12px; z-index:40; min-width:170px;
        padding:10px 14px; pointer-events:none;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
        background:rgba(255,255,255,.92); border:1px solid #e5e5ea; border-radius:10px;
        box-shadow:0 4px 14px rgba(6,12,33,.12); backdrop-filter:blur(8px);
      }
      @media (max-width: 600px) {
        .bb-hud { top:calc(env(safe-area-inset-top) + 62px); left:calc(env(safe-area-inset-left) + 8px); min-width:154px; max-width:calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 16px); padding:8px 11px; }
        .bb-ability { left:auto; right:calc(env(safe-area-inset-right) + 16px); bottom:calc(env(safe-area-inset-bottom) + 108px); width:142px; transform:none; }
        .bb-ability.bb-denied { transform:scale(.97); }
        .bb-tutorial { bottom:calc(env(safe-area-inset-bottom) + 202px); width:calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 32px); font-size:12px; }
        body.balloon-mode .ps-objective.bb-start-objective {
          top:auto; right:calc(env(safe-area-inset-right) + 16px); bottom:calc(env(safe-area-inset-bottom) + 202px); left:calc(env(safe-area-inset-left) + 16px); width:auto; transform:none;
        }
        body.balloon-mode .ps-objective.bb-start-objective.is-leaving {
          transform:translateY(8px);
        }
      }
    `;
    document.head.appendChild(localStyles);

    const hud = document.createElement('div');
    hud.className = 'bb-hud';
    hud.setAttribute('role', 'group');
    hud.setAttribute('aria-label', 'Balloon Battle status');
    document.body.appendChild(hud);

    const abilityEl = document.createElement('div');
    abilityEl.className = 'bb-ability';
    abilityEl.innerHTML = `
      <div class="bb-ability-head">
        <span class="bb-ability-title">⚡ DASH <span style="opacity:.58">${ctx.input.isTouchDevice ? 'BUTTON' : 'E / SHIFT'}</span></span>
        <span class="bb-ability-state">READY</span>
      </div>
      <div class="bb-ability-track"><div class="bb-ability-fill"></div></div>
    `;
    document.body.appendChild(abilityEl);
    const abilityState = abilityEl.querySelector('.bb-ability-state');
    const abilityFill = abilityEl.querySelector('.bb-ability-fill');

    const tutorialEl = document.createElement('div');
    tutorialEl.className = 'bb-tutorial';
    tutorialEl.innerHTML = ctx.input.isTouchDevice
      ? '<b>MOVE</b> · <b>DASH</b> into a rival · collect glowing power-ups'
      : '<b>WASD</b> to move · <b>E / SHIFT</b> to DASH into a rival · collect glowing power-ups';
    document.body.appendChild(tutorialEl);
    const objectiveCard = ctx.party.objective({
      icon: '🎈',
      title: 'Balloon Battle',
      objective: 'Dash into rivals. Pop all 3 balloons. Be last standing.',
      controls: ctx.input.isTouchDevice
        ? 'Move with the stick, drag the right side to look, and tap DASH. Drops favor players who are behind.'
        : 'Move with WASD or arrows, drag to look, and press E or Shift to DASH. Drops favor players who are behind.',
    });
    objectiveCard.el.classList.add('bb-start-objective');

    function setTutorialHidden(hidden) {
      tutorialEl.classList.toggle('bb-hidden', hidden);
      tutorialEl.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }
    if (ctx.input.isTouchDevice) setTutorialHidden(true);

    const impactEl = document.createElement('div');
    impactEl.className = 'bb-impact';
    document.body.appendChild(impactEl);
    let impactT = 0;
    function flashImpact(type) {
      impactT = type === 'shield' ? 0.28 : 0.38;
      impactEl.style.boxShadow = type === 'shield'
        ? 'inset 0 0 70px 18px rgba(90,156,122,.75)'
        : 'inset 0 0 70px 18px rgba(208,119,94,.8)';
      impactEl.style.opacity = '1';
    }

    const grabButton = document.getElementById('btn-grab');
    const grabButtonText = grabButton?.textContent;
    const grabButtonAria = grabButton?.getAttribute('aria-label');
    const grabButtonStyle = grabButton?.style.cssText;
    if (grabButton) {
      grabButton.textContent = 'DASH';
      grabButton.setAttribute('aria-label', 'Dash attack');
      grabButton.style.background = 'rgba(10, 132, 255, 0.72)';
      grabButton.style.borderColor = 'rgba(124, 87, 18, 0.55)';
    }

    const bannerEl = document.createElement('div');
    bannerEl.className = 'bb-banner';
    bannerEl.style.cssText = 'position:fixed;top:22%;left:50%;width:min(620px,calc(100vw - 32px));transform:translateX(-50%);z-index:45;pointer-events:none;font:600 clamp(26px,7vw,44px)/1.02 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#060c21;text-shadow:0 2px 0 #ffffff,0 6px 24px rgba(6,12,33,.25);opacity:0;transition:opacity .15s;text-align:center';
    if (ctx.input.isTouchDevice) bannerEl.style.top = '34%';
    document.body.appendChild(bannerEl);
    bannerEl.setAttribute('aria-live', 'assertive');
    let bannerT = 0;
    function banner(text, secs) {
      bannerEl.textContent = text;
      bannerEl.style.opacity = '1';
      bannerT = secs;
    }

    let hudDirty = true;
    let lastSig = '';
    function updateHud() {
      const rows = combatants.map((c) => {
        const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#${BALLOON_COLORS[c.colorIdx].toString(16).padStart(6, '0')};margin-right:6px"></span>`;
        const balloons = c.alive ? '🎈'.repeat(balloonCount(c)) : '💀';
        const buffs = (c.shield ? ' 🛡' : '') + (c.boostT > 0 ? ' ⚡' : '');
        const me = c.isPlayer ? ' <b style="color:#9a9aa2">you</b>' : '';
        return `<div style="font-size:13px;font-weight:600;color:#060c21;padding:2px 0;${c.alive ? '' : 'opacity:.45'}">${dot}${c.name}${me} <span style="float:right;margin-left:14px">${balloons}${buffs}</span></div>`;
      });
      const t = Math.max(0, Math.ceil(matchT));
      const living = aliveList();
      const maxBalloons = living.length ? Math.max(...living.map(balloonCount)) : 0;
      const comeback = Boolean(
        player?.alive && maxBalloons - balloonCount(player) >= 1,
      );
      const phaseText = finalGust
        ? 'FINAL GUST · FAST DASHES + MORE DROPS'
        : comeback
          ? 'COMEBACK DROPS BOOSTED'
          : 'DASH TO POP · LAST STANDING WINS';
      const phaseColor = finalGust ? '#4e4d4d' : comeback ? '#5a7f66' : '#9a9aa2';
      const head = `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9a9aa2">🎈 Balloon Battle · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</div>
        <div style="font-size:9px;font-weight:600;letter-spacing:.065em;color:${phaseColor};padding:2px 0 5px">${phaseText}</div>`;
      const sig = head + rows.join('');
      if (sig !== lastSig) { hud.innerHTML = sig; lastSig = sig; }
    }

    // ---------- Match flow ----------
    let phase = 'countdown';   // countdown -> play -> over
    let countdownT = 3.0;
    let matchT = matchDuration;
    let acc = 0;
    let pendingEndT = 0;
    let finished = false;
    let resultsPanel = null;
    let tutorialT = 7;
    let dashDeniedT = 0;
    let finalGust = false;
    let startGuidanceHandedOff = false;
    let framePad = {
      mx: 0, my: 0, moving: false, jumpHeld: false, grabPressed: false,
      lookYaw: 0, lookPitch: 0, looking: false,
    };

    function endMatch(placement) {
      if (phase === 'over') return;
      phase = 'over';
      if (placement === 1) player?.character?.animator.play('celebrate');
      const pops = player ? player.pops : 0;
      const coins = (PLACEMENT_COINS[placement] || 8) + pops * COINS_PER_POP;
      const result = commitLocalGameReward(ctx.save, {
        game: 'balloon',
        gameId: 'balloon',
        placement,
        coins,
        score: pops,
      }, `balloon-battle #${placement}`);
      if (!result.rewardCommitted) {
        ctx.ui.toast('Coins could not be saved on this device. Quest and Season progress were not advanced.');
      }

      function finish() {
        if (finished) return;
        finished = true;
        ctx.goHome(result); // emits 'game-result'
      }
      function replay() {
        if (finished) return;
        finished = true;
        ctx.replayGame?.('balloon', result);
      }

      const nestedShowRound = opts.mode === 'show67';
      resultsPanel = ctx.party.result({
        title: 'Balloon Battle — Results',
        icon: placement === 1 ? '🏆' : '🎈',
        outcome: placement === 1 ? 'Last balloons floating!' : `You placed #${placement}`,
        summary: placement === 1
          ? `You protected ${balloonCount(player)} balloon${balloonCount(player) === 1 ? '' : 's'} and popped ${pops}.`
          : `You popped ${pops} and finished #${placement} of ${combatants.length}.`,
        note: nestedShowRound ? '67 Show · local round' : 'Local bot battle',
        stats: [
          { label: 'Placement', value: `#${placement}` },
          { label: 'Balloons popped', value: String(pops) },
          { label: 'Balloons remaining', value: String(balloonCount(player)) },
          { label: 'Coins earned', value: localGameRewardStat(result) },
        ],
        onReplay: nestedShowRound ? null : replay,
        homeLabel: nestedShowRound ? 'Continue 67 Show' : 'Return to 67 Park',
        onHome: finish,
      });
    }

    function endByTimer() {
      // rank survivors by balloons (tie: more pops, then player loses ties — bots win ties)
      const ranked = [...combatants].sort((a, b) =>
        (b.alive - a.alive) || (balloonCount(b) - balloonCount(a)) || (b.pops - a.pops) || (a.isPlayer ? 1 : -1));
      player.placement = ranked.indexOf(player) + 1;
      endMatch(player.placement);
    }

    // ---------- Fixed-step sim ----------
    function tick(dt) {
      matchT -= dt;
      if (matchT <= 0) { endByTimer(); return; }

      const escalation = balloonEscalationState(matchT, matchDuration);
      if (escalation.active && !finalGust) {
        finalGust = true;
        banner('FINAL GUST! FAST DASHES + MORE DROPS', 2.2);
        ctx.ui.toast('Final Gust: dash faster and watch for extra drops.');
        ctx.bus.emit('sfx', 'checkpoint');
        hudDirty = true;
      }

      // item spawner
      itemTimer -= dt;
      if (itemTimer <= 0) { itemTimer = escalation.itemInterval; spawnItem(); }

      // ---- player input ----
      const pad = framePad;
      if (player.alive) {
        const direction = cameraRelativeDirection(pad, camOrbit.yaw);
        const dirX = direction.x, dirZ = direction.z;
        const moving = direction.moving;
        let ix = dirX, iz = dirZ;
        if (player.boostT > 0) { ix *= BOOST_MULT; iz *= BOOST_MULT; }
        if (pad.grabPressed) startDash(player, dirX, dirZ);
        const wasGrounded = player.state.grounded;
        stepPlayer(player.state, { dirX: ix, dirZ: iz, moving, jumpHeld: pad.jumpHeld, sprintHeld: pad.sprintHeld, grabPressed: false }, dt, env);
        if (player.state.jumpEvent) player.character?.animator.signal('jump');
        if (!wasGrounded && player.state.grounded) player.character?.animator.signal('land');
        applyDash(player, dt);
      }

      // ---- bots ----
      for (const c of combatants) {
        if (c.isPlayer || !c.alive) { if (!c.isPlayer && c.bot && !c.alive) { /* keep corpse frozen */ } continue; }
        c.bot.step(dt, null);
        applyDash(c, dt);
        // central dash AI: dash at close rivals we're roughly facing
        if (c.dashCd <= 0 && c.dashT <= 0) {
          let tgt = null, best = 3.4;
          for (const o of combatants) {
            if (o === c || !o.alive) continue;
            const d = Math.hypot(o.state.pos.x - c.state.pos.x, o.state.pos.z - c.state.pos.z);
            if (d < best) { best = d; tgt = o; }
          }
          if (tgt) {
            const dx = tgt.state.pos.x - c.state.pos.x;
            const dz = tgt.state.pos.z - c.state.pos.z;
            const facing = Math.atan2(dx, dz);
            let diff = Math.abs(facing - c.state.yaw) % (Math.PI * 2);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff < 0.9 && Math.random() < 0.1) startDash(c, dx, dz);
          }
        }
      }

      // ---- timers ----
      for (const c of combatants) {
        c.dashCd = Math.max(0, c.dashCd - dt);
        c.boostT = Math.max(0, c.boostT - dt);
        c.popImmune = Math.max(0, c.popImmune - dt);
      }

      // ---- contact pops ----
      const alive = aliveList();
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i], b = alive[j];
          if (!scoreZoneOverlap(CONTACT_SCORE_ZONE, a.state.pos, b.state.pos)) continue;
          const relV = Math.hypot(b.state.vel.x - a.state.vel.x, b.state.vel.z - a.state.vel.z);
          const aDash = a.dashT > 0, bDash = b.dashT > 0;
          if (aDash && !bDash) popVictim(a, b);
          else if (bDash && !aDash) popVictim(b, a);
          else if (aDash && bDash) { popVictim(a, b); popVictim(b, a); }
          else if (relV > BUMP_POP_SPEED) {
            // hard bump: the faster mover pops the slower one
            const va = Math.hypot(a.state.vel.x, a.state.vel.z);
            const vb = Math.hypot(b.state.vel.x, b.state.vel.z);
            if (va > vb) popVictim(a, b); else popVictim(b, a);
          }
        }
      }

      // ---- item pickups ----
      for (const it of [...items]) {
        for (const c of aliveList()) {
          if (Math.hypot(c.state.pos.x - it.x, c.state.pos.z - it.z) < 0.95) {
            applyItem(c);
            removeItem(it);
            break;
          }
        }
      }

      // ---- delayed end after elimination banner ----
      if (pendingEndT > 0) {
        pendingEndT -= dt;
        if (pendingEndT <= 0) {
          const p = player.placement || (player.alive ? 1 : aliveList().length + 1);
          endMatch(p);
        }
      }
    }

    function applyDash(c, dt) {
      if (c.dashT > 0) {
        c.dashT -= dt;
        c.state.vel.x = c.dashDir.x * DASH_SPEED;
        c.state.vel.z = c.dashDir.z * DASH_SPEED;
        c.dashTrailT -= dt;
        if (c.dashTrailT <= 0) {
          spawnDashTrail(c);
          c.dashTrailT = DASH_TRAIL_EVERY;
        }
      }
    }

    // ---------- Per-frame visuals + camera ----------
    const camPos = new T.Vector3(0, 11, 22);
    const camTarget = new T.Vector3();
    const camFocus = new T.Vector3();
    const camLook = new T.Vector3();
    const camResolved = new T.Vector3();
    const cameraRay = new T.Raycaster();
    const camOrbit = createOrbitState(Math.PI);
    let time = 0;
    const stop = ctx.loop.add((dt) => {
      if (disposed) return;
      time += dt;
      framePad = ctx.input.poll();
      document.body.dataset.balloonPhase = phase === 'play' ? 'playing' : phase;
      document.body.dataset.balloonFinal = finalGust ? 'true' : 'false';

      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) bannerEl.style.opacity = '0';
      }
      if (impactT > 0) {
        impactT -= dt;
        impactEl.style.opacity = String(Math.max(0, impactT / 0.38));
      }

      if (ready && phase === 'countdown') {
        countdownT -= dt;
        const n = Math.ceil(countdownT);
        bannerEl.textContent = n > 0 ? String(n) : 'GO!';
        bannerEl.style.opacity = '1';
        if (ctx.input.isTouchDevice && n <= 0 && !startGuidanceHandedOff) {
          startGuidanceHandedOff = true;
          objectiveCard.close();
          setTutorialHidden(false);
        }
        if (countdownT <= -0.6) { bannerEl.style.opacity = '0'; phase = 'play'; }
      } else if (ready && phase === 'play') {
        acc += dt;
        let guard = 0;
        while (acc >= SIM_DT && guard++ < 8) { tick(SIM_DT); acc -= SIM_DT; }
        tutorialT -= dt;
        if (tutorialT <= 0) tutorialEl.classList.add('bb-hidden');
      }

      if (dashDeniedT > 0) dashDeniedT -= dt;
      abilityEl.classList.toggle('bb-denied', dashDeniedT > 0);
      const dashLeft = player ? Math.max(0, player.dashCd) : DASH_CD;
      const dashCooldown = balloonEscalationState(matchT, matchDuration).dashCooldown;
      const dashReady = ready && dashLeft <= 0;
      const dashCharge = dashReady ? 1 : Math.max(0, 1 - dashLeft / dashCooldown);
      abilityFill.style.transform = `scaleX(${dashCharge})`;
      abilityFill.style.background = dashReady ? '#5a9c7a' : '#0A84FF';
      abilityState.textContent = dashReady ? (finalGust ? 'GUST READY' : 'READY') : `${dashLeft.toFixed(1)}s`;
      if (grabButton) {
        grabButton.style.opacity = dashReady ? '1' : '.48';
        grabButton.setAttribute('aria-label', dashReady ? 'Dash attack ready' : `Dash recharging, ${dashLeft.toFixed(1)} seconds`);
      }

      // combatant visuals
      for (const c of combatants) {
        if (!c.alive) continue;
        c.group.position.set(c.state.pos.x, c.state.pos.y, c.state.pos.z);
        c.group.rotation.y = c.state.yaw;
        if (c.isPlayer) c.character?.animator.update(dt, {
          speed: Math.hypot(c.state.vel.x, c.state.vel.z),
          grounded: c.state.grounded,
        });
        c.br.rig.position.set(c.state.pos.x, c.state.pos.y, c.state.pos.z);
        syncBalloonRig(c, time);
        if (c.shieldMesh && c.shieldMesh.visible) c.shieldMesh.rotation.z += dt * 2.5;
        // dash squash hint
        const s = c.dashT > 0 ? 1.08 : 1;
        c.group.scale.setScalar(s);
      }

      // items bob + spin
      for (let index = 0; index < items.length; index++) {
        const it = items[index];
        it.rotation += dt * 2;
        balloonMarker.position.set(
          it.x,
          0.55 + Math.sin(time * 2.4 + it.phase) * 0.12,
          it.z,
        );
        balloonMarker.rotation.set(0, it.rotation, 0);
        balloonMarker.scale.setScalar(1);
        balloonMarker.updateMatrix();
        itemPickupMesh.setMatrixAt(index, balloonMarker.matrix);

        const ringPulse = 0.92 + Math.sin(time * 3 + it.phase) * 0.12;
        balloonMarker.position.set(it.x, 0.14, it.z);
        balloonMarker.rotation.set(-Math.PI / 2, 0, 0);
        balloonMarker.scale.setScalar(ringPulse);
        balloonMarker.updateMatrix();
        itemPickupRings.setMatrixAt(index, balloonMarker.matrix);
      }
      itemPickupMesh.count = items.length;
      itemPickupRings.count = items.length;
      itemPickupMesh.instanceMatrix.needsUpdate = true;
      itemPickupRings.instanceMatrix.needsUpdate = true;

      // The floor dial and distant crown share one authored Final Gust signal.
      arena.updateFinalGust(finalGust, time, dt);

      // pop/shield anims
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i];
        a.t += dt;
        if (a.t >= a.dur) anims.splice(i, 1);
      }
      for (let index = 0; index < anims.length; index++) {
        const effect = anims[index];
        const progress = effect.t / effect.dur;
        balloonMarker.position.set(effect.x, effect.y, effect.z);
        balloonMarker.rotation.set(-Math.PI / 2, 0, 0);
        balloonMarker.scale.setScalar(1 + progress * effect.grow);
        balloonMarker.updateMatrix();
        popEffectMesh.setMatrixAt(index, balloonMarker.matrix);
        popEffectMesh.setColorAt(index, new T.Color(effect.color));
      }
      popEffectMesh.count = anims.length;
      popEffectMesh.instanceMatrix.needsUpdate = true;
      if (popEffectMesh.instanceColor) popEffectMesh.instanceColor.needsUpdate = true;

      // Dash marks share one bright instanced draw so their motion language is
      // distinct from both colored balloons and gold pickups.
      for (let index = dashTrails.length - 1; index >= 0; index--) {
        const trail = dashTrails[index];
        trail.t += dt;
        if (trail.t >= trail.dur) dashTrails.splice(index, 1);
      }
      for (let index = 0; index < dashTrails.length; index++) {
        const trail = dashTrails[index];
        const progress = trail.t / trail.dur;
        balloonMarker.position.set(trail.x, 0.145, trail.z);
        balloonMarker.rotation.set(-Math.PI / 2, 0, 0);
        balloonMarker.scale.setScalar(0.75 * (1 + progress * trail.grow));
        balloonMarker.updateMatrix();
        dashTrailMesh.setMatrixAt(index, balloonMarker.matrix);
      }
      dashTrailMesh.count = dashTrails.length;
      dashTrailMesh.instanceMatrix.needsUpdate = true;

      // Camera orbit follows movement until the player drags to inspect the arena.
      const focus = (player && player.alive) ? player : aliveList()[0];
      if (focus) {
        const fx = focus.state.pos.x, fy = focus.state.pos.y, fz = focus.state.pos.z;
        const autoYaw = player?.alive && framePad.moving
          ? Math.atan2(player.state.vel.x, player.state.vel.z)
          : null;
        updateOrbitState(camOrbit, framePad, dt, { autoYaw, autoRate: 1.8 });
        const portrait = T.MathUtils.clamp((0.9 - camera.aspect) / 0.4, 0, 1);
        const cameraHeight = 9.5 + portrait * 1.5;
        const cameraDistance = 11 + portrait * 2;
        camFocus.set(fx, fy, fz);
        camLook.set(fx, fy + 1.2, fz);
        orbitCameraPosition(camTarget, camFocus, camOrbit, cameraDistance, cameraHeight);
        resolveCameraObstruction(
          cameraRay, camLook, camTarget, cameraColliders, camResolved,
          { minDistance: 2 },
        );
        camPos.lerp(camResolved, 1 - Math.exp(-5 * dt));
        resolveCameraObstruction(
          cameraRay, camLook, camPos, cameraColliders, camResolved,
          { minDistance: 2 },
        );
        camera.position.copy(camResolved);
        camera.lookAt(camLook);
      }

      updateHud();
    });

    // ---------- View override (full-screen game view) ----------
    ctx.view.current = { scene, camera };
    const onResize = () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    ctx.ui.toast(ctx.input.isTouchDevice
      ? '🎈 DASH into rivals. Pop all 3 balloons!'
      : '🎈 Press E or Shift to DASH. Pop all 3 balloons!');

    // ---------- Unmount: remove everything we added ----------
    return {
      unmount() {
        disposed = true;
        stop();
        window.removeEventListener('resize', onResize);
        objectiveCard.close();
        if (resultsPanel) { try { resultsPanel.destroy(); } catch {} resultsPanel = null; }
        hud.remove();
        abilityEl.remove();
        tutorialEl.remove();
        impactEl.remove();
        localStyles.remove();
        bannerEl.remove();
        document.body.classList.remove('balloon-mode');
        delete document.body.dataset.balloonPhase;
        delete document.body.dataset.balloonFinal;
        if (grabButton) {
          grabButton.textContent = grabButtonText;
          if (grabButtonAria == null) grabButton.removeAttribute('aria-label');
          else grabButton.setAttribute('aria-label', grabButtonAria);
          grabButton.style.cssText = grabButtonStyle;
        }
        for (const c of combatants) {
          if (c.bot) c.bot.dispose();
          else c.character?.dispose();
          scene.remove(c.group);
          scene.remove(c.br.rig);
        }
        for (const it of [...items]) removeItem(it);
        anims.length = 0;
        dashTrails.length = 0;
        arena.dispose();
        for (const g of sharedGeos) g.dispose();
        for (const m of sharedMats) m.dispose();
        if (ctx.view.current && ctx.view.current.scene === scene) ctx.view.current = null;
      },
    };
  },
});
