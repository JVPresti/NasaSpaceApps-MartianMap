// Hand-written part of the credits list. scripts/build-credits.mjs merges it with
// the provenance blocks of public/data/*.json and writes public/data/credits.json
// and docs/credits.md.
//
// Each entry either stands alone (models, textures, libraries, terrain sources
// with no provenance block) or claims provenance URLs through `match`. A
// provenance URL that no entry claims becomes its own entry with defaults taken
// from the block, so new data shows up on the next `npm run credits`.
//
// Credit lines were checked on 2026-11-14 against each source's usage page:
// HiRISE https://uahirise.org/media/usage.php, CTX
// https://www.msss.com/mro/ctx/images/tips/mediatips.html, USGS product
// metadata (use constraints: none), NASA https://www.nasa.gov/nasa-brand-center/images-and-media/,
// Poly Haven https://polyhaven.com/license, the Photojournal page of each PIA image
// and the Mars 2020 raw images API credit field.

const NASA_MEDIA =
  'NASA material, not subject to copyright in the United States. NASA insignia and logos are not public domain (NASA Images and Media Usage Guidelines)';
const NASA_MEDIA_URL = 'https://www.nasa.gov/nasa-brand-center/images-and-media/';
const HIRISE_LICENSE = 'Public domain, no copyright restriction (HiRISE image usage policy). USGS product use constraints: none';
const HIRISE_LICENSE_URL = 'https://uahirise.org/media/usage.php';
const CTX_LICENSE =
  'NASA data, public (NASA SPD-41A). MSSS asks for the credit line on news, educational and personal use. USGS product use constraints: none';
const CTX_LICENSE_URL = 'https://www.msss.com/mro/ctx/images/tips/mediatips.html';
const POLYHAVEN = 'CC0 1.0, no attribution required (Poly Haven license)';
const POLYHAVEN_URL = 'https://polyhaven.com/license';
const MIT = 'MIT';

/** Display order of the groups. #63 renders one section per kind. */
export const KINDS = [
  { id: 'terrain_imagery', label: 'Terrain and imagery' },
  { id: 'weather', label: 'Weather and dust' },
  { id: 'radiation', label: 'Radiation' },
  { id: 'surface_images', label: 'Surface images and science stops' },
  { id: 'suit_walking', label: 'Suit, oxygen and walking' },
  { id: 'models', label: '3D models and textures' },
  { id: 'sound', label: 'Sound' },
  { id: 'software', label: 'Software libraries and fonts' },
];

/**
 * Kind of a provenance URL that no curated entry claims, from where it is used.
 * First match wins. Keys are `<file>:<path>`, for example `hazards.json:values.dust.x`.
 */
export const KIND_RULES = [
  [/^hazards\.json:values\.dust\./, 'weather'],
  [/^hazards\.json:values\.radiation\./, 'radiation'],
  [/^hazards\.json:models\.sep_2017_profile/, 'radiation'],
  [/^hazards\.json:(values\.(suit|metabolic|mobility|slope)\.|models\.walking_metabolic)/, 'suit_walking'],
  [/^meda/, 'weather'],
  [/^rad/, 'radiation'],
  [/^stops\.json:/, 'surface_images'],
  [/^shelters\.json:/, 'terrain_imagery'],
  [/^traverse\.json:/, 'terrain_imagery'],
];

const polyhaven = (id, name, author, usedIn) => ({
  id: `polyhaven-${id.replaceAll('_', '-')}`,
  name: `${name} (Poly Haven)`,
  kind: 'models',
  provider: 'Poly Haven',
  mission: null,
  instrument: null,
  credit_line: `${name} by ${author}, Poly Haven`,
  license: POLYHAVEN,
  license_url: POLYHAVEN_URL,
  url: `https://polyhaven.com/a/${id}`,
  used_in: usedIn,
});

const npm = (id, name, copyright, url, usedIn) => ({
  id: `lib-${id}`,
  name,
  kind: 'software',
  provider: 'npm package',
  mission: null,
  instrument: null,
  credit_line: copyright,
  license: MIT,
  license_url: `${url}/blob/main/LICENSE`,
  url,
  used_in: usedIn,
});

const font = (id, name, copyright, url, usedIn) => ({
  id: `font-${id}`,
  name,
  kind: 'software',
  provider: 'Font files in the repository',
  mission: null,
  instrument: null,
  credit_line: copyright,
  license: 'SIL Open Font License 1.1',
  license_url: 'https://openfontlicense.org/open-font-license-official-text/',
  url,
  used_in: usedIn,
});

