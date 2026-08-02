# Creator Template Contract

## Scope

Creator offers three original, constrained starting templates. They prepare a
device-local level for testing and future discovery organization; they do not
upload, share, moderate, or connect a multiplayer service.

All templates use the canonical 16 × 16 grid, the finite asset registry, the
96-piece limit, the shared deterministic player simulation, and the existing
level-widget vocabulary.

## Templates

| Template | Literal objective | Safe structural minimum | Local tags |
| --- | --- | --- | --- |
| Race - Ribbon Run | Reach the Goal as quickly as possible | one Spawn and one Goal | `race`, `quick`, `beginner` |
| Survival - Four Corners | Stay in play for 20 seconds | one Spawn and at least two Spinners | `survival`, `hazards`, `beginner` |
| Score - Star Loop | Collect every Score Star | one Spawn and at least three Score Stars | `score`, `quick`, `precision` |

Ribbon Run uses paired blocks as readable gates around one ramp, two sweepers,
and one bounce. Four Corners uses four spaced sweepers, a protected center
pocket, and a symmetric outer frame so the spawn is not an instant trap. Star
Loop uses five visible stars, eight landmarks, one bounce, and one sweeper in a
compact circuit.

## Presentation contract

`src/ugc/presentation.js` is one shared, original visual kit for Creator and
Discover playback:

- one cohesive material palette keeps Block, Ramp, Spinner, Bounce, Score,
  Spawn, and Goal semantics stable across all three templates;
- a blue sky, park horizon, and raised island create foreground, midground, and
  background separation without adding gameplay;
- template-only ground marks clarify the Race route, Survival ring, and Score
  loop. They are flat, translucent, non-colliding, and never serialized;
- template-only distant landforms are one instanced decorative batch outside
  the 16 × 16 editor bounds;
- the Goal arch is co-located with the real Goal trigger and rotates
  perpendicular to the Spawn-to-Goal route in playback;
- Score Stars render in one animated instance batch. Their collection radius,
  count, and hide-on-collection behavior remain the canonical widget rules.

The editor grid and every authored piece remain visible and selectable. The
presentation layer never supplies ground sampling, collision boxes, scoring,
hazards, or objectives. Custom and near-maximum worlds omit template-only
landforms and marks so the existing playback budget remains intact.

## Validation and compatibility

- Save and Play Test both run mode-specific structural validation first.
- Local publication still requires a successful test after the most recent
  piece edit.
- Applying a template creates a new unsaved draft and resets its validation and
  publication state.
- Format version 3 stores bounded `gameplay` and `discovery` records.
- Existing version 1/2 and `goal-run` worlds normalize to Race. Their pieces,
  creator snapshot, dates, validation, and local publication state remain
  recoverable.
- Discovery tags come from a finite allowlist, are deduplicated, and are capped
  at four. No free-form description, identity, URL, or network metadata is
  accepted.
- Discovery continues to show only locally published worlds from this browser.

## Evidence and limits

Unit tests cover template/widget contracts, migration, mode validation, tags,
and compiled runtime pieces. Browser smoke covers template selection, the
shortened QA Survival completion, Score metadata persistence, the existing
Race test-to-publish path, and mobile action sizing.

Fixed views:

- `artifacts/visual-qa/creator-templates-desktop.png`
- `artifacts/visual-qa/creator-templates-mobile.png`
- `artifacts/visual-qa/ugc-template-race-playback-desktop.png`
- `artifacts/visual-qa/ugc-template-race-playback-mobile.png`
- `artifacts/visual-qa/ugc-template-survival-playback-desktop.png`
- `artifacts/visual-qa/ugc-template-survival-playback-mobile.png`
- `artifacts/visual-qa/ugc-template-score-playback-desktop.png`
- `artifacts/visual-qa/ugc-template-score-playback-mobile.png`

These are layout and local runtime observations, not physical-device,
moderation, sharing, or production-backend approval.
