# 006: Hand cursor

type: AFK
blocked_by: 004
prd: §4.3 gestures, §5 (One Euro, 70% mapping, mirroring)

## What to build
- `gestures` module: `createGestureEngine(config, classifier?)`, then `update(frame | null)` → `GestureOutput { cursor: {x,y}|null, pose, events }`. Pure, driven **only by frame timestamps** (no `Date.now`).
- The cursor point is the index fingertip. Mirror it, then map the inner ~70% of the camera frame to 0..1 screen space (clamped).
- One Euro filter (its own small pure module) for smoothing.
- Hand lost (`null` frame): the cursor becomes `null` and all state resets. The UI fades the dot out after about 300 ms.
- Draw a cursor dot on the page that follows the finger.

## Acceptance criteria
- [ ] TDD unit tests: the One Euro filter (steady input gives steady output; a step input converges), mapping and clamping, mirroring, and reset on `null`.
- [ ] A fixture test: replaying `synthetic-wave` gives a cursor inside [0,1] for every frame with no NaN.
- [ ] Manual check: the dot follows the finger smoothly, and corners are reachable without the hand leaving the frame.
