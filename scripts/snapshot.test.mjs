import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateSnapshot, readSnapshot } from './snapshot.mjs';

// These are artificial test strings, never written to the public collection.
function fixture() {
  const texts = {
    en: 'Article 1\nA condition applies.\n',
    fr: 'Article premier\nUne condition s’applique.\n'
  };
  const files = new Map();
  const languages = Object.entries(texts).map(([code, text]) => {
    const bytes = Buffer.from(text);
    const text_url = `texts/test/version/${code}.txt`;
    files.set(`./data/${text_url}`, bytes);
    return {
      code,
      name: code,
      text_url,
      source_url: `https://eur-lex.europa.eu/test/${code}`,
      sha256: createHash('sha256').update(bytes).digest('hex')
    };
  });
  const act = {
    id: 'test',
    title: 'Test act',
    status: 'complete',
    source_url: languages[0].source_url,
    languages,
    unavailable_languages: [],
    failed_languages: [],
    coverage: { total_units: 1, reviewed_units: 1, total_languages: 2, reviewed_languages: 2 },
    passages: [{ id: 'p1', label: 'Article 1', text: texts.en.trimEnd() }],
    findings: [
      {
        id: 'f1',
        passage_id: 'p1',
        english_quote: 'A condition applies.',
        title: 'Test difference',
        explanation: 'Test explanation',
        category: 'condition',
        severity: 'substantial',
        status: 'agent_reviewed',
        variants: [
          {
            language: 'fr',
            quote: 'Une condition s’applique.',
            translation: 'A condition applies.',
            explanation: 'Test explanation',
            source_url: languages[1].source_url
          }
        ],
        review: {
          method: 'Test review',
          models: ['test-model'],
          reviewed_at: '2026-10-13T00:00:00Z'
        }
      }
    ]
  };
  return { catalogue: { schema_version: 2, legislation: [act] }, files };
}

function approvedImpactFamily() {
  return {
    id: 'issue-1',
    title: 'Condition may change',
    legal_anchor: 'Article 1 condition',
    finding_ids: ['f1'],
    impact_level: 'major', rating_status: 'current',
    confidence: 'medium',
    effect: 'A person could fall inside the rule under one reading.',
    rationale: 'The changed boundary could alter an identifiable legal outcome.',
    uncertainty: 'The reading has not been resolved across all authentic versions.',
    rubric_version: 'conditional-binary-impact-1',
    assessed_at: '2026-10-14T00:00:00Z',
    review_state: 'confirmed'
  };
}

test('v2 accepts preserved legacy explanations only with an explicit reassessment status', async () => {
  const { catalogue, files } = fixture();
  const family = { ...approvedImpactFamily(), impact_level: null,
    rating_status: 'needs_reassessment', rubric_version: 'potential-impact-pilot-3' };
  catalogue.legislation[0].impact_families = [family];
  await validateSnapshot(catalogue, url => files.get(url));
  for (const invalid of [
    { impact_level: 'major' },
    { rating_status: 'current' },
    { rubric_version: 'conditional-binary-impact-1' }
  ]) {
    catalogue.legislation[0].impact_families = [{ ...family, ...invalid }];
    await assert.rejects(validateSnapshot(catalogue, url => files.get(url)), /Invalid impact/);
  }
});

test('v1 archives remain readable with their original three-level contract', async () => {
  const { catalogue, files } = fixture();
  catalogue.schema_version = 1;
  const family = { ...approvedImpactFamily(), impact_level: 'moderate', rubric_version: 'pilot-3' };
  delete family.rating_status;
  catalogue.legislation[0].impact_families = [family];
  await validateSnapshot(catalogue, url => files.get(url));
});

test('snapshot checks preserve the exact approved bytes and accept an empty collection', async () => {
  const { catalogue, files } = fixture();
  const archives = await validateSnapshot(catalogue, (url) => files.get(url));
  assert.deepEqual(archives, files);
  assert.equal(
    (
      await validateSnapshot({ schema_version: 2, legislation: [] }, () =>
        assert.fail('No archive should be read')
      )
    ).size,
    0
  );
});

test('snapshot accepts explicit reviewed target languages in a partial act', async () => {
  const { catalogue, files } = fixture();
  const act = catalogue.legislation[0];
  act.status = 'partial';
  act.coverage.reviewed_language_codes = ['fr'];
  await validateSnapshot(catalogue, (url) => files.get(url));
});

for (const [name, codes, reviewedLanguages] of [
  ['duplicate code', ['fr', 'fr'], 2],
  ['English code', ['en'], 2],
  ['unknown code', ['de'], 2],
  ['count mismatch', [], 2]
]) {
  test(`snapshot rejects ${name} in reviewed language codes`, async () => {
    const { catalogue, files } = fixture();
    const act = catalogue.legislation[0];
    act.coverage.reviewed_language_codes = codes;
    act.coverage.reviewed_languages = reviewedLanguages;
    await assert.rejects(
      validateSnapshot(catalogue, (url) => files.get(url)),
      /Reviewed language codes do not reconcile/
    );
  });
}

