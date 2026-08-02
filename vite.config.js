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
          return undefined;
        },
      },
    },
  },
});
