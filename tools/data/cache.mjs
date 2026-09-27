// Read-only access to data/raw/: every file is checked against MANIFEST.sha256 before it is used, so
// pipelines only ever see the cached, checksummed download (never the network).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TITLE } from '../lib/title.mjs';

// the title's download cache
export const RAW = join(TITLE, 'data/raw');

export function readCached(file, dir = RAW) {
  const man = join(dir, 'MANIFEST.sha256');
  if (!existsSync(man)) throw new Error(`cache: ${man} missing — run the title's fetch pipeline (npm run fetch-data)`);
  const want = readFileSync(man, 'utf8').trim().split('\n').map(l => l.split(/\s+/)).find(([, f]) => f === file)?.[0];
  if (!want) throw new Error(`cache: ${file} is not in MANIFEST.sha256`);
  const path = join(dir, file);
  if (!existsSync(path)) throw new Error(`cache: ${file} missing from ${dir}`);
  const buf = readFileSync(path);
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== want) throw new Error(`cache: ${file} checksum mismatch`);
  return buf;
}
