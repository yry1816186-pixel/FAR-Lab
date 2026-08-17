// tests/domain_model/domain_roundtrip.test.ts
// CORE-DOMAIN-001：核心领域对象权威登记表核验 + 序列化 round-trip 统一入口。
//
// 三层证明：
//   1. 登记表完备性：16 宪法对象逐一在册、唯一、无宪法外对象、边界类别合法。
//   2. 权威存在性：每个登记的导出在磁盘现实中存在——值导出运行时断言（Object.keys），
//      类型导出经编译期 import 钉死（rename/move 即本文件编译失败 = 漂移门）。
//   3. round-trip：凡有确定性序列化边界（zod / 手写 parser / 枚举 tuple）的对象，
//      合法实例 JSON.stringify → parse → 再解析 → 深相等。
//
// 已有覆盖不重复：ResearchRun round-trip 由 tests/research/schemas.test.ts 四契约钉死
// （登记表 note 引用）；本文件补齐其余 zod 对象与内核手写 parser 的集中 round-trip。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DOMAIN_OBJECTS,
  byBoundary,
  checkRegistryConsistency,
  domainObjectNames,
} from '../../src/schema/domain_registry.ts';

// ---- 权威模块命名空间（值导出运行时核验用）---------------- -----------------
import * as researchSchemas from '../../src/research/schemas.ts';
import * as falsifiabilitySchemas from '../../src/falsifiability/schemas.ts';
import * as discoveryTypes from '../../src/discovery/types.ts';
import * as falsifiabilityTypes from '../../src/falsifiability/types.ts';
import * as evidenceContract from '../../src/evidence_quality/evidence_contract.ts';
import * as schemaEnums from '../../src/schema/enums.ts';
import * as proofEnvelopeTypes from '../../src/proof_envelope/types.ts';
import * as campaignTypes from '../../src/campaign/types.ts';
import * as adrSchema from '../../src/governance/adr_schema.ts';
import * as governanceTypes from '../../src/governance/types.ts';
import * as budget from '../../src/llm_gateway/budget.ts';
import * as antiTheaterInput from '../../src/science_harness/anti_theater_input.ts';

// ---- 类型导出编译期钉死（缺任一即本文件编译失败 = 漂移门）------------------
import type { UnknownEntry, AssumptionEntry } from '../../src/governance/types.ts';
import type { AdrEntry } from '../../src/governance/adr_schema.ts';
import type { SourceSnapshotRef } from '../../src/evidence_quality/evidence_contract.ts';
import type { z } from 'zod';
type _ResearchPlanInstance = z.infer<typeof researchSchemas.ResearchPlanZod>;
type _ObservationInstance = z.infer<typeof researchSchemas.ObservationZod>;
import type { EvidenceRecord } from '../../src/falsifiability/types.ts';
import type { ProofEnvelope } from '../../src/proof_envelope/types.ts';
import type { CampaignEventPayload } from '../../src/campaign/types.ts';
import type { ResearchRun } from '../../src/research/types.ts';
export type _PinDomainTypes = [EvidenceRecord, ProofEnvelope, CampaignEventPayload, ResearchRun];

// ---------------------------------------------------------------------------
// 1. 登记表完备性
// ---------------------------------------------------------------------------

const CONSTITUTION_OBJECTS = [
  'ResearchQuestion',
  'Claim',
  'Conjecture',
  'EvidenceRecord',
  'SourceSnapshot',
  'ExperimentPlan',
  'Observation',
  'Verdict',
  'ProofBundle',
  'Campaign',
  'Run',
  'Decision',
  'Unknown',
  'Assumption',
  'BudgetLedger',
  'ArtifactRef',
] as const;

test('CORE-DOMAIN-001: 16 宪法对象全部在册且唯一（registry = interface compatibility report）', () => {
  const result = checkRegistryConsistency(CONSTITUTION_OBJECTS);
  assert.equal(result.ok, true, `violations: ${result.violations.join('; ')}`);
  assert.equal(domainObjectNames().length, 16);
});

test('CORE-DOMAIN-001 fail-closed: 宪法对象缺席/登记多出对象均被结构检查拒绝', () => {
  // 宪法清单混入伪造第 17 对象 → 'missing from registry'
  const missing = checkRegistryConsistency([...CONSTITUTION_OBJECTS, 'NotARealObject']);
  assert.ok(missing.violations.some((v) => v.includes("'NotARealObject' missing from registry")));
  assert.equal(missing.ok, false);

  // 收窄宪法清单（去掉 ArtifactRef）→ 登记表里的 ArtifactRef 成为宪法外对象
  const narrowed = CONSTITUTION_OBJECTS.filter((o) => o !== 'ArtifactRef');
  const extra = checkRegistryConsistency(narrowed);
  assert.ok(extra.violations.some((v) => v.includes("'ArtifactRef' not in constitution list")));
  assert.equal(extra.ok, false);
});

