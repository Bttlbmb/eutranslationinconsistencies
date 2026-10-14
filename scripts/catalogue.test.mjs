import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actIntroduction, actSummary, catalogueSummary, orderedActs, readerHref, legacyReaderHref,
  impactDistribution
} from '../catalogue-model.js';

// Synthetic evidence is confined to tests and never enters the public catalogue.
const finding = (id, variants = [{ language: 'de', language_name: 'German' }]) => ({
  id, passage_id: 'p', english_quote: 'test quote', status: 'agent_reviewed',
  severity: 'substantial', variants
});
const act = {
  id: 'test-act', title: 'Official test title', short_title: 'Test act', status: 'partial',
  passages: [{ id: 'p', text: 'A test quote from a synthetic fixture.' }],
  findings: [finding('a'), finding('b')],
  languages: [{ code: 'en', name: 'English' }, { code: 'de', name: 'German' }],
  coverage: { reviewed_units: 7, total_units: 10, reviewed_languages: 1, total_languages: 2 }
};

test('front-page counts retain separate finding records at a shared English anchor', () => {
  const summary = actSummary({ ...act, findings: [
    finding('a', [
      { language: 'de', language_name: 'German' },
      { language: 'de', language_name: 'German' },
      { language: 'fr', language_name: 'French' }
    ]), finding('b'), { ...finding('draft'), status: 'candidate' }
  ] });
  assert.equal(summary.count, 2);
  assert.deepEqual(summary.severities, [{ level: 'substantial', count: 2 }]);
  assert.deepEqual(summary.languages.map(({ code, count }) => ({ code, count })), [
    { code: 'de', count: 2 }, { code: 'fr', count: 1 }
  ]);
});

test('impact totals count confirmed and model-reviewed issues separately from finding records', () => {
  const family = {
    id: 'issue', title: 'Test issue', effect: 'Synthetic possible effect',
    review_state: 'confirmed', impact_level: 'high', finding_ids: ['a', 'b']
  };
  const summary = actSummary({ ...act, findings: [...act.findings, finding('c')],
    impact_families: [family, { ...family, id: 'provisional', finding_ids: ['c'], review_state: 'provisional' }]
  });
  assert.equal(summary.impactCount, 2);
  assert.deepEqual(summary.impact, { high: 2, moderate: 0, limited: 0 });
  assert.equal(summary.assessedCount, 3);
  assert.equal(summary.unassessedCount, 0);
  assert.equal(summary.fullyReviewed, false);
});

test('missing impact assessments remain unpublished rather than limited-impact findings', () => {
  const summary = actSummary(act);
  assert.equal(summary.impactCount, 0);
  assert.equal(summary.impact.limited, 0);
  assert.equal(summary.unassessedCount, 2);
});

test('impact shares count original records across issues, including unassessed records', () => {
  const family = (id, level, ids) => ({ id, title: 'Synthetic issue', effect: 'Synthetic effect',
    review_state: 'confirmed', impact_level: level, finding_ids: ids });
  const data = { ...act,
    findings: ['a', 'b', 'c', 'd', 'e'].map(id => finding(id)),
    impact_families: [family('high', 'high', ['a', 'b']), family('moderate', 'moderate', ['c']),
      family('limited', 'limited', ['d']), { ...family('draft', null, ['e']), review_state: 'needs_review' }]
  };
  assert.deepEqual(impactDistribution(data).map(({ level, count, share }) => ({ level, count, share })), [
    { level: 'high', count: 2, share: .4 }, { level: 'moderate', count: 1, share: .2 },
    { level: 'limited', count: 1, share: .2 }, { level: 'unrated', count: 1, share: .2 }
  ]);
  assert.equal(impactDistribution(data).reduce((sum, segment) => sum + segment.count, 0), 5);
  assert.deepEqual(impactDistribution(data).map(({ label }) => label), [
    'High potential impact', 'Moderate', 'Limited', 'No impact rating yet'
  ]);
});

test('absent ratings fill the unrated share, while an empty act has no shares', () => {
  assert.equal(impactDistribution(act).find(segment => segment.level === 'unrated').share, 1);
  assert.equal(impactDistribution(act).find(segment => segment.level === 'limited').count, 0);
  assert.ok(impactDistribution({ ...act, findings: [] }).every(segment => segment.share === 0));
});

