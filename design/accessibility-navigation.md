# Accessible Navigation and Dialog Contract

Status: implemented and browser-verified on 2026-07-27.

## Scope

This contract covers keyboard and screen-reader navigation for the browser
shell, Hub actions, shared panels, confirmation dialogs, Emotes, the 67 Show
interstitial, mode HUDs, Discover, and Creator action bars. It does not claim a
nonvisual equivalent for spatial 3D gameplay or Creator grid authoring.

## Required behavior

- The entry gate is one labelled, described modal dialog. Initial focus lands
  on `ENTER SKYPARK`, Tab cannot escape it, and entering moves focus
  deterministically to `PLAY GAMES`.
- Only the top modal layer is available to keyboard and screen-reader
  navigation. Every background body layer is temporarily `inert` and
  `aria-hidden`, with its original state restored exactly when the modal closes.
- Shared dialogs expose `role="dialog"`, `aria-modal="true"`, a programmatic
  title, an explicit close label, Escape dismissal, wrapped Tab order, and
  initiating-control focus restoration. Confirmations additionally associate
  their decision copy through `aria-describedby`.
- Emotes and 67 Show use the same background-isolation contract as shared
  panels. Their action focus is contained, and close/exit restores a stable
  Hub or mode target.
- Hub and mode action collections have navigation or group labels. Current-mode
  and Hub return messages are atomic polite status announcements; transient
  toasts are polite status messages.
- Discover uses an automatic-activation tab pattern: Left/Right cycle, Home
  selects the first tab, End selects the last, and only the selected tab is in
  the page Tab order. World cards are articles with headings, and every repeated
  Play, Like, or Flag action includes its world name.
- Creator action collections expose toolbar labels. Native button Tab order
  remains available; spatial grid authoring is outside this slice.
- App readiness is explicit for deterministic automated navigation, and modal
  transitions neutralize transient movement input.

## Verification

- Browser smoke coverage exercises entry isolation, shared and stacked dialogs,
  Emotes, 67 Show, Discover tabs, unique card actions, focus wrap, Escape, focus
  restoration, and complete return cleanup.
- The fixed visual plan checks desktop and mobile entry, a mobile in-game return
  confirmation, Hub/modes, UGC, and Creator without changing the approved visual
  system.
- Automated DOM checks are not a substitute for VoiceOver/NVDA testing on
  representative physical devices.

## External decision required for broader accessibility

A nonvisual equivalent for 3D navigation, live spatial objectives, and Creator
grid editing needs an approved product interaction model: narrated landmark
navigation, objective summaries, spatial selection/edit commands, and success
criteria. Implementation should not invent that product behavior without design
and real assistive-technology validation.
