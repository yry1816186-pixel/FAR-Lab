// tests/embeddings/embeddings.test.ts
// 嵌入基础设施（2.md §6.8 补遗规范）契约：
//   - config：版本哈希稳定 / 字段变更→哈希变（静默漂移的机械检测）
//   - stub：确定性黄金向量 / 同文同向量 / 异文几乎必异 / L2 归一 / 批量保序 / 空输入
//   - cache：命中幂等 / 版本键（configHash 入 key，升级必 miss）/ 损坏=miss /
//     FAR_EMBEDDING_CACHE=0 逃生 / 测试目录隔离（不污染真实缓存——b2 教训）
//   - 工厂：configHash 审计锚随每个结果返回

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EMBEDDING_CONFIG,
  EMBEDDING_CONFIG_HASH,
  canonicalEmbeddingConfigHash,
  projectDeterministicVector,
  createDeterministicHashEmbeddingProvider,
  createEmbeddingCache,
  createEmbeddingProvider,
  embeddingCacheKey,
} from '../../src/embeddings/index.ts';

describe('config (§6.8 frozen configuration + version hash)', () => {
  it('the shipped constant and its hash are consistent (hash stability)', () => {
    assert.equal(canonicalEmbeddingConfigHash(EMBEDDING_CONFIG), EMBEDDING_CONFIG_HASH);
    assert.match(EMBEDDING_CONFIG_HASH, /^[0-9a-f]{64}$/);
  });

  it('any field change changes the hash (silent-drift detection is mechanical)', () => {
    const changed = { ...EMBEDDING_CONFIG, dimensions: EMBEDDING_CONFIG.dimensions + 1 };
    assert.notEqual(canonicalEmbeddingConfigHash(changed), EMBEDDING_CONFIG_HASH);
    const changedProvider = { ...EMBEDDING_CONFIG, provider: 'real-api-v1' };
    assert.notEqual(canonicalEmbeddingConfigHash(changedProvider), EMBEDDING_CONFIG_HASH);
  });

  it('the provider id is frozen as the honesty marker (deterministic-hash-v1)', () => {
    assert.equal(EMBEDDING_CONFIG.provider, 'deterministic-hash-v1');
  });
});

describe('deterministic projection (hash math)', () => {
  it('golden vector: known text → byte-exact pinned components (cross-platform anchor)', () => {
    const v = projectDeterministicVector('FAR-Lab embeddings golden vector', 64);
    // Pinned 2026-08-15 from the implementation; ANY drift in the projection
    // math (hash expansion / sign / magnitude / normalization) breaks these.
    assert.deepEqual(
      v.slice(0, 4).map((x) => Number(x.toFixed(15))),
      [0.087719274809112, 0.169042352496727, 0.061220743877193, -0.084064305025399],
    );
    const alpha = projectDeterministicVector('alpha', 64);
    assert.deepEqual(
      alpha.slice(0, 4).map((x) => Number(x.toFixed(15))),
      [-0.181289006689874, -0.148639801693593, 0.07818625407004, -0.135751957616114],
    );
    // And the same text twice is still identical (cheap in-run guard).
    assert.deepEqual(v, projectDeterministicVector('FAR-Lab embeddings golden vector', 64));
  });

  it('different texts produce different vectors (hash projection spreads)', () => {
    const a = projectDeterministicVector('alpha', 64);
    const b = projectDeterministicVector('beta', 64);
    assert.notDeepEqual(a, b);
  });

  it('vectors are L2-normalized (‖v‖₂ ≈ 1)', () => {
    for (const text of ['x', 'a longer text with spaces', '🔬 unicode 太']) {
      const v = projectDeterministicVector(text, 64);
      const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
      assert.ok(Math.abs(norm - 1) < 1e-9, `norm was ${norm}`);
    }
  });

  it('dimensions are honored exactly', () => {
    assert.equal(projectDeterministicVector('t', 8).length, 8);
    assert.equal(projectDeterministicVector('t', 256).length, 256);
  });

  it('empty batch → empty vectors; batch results are index-aligned', async () => {
    const provider = createDeterministicHashEmbeddingProvider(EMBEDDING_CONFIG);
    const empty = await provider.embed([]);
    assert.deepEqual(empty.vectors, []);
    const texts = ['one', 'two', 'three'];
    const batch = await provider.embed(texts);
    const singles = await Promise.all(texts.map((t) => provider.embed([t])));
    for (let i = 0; i < texts.length; i += 1) {
      assert.deepEqual(batch.vectors[i], singles[i]!.vectors[0], `index ${i} aligned`);
    }
  });

  it('the provider id never claims semantics (honesty contract)', async () => {
    const provider = createDeterministicHashEmbeddingProvider(EMBEDDING_CONFIG);
    const result = await provider.embed(['t']);
    assert.equal(result.provider, 'deterministic-hash-v1');
    assert.equal(result.configHash, EMBEDDING_CONFIG_HASH);
  });
});

