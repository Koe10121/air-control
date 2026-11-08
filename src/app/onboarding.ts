// onboarding: the 3-step overlay on a first camera start (PRD §4.6, user story 6).
// 1. Raise your hand → 2. Move the dot to the circle → 3. Pinch the button → the mode menu.
// The step logic is the pure `onboardingReduce`; the mode only renders it. Finishing or skipping
// is remembered in localStorage (if storage works), and deep links / fixture / mouse never see it.
import type { Action } from '../input/input';
import { modeFromUrl, type Mode, type Nav } from '../modes/modes';

export type OnboardingStep = 'hand' | 'target' | 'pinch' | 'done';

export interface OnboardingState {
  step: OnboardingStep;
}

export type OnboardingEvent =
  | { type: 'hand' }
  /** Cursor position (0..1 in the stage); `aspect` is height / width so the circle hit-tests as round. */
  | { type: 'cursor'; x: number; y: number; aspect: number }
  | { type: 'button' }
  | { type: 'skip' };

/** The circle for step 2. x, y in stage fractions; radius in stage widths. */
export const ONBOARDING_TARGET = { x: 0.75, y: 0.55, radius: 0.07 } as const;

export const INITIAL_ONBOARDING_STATE: OnboardingState = { step: 'hand' };

export function onboardingReduce(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  if (state.step === 'done') return state;
  if (event.type === 'skip') return { step: 'done' };
  if (state.step === 'hand' && event.type === 'hand') return { step: 'target' };
  if (state.step === 'target' && event.type === 'cursor') {
    const dx = event.x - ONBOARDING_TARGET.x;
    const dy = (event.y - ONBOARDING_TARGET.y) * event.aspect;
    return Math.hypot(dx, dy) <= ONBOARDING_TARGET.radius ? { step: 'pinch' } : state;
  }
  if (state.step === 'pinch' && event.type === 'button') return { step: 'done' };
  return state;
}

// ---- Remembering it (localStorage, never trusted to work) ----

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const ONBOARDED_KEY = 'air-control:onboarded';

/** Only on a camera start, without a `?mode=` deep link, and not finished before. */
export function shouldShowOnboarding(opts: { search: string; camera: boolean; storage: Storage | null }): boolean {
  if (!opts.camera || modeFromUrl(opts.search)) return false;
  try {
    return opts.storage?.getItem(ONBOARDED_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markOnboarded(storage: Storage | null): void {
  try {
    storage?.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Private mode or blocked storage: it shows again next visit.
  }
}

/** localStorage, or null where touching it throws. */
export function localStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// ---- The mode ----

export interface OnboardingDeps {
  /** Hears whether each tracked frame has a hand. Returns an unsubscribe. */
  subscribe(cb: (hand: boolean) => void): () => void;
  storage: Storage | null;
}

/** How long the last tick stays on screen before the menu opens. */
const FINISH_DELAY_MS = 600;

const STEPS: readonly { step: Exclude<OnboardingStep, 'done'>; text: string }[] = [
  { step: 'hand', text: 'Raise your hand' },
  { step: 'target', text: 'Move the dot to the circle' },
  { step: 'pinch', text: 'Pinch the button' },
];

export function createOnboardingMode(nav: Nav, deps: OnboardingDeps): Mode {
  let state = INITIAL_ONBOARDING_STATE;
  let root: HTMLElement | null = null;
  let unsubscribe = () => {};
  let finishTimer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    if (!root) return;
    root.dataset.step = state.step;
    const current = STEPS.findIndex((s) => s.step === state.step);
    root.querySelectorAll<HTMLElement>('.onboarding-steps li').forEach((li, i) => {
      const done = state.step === 'done' || i < current;
      li.classList.toggle('done', done);
      li.classList.toggle('current', i === current);
      li.querySelector('.onboarding-tick')!.textContent = done ? '✓' : String(i + 1);
    });
    root.querySelector<HTMLElement>('.onboarding-target')!.hidden = state.step !== 'target';
    root.querySelector<HTMLElement>('.onboarding-button')!.hidden = state.step !== 'pinch';
  };

  const dispatch = (event: OnboardingEvent) => {
    const next = onboardingReduce(state, event);
    if (next === state) return;
    state = next;
    render();
    if (state.step !== 'done') return;
    markOnboarded(deps.storage);
    if (event.type === 'skip') nav.open('menu');
    else finishTimer = setTimeout(() => nav.open('menu'), FINISH_DELAY_MS);
  };

  return {
    mount(el) {
      state = INITIAL_ONBOARDING_STATE;
      root = document.createElement('section');
      root.className = 'onboarding';
      root.setAttribute('aria-label', 'Getting started');
      const t = ONBOARDING_TARGET;
      root.innerHTML = `
        <div class="onboarding-panel">
          <h2>Getting started</h2>
          <ol class="onboarding-steps" aria-live="polite">
            ${STEPS.map((s) => `<li data-step="${s.step}"><span class="onboarding-tick" aria-hidden="true"></span>${s.text}</li>`).join('')}
          </ol>
          <button type="button" class="secondary onboarding-skip">Skip</button>
        </div>
        <div class="onboarding-target" aria-hidden="true" hidden></div>
        <button type="button" class="onboarding-button" hidden>Pinch me</button>
      `;
      // Positioned through the CSSOM: the CSP blocks inline style attributes.
      const target = root.querySelector<HTMLElement>('.onboarding-target')!;
      Object.assign(target.style, { left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.radius * 200}%` });
      root.querySelector('.onboarding-skip')!.addEventListener('click', () => dispatch({ type: 'skip' }));
      root.querySelector('.onboarding-button')!.addEventListener('click', () => dispatch({ type: 'button' }));
      el.append(root);
      unsubscribe = deps.subscribe((hand) => {
        if (hand) dispatch({ type: 'hand' });
      });
      render();
    },

    unmount() {
      clearTimeout(finishTimer);
      unsubscribe();
      unsubscribe = () => {};
      root?.remove();
      root = null;
    },

    handle(action: Action) {
      if (action.type !== 'pointer-move' || !root) return;
      const r = root.getBoundingClientRect();
      const aspect = r.width > 0 && r.height > 0 ? r.height / r.width : 3 / 4;
      dispatch({ type: 'cursor', x: action.x, y: action.y, aspect });
    },

    tick() {},
  };
}
