// modules.js — eagerly register hub-critical systems, but load playable routes
// only when the player asks for them. Keeping the loaders explicit gives Vite
// stable split points without changing the modules' self-registration contract.
import { GAMES, SYSTEMS } from './core/registry.js';
import './world/hub-plus.js';

const GAME_LOADERS = Object.freeze({
  tag: () => import('./games/tag.js'),
  balloon: () => import('./games/balloon.js'),
  obstacle: () => import('./games/obstacle.js'),
  skate: () => import('./games/skate-race.js'),
  karting: () => import('./games/karting.js'),
  creator: () => import('./ugc/editor.js'),
  // 67Show chains Tag -> Balloon Battle -> Skyway Sprint, so its three rounds
  // load up front: a mid-gauntlet import stall would land between rounds, where
  // the player is already committed and a pause reads as a freeze.
  show67: async () => {
    await Promise.all([
      import('./games/tag.js'),
      import('./games/balloon.js'),
      import('./games/obstacle.js'),
    ]);
    return import('./games/show67.js');
  },
  squid67: () => import('./games/squid67.js'),
});

const SYSTEM_LOADERS = Object.freeze({
  cosmetics: () => import('./systems/cosmetics.js'),
  settings: () => import('./systems/settings.js'),
  emotes: () => import('./systems/emotes.js'),
  // Progression listeners are loaded as one idle-safe pair so their
  // cross-navigation buttons always find the companion system.
  quests: async () => {
    await Promise.all([
      import('./systems/quests.js'),
      import('./systems/season.js'),
    ]);
  },
  season: async () => {
    await Promise.all([
      import('./systems/quests.js'),
      import('./systems/season.js'),
    ]);
  },
  collection: () => import('./systems/collection.js'),
  shop: () => import('./systems/shop.js'),
  social: () => import('./systems/social.js'),
  chat: () => import('./systems/chat.js'),
  harita: () => import('./systems/harita.js'),
  market: () => import('./systems/market.js'),
  discovery: () => import('./ugc/discovery.js'),
  // Creator also exposes the legacy `editor` system panel.
  editor: () => import('./ugc/editor.js'),
  // Local-file GLB inspection exists only in the Vite development graph. The
  // production build replaces `import.meta.env.DEV` with false and removes the
  // loader and chunk entirely. Direct Node tests have no Vite env and retain
  // the route for focused contract checks.
  ...(import.meta.env?.DEV !== false
    ? {
        'character-lab': () => import('./systems/character-lab.js'),
        'device-playtest': () => import('./systems/device-playtest.js'),
      }
    : {}),
});

let idleLoadPromise = null;
let idleSchedulePromise = null;

export const GAME_ROUTE_IDS = Object.freeze(Object.keys(GAME_LOADERS));
export const SYSTEM_ROUTE_IDS = Object.freeze(Object.keys(SYSTEM_LOADERS));
export const IDLE_MODULE_IDS = Object.freeze(['quests', 'season']);

export function hasGameRoute(id) {
  return Object.hasOwn(GAME_LOADERS, id);
}

export function hasSystemRoute(id) {
  return Object.hasOwn(SYSTEM_LOADERS, id);
}

export function createRegistryRouteLoader(registry, loaders) {
  const pending = new Map();
  return async function ensureLoaded(id) {
    if (registry.has(id)) return registry.get(id);
    const loader = loaders[id];
    if (!loader) return null;
    if (!pending.has(id)) {
      const request = loader()
        .then(() => registry.get(id) || null)
        .finally(() => pending.delete(id));
      pending.set(id, request);
    }
    return pending.get(id);
  };
}

const loadGameRoute = createRegistryRouteLoader(GAMES, GAME_LOADERS);
const loadSystemRoute = createRegistryRouteLoader(SYSTEMS, SYSTEM_LOADERS);

export async function ensureGameLoaded(id) {
  return loadGameRoute(id);
}

export async function ensureSystemLoaded(id) {
  return loadSystemRoute(id);
}

// Hand the frame back to the browser: one paint, then a fresh task. Without
// it the whole idle pass lands inside a single frame.
function nefesAl() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function loadIdleModules() {
  if (!idleLoadPromise) {
    // Sound is synthesized, not fetched, and nothing is audible before the
    // player is through the entry gate, so it rides the idle pass rather than
    // the first bundle. It self-registers on import exactly as before.
    //
    // These import one at a time with a frame between, NOT all at once. Each
    // of them registers hub hooks that replay immediately and build real
    // geometry — five venue interiors, a rain field, the phone — so firing
    // them together put every build in one task. Measured on a 6x-throttled
    // main thread, that was a single 746 ms frame a moment after the hub
    // appeared: the freeze Oscar hit on his phone. Spread over frames the
    // same work never blocks a paint.
    const gorevler = [
      () => import('./systems/audio.js'),
      // Venue life, weather and the phone register hub hooks late and rely on
      // hook replay; riding the idle pass keeps them out of the first paint's
      // budget.
      () => import('./world/mekan-yasam.js'),
      () => import('./world/hava-durumu.js'),
      () => import('./systems/telefon.js'),
      ...IDLE_MODULE_IDS.map((id) => () => ensureSystemLoaded(id)),
    ];
    idleLoadPromise = (async () => {
      const results = [];
      for (const gorev of gorevler) {
        try {
          results.push({ status: 'fulfilled', value: await gorev() });
        } catch (reason) {
          results.push({ status: 'rejected', reason });
        }
        await nefesAl();
      }
      return results;
    })();
  }
  return idleLoadPromise;
}

export function scheduleIdleModules({ schedule, timeout = 1200 } = {}) {
  if (idleSchedulePromise) return idleSchedulePromise;
  const enqueue = schedule || ((work) => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(work, { timeout });
    } else {
      setTimeout(work, 0);
    }
  });
  idleSchedulePromise = new Promise((resolve) => {
    enqueue(() => resolve(loadIdleModules()));
  });
  return idleSchedulePromise;
}
