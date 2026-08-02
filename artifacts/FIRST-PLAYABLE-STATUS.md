# 67VERSE first-playable status

Updated: 2026-07-28

## Decision

**A local browser first-playable exists and is testable. It is not a production
release candidate.**

The verified scope is an on-device/browser vertical slice with an entry,
Skypark hub, movement and camera controls, local games, results/replay/return,
and local Creator playback. It does not prove production character fidelity,
physical-phone quality, production multiplayer, or premium art/feel.

## A. Verified local browser first-playable

- Entry and Skypark hub navigation work with keyboard/pointer and emulated
  touch; camera-relative movement, jump forgiveness, drag-look, modal pause,
  route return, focus restoration, and deterministic quality tiers have
  automated browser coverage.
- The procedural QA Runner visibly transitions through run, jump, and fall,
  with opposing limb motion and foot-contact events. This is movement-system
  evidence, not a production-rig approval.
- Skyway Sprint, Tag, and Balloon Battle have local objectives, deterministic
  rivals, round state, results, replay, reward accounting, and return cleanup.
- Local Creator/Discover supports bounded Race, Survival, and Score templates,
  test-before-save/publish validation, local playback, results, and return. It
  does not upload or share worlds.
- The local 67 Show route composes the tested rounds and ceremony for QA; it is
  not presented as an online or production service.
- Browser DOM checks cover labelled dialogs/HUDs, keyboard navigation, reduced
  motion, safe-area layout, and viewport containment. They do not prove
  VoiceOver/TalkBack output or a nonvisual equivalent for spatial play.

Primary evidence:
[readiness review](FIRST-PLAYABLE-READINESS.md),
[readiness JSON](first-playable-readiness.json),
[movement report](movement-qa/report.json),
[27-view visual report](visual-qa/report.json), and
[human visual review](visual-qa/REVIEW.md).

## B. Verified development-only capabilities

| Capability | Verified boundary |
| --- | --- |
| Character Acceptance Lab | Exact `?dev=1` local-file GLB inspection, neutral comparison, structured report, cleanup, and public-route denial are implemented. The current Ghost fixture is correctly rejected; the lab never equips or approves it. See [lab workflow](../design/character-acceptance-lab.md) and [production-character handoff](PRODUCTION-CHARACTER-INTEGRATION.md). |
| Local Skyway authority | Two isolated local browsers can join one localhost room, observe remote movement and authoritative checkpoint state, then visibly fall back to Echo Trial after the local server stops. Three recorded isolated runs passed. This is process-local development evidence only. See [browser proof](../tests/skyway-local-room-browser.mjs) and [local server](../scripts/local-skyway-server.mjs). |
| Physical-device playtest harness | Exact `?dev=1` tool records route, local-room fallback, FPS/p95, draw/triangle, DPR/viewport/input/quality, and optional memory facts; it appends bounded human notes in memory and downloads revoked-Blob JSON. It is absent from the production graph and cannot mark a device test or release approved. See [device handoff](../design/device-playtest-harness.md). |

## C. External and production gates still open

1. **Production character:** supply an approved rigged GLB, seven authored
   in-place clips, cosmetic anchors, provenance/rights, and budgets; pass the
   automated lab, DCC rig review, and independent side-by-side identity review
   against approved front/side/rear/three-quarter 2D art. The public fallback
   remains the QA Runner. See the
   [asset contract](../design/production-character-asset-contract.md).
2. **Physical devices and accessibility:** run representative iOS and Android
   sessions, including VoiceOver/TalkBack, reduced motion, portrait/landscape,
   sustained thermal/battery behavior, background/foreground recovery, offline
   and constrained-network behavior. No such session report exists yet.
3. **Production multiplayer:** provide and verify a production authority host,
   authentication/ownership, allowed-origin and transport policy, durable room
   lifecycle, reconnect/finality integration, abuse/rate controls, deployment,
   logs/metrics/traces, incident ownership, and scale/load evidence. The current
   localhost server and process-local reconnect modules do not satisfy this.
