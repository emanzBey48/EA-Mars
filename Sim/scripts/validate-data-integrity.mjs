#!/usr/bin/env node
// Stage 38A - data integrity and vertical datum audit (read-only; never writes data files).
// Usage: node scripts/validate-data-integrity.mjs [--root <Sim dir>] [--json <out.json>]
//
// Checks:
//   (a) config.js MAP_FRAME vs data/dtm_subset.json label, field by field (datum, datum flag, evidence,
//       CRS/radius/no-data/frame offsets, product id, lines/samples, window value range).
//   (b) data/*/manifest.json hash/size entries vs disk. Text files: raw bytes first, then CRLF->LF
//       normalised bytes (both hashes are reported). Binary files: raw bytes only. Entries without a
//       file path (e.g. the 12.7 GB Viking source TIFF that is not in the repo) are listed as unverifiable.
//   (c) Git LFS pointer detection for every file under data/ (a ~132 byte "version https://git-lfs" text).
//   (d) Self-declared integrity fields: Viking pyramid per-level tile count/bytes, grid byte counts
//       (dtm_subset window, mola-jezero, nodata-fixture).
//   (e) Files on disk not covered by any manifest hash entry are listed (informational).
//
// Exit code: 0 = no error findings; 1 = at least one error finding; 2 = usage error.
// Info findings (CRLF-only matches, uncovered files, unverifiable entries) never change the exit code.
// Pure check functions are exported and unit-tested in test/data-integrity.test.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAP_FRAME } from '../public/js/config.js';
import { isLfsPointer, normalizeLf, sha256Hex, isTextFileName, inspectFile } from './preflight.mjs';

export const TOLERANCE = 1e-6;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const PATH_KEYS = ['path', 'file', 'localFile'];
const SIZE_KEYS = ['size_bytes', 'sizeBytes', 'bytes', 'byteLength'];

// Frame fields compared between config MAP_FRAME (left) and the DTM label (right, label key).
// 'num' = numeric within TOLERANCE, 'hex' = case-insensitive string, 'eq' = strict equality (null included).
export const FRAME_FIELDS = [
  ['productId', 'productId', 'eq'],
  ['radiusKm', 'radiusKm', 'num'],
  ['centerLatDeg', 'centerLatDeg', 'num'],
  ['centerLonDeg', 'centerLonDeg', 'num'],
  ['mapScaleM', 'mapScaleM', 'num'],
  ['lineProjectionOffset', 'lineProjectionOffset', 'num'],
  ['sampleProjectionOffset', 'sampleProjectionOffset', 'num'],
  ['upperLeftX', 'upperLeftX', 'num'],
  ['upperLeftY', 'upperLeftY', 'num'],
  ['lines', 'lines', 'num'],
  ['samples', 'samples', 'num'],
  ['rasterType', 'rasterType', 'eq'],
  ['pixelRegistration', 'pixelRegistration', 'eq'],
  ['noDataHex', 'missingConstantHex', 'hex'],
  ['verticalDatum', 'verticalDatum', 'eq'],
  ['verticalDatumVerified', 'verticalDatumVerified', 'eq'],
  ['verticalDatumEvidence', 'verticalDatumEvidence', 'eq'],
];
const GEOMETRY_FIELDS = ['radiusKm', 'centerLatDeg', 'centerLonDeg', 'mapScaleM', 'lineProjectionOffset', 'sampleProjectionOffset', 'lines', 'samples'];

