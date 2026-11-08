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
- [x] TDD unit tests for the reducer: sequencing, hit/miss counting, timing, and the final summary.
- [x] Playwright: a mouse-only run completes and shows a 100% success rate.

## Notes (done)
- `src/modes/benchmark.ts`: pure `benchmarkReduce(state, action)` (`start` / `click`), `benchmarkTargets()` (mulberry32,
  fixed seed 2026: the same 20 positions every run, kept off the edges and the top bar, each ≥ 4 radii from the last)
  and `benchmarkSummary(state, { classifier, recordedAt })`. The mode is a thin DOM layer on top.
- Every click is an attempt. On the target (radius 0.05 stage widths, hit-tested as a circle using the stage's aspect)
  it's a hit and the next target appears; anywhere else it's a miss and the target stays. Time to target runs from
  when the target appeared, so misses don't reset it.
- Results JSON: `{ benchmark: "targets-v1", targets, hits, misses, successRate, medianMs, classifier, input, recordedAt }`.
  `classifier` is `"rules"` with a tracker and `null` on the mouse stage (020 will set it from the debug toggle);
  `input` is the click sources used, e.g. `"gesture"` or `"mouse"`. Copy JSON uses the clipboard, falling back to
  selecting the read-only text box.
- Start is deferred a tick: a mouse click on it reaches the input module after the button's handler and would
  otherwise count as the first miss.
- Hidden like the recorder: only `?mode=benchmark`, not on the menu.

