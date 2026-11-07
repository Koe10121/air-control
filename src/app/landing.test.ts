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

  it('has a Privacy note: processing stays in the browser, nothing is uploaded, and the CSP enforces it', () => {
    const root = document.createElement('div');
    renderLanding(root, { onTryIt: () => {} });

    const note = root.querySelector('section[aria-labelledby="privacy-heading"]');
    expect(note?.querySelector('h2')?.textContent).toBe('Privacy');
    expect(note?.textContent).toContain('processed only in your browser');
    expect(note?.textContent).toContain('Nothing is uploaded');
    expect(note?.textContent).toContain('Content Security Policy');
  });

  it('calls onTryIt when the button is clicked', () => {
    const root = document.createElement('div');
    const onTryIt = vi.fn();
    renderLanding(root, { onTryIt });

    root.querySelector('button')?.click();

    expect(onTryIt).toHaveBeenCalledOnce();
  });
});
