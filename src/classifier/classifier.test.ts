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

  it('labels a closed hand (all four fingers curled) as fist', () => {
    expect(classify(frameAt('fist-hold', 1.0))).toBe('fist');
    expect(classify(frameAt('fist-hold', 3.0))).toBe('fist');
  });

  it('calls a fist a fist even when the thumb tip rests near the index tip', () => {
    // fist-hold at 1.24 s: pinch-range thumb–index distance inside the fist. It must not be a pinch.
    const f = frameAt('fist-hold', 1.24);
    expect(pinchRatio(f.landmarks)).toBeLessThan(0.25);
    expect(classify(f)).toBe('fist');
  });

  it('labels a spread open hand (four fingers out, thumb out) as open_palm', () => {
    expect(classify(frameAt('open-palm-hold', 1.0))).toBe('open_palm');
    expect(classify(frameAt('open-palm-hold', 3.0))).toBe('open_palm');
  });

  it('does not call a flat hand with the fingers and thumb together an open palm (the swipe hand)', () => {
    expect(classify(frameAt('swipe-left', 1.0))).toBe('none');
    expect(classify(frameAt('swipe-right', 1.0))).toBe('none');
    expect(classify(frameAt('swipe-right', 3.5))).toBe('none');
  });

  it('keeps a pointing hand (only the index out) as point, not open_palm or fist', () => {
    for (const s of [1.0, 2.5, 4.3, 6.2]) expect(classify(frameAt('pinch-twice', s))).toBe('point');
  });

  it('works the same for a mirrored (left) hand', () => {
    for (const [fixture, s, pose] of [
      ['fist-hold', 2.0, 'fist'],
      ['open-palm-hold', 2.0, 'open_palm'],
      ['pinch-twice', 3.3, 'pinch'],
    ] as const) {
      const f = frameAt(fixture, s);
      const mirrored = f.landmarks.map(({ x, y, z }) => ({ x: 1 - x, y, z }));
      expect(rulesClassifier(mirrored, 'Left').label).toBe(pose);
    }
  });

  it('is more confident about a clear pose than a borderline one', () => {
    const conf = (fixture: string, s: number) => {
      const f = frameAt(fixture, s);
      return rulesClassifier(f.landmarks, f.handedness).confidence;
    };
    for (const [fixture, s] of [
      ['fist-hold', 2.0],
      ['open-palm-hold', 2.0],
      ['pinch-twice', 3.3],
      ['pinch-twice', 1.0],
    ] as const) {
      expect(conf(fixture, s)).toBeGreaterThan(0.5);
      expect(conf(fixture, s)).toBeLessThanOrEqual(1);
    }
    // A fist with the index half-uncurled (fist-hold 1.24 s) is less certain than a tight one.
    expect(conf('fist-hold', 1.24)).toBeLessThan(conf('fist-hold', 2.0));
  });
});
