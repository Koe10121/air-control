// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderLiveView, renderMouseStage } from './overlay';

describe('renderLiveView controls', () => {
  it('has a Stop camera button that calls onStop', () => {
    const root = document.createElement('div');
    const onStop = vi.fn();
    renderLiveView(root, () => null, { onStop });
    const button = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Stop camera');
    button?.click();
    expect(onStop).toHaveBeenCalledOnce();
  });
});

describe('renderLiveView in demo mode', () => {
  it('labels the stop button with stopLabel', () => {
    const root = document.createElement('div');
    const onStop = vi.fn();
    renderLiveView(root, () => null, { onStop, stopLabel: 'Stop demo' });
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Stop demo')?.click();
    expect(onStop).toHaveBeenCalledOnce();
  });
});

describe('renderMouseStage', () => {
  it('shows an empty stage without a camera canvas, with a way back', () => {
    const root = document.createElement('div');
    const onExit = vi.fn();
    renderMouseStage(root, { onExit });
    expect(root.querySelector('.stage')).not.toBeNull();
    expect(root.querySelector('canvas')).toBeNull();
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Back')?.click();
    expect(onExit).toHaveBeenCalledOnce();
  });
});

describe('renderLiveView cursor dot', () => {
  it('positions the dot from a normalised cursor and fades it out (keeping its last spot) when the hand is lost', () => {
    const root = document.createElement('div');
    const view = renderLiveView(root, () => null, { onStop: vi.fn() });
    const dot = root.querySelector<HTMLElement>('.cursor-dot')!;
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('visible')).toBe(false);

    view.setCursor({ x: 0.25, y: 0.75 });
    expect(dot.classList.contains('visible')).toBe(true);
    expect(dot.style.left).toBe('25%');
    expect(dot.style.top).toBe('75%');

    view.setCursor(null);
    expect(dot.classList.contains('visible')).toBe(false);
    expect(dot.style.left).toBe('25%');
  });
});

describe('mode layer', () => {
  it('is an empty layer inside the live stage, below the cursor', () => {
    const root = document.createElement('div');
    const view = renderLiveView(root, () => null, { onStop: vi.fn() });
    expect(view.stage.contains(view.layer)).toBe(true);
    expect(view.layer.childElementCount).toBe(0);
    const dot = root.querySelector('.cursor-dot')!;
    expect(view.layer.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector('.test-counter')).toBeNull();
  });

  it('is on the mouse stage too', () => {
    const root = document.createElement('div');
    const { stage, layer } = renderMouseStage(root, { onExit: vi.fn() });
    expect(stage.contains(layer)).toBe(true);
  });
});

describe('renderLiveView hold ring', () => {
  it('shows hold progress on the cursor, tagged with the gesture it will fire, and hides it with no hold', () => {
    const root = document.createElement('div');
    const view = renderLiveView(root, () => null, { onStop: vi.fn() });
    const dot = root.querySelector<HTMLElement>('.cursor-dot')!;
    expect(dot.classList.contains('holding')).toBe(false);
    view.setHold({ gesture: 'clear', progress: 0.4 });
    expect(dot.classList.contains('holding')).toBe(true);
    expect(dot.dataset.hold).toBe('clear');
    expect(dot.style.getPropertyValue('--hold')).toBe('0.4');
    view.setHold(null);
    expect(dot.classList.contains('holding')).toBe(false);
    expect(dot.style.getPropertyValue('--hold')).toBe('0');
  });
});

describe('renderLiveView pinch ring', () => {
  it('closes the ring with the pinch and marks the press', () => {
    const root = document.createElement('div');
    const view = renderLiveView(root, () => null, { onStop: vi.fn() });
    const dot = root.querySelector<HTMLElement>('.cursor-dot')!;
    view.setPinch(0.5, false);
    expect(dot.style.getPropertyValue('--pinch')).toBe('0.5');
    expect(dot.classList.contains('pressed')).toBe(false);
    view.setPinch(1, true);
    expect(dot.classList.contains('pressed')).toBe(true);
  });
});