const paper = (id, kind, name, instrument, mission, match, extra = {}) => ({
  id,
  name,
  kind,
  mission,
  instrument,
  credit_line: name,
  match: [match],
  ...extra,
});

export const CURATED = [
  // Terrain and imagery
  {
    id: 'hirise-dtm-jezero',
    name: 'HiRISE digital terrain model mosaic for Mars 2020 TRN, 1 m (JEZ_hirise_soc_006)',
    kind: 'terrain_imagery',
    provider: 'USGS Astrogeology Science Center, from MRO HiRISE',
    mission: 'MRO',
    instrument: 'HiRISE',
    credit_line: 'NASA/JPL/University of Arizona',
    citation:
      'Fergason, R., Galuszka, D., Hare, T., Mayer, D., Redding, B., Smith, E. 2020, High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation, USGS Astrogeology Science Center, doi 10.5066/P9REJ9JN',
    license: HIRISE_LICENSE,
    license_url: HIRISE_LICENSE_URL,
    url: 'https://doi.org/10.5066/P9REJ9JN',
    data_urls: [
      'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif',
    ],
    used_in: [
      'public/marswalk/assets/terrain.json (751 x 751 heights)',
      'public/marswalk/assets/normal_ao.jpg',
      'Slope, elevation and route layers, cost grid and route planner',
    ],
    match: ['https://www.uahirise.org/dtm/'],
  },
  {
    id: 'hirise-ortho-jezero',
    name: 'HiRISE orthorectified image mosaic for Mars 2020 TRN, 25 cm (JEZ_hirise_soc_006)',
    kind: 'terrain_imagery',
    provider: 'USGS Astrogeology Science Center, from MRO HiRISE',
    mission: 'MRO',
    instrument: 'HiRISE',
    credit_line: 'NASA/JPL/University of Arizona',
    citation:
      'Fergason, R., Galuszka, D., Hare, T., Mayer, D., Redding, B., Smith, E. 2020, High-Resolution Imaging Science Experiment Orthorectified Image Mosaic for Mars 2020 Terrain Relative Navigation, USGS Astrogeology Science Center, doi 10.5066/P9QJDP48',
    license: HIRISE_LICENSE,
    license_url: HIRISE_LICENSE_URL,
    url: 'https://doi.org/10.5066/P9QJDP48',
    used_in: [
      'public/marswalk/assets/ortho_hi.jpg, ortho_lo.jpg',
      'public/marswalk/assets/outcrop_mask.jpg and the rock density map in terrain.json',
    ],
  },
  {
    id: 'ctx-dtm-jezero',
    name: 'CTX digital terrain model mosaic for Mars 2020 TRN, 20 m (JEZ_ctx_B_soc_008)',
    kind: 'terrain_imagery',
    provider: 'USGS Astrogeology Science Center, from MRO CTX',
    mission: 'MRO',
    instrument: 'CTX',
    credit_line: 'NASA/JPL/Malin Space Science Systems',
    citation:
      'Fergason, R., Galuszka, D., Hare, T., Mayer, D., Redding, B., Smith, E. 2020, Context Camera Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation, USGS Astrogeology Science Center, doi 10.5066/P906QQT8',
    license: CTX_LICENSE,
    license_url: CTX_LICENSE_URL,
    url: 'https://doi.org/10.5066/P906QQT8',
    used_in: ['public/marswalk/assets/ring.json (12 km background terrain)'],
  },
  {
    id: 'ctx-ortho-jezero',
    name: 'CTX orthorectified image mosaic for Mars 2020 TRN, 6 m (JEZ_ctx_B_soc_008)',
    kind: 'terrain_imagery',
    provider: 'USGS Astrogeology Science Center, from MRO CTX',
    mission: 'MRO',
    instrument: 'CTX',
    credit_line: 'NASA/JPL/Malin Space Science Systems',
    citation:
      'Fergason, R., Galuszka, D., Hare, T., Mayer, D., Redding, B., Smith, E. 2020, Context Camera Orthorectified Image Mosaic for Mars 2020 Terrain Relative Navigation, USGS Astrogeology Science Center, doi 10.5066/P9GV1ND3',
    license: CTX_LICENSE,
    license_url: CTX_LICENSE_URL,
    url: 'https://doi.org/10.5066/P9GV1ND3',
    used_in: ['public/marswalk/assets/ring_gray.jpg (background terrain photo)', 'public/present/jezero_ctx.jpg (the presentation\'s fall into Jezero, through NASA Mars Trek tiles, tinted)'],
  },
  {
    id: 'viking-mdim21-colour',
    name: 'Mars Viking MDIM 2.1 colorized global mosaic, 232 m',
    kind: 'terrain_imagery',
    provider: 'USGS Astrogeology Science Center, served by NASA Mars Trek',
    mission: 'Viking',
    instrument: 'Viking Orbiter cameras',
    credit_line: 'NASA/JPL/USGS',
    license: NASA_MEDIA,
    license_url: NASA_MEDIA_URL,
    url: 'https://astrogeology.usgs.gov/search/map/mars_viking_mdim21_colorized_global_mosaic_232m',
    used_in: ['public/present/globe_4k.jpg, globe_2k.jpg (the presentation\'s globe, scripts/present/build_assets.py)'],
  },
  {
    id: 'themis-day-ir-100m',
    name: 'Mars Odyssey THEMIS day IR controlled global mosaic, 100 m',
    kind: 'terrain_imagery',
    provider: 'Arizona State University, served by NASA Mars Trek',
    mission: 'Mars Odyssey',
    instrument: 'THEMIS',
    credit_line: 'NASA/JPL-Caltech/Arizona State University',
    citation: 'Edwards, C. S. et al. 2011, Mosaicking of global planetary image datasets: 1. Techniques and data processing for Thermal Emission Imaging System (THEMIS) multi-spectral data, JGR Planets 116, E10008',
    license: NASA_MEDIA,
    license_url: NASA_MEDIA_URL,
    url: 'https://trek.nasa.gov/mars/',
    used_in: ['public/present/jezero_region.jpg (the presentation\'s view of Jezero crater, tinted)'],
  },
  {
    id: 'm2020-rover-waypoint',
    name: 'Mars 2020 rover traverse and waypoints (MMGIS M20_traverse, M20_waypoints)',
    kind: 'terrain_imagery',
    provider: 'NASA/JPL, Where is the rover map',
    mission: 'Mars 2020',
    instrument: null,
    credit_line: 'NASA/JPL-Caltech',
    license: NASA_MEDIA,
    license_url: NASA_MEDIA_URL,
    used_in: [
      'Origin of the terrain tile and the Cheyava Falls stop: the sol 1210 waypoint (blender/data/jezero_cheyava_meta.json)',
      "Perseverance's drives and the image pin on the mission table map, and the drives on the minimap (public/data/traverse.json)",
    ],
    match: ['https://mars.nasa.gov/mars2020/mission/where-is-the-rover/'],
  },
  {
    id: 'golombek-2003-rock-model',
    name: 'Golombek et al. 2003, Rock size-frequency distributions on Mars and implications for Mars Exploration Rover landing safety and operations, JGR Planets 108(E12)',
    kind: 'terrain_imagery',
    provider: 'Journal of Geophysical Research: Planets',
    mission: null,
    instrument: null,
    credit_line: 'Golombek, M. P. et al. 2003, JGR Planets 108(E12), doi 10.1029/2002JE002035',
    license: 'Cited model. The paper stays under its own copyright',
    license_url: null,
    url: 'https://doi.org/10.1029/2002JE002035',
    used_in: ['Rock counts per square metre in src/engine/rocks.js and the rock abundance layer'],
  },

  // Weather and dust
  paper(
    'lemmon-2022-jezero-dust-storm',
    'weather',
    'Lemmon, M. T. et al. 2022, Dust, Sand, and Winds Within an Active Martian Storm in Jezero Crater, Geophysical Research Letters 49, e2022GL100126',
    'MEDA RDS, MEDA TIRS, Mastcam-Z, Navcam',
    'Mars 2020',
    'https://doi.org/10.1029/2022GL100126',
  ),
  paper(
    'bell-2022-mastcam-z',
    'weather',
    'Bell, J. F. et al. 2022, Geological, multispectral, and meteorological imaging results from the Mars 2020 Perseverance rover in Jezero crater, Science Advances 8, eabo4856',
    'Mastcam-Z',
    'Mars 2020',
    'https://doi.org/10.1126/sciadv.abo4856',
  ),
  paper(
    'smith-2019-gale-visibility',
    'weather',
    'Smith, C. L. et al. 2019, Visibility and Line-of-Sight Extinction Estimates in Gale Crater During the 2018/MY34 Global Dust Storm, Geophysical Research Letters 46, 9414-9421',
    'Navcam',
    'MSL',
    'https://doi.org/10.1029/2019GL083788',
  ),
  paper(
    'sanchez-lavega-2025-dust-storms',
    'weather',
    'Sanchez-Lavega, A. et al. 2025, Journal of Geophysical Research: Planets 130, e2024JE008565',
    'MEDA SkyCam, Mastcam-Z',
    'Mars 2020',
    'https://doi.org/10.1029/2024JE008565',
    { license: 'Cited fact. The paper stays under its own copyright' },
  ),
  {
    id: 'jpl-2018-opportunity-storm',
    name: "NASA/JPL, Six Things to Know About NASA's Opportunity Rover Recovery Efforts, 16 August 2018",
    kind: 'weather',
    mission: 'MER-B Opportunity',
    instrument: null,
    credit_line: 'NASA/JPL-Caltech',
    match: ['https://www.jpl.nasa.gov/news/six-things-about-opportunitys-recovery-efforts/'],
  },
  {
    id: 'jpl-2016-dust-storm-pattern',
    name: 'NASA/JPL, NASA Mars Orbiters Reveal Seasonal Dust Storm Pattern, 9 June 2016 (Kass et al. 2016)',
    kind: 'weather',
    mission: 'Mars orbiters',
    instrument: null,
    credit_line: 'NASA/JPL-Caltech',
    match: ['https://www.jpl.nasa.gov/news/nasa-mars-orbiters-reveal-seasonal-dust-storm-pattern/'],
  },

  // Radiation
  paper(
    'hassler-2014-rad',
    'radiation',
    "Hassler, D. M. et al. 2014, Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover, Science 343, 1244797",
    'RAD',
    'MSL',
    'https://doi.org/10.1126/science.1244797',
  ),
  paper(
    'guo-2015-rad-variations',
    'radiation',
    'Guo, J. et al. 2015, Modeling the Variations of Dose Rate Measured by RAD During the First MSL Martian Year: 2012-2014, Astrophysical Journal 810, 24',
    'RAD',
    'MSL',
    'https://doi.org/10.1088/0004-637X/810/1/24',
  ),
  paper(
    'zeitlin-2018-sep-2017',
    'radiation',
    'Zeitlin, C. et al. 2018, Analysis of the Radiation Hazard Observed by RAD on the Surface of Mars During the September 2017 Solar Particle Event, Geophysical Research Letters 45, 5845-5851',
    'RAD',
    'MSL',
    'https://doi.org/10.1029/2018GL077760',
  ),
  {
    id: 'donki-flr-2017-09-10',
    name: 'NASA CCMC DONKI flare record 2017-09-10T15:35:00-FLR-001',
    kind: 'radiation',
    mission: 'GOES-15',
    instrument: 'XRS',
    credit_line: 'NASA Community Coordinated Modeling Center (CCMC), DONKI',
    match: ['https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/13098/-1'],
  },
  {
    id: 'donki-notifications-2017-09-10',
    name: 'NASA CCMC DONKI notifications, 10 September 2017',
    kind: 'radiation',
    mission: null,
    instrument: null,
    credit_line: 'NASA Community Coordinated Modeling Center (CCMC), DONKI',
    match: ['https://ccmc.gsfc.nasa.gov/DONKI/WS/get/notifications?startDate=2017-09-10&endDate=2017-09-10&type=all'],
  },
  {
    id: 'nasa-2024-mars-solar-storm',
    name: 'NASA, NASA Watches Mars Light Up During Epic Solar Storm, updated 10 June 2024',
    kind: 'radiation',
    mission: 'MSL',
    instrument: 'RAD',
    credit_line: 'NASA',
    match: ['https://www.nasa.gov/missions/maven/nasa-watches-mars-light-up-during-epic-solar-storm/'],
  },
  {
    id: 'ochmo-tb-020-radiation',
    name: 'NASA OCHMO, Design for Ionizing Radiation Protection, OCHMO-TB-020 Rev E',
    kind: 'radiation',
    mission: null,
    instrument: null,
    credit_line: 'NASA Office of the Chief Health and Medical Officer',
    match: ['https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf'],
  },

  // Surface images and science stops
  {
    id: 'm2020-raw-zl0-sol1187',
    name: 'Perseverance Left Mastcam-Z raw image, sol 1187 (ZL0_1187_0772321307_818EBY_N0541010ZCAM09237_0630LMJ)',
    kind: 'surface_images',
    provider: 'NASA Mars 2020 raw images gallery',
    mission: 'Mars 2020',
    instrument: 'Mastcam-Z',
    credit_line: 'NASA/JPL-Caltech/ASU',
    license_url: NASA_MEDIA_URL,
    match: ['https://mars.nasa.gov/mars2020/multimedia/raw-images/ZL0_1187_0772321307_818EBY_N0541010ZCAM09237_0630LMJ'],
  },
  {
    id: 'pia26401-cheyava-falls-workspace',
    name: "PIA26401, Mastcam-Z Views the 'Cheyava Falls' Workspace",
    kind: 'surface_images',
    provider: 'NASA/JPL Photojournal',
    mission: 'Mars 2020',
    instrument: 'Mastcam-Z',
    credit_line: 'NASA/JPL-Caltech/ASU/MSSS',
    license_url: NASA_MEDIA_URL,
    used_in: ['public/marswalk/assets/cheyava.json, cheyava_color.jpg (rock model made by hand after this image)'],
    match: ['https://science.nasa.gov/photojournal/mastcam-z-views-the-cheyava-falls-workspace'],
  },
  {
    id: 'pia26368-leopard-spots',
    name: 'PIA26368, Perseverance Finds a Rock with Leopard Spots',
    kind: 'surface_images',
    provider: 'NASA/JPL Photojournal',
    mission: 'Mars 2020',
    instrument: 'SHERLOC WATSON',
    credit_line: 'NASA/JPL-Caltech/MSSS',
    license_url: NASA_MEDIA_URL,
    match: ['https://science.nasa.gov/photojournal/perseverance-finds-a-rock-with-leopard-spots/'],
  },
  {
    id: 'pia26336-bright-angel',
    name: "PIA26336, Perseverance Views 'Bright Angel'",
    kind: 'surface_images',
    provider: 'NASA/JPL Photojournal',
    mission: 'Mars 2020',
    instrument: 'Navcam',
    credit_line: 'NASA/JPL-Caltech',
    license_url: NASA_MEDIA_URL,
    match: ['https://science.nasa.gov/photojournal/perseverance-views-bright-angel/'],
  },
  {
    id: 'm2020-mastcam-z-colour-reference',
    name: 'Perseverance Mastcam-Z raw images, sols 1211 to 1217 at Cheyava Falls (colour reference)',
    kind: 'surface_images',
    provider: 'NASA Mars 2020 raw images gallery',
    mission: 'Mars 2020',
    instrument: 'Mastcam-Z',
    credit_line: 'NASA/JPL-Caltech/ASU',
    license: NASA_MEDIA,
    license_url: NASA_MEDIA_URL,
    url: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    used_in: [
      'Terrain colour ramp in src/engine/shaders.js and the clear_day sky in atmosphere_presets.json (hue only, the frames are not shipped)',
    ],
  },
  {
    id: 'nasa-2024-bright-angel-release',
    name: "NASA/JPL, NASA's Perseverance Fords an Ancient River to Reach Science Target, 13 June 2024",
    kind: 'surface_images',
    mission: 'Mars 2020',
    instrument: null,
    credit_line: 'NASA/JPL-Caltech',
    match: [
      'https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-fords-an-ancient-river-to-reach-science-target/',
    ],
  },
  {
    id: 'nasa-2024-cheyava-falls-release',
    name: "NASA/JPL, NASA's Perseverance Rover Scientists Find Intriguing Mars Rock, 25 July 2024",
    kind: 'surface_images',
    mission: 'Mars 2020',
    instrument: 'SHERLOC, PIXL',
    credit_line: 'NASA/JPL-Caltech',
    match: [
      'https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-rover-scientists-find-intriguing-mars-rock/',
    ],
  },
  {
    id: 'nasa-2025-biosignature-release',
    name: 'NASA, NASA Says Mars Rover Discovered Potential Biosignature Last Year, 10 September 2025',
    kind: 'surface_images',
    mission: 'Mars 2020',
    instrument: null,
    credit_line: 'NASA/JPL-Caltech',
    match: ['https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/'],
  },
  paper(
    'hurowitz-2025-cheyava-falls',
    'surface_images',
    'Hurowitz, J. A. et al. 2025, Redox-driven mineral and organic associations in Jezero Crater, Mars, Nature 645, 332-340',
    'SHERLOC, PIXL',
    'Mars 2020',
    'https://doi.org/10.1038/s41586-025-09413-0',
  ),

  // Suit, oxygen and walking
  {
    id: 'ctsd-adv-959-aemu-plss',
    name: 'NASA JSC, Schematics and Behavioral Description for the AEMU PLSS, CTSD-ADV-959 Rev A',
    kind: 'suit_walking',
    mission: 'Artemis',
    instrument: 'xEMU PLSS',
    credit_line: 'NASA Johnson Space Center',
    match: ['https://ntrs.nasa.gov/citations/20170009505'],
  },
  {
    id: 'eva-exp-0042-xeva-conops',
    name: 'NASA, Exploration EVA System Concept of Operations, EVA-EXP-0042 Rev B',
    kind: 'suit_walking',
    mission: 'Artemis',
    instrument: 'xEVA suit',
    credit_line: 'NASA',
    match: ['https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf'],
  },
  {
    id: 'ogilvie-2026-mars-suit-mass',
    name: 'Ogilvie et al. 2026, Mars Spacesuit Mass Requirements, ICES-2026-127',
    kind: 'suit_walking',
    mission: 'Artemis',
    instrument: 'xEMU',
    credit_line: 'Ogilvie et al. 2026, ICES-2026-127 (NASA)',
    match: ['https://ntrs.nasa.gov/citations/20260003038'],
  },
  {
    id: 'apollo17-surface-procedures-vol2',
    name: 'NASA MSC, Apollo 17 Final Lunar Surface Procedures, Volume 2: Contingency',
    kind: 'suit_walking',
    mission: 'Apollo 17',
    instrument: 'PLSS',
    credit_line: 'NASA Manned Spacecraft Center, via NASA PDS Geosciences Node',
    match: [
      'https://pds-geosciences.wustl.edu/Lunar/urn-nasa-pds-apollodoc/document_a17/mission/a17_final_lunar_surface_procedures_vol2_contingency.pdf',
    ],
  },
  {
    id: 'bellcomm-b70-10028-apollo15',
    name: 'Benjamin, Apollo 15 EVA Capability and Constraints Envelopes, Bellcomm memorandum B70 10028',
    kind: 'suit_walking',
    mission: 'Apollo 15',
    instrument: null,
    credit_line: 'Bellcomm for NASA, via the Apollo Lunar Surface Journal',
    match: ['https://webarchive.library.unt.edu/eot2008/20090109180220id_/http://www.hq.nasa.gov/alsj/19790073512_1979073512.pdf'],
  },
  {
    id: 'waligora-1975-sp368',
    name: 'Waligora, J. M., Horrigan, D. J. 1975, Metabolism and Heat Dissipation During Apollo EVA Periods, Biomedical Results of Apollo, NASA SP-368',
    kind: 'suit_walking',
    mission: 'Apollo 11-17',
    instrument: 'PLSS',
    credit_line: 'Waligora and Horrigan 1975, NASA SP-368',
    match: ['https://ntrs.nasa.gov/citations/19760005584'],
  },
  {
    id: 'hoffmann-2021-eva-metabolic',
    name: 'Hoffmann, B. 2021, Extravehicular Activity Metabolic Rate Model: Metabolic Rate Estimated from Heart Rate',
    kind: 'suit_walking',
    mission: 'Space Shuttle and ISS',
    instrument: 'EMU PLSS',
    credit_line: 'Hoffmann 2021 (NASA)',
    match: ['https://ntrs.nasa.gov/citations/20210024317'],
  },
  {
    id: 'norcross-2008-walkback',
    name: 'Norcross, J. et al. 2008, Feasibility of Suited 10 km Walkback on the Moon, AsMA presentation',
    kind: 'suit_walking',
    mission: null,
    instrument: 'Mark III suit',
    credit_line: 'Norcross et al. 2008 (NASA)',
    match: ['https://ntrs.nasa.gov/citations/20080014853'],
  },
  {
    id: 'norcross-2009-tp-214796',
    name: 'Norcross, J. et al. 2009, Feasibility of Performing a Suited 10-km Ambulation on the Moon, NASA/TP-2009-214796',
    kind: 'suit_walking',
    mission: null,
    instrument: 'Mark III suit',
    credit_line: 'Norcross et al. 2009, NASA/TP-2009-214796',
    match: ['https://www.lpi.usra.edu/lunar/artemis/NorcrossEtAl_NASA-TP-2009-214796_EVA%20Walkback%20Test.pdf'],
  },
  {
    id: 'norcross-2010-tp-216125',
    name: 'Norcross, J. R. et al. 2010, Metabolic Costs and Biomechanics of Inclined Ambulation and Exploration Tasks in a Planetary Suit, NASA/TP-2010-216125',
    kind: 'suit_walking',
    mission: null,
    instrument: 'Mark III suit',
    credit_line: 'Norcross et al. 2010, NASA/TP-2010-216125',
    match: ['https://ntrs.nasa.gov/citations/20110003409'],
  },
  paper(
    'minetti-2002-walking-slopes',
    'suit_walking',
    'Minetti, A. E., Moia, C., Roi, G. S., Susta, D., Ferretti, G. 2002, Energy cost of walking and running at extreme uphill and downhill slopes, Journal of Applied Physiology 93, 1039-1046',
    null,
    null,
    'https://doi.org/10.1152/japplphysiol.01177.2001',
  ),
  paper(
    'farley-1992-reduced-gravity',
    'suit_walking',
    'Farley, C. T., McMahon, T. A. 1992, Energetics of walking and running: insights from simulated reduced-gravity experiments, Journal of Applied Physiology 73, 2709-2712',
    null,
    null,
    'https://doi.org/10.1152/jappl.1992.73.6.2709',
  ),
  {
    id: 'nist-webbook-oxygen',
    name: 'NIST Chemistry WebBook, Thermophysical Properties of Fluid Systems, oxygen',
    kind: 'suit_walking',
    provider: 'US National Institute of Standards and Technology',
    mission: null,
    instrument: null,
    credit_line: 'NIST Chemistry WebBook, SRD 69',
    match: ['https://webbook.nist.gov/cgi/fluid.cgi?ID=C7782447&Action=Page'],
  },

  // 3D models and textures
  {
    id: 'nasa-3d-z2-suit',
    name: 'Z2 Spacesuit (NASA 3D Resources)',
    kind: 'models',
    provider: 'NASA 3D Resources',
    mission: null,
    instrument: null,
    credit_line: 'NASA',
    license: NASA_MEDIA,
    license_url: NASA_MEDIA_URL,
    url: 'https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Z2%20Spacesuit',
    used_in: [
      'public/marswalk/assets_astronaut/z2_astronaut.glb, z2_fp_legs.glb (rig, animations and accent mask added by the team)',
    ],
  },
  {
    id: 'nasa-3d-habitat-demonstration-unit',
    name: 'Habitat Demonstration Unit (NASA 3D Resources)',
    kind: 'models',
    provider: 'NASA 3D Resources',
    mission: null,
    instrument: null,
    credit_line: 'NASA',
    license: NASA_MEDIA,
    license_url: NASA_MEDIA_URL,
    url: 'https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Habitat%20Demonstration%20Unit',
    used_in: [
      'public/marswalk/assets_habitat/habitat.glb shell and its edited texture (legs, steps, mast, exterior detail and interior are team additions)',
    ],
  },
  polyhaven('rock_07', 'Rock 07', 'Jenelle van Heerden', ['public/marswalk/assets/rocks.json, rock_07.jpg']),
  polyhaven('rock_09', 'Rock 09', 'Jenelle van Heerden', ['public/marswalk/assets/rocks.json, rock_09.jpg']),
  polyhaven('namaqualand_boulder_03', 'Namaqualand Boulder 03', 'Jenelle van Heerden and Dario Barresi', [
    'public/marswalk/assets/rocks.json, namaqualand_boulder_03.jpg',
  ]),
  polyhaven('namaqualand_boulder_05', 'Namaqualand Boulder 05', 'Jenelle van Heerden and Dario Barresi', [
    'public/marswalk/assets/rocks.json, namaqualand_boulder_05.jpg',
  ]),
  polyhaven('namaqualand_boulder_06', 'Namaqualand Boulder 06', 'Greg Zaal and Jenelle van Heerden', [
    'public/marswalk/assets/rocks.json, namaqualand_boulder_06.jpg',
  ]),
  polyhaven('rocks_ground_04', 'Rocks Ground 04', 'Rob Tuytel', [
    'public/marswalk/assets/gravel_nl.jpg, slab_nl.jpg (ground detail; the terrain scene links this texture, the README records the detail textures as Poly Haven)',
  ]),
  polyhaven('metal_stool_02', 'Metal Stool 02', 'Ulan Cabanilla', ['public/marswalk/assets_habitat/furniture/stool.glb']),
  polyhaven('steel_frame_shelves_01', 'Steel Frame Shelves 01', 'James Ray Cock', [
    'public/marswalk/assets_habitat/furniture/shelves.glb',
  ]),
  polyhaven('plastic_crate_02', 'Plastic Crate 02', 'Fabi_G', ['public/marswalk/assets_habitat/furniture/crate.glb']),

  // Software libraries (runtime dependencies in package.json)
  npm('three', 'three.js', 'Copyright 2010-2026 three.js authors', 'https://github.com/mrdoob/three.js', [
    '3D engine (src/engine/)',
  ]),
  npm('react', 'React', 'Copyright Meta Platforms, Inc. and affiliates', 'https://github.com/facebook/react', ['User interface (src/)']),
  npm('react-dom', 'React DOM', 'Copyright Meta Platforms, Inc. and affiliates', 'https://github.com/facebook/react', [
    'User interface (src/main.jsx)',
  ]),
  npm('zustand', 'Zustand', 'Copyright 2019 Paul Henschel', 'https://github.com/pmndrs/zustand', ['App state (src/state/)']),
  // AI-generated interface art (#11): artistic, not mission data
  {
    id: 'ai-interface-art',
    name: 'Start screen video and hazard illustrations',
    kind: 'models',
    provider: 'Generated by the Marswalk team with Higgsfield',
    mission: null,
    instrument: null,
    credit_line: 'AI-generated for Marswalk; artistic, not a mission image',
    license: 'Made for this project',
    license_url: null,
    url: 'https://higgsfield.ai',
    used_in: ['src/assets/ui/home.webm, home.mp4, surface.webp (start screen)', 'src/assets/ui/hazard_*.webp (mission table, Hazards step)'],
  },
  // Interface typefaces, served from src/assets/fonts (latin subset; the licence texts are next to the files)
  font('barlow', 'Barlow and Barlow Condensed', 'Copyright 2017 The Barlow Project Authors', 'https://github.com/jpt/barlow', [
    'Interface text, numbers and titles (src/fonts.css)',
  ]),
  font('ibm-plex-mono', 'IBM Plex Mono', 'Copyright 2017 IBM Corp.', 'https://github.com/IBM/plex', [
    'Source tags and key names (src/fonts.css)',
  ]),

  // Sound (#72): no sound files. Every sound is synthesised in the browser with the Web Audio API.
  {
    id: 'marswalk-suit-audio',
    name: 'Suit sounds: fans, breathing, footsteps, wind, habitat cabin, dosimeter, alert tones and radio',
    kind: 'sound',
    provider: 'Marswalk team',
    mission: null,
    instrument: null,
    credit_line: 'Made in code at run time with the Web Audio API (src/audio/). No recordings and no sound files',
    license: 'Original work of the Marswalk team. No third-party sound is used',
    license_url: null,
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API',
    used_in: ['Suit audio (src/audio/)'],
    citation: 'How quiet and dull the outside is follows the first sound recordings on Mars: Maurice et al. 2022, Nature 605, 653-658 (Perseverance SuperCam microphone)',
  },
];

