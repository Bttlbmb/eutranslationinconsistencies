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
  return { catalogue: { schema_version: 1, legislation: [act] }, files };
}

test('snapshot checks preserve the exact approved bytes and accept an empty collection', async () => {
  const { catalogue, files } = fixture();
  const archives = await validateSnapshot(catalogue, (url) => files.get(url));
  assert.deepEqual(archives, files);
  assert.equal(
    (
      await validateSnapshot({ schema_version: 1, legislation: [] }, () =>
        assert.fail('No archive should be read')
      )
    ).size,
    0
  );
});

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
