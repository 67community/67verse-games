// show67.js — internal local-play gauntlet shell.
// Mounts the three proven local modes in sequence: Tag -> Balloon Battle ->
// Skyway Sprint. Each mode keeps its own mechanics and bot field. The shell
// compares the player's local result with seven simulated training entries to
// make a lightweight practice bracket; it is not an online tournament.
//
// ===================== ASSUMED SUB-GAME MOUNT CONTRACT (v1) =====================
// The other three games are built in parallel; show67 normalizes everything it
// can and documents the rest for the orchestrator's integration shim.
//
// MOUNT:
//   const handle = GAMES.get(id).mount(ctx, {
//     mode: 'show67',                 // marks a nested gauntlet mount
//     duration: 120,                  // suggested round length, seconds
//     players: [{ id, name, charId, isPlayer }],  // alive roster snapshot
//     roundIndex: 0..2,
//     onEnd(result) { ... },          // OPTIONAL: preferred end-of-round callback
//   });
//   handle -> { unmount() }           // per ARCHITECTURE.md
//
// RESULT (first channel to fire wins; all are accepted):
//   1) opts.onEnd(result)             — preferred
//   2) ctx.goHome(result)             — show67 SHADOWS ctx.goHome while a
//      sub-game is mounted and treats a call as "round over" (restored after)
//   3) ctx.bus.emit('game-result', result) with result.gameId|game === round id
// Accepted result shapes (normalized by normalizeResult below):
//   { scores: [{id, score}] | [[id, score]] | {id: score} }
//   { score: <player score>, placement: <player placement> }
//   { standings: [{id, placement}] }
//   null/undefined/anything-else     -> local training scores are simulated
// A safety timer ends any round that reports nothing after ROUND_TIMEOUT sec.
// ============================================================================

import { createCloudSea, createSkyDome, SKY_LOW } from '../core/sky.js';
import { registerGame, GAMES } from '../core/registry.js';
import {
  LOCAL_SAVE_SCHEMA_VERSION,
  nonNegativeInteger,
} from '../core/local-save-schema.js';
import { commitLocalGameReward } from '../core/game-result.js';

const ROUND_IDS = ['tag', 'balloon', 'obstacle'];
const ROUND_META = {
  tag:      { name: 'Tag',            tagline: 'Local bot round · stay away from IT.' },
  balloon:  { name: 'Balloon Battle', tagline: 'Local bot round · protect your balloons.' },
  obstacle: { name: 'Skyway Sprint',  tagline: 'Local bot race · reach the finish arch.' },
};

const TOTAL = 8;                 // practice bracket: player + 7 simulated entries
const ELIMS = [3, 2, 0];         // eliminated after round 1 / round 2 / final
const COINS_BY_PLACE = [100, 70, 50, 35, 30, 25, 20, 15];
const FORFEIT_COINS = 5;
const ROUND_DURATION = 120;      // suggestion passed to sub-games
const ROUND_TIMEOUT = 200;       // safety net if a sub-game never reports
const STATS_KEY = 'show67Stats'; // save key: { plays, wins, podiums, bestPlacement }

const PALETTE = [0xd0775e, 0x5a9c7a, 0xe8b64a, 0x8a6fb0, 0xc46f8e, 0xf4efe7];

export function recoverShow67Stats(current) {
  const previous = current && typeof current === 'object' && !Array.isArray(current)
    ? current
    : {};
  const plays = nonNegativeInteger(previous.plays);
  const wins = Math.min(plays, nonNegativeInteger(previous.wins));
  const podiums = Math.min(plays, nonNegativeInteger(previous.podiums));
  const bestPlacement = plays > 0
    && Number.isInteger(previous.bestPlacement)
    && previous.bestPlacement >= 1
    && previous.bestPlacement <= TOTAL
    ? previous.bestPlacement
    : 0;
  return {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    plays,
    wins,
    podiums,
    bestPlacement,
  };
}

export function nextShow67Stats(current, placement) {
  const place = Math.max(1, Math.min(TOTAL, Number.isInteger(placement) ? placement : TOTAL));
  const previous = recoverShow67Stats(current);
  return {
    version: LOCAL_SAVE_SCHEMA_VERSION,
    plays: previous.plays + 1,
    wins: previous.wins + (place === 1 ? 1 : 0),
    podiums: previous.podiums + (place <= 3 ? 1 : 0),
    bestPlacement: previous.bestPlacement ? Math.min(previous.bestPlacement, place) : place,
  };
}

