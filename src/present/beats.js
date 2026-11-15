// The presentation's beats (#291). Re-order, re-time and re-word them here; no other file needs to change.
//
// Each beat answers one question a judge would ask, in this order: where are we, why there, what is the danger,
// what Marswalk does about it, how we know the numbers are real, can I see it work. Words come from the pitch script
// (docs/pitch/ on docs/pitch-hill-climb), cut to at most 8 words a caption.
//
// Fields
//   id          unique name, used in the URL (?beat=zone) and by the recorder
//   duration    seconds the beat runs under autoplay and recording
//   shot        where the camera ends: a target, a distance to it and the view angles
//                 target  { lat, lon } in degrees, { x, z } in metres from Cheyava Falls, or a place name below
//                 dist    metres from the target; yaw is the view heading in degrees clockwise from north,
//                 pitch   degrees (negative looks down), fov in degrees, spin degrees of longitude per second (globe)
//   move        { dur, ease } the camera move from the previous shot. ease: 'inOut', 'out', 'zoom' (log distance)
//   caption     { en, es } or a list of { at, en, es } shown in turn. At most 8 words each.
//   title       a large word over the caption (only the first beat)
//   chips       labels pinned to a place: { at, show: [from, to?], big?, text?: { en, es }, tag? }
//                 at: a place name below, 'leg:N' (the middle of leg N), 'astronaut', or { x, z } / { lat, lon }
//                 big: a number from plan.json in braces, for example '{totals.distanceM} m'
//                 tag: DATA, DERIVED or SIM (CONTEXT.md, realism rules)
//   source      the line at the bottom: where the picture comes from, { en, es, tag }
//   scene       what the engine shows: sky, dust (0-1), layer (0 none, 1 slope), route, zone, images
//   tracks      values that move during the beat: { name: [from, to, startSec, endSec] }, or a list of those in time order
//                 route: metres of route drawn; zone: frame of the walkback zone clip; dust: storm level
//   cta         the handoff button's label

export const PLACES = {
  jezero: { lat: 18.38, lon: 77.58 },          // crater centre, IAU Gazetteer of Planetary Nomenclature
  cheyava: { x: 0, z: 0 },                     // Cheyava Falls, the scene origin (18.4975 N, 77.3053 E)
  hab: { x: 535.1, z: 574.1 },                  // the habitat airlock, public/data/shelters.json HAB
  bend: 'plan.bend',                            // where the route bends around steep ground, from plan.json
  site: { x: 180, z: 200 },                     // the middle of the walk, for wide shots
};

