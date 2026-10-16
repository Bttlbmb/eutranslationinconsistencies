import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { explanationSegments as renderExplanation, groupedFindings } from '../model.js';
import { explanationGlosses } from '../explanation-glosses.js';
import { explanationGlosses as historicalGlosses } from './fixtures/historical-glosses.js';
const explanationSegments = (text, context) => renderExplanation(text, context, historicalGlosses);

const context = {
  act: '32009L0024', finding: 'd0aab9e64bbb0c4fc723f0c5', language: 'ro',
  quote: 'fără a aduce atingere contractelor încheiate și drepturilor dobândite înainte de această dată.',
  translation: 'without prejudice to contracts concluded and rights acquired before that date.'
};
const glosses = segments => segments.filter(segment => segment.gloss).map(segment => segment.text);

test('the inline gloss follows the foreign quotation and preserves every explanation character', () => {
  const explanation = 'Romanian preserves “contractelor încheiate”, while English preserves “any acts concluded”.';
  const segments = explanationSegments(explanation, context);
  assert.equal(segments.map(segment => segment.text).join(''),
    'Romanian preserves “contractelor încheiate” (“contracts concluded”), while English preserves “any acts concluded”.');
  assert.equal(segments.filter(segment => !segment.gloss).map(segment => segment.text).join(''), explanation);
});

test('source quotes in each supported quotation style receive one gloss at the first mention', () => {
  for (const [open, close] of [['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"], ['«', '»'], ['„', '“']]) {
    const quoted = `${open}contractelor încheiate${close}`;
    assert.deepEqual(glosses(explanationSegments(`${quoted}, then ${quoted}.`, context)), [' (“contracts concluded”)']);
  }
});

test('an existing parenthetical or inline English meaning is not repeated', () => {
  for (const explanation of [
    '“contractelor încheiate” (“contracts concluded”) is narrower.',
    '“contractelor încheiate”, meaning contracts concluded, is narrower.',
    '“contractelor încheiate”, which means contracts concluded, is narrower.'
  ]) assert.deepEqual(glosses(explanationSegments(explanation, context)), []);
});

test('unmatched or changed evidence never receives a guessed translation', () => {
  const explanation = '“contractelor încheiate” remains quoted.';
  for (const changes of [
    { act: 'another-act' }, { finding: 'another-finding' }, { language: 'fr' },
    { quote: 'Other source wording.' }, { translation: 'Other translated wording.' }
  ]) assert.deepEqual(explanationSegments(explanation, { ...context, ...changes }), [
    { text: explanation, gloss: false }
  ]);
  assert.deepEqual(explanationSegments('Unmapped “other words” <img src=x onerror=alert(1)>.', context), [
    { text: 'Unmapped “other words” <img src=x onerror=alert(1)>.', gloss: false }
  ]);
});

test('every current phrase alignment is supported by the displayed source and ordered English excerpts', async () => {
  const catalogue = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
  for (const entry of explanationGlosses) {
    const act = catalogue.legislation.find(act => act.id === entry.act);
    const finding = act?.findings.find(finding => finding.id === entry.finding);
    assert.ok(finding, 'Move stale alignments out of the production bundle: ' + entry.finding);
    const variant = finding.variants.find(variant => variant.language === entry.language);
    assert.ok(variant, entry.finding);
    const segments = renderExplanation(`“${entry.phrase}”`, {
      act: entry.act, finding: entry.finding, ...variant
    });
    assert.deepEqual(glosses(segments), [` (“${entry.english.join(' … ')}”)`], entry.phrase);
    assert.ok((variant.explanation || finding.explanation).includes(entry.phrase));
  }
});

test('grouped comparisons apply glosses using each original language finding ID', () => {
  // This pure grouping rule must survive a catalogue reset that archives the
  // older finding. The preserved quotation is confined to this test fixture.
  const english = 'without prejudice to any acts concluded and rights acquired before that date.';
  const finding = (id, variant) => ({
    id, passage_id: 'p', english_quote: english, title: 'Test comparison',
    status: 'agent_reviewed', severity: 'substantial', variants: [variant]
  });
  const act = {
    id: context.act, passages: [{ id: 'p', text: english }],
    findings: [
      finding('separate-case', { language: 'fr', quote: 'Test source', translation: 'Test translation' }),
      finding(context.finding, { ...context, explanation: 'Romanian preserves “contractelor încheiate”.' })
    ]
  };
  const group = groupedFindings(act).find(group => group.aliases.includes(context.finding));
  const variant = group.variants.find(variant => variant.finding_id === context.finding);
  assert.ok(glosses(explanationSegments(variant.explanation, {
    act: act.id, finding: variant.finding_id, ...variant
  })).includes(' (“contracts concluded”)'));
});
