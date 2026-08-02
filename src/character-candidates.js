// Development-only production-character manifests.
//
// Keep this list empty until an externally authored GLB is supplied. Adding a
// manifest enables only `?dev=1&characterCandidate=<id>` and
// `?qa=1&characterCandidate=<id>` preview paths; it does not approve or ship
// the asset into normal play.
import { defineProductionCharacterManifest } from './core/production-character.js';

// hero-67 is the project's main character: it loads in normal local play,
// not only behind `?dev=1` / `?qa=1` preview queries.
export const DEFAULT_CHARACTER_ID = 'hero-67';

export const CHARACTER_CANDIDATES = Object.freeze([
  defineProductionCharacterManifest({
    schemaVersion: 1,
    id: 'hero-67',
    name: '67 Superhero (Meshy auto-rig)',
    url: '/characters/hero-67/hero-v13.glb',
    activation: 'development',
    targetHeight: 1.5,
    forwardAxis: '+z',
    clips: {
      idle: ['idle'],
      walk: ['walk'],
      run: ['run'],
      jump: ['jump'],
      fall: ['fall'],
      land: ['land'],
      celebrate: ['celebrate'],
    },
    // Meshy auto-rig output: stylized chibi mesh (~253k tris, 4K texture).
    // Development-preview budgets only; production optimization is an open gate.
    budgets: {
      maxFileBytes: 16_000_000,
      maxTriangles: 300_000,
      maxTextureSize: 4096,
    },
  }),
].filter(Boolean));

// Keep the helper referenced and available to the co-located manifest edit
// without requiring a second import path.
export { defineProductionCharacterManifest };
