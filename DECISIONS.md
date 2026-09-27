# Decisions

SPEC §3 decisions (D1–D7) are in `SPEC.md` / Notion. New ones, one line each:

- **D8** Extracted from `icomppower/bay-crossing` at `884246a` (D5); Tidewater upstream stays pinned at `1438b1a`.
- **D9** Map config enters the runtime once, through `configureMap( map )`, which fills the engine's shared
  world objects (Frame, WorldLayout, VesselSpec, Places, Waypoints) in place; modules read them at run time, never
  at import time. Node gates import `tools/lib/configured.mjs`.
- **D10** Pipelines are engine code that read the title's `map.json` (frame, cached file names, planner
  settings, palettes); dataset-specific parsing lives in the title's `hooks.js` (`collectBuildings`,
  `prepareLandmarks`) and `pipelines/` (fetch source list, schedule prep, Blender script).
- **D11** Engine runtime assets (cloud noise, CC0 audio) live in `assets/`; the Vite plugin
  (`harbor-engine/vite`) serves them in dev and copies them into a title's build; the headless harness reads
  the title's `public/` first, then `assets/`.
- **D12** The contract is validated by a dependency-free JSON-schema subset (`src/map/validate.js`) so the same
  check runs in the browser, pipelines and gates; `schema/*.json` are generated from `src/map/schema.js`.
- **D13** E1's name/coordinate scan takes its terms from every downstream title's own `map.json`, so the engine
  never has to store the names it is forbidden to contain.
- **D14** E0's look tolerance: the noise floor between two renders of the same build is 0 (headless Dawn on the
  M4 is bit-exact); frozen at mean |Δ| ≤ 0.5 levels and ≤ 0.1 % of pixels off by > 8 levels.
- **D15** During development the title links the engine (`file:../harbor-engine`); `v1.0.0` is tagged only
  after E0–E4 are green, then the title switches to `github:icomppower/harbor-engine#v1.0.0` and E0 runs again on
  the installed release.
