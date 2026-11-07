import { describe, expect, it } from 'vitest';
import { HAND_CONNECTIONS, createFpsCounter, toCanvasPoint } from './overlay';

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
