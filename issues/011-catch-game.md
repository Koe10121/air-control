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
- [ ] TDD unit tests for `catchStep`: spawning, falling, catching, missing, the timer ending at 30 s, pause freezing everything, difficulty ramp.
- [ ] Playwright: a mouse-only game starts, runs, ends, and shows the score.
- [ ] Manual check: playable by hand at a steady frame rate.