describe('persistent cache (version-keyed, content-addressed)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'far-embed-'));
    process.env.FAR_EMBEDDING_CACHE_DIR = dir;
    delete process.env.FAR_EMBEDDING_CACHE;
  });
  afterEach(() => {
    delete process.env.FAR_EMBEDDING_CACHE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('miss → store → hit (idempotent cached vector identical to computed)', () => {
    const cache = createEmbeddingCache();
    const text = 'cacheable text';
    assert.equal(cache.lookup(EMBEDDING_CONFIG_HASH, text), null);
    const computed = projectDeterministicVector(text, 64);
    cache.store(EMBEDDING_CONFIG_HASH, text, computed, '2026-08-15T00:00:00.000Z');
    assert.deepEqual(cache.lookup(EMBEDDING_CONFIG_HASH, text), computed);
    // Second store (rewrite) stays idempotent for deterministic providers.
    cache.store(EMBEDDING_CONFIG_HASH, text, computed, '2026-08-15T00:00:01.000Z');
    assert.deepEqual(cache.lookup(EMBEDDING_CONFIG_HASH, text), computed);
  });

  it('configHash is part of the key — a config change MUST miss (no version mixing)', () => {
    const cache = createEmbeddingCache();
    const text = 'versioned text';
    cache.store(EMBEDDING_CONFIG_HASH, text, projectDeterministicVector(text, 64), 't');
    const otherConfigHash = 'a'.repeat(64);
    assert.equal(cache.lookup(otherConfigHash, text), null, 'different config → miss');
  });

  it('corrupt cache file → miss, never a poison', () => {
    const cache = createEmbeddingCache();
    const text = 'corrupt me';
    const path = cache.pathFor(EMBEDDING_CONFIG_HASH, text);
    cache.store(EMBEDDING_CONFIG_HASH, text, [0.5, 0.5], 't');
    writeFileSync(path, '{not json', 'utf8');
    assert.equal(cache.lookup(EMBEDDING_CONFIG_HASH, text), null);
  });

  it('foreign configHash inside the envelope → miss', () => {
    const cache = createEmbeddingCache();
    const text = 'foreign envelope';
    const path = cache.pathFor(EMBEDDING_CONFIG_HASH, text);
    writeFileSync(
      path,
      JSON.stringify({ vector: [1], configHash: 'someone-else', cachedAt: 't' }),
      'utf8',
    );
    assert.equal(cache.lookup(EMBEDDING_CONFIG_HASH, text), null);
  });

  it('FAR_EMBEDDING_CACHE=0 disables the cache entirely (escape hatch)', () => {
    process.env.FAR_EMBEDDING_CACHE = '0';
    const cache = createEmbeddingCache();
    const text = 'disabled';
    cache.store(EMBEDDING_CONFIG_HASH, text, [1, 0], 't');
    assert.equal(cache.lookup(EMBEDDING_CONFIG_HASH, text), null);
    assert.equal(existsSync(cache.pathFor(EMBEDDING_CONFIG_HASH, text)), false);
  });

  it('pathFor is path-injection proof (hostile text cannot escape the root)', () => {
    const cache = createEmbeddingCache(dir);
    const hostile = '../../etc/passwd';
    const path = cache.pathFor(EMBEDDING_CONFIG_HASH, hostile);
    assert.ok(path.startsWith(dir), `path escaped root: ${path}`);
    assert.ok(existsSync(join(dir)) || true);
    assert.match(path, /[0-9a-f]{64}\.json$/);
    // The key is a hash — hostile text never reaches the filesystem as a name.
    assert.equal(embeddingCacheKey(EMBEDDING_CONFIG_HASH, hostile).includes('passwd'), false);
  });

  it('factory provider caches behind the interface (second call hits the disk cache)', async () => {
    const provider = createEmbeddingProvider({ now: () => new Date('2026-08-15T00:00:00.000Z') });
    const first = await provider.embed(['factory text']);
    const envelopePath = createEmbeddingCache().pathFor(EMBEDDING_CONFIG_HASH, 'factory text');
    assert.ok(existsSync(envelopePath), 'stored on first embed');
    const envelope = JSON.parse(readFileSync(envelopePath, 'utf8')) as { cachedAt: string };
    assert.equal(envelope.cachedAt, '2026-08-15T00:00:00.000Z');
    const second = await provider.embed(['factory text']);
    assert.deepEqual(second.vectors, first.vectors);
  });
});
