# 024: README, demo GIF, architecture diagram and dataset release

type: HITL
blocked_by: 016, 023
prd: §7 Done means, user stories 24–25

## What to build or do
Agent:
- The README structure: demo GIF slot at the top, a "Try it" link, a Mermaid architecture diagram (tracker → gestures/classifier → input → modes; debug/recorder; the training loop), the generated results table, a privacy and CSP section, how to run, how to train, and a "what I learned" heading.
- `training/data/DATASHEET.md` (who, how, sessions, lighting tags, class counts, known limits, n = 2) and a license file for the data (CC BY 4.0).
- A code license for the repository (MIT unless you choose otherwise).

Human:
- Record the demo GIF (under about 8 MB, showing pinch-click, drawing, a swipe and catching).
- Write the "what I learned" section.

## Acceptance criteria
- [ ] The README renders on GitHub with the GIF, the diagram, the table and every section above.
- [ ] The dataset, datasheet and licenses are committed. Every participant ID is anonymised.
