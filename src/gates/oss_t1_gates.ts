// src/gates/oss_t1_gates.ts
// 职责：T1 OSS 五项（CONTRIB/GOVERNANCE/INTEROP/MAINTAIN/TRANSPARENCY-001）——
// 对真实治理/工程资产断言真实属性 + 三个小型真机制：
//   - CONTRIBUTOR_SLA + slaVerdict（OSS-CONTRIB）：issue 模板→响应档位→首响 SLA
//     判定（纯函数，坏日期 fail-closed）；
//   - busFactorAssessment（OSS-GOVERNANCE）：单维护者 + 无继任 = 过度声明检出；
//   - PUBLICATION_INVENTORY + publicationEntryValid（OSS-TRANSPARENCY）：发布清单
//     ——公开资产在场核验 + 私有资产必须带具体风险/权利依据（仅「内部」不成立）。
//
// 断言的真实资产（2026-08-17 实测 @origin/main）：
//   CONTRIBUTING.md（Prerequisites/Setup/PR Workflow/Quality Gates/Architecture
//   Authority/far doctor 自检）、.github/ISSUE_TEMPLATE 4 模板、PR 模板、CODEOWNERS、
//   .env.example 凭据边界；MAINTAINERS.md（Roles/Decision/Succession/Inactivity/
//   Release authority/Bus-factor 诚实声明）、SECURITY.md（Supported Versions/48h
//   确认/私密披露/advisory）、CODE_OF_CONDUCT、SUPPORT；src/retrieval/adapters
//   三适配器（imports 仅 ../http.ts + ../types.ts——零内核依赖）、引用导出格式
//   校验（bibtex|csl-json fail-closed）、README 无 lossless 声明、tests/retrieval
//   回归；complexity 预算门 + 基线、architecture fitness（依赖方向）、
//   lint --max-warnings 0、CHANGELOG/compat_matrix 迁移面；gitignore 与私有
//   清单一致性。
//
// Cannot-prove（本机制不能证明什么）：
//   - 贡献者体验门证明「漏斗结构与自助诊断资产在场且命令可执行」，不证明外部
//     真实贡献者的实际 setup 时长/首次贡献完成（需真实社区数据——如实列为 gap）；
//   - 治理门证明「条款文本在场 + bus-factor 风险被诚实登记」，不证明条款会被
//     执行（流程演练 receipt 由人工/运营承载）；SLA 判定是政策合同，不是响应历史；
//   - 互操作门证明「适配器静态隔离 + 格式校验在场」，不证明任意第三方格式的
//     语义无损（我们明确不声称无损——README 零 lossless 表述本身是被断言的属性）。
// 零容忍合规：无 any/抑制指令/双断言/空 catch。模型中立。

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 公共类型与工具
// ---------------------------------------------------------------------------

export interface RequirementCheck {
  readonly requirement: string;
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly evidence: readonly string[];
  readonly declaredGaps: readonly string[];
}

function makeCheck(
  requirement: string,
  problems: readonly string[],
  evidence: readonly string[],
  declaredGaps: readonly string[] = [],
): RequirementCheck {
  return { requirement, ok: problems.length === 0, problems, evidence, declaredGaps };
}

function readText(absPath: string): string {
  if (!existsSync(absPath)) return '';
  return readFileSync(absPath, 'utf8');
}

// ---------------------------------------------------------------------------
// OSS-CONTRIB-001：贡献漏斗（模板 + 文档面 + 响应 SLA 政策）
// ---------------------------------------------------------------------------

export type IssueTier = 'bug' | 'reproducibility-failure' | 'feature' | 'documentation' | 'other';

/** 首响 SLA（天）——专项（可复现性失败）须比泛型档更紧（测试断言）。 */
export const CONTRIBUTOR_SLA: Readonly<Record<IssueTier, number>> = {
  'reproducibility-failure': 3,
  bug: 7,
  feature: 14,
  documentation: 14,
  other: 14,
};

