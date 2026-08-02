# Physical-device playtest handoff

Status: local developer tool only. No representative phone or laptop result is
recorded by this document, and the harness never grants release approval.

## Open the harness

1. Run `npm run dev` for a laptop on the same machine.
2. Open `/?dev=1`, enter Skypark, and choose **Physical-device playtest** from
   the developer HUD.
3. For the fresh-entry check, open
   `/?dev=1&panel=device-playtest` before choosing **Enter Skypark**. Append the
   entry snapshot, close the harness, and then exercise the entry.

The HUD control, system module, and report helper are excluded from the
production module graph. `?panel=device-playtest` without exact `?dev=1` is
ignored.

The live card shows:

- current route and Skyway local-room/fallback state;
- current FPS estimate and p95 frame time;
- current/peak draw calls and triangles;
- CSS viewport, device DPR, and renderer DPR;
- touch/pointer facts and active quality tier;
- JavaScript heap facts when the browser implements `performance.memory`.

These are browser observations, not a substitute for a human watching the
screen, feeling controls, checking heat, or using assistive technology.

## Run a representative laptop session

1. Start from a new private browser context at `/?dev=1`.
2. Exercise fresh entry and the hub with keyboard, pointer, and a resize across
   the supported viewport range.
3. Run Skyway, Tag, Balloon Battle, and the full 67 Show flow.
4. Open a curated Creator world from Worlds and complete local playback,
   including exit and return.
5. Open the harness after each route, enter what was actually observed, choose
   the matching checklist status, and append a telemetry snapshot.
6. Enable OS reduced motion, reload, and repeat entry, hub, and one mode.
7. Run the browser's accessibility inspector and complete the keyboard and
   screen-reader pass.
8. Download the session JSON. Keep the file with the tested build identifier;
   the game does not save or upload it.

## Run a representative phone session

1. Keep both devices on a trusted local network.
2. Start Vite on the LAN with `npm run dev -- --host 0.0.0.0`.
3. Open `http://<laptop-lan-address>:<vite-port>/?dev=1` on the phone. Do not
   expose this development server to the public internet.
4. Exercise portrait and landscape entry, hub traversal, camera, jump/grab,
   safe-area layout, route return, and every mode in the checklist.
5. Test Creator playback at ordinary and dense authored levels.
6. Use VoiceOver on iOS or TalkBack on Android for entry, menus, objectives,
   results, and return navigation.
7. Enable reduced motion and repeat a short route.
8. Observe a cold start, ten minutes of sustained play, battery use, device
   warmth/thermal throttling, background/foreground recovery, offline entry,
   and a constrained network. Record facts rather than interpreting them as an
   automatic pass.
9. Append snapshots during the session and download the JSON before closing the
   tab. In-memory evidence is intentionally lost when the tab is discarded.

## Local Skyway room and fallback

This is a localhost/LAN development exercise, not production multiplayer.

1. With the local room server stopped, open
   `/?dev=1&online=1&game=obstacle` and confirm the rendered state returns to
   **Echo Trial**. Append an observation; the report records
   `echo-trial-local-fallback`.
2. Run `npm run dev:skyway`, reload that route, and confirm the state reaches
   **Local Dev Room**. Append another observation.
3. Stop the local room server during a run and confirm the game recovers to the
   local Echo Trial rather than becoming unusable.

## Evidence and privacy contract

- A session lives only in module memory.
- Notes are length-bounded and should not contain private account data.
- The harness does not call `localStorage`, `sessionStorage`, IndexedDB, or a
  remote endpoint.
- Download uses a temporary Blob URL and revokes it immediately.
- Every exported report retains `physicalDeviceTestCompleted: false` and
  `automatedReleaseApproval: false`. A human release owner must separately
  review the evidence and sign off outside this tool.
