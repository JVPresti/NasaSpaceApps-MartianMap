import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { distanceToPath } from '../sim/offRoute.js';
import { REVIEW_RULES, reviewRoute } from '../sim/routeReview.js';
import DebriefScreen from './DebriefScreen.jsx';
import { RouteReviewView } from './RouteReview.jsx';
import { costText, ruleNotes, summaryLine } from './reviewText.js';

afterEach(() => setLanguage('en'));

// The plan the crew approved: east along z = 0 from the habitat at the origin, two legs of 200 m at 1 m/s and 0.1 g/m.
const PLAN = {
  atSec: 0,
  path: [[0, 0], [200, 0], [400, 0]],
  waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP1 · channel floor', x: 200, z: 0 }, { name: 'Cheyava Falls', x: 400, z: 0 }],
  legs: [
    { from: 'HAB', to: 'WP1 · channel floor', distanceM: 200, timeSec: 200, o2G: 20 },
    { from: 'WP1 · channel floor', to: 'Cheyava Falls', distanceM: 200, timeSec: 200, o2G: 20 },
  ],
  totals: null,
};

/** A track every 2 m along corners, 1 m/s, O2 0.12 g/m, margin falling 1 s/m from 3000 s, 5° unless `edit` says. */
function walk(corners, edit = () => ({})) {
  const points = [];
  let s = 0;
  const push = (x, z) => {
    const base = { x, z, atSec: s, marginSec: 3000 - s, slopeDeg: 5, eventId: null, o2G: 600 - 0.12 * s, home: false };
    points.push({ ...base, ...edit(base, s) });
  };
  push(...corners[0]);
  for (let k = 1; k < corners.length; k += 1) {
    const [ax, az] = corners[k - 1];
    const [bx, bz] = corners[k];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    for (let i = 1; i <= n; i += 1) {
      s += Math.hypot(bx - ax, bz - az) / n;
      push(ax + (bx - ax) * i / n, az + (bz - az) * i / n);
    }
  }
  return points;
}

const summaryWith = (track, extra = {}) => ({
  startedAtSec: 0,
  endedAtSec: track.at(-1).atSec,
  elapsedOutsideSec: track.at(-1).atSec,
  distanceM: 800,
  minOxygenMarginSec: 2000,
  minBatteryPct: 60,
  sampleCount: 0,
  photos: 0,
  samples: [],
  doseUgy: null,
  events: [],
  routeChanges: [],
  finds: [],
  track,
  plan: PLAN,
  ...extra,
});

const FOLLOWED = summaryWith(walk([[0, 0], [400, 0], [0, 0]]));
const DETOURS = summaryWith(
  walk([[0, 0], [50, 0], [80, 40], [110, 0], [250, 0], [280, -40], [310, 0], [400, 0]], (p) => (p.x > 200 && p.z < -30 ? { slopeDeg: 23 } : {})),
  {
    finds: [{ id: 'find-1', label: 'M01', x: 80, z: 40, atSec: 10, accepted: true }],
    sampleCount: 1,
    samples: [{ id: 7, kind: 'rock', site: null, x: 280, z: -40, atSec: 330 }],
    routeChanges: [{ atSec: 0, kind: 'initial', reason: 'Planned route', x: 0, z: 0 }, { atSec: 300, kind: 'offroute', reason: 'Off route: new route from your position', x: 270, z: -30 }],
  },
);

const renderDebrief = (summary) => renderToStaticMarkup(
  <DebriefScreen summary={summary} onContinue={() => {}} onRestart={() => {}} onSources={() => {}} reserveSec={1800} />,
);
const renderView = (summary, selected = null) => renderToStaticMarkup(
  <RouteReviewView summary={summary} review={reviewRoute(summary)} selected={selected} onSelect={() => {}} />,
);
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
/** The points of the first polyline with a class, in map units (0 to 100). */
const polyline = (html, className) => {
  const match = html.match(new RegExp(`<polyline points="([^"]+)" class="${className}"`));
  return match ? match[1].split(' ').map((pair) => pair.split(',').map(Number)) : null;
};

