# Mobile Interaction and Resilience Contract

Status: implemented local-build baseline, 2026-07-27.

## Interaction invariants

- The viewport uses `viewport-fit=cover`; every persistent edge control adds
  its authored spacing to the corresponding safe-area inset.
- Portrait and short landscape layouts retain the same gameplay actions. The
  short landscape layout reduces control diameter and hides only the redundant
  helper pill.
- Touch input is neutralized on window blur, hidden-document transitions,
  modal entry, and the 67 Show interstitial. A released or interrupted pointer
  cannot resume as movement, camera look, JUMP, or GRAB.
- Touch controls are visually hidden, `inert`, and `aria-hidden` while a modal
  decision owns input. Gameplay simulation remains paused behind that modal.
- Closing a modal restores the real initiating control when possible. If the
  initiating element is unavailable, focus returns to the in-game Return to
  Skypark action or the hub Play action.
- Returning from a hidden document resets the frame clock and fixed-step
  accumulator before simulation resumes.

## Local save and resume boundary

- Verified device-local profile, settings, rewards, progression, social state,
  and explicitly saved Creator worlds survive reload through the existing
  versioned local save contracts.
- Active round state is intentionally not serialized. Return to Skypark
  confirms that current round progress will be lost; no result is fabricated.
- Unsaved Creator edits still require the explicit Save action. This pass does
  not imply cloud save, cross-device resume, background multiplayer, or
  automatic recovery of an unnamed draft.
- Local UGC playback counters and completed rewards remain independent verified
  writes. A failed write stays visibly retryable and never becomes a false
  success.

## Fixed evidence

- `artifacts/visual-qa/hub-mobile.png`
- `artifacts/visual-qa/hub-landscape-mobile.png`
- `artifacts/visual-qa/tag-final-mobile.png`
- `artifacts/visual-qa/tag-return-modal-mobile.png`
- Existing fixed mobile Skyway, Balloon, Creator, and UGC playback/result
  captures in `artifacts/visual-qa/`

These are headless fixed-viewport layout and runtime observations. They are not
physical-phone thermal, GPU, browser-chrome, notch-model, or gesture-ergonomics
approval.
