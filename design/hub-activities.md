# Skypark Hub Activities

This slice gives existing districts optional, local verbs without turning the
hub into a minigame menu or a field of generic props.

## Shared contract

- A player opts in at one authored district marker with the normal `E / GRAB`
  control or the mobile `ENTER` button. Walking past never starts an activity.
- The activity HUD states the objective, ordered progress, remaining time, and
  an explicit `EXIT` action. `E / GRAB`, the mobile `EXIT` control, Escape, and
  the HUD button all leave without a penalty.
- Only the active route displays checkpoint rings. Inactive routes add no
  permanent course clutter.
- Progress uses the same deterministic player position and jump event as the
  rest of the hub. No parallel character controller is introduced.
- Completion rewards are device-local and claimable once per activity. The
  reward flag and Coins commit together; a failed local write cannot produce a
  false claim.
- Activities do not emit `game-result`, claim multiplayer, or advance
  play-count/placement statistics.

## Beacon Line — Skate Plaza

**Objective:** run five ordered gates around the existing skate geometry in 24
seconds.

The line uses the plaza's east turn, funbox edge, south line, bank, and Beacon
return. Its only new world rendering is one instanced ring draw while active.
Completion awards 30 local Coins once.

## Ripple Steps — Water Garden

**Objective:** jump at each of the three existing ripple stones, then reach the
far bridge in 40 seconds.

Standing on a stone is not enough: the shared jump event must occur inside its
radius. This gives the garden a traversal verb without adding a new movement
system. Its active rings also use one instanced draw. Completion awards 25
local Coins once.

## Verification

- Unit tests cover definition validation, immutability, ordered progress, jump
  gates, opt-in, exit, completion, and timeout.
- Browser smoke covers mobile discovery, opt-in, HUD clarity, a complete
  reward transaction, and clean exit.
- Fixed activity captures are `hub-beacon-line-desktop.png` and
  `hub-ripple-steps-mobile.png` under `artifacts/visual-qa/`.
- Headless mobile capture is layout evidence, not physical-device performance
  approval.
