// tracker: camera + MediaPipe Hand Landmarker → a stream of HandFrames (PRD §4.1).
// MediaPipe is loaded lazily from self-hosted files under /mediapipe/, never from a CDN.
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { createFixtureTracker, type Fixture } from './fixture';
import { createQualityGovernor, type QualityLevel } from './quality';

export type { QualityLevel } from './quality';

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

/** Per-frame measurements that come with each frame, for the debug panel. */
export interface FrameInfo {
  /** Time spent in the hand landmarker (0 for recordings). */
  detectMs: number;
}

export type FrameListener = (frame: HandFrame | null, info: FrameInfo) => void;

export type TrackerStatus =
  /** `progress` is 0..1 of the WASM + model download, or null while the size is unknown. */
  | { state: 'loading-model'; progress: number | null }
  | { state: 'starting-camera' }
  /** `delegate` is 'fixture' when replaying a recording instead of running the model. */
  /** Sent again whenever adaptive quality changes `quality`. */
  | { state: 'running'; delegate: Delegate | 'fixture'; quality: QualityLevel }
  /** The tab is hidden: camera and detection are off until it is visible again. */
  | { state: 'paused' }
  /** Resuming after the tab became visible failed. */
  | { state: 'error'; error: TrackerError }
  | { state: 'stopped' };

export type TrackerErrorKind = 'denied' | 'no-camera' | 'in-use' | 'unsupported' | 'model-load-failed';

/** Why the tracker could not start. `start()` rejects with this. */
export class TrackerError extends Error {
  constructor(
    readonly kind: TrackerErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`Tracker failed: ${kind}`, options);
    this.name = 'TrackerError';
  }
}

/** Maps a getUserMedia rejection to a TrackerError kind. */
function cameraErrorKind(err: unknown): TrackerErrorKind {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-camera';
    case 'TypeError':
      return 'unsupported';
    default:
      // NotReadableError, AbortError and anything unknown: the hardware is there but unusable.
      return 'in-use';
  }
}

async function openCamera(size: VideoSize): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new TrackerError('unsupported');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { ...size, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    throw new TrackerError(cameraErrorKind(err), { cause: err });
  }
}

/** The live camera, or a recorded fixture replayed in a loop. */
export type TrackerSource = 'camera' | { fixture: Fixture };

export interface Tracker {
  /**
   * Asks for the camera, loads the model and starts emitting frames. Rejects with a TrackerError.
   * While started, the camera is released when the tab is hidden and reopened when it is visible.
   */
  start(): Promise<void>;
  /** Stops the camera and the detection loop. */
  stop(): void;
  /** Called once per processed video frame, with null when no hand is visible. Returns an unsubscribe. */
  onFrame(cb: FrameListener): () => void;
  onStatus(cb: (status: TrackerStatus) => void): () => void;
  /** The live camera video, once started (null before start and for non-camera sources). */
  readonly video: HTMLVideoElement | null;
}

export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;

export interface VideoSize {
  width: number;
  height: number;
}

/** The camera resolution asked for at each quality level. */
export const QUALITY_VIDEO_SIZE: Record<QualityLevel, VideoSize> = {
  full: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
  'low-res': { width: 480, height: 360 },
  'skip-frames': { width: 480, height: 360 },
};
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

interface LoadedLandmarker {
  landmarker: HandLandmarker;
  delegate: Delegate;
}

/** One download + initialisation of the hand landmarker, with progress. */
interface ModelLoad {
  readonly promise: Promise<LoadedLandmarker>;
  /** Latest progress (0..1), or null while the total size is unknown. */
  progress(): number | null;
  onProgress(cb: (progress: number | null) => void): () => void;
  /** Closes the landmarker once it exists, for a load nobody will use. */
  discard(): void;
}

