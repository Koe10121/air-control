# Air Control

Browser app: webcam hand tracking + gesture control. See brief.md for the idea.

- Work in vertical slices: every change should be visible and testable end to end.
- Use TDD (red, green, refactor) for logic modules. Run `npm test` and `npm run typecheck` before committing.
- Prefer a few deep modules with small interfaces over many tiny files.
- Never add network calls that send camera frames or landmarks off the device.
