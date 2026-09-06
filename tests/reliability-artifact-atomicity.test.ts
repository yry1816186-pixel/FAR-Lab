import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { openArtifactStore } from '../src/persistence/artifacts.js';

// Reliability workstream 2026-08-24: content-addressed puts must land ATOMICALLY.
// Defect being regression-guarded: writeFileSync('wx') at the final path is not
// crash-atomic — a process death mid-write leaves a truncated blob that get()
// returns as valid content. The fix writes a temp sibling + same-dir rename.

describe('artifact store atomic landing', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-atomic-test-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('a landed blob is byte-complete and re-readable (get round-trip)', async () => {
    const store = openArtifactStore(dir);
    const payload = 'x'.repeat(1 << 20); // 1MB: spans many write() syscalls
    const put = await store.put(payload);
    expect(put.ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await store.get(put.ref)).toBe(payload);
  });

  it('no temp residue remains in the shard after a successful put', async () => {
    const store = openArtifactStore(dir);
    const put = await store.put('clean landing');
    const shardDir = path.join(dir, put.hash.slice(0, 2));
    const names = fs.readdirSync(shardDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    expect(names).toHaveLength(1);
    expect(names[0]).toBe(put.hash); // exactly the blob, zero .tmp- files
  });

  it('concurrent puts of identical content: both succeed, one blob, content intact', async () => {
    const store = openArtifactStore(dir);
    const payload = JSON.stringify({ big: Array.from({ length: 10_000 }, (_, i) => i) });
    const [a, b] = await Promise.all([store.put(payload), store.put(payload)]);
    expect(a.hash).toBe(b.hash);
    expect(await store.get(a.ref)).toBe(payload);
    const shardFiles = fs.readdirSync(path.join(dir, a.hash.slice(0, 2)));
    expect(shardFiles).toHaveLength(1);
  });

  it('re-put of existing content is a verified no-op (collision check still enforced)', async () => {
    const store = openArtifactStore(dir);
    const first = await store.put('same bytes');
    const second = await store.put('same bytes');
    expect(second.ref).toBe(first.ref);
  });

  it('put failure on a full/locked filesystem leaves no partial blob and no temp residue', async () => {
    const store = openArtifactStore(dir);
    const payload = 'must not land';
    // Pre-compute the shard this payload hashes into, then block it with a FILE
    // (not a dir): the put's temp write must fail BEFORE any blob name can exist.
    const hash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
    fs.writeFileSync(path.join(dir, hash.slice(0, 2)), 'a file where the shard dir should be');
    let err: unknown = null;
    try { await store.put(payload); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('.incoming-'))).toEqual([]);
    // Nothing landed anywhere: no blob path, no dot-temp, in any directory.
    for (const shard of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!shard.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(dir, shard.name))) {
        expect(/^[0-9a-f]{64}$/.test(f) || f.startsWith('.')).toBe(false);
      }
    }
  });

  it('an asynchronous open failure rejects the put without crashing the caller process', () => {
    // Use a real process so an unhandled stream error cannot be hidden by the
    // test runner. Native Node type stripping keeps this independent of dist.
    const moduleUrl = new URL('../src/persistence/artifacts.ts', import.meta.url).href;
    const script = `
      import fs from 'node:fs';
      import { openArtifactStore } from ${JSON.stringify(moduleUrl)};
      const store = openArtifactStore(${JSON.stringify(dir)});
      fs.rmSync(${JSON.stringify(dir)}, { recursive: true });
      try { await store.put('failed write'); process.exitCode = 2; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    `;
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' })).not.toThrow();
  });

  it('a source failure before its first chunk closes and removes the staged file', async () => {
    const store = openArtifactStore(dir);
    const source = (async function* (): AsyncGenerator<Buffer> {
      // Rejects before the first chunk reaches the store.
      await Promise.reject(new Error('input unavailable before first chunk'));
      yield Buffer.alloc(0);
    })();
    await expect(store.putStream!(source)).rejects.toThrow('input unavailable before first chunk');
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
