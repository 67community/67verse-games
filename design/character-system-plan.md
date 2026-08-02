# 67verse Canonical Character System Plan

Status: Phase 2 implementation contract  
Scope: Browser-only Three.js prototype  
Last audited: 2026-07-27

## C1 implementation status

Implemented after the audit:

- canonical `createInstance()` root/visual/anchor/animator/bounds/dispose contract.
- stable head, face, back, and hand anchors.
- presentation-only locomotion, jump, land, impact, celebration, and emote actions.
- Hub, Skyway, Tag, Balloon, Creator playtest, Discover replay, shared bots, and
  Collection previews migrated to instances.
- hub cosmetics attach to named anchors and clone per wearer.
- Collection previews use Crowd LOD metadata and render only visible dirty or
  animated cards on a bounded preview cadence.
- the developer HUD reports active character instances by Hero/Game/Crowd LOD.

Remaining C1 compatibility users are the non-featured 67Show prototype and the
pre-existing remote-racer path. They should migrate only in their relevant phase;
the remote path is not evidence of production multiplayer.

## Decision

67verse should converge on one recognizable **67 Hero** character family based on the
approved Ghost silhouette and face. Color, finish, accessories, emotes, and a small
number of silhouette-safe parts should create variety. The current procedural roster
remains useful as an experimental fallback, but its eleven unrelated characters are
not a promise that eleven production-quality species exist.

This keeps the prototype honest and gives every mode one shared animation,
cosmetic-anchor, LOD, and performance contract.

The product benchmark is the approachable, expressive social-game category. No
third-party character, animation, art, branding, or proprietary content should be
copied.

## Audit findings

### Current paths

- The hub loads `public/ghost.glb` directly in `src/main.js`.
- game modes and bots call `ctx.characters.buildMesh(...)`.
- the collection creates separate character previews.
- cosmetics use their own fixed attachment positions and a heuristic rig lookup.
- emotes deform the whole root rather than playing through a character animator.

These are four partially independent character paths. A change that works in one
does not reliably work in the others.

### Measured asset and runtime cost

| Item | Current measurement | Consequence |
| --- | ---: | --- |
| `public/ghost.glb` file size | 3.6 MB | Large first-character payload for a web hub |
| Ghost triangles | 171,886 | Far beyond a mobile social-hub hero budget |
| Ghost meshes / primitives | 4 / 5 | Manageable draw count, but excessive geometry |
| Ghost skins / animations | 0 / 0 | No reusable rig or authored motion |
| Ghost textures | 0 | Material/color variants are feasible without texture churn |
| Procedural character triangles | 1,612–2,416 | Geometry is modest |
| Procedural meshes / materials | 9–11 / 7–8 | Too many draws and allocations per simple bot |

`buildMesh` currently creates new geometry and materials for every instance.
Procedural characters therefore multiply CPU setup, memory, and draw calls even
though they are low-poly. The collection also owns another WebGL renderer and
continuously cycles multiple previews, which is expensive on mobile.

### UGC phone LOD audit — 2026-07-27

The fixed 390×844, 96-piece local UGC capture compared the existing `game` and
`crowd` values through the canonical `createInstance()` lifecycle. Both paths
rendered the approved Ghost reference as 5 meshes, 5 draws, 4 materials, and
171,886 triangles. Both retained the same anchors, bounds, animator contract,
14-draw scene total, 182,282-triangle scene total, and 9.9 ms local-browser p95.
The paired playback screenshots measured SSIM 0.999054; the small difference is
capture-time animation state, not a different character asset.

This confirms that `lod` is currently lifecycle and telemetry metadata:
`buildMesh()` does not consume it to select different geometry. UGC playback
therefore remains on Game LOD. Relabeling it Crowd would not save geometry and
would misrepresent the implementation. No approved hero asset was changed.
Creating a real lower LOD remains C2 asset work and requires the creative input
documented below. These measurements are local headless-browser evidence, not a
representative physical-phone benchmark.

### Animation behavior

`src/player-visuals.js` provides procedural idle bob, run swing, squash, and lean.
There are no explicit jump-start, airborne, landing, impact, celebration, or emote
states. Bots do not consistently use even the walk animator. Emotes manipulate the
root independently of locomotion, so actions can fight each other.

### Existing project budgets

The prototype already targets 60 fps desktop, a 30 fps mobile floor, device-pixel
ratio capped at 1.5, fewer than 120 hub draws, fewer than 80 race draws, and no
post-processing. The character system must fit inside those scene budgets rather
than consume them.

## Canonical runtime contract

All hub, game, bot, collection, and creator-preview characters should be built by
one service:

```js
const character = await ctx.characters.createInstance(characterId, {
  lod: 'hero',          // 'hero' | 'game' | 'crowd'
  variant: variantId,
  shadow: 'hero',       // 'hero' | 'blob' | 'none'
});

scene.add(character.root);
character.animator.update(dt, {
  speed,
  grounded,
  facing,
});
character.animator.signal('jump');
character.animator.signal('land', { strength });
character.animator.signal('impact');
character.animator.play('celebrate');
character.dispose();
```

Each instance must expose:

- `root`: movement transform owned by simulation code.
- `visual`: presentation transform owned by the animator.
- `anchors`: named transforms for `head`, `face`, `back`, `handLeft`, and
  `handRight`.