export function commitShow67Stats(save, placement) {
  const stats = nextShow67Stats(save.get(STATS_KEY, null), placement);
  const committed = save.set(STATS_KEY, stats);
  return Object.freeze({
    committed,
    stats: committed ? stats : null,
  });
}

const CSS = `
.sv-overlay{position:fixed;inset:0;z-index:55;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 10px) calc(env(safe-area-inset-bottom) + 10px) calc(env(safe-area-inset-left) + 10px);background:rgba(6,12,33,.34);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#060c21}
.sv-card{background:#ffffff;border:1px solid #e5e5ea;border-radius:10px;box-shadow:0 18px 50px rgba(6,12,33,.25);padding:26px 30px;max-width:min(560px,92vw);max-height:84vh;overflow:auto;text-align:center}
.sv-kicker{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#8a6fb0}
.sv-title{font-size:34px;font-weight:600;letter-spacing:-.02em;margin:6px 0 2px}
.sv-sub{font-size:14.5px;color:#9a9aa2;margin-bottom:14px}
.sv-meta{display:inline-block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:5px 12px;border-radius:8px;background:#f5f5f7;border:1px solid #e5e5ea;color:#9a9aa2;margin-bottom:16px}
.sv-roster{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:16px}
.sv-chip{font-size:12px;font-weight:500;padding:5px 10px;border-radius:999px;background:#f5f5f7;border:1px solid #e5e5ea}
.sv-chip.me{background:#0A84FF;border-color:#0A84FF}
.sv-board{text-align:left;margin:0 auto 16px;max-width:420px}
.sv-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;margin-bottom:6px;background:#f5f5f7;border:1px solid #e5e5ea;font-size:14px;font-weight:600}
.sv-row.me{background:#fdf3dd;border-color:#0A84FF}
.sv-row.out{opacity:.55}
.sv-row .sv-rank{width:26px;font-weight:600;color:#9a9aa2}
.sv-row .sv-name{flex:1}
.sv-row .sv-score{font-weight:600}
.sv-hud{position:fixed;top:calc(env(safe-area-inset-top) + 12px);left:calc(env(safe-area-inset-left) + 12px);z-index:45;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.92);border:1px solid #e5e5ea;border-radius:14px;padding:8px 12px;font:600 13px -apple-system,system-ui,sans-serif;color:#060c21;box-shadow:0 4px 14px rgba(6,12,33,.12)}
.sv-hud b{font-weight:600}
.sv-hud .uv-btn{padding:8px 12px;font-size:12px}
.sv-big{font-size:52px;margin:2px 0}
.sv-coins{font-size:16px;font-weight:600;color:#b8860b;margin-bottom:12px}
.sv-card>.uv-btn+.uv-btn{margin-left:8px}
@media(max-width:620px){.sv-card>.uv-btn{width:100%}.sv-card>.uv-btn+.uv-btn{margin:8px 0 0}}
`;

