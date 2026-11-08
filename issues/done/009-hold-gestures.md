# 009: Hold gestures (fist = clear, open palm = pause)

type: AFK
blocked_by: 008
prd: §3 stories 7, 10; §4.3 gestures; §5 (pause vs swipe)

## What to build
- Extend `rulesClassifier` to all poses: `none | point | pinch | open_palm | fist`, with a `confidence`, based on finger-extension rules.
- Hold timers in `gestures`:
  - `fist` held for 1 s → `clear`
  - `open_palm` held **still** for 1 s (palm-centre movement under a threshold) → `pause`
  - each fires once per hold, and the hold must be released before it can fire again
- `input` maps these to `clear` and `pause` actions. Keyboard: `C` → clear, `Space` → pause.
- Draw: `clear` clears the canvas; `pause` lifts the pen.
- A small progress ring on the cursor while a hold is building up, as visual feedback.

## Acceptance criteria
- [x] Unit tests for each pose rule on representative frames taken from the fixtures.
- [x] Fixture tests: `fist-hold` gives exactly 1 `clear`; `open-palm-hold` gives exactly 1 `pause`; `fidget-10s` gives neither; the swipe fixtures don't trigger `pause`.
- [ ] Manual check: holding a fist clears the drawing, with the hold ring visible first.

## Notes (done)
- `rulesClassifier` (finger extension = wrist→tip / wrist→middle joint): `fist` = all four fingers curled (< 1.0);
  `pinch` / `point` as before (index out); `open_palm` = all four clearly out (> 1.1) **and the thumb spread**
  (thumb tip to index knuckle > 0.5 palm sizes). Confidence is 0.5 on a threshold, rising to 1 a margin of 0.2 past it.
- Why the thumb rule: `swipe-left` / `swipe-right` hold a still open hand for 1.2–1.7 s before swiping, so "open hand
  still for 1 s" alone would pause there. Their hand is flat with the thumb tucked (≈0.40–0.45); the `open-palm-hold`
  hand is a spread "stop" hand (≈0.55). A flat hand with fingers together is `none`. The margin is thin and comes from
  one person's recordings: revisit in 016, and record `open_palm` as a spread hand in the dataset (018).
- Gestures: `holdMs` 1000, `stillRadius` 0.15 palm sizes (open palm only; moving restarts the timer),
  `holdGraceMs` 200: other poses for less than that neither break nor release a hold. Needed because in `fist-hold`
  the index pokes out of the fist and reads as `pinch` for up to ≈75 ms at a time.
- No pinch press while a fist hold is active (that flicker otherwise clicked in `fist-hold`).
- `GestureOutput.hold` = `{ gesture: 'clear' | 'pause', progress }` or null; the cursor shows it as a filling ring
  (red for clear, green for pause) in place of the pinch ring.
- Keyboard: Space → pause (not when a button or field has focus, so Space still presses it). Draw: pause lifts the pen.
- Sweep over stillRadius 0.08–0.3 and grace 100–300 ms: fixtures give exactly 1 clear / 1 pause and nothing on
  fidget or the swipes everywhere except stillRadius 0.3 + grace 300 (demo-showcase then pauses).
