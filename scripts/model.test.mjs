import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueLegislation, publicFindings, substantialLanguageIndex, groupedFindings, highlightedSegments, passageRows, sourceOccurrences, overlappingFindings, officialURL, archiveURL, selectedFromHash, completionMessage} from '../model.js';

// Artificial strings below are unit-test fixtures, never published source data.
const act = {id:'test-act', title:'Test act', status:'partial', passages:[{id:'p1', text:'alpha beta gamma delta'}], findings:[{id:'test-finding', passage_id:'p1', english_quote:'beta gamma', status:'agent_reviewed', variants:[{language:'fr'}]}], coverage:{total_units:12,reviewed_units:3}};

test('only supported reviewed findings become public highlights', () => {
  const draft = {...act.findings[0], id:'draft', status:'candidate'};
  const missingQuote = {...act.findings[0], id:'unmatched', english_quote:'not in source'};
  const emptyQuote = {...act.findings[0], id:'empty', english_quote:''};
  assert.equal(publicFindings({...act, findings:[...act.findings,draft,missingQuote,emptyQuote]}).length, 1);
});

test('language index counts substantial finding records without double-counting a language', () => {
  const first = {...act.findings[0], severity:'substantial', variants:[{language:'nl',language_name:'Dutch'},{language:'nl',language_name:'Dutch'},{language:'de',language_name:'German'}]};
  const second = {...first, id:'second', variants:[{language:'nl',language_name:'Dutch'}]};
  const unsupported = {...first, id:'draft', status:'candidate', variants:[{language:'fr',language_name:'French'}]};
  const lowerSeverity = {...first, id:'minor', severity:'minor', variants:[{language:'it',language_name:'Italian'}]};
  const document = {...act, findings:[first,second,unsupported,lowerSeverity]};
  assert.deepEqual(substantialLanguageIndex(document), [
    {code:'de',name:'German',count:1,findingIds:['test-finding']},
    {code:'nl',name:'Dutch',count:2,findingIds:['test-finding','second']}
  ]);
  assert.equal(selectedFromHash('#act=test-act&lang=nl', [document]).language, 'nl');
  assert.equal(selectedFromHash('#act=test-act&lang=fr', [document]).language, null);
  assert.equal(selectedFromHash('#act=test-act&finding=test-finding&lang=de', [document]).language, 'de');
});

test('overlapping highlights preserve every source character and both findings', () => {
  const findings = [...act.findings, {id:'second',english_quote:'gamma delta'}];
  const segments = highlightedSegments(act.passages[0].text, findings);
  assert.equal(segments.map(segment => segment.text).join(''), act.passages[0].text);
  assert.deepEqual(segments.find(segment => segment.text === 'gamma').ids, ['test-finding','second']);
  assert.deepEqual(highlightedSegments('plain source', []), [{text:'plain source',ids:[]}]);
});

test('deep links select an act and only a published finding from that act', () => {
  assert.equal(selectedFromHash('#act=test-act&finding=test-finding', [act]).finding.id, 'test-finding');
  assert.equal(selectedFromHash('#act=test-act&finding=missing', [act]).finding, null);
  assert.equal(selectedFromHash('#act=missing', [act]).act.id, act.id);
  assert.equal(selectedFromHash('', []).act, null);
});

test('archive links cannot escape the exported data directory', () => {
  assert.equal(archiveURL('texts/32019R0343/en.txt'), './data/texts/32019R0343/en.txt');
  for (const path of ['texts/../../secret.txt','../secret.txt','https://example.com/file.txt','texts/%2e%2e/secret.txt','texts/en.txt?token=secret','/texts/en.txt']) assert.equal(archiveURL(path), null);
});

test('official source links cannot execute code or point at lookalike hosts', () => {
  assert.ok(officialURL('https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R0343'));
  for (const value of ['javascript:alert(1)','http://eur-lex.europa.eu/','https://eur-lex.europa.eu.attacker.example/','https://localhost/', 'https://secret:token@eur-lex.europa.eu/', 'https://eur-lex.europa.eu:8765/']) assert.equal(officialURL(value), null);
});

test('partial and pending review states do not claim complete equivalence', () => {
  assert.equal(completionMessage(act, []), 'Partial review · 3 of 12 units checked');
  assert.equal(completionMessage({...act,status:'imported'}, []), 'Source archived · analysis pending');
  assert.equal(completionMessage({...act,status:'complete'}, []), 'No supported differences found in the completed review');
});

test('unsupported schema versions fail clearly', () => {
  assert.throws(() => catalogueLegislation({schema_version:2,legislation:[]}), /unsupported/);
  assert.deepEqual(catalogueLegislation({schema_version:1,legislation:[]}), []);
});


test('two distinct quotes in one passage select their own reviewed language evidence', () => {
  const first = {...act.findings[0], english_quote:'alpha', variants:[{language:'fr',quote:'premier',translation:'first'}]};
  const second = {...act.findings[0], id:'second', english_quote:'delta', variants:[{language:'de',quote:'zweiter',translation:'second'}]};
  const document = {...act, findings:[first, second]};
  const findings = groupedFindings(document);
  const segments = highlightedSegments(document.passages[0].text, findings);
  assert.deepEqual(segments.filter(segment => segment.ids.length).map(segment => segment.ids), [['test-finding'], ['second']]);
  assert.equal(selectedFromHash('#act=test-act&finding=test-finding', [document]).finding.variants[0].language, 'fr');
  assert.equal(selectedFromHash('#act=test-act&finding=second', [document]).finding.variants[0].language, 'de');
});

