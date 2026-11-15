// DTM morphology preferences for exploration planning. These are scenario objectives,
// not verified mountains/craters and never a claim that a route is safe.
// Pure module: no DOM, state, I/O, or provider sampling.

import { STATUS } from './cost-model.js';

export const TERRAIN_PREFERENCE_IDS = Object.freeze(['highland_explore', 'depression_explore']);
export const TERRAIN_PREFERENCE_DESCRIPTIONS = Object.freeze({
  highland_explore: Object.freeze({
    id: 'highland_explore',
    label: 'Yüksek kabartma keşfi',
    description: 'DTM üzerinde çevresinden yüksek kalan yerel kabartmaya yönelir; geçilemez hücreleri açmaz. Gerçek dağ tanısı veya güvenli rota değildir.',
  }),
  depression_explore: Object.freeze({
    id: 'depression_explore',
    label: 'Çukur/krater benzeri keşif',
    description: 'DTM üzerinde çevresinden alçak kalan yerel çukur örüntüsüne yönelir; çarpma krateri tanısı veya güvenli rota değildir.',
  }),
});

export function describeTerrainPreference(id) {
  return Object.prototype.hasOwnProperty.call(TERRAIN_PREFERENCE_DESCRIPTIONS, id)
    ? TERRAIN_PREFERENCE_DESCRIPTIONS[id] : null;
}

// Scenario choices, not NASA thresholds. A 24 m neighbourhood suppresses a broad
// regional elevation gradient; the residual represents local shape only.
const NEIGHBOURHOOD_RADIUS_M = 24;
const MIN_FEATURE_CONTRAST_M = 0.4;
const CONTRAST_REFERENCE_M = 1.5;
const ATTRACTION_WEIGHT = 4;
const MAX_CELLS = 2_000_000;

function unavailable(reason, status = 'feature_unavailable') {
  return { status, reason };
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validHeight(window, index) {
  if (window.coverageMask != null && window.coverageMask[index] !== 1 && window.coverageMask[index] !== true) return false;
  const value = window.elevation[index];
  if (!finiteNumber(value)) return false;
  if (window.noDataValue !== undefined &&
      (value === window.noDataValue || Math.fround(value) === Math.fround(window.noDataValue))) return false;
  if (window.validMin !== undefined && value < Math.fround(window.validMin)) return false;
  if (window.validMax !== undefined && value > Math.fround(window.validMax)) return false;
  return true;
}

function area(prefix, stride, top, left, bottom, right) {
  const a = top * stride + left;
  const b = top * stride + right;
  const c = bottom * stride + left;
  const d = bottom * stride + right;
  return prefix[d] - prefix[b] - prefix[c] + prefix[a];
}

/**
 * Returns a new planner field whose finite cost favours locally elevated or
 * locally depressed *walkable* cells. The original score/status/slope/roughness
 * arrays and every Infinity hard exclusion remain untouched.
 *
 * `depression_explore` is a DTM shape proxy. It does not identify a geological
 * impact crater; source imagery/feature mapping would be needed for that label.
 */
export function buildTerrainPreferenceField(window, baseField, preference) {
  if (!TERRAIN_PREFERENCE_IDS.includes(preference)) return unavailable('Bilinmeyen arazi keşfi tercihi.', 'invalid_input');
  const rows = window?.rows, cols = window?.cols, h = window?.cellSizeM;
  const cells = rows * cols;
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) || !Number.isSafeInteger(cells) ||
      rows < 3 || cols < 3 || cells > MAX_CELLS || !finiteNumber(h) || h <= 0 || h > 2 ||
      !(window.elevation instanceof Float32Array || window.elevation instanceof Float64Array) ||
      window.elevation.length !== cells ||
      baseField?.schema !== 'marswalk.cost-field.v1' || baseField.rows !== rows || baseField.cols !== cols ||
      baseField.cellSizeM !== h || baseField.cost?.length !== cells || baseField.status?.length !== cells) {
    return unavailable('Arazi keşfi için doğrulanmış, en çok 2 m/hücre çözünürlüklü sınırlı DTM ve eşleşen maliyet alanı gerekir.', 'invalid_input');
  }
  if (window.coverageMask != null && window.coverageMask.length !== cells) {
    return unavailable('DTM kapsam maskesi hücre sayısıyla uyuşmuyor.', 'invalid_input');
  }
  if ([window.noDataValue, window.validMin, window.validMax].some((v) => v !== undefined && !finiteNumber(v))) {
    return unavailable('DTM no-data veya geçerli aralık metadata değeri geçersiz.', 'invalid_input');
  }

  const radiusCells = Math.max(3, Math.ceil(NEIGHBOURHOOD_RADIUS_M / h));
  if (rows <= 2 * radiusCells + 2 || cols <= 2 * radiusCells + 2) {
    return unavailable('Seçilen DTM penceresi yerel kabartma/çukur örüntüsünü çözmek için çok küçük.');
  }
  const stride = cols + 1;
  const prefixLength = (rows + 1) * stride;
  const sums = new Float64Array(prefixLength);
  const counts = new Uint32Array(prefixLength);
  for (let row = 0; row < rows; row++) {
    let rowSum = 0, rowCount = 0;
    const above = row * stride, current = (row + 1) * stride;
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      if (validHeight(window, index)) {
        rowSum += window.elevation[index];
        rowCount++;
      }
      sums[current + col + 1] = sums[above + col + 1] + rowSum;
      counts[current + col + 1] = counts[above + col + 1] + rowCount;
    }
  }

  // First measure feature contrast so a flat or unresolved window fails closed.
  // A complete valid neighbourhood prevents a no-data hole from looking like a depression.
  const contrasts = new Float32Array(cells);
  const candidateMask = new Uint8Array(cells);
  let candidateCells = 0, peakContrastM = 0;
  for (let row = radiusCells; row < rows - radiusCells; row++) {
    const top = row - radiusCells, bottom = row + radiusCells + 1;
    for (let col = radiusCells; col < cols - radiusCells; col++) {
      const index = row * cols + col;
      if (baseField.status[index] !== STATUS.OK) continue;
      if (!finiteNumber(baseField.cost[index]) || baseField.cost[index] < 1 || !validHeight(window, index)) {
        return unavailable('Geçilebilir hücre ile DTM kot/maliyet durumu çelişiyor.', 'invalid_input');
      }
      const left = col - radiusCells, right = col + radiusCells + 1;
      const expected = (bottom - top) * (right - left);
      if (area(counts, stride, top, left, bottom, right) !== expected) continue;
      const mean = area(sums, stride, top, left, bottom, right) / expected;
      const signed = window.elevation[index] - mean;
      const contrast = preference === 'highland_explore' ? signed : -signed;
      if (contrast <= 0) continue;
      contrasts[index] = contrast;
      if (contrast >= MIN_FEATURE_CONTRAST_M) {
        candidateMask[index] = 1;
        candidateCells++;
      }
      if (contrast > peakContrastM) peakContrastM = contrast;
    }
  }
  if (candidateCells < 8 || peakContrastM < MIN_FEATURE_CONTRAST_M) {
    return unavailable(preference === 'highland_explore'
      ? 'Bu DTM penceresinde yeterli yerel yüksek kabartma adayı yok.'
      : 'Bu DTM penceresinde yeterli yerel çukur/krater benzeri aday yok.');
  }

  const cost = new Float32Array(cells);
  for (let i = 0; i < cells; i++) {
    const original = baseField.cost[i];
    if (baseField.status[i] !== STATUS.OK || original === Infinity) {
      cost[i] = Infinity;
      continue;
    }
    if (!finiteNumber(original) || original < 1) return unavailable('Temel maliyet alanı geçersiz.', 'invalid_input');
    const affinity = contrasts[i] / (contrasts[i] + CONTRAST_REFERENCE_M);
    cost[i] = original * (1 + ATTRACTION_WEIGHT * (1 - affinity));
  }

  const label = TERRAIN_PREFERENCE_DESCRIPTIONS[preference].label;
  const metadata = Object.freeze({
    preference, label, status: 'scenario',
    proxy: preference === 'highland_explore' ? 'kot − yerel 24 m komşuluk ortalaması' : 'yerel 24 m komşuluk ortalaması − kot',
    radiusM: radiusCells * h, minFeatureContrastM: MIN_FEATURE_CONTRAST_M,
    contrastReferenceM: CONTRAST_REFERENCE_M, attractionWeight: ATTRACTION_WEIGHT,
    candidateCells, peakContrastM, cellSizeM: h,
    note: 'DTM morfoloji tercihi; dağ veya çarpma krateri tanısı değildir. Geçilemez/no-data hücreler açılmaz. EVA yürünebilirlik puanı güvenlik sertifikası değildir.',
  });
  return {
    status: 'ready',
    field: { ...baseField, cost, provenance: { ...baseField.provenance, terrainPreference: metadata } },
    metadata,
    candidateMask,
  };
}

