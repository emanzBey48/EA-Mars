// Stage 38A tests: data integrity validator on synthetic files only (the real repo is never read here).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  compareLabelToConfig, extractHashEntries, verifyEntry, checkGridBytes,
  assertOutputNotInput, runIntegrity, checkPyramid, formatReport,
} from '../scripts/validate-data-integrity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'scripts', 'validate-data-integrity.mjs');
const LFS_POINTER = `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 7609040\n`;

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marswalk-integrity-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

function withRoot(files, fn) {
  const root = makeRoot(files);
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const CRLF_TEXT = '{\r\n  "a": 1\r\n}\r\n';
const LF_TEXT = '{\n  "a": 1\n}\n';

function baseConfig() {
  return {
    productId: 'P', radiusKm: 3396.19, centerLatDeg: 0, centerLonDeg: 0, mapScaleM: 1,
    lineProjectionOffset: 10.5, sampleProjectionOffset: -20.5, upperLeftX: 5, upperLeftY: 6,
    lines: 100, samples: 80, rasterType: 'PixelIsArea', pixelRegistration: 'PIXEL_IS_AREA',
    noDataHex: 'FF7FFFFB', verticalDatum: 'MOLA', verticalDatumVerified: true,
    verticalDatumEvidence: 'E', validMin: -3000, validMax: -1000,
  };
}

function baseLabel() {
  return {
    productId: 'P', radiusKm: 3396.19, centerLatDeg: 0, centerLonDeg: 0, mapScaleM: 1,
    lineProjectionOffset: 10.5, sampleProjectionOffset: -20.5, upperLeftX: 5, upperLeftY: 6,
    lines: 100, samples: 80, rasterType: 'PixelIsArea', pixelRegistration: 'PIXEL_IS_AREA',
    missingConstantHex: 'ff7ffffb', verticalDatum: null, verticalDatumVerified: false,
    verticalDatumEvidence: null, observedMin: -2500, observedMax: -2000,
  };
}

test('CRLF text file: manifest hash of the LF form matches via lf-normalized, both hashes reported', () => {
  const buf = Buffer.from(CRLF_TEXT, 'latin1');
  const v = verifyEntry(buf, { sha256: sha(Buffer.from(LF_TEXT)), size: Buffer.byteLength(LF_TEXT), text: true });
  assert.equal(v.matchedBy, 'lf-normalized');
  assert.equal(v.sizeOk, true);
  assert.equal(v.rawSha256, sha(buf));
  assert.notEqual(v.rawSha256, v.normalizedSha256);
  assert.equal(v.normalizedSha256, sha(Buffer.from(LF_TEXT)));
});

test('text file whose raw bytes match is reported as raw, not normalised', () => {
  const buf = Buffer.from(LF_TEXT);
  const v = verifyEntry(buf, { sha256: sha(buf), size: buf.length, text: true });
  assert.equal(v.matchedBy, 'raw');
  assert.equal(v.sizeOk, true);
});

test('binary file is never line-ending normalised', () => {
  const buf = Buffer.from(CRLF_TEXT, 'latin1');
  const v = verifyEntry(buf, { sha256: sha(Buffer.from(LF_TEXT)), size: null, text: false });
  assert.equal(v.matchedBy, null);
  assert.equal(v.normalizedSha256, null);
});

test('wrong hash is not matched; wrong size is flagged after a matching hash', () => {
  const buf = Buffer.from('abc');
  assert.equal(verifyEntry(buf, { sha256: 'f'.repeat(64), text: false }).matchedBy, null);
  const sized = verifyEntry(buf, { sha256: sha(buf), size: 99, text: false });
  assert.equal(sized.matchedBy, 'raw');
  assert.equal(sized.sizeOk, false);
});

test('extractHashEntries: nested entries found, path key priority, log-like entries without path kept separate', () => {
  const manifest = {
    files: [
      { name: 'a.xml', path: 'data/x/a.xml', size_bytes: 3, sha256: 'a'.repeat(64) },
      { file: 'b.html', size_bytes: 4, sha256: 'b'.repeat(64) },
    ],
    regional: { file: 'r.png', bytes: 5, sha256: 'c'.repeat(64) },
    source: { bytes: 9, sha256: 'd'.repeat(64) },
    request: { log: [{ name: 'metadata', bytes: 2, sha256: 'e'.repeat(64) }] },
  };
  const entries = extractHashEntries(manifest);
  assert.equal(entries.length, 5);
  const byPath = Object.fromEntries(entries.filter((e) => e.path).map((e) => [e.path, e]));
  assert.equal(byPath['data/x/a.xml'].size, 3);
  assert.equal(byPath['b.html'].size, 4);
  assert.equal(byPath['r.png'].sizeKey, 'bytes');
  const noPath = entries.filter((e) => !e.path).map((e) => e.where);
  assert.deepEqual(noPath.sort(), ['request.log[0]', 'source'].sort());
});

test('extractHashEntries flags a malformed sha256 value', () => {
  const [e] = extractHashEntries({ files: [{ path: 'x', sha256: 'zz' }] });
  assert.equal(e.sha256Valid, false);
});

test('config vs label: identical frame passes; datum and evidence mismatches are reported', () => {
  const r = compareLabelToConfig(baseConfig(), baseLabel(), true);
  const status = Object.fromEntries(r.rows.map((x) => [x.field, x.status]));
  assert.equal(status.radiusKm, 'eşleşiyor');
  assert.equal(status.noDataHex, 'eşleşiyor'); // hex comparison is case-insensitive
  assert.equal(status.verticalDatum, 'tutarsız');
  assert.equal(status.verticalDatumVerified, 'tutarsız');
  assert.equal(status.verticalDatumEvidence, 'tutarsız');
  assert.equal(status['validMin..validMax (pencere gözlemi)'], 'kapsam içinde');
  assert.equal(status['frameMatchesConfig (etiket beyanı)'], 'eşleşiyor');
  assert.equal(r.mismatches, 3);
});

test('config vs label: missing label field is reported as eksik, not silently passed', () => {
  const label = baseLabel();
  delete label.lines;
  const r = compareLabelToConfig(baseConfig(), label, null);
  assert.equal(r.rows.find((x) => x.field === 'lines').status, 'eksik');
  assert.ok(r.mismatches >= 1);
});

test('config vs label: a false frameMatchesConfig claim is contradicted by the recomputed geometry', () => {
  const label = baseLabel();
  label.verticalDatum = 'MOLA';
  label.verticalDatumVerified = true;
  label.verticalDatumEvidence = 'E';
  const r = compareLabelToConfig(baseConfig(), label, false);
  assert.equal(r.rows.find((x) => x.field.startsWith('frameMatchesConfig')).status, 'tutarsız');
  assert.equal(r.mismatches, 1);
});

test('config vs label: out-of-range observed window is flagged', () => {
  const label = baseLabel();
  label.observedMax = 0;
  const r = compareLabelToConfig(baseConfig(), label, null);
  assert.equal(r.rows.find((x) => x.field.startsWith('validMin')).status, 'tutarsız');
});

test('grid byte count: rows x cols x 4 must equal the file size', () => {
  assert.equal(checkGridBytes({ subject: 's', bytes: 2 * 3 * 4, rows: 2, cols: 3 }), null);
  const f = checkGridBytes({ subject: 's', bytes: 10, rows: 2, cols: 3 });
  assert.equal(f.check, 'grid-size');
  assert.equal(f.severity, 'error');
});

test('assertOutputNotInput rejects the same file and accepts a different one', () => {
  const inputs = [path.join(os.tmpdir(), 'in.json')];
  assert.throws(() => assertOutputNotInput(path.join(os.tmpdir(), 'in.json'), inputs), /ayni olamaz/);
  assert.doesNotThrow(() => assertOutputNotInput(path.join(os.tmpdir(), 'out.json'), inputs));
});

test('runIntegrity: clean synthetic root exits 0; CRLF match is info only', () => {
  withRoot({
    'data/demo/manifest.json': JSON.stringify({ files: [{ file: 'notes.json', size_bytes: LF_TEXT.length, sha256: sha(Buffer.from(LF_TEXT)) }] }),
    'data/demo/notes.json': CRLF_TEXT,
  }, (root) => {
    const r = runIntegrity({ root, config: {}, requireDtmLabel: false });
    assert.equal(r.summary.exitCode, 0);
    assert.equal(r.summary.errors, 0);
    assert.equal(r.summary.infos, 1);
    assert.equal(r.hashRows[0].status, 'ok-lf-normalized');
    assert.deepEqual(r.uncovered, []);
  });
});

test('runIntegrity: hash mismatch, size mismatch, missing file and LFS pointer are errors; exit code 1', () => {
  withRoot({
    'data/bad/manifest.json': JSON.stringify({
      files: [
        { file: 'a.txt', size_bytes: 1, sha256: sha(Buffer.from('y')) },
        { file: 'b.bin', size_bytes: 99, sha256: sha(Buffer.from([1, 2, 3])) },
        { file: 'gone.json', size_bytes: 1, sha256: 'b'.repeat(64) },
        { file: 'ptr.f32', size_bytes: 7609040, sha256: 'a'.repeat(64) },
      ],
      source: { file: 'big.tif', bytes: 1, sha256: 'c'.repeat(64) },
    }),
    'data/bad/a.txt': 'x',
    'data/bad/b.bin': Buffer.from([1, 2, 3]),
    'data/bad/ptr.f32': LFS_POINTER,
    'data/bad/extra.txt': 'not in any manifest',
  }, (root) => {
    const r = runIntegrity({ root, config: {}, requireDtmLabel: false });
    const checks = r.findings.filter((f) => f.severity === 'error').map((f) => f.check).sort();
    assert.deepEqual(checks, ['hash-mismatch', 'lfs-pointer', 'missing-file', 'size-mismatch']);
    assert.equal(r.summary.exitCode, 1);
    assert.ok(r.findings.some((f) => f.check === 'source-not-in-repo' && f.severity === 'info'));
    assert.ok(r.uncovered.includes('data/bad/extra.txt'));
  });
});

test('checkPyramid: tile count and byte total must match the manifest level', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  withRoot({ 'viking-mdim/tiles/0/0/0.png': png }, (root) => {
    const dir = path.join(root, 'viking-mdim');
    const ok = checkPyramid({ levels: [{ z: 0, tiles: 1, pngBytesTotal: png.length, written: true }] }, dir);
    assert.equal(ok.findings.length, 0);
    const bad = checkPyramid({ levels: [{ z: 0, tiles: 2, pngBytesTotal: png.length, written: true }, { z: 1, tiles: 1, pngBytesTotal: 1, written: false }] }, dir);
    assert.equal(bad.findings.length, 1);
    assert.equal(bad.rows.length, 1); // level written=false is skipped
    assert.equal(bad.rows[0].ok, false);
  });
});

