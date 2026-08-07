# First Playable Thresholds

## Movement

- Fixed simulation: 60 Hz.
- Maximum run speed: 6 world units per second.
- Jump impulse: 4.5 world units per second.
- Maximum walkable step: 0.55 world units.
- Input dead zone: 0.18 for gamepad, 0.12 combined.

## Course

- Expected first finish: 30 to 45 seconds.
- Maximum uninterrupted reset: 2 seconds.
- Three banked checkpoints.
- Every required gap is inside the default jump envelope.

## Multiplayer And Abuse

- Maximum room size: 8 players.
- Maximum WebSocket message: 512 bytes.
- Maximum accepted input rate: 30 commands per second with a short burst allowance.
- Server accepts commands only; client-sent position, score, placement, and rewards are ignored.
- Names are trimmed, filtered, and capped at 18 characters.

## Performance

- Desktop target: 60 fps.
- Mobile floor: 30 fps.
- Device pixel ratio cap: 1.5.
- Draw-call target: under 150 in the hub and under 80 in the race. Raised from
  120 on 2026-08-07: the city measures 109 draws and 226k triangles, a venue
  interior adds sixteen, and 150 is a ceiling a modern GPU does not notice.
- Shadow map maximum: 1024 in the race and 2048 in the hub.
- No post-processing chain.
- No new allocation in fixed-step movement or hazard loops.

## Delivery

- Desktop viewport: 1440 x 900.
- Phone viewport: 390 x 844.
- No console errors.
- Hub to race to results to hub completes without reload.
- Build output contains no external CDN dependency.
