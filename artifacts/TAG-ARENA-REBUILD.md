# Tag Arena Rebuild — Switchyard Court

## Scope

This pass changes only Tag presentation and its visual-QA coverage. Tag rules,
collision behavior, bot logic, camera, input, pacing, accessibility, HUD, and
mobile budgets remain intact. Hub, Skyway, and Balloon sources were not edited.

## Authored identity

- Arena: **Switchyard Court**
- Landmark: **Broken Loop Bell**
- Visual language: low-poly civic ceramics, seafoam paving, cream inlaid court,
  terracotta parapet stones, glazed chase islands, and a restrained gold signal
  color.
- Final Chase state changes the route inlay and bell signal to rose without
  reusing that role color on obstacles.
- Five obstacles retain explicit collision metadata.
- Two designed chase routes retain at least 0.62 units of runner clearance.

## Visual review

Two revisions were rejected during self-review:

1. The first still read as a dressed blockout: floating skyline poles,
   fence-like boundaries, a clipped landmark, and a dominant central wall.
2. The second improved the material system but still lacked sufficient landmark
   hierarchy and mobile composition.

The third revision was accepted for this bounded pass after reviewing desktop
runner, mobile runner, and mobile Final Chase captures side by side. It replaces
the beige disk, literal boxes, and rail fence with a bounded courtyard, rounded
ceramic obstacles, a solid stone parapet, grounded skyline depth, and a complete
far landmark.

## Validation

- Core suite: **85/85 passed**
- Focused browser flows: **4/4 passed**
  - mobile Tag/Balloon guidance layout
  - Tag replay and return lifecycle
  - return confirmation pauses the round
  - mobile touch interruption and modal isolation
- Production build and bundle budget: **passed**
  - Initial JS: 879.7 kB raw / 237.1 kB gzip
  - Tag deferred chunk: 24.0 kB raw / 9.4 kB gzip
- Fixed-view visual/performance captures:
  - Desktop runner: p95 32.8 ms, peak 88 draws, 21,112 triangles
  - Mobile runner: p95 22.3 ms, peak 56 draws, 12,288 triangles
  - Mobile Final Chase: p95 10.2 ms, peak 47 draws, 10,300 triangles

## Remaining quality limits

The procedural skyline is intentionally simple to stay inside the browser and
mobile budgets, and the temporary character presentation still caps the overall
finish. The arena composition is no longer a blockout, but final production
characters and real-device performance review remain necessary for public
release quality.