4. **Human product quality:** an authorized reviewer and representative players
   must judge character identity, art direction, readability, control feel,
   fun, pacing, and whether the first minute meets the intended quality bar.
   Automated screenshot variance and route completion cannot make that call.

## D. Latest evidence and its limits

| Evidence | Result | Honest scope |
| --- | --- | --- |
| `npm test` | **276/276 passed** on the current local source | Deterministic unit/integration coverage; not device, art, or service proof. |
| Focused device-harness browser test | **1/1 passed** | Dev gating, evidence capture, memory-only behavior, export, and cleanup. |
| Last recorded stable full browser regression | **42/42 passed** | Recorded with the accepted 27-view arrival baseline; not a fresh full sweep of every later local change. |
| Production build/budget | **PASS**; initial JS `883,500 B` raw / `238,400 B` gzip against `900,000 / 240,000`; Skyway `39,716 B` against `40,000` | Current local build evidence in [performance-report.json](../dist/performance-report.json); no deployment or CDN claim. |
| Stable fixed visual matrix | **27/27 captures passed**, no recorded browser errors, max p95 `10.0 ms`; `humanReview: required` | Headless fixed-view evidence in [report.json](visual-qa/report.json), not a physical-device benchmark or art approval. |
| Fresh amended-source visual matrix (2026-07-28, pre–Park Edge) | **FAIL**; 40/40 current captures recorded runtime p95 over budget (`38.3–74.3 ms`) while the maximum was `88` draws / `49,314` triangles | This invalidates using the earlier stable matrix as current-source proof. An isolated current hub rerun also failed at `50.9 ms` p95 with `63` draws / `12,764` triangles. The machine has substantial historical swap pressure, so this is not a physical-device verdict; it is nevertheless an automated-gate failure and must not be waved away. |
| Latest isolated hub capture after the Park Edge pass | **PASS**; p95 `9.8 ms`, `73` draws, `14,142` triangles | A single clean desktop hub capture. It verifies the Park Edge addition remains inside the local renderer budget, but it does not erase the preceding all-view failure or replace a fresh full matrix. |
| Fresh full matrix after Park Edge (2026-07-28) | **FAIL**; 30/40 captures over p95 (`34.0–79.4 ms`); 10 passed | The new full report is the current source evidence. It improves on the prior all-fail run but remains a hard performance-gate failure. Do not treat the isolated hub pass as proof for the other routes. |
| Isolated Beacon Line activity rerun | **FAIL**; p50 `27.8 ms`, p95 `80.3 ms`, `44` draws / `11,934` triangles | This is a reproducible slow route despite modest geometry, so it is a concrete profiling lead—not evidence that the full-matrix failure can be dismissed as density alone. |
| Beacon Line camera-raycast optimization rerun | **FAIL, improved**; p95 `52.2 ms`, `45` draws / `12,050` triangles | The safe-path camera optimization reduced the isolated activity p95 from `80.3 ms` to `52.2 ms` while the core camera obstruction checks passed. It remains over the `33.3 ms` gate. |

No physical iOS/Android, screen-reader, thermal, battery, production-network, or
production-multiplayer result is marked complete.

## Next actions, in order

1. Profile and repair the current visual runtime on a clean measurement host,
   then rerun the fixed matrix. The 2026-07-28 40-view sweep is a failure, not
   a replacement pass; retain it alongside the earlier stable baseline.
2. Receive the first approved rigged character package; run the Character Lab,
   DCC/animation review, multi-angle 2D identity comparison, and cross-surface
   in-game review.
3. Run the documented iPhone and Android sessions and export both harness
   reports, including VoiceOver/TalkBack and sustained thermal/network notes.
   A LAN-only preview is currently available at
   `http://192.168.1.232:7140/?dev=1` for devices on the same trusted network;
   it is not public deployment evidence.
4. Hold a short human art/feel playtest; record named accept/reject decisions
   and concrete defects.
5. Only after the local slice and product gates are accepted, design and deploy
   the production multiplayer service with explicit security, durability,
   abuse, observability, and operational acceptance criteria.
