// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MENU_ENTRIES } from '../modes/modes';
import type { HandFrame } from '../tracker/tracker';
import type { DatasetV1 } from './recorder';
import { createRecordMode } from './record-mode';

const frame = (timestamp: number): HandFrame => ({
  handedness: 'Left',
  timestamp,
  landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
});

function setup() {
  const listeners = new Set<(f: HandFrame | null) => void>();
  const subscribe = (cb: (f: HandFrame | null) => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  const emit = (f: HandFrame | null) => listeners.forEach((cb) => cb(f));
  const download = vi.fn<(filename: string, data: DatasetV1) => void>();
  const nav = { open: vi.fn(() => true) };
  const el = document.createElement('div');
  const mode = createRecordMode(nav, { subscribe, download });
  mode.mount(el);
  const q = <T extends Element>(sel: string) => el.querySelector<T>(sel)!;
  const set = (name: string, value: string) => {
    const input = q<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { el, mode, emit, download, nav, listeners, q, set };
}

describe('record mode', () => {
  it('is hidden from the mode menu', () => {
    expect(MENU_ENTRIES.map((e) => e.name)).not.toContain('record');
  });

  it('records a clip after a 3 s countdown, lists it, and exports schema v1 locally', () => {
    const { el, mode, emit, download, q, set } = setup();
    set('label', 'fist');
    set('participant', 'p02');
    set('lighting', 'dim');
    set('session', 'evening');
    q<HTMLButtonElement>('.record-button').click();
    expect(el.textContent).toContain('3');
    mode.tick(3000);
    for (let t = 0; t < 1000; t += 100) {
      emit(frame(t));
      mode.tick(100);
    }
    expect(q('.record-count').textContent).toContain('10');
    mode.tick(9000);
    expect(q('.record-clips').textContent).toMatch(/fist.*10/);

    q<HTMLButtonElement>('.record-export').click();
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, data] = download.mock.calls[0]!;
    expect(filename).toMatch(/^air-control-p02-evening.*\.json$/);
    expect(data.schemaVersion).toBe(1);
    expect(data.samples).toHaveLength(10);
    expect(data.samples[0]).toMatchObject({ label: 'fist', participant: 'p02', lighting: 'dim', session: 'evening', handedness: 'Left' });
  });

  it('disables Record while a clip runs, and Export until a clip exists', () => {
    const { mode, q } = setup();
    const record = q<HTMLButtonElement>('.record-button');
    expect(q<HTMLButtonElement>('.record-export').disabled).toBe(true);
    record.click();
    mode.tick(16);
    expect(record.disabled).toBe(true);
  });

  it('shows the tips for the none class', () => {
    const { el, set } = setup();
    set('label', 'none');
    expect(el.textContent).toMatch(/fidget, scratch, hold a mug, move between poses/);
    set('label', 'pinch');
    expect(el.textContent).not.toMatch(/fidget/);
  });

  it('shows a bad participant ID instead of recording', () => {
    const { el, mode, set, q } = setup();
    set('participant', 'bob');
    q<HTMLButtonElement>('.record-button').click();
    mode.tick(16);
    expect(el.textContent).toMatch(/p01/);
    expect(q<HTMLButtonElement>('.record-button').disabled).toBe(false);
  });

  it('stops listening to frames on unmount', () => {
    const { mode, listeners } = setup();
    expect(listeners.size).toBe(1);
    mode.unmount();
    expect(listeners.size).toBe(0);
  });
});
