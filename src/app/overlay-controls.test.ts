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
