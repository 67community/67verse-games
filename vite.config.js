import { defineConfig } from 'vite';

// Built for GitHub Pages, which serves the game from /67versee/ rather than
// the domain root, so the build carries that base and the dev server does not.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/67versee/' : '/',
  build: {
    // The budget checker uses Vite's source-to-chunk graph rather than
    // filename guesses, so hashed production chunks remain measurable.
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The optional room adapter is a deep protocol boundary used only
          // by the deferred Skyway route. Split it without changing route
          // initialization or relaxing the per-chunk budget.
          if (
            id.includes('/src/core/multiplayer.js')
            || id.includes('/src/core/room-protocol.js')
          ) return 'skyway-multiplayer';
          // The venue interiors are shared by the deferred city chunk and the
          // idle venue-life chunk; their own chunk keeps city-districts under
          // the per-chunk budget.
          if (id.includes('/src/world/mekanlar.js')) return 'mekanlar';
          // The city's measured plan — every building, road, tree, prop, bowl
          // and mooring read off Oscar's reference — is pure data and larger
          // than the code that reads it. Splitting it off keeps the city's own
          // chunk small enough to stay inside the per-chunk budget, and the
          // two halves fetch in parallel.
          if (id.includes('/src/world/plan-verisi.js') || id.includes('/src/world/plan-ek.js')) {
            return 'city-plan-yapi';
          }
          // The fairground: three rides built off a traced coaster centre
          // line and its own measured colours, which no longer fits inside
          // the city's chunk alongside everything else. It takes THREE and
          // its one geometry helper as arguments rather than importing them,
          // because a named chunk that imports three has the whole library
          // folded into it and lands in the initial graph.
          if (id.includes('/src/world/city-funfair.js')) return 'city-funfair';
          if (
            id.includes('/src/world/plan-oge.js')
            || id.includes('/src/world/plan-skate.js')
            || id.includes('/src/world/plan-marina.js')
          ) return 'city-plan-oge';
          return undefined;
        },
      },
    },
  },
}));