# Balloon Battle Presentation Rebuild

## Safe boundary

This pass changes Balloon Battle presentation only. The flat 30 x 30 simulation,
dash timing, contact pops, balloon lives, catch-up item rolls, bot behavior,
camera behavior, controls, accessibility semantics, rewards, and result flow
remain unchanged. The existing honest local-bot label and temporary character
fallback remain intact.

## Authored identity

- Arena: **Ribbonwind Garden**
- Landmark: **Aeolian Crown**
- Reusable visual language: celadon terraces, white rounded spars, translucent
  kite-glass, and coral wind ribbons.
- The central court remains free of visual obstacles.
- Balloon colors, white dash marks, gold octahedral wind-drops, cyan shields,
  and coral Final Gust signaling use separate visual roles.
- Dash trails, pop effects, and pickups are now bounded instanced draws instead
  of adding a draw for each live effect.

The pure low-tier arena is 7 estimated draws and approximately 4,760 triangles.

## Visual review

Three arena revisions and one late-round UI revision were reviewed:

1. **Rejected:** several instance-colored surfaces rendered nearly black, the
   Crown was vertically clipped, and the court still looked empty.
2. **Rejected:** materials and landmark framing were fixed, but the floor still
   read as one undecorated disk.
3. **Accepted:** a layered celadon and mint terrace, four visible coral wind
   ribbons, the Wind Dial, open perimeter spars, kite-glass screens, and the
   complete Crown create one clear visual identity without obscuring combat.
4. **Late round rejected then accepted:** the old 44 px Final Gust text wrapped
   into a seven-line wall on portrait screens. It now uses responsive type and
   reads as a compact two-line announcement while play and controls remain
   visible.

Accepted evidence:

- `artifacts/visual-qa/balloon-desktop.png`
- `artifacts/visual-qa/balloon-mobile.png`
- `artifacts/visual-qa/balloon-late-mobile.png`

## Validation

- Core tests: **87/87 passed**
- Focused browser flows: **4/4 passed**
  - mobile Tag and Balloon guidance handoff
  - return confirmation pauses the local round
  - touch input releases on interruption and remains isolated behind the modal
  - Balloon results return without stale UI or view state
- Production build and bundle budget: **passed**
  - Initial JavaScript: 879.7 kB raw / 237.1 kB gzip
  - Balloon deferred chunk: 29.4 kB raw / 11.3 kB gzip
- Captured mobile draw/triangle peaks remained inside guardrails:
  - Runner: 70 draws / 20,060 triangles
  - Late round: 69 draws / 20,156 triangles

## Performance caveat

The final fixed-view captures do not have an automated runtime pass. During the
capture window the host was saturated by Backblaze and concurrent headless
Chromium work; observed p95 frame time stayed around 63-67 ms even as arena
draws were reduced. This is reported as a failed environment-bound measurement,
not relabeled as a pass. Draw counts, triangle counts, unit/browser checks, and
the production bundle budget passed. A quiet-host run and physical phone check
are still required before public release.

## Remaining quality limits

The procedural background intentionally stays restrained for mobile. The
temporary characters remain the largest visual limitation, and the final arena
still needs physical-device performance confirmation.
