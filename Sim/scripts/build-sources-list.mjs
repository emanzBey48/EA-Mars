#!/usr/bin/env node
// Stage 31A - source / attribution compiler.
//   node scripts/build-sources-list.mjs            -> writes Sim/SOURCES.md
//   node scripts/build-sources-list.mjs --stdout   -> prints it
//   node scripts/build-sources-list.mjs --check    -> exit 1 if SOURCES.md is out of date
//
// Rules (locked by test/build-sources-list.test.mjs):
//   * Facts come only from the data manifests / metadata in the repository, or from the clearly
//     labelled list of external references that the code and project documents already cite.
//   * A licence that is not stated in the record is written "belirtilmemiş". Nothing is guessed,
//     and no field is left empty: every missing value becomes "belirtilmemiş".
//   * Output is deterministic: no timestamps, fixed entry order, LF line endings.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const UNSPECIFIED = 'belirtilmemiş';

/** Empty / whitespace / "not stated" markers all collapse to the same visible word. */
export function orUnspecified(value) {
  if (value === null || value === undefined) return UNSPECIFIED;
  const text = String(value).trim();
  if (text === '') return UNSPECIFIED;
  if (/^not[_ ]stated/i.test(text) || /^belirtilmemi/i.test(text) || /^not_stated$/i.test(text)) return UNSPECIFIED;
  return text;
}

function entry(fields) {
  return {
    id: fields.id,
    name: orUnspecified(fields.name),
    productId: orUnspecified(fields.productId),
    resolution: orUnspecified(fields.resolution),
    license: orUnspecified(fields.license),
    licenseEvidence: orUnspecified(fields.licenseEvidence),
    attribution: orUnspecified(fields.attribution),
    sourceUrl: orUnspecified(fields.sourceUrl),
    usage: orUnspecified(fields.usage),
    caveat: orUnspecified(fields.caveat),
  };
}

const get = (object, ...keys) => keys.reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), object);

/**
 * Build the entries from already-parsed records. Any record may be missing (null): its entry is
 * then still produced, with "belirtilmemiş" in every field the record would have supplied.
 */
