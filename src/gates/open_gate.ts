/**
 * open_gate — GATE-OPEN-001 Open Source & Release Gate（聚合器模式）。
 *
 * 聚合**真实子门**（全部为 main 已合入的可 import 资产，不复制逻辑）：
 *   1. compliance        → src/release/compliance.ts runComplianceChecklist 十项
 *                           + verifyLegalUnknowns（法律未知项缓解绑定）；
 *   2. security-policy   → src/security/security_response.ts checkSecurityPolicyAssets；
 *   3. supply-chain      → src/release/supply_chain.ts verifySupplyBundle（调用方
 *                           提供 artifactDir + signed bundle——无输入 = 缺项 FAIL，
 *                           不允许「没签就发」）；
 *   4. reproducibility   → .far-proof 验证面在场（exporter/verifier 资产 +
 *                           CLI verify 命令注册）；
 *   5. compat-rollback   → src/release/compat_matrix.ts 表面读取 +
 *                           rollback_drill.ts verifyRollbackPaths；
 *   6. disclosure        → benchmark 资产（demo_seeds registry 非空）+ negative
 *                           result 面（report/limitations 模块在场）；
 *   7. contributor-path  → CONTRIBUTING.md + NOTICE 在场（公共贡献路径）。
 *
 * 单一裁决：全部子门 PASS → PASS；任何子门 FAIL → FAIL + 逐子门缺项列表
 * （缺什么、为什么）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 门证明「发布所需资产在场且通过机器可验部分」——供应链子门只验调用方
 *     提交的 artifact bundle，不证明发布渠道（GitHub Release/npm）实际未漂移；
 *   - compliance 十项的 cannotProve 面由各子门自带（法务判断不可机器代行）；
 *   - 聚合器不证明子门实现的正确性（那是各子门测试的职责）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runComplianceChecklist, verifyLegalUnknowns } from '../release/compliance.ts';
import { verifySupplyBundle, type SupplyBundle } from '../release/supply_chain.ts';
import { readCliCommands } from '../release/compat_matrix.ts';
import { verifyRollbackPaths } from '../release/rollback_drill.ts';
import { checkSecurityPolicyAssets } from '../security/security_response.ts';

export type OpenSubGateId =
  | 'compliance'
  | 'legal-unknowns'
  | 'security-policy'
  | 'supply-chain'
  | 'reproducibility'
  | 'compat-rollback'
  | 'disclosure'
  | 'contributor-path';

export interface OpenSubGateReport {
  readonly gate: OpenSubGateId;
  readonly pass: boolean;
  readonly problems: readonly string[];
  /** 宪法语义的通过条件摘要（审计面）。 */
  readonly covers: string;
}

export interface OpenGateInput {
  readonly repoRoot: string;
  /** 供应链子门输入：已签名 artifact 目录 + bundle。缺省 = 子门 FAIL（缺项）。 */
  readonly supplyBundle?: { readonly artifactDir: string; readonly bundle: SupplyBundle } | undefined;
  /** 外部信任公钥（PEM；缺省用 bundle 自含公钥）。 */
  readonly trustedPublicKeyPem?: string | undefined;
}

export interface OpenGateReport {
  readonly pass: boolean;
  readonly subGates: readonly OpenSubGateReport[];
  /** FAIL 时的缺项摘要（gate: problems 列表）。 */
  readonly missing: readonly string[];
}

function subGate(gate: OpenSubGateId, pass: boolean, problems: readonly string[], covers: string): OpenSubGateReport {
  return { gate, pass, problems, covers };
}

/**
 * 开源发布门聚合入口。任何子门 FAIL → 整体 FAIL；missing 列出全部缺项
 * （不只第一个——修复清单完整面）。
 */
