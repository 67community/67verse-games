# 67VERSE production character asset contract

Status: integration contract only. No external character is currently approved
for release, and the QA Runner remains the public fallback.

## Delivery

Provide one self-contained binary glTF 2.0 file (`.glb`) per character:

- Y-up, with the character facing +Z or -Z as declared in the manifest.
- Feet on one shared ground plane in the authored rest pose.
- One or more `SkinnedMesh` nodes and a real bone hierarchy.
- Embedded geometry, textures, and animations. No external URLs or buffers.
- A same-origin relative runtime path, such as
  `/characters/mav-v01.glb`.
- No Draco, Meshopt, KTX2, or other decoder-dependent extensions. The current
  runtime intentionally does not ship those decoders.
- Unique, stable, case-sensitive node and clip names.

Do not bake a floor, shadow, camera, lights, environment, collision geometry,
weapons, hats, or other cosmetics into the character.

## Runtime budgets

| Measure | Hard candidate budget |
|---|---:|
| GLB file | 4,000,000 bytes |
| Rendered triangles | 45,000 |
| Draw calls / material slots | 12 |
| Bones | 80 |
| Textures | 8 |
| Largest texture dimension | 2,048 px |

These are upper bounds, not targets. Mobile approval may require a smaller
asset after testing on a real phone.

## Rig and animation

The character must deform cleanly through the complete motion set. Animation
must be in-place: gameplay owns world translation and facing.

The manifest maps exact authored clip names to all seven required states:

| State | Expected behavior |
|---|---|
| `idle` | seamless 1–4 second loop with subtle life |
| `walk` | seamless loop with readable opposing arm/leg swing |
| `run` | seamless faster loop, distinct from walk |
| `jump` | takeoff and/or airborne anticipation without world translation |
| `fall` | stable airborne loop or pose |
| `land` | short one-shot recovery |
| `celebrate` | one-shot emote that returns cleanly to locomotion |

The runtime maps speed to walk/run playback rate, cross-fades states, and falls
back to the existing procedural animator if a mapped clip is unavailable.
Missing clips reject the candidate gate even though a QA/dev preview can still
be opened to diagnose the asset.

Required deformation checks:

- no collapsing shoulders, elbows, hips, knees, wrists, or ankles;
- no foot sliding at the nominal walk and run speeds;
- no mesh separation, body penetration, or texture swimming;
- first and final frames of loops match without a visible pop;
- root, scale, and facing do not jump between clips;
- silhouette and recognizable face survive idle, run, jump, and celebrate.

## Cosmetic anchors

Map these stable node names in the manifest:

| Anchor | Intended use |
|---|---|
| `head` | hats and headwear |
| `face` | glasses and face accessories |
| `back` | backpacks and back accessories |
| `handLeft` | left-hand props |
| `handRight` | right-hand props |

Each mapping can name a bone/node and optionally add a local position and
rotation adjustment. Missing nodes receive deterministic canonical fallback
anchors, are reported, and fail the visual accessory check; fallback placement
is recovery behavior, not art approval.

## Development manifest

Add a manifest to `src/character-candidates.js` only after the GLB is present.
Keep the registry empty otherwise.

```js
defineProductionCharacterManifest({
  schemaVersion: 1,
  id: 'mav-v01',
  name: 'Mav v01',
  url: '/characters/mav-v01.glb',
  activation: 'development',
  releaseApproved: false,
  targetHeight: 1.9,
  forwardAxis: '+z',
  clips: {
    idle: ['Idle'],
    walk: ['Walk'],
    run: ['Run'],
    jump: ['Jump'],
    fall: ['Fall'],
    land: ['Land'],
    celebrate: ['Celebrate'],
  },
  anchors: {
    head: 'Head',
    face: 'Face',
    back: 'Spine2',
    handLeft: 'Hand_L',
    handRight: 'Hand_R',
  },
});
```

Preview is intentionally possible only at:

```text
/?qa=1&characterCandidate=mav-v01
/?dev=1&characterCandidate=mav-v01
```

The query must contain the exact candidate ID. A candidate cannot become the
public equipped character through this registry. Any fetch, parse, critical
rig, or bounds failure returns the canonical QA Runner and emits a
`character-candidate-report` event.

## Independent acceptance gates

The asset is not approved because it loads. A reviewer who did not author the
GLB must sign off every gate:

1. **Automated contract**
   - run `npm test`;
   - manifest validation has no errors;
   - report status is `passed`, not merely `canPreview`;
   - all file, geometry, material, bone, and texture budgets pass;
   - no missing clips; no fallback anchors.
2. **Rig review**
   - inspect the bone hierarchy and skin weights in Blender or an equivalent
     DCC;
   - scrub every clip and loop boundary;
   - verify there is no root-motion translation.
3. **Identity turntable**
   - capture front, left, rear, right, and three-quarter views in neutral
     lighting;
   - compare the silhouette, head/body ratio, face placement, colors, and key
     character details side-by-side with approved 2D art;
   - reject the asset if any view invents, drops, or materially distorts a
     defining feature.
4. **In-game movement**
   - test idle, slow walk, full run, takeoff, fall, landing, and celebration;
   - verify grounding, facing, camera clearance, readable gait, and no sliding;
   - test reduced motion and low-quality rendering.
5. **Cross-surface**
   - verify the same instance in the hub, Skyway, Tag, Balloon, local UGC, and
     result celebration;
   - attach one cosmetic at every canonical anchor and check it from all sides;
   - test respawn, game return, repeated mounting, and disposal.
6. **Real-device performance**
   - test at least one representative iPhone-class phone and one laptop;
   - record frame pacing, memory behavior, visual glitches, and load time;
   - repeat with multiple nearby characters before approving crowd use.

Release approval is a separate product decision after all six gates. It must
not be represented by changing `releaseApproved` in a development manifest;
the public roster promotion should be a reviewed code change with its own
evidence.

For a local first inspection and artist-facing JSON report, use the
development-only workflow in `design/character-acceptance-lab.md`. The lab
delegates to this contract's runtime validator and adapter; it is not a
separate or weaker acceptance standard.
