# 010: Slides with swipe

type: AFK
blocked_by: 008, 005
prd: §4.3 (swipe detector), §4.5 Slides, user story 8

## What to build
- A swipe detector in `gestures`, using rules on palm-centre velocity:
  - horizontal movement of more than 25% of frame width within about 250 ms
  - mostly horizontal
  - a 600 ms cooldown afterwards
  - direction corrected for the mirrored video (moving the hand to the user's left = `swipe-left` = next)
  - emits `swipe-left` / `swipe-right`, which `input` maps to `next` / `prev`
- Swipes are only active while Slides mode is mounted (a flag in the engine config).
- A Slides mode with about 8 slides about the project: the idea, the pipeline (camera → MediaPipe → gestures → actions), the gestures, false-click defences, data, results (placeholder), privacy design, and links. Draft the copy from the PRD and keep it in a single data file that's easy to edit.
- Arrow keys and on-screen prev/next buttons, plus a slide counter.
- Pure `slidesReduce(state, action)`.

## Acceptance criteria
- [ ] TDD unit tests for the swipe detector (speed and distance thresholds, cooldown, direction).
- [ ] Fixture tests: `swipe-left` gives exactly 1 `next`; `swipe-right` gives exactly 1 `prev`; `fidget-10s` gives 0 swipes.
- [ ] Playwright: arrow keys move through every slide and stop at the ends.
- [ ] Manual check: swiping in the air changes slides.
