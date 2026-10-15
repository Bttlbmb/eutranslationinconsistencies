import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actIntroduction, actSummary, catalogueSummary, orderedActs, readerHref, legacyReaderHref,
  impactDistribution, overallLanguageSummary
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
    review_state: 'confirmed', rubric_version: 'conditional-binary-impact-1', impact_level: 'major', finding_ids: ['a', 'b']
  };
  const summary = actSummary({ ...act, findings: [...act.findings, finding('c')],
    impact_families: [family, { ...family, id: 'provisional', finding_ids: ['c'], review_state: 'provisional' }]
  });
  assert.equal(summary.impactCount, 2);
  assert.deepEqual(summary.impact, { major: 2, limited: 0 });
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

test('complete assessment coverage includes unranked decisions and grouped finding records', () => {
  const summary = actSummary({ ...act, findings: [...act.findings, finding('c')], impact_families: [
    { id: 'rated', title: 'Synthetic issue', effect: 'Synthetic effect',
      review_state: 'provisional', rubric_version: 'conditional-binary-impact-1', impact_level: 'major', finding_ids: ['a', 'b'] },
    { id: 'unranked', title: 'Synthetic issue', effect: 'Unresolved synthetic effect',
      review_state: 'needs_review', rubric_version: 'conditional-binary-impact-1', impact_level: null, finding_ids: ['c'] }
  ] });
  assert.deepEqual(summary.impactAssessment, {
    count: 3, total: 3, state: 'complete', label: 'Impact assessed'
  });
  assert.equal(summary.assessedCount, 2);
  assert.equal(summary.unassessedCount, 1);
  assert.equal(summary.reviewingCount, 1);
  assert.equal(summary.fullyReviewed, false);
});

test('assessment badges retain partial and pending coverage when finding records are missing', () => {
  assert.deepEqual(actSummary(act).impactAssessment, {
    count: 0, total: 2, state: 'pending', label: 'Impact pending'
  });
  const family = { id: 'issue', title: 'Synthetic issue', effect: 'Synthetic effect',
    review_state: 'needs_review', rubric_version: 'conditional-binary-impact-1', impact_level: null, finding_ids: ['a'] };
  assert.deepEqual(actSummary({ ...act, impact_families: [family] }).impactAssessment, {
    count: 1, total: 2, state: 'partial', label: 'Impact partial'
  });
});

test('empty findings never imply completed assessment work', () => {
  assert.deepEqual(actSummary({ ...act, findings: [] }).impactAssessment, {
    count: 0, total: 0, state: 'pending', label: 'Impact pending'
  });
  const complete = { ...act, findings: [], status: 'complete',
    coverage: { reviewed_units: 10, total_units: 10, reviewed_languages: 2, total_languages: 2 } };
  assert.deepEqual(actSummary(complete).impactAssessment, {
    count: 0, total: 0, state: 'not-needed', label: 'No findings to assess'
  });
});

test('ambiguous assessment membership cannot claim complete coverage', () => {
  const family = { title: 'Synthetic issue', effect: 'Synthetic effect',
    review_state: 'confirmed', rubric_version: 'conditional-binary-impact-1', impact_level: 'major', finding_ids: ['a', 'b'] };
  assert.deepEqual(actSummary({ ...act, impact_families: [
    { ...family, id: 'one' }, { ...family, id: 'two', finding_ids: ['a'] }
  ] }).impactAssessment, { count: 1, total: 2, state: 'partial', label: 'Impact partial' });
});

