// Mars bölge kaydı (tanıtım küresi için).
//
// DÜRÜSTLÜK NOTU
// - Tüm lat/lon (enlem/boylam, derece, doğu pozitif) ve yarıçap (km) değerleri YAKLAŞIKTIR;
//   sunum/etiket amaçlıdır, resmi gazetteer (USGS/IAU) değeri veya ölçüm değildir.
// - Jezero dışındaki sahalar için bu projede yerel yüksek çözünürlüklü DTM YOKTUR.
//   Bu bölgeler yalnızca bağlam/etiket amaçlıdır; simülasyon sahası Jezero HiRISE DTM'dir (demo).
// - typeSafetyWeight değerleri "senaryo parametresi, kaynaklı değil"dir; güvenlik skoru değildir.

export const MARS_RADIUS_KM = 3396.19;

export const REGION_TYPES = Object.freeze([
  { id: 'krater', label: 'Krater', icon: '◎' },
  { id: 'volkan', label: 'Volkan', icon: '▲' },
  { id: 'kanyon', label: 'Kanyon / vadi', icon: '≋' },
  { id: 'duzluk-ova', label: 'Düzlük / ova', icon: '▭' },
  { id: 'kutup-buz', label: 'Kutup buzu', icon: '❄' },
  { id: 'antik-delta-nehir', label: 'Antik delta / nehir', icon: '≈' },
  { id: 'kum-tepesi', label: 'Kum tepesi', icon: '∿' },
  { id: 'daglik-arazi', label: 'Dağlık arazi', icon: '⛰' },
]);

export const TYPE_SAFETY_WEIGHT_LABEL = 'senaryo parametresi, kaynaklı değil';

// tür -> 0..1 "bağlam zorluğu". HEPSİ senaryo parametresidir, kaynaklı değildir
// (bkz. TYPE_SAFETY_WEIGHT_LABEL). Güvenlik skoru veya NASA eşiği DEĞİLDİR.
export const typeSafetyWeight = Object.freeze({
  'duzluk-ova': 0.25,
  krater: 0.45,
  'antik-delta-nehir': 0.5,
  'kum-tepesi': 0.65,
  volkan: 0.7,
  'daglik-arazi': 0.75,
  kanyon: 0.8,
  'kutup-buz': 0.85,
});

