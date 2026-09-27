// Placeholder data for a new title (new-title, gate E4) or a map without a city (E6): a procedural island in
// open water, no buildings, no landmarks, a two-leg route round the island. Same formats as the real
// pipelines, so the App loads it unchanged; a title replaces it with real data from its own pipelines.
//   node node_modules/harbor-engine/tools/placeholder/build.mjs [--out <public dir>]        (from the title)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRID, writeTiles } from '../terrain/build.mjs';
import { writeBuildingTiles } from '../buildings/build.mjs';
import { TITLE, loadMap, isMain } from '../lib/title.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

// island of `radius` m (peak `peak` m) on a seabed that shelves from 2 m to `depth` m; deterministic
export function placeholderHeights({ radius = GRID.size * 0.12, peak = 40, depth = 18 } = {}) {
  const { res, size } = GRID, texel = size / res, out = new Int16Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = -size / 2 + (i + 0.5) * texel, z = -size / 2 + (j + 0.5) * texel;
    const a = Math.atan2(z, x), r = Math.hypot(x, z) / (radius * (1 + 0.12 * Math.sin(3 * a) + 0.06 * Math.cos(5 * a)));
    const land = r < 1 ? peak * Math.pow(1 - r * r, 1.5) + 1.5 : 0;
    const sea = -Math.min(depth, 2 + (r - 1) * depth * 1.5);
    const h = r < 1 ? land : sea;
    out[j * res + i] = Math.round(h * 100);
  }
  return { heights: out, msl: 0, epoch: 'placeholder' };
}

export function writePlaceholder(publicDir = join(TITLE, 'public'), map = loadMap()) {
  const terrain = writeTiles(placeholderHeights(), join(publicDir, 'terrain'));
  const buildings = writeBuildingTiles([[], [], []], { placeholder: 0 }, join(publicDir, 'buildings'));
  mkdirSync(join(publicDir, 'landmarks'), { recursive: true });
  writeFileSync(join(publicDir, 'landmarks/index.json'), JSON.stringify({ format: 'bay-landmarks/1', lodDistances: [1500, 5000], landmarks: [] }, null, 1) + '\n');
  // route: from the dock east of the island, round its south side, to a point west of it
  const R = GRID.size * 0.12, from = { x: R * 1.6, z: 0 }, to = { x: -R * 1.6, z: 0 };
  const route = {
    from: { stopId: 'A', name: map.route.from, x: from.x, z: from.z }, to: { stopId: 'B', name: map.route.to, x: to.x, z: to.z },
    rules: { draft: map.vessel.draft, placeholder: true },
    waypoints: [[from.x, from.z], [R * 1.2, R * 1.4], [-R * 1.2, R * 1.4], [to.x, to.z]], length: 0, minDepthAlong: 0,
  };
  for (let k = 1; k < route.waypoints.length; k++) route.length += Math.hypot(route.waypoints[k][0] - route.waypoints[k - 1][0], route.waypoints[k][1] - route.waypoints[k - 1][1]);
  route.length = Math.round(route.length * 100) / 100;
  mkdirSync(join(publicDir, 'ferry'), { recursive: true });
  writeFileSync(join(publicDir, 'ferry/route.json'), JSON.stringify(route, null, 1) + '\n');
  return { terrain, buildings, route };
}

if (isMain(import.meta.url)) {
  const r = writePlaceholder(arg('--out', join(TITLE, 'public')));
  console.log(`placeholder: ${r.terrain.files.length} terrain tiles, 0 buildings, 0 landmarks, route ${r.route.length} m`);
}
