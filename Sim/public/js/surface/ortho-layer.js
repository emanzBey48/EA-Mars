// Stage 39A / Stage 39B: Pure ortho layer representation and multi-zoom descriptor.
//
// Vanilla ES module. No DOM, no WebGL, no fetch/network dependencies.
// Provides fail-closed validation of alignment manifests, mathematical local-to-UV
// transformations, bounding box queries, and multi-zoom (z17/z14) tier selection.

export const ORTHO_MODES = Object.freeze(['hybrid', 'ortho', 'hillshade']);

/**
 * Validates an ortho alignment manifest against the schema specification.
 * Never mutates input. Fails closed on missing or non-finite values.
 *
 * @param {object} manifest Parsed ortho-alignment manifest JSON
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateOrthoAlignmentManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest is null or not an object'], warnings: [] };
  }

  if (manifest.schema !== 'marswalk.ortho-alignment.v1') {
    errors.push(`Invalid schema: expected 'marswalk.ortho-alignment.v1', got '${manifest.schema}'`);
  }

  // uvMapping validation
  const uv = manifest.uvMapping;
  if (!uv || typeof uv !== 'object') {
    errors.push('Missing uvMapping object');
  } else {
    for (const prop of ['uScale', 'uOffset', 'vScale', 'vOffset']) {
      if (typeof uv[prop] !== 'number' || !Number.isFinite(uv[prop])) {
        errors.push(`uvMapping.${prop} must be a finite number`);
      }
    }
    if (uv.vOrigin !== 'top-row') {
      errors.push(`uvMapping.vOrigin must be 'top-row', got '${uv.vOrigin}'`);
    }
  }

  // localBoundsM validation
  const win = manifest.window;
  const lb = win?.localBoundsM;
  if (!lb || typeof lb !== 'object') {
    errors.push('Missing window.localBoundsM object');
  } else {
    for (const prop of ['xMin', 'xMax', 'yMin', 'yMax']) {
      if (typeof lb[prop] !== 'number' || !Number.isFinite(lb[prop])) {
        errors.push(`window.localBoundsM.${prop} must be a finite number`);
      }
    }
    if (Number.isFinite(lb.xMin) && Number.isFinite(lb.xMax) && !(lb.xMin < lb.xMax)) {
      errors.push(`window.localBoundsM.xMin (${lb.xMin}) must be strictly less than xMax (${lb.xMax})`);
    }
    if (Number.isFinite(lb.yMin) && Number.isFinite(lb.yMax) && !(lb.yMin < lb.yMax)) {
      errors.push(`window.localBoundsM.yMin (${lb.yMin}) must be strictly less than yMax (${lb.yMax})`);
    }
  }

  // mosaic validation
  const mosaic = manifest.mosaic;
  if (!mosaic || typeof mosaic !== 'object') {
    errors.push('Missing mosaic object');
  } else {
    if (!Number.isInteger(mosaic.widthPx) || mosaic.widthPx <= 0) {
      errors.push('mosaic.widthPx must be a positive integer');
    }
    if (!Number.isInteger(mosaic.heightPx) || mosaic.heightPx <= 0) {
      errors.push('mosaic.heightPx must be a positive integer');
    }
  }

  // groundSampleDistance validation
  const gsd = manifest.groundSampleDistance;
  if (!gsd || typeof gsd !== 'object') {
    errors.push('Missing groundSampleDistance object');
  } else {
    if (typeof gsd.northSouthM !== 'number' || !Number.isFinite(gsd.northSouthM) || gsd.northSouthM <= 0) {
      errors.push('groundSampleDistance.northSouthM must be a positive finite number');
    }
  }

  // attribution validation
  const attr = manifest.attribution;
  if (!attr || typeof attr !== 'object' || typeof attr.licenseStatus !== 'string' || !attr.licenseStatus.trim()) {
    errors.push('attribution.licenseStatus must be a non-empty string');
  }

  // Informational warnings
  if (manifest.registration?.alignmentVsDtmVisuallyVerified === false) {
    warnings.push('alignmentVsDtmVisuallyVerified is false (alignment derived from WMTS arithmetic only)');
  }
  if (Array.isArray(manifest.missingTiles) && manifest.missingTiles.length > 0) {
    warnings.push(`Manifest reports ${manifest.missingTiles.length} missing tiles`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Creates an immutable ortho layer instance from a validated alignment manifest.
 * Fails closed if the manifest is invalid (returns available: false).
 *
 * @param {object} alignmentManifest Parsed alignment manifest JSON
 * @param {object} [options={}] Optional configuration overrides
 * @returns {Readonly<object>} Frozen ortho layer object
 */
