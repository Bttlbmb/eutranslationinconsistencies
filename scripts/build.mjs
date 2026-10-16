/** Package verified bytes in staging; retain the previous build on failure. */
import { copyFile, mkdir, writeFile, rm, mkdtemp, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSnapshot } from './snapshot.mjs';

export const assets = [
  'index.html', 'reader.html', 'experiments.html', 'experiments.css',
  'site-header.css', 'catalogue.css', 'catalogue.js', 'catalogue-model.js',
  'styles.css', 'app.js', 'model.js', 'explanation-glosses.js', 'view.js',
  'favicon.svg', 'robots.txt'
];

export async function buildSite(root, { snapshotRoot = root, outputDir = resolve(root, 'dist') } = {}) {
  const { catalogueBytes, archives } = await readSnapshot(snapshotRoot);
  const work = await mkdtemp(resolve(root, '.build-'));
  const staged = resolve(work, 'site');
  const output = resolve(outputDir);
  const previous = resolve(work, 'previous');
  let moved = false;
  try {
    await mkdir(resolve(staged, 'data'), { recursive: true });
    for (const file of assets) {
      const target = resolve(staged, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(resolve(root, file), target);
    }
    await writeFile(resolve(staged, 'data/catalogue.json'), catalogueBytes);
    for (const [archive, bytes] of archives) {
      const target = resolve(staged, archive);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    try { await rename(output, previous); moved = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(staged, output); }
    catch (error) {
      if (moved) await rename(previous, output);
      throw error;
    }
    return archives.size;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`Built static reader in dist/ (${await buildSite(root)} source text files).`);
}
