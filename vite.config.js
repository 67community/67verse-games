import { defineConfig } from 'vite';

export default defineConfig({
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
          // The city's measured plan — every building, road, tree, prop, bowl
          // and mooring read off Oscar's reference — is pure data and larger
          // than the code that reads it. Splitting it off keeps the city's own
          // chunk small enough to stay inside the per-chunk budget, and the
          // two halves fetch in parallel.
          if (id.includes('/src/world/plan-verisi.js') || id.includes('/src/world/plan-ek.js')) {
            return 'city-plan-yapi';
          }
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
});