/** Mission names for the submission form. Missions not listed here appear as written. */
export const MISSION_NAMES = {
  MRO: 'Mars Reconnaissance Orbiter (MRO)',
  'Mars 2020': 'Mars 2020 Perseverance',
  MSL: 'Mars Science Laboratory (MSL) Curiosity',
  'MER-B Opportunity': 'Mars Exploration Rover Opportunity',
  'GOES-15': 'GOES-15 (NOAA and NASA), through NASA CCMC DONKI',
  Artemis: 'Artemis xEVA program',
  'Apollo 11-17': 'Apollo',
  'Apollo 15': 'Apollo',
  'Apollo 17': 'Apollo',
  'Apollo 14': 'Apollo',
  'Apollo 15-17': 'Apollo',
  'Space Shuttle and ISS': 'Space Shuttle and ISS',
  'Mars orbiters': null,
};

/** Official Space Apps challenge resources, and whether the project uses each one. */
export const CHALLENGE_RESOURCES = [
  {
    name: 'NASA Mars 2020 Perseverance raw images gallery',
    url: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    used: 'Science stop image at Bright Angel (sol 1187) and the colour reference frames from sols 1211 to 1217',
  },
  {
    name: 'NASA Mars Trek',
    url: 'https://trek.nasa.gov/mars/',
    used: "Validation of the elevation and slope layers against Mars Trek's HiRISE Jezero DEM (docs/data/mars-trek-check/)",
    pending: null,
  },
  { name: 'USGS-NASA Planetary Geologic Mapping Program', url: null, used: null },
  { name: 'Curiosity Mount Sharp route map', url: null, used: null },
  { name: 'NASA Worldview', url: 'https://worldview.earthdata.nasa.gov/', used: null },
];
