import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSnapshot } from './snapshot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { catalogue, archives } = await readSnapshot(root);
console.log(
  `Valid public snapshot: ${catalogue.legislation.length} acts, ${archives.size} preserved language texts.`
);
