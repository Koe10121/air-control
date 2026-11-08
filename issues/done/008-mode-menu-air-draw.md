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
- [x] TDD unit tests for `drawReduce` (strokes, colour change, clear) and for the router's mount/unmount.
- [x] Playwright: the mouse alone can open Draw, draw a stroke, change colour, clear, and go back.
- [x] `?mode=draw` opens Draw directly.
- [x] Manual check: drawing in the air with pinch-hold works.

## Notes (done)
- `src/modes/modes.ts`: `Mode`, `createModeRouter`, `modeFromUrl`, the menu and a "coming soon" placeholder (Slides, Catch).
- `src/modes/draw.ts`: pure `drawReduce` + thin canvas mode. A press on a toolbar button doesn't start a stroke.
- Input now maps keys `1`–`9` → `{ type: 'select', index }` and `C` → `clear` (ignored with Ctrl/Meta/Alt).
- `?mode=` is applied after the visitor starts (camera, mouse or demo); the camera is still never requested on load.
  The address bar's `?mode=` follows the open mode.
- Manual check passed with a live camera (after the pinch-drag fix).
- Fix after first manual try: the hand only drew dots because the cursor stayed locked for the whole pinch.
  Gestures now have a `dragThreshold` (0.08 screen): past it the cursor follows the hand and release gives no click.
