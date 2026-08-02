# Skypark Composition Contract

This pass turns existing Skypark districts into one legible city-park
composition. It adds a small number of authored landmarks and route endpoints;
it does not pursue density through generic props.

## Spatial hierarchy

The **Gold Spine** remains the only primary route. It runs directly from the
south arrival gate to the Skyway Play gate with no landmark, activity, or
onboarding obstacle placed in its width. Secondary cream walks branch to local
activities and return to the same civic center.

The composition has three named landmarks:

1. **Skyloom Beacon** — the asymmetric coral 6, aqua 7, and warm crown. It is
   the north-star visible from arrival and anchors the first-play sightline.
2. **Ripple Pavilion** — three vertically stepped wave ribs at the far end of
   Ripple Walk. It gives the water crossing a social threshold without putting
   the chase camera inside an arch.
3. **Sunstep Terrace** — a folded gold spectator canopy and small sun crown at
   the outer edge of the sports court. It terminates the route without
   intersecting the basketball hoop or court interaction space.

The source of truth is `src/world/skypark-composition.js`. Its landmark and
route definitions drive both world construction and the QA snapshot; they are
not a parallel documentation-only map.

## Anti-slop rules

- Every landmark has one named composition or navigation purpose and one
  described silhouette.
- Existing routes, district surfaces, and material batches are reused before
  adding geometry.
- Static Beacon geometry is merged by material. Ripple and Sunstep also bake
  into existing aqua, cream, graphite, coral, and yellow batches.
- No third-party layout, mascot, name, UI, or trade dress is reproduced.
- No fake crowd, multiplayer, backend, or publishing activity is implied.
- Floating labels are limited to authored destination/district names already
  used by the hub; the landmarks do not introduce debug labels.
- A fixed camera check must reject any landmark that blocks the chase camera,
  merges visually with nearby gameplay equipment, or obscures the Play route.

## Interaction and performance

- The Gold Spine and Play portal remain unchanged and unobstructed.
- Quick Start, Beacon Line, Ripple Steps, destination markers, courts, and
  return-to-hub behavior keep their existing contracts.
- Landmark collision uses small invisible post proxies only; canopies and
  crowns do not create broad invisible walls.
- New static forms are merged into the hub's existing material buckets.
- The runtime QA snapshot exposes only IDs and validation state under
  `?qa=1`; it does not add public UI or persistence.
- Skyway's local multiplayer adapter is loaded beside the deferred Skyway
  route so its new protocol work does not break the 40 kB route-chunk gate.

## Review evidence

- Spawn views: `artifacts/visual-qa/hub-desktop.png` and
  `artifacts/visual-qa/hub-mobile.png`.
- Landmark views: `artifacts/visual-qa/hub-ripple-pavilion-desktop.png` and
  `artifacts/visual-qa/hub-sunstep-terrace-desktop.png`.
- Activity views: `artifacts/visual-qa/hub-beacon-line-desktop.png` and
  `artifacts/visual-qa/hub-ripple-steps-mobile.png`.
- Machine-readable capture and scoped performance evidence:
  `artifacts/visual-qa/report.json`.

These captures are an internal composition baseline, not art-final approval or
representative physical-phone profiling.