function finding(severity, check, subject, message) {
  return { severity, check, subject, message };
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

function sameValue(a, b, kind) {
  if (kind === 'num') return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= TOLERANCE;
  if (kind === 'hex') return typeof a === 'string' && typeof b === 'string' && a.toUpperCase() === b.toUpperCase();
  return a === b;
}

/**
 * Field-by-field comparison of config MAP_FRAME against the DTM label (dtm_subset.json `label`).
 * @returns {{rows:Array<{field:string, config:any, label:any, status:string, note:string}>, mismatches:number}}
 */
export function compareLabelToConfig(config, label, claimedFrameMatch = null) {
  const rows = [];
  const push = (field, cfgVal, lblVal, status, note = '') => rows.push({ field, config: cfgVal, label: lblVal, status, note });
  const geometryMatch = [];

  for (const [field, labelKey, kind] of FRAME_FIELDS) {
    const c = config[field];
    const l = label[labelKey];
    let status;
    if (l === undefined) status = 'eksik';
    else status = sameValue(c, l, kind) ? 'eşleşiyor' : 'tutarsız';
    if (GEOMETRY_FIELDS.includes(field)) geometryMatch.push(status === 'eşleşiyor');
    const note = field === 'verticalDatumVerified' && status !== 'eşleşiyor'
      ? 'Config bayrağı kanıt olmadan true; etiket false. Kanıt yoksa false/needs_review (38B).'
      : '';
    push(field, c ?? null, l ?? null, status, note);
  }

  const obsMin = label.observedMin;
  const obsMax = label.observedMax;
  const inside = [obsMin, obsMax].every(Number.isFinite) && obsMin >= config.validMin && obsMax <= config.validMax;
  push('validMin..validMax (pencere gözlemi)', `${config.validMin} .. ${config.validMax}`, `${obsMin} .. ${obsMax}`,
    inside ? 'kapsam içinde' : 'tutarsız',
    'Etiket aralığı yüklenen pencerenin gözlemidir (rangeSemantics); ürün aralığı değildir. Yalnız pencerenin config aralığında olup olmadığı denetlenir.');

  const computed = geometryMatch.every(Boolean);
  if (claimedFrameMatch !== null && claimedFrameMatch !== undefined) {
    const claimed = claimedFrameMatch === true;
    push('frameMatchesConfig (etiket beyanı)', computed ? 'hesaplandı: eşleşiyor' : 'hesaplandı: uyumsuz', String(claimedFrameMatch),
      computed === claimed ? 'eşleşiyor' : 'tutarsız', 'Geometri alanlarından bağımsız yeniden hesaplandı.');
  }

  const mismatches = rows.filter((r) => r.status === 'tutarsız' || r.status === 'eksik').length;
  return { rows, mismatches };
}

/** Recursively collect every object that carries a `sha256` field, with its path and size if present. */
export function extractHashEntries(manifest) {
  const out = [];
  const visit = (node, where) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${where}[${i}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.sha256 === 'string') {
      const relPath = PATH_KEYS.map((k) => node[k]).find((v) => typeof v === 'string' && v.length > 0) ?? null;
      const sizeKey = SIZE_KEYS.find((k) => Number.isFinite(node[k]));
      out.push({
        where,
        path: relPath,
        sha256: node.sha256.toLowerCase(),
        sha256Valid: SHA256_RE.test(node.sha256),
        size: sizeKey ? node[sizeKey] : null,
        sizeKey: sizeKey ?? null,
      });
    }
    for (const [k, v] of Object.entries(node)) visit(v, where ? `${where}.${k}` : k);
  };
  visit(manifest, '');
  return out;
}

