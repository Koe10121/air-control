# 008: Mode menu, deep links and Air Draw

type: AFK
blocked_by: 007
prd: §4.5 modes, §4.6 app, user stories 7, 15, 16

## What to build
- The `Mode` interface `{ mount(el), unmount(), handle(action), tick(dt) }` and a small mode router.
- A mode menu (big buttons that work by pinch-click and mouse) listing Draw, Slides and Catch. Slides and Catch show "coming soon" until they exist. This replaces the temporary counter button from 007.
- `?mode=draw|slides|catch` deep links, plus a Back-to-menu button in every mode.
- **Air Draw:**
  - press → pen down, release → pen up; lines follow the cursor
  - 5-colour palette and a Clear button, both chosen by pinch-click
  - mouse drag draws; keyboard shortcuts `1`–`5` pick a colour and `C` clears
  - logic in a pure `drawReduce(state, action)`; the canvas rendering stays thin

## Acceptance criteria
- [ ] TDD unit tests for `drawReduce` (strokes, colour change, clear) and for the router's mount/unmount.
- [ ] Playwright: the mouse alone can open Draw, draw a stroke, change colour, clear, and go back.
- [ ] `?mode=draw` opens Draw directly.
- [ ] Manual check: drawing in the air with pinch-hold works.
