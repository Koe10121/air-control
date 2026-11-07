// Copies the MediaPipe WASM runtime out of node_modules and downloads the hand landmarker model
// into public/mediapipe/, so the app self-hosts everything and makes no CDN requests at runtime.
// Run once after changing the @mediapipe/tasks-vision version:  npm run setup:mediapipe
// The version is pinned to 0.10.34 on purpose: 1.x adds a telemetry logger that POSTs usage stats
// to odml.pa.googleapis.com, which breaks the "nothing leaves the device" rule.
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'mediapipe');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

await mkdir(join(outDir, 'wasm'), { recursive: true });

// The resolver picks the SIMD build, or the no-SIMD build on older browsers.
const wasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];
for (const file of wasmFiles) {
  await copyFile(join(wasmSrc, file), join(outDir, 'wasm', file));
  console.log(`copied wasm/${file}`);
}

const modelPath = join(outDir, 'hand_landmarker.task');
const exists = await stat(modelPath).then(() => true, () => false);
if (exists && !process.argv.includes('--force')) {
  console.log('hand_landmarker.task already present (use --force to re-download)');
} else {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status} ${res.statusText}`);
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log('downloaded hand_landmarker.task');
}
