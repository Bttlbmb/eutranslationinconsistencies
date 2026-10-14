import { copyFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSnapshot } from './snapshot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
// Verify once, then package those exact bytes. An export arriving after validation
// cannot replace the catalogue or texts used by this build.
const { catalogueBytes, archives } = await readSnapshot(root);
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'data'), { recursive: true });
for (const file of [
  'index.html',
  'reader.html',
  'site-header.css',
  'catalogue.css',
  'catalogue.js',
  'catalogue-model.js',
  'styles.css',
  'app.js',
  'model.js',
  'view.js',
  'favicon.svg',
  'robots.txt'
]) {
  await copyFile(resolve(root, file), resolve(output, file));
}
await writeFile(resolve(output, 'data/catalogue.json'), catalogueBytes);
for (const [archive, bytes] of archives) {
  const target = resolve(output, archive);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
console.log(`Built static reader in dist/ (${archives.size} source text files).`);