export const REGIONS = Object.freeze([
  { id: 'jezero', name: 'Jezero Krateri', type: 'krater', lat: 18.44, lon: 77.45, radiusKm: 25,
    description: 'Antik bir delta tortusu barındıran, yaklaşık 45 km çaplı eski göl krateri.',
    hazardNote: 'Kaya alanları ve delta kenarı eğimleri; yerel DTM bu projede yalnız burada var.' },
  { id: 'gale', name: 'Gale Krateri', type: 'krater', lat: -5.4, lon: 137.8, radiusKm: 77,
    description: 'Ortasında Aeolis Mons (Sharp Dağı) yükselen yaklaşık 154 km çaplı krater.',
    hazardNote: 'Dik merkez dağ yamaçları ve tozlu zemin; bağlam amaçlı.' },
  { id: 'olympus', name: 'Olympus Mons', type: 'volkan', lat: 18.65, lon: -133.8, radiusKm: 300,
    description: 'Güneş Sistemi\'nin bilinen en büyük kalkan volkanı.',
    hazardNote: 'Kenar yamacı sarp uçurumlar; ince atmosfer ve yüksek irtifa.' },
  { id: 'valles', name: 'Valles Marineris', type: 'kanyon', lat: -13.9, lon: -59.2, radiusKm: 1200,
    description: 'Yaklaşık 4000 km uzunluğunda devasa bir kanyon sistemi.',
    hazardNote: 'Çok dik duvarlar ve heyelan blokları; bağlam amaçlı.' },
  { id: 'hellas', name: 'Hellas Planitia', type: 'duzluk-ova', lat: -42.4, lon: 70.5, radiusKm: 1000,
    description: 'Mars\'ın en derin ve geniş çarpma havzalarından biri.',
    hazardNote: 'Mevsimsel don ve yüksek yüzey basıncı; bağlam amaçlı.' },
  { id: 'tharsis', name: 'Tharsis Montes', type: 'volkan', lat: 1.0, lon: -112.0, radiusKm: 700,
    description: 'Arsia, Pavonis ve Ascraeus dağlarından oluşan volkanik yükselti.',
    hazardNote: 'Lav akıntısı yüzeyleri ve yamaç eğimleri; bağlam amaçlı.' },
  { id: 'elysium', name: 'Elysium Mons', type: 'volkan', lat: 25.0, lon: 147.2, radiusKm: 200,
    description: 'Elysium bölgesinin en büyük volkanı.',
    hazardNote: 'Volkanik yamaç ve çatlaklı zemin; bağlam amaçlı.' },
  { id: 'utopia', name: 'Utopia Planitia', type: 'duzluk-ova', lat: 46.7, lon: 117.5, radiusKm: 1200,
    description: 'Kuzey yarımkürede geniş, nispeten düz bir çarpma havzası ovası.',
    hazardNote: 'Yer altı buzu olasılığı ve çokgen zemin desenleri; bağlam amaçlı.' },
  { id: 'syrtis', name: 'Syrtis Major', type: 'daglik-arazi', lat: 8.4, lon: 69.5, radiusKm: 700,
    description: 'Koyu renkli, volkanik kökenli geniş bir yayla.',
    hazardNote: 'Engebeli bazalt zemini; bağlam amaçlı.' },
  { id: 'arabia', name: 'Arabia Terra', type: 'daglik-arazi', lat: 21.0, lon: 3.0, radiusKm: 1200,
    description: 'Çok sayıda eski krater içeren, aşınmış geniş yüksek arazi.',
    hazardNote: 'Kraterli ve aşınmış zemin; bağlam amaçlı.' },
  { id: 'boreum', name: 'Planum Boreum (kuzey kutup tabakalı yatağı)', type: 'kutup-buz', lat: 88.0, lon: 0.0, radiusKm: 600,
    description: 'Su buzu ve tozun tabakalar halinde biriktiği kuzey kutup platosu.',
    hazardNote: 'Aşırı soğuk ve mevsimsel CO2 buzu; bağlam amaçlı.' },
  { id: 'australe', name: 'Güney kutup (Planum Australe)', type: 'kutup-buz', lat: -87.0, lon: 0.0, radiusKm: 600,
    description: 'Su ve karbondioksit buzu içeren güney kutup tabakalı yatağı.',
    hazardNote: 'Aşırı soğuk, uzun kutup gecesi; bağlam amaçlı.' },
  { id: 'meridiani', name: 'Meridiani Planum', type: 'duzluk-ova', lat: -2.0, lon: -2.0, radiusKm: 500,
    description: 'Hematit içeren, çok düz ve geniş bir ova.',
    hazardNote: 'Gevşek kum ve ripple alanları; bağlam amaçlı.' },
  { id: 'noctis', name: 'Noctis Labyrinthus', type: 'kanyon', lat: -7.0, lon: -102.0, radiusKm: 400,
    description: 'Valles Marineris\'in batısında kesişen vadilerden oluşan labirent.',
    hazardNote: 'Dar ve derin çöküntüler; bağlam amaçlı.' },
  { id: 'isidis', name: 'Isidis Planitia', type: 'duzluk-ova', lat: 13.0, lon: 87.0, radiusKm: 700,
    description: 'Jezero\'nun yakınında yer alan geniş, dairesel çarpma havzası.',
    hazardNote: 'Düz ama kum ve kaya dağılımı bilinmiyor; bağlam amaçlı.' },
  { id: 'eberswalde', name: 'Eberswalde Deltası', type: 'antik-delta-nehir', lat: -24.0, lon: -33.5, radiusKm: 35,
    description: 'Bir krater içinde korunmuş, kolları belirgin antik nehir deltası.',
    hazardNote: 'Tortul katmanlar ve kaya parçaları; bağlam amaçlı.' },
  { id: 'olympia', name: 'Olympia Undae', type: 'kum-tepesi', lat: 81.0, lon: 180.0, radiusKm: 500,
    description: 'Kuzey kutup platosunu çevreleyen geniş bir kum tepesi denizi.',
    hazardNote: 'Hareketli kum ve yumuşak zemin; bağlam amaçlı.' },
  { id: 'noachis', name: 'Noachis Terra', type: 'daglik-arazi', lat: -45.0, lon: -10.0, radiusKm: 900,
    description: 'Güney yarımkürede en eski, yoğun kraterli yüksek arazilerden biri.',
    hazardNote: 'Üst üste binmiş kraterler ve engebe; bağlam amaçlı.' },
]);

const DEG = Math.PI / 180;

export function greatCircleDistanceKm(latA, lonA, latB, lonB, radiusKm = MARS_RADIUS_KM) {
  const p1 = latA * DEG, p2 = latB * DEG;
  const dp = p2 - p1, dl = (lonB - lonA) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

// (lat,lon) noktasına en uygun bölge. Küçük bölgeler fareyle seçilebilsin diye etkin yarıçap
// en az snapKm'dir (bu bir seçim kolaylığıdır, bölgenin gerçek boyutu değildir).
// Dönüş: { region, distKm, inside } veya null.
export function findRegionAt(lat, lon, { regions = REGIONS, snapKm = 250, marginKm = 0 } = {}) {
  let best = null;
  for (const region of regions) {
    const dist = greatCircleDistanceKm(lat, lon, region.lat, region.lon);
    const eff = Math.max(region.radiusKm, snapKm) + marginKm;
    if (dist > eff) continue;
    const score = dist / eff;
    if (!best || score < best.score) best = { region, distKm: dist, inside: dist <= region.radiusKm, score };
  }
  return best ? { region: best.region, distKm: best.distKm, inside: best.inside } : null;
}

export function getRegionById(id, regions = REGIONS) {
  return regions.find((r) => r.id === id) || null;
}

export function typeLabel(typeId) {
  const t = REGION_TYPES.find((x) => x.id === typeId);
  return t ? t.label : typeId;
}
