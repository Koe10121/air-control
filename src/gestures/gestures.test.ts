import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFixture } from '../tracker/fixture';
import type { HandFrame } from '../tracker/tracker';
import { createGestureEngine, DEFAULT_GESTURE_CONFIG, INDEX_TIP, type Cursor, type GestureConfig } from './gestures';

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

  it('passes the classifier pose and confidence through (for the debug panel)', () => {
    const engine = createGestureEngine(raw, () => ({ label: 'fist', confidence: 0.42 }));
    expect(engine.update(tipAt(0.5, 0.5, 0))).toMatchObject({ pose: 'fist', confidence: 0.42 });
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
    expect(engine.update(null)).toEqual({ cursor: null, pose: 'none', confidence: 0, events: [], pinch: 0, pressed: false });
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
  });

  it('uses the rules classifier by default', () => {
    // tipAt() is a degenerate hand (zero palm size), which the rules classifier calls none.
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

// ---- Pinch-click (issue 007) ----

const PALM = 0.2;
/**
 * A synthetic pointing hand: index tip at (x, y) in the unmirrored camera image, index extended,
 * thumb tip `ratio` palm sizes to the side of the index tip.
 */
const hand = (x: number, y: number, ratio: number, timestamp: number): HandFrame => {
  const l = Array.from({ length: 21 }, () => ({ x, y: y + PALM, z: 0 }));
  l[0] = { x, y: y + 2 * PALM, z: 0 }; // wrist
  l[9] = { x, y: y + PALM, z: 0 }; // middle knuckle: palm size = PALM
  l[6] = { x, y: y + PALM / 2, z: 0 }; // index middle joint
  l[INDEX_TIP] = { x, y, z: 0 };
  l[4] = { x: x + ratio * PALM, y, z: 0 }; // thumb tip
  return { landmarks: l, handedness: 'Right', timestamp };
};

const OPEN = 0.8;
const CLOSED = 0.1;
const DT = 33;

/** Feeds frames 33 ms apart and returns each output. */
function feeder(config: GestureConfig = raw, classifier?: Parameters<typeof createGestureEngine>[1]) {
  const engine = createGestureEngine(config, classifier);
  let t = 0;
  return {
    /** One frame of the hand at (x, y) with the given pinch ratio. */
    step(ratio: number, x = 0.5, y = 0.5) {
      const out = engine.update(hand(x, y, ratio, t));
      t += DT;
      return out;
    },
    lose() {
      t += DT;
      return engine.update(null);
    },
    wait(ms: number) {
      t += ms;
    },
  };
}

describe('createGestureEngine: pinch hysteresis and confirmation', () => {
  it('presses only after the pinch has been closed for the confirmation frames', () => {
    const f = feeder();
    f.step(OPEN);
    const events = [CLOSED, CLOSED, CLOSED].map((r) => f.step(r).events);
    expect(events).toEqual([[], [], ['press']]);
  });

  it('does not press while the ratio sits between the close and open thresholds', () => {
    const f = feeder();
    for (let i = 0; i < 10; i++) expect(f.step(0.3).events).toEqual([]);
  });

  it('a pinch that opens before confirmation never presses', () => {
    const f = feeder();
    const ratios = [CLOSED, CLOSED, OPEN, CLOSED, CLOSED, OPEN];
    expect(ratios.flatMap((r) => f.step(r).events)).toEqual([]);
  });

  it('once pressed, stays pressed above the close threshold and releases with a click above the open one', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    expect(f.step(0.35).events).toEqual([]);
    expect(f.step(0.35).pressed).toBe(true);
    const out = f.step(0.45);
    expect(out.events).toEqual(['release', 'click']);
    expect(out.pressed).toBe(false);
  });

  it('respects configured thresholds and confirmation frames', () => {
    // A classifier that always agrees, so only the configured thresholds matter.
    const f = feeder({ ...raw, pinchClose: 0.35, pinchOpen: 0.5, confirmFrames: 1 }, () => ({
      label: 'pinch',
      confidence: 1,
    }));
    expect(f.step(0.3).events).toEqual(['press']);
    expect(f.step(0.45).events).toEqual([]);
    expect(f.step(0.55).events).toEqual(['release', 'click']);
  });

  it('only presses when the classifier agrees the hand shape is a pinch', () => {
    const f = feeder(raw, () => ({ label: 'none', confidence: 1 }));
    for (let i = 0; i < 10; i++) expect(f.step(CLOSED).events).toEqual([]);
  });

  it('reports pinch progress for the cursor ring: 0 when open, 1 when pressed', () => {
    const f = feeder();
    expect(f.step(OPEN).pinch).toBeCloseTo(0);
    const half = f.step(0.5).pinch;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    [CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    expect(f.step(CLOSED)).toMatchObject({ pinch: 1, pressed: true });
  });
});

describe('createGestureEngine: cursor lock', () => {
  it('locks the cursor at its position from ~100 ms before the pinch started, until release', () => {
    const f = feeder();
    // The hand moves steadily while the pinch closes (the thumb pulls the index off target).
    const xs = [0.6, 0.58, 0.56, 0.54, 0.52, 0.5, 0.48, 0.46];
    const outs = xs.map((x, i) => f.step(i < 5 ? OPEN : CLOSED, x));
    // The pinch started on frame 5 (t = 165 ms). 100 ms earlier is t = 65, so the frame at t = 33 (x = 0.58).
    const before = createGestureEngine(raw).update(hand(0.58, 0.5, OPEN, 0)).cursor!;
    const expectAtBefore = (c: Cursor | null) => {
      expect(c!.x).toBeCloseTo(before.x, 6);
      expect(c!.y).toBeCloseTo(before.y, 6);
    };
    expect(outs[7]!.events).toEqual(['press']);
    expectAtBefore(outs[7]!.cursor);
    // Still locked while the hand drifts a little during the hold (under the drag threshold).
    expectAtBefore(f.step(CLOSED, 0.44).cursor);
    // The click is delivered at the locked position.
    const release = f.step(OPEN, 0.44);
    expect(release.events).toEqual(['release', 'click']);
    expectAtBefore(release.cursor);
    // Then the cursor follows the hand again.
    expect(f.step(OPEN, 0.3).cursor!.x).toBeGreaterThan(before.x + 0.1);
  });
});

describe('createGestureEngine: pinch-drag', () => {
  /** Screen x for an unmirrored camera x, with the raw (unfiltered) config. */
  const screenX = (x: number) => createGestureEngine(raw).update(hand(x, 0.5, OPEN, 0)).cursor!.x;

  it('moving past the drag threshold while pressed unlocks the cursor so it follows the hand', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r, 0.5));
    // 0.1 of the camera frame ≈ 0.14 of the screen: well past the threshold.
    const moved = f.step(CLOSED, 0.4);
    expect(moved.pressed).toBe(true);
    expect(moved.cursor!.x).toBeCloseTo(screenX(0.4), 6);
    // It keeps following, even back near the press point.
    expect(f.step(CLOSED, 0.3).cursor!.x).toBeCloseTo(screenX(0.3), 6);
    expect(f.step(CLOSED, 0.5).cursor!.x).toBeCloseTo(screenX(0.5), 6);
  });

  it('a drag ends with release only, no click, at the hand position', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r, 0.5));
    f.step(CLOSED, 0.35);
    const out = f.step(OPEN, 0.35);
    expect(out.events).toEqual(['release']);
    expect(out.cursor!.x).toBeCloseTo(screenX(0.35), 6);
  });

  it('respects a configured drag threshold', () => {
    const f = feeder({ ...raw, dragThreshold: 0.5 });
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r, 0.5));
    f.step(CLOSED, 0.4);
    expect(f.step(OPEN, 0.4).events).toEqual(['release', 'click']);
  });
});

