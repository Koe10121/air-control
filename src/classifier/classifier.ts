// classifier: one hand's landmarks → a pose label (PRD §4.2).
// Only `rulesClassifier` exists so far; open_palm and fist arrive with issue 009, the MLP with 020.
import type { Handedness, Landmark } from '../tracker/tracker';

export type Pose = 'none' | 'point' | 'pinch' | 'open_palm' | 'fist';
export type Classifier = (landmarks: Landmark[], handedness: Handedness) => { label: Pose; confidence: number };

// MediaPipe hand landmark indices.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

/** Thumb–index tips closer than this (in palm sizes) count as a pinch shape. */
export const PINCH_RATIO = 0.25;
/**
 * The index finger counts as extended when its tip is further from the wrist than its middle joint.
 * A real pinch keeps the index out (≈1.1–1.2); a curled, bunched hand (fidget-10s) folds it (≈0.7–1.0).
 */
const INDEX_EXTENDED = 1.0;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Palm size: wrist to middle-finger knuckle. */
const palmSize = (l: Landmark[]) => dist(l[WRIST]!, l[MIDDLE_MCP]!);

/** Thumb-tip to index-tip distance in palm sizes. Infinity for a degenerate hand. */
export function pinchRatio(landmarks: Landmark[]): number {
  const palm = palmSize(landmarks);
  return palm > 0 ? dist(landmarks[THUMB_TIP]!, landmarks[INDEX_TIP]!) / palm : Infinity;
}

function indexExtended(l: Landmark[]): boolean {
  const pip = dist(l[WRIST]!, l[INDEX_PIP]!);
  return pip > 0 && dist(l[WRIST]!, l[INDEX_TIP]!) / pip > INDEX_EXTENDED;
}

export const rulesClassifier: Classifier = (landmarks) => {
  if (palmSize(landmarks) === 0 || !indexExtended(landmarks)) return { label: 'none', confidence: 1 };
  return { label: pinchRatio(landmarks) < PINCH_RATIO ? 'pinch' : 'point', confidence: 1 };
};
