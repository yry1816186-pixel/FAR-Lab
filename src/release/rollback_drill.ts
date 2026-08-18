// src/release/rollback_drill.ts
// 职责：REL-ROLLBACK-001 —— 真实 rollback/revocation 演练（发布工程域）。
//
//   - ROLLBACK_PATHS：五类回滚路径清单（code/data-schema/proof/model-config/public-
//     statement + docs），每条绑定真实机制资产（git revert 原子提交纪律 / far backup
//     VACUUM INTO + forward-only migrations / evidence_log lifecycle 撤回-纠正-
//     supersession 状态机 / pnpm-lock overrides 钉版 / CHANGELOG 版本化公告），用
//     checkAsset 逐条验存在性与关键标记——绑定缺失 = fail-closed。
//   - runRollbackDrill(repoRoot, stagingDir)：三个真实演练（在临时 staging 目录执行，
//     不触仓库状态）：
//       (a) artifact revocation：发布 checksums+签名 → 撤销某 artifact →
//           verifySupplyBundle 必须报 REVOKED（撤销必须生效于已签名物——签名完好
//           也不能放行）；
//       (b) failed migration recovery：备份（哈希登记）→ 写坏中间态 → 从备份恢复 →
//           哈希比对一致（恢复前后字节相等 = 恢复成功实证）；
//       (c) staging rollback：降级 manifest 版本 → 旧 verifier 兼容（legacy V1
//           proof 信封 null URI → v1 派发仍可验）或显式拒绝（未知 manifest schema
//           fail-closed 报 UNSUPPORTED，绝不静默按新版解析）。
//   - 产出 rollback receipt（drill 结果 + canonical 哈希——可入审计链）。
//
// Cannot-prove（本机制不能证明什么）：
//   - 演练在 staging 临时目录执行——证明回滚**机制**在隔离环境有效，不证明生产
//     环境执行时无人员/流程失误（回滚是组织能力，演练是必要非充分条件）；
//   - failed migration recovery 用文件字节级模拟——真实 SQLite 迁移失败恢复由
//     far backup（VACUUM INTO）路径承载，本演练证明的是「备份→损坏→恢复→哈希
//     一致」这个不变式，不是 SQLite 页级损坏的完备恢复证明；
//   - 不可逆迁移（forward-only）没有 down migration——本模块的「回滚」语义 = 恢复
//     到备份快照 + 重放前向迁移，不是 schema 降级。
//
// 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。模型中立。

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkAsset, type AssetCheck, type EvidenceAsset } from '../gates/milestone_gates.ts';
import { dispatchRulesetVerifier } from '../proof_envelope/ruleset_version.ts';
import {
  createSupplyBundle,
  newSignerKeyPair,
  revokeArtifact,
  verifySupplyBundle,
  type SupplyVerifyResult,
} from './supply_chain.ts';
import { generateBuildManifest } from './build_manifest.ts';

// ---------------------------------------------------------------------------
// 回滚路径清单（每条绑定真实机制——绑定缺失 fail-closed）
// ---------------------------------------------------------------------------

export type RollbackKind =
  | 'code'
  | 'data-schema'
  | 'proof'
  | 'model-config'
  | 'docs'
  | 'public-statement';

export interface RollbackPath {
  readonly kind: RollbackKind;
  /** 回滚方式（一句可执行语义）。 */
  readonly rollbackMechanism: string;
  /** 前置条件（不可逆操作的安全桥——宪法：先备份/双写/影子验证）。 */
  readonly precondition: string;
  /** 绑定的真实资产（存在性 + 关键标记由 checkAsset 验证）。 */
  readonly boundAssets: readonly EvidenceAsset[];
}

