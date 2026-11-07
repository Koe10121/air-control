# 007: Pinch-click on real buttons

type: AFK
blocked_by: 005, 006
prd: §4.2 classifier, §4.3 gestures, §4.4 input, §5 false-click defences

## What to build
- `classifier` module: the `Classifier` type and `Pose` union. `rulesClassifier` detects `pinch` (other poses come in 009; return `none` or `point` for now) using the thumb–index distance divided by palm size (wrist to middle-finger knuckle).
- In `gestures`:
  - pinch hysteresis: closes below ~0.25, opens above ~0.40 (configurable)
  - 2–3 confirmation frames
  - **cursor lock** at the position from about 100 ms before the pinch started
  - ~300 ms click cooldown
  - events: `press`, `release`, `click`
- `input` module:
  - `push(gestureOutput)`, plus native mouse and keyboard listeners
  - `onAction(cb)` with `Action = pointer-move | press | release | click | …` and `source`
  - a virtual pointer that hit-tests the element under the hand cursor and dispatches hover, focus and click to it, so normal `<button>`s work
- Visual feedback: a hover highlight on the button under the cursor, and a ring around the cursor that closes as the pinch closes.
- A temporary test button with a click counter on the stage.

## Acceptance criteria
- [x] TDD unit tests for the hysteresis thresholds, confirmation, cursor lock and cooldown.
- [x] Fixture tests: `pinch-twice` gives exactly 2 clicks; `fidget-10s` gives **0** clicks; `hand-leaves-mid-pinch` gives a `release` and no stuck press.
- [x] `input` tests (jsdom): gesture clicks and mouse clicks produce the same `Action`s; the virtual pointer clicks the button under the cursor.
- [ ] Manual check: you can pinch-click the counter button reliably, and the mouse still works.

## Notes (done)
- Pinch = thumb–index ratio below the close threshold AND the index finger extended (wrist→tip / wrist→PIP > 1.0). Without the index check, `fidget-10s` gave 3 false clicks (curled, bunched hand).
- `fist-hold` still gives 1 click with the rules here; issue 009's fist pose must suppress it.
- The cursor stays locked for the whole press. Air-draw (008) needs it to follow while held: unlock past a drag distance there.
- Manual check (pinch-click the counter, mouse still works) is still to do by hand.
