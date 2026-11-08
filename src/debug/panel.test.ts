// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createDebugPanel, type DebugPanel } from './panel';
import type { FrameSample } from './stats';

/** A hand-cranked animation-frame scheduler, so tests control time. */
function manualFrames() {
  let pending: ((t: number) => void) | null = null;
  return {
    requestFrame: (cb: (t: number) => void) => {
      pending = cb;
      return 1;
    },
    cancelFrame: () => {
      pending = null;
    },
    /** Runs the pending frame callback at time `t`. */
    run(t: number) {
      const cb = pending;
      pending = null;
      cb?.(t);
    },
    get scheduled() {
      return pending !== null;
    },
  };
}

const sample = (over: Partial<FrameSample> = {}): FrameSample => ({
  detectMs: 12,
  gestureMs: 0.4,
  pose: 'point',
  confidence: 1,
  timestamp: 0,
  ...over,
});

let panel: DebugPanel | null = null;

function setup() {
  document.body.innerHTML = '';
  const parent = document.createElement('div');
  document.body.append(parent);
  const frames = manualFrames();
  panel = createDebugPanel(parent, frames);
  const toggle = parent.querySelector<HTMLButtonElement>('.debug-toggle')!;
  const body = parent.querySelector<HTMLElement>('.debug-body')!;
  return { parent, frames, panel, toggle, body };
}

const pressD = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

afterEach(() => {
  panel?.destroy();
  panel = null;
});

describe('debug panel', () => {
  it('starts collapsed, with a small toggle button', () => {
    const { toggle, body } = setup();
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
  });

  it('opens and closes with the button and the D key', () => {
    const { toggle, body } = setup();
    toggle.click();
    expect(body.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    pressD();
    expect(body.hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'D' }));
    expect(body.hidden).toBe(false);
  });

  it('ignores D with a modifier and D typed into a text field', () => {
    const { body } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true }));
    expect(body.hidden).toBe(true);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(body.hidden).toBe(true);
  });

  it('shows live numbers, pose and tracker status once open', () => {
    const { toggle, body, frames, panel } = setup();
    toggle.click();
    panel.setTrackerStatus('GPU · 640×480');
    for (let i = 0; i <= 30; i++) panel.record(sample({ timestamp: i * (1000 / 30), pose: 'pinch', confidence: 0.75 }));
    for (let i = 0; i <= 60; i++) frames.run(i * (1000 / 60));
    const text = body.textContent ?? '';
    expect(text).toContain('pinch');
    expect(text).toContain('0.75');
    expect(text).toContain('30');
    expect(text).toContain('60');
    expect(text).toContain('12.0');
    expect(text).toContain('GPU · 640×480');
  });

  it('follows the pose as it changes', () => {
    const { toggle, body, frames, panel } = setup();
    toggle.click();
    panel.record(sample({ pose: 'point' }));
    frames.run(1000);
    expect(body.querySelector('[data-field="pose"]')!.textContent).toBe('point');
    panel.record(sample({ pose: 'pinch' }));
    frames.run(2000);
    expect(body.querySelector('[data-field="pose"]')!.textContent).toBe('pinch');
  });

  it('makes no DOM writes while collapsed', async () => {
    const { parent, frames, panel } = setup();
    const observer = new MutationObserver(() => {});
    observer.observe(parent, { subtree: true, childList: true, characterData: true, attributes: true });
    panel.setTrackerStatus('CPU · 640×480');
    for (let i = 0; i < 60; i++) {
      panel.record(sample({ timestamp: i * 33 }));
      frames.run(i * 1000);
    }
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });

  it('leaves slots for the classifier toggle and the performance-mode badge', () => {
    const { body } = setup();
    expect(body.querySelector('.debug-slot-classifier')).not.toBeNull();
    expect(body.querySelector('.debug-slot-perf')).not.toBeNull();
  });

  it('shows a performance-mode badge in its slot while one is set', () => {
    const { body, panel } = setup();
    const slot = body.querySelector('.debug-slot-perf')!;
    expect(slot.textContent).toBe('');
    panel.setPerformanceMode('Performance mode: every other frame');
    expect(slot.querySelector('.perf-badge')?.textContent).toBe('Performance mode: every other frame');
    panel.setPerformanceMode(null);
    expect(slot.textContent).toBe('');
  });

  it('destroy removes the panel, the key listener and the frame loop', () => {
    const { parent, frames, panel, body } = setup();
    panel.destroy();
    expect(parent.querySelector('.debug-panel')).toBeNull();
    expect(frames.scheduled).toBe(false);
    pressD();
    expect(body.hidden).toBe(true);
  });
});
