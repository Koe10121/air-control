# Brief: Air Control

> This is the raw idea, the input to a grilling session, not a spec.
> Workflow: `/grill-me @brief.md` → `/write-prd` → `/prd-to-issues` → `ralph-once.ps1` (repeat) → QA.

## The idea

A website where you control things with your hands through the webcam. No mouse, no touch.
Raise your hand, and a cursor follows your index finger. Pinch to click. Swipe to go next or back.
Open palm to pause. It should feel like magic the first time someone tries it.

## Who it's for

- **Recruiters and visitors to my portfolio** (koe-portfolio.vercel.app). They should be able to try it
  in under 10 seconds from a "Try it" button, on a normal laptop webcam, without installing anything.
- **Me, as an AI engineering learning project.** I want to learn real-time computer vision,
  collecting my own data, training a small model and measuring it properly.

## What I want people to be able to do

1. Allow the camera and see their hand skeleton drawn live over the video.
2. Move a cursor with their finger and "click" buttons by pinching.
3. Try three demo modes:
   - **Air draw:** draw in the air, change colour, clear the canvas.
   - **Slides:** swipe left and right through a short deck (a deck about this project).
   - **Catch game:** catch falling objects with your hand; score and a 30-second timer.
4. Open a debug panel: FPS, latency per frame, detected gesture, model confidence.

## The AI engineering part (the reason this project exists)

- Hand landmarks come from a pretrained model (MediaPipe Hand Landmarker) running in the browser.
- Simple gestures (pinch, point) can be rules on landmark distances.
- Then **train my own gesture classifier** on landmarks I record myself (record mode in the app → export
  JSON → train a small model in Python on my RTX 5070 → export to the browser).
- Compare rules vs my model on a held-out test set: accuracy, confusion matrix, latency.
  Publish the numbers in the README.

## Constraints

- Runs 100% in the browser. Video never leaves the device (say so on the page).
- Static site, free hosting on Vercel. No backend, no paid APIs.
- Must hold 30+ FPS on a mid-range laptop; degrade gracefully on slow devices.
- Works in Chrome and Edge on desktop. Mobile is a nice-to-have, not required.
- Accessible fallback: everything that can be done by gesture can also be done by mouse or keyboard.
- I'm on Windows. Python training uses my RTX 5070 Laptop (8 GB), so it needs a CUDA 12.8+ PyTorch build.

## Not in scope (for now)

- Two-hand gestures, sign-language recognition, face or body tracking.
- Accounts, saving drawings to a server, multiplayer.
- A native or mobile app.

## Done looks like

- Live on Vercel with a public GitHub repo.
- README: demo GIF at the top, "Try it" link, architecture diagram, the model results table,
  and a "what I learned" section.
- Added as a case file on my portfolio with Live + Repo links.

## Questions I haven't answered yet (grill me on these)

- Plain JS + Vite, or a framework? How should the code be split into modules so it's easy to test?
- Which gestures, exactly, and how do I avoid false clicks (debounce, hold time, confidence threshold)?
- How many samples per gesture do I need, from how many people, in what lighting?
- What model: k-NN, small MLP, or something else? How do I run it in the browser (ONNX, TF.js, hand-written)?
- How do I test real-time vision code automatically (recorded landmark fixtures instead of a live camera)?
- How do I handle the webcam permission being denied, or no camera at all?
- What's the smallest first vertical slice that's demo-able?