test('snapshot accepts an approved issue family linked to an original published finding', async () => {
  const { catalogue, files } = fixture();
  catalogue.legislation[0].impact_families = [approvedImpactFamily()];
  await validateSnapshot(catalogue, (url) => files.get(url));
});

test('snapshot accepts a model-reviewed rating and an unranked issue proposal', async () => {
  const { catalogue, files } = fixture();
  catalogue.legislation[0].impact_families = [
    { ...approvedImpactFamily(), review_state: 'provisional' }
  ];
  await validateSnapshot(catalogue, (url) => files.get(url));
  catalogue.legislation[0].impact_families[0].review_state = 'needs_review';
  catalogue.legislation[0].impact_families[0].impact_level = null;
  await validateSnapshot(catalogue, (url) => files.get(url));
});

for (const [name, change] of [
  ['a needs-review issue with a rank', (act) => { act.impact_families[0].review_state = 'needs_review'; }],
  ['a provisional issue without a rank', (act) => { act.impact_families[0].review_state = 'provisional'; act.impact_families[0].impact_level = null; }],
  ['an invalid level', (act) => { act.impact_families[0].impact_level = 'substantial'; }],
  ['a missing finding', (act) => { act.impact_families[0].finding_ids = ['absent']; }],
  ['a held or otherwise unpublished finding', (act) => { act.findings = []; }],
  ['a repeated member within one family', (act) => { act.impact_families[0].finding_ids = ['f1', 'f1']; }],
  ['one finding assigned to two families', (act) => {
    act.impact_families.push({ ...approvedImpactFamily(), id: 'issue-2' });
  }],
  ['a repeated family ID', (act) => { act.impact_families.push(approvedImpactFamily()); }],
  ['private fields in a public family', (act) => { act.impact_families[0].assessor = 'private'; }],
  ['a timestamp outside UTC', (act) => { act.impact_families[0].assessed_at = '2026-10-14T09:00:00+09:00'; }],
  ['an impossible calendar date', (act) => { act.impact_families[0].assessed_at = '2026-02-30T00:00:00Z'; }]
]) {
  test(`snapshot rejects ${name} in impact assessments`, async () => {
    const { catalogue, files } = fixture();
    catalogue.legislation[0].impact_families = [approvedImpactFamily()];
    change(catalogue.legislation[0]);
    await assert.rejects(
      validateSnapshot(catalogue, (url) => files.get(url)),
      /impact|Impact/
    );
  });
}

for (const [name, mutate, message] of [
  [
    'invented English passage even with a matching finding',
    (act) => {
      act.passages[0].text = 'Invented condition.';
      act.findings[0].english_quote = 'Invented condition.';
    },
    /English passage/
  ],
  [
    'duplicate language codes',
    (act) => act.languages.push({ ...act.languages[1] }),
    /duplicate language/
  ],
  [
    'reviewed totals larger than the source scope',
    (act) => {
      act.coverage.reviewed_units = 2;
    },
    /Coverage does not reconcile/
  ],
  [
    'complete status on unfinished coverage',
    (act) => {
      act.coverage.reviewed_units = 0;
    },
    /Complete status overstates/
  ],
  [
    'complete status on mixed-language coverage',
    (act) => {
      act.languages[1].coverage_incomplete = true;
    },
    /Complete status overstates/
  ],
  [
    'an official link pointing at a different source',
    (act) => {
      act.findings[0].variants[0].source_url = 'https://eur-lex.europa.eu/another-act';
    },
    /Variant source/
  ],
  [
    'invented foreign quotation',
    (act) => {
      act.findings[0].variants[0].quote = 'Invented wording';
    },
    /Original-language quote/
  ],
  [
    'missing review provenance',
    (act) => {
      act.findings[0].review.models = [];
    },
    /review provenance/
  ]
]) {
  test(`snapshot rejects ${name}`, async () => {
    const { catalogue, files } = fixture();
    mutate(catalogue.legislation[0]);
    await assert.rejects(
      validateSnapshot(catalogue, (url) => files.get(url)),
      message
    );
  });
}

test('changed archive bytes fail the checksum before publication', async () => {
  const { catalogue } = fixture();
  await assert.rejects(
    validateSnapshot(catalogue, () => Buffer.from('Changed text')),
    /checksum mismatch/
  );
});

test('a text archive symlink cannot package a file outside the source tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'concordance-snapshot-'));
  try {
    const { catalogue } = fixture();
    await mkdir(join(root, 'data/texts/test/version'), { recursive: true });
    await writeFile(join(root, 'data/catalogue.json'), JSON.stringify(catalogue));
    await writeFile(join(root, 'outside.txt'), 'Must not be packaged');
    await symlink(join(root, 'outside.txt'), join(root, 'data/texts/test/version/en.txt'));
    await assert.rejects(readSnapshot(root), /outside data\/texts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