describe('route review in the debrief', () => {
  it('shows "No deviations" for an EVA that follows the plan, with the track on top of the plan', () => {
    const html = renderDebrief(FOLLOWED);
    expect(text(html)).toContain('No deviations: you walked the approved plan.');
    const route = polyline(html, 'map-route');
    const track = polyline(html, 'map-track');
    expect(route).not.toBeNull();
    expect(track.length).toBeGreaterThan(route.length);
    // Every point of the walked line sits on the plan line: the two overlap.
    for (const [x, z] of track) expect(distanceToPath({ x, z }, route)).toBeLessThan(0.01);
    // The track is drawn first, under the thinner plan line, so both stay visible where they overlap.
    expect(html.indexOf('class="map-track"')).toBeLessThan(html.indexOf('class="map-route"'));
    expect(html).not.toContain('debrief-review-row');
  });

  it('opens with one summary line and lists each deviation with its verdict, reason and cost', () => {
    const review = reviewRoute(DETOURS);
    expect(review.deviations.map((d) => d.verdict)).toEqual(['worth', 'risky']);
    const html = renderDebrief(DETOURS);
    const body = text(html);
    expect(body).toContain(summaryLine(review));
    expect(summaryLine(review)).toMatch(/^2 deviations: 1 worth it, 1 risky\. \+\d+ (s|min) and \+\d+ g O2 over the plan\.$/);
    expect(body).toContain('Worth it');
    expect(body).toMatch(/Marked find M01 with \d+ min of margin/);
    expect(body).toContain('Risky');
    // The no-go slope wins over the sample taken in the same stretch.
    expect(body).toMatch(/Crossed 23° near WP1 with \d+ min of margin/);
    expect(body).toMatch(/\+\d+ (s|min) · \+\d+ g O2 · \+\d+ m over the plan/);
    expect(body).toContain('Lowest margin');
    // The review sits between the metrics and the mission log.
    expect(html.indexOf('Route review')).toBeGreaterThan(html.indexOf('Lowest battery'));
    expect(html.indexOf('Route review')).toBeLessThan(html.indexOf('Mission log'));
  });

  it('draws the deviations by verdict, the re-plans, finds and samples, and a margin strip with the reserve line', () => {
    const html = renderView(DETOURS);
    expect(html).toContain('class="map-stretch review-worth"');
    expect(html).toContain('class="map-stretch review-risky"');
    expect(html).toContain('map-mark-num map-marker-num debrief-review-num review-worth');
    expect(html).toContain('class="map-mark map-mark-replan"');
    expect(html).not.toContain('Re-plan at T+0:00:00');   // the initial route is the plan itself, not a re-plan
    expect(html).toContain('class="map-mark map-mark-find accepted"');
    expect(html).toContain('class="map-mark map-mark-sample"');
    expect(html).toContain('class="debrief-review-reserve"');
    expect(html).toContain('class="debrief-review-shade review-risky"');
    expect(html).toContain('Margin over the reserve');
  });

  it('frames the clicked deviation on the map', () => {
    const fitted = renderView(DETOURS);
    const framed = renderView(DETOURS, 2);
    expect(fitted).not.toContain('Fit route');
    expect(framed).toContain('Fit route');
    expect(framed).toMatch(/aria-pressed="true"[^>]*title="Show deviation 2 on the map"/);
    // The stretch of deviation 2 fills most of the framed map, against a small part of the fitted one.
    const span = (points) => Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x));
    const stretch = (html) => polyline(html, 'map-stretch review-risky');
    expect(span(stretch(framed))).toBeGreaterThan(2 * span(stretch(fitted)));
    for (const [x, z] of stretch(framed)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(100);
    }
  });

  it('says so when there is no approved plan to compare with', () => {
    const html = renderDebrief(summaryWith(walk([[0, 0], [10, 0]]), { plan: null }));
    expect(text(html)).toContain('No approved plan was recorded');
    expect(html).not.toContain('table-map');
  });

  it('reads the thresholds in "How to read these numbers" from the constants the review uses', () => {
    const body = text(renderDebrief(FOLLOWED));
    expect(body).toContain(`more than ${REVIEW_RULES.enterM} m from the plan approved at Begin EVA`);
    expect(body).toContain(`at least ${REVIEW_RULES.minLengthM} m of walking`);
    expect(body).toContain(`back within ${REVIEW_RULES.exitM} m`);
    expect(body).toContain(`at or above ${COST_CONSTANTS.SLOPE_LIMIT_DEG}°`);
    expect(body).toContain('under the 30 min reserve');
    // Other constants give other text: nothing is copied into the strings.
    const custom = ruleNotes(1200, { ...REVIEW_RULES, enterM: 25, slopeLimitDeg: 18 }).map((n) => n.text).join(' ');
    expect(custom).toContain('more than 25 m');
    expect(custom).toContain('at or above 18°');
    expect(custom).toContain('20 min reserve');
    // Before hazards.json is read, the rule is written without a number.
    expect(ruleNotes(null).find((n) => n.term === 'Risky').text).toContain('went under the reserve');
  });

  it('states the whole verdict order in "How to read these numbers", in English and Spanish', () => {
    const order = (notes) => notes.find((n) => n.term === 'Which verdict wins' || n.term === 'Qué veredicto gana').text;
    const english = order(ruleNotes(1800));
    expect(english).toContain(`ground at or above ${REVIEW_RULES.slopeLimitDeg}° (risky); an alert or a system re-plan when it started (forced); the margin under the reserve, or an alert that started while you were off the route (risky); a find or a sample (worth it); otherwise costly.`);
    expect(english).toContain('a forced detour stays forced when the margin drops under the reserve or a second alert starts during it');
    expect(text(renderDebrief(FOLLOWED))).toContain('Which verdict wins');
    setLanguage('es');
    const spanish = order(ruleNotes(1800));
    expect(spanish).toContain(`terreno de ${REVIEW_RULES.slopeLimitDeg}° o más (arriesgado); una alerta o una nueva ruta del sistema al empezar (forzado); el margen bajo la reserva, o una alerta que empezó mientras estabas fuera de la ruta (arriesgado); un hallazgo o una muestra (valió la pena); si no, costoso.`);
    expect(spanish).toContain('un desvío forzado sigue siendo forzado si el margen baja de la reserva o empieza una segunda alerta durante él');
    expect(text(renderDebrief(FOLLOWED))).toContain('Qué veredicto gana');
  });

  it('words a total below the plan as under it, and mixed signs as against it, never "-2 min over the plan"', () => {
    const review = (extraSec, extraO2G) => ({ ok: true, deviations: [{}], counts: { worth: 0, forced: 0, risky: 0, costly: 1 }, totals: { extraSec, extraO2G, extraM: 0 } });
    expect(summaryLine(review(420, 41))).toBe('1 deviation: 1 costly. +7 min and +41 g O2 over the plan.');
    expect(summaryLine(review(-130, -3.2))).toBe('1 deviation: 1 costly. 2 min and 3 g O2 under the plan.');
    expect(summaryLine(review(40, -3.2))).toBe('1 deviation: 1 costly. +40 s and -3 g O2 against the plan.');
    expect(costText({ extraSec: 60, extraO2G: 5, extraM: 30 })).toBe('+1 min · +5 g O2 · +30 m over the plan');
    expect(costText({ extraSec: -60, extraO2G: 5, extraM: 30 })).toBe('-1 min · +5 g O2 · +30 m against the plan');
    setLanguage('es');
    expect(summaryLine(review(-130, -3.2))).toBe('1 desvío: 1 costoso. 2 min y 3 g de O2 por debajo del plan.');
  });

  it('gives the margin chart the same lowest margin as the headline metric', () => {
    // The headline is read every tick; the chart's points come every 2 m. The summary's track carries the lowest
    // reading (src/state/eva.js), and the label reads the summary's figure in the same format.
    const track = walk([[0, 0], [400, 0], [0, 0]], (p, s) => ({ marginSec: 18780 + s }));
    const body = text(renderDebrief(summaryWith(track, { minOxygenMarginSec: 18420 })));
    expect(body).toMatch(/Lowest oxygen margin \+307 min/);
    expect(body).toMatch(/Lowest \+307 min at T\+/);
    expect(body).not.toContain('Lowest +313 min');
  });

  it('keeps the lowest margin on a forced row', () => {
    const track = walk([[0, 0], [150, 0], [200, 60], [250, 0], [400, 0]], (p, s) => (
      s >= 200 ? { eventId: 'radiation', marginSec: -180 } : s >= 100 ? { eventId: 'dust-storm' } : {}
    ));
    const summary = summaryWith(track, { events: [{ type: 'start', eventId: 'dust-storm', label: 'Dust storm', atSec: 100 }, { type: 'start', eventId: 'radiation', label: 'Radiation alert', atSec: 200 }] });
    expect(reviewRoute(summary).deviations.map((d) => d.verdict)).toEqual(['forced']);
    const body = text(renderView(summary));
    expect(body).toContain('Forced');
    expect(body).toContain('Alert active when you left the route: Dust storm');
    expect(body).toContain('Lowest margin -3 min');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const body = text(renderDebrief(DETOURS));
    expect(body).toContain('Revisión de la ruta');
    expect(body).toMatch(/2 desvíos: 1 valió la pena, 1 arriesgado\./);
    expect(body).toContain('Marcaste el hallazgo M01');
    expect(body).toMatch(/Cruzaste 23° cerca de WP1/);
    expect(body).toContain('Margen sobre la reserva');
    expect(text(renderDebrief(FOLLOWED))).toContain('Sin desvíos: caminaste el plan aprobado.');
  });
});
