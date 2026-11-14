import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createProvenanceRegistry, STORE_PATHS } from '../data/provenance.js';
import SourceTag from './SourceTag.jsx';

const readJson = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8'));
const registry = createProvenanceRegistry({ dev: false, entries: STORE_PATHS }).loadData({
  meda: readJson('public/data/meda_sol.json'),
  rad: readJson('public/data/rad.json'),
});
const render = (props) => renderToStaticMarkup(<SourceTag registry={registry} {...props} />);

// Server rendering reads the store's initial state, where sources is empty, so live entries go through the
// `source` prop here. The dev server check covers the store subscription.

describe('SourceTag', () => {
  it('shows the compact label with the tag class and a text alternative', () => {
    const html = render({ path: 'environment.pressurePa' });
    expect(html).toContain('MEDA · Perseverance · sol 1187');
    expect(html).toContain('source-tag-data');
    expect(html).toContain('tabindex="0"');
    expect(html).toMatch(/aria-describedby="([^"]+)".*id="\1"/);
    expect(html).toContain('Source: MEDA · Perseverance · sol 1187, DATA.');
  });

  it('reproduces the mockup labels in the short variant', () => {
    expect(render({ path: 'environment.tempC', variant: 'short' })).toContain('>MEDA · Perseverance<');
    expect(render({ path: 'environment.doseRateUgyH', variant: 'short' })).toContain('>RAD · Curiosity<');
    expect(render({ path: 'navigation.headingDeg', variant: 'short' })).toContain('>SIM<');
  });

  it('puts the site in the details of a RAD value', () => {
    const html = render({ path: 'environment.doseRateUgyH' });
    expect(html).toMatch(/Site<\/dt><dd>Gale crater[^<]*not Jezero/);
    expect(html).toContain('href="https://');
  });

  it('follows the live tag from the store', () => {
    const html = render({ path: 'environment.tempC', variant: 'tag', interactive: false, source: { tag: 'SIM', source: 'mock value' } });
    expect(html).toContain('>SIM<');
    expect(html).toContain('title="mock value"');
    expect(html).not.toContain('tabindex');
  });

  it('waits for the store entry with requireSource, and takes caller classes', () => {
    expect(render({ path: 'suit.oxygenPct', requireSource: true })).toBe('');
    const source = { tag: 'DERIVED', source: 'suit model' };
    const html = render({ path: 'suit.oxygenPct', variant: 'tag', requireSource: true, source, className: (t) => 'hud-src hud-src-' + t });
    expect(html).toContain('class="source-tag source-tag-derived hud-src hud-src-derived ');
    expect(html).not.toContain('source-tag-chip');
  });

  it('renders nothing for an unknown path and warns in development', () => {
    const warn = vi.fn();
    const dev = createProvenanceRegistry({ dev: true, warn });
    expect(renderToStaticMarkup(<SourceTag path="environment.nope" registry={dev} />)).toBe('');
    expect(warn).toHaveBeenCalledOnce();
  });
});
