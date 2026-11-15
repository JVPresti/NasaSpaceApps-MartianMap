import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import { provenance } from '../data/provenance.js';
import { RADIO_EYE_HEIGHT_M, RADIO_WEAK_RANGE_M } from '../sim/radio.js';
import { RadioChip } from './RadioLink.jsx';

vi.mock('../components/SourceTag.css', () => ({}));

afterEach(() => setLanguage('en'));

describe('habitat radio chip (#297)', () => {
  it('tags the range and the state in every state, and says the weak range is ours', () => {
    for (const state of ['linked', 'weak', 'lost']) {
      const html = renderToStaticMarkup(<RadioChip link={{ state, rangeM: 812.4 }} />);
      expect(html).toContain('812 m');
      expect(html).toContain('class="source-tag source-tag-derived hud-src hud-src-derived"');
      expect(html).toMatch(/title="[^"]*weak past 800 m is our threshold \(SIM\)/);
    }
  });

  it('keeps the tag in Spanish', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(<RadioChip link={{ state: 'weak', rangeM: 812 }} />);
    expect(html).toContain('DÉBIL');
    expect(html).toContain('hud-src-derived');
  });

  it('describes the same line of sight as the Radio shadow layer, with the constants of src/sim/radio.js', () => {
    const entry = provenance.lookup('radio.link');
    expect(entry.tag).toBe('DERIVED');
    expect(entry.source).toContain(`past ${RADIO_WEAK_RANGE_M} m`);
    expect(entry.source).toContain(`${RADIO_EYE_HEIGHT_M} m above the ground`);
    expect(entry.source).toMatch(/HiRISE height map/);
  });
});
