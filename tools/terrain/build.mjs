// Terrain pipeline: cached land DEM + seabed DEM (map.json `terrain`) → one merged heightfield in the title
// frame → tiles. Run from the title: node node_modules/harbor-engine/tools/terrain/build.mjs [--raw <dir>] [--out <dir>]
// Output (default public/terrain/): index.json + t_<i>_<j>.bin, each a zlib-deflated Int16LE grid of
// heights in centimetres above local MSL (row-major, row 0 = north). Deterministic: no clocks, no
// randomness, fixed zlib settings.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { readTiff } from '../geo/tiff.mjs';
import { readCached, RAW } from '../data/cache.mjs';
import { dehaze } from '../geo/naip.mjs';
import { TITLE, loadMap, gridOf, isMain } from '../lib/title.mjs';
import { toUTM } from '../geo/utm.mjs';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = TITLE;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

// World grid: square domain centred on the frame origin (map.json `frame`), `frame.cell` m cells (default 3).
export const GRID = gridOf();
const T = loadMap().terrain, F = loadMap().frame;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };


export function mergeHeights({ rawDir = RAW } = {}) {
  const land = readTiff(readCached(T.land, rawDir));
  const sea = readTiff(readCached(T.sea, rawDir));
  const datums = JSON.parse(readCached(T.datum, rawDir).toString('utf8'));
  const dv = n => datums.datums.find(d => d.name === n).value;
  const msl = dv('MSL') - dv('NAVD88'); // local MSL above NAVD88 (m)
  // both rasters share the slice grid; its NW corner and cell size come from the GeoTIFF tags
  const [, , , e0, n0] = land.tags[33922], cell = land.tags[33550][0];
  const { originE, originN, size, res } = GRID;
  const west = originE - size / 2, north = originN + size / 2, texel = size / res;
  const out = new Int16Array(res * res);
  for (let j = 0; j < res; j++) {
    const N = north - (j + 0.5) * texel;
    const r = Math.min(land.height - 1, Math.max(0, Math.floor((n0 - N) / cell)));
    for (let i = 0; i < res; i++) {
      const E = west + (i + 0.5) * texel;
      const c = Math.min(land.width - 1, Math.max(0, Math.floor((E - e0) / cell)));
      const k = r * land.width + c;
      const B = sea.data[k], T = land.data[k];
      // land (3DEP lidar) above the waterline, NCEI seabed below it, blended over ±1 m of NCEI height
      const w = smooth(msl - 1, msl + 1, B);
      const h = B + (T - B) * w - msl;
      out[j * res + i] = Math.max(-32768, Math.min(32767, Math.round(h * 100)));
    }
  }
  return { heights: out, msl, epoch: datums.epoch };
}

// Ground colour map: the 4 m NAIP image over the whole terrain square (same extent as the heightfield), haze
// corrected, RGB8 sRGB, row 0 = north, zlib deflated. Water deeper than 1.5 m is zeroed (the shader draws bay
// mud there) and channels keep 6 bits: 4.0 MB instead of 15.4 MB (D39).
export const AERIAL_WATER_BELOW = -1.5, AERIAL_BITS = 6, AERIAL_LAND_MEDIAN = 105;
export function aerialMap({ rawDir = RAW, merged } = {}) {
  const t = readTiff(readCached(T.aerial, rawDir));
  merged = merged || mergeHeights({ rawDir });
  const [R, G, B] = t.bands, W = t.width, H = t.height, cell = t.tags[33550][0];
  const { res, size } = GRID, texel = size / res, keep = 0xff << (8 - AERIAL_BITS) & 0xff;
  const hAt = k => { const x = k % W, y = (k / W) | 0; return merged.heights[Math.min(res - 1, Math.floor((y + 0.5) * cell / texel)) * res + Math.min(res - 1, Math.floor((x + 0.5) * cell / texel))] / 100; };
  const fix = dehaze(t, k => hAt(k) > 0.5, { shared: true, saturation: 1.2 }); // haze statistics from land only; colour balance kept
  const rgb = Buffer.alloc(W * H * 3);
  // brightness: NAIP counts are not reflectance; scale so the median land pixel sits at a typical urban albedo
  // (~0.15 linear, sRGB ≈ AERIAL_LAND_MEDIAN)
  const lumas = [];
  for (let k = 0; k < W * H; k += 11) if (hAt(k) > 0.5) { const c = fix([R[k], G[k], B[k]]); lumas.push(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]); }
  lumas.sort((a, b) => a - b);
  const gain = AERIAL_LAND_MEDIAN / Math.max(1, lumas[lumas.length >> 1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hx = Math.min(res - 1, Math.floor((x + 0.5) * cell / texel)), hy = Math.min(res - 1, Math.floor((y + 0.5) * cell / texel));
    if (merged.heights[hy * res + hx] / 100 < AERIAL_WATER_BELOW) continue;
    const k = y * W + x, c = fix([R[k], G[k], B[k]]).map(v => Math.min(255, Math.round(v * gain)));
    rgb[k * 3] = c[0] & keep; rgb[k * 3 + 1] = c[1] & keep; rgb[k * 3 + 2] = c[2] & keep;
  }
  return { width: W, height: H, cell, rgb };
}