describe('createGestureEngine: click cooldown', () => {
  it('ignores a new pinch within 300 ms of a click, and accepts one after', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED, OPEN].forEach((r) => f.step(r));
    // An immediate re-pinch: 3 frames, about 100 ms after the click.
    expect([CLOSED, CLOSED, CLOSED].flatMap((r) => f.step(r).events)).toEqual([]);
    f.step(OPEN);
    f.wait(300);
    expect([CLOSED, CLOSED, CLOSED].flatMap((r) => f.step(r).events)).toEqual(['press']);
  });
});

describe('createGestureEngine: hand lost mid-pinch', () => {
  it('releases without a click, and the next hand starts fresh', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    expect(f.lose()).toEqual({ cursor: null, pose: 'none', confidence: 0, events: ['release'], pinch: 0, pressed: false });
    expect(f.lose().events).toEqual([]);
    // Coming back already pinched must be confirmed again from scratch.
    expect([CLOSED, CLOSED].flatMap((r) => f.step(r).events)).toEqual([]);
  });

  it('cancels an unconfirmed pinch', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED].forEach((r) => f.step(r));
    f.lose();
    expect(f.step(CLOSED).events).toEqual([]);
  });
});

describe('createGestureEngine: pinch fixtures', () => {
  /** Replays a fixture, inserting a null frame wherever the hand was out of view, and one at the end. */
  function replay(name: string): string[] {
    const { frames } = parseFixture(JSON.parse(readFileSync(`public/fixtures/${name}.json`, 'utf8')));
    const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG);
    const events: string[] = [];
    let prev: HandFrame | null = null;
    for (const frame of frames) {
      if (prev && frame.timestamp - prev.timestamp > 200) events.push(...engine.update(null).events);
      events.push(...engine.update(frame).events);
      prev = frame;
    }
    events.push(...engine.update(null).events);
    return events;
  }

  it('pinch-twice gives exactly 2 clicks', () => {
    expect(replay('pinch-twice')).toEqual(['press', 'release', 'click', 'press', 'release', 'click']);
  });

  it('fidget-10s gives 0 clicks (and no presses at all)', () => {
    expect(replay('fidget-10s')).toEqual([]);
  });

  it('hand-leaves-mid-pinch gives a release and no stuck press', () => {
    expect(replay('hand-leaves-mid-pinch')).toEqual(['press', 'release']);
  });
});
