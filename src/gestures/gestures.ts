// gestures: HandFrame stream → cursor, pose and events (PRD §4.3).
// Pure and driven only by frame timestamps: no wall clock, no DOM.
import { palmSize, pinchRatio, rulesClassifier, type Classifier, type Pose } from '../classifier/classifier';
import type { HandFrame, Landmark } from '../tracker/tracker';
import { createOneEuroFilter, type OneEuroParams } from './one-euro';

export type { Classifier, Pose } from '../classifier/classifier';

/** MediaPipe landmark index of the index fingertip. */
export const INDEX_TIP = 8;

export type GestureEvent = 'press' | 'release' | 'click' | 'swipe-left' | 'swipe-right' | 'pause' | 'clear';

/** A hold that is building up: which event it will fire and how far along it is (0..1). */
export interface HoldProgress {
  gesture: 'clear' | 'pause';
  progress: number;
}

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
  /** The hold building up (fist → clear, still open palm → pause), or null when none is (or it has fired). */
  hold: HoldProgress | null;
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
  /** How long a fist (→ clear) or a still open palm (→ pause) must be held. */
  holdMs: number;
  /** The open palm counts as still while its centre stays within this many palm sizes of where the hold began. */
  stillRadius: number;
  /**
   * A hold survives other poses for this long, so classifier flicker (e.g. the index poking out of a
   * fist for a few frames) neither restarts it nor counts as letting go.
   */
  holdGraceMs: number;
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
  holdMs: 1000,
  // open-palm-hold drifts ≈0.05 palm sizes once settled; fidget-10s's slow open-hand drift is ≈0.3 per second.
  stillRadius: 0.15,
  // fist-hold flickers to pinch for up to ≈75 ms at a time.
  holdGraceMs: 200,
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

/** Landmarks averaged for the palm centre: wrist and the four finger knuckles. */
const PALM_POINTS: readonly number[] = [0, 5, 9, 13, 17];
const palmCentre = (l: Landmark[]): Cursor => ({
  x: PALM_POINTS.reduce((s, i) => s + l[i]!.x, 0) / PALM_POINTS.length,
  y: PALM_POINTS.reduce((s, i) => s + l[i]!.y, 0) / PALM_POINTS.length,
});

const HOLD_EVENTS = { fist: 'clear', open_palm: 'pause' } as const;
type HoldPose = keyof typeof HOLD_EVENTS;

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

  // Hold state: the pose being held, when (and, for the open palm, where) the hold began, when the
  // pose was last seen, and whether the hold has fired. It fires once, then waits to be let go.
  let holdPose: HoldPose | null = null;
  let holdStart = 0;
  let holdAnchor: Cursor = { x: 0, y: 0 };
  let holdSeen = 0;
  let holdFired = false;

  /** Advances the hold timers for one frame; pushes `clear` / `pause` when one completes. */
  const updateHold = (pose: Pose, frame: HandFrame, events: GestureEvent[]): HoldProgress | null => {
    const t = frame.timestamp;
    if (holdPose && t - holdSeen > config.holdGraceMs) holdPose = null; // let go
    const held = pose in HOLD_EVENTS ? (pose as HoldPose) : null;
    if (held) {
      const centre = palmCentre(frame.landmarks);
      const palm = palmSize(frame.landmarks);
      const moved =
        held === 'open_palm' &&
        palm > 0 &&
        Math.hypot(centre.x - holdAnchor.x, centre.y - holdAnchor.y) / palm > config.stillRadius;
      if (held !== holdPose) holdFired = false;
      if (held !== holdPose || (moved && !holdFired)) {
        holdPose = held;
        holdStart = t;
        holdAnchor = centre;
      }
      holdSeen = t;
    }
    if (!holdPose || holdFired) return null;
    const gesture = HOLD_EVENTS[holdPose];
    // Fire only on a frame that shows the pose, not during a flicker.
    if (held === holdPose && t - holdStart >= config.holdMs) {
      holdFired = true;
      events.push(gesture);
      return null;
    }
    return { gesture, progress: clamp01((t - holdStart) / config.holdMs) };
  };

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
        holdPose = null;
        return { cursor: null, pose: 'none', confidence: 0, events, pinch: 0, pressed: false, hold: null };
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
      const hold = updateHold(pose, frame, events);

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
          return { cursor, pose, confidence, events, pinch: pinchProgress(ratio), pressed: false, hold };
        }
      } else if (
        ratio < config.pinchClose &&
        pose === 'pinch' &&
        holdPose !== 'fist' &&
        t - lastClick >= config.clickCooldownMs
      ) {
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
        hold,
      };
    },
  };

  function pinchProgress(ratio: number): number {
    return clamp01((RING_OPEN_RATIO - ratio) / (RING_OPEN_RATIO - config.pinchClose));
  }
}
