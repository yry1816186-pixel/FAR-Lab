// src/release/compliance.ts
// 职责：REL-COMPLIANCE-001 —— 发布前合规审计（发布工程域）。
//
//   - COMPLIANCE_CHECKLIST 十项逐项 checkAsset 绑定真实文件（LICENSE / NOTICE /
//     依赖许可 / 数据集许可 / 归属 / 再分发权 / 隐私-保留 / 安全策略 / 贡献条款 /
//     AI 模型数据披露），每项声明其**不能证明什么**——checklist 是存在性与标记
//     检查，不是法律意见；缺失 → fail-closed 列表。
//   - LEGAL_UNKNOWNS 登记表：第三方学术元数据再分发权不确定（Crossref 无宽松
//     record-level license 的 abstract）→ 仅元数据模式（abstractWithheldReason
//     门，src/retrieval/types.ts——引用现有 citation/license gate 资产），登记为
//     OPEN 并绑定缓解机制。
//   - complianceReadiness(repoRoot)：十项检查 + 法律未知项登记 + release
//     inventory（package.json files 字段声明的发布面逐一存在性验证）→ 汇总裁定。
//
// Cannot-prove（本机制不能证明什么）：
//   - checklist 证明「声明资产存在且含关键标记」——不证明 LICENSE/NOTICE 内容在
//     任何法域下完备或准确（法律判断由人工/法务承担，本模块是机器可查的下界）；
//   - NOASSERTION 依赖许可（SBOM 中的传递依赖）的真实许可名未经逐一核验——
//     发布前需人工对照 NOTICE 表复核；
//   - LEGAL_UNKNOWNS 的 OPEN 状态意味着「不确定」——仅元数据模式是保守缓解，
//     不是权利确认；关闭未知项需要人工确权（本模块不自动关闭）。
//
// 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。模型中立。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkAsset, type AssetCheck, type EvidenceAsset } from '../gates/milestone_gates.ts';

// ---------------------------------------------------------------------------
// 十项合规 checklist（逐项绑定真实资产 + cannot-prove 声明）
// ---------------------------------------------------------------------------

export type ComplianceItemId =
  | 'project-license'
  | 'notice'
  | 'dependency-licenses'
  | 'dataset-licenses'
  | 'attribution'
  | 'redistribution'
  | 'privacy-retention'
  | 'security-policy'
  | 'contribution-terms'
  | 'ai-disclosures';

export interface ComplianceChecklistItem {
  readonly id: ComplianceItemId;
  readonly requirement: string;
  readonly assets: readonly EvidenceAsset[];
  /** 本项检查不能证明什么（诚实边界——逐项声明，不是全局一句话）。 */
  readonly cannotProve: string;
}

