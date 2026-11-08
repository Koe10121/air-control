// Benchmark (`?mode=benchmark`, PRD §4.5): a hidden page that measures how well clicking works.
// 20 targets appear one at a time at the same seeded positions every run. Every click is an attempt:
// on the target it's a hit (and the next target shows), anywhere else it's a miss.
// All the logic is in the pure `benchmarkReduce` / `benchmarkSummary`; the mode only renders it.
import type { Action, ActionSource } from '../input/input';
import { addBackButton, type Mode, type Nav } from './modes';

/** x is in stage widths, y in stage heights, both 0..1. */
export interface Target {
  x: number;
  y: number;
}

export interface Attempt {
  /** Index of the target on screen when the click happened. */
  target: number;
  hit: boolean;
  /** Time since that target appeared, in ms. */
  ms: number;
  source: ActionSource;
}

export interface BenchmarkState {
  phase: 'ready' | 'running' | 'done';
  targets: readonly Target[];
  /** The target on screen. */
  index: number;
  /** When the current target appeared (same clock as the actions' `t`). */
  shownAt: number;
  attempts: readonly Attempt[];
}

export type BenchmarkAction =
  | { type: 'start'; t: number }
  /** `aspect` is the stage's height / width, so a round target hit-tests as round. */
  | { type: 'click'; x: number; y: number; t: number; aspect: number; source: ActionSource };

export interface BenchmarkConfig {
  targetCount: number;
  /** In stage widths. */
  targetRadius: number;
  seed: number;
}

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = { targetCount: 20, targetRadius: 0.05, seed: 2026 };

