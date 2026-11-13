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
  // Scenario clock runs this many times faster than wall-clock time, so the ~686 m link fits a short demo.
  timeScale: 8,
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

// Map frame used to place the route in the local metre plane. Transcribed from the DTM PDS label
// (IMAGE_MAP_PROJECTION). At runtime the loaded DTM label is compared against these values; on mismatch
// DTM sampling is disabled instead of guessing a CRS.
export const MAP_FRAME = {
  radiusKm: 3394.8398133163,
  centerLatDeg: 15.0,
  centerLonDeg: 77.44,
  mapScaleM: 1.0096633268711,
  lineProjectionOffset: 1088495.5,
  sampleProjectionOffset: 3210.5000000001,
  lines: 14266,
  samples: 6673,
};

export const SOURCES = [
  { label: 'NASA Mars yerçekimi referansı (3.71 m/s²; küresel yuvarlatılmış değer)', url: 'https://solarsystem.nasa.gov/planet-compare/?intent=121' },
  { label: 'HiRISE Jezero DTM / ortho ürün sayfası (ESP_046060_1985)', url: 'https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985' },
  { label: 'HiRISE RDR/DTM ürün dokümanı (SIS)', url: 'https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF' },
  { label: 'Mars 2020 Initial Reports (waypoint bağlamı)', url: 'https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf' },
  { label: 'Mars 2020 PLACES bilgi sayfası (gerçek iz — bu demoda kullanılmadı)', url: 'https://pds-geosciences.wustl.edu/missions/mars2020/places.htm' },
];
