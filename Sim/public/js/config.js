// Scenario configuration. Values here are SCENARIO / UI choices unless stated otherwise.

export const SCENARIO = {
  // Game movement speed in the scenario clock (NOT a claim about real astronaut walking speed on Mars).
  walkSpeedMps: 1.2,
  // NASA Planet Compare rounded Mars surface gravity reference; not a local Jezero measurement.
  marsGravityMps2: 3.71,
  // Game-control impulse for a small hop under 3.71 m/s² Mars gravity (~1.3 s air time, ~0.78 m apex).
  jumpImpulseMps: 2.4,
  // Landing impact absorption duration in scenario seconds (~0.25 s); cushions impact and prevents bunny hopping.
  landingRecoveryDurationS: 0.25,
  // Scenario clock runs this many times faster than wall-clock time, so the ~687 m link fits a short demo.
  timeScale: 8,
  // Presentation parameter (NOT sourced): while airborne or in landing recovery the scenario clock runs this many
  // times faster than wall time instead of timeScale, so the ~1.3 s hop lasts ~0.65 s on screen. Physics is unchanged.
  // Must satisfy 1 <= airborneTimeScale <= timeScale (sim.js throws otherwise).
  airborneTimeScale: 2,
  // Exponential smoothing time constant (wall s) for switching between the walking and flight clocks, so the
  // on-screen speed does not snap at takeoff or touchdown. Costs a little flight time (see stage note).
  timeScaleSmoothingWallS: 0.02,
  // Route corridor half-width on each side of the line (m). Demo assumption, NOT a NASA operational limit.
  corridorHalfWidthM: 10,
  corridorHalfWidthMinM: 1,
  corridorHalfWidthMaxM: 50,
  // Distance to the end waypoint (m) at which the scenario counts as arrived.
  arrivalRadiusM: 3,
  // Player may roam this far (m) beyond the route bounding box; keeps the demo area bounded.
  roamLimitM: 1200,
};

// Historical waypoints, Mars 2020 Initial Reports (PDS Geosciences, April 2022). Planetocentric, east-positive.
export const WAYPOINTS = [
  { id: 'sol120-wb1', label: 'Sol 120 / WB1', sol: 120, latDeg: 18.43906919, lonDeg: 77.44940206 },
  { id: 'sol164-roubion', label: 'Sol 164 / Roubion', sol: 164, latDeg: 18.42769340, lonDeg: 77.45165066 },
];

export const ROUTE_ORIGIN_NOTE =
  'İki tarihsel waypoint arasında sadeleştirilmiş bağlantı; gerçek rover izi değil.';

// Map frame used to place the route in the local metre plane. Transcribed from the USGS Mars 2020 TRN
// HiRISE DTM mosaic GeoTIFF header and PDS3/ISIS metadata (Fergason vd. 2020, DOI: 10.5066/P9REJ9JN).
// At runtime the loaded DTM label is compared against these values; on mismatch DTM sampling is disabled.
export const MAP_FRAME = {
  productId: 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40',
  title: 'USGS Mars 2020 TRN HiRISE DTM Mozaiği (Jezero)',
  source: 'USGS Astrogeology Science Center / NASA JPL (MRO HiRISE)',
  attribution: 'USGS Astrogeology / NASA / JPL-Caltech / Univ. of Arizona',
  license: 'Public Domain / USGS (Please cite authors: Fergason vd. 2020)',
  citation: 'Fergason, R. L., et al., 2020, 51st LPSC, Abstract #2020. DOI: 10.5066/P9REJ9JN',
  radiusKm: 3396.190,
  centerLatDeg: 0.0,
  centerLonDeg: 0.0,
  mapScaleM: 1.0,
  lineProjectionOffset: 1106617.5,
  sampleProjectionOffset: -4577366.5,
  upperLeftX: 4577366.0,
  upperLeftY: 1106618.0,
  lines: 21488,
  samples: 21400,
  rasterType: 'PixelIsArea',
  pixelRegistration: 'PIXEL_IS_AREA',
  verticalDatum: 'Mars equipotential surface (MOLA areoid / DeltaGeoid, tied to HRSC & CTX LVS)',
  verticalDatumVerified: true,
  verticalDatumEvidence: 'Fergason vd. 2020 (LPSC #2020), USGS FGDC XML (DOI: 10.5066/P9REJ9JN), CTX LVS tie (~0.4m median offset)',
  noDataHex: 'FF7FFFFB',
  validMin: -2659.776611328125,
  validMax: -1942.1046142578125,
};

export const SOURCES = [
  { label: 'NASA Mars yerçekimi referansı (3.71 m/s²; küresel yuvarlatılmış değer)', url: 'https://solarsystem.nasa.gov/planet-compare/?intent=121' },
  { label: 'USGS Astropedia Mars 2020 TRN HiRISE DTM Mozaiği (DOI: 10.5066/P9REJ9JN)', url: 'https://doi.org/10.5066/P9REJ9JN' },
  { label: 'Fergason vd. 2020 (LPSC 51, Abstract #2020: TRN DTM & Ortho Mosaics)', url: 'https://www.hou.usra.edu/meetings/lpsc2020/pdf/2020.pdf' },
  { label: 'Mars 2020 Initial Reports (waypoint bağlamı)', url: 'https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf' },
  { label: 'Mars 2020 PLACES bilgi sayfası (gerçek iz — bu demoda kullanılmadı)', url: 'https://pds-geosciences.wustl.edu/missions/mars2020/places.htm' },
];

export const ORTHO_MOSAIC_SOURCES = {
  z17Manifest: 'data/ortho/ortho-alignment-z17-tiles.json',
  z17Image: 'data/ortho/ortho-mosaic-z17-tiles.png',
  z14Manifest: 'data/ortho/ortho-alignment-z14-tiles.json',
  z14Image: 'data/ortho/ortho-mosaic-z14-tiles.png',
  defaultMode: 'hybrid', // 'hybrid' = HiRISE Ortomozaik + Rölyef/Mars Regolit Renklendirmesi, 'ortho' = Saf HiRISE Ortomozaik Albedo, 'hillshade' = Yalnız DTM Gölgeli Kabartma
  licenseNotice: 'Kaynak: NASA / USGS Astrogeology / HiRISE (University of Arizona)',
};

