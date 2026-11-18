import { typeLabel } from './regions.js';

const EN = Object.freeze({
  chooseRegion: 'Choose a region: start, then destination',
  hint: 'Drag: rotate · Scroll: zoom · Click: start / destination',
  approximate: 'approximate · presentation context',
  marsSurface: 'Mars surface',
  mission: 'Mission setup',
  start: 'Start',
  end: 'Destination',
  choosePoint: 'Select a point on the globe',
  clear: 'clear',
  interests: 'Regions of interest',
  deadline: 'Target arrival time (minutes)',
  deadlinePlaceholder: 'e.g. 45',
  deadlineHelp: 'Time is prioritised. The visor warns when the planned route exceeds the target.',
  crew: 'Crew size',
  fewer: 'Decrease crew size',
  more: 'Increase crew size',
  together: 'Travel together',
  split: 'Travel separately',
  follow: 'Follow crew member',
  simulate: 'START SIMULATION',
  scope: 'Simulation terrain: Jezero HiRISE DTM (demo). Other regions provide context only.',
  credit: 'Globe texture: USGS Astrogeology Viking MDIM 2.1',
  different: 'Start and destination must differ',
  arrival: 'destination',
  person: 'Crew member',
  minutes: 'min',
  balance: 'Time balance',
  estimate: 'Estimates are scenario parameters, not sourced measurements.',
  selected: 'Selected point',
  nearby: 'near',
});

const TYPES = Object.freeze({
  krater: 'Crater', volkan: 'Volcano', kanyon: 'Canyon / valley',
  'duzluk-ova': 'Plain', 'kutup-buz': 'Polar ice',
  'antik-delta-nehir': 'Ancient delta / river', 'kum-tepesi': 'Dune',
  'daglik-arazi': 'Highlands',
});

const REGION_NAMES = Object.freeze({
  jezero: 'Jezero Crater', gale: 'Gale Crater', boreum: 'Planum Boreum',
  australe: 'South polar region (Planum Australe)',
  eberswalde: 'Eberswalde Delta',
});

export function globeText(locale, key, turkish) {
  return locale === 'en' ? (EN[key] ?? turkish) : turkish;
}

export function globeTypeLabel(locale, type) {
  const id = type.id ?? type;
  return locale === 'en' ? (TYPES[id] ?? type.label ?? String(type)) : (type.label ?? typeLabel(id));
}

export function globeRegionName(locale, region) {
  if (locale !== 'en') return region.name;
  if (region.free) {
    return `${EN.selected} · ${globeLatLon(region.lat, region.lon)}`;
  }
  return REGION_NAMES[region.id] ?? region.name;
}

export function globeLatLon(lat, lon) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

