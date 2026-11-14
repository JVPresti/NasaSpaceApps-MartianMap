// Cached HTTP fetch for the PDS data scripts (build-meda-sol.mjs, build-rad.mjs).
//
// Downloads land in node_modules/.cache/pds, which git already ignores, so a
// second run reads from disk. Pass --refresh to a script to download again.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_DIR = fileURLToPath(new URL('../node_modules/.cache/pds/', import.meta.url));
const REFRESH = process.argv.includes('--refresh');

function cachePath(url, range) {
  const u = new URL(url);
  const suffix = range ? `.bytes_${range[0]}_${range[1]}` : '';
  return join(CACHE_DIR, u.host, u.pathname + suffix);
}

/**
 * GET a URL as text, or one byte range of it. Throws on any non-2xx status.
 * @param {string} url
 * @param {[number, number]} [range] zero-based, inclusive byte range
 */
export async function fetchText(url, range) {
  const path = cachePath(url, range);
  if (!REFRESH && existsSync(path)) return readFileSync(path, 'latin1');
  const headers = range ? { Range: `bytes=${range[0]}-${range[1]}` } : {};
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      if (range && res.status !== 206) throw new Error(`server ignored the byte range for ${url}`);
      const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text, 'latin1');
      return text;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** sha256 of a string read as latin1 bytes, hex. */
export const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'latin1')).digest('hex');

/** Run `fn` over `items` with at most `limit` calls in flight. Keeps input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Write JSON with two-space indent, but keep arrays of numbers on one line so series stay small and diffable. */
export function stringifyCompact(value) {
  const json = JSON.stringify(value, null, 2);
  return json.replace(/\[\s+((?:-?[\d.e+-]+|null)(?:,\s+(?:-?[\d.e+-]+|null))*)\s+\]/g, (_, body) => `[${body.replace(/,\s+/g, ', ')}]`) + '\n';
}
