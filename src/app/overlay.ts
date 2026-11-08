// Live view: mirrored webcam video with the hand skeleton and a tracking-FPS counter on top.
// Without a video (fixture playback) the skeleton is drawn over a neutral background.
import { createFpsCounter } from '../debug/stats';
import { VIDEO_HEIGHT, VIDEO_WIDTH, type HandFrame, type Landmark } from '../tracker/tracker';

/** Bones between MediaPipe's 21 hand landmarks (wrist = 0, thumb 1–4, index 5–8, … pinky 17–20). */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/** Maps a normalised landmark to canvas pixels; `mirror` flips x to match a mirrored video. */
export function toCanvasPoint(
  p: Landmark,
  width: number,
  height: number,
  mirror: boolean,
): { x: number; y: number } {
  return { x: (mirror ? 1 - p.x : p.x) * width, y: p.y * height };
}

export interface LiveView {
  /** Redraws video + skeleton for the latest tracking frame. */
  draw(frame: HandFrame | null): void;
  /** Shows a status line (e.g. "Loading hand model…"); empty string hides it. */
  setStatus(text: string): void;
  /** Moves the cursor dot to a normalised (0..1) stage position; null fades it out where it is. */
  setCursor(cursor: { x: number; y: number } | null): void;
  /** Closes the ring around the cursor: 0 = open hand, 1 = fully pinched. `pressed` marks a press. */
  setPinch(amount: number, pressed: boolean): void;
  /** The stage element: the root for input and hit-testing. */
  readonly stage: HTMLElement;
}

const TEST_COUNTER = '<button type="button" class="test-counter">Clicked 0 times</button>';

/** Temporary (issue 007): a button that counts its clicks, to try pinch-click on. */
function wireTestCounter(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>('.test-counter')!;
  let count = 0;
  button.addEventListener('click', () => {
    count++;
    button.textContent = `Clicked ${count} time${count === 1 ? '' : 's'}`;
  });
}

export interface LiveViewOptions {
  /** Called when the visitor clicks the stop button. */
  onStop: () => void;
  /** Stop button text; defaults to "Stop camera". */
  stopLabel?: string;
}

/** Renders the live view into `root`, replacing its contents. */
export function renderLiveView(
  root: HTMLElement,
  video: () => HTMLVideoElement | null,
  { onStop, stopLabel = 'Stop camera' }: LiveViewOptions,
): LiveView {
  root.innerHTML = `
    <main class="live">
      <div class="stage">
        <canvas class="overlay" aria-label="Mirrored view with hand skeleton"></canvas>
        ${TEST_COUNTER}
        <div class="cursor-dot" aria-hidden="true"><div class="cursor-ring"></div></div>
        <p class="live-status" role="status"></p>
        <button type="button" class="secondary stage-button stop-camera"></button>
      </div>
    </main>
  `;
  const stopButton = root.querySelector<HTMLButtonElement>('.stop-camera')!;
  stopButton.textContent = stopLabel;
  stopButton.addEventListener('click', onStop);
  const canvas = root.querySelector<HTMLCanvasElement>('canvas.overlay')!;
  const statusEl = root.querySelector<HTMLParagraphElement>('.live-status')!;
  const dot = root.querySelector<HTMLDivElement>('.cursor-dot')!;
  const ctx = canvas.getContext('2d');
  const fps = createFpsCounter();
  wireTestCounter(root);

  return {
    stage: root.querySelector<HTMLElement>('.stage')!,

    setPinch(amount, pressed) {
      dot.style.setProperty('--pinch', String(amount));
      dot.classList.toggle('pressed', pressed);
    },

    setStatus(text) {
      statusEl.textContent = text;
      statusEl.hidden = text === '';
    },

    setCursor(cursor) {
      // The fade-out (about 300 ms) is a CSS transition on opacity; position is kept so it fades in place.
      dot.classList.toggle('visible', cursor !== null);
      if (!cursor) return;
      dot.style.left = `${cursor.x * 100}%`;
      dot.style.top = `${cursor.y * 100}%`;
    },

    draw(frame) {
      const v = video();
      if (!ctx || (v && v.videoWidth === 0)) return;
      fps.tick(performance.now());
      const w = v ? v.videoWidth : VIDEO_WIDTH;
      const h = v ? v.videoHeight : VIDEO_HEIGHT;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      if (v) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(v, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#1b2029';
        ctx.fillRect(0, 0, w, h);
      }

      if (frame) {
        const pts = frame.landmarks.map((p) => toCanvasPoint(p, w, h, true));
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#5ee6b5';
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = pts[a];
          const pb = pts[b];
          if (!pa || !pb) continue;
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const label = `${fps.value().toFixed(0)} FPS`;
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(14, 17, 22, 0.7)';
      ctx.fillRect(8, 8, ctx.measureText(label).width + 16, 30);
      ctx.fillStyle = '#e8ecf1';
      ctx.fillText(label, 16, 29);
    },
  };
}

/** The app without a camera: an empty stage driven by the normal mouse pointer. */
export function renderMouseStage(root: HTMLElement, { onExit }: { onExit: () => void }): void {
  root.innerHTML = `
    <main class="live">
      <div class="stage mouse-stage">
        <p class="live-status" role="status">Mouse mode: no camera in use.</p>
        ${TEST_COUNTER}
        <button type="button" class="secondary stage-button back">Back</button>
      </div>
    </main>
  `;
  wireTestCounter(root);
  root.querySelector('.back')?.addEventListener('click', onExit);
}
