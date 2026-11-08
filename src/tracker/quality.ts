// Adaptive quality (PRD §4.1): when tracking can't keep up, trade resolution, then detection rate,
// for a usable frame rate. Pure: the tracker feeds it frame times and applies the level it returns.
import { createFpsCounter } from '../debug/stats';

/**
 * - `full`: 640×480, detect every frame.
 * - `low-res`: 480×360, detect every frame.
 * - `skip-frames`: 480×360, detect every other frame (the cursor keeps the last result).
 */
export type QualityLevel = 'full' | 'low-res' | 'skip-frames';

const LEVELS: readonly QualityLevel[] = ['full', 'low-res', 'skip-frames'];

export interface QualityOptions {
  /** Under this tracking FPS counts as too slow. */
  lowFps: number;
  /** How long it must stay too slow before stepping down. */
  degradeAfterMs: number;
  /** At or over this FPS counts as healthy. Kept well above `lowFps` (hysteresis). */
  recoverFps: number;
  /** How long it must stay healthy before the first step back up; doubles after every relapse. */
  recoverAfterMs: number;
  /** Width of the sliding FPS window; nothing is judged until a full window has been seen. */
  windowMs: number;
}

export const DEFAULT_QUALITY_OPTIONS: QualityOptions = {
  lowFps: 20,
  degradeAfterMs: 2000,
  recoverFps: 27,
  recoverAfterMs: 5000,
  windowMs: 1000,
};

export interface QualityGovernor {
  /** Call once per handled video frame (`now` in ms). Returns the level to use from now on. */
  frame(now: number): QualityLevel;
  /** Forgets the frame-rate history (e.g. after the tab was hidden). The level is kept. */
  reset(): void;
  readonly level: QualityLevel;
}

export function createQualityGovernor(options: Partial<QualityOptions> = {}): QualityGovernor {
  const opts = { ...DEFAULT_QUALITY_OPTIONS, ...options };
  let index = 0;
  let fps = createFpsCounter(opts.windowMs);
  let windowStart: number | null = null;
  let lowSince: number | null = null;
  let highSince: number | null = null;
  let recoverAfterMs = opts.recoverAfterMs;
  let hasRecovered = false;

  const reset = () => {
    fps = createFpsCounter(opts.windowMs);
    windowStart = null;
    lowSince = null;
    highSince = null;
  };

  const step = (delta: 1 | -1) => {
    index += delta;
    if (delta === 1 && hasRecovered) recoverAfterMs *= 2;
    if (delta === -1) hasRecovered = true;
    // Measurements from before the change describe the old setting.
    reset();
  };

  return {
    get level() {
      return LEVELS[index]!;
    },

    reset,

    frame(now) {
      fps.tick(now);
      windowStart ??= now;
      if (now - windowStart < opts.windowMs) return LEVELS[index]!;

      const value = fps.value();
      lowSince = value < opts.lowFps ? (lowSince ?? now) : null;
      highSince = value >= opts.recoverFps ? (highSince ?? now) : null;

      if (lowSince !== null && now - lowSince >= opts.degradeAfterMs && index < LEVELS.length - 1) step(1);
      else if (highSince !== null && now - highSince >= recoverAfterMs && index > 0) step(-1);
      return LEVELS[index]!;
    },
  };
}
