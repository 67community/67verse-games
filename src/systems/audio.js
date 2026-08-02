// audio.js — 67VERSE procedural SFX (GameDev_Audio).
// 100% WebAudio synthesis: no audio files, no network. Kid-friendly warm blips.
//
// Public surface:
//   ctx.audio.play(id)            — play a named sound ('jump','coin','pop','click',
//                                   'quest','portal','win','lose','land','equip',
//                                   'countdown','go','checkpoint','impact','finish',
//                                   'launch')
//   ctx.audio.setVolume(0..1)     — mirrors settings.volume (also reacts to the bus)
//   bus.emit('sfx', id | {id})    — generic request any module can fire
//
// Bus events consumed:
//   'sfx'                 {id} or string        -> play(id)
//   'coins-earned'        {amount}              -> 'coin'
//   'game-result'         {placement,win,...}   -> 'win' / 'lose'
//   'shop-purchase'       any                   -> 'coin'
//   'emote'               any                   -> 'pop'
//   'quest-progress'      any                   -> 'blip' (quiet)
//   'quest-complete'      any                   -> 'quest'
//   'character-equipped'  any                   -> 'equip'
//   'settings-changed'    settings object       -> master gain follows settings.volume
//
// Hub integration (registerHook('hub')): polls the shared sim each frame for
// jumpEvent / landing, and portal proximity — main.js emits no bus events for
// these, so audio detects them locally (no shared-file edits).
//
// Save keys: reads 'settings' (volume) via ctx.save; writes nothing.
//
// Lifecycle: module lives for the whole app session (boot-level system, no
// unmount contract). The one-time gesture-unlock listeners remove themselves.

import { registerHook } from '../core/registry.js';

// ---------- Sound cookbook (all synthesized) ----------
// Each entry is a function (engine, when) that schedules nodes starting at
// absolute AudioContext time `when`. Keep them short, soft-attack, no clicks.

