/**
 * ro_crate_mapping.test.ts — IC-09 RO-Crate 兼容映射验收(ADR-008)。
 *
 * 验收 Oracle(合同 contract-009):
 *   ① 映射文件通过 RO-Crate 结构自检(@context 1.1/@graph/root CreativeWork/farlab 命名空间);
 *   ② 映射损失清单文档化(#farlab_mapping_losses ≥1 项,损失项不误读为原生语义);
 *   ③ bundle verify 不变(proofHash 路径不变,验证通过);ruleset_uri 一并嵌入(IC-01)。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exportFarProof } from '../../src/far_proof/exporter.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';
import { buildDemoChain } from '../../src/far_proof/demo_chain.ts';
import { runMigrations } from '../../src/db/migrator.ts';

interface RoCrateNode {
  readonly '@id'?: string;
  readonly '@type'?: string;
  readonly name?: string;
  readonly value?: string;
  readonly description?: string;
  readonly conformsTo?: { readonly '@id'?: string };
  readonly about?: { readonly '@id'?: string };
  readonly itemListElement?: ReadonlyArray<{ readonly name?: string; readonly description?: string }>;
}

function exportDemoBundle(): string {
  const db = new Database(':memory:');
  runMigrations(db);
  buildDemoChain(db);
  const outDir = mkdtempSync(join(tmpdir(), 'ic09-rocrate-'));
  exportFarProof({
    db,
    outputDir: outDir,
    runId: 'ic09',
    modelSnapshot: 'ic09-model',
    gitCommitSha: 'e'.repeat(40),
    envHash: 'f'.repeat(64),
  });
  db.close();
  return outDir;
}

test('① RO-Crate 结构自检:context/@graph/root/farlab 命名空间', () => {
  const outDir = exportDemoBundle();
  const metadata = JSON.parse(readFileSync(join(outDir, 'ro-crate-metadata.json'), 'utf8')) as {
    '@context': unknown;
    '@graph': RoCrateNode[];
  };
  const ctx = metadata['@context'];
  const ctxText = JSON.stringify(ctx);
  assert.match(ctxText, /ro\/crate\/1\.1\/context/, '缺 RO-Crate 1.1 context');
  assert.match(ctxText, /"farlab"\s*:\s*"https:\/\/farlab\.dev\/ns#"/, '缺 farlab 命名空间');
  assert.ok(Array.isArray(metadata['@graph']) && metadata['@graph'].length > 0, '@graph 非数组');
  const root = metadata['@graph'].find((n) => n['@type'] === 'CreativeWork');
  assert.ok(root !== undefined, '缺 descriptor CreativeWork');
  assert.match(root.name ?? '', /FAR-Lab Proof Export/);
  // F-V09-07:RO-Crate 1.1 必备结构(conformsTo/about/Root Data Entity)
  assert.deepEqual(root.conformsTo, { '@id': 'https://w3id.org/ro/crate/1.1' }, 'descriptor 缺 conformsTo');
  assert.deepEqual(root.about, { '@id': './' }, 'descriptor 缺 about → Root Data Entity');
  const rootData = metadata['@graph'].find((n) => n['@id'] === './');
  assert.ok(rootData !== undefined, "缺 Root Data Entity(@id='./')");
  assert.equal(rootData['@type'], 'Dataset');
});

test('② 映射损失清单文档化且不误读为原生语义', () => {
  const outDir = exportDemoBundle();
  const metadata = JSON.parse(readFileSync(join(outDir, 'ro-crate-metadata.json'), 'utf8')) as {
    '@graph': RoCrateNode[];
  };
  const losses = metadata['@graph'].find((n) => n['@id'] === '#farlab_mapping_losses');
  assert.ok(losses !== undefined, '缺 #farlab_mapping_losses 节点');
  assert.ok((losses.itemListElement?.length ?? 0) >= 5, '损失清单 <5 项');
  const allText = JSON.stringify(losses);
  for (const id of ['L-01', 'L-02', 'L-03', 'L-04', 'L-05', 'L-06']) {
    assert.match(allText, new RegExp(id), `损失清单缺 ${id}`);
  }
  assert.match(allText, /损失=/, '损失项须显式标注损失语义');
  assert.match(allText, /misreading|误读/, '须含反误读护栏(损失项非原生语义)');
  // 五值/reasonCodes 以命名空间表达
  const verdictNode = metadata['@graph'].find((n) => n.name === 'farlab:verdictFiveValue');
  assert.ok(verdictNode !== undefined, '缺 farlab:verdictFiveValue');
  assert.match(verdictNode.value ?? '', /CONFIRMED\|REFUTED\|INCONCLUSIVE\|DEGRADED_SCOPE\|UNTESTED/);
});

test('③ bundle verify 不变 + ruleset_uri 嵌入(IC-01)+ proofHash 路径声明', () => {
  const outDir = exportDemoBundle();
  const bundle = verifyFarProofBundle(outDir, 'full');
  assert.equal(bundle.ok, true, `bundle errors: ${bundle.errors.join('; ')}`);
  const metadata = JSON.parse(readFileSync(join(outDir, 'ro-crate-metadata.json'), 'utf8')) as {
    '@graph': RoCrateNode[];
  };
  const ruleset = metadata['@graph'].find((n) => n['@id'] === '#ruleset_uri');
  assert.ok(ruleset !== undefined, '缺 #ruleset_uri(IC-01)');
  assert.match(ruleset.value ?? '', /farlab\.dev\/ruleset\/v1/);
  const proofHashNode = metadata['@graph'].find((n) => n.name === 'farlab:proofHash');
  assert.ok(proofHashNode !== undefined, '缺 farlab:proofHash 路径声明');
  assert.match(proofHashNode.description ?? '', /NOT lost|不损失/, '须声明核心可验证性不损失');
});
