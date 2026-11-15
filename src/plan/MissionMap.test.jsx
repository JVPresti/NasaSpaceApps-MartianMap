import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import MissionMap from './MissionMap.jsx';

vi.mock('./mapLayers.css', () => ({}));

afterEach(() => setLanguage('en'));

// The map's markers and lines are HTML and SVG, so a server render shows them; the canvases stay empty (no DOM).
const waypoints = [{ name: 'HAB', x: 535.1, z: 574.1 }, { name: 'S1 · light-toned patch', label: 'Light-toned patch', x: 493, z: 539, stopId: 'sortie' }];
const render = (props) => renderToStaticMarkup(<MissionMap layer={0} title="Map" waypoints={waypoints} path={[[535.1, 574.1], [493, 539]]} {...props} />);
const lineClasses = (html) => [...html.matchAll(/<polyline[^>]*class="([^"]+)"/g)].map((m) => m[1]);

describe('MissionMap', () => {
  it('frames a short sortie at the minimum span, or at the span the screen asks for', () => {
    expect(render()).toContain('150 m across');
    expect(render({ minSpanM: 80 })).toContain('80 m across');
  });

  it('draws the plan in the plan colour and no position or shelter outside an event', () => {
    const html = render({ routeClass: 'profile-fastest' });
    expect(lineClasses(html)).toEqual(['map-route-shadow', 'map-route profile-fastest']);
    expect(html).not.toContain('table-map-position');
    expect(html).not.toContain('SHELTER');
  });

  it('draws an event route to the habitat in the caution colour, over the plan, and tags the habitat SHELTER', () => {
    const html = render({
      eventRoute: true,
      routeClass: 'profile-fastest',
      path: [[493, 539], [535.1, 574.1]],
      planPath: [[535.1, 574.1], [493, 539]],
      position: { x: 493, z: 539, errorM: 0.4, headingDeg: 90, fixMode: 'terrain fix' },
    });
    expect(lineClasses(html)).toEqual(['map-route map-route-plan', 'map-route-shadow', 'map-route map-route-event']);
    const habitat = html.slice(html.indexOf('map-marker'), html.indexOf('</li>'));
    expect(habitat).toContain('map-tag-shelter');
    expect(habitat).toContain('SHELTER');
    expect(html).toContain('class="table-map-position"');
  });

  it('marks a shelter that is not a stop at the end of the event route, by its name', () => {
    const html = render({ eventRoute: { id: 'SP1', name: 'SP1 · terrain shade' }, path: [[493, 539], [460, 520]] });
    expect(html).toContain('map-place-event');
    expect(html).toContain('<b>SP1 · terrain shade</b>');
    expect(html.match(/SHELTER/g)).toHaveLength(1);
  });

  it('names each stop once, by its number and its label, never by its waypoint code (P8)', () => {
    const html = render();
    expect(html).toContain('<span class="map-marker-num">1</span><span class="map-marker-tag"><b>Light-toned patch</b></span>');
    expect(html).toContain('<b>Habitat airlock</b>');
    expect(html).not.toMatch(/>S1<|>HAB<|light-toned patch</);
    setLanguage('es');
    expect(render()).toContain('<b>Zona de tono claro</b>');
    expect(render()).toContain('<b>Esclusa del hábitat</b>');
  });

  it('opens a tag to the left near the right edge of the map, so the edge does not cut it (N8)', () => {
    // the habitat sits at the east end of the sortie, past 70 % of a map framed on the route
    const html = render({ minSpanM: 60 });
    expect(html).toMatch(/class="map-marker flip"[^>]*>[\s\S]*?Habitat airlock/);
    expect(html).toMatch(/class="map-marker target"/);   // the stop, west of it, opens to the right as before
  });

  it('says SHELTER in the interface language', () => {
    setLanguage('es');
    expect(render({ eventRoute: true, path: [[493, 539], [535.1, 574.1]] })).toContain('REFUGIO');
  });
});
