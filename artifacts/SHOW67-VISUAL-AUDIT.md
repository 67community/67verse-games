# 67 Show Visual and First-Playable Audit

## Outcome

67 Show is accepted as a coherent local gauntlet shell after one targeted
ceremony-stage repair. Its three nested games, bracket comparison, local-only
truthfulness, result and reward semantics, modal focus, and navigation were not
redesigned.

## Deterministic evidence added

Five fixed QA states now cover the shell instead of relying on a complete
three-round run:

- Intro and roster - desktop
- Intro and roster - mobile
- Inter-round cut board - desktop
- Unobscured podium ceremony - desktop
- Final result - mobile

The QA routes only choose a deterministic presentation state. They do not award
Coins, advance statistics, or manufacture a nested-game result.

67 Show now has an explicit runtime telemetry scope with the same bounded stage
budget as the other local modes.

## Human visual review

Accepted without redesign:

- The intro is readable on desktop and portrait mobile.
- The copy clearly states there are no live players, online bracket, remote
  tournament, cash value, or online reward.
- The cut board distinguishes advancing and eliminated training entries and
  keeps the player highlighted.
- The final result is readable on mobile and preserves both replay and return.

Rejected ceremony evidence:

- The original slow camera orbit crossed directly behind a foreground light
  tower. The tower and oversized lamp obscured the podium and pushed the arch to
  the edge, so the state failed the stage-composition gate.

Accepted targeted repair:

- The camera now uses a restrained front-of-stage dolly between the towers.
- Tower material changed from near-black to deep plum.
- Reduced-motion mode freezes camera, arch, spot-cone, and confetti motion while
  retaining one static confetti composition.
- The repaired capture keeps all three honest fallback characters, podium
  levels, arch, lights, and confetti readable.

## Validation

- Core tests: **87/87 passed**
- 67 Show browser flows:
  - Global return exits a nested local round without fabricating a result:
    **passed**
  - Full Tag, Balloon, and Skyway gauntlet preserves rewards when local Show
    statistics cannot be saved: **passed on isolated retry**
- Production build and bundle budget: **passed**
  - Initial JavaScript: 879.7 kB raw / 237.2 kB gzip
  - 67 Show deferred chunk: 16.0 kB raw / 6.6 kB gzip
- Scene peaks remained well below the Show draw and triangle ceilings:
  - Intro desktop: 14 draws / 1,872 triangles
  - Intro mobile: 9 draws / 1,144 triangles
  - Transition desktop: 14 draws / 1,872 triangles
  - Ceremony desktop: 59 draws / 16,276 triangles
  - Final result mobile: 34 draws / 8,980 triangles

## Runtime caveat

The fixed-view runtime reports remain automatically failed because the shared
host was saturated during capture. Observed p95 frame time ranged from about
70-89 ms even though the Show scene used only 9-59 draws and 1.1k-16.3k
triangles. These measurements are not relabeled as passing. A quiet-host and
physical-phone run is still required before public release.

## Evidence

- `artifacts/visual-qa/show67-intro-desktop.png`
- `artifacts/visual-qa/show67-intro-mobile.png`
- `artifacts/visual-qa/show67-transition-desktop.png`
- `artifacts/visual-qa/show67-ceremony-desktop.png`
- `artifacts/visual-qa/show67-podium-mobile.png`
