import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFixture } from '../tracker/fixture';
import type { HandFrame } from '../tracker/tracker';
import { createGestureEngine, DEFAULT_GESTURE_CONFIG, INDEX_TIP, type Cursor, type GestureConfig, type Pose } from './gestures';

/** A hand whose index fingertip is at (x, y) in the unmirrored camera image. */
const tipAt = (x: number, y: number, timestamp: number): HandFrame => ({
  landmarks: Array.from({ length: 21 }, (_, i) => (i === INDEX_TIP ? { x, y, z: 0 } : { x: 0.5, y: 0.5, z: 0 })),
  handedness: 'Right',
  timestamp,
});

// No smoothing to speak of: isolates mapping from filtering. Instant release, so pinch tests can open
// in one frame; the release grace has its own tests.
const raw: GestureConfig = { ...DEFAULT_GESTURE_CONFIG, minCutoff: 1e9, releaseMs: 0 };

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
    expect(engine.update(null)).toEqual({ cursor: null, pose: 'none', confidence: 0, events: [], pinch: 0, pressed: false, hold: null });
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
    /** A no-hand frame that knows the time, like the live tracker's. */
    loseAt() {
      const out = engine.update(null, t);
      t += DT;
      return out;
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
    expect(f.lose()).toEqual({ cursor: null, pose: 'none', confidence: 0, events: ['release'], pinch: 0, pressed: false, hold: null });
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

// ---- Hold gestures (issue 009) ----

describe('createGestureEngine: hold gestures', () => {
  /** A feeder whose classifier returns whatever pose the test sets. */
  function holder(config: GestureConfig = raw) {
    let pose: Pose = 'none';
    const f = feeder(config, () => ({ label: pose, confidence: 1 }));
    return {
      /** One frame of `p` with the palm at camera (x, y). */
      step(p: Pose, x = 0.5, y = 0.5) {
        pose = p;
        return f.step(p === 'pinch' ? CLOSED : OPEN, x, y);
      },
      /** Frames of `p` for about `ms`; returns all events. */
      hold(p: Pose, ms: number, x = 0.5, y = 0.5) {
        const events: string[] = [];
        for (let t = 0; t < ms; t += DT) events.push(...this.step(p, x, y).events);
        return events;
      },
      lose: () => f.lose(),
    };
  }

  it('a fist held for 1 s gives exactly one clear, however long it is held', () => {
    const h = holder();
    expect(h.hold('fist', 900)).toEqual([]);
    expect(h.hold('fist', 200)).toEqual(['clear']);
    expect(h.hold('fist', 3000)).toEqual([]);
  });

  it('fires on the first frame at least 1 s after the pose started', () => {
    const h = holder();
    // Frames every 33 ms from t = 0: t = 990 is under 1 s, t = 1023 is the first at or over it.
    const events = Array.from({ length: 32 }, () => h.step('fist').events);
    expect(events.findIndex((e) => e.includes('clear'))).toBe(31);
  });

  it('must be released before it can fire again', () => {
    const h = holder();
    expect(h.hold('fist', 1100)).toEqual(['clear']);
    h.hold('point', 300);
    expect(h.hold('fist', 1100)).toEqual(['clear']);
  });

  it('a fist released before 1 s gives nothing, and the next one starts from zero', () => {
    const h = holder();
    h.hold('fist', 700);
    h.hold('none', 300);
    expect(h.hold('fist', 700)).toEqual([]);
  });

  it('a fist does not need to be still', () => {
    const h = holder();
    const events: string[] = [];
    for (let i = 0; i < 40; i++) events.push(...h.step('fist', 0.3 + (i % 2) * 0.3).events);
    expect(events).toEqual(['clear']);
  });

  it('an open palm held still for 1 s gives exactly one pause', () => {
    const h = holder();
    expect(h.hold('open_palm', 1100)).toEqual(['pause']);
    expect(h.hold('open_palm', 2000)).toEqual([]);
    h.hold('none', 300);
    expect(h.hold('open_palm', 1100)).toEqual(['pause']);
  });

  it('a moving open palm never pauses', () => {
    const h = holder();
    const events: string[] = [];
    // Sweeps back and forth by half a palm (0.1 of the frame) every 300 ms.
    for (let i = 0; i < 100; i++) events.push(...h.step('open_palm', 0.4 + 0.1 * Math.abs(Math.sin(i / 3))).events);
    expect(events).toEqual([]);
  });

  it('moving the open palm restarts the hold; tiny jitter does not', () => {
    const h = holder();
    h.hold('open_palm', 800, 0.5);
    // A move of a whole palm size (0.2 of the frame) restarts the timer…
    expect(h.hold('open_palm', 800, 0.7)).toEqual([]);
    // …and jitter of a few percent of a palm size does not stop it firing.
    const events: string[] = [];
    for (let i = 0; i < 10; i++) events.push(...h.step('open_palm', 0.7 + (i % 2) * 0.005).events);
    expect(events).toEqual(['pause']);
  });

  it('respects a configured hold time and stillness radius', () => {
    const h = holder({ ...raw, holdMs: 500, stillRadius: 2 });
    const events: string[] = [];
    // Moves 1.5 palm sizes in total: inside a radius of 2.
    for (let i = 0; i < 20; i++) events.push(...h.step('open_palm', 0.5 + i * 0.015).events);
    expect(events).toEqual(['pause']);
    expect(h.hold('fist', 550)).toEqual(['clear']);
  });

  it('switching straight from one hold pose to the other starts the new hold from zero', () => {
    const h = holder();
    h.hold('fist', 800);
    expect(h.hold('open_palm', 800)).toEqual([]);
    expect(h.hold('open_palm', 300)).toEqual(['pause']);
  });

  it('a brief flicker to another pose (under the grace time) does not end or restart the hold', () => {
    const h = holder();
    h.hold('fist', 600);
    // fist-hold has flickers like this: the index pokes out of the fist for a few frames.
    h.hold('pinch', 100);
    expect(h.hold('fist', 400)).toEqual(['clear']);
    // Nor does a flicker count as releasing it.
    h.hold('point', 100);
    expect(h.hold('fist', 2000)).toEqual([]);
  });

  it('does not press while a fist is being held, even when the hand flickers to a pinch', () => {
    const h = holder();
    h.hold('fist', 300);
    const events: string[] = [];
    for (let i = 0; i < 5; i++) events.push(...h.step('pinch').events);
    // Pinch-shaped hand: thumb on index. A pinch only counts once the fist has really ended.
    expect(events).toEqual([]);
  });

    it('losing the hand cancels a hold', () => {
    const h = holder();
    h.hold('fist', 800);
    h.lose();
    expect(h.hold('fist', 800)).toEqual([]);
  });

  it('reports hold progress for the cursor ring, and none once it has fired', () => {
    const h = holder();
    expect(h.step('point').hold).toBeNull();
    h.hold('fist', 500);
    const mid = h.step('fist').hold!;
    expect(mid.gesture).toBe('clear');
    expect(mid.progress).toBeGreaterThan(0.45);
    expect(mid.progress).toBeLessThan(0.6);
    h.hold('fist', 600);
    expect(h.step('fist').hold).toBeNull();
    h.hold('none', 300);
    expect(h.step('open_palm').hold).toEqual({ gesture: 'pause', progress: 0 });
    expect(h.lose().hold).toBeNull();
  });
});

describe('createGestureEngine: hold fixtures', () => {
  /** Every event from replaying a fixture through the default engine (see replay above). */
  function replayAll(name: string): string[] {
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

  it('fist-hold gives exactly 1 clear, and no click', () => {
    expect(replayAll('fist-hold')).toEqual(['clear']);
  });

  it('open-palm-hold gives exactly 1 pause', () => {
    expect(replayAll('open-palm-hold')).toEqual(['pause']);
  });

  it('fidget-10s gives no clear and no pause', () => {
    const events = replayAll('fidget-10s');
    expect(events).not.toContain('clear');
    expect(events).not.toContain('pause');
  });

  it('the swipe fixtures do not pause (or clear)', () => {
    for (const name of ['swipe-left', 'swipe-right']) {
      const events = replayAll(name);
      expect(events).not.toContain('pause');
      expect(events).not.toContain('clear');
    }
  });

  it('pinch-twice still gives exactly its 2 clicks and no holds', () => {
    expect(replayAll('pinch-twice')).toEqual(['press', 'release', 'click', 'press', 'release', 'click']);
  });
});

// ---- Fast drawing: release grace and lost-hand grace ----

describe('createGestureEngine: release grace', () => {
  const graced: GestureConfig = { ...raw, releaseMs: 80 };

  it('a pinch that flickers open for under releaseMs stays pressed', () => {
    const f = feeder(graced);
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    // Open at t = 132 and 165 (33 ms), closed again: under 80 ms.
    expect([OPEN, OPEN, CLOSED, CLOSED].flatMap((r) => f.step(r).events)).toEqual([]);
    expect(f.step(CLOSED).pressed).toBe(true);
  });

  it('releases (and clicks) once the pinch has been open for releaseMs', () => {
    const f = feeder(graced);
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    // Open frames 0, 33, 66 ms: still pressed; 99 ms: released.
    expect([OPEN, OPEN, OPEN].flatMap((r) => f.step(r).events)).toEqual([]);
    expect(f.step(OPEN).events).toEqual(['release', 'click']);
  });

  it('a frame in the hysteresis band restarts the open count', () => {
    const f = feeder(graced);
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    expect([OPEN, OPEN, 0.3, OPEN, OPEN].flatMap((r) => f.step(r).events)).toEqual([]);
  });
});

describe('createGestureEngine: lost-hand grace', () => {
  it('a press survives the hand vanishing for under lossGraceMs, and the stroke carries on', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    // 5 no-hand frames: 165 ms.
    for (let i = 0; i < 5; i++) expect(f.loseAt()).toMatchObject({ cursor: null, events: [], pressed: true });
    const back = f.step(CLOSED, 0.3);
    expect(back.events).toEqual([]);
    expect(back.pressed).toBe(true);
    expect(f.step(OPEN, 0.3).events).toEqual(['release']); // moved past the drag threshold: a drag, no click
  });

  it('releases (no click) once the hand has been gone for longer than lossGraceMs', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    const events: string[] = [];
    for (let i = 0; i < 10; i++) events.push(...f.loseAt().events);
    expect(events).toEqual(['release']);
    expect(f.loseAt().pressed).toBe(false);
  });

  it('a hand that comes back after too long a gap starts fresh: release first, then a new confirmation', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    f.loseAt();
    f.wait(400);
    expect(f.step(CLOSED).events).toEqual(['release']);
    expect([CLOSED, CLOSED].flatMap((r) => f.step(r).events)).toEqual(['press']);
  });

  it('without a time, a no-hand frame releases at once (as before)', () => {
    const f = feeder();
    [OPEN, CLOSED, CLOSED, CLOSED].forEach((r) => f.step(r));
    expect(f.lose().events).toEqual(['release']);
  });

  it('a lost hand with nothing pressed resets as before', () => {
    const f = feeder();
    f.step(OPEN);
    expect(f.loseAt()).toEqual({ cursor: null, pose: 'none', confidence: 0, events: [], pinch: 0, pressed: false, hold: null });
  });
});