export function writeTiles(merged, outDir, aerial = null, water = null) {
  const { res, tile, size } = GRID, n = res / tile;
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^t_\d+_\d+\.bin$/.test(f) || f === 'index.json' || f === 'aerial.bin' || f === 'water.bin') rmSync(join(outDir, f));
  const files = [];
  for (let tj = 0; tj < n; tj++) for (let ti = 0; ti < n; ti++) {
    const t = new Int16Array(tile * tile);
    for (let y = 0; y < tile; y++) t.set(merged.heights.subarray((tj * tile + y) * res + ti * tile, (tj * tile + y) * res + ti * tile + tile), y * tile);
    const le = Buffer.alloc(t.length * 2);
    for (let k = 0; k < t.length; k++) le.writeInt16LE(t[k], k * 2);
    const bin = deflateSync(le, { level: 9, memLevel: 9, strategy: 0 });
    const name = `t_${ti}_${tj}.bin`;
    writeFileSync(join(outDir, name), bin);
    files.push({ name, i: ti, j: tj, sha256: createHash('sha256').update(bin).digest('hex') });
  }
  const index = {
    format: 'bay-terrain/1', size, res, texel: size / res, tile, tiles: n,
    frame: `BayFrame: x east, z south, origin UTM ${F.utmZone}${F.hemisphere || 'N'} E ${F.originE} N ${F.originN}; row 0 = north edge`,
    heights: 'Int16LE centimetres above local MSL, zlib deflate',
    verticalDatum: `local MSL = NAVD88 + ${merged.msl.toFixed(3)} m (NOAA station ${T.datumStation}, epoch ${merged.epoch})`,
    sources: [`${T.land} (land)`, `${T.sea} (seabed)`, `${T.datum} (datum)`],
    files,
  };
  if (aerial) {
    const bin = deflateSync(aerial.rgb, { level: 9, memLevel: 9, strategy: 0 });
    writeFileSync(join(outDir, 'aerial.bin'), bin);
    index.aerial = { file: 'aerial.bin', width: aerial.width, height: aerial.height, cell: aerial.cell,
      format: `RGB8 sRGB (${AERIAL_BITS} significant bits), row 0 = north, same square as the heightfield, zlib deflate; 0,0,0 = water`, source: `${T.aerial} (haze corrected)`,
      sha256: createHash('sha256').update(bin).digest('hex') };
  }
  if (water) {
    const bin = deflateSync(water.mask, { level: 9, memLevel: 9, strategy: 0 });
    writeFileSync(join(outDir, 'water.bin'), bin);
    index.water = { file: 'water.bin', format: 'u8 per terrain cell, row 0 = north, zlib deflate: 0 dry, 1 open water (below local MSL), 2+ the bodies below',
      open: water.open, bodies: water.bodies, sha256: createHash('sha256').update(bin).digest('hex') };
  }
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  return index;
}

