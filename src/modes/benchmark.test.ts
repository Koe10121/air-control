import { describe, expect, it } from 'vitest';
import {
  benchmarkReduce,
  benchmarkSummary,
  benchmarkTargets,
  DEFAULT_BENCHMARK_CONFIG,
  INITIAL_BENCHMARK_STATE,
  type BenchmarkAction,
  type BenchmarkState,
} from './benchmark';

const ASPECT = 3 / 4;
const N = DEFAULT_BENCHMARK_CONFIG.targetCount;
const R = DEFAULT_BENCHMARK_CONFIG.targetRadius;

const start = (t = 0): BenchmarkAction => ({ type: 'start', t });
const clickAt = (x: number, y: number, t: number, source: 'mouse' | 'gesture' = 'mouse'): BenchmarkAction => ({
  type: 'click',
  x,
  y,
  t,
  aspect: ASPECT,
  source,
});
/** A click right on the current target. */
const hit = (s: BenchmarkState, t: number, source: 'mouse' | 'gesture' = 'mouse') => {
  const target = s.targets[s.index]!;
  return benchmarkReduce(s, clickAt(target.x, target.y, t, source));
};
/** A click on the far side of the screen from the current target. */
const miss = (s: BenchmarkState, t: number) => {
  const target = s.targets[s.index]!;
  return benchmarkReduce(s, clickAt(1 - target.x > 0.5 ? 0.98 : 0.02, target.y, t));
};

describe('benchmarkTargets', () => {
  it('is the same sequence every run, with every target fully on screen', () => {
    const a = benchmarkTargets();
    expect(a).toEqual(benchmarkTargets());
    expect(a).toHaveLength(N);
    for (const t of a) {
      expect(t.x - R).toBeGreaterThanOrEqual(0);
      expect(t.x + R).toBeLessThanOrEqual(1);
      expect(t.y).toBeGreaterThan(0.1);
      expect(t.y).toBeLessThan(0.9);
    }
    expect(new Set(a.map((t) => `${t.x},${t.y}`)).size).toBe(N);
  });

  it('never puts two targets in a row on top of each other', () => {
    const a = benchmarkTargets();
    for (let i = 1; i < a.length; i++) {
      expect(Math.hypot(a[i]!.x - a[i - 1]!.x, a[i]!.y - a[i - 1]!.y)).toBeGreaterThan(4 * R);
    }
  });
});

describe('benchmarkReduce', () => {
  it('starts ready, and ignores clicks until started', () => {
    const s = INITIAL_BENCHMARK_STATE;
    expect(s.phase).toBe('ready');
    expect(benchmarkReduce(s, clickAt(0.5, 0.5, 10))).toBe(s);
  });

  it('start shows the first target and starts its clock', () => {
    const s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(1000));
    expect(s.phase).toBe('running');
    expect(s.index).toBe(0);
    expect(s.shownAt).toBe(1000);
    expect(s.attempts).toEqual([]);
  });

  it('a click on the target is a hit: it records the time and shows the next target', () => {
    let s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(1000));
    s = hit(s, 1800);
    expect(s.index).toBe(1);
    expect(s.shownAt).toBe(1800);
    expect(s.attempts).toEqual([{ target: 0, hit: true, ms: 800, source: 'mouse' }]);
  });

  it('a click outside the target is a miss and keeps the same target up', () => {
    let s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(0));
    s = miss(s, 300);
    expect(s.index).toBe(0);
    expect(s.shownAt).toBe(0);
    expect(s.attempts).toEqual([{ target: 0, hit: false, ms: 300, source: 'mouse' }]);
    s = hit(s, 700);
    expect(s.attempts[1]).toEqual({ target: 0, hit: true, ms: 700, source: 'mouse' });
  });

  it('hit-tests a round target on a non-square stage (aspect = height / width)', () => {
    const s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(0));
    const t = s.targets[0]!;
    // Just inside horizontally, in stage widths.
    expect(benchmarkReduce(s, clickAt(t.x + R * 0.95, t.y, 1)).index).toBe(1);
    expect(benchmarkReduce(s, clickAt(t.x + R * 1.05, t.y, 1)).index).toBe(0);
    // Vertically, R stage widths is R / aspect stage heights.
    expect(benchmarkReduce(s, clickAt(t.x, t.y + (R * 0.95) / ASPECT, 1)).index).toBe(1);
    expect(benchmarkReduce(s, clickAt(t.x, t.y + (R * 1.05) / ASPECT, 1)).index).toBe(0);
  });

  it('ends after the last target is hit, and then ignores clicks', () => {
    let s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(0));
    for (let i = 0; i < N; i++) s = hit(s, (i + 1) * 500);
    expect(s.phase).toBe('done');
    expect(s.attempts.filter((a) => a.hit)).toHaveLength(N);
    expect(benchmarkReduce(s, clickAt(0.5, 0.5, 99_999))).toBe(s);
  });

  it('start again begins a fresh run on the same targets', () => {
    let s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(0));
    s = miss(hit(s, 100), 200);
    s = benchmarkReduce(s, start(5000));
    expect(s).toMatchObject({ phase: 'running', index: 0, shownAt: 5000, attempts: [] });
    expect(s.targets).toEqual(benchmarkTargets());
  });
});

describe('benchmarkSummary', () => {
  it('counts hits and misses, the success rate and the median time to each target', () => {
    let s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(0));
    let t = 0;
    for (let i = 0; i < N; i++) {
      if (i < 4) s = miss(s, (t += 100)); // 4 misses on the first 4 targets
      // Times to target: 1000, 1100, ..., 2900 ms (the misses don't reset the clock).
      t = s.shownAt + 1000 + i * 100;
      s = hit(s, t, i % 2 ? 'gesture' : 'mouse');
    }
    const result = benchmarkSummary(s, { classifier: 'rules', recordedAt: '2026-11-08T12:00:00.000Z' });
    expect(result).toEqual({
      benchmark: 'targets-v1',
      targets: N,
      hits: N,
      misses: 4,
      successRate: 0.833,
      medianMs: 1950,
      classifier: 'rules',
      input: 'gesture+mouse',
      recordedAt: '2026-11-08T12:00:00.000Z',
    });
  });

  it('a clean mouse run is 100% with input "mouse"', () => {
    let s = benchmarkReduce(INITIAL_BENCHMARK_STATE, start(0));
    for (let i = 0; i < N; i++) s = hit(s, (i + 1) * 300);
    const result = benchmarkSummary(s, { classifier: null, recordedAt: 'x' });
    expect(result).toMatchObject({ hits: N, misses: 0, successRate: 1, medianMs: 300, classifier: null, input: 'mouse' });
  });

  it('works on an empty run without dividing by zero', () => {
    const result = benchmarkSummary(INITIAL_BENCHMARK_STATE, { classifier: 'rules', recordedAt: 'x' });
    expect(result).toMatchObject({ hits: 0, misses: 0, successRate: 0, medianMs: null, input: 'none' });
  });
});
