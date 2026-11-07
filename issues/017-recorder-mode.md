# 017: Recorder mode

type: AFK
blocked_by: 008
prd: §4.8 recorder, user story 18

## What to build
- A hidden `?mode=record` page (not listed in the mode menu).
- Controls: label (`none | point | pinch | open_palm | fist`), participant ID (`p01`, `p02`, …), lighting (`daylight | lamp | dim`), session ID, and a Record button.
- Recording: a 3 s countdown, then about 10 s of capture, subsampled to about 10 Hz. A live sample count, and a list of the clips captured this session.
- Export: one JSON download per session, dataset **schema v1**:
  `{ schemaVersion: 1, samples: [{ label, participant, handedness, lighting, session, timestamp, landmarks }] }`.
  **Landmarks only, never images.** The download happens locally; no network.
- Tips shown for the `none` class: "fidget, scratch, hold a mug, move between poses".

## Acceptance criteria
- [ ] TDD unit tests: frames in → schema-v1 JSON; subsampling to ~10 Hz; `null` frames skipped; no image data present.
- [ ] Manual check: recording 10 s gives about 100 samples in a downloaded file.
- [ ] Works in fixture mode, so it can be tested without a camera.