/** Relative manifest paths are tried against the manifest folder first, then against the Sim root. */
export function resolveEntryPath(relPath, manifestDir, simRoot) {
  const candidates = [path.resolve(manifestDir, relPath), path.resolve(simRoot, relPath)];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

/**
 * Verify one buffer against a manifest SHA-256 (and optional size).
 * Text: raw hash, then CRLF->LF normalised hash. Both are always reported for text files.
 * @returns {{matchedBy:'raw'|'lf-normalized'|null, rawSha256:string, rawBytes:number,
 *            normalizedSha256:string|null, normalizedBytes:number|null, sizeOk:boolean|null}}
 */
export function verifyEntry(buffer, { sha256, size = null, text = false }) {
  const expected = String(sha256 ?? '').toLowerCase();
  const rawSha256 = sha256Hex(buffer);
  let normalizedSha256 = null;
  let normalizedBytes = null;
  let normalized = null;
  if (text) {
    normalized = normalizeLf(buffer);
    normalizedSha256 = sha256Hex(normalized);
    normalizedBytes = normalized.length;
  }
  let matchedBy = null;
  let matchedBytes = null;
  if (rawSha256 === expected) {
    matchedBy = 'raw';
    matchedBytes = buffer.length;
  } else if (text && normalizedSha256 === expected) {
    matchedBy = 'lf-normalized';
    matchedBytes = normalizedBytes;
  }
  const sizeOk = matchedBy === null || size == null ? null : size === matchedBytes;
  return { matchedBy, rawSha256, rawBytes: buffer.length, normalizedSha256, normalizedBytes, sizeOk };
}

/** Grid byte count: rows * cols * bytesPerSample must equal the file size. */
export function checkGridBytes({ subject, bytes, rows, cols, bytesPerSample = 4 }) {
  const expected = rows * cols * bytesPerSample;
  if (bytes === expected) return null;
  return finding('error', 'grid-size', subject, `beklenen ${expected} bayt (${rows}x${cols}x${bytesPerSample}), diskte ${bytes} bayt`);
}

/** Output path must not be one of the input files read by this run. */
export function assertOutputNotInput(outPath, inputPaths) {
  const norm = (p) => {
    const r = path.resolve(p);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  const target = norm(outPath);
  if (inputPaths.some((p) => norm(p) === target)) {
    throw new Error(`--json cikti dosyasi girdi dosyasiyla ayni olamaz: ${outPath}`);
  }
}

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

/** PNG pyramid: per level with written=true, the tile count and summed bytes must match the manifest. */
export function checkPyramid(viking, manifestDir) {
  const findings = [];
  const rows = [];
  for (const level of viking.levels ?? []) {
    if (level.written !== true) continue;
    const levelDir = path.join(manifestDir, 'tiles', String(level.z));
    const tiles = walkFiles(levelDir).filter((f) => f.toLowerCase().endsWith('.png'));
    let bytes = 0;
    let badSignature = 0;
    for (const t of tiles) {
      const info = inspectFile(t, { png: true });
      if (info.status !== 'ok') badSignature += 1;
      bytes += info.bytes;
    }
    const countOk = tiles.length === level.tiles;
    const bytesOk = bytes === level.pngBytesTotal;
    rows.push({ z: level.z, expectedTiles: level.tiles, diskTiles: tiles.length, expectedBytes: level.pngBytesTotal, diskBytes: bytes, badSignature, ok: countOk && bytesOk && badSignature === 0 });
    if (!countOk) findings.push(finding('error', 'pyramid', `viking tiles/${level.z}`, `manifest ${level.tiles} karo, diskte ${tiles.length}`));
    if (!bytesOk) findings.push(finding('error', 'pyramid', `viking tiles/${level.z}`, `manifest ${level.pngBytesTotal} bayt, diskte ${bytes}`));
    if (badSignature > 0) findings.push(finding('error', 'pyramid', `viking tiles/${level.z}`, `${badSignature} karo PNG imzasi tasimiyor`));
  }
  return { findings, rows };
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

function readJson(absPath, findings, subject) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    findings.push(finding('error', 'parse', subject, `JSON okunamadi: ${err.message}`));
    return null;
  }
}

/**
 * Run every check against a Sim root. Read-only.
 * @returns {object} report (also used for --json output)
 */
export function runIntegrity({ root, config = MAP_FRAME, requireDtmLabel = true } = {}) {
  const simRoot = path.resolve(root);
  const dataDir = path.join(simRoot, 'data');
  const findings = [];
  const inputFiles = [path.join(simRoot, 'public', 'js', 'config.js')];
  const rel = (abs) => toPosix(path.relative(simRoot, abs));

  // (a) config vs DTM label. The label is required for the demo; its absence is an error.
  const dtmJsonPath = path.join(dataDir, 'dtm_subset.json');
  let dtmMeta = null;
  if (fs.existsSync(dtmJsonPath)) {
    dtmMeta = readJson(dtmJsonPath, findings, 'data/dtm_subset.json');
  } else if (requireDtmLabel) {
    findings.push(finding('error', 'missing-file', 'data/dtm_subset.json', 'DTM etiketi yok; config karsilastirmasi yapilamadi'));
  }
  let configCompare = null;
  if (dtmMeta) {
    inputFiles.push(dtmJsonPath);
    configCompare = compareLabelToConfig(config, dtmMeta.label ?? {}, dtmMeta.frameMatchesConfig ?? null);
    for (const r of configCompare.rows) {
      if (r.status === 'tutarsız' || r.status === 'eksik') {
        findings.push(finding('error', 'config-label', r.field, `config=${JSON.stringify(r.config)} etiket=${JSON.stringify(r.label)} (${r.status})`));
      }
    }
    const dtmF32 = path.join(dataDir, dtmMeta.dataFile ?? 'dtm_subset.f32');
    if (dtmMeta.window && fs.existsSync(dtmF32)) {
      const bytes = fs.statSync(dtmF32).size;
      const g = checkGridBytes({ subject: 'data/dtm_subset.f32', bytes, rows: dtmMeta.window.rows, cols: dtmMeta.window.cols });
      if (g) findings.push(g);
    }
  }

  // (b) + (c) manifests and LFS
  const manifestReports = [];
  const hashRows = [];
  const coveredFiles = new Set();
  const dirEntries = fs.existsSync(dataDir) ? fs.readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  const noPathEntries = [];
  for (const dir of dirEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    const manifestPath = path.join(dataDir, dir.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    inputFiles.push(manifestPath);
    const manifestDir = path.join(dataDir, dir.name);
    const manifest = readJson(manifestPath, findings, rel(manifestPath));
    if (!manifest) continue;
    const entries = extractHashEntries(manifest);
    manifestReports.push({ manifest: rel(manifestPath), entries: entries.length });
    for (const e of entries) {
      const subject = `${rel(manifestDir)}/${e.path ?? e.where}`;
      if (!e.path) {
        noPathEntries.push({ manifest: rel(manifestPath), where: e.where });
        continue;
      }
      if (!e.sha256Valid) {
        findings.push(finding('error', 'hash-format', subject, 'manifest sha256 alani 64 hex karakter degil'));
        continue;
      }
      const abs = resolveEntryPath(e.path, manifestDir, simRoot);
      if (!abs) {
        // "source" records describe upstream originals that are deliberately not shipped (e.g. the 12.7 GB Viking TIFF).
        const isSource = String(e.where).split(/[.[]/)[0] === 'source';
        if (isSource) {
          findings.push(finding('info', 'source-not-in-repo', subject, 'kaynak dosya repoda yok; hash dogrulanamadi'));
          hashRows.push({ manifest: rel(manifestPath), file: subject, expectedSha256: e.sha256, status: 'not-in-repo' });
        } else {
          findings.push(finding('error', 'missing-file', subject, 'manifest dosyasi diskte bulunamadi'));
          hashRows.push({ manifest: rel(manifestPath), file: subject, expectedSha256: e.sha256, status: 'missing' });
        }
        continue;
      }
      coveredFiles.add(abs);
      const buffer = fs.readFileSync(abs);
      if (isLfsPointer(buffer)) {
        hashRows.push({ manifest: rel(manifestPath), file: rel(abs), expectedSha256: e.sha256, status: 'lfs-pointer' });
        continue;
      }
      const text = isTextFileName(abs);
      const v = verifyEntry(buffer, { sha256: e.sha256, size: e.size, text });
      const row = { manifest: rel(manifestPath), file: rel(abs), kind: text ? 'text' : 'binary', expectedSha256: e.sha256, expectedBytes: e.size, ...v, status: null };
      if (v.matchedBy === null) {
        row.status = 'hash-mismatch';
        findings.push(finding('error', 'hash-mismatch', rel(abs), `beklenen ${e.sha256}, ham ${v.rawSha256}${text ? `, LF-normalize ${v.normalizedSha256}` : ''}`));
      } else if (v.sizeOk === false) {
        row.status = 'size-mismatch';
        findings.push(finding('error', 'size-mismatch', rel(abs), `manifest ${e.size} bayt, ${v.matchedBy} icerik ${v.matchedBy === 'raw' ? v.rawBytes : v.normalizedBytes} bayt`));
      } else {
        row.status = v.matchedBy === 'raw' ? 'ok-raw' : 'ok-lf-normalized';
        if (v.matchedBy === 'lf-normalized') {
          findings.push(finding('info', 'line-ending', rel(abs), 'ham hash eslesmedi; CRLF->LF normalize hash eslesti (satir sonu farki)'));
        }
      }
      hashRows.push(row);
    }
  }

  // (c) LFS pointer scan over all data files (cheap: only tiny files are read)
  const allDataFiles = walkFiles(dataDir);
  for (const abs of allDataFiles) {
    const size = fs.statSync(abs).size;
    if (size >= 1024) continue;
    if (isLfsPointer(fs.readFileSync(abs))) {
      findings.push(finding('error', 'lfs-pointer', rel(abs), `Git LFS isaretcisi (${size} bayt), gercek veri degil; 'git lfs pull' gerekir`));
    }
  }

  // (d) self-declared integrity fields
  const selfChecks = [];
  const vikingDir = path.join(dataDir, 'viking-mdim');
  const vikingPath = path.join(vikingDir, 'manifest.json');
  if (fs.existsSync(vikingPath)) {
    const viking = readJson(vikingPath, findings, 'data/viking-mdim/manifest.json');
    if (viking) {
      const pyr = checkPyramid(viking, vikingDir);
      findings.push(...pyr.findings);
      selfChecks.push({ name: 'viking pyramid', rows: pyr.rows });
    }
  }
  const molaPath = path.join(dataDir, 'regional-dem', 'mola-jezero.json');
  if (fs.existsSync(molaPath)) {
    inputFiles.push(molaPath);
    const mola = readJson(molaPath, findings, 'data/regional-dem/mola-jezero.json');
    if (mola?.grid) {
      const f32 = path.join(dataDir, 'regional-dem', mola.grid.file);
      if (fs.existsSync(f32)) {
        const bytes = fs.statSync(f32).size;
        const g = checkGridBytes({ subject: `data/regional-dem/${mola.grid.file}`, bytes, rows: mola.grid.height, cols: mola.grid.width });
        if (g) findings.push(g);
        if (mola.grid.byteLength !== undefined && mola.grid.byteLength !== bytes) {
          findings.push(finding('error', 'grid-size', `data/regional-dem/${mola.grid.file}`, `grid.byteLength ${mola.grid.byteLength}, diskte ${bytes}`));
        }
      }
    }
  }
  const nodataPath = path.join(dataDir, 'nodata-fixture', 'nodata-fixture.json');
  if (fs.existsSync(nodataPath)) {
    inputFiles.push(nodataPath);
    const nd = readJson(nodataPath, findings, 'data/nodata-fixture/nodata-fixture.json');
    if (nd) {
      const f32 = path.join(dataDir, 'nodata-fixture', nd.dataFile);
      if (fs.existsSync(f32)) {
        const g = checkGridBytes({ subject: `data/nodata-fixture/${nd.dataFile}`, bytes: fs.statSync(f32).size, rows: nd.rows, cols: nd.cols });
        if (g) findings.push(g);
      }
    }
  }

  // (d2) data/ortho/*.json: mosaic record (file key, relative to data/ortho) and per-tile records
  // (zoom/row/col, resolved as ortho-tiles/{zoom}/{row}/{col}.png under data/mars-trek per pathOrder).
  const orthoDir = path.join(dataDir, 'ortho');
  const orthoJsons = fs.existsSync(orthoDir) ? fs.readdirSync(orthoDir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const name of orthoJsons) {
    const jsonPath = path.join(orthoDir, name);
    inputFiles.push(jsonPath);
    const doc = readJson(jsonPath, findings, `data/ortho/${name}`);
    if (!doc) continue;
    const pending = [];
    // Records with a file key (the mosaic) resolve against data/ortho; tile records are handled below.
    for (const e of extractHashEntries(doc)) {
      if (e.path) pending.push({ ...e, base: orthoDir, label: e.path });
    }
    for (const t of Array.isArray(doc.tiles) ? doc.tiles : []) {
      if (t.status !== 'ok' || typeof t.sha256 !== 'string') continue;
      const tilePath = path.join(dataDir, 'mars-trek', 'ortho-tiles', String(t.zoom), String(t.row), `${t.col}.png`);
      pending.push({ where: 'tiles', path: rel(tilePath), sha256: t.sha256.toLowerCase(), sha256Valid: SHA256_RE.test(t.sha256), size: t.bytes, base: simRoot, label: `ortho-tiles/${t.zoom}/${t.row}/${t.col}.png` });
    }
    for (const e of pending) {
      const abs = fs.existsSync(path.resolve(e.base, e.path)) ? path.resolve(e.base, e.path) : null;
      const subject = `data/ortho/${name} :: ${e.label}`;
      if (!abs || !e.sha256Valid) {
        findings.push(finding('error', 'missing-file', subject, 'ortho JSON kaydindaki dosya diskte bulunamadi'));
        hashRows.push({ manifest: `data/ortho/${name}`, file: e.label, expectedSha256: e.sha256, status: 'missing' });
        continue;
      }
      coveredFiles.add(abs);
      const buffer = fs.readFileSync(abs);
      if (isLfsPointer(buffer)) {
        hashRows.push({ manifest: `data/ortho/${name}`, file: rel(abs), expectedSha256: e.sha256, status: 'lfs-pointer' });
        continue;
      }
      const v = verifyEntry(buffer, { sha256: e.sha256, size: e.size, text: false });
      const row = { manifest: `data/ortho/${name}`, file: rel(abs), kind: 'binary', expectedSha256: e.sha256, expectedBytes: e.size, ...v, status: null };
      if (v.matchedBy === null) {
        row.status = 'hash-mismatch';
        findings.push(finding('error', 'hash-mismatch', rel(abs), `ortho JSON beklenen ${e.sha256}, ham ${v.rawSha256}`));
      } else if (v.sizeOk === false) {
        row.status = 'size-mismatch';
        findings.push(finding('error', 'size-mismatch', rel(abs), `ortho JSON ${e.size} bayt, diskte ${v.rawBytes}`));
      } else {
        row.status = 'ok-raw';
      }
      hashRows.push(row);
    }
  }

  // (e) uncovered files (informational)
  const uncovered = allDataFiles.filter((abs) => !coveredFiles.has(abs) && !abs.endsWith('manifest.json')).map(rel);
  const uncoveredGroups = {};
  for (const u of uncovered) {
    const parts = u.split('/');
    const key = parts.length > 2 ? `${parts[1]}/` : parts.slice(1).join('/') || parts[0];
    uncoveredGroups[key] = (uncoveredGroups[key] ?? 0) + 1;
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  return {
    root: simRoot,
    configCompare,
    manifests: manifestReports,
    hashRows,
    noPathEntries,
    selfChecks,
    uncovered,
    uncoveredGroups,
    dataFileCount: allDataFiles.length,
    findings,
    summary: { errors, infos, exitCode: errors > 0 ? 1 : 0 },
    inputFiles: inputFiles.map((p) => path.resolve(p)),
  };
}

const STATUS_TR = {
  'eşleşiyor': 'eşleşiyor',
  'tutarsız': 'TUTARSIZ',
  'eksik': 'EKSIK',
  'kapsam içinde': 'kapsam içinde',
};

/** Human-readable report (ASCII-safe for the Windows console). */
export function formatReport(report) {
  const lines = [];
  lines.push(`Veri butunluk denetimi (Stage 38A) - kok: ${report.root}`);
  lines.push('');
  if (report.configCompare) {
    lines.push('[a] config.js MAP_FRAME <-> data/dtm_subset.json etiketi');
    for (const r of report.configCompare.rows) {
      lines.push(`  ${r.field.padEnd(34)} config=${JSON.stringify(r.config)} etiket=${JSON.stringify(r.label)} -> ${STATUS_TR[r.status] ?? r.status}`);
    }
    lines.push(`  tutarsiz/eksik alan: ${report.configCompare.mismatches}`);
    lines.push('');
  }
  lines.push(`[b] Manifest hash denetimi (${report.hashRows.length} dosya)`);
  for (const h of report.hashRows) {
    const tag = h.status ?? 'missing';
    const extra = h.rawSha256 ? ` raw=${h.rawSha256.slice(0, 12)}${h.normalizedSha256 ? ` lf=${h.normalizedSha256.slice(0, 12)}` : ''}` : '';
    lines.push(`  ${tag.padEnd(18)} ${h.file}${extra}`);
  }
  lines.push('');
  lines.push(`[c] Git LFS isaretcisi: ${report.findings.filter((f) => f.check === 'lfs-pointer').length} bulgu`);
  lines.push('');
  lines.push(`[d] Kendi bütünlük alanları: ${report.selfChecks.map((s) => s.name).join(', ') || 'yok'}`);
  for (const s of report.selfChecks) {
    for (const r of s.rows) lines.push(`  ${s.name} z=${r.z}: karo ${r.diskTiles}/${r.expectedTiles}, bayt ${r.diskBytes}/${r.expectedBytes}, ${r.ok ? 'tamam' : 'HATA'}`);
  }
  lines.push('');
  lines.push(`[e] Manifest hash kaydi olmayan dosya: ${report.uncovered.length} / ${report.dataFileCount} (gruplara gore):`);
  for (const [k, v] of Object.entries(report.uncoveredGroups).sort()) lines.push(`  ${k.padEnd(40)} ${v}`);
  if (report.noPathEntries.length) {
    lines.push(`Dosya yolu olmayan hash kayitlari (dogrulanamaz): ${report.noPathEntries.length}`);
    for (const n of report.noPathEntries) lines.push(`  ${n.manifest} :: ${n.where}`);
  }
  lines.push('');
  const errs = report.findings.filter((f) => f.severity === 'error');
  const infos = report.findings.filter((f) => f.severity === 'info');
  lines.push(`BULGULAR: hata ${errs.length}, bilgi ${infos.length}`);
  for (const f of errs) lines.push(`  [HATA] ${f.check} :: ${f.subject} :: ${f.message}`);
  for (const f of infos) lines.push(`  [bilgi] ${f.check} :: ${f.subject} :: ${f.message}`);
  lines.push(report.summary.exitCode === 0 ? 'SONUC: TUTARLI. Cikis kodu 0.' : `SONUC: TUTARSIZ (${errs.length} hata). Cikis kodu 1.`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { root: null, json: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') args.root = argv[++i];
    else if (argv[i] === '--json') args.json = argv[++i];
    else throw new Error(`bilinmeyen arguman: ${argv[i]}`);
  }
  if (args.root !== null && !args.root) throw new Error('--root bir yol ister');
  if (args.json !== null && !args.json) throw new Error('--json bir dosya yolu ister');
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`Kullanim hatasi: ${err.message}`);
    console.error('Kullanim: node scripts/validate-data-integrity.mjs [--root <Sim dir>] [--json <out.json>]');
    return 2;
  }
  const root = args.root ? path.resolve(args.root) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = runIntegrity({ root });
  if (args.json) {
    try {
      assertOutputNotInput(args.json, report.inputFiles);
    } catch (err) {
      console.error(err.message);
      return 2;
    }
    fs.writeFileSync(path.resolve(args.json), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(formatReport(report));
  if (args.json) console.log(`JSON cikti: ${path.resolve(args.json)}`);
  return report.summary.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
