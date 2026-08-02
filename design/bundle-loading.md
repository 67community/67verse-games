# Bundle loading seams

The immediate browser path owns only what a first session needs before making
a choice: the Skypark hub, base character, input, camera, movement, quality
tier, Play chooser, and audio gesture listeners.

The route loader in `src/modules.js` is the shared interface for deferred games
and panels. It deduplicates concurrent requests and removes failed requests from
its pending map so a later interaction can retry.

## Deferred modules

- Tag, Balloon Battle, Skyway Sprint, 67 Show, and Creator load when their route
  is requested.
- Settings, Emotes, Chat, social panels, collection, shop, Worlds, and other
  secondary panels load when requested.
- Closet starts in parallel after the shell is ready. It does not block the hub
  or base character, and replayable boot/hub hooks attach saved accessories.
- Party objective/results UI is a shared dependency of game chunks and is not
  part of the hub entry.
- Performance diagnostics and scene attribution load only for `?perf=1` or
  `?dev`.
- Quests and Season remain the documented idle-loaded progression pair.

Audio remains eager. Its trusted-gesture listeners must exist before a player’s
first touch, particularly on mobile browsers with strict Web Audio policies.

## Loading and recovery contract

- Panel triggers remain focusable while loading, expose `aria-busy` and
  `aria-disabled`, and ignore duplicate activation.
- A successful modal moves focus into the dialog and restores it to the
  initiating control when closed.
- Failed panel and game imports show an honest retry message. The shared loader
  clears the failed pending request so the next interaction can try again.
- Failed developer diagnostics never block gameplay.

## Production evidence

July 27, 2026:

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Initial raw JavaScript | 879,142 B | 852,382 B | -26,760 B |
| Initial gzip JavaScript | 235,509 B | 228,226 B | -7,283 B |
| Gzip budget headroom | 4,491 B | 11,774 B | +7,283 B |

`npm run build` also verifies that Settings, Emotes, Closet, performance
diagnostics, and the shared party-session chunk remain outside the initial
static closure. Every deferred chunk must remain below 40,000 raw bytes.
