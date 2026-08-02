# 67VERSE performance loading plan

This plan covers the browser prototype only. It does not add online play,
Public Network integration, or production-readiness claims.

## Startup classes

1. **Critical/eager**
   - Three.js renderer, player simulation, hub world, navigation shell.
   - Audio, so the first trusted gesture can unlock WebAudio.
   - Settings, so persisted rendering quality is applied before play.
   - Cosmetics and emotes, because they affect the visible hub avatar and HUD.
2. **Idle-safe**
   - Quests and Season load together during `requestIdleCallback`, with a
     timeout fallback. Their boot listeners opt into replay against the latest
     boot context, so old hooks are never run twice.
3. **Interaction routes**
   - Game modes, Creator, local chat, Worlds, Characters, Friends, Shop,
     Market, and the legacy Editor panel load only when requested.

## Hook lifecycle contract

- Normal hooks keep their existing behavior.
- A late-loaded module must explicitly register with `{ replay: true }`.
- Replay invokes only the newly registered hook with the latest arguments for
  that lifecycle name. Existing hooks are not replayed.
- A later real lifecycle run still invokes every registered hook normally.
- Idle modules must tolerate load failure. A later user request retries through
  the normal loader and uses the existing honest unavailable-state message.

## Enforced production budgets

- Initial JavaScript: at most 900 kB raw and 240 kB gzip.
- Any asynchronous JavaScript entry: at most 40 kB raw.
- `npm run build` generates `dist/.vite/manifest.json`, analyzes the actual
  source-to-chunk graph, writes `dist/performance-report.json`, and fails if a
  budget is exceeded.

These are regression rails, not final shipping targets. The current 500 kB
Vite warning cannot be resolved safely by moving renderer or hub ownership
without a separate architecture and visual-loading review.

## Gate before further deferral

Do not idle-load audio, settings, cosmetics, emotes, or hub construction until
browser traces prove that delayed initialization preserves first gesture audio,
equipped-avatar presentation, controls, and reduced-motion/quality settings.
