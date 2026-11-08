// Recorder mode (`?mode=record`, PRD §4.8): a hidden page for collecting the gesture dataset.
// Not on the mode menu. Reads hand frames directly (not input actions) and saves landmarks only,
// as a local JSON download. Nothing leaves the device.
import { addBackButton, type Mode, type Nav } from '../modes/modes';
import type { HandFrame } from '../tracker/tracker';
import { createSessionRecorder, LABELS, LIGHTINGS, type ClipMeta, type DatasetV1 } from './recorder';

export type FrameSubscribe = (cb: (frame: HandFrame | null) => void) => () => void;

export interface RecordModeDeps {
  /** Live (or fixture) hand frames. */
  subscribe: FrameSubscribe;
  /** Saves the dataset on this device. Defaults to a browser download. */
  download?: (filename: string, data: DatasetV1) => void;
}

const NONE_TIPS = 'For "none": fidget, scratch, hold a mug, move between poses.';

/** Saves `data` as a JSON file through the browser's download, entirely client-side. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'record-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function select(name: string, options: readonly string[]): HTMLSelectElement {
  const el = document.createElement('select');
  el.name = name;
  for (const value of options) el.append(new Option(value, value));
  return el;
}

function textInput(name: string, value: string): HTMLInputElement {
  const el = document.createElement('input');
  el.name = name;
  el.value = value;
  el.autocomplete = 'off';
  el.spellcheck = false;
  return el;
}

export function createRecordMode(nav: Nav, { subscribe, download = downloadJson }: RecordModeDeps): Mode {
  const recorder = createSessionRecorder();
  let root: HTMLElement | null = null;
  let back: HTMLButtonElement | null = null;
  let unsubscribe: (() => void) | null = null;
  let render = () => {};

  return {
    mount(el) {
      root = document.createElement('div');
      root.className = 'record-mode';

      const panel = document.createElement('div');
      panel.className = 'record-panel';
      const heading = document.createElement('h2');
      heading.textContent = 'Recorder';
      const label = select('label', LABELS);
      const participant = textInput('participant', 'p01');
      const lighting = select('lighting', LIGHTINGS);
      const session = textInput('session', new Date().toISOString().slice(0, 10));
      const tips = document.createElement('p');
      tips.className = 'record-tips';
      const recordButton = document.createElement('button');
      recordButton.type = 'button';
      recordButton.className = 'record-button';
      recordButton.textContent = 'Record';
      const message = document.createElement('p');
      message.className = 'record-message';
      message.setAttribute('role', 'status');
      const count = document.createElement('p');
      count.className = 'record-count';
      const clips = document.createElement('ol');
      clips.className = 'record-clips';
      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'secondary record-export';
      exportButton.textContent = 'Download session JSON';
      panel.append(
        heading,
        field('Label', label),
        field('Participant', participant),
        field('Lighting', lighting),
        field('Session', session),
        tips,
        recordButton,
        message,
        count,
        clips,
        exportButton,
      );

      const big = document.createElement('div');
      big.className = 'record-countdown';
      big.setAttribute('aria-hidden', 'true');
      root.append(big, panel);
      el.append(root);
      back = addBackButton(el, nav);

      let shownClips = -1;
      render = () => {
        tips.textContent = label.value === 'none' ? NONE_TIPS : '';
        const busy = recorder.phase !== 'idle';
        recordButton.disabled = busy;
        recordButton.textContent = busy ? 'Recording…' : 'Record';
        exportButton.disabled = busy || recorder.clips.length === 0;
        const seconds = Math.max(0, Math.ceil(recorder.remainingMs / 1000));
        big.textContent = recorder.phase === 'countdown' ? String(seconds) : '';
        big.classList.toggle('live', recorder.phase === 'recording');
        if (recorder.phase === 'countdown') count.textContent = `Get ready: ${seconds}`;
        else if (recorder.phase === 'recording') count.textContent = `● ${recorder.clipSamples} samples · ${seconds} s left`;
        else count.textContent = '';
        if (shownClips !== recorder.clips.length) {
          shownClips = recorder.clips.length;
          clips.replaceChildren(
            ...recorder.clips.map((c) => {
              const li = document.createElement('li');
              li.textContent = `${c.label}: ${c.samples} samples`;
              return li;
            }),
          );
        }
      };

      label.addEventListener('change', render);
      recordButton.addEventListener('click', () => {
        const meta = {
          label: label.value,
          participant: participant.value.trim(),
          lighting: lighting.value,
          session: session.value.trim(),
        } as ClipMeta;
        try {
          recorder.start(meta);
          message.textContent = '';
        } catch (err) {
          message.textContent = err instanceof Error ? err.message : String(err);
        }
        render();
      });
      exportButton.addEventListener('click', () => {
        const total = recorder.clips.reduce((n, c) => n + c.samples, 0);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        download(`air-control-${participant.value.trim()}-${session.value.trim()}-${stamp}.json`, recorder.toDataset());
        message.textContent = `Saved ${total} samples on this device.`;
      });

      unsubscribe = subscribe((frame) => recorder.push(frame));
      render();
    },

    unmount() {
      unsubscribe?.();
      unsubscribe = null;
      recorder.cancel();
      back?.remove();
      root?.remove();
      root = back = null;
      render = () => {};
    },

    handle() {},

    tick(dt) {
      recorder.tick(dt);
      render();
    },
  };
}