function makeRecipes() {
  return {
    // Classic two-note pickup "di-ding" (E6 -> B5), triangle = soft/mallet-like.
    coin(e, t) {
      e.tone({ type: 'triangle', f0: 1318.5, t, dur: 0.09, gain: 0.5 });
      e.tone({ type: 'triangle', f0: 1975.5, t: t + 0.08, dur: 0.22, gain: 0.45 });
    },
    // Jump: quick happy upward sweep.
    jump(e, t) {
      e.tone({ type: 'sine', f0: 280, f1: 620, t, dur: 0.16, gain: 0.4, curve: 'exp' });
    },
    // Soft landing thud (low sine drop + tiny noise).
    land(e, t) {
      e.tone({ type: 'sine', f0: 160, f1: 70, t, dur: 0.12, gain: 0.35 });
      e.noise({ t, dur: 0.06, gain: 0.12, fLow: 200, fHigh: 900 });
    },
    // Tag/pop: bright bubble pop — pitch drop + noise tick.
    pop(e, t) {
      e.tone({ type: 'square', f0: 900, f1: 240, t, dur: 0.11, gain: 0.22 });
      e.noise({ t, dur: 0.05, gain: 0.18, fLow: 1200, fHigh: 5200 });
    },
    // UI click: tiny tick.
    click(e, t) {
      e.tone({ type: 'sine', f0: 840, t, dur: 0.05, gain: 0.28 });
      e.tone({ type: 'sine', f0: 1240, t: t + 0.03, dur: 0.05, gain: 0.18 });
    },
    // Quest complete: warm C-E-G arpeggio.
    quest(e, t) {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) => e.tone({ type: 'triangle', f0: f, t: t + i * 0.11, dur: 0.3, gain: 0.4 }));
      e.tone({ type: 'sine', f0: 1046.5, t: t + 0.33, dur: 0.45, gain: 0.35 });
    },
    // Portal enter: airy whoosh (sweeping filtered noise + rising gliss).
    portal(e, t) {
      e.noise({ t, dur: 0.55, gain: 0.22, fLow: 300, fHigh: 400, sweepTo: 2600 });
      e.tone({ type: 'sine', f0: 220, f1: 880, t, dur: 0.5, gain: 0.22, curve: 'exp' });
    },
    // Win: 4-note fanfare.
    win(e, t) {
      const seq = [523.25, 659.25, 783.99, 1046.5];
      seq.forEach((f, i) => e.tone({ type: 'triangle', f0: f, t: t + i * 0.13, dur: i === 3 ? 0.6 : 0.18, gain: 0.42 }));
      e.tone({ type: 'sine', f0: 1568, t: t + 0.39, dur: 0.6, gain: 0.2 });
    },
    // Lose: gentle two-note descend (never harsh — kid-safe).
    lose(e, t) {
      e.tone({ type: 'triangle', f0: 392, t, dur: 0.25, gain: 0.35 });
      e.tone({ type: 'triangle', f0: 261.6, t: t + 0.22, dur: 0.5, gain: 0.32 });
    },
    // Character/equip confirm: soft two-tone "ta-da".
    equip(e, t) {
      e.tone({ type: 'triangle', f0: 587.33, t, dur: 0.1, gain: 0.35 });
      e.tone({ type: 'triangle', f0: 880, t: t + 0.09, dur: 0.25, gain: 0.35 });
    },
    // Generic quiet blip (quest progress ticks etc).
    blip(e, t) {
      e.tone({ type: 'sine', f0: 660, t, dur: 0.07, gain: 0.2 });
    },
    // Race countdown: rounded single beat, distinct from UI clicks.
    countdown(e, t) {
      e.tone({ type: 'triangle', f0: 392, f1: 330, t, dur: 0.16, gain: 0.34 });
      e.tone({ type: 'sine', f0: 784, t, dur: 0.08, gain: 0.13 });
    },
    // Race start: compact upward cue that reads clearly on phone speakers.
    go(e, t) {
      e.tone({ type: 'triangle', f0: 523.25, f1: 1046.5, t, dur: 0.28, gain: 0.4, curve: 'exp' });
      e.tone({ type: 'sine', f0: 1318.5, t: t + 0.1, dur: 0.24, gain: 0.18 });
    },
    // Checkpoint banked: two clean, positive notes without sounding like a win.
    checkpoint(e, t) {
      e.tone({ type: 'triangle', f0: 659.25, t, dur: 0.14, gain: 0.34 });
      e.tone({ type: 'triangle', f0: 880, t: t + 0.09, dur: 0.24, gain: 0.32 });
    },
    // Obstacle contact: soft low bump and filtered tick, never a harsh alarm.
    impact(e, t) {
      e.tone({ type: 'sine', f0: 150, f1: 62, t, dur: 0.2, gain: 0.42 });
      e.noise({ t, dur: 0.1, gain: 0.16, fLow: 180, fHigh: 1100 });
    },
    // Finish-line crossing. The eventual results event still owns win/lose audio.
    finish(e, t) {
      [659.25, 783.99, 987.77].forEach((f, i) =>
        e.tone({ type: 'triangle', f0: f, t: t + i * 0.075, dur: 0.28, gain: 0.34 }));
    },
    // Hub destination confirm: a short doorway shimmer, separate from race GO.
    launch(e, t) {
      e.noise({ t, dur: 0.22, gain: 0.09, fLow: 500, fHigh: 1800, sweepTo: 3200 });
      e.tone({ type: 'sine', f0: 440, f1: 880, t, dur: 0.24, gain: 0.24, curve: 'exp' });
    },
  };
}