/** Approximate route exposure to the DTM proxy, sampling each planned segment in cell space. */
export function summarizeTerrainPreferenceRoute(segments, candidateMask, rows, cols) {
  if (!Array.isArray(segments) || !(candidateMask instanceof Uint8Array) ||
      !Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) || rows < 1 || cols < 1 ||
      candidateMask.length !== rows * cols) return null;
  let routeLengthM = 0, featureExposureM = 0;
  for (const segment of segments) {
    const a = segment?.from, b = segment?.to, lengthM = segment?.lengthM;
    if (!Number.isSafeInteger(a?.row) || !Number.isSafeInteger(a?.col) ||
        !Number.isSafeInteger(b?.row) || !Number.isSafeInteger(b?.col) ||
        a.row < 0 || a.row >= rows || b.row < 0 || b.row >= rows ||
        a.col < 0 || a.col >= cols || b.col < 0 || b.col >= cols ||
        !finiteNumber(lengthM) || lengthM < 0) return null;
    routeLengthM += lengthM;
    const steps = Math.max(1, Math.abs(b.row - a.row), Math.abs(b.col - a.col));
    for (let step = 0; step < steps; step++) {
      const t = (step + 0.5) / steps;
      const row = Math.round(a.row + (b.row - a.row) * t);
      const col = Math.round(a.col + (b.col - a.col) * t);
      if (candidateMask[row * cols + col] === 1) featureExposureM += lengthM / steps;
    }
  }
  return Object.freeze({
    routeLengthM,
    featureExposureM,
    featureExposureFraction: routeLengthM > 0 ? featureExposureM / routeLengthM : null,
    method: 'Planlanan segmentler hücre koordinatlarında yaklaşık örneklendi; DTM morfoloji adayıyla rota çakışmasıdır, gerçek dağ/krater doğrulaması değildir.',
  });
}
