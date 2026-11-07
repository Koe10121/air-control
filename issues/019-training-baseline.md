# 019: Training baseline: rules vs. k-NN

type: AFK
blocked_by: 018
prd: §4.9 training, §5 (evaluation design, CUDA), §6

## What to build
- A `training/` Python project managed with **uv**. PyTorch is pinned from the **cu128** wheel index (RTX 5070 Laptop, Blackwell sm_120), with automatic CPU fallback. Also scikit-learn, numpy and matplotlib. Fixed seeds.
- `training/features.py`: `to_features(landmarks, handedness)` (wrist origin, palm-size scale, left hands mirrored to right, flattened to 63 numbers). The TypeScript version in 020 must match it exactly.
- Data loading for schema v1 from `training/data/*.json`, with validation.
- `splits.json` generated from the metadata:
  - **leave-one-person-out**, in both directions
  - a **held-out-session** split within each person
  - **never split by frame**
- Classifiers evaluated:
  - a Python port of `rulesClassifier`, kept faithful to the TypeScript version
  - k-NN (sklearn)
- `python -m training.train` writes `training/out/metrics.json` (per-class precision and recall, macro-F1, for each split and each classifier) and confusion-matrix PNGs.
- pytest:
  - feature invariances
  - no overlap of person or session across a split's train and test sets
  - a tiny synthetic dataset to smoke-test the pipeline

## Acceptance criteria
- [ ] `uv run python -m training.train` runs from a clean clone and prints a summary table.
- [ ] `torch.cuda.is_available()` is reported, and the CPU fallback works.
- [ ] `uv run pytest` passes.
- [ ] `metrics.json` and the PNGs are produced.
