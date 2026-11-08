import { describe, expect, it } from 'vitest';
import { createQualityGovernor, type QualityLevel } from './quality';

/** Feeds frames at `fps` from `from` (ms) for `durationMs`; returns the time reached and every level change seen. */
function run(gov: ReturnType<typeof createQualityGovernor>, fps: number, from: number, durationMs: number) {
  const changes: Array<{ at: number; level: QualityLevel }> = [];
  let level = gov.level;
  const step = 1000 / fps;
  let t = from;
  for (; t < from + durationMs; t += step) {
    const next = gov.frame(t);
    if (next !== level) changes.push({ at: t, level: next });
    level = next;
  }
  return { t, changes };
}

describe('quality governor', () => {
  it('starts at full quality and stays there at a healthy frame rate', () => {
    const gov = createQualityGovernor();
    expect(gov.level).toBe('full');
    expect(run(gov, 30, 0, 10_000).changes).toEqual([]);
  });

  it('drops to low resolution after the frame rate stays under 20 fps for 2 s', () => {
    const gov = createQualityGovernor();
    const { changes } = run(gov, 15, 0, 3_500);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.level).toBe('low-res');
    // Judged only once a full 1 s FPS window exists, then 2 s under the threshold.
    expect(changes[0]!.at).toBeGreaterThanOrEqual(2_000);
    // (plus up to two frame intervals for the frame that crosses each boundary).
    expect(changes[0]!.at).toBeLessThanOrEqual(3_000 + 2 * (1000 / 15));
  });

  it('does not react to a slow spell shorter than 2 s', () => {
    const gov = createQualityGovernor();
    let { t } = run(gov, 30, 0, 3_000);
    const slow = run(gov, 12, t, 1_500);
    expect(slow.changes).toEqual([]);
    expect(run(gov, 30, slow.t, 5_000).changes).toEqual([]);
  });

  it('then skips every other frame if it is still under 20 fps after another 2 s', () => {
    const gov = createQualityGovernor();
    const { changes } = run(gov, 15, 0, 8_000);
    expect(changes.map((c) => c.level)).toEqual(['low-res', 'skip-frames']);
    // A fresh window and another 2 s below the threshold after the first step.
    expect(changes[1]!.at - changes[0]!.at).toBeGreaterThanOrEqual(2_000);
  });

  it('never degrades past skipping frames', () => {
    const gov = createQualityGovernor();
    run(gov, 5, 0, 60_000);
    expect(gov.level).toBe('skip-frames');
  });

  it('does not flap when the frame rate hovers around the threshold', () => {
    const gov = createQualityGovernor();
    let t = 0;
    const levels = new Set<QualityLevel>();
    for (let i = 0; i < 40; i++) {
      ({ t } = run(gov, i % 2 === 0 ? 18 : 23, t, 600));
      levels.add(gov.level);
    }
    expect([...levels]).toEqual(['full']);
  });

  it('steps back up one level after a sustained healthy frame rate (27+ fps for 5 s)', () => {
    const gov = createQualityGovernor();
    let { t } = run(gov, 15, 0, 3_500);
    expect(gov.level).toBe('low-res');
    const quick = run(gov, 30, t, 4_000);
    expect(quick.changes).toEqual([]);
    const { changes } = run(gov, 30, quick.t, 3_000);
    expect(changes.map((c) => c.level)).toEqual(['full']);
  });

  it('waits twice as long before each further recovery, so a level that keeps failing settles', () => {
    const gov = createQualityGovernor();
    let { t } = run(gov, 15, 0, 3_500); // → low-res
    ({ t } = run(gov, 30, t, 7_000)); // → full after 5 s
    expect(gov.level).toBe('full');
    ({ t } = run(gov, 15, t, 3_500)); // → low-res again
    expect(gov.level).toBe('low-res');
    const early = run(gov, 30, t, 8_000);
    expect(early.changes).toEqual([]);
    expect(run(gov, 30, early.t, 4_000).changes.map((c) => c.level)).toEqual(['full']);
  });

  it('reset() starts a fresh measurement (e.g. after the tab was hidden) but keeps the level', () => {
    const gov = createQualityGovernor();
    let { t } = run(gov, 15, 0, 3_500);
    expect(gov.level).toBe('low-res');
    // A long gap (tab hidden) must not count as one very slow frame.
    gov.reset();
    ({ t } = run(gov, 30, t + 60_000, 1_000));
    expect(gov.level).toBe('low-res');
  });
});
