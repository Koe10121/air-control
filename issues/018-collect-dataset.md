# 018: Collect the dataset

type: HITL
blocked_by: 017
prd: §5 data decisions, §4.9

## What to do (human)
- Get consent from the second participant: landmark coordinates only, which may be published in a public repo under CC BY 4.0, as anonymised `p02`.
- Each person records **at least 4 sessions** on different days, covering the 3 lighting tags, near and far from the camera, different angles, and both hands roughly equally.
- Target about **600 samples per class per person** (5 classes), with plenty of hard negatives for `none`.
- Put the exports in `training/data/` (the published dataset). `training/data/raw/` is ignored by git and is for private scratch files.

## Acceptance criteria
- [ ] `training/data/` contains sessions from `p01` and `p02`, with at least 4 sessions each and roughly balanced classes.
- [ ] Consent is recorded (it doesn't need to be committed). Participant IDs are anonymised in the files.