export const COMPLIANCE_CHECKLIST: readonly ComplianceChecklistItem[] = [
  {
    id: 'project-license',
    requirement: '项目 LICENSE 存在且与 package.json license 声明一致（MIT）',
    assets: [
      { claim: '根 LICENSE 文件', path: 'LICENSE', mustContain: ['MIT'] },
      { claim: 'package.json license 字段', path: 'package.json', mustContain: ['"license": "MIT"'] },
    ],
    cannotProve: '证明存在与一致性；不证明版权人范围/年份在所有法域的效力（法务判断）',
  },
  {
    id: 'notice',
    requirement: 'NOTICE 登记第三方组件与许可状态',
    assets: [{ claim: 'NOTICE 第三方登记表', path: 'NOTICE', mustContain: ['第三方'] }],
    cannotProve: '证明表存在且非空壳；不证明表内每个许可标注与上游实际一致（人工复核面）',
  },
  {
    id: 'dependency-licenses',
    requirement: '生产依赖许可可追溯（NOTICE 表 + SBOM NOASSERTION 诚实面）',
    assets: [
      { claim: 'NOTICE 依赖许可表（按 package.json 生产依赖）', path: 'NOTICE', mustContain: ['better-sqlite3'] },
      { claim: 'SBOM 生成面（NOASSERTION 不臆造）', path: 'src/release/supply_chain.ts', mustContain: ['NOASSERTION'] },
    ],
    cannotProve: '不证明传递依赖上游未被换标（registry 投毒在渠道侧）；NOASSERTION 项需人工逐一核验',
  },
  {
    id: 'dataset-licenses',
    requirement: '数据集许可字段化（DatasetCard license 必填 + allowlist 校验面）',
    assets: [
      { claim: 'DatasetCard license 必填字段 + LICENSE_NOT_ALLOWED 门', path: 'src/data_governance/dataset_card.ts', mustContain: ['LICENSE_NOT_ALLOWED'] },
    ],
    cannotProve: '证明卡上 license 字段被强制声明；不证明声明与数据来源方真实条款一致（卡是承诺面不是保证面）',
  },
  {
    id: 'attribution',
    requirement: '第三方内容归属随产物分发（ODC-BY/CC0 attribution travels with bundle）',
    assets: [
      { claim: '.far-proof 携带 SOURCES-ATTRIBUTION（验证器重算时渲染）', path: 'src/far_proof/exporter.ts', mustContain: ['SOURCES_ATTRIBUTION_TEXT'] },
    ],
    cannotProve: '证明归属文本随每个 bundle 分发；不证明被引用来源对归属位置/格式的要求全部满足（条款解释面）',
  },
  {
    id: 'redistribution',
    requirement: '第三方正文再分发权不确定时仅发布元数据（fail-closed withhold 而非静默携带）',
    assets: [
      { claim: 'Crossref 无宽松 record-level license 时 abstract 扣留门', path: 'src/retrieval/types.ts', mustContain: ['abstractWithheldReason', 'crossref_record_license_not_permissive'] },
    ],
    cannotProve: '证明扣留机制在位；不证明「宽松」判定标准与 Crossref 当前条款完全同步（条款是外部动态事实）',
  },
  {
    id: 'privacy-retention',
    requirement: '隐私最小化/目的限制/删除计划 + 本地优先（无密钥采集/无遥测上报路径）',
    assets: [
      { claim: '数据清单/脱敏/删除计划模块', path: 'src/data_governance/privacy.ts', mustContain: ['deletionPlan'] },
      { claim: '本地优先披露（doctor 不读密钥值——README 明示）', path: 'README.md', mustContain: ['reads a key value'] },
    ],
    cannotProve: '证明声明的数据流经审查与删除计划存在；不证明运行时没有未声明的数据流（secret_scan/审计层职责）',
  },
  {
    id: 'security-policy',
    requirement: '安全策略（漏洞报告渠道/支持版本）',
    assets: [{ claim: 'SECURITY.md', path: 'SECURITY.md', mustContain: ['Security Policy'] }],
    cannotProve: '证明文档存在且含报告渠道标记；不证明渠道响应 SLA 被执行（流程是组织承诺）',
  },
  {
    id: 'contribution-terms',
    requirement: '贡献条款（DCO/CLA 等贡献法律基础）',
    assets: [{ claim: 'CONTRIBUTING.md', path: 'CONTRIBUTING.md', mustContain: ['Contributing to FAR-Lab'] }],
    cannotProve: '证明条款文件存在；不证明所有历史贡献者实际受其约束（追溯效力是法律问题）',
  },
  {
    id: 'ai-disclosures',
    requirement: 'AI/模型/数据使用披露（LLM 提议 + 确定性内核裁决的边界声明）',
    assets: [
      { claim: 'README 模型边界披露（LLM proposes, kernel decides）', path: 'README.md', mustContain: ['deterministic verdict kernel', 'LLM'] },
    ],
    cannotProve: '证明披露文本在位；不证明下游用户全部读到/理解（披露可达性 ≠ 披露生效）',
  },
];

export interface ComplianceItemCheck {
  readonly id: ComplianceItemId;
  readonly checks: readonly AssetCheck[];
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly cannotProve: string;
}

/** 十项逐项检查（fail-closed：任何绑定资产缺失/缺标记 = 该项 fail）。 */
export function runComplianceChecklist(repoRoot: string): readonly ComplianceItemCheck[] {
  return COMPLIANCE_CHECKLIST.map((item) => {
    const checks = item.assets.map((a) => checkAsset(repoRoot, a));
    const problems = checks.filter((c) => !c.ok).map((c) => c.problem ?? 'unknown problem');
    return { id: item.id, checks, ok: problems.length === 0, problems, cannotProve: item.cannotProve };
  });
}

