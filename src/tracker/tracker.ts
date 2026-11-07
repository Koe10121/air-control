// tracker: camera + MediaPipe Hand Landmarker → a stream of HandFrames (PRD §4.1).
// MediaPipe is loaded lazily from self-hosted files under /mediapipe/, never from a CDN.
import type { HandLandmarker } from '@mediapipe/tasks-vision';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type Handedness = 'Left' | 'Right';

/** One tracked hand: 21 normalised landmarks (0..1 in the *unmirrored* camera image). */
export interface HandFrame {
  landmarks: Landmark[];
  handedness: Handedness;
  /** Milliseconds, from the same clock as performance.now(). */
  timestamp: number;
}

export type Delegate = 'GPU' | 'CPU';

export type TrackerStatus =
  | { state: 'loading-model' }
  | { state: 'starting-camera' }
  | { state: 'running'; delegate: Delegate }
  | { state: 'stopped' };

export type TrackerSource = 'camera';

export interface Tracker {
  /** Asks for the camera, loads the model and starts emitting frames. */
  start(): Promise<void>;
  /** Stops the camera and the detection loop. */
  stop(): void;
  /** Called once per processed video frame, with null when no hand is visible. Returns an unsubscribe. */
  onFrame(cb: (frame: HandFrame | null) => void): () => void;
  onStatus(cb: (status: TrackerStatus) => void): () => void;
  /** The live camera video, once started (null before start and for non-camera sources). */
  readonly video: HTMLVideoElement | null;
}

export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;
const ASSET_BASE = `${import.meta.env.BASE_URL}mediapipe`;

/** The subset of MediaPipe's HandLandmarkerResult that we read. */
export interface LandmarkerResult {
  landmarks: ReadonlyArray<ReadonlyArray<{ x: number; y: number; z: number }>>;
  handedness: ReadonlyArray<ReadonlyArray<{ categoryName: string; score: number }>>;
}

/** Converts a MediaPipe result into our HandFrame (first hand only), or null when there is no usable hand. */
export function toHandFrame(result: LandmarkerResult, timestamp: number): HandFrame | null {
  const points = result.landmarks[0];
  if (!points || points.length !== 21) return null;
  const handedness: Handedness = result.handedness[0]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right';
  return {
    landmarks: points.map(({ x, y, z }) => ({ x, y, z })),
    handedness,
    timestamp,
  };
}

async function createLandmarker(): Promise<{ landmarker: HandLandmarker; delegate: Delegate }> {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(`${ASSET_BASE}/wasm`);
  const create = (delegate: Delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${ASSET_BASE}/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  try {
    return { landmarker: await create('GPU'), delegate: 'GPU' };
  } catch (err) {
    console.warn('GPU delegate unavailable, falling back to CPU', err);
    return { landmarker: await create('CPU'), delegate: 'CPU' };
  }
}

export function createTracker(_source: TrackerSource): Tracker {
  const frameListeners = new Set<(frame: HandFrame | null) => void>();
  const statusListeners = new Set<(status: TrackerStatus) => void>();
  let video: HTMLVideoElement | null = null;
  let stream: MediaStream | null = null;
  let landmarker: HandLandmarker | null = null;
  let delegate: Delegate = 'GPU';
  let running = false;
  let rafId = 0;
  let lastVideoTime = -1;
  let lastTimestamp = 0;

  const emitStatus = (status: TrackerStatus) => statusListeners.forEach((cb) => cb(status));

  const loop = () => {
    if (!running || !video || !landmarker) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      // MediaPipe requires strictly increasing timestamps.
      const timestamp = Math.max(performance.now(), lastTimestamp + 1);
      lastTimestamp = timestamp;
      const frame = toHandFrame(landmarker.detectForVideo(video, timestamp), timestamp);
      frameListeners.forEach((cb) => cb(frame));
    }
    rafId = requestAnimationFrame(loop);
  };

  const tracker: Tracker = {
    get video() {
      return video;
    },

    async start() {
      if (running) return;
      emitStatus({ state: 'starting-camera' });
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, facingMode: 'user' },
        audio: false,
      });
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();

      emitStatus({ state: 'loading-model' });
      if (!landmarker) ({ landmarker, delegate } = await createLandmarker());

      running = true;
      lastVideoTime = -1;
      emitStatus({ state: 'running', delegate });
      rafId = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (video) video.srcObject = null;
      emitStatus({ state: 'stopped' });
    },

    onFrame(cb) {
      frameListeners.add(cb);
      return () => frameListeners.delete(cb);
    },

    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  };
  return tracker;
}
