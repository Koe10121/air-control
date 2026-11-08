import { describe, expect, it, vi } from 'vitest';
import type { Action } from '../input/input';
import { createModeRouter, modeFromUrl, type Mode } from './modes';

function fakeMode(log: string[], name: string): Mode {
  return {
    mount: () => log.push(`mount ${name}`),
    unmount: () => log.push(`unmount ${name}`),
    handle: (a) => log.push(`${name} ${a.type}`),
    tick: (dt) => log.push(`${name} tick ${dt}`),
  };
}

const el = {} as HTMLElement;
const next: Action = { type: 'next', source: 'keyboard' };

describe('createModeRouter', () => {
  function setup() {
    const log: string[] = [];
    const onChange = vi.fn();
    const router = createModeRouter(
      el,
      { menu: () => fakeMode(log, 'menu'), draw: () => fakeMode(log, 'draw') },
      { onChange },
    );
    return { log, router, onChange };
  }

  it('mounts the opened mode and forwards actions and ticks to it', () => {
    const { log, router, onChange } = setup();
    expect(router.open('draw')).toBe(true);
    router.handle(next);
    router.tick(16);
    expect(log).toEqual(['mount draw', 'draw next', 'draw tick 16']);
    expect(router.current).toBe('draw');
    expect(onChange).toHaveBeenCalledWith('draw');
  });

  it('unmounts the current mode before mounting the next', () => {
    const { log, router } = setup();
    router.open('menu');
    router.open('draw');
    expect(log).toEqual(['mount menu', 'unmount menu', 'mount draw']);
  });

  it('builds a fresh mode each time it is opened', () => {
    const factory = vi.fn(() => fakeMode([], 'draw'));
    const router = createModeRouter(el, { menu: () => fakeMode([], 'menu'), draw: factory });
    router.open('draw');
    router.open('menu');
    router.open('draw');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('refuses unknown modes and keeps the current one', () => {
    const { log, router } = setup();
    router.open('menu');
    expect(router.open('nope')).toBe(false);
    expect(router.current).toBe('menu');
    expect(log).toEqual(['mount menu']);
  });

  it('lets a mode open another mode through the nav it is given', () => {
    const log: string[] = [];
    const router = createModeRouter(el, {
      menu: (nav) => ({ ...fakeMode(log, 'menu'), handle: () => nav.open('draw') }),
      draw: () => fakeMode(log, 'draw'),
    });
    router.open('menu');
    router.handle(next);
    expect(router.current).toBe('draw');
  });

  it('does nothing before a mode is open, and close unmounts it', () => {
    const { log, router } = setup();
    router.handle(next);
    router.tick(16);
    router.open('draw');
    router.close();
    router.handle(next);
    expect(log).toEqual(['mount draw', 'unmount draw']);
    expect(router.current).toBeNull();
  });
});

describe('modeFromUrl', () => {
  it('reads ?mode=', () => {
    expect(modeFromUrl('?mode=draw')).toBe('draw');
    expect(modeFromUrl('?source=fixture:x&mode=catch')).toBe('catch');
  });

  it('is null without one', () => {
    expect(modeFromUrl('')).toBeNull();
    expect(modeFromUrl('?mode=')).toBeNull();
  });
});
