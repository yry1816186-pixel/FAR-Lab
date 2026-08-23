import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { runGc } from '../src/cli/gc.js';
import { ResearchQuestion, SourceDocument } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';
import type { App } from '../src/app/composition.js';

/**
 * `far gc` (gap R7): sweeps content-addressed blobs that no objects/runs row
 * references. Deterministic, idempotent; dry-run is the default and the apply
 * path only ever removes blobs the reference scan (store.referencedArtifactHashes)
 * could not see. Real fs + real store; no network.
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
});