test('one English anchor lists every reviewed language and retains old finding links', () => {
  const second = {...act.findings[0], id:'second', variants:[{language:'de',quote:'different original'}]};
  const document = {...act,findings:[...act.findings,second]};
  const findings = groupedFindings(document);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].variants.map(variant => variant.language), ['fr','de']);
  assert.equal(selectedFromHash('#act=test-act&finding=second', [document]).finding.id, 'test-finding');
  assert.equal(publicFindings(document).length, 2);
});


test('repeated source wording highlights every exact non-overlapping occurrence', () => {
  const text = 'same wording; same wording; same wording';
  const finding = {id:'repeated',english_quote:'same wording'};
  assert.equal(sourceOccurrences(text, finding.english_quote).length, 3);
  assert.equal(sourceOccurrences('aaaaa','aa').length, 2);
  assert.deepEqual(sourceOccurrences(text,''), []);
  const segments = highlightedSegments(text, [finding]);
  assert.equal(segments.filter(segment => segment.ids.includes('repeated')).length, 3);
  assert.equal(segments.map(segment => segment.text).join(''), text);
});

test('overlapping findings remain individually selectable across repeated wording', () => {
  const document = {...act,passages:[{id:'p1',text:'alpha beta gamma; alpha beta gamma'}],findings:[
    {...act.findings[0],english_quote:'alpha beta'},
    {...act.findings[0],id:'overlap',english_quote:'beta gamma',variants:[{language:'de'}]}
  ]};
  const findings = groupedFindings(document);
  assert.deepEqual(overlappingFindings(document, findings[0]).map(finding => finding.id), ['test-finding','overlap']);
  const segments = highlightedSegments(document.passages[0].text, findings);
  assert.equal(segments.filter(segment => segment.ids.length === 2).length, 2);
  assert.equal(selectedFromHash('#act=test-act&finding=overlap', [document]).finding.variants[0].language, 'de');
});


test('grouped differences keep a descriptive label and each language finding title', () => {
  const first = {...act.findings[0], title:'A different threshold'};
  const second = {...act.findings[0], id:'second', title:'A narrower scope', variants:[{language:'de'}]};
  const group = groupedFindings({...act,findings:[first,second]})[0];
  assert.equal(group.title, 'A different threshold, and related differences');
  assert.deepEqual(group.variants.map(variant => variant.finding_title), ['A different threshold','A narrower scope']);
});

test('overlap boundaries never create whitespace-only interactive highlights', () => {
  const segments = highlightedSegments('alpha beta', [{id:'wide',english_quote:'alpha beta'},{id:'first',english_quote:'alpha'},{id:'last',english_quote:'beta'}]);
  assert.deepEqual(segments.find(segment => segment.text === ' ').ids, []);
  assert.equal(segments.map(segment => segment.text).join(''), 'alpha beta');
});

test('article layout joins standalone point markers while preserving exact source offsets', () => {
  const source = 'Article 3\nGeneral principles\nIntroductory sentence.\n(a)\nFirst point;\n(b)\nSecond point.';
  const rows = passageRows(source, 'Article 3');
  assert.deepEqual(rows.map(row => row.kind), ['heading', 'subtitle', 'paragraph', 'point', 'point']);
  assert.equal(rows.map(row => source.slice(row.start, row.end)).join(''), source);
  assert.equal(source.slice(rows[3].start, rows[3].markerEnd), '(a)\n');
  assert.equal(source.slice(rows[3].markerEnd, rows[3].contentEnd), 'First point;');
});

test('numbered clauses and clear inline lists get readable rows without changing quotations', () => {
  const source = 'Article 8\nSpecific conditions\n2. Amendments shall be adopted.\n3. Conditions include: (a) first item; (b) second item.';
  const rows = passageRows(source, 'Article 8');
  assert.deepEqual(rows.map(row => row.kind), ['heading', 'subtitle', 'clause', 'clause', 'point', 'point']);
  assert.equal(rows.map(row => source.slice(row.start, row.end)).join(''), source);
  assert.equal(source.slice(rows[2].markerEnd, rows[2].contentEnd), 'Amendments shall be adopted.');
  assert.equal(source.slice(rows[4].start, rows[4].contentEnd), '(a) first item; ');
  assert.equal(passageRows('A reference to Article 3(3)(a) remains prose.', 'Context').length, 1);
});

test('definition numbers and annex bullets stay beside their source text', () => {
  const source = '(28)\n‘common specification’ means a technical specification;\n1.\nFirst annex item\n—\nRelated detail';
  const rows = passageRows(source, 'Article 3');
  assert.deepEqual(rows.map(row => row.kind), ['point', 'clause', 'point']);
  assert.equal(rows.map(row => source.slice(row.start, row.end)).join(''), source);
  assert.equal(source.slice(rows[0].start, rows[0].markerEnd), '(28)\n');
  assert.equal(source.slice(rows[1].markerEnd, rows[1].contentEnd), 'First annex item');
});
