// src/schema/domain_registry.ts
// 职责：CORE-DOMAIN-001 —— 核心领域对象权威登记表（interface compatibility report 的机器形态）。
//
// 宪法 §3.1 要求 16 个核心对象统一：CLI/API/Web/工具协议/插件复用同一 service/domain layer，
// 不得各自发明不兼容语义。本登记表是「谁在哪权威定义」的 SSOT——每对象一行：
//   宪法命名 | 权威模块 | 导出名 | 序列化边界类别 | 语义对应说明（名称与宪法不同时）
//
// 边界类别（boundary）：
//   zod                  —— 有 zod schema（反序列化 fail-closed 由 schema 保证）
//   hand-written-parser  —— 手写 fail-closed parser（信任内核五件套模式：解析+哈希链）
//   ts-interface         —— TS interface + 哈希链/枚举 tuple 完整性（无独立 parser）
//   semantic-counterpart —— 宪法命名的独立实体在仓库中不存在，语义由最接近物承担（登记说明）
//   string-convention    —— 以裸字符串约定存在（如 `sha256:` 前缀内容寻址）
//
// Cannot-prove：本登记表证明「16 对象各有唯一权威定义且可定位」，不证明各层（CLI/API/Web）
// 运行时确实只经由该权威——那是依赖方向问题，由测试断言导入关系（tests/domain_model/）与
// 代码审查锚定。semantic-counterpart/string-convention 两类是宪法与代码的已知错位，
// 属实登记而非掩盖；升格为独立实体需信任内核协议（AGENTS.md §7）另立批次。
//
// 数据来源：2026-08-18 子代理全库侦察（16 对象逐一亲读权威文件核行号）。

/** 序列化边界类别（见文件头注释）。 */
export const DOMAIN_BOUNDARIES = [
  'zod',
  'hand-written-parser',
  'ts-interface',
  'semantic-counterpart',
  'string-convention',
] as const;
export type DomainBoundary = (typeof DOMAIN_BOUNDARIES)[number];

export interface DomainObjectEntry {
  /** 宪法 CORE-DOMAIN-001 原文命名。 */
  readonly object: string;
  /** 权威定义模块（仓库相对路径，不带扩展名——测试动态解析用）。 */
  readonly authoritativeModule: string;
  /** 权威导出名（模块内 SSOT）。 */
  readonly exportName: string;
  /** 序列化边界类别。 */
  readonly boundary: DomainBoundary;
  /** 边界备注：语义对应说明 / 已知错位 / 分工注释。 */
  readonly note: string;
}

