# 67VERSE Game — Architecture Contract (READ BEFORE WRITING ANY CODE)

Plain JS ES modules, Vite + three. No TypeScript, no framework. Kid-safe. Warm palette.
Every system is a **self-registering module**: it lives in its OWN file(s) and registers
at import time. `src/modules.js` imports all modules for side effects.
**NEVER edit shared core files or another module's files.**

## Palette (use these)
cream #f4efe7, beige #eae4d9, ink #2a2724, sub #7a736a, line #ddd4c6,
terracotta #d0775e, sage #5a9c7a, yellow #e8b64a, plum #8a6fb0, rose #c46f8e.
DOM UI: system font stack, rounded (14-24px), soft shadows, warm panels #fbf8f2.

## Core services (import from src/core/*)

### registry.js
```js
import { registerGame, registerSystem, GAMES, SYSTEMS } from './core/registry.js';
registerGame({ id, name, hint, color, mount(ctx, opts) -> ({ unmount() }) });
registerSystem(id, { open(ctx), close() });
```
- Game `mount` takes over the 3D canvas (your own THREE.Scene + camera; the hub is hidden).
  `unmount()` must remove all listeners/objects you added. Return to hub via `ctx.goHome(result?)`.
- System `open` shows DOM UI (use ui.js). `close` hides it.

### ctx (passed to mount/open)
```js
ctx = {
  renderer,            // THREE.WebGLRenderer (shared, NoToneMapping, sRGB)
  bus,                 // event emitter: bus.on(evt,fn) / bus.emit(evt,data) / bus.off(evt,fn)
  save,                // see below
  input,               // createInput() -> { poll() -> {mx,my,moving,jumpHeld,grabPressed}, isTouchDevice }
  goHome(result),      // unmount game, return to hub (result logged for quests/economy hooks)
  characters,          // see below
  THREE,               // the three module (use this, do not re-import a second copy... importing 'three' is also fine)
}
```
Loop: inside your game mount, use your own `renderer.setAnimationLoop`? NO — instead
`const stop = ctx.loop.add((dt) => {...})` where dt is clamped seconds. Call `stop()` in unmount.
Fixed-step sims: accumulate dt yourself like the hub does (see src/main.js pattern, SIM_DT = 1/60).

### bus.js — standard events (emit what you can; others listen)
`coins-earned {amount, why, total}` (verified coin writes only) ·
`game-result {gameId, score, placement, coins, rewardCommitted, attemptedCoins}` ·
`quest-progress {questId, n}` · `character-equipped {id}` · `chat-message {from, text}` ·
`ugc-world-published {id}` · `friend-added {code}`

### save.js — localStorage persistence (all JSON, namespaced "67v.")
```js
save.get(key, fallback)   // 'coins', 'profile', 'ownedChars', 'ownedCosmetics', 'equipped',
                          // 'skinTones', 'quests', 'season', 'friends', 'party', 'settings',
                          // 'ugcWorlds', 'ugcPlays', 'ugcLikes', 'modQueue', 'wallet'
save.set(key, value)      // true only after JSON serialization + localStorage read-back verification
save.addCoins(n, why)     // verified total, or null; emits coins-earned only after success
save.commitCoins(n, why, persist)
                          // stages a coin write, runs a verified local-state callback,
                          // then emits; best-effort coin rollback + null on callback failure
save.profile              // canonical session-stable { name, guest:true, pn:null }
save.profileState         // { profile, persisted }; persistence is device-local only
save.retryProfile()       // verifies the same session fallback, never regenerates it
```
Settings keys: `settings = { volume:0.7, quality:'high'|'low', chatEnabled:true,
parentalGate:false, spendCap:0, skinTone:'#f2c9a0' }`

#### Versioned device-local progression recovery

Progression saves are convenience state on this browser only. They are not
backend-authoritative receipts and must not be treated as online idempotency.
Current schemas use `version: 1` and repair individual corrupt fields:

- `quests`: `{version, daily, weekly}`; current-period valid order, progress,
  and claimed entries survive while invalid/duplicate entries are replaced.
