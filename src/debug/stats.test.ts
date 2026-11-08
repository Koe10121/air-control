import { describe, expect, it } from 'vitest';
import { createDebugStats, createFpsCounter, percentile } from './stats';

describe('createFpsCounter', () => {
  it('reports 0 before two frames have been seen', () => {
    const fps = createFpsCounter();
    expect(fps.value()).toBe(0);
    fps.tick(0);
    expect(fps.value()).toBe(0);
  });

  it('measures a steady 30 fps stream', () => {
    const fps = createFpsCounter();
    for (let i = 0; i <= 60; i++) fps.tick(i * (1000 / 30));
    expect(fps.value()).toBeCloseTo(30, 5);
  });

  it('only looks at the last second, so it follows a slowdown', () => {
    const fps = createFpsCounter();
    let t = 0;
    for (let i = 0; i < 60; i++) fps.tick((t += 1000 / 60));
    for (let i = 0; i < 20; i++) fps.tick((t += 100));
    expect(fps.value()).toBeCloseTo(10, 5);
  });
});

describe('percentile', () => {
  it('is 0 for no values', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('uses the nearest-rank method on unsorted input', () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 100)).toBe(10);
  });

  it('returns the only value of a single-element list', () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
  });

  it('does not reorder the caller’s array', () => {
    const values = [3, 1, 2];
    percentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });
});

const sample = (detectMs: number, gestureMs = 0, timestamp = 0) => ({
  detectMs,
  gestureMs,
  pose: 'point' as const,
  confidence: 1,
  timestamp,
});

describe('createDebugStats', () => {
  it('starts empty', () => {
    const s = createDebugStats().snapshot();
    expect(s.trackingFps).toBe(0);
    expect(s.renderFps).toBe(0);
    expect(s.detect).toEqual({ p50: 0, p95: 0 });
    expect(s.gesture).toEqual({ p50: 0, p95: 0 });
    expect(s.pose).toBe('none');
    expect(s.confidence).toBe(0);
  });

  it('reports p50/p95 of detect and gesture times', () => {
    const stats = createDebugStats();
    for (let i = 1; i <= 100; i++) stats.record(sample(i, i / 10, i * 33));
    const s = stats.snapshot();
    expect(s.detect).toEqual({ p50: 50, p95: 95 });
    expect(s.gesture).toEqual({ p50: 5, p95: 9.5 });
  });

  it('only keeps the last `window` samples', () => {
    const stats = createDebugStats({ window: 10 });
    for (let i = 0; i < 10; i++) stats.record(sample(1000, 0, i));
    for (let i = 0; i < 10; i++) stats.record(sample(2, 0, 10 + i));
    expect(stats.snapshot().detect).toEqual({ p50: 2, p95: 2 });
  });

  it('shows the latest pose and confidence', () => {
    const stats = createDebugStats();
    stats.record({ ...sample(1), pose: 'pinch', confidence: 0.8 });
    stats.record({ ...sample(1), pose: 'fist', confidence: 0.6 });
    const s = stats.snapshot();
    expect(s.pose).toBe('fist');
    expect(s.confidence).toBe(0.6);
  });

  it('derives tracking FPS from recorded frames and render FPS from render ticks', () => {
    const stats = createDebugStats();
    for (let i = 0; i <= 30; i++) stats.record(sample(1, 0, i * (1000 / 30)));
    for (let i = 0; i <= 60; i++) stats.renderTick(i * (1000 / 60));
    const s = stats.snapshot();
    expect(s.trackingFps).toBeCloseTo(30, 5);
    expect(s.renderFps).toBeCloseTo(60, 5);
  });
});
