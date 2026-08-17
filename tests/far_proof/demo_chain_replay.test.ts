// tests/far_proof/demo_chain_replay.test.ts
// 职责：M4 .far-proof 导出拱心石端到端测试（T-W3-04）。
//
// 验证链路（全 offline·fresh-clone 无 key 可复现）：
//   buildDemoChain (FEC C-ASTRO-0001 → makeVerdict → sealProofEnvelope)
//     → exportFarProof (九分量 + code/MANIFEST.md)
//     → recomputeProofHashes (字节级重算 proofHash)
//     → 断言所有分量存在 + 链式 hash 完整 + 重算字节相等 + 诚实降级
//
// 反假绿：每个断言都基于真实文件/真实重算，无空断言。
// 诚实边界（ASK-9）：sealedConclusion 绝不等于 CONFIRMED。
//
// 历史溯源：
//            09_PROOF_CARRYING_RESEARCH_OBJECT.md §4 +
//            17_FINAL_AUDIT.md（拱心石可交付）——均已归档（备份 FAR-Lab_Backups/）·运行时 SSOT 以本测试源码实测为准。
// 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { zstdDecompressSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

import { buildDemoChain, computeEnvHash, DEMO_GIT_COMMIT_SHA, DEMO_RUN_ID } from '../../src/far_proof/demo_chain.ts';
import { exportFarProof, packageFarProofBundle, verifyFarProofPackageIntegrity } from '../../src/far_proof/index.ts';
import { resolveTar } from '../../src/far_proof/offline_package.ts';
import { recomputeProofHashes } from '../../scripts/recompute_proof_hashes.ts';
import { verifyChainHead } from '../../src/evidence_log/index.ts';

// 九分量（09 §5 V1 子集）+ code/MANIFEST.md（共 10 个产物）
const EXPECTED_FILES = [
  'ro-crate-metadata.json',
  'prov.ttl',
  'proof_envelopes.jsonl',
  'proof_envelopes_v2.jsonl', // A3:V2 envelope 可选分量(完整 envelope_json·第三方独立重算 RULE-PE-010)
  'repro_runs.jsonl',
  'call_records.redacted.jsonl',
  'claim_graph.json',
  'otel-trace.jsonl',
  'lifecycle_events.jsonl', // IC-05:可选分量(0021 前老包无此文件仍合法)
  'data_manifest.json',
  'README_REPLAY.md',
	  'code/MANIFEST.md',
	  'SOURCES-ATTRIBUTION.txt', // C2: ODC-BY / CC0 third-party attribution (compliance §5.6)
	] as const;

interface RunExportOutput {
  readonly result: ReturnType<typeof exportFarProof>;
  readonly chain: ReturnType<typeof buildDemoChain>;
  readonly outputDir: string;
}

function runExport(tmpDir: string): RunExportOutput {
  const db = new Database(':memory:');
  try {
    const chain = buildDemoChain(db);
    const envHash = computeEnvHash({
      schemaVersion: 6,
      nodeVersion: process.version,
      providerProfile: 'offline_replay',
    });
    const outputDir = join(tmpDir, '.far-proof');
    const result = exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash,
      exportedAt: '2026-06-28T00:00:00.000Z',
    });
    return { result, chain, outputDir };
  } finally {
    db.close();
  }
}

test('demo chain: C-ASTRO-0001 → UNTESTED machine verdict (legacy 路径无统计注入) → seal never CONFIRMED (ASK-9)', () => {
  const db = new Database(':memory:');
  try {
    const chain = buildDemoChain(db);
    // 机器裁决 = UNTESTED（非 REFUTED）：legacy 适配路径不注入 pValue/adjustedPValue → kernel R6 refutes
    // 门不触发 → NO_DECISION_PATH。demo_chain 演示完整密封链形状，真实 REFUTED 由 P1-5 hero pipeline 演示。
    // 锁 === 'UNTESTED' 防弱断言（!==CONFIRMED）放任语义漂移。
    assert.equal(chain.machineVerdict, 'UNTESTED', 'legacy demo path yields UNTESTED (no statistics injection)');
    // 密封结论：ASK-9 绝不 CONFIRMED。
    assert.notEqual(
      chain.sealedConclusion,
      'CONFIRMED',
      'sealed conclusion must never be CONFIRMED (ASK-9)',
    );
    // 信封 sealedBy 确定性（禁 LLM·F3）。
    assert.equal(chain.sealed.envelope.sealedBy, 'deterministic_sealer');
    // proofHash 64 字符 hex。
    assert.match(chain.sealed.envelope.proofHash, /^[0-9a-f]{64}$/);
    // knownFailures 透明（F9）—— 含 TESS 沙箱类型层声明。
    assert.ok(chain.sealed.envelope.knownFailures.length >= 1);
    assert.ok(
      chain.sealed.envelope.knownFailures.some((f) => f.includes('TESS')),
      'knownFailures should transparently declare TESS sandbox limitation',
    );
    // 数据层落库验证。
    const envelopeCount = db
      .prepare('SELECT COUNT(*) AS cnt FROM proof_envelopes')
      .get() as { cnt: number };
    assert.equal(envelopeCount.cnt, 1, 'exactly one sealed envelope should be persisted');
  } finally {
    db.close();
  }
});

