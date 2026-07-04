// scripts/replay_demo_chain.ts
// 职责：构造 demo 证明链（C-ASTRO-0001 REFUTED）→ 导出完整 .far-proof 包 →
//       调 recompute_proof_hashes 字节级重算 → 打印摘要。
// 权威 SSOT：FINAL_PACKAGE/15_OPEN_SCIENCE_EXPORT.md §1（九分量导出）+
//            09_PROOF_CARRYING_RESEARCH_OBJECT.md（ProofEnvelope 密封）+
//            17_FINAL_AUDIT.md（拱心石可交付）。
//
// 这是 README_REPLAY.md 第 4 步引用的重放脚本。fresh-clone 后：
//   pnpm exec tsx scripts/replay_demo_chain.ts [outputDir]
// 默认输出到 ./.far-proof-demo/。
//
// 诚实边界：
//   - 全程 offline_replay，无真实模型调用，无 API key 需求。
//   - 机器密封结论绝不 CONFIRMED（ASK-9 降级）。
//   - gitCommitSha 为 demo fixture 值（生产应注入 git rev-parse HEAD）。
//
// 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。

import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportFarProof } from '../src/far_proof/index.ts';
import { packageFarProofBundle } from '../src/far_proof/offline_package.ts';
import {
  buildDemoChain,
  computeEnvHash,
  DEMO_CLAIM_ID,
  DEMO_EXPORTED_AT,
  DEMO_GIT_COMMIT_SHA,
  DEMO_MODEL_SNAPSHOT,
  DEMO_RUN_ID,
} from '../src/far_proof/demo_chain.ts';
import { recomputeProofHashes } from './recompute_proof_hashes.ts';
import { verifyChainHead } from '../src/evidence_log/index.ts';

function main(): void {
  const outputDirArg = process.argv[2];
  const outputDir = resolve(
    outputDirArg !== undefined ? outputDirArg : '.far-proof-demo',
  );

  // 清理旧产物（幂等重放）。
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }

  const db = new Database(':memory:');
  try {
    // 1. 构造 demo 证明链（FEC → 裁决 → 密封）。
    const chain = buildDemoChain(db);

    // 2. 启动期链式自验（evidence_log 哈希链完整性）。
    const chainVerify = verifyChainHead(db);
    if (!chainVerify.ok) {
      throw new Error(
        `replay_demo_chain: evidence_log chain broken at seq=${chainVerify.brokenAtSeq}`,
      );
    }

    // 3. 环境指纹（诚实记录真实运行环境；非 proofHash 输入）。
    const envHash = computeEnvHash({
      schemaVersion: 6,
      nodeVersion: process.version,
      providerProfile: 'offline_replay',
    });

    // 4. 导出九分量 .far-proof 包。
    const exportResult = exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: DEMO_MODEL_SNAPSHOT,
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash,
      exportedAt: DEMO_EXPORTED_AT,
    });

    if (!exportResult.hashVerification.ok) {
      throw new Error(
        `replay_demo_chain: exported chain verification failed (brokenAtSeq=${exportResult.hashVerification.brokenAtSeq})`,
      );
    }

    // 5. 字节级重算 proofHash（"verification not trust"）。
    const recompute = recomputeProofHashes(`${outputDir}/proof_envelopes.jsonl`);
    if (recompute.mismatches.length > 0) {
      throw new Error(
        `replay_demo_chain: ${recompute.mismatches.length} proofHash mismatch(es) after export`,
      );
    }

    const packageResult = packageFarProofBundle({
      bundleDir: outputDir,
      archivePath: `${outputDir}.tar.zst`,
      generatedAt: DEMO_EXPORTED_AT,
    });

    // 6. 摘要（人类可读·诚实声明 demo 边界）。
    console.log('=========================================');
    console.log('  FAR-Chain Demo Proof Chain — REPLAY OK');
    console.log('=========================================');
    console.log(`  claim:        ${DEMO_CLAIM_ID}`);
    console.log(`  claim text:   ${chain.claimText}`);
    console.log(`  machine verdict (pre-seal): ${chain.machineVerdict}`);
    console.log(`  sealed conclusion:          ${chain.sealedConclusion}`);
    console.log(`  run id:        ${DEMO_RUN_ID}`);
    console.log(`  git commit:    ${DEMO_GIT_COMMIT_SHA} (demo fixture)`);
    console.log(`  env hash:      ${envHash.slice(0, 16)}…`);
    console.log(`  exported at:   ${DEMO_EXPORTED_AT}`);
    console.log(`  output dir:    ${outputDir}`);
    console.log(`  files written: ${exportResult.filesWritten.length}`);
    console.log(`  chain verify:  OK (${chainVerify.verifiedCount} records)`);
    console.log(`  proofHash recompute: OK (${recompute.checked} envelope(s) byte-equal)`);
    console.log(`  offline package: ${packageResult.archivePath}`);
    console.log(`  integrity root:  ${packageResult.integrityHash.slice(0, 16)}…`);
    console.log('');
    console.log('  Honesty: CONFIRMED is never machine-sealed (ASK-9).');
    console.log('           TESS sandbox is type-layer only (F4 · V2 physical isolation).');
    console.log('           gitCommitSha is a demo fixture, not the real repo HEAD.');
    console.log('=========================================');
  } finally {
    db.close();
  }
}

// 仅当作为脚本直接运行时执行（被测试 import 时不触发）。
const argv1 = process.argv[1];
const invokedDirectly = argv1 !== undefined && pathToFileURL(argv1).href === import.meta.url;
if (invokedDirectly) {
  main();
}