test('impact shares count original records across issues, including unassessed records', () => {
  const family = (id, level, ids) => ({ id, title: 'Synthetic issue', effect: 'Synthetic effect',
    review_state: 'confirmed', rubric_version: 'conditional-binary-impact-1', impact_level: level, finding_ids: ids });
  const data = { ...act,
    findings: ['a', 'b', 'c', 'd', 'e'].map(id => finding(id)),
    impact_families: [family('major', 'major', ['a', 'b']), family('limited-c', 'limited', ['c']),
      family('limited', 'limited', ['d']), { ...family('draft', null, ['e']), review_state: 'needs_review' }]
  };
  assert.deepEqual(impactDistribution(data).map(({ level, count, share }) => ({ level, count, share })), [
    { level: 'major', count: 2, share: .4 }, { level: 'limited', count: 2, share: .4 }, { level: 'unrated', count: 1, share: .2 }
  ]);
  assert.equal(impactDistribution(data).reduce((sum, segment) => sum + segment.count, 0), 5);
  assert.deepEqual(impactDistribution(data).map(({ label }) => label), [
    'Major', 'Limited', 'No impact rating yet'
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
    { ...family, id: 'one', rubric_version: 'conditional-binary-impact-1', impact_level: 'major' }, { ...family, id: 'two', rubric_version: 'conditional-binary-impact-1', impact_level: 'limited' }
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

const completeAct = (id, codes, findings = []) => ({
  ...act, id, status: 'complete', findings,
  languages: [{ code: 'en', name: 'English' }, ...codes.map(code => ({ code,
    name: { de: 'German', fr: 'French', es: 'Spanish' }[code] }))],
  coverage: { reviewed_units: codes.length, total_units: codes.length,
    reviewed_languages: codes.length + 1, total_languages: codes.length + 1,
    reviewed_language_codes: codes }
});

test('overall counts retain zero findings and exclude unfinished reviews and repeated variant labels', () => {
  const first = completeAct('one', ['de', 'fr', 'es'], [finding('a', [
    { language: 'de', language_name: 'German' }, { language: 'de', language_name: 'German' },
    { language: 'fr', language_name: 'French' }
  ])]);
  const second = completeAct('two', ['de', 'fr', 'es'], [finding('b'), finding('c')]);
  const incomplete = { ...first, id: 'unfinished', coverage: act.coverage,
    findings: [finding('d', [{ language: 'es', language_name: 'Spanish' }])] };
  const summary = overallLanguageSummary([first, second, incomplete]);
  assert.equal(summary.completedActs, 2);
  assert.equal(summary.excludedActs, 1);
  assert.deepEqual(summary.languages, [
    { code: 'de', name: 'German', count: 3 }, { code: 'fr', name: 'French', count: 1 },
    { code: 'es', name: 'Spanish', count: 0 }
  ]);
  assert.deepEqual(summary.most.map(language => language.code), ['de']);
  assert.deepEqual(summary.fewest.map(language => language.code), ['es']);
});

test('overall extremes keep every tie and restrict languages to the same completed corpus', () => {
  const first = completeAct('one', ['de', 'fr', 'es'], [finding('a', [
    { language: 'de', language_name: 'German' }, { language: 'fr', language_name: 'French' }
  ])]);
  const second = completeAct('two', ['de', 'fr']);
  const summary = overallLanguageSummary([first, second]);
  assert.deepEqual(summary.languages.map(language => language.code), ['fr', 'de']);
  assert.equal(summary.most.length, 2);
  assert.equal(summary.fewest.length, 2);
  assert.ok(summary.most.every(language => language.count === 1));
  assert.deepEqual(first.languages.map(language => language.code), ['en', 'de', 'fr', 'es']);
});

test('overall summary never infers language ranks from incomplete or absent review coverage', () => {
  for (const acts of [[], [act], [{ ...act, status: 'complete', coverage: {} }]]) {
    const summary = overallLanguageSummary(acts);
    assert.equal(summary.completedActs, 0);
    assert.deepEqual(summary.languages, []);
    assert.deepEqual(summary.most, []);
    assert.deepEqual(summary.fewest, []);
  }
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
    title: 'Test act', description: 'Exported subject', reference: 'Test act', label: 'Test act'
  });
  assert.equal(actIntroduction({ ...act, short_title: undefined }).description, '');
  assert.equal(actIntroduction({ ...act, id: '32009L0024' }).reference, 'Directive 2009/24');
});

test('display citations retain official suffixes and older regulation numbering', () => {
  const directive = actIntroduction({ ...act, id: '32009L0024', short_title: 'Directive 24/2009',
    title: 'DIRECTIVE 2009/24/EC OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 23 April 2009 on the legal protection of computer programs' });
  assert.equal(directive.reference, 'Directive 2009/24/EC');
  assert.equal(directive.label, 'Directive 2009/24/EC — Computer programs');
  const regulation = actIntroduction({ ...act, id: '32012R0432',
    title: 'COMMISSION REGULATION (EU) No 432/2012 of 16 May 2012 establishing a list of permitted health claims made on foods' });
  assert.equal(regulation.reference, 'Regulation (EU) No 432/2012');
  assert.equal(regulation.label, 'Regulation (EU) No 432/2012 — Food health claims');
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
