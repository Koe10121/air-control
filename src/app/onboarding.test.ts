// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOnboardingMode,
  INITIAL_ONBOARDING_STATE,
  markOnboarded,
  ONBOARDING_TARGET,
  onboardingReduce,
  shouldShowOnboarding,
  type OnboardingState,
} from './onboarding';

const run = (...events: Parameters<typeof onboardingReduce>[1][]) =>
  events.reduce<OnboardingState>((s, e) => onboardingReduce(s, e), INITIAL_ONBOARDING_STATE);
const atTarget = { type: 'cursor', x: ONBOARDING_TARGET.x, y: ONBOARDING_TARGET.y, aspect: 1 } as const;

describe('onboardingReduce', () => {
  it('starts on "raise your hand"', () => {
    expect(INITIAL_ONBOARDING_STATE.step).toBe('hand');
  });

  it('ticks step 1 when a hand is detected', () => {
    expect(run({ type: 'hand' }).step).toBe('target');
  });

  it('ignores the cursor and the button before a hand is seen', () => {
    expect(run(atTarget, { type: 'button' }).step).toBe('hand');
  });

  it('ticks step 2 only when the cursor reaches the circle', () => {
    expect(run({ type: 'hand' }, { type: 'cursor', x: 0.05, y: 0.95, aspect: 1 }).step).toBe('target');
    expect(run({ type: 'hand' }, atTarget).step).toBe('pinch');
  });

  it('counts a cursor just inside the circle edge, using the aspect ratio', () => {
    const r = ONBOARDING_TARGET.radius;
    expect(run({ type: 'hand' }, { ...atTarget, x: ONBOARDING_TARGET.x + r * 0.9 }).step).toBe('pinch');
    // A tall stage: a vertical offset counts double, so 0.9 r up is outside.
    expect(run({ type: 'hand' }, { ...atTarget, y: ONBOARDING_TARGET.y - r * 0.9, aspect: 2 }).step).toBe('target');
  });

  it('ticks step 3 on a button click and finishes', () => {
    expect(run({ type: 'hand' }, atTarget, { type: 'button' }).step).toBe('done');
  });

  it('Skip finishes from any step, and done is final', () => {
    expect(run({ type: 'skip' }).step).toBe('done');
    expect(run({ type: 'hand' }, { type: 'skip' }).step).toBe('done');
    const done = run({ type: 'skip' });
    expect(onboardingReduce(done, { type: 'hand' })).toBe(done);
  });

  it('returns the same state when nothing changes', () => {
    const s = run({ type: 'hand' });
    expect(onboardingReduce(s, { type: 'hand' })).toBe(s);
  });
});

function memoryStore(init: Record<string, string> = {}) {
  const data = { ...init };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}
const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('shouldShowOnboarding / markOnboarded', () => {
  it('shows on a first camera start', () => {
    expect(shouldShowOnboarding({ search: '', camera: true, storage: memoryStore() })).toBe(true);
  });

  it('is not shown for ?mode= deep links or without the camera', () => {
    expect(shouldShowOnboarding({ search: '?mode=draw', camera: true, storage: memoryStore() })).toBe(false);
    expect(shouldShowOnboarding({ search: '', camera: false, storage: memoryStore() })).toBe(false);
  });

  it('is remembered once finished', () => {
    const storage = memoryStore();
    markOnboarded(storage);
    expect(shouldShowOnboarding({ search: '', camera: true, storage })).toBe(false);
  });

  it('survives storage that throws or is missing (still shows, never crashes)', () => {
    expect(() => markOnboarded(throwing)).not.toThrow();
    expect(shouldShowOnboarding({ search: '', camera: true, storage: throwing })).toBe(true);
    expect(shouldShowOnboarding({ search: '', camera: true, storage: null })).toBe(true);
  });
});

describe('createOnboardingMode', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function setup() {
    vi.useFakeTimers();
    const el = document.createElement('div');
    document.body.append(el);
    let onFrame: (hand: boolean) => void = () => {};
    const nav = { open: vi.fn(() => true) };
    const storage = memoryStore();
    const mode = createOnboardingMode(nav, {
      subscribe(cb) {
        onFrame = cb;
        return () => (onFrame = () => {});
      },
      storage,
    });
    mode.mount(el);
    const overlay = () => el.querySelector<HTMLElement>('.onboarding')!;
    return { el, nav, storage, mode, overlay, frame: (hand: boolean) => onFrame(hand) };
  }

  it('walks through the three steps and opens the menu', () => {
    const { nav, storage, mode, overlay, frame } = setup();
    expect(overlay().dataset.step).toBe('hand');
    frame(false);
    expect(overlay().dataset.step).toBe('hand');
    frame(true);
    expect(overlay().dataset.step).toBe('target');
    mode.handle({ type: 'pointer-move', ...ONBOARDING_TARGET, source: 'gesture' });
    expect(overlay().dataset.step).toBe('pinch');
    const button = overlay().querySelector<HTMLButtonElement>('.onboarding-button')!;
    expect(button.hidden).toBe(false);
    button.click();
    expect(overlay().dataset.step).toBe('done');
    expect(Object.keys(storage.data)).toHaveLength(1);
    vi.runAllTimers();
    expect(nav.open).toHaveBeenCalledWith('menu');
  });

  it('Skip remembers and opens the menu straight away', () => {
    const { nav, storage, overlay } = setup();
    overlay().querySelector<HTMLButtonElement>('.onboarding-skip')!.click();
    expect(nav.open).toHaveBeenCalledWith('menu');
    expect(Object.keys(storage.data)).toHaveLength(1);
  });

  it('stops listening to frames on unmount', () => {
    const { el, mode, frame } = setup();
    mode.unmount();
    expect(() => frame(true)).not.toThrow();
    expect(el.querySelector('.onboarding')).toBeNull();
  });
});
