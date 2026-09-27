// Scripted fetch → cache → checksum (shared by every title). A title's pipelines/data/fetch.mjs lists its
// SOURCES ({ file, key, title, licence, licenceUrl, url, body? }) and calls fetchSources( SOURCES ): each file
// lands in the title's data/raw/ once (never re-downloaded unless --force), with sources.json (licence + URL +
// fetch time) and MANIFEST.sha256. Pipelines then read only the cache (tools/data/cache.mjs).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAW } from './cache.mjs';

export async function download(s, userAgent = 'harbor-engine-data-fetch/1.0') {
  const opts = s.body
    ? { method: 'POST', body: s.body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    : {};
  opts.headers = { ...opts.headers, 'User-Agent': `${userAgent} (research build)` };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(s.url, opts);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      if (s.file.endsWith('.tif') && !ct.includes('tiff')) throw new Error(`${s.file}: got ${ct}: ${buf.subarray(0, 200)}`);
      if (s.file.endsWith('.json') && /"error"\s*:/.test(buf.subarray(0, 300).toString())) throw new Error(`${s.file}: service error ${buf.subarray(0, 300)}`);
      return buf;
    }
    console.warn(`${s.file}: HTTP ${res.status}, attempt ${attempt}`);
    await new Promise(r => setTimeout(r, 5000 * attempt));
  }
  throw new Error(`${s.file}: download failed`);
}

export async function fetchSources(SOURCES, { raw = RAW, force = process.argv.includes('--force'), userAgent } = {}) {
  mkdirSync(raw, { recursive: true });
  const sources = existsSync(join(raw, 'sources.json')) ? JSON.parse(readFileSync(join(raw, 'sources.json'), 'utf8')) : {};
  for (const s of SOURCES) {
    const path = join(raw, s.file);
    if (existsSync(path) && !force) { console.log(`cached  ${s.file}`); continue; }
    const t = Date.now();
    const buf = await download(s, userAgent);
    writeFileSync(path, buf);
    sources[s.file] = { key: s.key, title: s.title, licence: s.licence, licenceUrl: s.licenceUrl, url: s.url,
      fetched: new Date().toISOString(), bytes: buf.length };
    console.log(`fetched ${s.file} ${(buf.length / 1e6).toFixed(1)} MB in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
  writeFileSync(join(raw, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
  const lines = SOURCES.map(s => `${createHash('sha256').update(readFileSync(join(raw, s.file))).digest('hex')}  ${s.file}`);
  writeFileSync(join(raw, 'MANIFEST.sha256'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}
