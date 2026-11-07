import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFixture } from '../tracker/fixture';
import type { HandFrame } from '../tracker/tracker';
import { createGestureEngine, DEFAULT_GESTURE_CONFIG, INDEX_TIP, type GestureConfig } from './gestures';

/** A hand whose index fingertip is at (x, y) in the unmirrored camera image. */
const tipAt = (x: number, y: number, timestamp: number): HandFrame => ({
  landmarks: Array.from({ length: 21 }, (_, i) => (i === INDEX_TIP ? { x, y, z: 0 } : { x: 0.5, y: 0.5, z: 0 })),
  handedness: 'Right',
  timestamp,
});

// No smoothing to speak of: isolates mapping from filtering.
const raw: GestureConfig = { ...DEFAULT_GESTURE_CONFIG, minCutoff: 1e9 };

describe('createGestureEngine: cursor mapping', () => {
  it('maps the centre of the frame to the centre of the screen', () => {
    const out = createGestureEngine(raw).update(tipAt(0.5, 0.5, 0));
    expect(out.cursor!.x).toBeCloseTo(0.5);
    expect(out.cursor!.y).toBeCloseTo(0.5);
  });

  it('mirrors x: a fingertip on the camera image left is on the screen right', () => {
    const engine = createGestureEngine(raw);
    const out = engine.update(tipAt(0.3, 0.5, 0));
    expect(out.cursor!.x).toBeGreaterThan(0.5);
  });

  it('maps the inner 70% of the frame to the full screen', () => {
    // Inner region spans 0.15..0.85. Camera x = 0.85 is mirrored to 0.15 → screen left edge.
    expect(createGestureEngine(raw).update(tipAt(0.85, 0.15, 0)).cursor).toEqual({ x: 0, y: 0 });
    const c = createGestureEngine(raw).update(tipAt(0.15, 0.85, 0)).cursor!;
    expect(c.x).toBeCloseTo(1);
    expect(c.y).toBeCloseTo(1);
    const q = createGestureEngine(raw).update(tipAt(0.675, 0.325, 0)).cursor!;
    expect(q.x).toBeCloseTo(0.25);
    expect(q.y).toBeCloseTo(0.25);
  });

  it('clamps points outside the inner region to the screen edges', () => {
    expect(createGestureEngine(raw).update(tipAt(1, 0, 0)).cursor).toEqual({ x: 0, y: 0 });
    expect(createGestureEngine(raw).update(tipAt(0, 1, 0)).cursor).toEqual({ x: 1, y: 1 });
  });

  it('respects a configured active region', () => {
    const full = createGestureEngine({ ...raw, activeRegion: 1 });
    const c = full.update(tipAt(0.1, 0.9, 0)).cursor!;
    expect(c.x).toBeCloseTo(0.9);
    expect(c.y).toBeCloseTo(0.9);
  });
});

describe('createGestureEngine: smoothing and hand loss', () => {
  it('smooths a jump in fingertip position (cursor lags the raw target)', () => {
    const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG);
    engine.update(tipAt(0.5, 0.5, 0));
    const c = engine.update(tipAt(0.3, 0.5, 33)).cursor!;
    // Raw target would be x ≈ 0.786; the filter keeps it between start and target.
    expect(c.x).toBeGreaterThan(0.5);
    expect(c.x).toBeLessThan(0.78);
  });

  it('a null frame gives a null cursor, no pose and no events', () => {
    const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG);
    engine.update(tipAt(0.5, 0.5, 0));
    expect(engine.update(null)).toEqual({ cursor: null, pose: 'none', events: [] });
  });

  it('resets on hand loss: the first frame after a null is not smoothed toward the old position', () => {
    const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG);
    engine.update(tipAt(0.5, 0.5, 0));
    engine.update(tipAt(0.5, 0.5, 33));
    engine.update(null);
    const c = engine.update(tipAt(0.85, 0.15, 66)).cursor!;
    expect(c).toEqual({ x: 0, y: 0 });
  });

  it('is driven only by frame timestamps: identical input gives identical output', () => {
    const run = () => {
      const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG);
      return [0, 33, 66, 99].map((t, i) => engine.update(tipAt(0.3 + i * 0.1, 0.4, t)).cursor);
    };
    expect(run()).toEqual(run());
  });

  it('reports the classifier pose when one is given', () => {
    const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG, () => ({ label: 'point', confidence: 0.9 }));
    expect(engine.update(tipAt(0.5, 0.5, 0)).pose).toBe('point');
    expect(createGestureEngine(DEFAULT_GESTURE_CONFIG).update(tipAt(0.5, 0.5, 0)).pose).toBe('none');
  });
});

describe('createGestureEngine: fixtures', () => {
  it('replaying synthetic-wave gives a cursor inside [0,1] for every frame, with no NaN', () => {
    const wave = parseFixture(JSON.parse(readFileSync('public/fixtures/synthetic-wave.json', 'utf8')));
    const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG);
    for (const frame of wave.frames) {
      const { cursor } = engine.update(frame);
      expect(cursor).not.toBeNull();
      for (const v of [cursor!.x, cursor!.y]) {
        expect(Number.isNaN(v)).toBe(false);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
