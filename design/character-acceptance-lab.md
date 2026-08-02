# Character Acceptance Lab

Status: local developer tool only. It does not approve, upload, persist, equip,
register, or release a character.

## Open the lab

1. Start the local game with `npm run dev`.
2. Open `/?dev=1`.
3. Enter Skypark.
4. Choose **Character Acceptance Lab** from the developer HUD.

The control and deferred module are absent from normal public play. A
`?panel=character-lab` query without `?dev=1` is ignored.

## Inspect an artist delivery

1. Select one self-contained `.glb` using the file picker, or drop it onto the
   picker.
2. Review the generated manifest template.
3. Replace every clip and anchor value with the exact, case-sensitive names
   from the artist export. Confirm the declared forward axis and target height.
4. Select **Run acceptance inspection**.
5. Read every failure and warning. `PASSED` means only that the automated
   manifest, rig, clip, anchor, bounds, and hard-budget checks passed.
6. If the asset is safe to preview, inspect its front, side, back, and
   three-quarter views beside the current QA Runner. Exercise idle, walk, run,
   jump, fall, land, and celebrate.
7. Use **Copy compact report** or **Download report JSON** for the mesh artist.

Candidate bytes stay in the current browser tab. The lab reads them with
`File.arrayBuffer()`, passes them to the same production-character adapter used
by registered development candidates, and does not create an object URL for
loading. A report download uses a temporary object URL that is revoked
immediately after the browser receives the click. Closing or clearing the lab
disposes the candidate, QA Runner reference, animation mixers, geometries,
materials, textures, renderer, and any pending report URL.

The 64 MB picker limit is a browser-safety ceiling, not an acceptance budget.
The automated contract still rejects a GLB over the current 4,000,000-byte
candidate budget.

## What the report means

The JSON report contains:

- the local filename and byte count;
- the exact manifest used for the run;
- automated status, preview safety, failures, and warnings;
- file, triangle, draw-call, bone, texture, and bounds metrics;
- the resolved animation clip names;
- named and fallback anchor facts;
- the remaining independent human gates.

It always says `releaseApproved: false` and `NOT APPROVED`. The lab never adds a
manifest to `src/character-candidates.js` and never changes the public roster.

## Human signoff that remains mandatory

- compare identity from every required view with the approved 2D art;
- inspect skin weights, deformation, clip loops, and root motion in a DCC;
- verify foot contact, grounding, camera clearance, and silhouette in motion;
- attach and inspect cosmetics at all five anchors;
- test Hub, Skyway, Tag, Balloon, UGC, and result celebration;
- test memory, load time, and frame pacing on a representative phone and
  laptop.

Use `design/production-character-asset-contract.md` for the complete delivery
and independent acceptance contract.
