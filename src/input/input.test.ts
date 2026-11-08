// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGestureEngine, DEFAULT_GESTURE_CONFIG, type GestureEvent, type GestureOutput } from '../gestures/gestures';
import { parseFixture } from '../tracker/fixture';
import { createInput, type Action, type Input } from './input';

/** A 400×200 root at (100, 50), with one button. jsdom has no layout, so the rect and hit test are stubbed. */
function setup() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  const button = document.createElement('button');
  button.textContent = 'Count';
  const other = document.createElement('span');
  root.append(button, other);
  document.body.append(root);
  root.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200 }) as DOMRect;
  // Left half of the root is the button, right half is the span.
  const hitTest = (x: number) => (x < 300 ? button : other);
  const input = createInput(root, { hitTest });
  const actions: Action[] = [];
  input.onAction((a) => actions.push(a));
  inputs.push(input);
  return { root, button, input, actions };
}

const inputs: Input[] = [];
afterEach(() => inputs.splice(0).forEach((i) => i.destroy()));

const gesture = (x: number | null, y: number, events: GestureEvent[] = []): GestureOutput => ({
  cursor: x === null ? null : { x, y },
  pose: 'point',
  confidence: 1,
  events,
  pinch: 0,
  pressed: false,
  hold: null,
});

const mouse = (target: Element, type: string, clientX: number, clientY: number) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY }));

const withoutSource = (actions: Action[]) => actions.map(({ source: _, ...rest }) => rest);

describe('createInput: one action stream', () => {
  it('a gesture click and a mouse click at the same spot produce the same actions', () => {
    const g = setup();
    g.input.push(gesture(0.25, 0.5));
    g.input.push(gesture(0.25, 0.5, ['press']));
    g.input.push(gesture(0.25, 0.5, ['release', 'click']));

    const m = setup();
    // (0.25, 0.5) of a 400×200 root at (100, 50) is client (200, 150).
    mouse(m.button, 'mousemove', 200, 150);
    mouse(m.button, 'mousedown', 200, 150);
    mouse(m.button, 'mouseup', 200, 150);
    mouse(m.button, 'click', 200, 150);

    expect(withoutSource(g.actions)).toEqual(withoutSource(m.actions));
    expect(withoutSource(g.actions)).toEqual([
      { type: 'pointer-move', x: 0.25, y: 0.5 },
      { type: 'press', x: 0.25, y: 0.5 },
      { type: 'release', x: 0.25, y: 0.5 },
      { type: 'click', x: 0.25, y: 0.5 },
    ]);
    expect(g.actions.every((a) => a.source === 'gesture')).toBe(true);
    expect(m.actions.every((a) => a.source === 'mouse')).toBe(true);
  });

  it('a release after the hand is lost uses the last known cursor position', () => {
    const { input, actions } = setup();
    input.push(gesture(0.25, 0.5, ['press']));
    input.push(gesture(null, 0, ['release']));
    expect(actions.at(-1)).toEqual({ type: 'release', x: 0.25, y: 0.5, source: 'gesture' });
  });

  it('keeps the press position through a tracking dropout, so a later release still arrives', () => {
    const { input, actions } = setup();
    input.push(gesture(0.25, 0.5, ['press']));
    // The engine keeps the press while the hand is briefly missing: no cursor, still pressed.
    input.push({ ...gesture(null, 0), pressed: true });
    input.push({ ...gesture(null, 0), pressed: true });
    input.push(gesture(null, 0, ['release']));
    expect(actions.at(-1)).toEqual({ type: 'release', x: 0.25, y: 0.5, source: 'gesture' });
  });

  it('maps the arrow keys to next and prev', () => {
    const { actions } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(actions).toEqual([
      { type: 'next', source: 'keyboard' },
      { type: 'prev', source: 'keyboard' },
    ]);
  });

  it('maps digit keys to select (0-based) and C to clear', () => {
    const { actions } = setup();
    for (const key of ['1', '5', 'c', 'C']) document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(actions).toEqual([
      { type: 'select', index: 0, source: 'keyboard' },
      { type: 'select', index: 4, source: 'keyboard' },
      { type: 'clear', source: 'keyboard' },
      { type: 'clear', source: 'keyboard' },
    ]);
  });

  it('maps Space to pause, and stops the page scrolling', () => {
    const { actions } = setup();
    const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    document.dispatchEvent(e);
    expect(actions).toEqual([{ type: 'pause', source: 'keyboard' }]);
    expect(e.defaultPrevented).toBe(true);
  });

  it('leaves Space alone on a focused button, so it still presses the button', () => {
    const { button, actions } = setup();
    const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true });
    button.dispatchEvent(e);
    expect(actions).toEqual([]);
    expect(e.defaultPrevented).toBe(false);
  });

  it('maps the hold gestures to clear and pause', () => {
    const { input, actions } = setup();
    input.push(gesture(0.25, 0.5, ['clear']));
    input.push(gesture(0.25, 0.5, ['pause']));
    expect(actions.filter((a) => a.type !== 'pointer-move')).toEqual([
      { type: 'clear', source: 'gesture' },
      { type: 'pause', source: 'gesture' },
    ]);
  });

  it('maps swipe-right to next and swipe-left to prev (point the way you want to go)', () => {
    const { input, actions } = setup();
    input.push(gesture(0.25, 0.5, ['swipe-right']));
    input.push(gesture(0.25, 0.5, ['swipe-left']));
    expect(actions.filter((a) => a.type !== 'pointer-move')).toEqual([
      { type: 'next', source: 'gesture' },
      { type: 'prev', source: 'gesture' },
    ]);
  });

  it('ignores shortcut keys typed with a modifier (e.g. Ctrl+C)', () => {
    const { actions } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true }));
    expect(actions).toEqual([]);
  });

  it('stops listening after destroy', () => {
    const { root, input, actions } = setup();
    input.destroy();
    mouse(root, 'click', 200, 150);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(actions).toEqual([]);
  });
});

