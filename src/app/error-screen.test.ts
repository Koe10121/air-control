// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { TrackerErrorKind } from '../tracker/tracker';
import { renderErrorScreen } from './error-screen';

const kinds: TrackerErrorKind[] = ['denied', 'no-camera', 'in-use', 'unsupported', 'model-load-failed'];

describe('renderErrorScreen', () => {
  it.each(kinds)('%s: shows a heading and a "Use mouse instead" button that calls onUseMouse', (kind) => {
    const root = document.createElement('div');
    const onUseMouse = vi.fn();
    renderErrorScreen(root, kind, { onUseMouse, onRetry: () => {}, onWatchDemo: () => {} });

    expect(root.querySelector('h1')?.textContent).toBeTruthy();
    const button = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Use mouse instead');
    button?.click();
    expect(onUseMouse).toHaveBeenCalledOnce();
  });

  it('gives each kind its own message', () => {
    const headings = kinds.map((kind) => {
      const root = document.createElement('div');
      renderErrorScreen(root, kind, { onUseMouse: () => {}, onRetry: () => {}, onWatchDemo: () => {} });
      return root.querySelector('h1')?.textContent;
    });
    expect(new Set(headings).size).toBe(kinds.length);
  });

  it('denied: explains how to re-enable the camera in Chrome or Edge', () => {
    const root = document.createElement('div');
    renderErrorScreen(root, 'denied', { onUseMouse: () => {}, onRetry: () => {}, onWatchDemo: () => {} });
    expect(root.textContent).toMatch(/Chrome/);
    expect(root.textContent).toMatch(/Edge/);
  });

  it('has a "Try again" button that calls onRetry', () => {
    const root = document.createElement('div');
    const onRetry = vi.fn();
    renderErrorScreen(root, 'in-use', { onUseMouse: () => {}, onRetry, onWatchDemo: () => {} });
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Try again')?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each(kinds)('%s: has a "Watch a demo" button that calls onWatchDemo', (kind) => {
    const root = document.createElement('div');
    const onWatchDemo = vi.fn();
    renderErrorScreen(root, kind, { onUseMouse: () => {}, onRetry: () => {}, onWatchDemo });
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Watch a demo')?.click();
    expect(onWatchDemo).toHaveBeenCalledOnce();
  });
});
