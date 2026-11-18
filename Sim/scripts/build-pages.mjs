#!/usr/bin/env node
// Build a self-contained, subpath-safe static deployment bundle for Marswalk Sim.
// Usage: node scripts/build-pages.mjs
// Exports buildPages({ simRoot, outputRoot }) for programmatic use and tests.

import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MIN_DTM_BINARY_BYTES = 1_000_000;

export const REQUIRED_FILES = [
  'public/index.html',
  'SOURCES.md',
  'data/dtm_subset.f32',
  'data/dtm_subset.json',
  'data/legacy-hirise/dtm_subset.f32',
  'data/legacy-hirise/dtm_subset.json',
  'data/viking-mdim/manifest.json',
];

export const DTM_BINARY_FILES = [
  'data/dtm_subset.f32',
  'data/legacy-hirise/dtm_subset.f32',
];

const DEFAULT_SIM_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function assertRequiredInputs(simRoot) {
  for (const rel of REQUIRED_FILES) {
    const abs = path.join(simRoot, rel);
    let info;
    try {
      info = await stat(abs);
    } catch {
      throw new Error(`Missing required build input: ${rel} (expected at ${abs})`);
    }
    if (!info.isFile()) {
      throw new Error(`Required build input is not a regular file: ${rel}`);
    }
  }

  for (const rel of DTM_BINARY_FILES) {
    const abs = path.join(simRoot, rel);
    const info = await stat(abs);
    if (info.size <= MIN_DTM_BINARY_BYTES) {
      throw new Error(
        `DTM binary ${rel} is only ${info.size} bytes (must be > ${MIN_DTM_BINARY_BYTES}; possible Git LFS pointer). Run git lfs pull or regenerate data.`,
      );
    }
  }
}

async function copyDirectory(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir);
  let fileCount = 0;
  let totalBytes = 0;

  for (const name of entries) {
    const srcPath = path.join(srcDir, name);
    const dstPath = path.join(dstDir, name);
    const info = await stat(srcPath);
    if (info.isDirectory()) {
      const sub = await copyDirectory(srcPath, dstPath);
      fileCount += sub.fileCount;
      totalBytes += sub.totalBytes;
    } else if (info.isFile()) {
      await copyFile(srcPath, dstPath);
      fileCount += 1;
      totalBytes += info.size;
    }
  }

  return { fileCount, totalBytes };
}

/**
 * Assemble the static deployment directory (`dist/` by default).
 * Copies `public/` -> `<outputRoot>/`, `data/` -> `<outputRoot>/data/`,
 * `SOURCES.md` -> `<outputRoot>/SOURCES.md`, and creates `<outputRoot>/.nojekyll`.
 *
 * @param {{ simRoot?: string, outputRoot?: string }} [options]
 * @returns {Promise<{ outputRoot: string, fileCount: number, totalBytes: number }>}
 */
export async function buildPages({ simRoot, outputRoot } = {}) {
  const resolvedSimRoot = path.resolve(simRoot ?? DEFAULT_SIM_ROOT);
  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(resolvedSimRoot, 'dist'));

  const protectedDirs = new Set([
    resolvedSimRoot,
    path.join(resolvedSimRoot, 'public'),
    path.join(resolvedSimRoot, 'data'),
  ]);
  if (protectedDirs.has(resolvedOutputRoot)) {
    throw new Error(`Refusing to overwrite protected directory: ${resolvedOutputRoot}`);
  }

  await assertRequiredInputs(resolvedSimRoot);

  await rm(resolvedOutputRoot, { recursive: true, force: true });
  await mkdir(resolvedOutputRoot, { recursive: true });

  const publicStats = await copyDirectory(path.join(resolvedSimRoot, 'public'), resolvedOutputRoot);
  const dataStats = await copyDirectory(
    path.join(resolvedSimRoot, 'data'),
    path.join(resolvedOutputRoot, 'data'),
  );

  const sourcesSrc = path.join(resolvedSimRoot, 'SOURCES.md');
  const sourcesStat = await stat(sourcesSrc);
  await copyFile(sourcesSrc, path.join(resolvedOutputRoot, 'SOURCES.md'));

  await writeFile(path.join(resolvedOutputRoot, '.nojekyll'), '');

  const fileCount = publicStats.fileCount + dataStats.fileCount + 2; // +SOURCES.md + .nojekyll
  const totalBytes = publicStats.totalBytes + dataStats.totalBytes + sourcesStat.size;

  return {
    outputRoot: resolvedOutputRoot,
    fileCount,
    totalBytes,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await buildPages();
    const mb = (result.totalBytes / (1024 * 1024)).toFixed(2);
    console.log(
      `[build-pages] Built static bundle in ${result.outputRoot} (${result.fileCount} files, ${result.totalBytes} bytes / ${mb} MiB)`,
    );
  } catch (error) {
    console.error(`[build-pages] Build failed: ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}
