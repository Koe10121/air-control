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
- [x] TDD unit tests for the swipe detector (speed and distance thresholds, cooldown, direction).
- [x] Fixture tests: `swipe-left` gives exactly 1 `next`; `swipe-right` gives exactly 1 `prev`; `fidget-10s` gives 0 swipes.
- [x] Playwright: arrow keys move through every slide and stop at the ends.
- [ ] Manual check: swiping in the air changes slides.

## Notes (done)
- **Thresholds differ from the brief, on purpose.** The recorded swipes move the palm centre only 0.20 / 0.18
  frame widths in 250 ms (0.28 / 0.27 in 400 ms), so "25% in 250 ms" missed `swipe-right`. Non-swipes peak at
  0.16 (`fidget-10s`) and 0.19 (`hand-leaves-mid-pinch`) however long the window. Shipped: **0.22 frame widths
  within 400 ms**, |dy| ≤ 0.5·|dx|, 600 ms cooldown. Revisit in 016 with more people's swipes.
- Detector (`gestures`): a trail of raw palm centres (wrist + 4 knuckles) over the window; fires when the
  current frame is far enough from any trail point, then clears the trail and cools down. Raw x grows to the
  user's left (mirrored video), so +dx = `swipe-left` (→ `prev`, see below). No swipes while a pinch is pressed (that's a
  drag). The trail is dropped on hand loss and across a frame gap longer than `lossGraceMs`.
- `GestureConfig.swipes` (default false) + `engine.setSwipes(on)`; `main.ts` turns it on only while Slides is
  the open mode, so the draw-fast recordings (which contain sideways moves of 0.28) can't page anything elsewhere.
- Slides: pure `slidesReduce` in `src/modes/slides.ts`; copy in `src/modes/slides-content.ts` (8 slides, the
  last with GitHub / live site / portfolio links, opening in a new tab). Prev/Next buttons (disabled at the
  ends), `n / 8` counter, Menu button. Arrow keys were already mapped to next/prev in `input`.
- **Direction flipped from the brief, on purpose:** the brief said hand to the user's left = next (phone
  "push the page" style). Tried by the owner, it felt backwards: nothing on screen slides, and the → key and
  the Next button both say right = forward. So `input` maps `swipe-right` → `next`, `swipe-left` → `prev`
  ("point the way you want to go"). The gesture events still name the hand's direction (mirror-corrected).
- **Fixture player fix:** looping jumped the hand from its last position back to its first with no gap, which
  read as a swipe (`swipe-right` playback paged a second time on every loop). The player now emits a null frame (hand gone) at
  the end of each pass, as the camera would.
- Live, a null frame mid-swipe (tracking dropout) resets the trail. The recorded swipes have no dropouts
  (frames every ≈8.5 ms), but if live swipes get missed, let the trail ride out short losses like a press does.
- Manual check still to do: swipe in the air on `?mode=slides`.

