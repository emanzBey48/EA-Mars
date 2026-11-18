// Tests for subpath-safe relative asset paths and static Pages bundle generation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages, REQUIRED_FILES } from '../scripts/build-pages.mjs';

const SIM_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ROOT = path.join(SIM_ROOT, 'public');
const CHECKED_EXTENSIONS = new Set(['.html', '.js', '.css']);

async function collectWebFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectWebFiles(abs));
    } else if (entry.isFile() && CHECKED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(abs);
    }
  }
  return files;
}

test('Sim/public web files contain no root-relative /data/ or /SOURCES.md references', async () => {
  const files = await collectWebFiles(PUBLIC_ROOT);
  assert.ok(files.length > 0, 'expected files under Sim/public');

  const forbidden = [
    "'/data/",
    '"/data/',
    '`/data/',
    'href="/SOURCES.md"',
    "href='/SOURCES.md'",
    "'/SOURCES.md'",
    '"/SOURCES.md"',
    '`/SOURCES.md`',
  ];

  const violations = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const token of forbidden) {
      if (content.includes(token)) {
        violations.push(`${path.relative(SIM_ROOT, file)} contains ${token}`);
      }
    }
  }

  assert.deepEqual(violations, [], `Found root-relative asset references:\n${violations.join('\n')}`);
});

test('buildPages assembles a complete subpath-safe static bundle with matching file sizes', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'marswalk-build-pages-'));
  try {
    const result = await buildPages({ simRoot: SIM_ROOT, outputRoot: tmpDir });
    assert.equal(result.outputRoot, path.resolve(tmpDir));
    assert.ok(result.fileCount > 10, `expected many output files, got ${result.fileCount}`);
    assert.ok(result.totalBytes > 1_000_000, `expected > 1 MB output, got ${result.totalBytes}`);

    const nojekyllStat = await stat(path.join(tmpDir, '.nojekyll'));
    assert.equal(nojekyllStat.isFile(), true);
    assert.equal(nojekyllStat.size, 0);

    const pairedFiles = [
      ['public/index.html', 'index.html'],
      ['SOURCES.md', 'SOURCES.md'],
      ['data/legacy-hirise/dtm_subset.f32', 'data/legacy-hirise/dtm_subset.f32'],
      ['data/dtm_subset.f32', 'data/dtm_subset.f32'],
      ['data/viking-mdim/manifest.json', 'data/viking-mdim/manifest.json'],
    ];

    for (const [srcRel, outRel] of pairedFiles) {
      const srcStat = await stat(path.join(SIM_ROOT, srcRel));
      const outStat = await stat(path.join(tmpDir, outRel));
      assert.equal(outStat.isFile(), true, `missing ${outRel} in output`);
      assert.equal(outStat.size, srcStat.size, `size mismatch for ${outRel}`);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('buildPages rejects missing inputs and undersized (LFS-pointer) DTM binaries', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'marswalk-build-validate-'));
  const simDir = path.join(tmpRoot, 'sim');
  const outDir = path.join(tmpRoot, 'dist');
  try {
    await mkdir(simDir, { recursive: true });
    await assert.rejects(
      () => buildPages({ simRoot: simDir, outputRoot: outDir }),
      /Missing required build input/,
    );

    for (const rel of REQUIRED_FILES) {
      const abs = path.join(simDir, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, 'version https://git-lfs.github.com/spec/v1\noid sha256:0000\nsize 123\n');
    }

    await assert.rejects(
      () => buildPages({ simRoot: simDir, outputRoot: outDir }),
      /possible Git LFS pointer/,
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