export const BEATS = [
  {
    id: 'mars',
    duration: 8,
    shot: { target: { lat: 14, lon: 52 }, dist: 15_500_000, yaw: 0, pitch: -90, fov: 32, spin: 2.2 },
    move: { dur: 0 },
    title: 'Marswalk',
    caption: { en: 'A walk on real Mars ground.', es: 'Una caminata sobre suelo real de Marte.' },
    source: { en: 'Viking colour mosaic, MDIM 2.1, USGS', es: 'Mosaico a color Viking, MDIM 2.1, USGS', tag: 'DATA' },
  },
  {
    id: 'jezero',
    duration: 9,
    shot: { target: 'jezero', dist: 240_000, yaw: 0, pitch: -90, fov: 32 },
    move: { dur: 7.5, ease: 'zoom' },
    caption: { en: 'Jezero crater. A lake, 3.5 billion years ago.', es: 'Jezero: un lago hace 3,500 millones de años.' },
    chips: [
      { at: 'jezero', show: [5.5], big: '45 km', text: { en: 'Jezero crater · 18.4° N, 77.6° E', es: 'Cráter Jezero · 18.4° N, 77.6° E' }, tag: 'DATA' },
    ],
    source: { en: 'THEMIS day IR 100 m, Viking colour', es: 'THEMIS IR diurno 100 m, color Viking', tag: 'DATA' },
  },
  {
    id: 'cheyava',
    duration: 13,
    shot: { target: 'cheyava', dist: 950, yaw: -40, pitch: -32, fov: 42 },
    move: { dur: 10, ease: 'zoom' },
    caption: { en: 'Cheyava Falls. A possible sign of ancient life.', es: 'Cheyava Falls. Una posible señal de vida antigua.' },
    chips: [
      { at: 'cheyava', show: [8.5], text: { en: 'Cheyava Falls · Perseverance, 2024', es: 'Cheyava Falls · Perseverance, 2024' }, tag: 'DATA' },
      { at: 'site', show: [10.5], big: '1 m', text: { en: 'HiRISE elevation, one height per metre', es: 'Elevación HiRISE, una altura por metro' }, tag: 'DATA' },
    ],
    scene: { images: true },
    source: { en: 'CTX 6 m, then HiRISE 1 m elevation and 25 cm image, MRO', es: 'CTX 6 m, luego elevación HiRISE 1 m e imagen 25 cm, MRO', tag: 'DATA' },
  },
  {
    id: 'danger',
    duration: 9,
    shot: { target: 'hab', dist: 75, yaw: -40, pitch: -11, fov: 46 },
    move: { dur: 5, ease: 'inOut' },
    caption: { en: 'On Mars, nobody can come and get you.', es: 'En Marte, nadie puede ir por ti.' },
    chips: [
      { at: 'hab', show: [2.5], big: '{constants.evaMaxH} h', text: { en: 'longest EVA a suit allows', es: 'la EVA más larga que permite el traje' }, tag: 'DATA' },
      { at: 'hab', show: [4.2], big: '{constants.reserveMin} min', text: { en: 'oxygen reserve, kept untouched', es: 'reserva de oxígeno, intocable' }, tag: 'DATA', offset: 1 },
    ],
    source: { en: 'Suit limits: NASA xEVA and Apollo rules, hazards.json', es: 'Límites del traje: NASA xEVA y reglas Apollo, hazards.json', tag: 'DATA' },
  },
  {
    id: 'plan',
    duration: 15,
    shot: { target: { x: 250, z: 270 }, dist: 1450, yaw: -25, pitch: -58, fov: 44 },
    move: { dur: 4, ease: 'inOut' },
    caption: { en: 'Marswalk prices every metre in oxygen.', es: 'Marswalk cobra cada metro en oxígeno.' },
    scene: { route: true, layer: 1 },
    tracks: { route: [0, 'totals.distanceM', 3, 11], layer: [0, 1, 9, 10.5] },
    chips: [
      { at: 'leg:0', show: [5], big: '{legs.0.distanceM} m', text: { en: '{legs.0.timeMin} min · {legs.0.o2G} g O2', es: '{legs.0.timeMin} min · {legs.0.o2G} g O2' }, tag: 'DERIVED' },
      { at: 'leg:2', show: [8], offset: 1, big: '{legs.2.distanceM} m', text: { en: '{legs.2.timeMin} min · {legs.2.o2G} g O2, uphill', es: '{legs.2.timeMin} min · {legs.2.o2G} g O2, cuesta arriba' }, tag: 'DERIVED' },
      { at: 'bend', show: [10.5], big: '{bend.slopeDeg}°', text: { en: 'too steep. Over {constants.slopeNoGoDeg}° is no-go', es: 'muy empinado. Más de {constants.slopeNoGoDeg}° no se pasa' }, tag: 'DERIVED', danger: true },
    ],
    source: { en: 'Route: our planner on the HiRISE slope. O2: NASA suit tests', es: 'Ruta: nuestro planificador sobre la pendiente HiRISE. O2: pruebas de trajes NASA', tag: 'DERIVED' },
  },
  {
    id: 'zone',
    duration: 18,
    shot: { target: { x: 440, z: 480 }, dist: 1150, yaw: -30, pitch: -54, fov: 44 },
    move: { dur: 5, ease: 'inOut' },
    drift: { yaw: -1.0 },
    caption: [
      { at: 0, en: 'The question is not where you can go.', es: 'La pregunta no es a dónde puedes ir.' },
      { at: 5, en: 'It is where you can still get home.', es: 'Es desde dónde todavía vuelves a casa.' },
    ],
    scene: { zone: true },
    tracks: { zone: [0, 29, 7, 16.5], zoneOpacity: [0, 1, 4.5, 6] },
    chips: [
      { at: 'astronaut', show: [7], big: '{zone.margin} min', text: { en: 'walkback margin', es: 'margen de regreso' },
        liveText: { en: 'walkback margin at T+{clock}', es: 'margen de regreso a T+{clock}' }, tag: 'DERIVED', live: 'margin' },
      { at: 'hab', show: [9], big: '{zone.scenario.plannedMin} min', text: { en: 'first sortie, as planned', es: 'primera salida, según el plan' }, tag: 'SIM', offset: 1 },
    ],
    source: { en: 'Zone: our planner\'s cost grid and the NASA suit model. Clock sped up', es: 'Zona: rejilla de costo y modelo de traje NASA. Reloj acelerado', tag: 'SIM' },
  },
  {
    id: 'radiation',
    duration: 11,
    shot: { target: 'astronaut', dist: 420, yaw: -20, pitch: -50, fov: 44 },
    move: { dur: 3, ease: 'inOut' },
    caption: { en: 'Radiation alert. Only the way home remains.', es: 'Alerta de radiación. Solo queda volver.' },
    scene: { zone: true },
    tracks: { zone: [29, 31, 1.2, 2.4], zoneOpacity: [1, 1, 0, 1] },
    chips: [
      { at: 'astronaut', show: [1.2], ring: true, big: '{rad.peak} µGy/h', text: { en: 'peak dose rate, 2017 solar event', es: 'dosis máxima, evento solar de 2017' }, tag: 'DATA', danger: true },
    ],
    source: { en: 'RAD on Curiosity, Gale crater, not Jezero. Timing: NASA DONKI', es: 'RAD en Curiosity, cráter Gale, no Jezero. Tiempos: NASA DONKI', tag: 'DATA' },
  },
  {
    id: 'storm',
    duration: 10,
    shot: { target: 'astronaut', dist: 150, yaw: 130, pitch: -13, fov: 50 },
    move: { dur: 4, ease: 'inOut' },
    caption: { en: 'Dust storm. The zone still points home.', es: 'Tormenta de polvo. La zona sigue señalando casa.' },
    scene: { zone: true, sky: 'dust_storm' },
    tracks: { zone: [31, 53, 0, 9], zoneOpacity: [1, 0.85, 0, 9], dust: [0, 0.75, 0.5, 6] },
    chips: [
      { at: 'hab', show: [5], big: 'τ 8.0', text: { en: 'dust opacity of the 2018 global storm', es: 'opacidad del polvo, tormenta global 2018' }, tag: 'DATA' },
    ],
    source: { en: 'Dust: Curiosity, Gale 2018. Weather: MEDA, Jezero, sol 1187', es: 'Polvo: Curiosity, Gale 2018. Clima: MEDA, Jezero, sol 1187', tag: 'DATA' },
  },
  {
    id: 'sources',
    duration: 12,
    shot: { target: 'site', dist: 2500, yaw: -20, pitch: -66, fov: 44 },
    move: { dur: 4, ease: 'inOut' },
    caption: { en: 'Measured, derived or simulated. Every number says which.', es: 'Medido, derivado o simulado. Cada número lo dice.' },
    scene: { route: true },
    tracks: { route: ['totals.distanceM', 'totals.distanceM', 0, 1], dust: [0.75, 0, 0, 3] },
    chips: [
      { at: 'cheyava', show: [2], text: { en: 'Terrain: HiRISE DTM, MRO', es: 'Terreno: DTM HiRISE, MRO' }, tag: 'DATA' },
      { at: 'leg:1', show: [3.2], text: { en: 'Slope, route, O2 per metre', es: 'Pendiente, ruta, O2 por metro' }, tag: 'DERIVED' },
      { at: 'hab', show: [4.4], text: { en: 'Walking speed, storm timing', es: 'Velocidad al caminar, hora de la tormenta' }, tag: 'SIM' },
      { at: 'leg:3', show: [6], big: '{trek.rmsM} m', text: { en: 'our terrain against NASA Mars Trek', es: 'nuestro terreno contra NASA Mars Trek' }, tag: 'DERIVED' },
    ],
    source: { en: 'Every dataset is listed in Sources, in the app', es: 'Cada dato está en Fuentes, dentro de la app', tag: 'DATA' },
  },
  {
    id: 'live',
    duration: 6,
    shot: { target: 'hab', dist: 95, yaw: -40, pitch: -14, fov: 48 },
    move: { dur: 4, ease: 'inOut' },
    caption: { en: 'Now we walk it, live.', es: 'Ahora la caminamos, en vivo.' },
    cta: { en: 'Begin the mission', es: 'Empezar la misión' },
  },
];

