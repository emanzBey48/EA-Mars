#!/usr/bin/env node
// Stage 29C - demo preflight check. One command: node scripts/preflight.mjs [--tests] [--root <Sim dir>]
//
// Checks (read-only, never writes or repairs data):
//   1. Node version (>= 20, as in package.json "engines").
//   2. Required data files exist and are real files, not Git LFS pointers (a ~132 byte text file that
//      starts with "version https://git-lfs"; the cause of the earlier smoke-test blocker).
//   3. Manifest SHA-256 values. Text files are accepted if the raw bytes OR the CRLF->LF normalised
//      bytes match (finding D3: Windows checkouts convert line endings); binary files must match raw.
//   4. Optional --tests: runs `node --test test/` and prints the pass/fail summary.
// Exit code: 0 = no errors, 1 = at least one error. Warnings never change the exit code.
//
// The pure check functions are exported and unit-tested in test/preflight.test.mjs with synthetic files.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const MIN_NODE_MAJOR = 20;
const LFS_PREFIX = 'version https://git-lfs';
const LFS_MAX_POINTER_BYTES = 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEXT_EXTENSIONS = new Set(['.json', '.geojson', '.html', '.xml', '.txt', '.md', '.csv']);

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

/** @returns {{ok:boolean, major:number|null, version:string}} */
export function checkNodeVersion(version = process.versions.node, minMajor = MIN_NODE_MAJOR) {
  const major = Number.parseInt(String(version).replace(/^v/, '').split('.')[0], 10);
  return { ok: Number.isInteger(major) && major >= minMajor, major: Number.isInteger(major) ? major : null, version: String(version) };
}

/** A Git LFS pointer is a tiny text file that starts with "version https://git-lfs". */
export function isLfsPointer(buffer) {
  if (!buffer || buffer.length === 0 || buffer.length >= LFS_MAX_POINTER_BYTES) return false;
  return buffer.subarray(0, LFS_PREFIX.length).toString('latin1') === LFS_PREFIX;
}