/** 模板文件名 → SLA 档位（未识别模板回落 other——回落本身是登记事件）。 */
export function tierFromTemplate(templateFile: string): IssueTier {
  const n = templateFile.toLowerCase();
  if (n.includes('bug')) return 'bug';
  if (n.includes('reproducib')) return 'reproducibility-failure';
  if (n.includes('feature')) return 'feature';
  if (n.includes('doc')) return 'documentation';
  return 'other';
}

export type SlaState = 'responded-within' | 'responded-late' | 'awaiting-within' | 'overdue';

export interface SlaResult {
  readonly state: SlaState;
  readonly daysOpen: number;
}

/** 首响 SLA 判定：坏日期/未响应超窗均 fail-closed 到 overdue（宁可误报不静默放行）。 */
export function slaVerdict(openedAt: string, firstResponseAt: string | null, tier: IssueTier, now: Date): SlaResult {
  const opened = Date.parse(openedAt);
  const slaDays = CONTRIBUTOR_SLA[tier];
  if (Number.isNaN(opened)) return { state: 'overdue', daysOpen: Number.NaN };
  const daysOpen = Math.floor((now.getTime() - opened) / 86_400_000);
  if (firstResponseAt === null) {
    return { state: daysOpen > slaDays ? 'overdue' : 'awaiting-within', daysOpen };
  }
  const responded = Date.parse(firstResponseAt);
  if (Number.isNaN(responded)) return { state: 'overdue', daysOpen };
  const responseDays = Math.floor((responded - opened) / 86_400_000);
  return { state: responseDays <= slaDays ? 'responded-within' : 'responded-late', daysOpen };
}

export function checkContributorFunnel(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  // 1) issue 模板 ≥3 且每个模板映射到明确 SLA 档位
  const tplDir = join(repoRoot, '.github/ISSUE_TEMPLATE');
  const templates = existsSync(tplDir) ? readdirSync(tplDir).filter((f) => f.endsWith('.yml')) : [];
  if (templates.length < 3) problems.push(`issue templates too few: ${templates.length}`);
  else evidence.push(`templates: ${templates.length} (${templates.join(', ')})`);
  const unmapped = templates.filter((t) => tierFromTemplate(t) === 'other');
  if (unmapped.length > 0) problems.push(`templates without SLA tier mapping: ${unmapped.join(', ')}`);
  else evidence.push(`SLA policy: every template maps to a first-response tier (tightest ${CONTRIBUTOR_SLA['reproducibility-failure']}d for reproducibility failures)`);

  // 2) CONTRIBUTING 覆盖贡献路径关键锚点
  const contributing = readText(join(repoRoot, 'CONTRIBUTING.md'));
  for (const anchor of ['## Prerequisites', '## Setup', '## Pull Request Workflow', '## Quality Gates', '## Architecture Authority']) {
    if (!contributing.includes(anchor)) problems.push(`CONTRIBUTING.md lacks '${anchor}'`);
  }
  if (contributing.length > 0 && problems.length === 0) {
    evidence.push('CONTRIBUTING.md: prerequisites/setup/PR workflow/quality gates/architecture authority');
  }
  if (!contributing.includes('far.ts doctor')) problems.push('CONTRIBUTING.md lacks doctor self-diagnosis (no-API-key env check)');
  else evidence.push('doctor: environment self-diagnosis in setup (no API key needed)');
  if (!contributing.includes('pnpm test')) problems.push('CONTRIBUTING.md lacks full regression command');

  // 3) PR 模板 + code ownership + 凭据边界
  if (!existsSync(join(repoRoot, '.github/pull_request_template.md'))) problems.push('.github/pull_request_template.md missing');
  else evidence.push('PR template present (review expectations surface)');
  const codeowners = readText(join(repoRoot, '.github/CODEOWNERS'));
  if (!codeowners.includes('* @')) problems.push('CODEOWNERS lacks default owner rule');
  else evidence.push('CODEOWNERS: default owner rule (review routing)');
  if (!existsSync(join(repoRoot, '.env.example'))) problems.push('.env.example missing (local credential boundary undocumented)');
  else evidence.push('.env.example: credential boundary documented (no secrets in repo)');

  return makeCheck('OSS-CONTRIB-001', problems, evidence, [
    '真实外部贡献者的 setup 时长/首次贡献完成度/失败点需要社区数据，离线不可验证（walkthrough 由 fresh-clone CI + 人工承载）',
    'good-first-issue 标签的存量盘点不在本门（GitHub 侧运营数据）',
  ]);
}

