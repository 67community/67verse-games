// game-lifecycle.js — deterministic ownership for one locally mounted game.
//
// The browser shell supplies loading and mount functions; this controller only
// decides which async request is still current and guarantees that every owned
// mount is released at most once. Keeping DOM work outside makes cancellation
// and return-to-hub behavior testable without a browser.

export function createGameLifecycle({
  load,
  mount,
  unmount = (handle) => handle?.unmount?.(),
  onUnmountError = () => {},
} = {}) {
  if (typeof load !== 'function') throw new TypeError('game lifecycle requires load(id)');
  if (typeof mount !== 'function') throw new TypeError('game lifecycle requires mount(game, id)');

  let request = 0;
  let active = null;

  function release(entry, reason) {
    if (!entry) return null;
    try {
      unmount(entry.handle, entry, reason);
      return null;
    } catch (error) {
      onUnmountError(error, entry, reason);
      return error;
    }
  }

  function stop(reason = 'home') {
    request += 1;
    const previous = active;
    active = null;
    const unmountError = release(previous, reason);
    return {
      status: previous ? 'stopped' : 'idle',
      previous,
      unmountError,
    };
  }

  async function start(id) {
    const token = ++request;
    let game;
    try {
      game = await load(id);
    } catch (error) {
      if (token !== request) return { status: 'superseded', id };
      return { status: 'load-error', id, error };
    }

    if (token !== request) return { status: 'superseded', id };
    if (!game) return { status: 'unavailable', id };

    const previous = active;
    active = null;
    release(previous, 'switch');

    let handle;
    try {
      handle = mount(game, id);
    } catch (error) {
      return { status: 'mount-error', id, game, error };
    }

    // A mount may synchronously trigger a return (for example, a defensive
    // failure path inside a mode). Do not let its handle become active later.
    if (token !== request) {
      release({ id, game, handle }, 'superseded-after-mount');
      return { status: 'superseded', id };
    }

    active = { id, game, handle };
    return { status: 'mounted', id, game, handle };
  }

  return {
    start,
    stop,
    getActive: () => active,
  };
}
