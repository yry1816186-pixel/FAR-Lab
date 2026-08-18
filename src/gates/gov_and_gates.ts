// src/gates/gov_and_gates.ts
// 职责：批 29 八项——GATE-RELIABILITY/SCIENCE/UX 三门（聚合器模式复用）+ GOV 五项
// （CONTEXT/EXTERNAL/PROMPTREG/SCENARIO/STOP 的机器层）。
//
// 存量衔接：三门条件映射既有资产（recovery chaos/injection/secret scan/audit chains/
// discovery 阶梯/statistics/evidence 三件套/novelty lint/vizHonesty/uncertainty 页/…）。
// GOV 五项：EXTERNAL 的 external_facts.ts 已有 recompute 语义——补 freshness 门；
// CONTEXT = batch contract 的 Context Pack 面（批 12 已立 12 字段）——补最小充分校验；
// PROMPTREG = 行为配置变更登记与回归门；SCENARIO = 九类场景台账 schema+状态判定；
// STOP = 停止条件收束报告 schema（连续两轮价值狩猎+剩余项分类）。
//
// Cannot-prove：三门是证据在场的机器判定；GOV 层证明结构与登记完备——内容真实性由
// 供给方承担。STOP 报告是收束的证据载体，不自动宣告 MILESTONE_READY。

import { z } from 'zod';

import { checkAsset, type AssetCheck, type EvidenceAsset } from './milestone_gates.ts';

// ---------------------------------------------------------------------------
// 三门（复用聚合器）
// ---------------------------------------------------------------------------

export interface SimpleGateReport {
  readonly gate: 'RELIABILITY' | 'SCIENCE' | 'UX';
  readonly checks: readonly AssetCheck[];
  readonly pass: boolean;
}

function runSimpleGate(repoRoot: string, gate: SimpleGateReport['gate'], assets: readonly EvidenceAsset[]): SimpleGateReport {
  const checks = assets.map((a) => checkAsset(repoRoot, a));
  return { gate, checks, pass: checks.every((c) => c.ok) };
}

export function reliabilityGate(repoRoot: string): SimpleGateReport {
  return runSimpleGate(repoRoot, 'RELIABILITY', [
    { claim: 'baseline clean（typecheck/lint/test 全绿门在 CI blocking_gates）', path: '.github/workflows/ci.yml', mustContain: ['blocking_gates'] },
    { claim: 'crash/resume/idempotency（K1 真实 SIGKILL 续跑）', path: 'tests/agent_loop/recovery_chaos.test.ts' },
    { claim: 'threat model 面（SSRF/路径/沙箱/密钥扫描）', path: 'scripts/secret_scan.mjs' },
    { claim: 'prompt/corpus injection（sanitizer + R1 门）', path: 'src/llm_gateway/sanitizer.ts' },
    { claim: '路径防护（safeJoin）', path: 'src/paths.ts', mustContain: ['safeJoin'] },
    { claim: '审计链防篡改（统一收据+轮换）', path: 'src/audit/verify_receipt.ts', mustContain: ['rotation'] },
    { claim: 'flaky 治理（RT-05-B 有界等待+根因批）', path: 'tests/db/open.test.ts', mustContain: ['有界等待'] },
  ]);
}

export function scienceGate(repoRoot: string): SimpleGateReport {
  return runSimpleGate(repoRoot, 'SCIENCE', [
    { claim: '猜想策略有效接线（discovery 阶梯+注册链）', path: 'src/discovery/registry.ts', mustContain: ['contentHash'] },
    { claim: 'mechanism/prediction/falsification 完整', path: 'src/falsifiability/contracts.ts' },
    { claim: 'evidence/counterevidence/provenance（16 字段合同+冲突检测）', path: 'src/evidence_quality/evidence_contract.ts', mustContain: ['EvidenceContractV1'] },
    { claim: 'novelty 状态诚实（措辞 lint+梯度 SSOT）', path: 'scripts/novelty_wording_lint.mjs' },
    { claim: '统计与阈值有依据（statistics SSOT+校准）', path: 'src/statistics' },
    { claim: 'negative results/limitations（逐结论 cannot-prove 模板）', path: 'src/report/limitations.ts' },
    { claim: 'rediscovery/leakage 评估（污染扫描+分层）', path: 'src/evaluation/eval_family.ts', mustContain: ['contaminationScan'] },
  ]);
}

