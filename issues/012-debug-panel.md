# 012: Debug panel

type: AFK
blocked_by: 007
prd: §4.7 debug, user story 17

## What to build
- A collapsible panel, toggled with the `D` key and a small button.
- Shows: tracking FPS, render FPS, detect time and gesture time (p50/p95 over a rolling window), the current pose, confidence, and the tracker status (GPU/CPU delegate, input resolution).
- A pure rolling-statistics core: `record({ detectMs, gestureMs, pose, confidence })`, plus FPS counters.
- Leave a slot for the rules/model toggle (added in 020) and the performance-mode badge (added in 014).

## Acceptance criteria
- [ ] TDD unit tests for the rolling window, p50/p95 and the FPS calculation.
- [ ] Manual check: the panel shows live numbers, and the pose label changes as the hand changes.
- [ ] No DOM writes while the panel is collapsed.