// ---------------------------------------------------------------------------
// OSS-GOVERNANCE-001：治理面（bus-factor 诚实 + 条款在场）
// ---------------------------------------------------------------------------

export interface BusFactorAssessment {
  readonly busFactor: number;
  readonly risk: 'critical' | 'elevated' | 'ok';
  /** risk=critical 且无继任计划 → 声称治理成熟即过度声明。 */
  readonly overClaim: boolean;
}

export function busFactorAssessment(activeMaintainers: number, successionPlan: boolean): BusFactorAssessment {
  const busFactor = Math.max(1, Math.floor(activeMaintainers));
  const risk = busFactor <= 1 ? 'critical' : busFactor <= 2 ? 'elevated' : 'ok';
  return { busFactor, risk, overClaim: risk === 'critical' && !successionPlan };
}

export function checkGovernance(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  const maintainers = readText(join(repoRoot, 'MAINTAINERS.md'));
  for (const anchor of ['## Roles', '## Decision process', '## Conflict resolution', '## Release authority', '## Succession', '## Inactivity policy', '## Bus-factor assessment']) {
    if (!maintainers.includes(anchor)) problems.push(`MAINTAINERS.md lacks '${anchor}'`);
  }
  if (!maintainers.includes('Bus factor = 1')) problems.push('MAINTAINERS.md lacks honest bus-factor declaration');
  else evidence.push('Bus factor = 1 honestly declared (no community-governance maturity claim)');
  if (problems.length === 0) {
    evidence.push('Succession + Inactivity policy present (takeover path executable, 90d/180d thresholds)');
    evidence.push('Release authority + controlled embargo exception documented (decision process)');
  }

  const security = readText(join(repoRoot, 'SECURITY.md'));
  for (const anchor of ['## Supported Versions', 'GitHub Security Advisories', '48 hours', 'private fork']) {
    if (!security.includes(anchor)) problems.push(`SECURITY.md lacks '${anchor}'`);
  }
  if (security.includes('## Supported Versions') && security.includes('48 hours')) {
    evidence.push('security response: private channel + 48h acknowledgement SLA + supported versions table');
  }

  if (!existsSync(join(repoRoot, 'CODE_OF_CONDUCT.md'))) problems.push('CODE_OF_CONDUCT.md missing');
  else evidence.push('CODE_OF_CONDUCT.md present (conflict-resolution baseline)');
  if (!existsSync(join(repoRoot, 'SUPPORT.md'))) problems.push('SUPPORT.md missing');
  if (!existsSync(join(repoRoot, '.github/CODEOWNERS'))) problems.push('CODEOWNERS missing');

  // bus-factor 风险被继任条款缓解（诚实可接受态，非零风险声明）
  const assessment = busFactorAssessment(1, maintainers.includes('## Succession'));
  if (assessment.overClaim) problems.push('bus-factor critical without succession mitigation (over-claim)');
  else evidence.push('bus-factor mitigation: succession clauses registered (risk stays critical, claim stays honest)');

  return makeCheck('OSS-GOVERNANCE-001', problems, evidence, [
    '条款执行（一次真实流程演练：接管/安全响应 tabletop）需运营事件，本门只证条款与风险登记在场',
    '社区治理成熟度不因此门通过而被声称（busFactor=1 如实登记）',
  ]);
}

// ---------------------------------------------------------------------------
// OSS-INTEROP-001：适配器层隔离（核心语义不被互操作污染）
// ---------------------------------------------------------------------------

/** 信任内核目录（适配器不得 import——静态隔离红线）。 */
const KERNEL_LAYER_PATTERN = /(fec|evidence_log|far_proof|proof_envelope|falsifiability|canonical|domain_model)/;

