# 020: MLP in the browser (train → export → live toggle)

type: AFK
blocked_by: 019, 012
prd: §4.2 classifier (mlpClassifier, toFeatures), §5 (hand-written forward pass), §6 parity

## What to build
- Python: an MLP 63 → 64 → 32 → 5 (ReLU, softmax) trained with PyTorch. Evaluate it on the same splits as 019 and add it to `metrics.json`. For the shipped model, train on all the data.
- Export:
  - `public/models/mlp-weights.json` (layer shapes plus the weights)
  - `parity-vectors.json`: about 50 raw-landmark inputs with their features and PyTorch output probabilities
- TypeScript:
  - `toFeatures` in the `classifier` module
  - `mlpClassifier(weightsJson)`: a hand-written forward pass, with no ML dependency
- Parity tests:
  - TypeScript features match Python features within 1e-6
  - TypeScript outputs match PyTorch outputs within 1e-5
- Debug panel: a **rules / model** toggle that swaps the classifier used by the gesture engine at runtime.

## Acceptance criteria
- [ ] Both parity tests pass in `npm test`.
- [ ] The weights file is small (well under 100 KB) and loads from the site's own origin.
- [ ] Manual check: toggling to model in the debug panel changes the pose source, the confidence shown is the model's, and FPS stays at 30 or above.
