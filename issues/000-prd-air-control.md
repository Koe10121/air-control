# PRD: Air Control

Browser app for webcam hand tracking and gesture control. Source: `brief.md` plus the `/grill-me` session (2026-11-07).

## 1. Problem

Visitors to the portfolio (koe-portfolio.vercel.app), mainly recruiters, decide in seconds whether a project is impressive. Most portfolio projects are static screenshots or CRUD apps. Nothing lets them *feel* the engineering.

The author also wants hands-on experience with real-time computer vision: collecting their own data, training a small model and measuring it honestly against a baseline. Tutorials skip that last part.

A touch-free, hand-controlled website covers both needs. It works as a "try it in 10 seconds" demo and as a real ML project with published numbers. This only works if it:
- feels reliable (no false clicks, no jitter)
- runs on an ordinary laptop
- keeps video on the device
- still works when the visitor has no camera or refuses permission

## 2. Solution

A static TypeScript + Vite site on Vercel's free tier:
- **Tracking:** MediaPipe Hand Landmarker runs in the browser and turns webcam frames into 21 hand landmarks per frame.
- **Gestures:** A pure, timestamp-driven gesture engine turns landmarks into a smoothed cursor and discrete events (click, swipe, pause, clear).
- **Input:** Gesture, mouse and keyboard input merge into one app-action stream, so every feature works without a camera.
- **Modes:** Three demo modes (Air Draw, Slides, Catch) plus a debug panel.
- **Classifier:** Pose classification sits behind one interface. A rules classifier ships first. A small MLP, trained in Python on landmark data the author records with an in-app recorder, is then compared with rules and k-NN on a held-out split.
- **What ships:** Each gesture uses whichever classifier wins on the test set. The README publishes the numbers, including their limits.

**Priority:** The demo comes first and the model has to earn its place. A shippable rules-only demo comes before any ML work.

## 3. User stories

### Visitors
1. As a visitor, I want a "Try it" button that has me controlling the page within 10 seconds, so that I experience it without reading instructions.
2. As a visitor, I want to see my hand skeleton drawn live over the mirrored video, so that I know the system sees me.
3. As a visitor, I want a cursor that follows my index finger smoothly, and I want to reach the screen corners without my hand leaving the frame, so that pointing feels natural.
4. As a visitor, I want to click buttons by pinching, without accidental clicks when I'm just moving my hand, so that it feels like magic rather than a fight.
5. As a visitor, I want visual feedback (button hover highlight, a pinch ring that closes), so that I can tell what the system thinks I'm doing.
6. As a visitor, I want a short first-run guide (raise your hand → move the dot → pinch the button) that I can skip, so that I learn the gestures by doing them.
7. As a visitor, I want to draw in the air (pinch-hold to draw), change colour, and clear the canvas (button or holding a fist), so that I can play freely.
8. As a visitor, I want to swipe left and right through a short deck about this project, so that I learn how it works while using it.
9. As a visitor, I want to catch falling objects with my palm in a 30-second game with a score and a local high score, so that I have a reason to keep trying.
10. As a visitor, I want an open palm held still for one second to pause the current mode (for example the game timer), so that I can stop without reaching for the keyboard.
11. As a visitor, I want the page to tell me the video never leaves my device before it asks for the camera, so that I feel safe granting permission.
12. As a visitor who denied the camera, has none, or has it in use by another app, I want a clear explanation and the choice to "Use mouse instead" or "Watch a demo", so that I still see what the project does.
13. As a visitor, I want a "Stop camera" button, and I want the camera to stop when I switch tabs, so that I stay in control of my camera.
14. As a visitor on a slow laptop, I want the app to lower its quality automatically and tell me, rather than becoming unusable.
15. As a keyboard or mouse user, I want every gesture action to be available by mouse or keyboard (click, drag, arrow keys, shortcuts), so that the site is accessible.
16. As a visitor coming from the portfolio, I want deep links such as `?mode=draw`, so that I land straight in a specific demo.

