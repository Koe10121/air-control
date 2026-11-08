import { describe, expect, it } from 'vitest';
import type { Action } from '../input/input';
import { drawReduce, INITIAL_DRAW_STATE, PALETTE, type DrawState } from './draw';

const at = (type: 'pointer-move' | 'press' | 'release' | 'click', x: number, y: number): Action => ({
  type,
  x,
  y,
  source: 'gesture',
});

const run = (actions: Action[], state: DrawState = INITIAL_DRAW_STATE) => actions.reduce(drawReduce, state);

describe('drawReduce', () => {
  it('starts with no strokes, the pen up and the first colour', () => {
    expect(INITIAL_DRAW_STATE).toEqual({ strokes: [], penDown: false, color: 0 });
    expect(PALETTE).toHaveLength(5);
  });

  it('ignores pointer moves while the pen is up', () => {
    expect(run([at('pointer-move', 0.1, 0.1), at('pointer-move', 0.2, 0.2)])).toEqual(INITIAL_DRAW_STATE);
  });

  it('press puts the pen down, moves draw a line, release lifts the pen', () => {
    const s = run([
      at('press', 0.1, 0.1),
      at('pointer-move', 0.2, 0.2),
      at('pointer-move', 0.3, 0.2),
      at('release', 0.3, 0.2),
      at('pointer-move', 0.9, 0.9),
    ]);
    expect(s.penDown).toBe(false);
    expect(s.strokes).toEqual([
      {
        color: PALETTE[0],
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.2 },
        ],
      },
    ]);
  });

  it('each press starts a new stroke', () => {
    const s = run([at('press', 0.1, 0.1), at('release', 0.1, 0.1), at('press', 0.5, 0.5), at('release', 0.6, 0.5)]);
    expect(s.strokes.map((st) => st.points)).toEqual([[{ x: 0.1, y: 0.1 }], [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }]]);
  });

  it('select changes the colour of the next stroke and keeps old strokes as they were', () => {
    const s = run([
      at('press', 0.1, 0.1),
      at('release', 0.1, 0.1),
      { type: 'select', index: 2, source: 'keyboard' },
      at('press', 0.5, 0.5),
    ]);
    expect(s.color).toBe(2);
    expect(s.strokes.map((st) => st.color)).toEqual([PALETTE[0], PALETTE[2]]);
  });

  it('ignores a select outside the palette', () => {
    const s = run([{ type: 'select', index: 7, source: 'keyboard' }]);
    expect(s).toEqual(INITIAL_DRAW_STATE);
  });

  it('clear removes every stroke and keeps the colour', () => {
    const s = run([
      { type: 'select', index: 3, source: 'keyboard' },
      at('press', 0.1, 0.1),
      at('pointer-move', 0.2, 0.2),
      { type: 'clear', source: 'gesture' },
      at('pointer-move', 0.3, 0.3),
    ]);
    expect(s).toEqual({ strokes: [], penDown: false, color: 3 });
  });

  it('pause lifts the pen: the stroke ends and later moves draw nothing', () => {
    const s = run([
      at('press', 0.1, 0.1),
      at('pointer-move', 0.2, 0.2),
      { type: 'pause', source: 'gesture' },
      at('pointer-move', 0.3, 0.3),
      at('release', 0.3, 0.3),
    ]);
    expect(s.penDown).toBe(false);
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0]!.points).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ]);
  });

  it('pause with the pen already up changes nothing', () => {
    const before = run([at('press', 0.1, 0.1), at('release', 0.2, 0.2)]);
    expect(run([{ type: 'pause', source: 'keyboard' }], before)).toBe(before);
  });

  it('does not mutate the previous state', () => {
    const before = run([at('press', 0.1, 0.1)]);
    const snapshot = JSON.parse(JSON.stringify(before));
    run([at('pointer-move', 0.2, 0.2), at('release', 0.2, 0.2)], before);
    expect(before).toEqual(snapshot);
  });
});
