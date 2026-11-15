import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import DebriefScreen from './DebriefScreen.jsx';

afterEach(() => setLanguage('en'));

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
  <DebriefScreen summary={summary} onRestart={() => {}} onSources={() => {}} {...props} />,
);

const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('DebriefScreen', () => {
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

  it('names the planned stop a sample was taken at in the Samples note (D10)', () => {
    const plan = {
      path: [[535.1, 574.1], [493, 539], [0, 0]],
      waypoints: [
        { name: 'HAB', label: null, x: 535.1, z: 574.1 },
        { name: 'S1 · light-toned patch', label: 'Light-toned patch', x: 493, z: 539 },
        { name: 'Cheyava Falls', label: 'Cheyava Falls', x: 0, z: 0 },
      ],
      legs: [],
    };
    const samples = [
      { id: 1, kind: 'ground', site: null, x: 494.5, z: 540.2, atSec: 100 },
      { id: 2, kind: 'rock', site: 'Cheyava Falls', x: 1, z: 1, atSec: 900 },   // the site already names the stop
      { id: 3, kind: 'rock', site: null, x: 300, z: 300, atSec: 600 },           // away from any stop
    ];
    const body = text(render({ summary: { ...summary, plan, samples, sampleCount: 3 } }));
    expect(body).toContain('soil · at Light-toned patch; rock · Cheyava Falls; rock');
    setLanguage('es');
    expect(text(render({ summary: { ...summary, plan, samples, sampleCount: 3 } }))).toContain('suelo · en Light-toned patch; roca · Cheyava Falls; roca');
  });

  it('speaks Spanish: labels, log wording, route kinds, samples, notes and buttons, with known reasons translated', () => {
    setLanguage('es');
    const spanish = {
      ...summary,
      doseUgy: 4.7,
      events: [...summary.events, { type: 'start', eventId: 'dust-storm', label: 'Dust storm', atSec: 1600 }],
      routeChanges: [
        ...summary.routeChanges,
        // An event re-route as src/state/events.js writes it: the alert text, then the event id.
        { atSec: 1650, kind: 'event', reason: 'Dust storm: opacity rising. Return to the habitat. (dust-storm)', before: { distanceM: 388 }, after: { distanceM: 1240 } },
        { atSec: 1700, kind: 'offroute', reason: 'Off route: new route from your position', before: null, after: null },
      ],
    };
    const body = text(render({ summary: spanish, reserveSec: 1800, notice: 'menu.restarting' }));
    for (const label of [
      'Informe de la EVA', 'De vuelta en el hábitat · reloj de misión detenido', 'Tiempo fuera', 'Distancia caminada', 'horizontal, a pie',
      'Muestras', '2 muestras', 'roca · Cheyava Falls', 'suelo', 'Dosis', '4,70 µGy', '1,24 km', 'Margen de oxígeno mínimo',
      'negativo significa por debajo de la reserva', 'Batería mínima', 'Registro de la misión', 'Evento iniciado', 'Evento terminado',
      'Alerta de radiación', 'Tormenta de polvo', 'Ruta planificada', 'Ruta inicial', 'Desvío por pendiente', 'Nueva ruta por peligro',
      'Vuelve al hábitat. (dust-storm)', 'Fuera de ruta: nueva ruta desde tu posición', 'Vuelta tras salir de la ruta', 'Cómo leer estas cifras',
      'La dosis sigue el escenario', 'Continuar la EVA', 'Reiniciar la EVA', 'Fuentes', 'Reiniciando…', 'Esc no hace ninguna de las dos cosas.',
    ]) expect(body, label).toContain(label);
    for (const english of ['EVA debrief', 'Time outside', 'Mission log', 'Event started', 'Initial route', 'How to read', 'Continue EVA', 'Planned route', 'Return to the habitat']) {
      expect(body, english).not.toContain(english);
    }
    // The slope detour reason was written in English by the HUD: the catalog cannot match its filled-in number.
    expect(body).toContain('Detour: steeper than 25° ahead');
  });

});
