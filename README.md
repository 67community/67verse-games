# 67VERSE Game

Browser-first local 67VERSE game prototype built with Vite, Three.js, and plain JavaScript modules.

## Current boundary

A verified local first-playable exists. It is **not** a production release candidate. Online services, production multiplayer, approved production characters, physical-device evidence, and human art approval remain open gates.

Read these before changing code:

1. `PROJECT-STATUS.md` — active/queued/complete source of truth
2. `artifacts/FIRST-PLAYABLE-STATUS.md` — honest release boundary
3. `ARCHITECTURE.md` — module and integration contract
4. `ART-BIBLE.md` — visual rules and acceptance gates

## Run

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run test:browser
npm run build
npm run capture:visual-qa
```

Do not claim release readiness unless the complete browser and visual suites pass from one stable source digest and the required human/device gates are recorded.