test('CORE-DOMAIN-001: 边界类别分布可机读（zod 主导 + 实登记的已知错位）', () => {
  const zod = byBoundary('zod');
  const counterparts = byBoundary('semantic-counterpart');
  // 语义对应物是实登记的宪法↔代码错位：ResearchQuestion / ExperimentPlan / BudgetLedger
  assert.deepEqual(
    counterparts.map((e) => e.object).sort(),
    ['BudgetLedger', 'ExperimentPlan', 'ResearchQuestion'],
  );
  // 字符串约定唯一：ArtifactRef
  assert.deepEqual(byBoundary('string-convention').map((e) => e.object), ['ArtifactRef']);
  // zod 对象至少覆盖治理三件 + 观测 + 快照 + 计划
  for (const obj of ['Unknown', 'Assumption', 'Decision', 'Observation', 'SourceSnapshot', 'Run']) {
    assert.ok(zod.some((e) => e.object === obj), `object '${obj}' must be zod boundary`);
  }
  // 登记总数守恒
  let total = 0;
  for (const b of ['zod', 'hand-written-parser', 'ts-interface', 'semantic-counterpart', 'string-convention'] as const) {
    total += byBoundary(b).length;
  }
  assert.equal(total, 16);
});

// ---------------------------------------------------------------------------
// 2. 权威存在性（registry ↔ 磁盘现实一致）
// ---------------------------------------------------------------------------

const MODULE_NAMESPACES: Readonly<Record<string, object>> = {
  'src/research/schemas.ts': researchSchemas,
  'src/falsifiability/schemas.ts': falsifiabilitySchemas,
  'src/discovery/types.ts': discoveryTypes,
  'src/falsifiability/types.ts': falsifiabilityTypes,
  'src/evidence_quality/evidence_contract.ts': evidenceContract,
  'src/schema/enums.ts': schemaEnums,
  'src/proof_envelope/types.ts': proofEnvelopeTypes,
  'src/campaign/types.ts': campaignTypes,
  'src/governance/adr_schema.ts': adrSchema,
  'src/governance/types.ts': governanceTypes,
  'src/llm_gateway/budget.ts': budget,
  'src/science_harness/anti_theater_input.ts': antiTheaterInput,
};

/** 类型导出无法运行时核验（编译期 import 已钉死）；这里只对值导出断言。 */
const TYPE_ONLY_EXPORTS = new Set([
  'EvidenceRecord', // falsifiability/types.ts interface
  'ProofEnvelope', // proof_envelope/types.ts interface
  'CampaignEventPayload', // campaign/types.ts type alias
]);

test('CORE-DOMAIN-001: 每个登记的值导出在权威模块运行时存在（漂移即红）', () => {
  for (const entry of DOMAIN_OBJECTS) {
    const ns = MODULE_NAMESPACES[entry.authoritativeModule];
    assert.notEqual(ns, undefined, `registry module '${entry.authoritativeModule}' not mapped in test — registry/test drift`);
    if (TYPE_ONLY_EXPORTS.has(entry.exportName)) continue; // 编译期已钉死
    const keys = Object.keys(ns ?? {});
    assert.ok(
      keys.includes(entry.exportName),
      `export '${entry.exportName}' missing from ${entry.authoritativeModule} (object '${entry.object}')`,
    );
  }
});

test('CORE-DOMAIN-001: zod 边界对象确实携带 zod schema（safeParse 可调用）', () => {
  for (const entry of byBoundary('zod')) {
    const ns = MODULE_NAMESPACES[entry.authoritativeModule] as Record<string, unknown>;
    const schema = ns[entry.exportName] as { safeParse?: unknown };
    assert.equal(typeof schema.safeParse, 'function', `object '${entry.object}' boundary=zod but export is not a zod schema`);
  }
});

// ---------------------------------------------------------------------------
// 3. round-trip：zod 对象 + 内核手写 parser + 枚举 tuple
// ---------------------------------------------------------------------------

/** 通用 round-trip：instance → JSON → parse → schema 再解析 → 与原实例深相等。 */
function assertJsonRoundTrip<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, instance: Readonly<T>, label: string): void {
  const text = JSON.stringify(instance);
  const revived = JSON.parse(text) as unknown;
  const reparsed = schema.safeParse(revived);
  assert.equal(reparsed.success, true, `${label}: JSON round-trip must re-parse`);
  if (reparsed.success) {
    assert.deepEqual(reparsed.data, instance, `${label}: round-trip must be lossless`);
  }
}

