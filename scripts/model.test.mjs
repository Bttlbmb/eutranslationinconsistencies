import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogueLegislation,
  publicFindings,
  substantialLanguageIndex,
  focusLanguageIndex,
  groupedFindings,
  focusedFindingTitle,
  findingCounts,
  comparedWording,
  impactDisplayLabel,
  impactFamilies,
  impactFocusedFindings,
  highlightedSegments,
  passageRows,
  sourceOccurrences,
  overlappingFindings,
  officialURL,
  archiveURL,
  selectedFromHash,
  selectionHash,
  completionMessage,
  sourceVersionInfo,
  targetReviewCoverage
} from '../model.js';

test('comparison counts distinguish quote groups from distinct focused records', () => {
  const groups = [{ id: 'a', aliases: ['a', 'b'], variants: [
    { language: 'de', finding_id: 'a' }, { language: 'de', finding_id: 'a' },
    { language: 'fr', finding_id: 'b' }
  ] }, { id: 'c', aliases: ['c'], variants: [{ language: 'fr', finding_id: 'c' }] }];
  assert.deepEqual(findingCounts(groups), { groups: 2, findings: 3 });
  assert.deepEqual(findingCounts(groups, 'de'), { groups: 1, findings: 1 });
  assert.deepEqual(findingCounts(groups, 'fr'), { groups: 2, findings: 2 });
  assert.deepEqual(findingCounts(groups, 'it'), { groups: 0, findings: 0 });
});

test('wording emphasis isolates substitutions without rewriting either quotation', () => {
  const english = '(polyols and/or intense sweeteners)';
  const translation = '(polyols and/or other sweeteners)';
  const result = comparedWording(english, translation);
  assert.equal(result.english.map(s => s.text).join(''), english);
  assert.equal(result.translation.map(s => s.text).join(''), translation);
  assert.equal(result.english.filter(s => s.changed).map(s => s.text).join(''), 'intense');
  assert.equal(result.translation.filter(s => s.changed).map(s => s.text).join(''), 'other');
});

test('wording comparison preserves unicode and spacing and handles omitted wording', () => {
  const english = 'A\n  calorie-reduced variant, “τόνικ”.';
  const translation = 'A\tvariant, “τόνικ”.';
  const result = comparedWording(english, translation);
  assert.equal(result.english.map(s => s.text).join(''), english);
  assert.equal(result.translation.map(s => s.text).join(''), translation);
  assert.equal(result.english.filter(s => s.changed).map(s => s.text).join(''), 'calorie-reduced');
  assert.ok(result.translation.every(s => !s.changed));
  assert.ok(comparedWording('A word', 'a  word').english.every(s => !s.changed));
  assert.deepEqual(comparedWording('', ''), { english: [], translation: [] });
});

test('long comparisons preserve exact text while bounding matching work', () => {
  const english = `Common start ${'long quote '.repeat(400)}end`;
  const translation = `Common start ${'different wording '.repeat(400)}end`;
  const result = comparedWording(english, translation);
  assert.equal(result.english.map(s => s.text).join(''), english);
  assert.equal(result.translation.map(s => s.text).join(''), translation);
  assert.ok(result.english.some(s => s.changed));
  assert.equal(result.english[0].changed, false);
  assert.equal(result.english.at(-1).changed, false);
});

test('impact labels keep the publication threshold separate from ratings', () => {
  assert.equal(impactDisplayLabel('high'), 'High potential impact');
  assert.equal(impactDisplayLabel('moderate'), 'Moderate');
  assert.equal(impactDisplayLabel('limited'), 'Limited');
  assert.equal(impactDisplayLabel('unrated'), 'No impact rating yet');
  assert.equal(impactDisplayLabel(null), 'Impact under review');
  assert.equal(impactDisplayLabel('substantial'), '');
});

// Artificial strings below are unit-test fixtures, never published source data.
const act = {
  id: 'test-act',
  title: 'Test act',
  status: 'partial',
  passages: [{ id: 'p1', text: 'alpha beta gamma delta' }],
  findings: [
    {
      id: 'test-finding',
      passage_id: 'p1',
      english_quote: 'beta gamma',
      status: 'agent_reviewed',
      variants: [{ language: 'fr' }]
    }
  ],
  coverage: { total_units: 12, reviewed_units: 3 }
};

