# 003: Camera failure screens and Stop camera

type: AFK
blocked_by: 002
prd: §4.1 tracker (TrackerError), §4.6 app, user stories 12–13

## What to build
- `tracker.start()` rejects with a typed `TrackerError` of kind `denied | no-camera | in-use | unsupported | model-load-failed`, mapped from `NotAllowedError`, `NotFoundError`, `NotReadableError`, missing `mediaDevices` or an insecure context, and model init failure.
- A friendly screen for each kind. `denied` explains how to re-enable the camera in Chrome or Edge. Every screen has a **"Use mouse instead"** button that enters the app with no camera (for now: an empty stage with a normal mouse pointer).
- A **Stop camera** button that stops all media tracks and returns to the landing page.
- When the tab is hidden, stop the tracks and detection. When it's visible again, resume.

## Acceptance criteria
- [ ] Unit tests with a mocked `getUserMedia` cover every error mapping.
- [ ] Manual check: blocking the camera in site settings shows the denied screen; Use mouse instead works.
- [ ] Stop camera turns off the camera light. Switching tabs and back resumes tracking.
- [ ] Tests, typecheck and build pass.
