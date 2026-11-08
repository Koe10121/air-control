// debug panel (PRD §4.7): a collapsible stats overlay, toggled with the D key or its button.
// The numbers come from the pure stats core; this file only owns the DOM and the frame loop.
// While collapsed the panel counts frames but never touches the DOM.
import { createDebugStats, type FrameSample } from './stats';

/** How often the open panel rewrites its numbers. */
const REFRESH_MS = 250;

export interface DebugPanel {
  /** Call once per tracker frame. */
  record(sample: FrameSample): void;
  /** Tracker details, e.g. "GPU · 640×480". */
  setTrackerStatus(text: string): void;
  /** Removes the panel, its key listener and its frame loop. */
  destroy(): void;
}

export interface FrameScheduler {
  requestFrame(cb: (timestamp: number) => void): number;
  cancelFrame(id: number): void;
}

const browserFrames: FrameScheduler = {
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

const ROWS: ReadonlyArray<readonly [field: string, label: string]> = [
  ['tracking-fps', 'Tracking FPS'],
  ['render-fps', 'Render FPS'],
  ['detect', 'Detect p50 / p95'],
  ['gesture', 'Gesture p50 / p95'],
  ['pose', 'Pose'],
  ['confidence', 'Confidence'],
  ['tracker', 'Tracker'],
];

const ms = (v: number) => `${v.toFixed(1)} ms`;

/** Mounts a collapsed debug panel into `parent`. */
export function createDebugPanel(parent: HTMLElement, frames: FrameScheduler = browserFrames): DebugPanel {
  const stats = createDebugStats();
  const el = document.createElement('aside');
  el.className = 'debug-panel';
  el.innerHTML = `
    <button type="button" class="debug-toggle" aria-expanded="false" title="Debug panel (D)">Debug</button>
    <div class="debug-body" hidden>
      <dl>
        ${ROWS.map(([field, label]) => `<dt>${label}</dt><dd data-field="${field}"></dd>`).join('')}
      </dl>
      <div class="debug-slot-classifier"></div>
      <div class="debug-slot-perf"></div>
    </div>
  `;
  parent.append(el);
  const toggle = el.querySelector<HTMLButtonElement>('.debug-toggle')!;
  const body = el.querySelector<HTMLElement>('.debug-body')!;
  const fields = new Map(ROWS.map(([field]) => [field, body.querySelector<HTMLElement>(`[data-field="${field}"]`)!]));
  const write = (field: string, text: string) => {
    const node = fields.get(field)!;
    if (node.textContent !== text) node.textContent = text;
  };

  let open = false;
  let trackerStatus = '–';
  let lastRefresh = -Infinity;
  let rafId = 0;

  const refresh = () => {
    const s = stats.snapshot();
    write('tracking-fps', s.trackingFps.toFixed(0));
    write('render-fps', s.renderFps.toFixed(0));
    write('detect', `${ms(s.detect.p50)} / ${ms(s.detect.p95)}`);
    write('gesture', `${ms(s.gesture.p50)} / ${ms(s.gesture.p95)}`);
    write('pose', s.pose);
    write('confidence', s.confidence.toFixed(2));
    write('tracker', trackerStatus);
  };

  const setOpen = (value: boolean) => {
    open = value;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) refresh();
  };

  const loop = (t: number) => {
    stats.renderTick(t);
    if (open && t - lastRefresh >= REFRESH_MS) {
      lastRefresh = t;
      refresh();
    }
    rafId = frames.requestFrame(loop);
  };
  rafId = frames.requestFrame(loop);

  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'd' || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    setOpen(!open);
  };
  document.addEventListener('keydown', onKey);
  toggle.addEventListener('click', () => setOpen(!open));

  return {
    record(sample) {
      stats.record(sample);
    },
    setTrackerStatus(text) {
      trackerStatus = text;
    },
    destroy() {
      frames.cancelFrame(rafId);
      document.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