test('share links include the selected finding even on an initial collection URL', () => {
  const finding = act.findings[0];
  const hash = selectionHash({ act, finding, language: null });
  assert.equal(selectedFromHash(hash, [act]).finding.id, finding.id);
  assert.equal(
    selectionHash({ act, finding, language: 'fr' }),
    'act=test-act&finding=test-finding&lang=fr'
  );
});

test('only supported reviewed findings become public highlights', () => {
  const draft = { ...act.findings[0], id: 'draft', status: 'candidate' };
  const missingQuote = { ...act.findings[0], id: 'unmatched', english_quote: 'not in source' };
  const emptyQuote = { ...act.findings[0], id: 'empty', english_quote: '' };
  assert.equal(
    publicFindings({ ...act, findings: [...act.findings, draft, missingQuote, emptyQuote] }).length,
    1
  );
});

test('language index counts substantial finding records without double-counting a language', () => {
  const first = {
    ...act.findings[0],
    severity: 'substantial',
    variants: [
      { language: 'nl', language_name: 'Dutch' },
      { language: 'nl', language_name: 'Dutch' },
      { language: 'de', language_name: 'German' }
    ]
  };
  const second = { ...first, id: 'second', variants: [{ language: 'nl', language_name: 'Dutch' }] };
  const unsupported = {
    ...first,
    id: 'draft',
    status: 'candidate',
    variants: [{ language: 'fr', language_name: 'French' }]
  };
  const lowerSeverity = {
    ...first,
    id: 'minor',
    severity: 'minor',
    variants: [{ language: 'it', language_name: 'Italian' }]
  };
  const document = { ...act, findings: [first, second, unsupported, lowerSeverity] };
  assert.deepEqual(substantialLanguageIndex(document), [
    { code: 'de', name: 'German', count: 1, findingIds: ['test-finding'] },
    { code: 'nl', name: 'Dutch', count: 2, findingIds: ['test-finding', 'second'] }
  ]);
  assert.equal(selectedFromHash('#act=test-act&lang=nl', [document]).language, 'nl');
  assert.equal(selectedFromHash('#act=test-act&lang=fr', [document]).language, null);
  assert.equal(
    selectedFromHash('#act=test-act&finding=test-finding&lang=de', [document]).language,
    'de'
  );
});

test('focus language links retain zero-finding and unavailable languages without a mismatched finding', () => {
  const document = {
    ...act,
    languages: [
      { code: 'en', name: 'English' },
      { code: 'de', name: 'German' },
      { code: 'fr', name: 'French' }
    ],
    unavailable_languages: [{ code: 'ga', name: 'Irish', reason: 'No expression for this version.' }],
    failed_languages: [{ code: 'es', name: 'Spanish', reason: 'Retrieval failed.' }],
    findings: [
      { ...act.findings[0], severity: 'substantial', variants: [{ language: 'de' }] }
    ]
  };
  assert.deepEqual(focusLanguageIndex(document).map(({ code, availability }) => [code, availability]), [
    ['fr', 'archived'],
    ['de', 'archived'],
    ['ga', 'unavailable'],
    ['es', 'failed']
  ]);
  assert.equal(selectionHash({ act: document, finding: null, language: 'fr' }), 'act=test-act&lang=fr');
  assert.deepEqual(selectedFromHash('#act=test-act&lang=fr', [document]).language, 'fr');
  assert.equal(selectedFromHash('#act=test-act&lang=ga', [document]).language, 'ga');
  assert.equal(selectedFromHash('#act=test-act&finding=test-finding&lang=fr', [document]).finding, null);
  assert.equal(selectedFromHash('#act=test-act&lang=en', [document]).language, null);
  assert.equal(selectedFromHash('#act=test-act&lang=xx', [document]).language, null);
});

