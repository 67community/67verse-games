# Local Session Telemetry Contract

## Purpose

Measure the internal vertical slice without creating user tracking. This
foundation answers narrow product-quality questions—where a local route starts,
finishes, exits, or recovers—inside the current browser page only.

## Hard privacy boundary

- Memory only; no persistence and no network transmission.
- No session ID, account/profile ID, player name, chat, email, IP, URL, or
  fingerprint field.
- No wall-clock timestamp. `atMs` is elapsed time since this page initialized.
- No arbitrary event names or arbitrary property bags.
- No error message or stack. Recoverable failures use bounded area/code enums.
- A developer can inspect/export only after enabling `?perf=1` or `?dev`.

## Version 1 event names

| Name | Allowed meaning |
| --- | --- |
| `onboarding_stage` | Started, movement learned, jump learned, or completed |
| `hub_activity_start` | Optional district activity opted into |
| `hub_activity_complete` | Activity completion time and actual local reward |
| `hub_activity_exit` | Explicit exit, navigation exit, or time limit |
| `destination_enter` | A named authored Hub marker was activated |
| `game_start` | A local game mounted successfully |
| `game_phase` | A bounded local mode phase such as playing, escalation, or results |
| `game_result` | A local result event was emitted |
| `game_replay` | A local replay was requested |
| `quality_tier` | Safe Auto/High/Low preference resolved |
| `recoverable_error` | A categorized failure fell back or returned control |

## Retention and interpretation

The default ring retains 128 events and reports dropped entries. Summary counts
include the full current page session, including events older than the retained
window. These counts are local diagnostics, not unique users, sessions,
retention, population analytics, or production service measurements.

Mode-specific result metrics remain bounded. Tag may report placement,
safe-time milliseconds, role-change count, and whether its escalation was
reached; it cannot attach player identity, rival identity, or free-form text.

The contract lives in `src/core/session-telemetry.js`. Lifecycle wiring is in
`src/main.js`, `src/core/ctx.js`, `src/world/hub-plus.js`, and the measured game
modules; developer export is in `src/core/performance-diagnostics.js`.
