// One Euro filter (Casiez et al. 2012): an adaptive low-pass filter that is steady when the
// signal is still and responsive when it moves fast. Pure; time comes from the caller.

export interface OneEuroParams {
  /** Cutoff (Hz) at zero speed. Lower = steadier when still, but more lag. */
  minCutoff: number;
  /** How fast the cutoff rises with speed. Higher = less lag on fast moves. */
  beta: number;
  /** Cutoff (Hz) for the derivative estimate. */
  dCutoff: number;
}

export interface OneEuroFilter {
  /** Filters one sample taken at `timestampMs`. Non-advancing timestamps return the last output. */
  filter(value: number, timestampMs: number): number;
  reset(): void;
}

/** Smoothing factor for an exponential filter with the given cutoff (Hz) and step (s). */
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export function createOneEuroFilter({ minCutoff, beta, dCutoff }: OneEuroParams): OneEuroFilter {
  let last: { value: number; derivative: number; t: number } | null = null;
  return {
    filter(value, timestampMs) {
      if (!last) {
        last = { value, derivative: 0, t: timestampMs };
        return value;
      }
      const dt = (timestampMs - last.t) / 1000;
      if (dt <= 0) return last.value;
      const rawDerivative = (value - last.value) / dt;
      const derivative = last.derivative + alpha(dCutoff, dt) * (rawDerivative - last.derivative);
      const cutoff = minCutoff + beta * Math.abs(derivative);
      const filtered = last.value + alpha(cutoff, dt) * (value - last.value);
      last = { value: filtered, derivative, t: timestampMs };
      return filtered;
    },
    reset() {
      last = null;
    },
  };
}
