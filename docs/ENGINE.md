# Harbor Engine contract (v1)

Harbor Engine is the shared runtime, pipelines and gates for real-data waterfront titles. Three kinds of repo
use it, and none of them edits engine code (D4):

| Repo | Owns | Talks to the engine through |
|------|------|-----------------------------|
| **title** (`bay-crossing`, `potomac-crossing`, …) | one map: `map.json`, `hooks.js`, baked `public/`, gates | `map.json`, `hooks.js`, `boot()`, the pipelines' CLIs, `gates/lib/*` |
| **game** (`harbor-game-<id>`) | rules + HUD for one game | `game.json`, `registerGame()` |
| **site** (`harbor-site`) | the portal | nothing (links only) |

A breaking change to anything on this page needs a major version (D4). Titles pin a version in
`package.json` (`github:icomppower/harbor-engine#v1.x.y`); `npm run engine:update` bumps it and runs the
title's full `./verify.sh` (D3).

## 1. Title layout

```
map.json            the map (schema/map.schema.json)
hooks.js            pipeline hooks (Node only), §3
index.html          page shell + loader markup
src/main.js         import map; boot( { map } )
vite.config.js      plugins: [ harborEngine() ]   (serves the engine's assets/ next to public/)
public/             baked data: terrain/, buildings/, landmarks/, ferry/, ui/
data/raw/           checksummed download cache (git-ignored), MANIFEST.sha256, sources.json
pipelines/          title-only scripts: data/fetch.mjs (SOURCES), landmark Blender script, schedule prep
gates/              gates.json + <id>.mjs gate scripts; verify.sh runs them
```

`npx harbor-engine new-title <id>` writes all of it with placeholder data (a procedural island) that builds and
passes G1.

## 2. `map.json`

Validated on load (`configureMap`, the pipelines, the CLI). A missing or malformed field fails with the path,
e.g. `map.json is invalid: missing required field "frame.originE"`.