describe('createGestureEngine: draw-fast fixture', () => {
  /**
   * Replays like the live camera: a timed no-hand frame every 33 ms wherever the hand was out of view,
   * then no-hand frames for a second after the end. Returns each press→release as its cursor path.
   */
  function strokes(config = DEFAULT_GESTURE_CONFIG) {
    const { frames } = parseFixture(JSON.parse(readFileSync('public/fixtures/draw-fast.json', 'utf8')));
    const engine = createGestureEngine(config);
    const out: Cursor[][] = [];
    let current: Cursor[] | null = null;
    const feed = (o: ReturnType<typeof engine.update>) => {
      if (o.events.includes('press')) current = [];
      if (current && o.cursor) current.push(o.cursor);
      if (o.events.includes('release') && current) {
        out.push(current);
        current = null;
      }
    };
    let prev: HandFrame | null = null;
    for (const frame of frames) {
      if (prev) for (let t = prev.timestamp + 33; t < frame.timestamp - 16; t += 33) feed(engine.update(null, t));
      feed(engine.update(frame));
      prev = frame;
    }
    for (let t = prev!.timestamp + 33; t < prev!.timestamp + 1000; t += 33) feed(engine.update(null, t));
    return out;
  }
  const length = (s: Cursor[]) => s.slice(1).reduce((sum, c, i) => sum + Math.hypot(c.x - s[i]!.x, c.y - s[i]!.y), 0);

  it('draws fast strokes as a few long lines, not a trail of dots', () => {
    const before = strokes({ ...DEFAULT_GESTURE_CONFIG, releaseMs: 0, lossGraceMs: 0 });
    const after = strokes();
    // Without the graces, tracking dropouts and pinch flicker chop the drawing into many short pieces.
    expect(before.length).toBeGreaterThan(after.length * 2);
    // With them, nearly all the ink is in a few long strokes.
    const total = after.reduce((s, st) => s + length(st), 0);
    const inLong = after.filter((st) => length(st) > 0.3).reduce((s, st) => s + length(st), 0);
    expect(inLong / total).toBeGreaterThan(0.9);
  });
});

