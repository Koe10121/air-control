# 023: Run benchmarks and pick winners

type: HITL
blocked_by: 021, 022
prd: §5 (the demo comes first; ship the per-gesture winner)

## What to do (human)
- Run `?mode=benchmark` with rules and then with the model (at least 3 runs each, and with the second person if possible), and paste the results into the metrics file.
- Review `npm run eval` and the proposed `classifier-config.json`. Approve it, or override a pose and write down why.
- Re-run `npm run eval` so the README table includes the benchmark numbers.

## Acceptance criteria
- [ ] Benchmark results for both classifiers are in `metrics.json`.
- [ ] `classifier-config.json` is approved and deployed, and the README table is final.