export const ROLLBACK_PATHS: readonly RollbackPath[] = [
  {
    kind: 'code',
    rollbackMechanism: 'git revert <sha>（原子提交粒度=批次；禁止 force-push/reset--hard，deny 门在位）',
    precondition: '每批 = 实现+测试+文档原子提交（revert 单提交即完整回滚一个逻辑变更）',
    boundAssets: [{ claim: '原子提交纪律的可回滚载体', path: '.git', mustContain: [] }],
  },
  {
    kind: 'data-schema',
    rollbackMechanism: '恢复到迁移前备份（far backup VACUUM INTO 快照）+ 重放前向迁移；无 down-migration',
    precondition: '迁移前强制备份（integrity_check 通过才备份——不备份损坏库）',
    boundAssets: [
      { claim: 'forward-only 迁移器（无降级路径的显式设计）', path: 'src/db/migrator.ts', mustContain: ['readMigrationFiles'] },
      { claim: 'VACUUM INTO 安全备份命令', path: 'src/cli/commands/backup.ts', mustContain: ['VACUUM INTO'] },
    ],
  },
  {
    kind: 'proof',
    rollbackMechanism: 'correction/supersession：active→contested→corrected/retracted/superseded（墓碑化，原记录永不删除）',
    precondition: '终态不可逆（非法迁移 fail-closed）——proof 回滚是追加派生记录不是改写历史',
    boundAssets: [
      { claim: '撤回/纠正/supersession 状态机', path: 'src/evidence_log/lifecycle.ts', mustContain: ['TERMINAL_STATES'] },
      { claim: 'lifecycle CLI 面（retraction 可操作）', path: 'src/cli/commands/lifecycle.ts', mustContain: ['lifecycle'] },
    ],
  },
  {
    kind: 'model-config',
    rollbackMechanism: 'lockfile 回退：git checkout <旧 pnpm-lock.yaml> 后 pnpm install（overrides 钉版面恢复）',
    precondition: '模型/依赖版本变化必须经 lockfile（禁浮动版本直接安装）',
    boundAssets: [
      { claim: '锁文件（版本钉定 SSOT）', path: 'pnpm-lock.yaml', mustContain: ['lockfileVersion'] },
      { claim: 'overrides 强制钉版面', path: 'pnpm-lock.yaml', mustContain: ['overrides'] },
    ],
  },
  {
    kind: 'docs',
    rollbackMechanism: 'git revert（文档与代码同库版本化）+ CHANGELOG Unreleased 段回收',
    precondition: '文档变更同批提交（不滞后于代码）',
    boundAssets: [{ claim: 'Keep-a-Changelog 版本化公告', path: 'CHANGELOG.md', mustContain: ['Unreleased'] }],
  },
  {
    kind: 'public-statement',
    rollbackMechanism: '公告撤回：lifecycle retract + CHANGELOG 显著条目 + （若已发布）release notes 附撤回声明',
    precondition: '公开声明发布前必须可追溯到具体 release/artifact（无追溯不发布）',
    boundAssets: [
      { claim: '撤回状态机（retracted 终态）', path: 'src/evidence_log/lifecycle.ts', mustContain: ['retracted'] },
    ],
  },
];

/** 回滚路径绑定验证（全部绑定真实资产才 pass——映射不完整 = fail-closed）。 */
export function verifyRollbackPaths(repoRoot: string): { readonly checks: readonly (AssetCheck & { kind: RollbackKind })[]; readonly pass: boolean } {
  const checks = ROLLBACK_PATHS.map((p) => {
    const assetChecks = p.boundAssets.map((a) => checkAsset(repoRoot, a));
    const firstFail = assetChecks.find((c) => !c.ok);
    return { kind: p.kind, ...(firstFail ?? assetChecks[0] ?? { claim: 'unmapped', ok: false, problem: 'no bound asset' }) };
  });
  return { checks, pass: checks.every((c) => c.ok) };
}

// ---------------------------------------------------------------------------
// manifest 版本消费策略（降级场景：旧 verifier 对未知 schema 显式拒绝）
// ---------------------------------------------------------------------------