describe('createGestureEngine: pinching while moving fast', () => {
  it('a pinch made while the hand sweeps fast is a drag from the start: no lock, no jump, no click', () => {
    const f = feeder();
    // About 1.5 screen widths per second (0.033 camera units per 33 ms frame ≈ 0.047 screen).
    const x = (i: number) => 0.7 - i * 0.033;
    for (let i = 0; i < 6; i++) f.step(OPEN, x(i));
    const outs = [6, 7, 8].map((i) => f.step(CLOSED, x(i)));
    expect(outs[2]!.events).toEqual(['press']);
    const live = createGestureEngine(raw).update(hand(x(8), 0.5, OPEN, 0)).cursor!;
    expect(outs[2]!.cursor!.x).toBeCloseTo(live.x, 6);
    expect(f.step(CLOSED, x(9)).cursor!.x).toBeGreaterThan(outs[2]!.cursor!.x);
    expect(f.step(OPEN, x(10)).events).toEqual(['release']);
  });

  it('a slow pinch still locks and clicks (the hand drifts as the thumb closes)', () => {
    const f = feeder();
    const x = (i: number) => 0.5 - i * 0.004; // ≈0.17 screens per second
    for (let i = 0; i < 6; i++) f.step(OPEN, x(i));
    [6, 7, 8].forEach((i) => f.step(CLOSED, x(i)));
    expect(f.step(OPEN, x(9)).events).toEqual(['release', 'click']);
  });

  it('respects a configured drag speed', () => {
    const f = feeder({ ...raw, dragSpeed: 100 });
    const x = (i: number) => 0.7 - i * 0.033;
    for (let i = 0; i < 6; i++) f.step(OPEN, x(i));
    [6, 7, 8].forEach((i) => f.step(CLOSED, x(i)));
    // Too slow for this threshold: locked at the earlier position, behind the hand.
    const live = createGestureEngine(raw).update(hand(x(9), 0.5, OPEN, 0)).cursor!;
    expect(live.x - f.step(CLOSED, x(9)).cursor!.x).toBeGreaterThan(0.05);
  });
});

