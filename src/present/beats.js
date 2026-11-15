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
//   list        lines shown as a panel (the closing sources beat): { title: { en, es }, lines: [{ en, es, tag }], note }
//   cta         the handoff button's label

export const PLACES = {
  jezero: { lat: 18.38, lon: 77.58 },          // crater centre, near enough to frame the shot; no number on screen reads it
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
    caption: { en: 'Plan a Mars walk you can return from.', es: 'Planea en Marte una caminata con regreso.' },
    source: { en: 'Viking colour mosaic, MDIM 2.1, USGS', es: 'Mosaico a color Viking, MDIM 2.1, USGS', tag: 'DATA' },
  },
  {
    id: 'jezero',
    duration: 9,
    shot: { target: 'jezero', dist: 165_000, yaw: 0, pitch: -90, fov: 32 },   // inside the 190 km THEMIS image
    move: { dur: 7.5, ease: 'zoom' },
    caption: { en: 'Jezero, a lake about 3.5 billion years ago.', es: 'Jezero. Un lago hace 3,500 millones de años.' },
    chips: [
      { at: 'jezero', show: [5.5], text: { en: 'Jezero crater · Perseverance landed here, 2021', es: 'Cráter Jezero · aquí aterrizó Perseverance, 2021' }, tag: 'DATA' },
    ],
    source: { en: 'THEMIS day IR 100 m, Mars Odyssey. Colour: our tint', es: 'THEMIS IR diurno 100 m, Mars Odyssey. Color: nuestro tinte', tag: 'DATA' },
  },
  {
    id: 'cheyava',
    duration: 13,
    shot: { target: 'cheyava', dist: 950, yaw: -40, pitch: -32, fov: 42 },
    move: { dur: 10, ease: 'zoom' },
    caption: { en: 'Cheyava Falls. A possible sign of ancient life.', es: 'Cheyava Falls. Una posible señal de vida antigua.' },
    chips: [
      { at: 'cheyava', show: [8.5], text: { en: 'Cheyava Falls · Perseverance, 2024', es: 'Cheyava Falls · Perseverance, 2024' }, tag: 'DATA' },
      { at: 'site', show: [10.5], big: '1 m', text: { en: 'HiRISE terrain model, Mars 2020 landing maps', es: 'Modelo de terreno HiRISE, mapas de aterrizaje Mars 2020' }, tag: 'DATA' },
    ],
    scene: { images: true },
    source: { en: 'CTX 6 m, then HiRISE 1 m terrain and 25 cm image shown at 0.5 m, MRO. Colour: our tint', es: 'CTX 6 m, luego terreno HiRISE 1 m e imagen de 25 cm vista a 0.5 m, MRO. Color: nuestro tinte', tag: 'DATA' },
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
    source: { en: 'Suit limits: NASA xEVA concept of operations. Reserve: Apollo 17 procedures', es: 'Límites del traje: operaciones xEVA de la NASA. Reserva: procedimientos Apollo 17', tag: 'DATA' },
  },
  {
    id: 'plan',
    duration: 15,
    shot: { target: { x: 250, z: 270 }, dist: 1450, yaw: -25, pitch: -58, fov: 44 },
    move: { dur: 4, ease: 'inOut' },
    caption: { en: 'Marswalk prices every metre in oxygen.', es: 'Marswalk cobra cada metro en oxígeno.' },
    scene: { route: true },
    tracks: { route: [0, 'totals.distanceM', 3, 11] },
    chips: [
      { at: 'leg:0', show: [5], big: '{legs.0.distanceM} m', text: { en: '{legs.0.timeMin} min · {legs.0.o2G} g O2', es: '{legs.0.timeMin} min · {legs.0.o2G} g O2' }, tag: 'DERIVED' },
      { at: 'leg:2', show: [8], offset: 1, big: '{legs.2.distanceM} m', text: { en: '{legs.2.timeMin} min · {legs.2.o2G} g O2, uphill', es: '{legs.2.timeMin} min · {legs.2.o2G} g O2, cuesta arriba' }, tag: 'DERIVED' },
      { at: 'cheyava', show: [12], big: '{totals.distanceM} m', text: { en: 'habitat to Cheyava Falls', es: 'del hábitat a Cheyava Falls' }, tag: 'DERIVED' },
      { at: 'bend', show: [10.5], big: '{bend.slopeDeg:1}°', text: { en: 'slope here. Over {constants.slopeNoGoDeg}° is no-go', es: 'de pendiente. Más de {constants.slopeNoGoDeg}° no se pasa' }, tag: 'DERIVED', danger: true },
    ],
    source: { en: 'Route: our planner on the HiRISE slope. O2: NASA suit tests', es: 'Ruta: nuestro planificador sobre la pendiente HiRISE. O2: pruebas de trajes de la NASA', tag: 'DERIVED' },
  },
  {
    id: 'zone',
    duration: 22,
    shot: { target: { x: 440, z: 480 }, dist: 1150, yaw: -30, pitch: -54, fov: 44 },
    move: { dur: 5, ease: 'inOut' },
    drift: { yaw: -1.0 },
    caption: [
      { at: 0, en: 'The question is not where you can go.', es: 'La pregunta no es a dónde puedes ir.' },
      { at: 5, en: 'It is where you can still get home.', es: 'Es desde dónde todavía vuelves a casa.' },
      { at: 15, en: 'Radiation alert. Only ground toward home stays.', es: 'Alerta de radiación. Solo queda volver a casa.' },
    ],
    scene: { zone: true },
    tracks: { zone: [[0, 29, 7, 14], [29, 31, 15.5, 16.8]], zoneOpacity: [0, 1, 4.5, 6] },
    chips: [
      { at: 'astronaut', show: [7], big: '{zone.area:1} ha', text: { en: 'you can reach and still get home', es: 'puedes alcanzar y aún volver' },
        liveText: { en: 'reach and still get home, T+{clock}', es: 'alcanzas y aún vuelves, T+{clock}' }, tag: 'SIM', live: 'area' },
      { at: 'hab', show: [5.5], text: { en: 'Habitat', es: 'Hábitat' }, tag: 'DATA', home: true },
      { at: 'astronaut', show: [15.5], ring: true, big: '{rad.peak} µGy/h', text: { en: 'peak dose rate at Gale, Sept. 2017, 2.5× normal', es: 'tasa de dosis máxima en Gale, sept. 2017, 2.5× lo normal' }, tag: 'DATA', danger: true, offset: 1 },
    ],
    source: { en: 'Zone: computed by our planner from the HiRISE cost grid and suit model. Not in the walk HUD yet. Clock sped up', es: 'Zona: la calcula nuestro planificador con el costo HiRISE y el modelo de traje. Aún no está en el HUD. Reloj acelerado', tag: 'SIM' },
  },
  {
    id: 'demo',
    duration: 85,   // the video's length (public/present/demo.mp4)
    shot: { target: 'hab', dist: 95, yaw: -40, pitch: -14, fov: 48 },
    move: { dur: 0 },
    // The real app, recorded (scripts/present/demo-cut.md). Its captions are in the video; these show only if it fails.
    video: { src: 'demo.mp4', poster: 'demo-poster.jpg' },
    caption: [
      { at: 0, en: 'The crew sets its needs at the table.', es: 'El equipo fija sus necesidades en la mesa.' },
      { at: 17, en: 'The planner builds the route from them.', es: 'El planificador arma la ruta con ellas.' },
      { at: 34, en: 'In orange, where you can still get home.', es: 'En naranja, desde dónde aún vuelves.' },
      { at: 50, en: 'Out through the airlock, with EV2.', es: 'Afuera por la esclusa, con EV2.' },
      { at: 70, en: 'Afterwards, the walked route against the plan.', es: 'Después, la ruta caminada contra el plan.' },
    ],
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
      { at: 'hab', show: [4.4], text: { en: 'Walking speed, storm timing', es: 'Velocidad al caminar, momento de la tormenta' }, tag: 'SIM' },
      { at: 'leg:3', show: [6], big: '{trek.rmsM} m', text: { en: 'our terrain against NASA\'s DTM, via Mars Trek', es: 'nuestro terreno contra el DTM de la NASA, en Mars Trek' }, tag: 'DERIVED' },
    ],
    source: { en: 'Every dataset is listed in Sources, in the app', es: 'Cada dato está en Fuentes, dentro de la app', tag: 'DATA' },
  },
  {
    id: 'credits',
    duration: 14,
    shot: { target: 'site', dist: 2600, yaw: -24, pitch: -70, fov: 44 },
    move: { dur: 3, ease: 'inOut' },
    drift: { yaw: -0.6 },
    caption: { en: 'Every source on screen, by name.', es: 'Cada fuente en pantalla, por su nombre.' },
    scene: { route: true },
    tracks: { route: ['totals.distanceM', 'totals.distanceM', 0, 1] },
    // Names as docs/credits.md and scripts/credits-sources.mjs give them
    list: {
      title: { en: 'Sources', es: 'Fuentes' },
      lines: [
        { en: 'Globe: Viking MDIM 2.1 colorized global mosaic, 232 m. NASA/JPL/USGS', es: 'Globo: mosaico global Viking MDIM 2.1 a color, 232 m. NASA/JPL/USGS', tag: 'DATA' },
        { en: 'Jezero: Mars Odyssey THEMIS day IR controlled global mosaic, 100 m. NASA/JPL-Caltech/ASU', es: 'Jezero: mosaico global THEMIS IR diurno, Mars Odyssey, 100 m. NASA/JPL-Caltech/ASU', tag: 'DATA' },
        { en: 'CTX image mosaic for Mars 2020 TRN, 6 m (JEZ_ctx_B_soc_008). NASA/JPL/MSSS', es: 'Mosaico CTX para Mars 2020 TRN, 6 m (JEZ_ctx_B_soc_008). NASA/JPL/MSSS', tag: 'DATA' },
        { en: 'HiRISE terrain model, 1 m, and image mosaic, 25 cm, for Mars 2020 TRN (JEZ_hirise_soc_006). NASA/JPL/UArizona', es: 'Modelo de terreno HiRISE, 1 m, y mosaico de imagen, 25 cm, para Mars 2020 TRN (JEZ_hirise_soc_006). NASA/JPL/UArizona', tag: 'DATA' },
        { en: 'Terrain check: NASA Mars Trek HiRISE Jezero DEM, 0.14 m RMS', es: 'Revisión del terreno: DEM HiRISE de Jezero en NASA Mars Trek, 0.14 m RMS', tag: 'DERIVED' },
        { en: 'Radiation: MSL Curiosity RAD, Gale crater, September 2017 event (Zeitlin et al. 2018)', es: 'Radiación: RAD de MSL Curiosity, cráter Gale, evento de septiembre 2017 (Zeitlin et al. 2018)', tag: 'DATA' },
        { en: 'Dust: 2018 global dust storm, τ 8 at Gale (NASA/JPL, 20 June 2018)', es: 'Polvo: tormenta global de 2018, τ 8 en Gale (NASA/JPL, 20 de junio de 2018)', tag: 'DATA' },
        { en: 'Suit: 8 h limit, NASA xEVA Concept of Operations EVA-EXP-0042. 30 min reserve, Apollo 17 procedures', es: 'Traje: límite de 8 h, NASA xEVA Concept of Operations EVA-EXP-0042. Reserva de 30 min, procedimientos Apollo 17', tag: 'DATA' },
        { en: 'Route, slope and oxygen: our planner and suit model on that data', es: 'Ruta, pendiente y oxígeno: nuestro planificador y modelo de traje sobre esos datos', tag: 'DERIVED' },
        { en: 'The first sortie, its clock and the return zone scenario: ours', es: 'La primera salida, su reloj y el escenario de la zona de regreso: nuestros', tag: 'SIM' },
      ],
      note: 'Teresa Rivas Gómez · Andrea Rivas Gómez · Fernando Haro Calvo · Jorge Antonio Vazquez Guzmán · Antonio Ramos Gonzalez · Brayan Iván Pérez Ventura',
    },
  },
  {
    id: 'live',
    duration: 6,
    shot: { target: 'hab', dist: 95, yaw: -40, pitch: -14, fov: 48 },
    move: { dur: 4, ease: 'inOut' },
    caption: { en: 'Now we walk it, live.', es: 'Ahora la caminamos, en vivo.' },
    cta: { en: 'Open the mission table', es: 'Abrir la mesa de misión' },   // the start screen's own button (menu.open.mission.table)
  },
];