### Author, as the ML learner and engineer
17. As the author, I want a debug panel showing tracking FPS, render FPS, per-frame latency (detect and gesture, p50/p95), current pose and confidence, and a rules/model toggle, so that I can see performance and compare classifiers live.
18. As the author, I want a recorder mode (choose label, countdown, about 10 s capture subsampled to about 10 Hz, tagged with participant, lighting and session) that exports landmark-only JSON locally, so that I can build my own dataset.
19. As the author, I want a single Python command that trains rules, k-NN and an MLP and evaluates them leave-one-person-out and on held-out sessions, so that my results are reproducible.
20. As the author, I want the trained MLP to run in the browser through a hand-written TypeScript forward pass that is proven to match PyTorch, so that inference is tiny, fast and understood.
21. As the author, I want an eval script that measures false clicks per minute on a fidget recording and TypeScript inference latency, and then regenerates the README results table, so that the published numbers never drift from the code.
22. As the author, I want a hidden `?mode=benchmark` page with 20 sequential targets that records hits, misses and time, so that I can measure click success rate for each classifier.
23. As the author, I want automated tests that run without a camera (recorded landmark fixtures), so that I can do TDD on real-time logic and run CI.
24. As a GitHub visitor, I want a README with a demo GIF, a "Try it" link, an architecture diagram, the results table and a "what I learned" section, so that I understand the project in a minute.
25. As a GitHub visitor, I want the landmark dataset and a datasheet in the repo, so that I can reproduce the results.

## 4. Modules

There are a few deep modules, each with a small interface. Arrows show the data flow:

```
tracker ──HandFrame──▶ gestures (uses classifier) ──GestureOutput──▶ input ──Action──▶ modes
                                     │                                   ▲
                                     └──▶ debug, recorder                mouse / keyboard
```

### 4.1 `tracker`: camera and MediaPipe → hand frames
- **In:** `createTracker(source)`, where `source` is `'camera'` or `{ fixture: HandFrame[] }`.
- **Out:** `{ start(): Promise<void>, stop(), onFrame(cb: (f: HandFrame | null) => void), onStatus(cb) }`.
  - `HandFrame = { landmarks: Array<21 × {x, y, z}>, handedness: 'Left' | 'Right', timestamp: number }`.
  - `start()` rejects with a typed `TrackerError`: `denied | no-camera | in-use | unsupported | model-load-failed`.
- **Inside:** `getUserMedia`; loading the self-hosted MediaPipe WASM and `.task` model in VIDEO mode with `numHands: 1`; GPU delegate with CPU fallback; 640×480 input; adaptive quality (sustained tracking FPS under 20 for 2 s → 480×360 → detect every other frame, reported through `onStatus`); stopping and resuming when the tab is hidden or visible; the fixture player (the same interface, replaying recorded timestamps).

### 4.2 `classifier`: landmarks → pose
- **Type:** `Classifier = (landmarks, handedness) => { label: Pose, confidence: number }`, where `Pose = 'none' | 'point' | 'pinch' | 'open_palm' | 'fist'`.
- **Implementations:** `rulesClassifier`, plus `mlpClassifier(weightsJson)`, a hand-written forward pass: 63 → 64 → 32 → 5, ReLU, softmax.
- **Exposes:** `toFeatures(landmarks, handedness): Float32Array`. It translates to the wrist, scales by palm size (wrist to middle-finger knuckle), mirrors left hands to right and flattens. It is shared by the recorder, eval and parity tests, and must match the Python implementation exactly.

### 4.3 `gestures`: frame stream → cursor and events (pure, driven by frame timestamps, no wall clock)
- **In:** `createGestureEngine(config, classifier)`, then `update(frame: HandFrame | null)` once per frame.
- **Out:** `GestureOutput = { cursor: {x, y} | null /* normalised 0..1 */, pose, events: GestureEvent[] }`, with `GestureEvent = press | release | click | swipe-left | swipe-right | pause | clear`.
- **Inside:**
  - mirroring
  - inner ~70% of the frame mapped to the full screen
  - One Euro filter
  - pinch hysteresis on palm-normalised thumb–index distance
  - pinch confirmation frames
  - cursor lock at the position from about 100 ms before the pinch
  - click cooldown
  - model confidence gating
  - open-palm-still hold (1 s → pause) and fist hold (1 s → clear)
  - swipe detector (palm velocity and displacement, cooldown, mirror-corrected)
  - full reset when the hand is lost

