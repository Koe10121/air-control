// classifier: one hand's landmarks → a pose label (PRD §4.2).
// Only `rulesClassifier` exists so far; the MLP arrives with issue 020.
import type { Handedness, Landmark } from '../tracker/tracker';

export type Pose = 'none' | 'point' | 'pinch' | 'open_palm' | 'fist';
export type Classifier = (landmarks: Landmark[], handedness: Handedness) => { label: Pose; confidence: number };

// MediaPipe hand landmark indices.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
/** [tip, middle joint] for index, middle, ring and pinky. */
const FINGERS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
] as const;

/** Thumb–index tips closer than this (in palm sizes) count as a pinch shape. */
export const PINCH_RATIO = 0.25;
/**
 * Finger extension = wrist→tip / wrist→middle joint. Above CURLED_BELOW the finger is out.
 * A real pinch keeps the index out (≈1.1–1.2); a curled, bunched hand (fidget-10s) or a fist folds
 * it (≈0.6–0.9).
 */
const CURLED_BELOW = 1.0;
/** For an open palm every finger must be clearly out (recorded open hands sit at ≈1.3). */
const OPEN_ABOVE = 1.1;
/**
 * Thumb tip to index knuckle, in palm sizes, above which the thumb is spread out. An open palm is a
 * spread "stop" hand (≈0.55); the flat swipe hand keeps the fingers and thumb together (≈0.40–0.45),
 * so holding still before a swipe doesn't pause.
 */
const THUMB_OUT = 0.5;
/** A feature this far (in ratio units) past its threshold gives full confidence. */
const CONFIDENT_MARGIN = 0.2;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Palm size: wrist to middle-finger knuckle. */
export const palmSize = (l: Landmark[]) => dist(l[WRIST]!, l[MIDDLE_MCP]!);

/** Thumb-tip to index-tip distance in palm sizes. Infinity for a degenerate hand. */
export function pinchRatio(landmarks: Landmark[]): number {
  const palm = palmSize(landmarks);
  return palm > 0 ? dist(landmarks[THUMB_TIP]!, landmarks[INDEX_TIP]!) / palm : Infinity;
}

/** Extension of index, middle, ring and pinky (see CURLED_BELOW). */
function extensions(l: Landmark[]): number[] {
  return FINGERS.map(([tip, pip]) => {
    const p = dist(l[WRIST]!, l[pip]!);
    return p > 0 ? dist(l[WRIST]!, l[tip]!) / p : 0;
  });
}

/** 0.5 when the deciding features sit on their thresholds, 1 when they are all clear of them. */
const confidence = (...margins: number[]) =>
  0.5 + 0.5 * Math.min(1, Math.max(0, Math.min(...margins) / CONFIDENT_MARGIN));

/**
 * Finger-extension rules. Distances only, so left and right hands need no mirroring.
 * Checked in order: fist, pinch, open palm, point; anything else is none.
 */
export const rulesClassifier: Classifier = (landmarks) => {
  const palm = palmSize(landmarks);
  if (palm === 0) return { label: 'none', confidence: 1 };
  const ext = extensions(landmarks);
  const index = ext[0]!;

  if (index <= CURLED_BELOW) {
    const mostOut = Math.max(...ext);
    return mostOut < CURLED_BELOW
      ? { label: 'fist', confidence: confidence(CURLED_BELOW - mostOut) }
      : { label: 'none', confidence: confidence(CURLED_BELOW - index) };
  }

  const pinch = pinchRatio(landmarks);
  const indexMargin = index - CURLED_BELOW;
  if (pinch < PINCH_RATIO) return { label: 'pinch', confidence: confidence(indexMargin, PINCH_RATIO - pinch) };

  const leastOut = Math.min(...ext);
  if (leastOut > OPEN_ABOVE) {
    const thumb = dist(landmarks[THUMB_TIP]!, landmarks[INDEX_MCP]!) / palm;
    return thumb > THUMB_OUT
      ? { label: 'open_palm', confidence: confidence(leastOut - OPEN_ABOVE, thumb - THUMB_OUT) }
      : { label: 'none', confidence: confidence(THUMB_OUT - thumb) };
  }
  return { label: 'point', confidence: confidence(indexMargin, pinch - PINCH_RATIO, OPEN_ABOVE - leastOut) };
};
