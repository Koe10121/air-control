// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createFromOptions = vi.fn();
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: vi.fn(async (base: string) => ({
      wasmLoaderPath: `${base}/vision_wasm_internal.js`,
      wasmBinaryPath: `${base}/vision_wasm_internal.wasm`,
    })),
  },
  HandLandmarker: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

import { createTracker, preloadHandModel, type TrackerStatus } from './tracker';

/** A response that streams `chunks` and announces their total length, released one chunk per `pump()`. */
function streamedResponse(chunks: Uint8Array[]) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let next = 0;
  return {
    response: new Response(body, { headers: { 'Content-Length': String(total) } }),
    pump() {
      if (next < chunks.length) controller.enqueue(chunks[next++]!);
      if (next === chunks.length) controller.close();
    },
  };
}

function setCamera() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  createFromOptions.mockReset();
  createFromOptions.mockResolvedValue({ detectForVideo: vi.fn(), close: vi.fn() });
  setCamera();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('model loading', () => {
  it('reports download progress for the WASM runtime and the model, then hands the model bytes to MediaPipe', async () => {
    const wasm = streamedResponse([new Uint8Array(30), new Uint8Array(30)]);
    const model = streamedResponse([new Uint8Array(20), new Uint8Array(20)]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('.wasm') ? wasm.response : model.response)),
    );
    const tracker = createTracker('camera');
    const progress: number[] = [];
    tracker.onStatus((s: TrackerStatus) => {
      if (s.state === 'loading-model' && s.progress !== null) progress.push(s.progress);
    });
    const started = tracker.start();

    await flush();
    wasm.pump();
    await flush();
    model.pump();
    await flush();
    wasm.pump();
    await flush();
    model.pump();
    await started;
    tracker.stop();

    expect(progress.at(-1)).toBe(1);
    expect(progress).toContain(0.5); // 30 + 20 of 100 bytes
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    const options = createFromOptions.mock.calls[0]![1] as { baseOptions: { modelAssetBuffer?: Uint8Array } };
    expect(options.baseOptions.modelAssetBuffer?.length).toBe(40);
  });

  it('reports unknown progress (null) when the server does not send a length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(8))));
    const tracker = createTracker('camera');
    const states: TrackerStatus[] = [];
    tracker.onStatus((s) => states.push(s));
    // A body without Content-Length: Response from a Uint8Array sets none in this environment.
    await tracker.start();
    tracker.stop();
    const loading = states.flatMap((s) => (s.state === 'loading-model' ? [s.progress] : []));
    expect(loading.length).toBeGreaterThan(0);
    expect(loading.every((p) => p === null)).toBe(true);
  });

  it('preloadHandModel() starts the download early and start() reuses it', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(8), { headers: { 'Content-Length': '8' } }));
    vi.stubGlobal('fetch', fetchMock);
    preloadHandModel();
    preloadHandModel(); // hovering twice must not download twice
    await flush();
    const callsBeforeStart = fetchMock.mock.calls.length;
    expect(callsBeforeStart).toBe(2); // WASM + model

    const tracker = createTracker('camera');
    await tracker.start();
    tracker.stop();
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeStart);
    expect(createFromOptions).toHaveBeenCalledOnce();
  });

  it('a failed preload is not reused: start() downloads again', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementation(async () => new Response(new Uint8Array(8), { headers: { 'Content-Length': '8' } }));
    vi.stubGlobal('fetch', fetchMock);
    preloadHandModel();
    await flush();
    await flush();

    const tracker = createTracker('camera');
    await tracker.start();
    tracker.stop();
    expect(createFromOptions).toHaveBeenCalledOnce();
  });
});
