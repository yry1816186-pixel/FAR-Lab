import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { sha256FileHex, sha256Hex } from '../src/shared/crypto.js';
import { parseCsv, analyzeCsvFile } from '../src/experiment/csv.js';
import { applySplit, applySplitColumns } from '../src/experiment/split.js';
import { acquireDataset, datasetIdFor } from '../src/experiment/datasets.js';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId, type SplitSpec } from '../src/domain/index.js';
import { httpGet } from '../src/sources/http.js';

/**
 * FA-DAT-01 streaming data plane: chunked put, streaming file hash, streaming CSV
 * analysis, column-view splits. The load-bearing regression lock is equivalence —
 * streaming paths must reproduce the audited full-buffer behavior byte-for-byte.
 */

const tmpDir = (): string => mkdtempSync(join(tmpdir(), 'farlab-stream-'));

describe('FA-DAT-01: streaming artifact put', () => {
  it('multi-chunk putStream lands the same ref/hash/size as a whole-buffer put', async () => {
    const dir = tmpDir();
    try {
      const store = openArtifactStore(join(dir, 'artifacts'));
      const parts = [Buffer.alloc(256 * 1024, 1), Buffer.alloc(256 * 1024, 2), Buffer.alloc(17 * 1024, 3)];
      const whole = Buffer.concat(parts);
      const streamed = await store.putStream!(parts.values() as Iterable<Buffer> as AsyncIterable<Buffer>);
      const buffered = await store.put(whole);
      expect(streamed.ref).toBe(buffered.ref);
      expect(streamed.hash).toBe(sha256Hex(whole));
      expect(streamed.size).toBe(whole.length);
      expect(await store.get(streamed.ref)).toBe(whole.toString('utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a source that fails mid-stream leaves no artifact and no temp behind', async () => {
    const dir = tmpDir();
    try {
      const store = openArtifactStore(join(dir, 'artifacts'));
      const source = (async function* (): AsyncGenerator<Buffer> {
        yield Buffer.alloc(64 * 1024, 7);
        throw new Error('simulated device read failure');
      })();
      await expect(store.putStream!(source)).rejects.toThrow('simulated device read failure');
      // No blob landed anywhere (fresh store) and no .incoming-* orphan remains.
      expect(readdirSync(join(dir, 'artifacts'), { recursive: true }).filter((f) => String(f).includes('.incoming-'))).toHaveLength(0);
      const shardDirs = readdirSync(join(dir, 'artifacts')).filter((d) => /^[0-9a-f]{2}$/.test(d));
      expect(shardDirs).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('re-put of identical content is an idempotent no-op, and the empty payload keeps its canonical hash', async () => {
    const dir = tmpDir();
    try {
      const store = openArtifactStore(join(dir, 'artifacts'));
      const first = await store.putStream!((async function* () { yield Buffer.from('dup'); })());
      const second = await store.put(Buffer.from('dup'));
      expect(second.ref).toBe(first.ref);
      const empty = await store.put('');
      expect(empty.hash).toBe(createHash('sha256').update('').digest('hex'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('FA-DAT-01: streaming file hash', () => {
  it('sha256FileHex equals the whole-buffer hash (raw bytes, not decoded text)', async () => {
    const dir = tmpDir();
    try {
      const file = join(dir, 'blob.bin');
      const buf = Buffer.alloc(300 * 1024);
      for (let i = 0; i < buf.length; i += 7) buf[i] = (i * 31) % 251;
      writeFileSync(file, buf);
      expect(await sha256FileHex(file)).toBe(sha256Hex(buf));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('FA-DAT-01: streaming CSV analysis matches parseCsv', () => {
  const csv = 'x0,grp,label\r\n"1,5",a,pos\n2,b,"q""z"\n3,a,neg\n';
  const writeFixture = (dir: string): string => {
    const file = join(dir, 'f.csv');
    writeFileSync(file, csv, 'utf8');
    return file;
  };

  it('header/nRows/target/group values equal the full parse (quotes + CRLF included)', async () => {
    const dir = tmpDir();
    try {
      const file = writeFixture(dir);
      const stats = await analyzeCsvFile(file, { targetColumn: 'label', groupColumn: 'grp' });
      const parsed = parseCsv(csv);
      expect(stats.header).toEqual(parsed.header);
      expect(stats.nRows).toBe(parsed.rows.length);
      expect(stats.targetValues).toEqual(parsed.rows.map((r) => r[parsed.header.indexOf('label')]));
      expect(stats.groupValues).toEqual(parsed.rows.map((r) => r[parsed.header.indexOf('grp')]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('groupValues is null without a groupColumn; errors mirror parseCsv classes', async () => {
    const dir = tmpDir();
    try {
      const file = writeFixture(dir);
      expect((await analyzeCsvFile(file, { targetColumn: 'label' })).groupValues).toBeNull();
      await expect(analyzeCsvFile(file, { targetColumn: 'missing' })).rejects.toThrow(/target column 'missing' not in dataset header/);
      const bad = join(dir, 'bad.csv');
      writeFileSync(bad, 'a,b\n1,2,3\n', 'utf8');
      await expect(analyzeCsvFile(bad, { targetColumn: 'a' })).rejects.toThrow('csv row 2 has 3 fields, header has 2');
      const headerOnly = join(dir, 'ho.csv');
      writeFileSync(headerOnly, 'a,b\n', 'utf8');
      await expect(analyzeCsvFile(headerOnly, { targetColumn: 'a' })).rejects.toThrow('csv has a header but no data rows');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('FA-DAT-01: column-view splits equal row-view splits (equivalence lock)', () => {
  const header = ['x0', 'x1', 'grp', 'label'];
  const rows: string[][] = [];
  for (let i = 0; i < 200; i += 1) {
    rows.push([String(i % 13), String((i * 7) % 5), `g${i % 6}`, i % 3 === 0 ? 'pos' : 'neg']);
  }
  const base = {
    datasetRecordId: newId('ds') as never,
    datasetContentRef: `sha256:${'a'.repeat(64)}` as never,
    targetColumn: 'label',
  };
  const view = (groupColumn?: string) => {
    const tIdx = header.indexOf('label');
    const gIdx = groupColumn !== undefined ? header.indexOf(groupColumn) : -1;
    return {
      targetValues: rows.map((r) => String(r[tIdx] ?? '')),
      groupValues: gIdx >= 0 ? rows.map((r) => String(r[gIdx] ?? '')) : null,
    };
  };

  for (const method of ['random', 'random_stratified'] as const) {
    const split: SplitSpec = { method, ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 };
    it(`${method}: identical partition to applySplit`, () => {
      const a = applySplit(header, rows, { ...base, split });
      const b = applySplitColumns(header, rows.length, view(), { ...base, split });
      expect(b).toEqual(a);
    });
  }

  it('group mode: identical partition to applySplit', () => {
    const split: SplitSpec = { method: 'random', ratios: { train: 0.6, val: 0.1, test: 0.3 }, seed: 7 };
    const a = applySplit(header, rows, { ...base, split, groupColumn: 'grp' });
    const b = applySplitColumns(header, rows.length, view('grp'), { ...base, split, groupColumn: 'grp' });
    expect(b).toEqual(a);
  });

  it('inconsistent column view lengths fail loudly', () => {
    const split: SplitSpec = { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 1 };
    expect(() => applySplitColumns(header, rows.length, { targetValues: ['pos'], groupValues: null }, { ...base, split }))
      .toThrow('split column view inconsistent');
  });
});

describe('FA-DAT-01: streaming local dataset acquisition', () => {
  const makeWorld = (): { dir: string; store: Store; csvPath: string; cleanup: () => void } => {
    const dir = tmpDir();
    const db = openDb(join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'stream?', background: '', goalType: 'explanatory',
      scope: { domain: 'tabular-ml', phenomena: ['classification'] },
      constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
    });
    store.createRun(q);
    const csvPath = join(dir, 'f.csv');
    const lines = ['x0,label'];
    for (let i = 0; i < 64; i += 1) lines.push(`${(i % 7) * 0.25},${i % 2 === 0 ? 'pos' : 'neg'}`);
    writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');
    return {
      dir, store, csvPath,
      cleanup: () => {
        try { db.close(); } catch { /* closed */ }
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag */ }
      },
    };
  };

  it('acquires without a full buffer: artifact holds the exact file bytes, view is split-ready', async () => {
    const world = makeWorld();
    try {
      const artifacts = openArtifactStore(join(world.dir, 'artifacts'));
      const runId = world.store.listRuns(1)[0]!.id;
      const use = {
        source: { resolver: 'local' as const, path: world.csvPath },
        targetColumn: 'label',
        split: { method: 'random_stratified' as const, ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 },
      };
      const { record, csv } = await acquireDataset(world.store, artifacts, runId as never, use);
      expect(record.nRows).toBe(64);
      expect(csv.nRows).toBe(64);
      expect(csv.targetValues).toHaveLength(64);
      expect(csv.groupValues).toBeNull();
      expect(await artifacts.get(record.contentRef)).toBe(readFileSync(world.csvPath, 'utf8'));
      // Re-acquire: same source-derived id, view re-streamed from the original file.
      const again = await acquireDataset(world.store, artifacts, runId as never, use);
      expect(again.record.id).toBe(record.id);
      expect(again.csv.nRows).toBe(64);
      expect(datasetIdFor(use.source)).toBe(record.id);
    } finally {
      world.cleanup();
    }
  });

  it('sha256Expected gate hashes raw bytes and refuses a mismatch', async () => {
    const world = makeWorld();
    try {
      const artifacts = openArtifactStore(join(world.dir, 'artifacts'));
      const runId = world.store.listRuns(1)[0]!.id;
      const use = {
        source: { resolver: 'local' as const, path: world.csvPath, sha256Expected: 'f'.repeat(64) },
        targetColumn: 'label',
        split: { method: 'random' as const, ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 1 },
      };
      await expect(acquireDataset(world.store, artifacts, runId as never, use)).rejects.toThrow(/checksum mismatch/);
      // Correct expectation (raw-file hash) passes.
      const good = { ...use, source: { ...use.source, sha256Expected: await sha256FileHex(world.csvPath) } };
      const { record } = await acquireDataset(world.store, artifacts, runId as never, good);
      expect(record.contentRef).toBe(`sha256:${await sha256FileHex(world.csvPath)}`);
    } finally {
      world.cleanup();
    }
  });
});

describe('FA-DAT-01: http response body cap', () => {
  it('a body larger than the cap fails closed mid-read instead of buffering', async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < 64 * 1024 * 1024 + 1024) {
      const c = new Uint8Array(1024 * 1024);
      chunks.push(c);
      total += c.byteLength;
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) { for (const c of chunks) controller.enqueue(c); controller.close(); },
    });
    const res = { ok: true, status: 200, body, text: async () => { throw new Error('text() must not be used when body is present'); } };
    await expect(httpGet('https://scholar.example/big', {
      fetchImpl: async () => res as never,
      context: { family: 'test', query: 'big' },
    })).rejects.toThrow(/exceeds .* bytes/);
  }, 60_000);

  it('fakes without a streaming body keep using text()', async () => {
    const res = { ok: true, status: 200, text: async () => 'fine' };
    const r = await httpGet('https://scholar.example/small', {
      fetchImpl: async () => res,
      context: { family: 'test', query: 'small' },
    });
    expect(r.bodyText).toBe('fine');
  });
});