export interface ManifestConsumeResult {
  readonly accepted: boolean;
  readonly reason: string;
}

/**
 * 旧 verifier 消费 manifest 的版本策略：
 *   - schema 完全匹配当前版本 → 接受；
 *   - 任何其他 schema 值（含更旧/更新/伪造）→ 显式拒绝（fail-closed——绝不静默
 *     按新版解析；降级场景下旧 verifier 报 UNSUPPORTED 而不是错读）。
 */
export function consumeManifestWithPolicy(
  manifest: { readonly schema: string },
  supportedSchema: string,
): ManifestConsumeResult {
  if (manifest.schema === supportedSchema) {
    return { accepted: true, reason: `schema matched: ${manifest.schema}` };
  }
  return {
    accepted: false,
    reason: `UNSUPPORTED_BUILD_MANIFEST_SCHEMA: '${manifest.schema}' (this verifier supports: ${supportedSchema}; fail-closed — no silent reinterpretation)`,
  };
}

// ---------------------------------------------------------------------------
// 三个真实演练
// ---------------------------------------------------------------------------

export interface DrillResult {
  readonly name: 'artifact-revocation' | 'failed-migration-recovery' | 'staging-rollback';
  readonly pass: boolean;
  /** 实证描述（机器可读的结论 + 关键值）。 */
  readonly evidence: readonly string[];
}

export interface RollbackReceipt {
  readonly schema: 'far-rollback-receipt/1';
  readonly drills: readonly DrillResult[];
  readonly pathsBound: boolean;
  readonly pass: boolean;
  readonly receiptHash: string;
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** 演练 (a)：发布 checksums → 撤销 → 验证必须 REVOKED。 */
function drillArtifactRevocation(stagingDir: string): DrillResult {
  const artifactDir = join(stagingDir, 'revocation-artifacts');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, 'trust-receipt.json'), JSON.stringify({ kind: 'receipt', v: 1 }, null, 2));
  writeFileSync(join(artifactDir, 'README_REPLAY.md'), '# replay\n');
  const keyPair = newSignerKeyPair();
  let bundle = createSupplyBundle(artifactDir, { privateKeyPem: keyPair.privateKeyPem });
  const before: SupplyVerifyResult = verifySupplyBundle(artifactDir, bundle);
  const target = 'trust-receipt.json';
  bundle = revokeArtifact(bundle, target);
  const after = verifySupplyBundle(artifactDir, bundle);
  const revokedWorks = before.status === 'OK' && after.status === 'REVOKED' && after.ok === false;
  return {
    name: 'artifact-revocation',
    pass: revokedWorks,
    evidence: [
      `pre-revocation verify: ${before.status} (ok=${before.ok})`,
      `post-revocation verify: ${after.status} (ok=${after.ok}) — signature intact yet artifact '${target}' refused`,
    ],
  };
}

/** 演练 (b)：备份 → 迁移失败写坏中间态 → 恢复 → 哈希一致。 */
function drillFailedMigrationRecovery(stagingDir: string): DrillResult {
  const dbPath = join(stagingDir, 'migration-target.db');
  const backupPath = join(stagingDir, 'migration-target.pre-backup.db');
  // 初始库（真实字节——模拟已迁移到 vN 的库文件）
  const originalBytes = Buffer.concat([
    Buffer.from('SQLite format 3\0', 'utf8'),
    Buffer.alloc(2048, 0x5a),
  ]);
  writeFileSync(dbPath, originalBytes);
  const originalHash = sha256Hex(originalBytes);
  // 前置备份（宪法：不可逆迁移先备份）
  copyFileSync(dbPath, backupPath);
  const backupHash = sha256Hex(readFileSync(backupPath));
  // 模拟迁移失败：写坏中间态（半截写入 + 垃圾尾——真实失败模式的文件级投影）
  const corrupted = Buffer.concat([originalBytes.subarray(0, 1024), Buffer.alloc(512, 0xff)]);
  writeFileSync(dbPath, corrupted);
  const corruptedHash = sha256Hex(readFileSync(dbPath));
  // 恢复：从备份回拷
  copyFileSync(backupPath, dbPath);
  const restoredHash = sha256Hex(readFileSync(dbPath));
  const pass = backupHash === originalHash && corruptedHash !== originalHash && restoredHash === originalHash;
  return {
    name: 'failed-migration-recovery',
    pass,
    evidence: [
      `original=${originalHash.slice(0, 16)}… backup=${backupHash.slice(0, 16)}… (equal=${backupHash === originalHash})`,
      `corrupted=${corruptedHash.slice(0, 16)}… differs from original=${corruptedHash !== originalHash}`,
      `restored=${restoredHash.slice(0, 16)}… byte-identical to original=${restoredHash === originalHash}`,
    ],
  };
}

