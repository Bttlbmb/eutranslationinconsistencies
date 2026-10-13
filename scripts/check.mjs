import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogueLegislation, publicFindings, officialURL, archiveURL} from '../model.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(await readFile(resolve(root, 'data/catalogue.json'), 'utf8'));
const acts = catalogueLegislation(catalogue);
if (acts.length !== catalogue.legislation.length) throw new Error('Every exported act needs an id and title.');
const ids = new Set();
let archiveCount = 0;
for (const act of acts) {
  if (ids.has(act.id)) throw new Error(`Duplicate legislation id: ${act.id}`);
  ids.add(act.id);
  if (!Array.isArray(act.passages) || !Array.isArray(act.languages) || !Array.isArray(act.findings)) throw new Error(`Missing arrays for ${act.id}`);
  if (!officialURL(act.source_url)) throw new Error(`Expected official EU source for ${act.id}`);
  const passageIds = new Set();
  for (const passage of act.passages) {
    if (typeof passage.id !== 'string' || typeof passage.text !== 'string' || passageIds.has(passage.id)) throw new Error(`Invalid or duplicate passage for ${act.id}`);
    passageIds.add(passage.id);
  }
  const supported = publicFindings(act);
  if (supported.length !== act.findings.length) throw new Error(`Unreviewed or unmatched finding in ${act.id}`);
  const findingIds = new Set();
  for (const finding of supported) {
    if (findingIds.has(finding.id)) throw new Error(`Duplicate finding id in ${act.id}`);
    findingIds.add(finding.id);
    for (const variant of finding.variants) {
      if (![variant.language, variant.quote, variant.translation, variant.explanation].every(value => typeof value === 'string' && value.trim())) throw new Error(`Incomplete variant in ${finding.id}`);
      if (!officialURL(variant.source_url)) throw new Error(`Nonofficial variant source in ${finding.id}`);
    }
  }
  const languageTexts = new Map();
  for (const language of act.languages) {
    if (!officialURL(language.source_url)) throw new Error(`Nonofficial language source in ${act.id}`);
    const url = archiveURL(language.text_url);
    if (!url) throw new Error(`Unsafe text archive path for ${act.id}`);
    const info = await stat(resolve(root, url));
    if (!info.isFile()) throw new Error(`Missing text archive for ${act.id}`);
    const bytes = await readFile(resolve(root, url));
    if (createHash('sha256').update(bytes).digest('hex') !== language.sha256) throw new Error(`Text archive checksum mismatch for ${act.id}/${language.code}`);
    languageTexts.set(language.code, bytes.toString('utf8'));
    archiveCount++;
  }
  for (const finding of supported) {
    for (const variant of finding.variants) {
      if (!languageTexts.get(variant.language)?.includes(variant.quote)) throw new Error(`Original-language quote does not match preserved evidence for ${finding.id}`);
    }
  }
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
if (!html.includes('noindex')) throw new Error('No-index metadata is required.');
console.log(`Valid public snapshot: ${acts.length} acts, ${archiveCount} preserved language texts.`);