// The 30 s global video: intro, challenge, name and tagline, how it works with NASA data, the future.
// Beats are borrowed from BEATS by id with their own length and an English caption.
export const GLOBAL_30 = [
  { id: 'mars', duration: 2.5, title: 'Marswalk', caption: { en: 'Plan a walk on Mars. Get home.' } },
  { id: 'jezero', duration: 6, caption: { en: 'Jezero crater. THEMIS 100 m, CTX 6 m.' }, move: { dur: 6, ease: 'zoomIn' }, chips: [] },
  {
    id: 'cheyava', duration: 5.2, move: { dur: 4.4, ease: 'zoomOut' }, chips: [],
    caption: [{ at: 0, en: 'Down to 1 m HiRISE ground.' }, { at: 2.8, en: 'On Mars, nobody can come and get you.' }],
  },
  {
    id: 'zone', duration: 10, move: { dur: 2, ease: 'inOut' },
    shot: { target: { x: 455, z: 495 }, dist: 820, yaw: -30, pitch: -55, fov: 44 },
    caption: [{ at: 0, en: 'Orange: where you can still get home.' }, { at: 6.2, en: 'Radiation alert. Only ground toward home stays.' }],
    tracks: { zone: [[0, 29, 1, 6], [29, 31, 6.3, 7]], zoneOpacity: [0, 1, 0.2, 1] },
    chips: [
      { at: 'hab', show: [1.2], text: { en: 'Habitat' }, tag: 'DATA', home: true },
      { at: 'astronaut', show: [2], big: '{zone.area:1} ha', text: { en: 'you can reach and still get home' }, liveText: { en: 'reach and still get home, T+{clock}' }, tag: 'SIM', live: 'area' },
    ],
    source: { en: 'Zone: HiRISE cost grid, NASA suit model, 30 min sortie. Alert: RAD, Gale 2017', tag: 'SIM' },
  },
  {
    id: 'tags', from: 'zone', duration: 3.3, move: { dur: 0 }, caption: { en: 'Every number tagged: measured, derived or simulated.' },
    shot: { target: { x: 455, z: 495 }, dist: 820, yaw: -30, pitch: -55, fov: 44 },
    tracks: { zone: [31, 31, 0, 1], zoneOpacity: [1, 1, 0, 1] }, drift: null,
    chips: [
      { at: 'cheyava', show: [0.2], text: { en: 'Terrain: HiRISE DTM, MRO' }, tag: 'DATA' },
      { at: 'hab', show: [0.6], text: { en: 'Zone: cost grid and suit model' }, tag: 'DERIVED' },
      { at: 'astronaut', show: [1], text: { en: 'Scenario clock and oxygen' }, tag: 'SIM', offset: 1 },
    ],
    source: { en: 'Terrain against NASA\'s DTM via Mars Trek: 0.14 m RMS', tag: 'DERIVED' },
  },
  { id: 'end', from: 'mars', duration: 2.5, move: { dur: 0 }, title: 'Marswalk', caption: { en: 'Next: other sites with HiRISE terrain models.' } },
];

/**
 * The beat list for a sequence name ('full' or 'global30'), with borrowed fields filled in. The full presentation ends
 * on the sources; { live: true } (?live=1) adds the hand-over to the live app after them.
 */
export function sequence(name = 'full', { live = false } = {}) {
  if (name !== 'global30') return live ? BEATS : BEATS.filter((b) => b.id !== 'live');
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
