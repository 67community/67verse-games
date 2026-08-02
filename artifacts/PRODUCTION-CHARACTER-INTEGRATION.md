# Production character integration handoff

## Implemented

- One candidate manifest registry, empty until an external GLB exists.
- A same-origin GLB loader with byte caching and per-instance parsing.
- Manifest, rig, bounds, clip, anchor, and render-budget inspection.
- Deterministic target-height scaling, horizontal centering, forward-axis
  normalization, and feet-to-ground placement.
- Canonical `root`, `visual`, `mesh`, `anchors`, `animator`, `bounds`, and
  `dispose` fields, so every existing game consumes the candidate through
  `ctx.characters.createInstance()` without world-specific code.
- Exact clip mapping for idle, walk, run, jump, fall, land, and celebrate,
  cross-fades, speed scaling, and procedural animation fallback.
- Named cosmetic anchors with reported canonical fallbacks.
- Unique GLB geometry, material, and texture disposal on instance teardown.
- Structured `character-candidate-report` events and query-gated QA/dev
  activation.
- Automatic QA Runner recovery after request, parse, critical rig, or bounds
  failure.

## Deliberately not implemented

- No generated or placeholder GLB was labeled production.
- No candidate was added to the registry.
- No public roster or saved selection was changed.
- No hub, Skyway, minigame, UGC, or cosmetic world code was rewritten.
- No external art or rig has been approved.

## External handoff required

Supply a character GLB and authored manifest that satisfy
`design/production-character-asset-contract.md`. The missing external evidence
is:

1. a recognizable, approved 3D sculpt matching the approved 2D art from every
   required view;
2. an authored skeleton and clean skin weights;
3. seven in-place animation clips;
4. stable named nodes for the five cosmetic anchors;
5. real-phone load, animation, memory, and frame-pacing results;
6. independent visual and rig acceptance sign-off.

Until those inputs exist and pass, normal play continues to use the QA Runner.

## Validation recorded

- Current `tests/core.test.mjs`: 83/83 passed.
- Focused character and compatibility cases: 8/8 passed.
- Full project unit suite before the final additional disposal assertion:
  262/262 passed; the post-assertion core suite above covers the only subsequent
  source/test delta.
- Production Vite build: passed.
- Initial bundle performance budget: passed at 879.7 kB raw / 237.1 kB gzip
  against 900 kB / 240 kB limits.
- Clean-environment browser fallback smoke: 1/1 passed, including a saved Ghost
  selection resolving to the QA Runner without the explicit Ghost override and
  the existing appearance/cosmetic persistence behavior.
