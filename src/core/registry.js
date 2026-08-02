// registry.js — module registries. Modules self-register at import time.
export const GAMES = new Map();    // id -> { id, name, hint, color, mount }
export const SYSTEMS = new Map();  // id -> { open(ctx), close() }
export const HOOKS = new Map();    // name -> [fn]  ('boot': after ctx, 'hub': after hub built)
const LAST_HOOK_RUN = new Map();   // name -> args from the latest lifecycle run

function invokeHook(name, fn, args) {
  try { fn(...args); } catch (e) { console.error('[hook]', name, e); }
}

// `replay` is deliberately opt-in. It lets a module loaded after boot hydrate
// against the latest lifecycle context without re-running older hooks.
export function registerHook(name, fn, { replay = false } = {}) {
  if (!HOOKS.has(name)) HOOKS.set(name, []);
  HOOKS.get(name).push(fn);
  if (replay && LAST_HOOK_RUN.has(name)) {
    invokeHook(name, fn, LAST_HOOK_RUN.get(name));
  }
}
export function runHooks(name, ...args) {
  LAST_HOOK_RUN.set(name, args);
  for (const fn of HOOKS.get(name) || []) {
    invokeHook(name, fn, args);
  }
}

export function hasHookRun(name) {
  return LAST_HOOK_RUN.has(name);
}

export function registerGame(def) {
  if (!def || !def.id || typeof def.mount !== 'function') throw new Error('bad game def');
  GAMES.set(def.id, def);
}
export function registerSystem(id, sys) {
  if (!id || !sys || typeof sys.open !== 'function') throw new Error('bad system def: ' + id);
  SYSTEMS.set(id, sys);
}
