import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSite, assets } from '../scripts/build.mjs';

test('an asset-copy failure preserves the previous usable build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'concordance-build-'));
  try {
    await mkdir(join(root, 'data'));
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'data/catalogue.json'), JSON.stringify({ schema_version: 2, legislation: [] }));
    await writeFile(join(root, 'dist/index.html'), 'Previous usable site');
    await writeFile(join(root, 'index.html'), '<meta name=robots content=noindex>');
    await assert.rejects(buildSite(root), /ENOENT/);
    assert.equal(await readFile(join(root, 'dist/index.html'), 'utf8'), 'Previous usable site');
    for (const asset of assets) await writeFile(join(root, asset), 'Updated public asset noindex');
    assert.equal(await buildSite(root), 0);
    assert.equal(await readFile(join(root, 'dist/index.html'), 'utf8'), 'Updated public asset noindex');
    assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/data/catalogue.json'), 'utf8')).legislation, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
