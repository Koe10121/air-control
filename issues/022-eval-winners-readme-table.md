# 022: Eval script, per-gesture winners, README table

type: AFK
blocked_by: 020, 005
prd: §4.10 eval, §5 (per-gesture winner), user story 21

## What to build
- `npm run eval` (a Node script that reuses the app's TypeScript modules):
  - replays `fidget-10s` (plus any other no-intent fixtures) through `gestures` with each classifier and reports **false clicks per minute**
  - measures TypeScript inference latency p50/p95 for each classifier
  - merges the results into `metrics.json` alongside the Python metrics and any benchmark results pasted in
- A composite classifier: `classifier-config.json` maps each pose to `rules` or `model`. The eval script proposes winners from cross-person F1 (ties go to rules), and the app loads the config.
- README results table generation: a script rewrites the block between `<!-- results:start -->` and `<!-- results:end -->` in the README from `metrics.json`. The table includes the caption "n = 2 participants; cross-person results are indicative".

## Acceptance criteria
- [ ] Unit tests for the composite classifier and the README block rewriter.
- [ ] `npm run eval` runs end to end and updates the README table.
- [ ] The app runs with the composite classifier selected by `classifier-config.json`.
