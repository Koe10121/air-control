import { describe, expect, it } from 'vitest';
import {
  catchStep,
  difficulty,
  DEFAULT_CATCH_CONFIG as C,
  INITIAL_CATCH_STATE,
  newGame,
  readBest,
  saveBest,
  togglePause,
  type CatchState,
  type FallingObject,
} from './catch';

const FAR = { x: -10, y: -10 }; // a catcher that never catches anything

/** Steps `ms` of play in 16 ms frames with a fixed catcher. */
function play(state: CatchState, ms: number, catcher: { x: number; y: number } | null = FAR): CatchState {
  for (let t = 0; t < ms; t += 16) state = catchStep(state, Math.min(16, ms - t), catcher);
  return state;
}

/** A game with exactly one object at (x, y), and no spawn due for a long while. */
const withObject = (x: number, y: number): CatchState => ({
  ...newGame(1),
  objects: [{ id: 1, x, y }],
  untilSpawn: 1e9,
});

describe('newGame', () => {
  it('starts playing with no score, no time used and nothing falling', () => {
    const s = newGame(42);
    expect(s).toMatchObject({ phase: 'playing', score: 0, missed: 0, elapsed: 0, objects: [] });
  });

  it('the initial state is waiting for Start', () => {
    expect(INITIAL_CATCH_STATE.phase).toBe('ready');
  });
});

describe('catchStep', () => {
  it('does nothing unless playing', () => {
    expect(catchStep(INITIAL_CATCH_STATE, 100, FAR)).toBe(INITIAL_CATCH_STATE);
    const over: CatchState = { ...newGame(1), phase: 'over' };
    expect(catchStep(over, 100, FAR)).toBe(over);
  });

  it('spawns objects at the top, inside the screen, after a short delay', () => {
    const s = play(newGame(7), 1500);
    expect(s.objects.length).toBeGreaterThan(0);
    for (const o of s.objects) {
      expect(o.x).toBeGreaterThanOrEqual(C.objectRadius);
      expect(o.x).toBeLessThanOrEqual(1 - C.objectRadius);
      expect(o.y).toBeLessThan(1);
    }
  });

  it('is deterministic for a seed, and different seeds give different games', () => {
    const xs = (seed: number) => play(newGame(seed), 3000).objects.map((o: FallingObject) => o.x);
    expect(xs(7)).toEqual(xs(7));
    expect(xs(7)).not.toEqual(xs(8));
  });

  it('objects fall at the current speed (screen heights per second)', () => {
    const s = catchStep(withObject(0.5, 0.2), 100, FAR);
    expect(s.objects[0]!.y).toBeCloseTo(0.2 + difficulty(100).speed * 0.1, 6);
  });

  it('an object reaching the catcher is caught: removed and scored', () => {
    const s = catchStep(withObject(0.5, 0.5), 16, { x: 0.52, y: 0.51 });
    expect(s.objects).toEqual([]);
    expect(s.score).toBe(1);
    expect(s.missed).toBe(0);
  });

  it('a fast object cannot pass through the catcher between two frames', () => {
    // Starts above the catcher and ends below its hitbox within one (long) frame.
    const s = catchStep(withObject(0.5, 0.3), 100, { x: 0.5, y: 0.35 });
    expect(s.score).toBe(1);
  });

  it('an object that falls past the bottom is missed', () => {
    const s = play(withObject(0.5, 0.9), 1000);
    expect(s.objects).toEqual([]);
    expect(s.missed).toBe(1);
    expect(s.score).toBe(0);
  });

  it('no catcher (hand not visible) catches nothing', () => {
    const s = play(withObject(0.5, 0.9), 1000, null);
    expect(s.missed).toBe(1);
  });

  it('ends at 30 s: game over, nothing left falling, time capped', () => {
    let s = play(newGame(3), 29_900);
    expect(s.phase).toBe('playing');
    s = play(s, 200);
    expect(s.phase).toBe('over');
    expect(s.elapsed).toBe(C.durationMs);
    expect(s.objects).toEqual([]);
  });

  it('a long frame (e.g. after the tab was hidden) advances at most maxStepMs', () => {
    const s = catchStep(newGame(1), 5000, FAR);
    expect(s.elapsed).toBe(C.maxStepMs);
  });

  it('pause freezes the timer and the objects; resuming carries on', () => {
    const before = play(newGame(5), 2000);
    const paused = togglePause(before);
    expect(paused.phase).toBe('paused');
    expect(play(paused, 3000)).toEqual(paused);
    const resumed = togglePause(paused);
    expect(resumed.phase).toBe('playing');
    expect(play(resumed, 100).elapsed).toBeCloseTo(before.elapsed + 100, 6);
  });

  it('pause does nothing before the game or after it ends', () => {
    expect(togglePause(INITIAL_CATCH_STATE)).toBe(INITIAL_CATCH_STATE);
    const over: CatchState = { ...newGame(1), phase: 'over' };
    expect(togglePause(over)).toBe(over);
  });
});

describe('difficulty', () => {
  it('ramps up over the game: objects spawn more often and fall faster', () => {
    const start = difficulty(0);
    const end = difficulty(C.durationMs);
    expect(end.spawnMs).toBeLessThan(start.spawnMs);
    expect(end.speed).toBeGreaterThan(start.speed);
    expect(difficulty(C.durationMs / 2).speed).toBeGreaterThan(start.speed);
    expect(difficulty(C.durationMs / 2).speed).toBeLessThan(end.speed);
  });

  it('more objects spawn in the last 5 s than in the first 5 s', () => {
    let s = newGame(9);
    const spawnedBy = (state: CatchState) => state.nextId;
    s = play(s, 5000);
    const early = spawnedBy(s);
    s = play(s, 20_000);
    const before = spawnedBy(s);
    s = play(s, 4_990);
    expect(spawnedBy(s) - before).toBeGreaterThan(early);
  });
});

describe('best score storage', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };

  it('reads 0 when nothing is stored, and keeps the higher score', () => {
    const storage = memory();
    expect(readBest(storage)).toBe(0);
    expect(saveBest(storage, 5)).toBe(5);
    expect(saveBest(storage, 3)).toBe(5);
    expect(readBest(storage)).toBe(5);
  });

  it('ignores junk in storage', () => {
    const storage = memory();
    storage.setItem('air-control:catch-best', 'lots');
    expect(readBest(storage)).toBe(0);
  });

  it('still works when storage throws or is missing', () => {
    expect(readBest(broken)).toBe(0);
    expect(saveBest(broken, 4)).toBe(4);
    expect(readBest(null)).toBe(0);
    expect(saveBest(null, 2)).toBe(2);
  });
});
