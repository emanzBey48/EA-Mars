// Layer manifest contract, field-level metadata validator and SurfaceProvider registry/factory.
// Ensures incoming datasets are NEVER guessed (CRS, unit, datum, scaling, no-data or pixel convention).
// Only verified manifests become active SurfaceProviders; ambiguous (`needs_review`), `invalid` or
// `unavailable` manifests fall back cleanly to `UnavailableLayer` (or a registered fallback provider).
import { STATUS, makeDescriptor, UnavailableLayer, dtmBaseDescriptor, loadDtmLayer } from './layers.js';

/** Overall validation & readiness states for a layer manifest. */
export const VALIDATION_STATUS = Object.freeze({
  SUPPORTED: 'supported',       // All required metadata + canonical local-metre transform verified
  NEEDS_REVIEW: 'needs_review', // Human verification required; sampling is disabled
  UNAVAILABLE: 'unavailable',   // Data file/resource not accessible
  INVALID: 'invalid',           // Missing, contradictory or unsupported metadata
});

/** Formats actually supported by the zero-dependency runtime today. */
export const SUPPORTED_FORMATS = Object.freeze([
  'PDS3_PC_REAL_F32_WINDOW', // Prepared float32 window derived from a verified PDS3 PC_REAL DTM label
]);

const REL_TOL = 1e-9;
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isPosNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isFinNum = (v) => typeof v === 'number' && Number.isFinite(v);