export function createOrthoLayer(alignmentManifest, options = {}) {
  const validation = validateOrthoAlignmentManifest(alignmentManifest);
  if (!validation.valid) {
    return Object.freeze({
      available: false,
      reason: validation.errors.join('; '),
      errors: Object.freeze([...validation.errors]),
      warnings: Object.freeze([...validation.warnings]),
    });
  }

  const { window: win, uvMapping: uv, mosaic, groundSampleDistance: gsd, product, attribution, registration } = alignmentManifest;
  const { xMin, xMax, yMin, yMax } = win.localBoundsM;
  const { uScale, uOffset, vScale, vOffset } = uv;

  const localBoundsM = Object.freeze({ xMin, xMax, yMin, yMax });
  const renderBoundsM = Object.freeze({
    nwXM: xMin,
    nwYM: yMax,
    widthM: xMax - xMin,
    heightM: yMax - yMin,
  });
  const frozenUvMapping = Object.freeze({
    uScale,
    uOffset,
    vScale,
    vOffset,
    vOrigin: 'top-row',
  });
  const uvTransformVec4 = new Float32Array([uScale, uOffset, vScale, vOffset]);

  const containsLocal = (xM, yM) =>
    Number.isFinite(xM) &&
    Number.isFinite(yM) &&
    xM >= xMin &&
    xM <= xMax &&
    yM >= yMin &&
    yM <= yMax;

  const localToUv = (xM, yM) => {
    if (!Number.isFinite(xM) || !Number.isFinite(yM)) {
      return { u: NaN, v: NaN, inBounds: false };
    }
    const u = xM * uScale + uOffset;
    const v = yM * vScale + vOffset;
    const inBounds =
      Number.isFinite(u) &&
      Number.isFinite(v) &&
      u >= 0 &&
      u <= 1 &&
      v >= 0 &&
      v <= 1;
    return { u, v, inBounds };
  };

  const stage39ANote =
    options.stage39ANote ??
    'WMTS aritmetik projeksiyon kaydı (JEZ_hirise_soc_006 TRN baz haritası; ±1.5 m yerel belirsizlik, yarım-piksel kaya kontrolü doğrulanmamış)';

  return Object.freeze({
    available: true,
    zoom: product.zoom,
    layerId: product.layerId,
    windowName: win.name,
    gsdM: gsd.northSouthM,
    eastWestGroundM: gsd.eastWestGroundM,
    localBoundsM,
    renderBoundsM,
    uvMapping: frozenUvMapping,
    uvTransformVec4,
    mosaicMeta: Object.freeze({ ...mosaic }),
    attribution: Object.freeze({ ...attribution }),
    registration: Object.freeze({ ...registration, stage39ANote }),
    containsLocal,
    localToUv,
  });
}

/**
 * Creates a composite multi-zoom ortho descriptor combining high-resolution (fine, e.g. z17)
 * and regional (coarse, e.g. z14) ortho layers.
 *
 * @param {object} [config={}] Configuration
 * @param {object|null} [config.fineLayer=null] Fine ortho layer (z17)
 * @param {object|null} [config.coarseLayer=null] Coarse ortho layer (z14)
 * @param {string} [config.mode='hybrid'] Rendering mode ('hybrid'|'ortho'|'hillshade')
 * @returns {Readonly<object>} Frozen multi-zoom descriptor
 */
export function createMultiZoomOrthoDescriptor({ fineLayer = null, coarseLayer = null, mode = 'hybrid' } = {}) {
  const validFine = fineLayer && fineLayer.available ? fineLayer : null;
  const validCoarse = coarseLayer && coarseLayer.available ? coarseLayer : null;
  const available = Boolean(validFine || validCoarse);
  const resolvedMode = ORTHO_MODES.includes(mode) ? mode : 'hybrid';

  const selectTierAt = (xM, yM) => {
    if (resolvedMode === 'hillshade') return 'hillshade';
    if (validFine && validFine.containsLocal(xM, yM)) return 'fine';
    if (validCoarse && validCoarse.containsLocal(xM, yM)) return 'coarse';
    return 'hillshade';
  };

  const sampleUvAt = (xM, yM) => {
    const tier = selectTierAt(xM, yM);
    if (tier === 'fine') {
      const uv = validFine.localToUv(xM, yM);
      return { tier: 'fine', layer: validFine, u: uv.u, v: uv.v, gsdM: validFine.gsdM };
    }
    if (tier === 'coarse') {
      const uv = validCoarse.localToUv(xM, yM);
      return { tier: 'coarse', layer: validCoarse, u: uv.u, v: uv.v, gsdM: validCoarse.gsdM };
    }
    return { tier: 'hillshade', layer: null, u: NaN, v: NaN, gsdM: 1.0 };
  };

  return Object.freeze({
    available,
    mode: resolvedMode,
    fine: validFine,
    coarse: validCoarse,
    licenseStatus:
      validFine?.attribution?.licenseStatus ??
      validCoarse?.attribution?.licenseStatus ??
      'NOT_STATED_IN_PROVIDED_FGDC',
    productLabel: 'USGS/NASA MRO HiRISE Controlled Orthomosaic (JEZ_hirise_soc_006 WMTS)',
    registrationSummaryTr:
      'WMTS projeksiyon aritmetiği (JEZ_hirise_soc_006 TRN; ±1.5 m belirsizlik, yarım-piksel görsel kaya kontrolü doğrulanmamış)',
    selectTierAt,
    sampleUvAt,
  });
}
