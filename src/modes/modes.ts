// modes: the Mode interface, a small router, the mode menu and the "coming soon" placeholder (PRD §4.5).
// Each mode gets the stage's mode layer to render into and the input module's actions; it never
// knows whether an action came from a hand, the mouse or the keyboard.
import type { Action } from '../input/input';

export interface Mode {
  mount(el: HTMLElement): void;
  unmount(): void;
  handle(action: Action): void;
  /** Called every animation frame; `dt` in milliseconds. */
  tick(dt: number): void;
}

/** What a mode may do to the app: switch to another mode (e.g. Back to menu). */
export interface Nav {
  open(name: string): boolean;
}

export type ModeFactory = (nav: Nav) => Mode;

export interface ModeRouter extends Nav {
  readonly current: string | null;
  handle(action: Action): void;
  tick(dt: number): void;
  /** Unmounts the current mode. */
  close(): void;
}

export function createModeRouter(
  el: HTMLElement,
  factories: Record<string, ModeFactory>,
  { onChange }: { onChange?: (name: string) => void } = {},
): ModeRouter {
  let current: { name: string; mode: Mode } | null = null;

  const router: ModeRouter = {
    get current() {
      return current?.name ?? null;
    },

    open(name) {
      const factory = Object.hasOwn(factories, name) ? factories[name] : undefined;
      if (!factory) return false;
      current?.mode.unmount();
      const mode = factory(router);
      current = { name, mode };
      mode.mount(el);
      onChange?.(name);
      return true;
    },

    handle(action) {
      current?.mode.handle(action);
    },

    tick(dt) {
      current?.mode.tick(dt);
    },

    close() {
      current?.mode.unmount();
      current = null;
    },
  };
  return router;
}

/** The `?mode=` deep link, if any. */
export function modeFromUrl(search: string): string | null {
  return new URLSearchParams(search).get('mode') || null;
}

/** Name and blurb for each entry on the menu. `ready: false` shows "coming soon". */
export interface MenuEntry {
  name: string;
  title: string;
  blurb: string;
  ready: boolean;
}

export const MENU_ENTRIES: readonly MenuEntry[] = [
  { name: 'draw', title: 'Draw', blurb: 'Pinch and move to draw in the air', ready: true },
  { name: 'slides', title: 'Slides', blurb: 'Swipe your open hand to turn the page', ready: true },
  { name: 'catch', title: 'Catch', blurb: 'Catch falling things with your palm', ready: false },
];

/** Big buttons, one per mode. They work by pinch-click (virtual pointer) and by mouse. */
export function createMenuMode(nav: Nav, entries: readonly MenuEntry[] = MENU_ENTRIES): Mode {
  let root: HTMLElement | null = null;
  return {
    mount(el) {
      root = document.createElement('nav');
      root.className = 'mode-menu';
      root.setAttribute('aria-label', 'Modes');
      for (const entry of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mode-button';
        button.dataset.mode = entry.name;
        const title = document.createElement('span');
        title.className = 'mode-title';
        title.textContent = entry.title;
        const blurb = document.createElement('span');
        blurb.className = 'mode-blurb';
        blurb.textContent = entry.ready ? entry.blurb : 'Coming soon';
        button.append(title, blurb);
        button.addEventListener('click', () => nav.open(entry.name));
        root.append(button);
      }
      el.append(root);
    },
    unmount() {
      root?.remove();
      root = null;
    },
    handle() {},
    tick() {},
  };
}

/** Adds the "Menu" button every mode shows; returns it so the mode can remove it on unmount. */
export function addBackButton(el: HTMLElement, nav: Nav): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary stage-button back-to-menu';
  button.textContent = 'Menu';
  button.addEventListener('click', () => nav.open('menu'));
  el.append(button);
  return button;
}

/** Placeholder for a mode that isn't built yet. */
export function createComingSoonMode(nav: Nav, title: string): Mode {
  let root: HTMLElement | null = null;
  return {
    mount(el) {
      root = document.createElement('div');
      root.className = 'coming-soon';
      const heading = document.createElement('h2');
      heading.textContent = title;
      const text = document.createElement('p');
      text.textContent = 'Coming soon.';
      root.append(heading, text);
      el.append(root);
      root.append(addBackButton(el, nav));
    },
    unmount() {
      root?.remove();
      root = null;
    },
    handle() {},
    tick() {},
  };
}
