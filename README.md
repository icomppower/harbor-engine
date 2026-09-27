# Harbor Engine

**Harbor Engine — built on Tidewater.** A WebGPU/WGSL engine for real-data waterfronts: FFT ocean with
shore waves and wakes, physically based sky, atmosphere and clouds, post-processing, a walker, a free camera and
a vessel with its autopilot, plus the offline pipelines that turn public datasets (DEMs, bathymetry, building
footprints, aerial imagery, Blender landmarks, published routes) into baked tiles, and the gate framework that
proves each step. No three.js: the renderer is its own.

Each map is its own **title** repo that pins an engine version; each game is its own **game** repo; the portal
is `harbor-site`. The contract between them is [`docs/ENGINE.md`](docs/ENGINE.md).

```sh
npx github:icomppower/harbor-engine#v1.0.0 new-title my-harbour   # a title with placeholder data
cd my-harbour && npm run dev
```

| Title | Live |
|-------|------|
| [bay-crossing](https://github.com/icomppower/bay-crossing) | https://icomppower.github.io/bay-crossing/ |

## Engine gates

`./verify.sh` runs E0–E4 (`gates/gates.json`); every gate first proves its negative fixtures fail. State is in
`STATE.md`, frozen thresholds in `SPEC-THRESHOLDS.md`.

## Licence

MIT. Built on [Tidewater](https://github.com/dgreenheck/tidewater) (MIT); see `CREDITS.md`.
