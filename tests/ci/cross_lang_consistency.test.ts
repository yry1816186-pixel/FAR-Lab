// tests/ci/cross_lang_consistency.test.ts
// 职责：CI R2 最高优先闸门——TS/Python canonicalHash 字节级一致性
// 权威 SSOT：10_CI_pipeline.md §9（cross_lang gate）+ 04_evidence_log.md §2.4（canonicalHash whitelist）
// 零容忍合规：禁用 any 类型注解、ts-ignore 指令、双重断言、空 catch 块、桩代码返回

import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOLDEN_VECTORS,
  REPRO_CONTEXT_FIXTURE,
  canonicalHash,
  hashCanonicalJson,
} from '../../src/evidence_log/index.ts';

const farChainRoot = new URL('../../', import.meta.url);

function spawnPython(script: string, args: readonly string[] = []): string {
  const result = spawnSync('python3', ['-c', script, ...args], {
    cwd: farChainRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONPATH: 'repro',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function pythonCanonicalHashReproFixture(): string {
  return spawnPython(
    [
      'from far_chain_repro.canonical_json import canonical_hash',
      'from far_chain_repro.golden_vectors import REPRO_CONTEXT_FIXTURE',
      'print(canonical_hash(REPRO_CONTEXT_FIXTURE))',
    ].join('; '),
  );
}

function pythonAllGoldenVectorHashes(): string[] {
  const stdout = spawnPython(
    [
      'from far_chain_repro.canonical_json import canonical_hash',
      'from far_chain_repro.golden_vectors import GOLDEN_VECTORS',
      "print('\\n'.join(canonical_hash(v['input']) for v in GOLDEN_VECTORS))",
    ].join('; '),
  );
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function pythonHashCanonicalJson(obj: Record<string, unknown>): string {
  const jsonPayload = JSON.stringify(obj);
  const script = [
    'import json, sys',
    'from far_chain_repro.canonical_json import hash_canonical_json',
    'obj = json.loads(sys.argv[1])',
    'print(hash_canonical_json(obj))',
  ].join('; ');
  return spawnPython(script, [jsonPayload]);
}

test('TS canonicalHash(REPRO_CONTEXT_FIXTURE) equals Python canonical_hash byte-for-byte', () => {
  const tsHex = canonicalHash(REPRO_CONTEXT_FIXTURE);
  const pyHex = pythonCanonicalHashReproFixture();
  assert.match(tsHex, /^[0-9a-f]{64}$/);
  assert.equal(tsHex, pyHex);
});

test('all GOLDEN_VECTORS match expectedHex (TS) and Python canonical_hash', () => {
  const pyHashes = pythonAllGoldenVectorHashes();
  assert.equal(
    pyHashes.length,
    GOLDEN_VECTORS.length,
    `Python GOLDEN_VECTORS count ${pyHashes.length} !== TS count ${GOLDEN_VECTORS.length}`,
  );
  for (const [index, vector] of GOLDEN_VECTORS.entries()) {
    const tsHex = canonicalHash(vector.input);
    assert.equal(tsHex, vector.expectedHex, `TS vs expectedHex mismatch at ${vector.name}`);
    const pyHex = pyHashes[index];
    if (pyHex === undefined) {
      throw new Error(`Python hash at index ${index} is undefined for ${vector.name}`);
    }
    assert.equal(tsHex, pyHex, `TS vs Python mismatch at ${vector.name}`);
  }
});

test('nested object structure produces byte-equal hash across TS and Python', () => {
  const nested = {
    blasThreadpoolInfo: { threads: 4, affinity: 'cores' },
    stageId: 'nested_smoke',
  };
  const tsHex = hashCanonicalJson(nested);
  const pyHex = pythonHashCanonicalJson(nested);
  assert.equal(tsHex, pyHex);
});

test('camelCase field names are preserved (no snake_case conversion) across TS and Python', () => {
  const camelCaseObj = {
    blasThreadpoolInfo: { threads: 4, affinity: 'cores' },
    modelId: 'camel-case-smoke',
    isoTimestamp: '2026-06-27T00:00:00Z',
  };
  const tsHex = hashCanonicalJson(camelCaseObj);
  const pyHex = pythonHashCanonicalJson(camelCaseObj);
  assert.equal(tsHex, pyHex);
});

test('9-value purposeTag whitelist: dialogue vs hypothesis produce identical canonicalHash', () => {
  const dialogueHash = canonicalHash({ ...REPRO_CONTEXT_FIXTURE, purposeTag: 'dialogue' });
  const hypothesisHash = canonicalHash({ ...REPRO_CONTEXT_FIXTURE, purposeTag: 'hypothesis' });
  assert.equal(dialogueHash, hypothesisHash);
});

test('hashCanonicalJson rejects NaN', () => {
  assert.throws(
    () => hashCanonicalJson({ badNumber: Number.NaN }),
    /NaN and Infinity/,
  );
});

test('hashCanonicalJson rejects Infinity', () => {
  assert.throws(
    () => hashCanonicalJson({ badNumber: Number.POSITIVE_INFINITY }),
    /NaN and Infinity/,
  );
});
