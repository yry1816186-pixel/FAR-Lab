import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { runGc } from '../src/cli/gc.js';
import { ResearchQuestion, ReproducibilityBundle, SourceDocument } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';
import type { App } from '../src/app/composition.js';

/**
 * `far gc` (gap R7): sweeps content-addressed blobs that no objects/runs row
 * references. Deterministic, idempotent; dry-run is the default and the apply
 * path only ever removes blobs the reference scan (store.referencedArtifactHashes)
 * could not see. Real fs + real store; no network.
 *
 * REGRESSION (2026-08-24 P0): the reference scan matched only `sha256:<hex>`
 * prefixed refs, but bundles store `finalArtifactHashes` as BARE hex. The user's
 * real-workspace `far gc --apply` therefore classified all 55 bundle-referenced
 * report/paper artifacts as orphans and deleted them — every completed study's
 * GET /report 404'd. Fail-safe direction: a missed ref is silent data loss while
 * an over-retained blob is harmless, so the scan must accept BOTH spellings.
 */

let app: App;
let dataDir: string;
let artifactsRoot: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-gc-'));
  app = await createApp({ dataDir });
  artifactsRoot = path.join(app.dataDir, 'artifacts');
});

afterAll(() => {
  app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const writeOrphan = (hash: string, bytes: string): void => {
  const file = path.join(artifactsRoot, hash.slice(0, 2), hash);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(bytes), { flag: 'wx' });
};

describe('far gc', () => {
  it('reports and sweeps unreferenced blobs; referenced ones survive; idempotent', async () => {
    // One referenced blob: a source document whose fullTextRef points at it.
    const put = await app.artifacts.put('referenced full text payload');
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'gc', background: '', goalType: 'exploratory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(q);
    app.store.putObject('source_document', SourceDocument.parse({
      id: newId('src'), runId: run.id, family: 'openalex',
      identifiers: [{ kind: 'doi', value: '10.1000/gc.a' }],
      title: 'GC referenced work', authors: [], contentDepth: 'full_text', accessState: 'open',
      contentHash: 'ab'.repeat(32), fullTextRef: put.ref, retrievedAt: new Date().toISOString(), parseStatus: 'ok',
    }));
    // Two orphan blobs (the shape run deletion leaves behind).
    writeOrphan('0'.repeat(64), 'orphan-one');
    writeOrphan('1'.repeat(64), 'orphan-two');

    const dry = runGc(app, { apply: false });
    expect(dry.totalBlobs).toBe(3);
    expect(dry.referenced).toBe(1);
    expect(dry.unreferenced.sort()).toEqual(['0'.repeat(64), '1'.repeat(64)]);
    expect(dry.unreferencedBytes).toBe(Buffer.byteLength('orphan-one') + Buffer.byteLength('orphan-two'));
    // Dry-run deleted nothing.
    expect(fs.existsSync(path.join(artifactsRoot, '00', '0'.repeat(64)))).toBe(true);

    const applied = runGc(app, { apply: true });
    expect(applied.removed.sort()).toEqual(['0'.repeat(64), '1'.repeat(64)]);
    expect(fs.existsSync(path.join(artifactsRoot, '00', '0'.repeat(64)))).toBe(false);
    // The referenced blob survives byte-identically.
    expect(await app.artifacts.get(put.ref)).toBe('referenced full text payload');
    // Empty shard dirs are cleaned up.
    expect(fs.existsSync(path.join(artifactsRoot, '00'))).toBe(false);

    const again = runGc(app, { apply: true });
    expect(again.unreferenced).toHaveLength(0); // idempotent: second pass is a no-op
  });

  it('handles an empty/absent artifact store without throwing', () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-gc-empty-'));
    fs.rmSync(freshDir, { recursive: true, force: true }); // no dir at all
    const emptyApp = { store: app.store, dataDir: freshDir } as unknown as App;
    const report = runGc(emptyApp, { apply: true });
    expect(report.totalBlobs).toBe(0);
    expect(report.unreferenced).toHaveLength(0);
  });

  // Crash residue from the atomic put path (reliability 2026-08-24): a process
  // death between the temp write and the rename leaves `.<hash>.tmp-<pid>-<n>`
  // files. They are never valid data and must be reported (always) + swept
  // (--apply) without touching landed blobs.
  it('reports and sweeps orphaned put-temps; landed blobs untouched', () => {
    const blobHash = '2'.repeat(64);
    writeOrphan(blobHash, 'landed blob that must survive');
    const shardDir = path.join(artifactsRoot, blobHash.slice(0, 2));
    fs.writeFileSync(path.join(shardDir, `.${blobHash}.tmp-4242-abcdef01`), 'partial write residue');

    const dry = runGc(app, { apply: false });
    expect(dry.orphanTemps).toEqual([path.join('22', `.${blobHash}.tmp-4242-abcdef01`)]);
    expect(fs.existsSync(path.join(shardDir, `.${blobHash}.tmp-4242-abcdef01`))).toBe(true); // dry-run keeps it

    const applied = runGc(app, { apply: true });
    expect(applied.orphanTemps).toHaveLength(1);
    expect(fs.existsSync(path.join(shardDir, `.${blobHash}.tmp-4242-abcdef01`))).toBe(false); // swept
    // The blob itself was unreferenced (no object points at '2'.repeat(64)), so it is
    // correctly swept as a blob candidate — the temp went through the ORPHAN branch,
    // never the blob branch.
    expect(applied.removed).toContain(blobHash);
    expect(applied.unreferenced).not.toContain(`.${blobHash}.tmp-4242-abcdef01`);
    expect(applied.removed).not.toContain(`.${blobHash}.tmp-4242-abcdef01`);
    // cleanup for later tests
    fs.rmSync(shardDir, { recursive: true, force: true });
  });

  // Regression for the 2026-08-24 P0: bundles reference their report/paper
  // artifacts via BARE hex in finalArtifactHashes (and paperOutlineRef uses the
  // sha256: prefix) — both spellings must count as references.
  it('keeps bundle-referenced artifacts alive: bare-hex finalArtifactHashes AND prefixed paperOutlineRef', async () => {
    const reportPut = await app.artifacts.put('gc-regression report markdown');
    const paperPut = await app.artifacts.put('gc-regression paper markdown');
    expect(reportPut.hash).not.toBe(paperPut.hash);

    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'gc bundle refs', background: '', goalType: 'exploratory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(q);
    app.store.putObject('bundle', ReproducibilityBundle.parse({
      id: newId('bnd'),
      runId: run.id,
      declaredEvidenceLevel: 'replay',
      codeRevision: 'unknown',
      environmentFingerprint: 'node test win32',
      dependencyLockHash: 'c'.repeat(64),
      questionRef: q.id,
      corpusSnapshotRef: q.id, // schema wants a resolvable-looking ref; gc must not care
      sourceArtifactHashes: [],
      modelMetadata: [],
      receiptIds: [],
      finalArtifactHashes: [reportPut.hash], // BARE hex — the exact production spelling
      verificationInstructions: 'far verify <bundle-id> (test seed)',
      limitations: [],
      paperOutlineRef: paperPut.ref, // sha256:-prefixed — the other production spelling
      createdAt: new Date().toISOString(),
    }));

    const dry = runGc(app, { apply: false });
    expect(dry.unreferenced).toEqual([]);
    const applied = runGc(app, { apply: true });
    expect(applied.removed).toEqual([]);
    // Both artifacts survive byte-identically.
    expect(await app.artifacts.get(reportPut.ref)).toBe('gc-regression report markdown');
    expect(await app.artifacts.get(paperPut.ref)).toBe('gc-regression paper markdown');
  });
});
