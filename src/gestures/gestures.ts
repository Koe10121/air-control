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
  /**
   * A pinch made while the cursor moves faster than this (screen widths per second) is a drag from the
   * start: no lock, so a fast stroke doesn't begin with a jump back. Clicks press at ≈0.3–0.5,
   * fast drawing at ≈1.3–2.5 (pinch-twice, draw-fast-2).
   */
  dragSpeed: number;
  /** How long a fist (→ clear) or a still open palm (→ pause) must be held. */
  holdMs: number;
  /** The open palm counts as still while its centre stays within this many palm sizes of where the hold began. */
  stillRadius: number;
  /**
   * A hold survives other poses for this long, so classifier flicker (e.g. the index poking out of a
   * fist for a few frames) neither restarts it nor counts as letting go.
   */
  holdGraceMs: number;
  /**
   * A press ends only once the pinch has been open for this long. Fast moves blur the hand and the
   * thumb–index distance spikes open for a frame or two, which chopped fast strokes into dots.
   */
  releaseMs: number;
  /** A press survives the hand vanishing for up to this long (tracking dropouts during fast moves). */
  lossGraceMs: number;
  /** Swipe detection on or off (Slides turns it on while mounted; see `GestureEngine.setSwipes`). */
  swipes: boolean;
  /** A swipe is the palm centre moving this far sideways (fractions of the camera frame width)… */
  swipeDistance: number;
  /** …within this long… */
  swipeWindowMs: number;
  /** …with vertical movement under this fraction of the horizontal. */
  swipeMaxSlope: number;
  /** No new swipe for this long after one. */
  swipeCooldownMs: number;
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
  dragSpeed: 0.9,
  holdMs: 1000,
  // open-palm-hold drifts ≈0.05 palm sizes once settled; fidget-10s's slow open-hand drift is ≈0.3 per second.
  stillRadius: 0.15,
  // fist-hold flickers to pinch for up to ≈75 ms at a time.
  holdGraceMs: 200,
  // draw-fast: open flickers mid-stroke last up to ≈75 ms; tracking dropouts mostly 60–150 ms.
  releaseMs: 80,
  lossGraceMs: 250,
  swipes: false,
  // Recorded swipes (swipe-left / swipe-right) cover 0.20 / 0.18 frame widths in 250 ms but 0.28 / 0.27 in
  // 400 ms. Non-swipes peak at 0.16 (fidget-10s) and 0.19 (hand-leaves-mid-pinch) however long the window.
  // 0.22 sits between with room both ways; revisit in issue 016.
  swipeDistance: 0.22,
  swipeWindowMs: 400,
  swipeMaxSlope: 0.5,
  swipeCooldownMs: 600,
};

/** Pinch ratio of a relaxed, open pointing hand: the ring starts closing below this. */
const RING_OPEN_RATIO = 0.8;
/** How much cursor history to keep for the lock lookback. */
const HISTORY_MS = 500;

export interface GestureEngine {
  /**
   * Feed one tracker frame (null = no hand). Call once per frame, in timestamp order.
   * For a null frame pass `now` (same clock as frame timestamps) so a press can ride out a short
   * dropout; without it a null frame releases at once.
   */
  update(frame: HandFrame | null, now?: number): GestureOutput;
  /** Turns swipe detection on or off (overrides `config.swipes`). */
  setSwipes(on: boolean): void;
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
  /** When the pinch first read open during the current press (null while closed). */
  let openSince: number | null = null;
  /** Timestamp of the last frame with a hand, and whether the hand is missing (inside the loss grace). */
  let lastSeen = -Infinity;
  let missing = false;
  /** Recent filtered cursor positions, oldest first. */
  let history: { t: number; cursor: Cursor }[] = [];

  // Hold state: the pose being held, when (and, for the open palm, where) the hold began, when the
  // pose was last seen, and whether the hold has fired. It fires once, then waits to be let go.
  let holdPose: HoldPose | null = null;
  let holdStart = 0;
  let holdAnchor: Cursor = { x: 0, y: 0 };
  let holdSeen = 0;
  let holdFired = false;

  // Swipe state: recent palm centres (oldest first, raw camera space) and the end of the cooldown.
  let swipesOn = config.swipes;
  let palmTrail: { t: number; x: number; y: number }[] = [];
  let swipeQuietUntil = -Infinity;

