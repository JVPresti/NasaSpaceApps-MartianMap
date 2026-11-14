import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvenanceRegistry } from '../data/provenance.js';
import { parseStops, stopForWaypoint } from '../data/stops.js';
import { cardImage, createArrivalTracker, registerStops, stopHasContent, stopPaths } from './content.js';
import StopCard from './StopCard.jsx';

vi.mock('./stopCard.css', () => ({}));

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'));
const stops = parseStops(read('public/data/stops.json'));
const route = read('public/marswalk/assets/route.json');

// renderToStaticMarkup escapes quotes and ampersands; compare against the escaped text.
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;').replaceAll('<', '&lt;');
// dev: true makes the registry warn for any tag path it does not know, so a missing entry fails the tests below.
const missing = vi.fn();
const registry = registerStops(stops, createProvenanceRegistry({ dev: true, warn: missing }));
const render = (props) => renderToStaticMarkup(<StopCard registry={registry} {...props} />);

afterEach(() => vi.restoreAllMocks());

describe('StopCard', () => {
  for (const stop of stops) {
    it(`renders the title, every sentence, the image and its credit for ${stop.name} in Plan mode`, () => {
      const html = render({ stop, variant: 'plan', onClose: () => {} });
      const image = cardImage(stop);
      expect(html).toContain(`<h2>${escape(stop.name)}`);
      for (const s of stop.text) expect(html).toContain(escape(s.sentence));
      expect(html).toContain(`src="/data/${image.file}"`);
      expect(html).toContain(`alt="${escape(image.alt)}"`);
      expect(html).toContain(`Image: ${escape(image.credit)}`);
      expect(html).toContain(`>${escape(image.label)}<`);
      expect(html).toContain(`source-tag-${image.tag.toLowerCase()}`);
      expect(html).toContain(escape(`Credit: ${image.credit}`));          // the tag's screen reader text
      expect(html).not.toContain('..');
      for (const s of stop.text) expect(html).toContain(`source-tag-${s.tag.toLowerCase()}`);
      expect(missing).not.toHaveBeenCalled();
    });

    it(`renders the summary, the image and its credit for ${stop.name} in Walk mode`, () => {
      const html = render({ stop, variant: 'walk', onClose: () => {} });
      const image = cardImage(stop, { preferReference: true });
      expect(html).toContain(escape(stop.summary));
      expect(html).toContain(`src="/data/${image.file}"`);
      expect(html).toContain(`Image: ${escape(image.credit)}`);
      expect(html).toContain('<kbd>Enter</kbd>');
    });
  }

  it('shows the Cheyava Falls reference image as a match in Walk mode, and no match at Bright Angel', () => {
    const cheyava = stops.find((s) => s.id === 'cheyava-falls');
    const html = render({ stop: cheyava, variant: 'walk' });
    expect(html).toContain('src="/data/images/cheyava-falls-pia26401.jpg"');
    expect(html).toContain('Reference match');
    expect(render({ stop: stops.find((s) => s.id === 'bright-angel'), variant: 'walk' })).not.toContain('Reference match');
  });

  it('renders nothing and logs nothing for a waypoint without a stop or a stop without content', () => {
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const bare = route.waypoints.filter((w) => !stopForWaypoint(stops, w));
    expect(bare.map((w) => w.name)).toEqual(['HAB', 'WP1 · channel floor', 'WP2 · dune field edge']);
    for (const waypoint of bare) expect(render({ stop: stopForWaypoint(stops, waypoint) })).toBe('');

    const empty = { ...stops[0], text: [], images: [] };
    expect(stopHasContent(empty)).toBe(false);
    expect(render({ stop: empty, variant: 'walk' })).toBe('');
    expect(render({ stop: { ...stops[1], images: [{ ...stops[1].images[0], credit: '' }] } })).toBe('');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('registerStops', () => {
  it('gives every tag on the card a registry entry with the NASA reference from stops.json', () => {
    for (const stop of stops) {
      const image = cardImage(stop, { preferReference: true });
      const entry = registry.lookup(stopPaths.image(stop, image));
      expect(entry.tag).toBe(image.tag);
      expect(entry.label).toBe(image.label);
      expect(entry.reference).toBe(image.provenance.reference.replace(/\.$/, ''));
      expect(entry.link).toBe(image.page_url);
      stop.text.forEach((s, i) => expect(registry.lookup(stopPaths.sentence(stop, i)).tag).toBe(s.tag));
      expect(registry.lookup(stopPaths.title(stop)).tag).toBe(stop.title_tag);
    }
  });
});

describe('createArrivalTracker', () => {
  const cheyava = stops.find((s) => s.id === 'cheyava-falls');
  const brightAngel = stops.find((s) => s.id === 'bright-angel');

  it('opens the card once per stop, within the 2 m radius', () => {
    const tracker = createArrivalTracker();
    expect(tracker.update(stops, { x: 520, z: 600 })).toBeNull();          // at the habitat
    expect(tracker.update(stops, { x: 2.5, z: 0 })).toBeNull();            // 2.5 m from the rock
    expect(tracker.update(stops, { x: 1.9, z: 0 })).toBe(cheyava);         // inside 2 m
    expect(tracker.update(stops, { x: 0.5, z: 0.5 })).toBeNull();          // still there
    expect(tracker.update(stops, { x: 30, z: 30 })).toBeNull();            // walked away
    expect(tracker.update(stops, { x: 0, z: 1 })).toBeNull();              // came back: no second card
    expect(tracker.update(stops, { x: brightAngel.x + 1, z: brightAngel.z })).toBe(brightAngel);
    expect(tracker.update(stops, { x: brightAngel.x, z: brightAngel.z })).toBeNull();
    expect(tracker.shown()).toEqual(['cheyava-falls', 'bright-angel']);
  });

  it('ignores an unknown position, an empty stop list and stops without content', () => {
    const tracker = createArrivalTracker();
    expect(tracker.update(stops, { x: null, z: null })).toBeNull();
    expect(tracker.update([], { x: 0, z: 0 })).toBeNull();
    expect(tracker.update([{ ...cheyava, text: [] }], { x: 0, z: 0 })).toBeNull();
    expect(tracker.shown()).toEqual([]);
  });
});