test('exportFarProof writes all 9+1 components and chain verifies', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-export-'));
  try {
    const { result, outputDir } = runExport(tmp);

    // 1. 所有 10 个产物存在。
    for (const file of EXPECTED_FILES) {
      const filePath = join(outputDir, file);
      assert.equal(
        existsSync(filePath),
        true,
        `expected file ${file} to exist in export`,
      );
    }
    assert.equal(
      result.filesWritten.length,
      EXPECTED_FILES.length,
      `expected ${EXPECTED_FILES.length} files written, got ${result.filesWritten.length}`,
    );

    // 2. 链式 hash 完整（导出期自验）。
    assert.equal(result.hashVerification.ok, true, 'exported chain should verify');
    assert.equal(result.hashVerification.brokenAtSeq, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('recompute proofHash byte-equal after export (verification not trust)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-recompute-'));
  try {
    const { outputDir } = runExport(tmp);
    const jsonlPath = join(outputDir, 'proof_envelopes.jsonl');

    // 独立重算（不信任导出机器）。
    const recompute = recomputeProofHashes(jsonlPath);
    assert.equal(recompute.checked, 1, 'exactly one envelope in export');
    assert.equal(recompute.mismatches.length, 0, 'proofHash must be byte-equal after recompute');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('prov.ttl runId interpolation is real (no literal ${runId} residue)', () => {
  // 防回归：曾因单引号字符串导致 ${runId} 字面量残留·两个引用处都必须插值。
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-prov-'));
  try {
    const { outputDir } = runExport(tmp);
    const prov = readFileSync(join(outputDir, 'prov.ttl'), 'utf8');
    // 不得残留未插值的 ${runId} 字面量。
    assert.doesNotMatch(prov, /\$\{runId\}/, 'prov.ttl must not contain literal ${runId}');
    // runId 必须在两个引用处都出现（Activity IRI + wasGeneratedBy）。
    const occurrences = prov.split(DEMO_RUN_ID).length - 1;
    assert.ok(
      occurrences >= 2,
      `prov.ttl should reference runId at least twice (Activity + wasGeneratedBy), got ${occurrences}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('README_REPLAY locks gitCommitSha + envHash and points to real recompute script', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-readme-'));
  try {
    const { outputDir } = runExport(tmp);
    const readme = readFileSync(join(outputDir, 'README_REPLAY.md'), 'utf8');
    // 锁定 git commit（fresh-clone 锚点）。
    assert.ok(readme.includes(DEMO_GIT_COMMIT_SHA), 'README should lock gitCommitSha');
    // 引用真实存在的重算脚本。
    assert.ok(
      readme.includes('scripts/recompute_proof_hashes.ts'),
      'README should point to the real recompute script',
    );
    assert.ok(
      readme.includes('scripts/replay_demo_chain.ts'),
      'README should point to the real replay script',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('call_records.redacted.jsonl excludes request/response payloads (API key safety)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-redact-'));
  try {
    const { outputDir } = runExport(tmp);
    const lines = readFileSync(join(outputDir, 'call_records.redacted.jsonl'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    assert.ok(lines.length >= 1, 'redacted call records should have >= 1 row');
    for (const line of lines) {
      const row = JSON.parse(line) as Record<string, unknown>;
      // 脱敏：禁含 request_payload / response_payload（可能含 key·安全红线）。
      assert.ok(
        !('request_payload' in row),
        'redacted record must not contain request_payload',
      );
      assert.ok(
        !('response_payload' in row),
        'redacted record must not contain response_payload',
      );
      // 禁含明文 key（安全）。
      const serialized = JSON.stringify(row);
      assert.doesNotMatch(serialized, /sk-[a-zA-Z0-9]{16,}/, 'no plaintext API key in redacted record');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ro-crate-metadata.json embeds gitCommitSha + envHash (fresh-clone lock)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-rocrate-'));
  try {
    const { outputDir } = runExport(tmp);
    const metadata = JSON.parse(readFileSync(join(outputDir, 'ro-crate-metadata.json'), 'utf8')) as {
      '@graph': Array<Record<string, unknown>>;
    };
    const graph = metadata['@graph'];
    const gitNode = graph.find((node) => node['@id'] === '#git_commit');
    const envNode = graph.find((node) => node['@id'] === '#env_hash');
    assert.ok(gitNode, 'ro-crate @graph should contain #git_commit node');
    assert.ok(envNode, 'ro-crate @graph should contain #env_hash node');
    assert.equal(gitNode!.sha, DEMO_GIT_COMMIT_SHA);
    assert.ok(typeof envNode!.value === 'string' && (envNode!.value as string).length === 64);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('claim_graph.json contains evidence DAG nodes + edges (09 §5 V1 · 15 §7)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-claim-graph-'));
  try {
    const { outputDir, chain } = runExport(tmp);
    const graph = JSON.parse(readFileSync(join(outputDir, 'claim_graph.json'), 'utf8')) as {
      format: string;
      nodeCount: number;
      edgeCount: number;
      nodes: unknown[];
      edges: unknown[];
    };
    assert.equal(graph.format, 'far-chain-claim-graph');
    assert.ok(graph.nodeCount >= 1, 'claim_graph should have >=1 node from demo chain');
    assert.equal(graph.nodes.length, graph.nodeCount);
    assert.equal(graph.edges.length, graph.edgeCount);
    // 节点含 demo chain 落库的 verdictNodeId（verdict_nodes 子图锚定）。
    const serialized = JSON.stringify(graph);
    assert.ok(
      serialized.includes(chain.sealed.envelope.verdictNodeId),
      'claim_graph should include the sealed envelope verdictNodeId',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('otel-trace.jsonl projects call_records to OTel GenAI spans (09 §5 V1基本 · 15 §1)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-otel-'));
  try {
    const { outputDir } = runExport(tmp);
    const lines = readFileSync(join(outputDir, 'otel-trace.jsonl'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    assert.ok(lines.length >= 1, 'otel-trace should have >=1 span from demo chain call_records');
    for (const line of lines) {
      const span = JSON.parse(line) as {
        traceId: string;
        spanId: string;
        name: string;
        kind: string;
        attributes: Record<string, unknown>;
      };
      // OTel span 格式合规：traceId(32 hex)/spanId(16 hex)/name/kind。
      assert.match(span.traceId, /^[0-9a-f]{32}$/);
      assert.match(span.spanId, /^[0-9a-f]{16}$/);
      assert.ok(span.name.startsWith('llm_call/'));
      assert.equal(span.kind, 'SPAN_KIND_INTERNAL');
      // V1 诚实标注：投影源 + 模型中立 gen_ai.system（非厂商）。
      assert.equal(span.attributes['far_chain.source'], 'call_records_projection');
      assert.equal(span.attributes['gen_ai.system'], 'far_chain_gateway');
      // 安全红线：禁明文 key。
      assert.doesNotMatch(line, /sk-[a-zA-Z0-9]{16,}/, 'no plaintext API key in otel span');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('verifyChainHead independently confirms exported evidence_log integrity', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-chain-'));
  try {
    const db = new Database(':memory:');
    try {
      buildDemoChain(db);
      const verify = verifyChainHead(db);
      assert.equal(verify.ok, true, 'evidence_log chain must verify');
      // FEC 至少写入 1 条 call_record（C-ASTRO-0001 hypothesis）。
      assert.ok(verify.verifiedCount >= 1, `expected >=1 verified record, got ${verify.verifiedCount}`);
    } finally {
      db.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('packageFarProofBundle writes verify.sh + integrity.json + real .tar.zst archive', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-package-'));
  try {
    const { outputDir } = runExport(tmp);
    const packaged = packageFarProofBundle({
      bundleDir: outputDir,
      generatedAt: '2026-06-28T00:00:00.000Z',
    });

    assert.equal(packaged.compression, 'zstd');
    assert.equal(existsSync(packaged.archivePath), true, 'archive should exist');
    assert.equal(existsSync(packaged.verifyScriptPath), true, 'verify.sh should exist');
    assert.equal(existsSync(packaged.integrityPath), true, 'integrity.json should exist');
    assert.match(packaged.archiveSha256, /^[0-9a-f]{64}$/);

    const integrity = JSON.parse(readFileSync(packaged.integrityPath, 'utf8')) as {
      integrityHash: string;
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    assert.equal(integrity.integrityHash, packaged.integrityHash);
    assert.ok(integrity.files.some((file) => file.path === 'verify.sh'), 'verify.sh must be integrity-protected');
    assert.ok(
      integrity.files.some((file) => file.path === 'proof_envelopes.jsonl'),
      'proof_envelopes.jsonl must be integrity-protected',
    );
    assert.ok(
      !integrity.files.some((file) => file.path === 'integrity.json'),
      'integrity.json must be excluded to avoid self-reference',
    );

    const archiveBytes = readFileSync(packaged.archivePath);
    assert.deepEqual(
      Array.from(archiveBytes.subarray(0, 4)),
      [0x28, 0xb5, 0x2f, 0xfd],
      '.tar.zst should start with zstd magic bytes',
    );

    const integrityCheck = verifyFarProofPackageIntegrity(outputDir);
    assert.equal(integrityCheck.ok, true, integrityCheck.errors.join(' | '));
    assert.equal(integrityCheck.integrityHash, packaged.integrityHash);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('verifyFarProofPackageIntegrity detects post-package tamper', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-package-tamper-'));
  try {
    const { outputDir } = runExport(tmp);
    packageFarProofBundle({
      bundleDir: outputDir,
      generatedAt: '2026-06-28T00:00:00.000Z',
    });
    writeFileSync(join(outputDir, 'README_REPLAY.md'), '# tampered\n', 'utf8');

    const integrityCheck = verifyFarProofPackageIntegrity(outputDir);
    assert.equal(integrityCheck.ok, false);
    assert.ok(
      integrityCheck.errors.some((error) => /INTEGRITY_(HASH|FILE)_MISMATCH/.test(error)),
      `tamper should be reported by integrity verifier: ${integrityCheck.errors.join(' | ')}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('packaged verify.sh runs after .tar.zst extraction (offline verifier path)', (t) => {
  // 诚实边界：verify.sh 是 POSIX 脚本·Windows 缺 sh → spawnSync ENOENT (status===null) → skip。
  // 非代码 bug：同 sandbox_real.test.ts 缺 python 的 skip 模式·CI/Linux 有 sh 跑全断言。不禁断言放行。
  const shProbe = spawnSync('sh', ['-c', 'echo ok'], { encoding: 'utf8' });
  if (shProbe.error !== undefined || shProbe.status === null) {
    t.skip('POSIX sh not on PATH (Windows) — verify.sh offline path exercised on CI/Linux');
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-package-verify-sh-'));
  try {
    const { outputDir } = runExport(tmp);
    const packaged = packageFarProofBundle({
      bundleDir: outputDir,
      generatedAt: '2026-06-28T00:00:00.000Z',
    });

    const extractDir = join(tmp, 'extract');
    const tarPath = join(tmp, 'bundle.tar');
    mkdirSync(extractDir, { recursive: true });
    writeFileSync(tarPath, zstdDecompressSync(readFileSync(packaged.archivePath)));
    const tar = resolveTar();
    execFileSync(tar.binary, [...tar.extraArgs, '-xf', tarPath, '-C', extractDir]);

    const verifyPath = join(extractDir, basename(outputDir), 'verify.sh');
    const result = spawnSync('sh', [verifyPath], {
      cwd: process.cwd(),
      env: { ...process.env, FAR_REPO_ROOT: process.cwd() },
      encoding: 'utf8',
      // CI 韧性（同 cross_lang_consistency 原则）：离线 verify 路径 <10s，60s 上限防 CI 偶发阻塞。
      timeout: 60_000,
    });

    assert.equal(result.status, 0, `verify.sh stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    assert.match(result.stdout, /integrity OK:/);
    assert.match(result.stdout, /"status": "WARN"/, 'V1 minimal bundle should verify cleanly with WARN boundary');
    assert.match(result.stdout, /"tamperStatus": "clean"/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