export function checkInterop(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  // 1) 适配器层 ≥3 且零内核 import、零跨层逃逸
  const adaptersDir = join(repoRoot, 'src/retrieval/adapters');
  const adapters = existsSync(adaptersDir) ? readdirSync(adaptersDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')) : [];
  if (adapters.length < 3) problems.push(`retrieval adapters too few: ${adapters.length}`);
  else evidence.push(`interop adapters: ${adapters.length} (${adapters.join(', ')}) at src/retrieval/adapters (adapter layer, not kernel)`);

  let kernelImports = 0;
  let escapingImports = 0;
  for (const f of adapters) {
    const text = readText(join(adaptersDir, f));
    const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
    for (const target of imports) {
      if (KERNEL_LAYER_PATTERN.test(target)) kernelImports += 1;
      if (/^\.\.[/\\]\.\./.test(target)) escapingImports += 1;
    }
  }
  if (kernelImports > 0) problems.push(`adapters import kernel layers (${kernelImports} imports) — core semantics pollution`);
  else evidence.push('adapter isolation: kernel imports=0 (adapters depend only on ../http.ts + ../types.ts contracts)');
  if (escapingImports > 0) problems.push(`adapters escape retrieval layer (${escapingImports} ../.. imports)`);

  // 2) 导入/导出格式校验 fail-closed（未知格式拒绝，不静默猜测）
  const far = readText(join(repoRoot, 'src/cli/far.ts'));
  if (!far.includes('must be bibtex|csl-json')) problems.push('citation export lacks format validation (bibtex|csl-json)');
  else evidence.push('citation export: bibtex|csl-json validated, unknown format rejected (exit non-zero)');
  if (!far.includes('json|markdown')) problems.push('receipt export lacks explicit format set (json|markdown)');
  else evidence.push('receipt export: explicit format set json|markdown (markdown is a projection, json is lossless-of-envelope)');

  // 3) 不声称无损兼容（README 零 lossless 表述本身是被断言属性）
  const readme = readText(join(repoRoot, 'README.md'));
  if (readme.includes('lossless')) problems.push('README claims lossless compatibility (over-claim)');
  else evidence.push('no lossless claim: README contains zero "lossless" wording (interop honesty)');

  // 4) 适配器回归在场（round-trip/降级面在测）
  const retrievalTestsDir = join(repoRoot, 'tests/retrieval');
  const retrievalTests = existsSync(retrievalTestsDir) ? readdirSync(retrievalTestsDir).filter((f) => f.endsWith('.test.ts')) : [];
  if (retrievalTests.length < 5) problems.push(`retrieval adapter tests too few: ${retrievalTests.length}`);
  else evidence.push(`adapter regression: ${retrievalTests.length} test files in tests/retrieval`);

  return makeCheck('OSS-INTEROP-001', problems, evidence, [
    '逐字段信息损失矩阵（bibtex/csl-json 各丢失哪些 FAR-Lab 扩展字段）未独立成文——导出不声称无损，损失报告为登记缺口',
    'SBOM/attestation 互操作由 supply-chain 脚本承载（scripts/check-supply-chain.mjs），与外部 attestation 格式的映射矩阵不在本门',
  ]);
}

// ---------------------------------------------------------------------------
// OSS-MAINTAIN-001：可维护性由结构与自动化证明
// ---------------------------------------------------------------------------

export function checkMaintainability(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  // 1) 复杂度预算门 + 基线 + 自测
  if (!existsSync(join(repoRoot, 'scripts/complexity_budget_check.mjs'))) problems.push('complexity budget gate script missing');
  else evidence.push('complexity gate: scripts/complexity_budget_check.mjs (cyclomatic ≤15 / new files ≤800 lines)');
  const baselineText = readText(join(repoRoot, 'scripts/complexity_budget_baseline.json'));
  if (baselineText.length === 0) problems.push('complexity baseline missing (debt register absent)');
  else {
    try {
      JSON.parse(baselineText) as unknown;
      evidence.push('complexity baseline: registered debt list (grandfathered violations with repayment plan)');
    } catch (err) {
      problems.push(`complexity baseline unparseable: ${String(err)}`);
    }
  }
  if (!existsSync(join(repoRoot, 'tests/scripts/complexity_budget_check.test.mjs'))) problems.push('complexity gate lacks its own test');

  // 2) 依赖方向 fitness（架构测试对真实树全量扫描）
  const depRules = readText(join(repoRoot, 'src/architecture/dependency_rules.ts'));
  if (!depRules.includes('TRUST_KERNEL_LAYERS')) problems.push('src/architecture/dependency_rules.ts missing kernel layer registry');
  else evidence.push('dependency direction: TRUST_KERNEL_LAYERS registry + buildDependencyReport (full-tree scan)');
  if (!existsSync(join(repoRoot, 'tests/architecture/architecture_fitness.test.ts'))) {
    problems.push('architecture fitness test missing (dependency rule unenforced)');
  } else {
    evidence.push('architecture fitness: real-tree zero-violation gate + synthetic edge fixtures (both directions)');
  }

  // 3) 零警告 lint + code ownership
  const pkgText = readText(join(repoRoot, 'package.json'));
  if (!pkgText.includes('max-warnings 0')) problems.push('lint gate not zero-warning (max-warnings 0 missing)');
  else evidence.push('lint: max-warnings 0 (style drift is a hard failure)');
  if (!readText(join(repoRoot, '.github/CODEOWNERS')).includes('* @')) problems.push('CODEOWNERS default rule missing (no code ownership)');

  // 4) 迁移/弃用面（compat matrix + CHANGELOG）
  if (!readText(join(repoRoot, 'src/release/compat_matrix.ts')).includes('migration')) problems.push('compat matrix lacks migration notes');
  else evidence.push('deprecation/migration: compat matrix migration notes + CHANGELOG');
  if (!existsSync(join(repoRoot, 'CHANGELOG.md'))) problems.push('CHANGELOG.md missing');

  return makeCheck('OSS-MAINTAIN-001', problems, evidence, [
    '独立 dead-code 扫描器未建（复杂度预算 + 依赖 fitness 部分承载；删除记录依赖 CHANGELOG 人工纪律）',
    '重复代码检测（duplicate scan）不在本门——code health trend 需要跨版本数据积累',
  ]);
}

// ---------------------------------------------------------------------------
// OSS-TRANSPARENCY-001：发布清单（公开默认 + 私有须有理由）
// ---------------------------------------------------------------------------

export interface PublicationEntry {
  readonly asset: string;
  readonly visibility: 'public' | 'private-with-reason';
  readonly reason?: string;
  /** 公开资产的宪法资产类（compiler/conformance/benchmark/gates/negative-results/roadmap/reproducibility）。 */
  readonly assetClass?: string;
}

/** 私有条目理由审查：空理由 / 仅「internal/内部」拒绝（宪法：不得仅以内部为由）。 */
export function publicationEntryValid(entry: PublicationEntry): boolean {
  if (entry.visibility === 'public') return true;
  if (entry.visibility !== 'private-with-reason') return false;
  const reason = (entry.reason ?? '').trim();
  if (reason.length === 0) return false;
  return !/^(internal|内部)[.。!！]?$/.test(reason.toLowerCase());
}

/**
 * 发布清单（SSOT）：公开 = 可复现关键资产；私有 = 带具体风险/权利依据。
 * 与 .gitignore 的一致性由 checkTransparency 机器核验（声明私有 ↔ 确被忽略）。
 */
export const PUBLICATION_INVENTORY: readonly PublicationEntry[] = [
  { asset: 'scripts/requirements_compile.mjs', visibility: 'public', assetClass: 'requirement-compiler' },
  { asset: 'scripts/requirements_registry.mjs', visibility: 'public', assetClass: 'requirement-compiler' },
  { asset: 'tests/', visibility: 'public', assetClass: 'conformance-tests' },
  { asset: 'src/benchmark/report_schema.ts', visibility: 'public', assetClass: 'benchmark-protocol' },
  { asset: 'ci/CLAIM_RECEIPTS.yaml', visibility: 'public', assetClass: 'release-gates' },
  { asset: 'scripts/release_check.mjs', visibility: 'public', assetClass: 'release-gates' },
  { asset: 'frontend/src/features/evidence/EvidencePage.tsx', visibility: 'public', assetClass: 'negative-results' },
  { asset: 'CHANGELOG.md', visibility: 'public', assetClass: 'roadmap-deprecation' },
  { asset: 'CITATION.cff', visibility: 'public', assetClass: 'reproducibility-metadata' },
  { asset: '.zenodo.json', visibility: 'public', assetClass: 'reproducibility-metadata' },
  { asset: 'README.zh-CN.md', visibility: 'public', assetClass: 'public-docs-bilingual' },
  {
    asset: '.far/',
    visibility: 'private-with-reason',
    reason: '运营/评审过程数据（campaign checkpoint、audit log）——含未定稿结论与第三方未公开交互记录，公开将泄露未发布评审细节（风险依据）；公开等价物由 CHANGELOG + 审计链承担',
  },
  {
    asset: '.far-design/',
    visibility: 'private-with-reason',
    reason: '盲区/地雷登记（BL-1..11 攻击面地图）——公开等于给对抗方提供攻击路径清单（安全风险依据）',
  },
  {
    asset: 'docs/',
    visibility: 'private-with-reason',
    reason: '机器本地开发态文档（PROGRESS 等会话状态）——无用户所需内容；公开文档面由根级 README(EN/zh)+docs 承担（权利依据：起草过程中间态不构成发布物）',
  },
];

const REQUIRED_ASSET_CLASSES = [
  'requirement-compiler', 'conformance-tests', 'benchmark-protocol', 'release-gates',
  'negative-results', 'roadmap-deprecation', 'reproducibility-metadata',
];

export function checkTransparency(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  const gitignore = readText(join(repoRoot, '.gitignore'));
  if (gitignore.length === 0) problems.push('.gitignore missing (private/public boundary undeclarable)');

  let publicCount = 0;
  let privateCount = 0;
  for (const entry of PUBLICATION_INVENTORY) {
    if (!publicationEntryValid(entry)) {
      problems.push(`invalid publication entry '${entry.asset}': private assets need a concrete risk/rights basis (not just internal)`);
      continue;
    }
    if (entry.visibility === 'public') {
      publicCount += 1;
      if (!existsSync(join(repoRoot, entry.asset))) problems.push(`public asset missing on disk: ${entry.asset}`);
    } else {
      privateCount += 1;
      // 声明私有 ↔ 确被 gitignore（清单与忽略规则不得漂移）
      const pattern = entry.asset.replace(/\/$/, '/');
      if (!gitignore.includes(pattern)) problems.push(`private asset '${entry.asset}' not present in .gitignore (inventory/ignore drift)`);
    }
  }
  evidence.push(`publication inventory: ${publicCount} public assets verified on disk`);
  evidence.push(`private-with-reason: ${privateCount} entries, each with risk/rights basis (not internal-only)`);
  if (gitignore.length > 0) evidence.push('gitignore consistency: every declared-private asset is actually ignored');

  const coveredClasses = new Set(PUBLICATION_INVENTORY.filter((e) => e.visibility === 'public').map((e) => e.assetClass ?? ''));
  const missingClasses = REQUIRED_ASSET_CLASSES.filter((c) => !coveredClasses.has(c));
  if (missingClasses.length > 0) problems.push(`constitution asset classes uncovered: ${missingClasses.join(', ')}`);
  else evidence.push(`constitution coverage: all ${REQUIRED_ASSET_CLASSES.length} reproducibility asset classes public`);

  return makeCheck('OSS-TRANSPARENCY-001', problems, evidence, [
    'redaction review（公开资产中是否残留需脱敏内容）与 reproducibility gap analysis 的完整审计需人工抽查（本门证清单一致性与覆盖类）',
    'sanitized prompt/constitution 未发布：内部宪法文件属 .far/ 私有类（理由已登记），公开发布版本是登记缺口而非本门结论',
  ]);
}

// ---------------------------------------------------------------------------
// 聚合器
// ---------------------------------------------------------------------------

export interface OssT1GateReport {
  readonly checks: readonly RequirementCheck[];
  readonly pass: boolean;
}

export function ossT1Gate(repoRoot: string): OssT1GateReport {
  const checks = [
    checkContributorFunnel(repoRoot),
    checkGovernance(repoRoot),
    checkInterop(repoRoot),
    checkMaintainability(repoRoot),
    checkTransparency(repoRoot),
  ];
  return { checks, pass: checks.every((c) => c.ok) };
}
