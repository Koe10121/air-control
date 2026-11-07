// Guards the privacy promise: the tracker must run entirely from files served by this site.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const mediapipe = join(root, 'node_modules', '@mediapipe', 'tasks-vision');

describe('self-hosted MediaPipe', () => {
  it('ships the model and WASM runtime under public/mediapipe', () => {
    for (const file of [
      'hand_landmarker.task',
      'wasm/vision_wasm_internal.js',
      'wasm/vision_wasm_internal.wasm',
      'wasm/vision_wasm_nosimd_internal.js',
      'wasm/vision_wasm_nosimd_internal.wasm',
    ]) {
      expect(existsSync(join(root, 'public', 'mediapipe', file)), file).toBe(true);
    }
  });

  it('uses a MediaPipe build without the telemetry logger', () => {
    const bundle = readFileSync(join(mediapipe, 'vision_bundle.mjs'), 'utf8');
    expect(bundle).not.toContain('odml.pa.googleapis.com');
  });
});