const unknownInstance: UnknownEntry = {
  id: 'UNK-R-001',
  what: 'RMB 券额与账面对账口径',
  whyUnknown: '无计费明细数据源',
  impact: '成本声明的精度边界',
  investigation: '已查 budget.ts——明确不做精确计费',
  blocking: [],
  owner: 'coordinator',
  targetEvidence: ['计费明细 API 或账单导出'],
  status: 'OPEN',
  resolvedAt: null,
  resolutionEvidence: [],
};

const assumptionInstance: AssumptionEntry = {
  id: 'ASM-MUT-001',
  statement: 'mutation 20/20 代表测试强度充分',
  evidence: ['PR #55 mutation gate 实跑'],
  confidence: 0.8,
  affectedDecisions: ['CI mutation 门禁阈值'],
  invalidationTrigger: '发现存活变异未被 20 个位点覆盖',
  reviewDate: null,
  reviewEvent: '每次新增模块时',
  status: 'ACTIVE',
  invalidatedAt: null,
  invalidationReason: null,
};

const decisionInstance: AdrEntry = {
  id: 'D-2026-08-17-01',
  title: 'GOV 机器层入库 src/governance',
  context: 'Unknown/Assumption 生命周期需机检',
  options: '① zod SSOT 新模块 ② 扩充既有 planning ③ 只写文档',
  chosen: '①',
  rationale: '规划域与治理域职责不同，合并模糊边界',
  rejectedReasons: '② 混域 ③ 无机检力',
  rollback: 'git revert 单提交（纯新增）',
};

const sourceSnapshotInstance: SourceSnapshotRef = {
  kind: 'corpus_snapshot',
  id: 'snap-abc123',
  snapshotHash: 'a'.repeat(64),
};

const planInstance: _ResearchPlanInstance = {
  objectives: ['o1'],
  primaryHypothesisId: 'h1',
  alternativeHypothesisIds: ['h2'],
  preregisteredPredictions: ['p1'],
  dataRequirements: ['d1'],
  inclusionExclusionCriteria: [],
  variables: ['v1'],
  design: 'cohort',
  analysisDag: ['clean → model'],
  tools: ['python'],
  statisticalMethods: ['pearson'],
  sampleSizeRationale: 'power 0.8',
  multiplicityHandling: 'none',
  missingOutlierStrategy: 'report-only',
  stoppingConditions: ['n>=100'],
  checkpoints: [],
  budget: 'token-profile-standard',
  risks: [],
  reproducibility: ['seed-fixed'],
  nextRoundDecisionRules: [],
  humanApprovalRequired: [],
};

const observationInstance: _ObservationInstance = {
  id: 'obs-1',
  adapter: 'exoplanet-archive-radius-insolation',
  affectsHypothesisIds: ['h1'],
  result: {
    status: 'SUCCESS',
    n: 392,
    excludedMissing: 3,
    pearsonR: 0.587,
    pValue: 0.001,
    confidenceInterval: [0.51, 0.66],
    significantAt05: true,
    meanInsolation: 1.2,
    params: { minRadiusEarth: 0.5, maxPeriodDays: 365, confidenceLevel: 0.95, source: 'default' },
    inputHash: 'b'.repeat(64),
    analyzedAt: '2026-08-17T00:00:00Z',
    summary: 'r=0.587 (NASA TAP n=392 live 复现)',
  },
  datasetCard: {
    source: 'NASA Exoplanet Archive TAP',
    sourceUrl: 'https://exoplanetarchive.ipac.caltech.edu/',
    version: '2026-08-01',
    persistentId: 'doi:10.26133/NEA12',
    license: 'CC0',
    downloadedAt: '2026-08-17T00:00:00Z',
    query: 'select pl_rade,pl_orbper from ps',
    rawChecksum: 'c'.repeat(64),
    rowCount: 395,
    fields: ['pl_rade', 'pl_orbper'],
    units: { pl_rade: 'R_EARTH', pl_orbper: 'days' },
    missingNotes: [],
    qualityNotes: [],
    allowedInference: 'correlation',
    forbiddenInference: 'causation',
    reproductionCommand: 'node src/cli/far.ts bench',
    fetchMode: 'LIVE',
  },
  mode: 'LIVE',
  producedAt: '2026-08-17T00:00:00Z',
};

test('CORE-DOMAIN-001 round-trip: 治理三件（Unknown/Assumption/Decision）JSON 无损', () => {
  assertJsonRoundTrip(governanceTypes.UnknownEntrySchema, unknownInstance, 'Unknown');
  assertJsonRoundTrip(governanceTypes.AssumptionEntrySchema, assumptionInstance, 'Assumption');
  assertJsonRoundTrip(adrSchema.AdrEntrySchema, decisionInstance, 'Decision');
});

