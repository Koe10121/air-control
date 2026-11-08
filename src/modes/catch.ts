// Catch (PRD §4.5): objects fall, the hand (or mouse) catches them, 30 s on the clock.
// All game logic is in the pure, seeded `catchStep`; the mode below renders state to a canvas and DOM.
import type { Action } from '../input/input';
import { addBackButton, type Mode, type Nav } from './modes';

/** x is in stage widths, y in stage heights (0 = top), both 0..1 on screen. */
export interface FallingObject {
  id: number;
  x: number;
  y: number;
}

export interface CatchState {
  phase: 'ready' | 'playing' | 'paused' | 'over';
  /** Game time used, in ms (stops while paused). */
  elapsed: number;
  score: number;
  missed: number;
  objects: readonly FallingObject[];
  /** Game time until the next object spawns, in ms. */
  untilSpawn: number;
  /** Id for the next object; also how many have spawned. */
  nextId: number;
  /** RNG state (mulberry32). */
  seed: number;
}

export interface CatchConfig {
  durationMs: number;
  /** Hitbox radius of the catcher, in stage widths. */
  catcherRadius: number;
  /** Radius of a falling object, in stage widths. */
  objectRadius: number;
  /** Stage height / width, to turn widths into heights. */
  aspect: number;
  /** Time between spawns at the start and at the end of the game. */
  spawnStartMs: number;
  spawnEndMs: number;
  /** Fall speed (stage heights per second) at the start and at the end. */
  speedStart: number;
  speedEnd: number;
  /** Delay before the first object. */
  firstSpawnMs: number;
  /** A longer frame (tab hidden, a hiccup) only advances the game this much. */
  maxStepMs: number;
}

export const DEFAULT_CATCH_CONFIG: CatchConfig = {
  durationMs: 30_000,
  catcherRadius: 0.08,
  objectRadius: 0.03,
  aspect: 3 / 4,
  spawnStartMs: 1000,
  spawnEndMs: 380,
  speedStart: 0.3,
  speedEnd: 0.75,
  firstSpawnMs: 500,
  maxStepMs: 100,
};

export const INITIAL_CATCH_STATE: CatchState = {
  phase: 'ready',
  elapsed: 0,
  score: 0,
  missed: 0,
  objects: [],
  untilSpawn: DEFAULT_CATCH_CONFIG.firstSpawnMs,
  nextId: 0,
  seed: 1,
};

export function newGame(seed: number, config: CatchConfig = DEFAULT_CATCH_CONFIG): CatchState {
  return { ...INITIAL_CATCH_STATE, phase: 'playing', untilSpawn: config.firstSpawnMs, seed: seed >>> 0 };
}

/** Spawn interval and fall speed at a point in the game: linear from start to end. */
export function difficulty(elapsed: number, config: CatchConfig = DEFAULT_CATCH_CONFIG) {
  const k = Math.min(1, Math.max(0, elapsed / config.durationMs));
  return {
    spawnMs: config.spawnStartMs + (config.spawnEndMs - config.spawnStartMs) * k,
    speed: config.speedStart + (config.speedEnd - config.speedStart) * k,
  };
}

