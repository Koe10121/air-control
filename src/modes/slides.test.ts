// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Action } from '../input/input';
import { createSlidesMode, slidesReduce, type SlidesState } from './slides';
import { SLIDES } from './slides-content';

const key = (type: 'next' | 'prev'): Action => ({ type, source: 'keyboard' });
const run = (types: Array<'next' | 'prev'>, state: SlidesState) => types.map(key).reduce(slidesReduce, state);

describe('slidesReduce', () => {
  const start: SlidesState = { index: 0, count: 3 };

  it('next and prev move one slide', () => {
    expect(run(['next'], start)).toEqual({ index: 1, count: 3 });
    expect(run(['next', 'next', 'prev'], start)).toEqual({ index: 1, count: 3 });
  });

  it('stops at both ends, returning the same state', () => {
    expect(slidesReduce(start, key('prev'))).toBe(start);
    const last = run(['next', 'next'], start);
    expect(last.index).toBe(2);
    expect(slidesReduce(last, key('next'))).toBe(last);
  });

  it('ignores every other action', () => {
    for (const action of [
      { type: 'click', x: 0.5, y: 0.5, source: 'gesture' },
      { type: 'pause', source: 'gesture' },
      { type: 'clear', source: 'keyboard' },
      { type: 'select', index: 2, source: 'keyboard' },
    ] as Action[]) {
      expect(slidesReduce(start, action)).toBe(start);
    }
  });

  it('works the same whatever the source (a swipe is just next/prev)', () => {
    expect(slidesReduce(start, { type: 'next', source: 'gesture' })).toEqual(slidesReduce(start, key('next')));
  });
});

describe('SLIDES', () => {
  it('has about 8 slides, each with a title and some text', () => {
    expect(SLIDES.length).toBeGreaterThanOrEqual(7);
    expect(SLIDES.length).toBeLessThanOrEqual(10);
    for (const slide of SLIDES) {
      expect(slide.title.trim()).not.toBe('');
      expect(slide.points.length).toBeGreaterThan(0);
    }
  });

  it('links only to https pages', () => {
    for (const link of SLIDES.flatMap((s) => s.links ?? [])) expect(link.href).toMatch(/^https:\/\//);
  });
});

describe('createSlidesMode', () => {
  const nav = { open: () => true };

  function mount() {
    document.body.innerHTML = '';
    const el = document.createElement('div');
    document.body.append(el);
    const mode = createSlidesMode(nav);
    mode.mount(el);
    return { el, mode };
  }

  it('shows the first slide and a counter', () => {
    const { el } = mount();
    expect(el.querySelector('h2')?.textContent).toBe(SLIDES[0]!.title);
    expect(el.querySelector('.slides-counter')?.textContent).toBe(`1 / ${SLIDES.length}`);
  });

  it('next/prev actions and the on-screen buttons change the slide', () => {
    const { el, mode } = mount();
    mode.handle({ type: 'next', source: 'gesture' });
    expect(el.querySelector('h2')?.textContent).toBe(SLIDES[1]!.title);
    el.querySelector<HTMLButtonElement>('.slides-prev')!.click();
    expect(el.querySelector('h2')?.textContent).toBe(SLIDES[0]!.title);
    el.querySelector<HTMLButtonElement>('.slides-next')!.click();
    expect(el.querySelector('.slides-counter')?.textContent).toBe(`2 / ${SLIDES.length}`);
  });

  it('disables prev on the first slide and next on the last', () => {
    const { el, mode } = mount();
    expect(el.querySelector<HTMLButtonElement>('.slides-prev')!.disabled).toBe(true);
    for (let i = 0; i < SLIDES.length; i++) mode.handle({ type: 'next', source: 'keyboard' });
    expect(el.querySelector<HTMLButtonElement>('.slides-next')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('.slides-prev')!.disabled).toBe(false);
  });

  it('removes everything on unmount', () => {
    const { el, mode } = mount();
    mode.unmount();
    expect(el.innerHTML).toBe('');
  });
});