  /**
   * Looks for a fast sideways palm movement ending at this frame; pushes `swipe-left` / `swipe-right`.
   * Raw camera x grows towards the user's left (the video is shown mirrored), so +x = swipe-left.
   */
  const updateSwipe = (frame: HandFrame, events: GestureEvent[]) => {
    const t = frame.timestamp;
    if (!swipesOn || pressed || t < swipeQuietUntil) {
      palmTrail = [];
      return;
    }
    const { x, y } = palmCentre(frame.landmarks);
    while (palmTrail.length > 0 && palmTrail[0]!.t < t - config.swipeWindowMs) palmTrail.shift();
    const start = palmTrail.find(
      (p) => Math.abs(x - p.x) >= config.swipeDistance && Math.abs(y - p.y) <= config.swipeMaxSlope * Math.abs(x - p.x),
    );
    if (start) {
      events.push(x > start.x ? 'swipe-left' : 'swipe-right');
      swipeQuietUntil = t + config.swipeCooldownMs;
      palmTrail = [];
      return;
    }
    palmTrail.push({ t, x, y });
  };

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

  /** The cursor sample from `lockLookbackMs` before `start` (or the oldest one we still have). */
  const sampleBefore = (start: number) => {
    const target = start - config.lockLookbackMs;
    let best = history[0]!;
    for (const h of history) if (h.t <= target) best = h;
    return best;
  };

  /** Forgets the hand entirely (as when it leaves view). Returns `release` if a press was open. */
  function reset(): GestureEvent[] {
    fx.reset();
    fy.reset();
    const events: GestureEvent[] = pressed ? ['release'] : [];
    pressed = false;
    closedFrames = 0;
    locked = null;
    pressAt = null;
    dragging = false;
    openSince = null;
    missing = false;
    history = [];
    holdPose = null;
    palmTrail = [];
    return events;
  }

  return {
    setSwipes(on) {
      swipesOn = on;
      palmTrail = [];
    },

    update(frame, now) {
      if (!frame) {
        if (pressed && now !== undefined && now - lastSeen <= config.lossGraceMs) {
          // Keep the press through a short dropout; the cursor hides until the hand is back.
          missing = true;
          return { cursor: null, pose: 'none', confidence: 0, events: [], pinch: 1, pressed: true, hold: null };
        }
        return { cursor: null, pose: 'none', confidence: 0, events: reset(), pinch: 0, pressed: false, hold: null };
      }

      // Back after too long a gap: end the old press, then treat this as a new hand.
      const resumed: GestureEvent[] = missing && frame.timestamp - lastSeen > config.lossGraceMs ? reset() : [];
      missing = false;
      // A long gap between frames means the hand was out of view: its old positions are no swipe start.
      if (frame.timestamp - lastSeen > config.lossGraceMs) palmTrail = [];
      lastSeen = frame.timestamp;

      const t = frame.timestamp;
      const tip = frame.landmarks[INDEX_TIP]!;
      // Mirror x so moving the hand right moves the cursor right, like a mirror.
      // Filtering after clamping keeps the cursor in [0,1]: each output is a blend of in-range values.
      const smoothed = { x: fx.filter(toScreen(1 - tip.x), t), y: fy.filter(toScreen(tip.y), t) };
      history.push({ t, cursor: smoothed });
      while (history.length > 1 && history[0]!.t < t - HISTORY_MS) history.shift();

      const { label: pose, confidence } = classifier(frame.landmarks, frame.handedness);
      const ratio = pinchRatio(frame.landmarks);
      const events: GestureEvent[] = resumed;
      const hold = updateHold(pose, frame, events);
      updateSwipe(frame, events);

      if (pressed) {
        openSince = ratio > config.pinchOpen ? (openSince ?? t) : null;
        // Only a move made while still pinched is a drag; the hand moving as the fingers open is part of the click.
        if (
          !dragging &&
          openSince === null &&
          pressAt &&
          Math.hypot(smoothed.x - pressAt.x, smoothed.y - pressAt.y) > config.dragThreshold
        ) {
          dragging = true;
          locked = null;
        }
        if (openSince !== null && t - openSince >= config.releaseMs) {
          const cursor = locked ?? smoothed;
          events.push(...(dragging ? (['release'] as const) : (['release', 'click'] as const)));
          if (!dragging) lastClick = t;
          pressed = false;
          locked = null;
          pressAt = null;
          dragging = false;
          closedFrames = 0;
          openSince = null;
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
          openSince = null;
          const before = sampleBefore(closeStart);
          const elapsed = (t - before.t) / 1000;
          const speed = elapsed > 0 ? Math.hypot(smoothed.x - before.cursor.x, smoothed.y - before.cursor.y) / elapsed : 0;
          dragging = speed > config.dragSpeed;
          locked = dragging ? null : before.cursor;
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