/** mulberry32: a tiny seeded RNG. Returns a value in [0, 1) and the next seed. */
function random(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/**
 * Advances the game by `dt` ms with the catcher at `catcher` (stage coordinates, or null when there
 * is no hand). Returns the same state when nothing can change (not playing).
 */
export function catchStep(
  state: CatchState,
  dt: number,
  catcher: { x: number; y: number } | null,
  config: CatchConfig = DEFAULT_CATCH_CONFIG,
): CatchState {
  if (state.phase !== 'playing') return state;
  const step = Math.min(Math.max(0, dt), config.maxStepMs, config.durationMs - state.elapsed);
  const elapsed = state.elapsed + step;
  if (elapsed >= config.durationMs) return { ...state, phase: 'over', elapsed: config.durationMs, objects: [] };

  const { spawnMs, speed } = difficulty(elapsed, config);
  const fall = (speed * step) / 1000;
  const reachX = config.catcherRadius + config.objectRadius;
  const reachY = reachX / config.aspect;
  const bottom = 1 + config.objectRadius / config.aspect;

  let { score, missed, untilSpawn, nextId, seed } = state;
  const objects: FallingObject[] = [];
  for (const o of state.objects) {
    const y = o.y + fall;
    // Swept along the fall, so a fast object can't skip over the catcher between frames.
    const caught =
      catcher !== null &&
      Math.abs(o.x - catcher.x) <= reachX &&
      catcher.y >= o.y - reachY &&
      catcher.y <= y + reachY;
    if (caught) score++;
    else if (y > bottom) missed++;
    else objects.push({ ...o, y });
  }

  untilSpawn -= step;
  while (untilSpawn <= 0) {
    let r: number;
    [r, seed] = random(seed);
    const margin = config.objectRadius;
    objects.push({ id: nextId++, x: margin + r * (1 - 2 * margin), y: -config.objectRadius / config.aspect });
    untilSpawn += spawnMs;
  }

  return { ...state, elapsed, score, missed, objects, untilSpawn, nextId, seed };
}

/** Pauses a running game or resumes a paused one; does nothing before or after a game. */
export function togglePause(state: CatchState): CatchState {
  if (state.phase === 'playing') return { ...state, phase: 'paused' };
  if (state.phase === 'paused') return { ...state, phase: 'playing' };
  return state;
}

// ---- Best score (localStorage, never trusted to work) ----

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const BEST_KEY = 'air-control:catch-best';

export function readBest(storage: Storage | null): number {
  try {
    const n = Number(storage?.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Stores `score` if it beats the stored best; returns the best (which is at least `score`). */
export function saveBest(storage: Storage | null, score: number): number {
  const best = Math.max(readBest(storage), score);
  try {
    storage?.setItem(BEST_KEY, String(best));
  } catch {
    // Private mode or blocked storage: the best only lasts this visit.
  }
  return best;
}

// ---- The mode ----

/** localStorage, or null where touching it throws. */
function localStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createCatchMode(nav: Nav, config: CatchConfig = DEFAULT_CATCH_CONFIG): Mode {
  let state = INITIAL_CATCH_STATE;
  let catcher: { x: number; y: number } | null = null;
  let best = 0;
  let root: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let back: HTMLButtonElement | null = null;
  let resize: ResizeObserver | null = null;
  let shownPhase: CatchState['phase'] | null = null;

  const $ = <T extends HTMLElement>(sel: string) => root!.querySelector<T>(sel)!;

  const start = () => {
    // The Start button hides; left focused, Space would press it (restart) instead of pausing.
    const focused = root?.ownerDocument.activeElement;
    if (focused instanceof HTMLElement && root?.contains(focused)) focused.blur();
    state = newGame((Math.random() * 2 ** 32) >>> 0, config);
    render();
  };

  /** The DOM parts (HUD, panel); only rewritten when something they show changed. */
  const renderHud = () => {
    if (!root) return;
    root.dataset.phase = state.phase;
    root.dataset.score = String(state.score);
    $('.catch-score').textContent = `Score ${state.score}`;
    $('.catch-time').textContent = `${Math.ceil((config.durationMs - state.elapsed) / 1000)} s`;
    $('.catch-best').textContent = `Best ${best}`;
    if (shownPhase === state.phase) return;
    shownPhase = state.phase;
    const panel = $('.catch-panel');
    const title = $('.catch-panel-title');
    const text = $('.catch-panel-text');
    const button = $<HTMLButtonElement>('.catch-start');
    panel.hidden = state.phase === 'playing';
    button.hidden = state.phase === 'paused';
    if (state.phase === 'ready') {
      title.textContent = 'Catch';
      text.textContent = 'Catch the falling dots with your hand (or the mouse). 30 seconds. Hold an open palm still to pause.';
      button.textContent = 'Start';
    } else if (state.phase === 'paused') {
      title.textContent = 'Paused';
      text.textContent = 'Hold an open palm still again, or press Space, to carry on.';
    } else if (state.phase === 'over') {
      best = saveBest(localStore(), state.score);
      title.textContent = `Score: ${state.score}`;
      text.textContent = state.score >= best && state.score > 0 ? 'New best!' : `Best: ${best}`;
      button.textContent = 'Play again';
      $('.catch-best').textContent = `Best ${best}`;
    }
  };

  const draw = () => {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffd166';
    for (const o of state.objects) {
      ctx.beginPath();
      ctx.arc(o.x * w, o.y * h, config.objectRadius * w, 0, Math.PI * 2);
      ctx.fill();
    }
    if (catcher && state.phase !== 'ready') {
      ctx.strokeStyle = '#5ee6b5';
      ctx.lineWidth = Math.max(3, w / 200);
      ctx.beginPath();
      ctx.arc(catcher.x * w, catcher.y * h, config.catcherRadius * w, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const render = () => {
    renderHud();
    draw();
  };

  return {
    mount(el) {
      best = readBest(localStore());
      root = document.createElement('section');
      root.className = 'catch-mode';
      root.setAttribute('aria-label', 'Catch');
      root.innerHTML = `
        <canvas class="catch-canvas" aria-hidden="true"></canvas>
        <div class="catch-hud" aria-live="off">
          <span class="catch-score"></span><span class="catch-time"></span><span class="catch-best"></span>
        </div>
        <div class="catch-panel">
          <h2 class="catch-panel-title"></h2>
          <p class="catch-panel-text"></p>
          <button type="button" class="catch-start"></button>
        </div>
      `;
      canvas = $<HTMLCanvasElement>('.catch-canvas');
      $('.catch-start').addEventListener('click', start);
      el.append(root);
      back = addBackButton(el, nav);

      const fit = () => {
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        const dpr = globalThis.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(r.width * dpr));
        canvas.height = Math.max(1, Math.round(r.height * dpr));
        draw();
      };
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(fit);
        resize.observe(canvas);
      }
      fit();
      render();
    },

    unmount() {
      resize?.disconnect();
      root?.remove();
      back?.remove();
      root = canvas = back = resize = null;
      shownPhase = null;
    },

    handle(action: Action) {
      if (action.type === 'pointer-move') catcher = { x: action.x, y: action.y };
      else if (action.type === 'pause') {
        const next = togglePause(state);
        if (next !== state) {
          state = next;
          render();
        }
      }
    },

    tick(dt) {
      const next = catchStep(state, dt, catcher, config);
      state = next;
      if (root) render();
    },
  };
}
