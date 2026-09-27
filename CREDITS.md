# Credits

The code in this repository is released under the MIT license (see `LICENSE`). The third-party
assets below keep their own licences.

## Audio: `assets/audio/`

42 field recordings from [Freesound](https://freesound.org), all released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required, but every file is
credited with its author and source link in [`assets/audio/CREDITS.md`](assets/audio/CREDITS.md).

Recordists: YevgVerh, straget, Alex_hears_things, chris_dagorne, bruno.auzet, felix.blume, hdfreema,
richardemoore, KaleidacousticsAudio, AugustSandberg, kyles, Pfannkuchn, 200221-WeanBekker, florianreichelt,
Nox_Sound, ryansitz, SilentStrikeZ, SecureSubset, tbsounddesigns, qubodup, blaukreuz, wormer2, roboroo,
squashy555, Soojay, coalcon, dubminister, nathankwright, SorenF109, LaScienceMusicale, KEVOY, mikewest,
tosha73, paulprit, Mrthenoronha, mwchristian95, MrFossy, BranndyBottle, JoelMcDaniel, khenshom, ramattahatta,
RatBird and Anthousai.

## Fonts

[Inter](https://rsms.me/inter/) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) are both under the
SIL Open Font License 1.1. They are loaded from Google Fonts at runtime and are not part of this repository.

## Libraries

[Vite](https://vite.dev) (MIT), [earcut](https://github.com/mapbox/earcut) (ISC) and
[webgpu](https://github.com/dawn-gpu/node-webgpu) (Dawn for Node, BSD-3-Clause) are npm dependencies and are not
vendored here.

## Cloud noise: `assets/clouds/`

See [`assets/clouds/LICENSING.md`](assets/clouds/LICENSING.md).

## Techniques and references

These are published techniques. No code from the papers is included.

| Technique | Source |
|---|---|
| FFT ocean spectra | J. Tessendorf, *Simulating Ocean Water* |
| Atmosphere | S. Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering Technique* (2020) |
| Volumetric cloud modelling | A. Schneider (Guerrilla Games), the *Nubis* talks |
| Motion blur | M. McGuire et al., *A Reconstruction Filter for Plausible Motion Blur* (2012); J. Jimenez, *Next Generation Post Processing in Call of Duty: Advanced Warfare* (2014) |
| Bloom | J. Jimenez (2014) |
| Sharpening (RCAS) | AMD FidelityFX Super Resolution 1 |
| Rasterized caustics | Evan Wallace's *WebGL Water* approach |
| Breaking waves | Guerrilla Games, *Horizon Forbidden West* water (SIGGRAPH 2022) |

The cloud noise, lighting and sampling scheme (`src/sky/Clouds.js`) is adapted from DRG Software Solutions'
own *Sky Pro WebGPU*. It is published here under this repository's MIT license by its copyright holder.

## Harbor Engine

Harbor Engine is built on [Tidewater](https://github.com/dgreenheck/tidewater) (MIT, © its authors; see
`LICENSE`), upstream pinned at commit `1438b1abfcaee3267092b75573014f4d9b4a983c`. The ocean, sky,
post-processing, boat controller, player, CDLOD terrain and headless test harness are Tidewater's. The data
pipelines, gates, touch controls, quality tiers and map contract were written for the first Harbor Engine
title and extracted from it at commit `884246a` of `icomppower/bay-crossing`. Each title's `CREDITS.md` lists
the datasets it uses and their licences.
