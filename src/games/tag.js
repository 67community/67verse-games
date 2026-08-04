// tag.js — Tag / Chase mini-game (spec §7, first-priority launch game).
//
// Chaser-vs-runners in a compact fenced primitive arena. The player and 4 bots
// all run the same deterministic stepPlayer sim from ../player.js. A training
// rival opens as chaser; proximity transfers "it" with a no-tag-back recovery.
// Every participant scores safe seconds plus transfer bonuses, then receives a
// comparable local placement. Round end -> results/replay -> ctx.goHome(result).
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
import {
  rankTagParticipants,
  TAG_RULES,
  tagParticipantScore,
  tagPacingState,
  tagResultCue,
} from '../core/tag-rules.js';
import {
  buildTagArena,
  TAG_ARENA_HALF,
} from './tag-arena.js';
import { loadWorldItems } from '../world-items.js';

const SIM_DT = 1 / 60;         // fixed timestep, same as hub (server-compatible)
const BOT_COUNT = 4;           // player + 4 bots = 5 participants
const ARENA_HALF = TAG_ARENA_HALF;
const BOT_CHARS = ['kid', 'cat', 'robot', 'ninja']; // real characters.ROSTER ids

registerGame({
  id: 'tag',
  name: 'Tag',
  hint: 'Runners vs chasers',
  color: 0xd0775e,

  mount(ctx, opts = {}) {
    ctx.party ||= createPartySession(ctx);
    const T = ctx.THREE;
    document.body.classList.add('tag-mode');
    const query = new URLSearchParams(location.search);
    const visualQaTag = query.get('visualQaTag');
    const roundDuration = visualQaTag
      ? 30
      : query.get('qa') === '1' ? 5 : TAG_RULES.roundSeconds;

    // ---------- Scene ----------
    const scene = new T.Scene();
    // Keep the arena warm, but frame it against the same optimistic blue-sky
    // language as Skypark. The old beige-on-beige horizon made even readable
    // gameplay look unfinished.
    // Shared 67VERSE atmosphere: same gradient sky and cloud sea as the hub
    // and the Skyway course, so every mode reads as one world.
    scene.add(createSkyDome(T));
    scene.add(createCloudSea(T, { layout: 'radial', radius: 74, seed: 812365 }));
    scene.fog = new T.Fog(SKY_LOW, 40, 110);

    const camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);

    scene.add(new T.HemisphereLight(0xfff2de, 0xd8c4a8, 0.95));
    const sun = new T.DirectionalLight(0xffe2b8, 1.5);
    sun.position.set(18, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); // small arena — 1024 is plenty
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    // ---------- Switchyard Court ----------
    // Presentation is isolated from the deterministic Tag rules below. The
    // authored arena returns the same conservative walkable AABBs expected by
    // stepPlayer, so the visual rebuild does not change collision or pacing.
    const disposables = []; // geometries/materials to dispose on unmount
    const track = (mesh) => {
      mesh.traverse((o) => {
        if (o.geometry) disposables.push(o.geometry);
        if (o.material) disposables.push(...(Array.isArray(o.material) ? o.material : [o.material]));
      });
      return mesh;
    };
    const arena = buildTagArena(T, {
      highDetail: ctx.quality.getState().tier !== 'low',
    });
    scene.add(arena.root);
    const walkables = arena.walkables;

    // Authored Meshy buildings swap over the procedural skyline placeholders
    // once the GLB resolves; the arena keeps its authored layout either way.
    // The shared item geometry is never tracked/disposed here — arena.dispose
    // drops the whole root on unmount.
    loadWorldItems('/assets/items/')
      .then((worldItems) => {
        if (ended || !worldItems?.building?.geometry) return;
        const layout = arena.skylineLayout;
        if (!layout?.length) return;
        const instanced = new T.InstancedMesh(
          worldItems.building.geometry,
          worldItems.building.material,
          layout.length,
        );
        const placer = new T.Object3D();
        layout.forEach(({ x, z, height, width }, index) => {
          placer.position.set(x, -0.2, z);
          placer.rotation.set(0, (index % 3) * Math.PI / 6, 0);
          placer.scale.set(width * 2.4, height + 0.8, 2.6);
          placer.updateMatrix();
          instanced.setMatrixAt(index, placer.matrix);
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.name = 'tag-arena:meshy-skyline';
        instanced.castShadow = false;
        for (const name of ['tag-arena:ceramic-skyline', 'tag-arena:ceramic-roofs', 'tag-arena:city-windows']) {
          const placeholder = arena.root.getObjectByName(name);
          if (placeholder) arena.root.remove(placeholder);
        }
        arena.root.add(instanced);
      })
      .catch(() => {});

    // ---------- env for the shared deterministic sim (world.js pattern) ----------
    const ray = new T.Raycaster();
    const DOWN = new T.Vector3(0, -1, 0);
    const rayOrigin = new T.Vector3();
    function sampleGround(x, z, fromY) {
      rayOrigin.set(x, fromY, z);
      ray.set(rayOrigin, DOWN);
      ray.far = fromY + 4;
      const hits = ray.intersectObjects(walkables, false);
      if (hits.length > 0) {
        return { y: hits[0].point.y, box2: hits[0].object.userData.box2 || null };
      }
      return { y: 0, box2: null };
    }
    const env = { sampleGround, bounds: ARENA_HALF };

    // ---------- Chaser marker + tag flash visuals ----------
    const marker = new T.Mesh(
      new T.ConeGeometry(0.32, 0.55, 4),
      new T.MeshStandardMaterial({ color: 0xd0775e, emissive: 0xd0775e, emissiveIntensity: 0.5, roughness: 0.5 })
    );
    marker.rotation.x = Math.PI; // point down
    marker.castShadow = true;
    scene.add(track(marker));

    const chaserRing = new T.Mesh(
      new T.RingGeometry(0.55, 0.8, 28),
      new T.MeshBasicMaterial({ color: 0xd0775e, transparent: true, opacity: 0.75, side: T.DoubleSide, depthWrite: false })
    );
    chaserRing.rotation.x = -Math.PI / 2;
    scene.add(track(chaserRing));

    // Literal world-space role label. The cone and ring preserve the existing
    // shape cue; "IT" removes color-only ambiguity at phone size.
    const itCanvas = document.createElement('canvas');
    itCanvas.width = 256;
    itCanvas.height = 96;
    const itContext = itCanvas.getContext('2d');
    itContext.fillStyle = '#9a9aa2';
    itContext.beginPath();
    itContext.roundRect(38, 12, 180, 72, 32);
    itContext.fill();
    itContext.fillStyle = '#ffffff';
    itContext.font = '900 46px -apple-system, "Segoe UI", sans-serif';
    itContext.textAlign = 'center';
    itContext.textBaseline = 'middle';
    itContext.fillText('IT', 128, 49);
    const itTexture = new T.CanvasTexture(itCanvas);
    itTexture.colorSpace = T.SRGBColorSpace;
    disposables.push(itTexture);
    const itLabel = new T.Sprite(new T.SpriteMaterial({
      map: itTexture,
      transparent: true,
      depthWrite: false,
    }));
    itLabel.scale.set(2.15, 0.8, 1);
    scene.add(track(itLabel));

    // The Final Chase is one gameplay signal, not scenery density. It marks
    // the faster-transfer phase with a restrained rose arena pulse.
    const finalRing = new T.Mesh(
      new T.RingGeometry(9.6, 10.15, 64),
      new T.MeshBasicMaterial({
        color: 0xc46f8e,
        transparent: true,
        opacity: 0,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    finalRing.rotation.x = -Math.PI / 2;
    finalRing.position.y = 0.035;
    finalRing.visible = false;
    scene.add(track(finalRing));

    // A short sage shield shows the former chaser's no-tag-back recovery.
    const recoveryRing = new T.Mesh(
      new T.RingGeometry(0.78, 0.92, 28),
      new T.MeshBasicMaterial({
        color: 0x5a9c7a,
        transparent: true,
        opacity: 0.8,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    recoveryRing.rotation.x = -Math.PI / 2;
    recoveryRing.visible = false;
    scene.add(track(recoveryRing));

    const flash = new T.Mesh(
      new T.RingGeometry(0.5, 0.7, 32),
      new T.MeshBasicMaterial({ color: 0xe8b64a, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })
    );
    flash.rotation.x = -Math.PI / 2;
    scene.add(track(flash));
    let flashAnim = -1; // 0..1, -1 idle

    // ---------- Round state ----------
    const participants = []; // { kind, state, group, safeTime, tagsMade, immunity, longestIt }
    let chaserIdx = -1;
    let tagCooldown = 0;
    let timeLeft = roundDuration;
    let phase = 'loading'; // loading -> countdown -> playing -> results
    let countdown = visualQaTag ? 0.12 : 3;
    let currentChaserHold = 0;
    let roleChanges = 0;
    let finalChaseEntered = false;
    let announcementTime = 0;
    let announcementText = '';
    let currentPacing = tagPacingState(timeLeft, roundDuration, currentChaserHold);
    let ended = false;
    let departed = false;
    let resultsPanel = null;

    // ---------- HUD (own DOM, removed on unmount) ----------
    const localStyles = document.createElement('style');
    localStyles.textContent = `
      .tag-hud{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:55;
        display:flex;gap:8px;align-items:center;pointer-events:none;
        font:500 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#060c21}
      .tag-pill{padding:9px 15px;background:rgba(255,255,255,.94);border:1px solid #e5e5ea;
        border-radius:999px;box-shadow:0 4px 14px rgba(6,12,33,.12);white-space:nowrap}
      .tag-timer{min-width:82px;text-align:center;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
      .tag-role{font-weight:600}.tag-role[data-role="runner"]{background:#5a9c7a;color:#ffffff;border-color:#5a9c7a}
      .tag-role[data-role="it"]{background:#9a9aa2;color:#ffffff;border-color:#9a9aa2}
      .tag-phase{display:none;background:#8a6fb0;color:#ffffff;border-color:#8a6fb0;font-weight:600}
      .tag-safe{display:none;background:#e8f1df;color:#387657;border-color:#8bb89c;font-weight:600}
      .tag-controls{background:rgba(6,12,33,.84);color:#ffffff;border-color:transparent;
        font-size:11px;font-weight:500}
      .tag-center{position:fixed;top:34%;left:50%;transform:translate(-50%,-50%);z-index:55;
        width:min(620px,calc(100vw - 32px));pointer-events:none;text-align:center;
        font:600 44px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
        color:#060c21;text-shadow:0 2px 12px rgba(255,255,255,.9);white-space:pre-line}
      body.tag-mode #btn-grab{display:none}
      @media(max-width:600px){
        .tag-hud{top:calc(env(safe-area-inset-top) + 62px);left:calc(env(safe-area-inset-left) + 8px);right:calc(env(safe-area-inset-right) + 8px);transform:none;justify-content:center;gap:5px;flex-wrap:wrap}
        .tag-pill{padding:7px 11px;font-size:12px}.tag-timer{min-width:70px;font-size:14px}
        .tag-controls{order:4;flex-basis:100%;text-align:center}
        .tag-hud.is-starting .tag-controls{display:none}
        .tag-center{top:31%;font-size:36px}
        body.tag-mode .ps-objective.tag-start-objective{
          top:calc(env(safe-area-inset-top) + 108px);right:calc(env(safe-area-inset-right) + 8px);left:calc(env(safe-area-inset-left) + 8px);width:auto}
      }
    `;
    document.head.appendChild(localStyles);

    const hud = document.createElement('div');
    hud.className = 'tag-hud';
    hud.setAttribute('role', 'group');
    hud.setAttribute('aria-label', 'Tag round status');
    const timerPill = document.createElement('div');
    timerPill.className = 'tag-pill tag-timer';
    const scorePill = document.createElement('div');
    scorePill.className = 'tag-pill';
    const rolePill = document.createElement('div');
    rolePill.className = 'tag-pill tag-role';
    rolePill.dataset.role = 'runner';
    rolePill.textContent = 'RUNNER';
    const phasePill = document.createElement('div');
    phasePill.className = 'tag-pill tag-phase';
    phasePill.textContent = 'FINAL CHASE';
    const safePill = document.createElement('div');
    safePill.className = 'tag-pill tag-safe';
    // Keep the round controls visible without relying on a separate tutorial
    // screen. The input system swaps the wording for touch devices, so both
    // browser play styles discover the core loop before the countdown ends.
    const controlsPill = document.createElement('div');
    controlsPill.className = 'tag-pill tag-controls';
    controlsPill.textContent = 'RUN · every safe second scores · jump to cut corners';
    timerPill.textContent = fmtTime(roundDuration);
    scorePill.textContent = '⭐ 0 · 🏷️ 0';
    hud.append(timerPill, scorePill, rolePill, phasePill, safePill, controlsPill);

    const centerMsg = document.createElement('div');
    centerMsg.className = 'tag-center';
    centerMsg.setAttribute('aria-live', 'assertive');
    document.body.append(hud, centerMsg);
    const objectiveCard = ctx.party.objective({
      icon: '🏷️',
      title: 'Tag',
      objective: 'Score while you are a runner. If you become IT, touch any runner to pass IT.',
      controls: ctx.input.isTouchDevice
        ? 'Move with the stick · JUMP cuts corners · IT is marked in rose.'
        : 'WASD / arrows move · Space jumps · IT is marked in rose.',
    });
    objectiveCard.el.classList.add('tag-start-objective');
    if (ctx.input.isTouchDevice) {
      hud.classList.add('is-starting');
      controlsPill.setAttribute('aria-hidden', 'true');
    }

    function finishMobileStartGuidance() {
      if (!ctx.input.isTouchDevice) return;
      objectiveCard.close();
      hud.classList.remove('is-starting');
      controlsPill.setAttribute('aria-hidden', 'false');
    }

    function fmtTime(s) {
      const m = Math.floor(Math.max(0, s) / 60);
      const sec = Math.floor(Math.max(0, s) % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    }

    // ---------- Player ----------
    const player = {
      kind: 'player',
      state: createPlayerState(0, 8),
      group: new T.Group(),
      safeTime: 0,
      tagsMade: 0,
      immunity: 0,
      longestIt: 0,
    };
    player.state.yaw = Math.PI; // face arena center
    scene.add(player.group);
    participants.push(player);

    let playerCharacter = null;
    ctx.characters.createInstance(ctx.characters.equippedId(), {
      skinTone: ctx.save.settings.skinTone,
      lod: 'game',
      shadow: 'hero',
    })
      .then((instance) => {
        if (ended) {
          instance.dispose();
          return;
        }
        scene.remove(player.group);
        playerCharacter = instance;
        player.group = instance.root;
        scene.add(player.group);
      })
      .catch((e) => {
        console.error('[tag] player mesh failed', e);
        ctx.sessionTelemetry?.record('recoverable_error', {
          area: 'character-load',
          code: 'tag-player-fallback',
          routeKind: 'character',
          routeId: 'tag',
        });
      });

    // ---------- Bots ----------
    let botsReady = false;
    const spawnSpots = [[-8, -8], [8, -8], [-8, 6], [8, 6]];
    (async () => {
      try {
        for (let i = 0; i < BOT_COUNT; i++) {
          const [x, z] = spawnSpots[i % spawnSpots.length];
          const bot = await spawnBot(ctx, scene, env, {
            charId: BOT_CHARS[i % BOT_CHARS.length],
            x, z,
            behavior: tagBehavior,
          });
          const p = {
            kind: 'bot',
            state: bot.state,
            group: bot.group,
            bot,
            safeTime: 0,
            tagsMade: 0,
            immunity: 0,
            longestIt: 0,
          };
          participants.push(p);
        }
      } catch (e) {
        console.error('[tag] bot spawn failed', e);
        ctx.sessionTelemetry?.record('recoverable_error', {
          area: 'character-load',
          code: 'tag-bot-fallback',
          routeKind: 'character',
          routeId: 'tag',
        });
      }
      if (ended) return; // unmounted while loading
      // Teach the scoring role first: normal rounds always begin with a local
      // training bot as IT. The final-state visual QA view intentionally
      // forces the player role so both state treatments have fixed evidence.
      chaserIdx = visualQaTag === 'final' || participants.length < 2
        ? 0
        : 1 + Math.floor(Math.random() * (participants.length - 1));
      if (visualQaTag === 'final') {
        timeLeft = roundDuration * 0.24;
        currentChaserHold = TAG_RULES.assistStartsAfterSeconds + 1;
      }
      botsReady = true;
      phase = 'countdown';
      document.body.dataset.tagRole = chaserIdx === 0 ? 'it' : 'runner';
      document.body.dataset.tagPhase = phase;
      const who = participants[chaserIdx];
      ctx.ui.toast(who.kind === 'player' ? "You're IT — go tag someone!" : 'Run! Don\'t get tagged!');
    })();

    // ---------- Bot AI: chase when it, flee otherwise ----------
    const idleInput = { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false };
    function tagBehavior(bot, dt, world) {
      if (!world || phase !== 'playing') return idleInput;
      const me = participants.find((p) => p.bot === bot);
      if (!me) return idleInput;
      const meIdx = participants.indexOf(me);
      const sx = me.state.pos.x, sz = me.state.pos.z;
      let tx = 0, tz = 0;

      if (meIdx === world.chaserIdx) {
        // Chaser: hunt nearest non-immune runner.
        let best = null, bestD = Infinity;
        for (let i = 0; i < participants.length; i++) {
          const p = participants[i];
          if (i === meIdx || p.immunity > 0) continue;
          if (visualQaTag === 'runner' && i === 0) continue;
          const d = Math.hypot(p.state.pos.x - sx, p.state.pos.z - sz);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best) { tx = best.state.pos.x - sx; tz = best.state.pos.z - sz; }
      } else {
        // Runner: flee the chaser, steer away from walls, light wander.
        const ch = participants[world.chaserIdx];
        if (ch) {
          const dx = sx - ch.state.pos.x, dz = sz - ch.state.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const panic = Math.max(0, 1 - d / 12); // flee harder when close
          tx = (dx / d) * (0.5 + panic);
          tz = (dz / d) * (0.5 + panic);
        }
        // Wall repulsion: steer toward center near the fence.
        const edge = ARENA_HALF - 2.2;
        if (Math.abs(sx) > edge) tx += -Math.sign(sx) * 1.4;
        if (Math.abs(sz) > edge) tz += -Math.sign(sz) * 1.4;
        // Gentle wander so runners don't all converge.
        tx += Math.sin(world.simTime * 0.9 + meIdx * 2.1) * 0.35;
        tz += Math.cos(world.simTime * 0.7 + meIdx * 1.7) * 0.35;
      }

      const len = Math.hypot(tx, tz);
      if (len < 1e-3) return idleInput;
      return { dirX: tx / len, dirZ: tz / len, moving: true, jumpHeld: false, grabPressed: false };
    }

    // Shared AI context passed to bot.step(dt, world).
    const aiWorld = { chaserIdx: -1, simTime: 0 };

    // ---------- Camera (hub-style fixed-follow) ----------
    const camOrbit = createOrbitState(Math.PI);
    const camTarget = new T.Vector3();
    const camLook = new T.Vector3();
    const camFocus = new T.Vector3();
    const camResolved = new T.Vector3();
    const cameraRay = new T.Raycaster();
    const camPos = new T.Vector3(0, 9, 22);
    camera.position.copy(camPos);
    camera.lookAt(0, 1, 0);

    // ---------- Round end ----------
    function computeScore() {
      return tagParticipantScore(player);
    }
    function endRound() {
      if (phase === 'results') return;
      phase = 'results';
      document.body.dataset.tagPhase = phase;
      ctx.sessionTelemetry?.record('game_phase', {
        gameId: 'tag',
        phase: 'results',
      });
      const ranking = rankTagParticipants(participants);
      const playerRank = ranking.find(({ index }) => index === 0);
      const placement = playerRank?.placement || participants.length;
      const score = playerRank?.score ?? computeScore();
      const playedSeconds = Math.max(0, roundDuration - Math.max(0, timeLeft));
      const timeIt = Math.max(0, playedSeconds - player.safeTime);
      const coins = 10 + Math.floor(score / 12) + Math.max(0, 6 - placement);
      const result = commitLocalGameReward(ctx.save, {
        game: 'tag',
        gameId: 'tag',
        score,
        coins,
        placement,
        tags: player.tagsMade,
        safeTimeMs: Math.round(player.safeTime * 1000),
        roleChanges,
        longestItSeconds: player.longestIt,
        finalChaseReached: finalChaseEntered,
      }, 'tag-round');
      if (!result.rewardCommitted) {
        ctx.ui.toast('Coins could not be saved on this device. Quest and Season progress were not advanced.');
      }
      playerCharacter?.animator.play('celebrate');
      centerMsg.textContent = 'TIME!';
      setTimeout(() => { if (!ended) centerMsg.textContent = ''; }, 1200);

      const finish = () => {
        if (ended || departed) return;
        departed = true;
        ctx.goHome(result);
      };
      const replay = () => {
        if (ended || departed) return;
        departed = true;
        ctx.replayGame?.('tag', result);
      };
      const nestedShowRound = opts.mode === 'show67';
      const resultTip = document.createElement('p');
      resultTip.textContent = tagResultCue({
        placement,
        longestItSeconds: player.longestIt,
        tagsMade: player.tagsMade,
      });
      resultsPanel = ctx.party.result({
        title: 'Tag — Round Over',
        icon: '🏷️',
        outcome: `#${placement} · ${score} points`,
        summary:
          `${player.safeTime.toFixed(1)}s as a runner · ${timeIt.toFixed(1)}s as IT · ` +
          `${player.tagsMade} transfer${player.tagsMade === 1 ? '' : 's'}.`,
        note: nestedShowRound ? '67 Show · local round' : 'Local bot round',
        stats: [
          { label: 'Placement', value: `#${placement} / ${participants.length}` },
          { label: 'Time safe', value: `${player.safeTime.toFixed(1)}s` },
          { label: 'Tags made', value: String(player.tagsMade) },
          { label: 'Longest as IT', value: `${player.longestIt.toFixed(1)}s` },
          { label: 'Coins earned', value: localGameRewardStat(result) },
        ],
        details: resultTip,
        onReplay: nestedShowRound ? null : replay,
        homeLabel: nestedShowRound ? 'Continue 67 Show' : 'Return to 67 Park',
        onHome: finish,
      });
    }

    // ---------- Main ticker ----------
    let acc = 0;
    let simTime = 0;
    let lastHudSignature = '';
    const stop = ctx.loop.add((dt) => {
      if (!botsReady) return;
      if (phase === 'results') {
        playerCharacter?.animator.update(dt, { speed: 0, grounded: true });
        return;
      }

      // Countdown gate.
      if (phase === 'countdown') {
        countdown -= dt;
        if (countdown > 2.1 && !ctx.input.isTouchDevice) {
          centerMsg.style.fontSize = '24px';
          centerMsg.textContent = 'Run with WASD or arrows. Don\'t get tagged!';
        } else {
          centerMsg.style.fontSize = '44px';
          centerMsg.textContent = countdown > 0.5 ? String(Math.ceil(countdown)) : 'GO!';
        }
        if (countdown <= 0) {
          phase = 'playing';
          document.body.dataset.tagPhase = phase;
          ctx.sessionTelemetry?.record('game_phase', {
            gameId: 'tag',
            phase: 'playing',
          });
          finishMobileStartGuidance();
          centerMsg.textContent = '';
        }
        return;
      }

      const pad = ctx.input.poll();

      const direction = cameraRelativeDirection(pad, camOrbit.yaw);
      const dirX = direction.x;
      const dirZ = direction.z;
      const simInput = {
        dirX, dirZ,
        moving: direction.moving,
        jumpHeld: pad.jumpHeld,
        sprintHeld: pad.sprintHeld,
        grabPressed: false, // grab not used in Tag
      };

      // Fixed-timestep sim: player + bots share stepPlayer.
      acc += dt;
      while (acc >= SIM_DT) {
        acc -= SIM_DT;
        simTime += SIM_DT;
        timeLeft -= SIM_DT;
        aiWorld.simTime = simTime;
        aiWorld.chaserIdx = chaserIdx;
        currentChaserHold += SIM_DT;
        currentPacing = tagPacingState(
          timeLeft,
          roundDuration,
          currentChaserHold,
        );
        const activeChaser = participants[chaserIdx];
        if (activeChaser) {
          activeChaser.longestIt = Math.max(
            activeChaser.longestIt,
            currentChaserHold,
          );
        }
        if (currentPacing.finalChase && !finalChaseEntered) {
          finalChaseEntered = true;
          document.body.dataset.tagFinal = 'true';
          announcementText = 'FINAL CHASE\nFaster transfers · wider reach';
          announcementTime = 2.2;
          ctx.sessionTelemetry?.record('game_phase', {
            gameId: 'tag',
            phase: 'final-chase',
          });
        }

        const wasGrounded = player.state.grounded;
        stepPlayer(player.state, simInput, SIM_DT, env);
        if (player.state.jumpEvent) playerCharacter?.animator.signal('jump');
        if (!wasGrounded && player.state.grounded) playerCharacter?.animator.signal('land');
        for (const p of participants) {
          if (p.bot) p.bot.step(SIM_DT, aiWorld);
          p.immunity = Math.max(0, p.immunity - SIM_DT);
        }

        // Every participant uses the same score rule so placement is a real
        // local ranking, not a player-only number beside decorative rivals.
        for (let i = 0; i < participants.length; i++) {
          if (i !== chaserIdx) participants[i].safeTime += SIM_DT;
        }

        // Tag transfer: chaser within TAG_RADIUS of a non-immune runner.
        tagCooldown = Math.max(0, tagCooldown - SIM_DT);
        if (tagCooldown <= 0 && chaserIdx >= 0) {
          const ch = participants[chaserIdx];
          for (let i = 0; i < participants.length; i++) {
            if (i === chaserIdx) continue;
            // Fixed evidence needs to prove both role treatments. Keep the
            // runner capture in its named role without changing normal play.
            if (visualQaTag === 'runner' && i === 0) continue;
            const p = participants[i];
            if (p.immunity > 0) continue;
            const d = Math.hypot(p.state.pos.x - ch.state.pos.x, p.state.pos.z - ch.state.pos.z);
            if (d < currentPacing.tagRadius) {
              ch.tagsMade += 1;
              ch.immunity = TAG_RULES.recoveryImmunitySeconds;
              chaserIdx = i;
              roleChanges += 1;
              currentChaserHold = 0;
              tagCooldown = currentPacing.transferLockSeconds;
              flashAnim = 0;
              flash.position.set(p.state.pos.x, p.state.pos.y + 0.08, p.state.pos.z);
              if (p.kind === 'player') {
                playerCharacter?.animator.signal('impact');
                ctx.ui.toast("You're IT!");
                announcementText = "YOU'RE IT\nTouch any runner to pass IT";
                announcementTime = 1.7;
              } else if (ch.kind === 'player') {
                announcementText = 'TAG! RUN!\nNo tag-back for 2.25s';
                announcementTime = 1.5;
                ctx.ui.toast('Tag transferred — run and score!');
              }
              break;
            }
          }
        }

        if (timeLeft <= 0) { endRound(); break; }
      }

      if (phase === 'playing') {
        announcementTime = Math.max(0, announcementTime - dt);
        centerMsg.style.fontSize = 'clamp(28px, 5vw, 44px)';
        centerMsg.textContent = announcementTime > 0 ? announcementText : '';
      }

      // ----- Visuals from sim state -----
      for (const p of participants) {
        p.group.position.set(p.state.pos.x, p.state.pos.y, p.state.pos.z);
        p.group.rotation.y = p.state.yaw;
      }
      playerCharacter?.animator.update(dt, {
        speed: Math.hypot(player.state.vel.x, player.state.vel.z),
        grounded: player.state.grounded,
      });

      // Chaser marker + ring follow current chaser.
      const ch = participants[chaserIdx];
      if (ch) {
        marker.position.set(ch.state.pos.x, ch.state.pos.y + 2.45, ch.state.pos.z);
        marker.rotation.y = simTime * 2.4;
        chaserRing.position.set(ch.state.pos.x, ch.state.pos.y + 0.05, ch.state.pos.z);
        itLabel.position.set(ch.state.pos.x, ch.state.pos.y + 3.05, ch.state.pos.z);
        const pulse = 1 + Math.sin(simTime * 6) * 0.08;
        chaserRing.scale.setScalar(pulse);
      }
      finalRing.visible = currentPacing.finalChase;
      if (finalRing.visible) {
        finalRing.material.opacity = 0.34 + Math.sin(simTime * 4) * 0.12;
      }
      arena.setFinalChase(currentPacing.finalChase, simTime);
      recoveryRing.visible = player.immunity > 0 && chaserIdx !== 0;
      if (recoveryRing.visible) {
        recoveryRing.position.set(
          player.state.pos.x,
          player.state.pos.y + 0.045,
          player.state.pos.z,
        );
        recoveryRing.scale.setScalar(1 + Math.sin(simTime * 7) * 0.06);
      }

      // Tag flash burst.
      if (flashAnim >= 0) {
        flashAnim += dt / 0.5;
        if (flashAnim >= 1) { flashAnim = -1; flash.material.opacity = 0; }
        else {
          flash.scale.setScalar(0.5 + flashAnim * 3.2);
          flash.material.opacity = 0.9 * (1 - flashAnim);
        }
      }

      // HUD.
      const timerText = fmtTime(timeLeft);
      const scoreText = `⭐ ${computeScore()}  ·  🏷️ ${player.tagsMade}`;
      const playerIsIt = chaserIdx === 0;
      const safeText = player.immunity > 0 && !playerIsIt
        ? `SAFE ${player.immunity.toFixed(1)}s`
        : '';
      const assistText = playerIsIt && currentPacing.assistActive
        ? ` · CHASE ASSIST +${currentPacing.assistRadius.toFixed(2)}`
        : '';
      const controlsText = playerIsIt
        ? `CHASE · touch any runner to pass IT${assistText}`
        : 'RUN · every safe second scores · jump to cut corners';
      const hudSignature =
        `${timerText}|${scoreText}|${playerIsIt}|${safeText}|` +
        `${currentPacing.finalChase}|${controlsText}`;
      if (hudSignature !== lastHudSignature) {
        timerPill.textContent = timerText;
        scorePill.textContent = scoreText;
        rolePill.dataset.role = playerIsIt ? 'it' : 'runner';
        rolePill.textContent = playerIsIt ? "YOU'RE IT" : 'RUNNER';
        phasePill.style.display = currentPacing.finalChase ? 'block' : 'none';
        safePill.style.display = safeText ? 'block' : 'none';
        safePill.textContent = safeText;
        controlsPill.textContent = controlsText;
        document.body.dataset.tagRole = playerIsIt ? 'it' : 'runner';
        lastHudSignature = hudSignature;
      }

      // Camera: fixed-follow behind player, auto-frames heading (hub pattern).
      updateOrbitState(camOrbit, pad, dt, {
        autoYaw: simInput.moving ? Math.atan2(dirX, dirZ) : null,
        autoRate: 2.2,
      });
      const portrait = T.MathUtils.clamp((0.9 - camera.aspect) / 0.4, 0, 1);
      const chaseDistance = 6 + portrait * 1.25;
      const chaseHeight = 4.2 + portrait * 0.65;
      camFocus.set(player.state.pos.x, player.state.pos.y, player.state.pos.z);
      camLook.set(player.state.pos.x, player.state.pos.y + 1.4, player.state.pos.z);
      orbitCameraPosition(camTarget, camFocus, camOrbit, chaseDistance, chaseHeight);
      resolveCameraObstruction(cameraRay, camLook, camTarget, walkables, camResolved);
      camPos.lerp(camResolved, 1 - Math.exp(-5 * dt));
      resolveCameraObstruction(cameraRay, camLook, camPos, walkables, camResolved);
      camera.position.copy(camResolved);
      camera.lookAt(camLook);
    });

    // Full-screen view override (main.js renders ctx.view.current.scene/camera).
    ctx.view.current = { scene, camera };

    // ---------- Unmount: remove EVERYTHING we added ----------
    function unmount() {
      ended = true;
      stop();
      for (const p of participants) {
        if (p.bot) p.bot.dispose();
        else scene.remove(p.group);
      }
      playerCharacter?.dispose();
      playerCharacter = null;
      objectiveCard.close();
      if (resultsPanel) resultsPanel.destroy();
      hud.remove();
      centerMsg.remove();
      localStyles.remove();
      document.body.classList.remove('tag-mode');
      delete document.body.dataset.tagRole;
      delete document.body.dataset.tagPhase;
      delete document.body.dataset.tagFinal;
      arena.dispose();
      for (const d of disposables) d.dispose && d.dispose();
      if (ctx.view.current && ctx.view.current.scene === scene) ctx.view.current = null;
    }

    return { unmount };
  },
});
