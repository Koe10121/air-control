# 016: Rules-only demo QA and tuning (milestone)

type: HITL
blocked_by: 010, 011, 013, 014, 015
prd: §1 (feel like magic), §5 (demo comes first)

## What to do (human, with an agent's help for fixes)
- Try every mode on your laptop in Chrome and Edge, in at least two lighting conditions. If possible, ask one other person to try it cold from the live URL and time how long it takes them to get going.
- Tune the thresholds (pinch, hold, swipe, One Euro) using the debug panel. Record a new fixture for any bug you find, then fix it with a failing test first.
- Check the fallbacks: camera denied, no camera, mouse-only, keyboard-only.

## Acceptance criteria
- [ ] 30+ FPS on your laptop (shown in the debug panel).
- [ ] No false clicks in a 1-minute free-movement test.
- [ ] A new person is using it within about 10 s of clicking Try it.
- [ ] Every mode can be completed by mouse or keyboard alone.
- [ ] **Shippable portfolio demo is live.**
