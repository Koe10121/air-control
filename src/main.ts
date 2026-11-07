import './style.css';
import { renderErrorScreen } from './app/error-screen';
import { renderLanding } from './app/landing';
import { renderLiveView, renderMouseStage } from './app/overlay';
import { createFrameRecorder, fixtureNameFromUrl, loadFixture } from './tracker/fixture';
import { createTracker, TrackerError, type Tracker, type TrackerErrorKind } from './tracker/tracker';

/** The recording played by "Watch a demo". */
const DEMO_FIXTURE = 'synthetic-wave';
/** How much live tracking the dev capture hotkey (Shift+R) saves. */
const CAPTURE_SECONDS = 10;
const devTools = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');
const app: HTMLElement = root;

function showLanding() {
  renderLanding(app, { onTryIt: startCamera });
}

function showMouseStage() {
  renderMouseStage(app, { onExit: showLanding });
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
  tracker.onStatus((status) => {
    if (status.state === 'starting-camera') view.setStatus('Waiting for camera permission…');
    else if (status.state === 'loading-model') view.setStatus('Loading hand model…');
    else if (status.state === 'running') view.setStatus('');
    else if (status.state === 'error') showError(status.error.kind);
  });
  tracker.onFrame((frame) => view.draw(frame));
  tracker.start().catch((err: unknown) => {
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
      const blob = new Blob([JSON.stringify(recorder.toFixture(name))], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
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