// ---------------------------------------------------------------------------
// LEGAL_UNKNOWNS 登记表（不确定第三方正文再分发权 → 仅元数据模式）
// ---------------------------------------------------------------------------

export interface LegalUnknown {
  readonly id: string;
  readonly question: string;
  /** 受影响资产（真实源绑定）。 */
  readonly affectedAsset: string;
  /** 缓解机制（保守模式——不确定即收紧）。 */
  readonly mitigation: string;
  readonly status: 'OPEN' | 'RESOLVED_METADATA_ONLY';
}

export const LEGAL_UNKNOWNS: readonly LegalUnknown[] = [
  {
    id: 'LU-001',
    question: 'Crossref 记录无宽松 record-level license 时，其 abstract 是否可随 .far-proof 再分发？',
    affectedAsset: 'src/retrieval/types.ts (abstractWithheldReason gate)',
    mitigation: '仅元数据模式：abstract 扣留（abstractWithheldReason=crossref_record_license_not_permissive），bundle 只携带标识符与元数据',
    status: 'RESOLVED_METADATA_ONLY',
  },
  {
    id: 'LU-002',
    question: 'OpenAlex/arXiv 摘要的再分发条款是否覆盖「打包进可离线分发的证明包」场景？',
    affectedAsset: 'src/retrieval/adapters (snapshot integrity + license metadata)',
    mitigation: '快照仅存哈希与元数据；正文默认不落包，逐来源确权前维持仅元数据',
    status: 'OPEN',
  },
];

/** 未知项登记一致性：每个 OPEN 项必须有缓解机制绑定（无缓解的 OPEN = fail）。 */
export function verifyLegalUnknowns(): { readonly ok: boolean; readonly problems: readonly string[] } {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const u of LEGAL_UNKNOWNS) {
    if (ids.has(u.id)) problems.push(`duplicate legal unknown id '${u.id}'`);
    ids.add(u.id);
    if (u.mitigation.trim().length === 0) {
      problems.push(`legal unknown '${u.id}' has no mitigation (OPEN without mitigation is unshippable)`);
    }
    if (u.status === 'RESOLVED_METADATA_ONLY' && !u.mitigation.includes('仅元数据')) {
      problems.push(`legal unknown '${u.id}' resolved without metadata-only mode`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// release inventory + 汇总裁定
// ---------------------------------------------------------------------------

export interface ReleaseInventoryEntry {
  readonly path: string;
  readonly exists: boolean;
}

/** 发布面清单：package.json files 字段的正条目逐一存在（发布即随包的物理面）。 */
export function releaseInventory(repoRoot: string): readonly ReleaseInventoryEntry[] {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
  const files = Array.isArray(pkg.files) ? (pkg.files as unknown[]).filter((f): f is string => typeof f === 'string') : [];
  const positives = files.filter((f) => !f.startsWith('!'));
  const requiredRootDocs = ['LICENSE', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'README.md'];
  return [...positives, ...requiredRootDocs].map((path) => ({
    path,
    exists: existsSync(join(repoRoot, path)),
  }));
}

export interface ComplianceReadiness {
  readonly checklist: readonly ComplianceItemCheck[];
  readonly legalUnknownsOk: boolean;
  readonly inventory: readonly ReleaseInventoryEntry[];
  readonly ready: boolean;
  readonly blockers: readonly string[];
}

/** 发布前合规汇总：十项全过 + 未知项登记一致 + inventory 完整 → ready。 */
export function complianceReadiness(repoRoot: string): ComplianceReadiness {
  const checklist = runComplianceChecklist(repoRoot);
  const unknowns = verifyLegalUnknowns();
  const inventory = releaseInventory(repoRoot);
  const blockers: string[] = [];
  for (const item of checklist) {
    if (!item.ok) blockers.push(`[${item.id}] ${item.problems.join('; ')}`);
  }
  if (!unknowns.ok) blockers.push(`[legal-unknowns] ${unknowns.problems.join('; ')}`);
  for (const entry of inventory.filter((e) => !e.exists)) {
    blockers.push(`[inventory] declared release path missing: ${entry.path}`);
  }
  return {
    checklist,
    legalUnknownsOk: unknowns.ok,
    inventory,
    ready: blockers.length === 0,
    blockers,
  };
}
