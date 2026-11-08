// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createFromOptions = vi.fn();
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  HandLandmarker: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

import { createTracker, TrackerError, type TrackerErrorKind } from './tracker';

function domError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

function setSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function startError(): Promise<TrackerError> {
  const err = await createTracker('camera').start().then(
    () => {
      throw new Error('start() should have rejected');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TrackerError);
  return err as TrackerError;
}

beforeEach(() => {
  setSecureContext(true);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  createFromOptions.mockReset();
  createFromOptions.mockResolvedValue({ detectForVideo: vi.fn(), close: vi.fn() });
  // The tracker downloads the model itself (for progress), so serve it a tiny stand-in.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(8))));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setHidden(false);
});

describe('tracker.start() errors', () => {
  it.each<[string, TrackerErrorKind]>([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-camera'],
    ['OverconstrainedError', 'no-camera'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'in-use'],
  ])('maps getUserMedia %s to %s', async (name, kind) => {
    setMediaDevices({ getUserMedia: vi.fn().mockRejectedValue(domError(name)) });
    expect((await startError()).kind).toBe(kind);
  });

  it('reports unsupported when mediaDevices is missing', async () => {
    setMediaDevices(undefined);
    expect((await startError()).kind).toBe('unsupported');
  });

  it('reports unsupported in an insecure context without asking for the camera', async () => {
    const getUserMedia = vi.fn();
    setMediaDevices({ getUserMedia });
    setSecureContext(false);
    expect((await startError()).kind).toBe('unsupported');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('reports model-load-failed and releases the camera when the model cannot load', async () => {
    const { track, stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    createFromOptions.mockRejectedValue(new Error('wasm failed'));
    expect((await startError()).kind).toBe('model-load-failed');
    expect(track.stop).toHaveBeenCalled();
  });
});

describe('tracker visibility', () => {
  it('stops the camera when the tab is hidden and resumes when visible', async () => {
    const first = fakeStream();
    const second = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    setMediaDevices({ getUserMedia });
    const tracker = createTracker('camera');
    await tracker.start();

    setHidden(true);
    expect(first.track.stop).toHaveBeenCalled();

    setHidden(false);
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    // stop() may land while the resumed stream is still arriving; it must still be released.
    tracker.stop();
    await vi.waitFor(() => expect(second.track.stop).toHaveBeenCalled());
  });

  it('does not resume after an explicit stop()', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices({ getUserMedia });
    const tracker = createTracker('camera');
    await tracker.start();
    tracker.stop();

    setHidden(true);
    setHidden(false);
    await Promise.resolve();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
