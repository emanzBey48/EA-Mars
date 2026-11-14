import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORTHO_MODES,
  validateOrthoAlignmentManifest,
  createOrthoLayer,
  createMultiZoomOrthoDescriptor,
} from '../public/js/surface/ortho-layer.js';

import {
  boxBlur2D,
  highPassField,
  directionalDerivativeAlongSun,
  diagnoseWaypointDiscrepancy,
} from '../scripts/validate-ortho-registration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORTHO_DIR = path.join(here, '..', 'data', 'ortho');
const DATA_DIR = path.join(here, '..', 'data');

const z17ManifestPath = path.join(ORTHO_DIR, 'ortho-alignment-z17-tiles.json');
const z14ManifestPath = path.join(ORTHO_DIR, 'ortho-alignment-z14-tiles.json');

const z17Manifest = JSON.parse(fs.readFileSync(z17ManifestPath, 'utf8'));
const z14Manifest = JSON.parse(fs.readFileSync(z14ManifestPath, 'utf8'));

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b} (eps: ${eps})`);

// ---------------------------------------------------------------- validateOrthoAlignmentManifest
test('ortho-layer: validateOrthoAlignmentManifest accepts real z17 and z14 manifests', () => {
  const v17 = validateOrthoAlignmentManifest(z17Manifest);
  assert.equal(v17.valid, true);
  assert.equal(v17.errors.length, 0);

  const v14 = validateOrthoAlignmentManifest(z14Manifest);
  assert.equal(v14.valid, true);
  assert.equal(v14.errors.length, 0);
});

test('ortho-layer: validateOrthoAlignmentManifest fails closed on invalid or corrupt manifests', () => {
  assert.equal(validateOrthoAlignmentManifest(null).valid, false);
  assert.equal(validateOrthoAlignmentManifest({}).valid, false);
  assert.equal(validateOrthoAlignmentManifest({ schema: 'wrong.schema' }).valid, false);

  // Corrupted uvMapping
  const badUv = JSON.parse(JSON.stringify(z17Manifest));
  badUv.uvMapping.uScale = NaN;
  assert.equal(validateOrthoAlignmentManifest(badUv).valid, false);

  badUv.uvMapping.uScale = 1.0;
  badUv.uvMapping.vOrigin = 'bottom-row';
  assert.equal(validateOrthoAlignmentManifest(badUv).valid, false);

  // Inverted localBounds
  const badBounds = JSON.parse(JSON.stringify(z17Manifest));
  badBounds.window.localBoundsM.xMin = 1000;
  badBounds.window.localBoundsM.xMax = 500;
  assert.equal(validateOrthoAlignmentManifest(badBounds).valid, false);

  // Missing or non-positive mosaic size
  const badMosaic = JSON.parse(JSON.stringify(z17Manifest));
  badMosaic.mosaic.widthPx = 0;
  assert.equal(validateOrthoAlignmentManifest(badMosaic).valid, false);

  // Missing attribution license
  const badAttr = JSON.parse(JSON.stringify(z17Manifest));
  delete badAttr.attribution.licenseStatus;
  assert.equal(validateOrthoAlignmentManifest(badAttr).valid, false);
});

// ---------------------------------------------------------------- createOrthoLayer
test('ortho-layer: createOrthoLayer builds valid, immutable layer from z17 manifest', () => {
  const layer17 = createOrthoLayer(z17Manifest);
  assert.equal(layer17.available, true);
  assert.equal(layer17.zoom, 17);
  assert.equal(layer17.layerId, 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd');
  assert.equal(layer17.windowName, 'tiles');
  near(layer17.gsdM, 0.31797, 1e-4);
  assert.ok(layer17.eastWestGroundM > 0);

  // Bounds
  const lb = layer17.localBoundsM;
  assert.ok(lb.xMin < lb.xMax);
  assert.ok(lb.yMin < lb.yMax);
  assert.equal(layer17.renderBoundsM.nwXM, lb.xMin);
  assert.equal(layer17.renderBoundsM.nwYM, lb.yMax);
  near(layer17.renderBoundsM.widthM, lb.xMax - lb.xMin);
  near(layer17.renderBoundsM.heightM, lb.yMax - lb.yMin);

  // WebGL uniform vec4
  assert.ok(layer17.uvTransformVec4 instanceof Float32Array);
  assert.equal(layer17.uvTransformVec4.length, 4);
  near(layer17.uvTransformVec4[0], layer17.uvMapping.uScale);
  near(layer17.uvTransformVec4[1], layer17.uvMapping.uOffset);
  near(layer17.uvTransformVec4[2], layer17.uvMapping.vScale);
  near(layer17.uvTransformVec4[3], layer17.uvMapping.vOffset);

  // Immutability
  assert.ok(Object.isFrozen(layer17));
  assert.ok(Object.isFrozen(layer17.localBoundsM));
  assert.ok(Object.isFrozen(layer17.renderBoundsM));
  assert.ok(Object.isFrozen(layer17.uvMapping));
  assert.ok(Object.isFrozen(layer17.mosaicMeta));
  assert.ok(Object.isFrozen(layer17.attribution));
  assert.ok(Object.isFrozen(layer17.registration));
});

test('ortho-layer: createOrthoLayer fails closed on invalid input (available: false)', () => {
  const badLayer = createOrthoLayer({ invalid: true });
  assert.equal(badLayer.available, false);
  assert.ok(typeof badLayer.reason === 'string');
  assert.ok(badLayer.errors.length > 0);
  assert.ok(Object.isFrozen(badLayer));
});

test('ortho-layer: localToUv and containsLocal exact corner and containment checks', () => {
  const layer17 = createOrthoLayer(z17Manifest);
  const { xMin, xMax, yMin, yMax } = layer17.localBoundsM;

  // Corners
  const nw = layer17.localToUv(xMin, yMax);
  near(nw.u, 0, 1e-6);
  near(nw.v, 0, 1e-6);
  assert.equal(nw.inBounds, true);

  const se = layer17.localToUv(xMax, yMin);
  near(se.u, 1, 1e-6);
  near(se.v, 1, 1e-6);
  assert.equal(se.inBounds, true);

  const ne = layer17.localToUv(xMax, yMax);
  near(ne.u, 1, 1e-6);
  near(ne.v, 0, 1e-6);
  assert.equal(ne.inBounds, true);

  const sw = layer17.localToUv(xMin, yMin);
  near(sw.u, 0, 1e-6);
  near(sw.v, 1, 1e-6);
  assert.equal(sw.inBounds, true);

  // Centre
  const centre = layer17.localToUv((xMin + xMax) / 2, (yMin + yMax) / 2);
  near(centre.u, 0.5, 1e-6);
  near(centre.v, 0.5, 1e-6);
  assert.equal(centre.inBounds, true);

  // Out of bounds: never clamps to [0, 1]!
  const outEast = layer17.localToUv(xMax + 100, yMin);
  assert.ok(outEast.u > 1.0);
  assert.equal(outEast.inBounds, false);

  const outNorth = layer17.localToUv(xMin, yMax + 100);
  assert.ok(outNorth.v < 0.0);
  assert.equal(outNorth.inBounds, false);

  // containsLocal
  assert.equal(layer17.containsLocal(xMin + 1, yMin + 1), true);
  assert.equal(layer17.containsLocal(xMax + 10, yMin), false);
  assert.equal(layer17.containsLocal(NaN, yMin), false);
  assert.equal(layer17.containsLocal(xMin, Infinity), false);
});

// ---------------------------------------------------------------- createMultiZoomOrthoDescriptor
test('ortho-layer: createMultiZoomOrthoDescriptor hierarchical tier selection (z17 fine, z14 coarse, hillshade fallback)', () => {
  const fineLayer = createOrthoLayer(z17Manifest);
  const coarseLayer = createOrthoLayer(z14Manifest);

  const multi = createMultiZoomOrthoDescriptor({ fineLayer, coarseLayer, mode: 'hybrid' });
  assert.equal(multi.available, true);
  assert.equal(multi.mode, 'hybrid');
  assert.equal(multi.fine, fineLayer);
  assert.equal(multi.coarse, coarseLayer);
  assert.equal(multi.licenseStatus, 'NOT_STATED_IN_PROVIDED_FGDC');
  assert.match(multi.productLabel, /USGS\/NASA MRO HiRISE/);
  assert.match(multi.registrationSummaryTr, /WMTS/);

  // Point inside fine (Sol 120 region: (0, 0) is Sol 120 origin in sim local frame)
  assert.equal(multi.selectTierAt(0, 0), 'fine');
  const sFine = multi.sampleUvAt(0, 0);
  assert.equal(sFine.tier, 'fine');
  assert.equal(sFine.layer, fineLayer);
  assert.ok(sFine.u >= 0 && sFine.u <= 1);
  assert.ok(sFine.v >= 0 && sFine.v <= 1);
  near(sFine.gsdM, fineLayer.gsdM);

  // Sol 164 is outside z17 fine coverage, but inside z14 coarse coverage!
  // Sol 164 local coordinates:
  const sol164Y = -674; // approx 674 m south of Sol 120
  const sol164X = 133;  // approx 133 m east of Sol 120
  assert.equal(fineLayer.containsLocal(sol164X, sol164Y), false);
  assert.equal(coarseLayer.containsLocal(sol164X, sol164Y), true);
  assert.equal(multi.selectTierAt(sol164X, sol164Y), 'coarse');
  const sCoarse = multi.sampleUvAt(sol164X, sol164Y);
  assert.equal(sCoarse.tier, 'coarse');
  assert.equal(sCoarse.layer, coarseLayer);
  assert.ok(sCoarse.u >= 0 && sCoarse.u <= 1);
  assert.ok(sCoarse.v >= 0 && sCoarse.v <= 1);
  near(sCoarse.gsdM, coarseLayer.gsdM);

  // Far away point outside both: falls back to hillshade
  assert.equal(multi.selectTierAt(50000, 50000), 'hillshade');
  const sFallback = multi.sampleUvAt(50000, 50000);
  assert.equal(sFallback.tier, 'hillshade');
  assert.equal(sFallback.layer, null);
  assert.ok(Number.isNaN(sFallback.u));

  // Explicit 'hillshade' mode forces hillshade everywhere
  const hsOnly = createMultiZoomOrthoDescriptor({ fineLayer, coarseLayer, mode: 'hillshade' });
  assert.equal(hsOnly.selectTierAt(0, 0), 'hillshade');
});

// ---------------------------------------------------------------- Stage 39A Diagnosis Helpers
test('Stage 39A: boxBlur2D and highPassField isolate high frequencies on synthetic data', () => {
  const rows = 20, cols = 20;
  const arr = new Float32Array(rows * cols);
  const valid = new Uint8Array(rows * cols).fill(1);

  // Linear trend (low frequency) + high frequency checkerboard
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lowFreq = r * 2.0 + c * 1.5;
      const highFreq = ((r + c) % 2 === 0 ? 5.0 : -5.0);
      arr[r * cols + c] = lowFreq + highFreq;
    }
  }

  const { blur, valid: bValid } = boxBlur2D(arr, valid, rows, cols, 3);
  assert.equal(bValid[10 * cols + 10], 1);
  // Blur should have averaged out the checkerboard and kept roughly the low frequency trend
  near(blur[10 * cols + 10], 10 * 2.0 + 10 * 1.5, 0.5);

  const { highPass, valid: hpValid } = highPassField(arr, valid, rows, cols, 3);
  assert.equal(hpValid[10 * cols + 10], 1);
  // High pass should isolate the high frequency oscillation (near +5 or -5)
  assert.ok(Math.abs(Math.abs(highPass[10 * cols + 10]) - 5.0) < 0.5);
});

test('Stage 39A: directionalDerivativeAlongSun matches analytical derivative', () => {
  const rows = 15, cols = 15;
  const arr = new Float32Array(rows * cols);
  const valid = new Uint8Array(rows * cols).fill(1);

  // I = 3*x - 2*y (in grid: x = c, y = -r) -> dI/dx = 3, dI/dy = -2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      arr[r * cols + c] = 3 * c + 2 * r; // Note: row r increases South (-Y), so +2*r means -2*Y
    }
  }

  // Sun at East (az = 90 deg): L = (1, 0) -> deriv should be dI/dx = 3
  const dEast = directionalDerivativeAlongSun(arr, valid, rows, cols, 90);
  near(dEast.deriv[7 * cols + 7], 3.0, 1e-5);

  // Sun at North (az = 0 deg): L = (0, 1) -> deriv should be dI/dy = -2 (since r decreases North)
  // In our code: dIdy = (arr[r-1] - arr[r+1])/2 = (2*(r-1) - 2*(r+1))/2 = -2.
  const dNorth = directionalDerivativeAlongSun(arr, valid, rows, cols, 0);
  near(dNorth.deriv[7 * cols + 7], -2.0, 1e-5);
});

test('Stage 39A: diagnoseWaypointDiscrepancy proves catalogue difference (isRasterShift: false)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'mars-trek', 'manifest.json'), 'utf8'));
  const m20 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'mars-trek', 'M20_waypoints.json'), 'utf8'));
  const cfgWaypoints = [
    { id: 'sol120-wb1', label: 'Sol 120 / WB1', sol: 120, latDeg: 18.43906919, lonDeg: 77.44940206 },
    { id: 'sol164-roubion', label: 'Sol 164 / Roubion', sol: 164, latDeg: 18.42769340, lonDeg: 77.45165066 },
  ];

  const diag = diagnoseWaypointDiscrepancy({
    configWaypoints: cfgWaypoints,
    manifestWaypoints: manifest,
    m20WaypointsGeoJson: m20,
  });

  assert.equal(diag.isRasterShift, false);
  near(diag.sol120.discrepancyM, 26.04, 0.05);
  near(diag.sol164.discrepancyM, 305.14, 0.1);

  // config Sol 120 is Sol 116 / Site 4 / Drive 1250 (0.0 m distance)
  assert.equal(diag.sol120.closestFeatureToConfig.sol, 116);
  assert.equal(diag.sol120.closestFeatureToConfig.drive, 1250);
  near(diag.sol120.closestFeatureToConfig.distanceM, 0.0, 1e-3);

  // config Sol 164 is Site 6 / Drive 0 (Roubion site, < 0.1 m distance)
  assert.equal(diag.sol164.closestFeatureToConfig.site, 6);
  assert.equal(diag.sol164.closestFeatureToConfig.drive, 0);
  assert.ok(diag.sol164.closestFeatureToConfig.distanceM < 0.1);
});