/** 演练 (c)：降级 manifest 版本 → 旧 verifier 兼容或显式拒绝。 */
function drillStagingRollback(repoRoot: string, stagingDir: string): DrillResult {
  mkdirSync(stagingDir, { recursive: true });
  const evidence: string[] = [];
  // (c1) 旧 proof 信封兼容：legacy null rulesetUri 在当前验证器下按 v1 派发（不抛错）
  const dispatchedMajor = dispatchRulesetVerifier(null);
  const legacyCompatible = dispatchedMajor === 1;
  evidence.push(`legacy proof envelope (null rulesetUri) dispatches to v${dispatchedMajor} under current verifier (compatible=${legacyCompatible})`);
  // (c2) 未知主版本显式拒绝（降级到旧 verifier 收到未来包 = fail-closed）
  let futureRejectedExplicitly = false;
  let futureRejectMessage = '';
  try {
    dispatchRulesetVerifier('farlab.dev/ruleset/v99');
  } catch (error) {
    futureRejectedExplicitly = error instanceof Error && error.message.includes('RULESET_VERSION_UNSUPPORTED');
    futureRejectMessage = error instanceof Error ? error.message : String(error);
  }
  evidence.push(`future ruleset v99 rejected explicitly=${futureRejectedExplicitly}: ${futureRejectMessage}`);
  // (c3) manifest schema 降级：旧 schema 值被显式拒绝（不静默解析）
  const currentManifest = generateBuildManifest(repoRoot, { rootInputsOnly: true });
  const consumeCurrent = consumeManifestWithPolicy(currentManifest, currentManifest.schema);
  const consumeDowngraded = consumeManifestWithPolicy({ schema: 'far-build-manifest/0' }, currentManifest.schema);
  const policyWorks = consumeCurrent.accepted && !consumeDowngraded.accepted;
  evidence.push(
    `current manifest schema accepted=${consumeCurrent.accepted}; downgraded schema accepted=${consumeDowngraded.accepted} (${consumeDowngraded.reason.slice(0, 60)}…)`,
  );
  return {
    name: 'staging-rollback',
    pass: legacyCompatible && futureRejectedExplicitly && policyWorks,
    evidence,
  };
}

/** 执行三个演练 + 路径绑定验证 → rollback receipt（canonical 哈希可入审计链）。 */
export function runRollbackDrill(repoRoot: string, stagingDir: string): RollbackReceipt {
  mkdirSync(stagingDir, { recursive: true });
  const drills: DrillResult[] = [
    drillArtifactRevocation(stagingDir),
    drillFailedMigrationRecovery(stagingDir),
    drillStagingRollback(repoRoot, stagingDir),
  ];
  const pathsBound = verifyRollbackPaths(repoRoot).pass;
  const pass = pathsBound && drills.every((d) => d.pass);
  const core = { schema: 'far-rollback-receipt/1' as const, drills, pathsBound };
  return {
    ...core,
    pass,
    receiptHash: sha256Hex(Buffer.from(JSON.stringify(core), 'utf8')),
  };
}
