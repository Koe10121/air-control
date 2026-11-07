import { describe, expect, it } from 'vitest';
import { createOneEuroFilter } from './one-euro';

const params = { minCutoff: 1, beta: 0.01, dCutoff: 1 };

describe('createOneEuroFilter', () => {
  it('passes the first sample through unchanged', () => {
    const f = createOneEuroFilter(params);
    expect(f.filter(0.42, 1000)).toBe(0.42);
  });

  it('gives steady output for steady input', () => {
    const f = createOneEuroFilter(params);
    const out: number[] = [];
    for (let i = 0; i < 60; i++) out.push(f.filter(0.3, i * 33));
    for (const v of out) expect(v).toBeCloseTo(0.3, 12);
  });

  it('smooths a step input: moves toward it without overshoot and converges', () => {
    const f = createOneEuroFilter(params);
    f.filter(0, 0);
    const out: number[] = [];
    for (let i = 1; i <= 90; i++) out.push(f.filter(1, i * 33));
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(1);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]!);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
    expect(out.at(-1)).toBeCloseTo(1, 3);
  });

  it('follows fast motion more closely when beta is higher', () => {
    const lazy = createOneEuroFilter({ ...params, beta: 0 });
    const eager = createOneEuroFilter({ ...params, beta: 5 });
    lazy.filter(0, 0);
    eager.filter(0, 0);
    let a = 0;
    let b = 0;
    for (let i = 1; i <= 5; i++) {
      a = lazy.filter(i * 0.1, i * 33);
      b = eager.filter(i * 0.1, i * 33);
    }
    expect(Math.abs(0.5 - b)).toBeLessThan(Math.abs(0.5 - a));
  });

  it('ignores samples whose timestamp does not advance (returns the last output)', () => {
    const f = createOneEuroFilter(params);
    f.filter(0, 100);
    const prev = f.filter(1, 133);
    expect(f.filter(5, 133)).toBe(prev);
    expect(f.filter(5, 120)).toBe(prev);
  });

  it('reset() forgets history so the next sample passes through', () => {
    const f = createOneEuroFilter(params);
    f.filter(0, 0);
    f.filter(1, 33);
    f.reset();
    expect(f.filter(0.7, 66)).toBe(0.7);
  });
});
