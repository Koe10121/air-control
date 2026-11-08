import { describe, expect, it } from 'vitest';
import type { HandFrame } from '../tracker/tracker';
import { createSessionRecorder, type ClipMeta } from './recorder';

const meta: ClipMeta = { label: 'pinch', participant: 'p01', lighting: 'lamp', session: 's1' };

function frame(timestamp: number, handedness: HandFrame['handedness'] = 'Right'): HandFrame {
  return {
    handedness,
    timestamp,
    landmarks: Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.5, z: -0.01 * i })),
  };
}

/** Starts a clip, waits out the countdown, then feeds `seconds` of frames at `fps` with matching ticks. */
function recordClip(rec: ReturnType<typeof createSessionRecorder>, fps: number, seconds: number, m = meta, t0 = 1000) {
  rec.start(m);
  rec.tick(3000);
  const step = 1000 / fps;
  for (let i = 0; i * step < seconds * 1000; i++) {
    rec.push(frame(t0 + i * step));
    rec.tick(step);
  }
  if (rec.phase === 'recording') rec.tick(rec.remainingMs);
}

describe('createSessionRecorder', () => {
  it('counts down 3 s before recording; frames during the countdown are ignored', () => {
    const rec = createSessionRecorder();
    expect(rec.phase).toBe('idle');
    rec.start(meta);
    expect(rec.phase).toBe('countdown');
    expect(rec.remainingMs).toBe(3000);
    rec.push(frame(0));
    rec.tick(2999);
    expect(rec.phase).toBe('countdown');
    rec.tick(1);
    expect(rec.phase).toBe('recording');
    expect(rec.remainingMs).toBe(10_000);
    expect(rec.clipSamples).toBe(0);
  });

  it('captures about 100 samples from 10 s of 30 fps frames (subsampled to ~10 Hz), then stops', () => {
    const rec = createSessionRecorder();
    recordClip(rec, 30, 10);
    expect(rec.phase).toBe('idle');
    expect(rec.clips).toEqual([{ label: 'pinch', samples: expect.any(Number) }]);
    const n = rec.clips[0]!.samples;
    expect(n).toBeGreaterThanOrEqual(98);
    expect(n).toBeLessThanOrEqual(101);
    expect(rec.toDataset().samples).toHaveLength(n);
  });

  it('subsamples 60 fps to ~10 Hz too', () => {
    const rec = createSessionRecorder();
    recordClip(rec, 60, 2);
    expect(rec.clips[0]!.samples).toBeGreaterThanOrEqual(19);
    expect(rec.clips[0]!.samples).toBeLessThanOrEqual(21);
  });

  it('skips null (no hand) frames', () => {
    const rec = createSessionRecorder();
    rec.start(meta);
    rec.tick(3000);
    rec.push(null);
    rec.push(frame(1000));
    rec.tick(100);
    rec.push(null);
    rec.push(frame(1100));
    expect(rec.clipSamples).toBe(2);
  });

  it('samples on the clip clock, so frames whose timestamps run slow still give ~10 Hz', () => {
    const rec = createSessionRecorder();
    rec.start(meta);
    rec.tick(3000);
    // A fixture replaying at 60% speed: 10 s of clip time only covers 6 s of frame timestamps.
    for (let i = 0; i < 300; i++) {
      rec.push(frame(1000 + i * 20));
      rec.tick(1000 / 30);
    }
    rec.tick(rec.remainingMs);
    expect(rec.clips[0]!.samples).toBeGreaterThanOrEqual(98);
  });

  it('exports schema v1 with the clip metadata on every sample, across clips', () => {
    const rec = createSessionRecorder();
    recordClip(rec, 10, 0.3);
    recordClip(rec, 10, 0.2, { ...meta, label: 'none', lighting: 'dim' }, 5000);
    const data = rec.toDataset();
    expect(data.schemaVersion).toBe(1);
    expect(data.samples).toHaveLength(5);
    expect(data.samples[0]).toEqual({
      label: 'pinch',
      participant: 'p01',
      handedness: 'Right',
      lighting: 'lamp',
      session: 's1',
      timestamp: 1000,
      landmarks: frame(1000).landmarks,
    });
    expect(data.samples[4]).toMatchObject({ label: 'none', lighting: 'dim', timestamp: 5100 });
    expect(rec.clips.map((c) => c.label)).toEqual(['pinch', 'none']);
  });

  it('exports landmarks only: no image data or extra fields survive', () => {
    const rec = createSessionRecorder();
    rec.start(meta);
    rec.tick(3000);
    const f = frame(1000) as HandFrame & { image?: unknown };
    f.image = 'data:image/png;base64,AAAA';
    (f.landmarks[0] as unknown as Record<string, unknown>).visibility = 0.9;
    rec.push(f);
    rec.tick(10_000);
    const json = JSON.stringify(rec.toDataset());
    expect(json).not.toMatch(/image|base64|visibility/);
    const sample = rec.toDataset().samples[0]!;
    expect(Object.keys(sample).sort()).toEqual(['handedness', 'label', 'landmarks', 'lighting', 'participant', 'session', 'timestamp']);
    expect(sample.landmarks.every((p) => Object.keys(p).join() === 'x,y,z')).toBe(true);
  });

  it('copies landmarks, so later changes to the frame do not leak into the dataset', () => {
    const rec = createSessionRecorder();
    rec.start(meta);
    rec.tick(3000);
    const f = frame(1000);
    rec.push(f);
    rec.tick(10_000);
    f.landmarks[0]!.x = 99;
    expect(rec.toDataset().samples[0]!.landmarks[0]!.x).toBe(0);
  });

  it('cancel drops the clip in progress', () => {
    const rec = createSessionRecorder();
    rec.start(meta);
    rec.tick(3000);
    rec.push(frame(1000));
    rec.cancel();
    expect(rec.phase).toBe('idle');
    expect(rec.clips).toEqual([]);
    expect(rec.toDataset().samples).toEqual([]);
  });

  it('rejects bad metadata and a start while busy', () => {
    const rec = createSessionRecorder();
    expect(() => rec.start({ ...meta, participant: 'bob' })).toThrow(/participant/i);
    expect(() => rec.start({ ...meta, session: '' })).toThrow(/session/i);
    expect(() => rec.start({ ...meta, label: 'wave' as ClipMeta['label'] })).toThrow(/label/i);
    expect(() => rec.start({ ...meta, lighting: 'neon' as ClipMeta['lighting'] })).toThrow(/lighting/i);
    rec.start(meta);
    expect(() => rec.start(meta)).toThrow(/already/i);
  });
});
