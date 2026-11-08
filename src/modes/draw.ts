// Air Draw (PRD §4.5): press = pen down, release = pen up, lines follow the cursor.
// All logic is in the pure `drawReduce`; the mode below only renders state to a canvas and DOM.
import type { Action } from '../input/input';
import { addBackButton, type Mode, type Nav } from './modes';

export const PALETTE = ['#5ee6b5', '#ff6b6b', '#ffd166', '#4dabf7', '#f8f9fa'] as const;
export const PALETTE_NAMES = ['Green', 'Red', 'Yellow', 'Blue', 'White'] as const;

/** Points are normalised (0..1) within the stage. */
export interface Stroke {
  color: string;
  points: ReadonlyArray<{ x: number; y: number }>;
}

export interface DrawState {
  strokes: readonly Stroke[];
  penDown: boolean;
  /** Index into PALETTE. */
  color: number;
}

export const INITIAL_DRAW_STATE: DrawState = { strokes: [], penDown: false, color: 0 };

/** Adds a point to the last (open) stroke. */
function extend(state: DrawState, x: number, y: number): DrawState {
  const last = state.strokes[state.strokes.length - 1];
  if (!last) return state;
  return { ...state, strokes: [...state.strokes.slice(0, -1), { ...last, points: [...last.points, { x, y }] }] };
}

export function drawReduce(state: DrawState, action: Action): DrawState {
  switch (action.type) {
    case 'press':
      return {
        ...state,
        penDown: true,
        strokes: [...state.strokes, { color: PALETTE[state.color] ?? PALETTE[0], points: [{ x: action.x, y: action.y }] }],
      };
    case 'pointer-move':
      return state.penDown ? extend(state, action.x, action.y) : state;
    case 'release': {
      if (!state.penDown) return state;
      const last = state.strokes[state.strokes.length - 1]?.points.at(-1);
      const moved = !last || last.x !== action.x || last.y !== action.y;
      return { ...(moved ? extend(state, action.x, action.y) : state), penDown: false };
    }
    case 'select':
      return action.index >= 0 && action.index < PALETTE.length ? { ...state, color: action.index } : state;
    case 'clear':
      return { ...state, strokes: [], penDown: false };
    default:
      return state;
  }
}

/** True if a stage point is over one of the mode's buttons, so pressing it shouldn't start a stroke. */
function overControl(el: HTMLElement, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  const hit = el.ownerDocument.elementFromPoint?.(r.left + x * r.width, r.top + y * r.height);
  return !!hit?.closest('button');
}

export function createDrawMode(nav: Nav): Mode {
  let state = INITIAL_DRAW_STATE;
  let root: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let swatches: HTMLButtonElement[] = [];
  let back: HTMLButtonElement | null = null;
  let resize: ResizeObserver | null = null;

  const render = () => {
    if (!root || !canvas) return;
    root.dataset.strokes = String(state.strokes.length);
    swatches.forEach((s, i) => s.setAttribute('aria-pressed', String(i === state.color)));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, w / 120);
    for (const stroke of state.strokes) {
      const [first, ...rest] = stroke.points;
      if (!first) continue;
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(first.x * w, first.y * h);
      // A single point still shows as a dot.
      if (rest.length === 0) ctx.lineTo(first.x * w + 0.01, first.y * h);
      for (const p of rest) ctx.lineTo(p.x * w, p.y * h);
      ctx.stroke();
    }
  };

  const dispatch = (action: Action) => {
    const next = drawReduce(state, action);
    if (next === state) return;
    state = next;
    render();
  };

  return {
    mount(el) {
      root = document.createElement('div');
      root.className = 'draw-mode';
      canvas = document.createElement('canvas');
      canvas.className = 'draw-canvas';
      canvas.setAttribute('aria-label', 'Drawing');
      const toolbar = document.createElement('div');
      toolbar.className = 'draw-toolbar';
      swatches = PALETTE.map((color, index) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.style.setProperty('--swatch', color);
        b.setAttribute('aria-label', `${PALETTE_NAMES[index]} (${index + 1})`);
        b.addEventListener('click', () => dispatch({ type: 'select', index, source: 'mouse' }));
        return b;
      });
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'secondary draw-clear';
      clear.textContent = 'Clear';
      clear.addEventListener('click', () => dispatch({ type: 'clear', source: 'mouse' }));
      toolbar.append(...swatches, clear);
      root.append(canvas, toolbar);
      el.append(root);
      back = addBackButton(el, nav);

      const fit = () => {
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        const dpr = globalThis.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(r.width * dpr));
        canvas.height = Math.max(1, Math.round(r.height * dpr));
        render();
      };
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(fit);
        resize.observe(canvas);
      }
      fit();
    },

    unmount() {
      resize?.disconnect();
      root?.remove();
      back?.remove();
      root = canvas = back = resize = null;
      swatches = [];
    },

    handle(action) {
      // Clicking a swatch or Clear also arrives here as a press; don't leave a dot under the button.
      if (action.type === 'press' && root && overControl(root, action.x, action.y)) return;
      dispatch(action);
    },

    tick() {},
  };
}