registerGame({
  id: 'show67',
  name: '67 Show',
  hint: '3-round elimination gauntlet',
  color: 0x8a6fb0,

  mount(ctx) {
    const T = ctx.THREE;
    const routeParams = new URLSearchParams(location.search);
    const qaMode = routeParams.get('qa') === '1';
    const visualQaShow = routeParams.get('visualQaShow');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const realGoHome = ctx.goHome; // main.js wrapper: unmounts this game + emits game-result
    let alive = true;              // mount still active (guards async work)
    let unmounted = false;
    let finalized = false;
    document.body.classList.add('show67-mode');

    // ---------- bookkeeping for guaranteed cleanup ----------
    const dom = [];        // DOM nodes we added
    const timers = [];     // setTimeout ids
    const busSubs = [];    // [event, fn]
    const disposables = []; // geometries / materials to dispose
    let sub = null;        // active sub-game { id, handle }
    let subShadowed = false;

    function addDom(tag, cls, parent, text) {
      const d = document.createElement(tag);
      if (cls) d.className = cls;
      if (text != null) d.textContent = text;
      (parent || document.body).appendChild(d);
      dom.push(d);
      return d;
    }
    function onBus(evt, fn) { ctx.bus.on(evt, fn); busSubs.push([evt, fn]); }
    function later(fn, ms) { const id = setTimeout(() => { if (alive) fn(); }, ms); timers.push(id); return id; }

    const style = addDom('style'); style.textContent = CSS;

    // ---------- roster ----------
    const equipped = ctx.characters.equippedId();
    const botPool = ctx.characters.ROSTER.filter((r) => r.id !== equipped);
    const roster = [{
      id: 'player', name: ctx.save.profile.name || 'You', charId: equipped,
      isPlayer: true, skill: 1,
    }];
    for (let i = 0; i < TOTAL - 1; i++) {
      const def = botPool[i % botPool.length];
      roster.push({
        id: 'bot' + i,
        name: def.name + (i >= botPool.length ? ' ' + (Math.floor(i / botPool.length) + 1) : ''),
        charId: def.id,
        isPlayer: false,
        skill: 0.75 + Math.random() * 0.5, // one local simulated bracket rating
      });
    }
    let aliveIds = roster.map((c) => c.id);
    let roundIndex = 0;
    let finalPlacement = 0; // set when the player is eliminated or podiums

    // ---------- show stage scene (intro / practice boards / podium) ----------
    const scene = new T.Scene();
    // Shared 67VERSE atmosphere: same gradient sky and cloud sea as the hub
    // and the Skyway course, so every mode reads as one world.
    scene.add(createSkyDome(T));
    scene.add(createCloudSea(T, { layout: 'radial', radius: 62, seed: 769656 }));
    scene.fog = new T.Fog(SKY_LOW, 40, 120);
    const camera = new T.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
    camera.position.set(0, 8.5, 17);
    camera.lookAt(0, 1.2, 0);

    scene.add(new T.HemisphereLight(0xfff2de, 0xd8c4a8, 0.9));
    const sun = new T.DirectionalLight(0xffe2b8, 1.5);
    sun.position.set(10, 20, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    sun.shadow.camera.far = 60;
    scene.add(sun);

    function track(...objs) { disposables.push(...objs); return objs[0]; }

    // ground — a real slab with earthen sides, not a flat disc
    const groundGeo = track(new T.CylinderGeometry(30, 28.4, 0.85, 48));
    const groundMat = track(new T.MeshStandardMaterial({ color: 0xeae4d9, roughness: 0.9 }));
    const groundSideMat = track(new T.MeshStandardMaterial({ color: 0x9a7658, roughness: 0.95 }));
    const ground = new T.Mesh(groundGeo, [groundSideMat, groundMat, groundSideMat]);
    ground.position.y = -0.425;
    ground.receiveShadow = true;
    scene.add(ground);

    // stage disc (podium platform)
    const stageGeo = track(new T.CylinderGeometry(5, 5.4, 0.5, 36));
    const stageMat = track(new T.MeshStandardMaterial({ color: 0xf4efe7, roughness: 0.7 }));
    const stage = new T.Mesh(stageGeo, stageMat);
    stage.position.set(0, 0.25, -6);
    stage.receiveShadow = true; stage.castShadow = true;
    scene.add(stage);

    // backdrop arch + light towers with swaying spot cones
    const archGeo = track(new T.TorusGeometry(5.6, 0.28, 10, 40, Math.PI));
    const archMat = track(new T.MeshStandardMaterial({ color: 0x8a6fb0, roughness: 0.5 }));
    const arch = new T.Mesh(archGeo, archMat);
    arch.position.set(0, 0.5, -9.5);
    scene.add(arch);

    const spotCones = [];
    for (const sx of [-1, 1]) {
      const towerGeo = track(new T.CylinderGeometry(0.22, 0.3, 6.5, 10));
      const towerMat = track(new T.MeshStandardMaterial({ color: 0x514154, roughness: 0.68 }));
      const tower = new T.Mesh(towerGeo, towerMat);
      tower.position.set(sx * 7.5, 3.25, -6);
      tower.castShadow = true;
      scene.add(tower);
      const ballGeo = track(new T.SphereGeometry(0.45, 14, 10));
      const ballMat = track(new T.MeshStandardMaterial({ color: 0xe8b64a, emissive: 0xe8b64a, emissiveIntensity: 0.8 }));
      const ball = new T.Mesh(ballGeo, ballMat);
      ball.position.set(sx * 7.5, 6.7, -6);
      scene.add(ball);
      const coneGeo = track(new T.ConeGeometry(2.2, 8, 20, 1, true));
      const coneMat = track(new T.MeshBasicMaterial({
        color: 0xffe9b8, transparent: true, opacity: 0.16,
        side: T.DoubleSide, depthWrite: false,
      }));
      const cone = new T.Mesh(coneGeo, coneMat);
      cone.position.set(sx * 7.5, 3.2, -6);
      scene.add(cone);
      spotCones.push({ cone, phase: sx });
    }

    // confetti (instanced, recycled) — active during the podium ceremony
    const CONFETTI_N = 130;
    const confettiGeo = track(new T.PlaneGeometry(0.14, 0.2));
    const confettiMat = track(new T.MeshBasicMaterial({ side: T.DoubleSide }));
    const confetti = new T.InstancedMesh(confettiGeo, confettiMat, CONFETTI_N);
    confetti.visible = false;
    const confettiData = [];
    {
      const c = new T.Color();
      for (let i = 0; i < CONFETTI_N; i++) {
        confettiData.push({
          x: (Math.random() - 0.5) * 14, y: Math.random() * 10, z: -6 + (Math.random() - 0.5) * 8,
          vy: 1.2 + Math.random() * 1.6, rx: Math.random() * 6, rz: Math.random() * 6,
          sx: 1 + Math.random() * 2, sz: 1 + Math.random() * 2,
        });
        c.setHex(PALETTE[i % PALETTE.length]);
        confetti.setColorAt(i, c);
      }
      if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
    }
    scene.add(confetti);
    const confettiDummy = new T.Object3D();
    let confettiOn = false;

    function stepConfetti(dt) {
      for (let i = 0; i < CONFETTI_N; i++) {
        const p = confettiData[i];
        p.y -= p.vy * dt;
        p.rx += p.sx * dt; p.rz += p.sz * dt;
        if (p.y < 0.2) { p.y = 9 + Math.random() * 2; p.x = (Math.random() - 0.5) * 14; }
        confettiDummy.position.set(p.x, p.y, p.z);
        confettiDummy.rotation.set(p.rx, 0, p.rz);
        confettiDummy.updateMatrix();
        confetti.setMatrixAt(i, confettiDummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    }

    // podium steps + character meshes (built when the ceremony starts)
    let podiumBuilt = false;
    function buildPodium(top3) {
      if (podiumBuilt) return;
      podiumBuilt = true;
      const steps = [
        { place: 1, x: 0, h: 1.5, color: 0xe8b64a },
        { place: 2, x: -1.9, h: 1.0, color: 0xd8d4cc },
        { place: 3, x: 1.9, h: 0.7, color: 0xd0775e },
      ];
      for (const s of steps) {
        const g = track(new T.BoxGeometry(1.6, s.h, 1.6));
        const m = track(new T.MeshStandardMaterial({ color: s.color, roughness: 0.55 }));
        const box = new T.Mesh(g, m);
        box.position.set(s.x, 0.5 + s.h / 2, -6);
        box.castShadow = true; box.receiveShadow = true;
        scene.add(box);
        const entry = top3[s.place - 1];
        if (!entry) continue;
        ctx.characters.buildMesh(entry.charId, { skinTone: ctx.save.settings.skinTone })
          .then((mesh) => {
            if (!alive) return;
            mesh.position.set(s.x, 0.5 + s.h, -6);
            mesh.rotation.y = 0; // face +Z (camera)
            scene.add(mesh);
          })
          .catch(() => {});
      }
      stepConfetti(0);
      confetti.visible = true;
      confettiOn = true;
    }

    // ---------- HUD ----------
    const hud = addDom('div', 'sv-hud');
    const hudTitle = addDom('span', '', hud);
    hudTitle.innerHTML = '<b>67 Show</b> · local practice';
    const hudInfo = addDom('span', '', hud, '');
    const forfeitBtn = ctx.ui.button('Forfeit', onForfeit);
    hud.appendChild(forfeitBtn);
    function setHud(info) { hudInfo.textContent = info; }

    function onForfeit() {
      if (!alive) return;
      ctx.ui.confirm('Leave this local gauntlet? You receive 5 local Coins.').then((ok) => {
        if (!ok || !alive) return;
        const place = aliveIds.length; // bottom of the current field (e.g. 8th, 5th, 3rd)
        finalize(place, { forfeited: true });
      });
    }

    // ---------- DOM cards (intro / round intro / board / final) ----------
    let overlay = null;
    let overlayIsolationRelease = null;
    function closeOverlay() {
      if (!overlay) return;
      document.body.classList.remove('show67-overlay-open');
      overlay.remove();
      overlay = null;
      overlayIsolationRelease?.();
      overlayIsolationRelease = null;
    }
    function makeOverlay() {
      closeOverlay();
      overlay = addDom('div', 'sv-overlay');
      const card = addDom('div', 'sv-card', overlay);
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', '67 Show local gauntlet');
      card.addEventListener('keydown', (event) => {
        if (event.code === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onForfeit();
          return;
        }
        if (event.code !== 'Tab') return;
        const actions = [...card.querySelectorAll('button:not([disabled])')]
          .filter((button) => button.getClientRects().length > 0);
        if (!actions.length) {
          event.preventDefault();
          card.tabIndex = -1;
          card.focus();
          return;
        }
        const first = actions[0];
        const last = actions.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      document.body.classList.add('show67-overlay-open');
      overlayIsolationRelease = ctx.ui.isolateModalLayer(overlay);
      queueMicrotask(() => card.querySelector('button')?.focus());
      return card;
    }
    function addAction(card, label, fn) {
      const b = ctx.ui.button(label, fn, { primary: true });
      card.appendChild(b);
      return b;
    }

    function showIntroCard() {
      document.body.dataset.show67Phase = 'intro';
      const card = makeOverlay();
      addDom('div', 'sv-kicker', card, 'Solo party gauntlet');
      addDom('div', 'sv-title', card, '⭐ 67 SHOW ⭐');
      addDom('div', 'sv-sub', card,
        'Tag, Balloon Battle, then Skyway Sprint. Your local result is compared with seven on-device training entries between rounds.');
      addDom('div', 'sv-meta', card, 'No live players · no online bracket · no remote tournament');
      const chips = addDom('div', 'sv-roster', card);
      for (const c of roster) addDom('span', 'sv-chip' + (c.isPlayer ? ' me' : ''), chips, c.name);
      addAction(card, 'Start local gauntlet', () => { closeOverlay(); showRoundIntro(0); });
    }

    function showRoundIntro(i) {
      document.body.dataset.show67Phase = 'round-intro';
      roundIndex = i;
      const id = ROUND_IDS[i];
      const meta = ROUND_META[id];
      const card = makeOverlay();
      addDom('div', 'sv-kicker', card, 'Round ' + (i + 1) + ' of 3');
      addDom('div', 'sv-title', card, meta.name);
      addDom('div', 'sv-sub', card, meta.tagline);
      const elims = ELIMS[i];
      addDom('div', 'sv-meta', card,
        'On-device training bracket · ' + aliveIds.length + ' entries' +
        (elims ? ' · ' + elims + ' cut' : ' · final local podium'));
      addAction(card, 'Play local round', () => { closeOverlay(); launchRound(i); });
    }

    function showBoard(standings, eliminatedIds, isFinal) {
      document.body.dataset.show67Phase = isFinal ? 'final-board' : 'transition';
      const card = makeOverlay();
      addDom('div', 'sv-kicker', card, isFinal ? 'Final results' : 'Round ' + (roundIndex + 1) + ' results');
      addDom('div', 'sv-title', card, isFinal ? '🏁 Local Practice Podium' : '📋 Practice Bracket');
      const board = addDom('div', 'sv-board', card);
      standings.forEach((row, idx) => {
        const out = eliminatedIds.includes(row.id);
        const r = addDom('div', 'sv-row' + (row.isPlayer ? ' me' : '') + (out ? ' out' : ''), board);
        addDom('span', 'sv-rank', r, '#' + (idx + 1));
        addDom('span', 'sv-name', r, row.name + (row.isPlayer ? ' (you)' : ''));
        addDom('span', 'sv-score', r, String(Math.round(row.score)));
        addDom('span', '', r, out ? '💫' : '✅');
      });
      const playerOut = eliminatedIds.includes('player');
      if (isFinal) {
        addAction(card, 'To the ceremony!', () => { closeOverlay(); startCeremony(standings); });
      } else if (playerOut) {
        finalPlacement = placementOf(standings, eliminatedIds);
        addDom('div', 'sv-sub', card,
          'Your local run placed #' + finalPlacement + ' in this device’s training bracket.');
        addAction(card, 'Play Again', () => finalize(finalPlacement, { replay: true }));
        addAction(card, 'Finish', () => finalize(finalPlacement, {}));
      } else {
        addAction(card, 'Next round', () => { closeOverlay(); showRoundIntro(roundIndex + 1); });
      }
    }

    function placementOf(standings, eliminatedIds) {
      // eliminated this round take the bottom slots of the CURRENT field,
      // ordered by score (eliminatedIds arrive sorted best->worst).
      // R1 (8 in, 3 cut) -> #6-8 · R2 (5 in, 2 cut) -> #4-5.
      const rankAmongEliminated = eliminatedIds.indexOf('player');
      return standings.length - eliminatedIds.length + 1 + rankAmongEliminated;
    }

    // ---------- podium ceremony ----------
    function startCeremony(finalStandings, { hold = false } = {}) {
      document.body.dataset.show67Phase = 'ceremony';
      const top3 = finalStandings.slice(0, 3);
      finalPlacement = finalStandings.findIndex((s) => s.isPlayer) + 1;
      buildPodium(top3);
      setHud('🏆 Local ceremony');
      // slow celebratory orbit handled in the ticker via ceremonyT
      ceremonyT = 0;
      if (hold) return;
      later(() => {
        if (!alive) return;
        document.body.dataset.show67Phase = 'final-result';
        const card = makeOverlay();
        const place = finalPlacement;
        addDom('div', 'sv-kicker', card, 'Local practice result');
        addDom('div', 'sv-big', card, place === 1 ? '🏆' : place === 2 ? '🥈' : '🥉');
        addDom('div', 'sv-title', card,
          place === 1 ? 'LOCAL GAUNTLET WINNER!' : 'Local podium finish!');
        addDom('div', 'sv-sub', card,
          place === 1
            ? 'You topped this device’s training bracket.'
            : 'You placed #' + place + ' in this device’s training bracket.');
        addDom('div', 'sv-coins', card,
          '+' + COINS_BY_PLACE[place - 1] + ' local Coins · no cash value or online reward');
        addAction(card, 'Play Again', () => finalize(place, { replay: true }));
        addAction(card, 'Return to Skypark', () => finalize(place, {}));
      }, 1600);
    }

    // ---------- round lifecycle ----------
    let roundActive = false;
    let roundTimer = 0;
    let ceremonyT = -1;

    const shadowGoHome = (result) => {
      // Sub-game result buttons always provide a result object. A result-less
      // call comes from the global Return to Skypark path (or an unfinished
      // sub-game exit) and must honor that label by leaving the whole gauntlet.
      if (result && typeof result === 'object') endRound(result);
      else realGoHome();
    };

    onBus('game-result', (data) => {
      if (!roundActive || !sub) return;
      const gid = data && (data.gameId || data.game);
      if (gid && gid !== sub.id) return;
      endRound(data);
    });

    function launchRound(i) {
      const id = ROUND_IDS[i];
      setHud('Round ' + (i + 1) + '/3');
      if (!GAMES.has(id)) {
        showRoundUnavailable(id);
        return;
      }
      try {
        mountSubGame(id);
      } catch (error) {
        console.error('[show67] local round failed to mount:', id, error);
        cleanupSub();
        showRoundUnavailable(id);
      }
    }

    function showRoundUnavailable(id) {
      setHud('Local round unavailable');
      ctx.view.current = { scene, camera };
      const card = makeOverlay();
      addDom('div', 'sv-kicker', card, 'Local gauntlet stopped');
      addDom('div', 'sv-title', card, ROUND_META[id].name + ' could not start');
      addDom('div', 'sv-sub', card,
        '67 Show only uses Tag, Balloon Battle, and Skyway Sprint. No substitute result or online match was created.');
      addAction(card, 'Return to Skypark', () => realGoHome());
    }

    function mountSubGame(id) {
      const game = GAMES.get(id);
      const players = aliveIds.map((cid) => {
        const c = roster.find((r) => r.id === cid);
        return { id: c.id, name: c.name, charId: c.charId, isPlayer: c.isPlayer };
      });
      roundActive = true;
      roundTimer = ROUND_TIMEOUT;
      ctx.goHome = shadowGoHome;
      subShadowed = true;
      const handle = game.mount(ctx, {
        mode: 'show67',
        duration: ROUND_DURATION,
        players,
        roundIndex,
        onEnd: (result) => endRound(result),
      });
      sub = { id, handle: handle && typeof handle.unmount === 'function' ? handle : { unmount() {} } };
      if (!roundActive) cleanupSub(); // sub-game ended synchronously during mount()
    }

    function cleanupSub() {
      if (sub) { try { sub.handle.unmount(); } catch (e) { console.error('[show67] sub unmount', e); } sub = null; }
      if (subShadowed) { if (ctx.goHome === shadowGoHome) ctx.goHome = realGoHome; subShadowed = false; }
      // reclaim the view for the stage (a well-behaved sub-game cleared its own)
      ctx.view.current = { scene, camera };
    }

    function endRound(result) {
      if (!roundActive) return;
      roundActive = false;
      if (sub) cleanupSub();
      const standings = computeStandings(result);
      const elims = ELIMS[roundIndex];
      const eliminatedIds = standings.slice(standings.length - elims).map((s) => s.id);
      aliveIds = standings.slice(0, standings.length - elims).map((s) => s.id);
      setHud(elims ? 'The cut…' : 'Final results');
      showBoard(standings, eliminatedIds, elims === 0);
    }

    // ---------- result normalization + scoring ----------
    function extractScores(result) {
      // -> { byId: Map, playerScore: number|null }
      const byId = new Map();
      let playerScore = null;
      if (!result || typeof result !== 'object') return { byId, playerScore };
      const s = result.scores;
      if (Array.isArray(s)) {
        for (const e of s) {
          if (Array.isArray(e) && e.length >= 2 && typeof e[1] === 'number') byId.set(String(e[0]), e[1]);
          else if (e && typeof e === 'object' && typeof e.score === 'number') byId.set(String(e.id != null ? e.id : e.name), e.score);
        }
      } else if (s && typeof s === 'object') {
        for (const k of Object.keys(s)) if (typeof s[k] === 'number') byId.set(k, s[k]);
      }
      if (Array.isArray(result.standings)) {
        const n = result.standings.length;
        for (const e of result.standings) {
          if (e && e.id != null && typeof e.placement === 'number' && !byId.has(String(e.id))) {
            byId.set(String(e.id), Math.max(1, (n - e.placement + 1) * 10));
          }
        }
      }
      if (typeof result.score === 'number') playerScore = result.score;
      else if (byId.has('player')) playerScore = byId.get('player');
      else if (typeof result.placement === 'number') playerScore = Math.max(5, 100 - 12 * (result.placement - 1));
      return { byId, playerScore };
    }

    function computeStandings(result) {
      const { byId, playerScore } = extractScores(result);
      const baseline = playerScore != null ? Math.max(10, playerScore) : 35 + Math.random() * 30;
      const rows = [];
      for (const cid of aliveIds) {
        const c = roster.find((r) => r.id === cid);
        let score;
        if (byId.has(cid)) score = byId.get(cid);
        else if (c.isPlayer) score = baseline;
        else score = baseline * c.skill * (0.7 + Math.random() * 0.55) + Math.random() * 6;
        // The browser QA route exercises all three integrations in one run.
        // It changes only the simulated bracket comparison, never mode play.
        if (qaMode && c.isPlayer) score += 10_000;
        rows.push({ id: c.id, name: c.name, charId: c.charId, isPlayer: c.isPlayer, score });
      }
      // stable-ish sort by score desc; ties broken at random
      rows.sort((a, b) => (b.score - a.score) || (Math.random() - 0.5));
      return rows;
    }

    // ---------- finalize: coins, stats, result, home ----------
    function finalize(placement, { forfeited, replay = false }) {
      if (!alive || finalized) return;
      finalized = true;
      const coins = forfeited ? FORFEIT_COINS : COINS_BY_PLACE[Math.max(1, Math.min(TOTAL, placement)) - 1];
      const result = commitLocalGameReward(ctx.save, {
        game: 'show67',
        gameId: 'show67',
        score: TOTAL - placement + 1,
        placement,
        coins,
        forfeited: !!forfeited,
      }, '67 Show local practice · placed #' + placement + (forfeited ? ' (forfeit)' : ''));
      if (!result.rewardCommitted) {
        ctx.ui.toast('Coins could not be saved on this device. Quest and Season progress were not advanced.');
      }
      const stats = commitShow67Stats(ctx.save, placement);
      if (!stats.committed) {
        ctx.ui.toast('67 Show completed, but its local stats could not be saved on this device.');
      }
      const completedResult = {
        ...result,
        localStatsCommitted: stats.committed,
      };
      // replayGame starts a fresh lifecycle mount and emits this completed
      // result first; realGoHome remains the fallback for older hosts.
      if (replay && ctx.replayGame) ctx.replayGame('show67', completedResult);
      else realGoHome(completedResult);
    }

    // ---------- resize ----------
    function onResize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    // ---------- main ticker ----------
    let stageT = 0;
    const stop = ctx.loop.add((dt) => {
      stageT += dt;
      for (const s of spotCones) {
        s.cone.rotation.z = reducedMotion ? 0 : Math.sin(stageT * 0.7 + s.phase) * 0.35;
        s.cone.rotation.x = reducedMotion ? 0 : Math.cos(stageT * 0.5 + s.phase) * 0.2;
      }
      arch.rotation.z = reducedMotion ? 0 : Math.sin(stageT * 0.4) * 0.02;
      if (confettiOn && !reducedMotion) stepConfetti(dt);
      if (roundActive) {
        roundTimer -= dt;
        if (roundTimer <= 0) { endRound(null); return; }
      }
      if (ceremonyT >= 0) {
        ceremonyT += dt;
        const a = reducedMotion ? 0 : ceremonyT * 0.18;
        camera.position.set(Math.sin(a) * 3.8, 6.7, 9.5 + Math.cos(a) * 1.2);
        camera.lookAt(0, 1.6, -6);
      }
    });

    // ---------- boot the show ----------
    ctx.view.current = { scene, camera };
    setHud('Welcome!');
    showIntroCard();
    if (visualQaShow === 'transition') {
      roundIndex = 0;
      const standings = roster.map((entry, index) => ({
        ...entry,
        score: 880 - index * 73,
      }));
      showBoard(standings, standings.slice(-3).map(({ id }) => id), false);
    } else if (visualQaShow === 'podium' || visualQaShow === 'ceremony') {
      const standings = roster.slice(0, 3).map((entry, index) => ({
        ...entry,
        score: 1_000 - index * 100,
      }));
      closeOverlay();
      startCeremony(standings, { hold: visualQaShow === 'ceremony' });
    }

    // ---------- unmount (idempotent; main.js goHome wrapper calls this) ----------
    function unmount() {
      if (unmounted) return;
      unmounted = true;
      alive = false;
      roundActive = false;
      ceremonyT = -1;
      if (sub) { try { sub.handle.unmount(); } catch (e) { console.error('[show67] sub unmount', e); } sub = null; }
      if (subShadowed && ctx.goHome === shadowGoHome) ctx.goHome = realGoHome;
      subShadowed = false;
      stop();
      for (const [e, f] of busSubs) ctx.bus.off(e, f);
      for (const id of timers) clearTimeout(id);
      window.removeEventListener('resize', onResize);
      closeOverlay();
      document.body.classList.remove('show67-overlay-open');
      document.body.classList.remove('show67-mode');
      delete document.body.dataset.show67Phase;
      for (const d of dom) d.remove();
      if (ctx.view.current && ctx.view.current.scene === scene) ctx.view.current = null;
      for (const d of disposables) { try { d.dispose && d.dispose(); } catch {} }
    }

    return { unmount };
  },
});
