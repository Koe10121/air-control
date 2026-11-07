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
