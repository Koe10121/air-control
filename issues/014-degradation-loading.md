# 014: Graceful degradation and loading

type: AFK
blocked_by: 012
prd: §4.1 (adaptive quality), §5 performance, user story 14

## What to build
- Adaptive quality in `tracker`: if tracking FPS stays under 20 for 2 s, drop to 480×360. If it's still under 20, detect only every other frame (the cursor keeps using the last frame). Report each change through `onStatus`.
- A visible "Performance mode" badge, both in the UI and in the debug panel.
- A loading state with progress while the WASM and model download and initialise.
- Start preloading the model when "Try it" is hovered or focused, so the click feels instant.

## Acceptance criteria
- [ ] TDD unit tests for the degradation state machine (thresholds, hysteresis, no flapping).
- [ ] Manual check: CPU throttling in DevTools (6×) triggers performance mode and the badge, and the app stays usable.
- [ ] Manual check: the loading progress is visible on a throttled network.
