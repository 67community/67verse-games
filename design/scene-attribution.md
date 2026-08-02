# Developer scene attribution

Hub and Skyway performance captures include an on-demand visible-scene
inventory. It estimates draws and triangles, counts unique geometries and
materials, and lists the top groups, materials, and geometries.

The inventory runs only when a developer presses `P` or calls
`window.__67VERSE_PERF__.scene()` / `.capture()`. It is never evaluated in the
normal frame loop, uploaded, or persisted.

Explicit groups currently include:

- Hub base, expanded districts, sky, feedback, and characters.
- Skyway environment, course, hazards, labels/UI, and characters.

Estimates are not renderer truth. Frustum culling, shadow passes, material
groups, and driver behavior can make `renderer.info` differ. Runtime renderer
totals remain the source for guardrail status; attribution identifies likely
owners for follow-up work.

## First evidence-driven batch

The July 2026 Hub capture identified five identical static destination-marker
bases using the same graphite material. They now use one `InstancedMesh`;
animated diamonds, labels, interactions, and colliders are unchanged.

| Measurement | Before | After |
| --- | ---: | ---: |
| Static scene draw estimate | 116 | 112 |
| Hub-district draw estimate | 77 | 73 |
| Hub-district renderables / instances | 77 / 77 | 73 / 77 |
| Spawn-camera renderer draws | 113 | 111 |
| Spawn-camera renderer triangles | 368,750 | 368,846 |

The renderer saves two rather than four draws from the tested spawn camera
because one instanced bounding volume renders all five bases when any marker is
visible; separate meshes allowed finer frustum culling. The added 96 triangles
are the two extra low-poly bases rendered in that view. This is an accepted,
documented prototype tradeoff, not evidence for broad batching across distant
districts.

## Co-located Skyway finish batch

The finish arch's two posts and beam shared one material, occupied one culling
region, and had no collision or animation ownership. Their construction
geometries are normalized to compatible non-indexed buffers and merged once.
The checker line, finish trigger, labels, platforms, and results flow are
unchanged.

At matched pre/post capture timing:

| Measurement | Before | After |
| --- | ---: | ---: |
| Renderer draws | 58 | 56 |
| Renderer triangles | 356,680 | 356,680 |
| Static scene draw estimate | 50 | 48 |
| Skyway-course draw estimate | 20 | 18 |
| Skyway-course unique geometries | 17 | 15 |
| Static attributed triangles | 184,602 | 184,602 |

Unlike batching distant markers, this co-located merge preserves culling
granularity and removes exactly two renderer draws in the measured view.