export function openReleaseGate(input: OpenGateInput): OpenGateReport {
  const root = input.repoRoot;

  // 1. compliance 十项 + 2. legal unknowns
  const complianceItems = runComplianceChecklist(root);
  const complianceProblems = complianceItems.filter((i) => !i.ok).map((i) => `${i.id}: ${i.problems.join('; ')}`);
  const compliance = subGate('compliance', complianceProblems.length === 0, complianceProblems, 'license/notice/attribution/privacy/AI-disclosure 十项');

  const legal = verifyLegalUnknowns();
  const legalGate = subGate('legal-unknowns', legal.ok, legal.problems, '每个 OPEN 法律未知项必须有缓解绑定');

  // 3. security policy assets
  const policy = checkSecurityPolicyAssets(root);
  const policyGate = subGate('security-policy', policy.ok, policy.missing, 'SECURITY.md 报告渠道/支持版本/披露流程');

  // 4. supply chain（无输入 = 缺项 FAIL——发布必须携带签名产物包）
  let supply: OpenSubGateReport;
  if (input.supplyBundle === undefined) {
    supply = subGate('supply-chain', false, ['no signed supply bundle provided — a release must ship checksums + Ed25519 signature'], 'SBOM/checksums/签名/撤销名单');
  } else {
    const v =
      input.trustedPublicKeyPem === undefined
        ? verifySupplyBundle(input.supplyBundle.artifactDir, input.supplyBundle.bundle)
        : verifySupplyBundle(input.supplyBundle.artifactDir, input.supplyBundle.bundle, {
            trustedPublicKeyPem: input.trustedPublicKeyPem,
          });
    supply = subGate('supply-chain', v.ok, v.problems, 'SBOM/checksums/签名/撤销名单');
  }

  // 5. reproducibility：.far-proof 验证面在场（exporter + verifier + CLI verify 注册）
  const reproAssets: readonly [string, readonly string[]][] = [
    ['src/far_proof/exporter.ts', ['far-proof']],
    ['src/cli/far.ts', ['verify']],
  ];
  const reproProblems: string[] = [];
  for (const [rel, markers] of reproAssets) {
    const full = join(root, rel);
    if (!existsSync(full)) {
      reproProblems.push(`missing reproducibility asset: ${rel}`);
      continue;
    }
    const text = readFileSync(full, 'utf8');
    for (const marker of markers) {
      if (!text.includes(marker)) reproProblems.push(`${rel} lacks "${marker}"`);
    }
  }
  const cliCommands = existsSync(join(root, 'src/cli/far.ts')) ? readCliCommands(root) : [];
  if (!cliCommands.includes('verify')) reproProblems.push('CLI surface does not register the third-party "verify" command');
  const repro = subGate('reproducibility', reproProblems.length === 0, reproProblems, '.far-proof 导出/独立重算验证命令');

  // 6. compat/rollback
  const rollback = verifyRollbackPaths(root);
  const compatProblems = rollback.checks.filter((c) => !c.ok).map((c) => c.problem ?? 'rollback asset check failed');
  if (cliCommands.length === 0) compatProblems.push('CLI command surface unreadable — compatibility matrix cannot be derived');
  const compat = subGate('compat-rollback', compatProblems.length === 0, compatProblems, '兼容矩阵/迁移/回滚路径演练资产');

  // 7. disclosure：benchmark 资产非空 + negative-result 面在场
  const disclosureProblems: string[] = [];
  const seedsDir = join(root, 'src/demo_seeds');
  if (!existsSync(seedsDir) || !existsSync(join(seedsDir, 'registry.ts'))) {
    disclosureProblems.push('benchmark seed registry missing (src/demo_seeds/registry.ts)');
  }
  if (!existsSync(join(root, 'src/report/limitations.ts'))) {
    disclosureProblems.push('negative-result/limitations module missing (src/report/limitations.ts)');
  }
  const disclosure = subGate('disclosure', disclosureProblems.length === 0, disclosureProblems, 'benchmark 规模披露 + 负结果/局限披露');

  // 8. contributor path
  const contributorProblems: string[] = [];
  for (const [rel, marker] of [
    ['CONTRIBUTING.md', 'Contributing to FAR-Lab'],
    ['NOTICE', '第三方'],
  ] as const) {
    const full = join(root, rel);
    if (!existsSync(full)) contributorProblems.push(`missing ${rel}`);
    else if (!readFileSync(full, 'utf8').includes(marker)) contributorProblems.push(`${rel} lacks expected contributor-path marker`);
  }
  const contributor = subGate('contributor-path', contributorProblems.length === 0, contributorProblems, '公共贡献路径 + 第三方登记');

  const subGates = [compliance, legalGate, policyGate, supply, repro, compat, disclosure, contributor];
  const missing = subGates.filter((g) => !g.pass).flatMap((g) => g.problems.map((p) => `${g.gate}: ${p}`));
  return { pass: subGates.every((g) => g.pass), subGates, missing };
}
