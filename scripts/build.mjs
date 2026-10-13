import {copyFile, mkdir, readFile, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {archiveURL} from '../model.js';
import './check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
await rm(output, {recursive: true, force: true});
await mkdir(resolve(output, 'data'), {recursive: true});
for (const file of ['index.html', 'styles.css', 'app.js', 'model.js', 'favicon.svg', 'robots.txt', 'data/catalogue.json']) {
  await copyFile(resolve(root, file), resolve(output, file));
}
const catalogue = JSON.parse(await readFile(resolve(root, 'data/catalogue.json'), 'utf8'));
const archives = new Set(catalogue.legislation.flatMap(act => act.languages.map(language => archiveURL(language.text_url))));
for (const archive of archives) {
  const target = resolve(output, archive);
  await mkdir(dirname(target), {recursive: true});
  await copyFile(resolve(root, archive), target);
}
console.log(`Built static reader in dist/ (${archives.size} source text files).`);