### 4.4 `input`: gestures, mouse and keyboard → app actions
- **In:** `push(gestureOutput)`, plus native mouse and keyboard listeners attached to a root element.
- **Out:** `onAction(cb)`, where `Action = pointer-move | press | release | click | next | prev | pause | clear`, carrying `{x, y, source: 'gesture' | 'mouse' | 'keyboard'}` where relevant.
- **Inside:** The virtual pointer. It hit-tests the element under the hand cursor and dispatches hover, focus and click to it, so ordinary `<button>`s work by gesture. Keyboard shortcuts map to the same actions (arrows → next/prev, etc.). Modes never know the source.

### 4.5 `modes`: Draw, Slides, Catch, Benchmark
- **Interface:** `Mode = { mount(el), unmount(), handle(action: Action), tick(dt) }`.
- **Logic:** Each mode's logic is a pure state function, e.g. `drawReduce`, `slidesReduce(state, action)`, `catchStep(state, dt, catcherX)`, `benchmarkReduce`. DOM and canvas code is a thin rendering layer.
- **Draw:** press/release = pen down/up; 5-colour palette; Clear button; `clear` action.
- **Slides:** about 8 slides about this project; `next`/`prev` actions.
- **Catch:** the palm is the hitbox (the mouse moves the catcher as a fallback); 30 s timer; difficulty increases over time; `pause` pauses the timer; high score in localStorage.
- **Benchmark:** hidden, `?mode=benchmark`; 20 sequential targets; records hits, misses and time per target; shows the result to copy into `metrics.json`.

### 4.6 `app`: shell, wiring and screens
- Landing page with "Try it" and the privacy line.
- Permission and error screens, each with "Use mouse instead" and "Watch a demo".
- Model-loading progress, with the download starting as soon as "Try it" is hovered or clicked.
- 3-step onboarding overlay (skippable, remembered in localStorage).
- Mode menu, the skeleton and cursor overlay renderer, the Stop camera button.
- URL parameters: `?mode=` and `?source=fixture:<name>`.
- Mostly wiring, covered by Playwright.

### 4.7 `debug`: stats panel
- **In:** `record({ detectMs, gestureMs, pose, confidence })` on each frame, plus status from the tracker.
- **Out:** A rendered panel showing tracking and render FPS, p50/p95 latency, pose and confidence, the rules/model toggle, and the performance-mode badge. The rolling-statistics part is pure.

### 4.8 `recorder`: dataset capture
- **In:** `start(label, { participant, lighting, session })`, then `push(frame)`, then `stop()`.
- **Out:** `export(): Blob`, a local JSON download in dataset schema v1: `{ schemaVersion, label, participant, handedness, lighting, session, timestamp, landmarks }`. Landmarks only, never images. Subsampled to about 10 Hz.

### 4.9 `training/` (Python): dataset → weights and metrics
- **Command:** `python -m training.train` reads `training/data/*.json`.
- **Writes:** `mlp-weights.json` (loaded by the app), `parity-vectors.json` (about 50 inputs with expected outputs), `metrics.json`, and confusion-matrix PNGs.
- **Evaluates** rules (a Python port), k-NN and the MLP with:
  - leave-one-person-out across however many participants exist
  - a held-out-session split within each person
- **Splits:** Generated from metadata and frozen in `splits.json`.

### 4.10 `eval` (Node script): UX metrics and README table
- **Command:** `npm run eval`.
- **Measures:**
  - False clicks per minute, by replaying the fidget fixtures through `gestures` with each classifier.
  - TypeScript inference latency (p50/p95).
- **Then:** Merges these with the Python metrics and the benchmark results in `metrics.json`, and regenerates the README results table.

## 5. Implementation decisions