describe('createGestureEngine: draw-fast-2 fixture', () => {
  it('fast drawing gives no accidental clicks, no jumps inside a stroke except across tracking gaps, and the closing fist clears once', () => {
    const { frames } = parseFixture(JSON.parse(readFileSync('public/fixtures/draw-fast-2.json', 'utf8')));
    const engine = createGestureEngine(DEFAULT_GESTURE_CONFIG);
    const events: string[] = [];
    let jump = 0;
    let last: Cursor | null = null;
    let prev: HandFrame | null = null;
    for (const frame of frames) {
      let gap = false;
      if (prev) {
        for (let t = prev.timestamp + 33; t < frame.timestamp - 16; t += 33) {
          events.push(...engine.update(null, t).events);
          gap = true;
        }
      }
      const out = engine.update(frame);
      events.push(...out.events);
      if (out.pressed && out.cursor && last && !gap && !out.events.includes('press')) {
        jump = Math.max(jump, Math.hypot(out.cursor.x - last.x, out.cursor.y - last.y));
      }
      last = out.pressed ? out.cursor : null;
      prev = frame;
    }
    expect(events.filter((e) => e === 'click')).toEqual([]);
    expect(events.filter((e) => e === 'press').length).toBeGreaterThanOrEqual(6);
    // The take ends with a deliberate fist: exactly one clear, and it is the last event.
    expect(events.filter((e) => e === 'clear')).toHaveLength(1);
    expect(events.at(-1)).toBe('clear');
    // Before dragSpeed, strokes began with jumps of up to 0.26. What is left is the unlock of a slow-start
    // press once the hand passes dragThreshold (0.08), plus one frame of movement.
    expect(jump).toBeLessThan(0.12);
  });
});
