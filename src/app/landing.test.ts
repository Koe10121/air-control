// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderLanding } from './landing';

describe('renderLanding', () => {
  it('shows a "Try it" button', () => {
    const root = document.createElement('div');
    renderLanding(root, { onTryIt: () => {} });

    const button = root.querySelector('button');
    expect(button?.textContent).toBe('Try it');
  });

  it('states that video never leaves the device', () => {
    const root = document.createElement('div');
    renderLanding(root, { onTryIt: () => {} });

    expect(root.textContent).toContain('Video never leaves your device.');
  });

  it('calls onTryIt when the button is clicked', () => {
    const root = document.createElement('div');
    const onTryIt = vi.fn();
    renderLanding(root, { onTryIt });

    root.querySelector('button')?.click();

    expect(onTryIt).toHaveBeenCalledOnce();
  });
});
