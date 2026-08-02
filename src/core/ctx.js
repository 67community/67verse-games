// ctx.js — assembles the shared context passed to every game mount/system open.
import { createBus } from './bus.js';
import { createSave } from './save.js';
import { createUi } from './ui.js';
import { createPn } from './pn.js';
import { createCharacters } from './characters.js';
import { GAMES, SYSTEMS } from './registry.js';

export function createCtx({ renderer, input, THREE }) {
  const bus = createBus();
  const save = createSave(bus);
  const ctx = {
    THREE, renderer, bus, save, input,
    games: GAMES, systems: SYSTEMS,
    // ticker registry — games add per-frame callbacks; stop() removes them
    loop: {
      _fns: new Set(),
      add(fn) { this._fns.add(fn); return () => this._fns.delete(fn); },
      _run(dt) {
        for (const fn of [...this._fns]) {
          try {
            fn(dt);
          } catch (e) {
            console.error('[loop]', e);
            ctx.sessionTelemetry?.record('recoverable_error', {
              area: 'runtime-loop',
              code: 'callback-error',
            });
            this._fns.delete(fn);
          }
        }
      },
    },
    // active 3D view override — set by games, cleared on goHome
    view: { current: null },
    goHome(result) {
      if (result) bus.emit('game-result', result);
      ctx.view.current = null;
      document.body.classList.remove('in-game');
    },
  };
  ctx.ui = createUi(ctx);
  ctx.pn = createPn(ctx);
  ctx.characters = createCharacters(ctx);
  return ctx;
}
