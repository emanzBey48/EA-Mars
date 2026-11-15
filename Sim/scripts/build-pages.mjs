import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const simRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(simRoot, 'dist');

const requiredFiles = [
  'public/index.html',
  'data/dtm_subset.f32',
  'data/dtm_subset.json',
  'SOURCES.md',
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(simRoot, relativePath);
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Required deployment input is missing: ${relativePath}`);
  }
}

const dtmStats = await fs.stat(path.join(simRoot, 'data/dtm_subset.f32'));
if (dtmStats.size < 1_000_000) {
  throw new Error('The active DTM file is too small; it may be a Git LFS pointer instead of raster data.');
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
await fs.cp(path.join(simRoot, 'public'), outputRoot, { recursive: true });
await fs.cp(path.join(simRoot, 'data'), path.join(outputRoot, 'data'), { recursive: true });
await fs.copyFile(path.join(simRoot, 'SOURCES.md'), path.join(outputRoot, 'SOURCES.md'));

const outputFiles = await countFiles(outputRoot);
console.log(`Cloudflare Pages package ready: ${outputRoot} (${outputFiles} files)`);

async function countFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    count += entry.isDirectory() ? await countFiles(entryPath) : 1;
  }
  return count;
}
