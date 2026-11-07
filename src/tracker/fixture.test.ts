import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandFrame } from './tracker';
import { createTracker } from './tracker';
import { createFrameRecorder, fixtureNameFromUrl, parseFixture, type Fixture } from './fixture';

const hand = (timestamp: number, x = 0.5): HandFrame => ({
  landmarks: Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 })),
  handedness: 'Right',
  timestamp,
});

// Recorded at an arbitrary clock offset (1000 ms), 100 ms apart.
const fixture: Fixture = {
  name: 'three-frames',
  fps: 10,
  frames: [hand(1000, 0.1), hand(1100, 0.2), hand(1200, 0.3)],
};

describe('createTracker({ fixture })', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the first frame immediately after start', async () => {
    const tracker = createTracker({ fixture });
    const seen: Array<HandFrame | null> = [];
    tracker.onFrame((f) => seen.push(f));
    await tracker.start();
    expect(seen.map((f) => f?.landmarks[0]?.x)).toEqual([0.1]);
    tracker.stop();
  });

  it('replays frames with their recorded spacing', async () => {
    const tracker = createTracker({ fixture });
    const seen: number[] = [];
    tracker.onFrame((f) => seen.push(f!.landmarks[0]!.x));
    await tracker.start();
    vi.advanceTimersByTime(99);
    expect(seen).toEqual([0.1]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([0.1, 0.2]);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([0.1, 0.2, 0.3]);
    tracker.stop();
  });

  it('re-bases timestamps onto the live clock, strictly increasing and spaced as recorded', async () => {
    const tracker = createTracker({ fixture });
    const stamps: number[] = [];
    tracker.onFrame((f) => stamps.push(f!.timestamp));
    const startedAt = performance.now();
    await tracker.start();
    vi.advanceTimersByTime(200);
    expect(stamps[0]).toBeGreaterThanOrEqual(startedAt);
    expect(stamps[1]! - stamps[0]!).toBe(100);
    expect(stamps[2]! - stamps[1]!).toBe(100);
    tracker.stop();
  });

  it('loops: after the last frame it waits one frame interval (1000 / fps) and starts again', async () => {
    const tracker = createTracker({ fixture });
    const seen: number[] = [];
    const stamps: number[] = [];
    tracker.onFrame((f) => {
      seen.push(f!.landmarks[0]!.x);
      stamps.push(f!.timestamp);
    });
    await tracker.start();
    vi.advanceTimersByTime(200); // last frame of the first pass
    vi.advanceTimersByTime(99);
    expect(seen).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([0.1, 0.2, 0.3, 0.1]);
    expect(stamps[3]! - stamps[2]!).toBe(100);
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([0.1, 0.2, 0.3, 0.1, 0.2, 0.3]);
    tracker.stop();
  });

  it('stop() halts playback and reports stopped', async () => {
    const tracker = createTracker({ fixture });
    const seen: unknown[] = [];
    const states: string[] = [];
    tracker.onFrame((f) => seen.push(f));
    tracker.onStatus((s) => states.push(s.state));
    await tracker.start();
    tracker.stop();
    vi.advanceTimersByTime(5000);
    expect(seen).toHaveLength(1);
    expect(states).toEqual(['running', 'stopped']);
  });

  it('has no video and never touches the camera', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const tracker = createTracker({ fixture });
    await tracker.start();
    expect(tracker.video).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    tracker.stop();
    vi.unstubAllGlobals();
  });
});

describe('parseFixture', () => {
  it('accepts a well-formed fixture', () => {
    expect(parseFixture(JSON.parse(JSON.stringify(fixture)))).toEqual(fixture);
  });

  it.each([
    ['not an object', 42],
    ['no frames', { name: 'x', fps: 30 }],
    ['empty frames', { name: 'x', fps: 30, frames: [] }],
    ['bad fps', { ...fixture, fps: 0 }],
    ['a frame without 21 landmarks', { ...fixture, frames: [{ ...hand(0), landmarks: [] }] }],
    ['a non-numeric coordinate', { ...fixture, frames: [{ ...hand(0), landmarks: hand(0).landmarks.map(() => ({ x: 'a', y: 0, z: 0 })) }] }],
    ['bad handedness', { ...fixture, frames: [{ ...hand(0), handedness: 'Both' }] }],
    ['decreasing timestamps', { ...fixture, frames: [hand(10), hand(5)] }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseFixture(input)).toThrow(/fixture/i);
  });
});

describe('createFrameRecorder', () => {
  it('keeps only hand frames from the last N seconds and turns them into a valid fixture', () => {
    const recorder = createFrameRecorder(1);
    for (let t = 0; t <= 2000; t += 100) recorder.push(hand(t));
    recorder.push(null);
    const out = recorder.toFixture('capture');
    expect(out.name).toBe('capture');
    expect(out.frames[0]!.timestamp).toBe(1000);
    expect(out.frames.at(-1)!.timestamp).toBe(2000);
    expect(out.fps).toBe(10);
    expect(parseFixture(out)).toEqual(out);
  });

  it('throws when nothing has been captured yet', () => {
    expect(() => createFrameRecorder(5).toFixture('empty')).toThrow(/no hand frames/i);
  });
});

describe('fixtureNameFromUrl', () => {
  it.each([
    ['', null],
    ['?source=camera', null],
    ['?source=fixture:synthetic-wave', 'synthetic-wave'],
    ['?mode=draw&source=fixture:pinch_twice2', 'pinch_twice2'],
    ['?source=fixture:../secrets', null],
    ['?source=fixture:', null],
    ['?source=fixture:a/b', null],
  ])('%j -> %j', (search, expected) => {
    expect(fixtureNameFromUrl(search)).toBe(expected);
  });
});

describe('bundled fixtures', () => {
  it('synthetic-wave is a valid, moving, in-frame fixture', () => {
    const raw = JSON.parse(readFileSync('public/fixtures/synthetic-wave.json', 'utf8'));
    const wave = parseFixture(raw);
    expect(wave.name).toBe('synthetic-wave');
    const coords = wave.frames.flatMap((f) => f.landmarks.flatMap((p) => [p.x, p.y]));
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coords)).toBeLessThanOrEqual(1);
    const tipX = wave.frames.map((f) => f.landmarks[12]!.x);
    expect(Math.max(...tipX) - Math.min(...tipX)).toBeGreaterThan(0.1);
  });
});
