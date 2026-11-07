// Friendly screens for each way the camera can fail to start (PRD §4.6, user stories 12–13).
import type { TrackerErrorKind } from '../tracker/tracker';

export interface ErrorScreenOptions {
  /** Enter the app without a camera. */
  onUseMouse: () => void;
  /** Ask for the camera again. */
  onRetry: () => void;
  /** Play a recorded hand instead of the camera. */
  onWatchDemo: () => void;
}

const MESSAGES: Record<TrackerErrorKind, { title: string; body: string }> = {
  denied: {
    title: 'Camera access is blocked',
    body: `
      <p>Air Control needs your camera to see your hand. Video never leaves your device.</p>
      <p><strong>Chrome or Edge:</strong> click the camera or lock icon at the left of the address bar,
      set <em>Camera</em> to <em>Allow</em>, then reload the page.</p>`,
  },
  'no-camera': {
    title: 'No camera found',
    body: '<p>Plug in a webcam (or enable your built-in one), then try again.</p>',
  },
  'in-use': {
    title: 'Your camera is busy',
    body: '<p>Another app or tab is probably using it. Close it, then try again.</p>',
  },
  unsupported: {
    title: 'This browser can’t share its camera here',
    body: '<p>Open this page over HTTPS in a recent Chrome, Edge or Firefox.</p>',
  },
  'model-load-failed': {
    title: 'The hand model didn’t load',
    body: '<p>Check your connection and try again. Everything runs on your device once it loads.</p>',
  },
};

/** Renders the error screen for `kind` into `root`, replacing its contents. */
export function renderErrorScreen(root: HTMLElement, kind: TrackerErrorKind, options: ErrorScreenOptions): void {
  const { title, body } = MESSAGES[kind];
  root.innerHTML = `
    <main class="landing error-screen" data-kind="${kind}">
      <h1>${title}</h1>
      <div class="pitch">${body}</div>
      <div class="actions">
        <button type="button" class="try-it retry">Try again</button>
        <button type="button" class="secondary use-mouse">Use mouse instead</button>
        <button type="button" class="secondary watch-demo">Watch a demo</button>
      </div>
    </main>
  `;
  root.querySelector('.retry')?.addEventListener('click', options.onRetry);
  root.querySelector('.use-mouse')?.addEventListener('click', options.onUseMouse);
  root.querySelector('.watch-demo')?.addEventListener('click', options.onWatchDemo);
}
