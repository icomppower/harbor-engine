# Harbor Engine — SPEC

The full brief is the Notion page **"Harbor Engine — core engine SPEC (Opus 5.5)"** (page
3e81f269eaea81a4930eea5080434611). This file keeps only what a session needs locally.

- **Goal:** one engine for different maps and games, split into repos: `harbor-engine` (this), `harbor-game-<id>`,
  title repos (`bay-crossing`, `potomac-crossing`, …), `harbor-site` (UI only). Contract: `docs/ENGINE.md`.
- **Milestone A (before DC):** E0–E4 green → tag `v1.0.0`, Notion status page, then the Potomac Crossing SPEC.
- **Milestone B (after DC is DONE):** E5–E7 green → tag `v1.1.0`.
- **Gates:** E0 extract without change (oracle) · E1 contract · E2 baseline-GPU compile · E3 mobile look ·
  E4 title template · E5 fishing game repo · E6 map without a city · E7 downstream check. Each fails on a
  negative fixture first. *calibrate* values are frozen in `SPEC-THRESHOLDS.md`.
- **Protocol:** lowest non-green gate → prove the negative fails → implement → `./verify.sh` → STATE.md →
  RUNLOG.md line → commit `<gate>: <pass|fail> — <summary>`. Stop with `BLOCKED.md` + a Notion page on 3 failed
  attempts in a row, manual data, or a frozen threshold / decision change.
- **Guardrails:** Mac mini M4 16 GB, one browser, never Blender and a dev server together, no subagents, never
  lower a threshold to pass.
