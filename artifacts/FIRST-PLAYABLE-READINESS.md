# 67VERSE first-playable readiness — 2026-07-27

## Decision

**PASS for a local, browser-based first-playable review.**

No reproducible P0 defect was found in the fresh serial audit. The current candidate
loads, enters Skyway from the hub, accepts keyboard/mouse and emulated touch input,
animates running and jumping, completes and replays the course, returns coherently,
preserves modal/input isolation, and stays within the project's browser render and
bundle guardrails.

This is not a claim of production or physical-device readiness. The final human
feel/art-direction gate and real iOS/Android testing remain open.

## Fresh serial evidence

| Gate | Exact command | Result |
| --- | --- | --- |
| Unit/integration | `npm test` | **258/258 passed** in 24.67s |
| Browser flows | `npm run test:browser` | **41/41 passed** in 330.10s |
| Production build | `npm run build` | **PASS**; Vite build plus bundle budget |
| Movement proof | `npm run capture:movement-qa` | **PASS** |
| Visual/performance matrix | `npm run capture:visual-qa` | **25/25 captures passed** |
| Targeted readiness | `node scripts/check-first-playable-readiness.mjs` | **PASS** |

The browser suite included:

- Desktop and touch drag-look, camera-relative movement, hub destination entry,
  mobile HUD layout, interruption cleanup, return confirmation, and focus restore.
- Skyway mobile route framing, Crown Loom render budgets, a full autoplay finish
  and result return, and a three-round replay/accounting path.
- Failed local-storage/reward paths, loading/lazy-panel flows, UGC mobile playback,
  near-maximum UGC load, and creator test-to-publish cleanup.

## Input and play-loop evidence

- Procedural movement state sequence: `run → run → jump → fall`.
- Alternating foot-contact serial delta: `1`.
- Distance covered between stride captures: `1.79`.
- Arm swing: `1.11rad` left and right.
- Leg swing: `1.32rad` left and right.
- Recorded jump height: `0.67`.
- Course completion, results dismissal, replay accounting, and hub return passed
  in fresh browser runs.
- Respawn/collision behavior is covered by the round simulation/unit suite; the
  browser audit did not manufacture a fault to claim a manual respawn observation.

Movement artifacts:

- [`movement-contact-sheet.png`](movement-qa/movement-contact-sheet.png)
- [`report.json`](movement-qa/report.json)

## Mobile, accessibility, and reduced motion

Targeted headless Chrome viewport: `390×844`, touch enabled.

- Jump target is `84×84px`, inside the viewport.
- Mode navigation, status card, timer, and jump control remain within viewport
  bounds.
- Active touch controls are not inert or hidden from the accessibility tree.
- Skyway HUD exposes a named group, a named progressbar with numeric bounds/value,
  and an assertive event live region.
- `Return to Skypark` is reached by keyboard, has a visible `3px` focus outline,
  opens a labelled/described modal, traps focus inside it, and restores focus after
  Escape.
- Reduced-motion emulation is recognized, hides confetti, and collapses guide
  transition duration to `0.01ms`.
- Tested primary text/background pairs measure at least `9.68:1` contrast.

Machine-readable evidence:
[`first-playable-readiness.json`](first-playable-readiness.json)

## Visual and performance evidence

The 25-point visual matrix reported no page/console errors and no performance
breaches. I also visually inspected the fresh Skyway desktop, mobile, and movement
contact-sheet captures.

| Skyway capture | p95 frame | peak draws | peak triangles | Budget status |
| --- | ---: | ---: | ---: | --- |
| Desktop start | 9.1ms | 79 | 49,314 | within guardrails |
| Mobile start | 9.2ms | 69 | 44,226 | within guardrails |
| Desktop bridge | 8.9ms | 52 | 39,626 | within guardrails |
| Mobile bridge | 9.2ms | 45 | 35,026 | within guardrails |

Bundle evidence:

- Initial JS: `865.7kB` raw / `232.7kB` gzip against `900kB` / `240kB`.
- Skyway entry chunk: `39.1kB` raw / `14.9kB` gzip against a `40kB` raw cap.

Visual artifacts:

- [`skyway-desktop.png`](visual-qa/skyway-desktop.png)
- [`skyway-mobile.png`](visual-qa/skyway-mobile.png)
- [`skyway-bridge-desktop.png`](visual-qa/skyway-bridge-desktop.png)
- [`skyway-bridge-mobile.png`](visual-qa/skyway-bridge-mobile.png)
- [`report.json`](visual-qa/report.json)

## P0 defects

None reproduced. No gameplay or presentation behavior was changed during this audit.
A repeatable readiness harness was added at
[`scripts/check-first-playable-readiness.mjs`](../scripts/check-first-playable-readiness.mjs).

## Remaining risks and blockers

1. **Physical-device validation is still required.** Mobile results are honest
   Chrome viewport/touch emulation, not Safari on an iPhone or Chrome on Android.
2. **Manual screen-reader validation is still required.** DOM roles, names, live
   regions, focus visibility, focus containment, and restoration passed automated
   checks; VoiceOver/TalkBack output was not manually judged.
3. **Human feel and art direction remain subjective gates.** Automated screenshots
   can prove composition is present, varied, and within bounds; they cannot prove
   the course feels premium or fun to the intended audience.
4. **Performance numbers are local observations.** They are not low-end-device,
   thermal-throttling, real-network, or production-CDN benchmarks.
5. **Online multiplayer was not certified here.** This audit covers the current
   local/echo first-playable path and honest fallback behavior.

Recommended next gate: one short hands-on session on a representative iPhone and
Android device, with VoiceOver/TalkBack spot checks and a human course-feel review.
