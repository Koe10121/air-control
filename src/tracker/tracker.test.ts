import { describe, expect, it } from 'vitest';
import { toHandFrame } from './tracker';

const landmarks = Array.from({ length: 21 }, (_, i) => ({ x: i / 20, y: 0.5, z: -i / 100, visibility: 0 }));

describe('toHandFrame', () => {
  it('returns null when no hand is detected', () => {
    expect(toHandFrame({ landmarks: [], handedness: [] }, 1234)).toBeNull();
  });

  it('converts the first hand into a HandFrame with x/y/z only', () => {
    const frame = toHandFrame(
      { landmarks: [landmarks], handedness: [[{ categoryName: 'Right', score: 0.98 }]] },
      1234,
    );
    expect(frame).not.toBeNull();
    expect(frame?.timestamp).toBe(1234);
    expect(frame?.handedness).toBe('Right');
    expect(frame?.landmarks).toHaveLength(21);
    expect(frame?.landmarks[3]).toEqual({ x: 3 / 20, y: 0.5, z: -3 / 100 });
  });

  it('reads Left handedness', () => {
    const frame = toHandFrame(
      { landmarks: [landmarks], handedness: [[{ categoryName: 'Left', score: 0.9 }]] },
      0,
    );
    expect(frame?.handedness).toBe('Left');
  });

  it('returns null for a malformed hand that does not have 21 landmarks', () => {
    expect(
      toHandFrame(
        { landmarks: [landmarks.slice(0, 5)], handedness: [[{ categoryName: 'Right', score: 1 }]] },
        0,
      ),
    ).toBeNull();
  });
});