- `animator`: the only system allowed to deform or animate the visual.
- `bounds`: canonical standing height, radius, and grounded offset.
- `dispose()`: releases instance ownership without destroying shared resources.

Simulation remains deterministic. Animation consumes simulation state and events;
it never changes collisions, scoring, or authoritative movement.

## Asset and performance budgets

These are upper bounds, not targets to fill.

| LOD | Intended use | Triangles | Draws | Materials | Rig |
| --- | --- | ---: | ---: | ---: | ---: |
| Hero | local player, collection close-up | 8k–12k | 2–3 | <=2 | 24–32 bones |
| Game | opponents, normal hub distance | 3k–5k | 1–2 | <=2 | same skeleton |
| Crowd | distant players, small previews | 800–1.5k | 1 | 1 | reduced or baked |

Additional limits:

- one 512–1024 px texture set at most; prefer vertex colors and shared materials.
- one shadow-casting character in normal play. Rivals use a shared blob/contact
  shadow or no shadow.
- reuse geometries, skeleton-compatible clips, and materials from caches.
- do not allocate geometry, materials, or animation clips inside the frame loop.
- cap active full animators to visible characters; pause offscreen collection cards.
- the collection renders on demand and only for visible previews.
- a game-mode character group should remain under 20 draws for one player plus
  seven local bots.
- character update CPU target: under 2 ms at the mobile 30 fps floor for one player
  plus seven bots on the project reference device.

The current Ghost GLB is an art reference, not a shippable runtime LOD. It needs
retopology and a compatible rig before becoming the canonical runtime asset.

## Canonical animation set

The first shared set is intentionally small:

| State/action | Requirement |
| --- | --- |
| Idle | readable breathing/weight shift, seamless loop |
| Run | speed-scaled loop with clear silhouette |
| Jump start | short anticipation without delaying movement |
| Airborne | stable readable pose |
| Land | strength-scaled squash and recovery |
| Impact | brief directional reaction |
| Celebrate | result-screen and finish feedback |
| Hop / Spin / Wave / Groove | interruptible social emotes |

Locomotion blends continuously. One-shot actions have explicit priorities:
`impact > land > jump > emote > locomotion`. Emotes can be cancelled immediately
by movement or gameplay. Reduced-motion mode replaces large spins and squash with
short color/pose feedback.

Until an authored rig is available, the procedural animator may implement the same
state API. This lets gameplay, cosmetics, and tests migrate before broad asset work.

## Character variants and cosmetics

- `67-hero` is the canonical family identifier.
- skin variants change shared color/material parameters and approved
  silhouette-safe pieces.
- accessories attach only to named anchors provided by the character instance.
- cosmetic definitions describe an anchor, local transform, and bounds; they do
  not search the scene or assume fixed world positions.
- cached cosmetic templates are cloned per wearer. A single cached group must not
  be reparented between characters.
- creator-facing blocks and levels reference stable character/asset IDs, never raw
  filenames.

## Implementation sequence

### C1 — Unify the API without changing art

1. Add the instance/anchor/animator contract to `src/core/characters.js`.
2. wrap the existing procedural characters with shared cached resources.
3. adapt the current procedural animator to the canonical state/event API.
4. migrate the hub away from its direct GLTFLoader path.
5. migrate bots, modes, cosmetics, emotes, and collection previews.

Validation:

- every character path uses the same service.
- no regression in local movement, modes, result flow, or saved selection.
- repeated spawn/dispose does not increase live geometry/material counts.

### C2 — Optimize the canonical hero asset

1. preserve the approved Ghost silhouette, face proportions, and material language.
2. produce compatible Hero, Game, and Crowd LODs.
3. rig once with the canonical 24–32 bone skeleton.
4. author the first animation set and export validated GLBs.
5. record source, ownership, exporter version, triangle count, materials, and hash
   in the asset registry.

Validation:

- GLB validator passes.
- LODs share skeleton/clip names where applicable.
- budgets above pass on desktop and a representative mobile device.
- comparison screenshots confirm silhouette continuity.

### C3 — Presentation and scale

1. add distance/importance-based LOD selection.
2. use shared blob shadows for local bots and future remote avatars.
3. render collection previews only while visible or dirty.
4. add lightweight animation-quality tiers.
5. instrument character draws, triangles, active animators, and frame time in the
   existing performance HUD.

## Validation gates

No broad character-asset change is complete without:

- unit coverage for instance lifecycle, stable anchors, animator event priority,
  and variant fallback.
- production build and existing tests passing.
- keyboard, touch, and reduced-motion smoke checks.
- Hub, Skyway, Tag, Balloon, Collection, Creator playtest, and results smoke checks.
- measured draw calls, triangles, active animation mixers, and frame-time samples.
- an honest UI label for local bots; no multiplayer implication.

## Required creative input before C2

WJP needs to choose whether the production hero should:

1. retopologize and rig the existing approved Ghost mesh while preserving its exact
   silhouette, or
2. recreate clean topology from the approved silhouette reference.

That choice affects source-asset custody and art production, but it does not block
C1, the canonical runtime contract, shared-resource cleanup, or instrumentation.