function approxEq(a, b, tol = REL_TOL) {
  return isFinNum(a) && isFinNum(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

/**
 * Validates a layer manifest field-by-field against the canonical simulation frame.
 * Never guesses missing CRS, unit, datum, scaling or no-data rules.
 *
 * @param {object} manifest
 * @param {object} expectedFrame  canonical MAP_FRAME (radiusKm, centerLatDeg, centerLonDeg, mapScaleM, ...)
 * @returns {{
 *   status: 'supported'|'needs_review'|'unavailable'|'invalid',
 *   samplingAllowed: boolean,
 *   reasonCode: string,
 *   summary: string,
 *   fields: Record<string, {status: string, message: string}>,
 *   issues: Array<{field: string, status: string, message: string}>
 * }}
 */
export function validateLayerManifest(manifest, expectedFrame) {
  const fields = {};
  const issues = [];
  const record = (field, status, message) => {
    fields[field] = { status, message };
    if (status !== VALIDATION_STATUS.SUPPORTED) issues.push({ field, status, message });
  };

  if (!manifest || typeof manifest !== 'object') {
    return {
      status: VALIDATION_STATUS.INVALID,
      samplingAllowed: false,
      reasonCode: 'manifest_missing',
      summary: 'Katman manifesti eksik veya geçersiz nesne.',
      fields,
      issues: [{ field: 'manifest', status: VALIDATION_STATUS.INVALID, message: 'Manifest nesnesi sağlanmadı.' }],
    };
  }

  // 1. Identity, source, product/version, attribution
  if (isNonEmptyStr(manifest.id) && isNonEmptyStr(manifest.title) && isNonEmptyStr(manifest.kind)) {
    record('identity', VALIDATION_STATUS.SUPPORTED, `${manifest.id} (${manifest.kind})`);
  } else {
    record('identity', VALIDATION_STATUS.INVALID, 'id, title ve kind zorunludur.');
  }

  if (isNonEmptyStr(manifest.product) && isNonEmptyStr(manifest.version) && isNonEmptyStr(manifest.source) && isNonEmptyStr(manifest.attribution)) {
    record('provenance', VALIDATION_STATUS.SUPPORTED, `${manifest.product} v${manifest.version} · ${manifest.source}`);
  } else {
    record('provenance', VALIDATION_STATUS.INVALID, 'product, version, source ve attribution alanları zorunludur.');
  }

  // 2. Target body & observation/product time coverage + explicit non-live relation to sim clock
  const body = String(manifest.body ?? '').toUpperCase();
  if (body === 'MARS') {
    record('body', VALIDATION_STATUS.SUPPORTED, 'MARS');
  } else {
    record('body', VALIDATION_STATUS.INVALID, `Hedef gövde MARS olmalıdır (gelen: ${manifest.body ?? 'boş'}).`);
  }

  const tc = manifest.timeCoverage;
  if (tc && isNonEmptyStr(tc.summary) && tc.simClockRelation === 'independent_static_archive') {
    record('timeCoverage', VALIDATION_STATUS.SUPPORTED, `${tc.summary} (simülasyon saatinden bağımsız arşiv verisi)`);
  } else if (tc && isNonEmptyStr(tc.summary)) {
    record('timeCoverage', VALIDATION_STATUS.NEEDS_REVIEW, 'Zaman kapsamı ile simülasyon saati ilişkisi (simClockRelation) açıkça doğrulanmalı; canlı veri varsayılmaz.');
  } else {
    record('timeCoverage', VALIDATION_STATUS.INVALID, 'timeCoverage.summary zorunludur.');
  }

  // 3. Unit & vertical datum / reference
  if (manifest.unit === 'm' && isNonEmptyStr(manifest.verticalDatum)) {
    if (manifest.verticalDatumVerified === false) {
      record('verticalReference', VALIDATION_STATUS.NEEDS_REVIEW, `Düşey datum (${manifest.verticalDatum}) insan doğrulaması bekliyor.`);
    } else {
      record('verticalReference', VALIDATION_STATUS.SUPPORTED, `Birim: m · Düşey datum: ${manifest.verticalDatum}`);
    }
  } else {
    record('verticalReference', VALIDATION_STATUS.INVALID, 'Birim ("m") ve verticalDatum açıkça tanımlanmalıdır; tahmin edilmez.');
  }

  // 4. Full CRS / projection definition & canonical local-metre transform verification
  const crs = manifest.crs;
  if (!crs || typeof crs !== 'object') {
    record('crs', VALIDATION_STATUS.INVALID, 'CRS tanımı eksik; projeksiyon tahmin edilmez.');
  } else if (
    crs.projectionType !== 'EQUIRECTANGULAR' ||
    crs.latitudeType !== 'PLANETOCENTRIC' ||
    crs.positiveLongitudeDirection !== 'EAST' ||
    !approxEq(crs.rotationDeg ?? NaN, 0)
  ) {
    record('crs', VALIDATION_STATUS.INVALID, 'Yalnız doğrulanmış EQUIRECTANGULAR / PLANETOCENTRIC / EAST / 0° dönüşlü CRS destekleniyor.');
  } else if (
    expectedFrame &&
    (!approxEq(crs.radiusKm, expectedFrame.radiusKm) ||
      !approxEq(crs.centerLatDeg, expectedFrame.centerLatDeg) ||
      !approxEq(crs.centerLonDeg, expectedFrame.centerLonDeg))
  ) {
    record('crs', VALIDATION_STATUS.INVALID, 'CRS küre yarıçapı veya merkez enlem/boylamı kanonik yerel metre düzlemiyle uyuşmuyor.');
  } else if (crs.transformVerified !== true) {
    record('crs', VALIDATION_STATUS.NEEDS_REVIEW, 'CRS→yerel metre dönüşümü (transformVerified=true) insan doğrulaması bekliyor.');
  } else {
    record('crs', VALIDATION_STATUS.SUPPORTED, `Equirectangular R=${crs.radiusKm} km, std. paralel ${crs.centerLatDeg}°, merkez boylam ${crs.centerLonDeg}°E`);
  }

  // 5. Grid dimensions, coverage, resolution, row/col orientation & pixel-center/pixel-area rule
  const grid = manifest.grid;
  if (!grid || typeof grid !== 'object') {
    record('grid', VALIDATION_STATUS.INVALID, 'Grid boyutu, çözünürlük ve piksel kuralı eksik.');
  } else if (
    !isPosNum(grid.lines) || !isPosNum(grid.samples) ||
    !isPosNum(grid.mapScaleM) || !isFinNum(grid.lineProjectionOffset) || !isFinNum(grid.sampleProjectionOffset)
  ) {
    record('grid', VALIDATION_STATUS.INVALID, 'lines, samples, mapScaleM ve projeksiyon ofsetleri sayısal olmalıdır.');
  } else if (grid.rowDirection !== 'SOUTH' || grid.colDirection !== 'EAST') {
    record('grid', VALIDATION_STATUS.INVALID, `Satır/sütun yönü SOUTH/EAST olmalıdır (gelen: ${grid.rowDirection}/${grid.colDirection}).`);
  } else if (grid.pixelRegistration !== 'CENTER_PDS_1BASED') {
    record('grid', VALIDATION_STATUS.NEEDS_REVIEW, `Piksel kayıt kuralı (${grid.pixelRegistration ?? 'belirsiz'}) yarım piksel belirsizliği içeriyor; insan doğrulaması olmadan örnekleme açılmaz.`);
  } else if (
    expectedFrame &&
    (!approxEq(grid.mapScaleM, expectedFrame.mapScaleM) ||
      !approxEq(grid.lineProjectionOffset, expectedFrame.lineProjectionOffset) ||
      !approxEq(grid.sampleProjectionOffset, expectedFrame.sampleProjectionOffset) ||
      grid.lines !== expectedFrame.lines ||
      grid.samples !== expectedFrame.samples)
  ) {
    record('grid', VALIDATION_STATUS.INVALID, 'Grid ölçeği, boyutu veya projeksiyon ofseti kanonik çerçeveyle uyuşmuyor.');
  } else if (!manifest.coverage || !isNonEmptyStr(manifest.coverage.description)) {
    record('grid', VALIDATION_STATUS.INVALID, 'Kapsama alanı açıklaması (coverage.description) eksik.');
  } else {
    record('grid', VALIDATION_STATUS.SUPPORTED, `${grid.lines}×${grid.samples} hücre, ${grid.mapScaleM.toFixed(6)} m/px, ${grid.pixelRegistration}`);
  }

  // 6. No-data / special value, scaling/offset, valid range & format
  const valSpec = manifest.valueEncoding;
  if (!valSpec || typeof valSpec !== 'object') {
    record('valueEncoding', VALIDATION_STATUS.INVALID, 'Değer kodlaması (format, scaling, no-data, geçerli aralık) eksik.');
  } else if (!SUPPORTED_FORMATS.includes(valSpec.format)) {
    record('valueEncoding', VALIDATION_STATUS.INVALID, `Desteklenmeyen veri biçimi: ${valSpec.format ?? 'belirsiz'}. Yalnız ${SUPPORTED_FORMATS.join(', ')} desteklenir.`);
  } else if (!approxEq(valSpec.scalingFactor, 1) || !approxEq(valSpec.offset, 0)) {
    record('valueEncoding', VALIDATION_STATUS.NEEDS_REVIEW, `SCALING_FACTOR=${valSpec.scalingFactor}, OFFSET=${valSpec.offset}: birim dönüşümü insan doğrulaması bekliyor.`);
  } else if (!isNonEmptyStr(valSpec.noDataHex) || !/^[0-9A-F]{8}$/i.test(valSpec.noDataHex)) {
    record('valueEncoding', VALIDATION_STATUS.INVALID, 'noDataHex (32-bit hex MISSING_CONSTANT) açıkça tanımlanmalıdır; 0 varsayılmaz.');
  } else if (!isFinNum(valSpec.validMin) || !isFinNum(valSpec.validMax) || valSpec.validMin >= valSpec.validMax) {
    record('valueEncoding', VALIDATION_STATUS.INVALID, 'validMin ve validMax geçerli bir aralık olmalıdır.');
  } else {
    record('valueEncoding', VALIDATION_STATUS.SUPPORTED, `Biçim: ${valSpec.format}, no-data: 0x${valSpec.noDataHex.toUpperCase()}, aralık: [${valSpec.validMin}, ${valSpec.validMax}] m`);
  }

  // 7. Access & human review flags
  const access = manifest.access;
  if (!access || access.status !== STATUS.OK) {
    record('access', VALIDATION_STATUS.UNAVAILABLE, access?.reason ?? 'Veri kaynağına erişilemiyor.');
  } else {
    record('access', VALIDATION_STATUS.SUPPORTED, 'Yerel veri penceresi erişilebilir.');
  }

  if (manifest.humanReviewRequired === true) {
    record('humanReview', VALIDATION_STATUS.NEEDS_REVIEW, manifest.humanReviewNote ?? 'Manifest insan incelemesi gerektiriyor; örnekleme kapalı.');
  } else {
    record('humanReview', VALIDATION_STATUS.SUPPORTED, 'Açık insan incelemesi kilidi yok.');
  }

  // Overall status priority: INVALID > UNAVAILABLE > NEEDS_REVIEW > SUPPORTED
  let status = VALIDATION_STATUS.SUPPORTED;
  let reasonCode = 'verified';
  if (issues.some((i) => i.status === VALIDATION_STATUS.INVALID)) {
    status = VALIDATION_STATUS.INVALID;
    reasonCode = `invalid_${issues.find((i) => i.status === VALIDATION_STATUS.INVALID).field}`;
  } else if (issues.some((i) => i.status === VALIDATION_STATUS.UNAVAILABLE)) {
    status = VALIDATION_STATUS.UNAVAILABLE;
    reasonCode = 'resource_unavailable';
  } else if (issues.some((i) => i.status === VALIDATION_STATUS.NEEDS_REVIEW)) {
    status = VALIDATION_STATUS.NEEDS_REVIEW;
    reasonCode = `needs_review_${issues.find((i) => i.status === VALIDATION_STATUS.NEEDS_REVIEW).field}`;
  }

  const summary = status === VALIDATION_STATUS.SUPPORTED
    ? 'Tüm zorunlu metadata ve kanonik yerel metre dönüşümü doğrulandı (supported).'
    : issues.map((i) => `[${i.field} → ${i.status}] ${i.message}`).join(' | ');

  return {
    status,
    samplingAllowed: status === VALIDATION_STATUS.SUPPORTED,
    reasonCode,
    summary,
    fields,
    issues,
  };
}

/** Builds a layer manifest from the prepared HiRISE `dtm_subset.json` metadata. */
export function buildHiriseManifestFromMeta(meta) {
  const label = meta.label ?? {};
  return {
    id: 'hirise-jezero-dtm',
    title: 'HiRISE DTM (Jezero)',
    kind: 'elevation',
    product: label.productId ?? 'DTEEC_045994_1985_046060_1985_U01',
    version: String(label.productVersionId ?? '1'),
    source: 'NASA PDS / HiRISE (University of Arizona, USGS Astrogeology)',
    attribution: 'NASA/JPL/University of Arizona (HiRISE)',
    body: 'MARS',
    timeCoverage: {
      summary: meta.timeCoverage ?? 'Stereo kaynak gözlemleri ESP_045994_1985 ve ESP_046060_1985 (statik arşiv ürünü; PDS etiketinde edinim saati yok)',
      simClockRelation: 'independent_static_archive',
    },
    unit: 'm',
    verticalDatum: 'Mars 2000 (Smith vd. 2001) eşpotansiyel yüzeyi',
    verticalDatumVerified: true,
    crs: {
      projectionType: label.projectionType,
      latitudeType: label.latitudeType,
      positiveLongitudeDirection: label.positiveLongitude,
      radiusKm: label.radiusKm,
      centerLatDeg: label.centerLatDeg,
      centerLonDeg: label.centerLonDeg,
      rotationDeg: label.rotationDeg,
      description: meta.crsText,
      transformVerified: meta.frameMatchesConfig === true,
    },
    grid: {
      lines: label.lines,
      samples: label.samples,
      mapScaleM: label.mapScaleM,
      lineProjectionOffset: label.lineProjectionOffset,
      sampleProjectionOffset: label.sampleProjectionOffset,
      rowDirection: 'SOUTH',
      colDirection: 'EAST',
      pixelRegistration: 'CENTER_PDS_1BASED',
      loadedWindow: meta.window ?? null,
    },
    coverage: meta.coverage ?? null,
    valueEncoding: {
      format: label.sampleType === 'PC_REAL' && label.sampleBits === 32 ? 'PDS3_PC_REAL_F32_WINDOW' : `${label.sampleType}/${label.sampleBits}`,
      sampleType: label.sampleType,
      sampleBits: label.sampleBits,
      scalingFactor: label.scalingFactor,
      offset: label.offset,
      noDataHex: label.missingConstantHex,
      validMin: label.validMin,
      validMax: label.validMax,
    },
    quality: {
      windowStats: meta.windowStats ?? null,
      registration: meta.registration ?? null,
    },
    access: { status: STATUS.OK, reason: null },
    humanReviewRequired: false,
  };
}

/** Converts a manifest + validation result into a layer descriptor for the UI and UnavailableLayer. */
export function manifestToDescriptor(manifest, validation) {
  const base = dtmBaseDescriptor();
  if (!manifest || typeof manifest !== 'object') {
    return makeDescriptor({
      ...base,
      validation,
      access: { status: STATUS.INVALID, reason: validation?.summary ?? 'Geçersiz manifest' },
    });
  }
  const accessStatus = validation.samplingAllowed
    ? STATUS.OK
    : validation.status === VALIDATION_STATUS.UNAVAILABLE
      ? STATUS.UNAVAILABLE
      : STATUS.INVALID;
  return makeDescriptor({
    id: manifest.id ?? base.id,
    kind: manifest.kind ?? base.kind,
    title: manifest.title ?? base.title,
    source: manifest.source ?? base.source,
    product: manifest.product ?? base.product,
    version: manifest.version ?? null,
    attribution: manifest.attribution ?? base.attribution,
    body: manifest.body ?? 'MARS',
    unit: manifest.unit ?? null,
    verticalDatum: manifest.verticalDatum ?? null,
    crs: manifest.crs?.description ?? (manifest.crs ? `${manifest.crs.projectionType ?? '?'} (${manifest.crs.latitudeType ?? '?'})` : null),
    pixelScaleM: manifest.grid?.mapScaleM ?? null,
    size: manifest.grid ? {
      rows: manifest.grid.lines,
      cols: manifest.grid.samples,
      loadedWindow: manifest.grid.loadedWindow ?? null,
      rowDirection: manifest.grid.rowDirection,
      colDirection: manifest.grid.colDirection,
      pixelRegistration: manifest.grid.pixelRegistration,
    } : null,
    coverage: manifest.coverage ?? null,
    timeCoverage: manifest.timeCoverage?.summary ?? (typeof manifest.timeCoverage === 'string' ? manifest.timeCoverage : null),
    simClockRelation: manifest.timeCoverage?.simClockRelation ?? null,
    noData: manifest.valueEncoding ? {
      constantHex: manifest.valueEncoding.noDataHex,
      rule: `Tam 32-bit desen eşleşmesi → no_data · ölçek=${manifest.valueEncoding.scalingFactor}, ofset=${manifest.valueEncoding.offset}`,
    } : null,
    quality: manifest.valueEncoding ? {
      validMin: manifest.valueEncoding.validMin,
      validMax: manifest.valueEncoding.validMax,
      format: manifest.valueEncoding.format,
      windowStats: manifest.quality?.windowStats ?? null,
      registration: manifest.quality?.registration ?? null,
    } : null,
    validation,
    access: {
      status: accessStatus,
      reason: validation.samplingAllowed ? null : `[${validation.status} / ${validation.reasonCode}] ${validation.summary}`,
    },
  });
}

/**
 * Registry and factory for SurfaceProviders.
 * Keeps `SurfaceProvider` contract intact (`sampleElevation`, `sampleSlope`, `sampleSurface`).
 * Today's active default provider is `hirise-jezero-dtm`. When organiser competition datasets arrive,
 * their manifests are validated here before any sampling is enabled; if rejected or unavailable,
 * `resolveActiveProvider` falls back to the verified HiRISE provider or `UnavailableLayer`.
 */
export class SurfaceProviderRegistry {
  constructor({ expectedFrame, adapter, defaultProviderId = 'hirise-jezero-dtm' }) {
    this.expectedFrame = expectedFrame;
    this.adapter = adapter;
    this.defaultProviderId = defaultProviderId;
    this.entries = new Map();
  }

  /**
   * Registers a provider definition.
   * @param {{ id: string, title: string, isCompetitionData?: boolean, load: (ctx: object) => Promise<{manifest: object, createLayer?: (descriptor: object) => Promise<object>}> }} entry
   */
  register(entry) {
    if (!entry || !isNonEmptyStr(entry.id) || typeof entry.load !== 'function') {
      throw new Error('Provider kaydı için geçerli id ve load() işlevi zorunludur.');
    }
    this.entries.set(entry.id, entry);
    return this;
  }

  listRegisteredIds() {
    return [...this.entries.keys()];
  }

  /** Validates an arbitrary manifest against this registry's canonical frame and returns a provider + report. */
  instantiateFromManifest(manifest, createSupportedLayer = null) {
    const validation = validateLayerManifest(manifest, this.expectedFrame);
    const descriptor = manifestToDescriptor(manifest, validation);
    if (!validation.samplingAllowed || typeof createSupportedLayer !== 'function') {
      const reason = `[${validation.status} / ${validation.reasonCode}] ${validation.summary}`;
      return {
        provider: new UnavailableLayer(descriptor, reason),
        validation,
        descriptor,
      };
    }
    const provider = createSupportedLayer(descriptor);
    return { provider, validation, descriptor };
  }

  /** Loads and validates a registered provider by id. Never throws; returns UnavailableLayer on any failure. */
  async loadProvider(id, options = {}) {
    const entry = this.entries.get(id);
    if (!entry) {
      const validation = {
        status: VALIDATION_STATUS.UNAVAILABLE,
        samplingAllowed: false,
        reasonCode: 'provider_not_registered',
        summary: `Kayıtlı olmayan yüzey sağlayıcı: ${id}`,
        fields: {},
        issues: [{ field: 'id', status: VALIDATION_STATUS.UNAVAILABLE, message: `${id} kayıtlı değil.` }],
      };
      const desc = manifestToDescriptor({ id, title: id, kind: 'elevation', product: id }, validation);
      return { id, provider: new UnavailableLayer(desc, desc.access.reason), validation };
    }
    try {
      const loaded = await entry.load({ expectedFrame: this.expectedFrame, adapter: this.adapter, ...options });
      const validation = validateLayerManifest(loaded.manifest, this.expectedFrame);
      const descriptor = manifestToDescriptor(loaded.manifest, validation);
      if (!validation.samplingAllowed) {
        return {
          id,
          provider: new UnavailableLayer(descriptor, descriptor.access.reason),
          validation,
        };
      }
      const provider = await loaded.createLayer(descriptor);
      return { id, provider, validation };
    } catch (e) {
      const validation = {
        status: VALIDATION_STATUS.UNAVAILABLE,
        samplingAllowed: false,
        reasonCode: 'load_exception',
        summary: `Sağlayıcı yüklenirken hata: ${e.message}`,
        fields: {},
        issues: [{ field: 'access', status: VALIDATION_STATUS.UNAVAILABLE, message: e.message }],
      };
      const desc = manifestToDescriptor({ id: entry.id, title: entry.title, kind: 'elevation', product: entry.id }, validation);
      return { id, provider: new UnavailableLayer(desc, desc.access.reason), validation };
    }
  }

  /**
   * Resolves the requested provider (or default HiRISE provider). If a non-default requested provider
   * fails validation (`needs_review`, `invalid`, `unavailable`), falls back to the default HiRISE provider
   * while recording the rejection in `selectionReport`.
   */
  async resolveActiveProvider({ preferredId = this.defaultProviderId, ...options } = {}) {
    const primary = await this.loadProvider(preferredId, options);
    if (primary.provider.available || preferredId === this.defaultProviderId) {
      return {
        activeId: primary.id,
        provider: primary.provider,
        validation: primary.validation,
        fallbackUsed: false,
        rejectedCandidate: null,
        competitionDataStatus: 'Organizatör yarışma veri paketi henüz Sim/data içinde yok; doğrulanmış yerel HiRISE DTM fixture’ı aktif.',
      };
    }
    const fallback = await this.loadProvider(this.defaultProviderId, options);
    return {
      activeId: fallback.id,
      provider: fallback.provider,
      validation: fallback.validation,
      fallbackUsed: true,
      rejectedCandidate: {
        id: preferredId,
        status: primary.validation.status,
        reasonCode: primary.validation.reasonCode,
        summary: primary.validation.summary,
      },
      competitionDataStatus: `Aday katman (${preferredId}) reddedildi (${primary.validation.status}: ${primary.validation.reasonCode}); doğrulanmış HiRISE DTM sağlayıcısına geri dönüldü.`,
    };
  }
}

/** Creates the default registry with the verified local HiRISE Jezero DTM provider registered. */
export function createDefaultSurfaceRegistry({ expectedFrame, adapter, baseUrl = 'data', fetchImpl = fetch }) {
  const registry = new SurfaceProviderRegistry({
    expectedFrame,
    adapter,
    defaultProviderId: 'hirise-jezero-dtm',
  });

  registry.register({
    id: 'hirise-jezero-dtm',
    title: 'HiRISE DTM (Jezero)',
    isCompetitionData: false,
    load: async () => {
      let meta;
      try {
        const res = await fetchImpl(`${baseUrl}/dtm_subset.json`);
        if (!res.ok) {
          return {
            manifest: {
              ...buildHiriseManifestFromMeta({ label: expectedFrame }),
              access: { status: STATUS.UNAVAILABLE, reason: `DTM meta verisi bulunamadı (HTTP ${res.status}). Önce "npm run prepare-data" çalıştırın.` },
            },
          };
        }
        meta = await res.json();
      } catch (e) {
        return {
          manifest: {
            ...buildHiriseManifestFromMeta({ label: expectedFrame }),
            access: { status: STATUS.UNAVAILABLE, reason: `DTM meta verisi okunamadı: ${e.message}` },
          },
        };
      }
      const manifest = buildHiriseManifestFromMeta(meta);
      return {
        manifest,
        createLayer: async (validatedDescriptor) => {
          const layer = await loadDtmLayer({ baseUrl, adapter, expectedFrame, fetchImpl });
          if (layer.available) {
            layer.descriptor = {
              ...layer.descriptor,
              ...validatedDescriptor,
              access: { status: STATUS.OK, reason: null },
            };
          } else {
            layer.descriptor = {
              ...layer.descriptor,
              validation: validatedDescriptor.validation,
            };
          }
          return layer;
        },
      };
    },
  });

  return registry;
}
