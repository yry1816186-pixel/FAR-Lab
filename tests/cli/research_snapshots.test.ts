/**
 * far research snapshots — inventory command tests (day-r9).
 *
 * The command is the operator's pin menu: it must list every readable frozen
 * snapshot (newest first, with enough id/docs/query to CHOOSE one), survive a
 * corrupt file (skipped — loading is what fails closed), and say something
 * honest when the store is empty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCorpusSnapshot } from '../../src/retrieval/corpus.ts';
import { computeDocumentId, normalizedDocumentHash } from '../../src/retrieval/hash.ts';
import { saveCorpusSnapshotStore } from '../../src/retrieval/snapshot_store.ts';

function doc(n: number): ReturnType<typeof createCorpusSnapshot>['documents'][number] {
  const pid = `W${2000 + n}`;
  const fields = {
    sourceType: 'openalex' as const,
    persistentIdentifier: pid,
    doi: `10.1000/x.${n}`,
    title: `Snapshot inventory doc ${n}`,
    authors: [`Author ${n}`],
    publicationDate: '2021-06-01',
    abstract: `Abstract ${n}`,
    canonicalUrl: `https://openalex.org/${pid}`,
    licenseMetadata: null,
  };
  return {
    ...fields,
    documentId: computeDocumentId('openalex', pid),
    normalizedHash: normalizedDocumentHash(fields),
    sourceName: 'OpenAlex',
    retrievedAt: '2026-08-16T00:00:00.000Z',
    retrievalQuery: 'inventory test query',
    retrievalMethod: 'openalex-rest',
    parserVersion: 't',
    rawHash: `raw-${pid}`,
  } as never;
}

test('far research snapshots lists newest-first, survives a corrupt file, exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-snap-cli-'));
  try {
    saveCorpusSnapshotStore(
      createCorpusSnapshot([doc(1)], ['older query'], '2026-08-01T00:00:00.000Z'), dir,
    );
    const newer = createCorpusSnapshot([doc(2), doc(3)], ['newer query'], '2026-08-16T00:00:00.000Z');
    saveCorpusSnapshotStore(newer, dir);
    writeFileSync(join(dir, `${'f'.repeat(64)}.json`), 'corrupt-garbage', 'utf8');

    const r = spawnSync(
      process.execPath,
      ['src/cli/far.ts', 'research', 'snapshots'],
      { encoding: 'utf8', env: { ...process.env, FAR_SNAPSHOT_STORE_DIR: dir } },
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout;
    assert.match(out, /2 frozen/);
    assert.match(out, /newer query/);
    assert.ok(
      out.indexOf('newer query') < out.indexOf('older query'),
      'newest snapshot listed first',
    );
    assert.doesNotMatch(out, /corrupt/);
    assert.match(out, /--reuse-snapshot <full-id>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far research snapshots --json is machine-readable and includes full ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-snap-cli-json-'));
  try {
    const snap = createCorpusSnapshot([doc(9)], ['json query'], '2026-08-16T00:00:00.000Z');
    saveCorpusSnapshotStore(snap, dir);
    const r = spawnSync(
      process.execPath,
      ['src/cli/far.ts', 'research', 'snapshots', '--json'],
      { encoding: 'utf8', env: { ...process.env, FAR_SNAPSHOT_STORE_DIR: dir } },
    );
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout) as {
      dir: string;
      count: number;
      snapshots: ReadonlyArray<{ snapshotId: string; documentCount: number }>;
    };
    assert.equal(parsed.count, 1);
    assert.equal(parsed.snapshots[0]!.snapshotId, snap.snapshotId);
    assert.equal(parsed.snapshots[0]!.documentCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far research snapshots on an empty store explains how snapshots are born', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-snap-cli-empty-'));
  try {
    const r = spawnSync(
      process.execPath,
      ['src/cli/far.ts', 'research', 'snapshots'],
      { encoding: 'utf8', env: { ...process.env, FAR_SNAPSHOT_STORE_DIR: dir } },
    );
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no frozen snapshots/);
    assert.match(r.stdout, /auto-freezes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
