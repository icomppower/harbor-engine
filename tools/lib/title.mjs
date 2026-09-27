// The title a pipeline or gate works on: the working directory (or HARBOR_TITLE). Its map.json drives every
// engine pipeline; its data/raw/ is the checksummed download cache; its public/ receives the baked output.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateMap } from '../../src/map/validate.js';

export const TITLE = process.env.HARBOR_TITLE || process.cwd();
let cached = null;
export function loadMap(root = TITLE) {
  if (cached && cached.root === root) return cached.map;
  const map = validateMap(JSON.parse(readFileSync(join(root, 'map.json'), 'utf8')));
  cached = { root, map };
  return map;
}
// the terrain grid of the title's world frame: square domain centred on the frame origin, 3 m cells, 200-cell tiles
export function gridOf(map = loadMap()) {
  const { originE, originN, size } = map.frame;
  return { originE, originN, size, res: Math.round(size / 3), tile: 200 };
}
// true when this module is the script node was started with (compares real paths: titles reach the engine
// through a node_modules symlink)
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl)); } catch { return false; }
}