| Decision | Why |
|---|---|
| The demo comes first. Rules and model share one `Classifier` interface. Each gesture ships with whichever wins on the held-out test set, and the README states the mix. | Recruiters judge the demo, not the confusion matrix. An honest comparison reads as more senior than a forced model. |
| Plain TypeScript + Vite, no UI framework. Vitest for unit tests, Playwright for end-to-end. | The per-frame hot path must hold 30+ FPS, and a framework's re-render cycle doesn't fit it. The UI is small. Pure logic fits TDD. |
| A single action stream (`input`) merges gesture, mouse and keyboard. | The accessible fallback comes for free, and modes stay independent of the input source. |
| Classifier poses are `none, point, pinch, open_palm, fist`, with an explicit `none` class trained on hard negatives. | Without `none`, every random hand shape gets forced into an action class, which causes false clicks. |
| Swipes use velocity rules, not the classifier. | Swipes are motion, not a pose. Keeping the classifier to single frames keeps it small and comparable to rules. |
| Pause means an open palm held *still* for 1 s; swipe needs *speed*. `pause` is an action that each mode interprets. | Makes pause and swipe mutually exclusive, and avoids a global "gestures off" state that is hard to undo by gesture. |
| False-click defences: palm-normalised pinch hysteresis (close below ~0.25, open above ~0.40), 2–3 confirmation frames, cursor lock from ~100 ms before the pinch, ~300 ms click cooldown, confidence gating, visual hover and pinch feedback. | Reliability is what makes it feel like magic. Cursor lock fixes the pinch pulling the cursor off its target. |
| One Euro filter for cursor smoothing. Inner ~70% of the frame mapped to the full screen. Mirrored video. One hand. Left hands mirrored before classifying. | Steady when still, responsive when fast, edges reachable, works for either hand. |
| MLP inference is a hand-written TypeScript forward pass from JSON weights. No ONNX Runtime Web or TF.js. | The model has only a few thousand parameters, so a multi-MB runtime isn't worth it, and writing it is part of the learning goal. |
| Training in `training/` with `uv`, PyTorch from the cu128 wheel index (RTX 5070 / Blackwell sm_120), automatic CPU fallback, fixed seeds, one command. | Reproducible by anyone. The GPU isn't needed for a model this small, and the README says so honestly. |
| Data: 2 participants, at least 4 sessions each (different days, 3 lighting conditions, near and far, both hands), about 600 samples per class per person, hard negatives for `none`, consent obtained. | Only 2 people are available. Variety between sessions partly makes up for that. |
| Evaluation headline is leave-one-person-out in both directions plus the average. Second is a held-out-session split. Never split by frame. | Every real visitor is an unseen person. Splitting by frame leaks near-duplicates and inflates accuracy. |
| Metrics: per-class precision/recall, macro-F1, confusion matrix, browser inference latency p50/p95, false clicks per minute, click success rate (benchmark mode). The README table is generated from `metrics.json`. It states n = 2. | Measures UX, not just accuracy. Published numbers can't drift from the code. |
| Privacy: the camera is requested only after "Try it"; the MediaPipe assets are self-hosted; a CSP in `vercel.json` sets `connect-src 'self'`; no analytics; recorder exports are local downloads only. | The privacy claim is enforced by the browser, not just stated. Matches the CLAUDE.md rule against sending frames or landmarks off the device. |
| Every failure screen offers "Use mouse instead" and "Watch a demo" (fixture playback). | Visitors without a usable camera still see the magic. It reuses the test fixtures. |
| Detection runs separately from rendering. Adaptive quality is shown with a badge. The model download starts when "Try it" is hovered or clicked. | Degrade gracefully and visibly on slow devices. |
| Dataset published in `training/data/` under CC BY 4.0 with a datasheet; anonymised IDs (`p01`, `p02`); landmarks only. | Makes the results reproducible from a clone. |
| Hosting: free Vercel at `air-control-koee.vercel.app`. GitHub Actions runs CI. Vercel deploys from `main`. | Zero cost, public repo. |
| Build order (vertical slices): (1) tracer bullet: Try it → camera → skeleton + FPS → deployed, with error screens; (2) fixture player + "Watch a demo"; (3) cursor + pinch-click; (4) mode menu + Draw; (5) Slides; (6) Catch; (7) debug panel. That is a shippable rules-only demo. Then (8) recorder; (9) training + TypeScript inference + parity; (10) rules-vs-model toggle, eval, benchmark, README table; (11) polish: onboarding, adaptive performance, CSP, README GIF and diagram, portfolio case file. | Every slice is visible end to end. The demo exists before the ML work starts. |