test('focus language index distinguishes a completed zero-finding language in a partial act', () => {
  const document = {
    ...act,
    status: 'partial',
    coverage: { reviewed_language_codes: ['fr'] },
    languages: [
      { code: 'en', name: 'English' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' }
    ],
    findings: []
  };
  const states = Object.fromEntries(focusLanguageIndex(document)
    .map(({ code, reviewState }) => [code, reviewState]));
  assert.deepEqual(states, { fr: 'complete', de: 'incomplete' });
  document.status = 'imported';
  document.coverage.reviewed_language_codes = [];
  assert.equal(focusLanguageIndex(document).find(({ code }) => code === 'de').reviewState, 'pending');
});

test('overlapping highlights preserve every source character and both findings', () => {
  const findings = [...act.findings, { id: 'second', english_quote: 'gamma delta' }];
  const segments = highlightedSegments(act.passages[0].text, findings);
  assert.equal(segments.map((segment) => segment.text).join(''), act.passages[0].text);
  assert.deepEqual(segments.find((segment) => segment.text === 'gamma').ids, [
    'test-finding',
    'second'
  ]);
  assert.deepEqual(highlightedSegments('plain source', []), [{ text: 'plain source', ids: [] }]);
});

test('deep links select an act and only a published finding from that act', () => {
  assert.equal(
    selectedFromHash('#act=test-act&finding=test-finding', [act]).finding.id,
    'test-finding'
  );
  assert.equal(selectedFromHash('#act=test-act&finding=missing', [act]).finding, null);
  assert.equal(selectedFromHash('#act=missing', [act]).act.id, act.id);
  assert.equal(selectedFromHash('', []).act, null);
});

test('impact families stay distinct within a shared quote and can span two quote groups', () => {
  const findings = [
    { ...act.findings[0], id: 'da', variants: [{ language: 'da' }] },
    { ...act.findings[0], id: 'et', variants: [{ language: 'et' }] },
    { ...act.findings[0], id: 'sk', variants: [{ language: 'sk' }] },
    { ...act.findings[0], id: 'bg', english_quote: 'alpha beta', variants: [{ language: 'bg' }] },
    { ...act.findings[0], id: 'it', english_quote: 'gamma delta', variants: [{ language: 'it' }] }
  ];
  const family = (id, ids) => ({
    id,
    title: id,
    impact_level: 'moderate',
    review_state: 'confirmed',
    effect: 'Could change an applicable condition.',
    finding_ids: ids
  });
  const document = {
    ...act,
    findings,
    languages: ['da', 'et', 'sk', 'bg', 'it'].map((code) => ({ code, name: code.toUpperCase() })),
    impact_families: [
      family('malt', ['da']),
      family('extract', ['et']),
      family('ingredient', ['sk']),
      family('calories', ['bg', 'it'])
    ]
  };
  assert.equal(groupedFindings(document).length, 3);
  assert.deepEqual(groupedFindings(document)[0].aliases, ['da', 'et', 'sk']);
  assert.deepEqual(groupedFindings(document)[0].variants.map((variant) => variant.finding_id), ['da', 'et', 'sk']);
  assert.equal(impactFamilies(document).length, 4);
  assert.deepEqual(impactFamilies(document).find((item) => item.id === 'calories').languages, ['bg', 'it']);

  const selected = selectedFromHash('#act=test-act&finding=it&view=impact&issue=calories', [document]);
  assert.equal(selected.issue.id, 'calories');
  assert.equal(selected.issueFindingId, 'it');
  assert.equal(selected.finding.id, 'it');
  assert.equal(selectionHash(selected), 'act=test-act&finding=it&view=impact&issue=calories');
  const focused = selectedFromHash('#act=test-act&finding=it&lang=bg&view=impact&issue=calories', [document]);
  assert.equal(focused.issue.id, 'calories');
  assert.equal(focused.issueFindingId, 'bg');
  assert.equal(focused.finding.id, 'bg');
  assert.equal(selectedFromHash('#act=test-act&finding=da&view=impact&issue=ingredient', [document]).issueFindingId, 'sk');
  assert.equal(selectedFromHash('#act=test-act&view=impact&issue=missing', [document]).issue, null);
  assert.equal(selectedFromHash('#act=test-act&finding=da&view=impact&issue=missing', [document]).finding, null);
  assert.equal(selectedFromHash('#act=test-act&lang=da&view=impact&issue=calories', [document]).issue, null);
});

test('impact index includes model-reviewed and unranked proposals with valid references', () => {
  const family = {
    id: 'test', title: 'Test', effect: 'Could change reach.', impact_level: 'high',
    finding_ids: ['test-finding']
  };
  assert.equal(impactFamilies({ ...act, impact_families: [family] }).length, 0);
  assert.equal(impactFamilies({ ...act, impact_families: [{ ...family, review_state: 'confirmed' }] }).length, 1);
  assert.equal(impactFamilies({ ...act, impact_families: [{ ...family, review_state: 'provisional' }] }).length, 1);
  assert.equal(impactFamilies({ ...act, impact_families: [{ ...family, review_state: 'needs_review', impact_level: null }] }).length, 1);
  assert.equal(impactFamilies({ ...act, impact_families: [{ ...family, review_state: 'confirmed', finding_ids: ['absent'] }] }).length, 0);
});

test('impact focus filters original findings before grouping and preserves focused links', () => {
  const makeFinding = (id, language, quote = 'beta gamma') => ({
    ...act.findings[0], id, english_quote: quote,
    variants: [{ language, language_name: language.toUpperCase() }]
  });
  const makeFamily = (id, findingId, impactLevel) => ({
    id, title: id, impact_level: impactLevel, review_state: 'confirmed',
    effect: 'Could change the legal outcome.', finding_ids: [findingId]
  });
  const document = {
    ...act,
    languages: ['de', 'fr', 'it', 'es'].map((code) => ({ code, name: code.toUpperCase() })),
    findings: [
      makeFinding('high-de', 'de'),
      makeFinding('moderate-fr', 'fr'),
      makeFinding('unrated-it', 'it'),
      makeFinding('limited-es', 'es', 'alpha beta')
    ],
    impact_families: [
      makeFamily('high-issue', 'high-de', 'high'),
      makeFamily('moderate-issue', 'moderate-fr', 'moderate'),
      makeFamily('limited-issue', 'limited-es', 'limited')
    ]
  };
  assert.equal(groupedFindings(document).length, 2);
  assert.deepEqual(impactFocusedFindings(document, 'high').map((group) => group.aliases), [['high-de']]);
  assert.deepEqual(impactFocusedFindings(document, 'high')[0].variants.map((variant) => variant.language), ['de']);
  assert.deepEqual(impactFocusedFindings(document, 'moderate').map((group) => group.aliases), [['moderate-fr']]);
  assert.deepEqual(impactFocusedFindings(document, 'limited').map((group) => group.aliases), [['limited-es']]);
  assert.deepEqual(impactFocusedFindings(document, 'unrated').map((group) => group.aliases), [['unrated-it']]);
  assert.equal(impactFocusedFindings({ ...document, impact_families: [] }, 'unrated').length, 2);
  assert.equal(impactFocusedFindings({ ...document, impact_families: [] }, 'high').length, 0);

  const high = selectedFromHash('#act=test-act&finding=high-de&lang=de&impact=high', [document]);
  assert.equal(high.finding.id, 'high-de');
  assert.equal(selectionHash(high), 'act=test-act&finding=high-de&lang=de&impact=high');
  assert.equal(selectedFromHash('#act=test-act&finding=moderate-fr&impact=high', [document]).finding, null);
  assert.equal(selectedFromHash('#act=test-act&finding=high-de&lang=fr&impact=high', [document]).finding, null);
  assert.equal(selectedFromHash('#act=test-act&impact=critical', [document]).impact, null);
  assert.equal(selectedFromHash('#act=test-act&impact=unrated&finding=unrated-it', [document]).finding.id, 'unrated-it');
  assert.equal(selectedFromHash('#act=test-act&impact=high&view=impact&issue=moderate-issue', [document]).issue, null);
  assert.equal(selectedFromHash('#act=test-act&impact=high&view=impact&issue=high-issue', [document]).issue.id, 'high-issue');
});

test('shared-quote titles follow every finding in the focused language', () => {
  const document = {
    ...act,
    findings: [
      { ...act.findings[0], id: 'de', title: 'German issue', variants: [{ language: 'de' }] },
      { ...act.findings[0], id: 'fr-one', title: 'First French issue', variants: [{ language: 'fr' }] },
      { ...act.findings[0], id: 'fr-two', title: 'Second French issue', variants: [{ language: 'fr' }] }
    ]
  };
  const group = groupedFindings(document)[0];
  assert.equal(focusedFindingTitle(group, 'fr'), '2 differences in meaning in this language');
  assert.equal(focusedFindingTitle(group, 'de'), 'German issue');
  assert.equal(focusedFindingTitle(group), group.title);
});

test('archive links cannot escape the exported data directory', () => {
  assert.equal(archiveURL('texts/32019R0343/en.txt'), './data/texts/32019R0343/en.txt');
  for (const path of [
    'texts/../../secret.txt',
    '../secret.txt',
    'https://example.com/file.txt',
    'texts/%2e%2e/secret.txt',
    'texts/en.txt?token=secret',
    '/texts/en.txt'
  ])
    assert.equal(archiveURL(path), null);
});

test('official source links cannot execute code or point at lookalike hosts', () => {
  assert.ok(officialURL('https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R0343'));
  for (const value of [
    'javascript:alert(1)',
    'http://eur-lex.europa.eu/',
    'https://eur-lex.europa.eu.attacker.example/',
    'https://localhost/',
    'https://secret:token@eur-lex.europa.eu/',
    'https://eur-lex.europa.eu:8765/'
  ])
    assert.equal(officialURL(value), null);
});

test('partial and pending review states do not claim complete equivalence', () => {
  assert.equal(completionMessage(act, []), 'Partial review · 3 of 12 units checked');
  assert.equal(
    completionMessage({ ...act, status: 'imported' }, []),
    'Source archived · analysis pending'
  );
  assert.equal(
    completionMessage({ ...act, status: 'complete' }, []),
    'No supported differences found in the completed review'
  );
});

test('unsupported schema versions fail clearly', () => {
  assert.throws(() => catalogueLegislation({ schema_version: 2, legislation: [] }), /unsupported/);
  assert.deepEqual(catalogueLegislation({ schema_version: 1, legislation: [] }), []);
});

test('two distinct quotes in one passage select their own reviewed language evidence', () => {
  const first = {
    ...act.findings[0],
    english_quote: 'alpha',
    variants: [{ language: 'fr', quote: 'premier', translation: 'first' }]
  };
  const second = {
    ...act.findings[0],
    id: 'second',
    english_quote: 'delta',
    variants: [{ language: 'de', quote: 'zweiter', translation: 'second' }]
  };
  const document = { ...act, findings: [first, second] };
  const findings = groupedFindings(document);
  const segments = highlightedSegments(document.passages[0].text, findings);
  assert.deepEqual(
    segments.filter((segment) => segment.ids.length).map((segment) => segment.ids),
    [['test-finding'], ['second']]
  );
  assert.equal(
    selectedFromHash('#act=test-act&finding=test-finding', [document]).finding.variants[0].language,
    'fr'
  );
  assert.equal(
    selectedFromHash('#act=test-act&finding=second', [document]).finding.variants[0].language,
    'de'
  );
});

test('one English anchor lists every reviewed language and retains old finding links', () => {
  const second = {
    ...act.findings[0],
    id: 'second',
    variants: [{ language: 'de', quote: 'different original' }]
  };
  const document = { ...act, findings: [...act.findings, second] };
  const findings = groupedFindings(document);
  assert.equal(findings.length, 1);
  assert.deepEqual(
    findings[0].variants.map((variant) => variant.language),
    ['fr', 'de']
  );
  assert.equal(
    selectedFromHash('#act=test-act&finding=second', [document]).finding.id,
    'test-finding'
  );
  assert.equal(publicFindings(document).length, 2);
});

test('repeated source wording highlights every exact non-overlapping occurrence', () => {
  const text = 'same wording; same wording; same wording';
  const finding = { id: 'repeated', english_quote: 'same wording' };
  assert.equal(sourceOccurrences(text, finding.english_quote).length, 3);
  assert.equal(sourceOccurrences('aaaaa', 'aa').length, 2);
  assert.deepEqual(sourceOccurrences(text, ''), []);
  const segments = highlightedSegments(text, [finding]);
  assert.equal(segments.filter((segment) => segment.ids.includes('repeated')).length, 3);
  assert.equal(segments.map((segment) => segment.text).join(''), text);
});

test('overlapping findings remain individually selectable across repeated wording', () => {
  const document = {
    ...act,
    passages: [{ id: 'p1', text: 'alpha beta gamma; alpha beta gamma' }],
    findings: [
      { ...act.findings[0], english_quote: 'alpha beta' },
      {
        ...act.findings[0],
        id: 'overlap',
        english_quote: 'beta gamma',
        variants: [{ language: 'de' }]
      }
    ]
  };
  const findings = groupedFindings(document);
  assert.deepEqual(
    overlappingFindings(document, findings[0]).map((finding) => finding.id),
    ['test-finding', 'overlap']
  );
  const segments = highlightedSegments(document.passages[0].text, findings);
  assert.equal(segments.filter((segment) => segment.ids.length === 2).length, 2);
  assert.equal(
    selectedFromHash('#act=test-act&finding=overlap', [document]).finding.variants[0].language,
    'de'
  );
});

test('grouped differences keep a descriptive label and each language finding title', () => {
  const first = { ...act.findings[0], title: 'A different threshold' };
  const second = {
    ...act.findings[0],
    id: 'second',
    title: 'A narrower scope',
    variants: [{ language: 'de' }]
  };
  const group = groupedFindings({ ...act, findings: [first, second] })[0];
  assert.ok(group.title.startsWith('Shared wording: “'));
  assert.ok(group.title.includes(group.english_quote));
  assert.ok(!group.title.includes(first.title));
  assert.deepEqual(
    group.variants.map((variant) => variant.finding_title),
    ['A different threshold', 'A narrower scope']
  );
});

test('overlap boundaries never create whitespace-only interactive highlights', () => {
  const segments = highlightedSegments('alpha beta', [
    { id: 'wide', english_quote: 'alpha beta' },
    { id: 'first', english_quote: 'alpha' },
    { id: 'last', english_quote: 'beta' }
  ]);
  assert.deepEqual(segments.find((segment) => segment.text === ' ').ids, []);
  assert.equal(segments.map((segment) => segment.text).join(''), 'alpha beta');
});

test('article layout joins standalone point markers while preserving exact source offsets', () => {
  const source =
    'Article 3\nGeneral principles\nIntroductory sentence.\n(a)\nFirst point;\n(b)\nSecond point.';
  const rows = passageRows(source, 'Article 3');
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['heading', 'subtitle', 'paragraph', 'point', 'point']
  );
  assert.equal(rows.map((row) => source.slice(row.start, row.end)).join(''), source);
  assert.equal(source.slice(rows[3].start, rows[3].markerEnd), '(a)\n');
  assert.equal(source.slice(rows[3].markerEnd, rows[3].contentEnd), 'First point;');
});