- `season`: `{version, id, xp, premium, boostPct, claimedFree, claimedPrem,
  granted}`; a season-id change resets the season, while partial current-season
  fields recover independently.
- `show67Stats`: `{version, plays, wins, podiums, bestPlacement}` with bounded,
  internally consistent counters.
- `ugcWorlds`: `{version, worlds:[canonicalLevelV2...]}`; legacy arrays migrate,
  invalid entries are isolated, duplicate IDs keep the newest valid level, and
  stale local-publication validation falls back to a draft without deleting it.
- `ugcPlays` / `ugcLikes`: `{version, counts:{[worldId]: nonNegativeInteger}}`;
  legacy flat counter maps migrate automatically and valid world counters remain.
  Counter mutations report failure when their verified write is rejected. A
  failed Like stays actionable and emits no `ugc-like` progression event. A
  world-open `ugc-play` remains a true, independent play-entry fact, carries
  `counterCommitted:false`, and shows that only its aggregate count was not
  saved. Quest progress and Season XP handlers likewise persist their next
  state before emitting progress/level-up events or completion UI.
- `modQueue`: `{version, records:[ugcWorldReport|chatReport...]}`; malformed
  records are isolated, legacy mixed arrays migrate, and open reports whose
  local level no longer exists become `unavailable` instead of exposing a
  destructive action. Deleting a local level also removes only that level's
  play/like counters and resolves its open local reports.

Recovery never clears another save key and never converts malformed values into
rewards. See `src/core/local-save-schema.js` for shared bounds and UGC migration.
Storage writes remain device-local and can fail because storage is unavailable
or full. Creator and local-report mutations check the boolean `save.set` result,
keep the relevant dialog/action recoverable, and do not show success copy when
the browser rejects or cannot verify the write.

Friends and parties are local prototype state, not online relationships or
presence. Their actions emit events and success UI only after verified writes.
Friend removal stages its related `friends` / `party` updates together with a
best-effort rollback if a later device-local write fails.

Generated friend codes are also device-local prototype identifiers. A rejected
initial `friendCode` write keeps one stable session code, labels it session-only,
withholds the Copy action, and offers an explicit verified retry. The
`seenSkyparkArrival` marker follows the same honesty boundary: the welcome still
appears after a failed write and says it may repeat; only a verified marker
suppresses later first-visit welcomes.

Guest-profile initialization is canonical in `save.js`. Missing or malformed
local profile data is recovered once per page session, then persisted with the
same read-back verification as every other save. If that write is rejected,
Social, Chat, Creator, and local-mode headers all receive the same stable
fallback name and label it session-only. Retrying persists that exact profile;
it never generates a replacement identity. This does not change the Public
Network identity boundary or imply an online account.

Creator authorship and moderation reporter names are immutable local snapshots,
not references to a live profile or account. Resaving or republishing a level
preserves its original `creator` string even if the current guest fallback has
changed. Discover, Creator, local-review cards, and successful report feedback
label these values as local name snapshots; moderation recovery preserves the
captured reporter string rather than rewriting historical records.

Settings, character selection, and Closet equipment preserve the last verified
visible choice when storage rejects a write. Quality/appearance changes apply
to the live renderer or character only after persistence, and their change
events/success toasts follow that same verified boundary.

Chat messages stay in the current browser session. The block list and local
moderation queue are separate device-local convenience records: block/unblock
rerenders only after a verified `chatBlocked` write, while report UI states
explicitly whether its `modQueue` append was saved on this device.

Local game rewards use `commitLocalGameReward`. A failed coin write produces a
result with `rewardCommitted:false`, `coins:0`, and the attempted amount kept
separately for diagnostics. The result still reaches local mode/67 Show
lifecycle consumers, but the canonical Quest/Season result parser treats it as
ineligible progress. No `coins-earned` event or earned-total UI is produced.

Completed play and optional aggregate stats have separate persistence outcomes.
67 Show returns its completed result and verified Coin reward even when the
`show67Stats` write fails, marks that result `localStatsCommitted:false`, and
shows an explicit device-local warning. Hub activities likewise keep their
completion and reward facts, but label a rejected new `hubActivityBests` write
as “best time not saved” instead of presenting it as a saved achievement.

