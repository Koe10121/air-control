// Slides (PRD §4.5): a short deck about the project. next/prev come from swipes, arrow keys or the
// buttons. All logic is in the pure `slidesReduce`; the mode below only renders state to the DOM.
import type { Action } from '../input/input';
import { addBackButton, type Mode, type Nav } from './modes';
import { SLIDES, type Slide } from './slides-content';

export interface SlidesState {
  index: number;
  count: number;
}

export function slidesReduce(state: SlidesState, action: Action): SlidesState {
  const index =
    action.type === 'next' ? Math.min(state.index + 1, state.count - 1) : action.type === 'prev' ? Math.max(state.index - 1, 0) : state.index;
  return index === state.index ? state : { ...state, index };
}

export function createSlidesMode(nav: Nav, slides: readonly Slide[] = SLIDES): Mode {
  let state: SlidesState = { index: 0, count: slides.length };
  let root: HTMLElement | null = null;
  let back: HTMLButtonElement | null = null;

  const render = () => {
    if (!root) return;
    const slide = slides[state.index];
    const card = root.querySelector<HTMLElement>('.slide')!;
    card.replaceChildren();
    if (slide) {
      const heading = document.createElement('h2');
      heading.textContent = slide.title;
      const list = document.createElement('ul');
      for (const point of slide.points) {
        const li = document.createElement('li');
        li.textContent = point;
        list.append(li);
      }
      card.append(heading, list);
      if (slide.links?.length) {
        const links = document.createElement('p');
        links.className = 'slide-links';
        for (const { label, href } of slide.links) {
          const a = document.createElement('a');
          a.href = href;
          a.textContent = label;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          links.append(a);
        }
        card.append(links);
      }
    }
    root.dataset.slide = String(state.index);
    root.querySelector('.slides-counter')!.textContent = `${state.index + 1} / ${state.count}`;
    root.querySelector<HTMLButtonElement>('.slides-prev')!.disabled = state.index === 0;
    root.querySelector<HTMLButtonElement>('.slides-next')!.disabled = state.index >= state.count - 1;
  };

  const dispatch = (action: Action) => {
    const next = slidesReduce(state, action);
    if (next === state) return;
    state = next;
    render();
  };

  return {
    mount(el) {
      root = document.createElement('section');
      root.className = 'slides-mode';
      root.setAttribute('aria-label', 'Slides');
      root.innerHTML = `
        <article class="slide" aria-live="polite"></article>
        <div class="slides-controls">
          <button type="button" class="secondary slides-prev" aria-label="Previous slide">‹ Prev</button>
          <span class="slides-counter"></span>
          <button type="button" class="secondary slides-next" aria-label="Next slide">Next ›</button>
        </div>
      `;
      root.querySelector('.slides-prev')!.addEventListener('click', () => dispatch({ type: 'prev', source: 'mouse' }));
      root.querySelector('.slides-next')!.addEventListener('click', () => dispatch({ type: 'next', source: 'mouse' }));
      el.append(root);
      back = addBackButton(el, nav);
      render();
    },

    unmount() {
      root?.remove();
      back?.remove();
      root = back = null;
    },

    handle: dispatch,
    tick() {},
  };
}