test('numbered clauses and clear inline lists get readable rows without changing quotations', () => {
  const source =
    'Article 8\nSpecific conditions\n2. Amendments shall be adopted.\n3. Conditions include: (a) first item; (b) second item.';
  const rows = passageRows(source, 'Article 8');
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['heading', 'subtitle', 'clause', 'clause', 'point', 'point']
  );
  assert.equal(rows.map((row) => source.slice(row.start, row.end)).join(''), source);
  assert.equal(source.slice(rows[2].markerEnd, rows[2].contentEnd), 'Amendments shall be adopted.');
  assert.equal(source.slice(rows[4].start, rows[4].contentEnd), '(a) first item; ');
  assert.equal(passageRows('A reference to Article 3(3)(a) remains prose.', 'Context').length, 1);
});

test('definition numbers and annex bullets stay beside their source text', () => {
  const source =
    '(28)\n‘common specification’ means a technical specification;\n1.\nFirst annex item\n—\nRelated detail';
  const rows = passageRows(source, 'Article 3');
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['point', 'clause', 'point']
  );
  assert.equal(rows.map((row) => source.slice(row.start, row.end)).join(''), source);
  assert.equal(source.slice(rows[0].start, rows[0].markerEnd), '(28)\n');
  assert.equal(source.slice(rows[1].markerEnd, rows[1].contentEnd), 'First annex item');
});