test('formatReport prints the verdict line matching the exit code', () => {
  withRoot({ 'data/x/manifest.json': '{}' }, (root) => {
    const r = runIntegrity({ root, config: {}, requireDtmLabel: false });
    assert.match(formatReport(r), /SONUC: TUTARLI\. Cikis kodu 0\./);
  });
});

test('CLI: --json pointing at an input file is refused with exit 2 and the input is left untouched', () => {
  const manifest = JSON.stringify({ files: [{ file: 'a.txt', size_bytes: 1, sha256: sha(Buffer.from('a')) }] });
  withRoot({ 'data/m/manifest.json': manifest, 'data/m/a.txt': 'a' }, (root) => {
    const target = path.join(root, 'data', 'm', 'manifest.json');
    const res = spawnSync(process.execPath, [SCRIPT, '--root', root, '--json', target], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /ayni olamaz/);
    assert.equal(fs.readFileSync(target, 'utf8'), manifest);
  });
});

test('CLI: --json to a separate file writes the report; a root without the DTM label exits 1 with only that error', () => {
  withRoot({ 'data/m/manifest.json': JSON.stringify({ files: [{ file: 'a.txt', size_bytes: 1, sha256: sha(Buffer.from('a')) }] }), 'data/m/a.txt': 'a' }, (root) => {
    const out = path.join(root, 'report.json');
    const res = spawnSync(process.execPath, [SCRIPT, '--root', root, '--json', out], { encoding: 'utf8' });
    assert.equal(res.status, 1, res.stderr);
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(parsed.summary.exitCode, 1);
    assert.deepEqual(parsed.findings.map((f) => f.check), ['missing-file']);
    assert.equal(parsed.hashRows[0].status, 'ok-raw');
  });
});

test('CLI: unknown argument is a usage error (exit 2)', () => {
  const res = spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});
