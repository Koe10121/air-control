// gestures: HandFrame stream → cursor, pose and events (PRD §4.3).
// Pure and driven only by frame timestamps: no wall clock, no DOM.
import { pinchRatio, rulesClassifier, type Classifier, type Pose } from '../classifier/classifier';
import type { HandFrame } from '../tracker/tracker';
import { createOneEuroFilter, type OneEuroParams } from './one-euro';

export type { Classifier, Pose } from '../classifier/classifier';

/** MediaPipe landmark index of the index fingertip. */
export const INDEX_TIP = 8;

export type GestureEvent = 'press' | 'release' | 'click' | 'swipe-left' | 'swipe-right' | 'pause' | 'clear';

export interface Cursor {
  x: number;
  y: number;
}

export interface GestureOutput {
  /** Normalised screen position (0..1, mirrored like the video), or null when no hand is visible. */
  cursor: Cursor | null;
  pose: Pose;
  /** The classifier's confidence in `pose` (0 when no hand is visible). */
  confidence: number;
  events: GestureEvent[];
  /** How closed the pinch is, for the cursor ring: 0 = open hand, 1 = pressed. */
  pinch: number;
  /** True between `press` and `release`. */
  pressed: boolean;
}

export interface GestureConfig extends OneEuroParams {
  /** Fraction of the camera frame (centred) that maps to the full screen. Smaller = less arm travel. */
  activeRegion: number;
  /** A pinch closes when the thumb–index distance (in palm sizes) drops below this… */
  pinchClose: number;
  /** …and opens again only above this. The gap between the two is the hysteresis. */
  pinchOpen: number;
  /** Consecutive closed frames needed before `press`. */
  confirmFrames: number;
  /** On press, the cursor snaps back to where it was this long before the pinch started closing. */
  lockLookbackMs: number;
  /** No new press for this long after a click. */
  clickCooldownMs: number;
  /**
   * Once pressed, moving the hand this far (screen widths) from where it was at the press turns the
   * pinch into a drag: the cursor unlocks and follows the hand, and the release gives no click.
   */
  dragThreshold: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  activeRegion: 0.7,
  // Units are screen widths per second; tuned by hand, revisited in issue 016.
  minCutoff: 1.5,
  beta: 2,
  dCutoff: 1,
  pinchClose: 0.25,
  pinchOpen: 0.4,
  confirmFrames: 3,
  lockLookbackMs: 100,
  clickCooldownMs: 300,
  // Recorded deliberate clicks (pinch-twice) drift up to ~0.06; revisit in issue 016.
  dragThreshold: 0.08,
};

/** Pinch ratio of a relaxed, open pointing hand: the ring starts closing below this. */
const RING_OPEN_RATIO = 0.8;
/** How much cursor history to keep for the lock lookback. */
const HISTORY_MS = 500;

export interface GestureEngine {
  /** Feed one tracker frame (null = no hand). Call once per frame, in timestamp order. */
  update(frame: HandFrame | null): GestureOutput;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createGestureEngine(config: GestureConfig, classifier: Classifier = rulesClassifier): GestureEngine {
  const margin = (1 - config.activeRegion) / 2;
  /** Maps a camera coordinate inside the active region to 0..1 screen space, clamped. */
  const toScreen = (v: number) => clamp01((v - margin) / config.activeRegion);
  const fx = createOneEuroFilter(config);
  const fy = createOneEuroFilter(config);

  // Pinch state.
  let pressed = false;
  /** Consecutive closed frames so far, and when the first of them arrived. */
  let closedFrames = 0;
  let closeStart = 0;
  let locked: Cursor | null = null;
  /** Where the (unlocked) hand cursor was at the press, to tell a drag from pinch jitter. */
  let pressAt: Cursor | null = null;
  let dragging = false;
  let lastClick = -Infinity;
  /** Recent filtered cursor positions, oldest first. */
  let history: { t: number; cursor: Cursor }[] = [];

  /** The cursor as it was `lockLookbackMs` before `start` (or the oldest one we still have). */
  const cursorBefore = (start: number): Cursor => {
    const target = start - config.lockLookbackMs;
    let best = history[0]!;
    for (const h of history) if (h.t <= target) best = h;
    return best.cursor;
  };

  return {
    update(frame) {
      if (!frame) {
        fx.reset();
        fy.reset();
        const events: GestureEvent[] = pressed ? ['release'] : [];
        pressed = false;
        closedFrames = 0;
        locked = null;
        pressAt = null;
        dragging = false;
        history = [];
        return { cursor: null, pose: 'none', confidence: 0, events, pinch: 0, pressed: false };
      }

      const t = frame.timestamp;
      const tip = frame.landmarks[INDEX_TIP]!;
      // Mirror x so moving the hand right moves the cursor right, like a mirror.
      // Filtering after clamping keeps the cursor in [0,1]: each output is a blend of in-range values.
      const smoothed = { x: fx.filter(toScreen(1 - tip.x), t), y: fy.filter(toScreen(tip.y), t) };
      history.push({ t, cursor: smoothed });
      while (history.length > 1 && history[0]!.t < t - HISTORY_MS) history.shift();

      const { label: pose, confidence } = classifier(frame.landmarks, frame.handedness);
      const ratio = pinchRatio(frame.landmarks);
      const events: GestureEvent[] = [];

      if (pressed) {
        if (!dragging && pressAt && Math.hypot(smoothed.x - pressAt.x, smoothed.y - pressAt.y) > config.dragThreshold) {
          dragging = true;
          locked = null;
        }
        if (ratio > config.pinchOpen) {
          const cursor = locked ?? smoothed;
          events.push(...(dragging ? (['release'] as const) : (['release', 'click'] as const)));
          if (!dragging) lastClick = t;
          pressed = false;
          locked = null;
          pressAt = null;
          dragging = false;
          closedFrames = 0;
          return { cursor, pose, confidence, events, pinch: pinchProgress(ratio), pressed: false };
        }
      } else if (ratio < config.pinchClose && pose === 'pinch' && t - lastClick >= config.clickCooldownMs) {
        if (closedFrames === 0) closeStart = t;
        closedFrames++;
        if (closedFrames >= config.confirmFrames) {
          pressed = true;
          locked = cursorBefore(closeStart);
          pressAt = smoothed;
          events.push('press');
        }
      } else {
        closedFrames = 0;
      }

      return {
        cursor: locked ?? smoothed,
        pose,
        confidence,
        events,
        pinch: pressed ? 1 : pinchProgress(ratio),
        pressed,
      };
    },
  };

  function pinchProgress(ratio: number): number {
    return clamp01((RING_OPEN_RATIO - ratio) / (RING_OPEN_RATIO - config.pinchClose));
  }
}
