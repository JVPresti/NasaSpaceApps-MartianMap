import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DebriefScreen from './DebriefScreen.jsx';

const summary = {
  startedAtSec: 600,
  endedAtSec: 2400,
  elapsedOutsideSec: 1800,
  distanceM: 1240,
  minOxygenMarginSec: -180,
  minBatteryPct: 42,
  sampleCount: 2,
  photos: 3,
  samples: [
    { id: 1, kind: 'rock', site: 'Cheyava Falls', sealed: true, atSec: 1000 },
    { id: 2, kind: 'ground', site: null, sealed: true, atSec: 1300 },
  ],
  doseUgy: null,
  events: [
    { type: 'start', eventId: 'radiation', label: 'Radiation alert', atSec: 900 },
    { type: 'end', eventId: 'radiation', label: 'Radiation alert', atSec: 1500 },
  ],
  routeChanges: [
    { atSec: 700, kind: 'initial', reason: 'Planned route', before: null, after: { distanceM: 412 } },
    // The degree sign and the arrow are real summary/store text.
    { atSec: 1200, kind: 'slope', reason: 'Detour: steeper than 25° ahead', before: { distanceM: 412 }, after: { distanceM: 388 } },
  ],
};

const render = (props = {}) => renderToStaticMarkup(
  <DebriefScreen summary={summary} onPlanNext={() => {}} onBackToHabitat={() => {}} onSources={() => {}} {...props} />,
);

const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('DebriefScreen', () => {
  it('offers the next EVA from the habitat: the mission table first, then walking, then Sources', () => {
    const body = text(render());
    const plan = body.indexOf('Plan the next EVA'), walk = body.indexOf('Back to the habitat'), sources = body.lastIndexOf('Sources');
    expect(plan).toBeGreaterThan(-1);
    expect(walk).toBeGreaterThan(plan);
    expect(sources).toBeGreaterThan(walk);
    expect(body).not.toContain('Restart EVA');
  });

  it('shows the frozen summary metrics with the closing dose read as unknown', () => {
    const html = render();
    const body = text(html);
    expect(body).toContain('30 min');
    expect(body).toContain('1.24 km');
    expect(body).toContain('2 samples');
    expect(body).toContain('rock · Cheyava Falls');
    expect(body).toContain('soil');
    expect(body).toContain('-3 min');
    expect(body).toContain('42 %');
    expect(html).toContain('<span class="debrief-value">—</span>');
    expect(body).toContain('T+0:10:00 → T+0:40:00');
  });

  it('lists every event start and end and every route change in mission-time order', () => {
    const html = render();
    const planned = html.indexOf('Planned route');
    const started = html.indexOf('Event started');
    const detour = html.indexOf('Detour: steeper than 25');
    const ended = html.indexOf('Event ended');

    expect(planned).toBeGreaterThan(-1);
    expect(started).toBeGreaterThan(planned);
    expect(detour).toBeGreaterThan(started);
    expect(ended).toBeGreaterThan(detour);

    expect((html.match(/Radiation alert/g) ?? []).length).toBe(2);
    expect((html.match(/>radiation</g) ?? []).length).toBe(2);
    expect(html).toContain('412 m → 388 m');
    expect(html).toContain('T+0:11:40');
    expect(html).toContain('T+0:20:00');
  });

});
