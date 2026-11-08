import { describe, expect, it } from 'vitest';
import { HAND_CONNECTIONS, toCanvasPoint } from './overlay';

describe('toCanvasPoint', () => {
  it('scales normalised coordinates to canvas pixels', () => {
    expect(toCanvasPoint({ x: 0.25, y: 0.5, z: 0 }, 640, 480, false)).toEqual({ x: 160, y: 240 });
  });

  it('flips x when mirrored so the overlay matches the mirrored video', () => {
    expect(toCanvasPoint({ x: 0.25, y: 0.5, z: 0 }, 640, 480, true)).toEqual({ x: 480, y: 240 });
    expect(toCanvasPoint({ x: 0, y: 0, z: 0 }, 640, 480, true)).toEqual({ x: 640, y: 0 });
  });
});

describe('HAND_CONNECTIONS', () => {
  it('has 21 bones linking valid landmark indices and touching every landmark', () => {
    expect(HAND_CONNECTIONS).toHaveLength(21);
    const touched = new Set(HAND_CONNECTIONS.flat());
    expect(touched.size).toBe(21);
    for (const i of touched) expect(i >= 0 && i <= 20).toBe(true);
  });
});