test('CORE-DOMAIN-001 round-trip: SourceSnapshot + ExperimentPlan(ResearchPlan) + Observation 无损', () => {
  assertJsonRoundTrip(evidenceContract.SourceSnapshotRefSchema, sourceSnapshotInstance, 'SourceSnapshot');
  assertJsonRoundTrip(researchSchemas.ResearchPlanZod, planInstance, 'ExperimentPlan/ResearchPlan');
  assertJsonRoundTrip(researchSchemas.ObservationZod, observationInstance, 'Observation');
});

test('CORE-DOMAIN-001 round-trip: 内核手写 parser（Claim=FalsificationSpec / SourceAnchor）无损', () => {
  const spec = {
    prediction: 'accuracy reaches 0.85',
    metric: 'accuracy',
    falsificationThreshold: 0.85,
    thresholdSemantics: 'gt',
  };
  const text = JSON.stringify(spec);
  const parsed = falsifiabilitySchemas.parseFalsificationSpec(JSON.parse(text));
  assert.deepEqual(parsed, spec, 'FalsificationSpec round-trip lossless');

  const anchor = {
    gitCommitSha: 'a'.repeat(40),
    dashscopeRequestId: null,
    isoTimestamp: '2026-08-17T00:00:00Z',
    rawResponseHash: 'b'.repeat(64),
  };
  const anchorParsed = falsifiabilitySchemas.parseSourceAnchor(JSON.parse(JSON.stringify(anchor)));
  assert.deepEqual(anchorParsed, anchor, 'SourceAnchor round-trip lossless');
});

test('CORE-DOMAIN-001 round-trip: Verdict 五值枚举经 JSON 往返不变', () => {
  for (const v of schemaEnums.VERDICTS) {
    assert.equal(JSON.parse(JSON.stringify(v)), v);
  }
  assert.equal(schemaEnums.VERDICTS.length, 5);
  // 登记表锚定：Verdict 条目的导出名就是该 tuple
  const verdictEntry = DOMAIN_OBJECTS.find((e) => e.object === 'Verdict');
  assert.notEqual(verdictEntry, undefined);
  if (verdictEntry !== undefined) {
    assert.equal(verdictEntry.exportName, 'VERDICTS');
    assert.equal(verdictEntry.authoritativeModule, 'src/schema/enums.ts');
  }
});

test('CORE-DOMAIN-001: 生命周期字母表精确钉死（枚举漂移 = 域模型漂移）', () => {
  assert.deepEqual([...governanceTypes.UNKNOWN_STATUSES], ['OPEN', 'INVESTIGATING', 'RESOLVED', 'ABANDONED']);
  assert.deepEqual([...governanceTypes.ASSUMPTION_STATUSES], ['ACTIVE', 'INVALIDATED', 'RETIRED']);
  assert.deepEqual([...schemaEnums.VERDICTS], ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED']);
  assert.deepEqual([...discoveryTypes.CONJECTURE_STATES], [
    'RAW_IDEA',
    'STRUCTURED_CONJECTURE',
    'CORROBORATED',
    'KERNEL_ADJUDICATED',
    'REDISCOVERY',
    'NOVEL_VALIDATED',
  ]);
  // schema 侧同步钉死（源 tuple 正确但 zod 边界被放宽 = 同等漂移）
  const unknownStatusEnum = governanceTypes.UnknownEntrySchema.shape.status as { options: readonly string[] };
  assert.deepEqual([...unknownStatusEnum.options], ['OPEN', 'INVESTIGATING', 'RESOLVED', 'ABANDONED']);
  const assumptionStatusEnum = governanceTypes.AssumptionEntrySchema.shape.status as { options: readonly string[] };
  assert.deepEqual([...assumptionStatusEnum.options], ['ACTIVE', 'INVALIDATED', 'RETIRED']);
});

test('CORE-DOMAIN-001 fail-closed: round-trip 门有判别力（坏实例不得通过）', () => {
  const badUnknown = { ...unknownInstance, status: 'NOT_A_STATUS' };
  const r = governanceTypes.UnknownEntrySchema.safeParse(JSON.parse(JSON.stringify(badUnknown)));
  assert.equal(r.success, false, 'illegal enum must fail re-parse');

  const badSpec = { prediction: 'x', metric: 'accuracy' }; // 缺 threshold
  assert.throws(() => falsifiabilitySchemas.parseFalsificationSpec(badSpec), /falsification/i);
});
