// squid67.js — Squid 67: a two-stage local elimination gauntlet.
//
// Stage 1 is Red Light / Green Light on a walled sand field: a doll at the far
// gate turns away on green and faces the field on red; anyone still moving on
// red is caught. Stage 2 is the Glass Bridge: paired panes over a void, one
// safe per row, revealed by whoever steps first. The layout and the controls
// are the shared 67VERSE ones (stepPlayer sim, chase camera, stick/WASD); only
// the cast is ours — the equipped 67 character plus training rivals.
//
// Local-honest like every other mode: bots are training rivals, being caught
// costs a strike and a reset instead of a hard elimination for the player, and
// the result is committed through the shared local game-result contract.
import { createCloudSea, createSkyDome, SKY_LOW } from '../core/sky.js';
import { registerGame } from '../core/registry.js';
import { createPlayerState, stepPlayer } from '../player.js';
import { spawnBot } from '../core/bots.js';
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

const SIM_DT = 1 / 60;
const BOT_COUNT = 4;
const BOT_CHARS = ['kid', 'cat', 'robot', 'ninja'];

// ---- Field geometry (one scene holds both stages) ----
const FIELD_HALF_X = 11;      // sand field half width
const START_Z = 26;           // players line up here
const FINISH_Z = -30;         // crossing this line survives stage 1
const GATE_Z = -33;           // wall with the sliding door
const BRIDGE_START_Z = -38;   // safe platform before the panes
const BRIDGE_ROWS = 8;
const BRIDGE_ROW_STEP = 3.1;  // z distance between pane rows
const BRIDGE_FIRST_ROW_Z = -44;
const PANE_HALF = 1.3;        // pane half extent (2.6 x 2.6)
const PANE_X = 2.1;           // pane centers at +-PANE_X
const FAR_PLATFORM_Z = -44 - BRIDGE_ROWS * BRIDGE_ROW_STEP - 4;
const VOID_Y = -40;

