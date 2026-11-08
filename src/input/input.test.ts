// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GestureEvent, GestureOutput } from '../gestures/gestures';
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

  it('maps the arrow keys to next and prev', () => {
    const { actions } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(actions).toEqual([
      { type: 'next', source: 'keyboard' },
      { type: 'prev', source: 'keyboard' },
    ]);
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
