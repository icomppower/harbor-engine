// Offline landmark build: the title's hooks.js `prepareLandmarks( { rawDir, grid, mergeHeights } )` turns the
// cache into Blender inputs, the title's Blender script (map.json `landmarkScript`, default
// pipelines/landmarks/build.py) builds three LODs per landmark headless, and this indexes the LOD GLBs.
//   node node_modules/harbor-engine/tools/landmarks/build.mjs [--raw <dir>] [--out <dir>]   (BLENDER=… to override)
// Never run Blender while a dev server is up (M4 memory).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAW } from '../data/cache.mjs';
import { mergeHeights, GRID } from '../terrain/build.mjs';
import { TITLE, loadMap, isMain } from '../lib/title.mjs';
import { parseGLB } from '../../src/engine/loaders/GLTF.js';

const root = TITLE;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export const LOD_DISTANCES = [1500, 5000]; // m: LOD0 nearer than 1.5 km, LOD1 to 5 km, LOD2 beyond

export async function prepareLandmarks({ rawDir = RAW } = {}) {
  const hooks = await import(pathToFileURL(join(root, 'hooks.js')).href);
  if (typeof hooks.prepareLandmarks !== 'function') throw new Error(`${join(root, 'hooks.js')} must export prepareLandmarks( ctx )`);
  return hooks.prepareLandmarks({ rawDir, grid: GRID, mergeHeights });
}

if (isMain(import.meta.url)) {
  const out = arg('--out', join(root, 'public/landmarks'));
  const input = await prepareLandmarks({ rawDir: arg('--raw', RAW) });
  const inFile = join(root, '.verify', 'landmarks-input.json');
  mkdirSync(dirname(inFile), { recursive: true });
  writeFileSync(inFile, JSON.stringify(input) + '\n');
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (f.endsWith('.glb') || f === 'index.json') rmSync(join(out, f));
  const blender = process.env.BLENDER || 'blender';
  const r = spawnSync(blender, ['-b', '--factory-startup', '--python', join(root, loadMap().landmarkScript || 'pipelines/landmarks/build.py'), '--', inFile, out], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0 || /Traceback|Error:/.test(r.stdout + r.stderr)) { console.error(r.stdout.slice(-3000), r.stderr.slice(-3000)); process.exit(1); }
  const index = { format: 'bay-landmarks/1', lodDistances: LOD_DISTANCES, blender: (r.stdout.match(/Blender \d\S*/) || [''])[0], landmarks: [] };
  for (const L of input.landmarks) {
    const lods = [0, 1, 2].map(lod => {
      const name = `${L.slug}_lod${lod}.glb`, buf = readFileSync(join(out, name));
      const g = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      const prims = g.meshes.flat();
      const triangles = prims.reduce((s, p) => s + (p.indices ? p.indices.length : p.attributes.POSITION.array.length / 3) / 3, 0);
      return { name, triangles, meshes: prims.length, sha256: createHash('sha256').update(buf).digest('hex') };
    });
    index.landmarks.push({ slug: L.slug, name: L.name, anchor: L.anchor, ground: L.ground, lods });
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  for (const l of index.landmarks) console.log(l.slug.padEnd(22), l.lods.map(x => x.triangles).join(' / '), 'tris,', l.lods[0].meshes, 'meshes');
}
