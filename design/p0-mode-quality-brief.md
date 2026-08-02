# P0 Mode Quality Brief

This brief locks the bounded quality pass for the three proven local modes. It
does not introduce multiplayer, new character assets, or a second progression
system.

## Shared quality rules

- State one rule in literal language before play.
- Teach through shape, color, timing, and one short contextual cue.
- Add one authored escalation and one memorable visual beat per mode.
- Preserve camera-relative desktop and touch controls.
- Recovery must return the player to a known safe state, not silently erase
  progress.
- Results explain what the player accomplished and what they can improve.
- Yellow marks an opportunity or action. Plum and rose mark danger. Sage marks
  safety or completion.

## Skyway Sprint

**One rule:** Pass three checkpoint gates, then cross the finish arch.

**Round rhythm:**

1. Broad runway teaches steering.
2. Two rose sweepers teach jumping.
3. Plum sliding walls add timing pressure.
4. Blink Bridge adds route choice.
5. The final spinner combines speed and jump timing.

**Escalation:** each checkpoint introduces one new hazard family, ending with
the fastest sweeper at the finish.

**Visual novelty and shortcut:** the Gold Line is a narrow, always-on series of
yellow stepping pads beside Blink Bridge. It avoids waiting for the larger plum
pads, but its smaller landing area demands cleaner jumps. Dark diamond inlays
make the route legible from the chase camera without floating copy.

**Recovery:** three visible gates bank progress. Falling returns the racer to
the latest gate, increments a fall count, and names the recovery action.

**Literal UI copy:**

- Objective: "Pass 3 gates, then cross the finish arch. Gold pads skip the
  blink wait."
- Checkpoint cue 1: "WALL HALL - time the plum sliders"
- Checkpoint cue 2: "BRIDGE - gold pads stay on"
- Checkpoint cue 3: "FINAL - jump the rose bar"
- Results report placement, finish time, route, falls, and coins.

## Balloon Battle

**One rule:** Dash into rivals, pop all three balloons, and be last standing.

**Round rhythm:** read the roster, hunt a target, dash, recover during the
cooldown, and choose whether to pursue a power-up or another rival.

**Escalation:** the last 30 percent of the timer is the Final Gust. Dash
cooldowns shorten and power-ups arrive faster. A central Gust Dial changes from
quiet rose ticks to a rotating yellow signal, and a live announcement explains
the rule change.

**Visual novelty:** the Gust Dial is a single authored civic-game marker in the
center medallion. It has a timing and navigation purpose; it is not scenery
density.

**Comeback:** existing item odds favor players with fewer balloons. The HUD now
surfaces "COMEBACK DROPS BOOSTED" when that rule applies instead of hiding the
advantage.

**Literal UI copy:**

- Objective: "Dash into rivals. Pop all 3 balloons. Be last standing."
- Tutorial: "Move - DASH into a rival - collect glowing power-ups."
- Escalation: "FINAL GUST! FAST DASHES + MORE DROPS"
- Results report placement, balloons popped, balloons remaining, and coins.

## Tag

**One rule:** Score every second you are a runner. If you become IT, touch any
runner to pass IT.

**Round rhythm:** the player opens as a runner so the scoring state is learned
first, reads the literal IT marker, uses obstacles to break pursuit, then adapts
between escape and chase as roles transfer. All five local participants use the
same safe-time plus transfer-bonus score rule, so placement is comparable rather
than decorative.

**Escalation:** the last 25 percent of the 90-second round is Final Chase.
Transfer lock shortens from 2 to 1.25 seconds and tag reach gains 0.15 world
units. A restrained rose arena ring and literal HUD announcement expose the
change.

**Fairness and comeback:** any participant that holds IT longer than seven
seconds receives the same gradual chase-reach assist, capped at 0.35 world
units. The former chaser receives 2.25 seconds of no-tag-back immunity, surfaced
with sage world and HUD signals.

**Literal UI copy:**

- Objective: "Score while you are a runner. If you become IT, touch any runner
  to pass IT."
- Runner: "RUN · every safe second scores · jump to cut corners"
- Chaser: "CHASE · touch any runner to pass IT"
- Escalation: "FINAL CHASE · Faster transfers · wider reach"
- Results report local placement, time safe, tags made, longest IT stretch, and
  coins.

This remains a local five-participant practice round. It does not imply live
multiplayer or network opponents.

## Acceptance

- Unit tests cover the route contract and escalation boundaries.
- Full browser smoke covers all three modes, replay, return, and 67 Show nesting.
- Production bundle and runtime budgets pass.
- Fixed desktop and mobile captures cover Hub, Tag, Skyway, and Balloon.
- Human visual approval remains required by `ART-BIBLE.md`.
