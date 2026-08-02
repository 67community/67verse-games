# Public Copy Quality Contract

The browser build is an internal vertical slice, but player-facing text should
sound deliberate rather than like developer scaffolding. It must also remain
truthful about every local-only boundary.

## Voice

- Lead with the player action: enter, choose, play, create, chat, or return.
- Use **on this device**, **in this browser**, and **online is off in this
  build** for boundaries a player needs to understand.
- Use **training rivals** or **training bracket** for deterministic local
  opponents.
- Use **local Coins** and explicitly state no cash value where a reward could
  otherwise be misunderstood.
- Keep sentences short enough for the 390 px phone layout.

## Rejected debug language

Public surfaces must not call themselves `internal`, `prototype`, `playtest`,
`stub`, `fake`, or `coming soon`. Those words are useful in code comments and
status documentation, not in the product voice.

Removing debug language must never remove the underlying disclosure. The copy
must not imply live players, online rooms, account persistence, upload,
community publishing, authoritative moderation, cash value, or backend
services.

## Reviewed surfaces

- Entry gate and hub chat label in `index.html`
- Play chooser and mode status in `src/main.js` and
  `src/core/navigation.js`
- On-device Chat notice in `src/systems/chat.js`
- On-device social boundary in `src/systems/social.js`
- Creator/Discover storage and review-list boundaries in
  `src/ugc/discovery.js`
- 67 Show training-bracket and local-reward language in
  `src/games/show67.js`

## Provenance and review

All replacement copy is original, code-authored project UI text. It uses no
third-party slogan, game name, branded term, or generated asset. The stable
asset record is `public-local-boundary-copy` in `design/assets.csv`.

Fixed entry evidence is `artifacts/visual-qa/entry-desktop.png` and
`artifacts/visual-qa/entry-mobile.png`. Browser tests verify the Play, Chat,
Social, Discover, and 67 Show wording while their existing storage and
local-only behavior tests continue to enforce the actual product boundary.