Quest and Season coin claims use `save.commitCoins`, so a rejected coin write
never runs the claim-state callback. Quest Season-XP and reward events emit only
after both the coin balance and claim state verify. Season boost/cosmetic claims
likewise emit success only after their required local records verify. These are
best-effort device-local staged writes, not transactional or backend receipts.

Coin blind-box purchases use the same staged contract. A new prize commits its
ownership record as the required Coin callback; a duplicate applies its rebate
inside one verified net balance change. `shop-purchase` and the reveal start only
after that commit succeeds, so a rejected debit/ownership write grants nothing
and shows no purchase success. This applies only to earned, device-local Coins;
it does not add or change Public Network checkout behavior.

Quick Start stages its 25-Coin reward with `quickStartDone` as the required
state write. Failure leaves onboarding incomplete and retryable, with no
completion telemetry or success copy. UGC world play counts remain independent
entry facts, while the 15-Coin goal reward reports `rewardCommitted` separately:
a real goal finish can still be shown, but failed Coin persistence produces no
`coins-earned` progression and explicitly says the reward was not saved.

### ui.js — DOM helpers
```js
ui.panel({ title, onClose }) -> { el, body, close }   // centered warm panel over the game
ui.button(label, onClick, opts?) -> HTMLButtonElement
ui.toast(text)                                        // bottom pill, 2.5s
ui.hudIcon(id, emoji, label)                          // registers a top-right HUD icon -> calls SYSTEMS[id].open(ctx)
ui.confirm(text) -> Promise<bool>
```
### pn.js — Public Network boundary (Codex owns the real side; DO NOT build PN infra)
```js
pn.identity()      // -> { guest:true, name } (local fake)
pn.upgradeToPN()   // -> Promise<{ok:false, reason:'PN integration pending (Codex)'}>
pn.unitsBalance()  // -> 0 (fake)
pn.buyCoinsWithUnits(units) // -> converts at 1:100, credits Coins, logs (local fake, one-way)
pn.marketList(asset) / pn.marketBuy(id) / pn.marketSell(id, price) // -> {ok:false,...} stubs
pn.chatSend(text)  // -> resolves {ok:true, filtered:text} (local echo for now)
```
Call pn.* for anything identity/Units/marketplace/chat-real. Never invent your own backend.

### characters.js
```js
characters.ROSTER            // [{id,name,color,head}] — 12 entries; 'ghost' uses the real ghost.glb
characters.buildMesh(id, {skinTone}) -> Promise<THREE.Group>  // ~1.9u tall, faces +Z when yaw=0... hub rotates via rotation.y = yaw
characters.equippedId() / characters.equip(id)
characters.applySkinTone(group, hex)
```
Placeholder heads are primitives ON PURPOSE (art pass comes later). Keep that pattern.

### bots.js
```js
import { spawnBot } from './core/bots.js';
const bot = await spawnBot(ctx, scene, { charId, x, z, behavior }) 
// behavior: (botState, dt, world) -> input {dirX,dirZ,moving,jumpHeld,grabPressed}
// bot.state = sim state; bot.group = THREE.Group; bot.dispose()
```
Bots run the same deterministic stepPlayer sim as the player. env: `{ sampleGround, bounds }` —
your game provides it (copy the raycast pattern from src/world.js `sampleGround`).

## Files you may create
Only inside your assigned scope. New directories allowed: `src/games/`, `src/systems/`, `src/ugc/`, `src/world/`, `src/ui/`.
Name assets `public/<scope>-*`. Placeholder art: primitives + palette, flat matte materials, keep tris low (mobile budget).

## Performance & safety budget
60fps laptop / smooth mobile: cap pixelRatio 2, shadow maps ≤2048, no post-processing chains,
no external assets/CDNs, no third-party IP. Under-13 posture: no real money anywhere except
through pn.* stubs; chat must pass through the filter in systems/chat if present.

## Testing hook
Every game/system must work when opened standalone. The dev harness (`?test=1`, src/dev/selftest.js)
will mount each game for ~4s and open each system panel, logging PASS/FAIL + console errors.
Your module must not throw on mount/unmount and must not leak animation frames after unmount.
