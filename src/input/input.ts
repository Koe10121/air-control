// input: gestures, mouse and keyboard → one stream of app actions (PRD §4.4).
// The virtual pointer makes ordinary <button>s work by hand: it hit-tests the element under the
// hand cursor, highlights it, focuses it on press and clicks it on click. Modes never see the source.
import type { GestureOutput } from '../gestures/gestures';

export type ActionSource = 'gesture' | 'mouse' | 'keyboard';

/** Positions are normalised (0..1) within the input root. */
export type Action =
  | { type: 'pointer-move' | 'press' | 'release' | 'click'; x: number; y: number; source: ActionSource }
  | { type: 'next' | 'prev' | 'pause' | 'clear'; source: ActionSource }
  /** Digit keys 1–9 → index 0–8 (e.g. a Draw colour). */
  | { type: 'select'; index: number; source: ActionSource };

export interface Input {
  /** Feed the gesture engine's output for one frame. */
  push(out: GestureOutput): void;
  /** Subscribe to actions. Returns an unsubscribe. */
  onAction(cb: (action: Action) => void): () => void;
  /** Removes the mouse and keyboard listeners and any hover highlight. */
  destroy(): void;
}

export interface InputOptions {
  /** The element at a client point. Defaults to document.elementFromPoint (stubbed in tests). */
  hitTest?: (clientX: number, clientY: number) => Element | null;
}

/** What the virtual pointer can hover, focus and click. */
const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"]';
export const HOVER_CLASS = 'hand-hover';

const KEYS: Record<string, 'next' | 'prev'> = { ArrowRight: 'next', ArrowLeft: 'prev' };

export function createInput(root: HTMLElement, options: InputOptions = {}): Input {
  const doc = root.ownerDocument;
  const hitTest = options.hitTest ?? ((x, y) => doc.elementFromPoint(x, y));
  const listeners = new Set<(action: Action) => void>();
  const emit = (action: Action) => listeners.forEach((cb) => cb(action));

  let last: { x: number; y: number } | null = null;
  let hovered: HTMLElement | null = null;
  /** True while the virtual pointer dispatches a DOM click, so it isn't reported again as a mouse click. */
  let dispatching = false;

  const setHover = (el: HTMLElement | null) => {
    if (el === hovered) return;
    hovered?.classList.remove(HOVER_CLASS);
    hovered = el;
    hovered?.classList.add(HOVER_CLASS);
  };

  /** The interactive element under a normalised position, if it is inside the root. */
  const targetAt = (x: number, y: number): HTMLElement | null => {
    const r = root.getBoundingClientRect();
    const el = hitTest(r.left + x * r.width, r.top + y * r.height)?.closest<HTMLElement>(INTERACTIVE);
    return el && root.contains(el) ? el : null;
  };

  const toLocal = (e: MouseEvent) => {
    const r = root.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const mouseTypes = { mousemove: 'pointer-move', mousedown: 'press', mouseup: 'release', click: 'click' } as const;
  const onMouse = (e: MouseEvent) => {
    if (dispatching) return;
    emit({ type: mouseTypes[e.type as keyof typeof mouseTypes], ...toLocal(e), source: 'mouse' });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const type = KEYS[e.key];
    if (type) emit({ type, source: 'keyboard' });
    else if (/^[1-9]$/.test(e.key)) emit({ type: 'select', index: Number(e.key) - 1, source: 'keyboard' });
    else if (e.key.toLowerCase() === 'c') emit({ type: 'clear', source: 'keyboard' });
    else if (e.key === ' ') {
      // On a focused button (or field) Space keeps its normal job.
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      e.preventDefault(); // no page scroll
      emit({ type: 'pause', source: 'keyboard' });
    }
  };
  for (const type of Object.keys(mouseTypes)) root.addEventListener(type, onMouse as EventListener);
  doc.addEventListener('keydown', onKey);

  return {
    push(out) {
      if (out.cursor) {
        const { x, y } = out.cursor;
        if (!last || last.x !== x || last.y !== y) emit({ type: 'pointer-move', x, y, source: 'gesture' });
        last = { x, y };
        setHover(targetAt(x, y));
      } else {
        setHover(null);
      }
      if (!last) return;
      const at = { x: last.x, y: last.y, source: 'gesture' as const };
      for (const event of out.events) {
        if (event === 'press') {
          emit({ type: 'press', ...at });
          hovered?.focus();
        } else if (event === 'release') {
          emit({ type: 'release', ...at });
        } else if (event === 'click') {
          emit({ type: 'click', ...at });
          const target = out.cursor ? targetAt(out.cursor.x, out.cursor.y) : null;
          dispatching = true;
          try {
            target?.click();
          } finally {
            dispatching = false;
          }
        } else if (event === 'pause' || event === 'clear') {
          emit({ type: event, source: 'gesture' });
        } else if (event === 'swipe-left' || event === 'swipe-right') {
          // Point the way you want to go: hand to the right = next, like the → key and the Next button.
          emit({ type: event === 'swipe-right' ? 'next' : 'prev', source: 'gesture' });
        }
      }
      // While a press rides out a dropout, keep its position for the release.
      if (!out.cursor && !out.pressed) last = null;
    },

    onAction(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    destroy() {
      for (const type of Object.keys(mouseTypes)) root.removeEventListener(type, onMouse as EventListener);
      doc.removeEventListener('keydown', onKey);
      setHover(null);
      listeners.clear();
    },
  };
}
