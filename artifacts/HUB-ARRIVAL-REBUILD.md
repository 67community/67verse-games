# Skypark hub arrival rebuild — 2026-07-27

## Outcome

The prior hub first impression was rejected and replaced with an original,
coherent civic-ceramic arrival sequence. The accepted internal first-playable
now has:

- a framed arrival court and raised central Confluence Plaza;
- one spawn-visible Skyfold Canopy landmark;
- centered Play, left Creator, and right social destination cues;
- discrete route lozenges instead of one flat painted stripe;
- foreground, midground, and background depth;
- Skyway-matched sky, fog, lighting, palette, and material language;
- preserved Skyway entry, activities, controls, routes, and mobile UI.

Skyway gameplay and art files were not changed.

## Changed implementation

- `src/world.js` — complete hub scene composition and geometry rebuild.
- `src/world/hub-plus.js` — arrival metadata, onboarding copy, destination
  signals, and interactive Creator Terrace route.
- `src/world/skypark-composition.js` — authored route/landmark contract.
- `src/main.js` — shared Skyway-like hub atmosphere and lighting.
- `scripts/capture-visual-qa.mjs` — corrected dedicated Skyfold review pose.
- `tests/core.test.mjs` and `tests/browser-smoke.mjs` — composition and Creator
  destination coverage.
- `artifacts/visual-qa/REVIEW.md` — final visual decision and open gates.

## Exact verification

| Command | Result |
| --- | --- |
| `npm test` | PASS — 258/258 |
| targeted hub browser pattern | PASS — 8/8 |
| `npm run capture:visual-qa` | PASS — 27/27 captures |
| `npm run build` | PASS — build and bundle budgets |
| `npm run test:browser` | PASS — 42/42 |

Final hub performance:

| View | p95 frame | Draws | Triangles |
| --- | ---: | ---: | ---: |
| Desktop arrival | 9.5ms | 60 | 11,516 |
| Portrait mobile | 10.0ms | 38 | 7,388 |
| Short landscape mobile | 9.8ms | 54 | 8,896 |

Bundle result: `867.7kB` raw / `233.4kB` gzip against the project's
`900kB` / `240kB` initial-JS limits.

## Visual gate

Final evidence:

- [`hub-desktop.png`](visual-qa/hub-desktop.png)
- [`hub-mobile.png`](visual-qa/hub-mobile.png)
- [`hub-landscape-mobile.png`](visual-qa/hub-landscape-mobile.png)
- [`hub-skyfold-canopy-desktop.png`](visual-qa/hub-skyfold-canopy-desktop.png)
- [`report.json`](visual-qa/report.json)
- [`REVIEW.md`](visual-qa/REVIEW.md)

The first capture was explicitly rejected for repeating the landmark's fin
language at Creator Terrace, oversizing the landmark in the spawn frame, and
using a stale dedicated camera pose. The final evidence above includes the
corrected swatch-table Creator cue, reduced/softened landmark silhouette, and
reviewable camera pose.

## Remaining gates

- Physical iOS/Android performance and safe-area review.
- Manual VoiceOver/TalkBack review.
- Production character assets and animation.
- Human first-session feel/fun review.
- Online multiplayer certification.

These are honest release gates, not defects hidden by this pass.
