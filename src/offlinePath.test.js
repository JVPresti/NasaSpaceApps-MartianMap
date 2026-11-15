// Fails if the offline path starts depending on online play (#52). Outside src/net/, the only way into
// src/net/ is the dynamic import() in src/onlineLink.js, so the offline build never contains it.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(fileURLToPath(import.meta.url));
const NET = join(SRC, 'net');
const BOOT = join(SRC, 'onlineLink.js');
const CODE = /\.(m?js|jsx|ts|tsx)$/;
const TEST = /\.test\.(m?js|jsx|ts|tsx)$/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return p === NET ? [] : files(p);
    return CODE.test(e.name) && !TEST.test(e.name) ? [p] : [];
  });
}

// static import/export ... from 'x', bare import 'x', dynamic import('x'), require('x')
const SPECIFIERS = [
  { kind: 'static', re: /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g },
  { kind: 'static', re: /\bimport\s*['"]([^'"]+)['"]/g },
  { kind: 'dynamic', re: /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g },
  { kind: 'static', re: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g },
];

function netImports(file) {
  const source = readFileSync(file, 'utf8');
  const out = [];
  for (const { kind, re } of SPECIFIERS) {
    for (const m of source.matchAll(re)) {
      const spec = m[1];
      const target = spec.startsWith('.') ? resolve(dirname(file), spec) : spec.startsWith('/src/') ? join(SRC, '..', spec) : null;
      const intoNet = target ? target === NET || target.startsWith(NET + '/') : /(^|\/)src\/net(\/|$)/.test(spec);
      if (intoNet) out.push({ file: relative(SRC, file), kind, spec });
    }
  }
  return out;
}

describe('offline path', () => {
  it('nothing outside src/net imports src/net, except the dynamic import in src/onlineLink.js', () => {
    const all = files(SRC).flatMap(netImports);
    const allowed = all.filter((i) => i.file === relative(SRC, BOOT) && i.kind === 'dynamic' && i.spec === './net/index.js');
    expect(all.filter((i) => !allowed.includes(i))).toEqual([]);
    expect(allowed).toHaveLength(1);
  });

  it('the scan sees the files it should', () => {
    const list = files(SRC).map((f) => relative(SRC, f));
    expect(list).toContain('main.jsx');
    expect(list).toContain('onlineLink.js');
    expect(list.some((f) => f.startsWith('net/'))).toBe(false);
  });

  it('src/main.jsx boots online only through src/onlineLink.js', () => {
    const main = readFileSync(join(SRC, 'main.jsx'), 'utf8');
    expect(main).toMatch(/from '\.\/onlineLink\.js'/);
    expect(main).toMatch(/bootOnline\(/);
  });
});
