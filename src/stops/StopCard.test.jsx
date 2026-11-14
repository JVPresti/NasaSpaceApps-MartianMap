import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvenanceRegistry } from '../data/provenance.js';
import { parseStops, stopForWaypoint } from '../data/stops.js';
import { cardImage, createArrivalTracker, registerStops, stopHasContent, stopPaths } from './content.js';
import { createStore } from 'zustand/vanilla';
import { startWaypointRunner } from '../sim/waypointRunner.js';
import { createInitialState } from '../state/store.js';
import { isCloseKey } from './closeKeys.js';
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
  const [hab, wp1, wp2, wp3, cf] = route.waypoints.map((w) => w.name);

  it('opens the card once per stop as route.visited grows', () => {
    const tracker = createArrivalTracker();
    expect(tracker.update(stops, [])).toBeNull();
    expect(tracker.update(stops, [hab, wp1, wp2])).toBeNull();            // no stop at these waypoints
    expect(tracker.update(stops, [hab, wp1, wp2, wp3])).toBe(brightAngel);
    expect(tracker.update(stops, [hab, wp1, wp2, wp3])).toBeNull();       // same list again
    expect(tracker.update(stops, [])).toBeNull();                         // a re-plan empties route.visited
    expect(tracker.update(stops, [wp3])).toBeNull();                      // revisiting after the re-plan
    expect(tracker.update(stops, [wp3, cf])).toBe(cheyava);
    expect(tracker.update(stops, [wp3, cf])).toBeNull();
    expect(tracker.shown()).toEqual(['bright-angel', 'cheyava-falls']);
  });

  it('ignores a missing list, an empty stop list and stops without content', () => {
    const tracker = createArrivalTracker();
    expect(tracker.update(stops, undefined)).toBeNull();
    expect(tracker.update([], [cf])).toBeNull();
    expect(tracker.update([{ ...cheyava, text: [] }], [cf])).toBeNull();
    expect(tracker.shown()).toEqual([]);
  });

  it('opens the Cheyava Falls card from the waypoint runner (#139) only within 2 m', () => {
    const store = createStore(() => createInitialState());
    store.setState((s) => ({ mode: 'walk', route: { ...s.route, waypoints: route.waypoints, nextIndex: 4, visited: [hab, wp1, wp2, wp3] } }));
    const runner = startWaypointRunner({ store, setInterval: () => 0, clearInterval: () => {} });
    const tracker = createArrivalTracker();
    tracker.update(stops, store.getState().route.visited);                // Bright Angel, already passed
    const at = (x, z) => {
      store.setState((s) => ({ navigation: { ...s.navigation, x, z } }));
      runner.tick();
      return tracker.update(stops, store.getState().route.visited);
    };
    expect(at(2.5, 0)).toBeNull();
    expect(at(1.9, 0)).toBe(cheyava);
    expect(at(0, 0)).toBeNull();
    runner.stop();
  });
});

describe('isCloseKey', () => {
  const el = (matches) => ({ closest: (selector) => matches.some((m) => selector.includes(m)) });
  const key = (code, target = el([]), extra = {}) => isCloseKey({ code, target, ...extra });

  it('closes on Enter and Esc with focus on the page', () => {
    expect(key('Enter')).toBe(true);
    expect(key('NumpadEnter')).toBe(true);
    expect(key('Escape')).toBe(true);
    expect(key('KeyW')).toBe(false);
    expect(key('Enter', null)).toBe(true);
  });

  it('leaves Enter to a focused button, so the waypoint button does not reopen the card it just closed', () => {
    expect(key('Enter', el(['button']))).toBe(false);
    expect(key('Escape', el(['button']))).toBe(true);
  });

  it('leaves both keys to coordinate fields, and Esc to a source tag', () => {
    expect(key('Enter', el(['input']))).toBe(false);
    expect(key('Escape', el(['input']))).toBe(false);
    expect(key('Escape', el(['.source-tag-interactive']))).toBe(false);
    expect(key('Escape', el([]), { defaultPrevented: true })).toBe(false);
  });
});