/** 宪法 §3.1 十六核心对象权威登记表（顺序 = 宪法原文顺序）。 */
export const DOMAIN_OBJECTS: readonly DomainObjectEntry[] = [
  {
    object: 'ResearchQuestion',
    authoritativeModule: 'src/research/schemas.ts',
    exportName: 'ResearchRunZod',
    boundary: 'semantic-counterpart',
    note: '无独立实体：研究问题以字符串贯穿（ResearchRun.question / CampaignQuestionState.question / DiscoveryRegistryRecord.question），入口由 ResearchabilityReportZod 评审；zod 边界随 ResearchRunZod',
  },
  {
    object: 'Claim',
    authoritativeModule: 'src/falsifiability/schemas.ts',
    exportName: 'parseFalsificationSpec',
    boundary: 'hand-written-parser',
    note: '内核侧 claim 是字符串（EvidenceRecord.claim）；结构化输入为 FalsificationSpec（types.ts），由手写 fail-closed parser 解析；V2 强制契约回指 FecContractV2.claimId',
  },
  {
    object: 'Conjecture',
    authoritativeModule: 'src/discovery/types.ts',
    exportName: 'CONJECTURE_STATES',
    boundary: 'ts-interface',
    note: '登记实体 DiscoveryRegistryRecord（registry.ts，contentHash 哈希链）+ 状态阶梯 CONJECTURE_STATES（RAW_IDEA→…→NOVEL_VALIDATED，fail-closed 转移函数）',
  },
  {
    object: 'EvidenceRecord',
    authoritativeModule: 'src/falsifiability/types.ts',
    exportName: 'EvidenceRecord',
    boundary: 'ts-interface',
    note: '裁决内核输入（supportsClaim/refutesClaim+SourceAnchor）；agent_loop 侧同名 interface 是 stage4 LLM 提取（字段集不同，两文件注释互明分工，stage 执行器转换）；16 字段增强合同 EvidenceContractV1Schema（evidence_quality）',
  },
  {
    object: 'SourceSnapshot',
    authoritativeModule: 'src/evidence_quality/evidence_contract.ts',
    exportName: 'SourceSnapshotRefSchema',
    boundary: 'zod',
    note: '快照类别+内容寻址 ID+哈希；TS 前身 SourceAnchor（evidence_log/types.ts，git SHA+requestId）仍是信任链基础设施',
  },
  {
    object: 'ExperimentPlan',
    authoritativeModule: 'src/research/schemas.ts',
    exportName: 'ResearchPlanZod',
    boundary: 'semantic-counterpart',
    note: '精确名不存在（全库零命中）；语义对应物 ResearchPlan/ResearchPlanZod（analysisDag/statisticalMethods/stoppingConditions/humanApprovalRequired 即实验计划内容）',
  },
  {
    object: 'Observation',
    authoritativeModule: 'src/research/schemas.ts',
    exportName: 'ObservationZod',
    boundary: 'zod',
    note: '真实数据/工具观测 discriminatedUnion（exoplanet / climate / literature-landscape 三 adapter）；物理 SSOT=schemas_observation.ts（800 行预算拆分，2026-08-21），经 schemas.ts re-export 保持导入面；TS union（experiment.ts）与 zod 双轨齐备',
  },
  {
    object: 'Verdict',
    authoritativeModule: 'src/schema/enums.ts',
    exportName: 'VERDICTS',
    boundary: 'ts-interface',
    note: '5 值枚举 as-const tuple SSOT；裁决结果实体 VerdictDecision/VerdictResult 与持久化 VerdictNode（falsifiability/types.ts，哈希链节点）',
  },
  {
    object: 'ProofBundle',
    authoritativeModule: 'src/proof_envelope/types.ts',
    exportName: 'ProofEnvelope',
    boundary: 'ts-interface',
    note: '密封证明实体（proofHash 链+checks；V2 @ v2/types.ts）；.far-proof 便携包是打包函数产物（目录结构由 requiredFilesForMode 定义，非单一 schema）',
  },
  {
    object: 'Campaign',
    authoritativeModule: 'src/campaign/types.ts',
    exportName: 'CampaignEventPayload',
    boundary: 'ts-interface',
    note: '事件实体（6 事件判别联合）是唯一事实源，CampaignState 是纯折叠投影；完整性靠手写 eventHash 链（不变量 I3）',
  },
  {
    object: 'Run',
    authoritativeModule: 'src/research/schemas.ts',
    exportName: 'ResearchRunZod',
    boundary: 'zod',
    note: 'ResearchRun（schemaVersion 2-4 版本化，确定性升级）；round-trip 由 tests/research/schemas.test.ts 既有四契约钉死',
  },
  {
    object: 'Decision',
    authoritativeModule: 'src/governance/adr_schema.ts',
    exportName: 'AdrEntrySchema',
    boundary: 'zod',
    note: '7 槽位决策台账条目（CORE-DECISION-001），id 形状 D-YYYY-MM-DD-NN',
  },
  {
    object: 'Unknown',
    authoritativeModule: 'src/governance/types.ts',
    exportName: 'UnknownEntrySchema',
    boundary: 'zod',
    note: 'GOV-UNKNOWN-001：OPEN→INVESTIGATING→RESOLVED/ABANDONED 生命周期 + blocking 传播边',
  },
  {
    object: 'Assumption',
    authoritativeModule: 'src/governance/types.ts',
    exportName: 'AssumptionEntrySchema',
    boundary: 'zod',
    note: 'GOV-UNKNOWN-001：ACTIVE/INVALIDATED/RETIRED + invalidationTrigger + affectedDecisions 传播边',
  },
  {
    object: 'BudgetLedger',
    authoritativeModule: 'src/llm_gateway/budget.ts',
    exportName: 'DEFAULT_BUDGET_PROFILE',
    boundary: 'semantic-counterpart',
    note: 'RMB 券额对账实体不存在；最接近物 token 硬预算断路器 BudgetProfile+BudgetUsage（interface；值锚点 DEFAULT_BUDGET_PROFILE；超限抛 CostBudgetExceeded；budget.ts 明确声明不做精确计费对账）',
  },
  {
    object: 'ArtifactRef',
    authoritativeModule: 'src/science_harness/anti_theater_input.ts',
    boundary: 'string-convention',
    exportName: 'buildAntiTheaterPipelineInput',
    note: '无类型定义：内容寻址制品引用以 `sha256:` 前缀裸字符串约定存在（buildAntiTheaterPipelineInput 构造 artifactRef，rawArtifactHashes 数组消费）',
  },
];

/** 宪法 16 对象名（顺序 = 宪法原文）。 */
export function domainObjectNames(): readonly string[] {
  return DOMAIN_OBJECTS.map((e) => e.object);
}

/** 按边界类别过滤（兼容性报告分组用）。 */
export function byBoundary(boundary: DomainBoundary): readonly DomainObjectEntry[] {
  return DOMAIN_OBJECTS.filter((e) => e.boundary === boundary);
}

export interface RegistryConsistencyResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

/** 结构一致性：16 对象、唯一、无宪法外对象、边界类别合法。 */
export function checkRegistryConsistency(
  expectedObjects: readonly string[],
): RegistryConsistencyResult {
  const violations: string[] = [];
  const names = DOMAIN_OBJECTS.map((e) => e.object);

  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) violations.push(`duplicate domain object '${n}'`);
    seen.add(n);
  }
  for (const expect of expectedObjects) {
    if (!seen.has(expect)) violations.push(`constitution object '${expect}' missing from registry`);
  }
  for (const n of names) {
    if (!expectedObjects.includes(n)) violations.push(`registry object '${n}' not in constitution list`);
  }
  for (const e of DOMAIN_OBJECTS) {
    if (!DOMAIN_BOUNDARIES.includes(e.boundary)) {
      violations.push(`object '${e.object}' has unknown boundary '${e.boundary}'`);
    }
    if (e.note.trim().length === 0) violations.push(`object '${e.object}' has empty note`);
  }
  return { ok: violations.length === 0, violations };
}