test('coverage separates the English reference from completed and unfinished target languages', () => {
  const document = { languages: [{ code: 'en' }, { code: 'de' }, { code: 'fr' }],
    coverage: { total_languages: 3, reviewed_languages: 2, reviewed_language_codes: ['de'] } };
  assert.deepEqual(targetReviewCoverage(document), { reviewed: 1, total: 2, english: true });
  assert.deepEqual(targetReviewCoverage({ ...document, coverage: { total_languages: 3, reviewed_languages: 1 } }),
    { reviewed: 0, total: 2, english: true });
  assert.deepEqual(targetReviewCoverage({ ...document, coverage: { total_languages: 3, reviewed_languages: 0 } }),
    { reviewed: 0, total: 2, english: true });
});

test('source labels expose recorded scope limits without changing original metadata', () => {
  const original = { version_label: 'Original act', notes: ['A later consolidated work exists but is outside this review.'] };
  assert.equal(sourceVersionInfo(original).label, 'Original publication');
  assert.equal(sourceVersionInfo(original).limitations.length, 1);
  assert.equal(original.version_label, 'Original act');
  const consolidated = { version_label: 'Consolidated text', notes: ["The selected official consolidation omits recitals."] };
  assert.equal(sourceVersionInfo(consolidated).label, 'Consolidated version as of');
  assert.match(sourceVersionInfo(consolidated).limitations[0], /recitals/);
  assert.deepEqual(sourceVersionInfo({ version_label: 'Original act' }).limitations, []);
});