/** mulberry32: a tiny seeded RNG. Returns a value in [0, 1) and the next seed. */
function random(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/**
 * The fixed target sequence. Targets keep clear of the edges and the top bar (HUD, Menu), and
 * each one is well away from the previous one, so every target needs a real move.
 */
export function benchmarkTargets(config: BenchmarkConfig = DEFAULT_BENCHMARK_CONFIG): Target[] {
  const minGap = 4 * config.targetRadius;
  const targets: Target[] = [];
  let seed = config.seed >>> 0;
  while (targets.length < config.targetCount) {
    let rx: number, ry: number;
    [rx, seed] = random(seed);
    [ry, seed] = random(seed);
    const t = { x: 0.1 + rx * 0.8, y: 0.2 + ry * 0.65 };
    const prev = targets.at(-1);
    if (prev && Math.hypot(t.x - prev.x, t.y - prev.y) <= minGap) continue;
    targets.push(t);
  }
  return targets;
}

export const INITIAL_BENCHMARK_STATE: BenchmarkState = {
  phase: 'ready',
  targets: benchmarkTargets(),
  index: 0,
  shownAt: 0,
  attempts: [],
};

export function benchmarkReduce(
  state: BenchmarkState,
  action: BenchmarkAction,
  config: BenchmarkConfig = DEFAULT_BENCHMARK_CONFIG,
): BenchmarkState {
  if (action.type === 'start') {
    return { ...state, phase: 'running', index: 0, shownAt: action.t, attempts: [] };
  }
  if (state.phase !== 'running') return state;
  const target = state.targets[state.index]!;
  const dx = action.x - target.x;
  const dy = (action.y - target.y) * action.aspect;
  const hit = Math.hypot(dx, dy) <= config.targetRadius;
  const attempts = [
    ...state.attempts,
    { target: state.index, hit, ms: Math.max(0, action.t - state.shownAt), source: action.source },
  ];
  if (!hit) return { ...state, attempts };
  const index = state.index + 1;
  if (index >= state.targets.length) return { ...state, phase: 'done', attempts };
  return { ...state, index, shownAt: action.t, attempts };
}

/** One run's results, shaped to paste into the metrics file. */
export interface BenchmarkResult {
  benchmark: 'targets-v1';
  targets: number;
  hits: number;
  misses: number;
  /** hits / attempts, to 3 decimals. */
  successRate: number;
  /** Median time to hit a target, in ms (null with no hits). */
  medianMs: number | null;
  /** The pose classifier driving the hand cursor, or null with no tracker (mouse stage). */
  classifier: string | null;
  /** The input sources that clicked, sorted and joined with "+" (e.g. "gesture", "mouse"). */
  input: string;
  recordedAt: string;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function benchmarkSummary(
  state: BenchmarkState,
  meta: { classifier: string | null; recordedAt: string },
): BenchmarkResult {
  const hits = state.attempts.filter((a) => a.hit);
  const total = state.attempts.length;
  const sources = [...new Set(state.attempts.map((a) => a.source))].sort();
  return {
    benchmark: 'targets-v1',
    targets: state.targets.length,
    hits: hits.length,
    misses: total - hits.length,
    successRate: total ? Math.round((hits.length / total) * 1000) / 1000 : 0,
    medianMs: median(hits.map((a) => a.ms)),
    classifier: meta.classifier,
    input: sources.length ? sources.join('+') : 'none',
    recordedAt: meta.recordedAt,
  };
}

// ---- The mode ----

export interface BenchmarkModeDeps {
  /** The classifier in use right now (null on the mouse stage, which has no tracker). */
  classifier(): string | null;
  now?: () => number;
}

export function createBenchmarkMode(nav: Nav, deps: BenchmarkModeDeps): Mode {
  const now = deps.now ?? (() => performance.now());
  let state = INITIAL_BENCHMARK_STATE;
  let root: HTMLElement | null = null;
  let back: HTMLButtonElement | null = null;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let shownPhase: BenchmarkState['phase'] | null = null;

  const $ = <T extends HTMLElement>(sel: string) => root!.querySelector<T>(sel)!;

  const start = () => {
    const focused = root?.ownerDocument.activeElement;
    if (focused instanceof HTMLElement && root?.contains(focused)) focused.blur();
    // Deferred: a mouse click on Start reaches the input module (and so `handle`) after this
    // button's handler, and must not count as the first attempt.
    clearTimeout(startTimer);
    startTimer = setTimeout(() => {
      state = benchmarkReduce(state, { type: 'start', t: now() });
      render();
    }, 0);
  };

  const showResults = () => {
    const result = benchmarkSummary(state, { classifier: deps.classifier(), recordedAt: new Date().toISOString() });
    const pct = Math.round(result.successRate * 1000) / 10;
    $('.benchmark-panel-title').textContent = 'Results';
    $('.benchmark-panel-text').textContent =
      `${result.hits} hits, ${result.misses} misses · ${pct}% success · median ${result.medianMs ?? '–'} ms · ` +
      `classifier: ${result.classifier ?? 'none'} · input: ${result.input}`;
    const json = $<HTMLTextAreaElement>('.benchmark-json');
    json.value = JSON.stringify(result, null, 2);
    json.hidden = false;
    $('.benchmark-copy').hidden = false;
    $('.benchmark-start').textContent = 'Run again';
    root!.dataset.successRate = String(result.successRate);
  };

  const render = () => {
    if (!root) return;
    root.dataset.phase = state.phase;
    root.dataset.index = String(state.index);
    const target = $('.benchmark-target');
    const t = state.targets[state.index]!;
    target.hidden = state.phase !== 'running';
    target.style.left = `${t.x * 100}%`;
    target.style.top = `${t.y * 100}%`;
    const misses = state.attempts.filter((a) => !a.hit).length;
    $('.benchmark-hud').textContent =
      `Target ${Math.min(state.index + 1, state.targets.length)} / ${state.targets.length} · Misses ${misses}`;
    if (shownPhase === state.phase) return;
    shownPhase = state.phase;
    $('.benchmark-panel').hidden = state.phase === 'running';
    if (state.phase === 'done') showResults();
  };

  const copy = () => {
    const json = $<HTMLTextAreaElement>('.benchmark-json');
    const button = $('.benchmark-copy');
    const done = () => (button.textContent = 'Copied');
    const fallback = () => {
      json.select();
      button.textContent = 'Select and copy the text';
    };
    try {
      const p = navigator.clipboard?.writeText(json.value);
      if (p) p.then(done, fallback);
      else fallback();
    } catch {
      fallback();
    }
  };

  return {
    mount(el) {
      state = INITIAL_BENCHMARK_STATE;
      root = document.createElement('section');
      root.className = 'benchmark-mode';
      root.setAttribute('aria-label', 'Benchmark');
      const diameter = DEFAULT_BENCHMARK_CONFIG.targetRadius * 200;
      root.innerHTML = `
        <div class="benchmark-target" aria-hidden="true" hidden></div>
        <div class="benchmark-hud" aria-live="off"></div>
        <div class="benchmark-panel">
          <h2 class="benchmark-panel-title">Benchmark</h2>
          <p class="benchmark-panel-text">Click each of the ${state.targets.length} targets as fast as you can.
            A click anywhere else counts as a miss.</p>
          <textarea class="benchmark-json" readonly hidden aria-label="Results JSON" rows="8"></textarea>
          <div class="benchmark-actions">
            <button type="button" class="benchmark-copy" hidden>Copy JSON</button>
            <button type="button" class="benchmark-start">Start</button>
          </div>
        </div>
      `;
      // Sized through the CSSOM: the CSP blocks inline style attributes.
      $('.benchmark-target').style.width = `${diameter}%`;
      $('.benchmark-start').addEventListener('click', start);
      $('.benchmark-copy').addEventListener('click', copy);
      el.append(root);
      back = addBackButton(el, nav);
      render();
    },

    unmount() {
      clearTimeout(startTimer);
      root?.remove();
      back?.remove();
      root = back = null;
      shownPhase = null;
    },

    handle(action: Action) {
      if (action.type !== 'click' || !root) return;
      const r = root.getBoundingClientRect();
      const aspect = r.width > 0 && r.height > 0 ? r.height / r.width : 3 / 4;
      const { x, y, source } = action;
      const next = benchmarkReduce(state, { type: 'click', x, y, source, t: now(), aspect });
      if (next === state) return;
      state = next;
      render();
    },

    tick() {},
  };
}
