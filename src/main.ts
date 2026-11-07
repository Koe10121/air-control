import './style.css';
import { renderErrorScreen } from './app/error-screen';
import { renderLanding } from './app/landing';
import { renderLiveView, renderMouseStage } from './app/overlay';
import { createTracker, TrackerError, type TrackerErrorKind } from './tracker/tracker';

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
  renderErrorScreen(app, kind, { onUseMouse: showMouseStage, onRetry: startCamera });
}

// The camera is requested only here, after the visitor clicks "Try it", never on page load.
function startCamera() {
  const tracker = createTracker('camera');
  const view = renderLiveView(app, () => tracker.video, {
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

showLanding();
