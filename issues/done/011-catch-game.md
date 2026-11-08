# 011: Catch game

type: AFK
blocked_by: 009
prd: §4.5 Catch, user story 9

## What to build
- Objects fall from the top. The catcher is a hitbox at the palm position (hand cursor or palm centre).
- 30 s timer, score, difficulty increasing over time (spawn rate and speed), Start and Play-again buttons.
- The `pause` action (palm held still, or the Space key) pauses and resumes the timer and the objects.
- High score in localStorage, wrapped in try/catch so it still works if storage fails.
- Mouse fallback: the mouse position moves the catcher.
- Pure `catchStep(state, dt, catcherPos)` using a seeded RNG, so it can be tested.

## Acceptance criteria
- [x] TDD unit tests for `catchStep`: spawning, falling, catching, missing, the timer ending at 30 s, pause freezing everything, difficulty ramp.
- [x] Playwright: a mouse-only game starts, runs, ends, and shows the score.
- [x] Manual check: playable by hand at a steady frame rate. (Passed with a live camera.)

## Notes (done)
- `src/modes/catch.ts`: pure `catchStep(state, dt, catcher, config)` with a mulberry32 RNG in the state, plus
  `newGame(seed)`, `togglePause`, `difficulty(elapsed)` and `readBest` / `saveBest` (try/catch, junk-proof).
  The mode is a thin canvas + DOM layer on top.
- The catcher follows the hand cursor (index fingertip, smoothed), i.e. the same `pointer-move` actions the
  mouse sends, so the mouse fallback needed no special code. A 2D hitbox (radius 0.08 stage widths), swept
  along each object's fall so nothing can slip through between frames.
- Difficulty ramps linearly over the 30 s: a spawn every 1000 → 380 ms, falling 0.3 → 0.75 screen heights/s.
  A long frame (tab hidden) advances at most 100 ms.
- `pause` (still open palm, or Space) toggles playing / paused. Clicking Start blurs the button, or Space
  would press the hidden button and restart instead of pausing.
- Playwright drives the 30 s game with `page.clock` (fake time), so the test takes under a second.
- **Watch in the manual check:** a player waiting still under a dot with an open hand for 1 s will pause the
  game. If it happens in practice, raise the hold time in Catch or require a spread hand more strictly (016).