// The 30 s global video: intro, challenge, name and tagline, how it works with NASA data, the future.
// Beats are borrowed from BEATS by id with their own length and an English caption.
export const GLOBAL_30 = [
  { id: 'mars', duration: 3.5, title: 'Marswalk', caption: { en: 'Plan a walk on Mars. Get home.' } },
  { id: 'jezero', duration: 5, caption: { en: 'Jezero crater, on NASA orbital data.' }, move: { dur: 4.5, ease: 'zoom' } },
  { id: 'cheyava', duration: 5, caption: { en: 'Down to 1 m HiRISE ground.' }, move: { dur: 4.6, ease: 'zoom' }, chips: [] },
  {
    id: 'zone', duration: 10, move: { dur: 2.2, ease: 'inOut' },
    shot: { target: { x: 440, z: 480 }, dist: 1000, yaw: -30, pitch: -54, fov: 44 },
    caption: [{ at: 0, en: 'Orange: where you can still get home.' }, { at: 6.2, en: 'Radiation alert. The zone collapses.' }],
    tracks: { zone: [[0, 29, 1.2, 6], [29, 31, 6.3, 7]], zoneOpacity: [0, 1, 0.3, 1.2] },
    chips: [
      { at: 'astronaut', show: [2.5], big: '{zone.margin} min', text: { en: 'walkback margin' }, liveText: { en: 'walkback margin at T+{clock}' }, tag: 'DERIVED', live: 'margin' },
    ],
  },
  {
    id: 'sources', duration: 3.5, move: { dur: 2, ease: 'inOut' }, caption: { en: 'Every number tagged: measured or modelled.' },
    chips: [
      { at: 'cheyava', show: [0.4], text: { en: 'Terrain: HiRISE DTM, MRO' }, tag: 'DATA' },
      { at: 'leg:1', show: [0.9], text: { en: 'Slope, route, O2 per metre' }, tag: 'DERIVED' },
      { at: 'hab', show: [1.4], text: { en: 'Walking speed, storm timing' }, tag: 'SIM' },
    ],
  },
  { id: 'end', from: 'mars', duration: 2.5, move: { dur: 0 }, title: 'Marswalk', caption: { en: 'Next: any HiRISE site on Mars.' } },
];

