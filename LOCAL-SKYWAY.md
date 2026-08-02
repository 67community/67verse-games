# Local Skyway room development

This slice is a **localhost-only development aid**, not production multiplayer.
It keeps room state in memory and intentionally has no accounts, persistence,
public matchmaking, production rewards, payments, chat, analytics, or
user-data storage.

The local room server is authoritative for the shared Skyway course clock,
timed platforms, shutters, sweepers, movement integration, course collision,
checkpoint progression, falls and checkpoint respawns, finish state, finish
time, and placement. Clients send only bounded controls; checkpoint, position,
finish, placement, and result claims are not accepted client messages. Bounded
snapshots contain the server course clock and each player's authoritative
course state. The browser predicts immediate movement for responsiveness, then
reconciles its player and presents remote checkpoint/finish state from those
snapshots.

The server is **not** authoritative for identity, accounts, durable room state,
device-local Coins/quests/seasons, production progression, matchmaking, or
cross-process recovery. Existing local rewards remain browser-owned prototype
behavior and are not a production multiplayer reward system.

Run the game and room server in separate terminals:

```sh
npm run dev
npm run dev:skyway
```

Then open Skyway with the explicit local opt-in:

```text
http://127.0.0.1:5173/?online=1&room=skyway
```

Open a second isolated browser session with the same room query to verify local
presence. The HUD says `LOCAL DEV ROOM` only after the room authority has
accepted the client and returned a snapshot containing that client. If the
server is missing or disconnects, the HUD returns to `ECHO TRIAL` and remote
avatars are removed.

The optional `skywayPort` query parameter can target a different localhost
port during tests. The default is `4174`.

`ws` is a development dependency because Node does not include a WebSocket
server. Browser and room authority share the same immutable Skyway level
description, protocol validation, input rate controls, fixed-step player
simulation, and deterministic course/hazard simulation.

Production work still required includes authenticated identity, secure
deployment and origin policy, durable/distributed room orchestration, reconnect
and replay/reset semantics, abuse controls, observability, load/latency testing,
regional routing, and reviewed progression authority.
