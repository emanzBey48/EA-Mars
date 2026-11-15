// Stage 29C tests: preflight check functions on synthetic files only (no real data is touched).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  checkNodeVersion, isLfsPointer, normalizeLf, sha256Hex, verifyHash, inspectFile,
  checkHashEntry, checkRequiredFile, runPreflight, formatReport, summarizeTestOutput, isTextFileName,
} from '../scripts/preflight.mjs';

const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64) + '\nsize 7609040\n';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'marswalk-preflight-'));
}

test('Node version gate: >= 20 passes, 18 fails, garbage fails', () => {
  assert.equal(checkNodeVersion('20.0.0').ok, true);
  assert.equal(checkNodeVersion('v26.13.1').ok, true);
  assert.equal(checkNodeVersion('18.19.0').ok, false);
  assert.equal(checkNodeVersion('abc').ok, false);
});

test('LFS pointer detection: real pointer text is detected, ordinary and large data is not', () => {
  assert.equal(isLfsPointer(Buffer.from(LFS_POINTER)), true);
  assert.ok(Buffer.byteLength(LFS_POINTER) < 200, 'pointer is ~130 bytes');
  assert.equal(isLfsPointer(Buffer.from('{"json": true}')), false);
  assert.equal(isLfsPointer(Buffer.alloc(0)), false);
  // A large file that merely begins with the same words is not a pointer.
  assert.equal(isLfsPointer(Buffer.concat([Buffer.from(LFS_POINTER), Buffer.alloc(4096)])), false);
});