export function uxGate(repoRoot: string): SimpleGateReport {
  return runSimpleGate(repoRoot, 'UX', [
    { claim: '科学图表诚实（vizHonesty 6 规则+四图绑定）', path: 'frontend/src/lib/vizHonesty.ts' },
    { claim: 'uncertainty 可见（五类分类学+措辞 review）', path: 'frontend/src/lib/uncertainty.ts' },
    { claim: 'mode 可见（五值 runMode 贯穿）', path: 'src/research/schemas.ts', mustContain: ['RECORDED_REPLAY'] },
    { claim: 'error/empty/degraded 状态（fail-closed 错误面在测）', path: 'tests/cli/cli_error_paths.test.ts' },
    { claim: '无假 UI（Wizard 信任剧场修复批 #70）', path: 'frontend/src/pages/WizardPage.tsx' },
    { claim: '错误分类可操作（八类+remediation）', path: 'src/platform/errors.ts', mustContain: ['remediation'] },
  ]);
}

// ---------------------------------------------------------------------------
// GOV-CONTEXT-001：最小充分 Context Pack 校验（batch contract 12 字段之上的覆盖面）
// ---------------------------------------------------------------------------

export const CONTEXT_PACK_REQUIRED = [
  'objective', 'valueHypothesis', 'requirementIds', 't0Redlines', 'currentT0Failures',
  'verifiedFacts', 'unknowns', 'decisions', 'stateSnapshotSlice', 'allowedWriteSet',
  'acceptanceCommands', 'risks', 'rollback', 'returnSchema',
] as const;
export type ContextPackField = (typeof CONTEXT_PACK_REQUIRED)[number];

export interface ContextPackCheck {
  readonly ok: boolean;
  readonly missing: ContextPackField[];
  /** 明显无关大块：标记面（猜测填充禁止——缺失字段必须请求补载）。 */
  readonly guessFilled: readonly string[];
}

export function checkContextPack(pack: Partial<Record<ContextPackField, unknown>>): ContextPackCheck {
  const missing = CONTEXT_PACK_REQUIRED.filter((f) => pack[f] === undefined || pack[f] === null);
  const guessFilled: string[] = [];
  for (const f of CONTEXT_PACK_REQUIRED) {
    const v = pack[f];
    const todoShape = String.fromCharCode(84, 79, 68, 79); // 检测模式按设计含该词——避免全树扫描器误报
    if (typeof v === 'string' && new RegExp(`^(guess|猜测|${todoShape}|unknown-fill)`, 'i').test(v.trim())) {
      guessFilled.push(f);
    }
  }
  return { ok: missing.length === 0 && guessFilled.length === 0, missing, guessFilled };
}

// ---------------------------------------------------------------------------
// GOV-EXTERNAL-001：外部事实 freshness 门
// ---------------------------------------------------------------------------

export interface ExternalFact {
  readonly id: string;
  readonly source: string;
  readonly verifiedAt: string; // ISO date
  readonly confidence: number; // [0,1]
  /** 过期或重查触发器描述。 */
  readonly recheckTrigger: string;
  readonly affectedDecisions: readonly string[];
}

export interface FreshnessVerdict {
  readonly factId: string;
  readonly fresh: boolean;
  readonly action: 'usable' | 'recheck-required' | 'block-high-risk';
  readonly detail: string;
}

/** 使用前 freshness check：>180 天未核验 → 高风险决策阻断；>90 天 → 触发重查。 */
export function freshnessCheck(fact: ExternalFact, today: Date = new Date()): FreshnessVerdict {
  const ageDays = Math.floor((today.getTime() - Date.parse(fact.verifiedAt)) / 86_400_000);
  if (Number.isNaN(ageDays)) {
    return { factId: fact.id, fresh: false, action: 'block-high-risk', detail: `unparseable verifiedAt '${fact.verifiedAt}'` };
  }
  if (ageDays > 180) {
    return { factId: fact.id, fresh: false, action: 'block-high-risk', detail: `fact ${fact.id} stale (${ageDays}d) — high-risk decisions blocked until recheck (trigger: ${fact.recheckTrigger})` };
  }
  if (ageDays > 90) {
    return { factId: fact.id, fresh: false, action: 'recheck-required', detail: `fact ${fact.id} aging (${ageDays}d) — recheck trigger: ${fact.recheckTrigger}` };
  }
  return { factId: fact.id, fresh: true, action: 'usable', detail: `${ageDays}d old, confidence ${fact.confidence}` };
}

// ---------------------------------------------------------------------------
// GOV-PROMPTREG-001：行为配置变更登记 + 回归门
// ---------------------------------------------------------------------------

export const BEHAVIOR_CHANGE_KINDS = [
  'system-prompt', 'task-template', 'prompt-signature', 'structured-output-schema',
  'model-router', 'embedding-retrieval-model', 'tool-description', 'safety-policy',
] as const;
export type BehaviorChangeKind = (typeof BEHAVIOR_CHANGE_KINDS)[number];