// ---- water bodies and authored terrain (title hooks, optional)
// hooks.js `shapeTerrain( kit )` may edit merged heights (authored basins, logged by the title);
// `waterBodies( kit )` → [ { id, name, preset, level (m above local MSL), rings: [ [ [ lat, lon ], … ] ] } ].
// Without either hook the output is exactly the plain terrain (no water.bin).
export async function titleHooks() {
  const f = join(TITLE, 'hooks.js');
  return existsSync(f) ? import(pathToFileURL(f).href) : {};
}

// merged heights with the title's shapeTerrain hook applied: what public/terrain holds, for every pipeline that
// stands things on the ground (buildings, landmarks)
export async function shapedHeights({ rawDir = RAW } = {}) {
  const merged = mergeHeights({ rawDir }), hooks = await titleHooks();
  if (hooks.shapeTerrain) await hooks.shapeTerrain(terrainKit(merged, rawDir));
  return merged;
}

export function terrainKit(merged, rawDir = RAW) {
  const { res, size, originE, originN } = GRID, texel = size / res, o = -size / 2;
  const local = (lat, lon) => { const [E, N] = toUTM(lat, lon); return [E - originE, originN - N]; };
  const inside = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  // cells whose centre lies inside the polygon (outer ring minus holes; rings in [lat, lon])
  const cellsIn = (rings) => {
    const R = rings.map(r => r.map(([la, lo]) => local(la, lo)));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of R[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const out = [];
    for (let j = Math.max(0, Math.floor((z0 - o) / texel)); j <= Math.min(res - 1, Math.floor((z1 - o) / texel)); j++)
      for (let i = Math.max(0, Math.floor((x0 - o) / texel)); i <= Math.min(res - 1, Math.floor((x1 - o) / texel)); i++) {
        const x = o + (i + 0.5) * texel, z = o + (j + 0.5) * texel;
        if (inside(R[0], x, z) && !R.slice(1).some(h => inside(h, x, z))) out.push(j * res + i);
      }
    return out;
  };
  // distance (m) from each listed cell to the nearest cell outside the set (edge = 1 cell)
  const edgeDistance = (cells) => {
    const set = new Set(cells), d = new Map();
    let front = cells.filter(k => [-1, 1, -res, res].some(n => !set.has(k + n)));
    for (const k of front) d.set(k, texel);
    while (front.length) {
      const next = [];
      for (const k of front) for (const n of [-1, 1, -res, res]) { const q = k + n; if (set.has(q) && !d.has(q)) { d.set(q, d.get(k) + texel); next.push(q); } }
      front = next;
    }
    return d;
  };
  return { merged, rawDir, grid: GRID, texel, local, cellsIn, edgeDistance, height: k => merged.heights[k] / 100, setHeight: (k, h) => { merged.heights[k] = Math.max(-32768, Math.min(32767, Math.round(h * 100))); } };
}

export function waterMask(kit, bodies, preset) {
  const { res } = GRID, H = kit.merged.heights, mask = new Uint8Array(res * res);
  for (let k = 0; k < mask.length; k++) if (H[k] < 0) mask[k] = 1;
  const out = bodies.map((b, n) => {
    const code = 2 + n, cells = b.rings.flatMap(p => kit.cellsIn(p));
    for (const k of cells) mask[k] = code;
    return { code, id: b.id, name: b.name, preset: b.preset, level: Math.round(b.level * 1000) / 1000, cells: cells.length, area: Math.round(cells.length * kit.texel * kit.texel) };
  });
  return { mask, open: { code: 1, preset, cells: [...mask].filter(v => v === 1).length }, bodies: out };
}

if (isMain(import.meta.url)) {
  const t0 = performance.now();
  const merged = mergeHeights({ rawDir: arg('--raw', RAW) });
  const hooks = await titleHooks(), kit = terrainKit(merged, arg('--raw', RAW));
  if (hooks.shapeTerrain) console.log('shapeTerrain: ' + JSON.stringify(await hooks.shapeTerrain(kit)));
  const water = hooks.waterBodies ? waterMask(kit, await hooks.waterBodies(kit), loadMap().water.preset) : null;
  const index = writeTiles(merged, arg('--out', join(root, 'public/terrain')), aerialMap({ rawDir: arg('--raw', RAW), merged }), water);
  console.log(`terrain: ${index.files.length} tiles, MSL = NAVD88 + ${merged.msl.toFixed(3)} m, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
