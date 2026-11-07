# 013: Onboarding overlay

type: AFK
blocked_by: 008
prd: §4.6 app, user story 6

## What to build
- A 3-step overlay shown on the first camera start:
  1. "Raise your hand", which ticks when a hand is detected.
  2. "Move the dot to the circle", which ticks when the cursor reaches the target.
  3. "Pinch the button", which ticks on a click and goes to the mode menu.
- A Skip button. Completion is remembered in localStorage (wrapped in try/catch).
- Not shown with `?mode=` deep links or in fixture or mouse mode, so that recruiters following a deep link land straight in the mode.
- The step logic is a pure reducer.

## Acceptance criteria
- [ ] TDD unit tests for the step reducer.
- [ ] Playwright: Skip works, and the overlay doesn't reappear after a reload.
- [ ] Manual check: a first-time user gets through it in under 10 s.