registerGame({
  id: 'squid67',
  name: 'Squid 67',
  hint: 'Red light, green light — then the bridge',
  color: 0xd65c8a,

  mount(ctx, opts = {}) {
    ctx.party ||= createPartySession(ctx);
    const T = ctx.THREE;
    document.body.classList.add('squid67-mode');
    const query = new URLSearchParams(location.search);
    const qaFast = query.get('qa') === '1';
    const rlglDuration = qaFast ? 20 : 75;
    const bridgeDuration = qaFast ? 30 : 90;

    // ---------- Scene ----------
    const scene = new T.Scene();
    scene.add(createSkyDome(T));
    scene.add(createCloudSea(T, { layout: 'radial', radius: 96, seed: 670067 }));
    scene.fog = new T.Fog(SKY_LOW, 60, 170);
    const camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
    scene.add(new T.HemisphereLight(0xfff2de, 0xd8c4a8, 0.95));
    const sun = new T.DirectionalLight(0xffe2b8, 1.5);
    sun.position.set(20, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    const disposables = [];
    const track = (mesh) => {
      mesh.traverse((o) => {
        if (o.geometry) disposables.push(o.geometry);
        if (o.material) disposables.push(...(Array.isArray(o.material) ? o.material : [o.material]));
      });
      return mesh;
    };
    const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.72, ...extra });

    // ---------- Stage 1: the sand field ----------
    const sand = new T.Mesh(
      new T.BoxGeometry(FIELD_HALF_X * 2 + 6, 0.5, START_Z - GATE_Z + 12),
      mat(0xdcc9a5),
    );
    sand.position.set(0, -0.25, (START_Z + GATE_Z) / 2 + 2);
    sand.receiveShadow = true;
    scene.add(track(sand));

    const wallMat = mat(0xc8687a, { roughness: 0.6 });
    const sideWallGeo = new T.BoxGeometry(1.2, 6, START_Z - GATE_Z + 12);
    for (const side of [-1, 1]) {
      const wall = new T.Mesh(sideWallGeo, wallMat);
      wall.position.set(side * (FIELD_HALF_X + 1.6), 3, (START_Z + GATE_Z) / 2 + 2);
      wall.castShadow = true;
      scene.add(track(wall));
    }
    // One step behind the chase camera's rest position, so the opening frame
    // never starts inside the wall.
    const backWall = new T.Mesh(new T.BoxGeometry(FIELD_HALF_X * 2 + 6, 6, 1.2), wallMat);
    backWall.position.set(0, 3, START_Z + 8.5);
    scene.add(track(backWall));

    // Gate wall with a sliding door: survivors of stage 1 walk through it.
    const gateSpan = 3.4;
    for (const side of [-1, 1]) {
      const seg = new T.Mesh(
        new T.BoxGeometry(FIELD_HALF_X + 3 - gateSpan / 2, 7, 1.4),
        wallMat,
      );
      seg.position.set(side * ((FIELD_HALF_X + 3) / 2 + gateSpan / 2), 3.5, GATE_Z);
      seg.castShadow = true;
      scene.add(track(seg));
    }
    const gateDoor = new T.Mesh(new T.BoxGeometry(gateSpan, 6.4, 0.9), mat(0x8a5a68));
    gateDoor.position.set(0, 3.2, GATE_Z);
    gateDoor.castShadow = true;
    scene.add(track(gateDoor));

    // Finish line strip on the sand.
    const finishStrip = new T.Mesh(
      new T.BoxGeometry(FIELD_HALF_X * 2, 0.06, 0.9),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    );
    finishStrip.position.set(0, 0.03, FINISH_Z);
    scene.add(track(finishStrip));

    // The doll: turned away on green, facing the field on red. Simple authored
    // primitives — orange dress, head with two dark eyes on the front face.
    const doll = new T.Group();
    const dollBody = new T.Mesh(new T.ConeGeometry(1.5, 3.4, 20), mat(0xe8873c));
    dollBody.position.y = 1.7;
    dollBody.castShadow = true;
    const dollHead = new T.Mesh(new T.SphereGeometry(1.05, 20, 16), mat(0xf0c8a0));
    dollHead.position.y = 4.1;
    dollHead.castShadow = true;
    const eyeGeo = new T.SphereGeometry(0.16, 10, 8);
    const eyeMat = new T.MeshStandardMaterial({ color: 0x181820, roughness: 0.3 });
    const eyeL = new T.Mesh(eyeGeo, eyeMat);
    const eyeR = new T.Mesh(eyeGeo, eyeMat);
    // Eyes on +z side of the head: the doll faces the field when yaw = 0.
    eyeL.position.set(-0.34, 4.25, 0.95);
    eyeR.position.set(0.34, 4.25, 0.95);
    doll.add(dollBody, dollHead, eyeL, eyeR);
    // Field side of the gate, past the finish line, so every player sees the
    // turn happen — the doll IS the signal in the reference game.
    doll.position.set(0, 0, GATE_Z + 1.4);
    doll.rotation.y = Math.PI; // green: facing away
    scene.add(track(doll));

    // Traffic lamp above the gate — the readable state signal at distance.
    const lampPost = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5), mat(0x30303a));
    lampPost.position.set(0, 7.6, GATE_Z);
    const lampGlow = new T.Mesh(
      new T.SphereGeometry(0.62, 16, 12),
      new T.MeshStandardMaterial({ color: 0x3ecf6a, emissive: 0x3ecf6a, emissiveIntensity: 1.4, roughness: 0.4 }),
    );
    lampGlow.position.set(0, 6.7, GATE_Z);
    scene.add(track(lampPost), track(lampGlow));

    // ---------- Stage 2: glass bridge over the void ----------
    const platMat = mat(0x6b7280, { roughness: 0.55 });
    const bridgeStart = new T.Mesh(new T.BoxGeometry(10, 0.6, 6), platMat);
    bridgeStart.position.set(0, -0.3, BRIDGE_START_Z);
    bridgeStart.receiveShadow = true;
    scene.add(track(bridgeStart));
    const farPlatform = new T.Mesh(new T.BoxGeometry(12, 0.6, 7), platMat);
    farPlatform.position.set(0, -0.3, FAR_PLATFORM_Z);
    farPlatform.receiveShadow = true;
    scene.add(track(farPlatform));
    const crown = new T.Mesh(
      new T.TorusGeometry(1.15, 0.12, 10, 30),
      new T.MeshStandardMaterial({ color: 0xf7c948, emissive: 0xf7c948, emissiveIntensity: 0.7, roughness: 0.4 }),
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 0.4, FAR_PLATFORM_Z - 1);
    scene.add(track(crown));

    // Safe side per row, decided at mount. Revealed knowledge accumulates for
    // everyone — exactly the bridge's video logic.
    const safeSide = Array.from({ length: BRIDGE_ROWS }, () => (Math.random() < 0.5 ? 0 : 1));
    const paneAlive = Array.from({ length: BRIDGE_ROWS }, () => [true, true]);
    const paneRevealed = Array.from({ length: BRIDGE_ROWS }, () => false);
    const paneMeshes = [];
    const paneGeo = new T.BoxGeometry(PANE_HALF * 2, 0.24, PANE_HALF * 2);
    for (let row = 0; row < BRIDGE_ROWS; row++) {
      paneMeshes.push([null, null]);
      for (let side = 0; side < 2; side++) {
        const pane = new T.Mesh(paneGeo, new T.MeshStandardMaterial({
          color: 0xbfe3ef,
          roughness: 0.15,
          metalness: 0.05,
          transparent: true,
          opacity: 0.55,
        }));
        pane.position.set(side === 0 ? -PANE_X : PANE_X, -0.12, BRIDGE_FIRST_ROW_Z - row * BRIDGE_ROW_STEP);
        pane.receiveShadow = true;
        scene.add(track(pane));
        paneMeshes[row][side] = pane;
      }
    }
    const paneRowZ = (row) => BRIDGE_FIRST_ROW_Z - row * BRIDGE_ROW_STEP;
    const paneAt = (x, z) => {
      for (let row = 0; row < BRIDGE_ROWS; row++) {
        const rz = paneRowZ(row);
        if (Math.abs(z - rz) > PANE_HALF) continue;
        for (let side = 0; side < 2; side++) {
          const px = side === 0 ? -PANE_X : PANE_X;
          if (Math.abs(x - px) <= PANE_HALF) return { row, side };
        }
      }
      return null;
    };

    // ---------- Analytic ground: field, platforms, living panes — else void ----------
    function sampleGround(x, z) {
      if (z >= GATE_Z - 0.6 && Math.abs(x) <= FIELD_HALF_X + 2.4) return { y: 0, box2: null };
      if (Math.abs(z - BRIDGE_START_Z) <= 3 && Math.abs(x) <= 5) return { y: 0, box2: null };
      if (Math.abs(z - FAR_PLATFORM_Z) <= 3.5 && Math.abs(x) <= 6) return { y: 0, box2: null };
      const pane = paneAt(x, z);
      if (pane && paneAlive[pane.row][pane.side]) return { y: 0, box2: null };
      return { y: VOID_Y, box2: null };
    }
    const env = { sampleGround, bounds: 90 };

    // ---------- HUD ----------
    const localStyles = document.createElement('style');
    localStyles.textContent = `
      .squid-hud{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:55;
        display:flex;gap:8px;align-items:center;pointer-events:none;
        font:500 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#060c21}
      .squid-pill{padding:9px 15px;background:rgba(255,255,255,.94);border:1px solid #e5e5ea;
        border-radius:999px;box-shadow:0 4px 14px rgba(6,12,33,.12);white-space:nowrap}
      .squid-timer{min-width:82px;text-align:center;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
      .squid-stage{font-weight:600;background:#d65c8a;color:#fff;border-color:#d65c8a}
      .squid-controls{background:rgba(6,12,33,.84);color:#fff;border-color:transparent;font-size:11px}
      .squid-center{position:fixed;top:32%;left:50%;transform:translate(-50%,-50%);z-index:55;
        width:min(680px,calc(100vw - 32px));pointer-events:none;text-align:center;
        font:700 46px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
        color:#060c21;text-shadow:0 2px 12px rgba(255,255,255,.9);white-space:pre-line}
      .squid-redwash{position:fixed;inset:0;z-index:50;pointer-events:none;opacity:0;
        background:radial-gradient(ellipse at center, rgba(214,60,60,.14) 0%, rgba(178,32,44,.34) 100%);
        transition:opacity .18s linear}
      body[data-squid-light="red"] .squid-redwash{opacity:1}
      body.squid67-mode #btn-grab{display:none}
      @media(max-width:600px){
        .squid-hud{top:calc(env(safe-area-inset-top) + 62px);left:calc(env(safe-area-inset-left) + 8px);right:calc(env(safe-area-inset-right) + 8px);transform:none;justify-content:center;gap:5px;flex-wrap:wrap}
        .squid-pill{padding:7px 11px;font-size:12px}.squid-timer{min-width:70px;font-size:14px}
        .squid-controls{order:4;flex-basis:100%;text-align:center}
        .squid-center{font-size:34px}
      }
    `;
    document.head.appendChild(localStyles);
    const hud = document.createElement('div');
    hud.className = 'squid-hud';
    hud.setAttribute('role', 'group');
    hud.setAttribute('aria-label', 'Squid 67 round status');
    const timerPill = document.createElement('div');
    timerPill.className = 'squid-pill squid-timer';
    const stagePill = document.createElement('div');
    stagePill.className = 'squid-pill squid-stage';
    stagePill.textContent = 'RED LIGHT · GREEN LIGHT';
    const strikePill = document.createElement('div');
    strikePill.className = 'squid-pill';
    strikePill.textContent = 'Strikes 0';
    const alivePill = document.createElement('div');
    alivePill.className = 'squid-pill';
    const controlsPill = document.createElement('div');
    controlsPill.className = 'squid-pill squid-controls';
    controlsPill.textContent = 'Move only on GREEN · freeze on RED';
    hud.append(timerPill, stagePill, strikePill, alivePill, controlsPill);
    const centerMsg = document.createElement('div');
    centerMsg.className = 'squid-center';
    centerMsg.setAttribute('aria-live', 'assertive');
    const redWash = document.createElement('div');
    redWash.className = 'squid-redwash';
    document.body.append(hud, centerMsg, redWash);

    const objectiveCard = ctx.party.objective({
      icon: '67',
      title: 'Squid 67',
      objective: 'Reach the gate — move on green, freeze on red. Then cross the glass bridge: one pane per row holds.',
      controls: ctx.input.isTouchDevice
        ? 'Move with the stick · release it the instant the light turns red.'
        : 'WASD / arrows move · Space jumps · stop dead on red.',
    });

    function fmtTime(s) {
      const m = Math.floor(Math.max(0, s) / 60);
      const sec = Math.floor(Math.max(0, s) % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    }

    // ---------- Cast ----------
    const player = {
      kind: 'player',
      state: createPlayerState(0, START_Z),
      group: new T.Group(),
      alive: true,
      finishedStage: 0,
      progress: 0,
    };
    player.state.yaw = Math.PI;
    scene.add(player.group);
    let playerCharacter = null;
    ctx.characters.createInstance(ctx.characters.equippedId(), {
      skinTone: ctx.save.settings.skinTone,
      lod: 'game',
      shadow: 'hero',
    }).then((instance) => {
      if (ended) { instance.dispose(); return; }
      scene.remove(player.group);
      playerCharacter = instance;
      player.group = instance.root;
      scene.add(player.group);
    }).catch((e) => {
      console.error('[squid67] player mesh failed', e);
      ctx.sessionTelemetry?.record('recoverable_error', {
        area: 'character-load', code: 'squid67-player-fallback',
        routeKind: 'character', routeId: 'squid67',
      });
    });

    const rivals = [];
    let botsReady = false;
    const spawnXs = [-6, -3, 3, 6];
    (async () => {
      try {
        for (let i = 0; i < BOT_COUNT; i++) {
          const bot = await spawnBot(ctx, scene, env, {
            charId: BOT_CHARS[i % BOT_CHARS.length],
            x: spawnXs[i % spawnXs.length],
            z: START_Z,
            behavior: rivalBehavior,
          });
          bot.state.yaw = Math.PI;
          rivals.push({
            kind: 'bot', bot, state: bot.state, group: bot.group,
            alive: true, finishedStage: 0, progress: 0,
            // Per-rival temperament: reaction to red, pace, twitch risk.
            reaction: 0.1 + Math.random() * 0.3,
            pace: 0.55 + Math.random() * 0.4,
            twitchRisk: 0.05 + Math.random() * 0.06,
            pauseUntil: 0,
            reactionLeft: 0,
            doomed: false,
            bridgeTarget: null,
          });
        }
      } catch (e) {
        console.error('[squid67] rival spawn failed', e);
        ctx.sessionTelemetry?.record('recoverable_error', {
          area: 'character-load', code: 'squid67-bot-fallback',
          routeKind: 'character', routeId: 'squid67',
        });
      }
      botsReady = true;
    })();
    const everyone = () => [player, ...rivals];

    // ---------- Round state ----------
    let ended = false;
    let departed = false;
    let phase = 'countdown'; // countdown | rlgl | bridge | results
    document.body.dataset.squidPhase = phase;
    let countdown = 3.4;
    let timeLeft = rlglDuration;
    let strikes = 0;
    let simTime = 0;
    let resultsPanel = null;

    // Light state machine.
    let light = 'green'; // green | warn | red
    let lightLeft = 2.6;
    let dollTurn = 0; // 0 = away (green), 1 = facing (red)
    const setLight = (next) => {
      light = next;
      document.body.dataset.squidLight = next === 'red' ? 'red' : 'green';
      if (next === 'green') {
        lightLeft = 2.1 + Math.random() * 2.4;
        lampGlow.material.color.set(0x3ecf6a);
        lampGlow.material.emissive.set(0x3ecf6a);
        centerMsg.textContent = phase === 'rlgl' ? 'GREEN LIGHT' : '';
        ctx.bus.emit('sfx', 'ui');
      } else if (next === 'warn') {
        lightLeft = 0.45;
        lampGlow.material.color.set(0xf7c948);
        lampGlow.material.emissive.set(0xf7c948);
      } else {
        lightLeft = 1.5 + Math.random() * 1.7;
        lampGlow.material.color.set(0xe23d3d);
        lampGlow.material.emissive.set(0xe23d3d);
        centerMsg.textContent = phase === 'rlgl' ? 'RED LIGHT' : '';
        ctx.bus.emit('sfx', 'launch');
      }
    };

    // Elimination flourish for rivals: shrink out, then drop from the cast.
    const dying = [];
    function eliminateRival(rival, why) {
      if (!rival.alive) return;
      rival.alive = false;
      dying.push({ rival, t: 0 });
      ctx.bus.emit('sfx', 'pop');
      announce(`${why} — a rival is out`, 1.6);
    }
    let announceLeft = 0;
    function announce(text, seconds) {
      centerMsg.style.fontSize = '';
      centerMsg.textContent = text;
      announceLeft = seconds;
    }

    function playerCaught(reason) {
      strikes += 1;
      strikePill.textContent = `Strikes ${strikes}`;
      ctx.bus.emit('sfx', 'pop');
      const backTo = phase === 'rlgl'
        ? { x: 0, z: START_Z }
        : { x: 0, z: BRIDGE_START_Z };
      player.state.pos.x = backTo.x;
      player.state.pos.z = backTo.z;
      player.state.pos.y = 0;
      player.state.vel.x = 0;
      player.state.vel.y = 0;
      player.state.vel.z = 0;
      player.state.grounded = true;
      player.state.yaw = Math.PI;
      announce(`${reason}\nBack to the line`, 1.8);
      playerCharacter?.animator.signal('impact');
    }

    // ---------- Rival behavior (deterministic sim inputs) ----------
    function rivalBehavior(bot, dt) {
      const rival = rivals.find((r) => r.bot === bot);
      if (!rival || !rival.alive || phase === 'countdown' || phase === 'results') {
        return { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
      }
      if (phase === 'rlgl') {
        if (rival.finishedStage >= 1) {
          // Wait just past the finish line for the bridge.
          return { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
        }
        if (light === 'green') {
          rival.reactionLeft = rival.reaction;
          if (simTime < rival.pauseUntil) {
            return { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
          }
          if (Math.random() < 0.004) rival.pauseUntil = simTime + 0.4 + Math.random() * 0.5;
          const drift = Math.sin(simTime * 1.7 + rival.pace * 9) * 0.18;
          return { dirX: drift, dirZ: -rival.pace, moving: true, jumpHeld: false, grabPressed: false };
        }
        // warn/red: keep running only while personal reaction time lasts.
        if (rival.reactionLeft > 0) {
          rival.reactionLeft -= dt;
          return { dirX: 0, dirZ: -rival.pace, moving: true, jumpHeld: false, grabPressed: false };
        }
        return { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
      }
      // Bridge: walk the revealed-safe path; guess at the frontier.
      if (rival.finishedStage >= 2) {
        return { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
      }
      const z = rival.state.pos.z;
      let targetRow = 0;
      while (targetRow < BRIDGE_ROWS && paneRowZ(targetRow) > z - 0.4) targetRow += 1;
      if (targetRow >= BRIDGE_ROWS) {
        // Past the last row: head for the crown.
        const dx = -rival.state.pos.x * 0.4;
        return { dirX: dx, dirZ: -0.85, moving: true, jumpHeld: false, grabPressed: false };
      }
      if (rival.bridgeTarget == null || rival.bridgeTarget.row !== targetRow) {
        const known = paneRevealed[targetRow];
        const side = known
          ? safeSide[targetRow]
          : (Math.random() < 0.5 ? 0 : 1);
        rival.bridgeTarget = { row: targetRow, side };
      }
      const targetX = rival.bridgeTarget.side === 0 ? -PANE_X : PANE_X;
      const targetZ = paneRowZ(rival.bridgeTarget.row);
      const dx = T.MathUtils.clamp((targetX - rival.state.pos.x) * 0.9, -1, 1);
      const dz = T.MathUtils.clamp((targetZ - rival.state.pos.z) * 0.9, -1, -0.25);
      return { dirX: dx, dirZ: dz, moving: true, jumpHeld: false, grabPressed: false };
    }

    // ---------- Stage transitions ----------
    function beginBridge() {
      phase = 'bridge';
      document.body.dataset.squidPhase = phase;
      timeLeft = bridgeDuration;
      stagePill.textContent = 'GLASS BRIDGE';
      controlsPill.textContent = 'One pane per row holds · broken panes stay revealed';
      delete document.body.dataset.squidLight;
      centerMsg.textContent = '';
      gateDoor.position.y = -3.4; // door slides down into the ground
      // Carry the survivors to the bridge start.
      player.state.pos.x = 0;
      player.state.pos.z = BRIDGE_START_Z;
      player.state.pos.y = 0;
      player.state.vel.x = 0; player.state.vel.y = 0; player.state.vel.z = 0;
      player.state.grounded = true;
      player.state.yaw = Math.PI;
      let slot = -1;
      for (const rival of rivals) {
        if (!rival.alive) continue;
        slot += 1;
        rival.state.pos.x = (slot % 2 === 0 ? -1 : 1) * (2 + slot);
        rival.state.pos.z = BRIDGE_START_Z + 1.2;
        rival.state.pos.y = 0;
        rival.state.vel.x = 0; rival.state.vel.y = 0; rival.state.vel.z = 0;
        rival.state.grounded = true;
        rival.bridgeTarget = null;
      }
      announce('THE GLASS BRIDGE\nOne pane per row holds', 2.4);
      ctx.sessionTelemetry?.record('game_phase', { gameId: 'squid67', phase: 'bridge' });
    }

    function breakPane(row, side) {
      if (!paneAlive[row][side]) return;
      paneAlive[row][side] = false;
      paneRevealed[row] = true;
      const paneMesh = paneMeshes[row][side];
      dyingPanes.push({ mesh: paneMesh, t: 0 });
      ctx.bus.emit('sfx', 'pop');
    }
    const dyingPanes = [];

    // Safe pane stepped on -> the row is revealed knowledge for everyone.
    function notePaneContact(participant) {
      if (phase !== 'bridge' || !participant.state.grounded) return;
      const pane = paneAt(participant.state.pos.x, participant.state.pos.z);
      if (!pane) return;
      if (pane.side === safeSide[pane.row]) {
        paneRevealed[pane.row] = true;
        return;
      }
      breakPane(pane.row, pane.side);
    }

    // ---------- Results ----------
    function computeProgress(p) {
      if (phase === 'rlgl' || p.finishedStage < 1) {
        return T.MathUtils.clamp((START_Z - p.state.pos.z) / (START_Z - FINISH_Z), 0, 1);
      }
      const span = BRIDGE_START_Z - FAR_PLATFORM_Z;
      return 1 + T.MathUtils.clamp((BRIDGE_START_Z - p.state.pos.z) / span, 0, 1);
    }
    function endRound(playerWon) {
      if (phase === 'results') return;
      phase = 'results';
      document.body.dataset.squidPhase = phase;
      delete document.body.dataset.squidLight;
      for (const p of everyone()) p.progress = computeProgress(p);
      const order = everyone()
        .map((p, index) => ({ p, index }))
        .sort((a, b) => (
          (b.p.finishedStage - a.p.finishedStage)
          || (Number(b.p.alive) - Number(a.p.alive))
          || (b.p.progress - a.p.progress)
        ));
      const placement = order.findIndex(({ index }) => index === 0) + 1;
      const aliveCount = everyone().filter((p) => p.alive).length;
      const score = Math.max(0, Math.round(
        (playerWon ? 120 : 0) + timeLeft * 2 - strikes * 12 + player.finishedStage * 40,
      ));
      const coins = 10 + Math.floor(score / 14) + Math.max(0, 6 - placement);
      const result = commitLocalGameReward(ctx.save, {
        game: 'squid67',
        gameId: 'squid67',
        score,
        coins,
        placement,
        stageReached: player.finishedStage + (playerWon ? 0 : 1),
        strikes,
        survivors: aliveCount,
        won: playerWon,
      }, 'squid67-round');
      if (!result.rewardCommitted) {
        ctx.ui.toast('Coins could not be saved on this device. Quest and Season progress were not advanced.');
      }
      if (playerWon) playerCharacter?.animator.play('celebrate');
      centerMsg.textContent = playerWon ? 'YOU SURVIVED!' : 'ROUND OVER';
      setTimeout(() => { if (!ended) centerMsg.textContent = ''; }, 1400);
      const finish = () => {
        if (ended || departed) return;
        departed = true;
        ctx.goHome(result);
      };
      const replay = () => {
        if (ended || departed) return;
        departed = true;
        ctx.replayGame?.('squid67', result);
      };
      const nestedShowRound = opts.mode === 'show67';
      resultsPanel = ctx.party.result({
        title: 'Squid 67 — Round Over',
        icon: '67',
        outcome: playerWon ? `Survived · ${score} points` : `#${placement} · ${score} points`,
        summary: playerWon
          ? `Both stages cleared with ${strikes} strike${strikes === 1 ? '' : 's'} and ${fmtTime(timeLeft)} to spare.`
          : `Reached ${player.finishedStage >= 1 ? 'the glass bridge' : 'the field'} with ${strikes} strike${strikes === 1 ? '' : 's'}.`,
        note: nestedShowRound ? '67 Show · local round' : 'Local training gauntlet',
        stats: [
          { label: 'Placement', value: `#${placement} / ${everyone().length}` },
          { label: 'Stages cleared', value: String(player.finishedStage) },
          { label: 'Strikes', value: String(strikes) },
          { label: 'Rivals left', value: String(aliveCount - (player.alive ? 1 : 0)) },
          { label: 'Coins earned', value: localGameRewardStat(result) },
        ],
        onReplay: nestedShowRound ? null : replay,
        homeLabel: nestedShowRound ? 'Continue 67 Show' : 'Return to Skypark',
        onHome: finish,
      });
      ctx.sessionTelemetry?.record('game_phase', { gameId: 'squid67', phase: 'results' });
    }

    // ---------- Camera ----------
    const camOrbit = createOrbitState(Math.PI);
    const camFocus = new T.Vector3();
    const camLook = new T.Vector3();
    const camTarget = new T.Vector3();
    const camResolved = new T.Vector3();
    const camPos = new T.Vector3(0, 4.5, START_Z + 6);
    // The countdown branch returns before the per-frame camera block, so the
    // opening frame must already be composed here: behind the start line,
    // looking down the field at the doll.
    camera.position.copy(camPos);
    camera.lookAt(0, 1.4, START_Z - 6);
    const cameraRay = new T.Raycaster();
    const cameraColliders = [];
    scene.traverse((o) => { if (o.isMesh && o.material === wallMat) cameraColliders.push(o); });

    // ---------- Main ticker ----------
    let acc = 0;
    const stop = ctx.loop.add((dt) => {
      if (!botsReady) return;

      // Rival elimination + pane shatter animations run in wall time.
      for (let i = dying.length - 1; i >= 0; i--) {
        const d = dying[i];
        d.t += dt / 0.6;
        if (d.t >= 1) {
          d.rival.bot.dispose();
          d.rival.botDisposed = true;
          dying.splice(i, 1);
        } else {
          d.rival.group.scale.setScalar(1 - d.t);
          d.rival.group.rotation.y += dt * 9;
        }
      }
      for (let i = dyingPanes.length - 1; i >= 0; i--) {
        const d = dyingPanes[i];
        d.t += dt / 0.5;
        if (d.t >= 1) {
          d.mesh.visible = false;
          dyingPanes.splice(i, 1);
        } else {
          d.mesh.position.y = -0.12 - d.t * 6;
          d.mesh.material.opacity = 0.55 * (1 - d.t);
        }
      }
      if (announceLeft > 0) {
        announceLeft -= dt;
        if (announceLeft <= 0 && phase !== 'results') centerMsg.textContent = '';
      }
      // Doll turn animation follows the light.
      const dollGoal = light === 'green' ? 1 : 0; // 1 = away
      dollTurn += (dollGoal - dollTurn) * Math.min(1, dt * 7);
      doll.rotation.y = Math.PI * dollTurn;

      if (phase === 'results') {
        playerCharacter?.animator.update(dt, { speed: 0, grounded: true });
        return;
      }
      if (phase === 'countdown') {
        countdown -= dt;
        centerMsg.textContent = countdown > 0.5 ? String(Math.ceil(countdown)) : 'GO!';
        if (countdown <= 0) {
          phase = 'rlgl';
          document.body.dataset.squidPhase = phase;
          setLight('green');
          objectiveCard.close();
          ctx.sessionTelemetry?.record('game_phase', { gameId: 'squid67', phase: 'rlgl' });
        }
        return;
      }

      const pad = ctx.input.poll();
      const direction = cameraRelativeDirection(pad, camOrbit.yaw);
      const simInput = {
        dirX: direction.x,
        dirZ: direction.z,
        moving: direction.moving,
        jumpHeld: pad.jumpHeld,
        sprintHeld: pad.sprintHeld,
        grabPressed: false,
      };

      acc += dt;
      while (acc >= SIM_DT) {
        acc -= SIM_DT;
        simTime += SIM_DT;
        timeLeft -= SIM_DT;

        if (phase === 'rlgl') {
          lightLeft -= SIM_DT;
          if (lightLeft <= 0) setLight(light === 'green' ? 'warn' : light === 'warn' ? 'red' : 'green');
        }

        const wasGrounded = player.state.grounded;
        stepPlayer(player.state, simInput, SIM_DT, env);
        if (player.state.jumpEvent) playerCharacter?.animator.signal('jump');
        if (!wasGrounded && player.state.grounded) playerCharacter?.animator.signal('land');
        for (const rival of rivals) {
          if (rival.alive) rival.bot.step(SIM_DT);
        }

        if (phase === 'rlgl') {
          // Red light: motion is a strike (player) or an elimination (rival).
          if (light === 'red') {
            const playerSpeed = Math.hypot(player.state.vel.x, player.state.vel.z);
            if (playerSpeed > 0.7 && player.finishedStage < 1) playerCaught('CAUGHT MOVING');
            for (const rival of rivals) {
              if (!rival.alive || rival.finishedStage >= 1) continue;
              const speed = Math.hypot(rival.state.vel.x, rival.state.vel.z);
              if (speed > 0.7 && rival.reactionLeft <= 0) eliminateRival(rival, 'CAUGHT MOVING');
              else if (Math.random() < rival.twitchRisk * SIM_DT) eliminateRival(rival, 'TWITCHED');
            }
          }
          for (const p of everyone()) {
            if (p.alive && p.finishedStage < 1 && p.state.pos.z <= FINISH_Z) {
              p.finishedStage = 1;
              if (p === player) announce('LINE CROSSED', 1.4);
            }
          }
          if (player.finishedStage >= 1) beginBridge();
          else if (timeLeft <= 0) { endRound(false); break; }
        } else if (phase === 'bridge') {
          notePaneContact(player);
          for (const rival of rivals) { if (rival.alive) notePaneContact(rival); }
          // Fallers.
          if (player.state.pos.y < -9) playerCaught('THE PANE BROKE');
          for (const rival of rivals) {
            if (rival.alive && rival.state.pos.y < -9) eliminateRival(rival, 'WRONG PANE');
          }
          for (const p of everyone()) {
            if (p.alive && p.finishedStage < 2 && p.state.pos.z <= FAR_PLATFORM_Z + 2) {
              p.finishedStage = 2;
            }
          }
          if (player.finishedStage >= 2) { endRound(true); break; }
          if (timeLeft <= 0) { endRound(false); break; }
        }
      }

      player.group.position.set(player.state.pos.x, player.state.pos.y, player.state.pos.z);
      player.group.rotation.y = player.state.yaw;
      playerCharacter?.animator.update(dt, {
        speed: Math.hypot(player.state.vel.x, player.state.vel.z),
        grounded: player.state.grounded,
      });

      // HUD.
      timerPill.textContent = fmtTime(timeLeft);
      const aliveRivals = rivals.filter((r) => r.alive).length;
      alivePill.textContent = `Rivals ${aliveRivals}/${BOT_COUNT}`;

      // Camera.
      updateOrbitState(camOrbit, pad, dt, {
        autoYaw: simInput.moving ? Math.atan2(simInput.dirX, simInput.dirZ) : null,
        autoRate: 2.2,
      });
      const portrait = T.MathUtils.clamp((0.9 - camera.aspect) / 0.4, 0, 1);
      camFocus.set(player.state.pos.x, Math.max(player.state.pos.y, -2), player.state.pos.z);
      camLook.set(player.state.pos.x, Math.max(player.state.pos.y, -2) + 1.4, player.state.pos.z);
      orbitCameraPosition(camTarget, camFocus, camOrbit, 6 + portrait * 1.25, 4.2 + portrait * 0.65);
      resolveCameraObstruction(cameraRay, camLook, camTarget, cameraColliders, camResolved);
      camPos.lerp(camResolved, 1 - Math.exp(-5 * dt));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    });

    ctx.view.current = { scene, camera };

    function unmount() {
      ended = true;
      stop();
      for (const rival of rivals) {
        if (!rival.botDisposed) rival.bot.dispose();
      }
      playerCharacter?.dispose();
      playerCharacter = null;
      objectiveCard.close();
      if (resultsPanel) resultsPanel.destroy();
      hud.remove();
      centerMsg.remove();
      redWash.remove();
      localStyles.remove();
      document.body.classList.remove('squid67-mode');
      delete document.body.dataset.squidPhase;
      delete document.body.dataset.squidLight;
      for (const d of disposables) d.dispose && d.dispose();
      if (ctx.view.current && ctx.view.current.scene === scene) ctx.view.current = null;
    }

    return { unmount };
  },
});
