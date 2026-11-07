# 021: Benchmark mode

type: AFK
blocked_by: 008
prd: §4.5 Benchmark, user story 22

## What to build
- A hidden `?mode=benchmark` page.
- 20 targets appear one at a time at seeded positions (the same sequence every run), and must be clicked.
- Records a hit or miss for each attempt (a click outside the target counts as a miss) and the time to each target.
- Results screen: hits, misses, success rate, median time, which classifier was active and the input source. A "Copy JSON" button gives a snippet to paste into the metrics file.
- Pure `benchmarkReduce(state, action)`.

## Acceptance criteria
- [ ] TDD unit tests for the reducer: sequencing, hit/miss counting, timing, and the final summary.
- [ ] Playwright: a mouse-only run completes and shows a 100% success rate.
