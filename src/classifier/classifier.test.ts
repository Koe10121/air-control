import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFixture } from '../tracker/fixture';
import type { HandFrame } from '../tracker/tracker';
import { pinchRatio, rulesClassifier } from './classifier';

/** The fixture frame recorded closest to `seconds` after the start. */
function frameAt(fixture: string, seconds: number): HandFrame {
  const { frames } = parseFixture(JSON.parse(readFileSync(`public/fixtures/${fixture}.json`, 'utf8')));
  const t = frames[0]!.timestamp + seconds * 1000;
  return frames.reduce((best, f) => (Math.abs(f.timestamp - t) < Math.abs(best.timestamp - t) ? f : best));
}

const classify = (f: HandFrame) => rulesClassifier(f.landmarks, f.handedness).label;

describe('pinchRatio', () => {
  it('is the thumb–index tip distance divided by palm size, so it does not depend on hand scale', () => {
    const f = frameAt('pinch-twice', 3.3);
    const scaled = f.landmarks.map(({ x, y, z }) => ({ x: x * 2, y: y * 2, z: z * 2 }));
    expect(pinchRatio(f.landmarks)).toBeCloseTo(pinchRatio(scaled), 6);
    expect(pinchRatio(f.landmarks)).toBeLessThan(0.25);
    expect(pinchRatio(frameAt('pinch-twice', 1.0).landmarks)).toBeGreaterThan(0.6);
  });

  it('is Infinity for a degenerate hand with zero palm size', () => {
    const flat = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    expect(pinchRatio(flat)).toBe(Infinity);
  });
});

describe('rulesClassifier', () => {
  it('labels a real pinch (index extended, tips touching) as pinch', () => {
    expect(classify(frameAt('pinch-twice', 3.3))).toBe('pinch');
    expect(classify(frameAt('hand-leaves-mid-pinch', 2.2))).toBe('pinch');
  });

  it('labels a pointing hand as point', () => {
    expect(classify(frameAt('pinch-twice', 1.0))).toBe('point');
  });

  it('does not call a curled, bunched hand a pinch even when thumb and index tips are close', () => {
    // fidget-10s near-pinch: ratio ≈ 0.18, but the index finger is curled.
    const f = frameAt('fidget-10s', 5.04);
    expect(pinchRatio(f.landmarks)).toBeLessThan(0.25);
    expect(classify(f)).not.toBe('pinch');
  });

  it('gives none for a degenerate hand', () => {
    const flat = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    expect(rulesClassifier(flat, 'Right').label).toBe('none');
  });
});