/** The beat list for a sequence name ('full' or 'global30'), with borrowed fields filled in. */
export function sequence(name = 'full') {
  if (name !== 'global30') return BEATS;
  return GLOBAL_30.map((cut) => {
    const base = BEATS.find((b) => b.id === (cut.from || cut.id));
    if (!base) throw new Error('GLOBAL_30 names an unknown beat: ' + cut.id);
    const tracks = cut.tracks || scaleTracks(base.tracks, cut.duration / base.duration);
    return { ...base, ...cut, tracks, chips: cut.chips ?? base.chips };
  });
}

function scaleTracks(tracks, k) {
  if (!tracks) return tracks;
  const out = {};
  const scale = ([from, to, t0, t1]) => [from, to, t0 * k, t1 * k];
  for (const [name, tr] of Object.entries(tracks)) out[name] = Array.isArray(tr[0]) ? tr.map(scale) : scale(tr);
  return out;
}

/** Words in a caption string, for the 8-word rule. */
export const wordCount = (text) => String(text).trim().split(/\s+/).filter(Boolean).length;

/** Every caption of a beat as a list of { at, en, es }. */
export function captionsOf(beat) {
  if (!beat.caption) return [];
  return Array.isArray(beat.caption) ? beat.caption : [{ at: 0, ...beat.caption }];
}
