# Visual QA Review — Skypark arrival rebuild

Evidence: `report.json` and the twenty-seven desktop/mobile PNG files in this
directory.

Decision: **Arrival rebuild accepted for the internal first-playable. This is
not an art-final or physical-device release approval.**

## Human review

The prior hub baseline was rejected even though it passed automated checks. Its
single flat gold stripe, giant facade blocks, detached candy-loop sculpture, and
large uncomposed beige floor made the first impression feel generic and visually
disconnected from Skyway.

The accepted rebuild is one authored arrival sequence:

1. A foreground arrival court frames the player and hands off to a raised,
   circular Confluence Plaza.
2. Seven discrete gold lozenges keep Play centered without painting a road
   through the entire space.
3. The asymmetric Skyfold Canopy is the single spawn-visible landmark: three
   folded civic-ceramic fins and one suspended lozenge. It is not a fountain,
   storefront, billboard, copied mascot, or imported layout.
4. Creator Terrace uses a low stack of coral/gold/aqua material swatches on the
   left. Echo Commons uses a crescent social seat and three echo pads on the
   right. Their silhouettes and color roles no longer repeat the landmark.
5. The Play threshold remains centered in the background, using folded piers,
   a graphite lintel, and one gold lozenge instead of a giant glowing ring.
6. Foreground landscape shelves, the midground civic plaza, and a low instanced
   ceramic skyline establish depth without adding arbitrary props.
7. Hub sky, fog, lighting, palette, and ceramic/enamel language now share the
   Skyway treatment.

I inspected the final `hub-desktop`, `hub-mobile`, `hub-landscape-mobile`,
`hub-flow-steps-desktop`, `hub-skyfold-canopy-desktop`,
`hub-beacon-line-desktop`, and `hub-echo-steps-mobile` captures. The first
capture pass was not accepted unchanged: Creator initially repeated the
landmark's fin language, the landmark was too tall in the spawn frame, and its
dedicated capture retained a stale camera pose. Those three issues were
corrected before the final evidence run.

## Automated evidence

- All twenty-seven capture points completed with no browser or console errors.
- Every runtime observation stayed within its declared guardrails.
- Hub desktop: High, `60` draws, `11,516` triangles, `9.5ms` p95 frame time.
- Hub portrait mobile: Low, `38` draws, `7,388` triangles, `10.0ms` p95.
- Hub short landscape mobile: Low, `54` draws, `8,896` triangles, `9.8ms` p95.
- Hub scene attribution remains `54` estimated draws; routes, destination
  markers, controls, and landmark remain present at Low.
- Phone actions, navigation, objective/status surfaces, and touch controls stay
  inside the safe viewport.

## Functional evidence

- Focused hub/browser verification passed `8/8`: first-visit retry honesty,
  desktop/mobile camera-relative movement, Skyway entry, Creator entry,
  composition metadata, activity completion/save failure, Quick Start save
  failure, and local diagnostics.
- Full unit/integration verification passed `258/258`.
- Full browser regression passed `42/42`.
- Production build and bundle budgets passed: initial JS `867.7kB` raw /
  `233.4kB` gzip against `900kB` / `240kB`.
- Skyway source and mechanics were not changed by the arrival rebuild.

## Remaining art and device gates

- Production characters still need their separate mesh/rig/animation/provenance
  gate; the procedural QA character is intentionally not art-final.
- Current skyline terraces are a restrained background system, not a promise of
  a full explorable city.
- Headless Chrome viewport evidence is not physical iPhone/Android approval.
- Human route feel, representative-phone thermals, VoiceOver/TalkBack output,
  and online multiplayer remain separate release gates.
- The accepted pass establishes hierarchy and coherence. Future density must
  have a named composition role and may not reintroduce placeholder blocks,
  painted-route clutter, candy loops, storefronts, billboards, or copied party
  game layouts.

Re-run `npm run capture:visual-qa` after any camera, UI, environment, lighting,
material, or character change, and perform the same direct screenshot review
before advancing the visual baseline.
