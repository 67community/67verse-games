// modules.js — eagerly register hub-critical systems, but load playable routes
// only when the player asks for them. Keeping the loaders explicit gives Vite
// stable split points without changing the modules' self-registration contract.
import { GAMES, SYSTEMS } from './core/registry.js';
import './systems/audio.js';
import './world/hub-plus.js';

const GAME_LOADERS = Object.freeze({
  tag: () => import('./games/tag.js'),
  balloon: () => import('./games/balloon.js'),
  obstacle: () => import('./games/obstacle.js'),
  skate: () => import('./games/skate-race.js'),
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

export function loadIdleModules() {
  if (!idleLoadPromise) {
    idleLoadPromise = Promise.allSettled(IDLE_MODULE_IDS.map((id) => ensureSystemLoaded(id)))
      .then((results) => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
          }
        });
        return results;
      });
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
