import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateSnapshot } from '../scripts/snapshot.mjs';

// Artificial strings stay inside this boundary test and never enter public data.
function sourceCase() {
  const files = new Map();
  function record(id, text, source_url) {
    const text_url = `texts/test/version/${id}.txt`;
    const bytes = Buffer.from(text);
    files.set(`./data/${text_url}`, bytes);
    return { text_url, source_url, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const en = { code: 'en', name: 'English', ...record('en', 'A condition applies.', 'https://eur-lex.europa.eu/test/en') };
  const current = { code: 'fr', name: 'French', ...record('fr', 'Une règle actuelle.', 'https://eur-lex.europa.eu/test/fr-current') };
  const context = { id: 'original', label: 'Original preamble', celex: '32022R2065', version: '2022-10-19',
    retrieved_at: '2026-10-16T00:00:00Z', ...record('fr-original', 'Une condition antérieure.', 'https://eur-lex.europa.eu/test/fr-original') };
  current.source_documents = [context];
  const variant = { language: 'fr', quote: 'Une condition antérieure.', translation: 'An earlier condition.',
    explanation: 'A hypothetical difference in a test.', source_url: context.source_url };
  const act = { id: 'test', title: 'Test', status: 'complete', source_url: en.source_url,
    languages: [en, current], unavailable_languages: [], failed_languages: [], notes: [],
    passages: [{ id: 'p1', label: 'Test provision', text: 'A condition applies.' }],
    coverage: { total_units: 1, reviewed_units: 1, total_languages: 2, reviewed_languages: 2 },
    findings: [{ id: 'f1', passage_id: 'p1', english_quote: 'A condition applies.', title: 'Test difference',
      category: 'condition', severity: 'substantial', status: 'agent_reviewed', explanation: 'Test explanation.',
      variants: [variant], review: { method: 'Test', models: ['test'], reviewed_at: '2026-10-16T00:00:00Z' } }] };
  return { catalogue: { schema_version: 2, legislation: [act] }, files, current, context, variant };
}

test('official context documents are checked, packaged and bound to their quotation URLs', async () => {
  const { catalogue, files, current, context, variant } = sourceCase();
  const archives = await validateSnapshot(catalogue, url => files.get(url));
  assert.equal(archives.size, 3);
  variant.source_url = current.source_url;
  await assert.rejects(validateSnapshot(catalogue, url => files.get(url)), /cited official source document/);
  variant.source_url = context.source_url;
  context.sha256 = '0'.repeat(64);
  await assert.rejects(validateSnapshot(catalogue, url => files.get(url)), /checksum mismatch/);
});

test('source documents reject private fields and unsafe archive paths', async () => {
  for (const change of [{ prompt: 'private' }, { text_url: '../private.txt' }, { id: undefined }]) {
    const { catalogue, files, context } = sourceCase();
    Object.assign(context, change);
    await assert.rejects(validateSnapshot(catalogue, url => files.get(url)));
  }
});
