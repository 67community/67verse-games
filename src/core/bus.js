// bus.js — tiny event emitter.
export function createBus() {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt)?.delete(fn);
    },
    off(evt, fn) { map.get(evt)?.delete(fn); },
    emit(evt, data) { map.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } }); },
  };
}