// ---------- Engine ----------
function createAudioEngine(save) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const recipes = makeRecipes();

  let ac = null;          // AudioContext (created lazily / resumed on gesture)
  let master = null;      // master GainNode -> destination
  let noiseBuf = null;    // shared 1s white-noise buffer
  let unlocked = false;
  const lastPlay = new Map(); // id -> ctx.time of last trigger (rate limit)
  const queue = [];           // sounds requested before unlock

  const volumeOf = () => {
    const s = save.settings || {};
    const v = Number(s.volume);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7;
  };

  function ensureContext() {
    if (!AC) return null;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = volumeOf();
      master.connect(ac.destination);
      // Shared noise buffer (1s white noise, reused by every noise voice).
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac;
  }

  // One-time unlock on first user gesture (autoplay policy).
  function unlock() {
    if (unlocked) return;
    if (!ensureContext()) return;
    const done = () => {
      unlocked = true;
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('touchstart', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      // Flush any sounds requested before the first gesture.
      while (queue.length) play(queue.shift());
    };
    if (ac.state === 'suspended') {
      ac.resume().then(done).catch(() => {});
    } else {
      done();
    }
  }
  function onGesture() { unlock(); }
  window.addEventListener('pointerdown', onGesture, { capture: true });
  window.addEventListener('touchstart', onGesture, { capture: true });
  window.addEventListener('keydown', onGesture, { capture: true });

  // ----- voices -----
  // tone: envelope-shaped oscillator with optional pitch sweep.
  function tone({ type = 'sine', f0 = 440, f1 = 0, t, dur = 0.15, gain = 0.3, curve = 'lin' }) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) {
      if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      else osc.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    // Soft attack / decay — no clicks, gentle on young ears.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // noise: enveloped white noise through a bandpass (optionally sweeping up).
  function noise({ t, dur = 0.1, gain = 0.2, fLow = 400, fHigh = 3000, sweepTo = 0 }) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(Math.sqrt(fLow * fHigh), t); // geometric center
    bp.Q.value = 0.9;
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function play(id) {
    if (!recipes[id]) return;
    if (volumeOf() <= 0.001) return;
    if (!ensureContext()) return;
    if (!unlocked || ac.state !== 'running') {
      // Remember one pending instance per id until the first gesture lands.
      if (!queue.includes(id)) queue.push(id);
      return;
    }
    // Rate-limit identical sounds (spam clicks / multi-trigger in one frame).
    const now = ac.currentTime;
    if (now - (lastPlay.get(id) || -1) < 0.045) return;
    lastPlay.set(id, now);
    try { recipes[id]({ tone, noise }, now + 0.001); } catch (e) { console.warn('[audio] play failed', id, e); }
  }

  function setVolume(v) {
    if (!master || !ac) return;
    const target = Math.min(1, Math.max(0, Number(v) || 0));
    master.gain.setTargetAtTime(target, ac.currentTime, 0.03); // smooth, zipper-free
  }

  return { play, setVolume, refreshVolume: () => setVolume(volumeOf()) };
}

// ---------- Boot hook: engine + bus wiring ----------
registerHook('boot', (ctx) => {
  const engine = createAudioEngine(ctx.save);
  ctx.audio = { play: engine.play, setVolume: engine.setVolume };

  const on = (evt, fn) => ctx.bus.on(evt, fn);

  // Generic request channel — any module: bus.emit('sfx', 'coin') or {id:'coin'}.
  on('sfx', (d) => engine.play(typeof d === 'string' ? d : d && d.id));

  // Standard 67VERSE events -> sounds.
  on('coins-earned', () => engine.play('coin'));
  on('shop-purchase', () => engine.play('coin'));
  on('emote', () => engine.play('pop'));
  on('quest-progress', () => engine.play('blip'));
  on('quest-complete', () => engine.play('quest'));
  on('character-equipped', () => engine.play('equip'));
  on('game-result', (r) => {
    const won = r && (r.win === true || r.placement === 1);
    engine.play(won ? 'win' : 'lose');
  });

  // Master volume follows settings.
  on('settings-changed', (s) => engine.setVolume(s && s.volume));

  // Warm, kid-friendly UI clicks on every button press (capture phase,
  // no DOM added, no listener leaks — one global listener for app lifetime).
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) engine.play('click');
  }, true);

  console.log('[audio] ready — procedural SFX armed (unlocks on first gesture)');
}, { replay: true });

// ---------- Hub hook: jump / land / portal sounds for the hub world ----------
// main.js never emits bus events for hub movement, so we poll the shared sim
// exposed via the 'hub' hook payload ({ scene, world, getSim }).
registerHook('hub', (ctx, hubCtx) => {
  if (!hubCtx || typeof hubCtx.getSim !== 'function' || !hubCtx.world) return;
  const { world, getSim } = hubCtx;
  let portalCool = 0;
  let wasFalling = false; // local tracker — sim state stays untouched/serializable

  ctx.loop.add((dt) => {
    const sim = getSim();
    if (!sim) return;

    if (sim.jumpEvent) ctx.bus.emit('sfx', 'jump');

    // Landing: was falling fast, now grounded (player.js marks the hook spot).
    if (sim.grounded && wasFalling) {
      wasFalling = false;
      ctx.bus.emit('sfx', 'land');
    } else if (!sim.grounded && sim.vel.y < -4) {
      wasFalling = true;
    }

    // Portal proximity (mirrors main.js trigger zone) -> portal whoosh.
    portalCool = Math.max(0, portalCool - dt);
    const pp = world.portalPos;
    if (pp && portalCool <= 0) {
      const dx = sim.pos.x - pp.x, dz = sim.pos.z - pp.z;
      if (Math.hypot(dx, dz) < 1.4) {
        portalCool = 3;
        ctx.bus.emit('sfx', 'portal');
      }
    }
  });
}, { replay: true });