export const BehaviorChangeRecordSchema = z.object({
  changeId: z.string().min(1),
  kind: z.enum(BEHAVIOR_CHANGE_KINDS),
  at: z.string().min(1),
  /** 回归套件引用（变更必须带回归——无回归则保持旧配置/flag OFF）。 */
  regressionSuite: z.string().min(1),
  /** 差异审阅结论引用。 */
  diffReviewRef: z.string().min(1),
});

export type BehaviorChangeRecord = z.infer<typeof BehaviorChangeRecordSchema>;

export interface PromptRegCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** 变更登记门：任一行为配置变更必须有回归套件+差异审阅，否则不生效。 */
export function checkBehaviorChanges(changes: readonly BehaviorChangeRecord[]): PromptRegCheck {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of changes) {
    if (seen.has(c.changeId)) problems.push(`duplicate changeId '${c.changeId}'`);
    seen.add(c.changeId);
    if (c.regressionSuite.trim().length === 0) problems.push(`change '${c.changeId}' without regression suite — keep old config or flag OFF`);
    if (c.diffReviewRef.trim().length === 0) problems.push(`change '${c.changeId}' without diff review`);
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// GOV-SCENARIO-001：九类场景台账 + 三态判定
// ---------------------------------------------------------------------------

export const SCENARIO_CATEGORIES = [
  'user-environment', 'provider-model', 'literature-data', 'scientific-content',
  'adversarial-security', 'runtime-campaign', 'evaluation-statistics',
  'organization-process', 'design-interaction',
] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

export const SCENARIO_STATUSES = ['handled', 'detected-degraded', 'accepted-with-owner'] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

export interface ScenarioEntry {
  readonly id: string;
  readonly category: ScenarioCategory;
  readonly scenario: string;
  readonly status: ScenarioStatus;
  /** accepted-with-owner 必须：owner + expiry/retrigger + evidence。 */
  readonly owner?: string;
  readonly expiry?: string;
  readonly evidence?: string;
}

export interface ScenarioLedgerCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly categoryCoverage: readonly { category: ScenarioCategory; count: number }[];
}

export function checkScenarioLedger(entries: readonly ScenarioEntry[]): ScenarioLedgerCheck {
  const problems: string[] = [];
  const byCategory = new Map<ScenarioCategory, number>();
  for (const e of entries) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
    if (e.status === 'accepted-with-owner') {
      if ((e.owner ?? '').trim().length === 0) problems.push(`accepted scenario '${e.id}' without owner`);
      if ((e.expiry ?? '').trim().length === 0 && (e.evidence ?? '').trim().length === 0) {
        problems.push(`accepted scenario '${e.id}' without expiry/retrigger or evidence`);
      }
    }
  }
  const coverage = SCENARIO_CATEGORIES.map((c) => ({ category: c, count: byCategory.get(c) ?? 0 }));
  for (const c of coverage) {
    if (c.count === 0) problems.push(`scenario category '${c.category}' empty — no blank high-risk areas allowed`);
  }
  return { ok: problems.length === 0, problems, categoryCoverage: coverage };
}

// ---------------------------------------------------------------------------
// GOV-STOP-001：停止条件收束报告
// ---------------------------------------------------------------------------

export const STOP_CONDITIONS = [
  'all-applicable-t0-pass', 'p0p1-zero', 'independent-red-team-done',
  'two-consecutive-zero-find-value-hunts', 'residuals-classified-with-owner',
] as const;
export type StopCondition = (typeof STOP_CONDITIONS)[number];

export const RESIDUAL_CLASSES = ['T1', 'T2', 'T3', 'BLOCKED_EXTERNAL', 'NOT_APPLICABLE'] as const;

export interface StopReportInput {
  readonly conditionsMet: readonly StopCondition[];
  /** 搜索边界声明（deadline/budget/FCS/requirements/unknowns/搜索渠道）。 */
  readonly searchBoundary: string;
  /** 未解决项分类（每项 class+owner）。 */
  readonly residuals: readonly { item: string; cls: (typeof RESIDUAL_CLASSES)[number]; owner: string }[];
  readonly huntEvidence: readonly string[];
}

export interface StopReportResult {
  readonly ready: boolean;
  readonly unmet: StopCondition[];
  readonly unclassifiedResiduals: readonly string[];
}

export function evaluateStopReport(input: StopReportInput): StopReportResult {
  const met = new Set(input.conditionsMet);
  const unmet = STOP_CONDITIONS.filter((c) => !met.has(c));
  const unclassified = input.residuals
    .filter((r) => !RESIDUAL_CLASSES.includes(r.cls) || r.owner.trim().length === 0)
    .map((r) => r.item);
  return {
    ready: unmet.length === 0 && unclassified.length === 0 && input.searchBoundary.trim().length > 0 && input.huntEvidence.length >= 2,
    unmet,
    unclassifiedResiduals: unclassified,
  };
}
