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
- [ ] Unit tests for each pose rule on representative frames taken from the fixtures.
- [ ] Fixture tests: `fist-hold` gives exactly 1 `clear`; `open-palm-hold` gives exactly 1 `pause`; `fidget-10s` gives neither; the swipe fixtures don't trigger `pause`.
- [ ] Manual check: holding a fist clears the drawing, with the hold ring visible first.
