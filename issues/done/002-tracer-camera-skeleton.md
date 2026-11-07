# 002: Tracer bullet: camera → live skeleton + FPS

type: AFK
blocked_by: 001
prd: §4.1 tracker, §4.6 app, §5 (self-hosted assets, GPU→CPU fallback)

## What to build
Clicking **Try it** asks for the camera and shows the mirrored webcam video with the hand skeleton drawn live on top, plus an FPS counter.
- `tracker` module: `createTracker('camera')` → `{ start(), stop(), onFrame(cb), onStatus(cb) }` emitting `HandFrame = { landmarks: 21×{x,y,z}, handedness, timestamp } | null`.
- MediaPipe Hand Landmarker (`@mediapipe/tasks-vision`) in VIDEO mode, `numHands: 1`, 640×480 input. Try the GPU delegate first, fall back to CPU.
- **Self-host** the WASM files and the `hand_landmarker.task` model under `public/` (copied from the npm package or downloaded by a setup script, then committed). No CDN requests at runtime.
- Canvas overlay: mirrored video, 21 points and bone connections, FPS counter (tracking FPS).
- The camera is requested only after the click, never on page load.

## Acceptance criteria
- [ ] Clicking Try it shows the mirrored video and a skeleton that follows the hand in real time (manual check).
- [ ] The DevTools network tab shows no request to any origin other than the site itself.
- [ ] `HandFrame` and the tracker interface are typed and exported. Pure helpers (e.g. landmark → canvas coordinates with mirroring) have unit tests.
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass, and the deploy shows it working live.