describe('createInput: virtual pointer', () => {
  it('clicks the real button under the hand cursor, once', () => {
    const { button, input, actions } = setup();
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    input.push(gesture(0.25, 0.5, ['press']));
    input.push(gesture(0.25, 0.5, ['release', 'click']));
    expect(onClick).toHaveBeenCalledOnce();
    // The synthetic DOM click is not reported a second time as a mouse click.
    expect(actions.filter((a) => a.type === 'click')).toHaveLength(1);
  });

  it('does not click the button when the cursor is elsewhere', () => {
    const { button, input } = setup();
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    input.push(gesture(0.75, 0.5, ['release', 'click']));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('highlights the button under the cursor, and clears it when the cursor leaves or the hand is lost', () => {
    const { button, input } = setup();
    input.push(gesture(0.25, 0.5));
    expect(button.classList.contains('hand-hover')).toBe(true);
    input.push(gesture(0.75, 0.5));
    expect(button.classList.contains('hand-hover')).toBe(false);
    input.push(gesture(0.25, 0.5));
    input.push(gesture(null, 0));
    expect(button.classList.contains('hand-hover')).toBe(false);
  });

  it('focuses the button on press', () => {
    const { button, input } = setup();
    input.push(gesture(0.25, 0.5, ['press']));
    expect(document.activeElement).toBe(button);
  });
});

describe('createInput: swipe fixtures through the gesture engine', () => {
  /** The next/prev actions from replaying a fixture through the engine (swipes on) and input. */
  function navActions(name: string) {
    const { input, actions } = setup();
    const { frames } = parseFixture(JSON.parse(readFileSync(`public/fixtures/${name}.json`, 'utf8')));
    const engine = createGestureEngine({ ...DEFAULT_GESTURE_CONFIG, swipes: true });
    let prev = -Infinity;
    for (const frame of frames) {
      if (frame.timestamp - prev > 200) input.push(engine.update(null));
      input.push(engine.update(frame));
      prev = frame.timestamp;
    }
    input.push(engine.update(null));
    return actions.filter((a) => a.type === 'next' || a.type === 'prev').map((a) => a.type);
  }

  it('swipe-right gives exactly 1 next', () => {
    expect(navActions('swipe-right')).toEqual(['next']);
  });

  it('swipe-left gives exactly 1 prev', () => {
    expect(navActions('swipe-left')).toEqual(['prev']);
  });

  it('fidget-10s gives no next or prev', () => {
    expect(navActions('fidget-10s')).toEqual([]);
  });
});