export function normalizeLf(buffer) {
  return Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function isTextFileName(name) {
  return TEXT_EXTENSIONS.has(path.extname(String(name)).toLowerCase());
}

/**
 * Compare a buffer with a manifest SHA-256. Text files: raw first, then CRLF->LF normalised.
 * Binary files: raw bytes only (never normalised).
 * @returns {{ok:boolean, method:'raw'|'lf-normalized'|null, actualRaw:string}}
 */
export function verifyHash(buffer, expectedHex, { text = false } = {}) {
  const expected = String(expectedHex ?? '').toLowerCase();
  const actualRaw = sha256Hex(buffer);
  if (actualRaw === expected) return { ok: true, method: 'raw', actualRaw };
  if (text) {
    const normalised = sha256Hex(normalizeLf(buffer));
    if (normalised === expected) return { ok: true, method: 'lf-normalized', actualRaw };
  }
  return { ok: false, method: null, actualRaw };
}

/**
 * Inspect one file without trusting it.
 * status: ok | missing | not-a-file | lfs-pointer | empty | size-mismatch | not-png
 */
export function inspectFile(absPath, { expectedBytes = null, png = false, minBytes = 1 } = {}) {
  let stat;
  try { stat = fs.statSync(absPath); } catch { return { status: 'missing', bytes: 0 }; }
  if (!stat.isFile()) return { status: 'not-a-file', bytes: 0 };
  if (stat.size < minBytes) return { status: 'empty', bytes: stat.size };
  const headLength = Math.min(stat.size, 256);
  const head = Buffer.alloc(headLength);
  const fd = fs.openSync(absPath, 'r');
  try { fs.readSync(fd, head, 0, headLength, 0); } finally { fs.closeSync(fd); }
  if (isLfsPointer(stat.size < LFS_MAX_POINTER_BYTES ? fs.readFileSync(absPath) : head)) {
    return { status: 'lfs-pointer', bytes: stat.size };
  }
  if (png && !head.subarray(0, 8).equals(PNG_SIGNATURE)) return { status: 'not-png', bytes: stat.size };
  if (expectedBytes != null && stat.size !== expectedBytes) return { status: 'size-mismatch', bytes: stat.size, expectedBytes };
  return { status: 'ok', bytes: stat.size };
}

/** Parse the `# pass N` / `# fail N` lines of `node --test` output. */
export function summarizeTestOutput(text) {
  const grab = (name) => {
    const match = new RegExp(`^# ${name} (\\d+)`, 'm').exec(String(text));
    return match ? Number(match[1]) : null;
  };
  return { tests: grab('tests'), pass: grab('pass'), fail: grab('fail'), cancelled: grab('cancelled'), skipped: grab('skipped') };
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// Check plan
// ---------------------------------------------------------------------------------------------

const LFS_HINT = 'Git LFS isaretcisi bulundu, gercek raster degil. Cozum: depo kokunde `git lfs pull` calistirin (gerekirse once `git lfs install`).';

function add(results, severity, group, message, hint) {
  results.push({ severity, group, message, ...(hint ? { hint } : {}) });
}

function describeStatus(status, info) {
  switch (status) {
    case 'missing': return 'dosya yok';
    case 'not-a-file': return 'dosya degil';
    case 'lfs-pointer': return `Git LFS isaretcisi (${info.bytes} bayt), gercek veri degil`;
    case 'empty': return 'dosya bos';
    case 'size-mismatch': return `boyut uyusmuyor: ${info.bytes} bayt, beklenen ${info.expectedBytes}`;
    case 'not-png': return 'PNG imzasi yok';
    default: return status;
  }
}

/** Check one required file and record the result. Returns the inspection. */
export function checkRequiredFile(results, root, group, rel, options = {}) {
  const info = inspectFile(path.join(root, rel), options);
  if (info.status === 'ok') {
    add(results, 'ok', group, `${rel} (${info.bytes} bayt)`);
  } else {
    add(results, options.severity ?? 'error', group, `${rel}: ${describeStatus(info.status, info)}`,
      info.status === 'lfs-pointer' ? LFS_HINT : undefined);
  }
  return info;
}

/** Verify one manifest hash entry against a file on disk. */
export function checkHashEntry(results, root, group, rel, expectedHex, { sizeBytes = null } = {}) {
  const abs = path.join(root, rel);
  const info = inspectFile(abs);
  if (info.status !== 'ok') {
    add(results, 'error', group, `${rel}: hash dogrulanamadi, ${describeStatus(info.status, info)}`,
      info.status === 'lfs-pointer' ? LFS_HINT : undefined);
    return;
  }
  const text = isTextFileName(rel);
  const buffer = fs.readFileSync(abs);
  const verdict = verifyHash(buffer, expectedHex, { text });
  if (!verdict.ok) {
    add(results, 'error', group, `${rel}: SHA-256 uyusmuyor (manifest ${String(expectedHex).slice(0, 12)}..., dosya ${verdict.actualRaw.slice(0, 12)}...)`,
      'Dosya degismis veya bozuk olabilir. Veriyi yeniden uretmeden once nedenini inceleyin; preflight veriyi degistirmez.');
    return;
  }
  if (!text && sizeBytes != null && buffer.length !== sizeBytes) {
    add(results, 'error', group, `${rel}: hash eslesti ama manifest boyutu ${sizeBytes}, dosya ${buffer.length} bayt`);
    return;
  }
  const note = verdict.method === 'lf-normalized' ? ' [CRLF->LF normalizasyonuyla eslesti]' : '';
  add(results, 'ok', group, `${rel}: SHA-256 eslesti${note}`);
}

function forEachTile(levels, callback) {
  for (const level of levels) {
    for (let row = level.row_range[0]; row <= level.row_range[1]; row++) {
      for (let col = level.col_range[0]; col <= level.col_range[1]; col++) callback(level.zoom, row, col);
    }
  }
}

/**
 * Run every check. `root` is the Sim directory. Never writes.
 * @returns {{results:object[], errors:number, warnings:number}}
 */
export function runPreflight({ root, nodeVersion = process.versions.node } = {}) {
  const results = [];
  const rel = (...parts) => parts.join('/');

  // 1. Node
  const node = checkNodeVersion(nodeVersion);
  add(results, node.ok ? 'ok' : 'error', 'Node', node.ok
    ? `Node ${node.version} (>= ${MIN_NODE_MAJOR})`
    : `Node ${node.version} cok eski; en az ${MIN_NODE_MAJOR} gerekir`);

  // 2a. Local HiRISE DTM windows (raw rasters, LFS-tracked in this repo)
  for (const dir of ['data', 'data/legacy-hirise']) {
    const jsonRel = rel(dir, 'dtm_subset.json');
    const jsonInfo = checkRequiredFile(results, root, 'DTM', jsonRel);
    let expected = null;
    if (jsonInfo.status === 'ok') {
      try {
        const meta = readJson(path.join(root, jsonRel));
        expected = meta.window.rows * meta.window.cols * 4;
      } catch (error) {
        add(results, 'error', 'DTM', `${jsonRel}: JSON okunamadi (${error.message})`);
      }
    }
    checkRequiredFile(results, root, 'DTM', rel(dir, 'dtm_subset.f32'), { expectedBytes: expected });
  }

  // 2b. Ortho mosaics
  for (const z of ['z17', 'z14']) {
    checkRequiredFile(results, root, 'Ortho', `data/ortho/ortho-mosaic-${z}-tiles.png`, { png: true });
    checkRequiredFile(results, root, 'Ortho', `data/ortho/ortho-alignment-${z}-tiles.json`);
  }

  // 2c. Mars Trek manifest, vectors and WMTS tiles
  const trekManifestRel = 'data/mars-trek/manifest.json';
  if (checkRequiredFile(results, root, 'Mars Trek', trekManifestRel).status === 'ok') {
    try {
      const manifest = readJson(path.join(root, trekManifestRel));
      for (const entry of manifest.files.metadata_and_vectors) {
        checkHashEntry(results, root, 'Mars Trek', rel('data/mars-trek', entry.file), entry.sha256, { sizeBytes: entry.size_bytes });
      }
      let tileCount = 0;
      let badTiles = 0;
      forEachTile(manifest.files.ortho_tiles.levels, (zoom, row, col) => {
        tileCount++;
        const info = inspectFile(path.join(root, 'data/mars-trek', manifest.files.ortho_tiles.root_directory, String(zoom), String(row), `${col}.png`), { png: true });
        if (info.status !== 'ok') {
          badTiles++;
          add(results, 'error', 'Mars Trek', `ortho-tiles/${zoom}/${row}/${col}.png: ${describeStatus(info.status, info)}`,
            info.status === 'lfs-pointer' ? LFS_HINT : undefined);
        }
      });
      if (tileCount !== manifest.files.ortho_tiles.total_tiles) {
        add(results, 'error', 'Mars Trek', `ortho karo sayisi ${tileCount}, manifest ${manifest.files.ortho_tiles.total_tiles}`);
      } else if (badTiles === 0) {
        add(results, 'ok', 'Mars Trek', `${tileCount} ortho karosu mevcut, PNG imzasi gecerli`);
      }
    } catch (error) {
      add(results, 'error', 'Mars Trek', `${trekManifestRel}: okunamadi (${error.message})`);
    }
  }

  // 2d. Viking MDIM pyramid (the 12.7 GB source TIFF is intentionally NOT required)
  const vikingRel = 'data/viking-mdim/manifest.json';
  if (checkRequiredFile(results, root, 'Viking MDIM', vikingRel).status === 'ok') {
    try {
      const manifest = readJson(path.join(root, vikingRel));
      checkHashEntry(results, root, 'Viking MDIM', rel('data/viking-mdim', manifest.regional.file), manifest.regional.sha256, { sizeBytes: manifest.regional.bytes });
      let tiles = 0;
      let bad = 0;
      for (const level of manifest.levels.filter((item) => item.written)) {
        for (let row = 0; row < level.rows; row++) {
          for (let col = 0; col < level.cols; col++) {
            tiles++;
            const info = inspectFile(path.join(root, 'data/viking-mdim/tiles', String(level.z), String(row), `${col}.png`), { png: true });
            if (info.status !== 'ok') {
              bad++;
              add(results, 'error', 'Viking MDIM', `tiles/${level.z}/${row}/${col}.png: ${describeStatus(info.status, info)}`,
                info.status === 'lfs-pointer' ? LFS_HINT : undefined);
            }
          }
        }
      }
      if (bad === 0) add(results, 'ok', 'Viking MDIM', `${tiles} piramit karosu mevcut, PNG imzasi gecerli`);
    } catch (error) {
      add(results, 'error', 'Viking MDIM', `${vikingRel}: okunamadi (${error.message})`);
    }
  }

  // 2e. Regional MOLA DEM
  const molaJsonRel = 'data/regional-dem/mola-jezero.json';
  const molaInfo = checkRequiredFile(results, root, 'MOLA bolgesel', molaJsonRel);
  let molaBytes = null;
  if (molaInfo.status === 'ok') {
    try { molaBytes = readJson(path.join(root, molaJsonRel)).grid.byteLength; } catch (error) {
      add(results, 'error', 'MOLA bolgesel', `${molaJsonRel}: grid.byteLength okunamadi (${error.message})`);
    }
  }
  checkRequiredFile(results, root, 'MOLA bolgesel', 'data/regional-dem/mola-jezero.f32', { expectedBytes: molaBytes });

  // 2f. USGS SIM 3464 geology
  const geoManifestRel = 'data/usgs-sim3464-geology/manifest.json';
  if (checkRequiredFile(results, root, 'Jeoloji', geoManifestRel).status === 'ok') {
    try {
      const manifest = readJson(path.join(root, geoManifestRel));
      for (const entry of manifest.files) {
        checkHashEntry(results, root, 'Jeoloji', rel('data/usgs-sim3464-geology', entry.name), entry.sha256, { sizeBytes: entry.size_bytes });
      }
    } catch (error) {
      add(results, 'error', 'Jeoloji', `${geoManifestRel}: okunamadi (${error.message})`);
    }
  }

  // 2g. Perseverance raw images (manifest carries file sizes, not hashes)
  const rawManifestRel = 'data/perseverance-raw/manifest.json';
  if (checkRequiredFile(results, root, 'Perseverance ham', rawManifestRel).status === 'ok') {
    try {
      const manifest = readJson(path.join(root, rawManifestRel));
      let good = 0;
      for (const image of manifest.images) {
        const info = inspectFile(path.join(root, image.localFile), { expectedBytes: image.fileSizeBytes });
        if (info.status === 'ok') good++;
        else add(results, 'error', 'Perseverance ham', `${image.localFile}: ${describeStatus(info.status, info)}`,
          info.status === 'lfs-pointer' ? LFS_HINT : undefined);
      }
      if (good === manifest.images.length) add(results, 'ok', 'Perseverance ham', `${good}/${manifest.images.length} gorsel mevcut, boyutlar manifestle ayni`);
    } catch (error) {
      add(results, 'error', 'Perseverance ham', `${rawManifestRel}: okunamadi (${error.message})`);
    }
  }

  // 2h. Ortho alignment hashes (binary mosaics) and synthetic no-data fixture hash
  for (const z of ['z17', 'z14']) {
    const alignmentRel = `data/ortho/ortho-alignment-${z}-tiles.json`;
    if (inspectFile(path.join(root, alignmentRel)).status !== 'ok') continue;
    try {
      const { mosaic } = readJson(path.join(root, alignmentRel));
      checkHashEntry(results, root, 'Ortho', rel('data/ortho', mosaic.file), mosaic.sha256, { sizeBytes: mosaic.bytes });
    } catch (error) {
      add(results, 'error', 'Ortho', `${alignmentRel}: okunamadi (${error.message})`);
    }
  }
  const fixtureRel = 'data/nodata-fixture/nodata-fixture.json';
  if (inspectFile(path.join(root, fixtureRel)).status === 'ok') {
    try {
      const fixture = readJson(path.join(root, fixtureRel));
      if (fixture.sha256Data) checkHashEntry(results, root, 'No-data fixture', rel('data/nodata-fixture', fixture.dataFile), fixture.sha256Data);
      else add(results, 'warn', 'No-data fixture', `${fixtureRel}: sha256Data alani yok, hash dogrulanmadi`);
    } catch (error) {
      add(results, 'warn', 'No-data fixture', `${fixtureRel}: okunamadi (${error.message})`);
    }
  } else {
    add(results, 'warn', 'No-data fixture', `${fixtureRel}: yok (yalniz test verisi; demo icin gerekli degil)`);
  }

  return {
    results,
    errors: results.filter((item) => item.severity === 'error').length,
    warnings: results.filter((item) => item.severity === 'warn').length,
  };
}

const LABELS = { ok: '[TAMAM] ', error: '[HATA]  ', warn: '[UYARI] ' };

export function formatReport(report, { verbose = false } = {}) {
  const lines = ['Marswalk on ucus kontrolu (preflight)', ''];
  const groups = [...new Set(report.results.map((item) => item.group))];
  for (const group of groups) {
    const items = report.results.filter((item) => item.group === group);
    const bad = items.filter((item) => item.severity !== 'ok');
    lines.push(`${group}: ${items.length - bad.length}/${items.length} tamam`);
    for (const item of items) {
      if (item.severity === 'ok' && !verbose) continue;
      lines.push(`  ${LABELS[item.severity]}${item.message}`);
      if (item.hint) lines.push(`           -> ${item.hint}`);
    }
  }
  lines.push('', report.errors === 0
    ? `SONUC: HAZIR (hata 0, uyari ${report.warnings}).`
    : `SONUC: HAZIR DEGIL (hata ${report.errors}, uyari ${report.warnings}). Cikis kodu 1.`);
  return lines.join('\n');
}

function runTests(root) {
  const child = spawnSync(process.execPath, ['--test', 'test/'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const summary = summarizeTestOutput(`${child.stdout ?? ''}\n${child.stderr ?? ''}`);
  return { exitCode: child.status, summary };
}

function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const root = rootFlag >= 0 ? path.resolve(argv[rootFlag + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = runPreflight({ root });
  console.log(formatReport(report, { verbose: argv.includes('--verbose') }));
  let failed = report.errors > 0;
  if (argv.includes('--tests')) {
    console.log('\nBirim testleri calistiriliyor: node --test test/ ...');
    const { exitCode, summary } = runTests(root);
    console.log(`Testler: ${summary.pass ?? '?'} gecti, ${summary.fail ?? '?'} basarisiz, toplam ${summary.tests ?? '?'} (cikis kodu ${exitCode}).`);
    if (exitCode !== 0) failed = true;
  } else {
    console.log('Birim testleri atlandi (calistirmak icin: node scripts/preflight.mjs --tests).');
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
