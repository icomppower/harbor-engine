# Calibrated thresholds (frozen)

Measured at first run and frozen (SPEC §5). Each line: key, value, how it was measured. Never lowered to pass;
changing a frozen value needs a BLOCKED.md.

- `e0.look.meanAbsLevels`: 0.5 — max mean |Δ| per channel (0–255) vs the pre-extraction G6 shots; noise floor measured 0.000 over two renders of 884246a (bit-exact)
- `e0.look.pixelsOver8`: 0.001 — max fraction of pixels off by > 8 levels per channel on average; noise floor 0