test('overlapping invalid issue assignments cannot double count or choose a rating', () => {
  const family = { title: 'Synthetic issue', effect: 'Synthetic effect', review_state: 'confirmed', finding_ids: ['a'] };
  const data = { ...act, impact_families: [
    { ...family, id: 'one', impact_level: 'high' }, { ...family, id: 'two', impact_level: 'limited' }
  ] };
  assert.equal(impactDistribution(data).find(segment => segment.level === 'unrated').count, 2);
  assert.equal(actSummary(data).assessedCount, 0);
});

test('unfinished and interrupted review states remain explicit with zero findings', () => {
  for (const [status, label] of [
    ['imported', 'Sources available'], ['analyzing', 'Review ongoing'],
    ['partial', 'Partially reviewed'], ['failed', 'Review interrupted']
  ]) {
    const summary = actSummary({ ...act, status, findings: [] });
    assert.equal(summary.count, 0);
    assert.equal(summary.reviewLabel, label);
    assert.equal(summary.fullyReviewed, false);
  }
});

test('complete review requires reconciled coverage and intact source expressions', () => {
  const complete = { ...act, status: 'complete', findings: [],
    coverage: { reviewed_units: 10, total_units: 10, reviewed_languages: 2, total_languages: 2 }
  };
  assert.equal(actSummary(complete).reviewLabel, 'Review complete');
  assert.equal(actSummary({ ...complete, coverage: act.coverage }).fullyReviewed, false);
  assert.equal(actSummary({ ...complete, coverage: {} }).fullyReviewed, false);
  assert.equal(actSummary({ ...complete, failed_languages: [{ code: 'fr' }] }).fullyReviewed, false);
  assert.equal(actSummary({ ...complete, languages: [{ code: 'de', coverage_incomplete: true }] }).fullyReviewed, false);
});

test('rounding cannot label unfinished comparison coverage as 100 percent', () => {
  assert.equal(actSummary({ ...act, coverage: { ...act.coverage, reviewed_units: 19999, total_units: 20000 } }).percentage, 99.9);
  assert.equal(actSummary({ ...act, coverage: { ...act.coverage, reviewed_units: 0, total_units: 0 } }).percentage, null);
});

test('catalogue totals include all acts and only reconciled complete reviews', () => {
  const pending = { ...act, id: 'pending', status: 'imported', findings: [] };
  assert.deepEqual(catalogueSummary([act, pending]), { acts: 2, findings: 2, complete: 0, impact: 0 });
  assert.deepEqual(catalogueSummary([]), { acts: 0, findings: 0, complete: 0, impact: 0 });
});

test('catalogue ordering preserves every new act and does not mutate the snapshot', () => {
  const pending = { ...act, id: 'pending', status: 'imported', findings: [] };
  const complete = { ...act, id: 'complete', status: 'complete',
    coverage: { reviewed_units: 10, total_units: 10, reviewed_languages: 2, total_languages: 2 }
  };
  const acts = [pending, act, complete];
  assert.deepEqual(orderedActs(acts).map(item => item.id), ['complete', 'test-act', 'pending']);
  assert.deepEqual(acts.map(item => item.id), ['pending', 'test-act', 'complete']);
});

test('unrecognized legislation uses exported descriptions and titles', () => {
  assert.deepEqual(actIntroduction({ ...act, subject: 'Exported subject' }), {
    title: 'Test act', description: 'Exported subject', reference: 'Test act'
  });
  assert.equal(actIntroduction({ ...act, short_title: undefined }).description, '');
  assert.equal(actIntroduction({ ...act, id: '32009L0024' }).reference, 'Directive 2009/24');
});

test('reader links encode act IDs and preserve the language focus', () => {
  assert.equal(readerHref({ id: 'test act&1' }, 'de'), './reader.html#act=test+act%261&lang=de');
  assert.equal(readerHref(act, null, 'unrated'), './reader.html#act=test-act&impact=unrated');
});

test('legacy root links preserve the entire selection and query without treating page anchors as reader links', () => {
  const hash = '#act=test-act&finding=old-alias&lang=de&view=impact&issue=test-issue';
  assert.equal(legacyReaderHref(hash, '?preview=1'), `./reader.html?preview=1${hash}`);
  assert.equal(legacyReaderHref('#finding=old-alias'), './reader.html#finding=old-alias');
  assert.equal(legacyReaderHref('#impact=high'), './reader.html#impact=high');
  assert.equal(legacyReaderHref('#catalogue-list'), null);
  assert.equal(legacyReaderHref(''), null);
});
