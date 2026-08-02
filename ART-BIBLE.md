# 67VERSE Skypark Art Bible

## Visual promise

Skypark is an original, optimistic city playground built from smooth designer-vinyl forms. It should feel authored, civic, social, and immediately readable on a phone. The world is a connected place with landmarks and purposeful routes, never a beige floor scattered with unrelated shapes.

## Locked visual language

- **Palette:** cream `#f4efe7`, beige `#eae4d9`, ink `#2a2724`, line `#ddd4c6`, terracotta `#d0775e`, sage `#5a9c7a`, yellow `#e8b64a`, plum `#8a6fb0`, rose `#c46f8e`.
- **Forms:** rounded, chunky, broad, and toy-safe. Reuse a small bevel-radius family. Avoid sharp realism, noisy micro-detail, and arbitrary primitive piles.
- **Materials:** smooth vinyl, painted concrete, soft foliage, and restrained emissive signals. One object gets one material idea.
- **Lighting:** bright diffuse daylight, soft contact shadows, readable faces, and controlled highlights. No muddy beige atmosphere, crushed blacks, or unrelated lighting per district.
- **Composition:** a clear foreground activity, a middle-distance landmark, and a skyline or landscape layer. Every playable route needs a visible destination and at least one memorable silhouette.
- **Signals:** yellow means primary route or action; sage means safe/social; coral and plum mean hazards or competition. Critical meaning must also use shape and text.
- **UI:** warm translucent panels, 14-24 px radii, system type, strong hierarchy, mobile-safe actions, and literal local-play language.

## Originality and provenance

Third-party games may inform pacing or feature coverage, never silhouettes, maps, names, branded motifs, UI layouts, or trade dress. Every added asset must be original and recorded in `design/assets.csv` before release.

Each asset record must identify:

1. stable asset ID and in-game role;
2. authoring method: code-authored procedural, commissioned, user-supplied, generated, or licensed;
3. source file or generator/model and prompt record;
4. creation date, author/operator, and license or ownership status;
5. approved style formula version;
6. reviewer and acceptance date.

Generated output is reference material until a human checks silhouette, topology, materials, scale, side/rear views, and originality. A front render alone is never approval for a 3D asset.

## Prohibited patterns

- Beige voids, empty planes, or a skyline used to disguise an empty play space.
- Random cubes, cylinders, trees, decals, colors, or landmarks without a gameplay or composition role.
- Mixed bevel radii, material roughness, scale language, or lighting between nearby assets.
- Placeholder capsules, gray boxes, floating labels, or debug geometry in a public build.
- Fresh AI generations used directly without provenance and side-by-side human review.
- Invented geometry caused by shadows, transparent backgrounds, or inconsistent turnaround views.
- Copied branded characters, maps, logos, UI, or recognizable third-party visual signatures.
- Fake multiplayer, fake social activity, or rewards described as online when they are local.
- Text baked into world art when live accessible DOM text can carry the information.

## Acceptance gates

Nothing is shown as approved until all applicable gates pass:

1. **Purpose:** the asset or scene has a named gameplay, navigation, social, or composition job.
2. **Silhouette:** it reads at phone size and from front, side, rear, and gameplay camera.
3. **Cohesion:** palette, scale, bevels, roughness, light, and density match this bible.
4. **Originality:** provenance is complete and no borrowed trade dress is present.
5. **Interaction:** collision, camera obstruction, route clarity, and touch targets work.
6. **Responsive:** fixed desktop `1440x900` and phone `390x844` captures are legible.
7. **Performance:** build budget passes; runtime capture stays within scoped draw, triangle, and frame guardrails.
8. **Cleanliness:** no console errors, broken assets, clipping, placeholder copy, or contradictory local/online claims.
9. **Human visual review:** a reviewer compares fixed captures with the approved direction and records accept/reject. Automated screenshots provide evidence, not aesthetic approval.

Run `npm run capture:visual-qa` to produce the current fixed-view evidence in `artifacts/visual-qa/`.
