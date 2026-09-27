# Run log

| Date | Gate | Result | Notes |
|------|------|--------|-------|
| 2026-09-26 | E4 | PASS | new-title → install, build, G1 green on placeholder island; 3/3 negatives (broken template map, missing entry, missing terrain) |
| 2026-09-26 | E1 | PASS | 71 required map fields + 5 game fields each rejected by name; schema files in sync; 0 title terms in 240 engine files; 5/5 negatives |
| 2026-09-26 | E2 | PASS | bay-crossing + placeholder × low/mobile/high × ferry/fly at default limits: 0 failures; forced over-limit shader stops boot with the clear message, setPipeline(null) × 0; 7/7 negatives |
| 2026-09-26 | E3 | PASS | Pixel 7 emulation, full Chromium new-headless WebGPU: plain drag, drag after a lost touchend, drags on/beside HUD panels all turn 0.198 rad; fixes: capture-phase touch listeners (UI._isolate ate touchstart on panels), release lost/reused touch ids; 2/2 negatives |
| 2026-09-26 | E0 | PASS | bay-crossing on the engine: 396 baked files + 47 moved assets byte-identical, title G0–G7 green, G6 shots bit-exact (mean |Δ| 0.0000, tol 0.5 frozen), live URL serves it; 3/3 negatives (water palette, changed tile, engine code in title) |
| 2026-09-26 | milestone-A | PASS | E0–E4 green in one run; v1.0.0 tagged; E0 green again on the installed release; live bay-crossing rebuilt on v1.0.0 and boots |
| 2026-09-27 | E1 | PASS | v1.1.0 candidate: optional frame.cell added (71 required fields still each rejected by name), schema files in sync, Models.js exports; 5/5 negatives |