test('inspectFile: missing, LFS pointer, empty, size mismatch, bad PNG, ok', () => {
  const dir = tempDir();
  try {
    assert.equal(inspectFile(path.join(dir, 'nope.f32')).status, 'missing');
    fs.writeFileSync(path.join(dir, 'ptr.f32'), LFS_POINTER);
    assert.equal(inspectFile(path.join(dir, 'ptr.f32')).status, 'lfs-pointer');
    assert.equal(inspectFile(path.join(dir, 'ptr.f32'), { expectedBytes: 7609040 }).status, 'lfs-pointer', 'pointer wins over size mismatch');
    fs.writeFileSync(path.join(dir, 'empty.bin'), '');
    assert.equal(inspectFile(path.join(dir, 'empty.bin')).status, 'empty');
    fs.writeFileSync(path.join(dir, 'real.f32'), Buffer.alloc(400));
    assert.equal(inspectFile(path.join(dir, 'real.f32'), { expectedBytes: 400 }).status, 'ok');
    assert.equal(inspectFile(path.join(dir, 'real.f32'), { expectedBytes: 404 }).status, 'size-mismatch');
    assert.equal(inspectFile(path.join(dir, 'real.f32'), { png: true }).status, 'not-png');
    fs.writeFileSync(path.join(dir, 'tile.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]));
    assert.equal(inspectFile(path.join(dir, 'tile.png'), { png: true }).status, 'ok');
    assert.equal(inspectFile(dir).status, 'not-a-file');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('hash verification: CRLF->LF normalisation matches text files, never binary files (D3)', () => {
  const lf = Buffer.from('<html>\nline\n</html>\n');
  const crlf = Buffer.from('<html>\r\nline\r\n</html>\r\n');
  const expected = sha256Hex(lf); // manifest hash was computed on the LF original
  assert.equal(normalizeLf(crlf).equals(lf), true);
  assert.deepEqual({ ok: verifyHash(lf, expected, { text: true }).ok, method: verifyHash(lf, expected, { text: true }).method }, { ok: true, method: 'raw' });
  assert.deepEqual({ ok: verifyHash(crlf, expected, { text: true }).ok, method: verifyHash(crlf, expected, { text: true }).method }, { ok: true, method: 'lf-normalized' });
  assert.equal(verifyHash(crlf, expected, { text: false }).ok, false, 'binary bytes are never normalised');
  assert.equal(verifyHash(Buffer.from('changed'), expected, { text: true }).ok, false);
  assert.equal(isTextFileName('a.geojson'), true);
  assert.equal(isTextFileName('a.png'), false);
  assert.equal(isTextFileName('a.pdf'), false);
});

test('checkHashEntry: CRLF text file passes with a note; tampered file, LFS pointer and missing file are errors', () => {
  const dir = tempDir();
  try {
    const lf = Buffer.from('a\nb\n');
    fs.writeFileSync(path.join(dir, 'meta.html'), Buffer.from('a\r\nb\r\n'));
    fs.writeFileSync(path.join(dir, 'bin.png'), Buffer.from([1, 2, 3, 4]));
    fs.writeFileSync(path.join(dir, 'lfs.png'), LFS_POINTER);
    const results = [];
    checkHashEntry(results, dir, 'T', 'meta.html', sha256Hex(lf));
    checkHashEntry(results, dir, 'T', 'bin.png', sha256Hex(Buffer.from([1, 2, 3, 4])), { sizeBytes: 4 });
    checkHashEntry(results, dir, 'T', 'bin.png', sha256Hex(Buffer.from([9])), { sizeBytes: 4 });
    checkHashEntry(results, dir, 'T', 'bin.png', sha256Hex(Buffer.from([1, 2, 3, 4])), { sizeBytes: 5 });
    checkHashEntry(results, dir, 'T', 'lfs.png', 'f'.repeat(64));
    checkHashEntry(results, dir, 'T', 'gone.png', 'f'.repeat(64));
    assert.deepEqual(results.map((r) => r.severity), ['ok', 'ok', 'error', 'error', 'error', 'error']);
    assert.match(results[0].message, /CRLF->LF/);
    assert.match(results[4].hint, /git lfs pull/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checkRequiredFile: LFS pointer gives a git lfs pull hint; missing file is an error (never silent)', () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, 'dtm_subset.f32'), LFS_POINTER);
    const results = [];
    checkRequiredFile(results, dir, 'DTM', 'dtm_subset.f32', { expectedBytes: 7609040 });
    checkRequiredFile(results, dir, 'DTM', 'dtm_subset.json');
    assert.equal(results[0].severity, 'error');
    assert.match(results[0].message, /LFS/);
    assert.match(results[0].hint, /git lfs pull/);
    assert.equal(results[1].severity, 'error');
    assert.match(results[1].message, /dosya yok/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runPreflight on an empty directory reports errors for every data group and exits non-zero in the CLI', () => {
  const dir = tempDir();
  try {
    const report = runPreflight({ root: dir });
    assert.ok(report.errors >= 8, `expected many errors, got ${report.errors}`);
    const groups = new Set(report.results.filter((item) => item.severity === 'error').map((item) => item.group));
    for (const group of ['DTM', 'Ortho', 'Mars Trek', 'Viking MDIM', 'MOLA bolgesel', 'Jeoloji', 'Perseverance ham']) {
      assert.ok(groups.has(group), `missing group error: ${group}`);
    }
    assert.match(formatReport(report), /HAZIR DEGIL/);
    const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'preflight.mjs');
    const child = spawnSync(process.execPath, [scriptPath, '--root', dir], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.match(child.stdout, /HAZIR DEGIL/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runPreflight flags an old Node version as an error', () => {
  const dir = tempDir();
  try {
    const report = runPreflight({ root: dir, nodeVersion: '18.0.0' });
    assert.equal(report.results[0].group, 'Node');
    assert.equal(report.results[0].severity, 'error');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('summarizeTestOutput parses node --test summary lines', () => {
  const text = '# tests 429\n# suites 0\n# pass 428\n# fail 1\n# cancelled 0\n# skipped 0\n';
  assert.deepEqual(summarizeTestOutput(text), { tests: 429, pass: 428, fail: 1, cancelled: 0, skipped: 0 });
  assert.equal(summarizeTestOutput('nothing').tests, null);
});
