import './style.css';
import { renderLanding } from './app/landing';
import { renderLiveView } from './app/overlay';
import { createTracker } from './tracker/tracker';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');

renderLanding(root, {
  // The camera is requested only here, after the visitor clicks "Try it", never on page load.
  onTryIt: () => {
    const tracker = createTracker('camera');
    const view = renderLiveView(root, () => tracker.video);
    tracker.onStatus((status) => {
      if (status.state === 'starting-camera') view.setStatus('Waiting for camera permission…');
      else if (status.state === 'loading-model') view.setStatus('Loading hand model…');
      else if (status.state === 'running') view.setStatus('');
    });
    tracker.onFrame((frame) => view.draw(frame));
    tracker.start().catch((err: unknown) => {
      // Proper failure screens arrive in issue 003.
      console.error(err);
      view.setStatus(`Could not start the camera: ${err instanceof Error ? err.message : String(err)}`);
    });
  },
});