/** Fetches `url`, reporting bytes as they arrive. `total` is null when the server sends no length. */
async function download(url: string, onBytes: (loaded: number, total: number | null) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const length = Number(response.headers.get('Content-Length'));
  const total = length > 0 ? length : null;
  onBytes(0, total);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onBytes(bytes.length, total);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Downloads the WASM runtime and the model with progress, then creates the landmarker (GPU, else CPU).
 * The model bytes go to MediaPipe directly. The WASM download only warms the HTTP cache, which
 * MediaPipe's own loader then reads from.
 */
function startModelLoad(): ModelLoad {
  const listeners = new Set<(progress: number | null) => void>();
  const files = new Map<string, { loaded: number; total: number | null }>();
  let progress: number | null = null;
  const track = (name: string) => (loaded: number, total: number | null) => {
    files.set(name, { loaded, total });
    const all = [...files.values()];
    const next =
      all.length === 2 && all.every((f) => f.total !== null)
        ? all.reduce((n, f) => n + f.loaded, 0) / all.reduce((n, f) => n + (f.total ?? 0), 0)
        : null;
    if (next === progress) return;
    progress = next;
    listeners.forEach((cb) => cb(progress));
  };

  const promise = (async (): Promise<LoadedLandmarker> => {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(`${ASSET_BASE}/wasm`);
    const [, model] = await Promise.all([
      fileset.wasmBinaryPath ? download(fileset.wasmBinaryPath, track('wasm')) : track('wasm')(0, 0),
      download(`${ASSET_BASE}/hand_landmarker.task`, track('model')),
    ]);
    const create = (delegate: Delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    try {
      return { landmarker: await create('GPU'), delegate: 'GPU' };
    } catch (err) {
      console.warn('GPU delegate unavailable, falling back to CPU', err);
      return { landmarker: await create('CPU'), delegate: 'CPU' };
    }
  })();
  // Claimers attach their own handlers. This only keeps an unclaimed failure from being reported as unhandled.
  promise.catch(() => {});

  return {
    promise,
    progress: () => progress,
    onProgress(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    discard() {
      promise.then(({ landmarker }) => landmarker.close(), () => {});
    },
  };
}

/** A load started by preloadHandModel() that no tracker has claimed yet. */
let preloaded: ModelLoad | null = null;

/**
 * Starts downloading and initialising the hand model ahead of time (e.g. when "Try it" is hovered),
 * so starting the camera feels instant. Safe to call repeatedly. Never touches the camera.
 */
export function preloadHandModel(): void {
  if (preloaded) return;
  const load = startModelLoad();
  preloaded = load;
  load.promise.catch(() => {
    if (preloaded === load) preloaded = null;
  });
}

/** Takes the preloaded model load, or starts a new one. Each load belongs to one tracker. */
function claimModelLoad(): ModelLoad {
  const load = preloaded ?? startModelLoad();
  preloaded = null;
  return load;
}

export function createTracker(source: TrackerSource): Tracker {
  return source === 'camera' ? createCameraTracker() : createFixtureTracker(source.fixture);
}

function createCameraTracker(): Tracker {
  const frameListeners = new Set<FrameListener>();
  const statusListeners = new Set<(status: TrackerStatus) => void>();
  let video: HTMLVideoElement | null = null;
  let stream: MediaStream | null = null;
  let landmarker: HandLandmarker | null = null;
  let delegate: Delegate = 'GPU';
  /** The model load this tracker is waiting for, started alongside the camera request. */
  let pendingLoad: ModelLoad | null = null;
  const governor = createQualityGovernor();
  let quality: QualityLevel = 'full';
  let videoFrames = 0;
  let running = false;
  let rafId = 0;
  let lastVideoTime = -1;
  let lastTimestamp = 0;
  // Bumped by stop() and on hide, so an in-flight run() knows it was cancelled.
  let session = 0;

  const emitStatus = (status: TrackerStatus) => statusListeners.forEach((cb) => cb(status));

  const setQuality = (level: QualityLevel) => {
    const before = QUALITY_VIDEO_SIZE[quality];
    const after = QUALITY_VIDEO_SIZE[level];
    quality = level;
    if (before.width !== after.width || before.height !== after.height) {
      stream
        ?.getVideoTracks()[0]
        ?.applyConstraints(after)
        .catch((err: unknown) => console.warn('Could not change the camera resolution', err));
    }
    emitStatus({ state: 'running', delegate, quality });
  };

  const loop = () => {
    if (!running || !video || !landmarker) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const level = governor.frame(performance.now());
      if (level !== quality) setQuality(level);
      // In skip-frames mode every other video frame is not detected. Nothing is emitted for it, so
      // the cursor stays on the last result.
      if (quality === 'skip-frames' && videoFrames++ % 2 === 1) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      // MediaPipe requires strictly increasing timestamps.
      const timestamp = Math.max(performance.now(), lastTimestamp + 1);
      lastTimestamp = timestamp;
      const detectStart = performance.now();
      const result = landmarker.detectForVideo(video, timestamp);
      const info: FrameInfo = { detectMs: performance.now() - detectStart };
      const frame = toHandFrame(result, timestamp);
      frameListeners.forEach((cb) => cb(frame, info));
    }
    rafId = requestAnimationFrame(loop);
  };

  const releaseCamera = () => {
    session++;
    running = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  };

  /** Opens the camera, loads the model if needed and starts the detection loop. */
  const run = async () => {
    const mine = ++session;
    const cancelled = () => mine !== session;
    // Download the model while the visitor answers the camera prompt.
    if (!landmarker) pendingLoad ??= claimModelLoad();
    emitStatus({ state: 'starting-camera' });
    const opened = await openCamera(QUALITY_VIDEO_SIZE[quality]);
    if (cancelled()) {
      opened.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = opened;
    video ??= document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (cancelled()) return;

    if (!landmarker && pendingLoad) {
      const load = pendingLoad;
      emitStatus({ state: 'loading-model', progress: load.progress() });
      const off = load.onProgress((progress) => {
        if (!cancelled()) emitStatus({ state: 'loading-model', progress });
      });
      try {
        ({ landmarker, delegate } = await load.promise);
      } catch (err) {
        releaseCamera();
        throw new TrackerError('model-load-failed', { cause: err });
      } finally {
        off();
        if (pendingLoad === load) pendingLoad = null;
      }
      if (cancelled()) return;
    }

    running = true;
    lastVideoTime = -1;
    // Time spent hidden or loading must not count as slow frames.
    governor.reset();
    emitStatus({ state: 'running', delegate, quality });
    rafId = requestAnimationFrame(loop);
  };

  /** Frees the landmarker, and any load still on its way: this tracker is done with them. */
  const discardModel = () => {
    pendingLoad?.discard();
    pendingLoad = null;
    landmarker?.close();
    landmarker = null;
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      releaseCamera();
      emitStatus({ state: 'paused' });
    } else if (!running) {
      run().catch((err: unknown) => {
        const error = err instanceof TrackerError ? err : new TrackerError('in-use', { cause: err });
        document.removeEventListener('visibilitychange', onVisibilityChange);
        emitStatus({ state: 'error', error });
      });
    }
  };

  const tracker: Tracker = {
    get video() {
      return video;
    },

    async start() {
      if (running) return;
      document.addEventListener('visibilitychange', onVisibilityChange);
      try {
        await run();
      } catch (err) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        discardModel();
        throw err;
      }
    },

    stop() {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseCamera();
      discardModel();
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