## 6. Testing decisions

| What | Boundary | How / fixtures |
|---|---|---|
| One Euro filter, pinch hysteresis, swipe detector, hold timers, cursor mapping and lock, hand-lost reset | `gestures` (pure) | Vitest, TDD. Synthetic `HandFrame` sequences with controlled timestamps. |
| End-to-end gesture behaviour | `gestures.update()` fed by fixtures | Recorded landmark fixtures (JSON `HandFrame[]` with real timestamps): `pinch-twice`, `swipe-left`, `swipe-right`, `fidget-10s`, `hand-leaves-mid-pinch`, `open-palm-hold`, `fist-hold`. Assert the exact event sequence, e.g. `fidget-10s` produces 0 clicks. |
| Feature normalisation | `classifier.toFeatures` | Unit tests: invariance to translation and scale, left/right mirroring. |
| Rules classifier | `classifier` | Unit tests on representative frames, one per pose, taken from fixtures. |
| MLP parity with PyTorch | `mlpClassifier` | `parity-vectors.json` (about 50 inputs with PyTorch outputs) → TypeScript output within 1e-5. |
| Action merging and the virtual pointer | `input` | Vitest with jsdom: gesture output and mouse/keyboard events → the same `Action`s; hit-testing dispatches click to the button under the cursor. |
| Mode logic | `drawReduce`, `slidesReduce`, `catchStep`, `benchmarkReduce` | Pure state-transition unit tests. |
| Rolling stats | `debug` stats core | Unit tests for FPS and p50/p95. |
| Recorder output | `recorder` | Unit test: frames in → schema-v1 JSON, ~10 Hz subsampling, no image data. |
| Camera failure handling | `tracker` | Mock `getUserMedia` rejections (`NotAllowedError`, `NotFoundError`, `NotReadableError`) → correct `TrackerError` kind. |
| Full app smoke | `app` via Playwright | `?source=fixture:<name>` drives the full pipeline with no camera. Mouse-only run of every mode proves the accessible fallback. Error screens render, and their two buttons work. |
| Python training | `training/` | pytest for feature parity with TypeScript (shared vectors), and checks that splits contain no person or session overlap. |
| CI | GitHub Actions | `npm run typecheck`, `npm test`, Playwright on every push. |

Live-camera behaviour, real lighting and latency on real hardware are QA'd by hand using the debug panel. They are not automated.

## 7. Out of scope

- Two-hand gestures, sign-language recognition, face or body tracking.
- Accounts, saving drawings to a server, multiplayer, any backend or paid API.
- Native or mobile apps. No effort is spent on mobile browsers. Browsers other than Chrome and Edge desktop get a "works best in Chrome/Edge" note but aren't tested.
- Gestures defined by users. The classifier doesn't handle dynamic gestures (swipes stay rule-based).
- Personal in-browser calibration (k-NN adapted to each visitor) is **parked** as a stretch goal after slice 10.
- ONNX Runtime Web or TF.js.
- Analytics beyond, at most, Vercel page views; any network call that sends frames or landmarks off the device.
- Embedding in the portfolio through an iframe. The portfolio links to the site instead.
- Publishing the data of any participant who hasn't consented.
- A custom paid domain.

**Done means:** live on Vercel with a public GitHub repo. The README has a demo GIF, a "Try it" link, an architecture diagram, the generated results table (n = 2 stated) and "what I learned". The project is added as a case file on the portfolio with Live and Repo links.
