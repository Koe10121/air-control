import './style.css';
import { renderErrorScreen } from './app/error-screen';
import { renderLanding } from './app/landing';
import { renderLiveView, renderMouseStage } from './app/overlay';
import { createDebugPanel } from './debug/panel';
import { createGestureEngine, DEFAULT_GESTURE_CONFIG } from './gestures/gestures';
import { createInput, type Input } from './input/input';
import { createBenchmarkMode } from './modes/benchmark';
import { createCatchMode } from './modes/catch';
import { createDrawMode } from './modes/draw';
import { createSlidesMode } from './modes/slides';
import { createMenuMode, createModeRouter, modeFromUrl, type ModeFactory } from './modes/modes';
import { createRecordMode, downloadJson } from './recorder/record-mode';
import { createFrameRecorder, fixtureNameFromUrl, loadFixture } from './tracker/fixture';
import { createTracker, TrackerError, type HandFrame, type Tracker, type TrackerErrorKind } from './tracker/tracker';

/** The recording played by "Watch a demo". */
const DEMO_FIXTURE = 'demo-showcase';
/** How much live tracking the dev capture hotkey (Shift+R) saves. */
const CAPTURE_SECONDS = 10;
const devTools = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');
const app: HTMLElement = root;

function showLanding() {
  renderLanding(app, { onTryIt: startCamera });
}

/** Every tracked frame of the running tracker, for modes that read landmarks directly (the recorder). */
const frameListeners = new Set<(frame: HandFrame | null) => void>();
/** The pose classifier behind the hand cursor, for the benchmark's results (null on the mouse stage). */
let activeClassifier: string | null = null;

const MODES: Record<string, ModeFactory> = {
  menu: createMenuMode,
  draw: createDrawMode,
  slides: createSlidesMode,
  catch: createCatchMode,
  // Hidden: only reachable by ?mode=record, never listed on the menu.
  record: (nav) =>
    createRecordMode(nav, {
      subscribe(cb) {
        frameListeners.add(cb);
        return () => frameListeners.delete(cb);
      },
    }),
  // Hidden: only reachable by ?mode=benchmark.
  benchmark: (nav) => createBenchmarkMode(nav, { classifier: () => activeClassifier }),
};

/**
 * Opens the `?mode=` deep link (or the menu) in `layer`, feeds it input actions and animation ticks,
 * and keeps `?mode=` in the address bar in step. `onModeChange` hears every mode switch.
 * Returns a teardown.
 */
function startModes(layer: HTMLElement, input: Input, onModeChange?: (name: string) => void): () => void {
  const router = createModeRouter(layer, MODES, {
    onChange(name) {
      onModeChange?.(name);
      const params = new URLSearchParams(location.search);
      if (name === 'menu') params.delete('mode');
      else params.set('mode', name);
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    },
  });
  const wanted = modeFromUrl(location.search);
  if (!wanted || !router.open(wanted)) router.open('menu');
  const unsubscribe = input.onAction((action) => router.handle(action));
  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    router.tick(now - last);
    last = now;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    unsubscribe();
    router.close();
  };
}

function showMouseStage() {
  let teardown = () => {};
  const { stage, layer } = renderMouseStage(app, {
    onExit: () => {
      teardown();
      showLanding();
    },
  });
  const input = createInput(stage);
  activeClassifier = null;
  const stopModes = startModes(layer, input);
  teardown = () => {
    stopModes();
    input.destroy();
  };
}

function showError(kind: TrackerErrorKind) {
  renderErrorScreen(app, kind, {
    onUseMouse: showMouseStage,
    onRetry: startCamera,
    onWatchDemo: () => startFixture(DEMO_FIXTURE),
  });
}

/** Shows the live view for `tracker` and starts it. */
function runTracker(tracker: Tracker, stopLabel: string) {
  const view = renderLiveView(app, () => tracker.video, {
    stopLabel,
    onStop: () => {
      tracker.stop();
      showLanding();
    },
  });
  const input = createInput(view.stage);
  const gestures = createGestureEngine(DEFAULT_GESTURE_CONFIG);
  activeClassifier = 'rules';
  // Swipes are only listened for while Slides is open, so a fast hand elsewhere never pages anything.
  const stopModes = startModes(view.layer, input, (name) => gestures.setSwipes(name === 'slides'));
  const debug = createDebugPanel(view.stage);
  let tornDown = false;
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    stopModes();
    input.destroy();
    debug.destroy();
  };
  tracker.onStatus((status) => {
    if (status.state === 'stopped' || status.state === 'error') teardown();
    if (status.state === 'starting-camera') view.setStatus('Waiting for camera permission…');
    else if (status.state === 'loading-model') view.setStatus('Loading hand model…');
    else if (status.state === 'running') {
      view.setStatus('');
      const v = tracker.video;
      debug.setTrackerStatus(
        status.delegate === 'fixture' ? 'Recording (no model)' : `${status.delegate} · ${v?.videoWidth ?? 0}×${v?.videoHeight ?? 0}`,
      );
    } else if (status.state === 'paused') debug.setTrackerStatus('Paused (tab hidden)');
    else if (status.state === 'error') showError(status.error.kind);
  });
  tracker.onFrame((frame, { detectMs }) => {
    view.draw(frame);
    frameListeners.forEach((cb) => cb(frame));
    const gestureStart = performance.now();
    // No-hand frames carry no timestamp; give them the time so a press can ride out a short dropout.
    const out = gestures.update(frame, frame ? undefined : performance.now());
    const gestureMs = performance.now() - gestureStart;
    debug.record({ detectMs, gestureMs, pose: out.pose, confidence: out.confidence, timestamp: frame?.timestamp ?? performance.now() });
    view.setCursor(out.cursor);
    view.setPinch(out.pinch, out.pressed);
    view.setHold(out.hold);
    input.push(out);
  });
  tracker.start().catch((err: unknown) => {
    teardown();
    console.error(err);
    showError(err instanceof TrackerError ? err.kind : 'model-load-failed');
  });
}

// The camera is requested only here, after the visitor clicks "Try it", never on page load.
function startCamera() {
  const tracker = createTracker('camera');
  if (devTools) enableCaptureHotkey(tracker);
  runTracker(tracker, 'Stop camera');
}

/** Plays a recorded fixture through the same pipeline as the camera. No camera is touched. */
function startFixture(name: string) {
  loadFixture(name).then(
    (fixture) => runTracker(createTracker({ fixture }), 'Stop demo'),
    (err: unknown) => {
      console.error(err);
      showLanding();
    },
  );
}

/**
 * Dev only: Shift+R downloads the last CAPTURE_SECONDS of live HandFrames as a fixture file.
 * The file is saved locally by the browser; nothing is uploaded.
 */
function enableCaptureHotkey(tracker: Tracker) {
  const recorder = createFrameRecorder(CAPTURE_SECONDS);
  tracker.onFrame((frame) => recorder.push(frame));
  const onKey = (e: KeyboardEvent) => {
    if (!e.shiftKey || e.key.toLowerCase() !== 'r') return;
    const name = `capture-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      downloadJson(`${name}.json`, recorder.toFixture(name));
    } catch (err) {
      console.warn(err);
    }
  };
  window.addEventListener('keydown', onKey);
  tracker.onStatus((status) => {
    if (status.state === 'stopped') window.removeEventListener('keydown', onKey);
  });
}

const fixtureName = fixtureNameFromUrl(location.search);
if (fixtureName) startFixture(fixtureName);
else showLanding();