| Field | Meaning |
|-------|---------|
| `id`, `name` | repo id (`[a-z0-9-]`), display name |
| `frame` | `crs`, `utmZone`, `hemisphere`, `originE`, `originN` (UTM metres, centre of the world square), `size` (m), optional `cell` (terrain grid cell in m, default 3; v1.1). World frame: x east, z south, y up, sea level (local MSL) y = 0; terrain grid `cell` m cells, 200-cell tiles |
| `bbox`, `slice` | WGS84 box; UTM extent of the slice |
| `sources[]` | `id`, `file`, `licence`, `url` for every dataset (CREDITS.md repeats them) |
| `terrain` | cached file names: `land` DEM, `sea` DEM, `datum` (tide-station datums JSON, MSL vs NAVD88), `datumStation`, `aerial` (NAIP GeoTIFF for the ground colour map) |
| `controlPoints[]` | georeference points (`name`, `lat`, `lon`, `ref`) the title's G3 checks |
| `vessel` | published dimensions of a real vessel on the route: `length`, `beam`, `draft`, `topSpeedKn`, `hullWidth`, `hullSpacing`, `deckY`, `mass`, `source` |
| `route` | `file` (public path), `schedule`, `from`, `to`, `source`; `planner` for `tools/ferry/route.mjs`: `fromTerminal`, `toTerminal` (keys of the schedule's `terminals`), `piersOsm`, `datums` { MSL, MLLW }, `datumNote` |
| `landmarks[]`, `landmarkScript` | modelled landmarks (`slug`, `name`); the title's Blender script |
| `water` | `preset` (`bay`, `calm-river`, `still-pool`, `ocean`), `swellDir` [x, z], `optics` { absorption, scattering } per metre (r g b) |
| `sun` | `latitude`, `declination` (time of day = local solar time) |
| `palettes` | `walls` { name: [[r,g,b]…] } incl. the typed sets `tower`, `mid`, `house`, `pier`; `roofs` { name: … } |
| `layout` | `anchorUTM` [E, N]; `pier`, `boatDock`, `start` as offsets from it; optional `reef` |
| `places[]` | sign labels: `name`, `x`, `z`, `model`, `r`, `waypoint` |
| `waypoints[]` | ≤ 9 viewpoints: `name`, `eye` [x,y,z], `at` [x,y,z] (keys 1–9) |
| `ui` | `title`, `autopilot` (toast), `autopilotHelp`, `howToPlay` |
| `capabilities[]` | what the map provides for games: `water`, `vessel`, `route`, `buildings`, `landmarks`, `habitats`, `spawnZones` |
| `games` | `default` (`sightseeing` is built in), `available[]` |
| `streaming` | reserved, must be `false` in v1 (D6) |

## 3. `hooks.js` (pipelines, Node only)

| Hook | Called by | Contract |
|------|-----------|----------|
| `collectBuildings( kit )` → `{ log, excluded }` | `tools/buildings/build.mjs` | read the title's datasets (`kit.readJSON( file )`, checksummed cache) and call `kit.finish( id, polys, roofAbove, roofAbs, style )` once per building. `polys` = `[[outer, …holes]]` in frame metres (`kit.local( lat, lon )`), `roofAbs` = roof above local MSL or `null` (then ground + `roofAbove`), `style` = `{ walls: palette name or null (typed by class), roofs: palette name, naip: kit.naip( file ) or null, src }`. Helpers: `cleanRing`, `inside`, `area2`, `landmarkAnchors()` (footprints a landmark replaces), `msl`, `DEFAULT_HEIGHT`, `LEVEL_HEIGHT`. Log every fallback height in `log` |
| `prepareLandmarks( { rawDir, grid, mergeHeights } )` → `{ landmarks: [{ slug, name, anchor, ground, … }] }` | `tools/landmarks/build.mjs` | Blender inputs; the runner then calls the title's Blender script and indexes 3 LODs per landmark |

## 4. Pipelines (run from the title root)

| Script (`node_modules/harbor-engine/…`) | Reads | Writes |
|-----------------------------------------|-------|--------|
| `tools/data/fetch.mjs` → `fetchSources( SOURCES )` | the network | `data/raw/`, `sources.json`, `MANIFEST.sha256` |
| `tools/terrain/build.mjs` | `map.terrain` files | `public/terrain/` (+ `aerial.bin`) |
| `tools/buildings/build.mjs` | `hooks.collectBuildings` | `public/buildings/` |
| `tools/landmarks/build.mjs` | `hooks.prepareLandmarks`, Blender | `public/landmarks/` |
| `tools/ferry/route.mjs` | terrain, buildings, schedule, `route.planner` | `public/ferry/route.json` |
| `tools/placeholder/build.mjs` | `map.json` | placeholder `public/` |

All are deterministic (no clocks, no randomness, fixed zlib settings) and read only the checksummed cache.
Never run Blender while a dev server is up.

## 5. Runtime API (`import … from 'harbor-engine'`)

- `boot( { map, onReady } )` — configure the map, build the UI and App, run the loader.
- `configureMap( map )` — validate and apply a map (done by `boot`; Node gates import
  `harbor-engine/tools/lib/configured.mjs`).
- `registerGame( id, { requires, init, update, view } )` — D7. `requires` ⊆ the map's `capabilities`, or the
  game refuses to start with a clear message. `init( app )` → state (may be async), `update( app, dt, state )`
  every frame after the vessel and player, `view( app, state )` → HUD. The title selects a game with
  `map.games.default` or `?game=<id>`; `sightseeing` is built in. A map never imports a game.
- Members of `app` a game may use: `settings`, `qs`, `camera`, `scene`, `input`, `player`, `boat`,
  `boatCtl`, `autopilot`, `query` (water heights), `terrainData` (`heightAt`), `ferryRoute`, `ui`, `audio`,
  `goToWaypoint( i )`, `setFreeCam( on )`.
- Exports for gates and tools: `validateMap`, `validateGame`, `MAP_SCHEMA`, `GAME_SCHEMA`, `CAPABILITIES`,
  `FRAME`, `toLocal`, `toUTM`, `WORLD`, `VESSEL`, `WAYPOINTS`, `PLACES`, `ENGINE_VERSION`.
- v1.1 (additive): `loadLodModel( files, { lodDistances, refFov, name } )` → a Group of LOD levels from a title's own
  GLBs (Blender exports; PBR colour / roughness / metalness per material) that a game places and orients every
  frame and whose `update( camera )` picks the level by distance and lens; `glbGroup( arrayBuffer )`,
  `glbMaterial( gltfMaterial )`; `Material` (the engine material: WGSL `surface` / `vertex` snippets, uniforms) and
  `sceneMaterial( params )` (three.js-style parameters) for game-owned meshes such as markings and lights. A game
  that drives the camera itself sets it after `app.update` has run the player (its `update` is called after them).

## 6. `game.json`

`id`, `name`, `version`, `requires[]` (capabilities), `entry` (module that calls `registerGame`), optional
`engine` (semver range). Schema: `schema/game.schema.json`.

## 7. Gates

- `gates/verify.sh` runs `gates/gates.json` (`required`, `advisory`) in the calling repo. Each gate runs with
  `--negative` first (must exit non-zero and print `NEGATIVE n/n` with every mutation caught), then for real.
- `gates/lib/tiles.mjs` (`root` = title, `runOffline`, `compareDirs`, `decodeTerrain`), `thresholds.mjs`
  (`freeze` / `readThresholds` on the title's `SPEC-THRESHOLDS.md`; frozen values are never rewritten),
  `no-network.mjs`, `clean.mjs` (`runCleanGate`: build, dependency audit, headless ocean + sky render),
  `baseline.mjs` (`runBaselineGate`: every pipeline compiles and every frame validates at WebGPU default limits,
  with reverted-fix fixtures).
- `tools/headless/app.mjs` → `bootApp( { width, height, query } )` boots the real App in headless Dawn on the
  title's `public/`.
- Conventions: `STATE.md` (one row per gate), `RUNLOG.md` (one line per gate run), commit
  `<gate>: <pass|fail> — <summary>`, `BLOCKED.md` + a Notion page on 3 failed attempts / manual data / a frozen
  threshold change.
