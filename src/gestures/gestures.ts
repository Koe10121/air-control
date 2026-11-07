// gestures: HandFrame stream → cursor, pose and events (PRD §4.3).
// Pure and driven only by frame timestamps: no wall clock, no DOM.
import type { HandFrame, Handedness, Landmark } from '../tracker/tracker';
import { createOneEuroFilter, type OneEuroParams } from './one-euro';

/** MediaPipe landmark index of the index fingertip. */
export const INDEX_TIP = 8;

// The classifier module (issue 007) will own these; defined here until it exists.
export type Pose = 'none' | 'point' | 'pinch' | 'open_palm' | 'fist';
export type Classifier = (landmarks: Landmark[], handedness: Handedness) => { label: Pose; confidence: number };

export type GestureEvent = 'press' | 'release' | 'click' | 'swipe-left' | 'swipe-right' | 'pause' | 'clear';

export interface GestureOutput {
  /** Normalised screen position (0..1, mirrored like the video), or null when no hand is visible. */
  cursor: { x: number; y: number } | null;
  pose: Pose;
  events: GestureEvent[];
}

export interface GestureConfig extends OneEuroParams {
  /** Fraction of the camera frame (centred) that maps to the full screen. Smaller = less arm travel. */
  activeRegion: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  activeRegion: 0.7,
  // Units are screen widths per second; tuned by hand, revisited in issue 016.
  minCutoff: 1.5,
  beta: 2,
  dCutoff: 1,
};

export interface GestureEngine {
  /** Feed one tracker frame (null = no hand). Call once per frame, in timestamp order. */
  update(frame: HandFrame | null): GestureOutput;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createGestureEngine(config: GestureConfig, classifier?: Classifier): GestureEngine {
  const margin = (1 - config.activeRegion) / 2;
  /** Maps a camera coordinate inside the active region to 0..1 screen space, clamped. */
  const toScreen = (v: number) => clamp01((v - margin) / config.activeRegion);
  const fx = createOneEuroFilter(config);
  const fy = createOneEuroFilter(config);

  return {
    update(frame) {
      if (!frame) {
        fx.reset();
        fy.reset();
        return { cursor: null, pose: 'none', events: [] };
      }
      const tip = frame.landmarks[INDEX_TIP]!;
      // Mirror x so moving the hand right moves the cursor right, like a mirror.
      const x = toScreen(1 - tip.x);
      const y = toScreen(tip.y);
      // Filtering after clamping keeps the cursor in [0,1]: each output is a blend of in-range values.
      const cursor = { x: fx.filter(x, frame.timestamp), y: fy.filter(y, frame.timestamp) };
      const pose = classifier ? classifier(frame.landmarks, frame.handedness).label : 'none';
      return { cursor, pose, events: [] };
    },
  };
}
