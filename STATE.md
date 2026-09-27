# State

| Gate | Status | Last run | Notes |
|------|--------|----------|-------|
| E0 Extract without change | — | — | |
| E1 Contract | PASS | 2026-09-26 | 71 required map fields + 5 game fields each rejected by name; schema files in sync; 0 title terms in 240 engine files; 5/5 negatives |
| E2 Baseline-GPU compile | PASS | 2026-09-26 | bay-crossing + placeholder × low/mobile/high × ferry/fly at default limits: 0 failures; forced over-limit shader stops boot with the clear message, setPipeline(null) × 0; 7/7 negatives |
| E3 Mobile look | PASS | 2026-09-26 | Pixel 7 emulation, full Chromium new-headless WebGPU: plain drag, drag after a lost touchend, drags on/beside HUD panels all turn 0.198 rad; fixes: capture-phase touch listeners (UI._isolate ate touchstart on panels), release lost/reused touch ids; 2/2 negatives |
| E4 Title template | PASS | 2026-09-26 | new-title → install, build, G1 green on placeholder island; 3/3 negatives (broken template map, missing entry, missing terrain) |
| E5 Fishing game repo | — (Milestone B) | — | |
| E6 Map without a city | — (Milestone B) | — | |
| E7 Downstream check | — (Milestone B) | — | |

## Current

Milestone A in progress.