export function buildSourceEntries({ dtm = null, legacyDtm = null, trek = null, orthoAlignment = null, geology = null, rawImages = null, viking = null, mola = null } = {}) {
  const entries = [];

  const dtmLabel = get(dtm, 'label');
  entries.push(entry({
    id: 'hirise-dtm',
    name: 'USGS Mars 2020 TRN HiRISE DTM mozaiği (yerel 1 m kot penceresi)',
    productId: get(dtmLabel, 'productId'),
    resolution: get(dtmLabel, 'mapScaleM') != null ? `${dtmLabel.mapScaleM} m/piksel (${dtmLabel.lines} satır x ${dtmLabel.samples} sütun kaynak mozaik; uygulamaya ${get(dtm, 'window', 'rows')} satır x ${get(dtm, 'window', 'cols')} sütun pencere yüklenir)` : null,
    license: get(dtmLabel, 'useConstraints'),
    licenseEvidence: get(dtmLabel, 'useConstraintsEvidence', 'sourceUrl'),
    attribution: [get(dtmLabel, 'producer'), get(dtmLabel, 'citation')].filter(Boolean).join('. '),
    sourceUrl: get(dtmLabel, 'provenanceEvidence', 'sourceUrl'),
    usage: 'Analiz adayı: kabartma/rota/ortomozaik hizası analizleri ve tarihsel doğrulamalar (data/dtm_subset.f32). Arayüzde GÖSTERİLMEZ: düşey datum kanıtı olmadığı için kayıt sistemi fail-closed reddeder ve legacy yedeğe düşer (K3-7, ürün kararı bekliyor)',
    caveat: get(dtmLabel, 'verticalDatumVerified') === false ? 'Düşey datum bu üründe doğrulanmadı (verticalDatumVerified=false); mutlak kot iddiası yok.' : null,
  }));

  const legacyLabel = get(legacyDtm, 'label');
  entries.push(entry({
    id: 'hirise-dtm-legacy',
    name: 'HiRISE DTEEC DTM (eski yerel yedek pencere)',
    productId: get(legacyLabel, 'productId'),
    resolution: get(legacyLabel, 'mapScaleM') != null ? `${legacyLabel.mapScaleM} m/piksel` : null,
    license: get(legacyLabel, 'useConstraints'),
    licenseEvidence: null,
    attribution: get(legacyLabel, 'producer'),
    sourceUrl: null,
    usage: 'AKTİF: arayüzde fiilen gösterilen arazi (fail-closed yedek), zemin kotu, eğim, rota maliyeti, 3D arazi (data/legacy-hirise/); ürün kararı bekliyor (K3-7)',
    caveat: get(legacyLabel, 'dataSetId') ? `PDS veri seti ${legacyLabel.dataSetId}; etikette lisans alanı yok.` : null,
  }));

  const trekFiles = get(trek, 'files', 'metadata_and_vectors') ?? [];
  const findTrek = (file) => trekFiles.find((item) => item.file === file);
  const orthoLevels = get(trek, 'files', 'ortho_tiles', 'levels') ?? [];
  const orthoResolution = orthoLevels.length
    ? `25 cm nominal; indirilen WMTS karoları z${orthoLevels[orthoLevels.length - 1].zoom} = ${orthoLevels[orthoLevels.length - 1].resolution_m_per_px} m/px ... z${orthoLevels[0].zoom} = ${orthoLevels[0].resolution_m_per_px} m/px`
    : null;
  const orthoGsd = get(orthoAlignment, 'groundSampleDistance');
  entries.push(entry({
    id: 'trek-ortho',
    name: 'NASA JPL Mars Trek WMTS: MRO HiRISE Jezero kontrollü ortomozaik',
    productId: get(orthoAlignment, 'product', 'layerId'),
    resolution: orthoGsd && orthoGsd.meetsNominal25cm === false && orthoResolution
      ? `${orthoResolution} (z17 ölçüsü ${orthoGsd.northSouthM.toFixed(3)} m; nominal 25 cm karşılanmıyor)`
      : orthoResolution,
    license: get(orthoAlignment, 'attribution', 'licenseStatus') ?? get(findTrek('hirise_ortho_25cm_fgdc.html'), 'license'),
    licenseEvidence: get(orthoAlignment, 'attribution', 'fgdcUseConstraints') === '' ? 'FGDC Use_Constraints / Access_Constraints alanları boş' : null,
    attribution: get(orthoAlignment, 'attribution', 'creditAsFoundInManifest'),
    sourceUrl: get(findTrek('hirise_ortho_25cm_fgdc.html'), 'source_url'),
    usage: 'HiRISE ortomozaik kaplaması (data/mars-trek/ortho-tiles, data/ortho/*.png); yarım piksel hizası kanıtlanmadı',
    caveat: 'DTM ürününün CC0 ifadesi bu ortomozaiğe uygulanmaz; ortomozaik lisansı kaynakta yazılı değil.',
  }));

  entries.push(entry({
    id: 'trek-dtm-fgdc',
    name: 'NASA JPL Mars Trek FGDC kaydı: MRO HiRISE Jezero DEM (kontrollü)',
    productId: get(trek, 'files', 'metadata_and_vectors') ? 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40' : null,
    resolution: '1 m (manifest tanımı)',
    license: get(findTrek('hirise_dtm_1m_fgdc.html'), 'license'),
    licenseEvidence: get(trek, 'files') ? 'Trek FGDC kaydı: Use_Constraints / Access_Constraints alanları boş' : null,
    attribution: get(trek, 'dataset_title'),
    sourceUrl: get(findTrek('hirise_dtm_1m_fgdc.html'), 'source_url'),
    usage: 'Yalnızca üst veri / çerçeve karşılaştırması',
    caveat: null,
  }));

  entries.push(entry({
    id: 'm20-traverse',
    name: 'NASA Mars 2020 MMGIS arşiv izi ve waypointler (M20_traverse.json, M20_waypoints.json)',
    productId: 'M20_traverse / M20_waypoints',
    resolution: 'vektör (nokta/çizgi); çözünürlük kavramı yok',
    license: get(findTrek('M20_traverse.json'), 'license'),
    licenseEvidence: null,
    attribution: get(trek, 'dataset_title'),
    sourceUrl: get(findTrek('M20_traverse.json'), 'source_url'),
    usage: 'Arşiv sürüş izi katmanı ve waypoint doğrulaması; rover izi insan yürüyüş rotası değildir ve PLACES değildir',
    caveat: 'Canlı telemetri değildir; arşiv verisidir.',
  }));

  entries.push(entry({
    id: 'sim3464',
    name: 'USGS SIM 3464 Jezero krateri ve Nili Planum jeolojik haritası',
    productId: get(geology, 'title') ? 'USGS Scientific Investigations Map 3464' : null,
    resolution: get(geology, 'citation') && /1:75,000/.test(geology.citation) ? 'harita ölçeği 1:75.000 (vektör)' : null,
    license: get(geology, 'license'),
    licenseEvidence: get(geology, 'files') ? 'Sağlanan FGDC metaverisinde ve servis bilgisinde kullanım/lisans ifadesi bulunmadı (copyrightText boş)' : null,
    attribution: get(geology, 'citation'),
    sourceUrl: get(geology, 'files', 0, 'source_url') ? 'https://pubs.usgs.gov/sim/3464/ ve ' + get(geology, 'arcgis_services', 'canonical_endpoint') : null,
    usage: 'Jeolojik birim sınırları ve kontak mesafesi (data/usgs-sim3464-geology)',
    caveat: 'Harita ölçeği 1:75.000; 1 m DTM ile aynı doğrulukta sınır göstermez.',
  }));

  const rawSample = get(rawImages, 'images', 0);
  entries.push(entry({
    id: 'perseverance-raw',
    name: 'NASA/JPL-Caltech Mars 2020 Perseverance ham görüntü arşivi (Sol 120 ve Sol 164)',
    productId: get(rawImages, 'images') ? `${rawImages.images.length} ham görüntü; Navcam, Hazcam, SuperCam, Mastcam-Z, CacheCam` : null,
    resolution: get(rawImages, 'images') ? 'JPEG ön izleme (dosya adı soneki _1200; boyutlar manifestte); ham, kalibre edilmemiş' : null,
    license: get(rawImages, 'license'),
    licenseEvidence: null,
    attribution: get(rawSample, 'credit') ?? get(rawImages, 'citation'),
    sourceUrl: get(rawSample, 'sourceUrl') ? 'https://mars.nasa.gov/mars2020-raw-images/' : null,
    usage: 'Sol 120 / Sol 164 durak fotoğrafı galerisi (data/perseverance-raw)',
    caveat: 'Ham görüntüler, bilimsel kalibre değildir; yön bilgisi tahminidir.',
  }));

  entries.push(entry({
    id: 'mola-trek',
    name: 'NASA Mars Trek MOLA ImageServer bölgesel kot penceresi',
    productId: get(mola, 'product', 'layer'),
    resolution: get(mola, 'grid') ? `${get(mola, 'product', 'nominalPixelM')} m nominal; ${mola.grid.width} x ${mola.grid.height} hücre, ${mola.grid.pixelSizeDeg}°` : null,
    license: get(mola, 'license'),
    licenseEvidence: get(mola, 'product', 'serviceCopyrightText') === '' ? 'ImageServer copyrightText alanı boş' : null,
    attribution: get(mola, 'attribution'),
    sourceUrl: get(mola, 'product', 'serviceUrl'),
    usage: 'Bölgesel bağlam / ufuk verisi (data/regional-dem); yürünebilirlik puanı üretmez',
    caveat: get(mola, 'status') ? `Durum: ${mola.status}; düşey datum ve enlem konvansiyonu doğrulanmadı.` : null,
  }));

  entries.push(entry({
    id: 'viking-mdim',
    name: 'USGS Astrogeology Viking MDIM 2.1 renkli küresel mozaik (karo piramidi)',
    productId: get(viking, 'source', 'file'),
    resolution: get(viking, 'projection', 'nativeMPerPx') != null ? `${viking.projection.nativeMPerPx} m/piksel yerel çözünürlük (piramit z0-z3)` : null,
    license: get(viking, 'license'),
    licenseEvidence: get(viking, 'licenseEvidence'),
    attribution: get(viking, 'attribution'),
    sourceUrl: null,
    usage: 'Küresel minimap bağlam zemini (data/viking-mdim); ortogörüntü ve kot verisi değildir',
    caveat: 'İşlenmiş renk ürünü; 232 m/piksel yerel doku olarak kullanılamaz.',
  }));

  // External references that the code and project documents already cite. These have no data files
  // in the repository, so no licence statement was read from them: licence stays "belirtilmemiş".
  entries.push(entry({
    id: 'nasa-planet-compare',
    name: 'NASA Planet Compare (Mars yüzey yerçekimi)',
    productId: 'Mars yüzey yerçekimi 3.71 m/s²',
    resolution: 'tek sayı (yuvarlatılmış)',
    license: null,
    licenseEvidence: null,
    attribution: 'NASA',
    sourceUrl: 'https://solarsystem.nasa.gov/planet-compare/?intent=121',
    usage: 'Zıplama balistiğinde dikey ivme (config.js)',
    caveat: 'Küresel ortalama referans; Jezero yerel ölçümü değil. NSSDC 3.73 m/s² verir (yuvarlama farkı).',
  }));
  entries.push(entry({
    id: 'nssdc-mars',
    name: 'NASA NSSDC Mars Fact Sheet',
    productId: 'Mars Fact Sheet',
    resolution: 'tek sayılar / aralıklar',
    license: null,
    licenseEvidence: null,
    attribution: 'NASA NSSDC',
    sourceUrl: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
    usage: 'Yerçekimi 3.73 m/s² karşılaştırması; ortalama basınç 6.36 mbar (mevsimsel 4.0-8.7 mbar); yoğunluk ~0.016 ± 0.006 kg/m³; yarı büyük eksen 1.52366231 AU',
    caveat: 'Ortalama/mevsimsel değerlerdir; Jezero anlık ölçümü değildir. Hareket fiziğine atmosfer sürüklemesi eklenmedi.',
  }));
  entries.push(entry({
    id: 'nssdc-sun',
    name: 'NASA NSSDC Sun Fact Sheet',
    productId: 'Sun Fact Sheet',
    resolution: 'tek sayı',
    license: null,
    licenseEvidence: null,
    attribution: 'NASA NSSDC',
    sourceUrl: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html',
    usage: 'Güneşin 1 AU\'daki görünür çapı 1919 yay saniyesi; Mars mesafesiyle ölçeklenir (sky-model.js)',
    caveat: 'Yalnızca güneş diski boyutu kaynaklıdır; gökyüzü renkleri sunum parametresidir.',
  }));
  entries.push(entry({
    id: 'pia19400',
    name: 'NASA Photojournal PIA19400 "Sunset in Mars\' Gale Crater"',
    productId: 'PIA19400',
    resolution: 'görüntü başlığı (niteliksel)',
    license: null,
    licenseEvidence: null,
    attribution: 'NASA Photojournal (kredi satırı depoda kayıtlı değil; sayfadan doğrulanmalı)',
    sourceUrl: 'https://science.nasa.gov/photojournal/sunset-in-mars-gale-crater',
    usage: 'Gün batımında ince tozun mavi ışığı güneş çevresinde tuttuğu niteliksel davranış (sky-model.js)',
    caveat: 'Yalnızca niteliksel; renk/yoğunluk sayısı bu kaynaktan gelmez.',
  }));
  entries.push(entry({
    id: 'mars24',
    name: 'NASA GISS Mars24 güneş saati algoritması',
    productId: 'Mars24 bölüm D-1, D-5/D-6',
    resolution: 'formül',
    license: null,
    licenseEvidence: null,
    attribution: 'NASA GISS',
    sourceUrl: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html',
    usage: 'Güneş yönü ve deklinasyon (geo/mars-sun.js)',
    caveat: 'Senaryo parametreleri: Lₛ 0° ve yerel gerçek güneş saati 15.00.',
  }));

  return entries;
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function renderSourcesMarkdown(entries) {
  const unspecifiedCount = entries.filter((item) => item.license === UNSPECIFIED).length;
  const lines = [
    '# Marswalk kaynaklar ve atıflar',
    '',
    'Bu dosya `node scripts/build-sources-list.mjs` ile üretilir; elle düzenlemeyin. İçerik yalnızca depodaki `data/*/manifest.json` ve üst veri kayıtlarından, ayrıca kodun/belgelerin zaten andığı dış kaynaklardan gelir.',
    `Kaynakta yazılı olmayan her alan **${UNSPECIFIED}** olarak bırakılır; hiçbir lisans tahmin edilmez. Aşağıdaki ${entries.length} kaynaktan ${unspecifiedCount} tanesinde lisans ${UNSPECIFIED}.`,
    '',
    '| # | Kaynak | Ürün kimliği | Çözünürlük | Lisans | Atıf |',
    '|---|---|---|---|---|---|',
  ];
  entries.forEach((item, index) => {
    lines.push(`| ${index + 1} | ${cell(item.name)} | ${cell(item.productId)} | ${cell(item.resolution)} | ${cell(item.license)} | ${cell(item.attribution)} |`);
  });
  lines.push('', '## Ayrıntılar', '');
  entries.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.name}`, '');
    lines.push(`- **Kaynak adresi:** ${item.sourceUrl}`);
    lines.push(`- **Lisans:** ${item.license}`);
    lines.push(`- **Lisans kanıtı:** ${item.licenseEvidence}`);
    lines.push(`- **Uygulamadaki kullanım:** ${item.usage}`);
    lines.push(`- **Sınır / uyarı:** ${item.caveat}`);
    lines.push('');
  });
  lines.push('Görüntü/veri: NASA / JPL-Caltech / University of Arizona / USGS Astrogeology Science Center (ürün bazında yukarıdaki tablodaki atıflara bakın).', '');
  return lines.join('\n');
}

function readJsonIfExists(absPath) {
  try { return JSON.parse(fs.readFileSync(absPath, 'utf8')); } catch { return null; }
}

export function loadSourceRecords(root) {
  const data = (...parts) => path.join(root, 'data', ...parts);
  return {
    dtm: readJsonIfExists(data('dtm_subset.json')),
    legacyDtm: readJsonIfExists(data('legacy-hirise', 'dtm_subset.json')),
    trek: readJsonIfExists(data('mars-trek', 'manifest.json')),
    orthoAlignment: readJsonIfExists(data('ortho', 'ortho-alignment-z17-tiles.json')),
    geology: readJsonIfExists(data('usgs-sim3464-geology', 'manifest.json')),
    rawImages: readJsonIfExists(data('perseverance-raw', 'manifest.json')),
    viking: readJsonIfExists(data('viking-mdim', 'manifest.json')),
    mola: readJsonIfExists(data('regional-dem', 'mola-jezero.json')),
  };
}

export function buildSourcesMarkdown(root) {
  return renderSourcesMarkdown(buildSourceEntries(loadSourceRecords(root)));
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const markdown = buildSourcesMarkdown(root);
  const target = path.join(root, 'SOURCES.md');
  if (argv.includes('--stdout')) { process.stdout.write(markdown); return 0; }
  if (argv.includes('--check')) {
    let current = '';
    try { current = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'); } catch { /* missing */ }
    if (current !== markdown) { console.error('SOURCES.md güncel değil: node scripts/build-sources-list.mjs çalıştırın.'); return 1; }
    console.log('SOURCES.md güncel.');
    return 0;
  }
  fs.writeFileSync(target, markdown, 'utf8');
  console.log(`SOURCES.md yazıldı (${markdown.split('\n').length} satır).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
