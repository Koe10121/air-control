// Recorded landmark fixtures (PRD §4.1, §6): replay through the Tracker interface, parse, and capture.
import type { FrameListener, HandFrame, Tracker, TrackerStatus } from './tracker';

/** A recording of tracked hand frames with their original timestamps. */
export interface Fixture {
  name: string;
  /** Nominal capture rate; 1000 / fps is the pause between the last frame and the loop restart. */
  fps: number;
  frames: HandFrame[];
}

/**
 * Replays a fixture with its recorded spacing, looping forever, through the same interface as
 * the camera tracker. Timestamps are re-based onto performance.now() so they keep increasing.
 */
export function createFixtureTracker(fixture: Fixture): Tracker {
  const frameListeners = new Set<FrameListener>();
  const statusListeners = new Set<(status: TrackerStatus) => void>();
  const frames = fixture.frames;
  const loopGap = 1000 / fixture.fps;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const emitStatus = (status: TrackerStatus) => statusListeners.forEach((cb) => cb(status));

  /** Emits frame `i` of the pass that started at live time `passStart`, then schedules the next. */
  const play = (i: number, passStart: number) => {
    const first = frames[0]!;
    const frame = frames[i]!;
    const out: HandFrame = { ...frame, timestamp: passStart + (frame.timestamp - first.timestamp) };
    frameListeners.forEach((cb) => cb(out, { detectMs: 0 }));

    const next = frames[i + 1];
    if (next) {
      timer = setTimeout(() => play(i + 1, passStart), next.timestamp - frame.timestamp);
    } else {
      timer = setTimeout(() => play(0, out.timestamp + loopGap), loopGap);
    }
  };

  return {
    video: null,

    async start() {
      if (running) return;
      running = true;
      emitStatus({ state: 'running', delegate: 'fixture' });
      if (frames.length > 0) play(0, performance.now());
    },

    stop() {
      running = false;
      clearTimeout(timer);
      emitStatus({ state: 'stopped' });
    },

    onFrame(cb) {
      frameListeners.add(cb);
      return () => frameListeners.delete(cb);
    },

    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Validates untrusted JSON (a fetched or hand-edited file) as a Fixture. Throws on anything malformed. */
export function parseFixture(input: unknown): Fixture {
  const fail = (why: string): never => {
    throw new Error(`Invalid fixture: ${why}`);
  };
  if (!isObj(input)) return fail('not an object');
  const { name, fps, frames } = input;
  if (typeof name !== 'string') fail('name must be a string');
  if (!isNum(fps) || fps <= 0) fail('fps must be a positive number');
  if (!Array.isArray(frames) || frames.length === 0) return fail('frames must be a non-empty array');

  let previous = -Infinity;
  const parsed = frames.map((f: unknown, i): HandFrame => {
    if (!isObj(f)) return fail(`frame ${i} is not an object`);
    const { landmarks, handedness, timestamp } = f;
    if (handedness !== 'Left' && handedness !== 'Right') fail(`frame ${i} has bad handedness`);
    if (!isNum(timestamp) || timestamp < previous) fail(`frame ${i} timestamp must be a non-decreasing number`);
    previous = timestamp as number;
    if (!Array.isArray(landmarks) || landmarks.length !== 21) fail(`frame ${i} must have 21 landmarks`);
    return {
      handedness: handedness as HandFrame['handedness'],
      timestamp: timestamp as number,
      landmarks: (landmarks as unknown[]).map((p) => {
        if (!isObj(p) || !isNum(p.x) || !isNum(p.y) || !isNum(p.z)) return fail(`frame ${i} has a bad landmark`);
        return { x: p.x, y: p.y, z: p.z };
      }),
    };
  });
  return { name: name as string, fps: fps as number, frames: parsed };
}

/** Keeps the hand frames from the last `seconds` of a live stream, for saving as a fixture. */
export function createFrameRecorder(seconds: number) {
  const windowMs = seconds * 1000;
  const frames: HandFrame[] = [];
  return {
    push(frame: HandFrame | null) {
      if (!frame) return;
      frames.push(frame);
      while (frames[0]!.timestamp < frame.timestamp - windowMs) frames.shift();
    },
    toFixture(name: string): Fixture {
      if (frames.length === 0) throw new Error('No hand frames captured yet');
      const span = frames.at(-1)!.timestamp - frames[0]!.timestamp;
      const fps = span > 0 ? Math.round(((frames.length - 1) * 1000) / span) : 30;
      return { name, fps, frames: frames.map((f) => ({ ...f, landmarks: f.landmarks.map((p) => ({ ...p })) })) };
    },
  };
}

const FIXTURE_NAME = /^[a-z0-9_-]+$/i;

/** The fixture named by `?source=fixture:<name>`, or null to use the camera. Names are a safe slug only. */
export function fixtureNameFromUrl(search: string): string | null {
  const source = new URLSearchParams(search).get('source');
  if (!source?.startsWith('fixture:')) return null;
  const name = source.slice('fixture:'.length);
  return FIXTURE_NAME.test(name) ? name : null;
}

/** Fetches and validates a fixture bundled with the app under /fixtures/ (same origin, no upload). */
export async function loadFixture(name: string): Promise<Fixture> {
  if (!FIXTURE_NAME.test(name)) throw new Error(`Invalid fixture name: ${name}`);
  const res = await fetch(`${import.meta.env.BASE_URL}fixtures/${name}.json`);
  if (!res.ok) throw new Error(`Fixture ${name} not found (HTTP ${res.status})`);
  return parseFixture(await res.json());
}
