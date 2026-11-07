# 005: Record the real gesture fixtures

type: HITL
blocked_by: 004
prd: §6 testing (fixture list)

## What to do (human)
Use the dev capture hotkey from 004 to record these and commit them to the fixtures folder:
- `pinch-twice`: point, pinch, release, pinch, release.
- `swipe-left`, `swipe-right`: one clear swipe each, with a still hand before and after.
- `fidget-10s`: 10 s of natural hand movement with **no** intended gesture (scratching, waving, half-curled fingers).
- `hand-leaves-mid-pinch`: pinch, then move the hand out of frame while pinching.
- `open-palm-hold`: open palm held still for about 2 s.
- `fist-hold`: fist held for about 2 s.
- `demo-showcase`: about 10 s of nice-looking movement for "Watch a demo".

Write a short `README.md` in the fixtures folder describing each one (who recorded it, the lighting, and what it contains).

## Acceptance criteria
- [ ] All 8 fixtures are committed and load with `?source=fixture:<name>`.
- [ ] "Watch a demo" uses `demo-showcase`.
