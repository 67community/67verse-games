# Runtime performance telemetry

Scope: developer-only browser diagnostics for Hub, Tag, Skyway Sprint, Balloon
Battle, and local Creator/UGC playback.

Enable with `?perf=1` or `?dev`. The overlay shows rolling frame-time
percentiles, current/peak draw calls, current/peak triangles, character instance
peaks, sample count, active quality preference/resolved tier, renderer pixel
ratio, shadow state, visual-density state, and prototype guardrail status.
Press `P` to capture the current observation to the browser console. Developers
can also use:

```js
window.__67VERSE_PERF__.snapshot()
window.__67VERSE_PERF__.capture('label')
window.__67VERSE_PERF__.history()
window.__67VERSE_PERF__.quality()
window.__67VERSE_PERF__.sessionSummary()
window.__67VERSE_PERF__.sessionEvents()
window.__67VERSE_PERF__.exportSession()
window.__67VERSE_PERF__.exportSessionJson()
```

The diagnostics implementation and scene-attribution code are loaded only for
those query modes. Normal play does not download or parse them as part of the
initial JavaScript entry. If that optional chunk fails, the developer overlay
reports the failure while gameplay continues.

No observation is uploaded or persisted.

## Privacy-safe local session diagnostics

Normal play maintains a bounded memory-only event log so developers can
measure whether the local first-session route is coherent. The log has no
storage or network adapter, no session/user identifier, no wall-clock
timestamp, and no open-ended event payload. The only export surface is attached
to `window.__67VERSE_PERF__` when `?perf=1` or `?dev` explicitly loads the
existing diagnostic chunk. Normal play exposes no telemetry global or UI.

Each retained event uses schema version 1:

```js
{
  schemaVersion: 1,
  sequence: 6,
  atMs: 2400, // relative to this page session
  name: 'game_start',
  data: { gameId: 'tag', source: 'destination' }
}
```

The allowlist covers onboarding stages, Hub activity start/complete/exit,
destination entry, game start/phase/result/replay, resolved quality tier, and
recoverable error categories. Fields are bounded tokens, numbers, booleans, or
enums. Profile data, player names, chat, email, user IDs, URLs, IP data,
free-form errors, messages, and stack traces are rejected by construction.

The log retains at most 128 events in normal play. Its summary counts all
events seen during the page session and reports how many old entries were
dropped from the ring. The implementation hard-caps any configured capacity at
512. Reloading the page clears it; nothing is written to `localStorage`,
`sessionStorage`, cookies, or an analytics endpoint.

`exportSession()` returns a structured local diagnostic object.
`exportSessionJson()` returns the same allowlisted data as formatted JSON.
These are manual developer inspection tools, not an analytics backend or a
claim that production telemetry exists.

## Prototype regression guardrails

| Scope | Frame p95 | Draw calls | Triangles |
| --- | ---: | ---: | ---: |
| Hub | 33.3 ms | 120 | 400,000 |
| Tag | 33.3 ms | 130 | 380,000 |
| Skyway | 33.3 ms | 80 | 380,000 |
| Balloon | 33.3 ms | 80 | 380,000 |
| Creator / UGC | 33.3 ms | 160 | 240,000 |

Draw limits come from the existing character-system plan. Tag's ceiling accounts
for five independently animated local participants plus explicit gameplay-state
signals; its fixed High-tier capture measured 126 draws and 352,826 triangles.
Triangle limits add small headroom over the measured July 2026 prototype
baselines. They prevent silent regressions while the approved Ghost reference
remains intentionally over the future character budget.

Creator and UGC share one scope because they use the same bounded 96-piece
format. The ceiling covers a near-maximum mixed local level; the template
selector itself measured 29 draws / 1,820 triangles on desktop and 15 draws /
704 triangles in the fixed mobile view.

The first 45 frames after entering a measured scope are excluded as warmup. A
frame-time status is not issued until 120 samples exist. Scope changes retain a
bounded in-memory capture history.

## Deterministic quality tiers

- **Auto** resolves once at boot from viewport width, touch capability, data
  saver, reported device memory, and reported hardware concurrency. It does not
  respond to frame timing.
- **High** caps renderer pixel ratio at 1.5, enables shadows, and shows the full
  decorative-density layer.
- **Low** caps renderer pixel ratio at 1.0, disables shadows, and hides only
  explicitly tagged background decoration. Gameplay geometry, collision,
  controls, objectives, checkpoints, and characters are unchanged.
- Explicit High or Low choices override Auto and persist in the existing local
  settings record.

These numbers are local observations, not production benchmarks. A passing
desktop browser capture does not establish representative-mobile performance,
production readiness, or multiplayer scalability.
