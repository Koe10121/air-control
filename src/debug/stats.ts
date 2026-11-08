// debug stats core (PRD §4.7): rolling per-frame timings, p50/p95 and FPS. Pure, no DOM.
import type { Pose } from '../classifier/classifier';

/** Frames per second over a sliding window (default 1 s) of frame timestamps (ms). */
export function createFpsCounter(windowMs = 1000) {
  const times: number[] = [];
  return {
    tick(timestamp: number) {
      times.push(timestamp);
      while (times.length > 0 && times[0]! < timestamp - windowMs) times.shift();
    },
    value(): number {
      if (times.length < 2) return 0;
      const span = times[times.length - 1]! - times[0]!;
      return span > 0 ? ((times.length - 1) * 1000) / span : 0;
    },
  };
}

/** Nearest-rank percentile (`p` in 0..100) of `values`; 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1]!;
}

export interface FrameSample {
  /** Time spent in the hand landmarker for this frame. */
  detectMs: number;
  /** Time spent in the gesture engine for this frame. */
  gestureMs: number;
  pose: Pose;
  confidence: number;
  /** Frame timestamp (ms, performance.now() clock): drives the tracking FPS. */
  timestamp: number;
}

export interface Latency {
  p50: number;
  p95: number;
}

export interface DebugSnapshot {
  trackingFps: number;
  renderFps: number;
  detect: Latency;
  gesture: Latency;
  pose: Pose;
  confidence: number;
}

export interface DebugStats {
  /** Call once per tracker frame. */
  record(sample: FrameSample): void;
  /** Call once per rendered (animation) frame. */
  renderTick(timestamp: number): void;
  snapshot(): DebugSnapshot;
}

/** Rolling statistics over the last `window` frames (default 120, about 4 s at 30 fps). */
export function createDebugStats({ window = 120 }: { window?: number } = {}): DebugStats {
  const detect: number[] = [];
  const gesture: number[] = [];
  const trackingFps = createFpsCounter();
  const renderFps = createFpsCounter();
  let pose: Pose = 'none';
  let confidence = 0;

  const push = (list: number[], v: number) => {
    list.push(v);
    if (list.length > window) list.shift();
  };
  const latency = (list: number[]): Latency => ({ p50: percentile(list, 50), p95: percentile(list, 95) });

  return {
    record(s) {
      push(detect, s.detectMs);
      push(gesture, s.gestureMs);
      trackingFps.tick(s.timestamp);
      pose = s.pose;
      confidence = s.confidence;
    },
    renderTick(timestamp) {
      renderFps.tick(timestamp);
    },
    snapshot() {
      return {
        trackingFps: trackingFps.value(),
        renderFps: renderFps.value(),
        detect: latency(detect),
        gesture: latency(gesture),
        pose,
        confidence,
      };
    },
  };
}
