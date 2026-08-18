// src/science_harness/adapter_contract.ts
// 职责：EXP-ADAPTER-001 实验/数据/仿真/实验室适配器的统一能力合同（机器层）。
//
// 宪法条款：每个适配器声明 capability ID、input/output schema、
// determinism profile、network/filesystem permissions、resource limits、
// provenance fields、supported units/formats、failure taxonomy、
// retry/idempotency behavior、license/safety boundary、tests and fixtures。
//
// 机制：
//   validateCapabilityDeclaration  12 字段齐全校验（缺任一 → 拒绝入册）
//   AdapterCapabilityRegistry     能力注册表：注册/查询；重复 capabilityId
//                                 拒绝；声明的能力必须有对应实现文件
//                                 （implementationRef 存在性检查——声明与
//                                 实现不允许漂移）
//   consistencyCheck              全册一致性：实现文件存在 + determinism
//                                 声明与 retry/idempotency 自洽（声称
//                                 deterministic 却无 idempotency 声明 → 矛盾）
//   selectAdapter                 按需求（确定性档案/网络权限/单位）选配
//                                 适配器——需求含确定性而候选不满足 → 拒绝
//                                 （fail-closed，不静默降级）
//
// 与存量衔接：SandboxAdapter/VenvSandboxAdapter（science_harness/types.ts）
// 与 DatasetResolverKind 是存量适配器面——本模块是它们的合同登记层，不改
// 动存量接口（additive）。
//
// Cannot-prove：本机制证明「合同字段齐全、实现文件在场、声明间自洽」，
// 不证明 (a) 实现文件的内容真的具备声明的能力（运行时行为测试是
// testsAndFixtures 字段引用的测试职责——登记层只验「有」不验「行」）；
// (b) determinism 声明的真实性（声明是适配器作者的责任——本层只强制
// 声明必须在场且无内部矛盾）。

// ---------------------------------------------------------------------------
// 合同 schema：12 字段（宪法原文枚举）
// ---------------------------------------------------------------------------

export const ADAPTER_CONTRACT_FIELDS = [
  'capabilityId',
  'inputSchema',
  'outputSchema',
  'determinismProfile',
  'permissions',
  'resourceLimits',
  'provenanceFields',
  'supportedUnitsFormats',
  'failureTaxonomy',
  'retryIdempotency',
  'licenseSafetyBoundary',
  'testsAndFixtures',
] as const;
export type AdapterContractField = (typeof ADAPTER_CONTRACT_FIELDS)[number];

export type DeterminismProfile = 'deterministic' | 'deterministic-with-seed' | 'nondeterministic';

export interface AdapterPermissions {
  readonly network: 'none' | 'read-only' | 'read-write';
  readonly filesystem: 'none' | 'read-only' | 'read-write' | 'sandbox';
}

/** 适配器能力声明（12 字段合同）。 */
export interface AdapterCapabilityDeclaration {
  readonly capabilityId: string;
  /** 输入 schema 描述或 schema 文件引用。 */
  readonly inputSchema: string;
  readonly outputSchema: string;
  readonly determinismProfile: DeterminismProfile;
  readonly permissions: AdapterPermissions;
  /** 资源上限声明（CPU/内存/时长——文本描述或结构化引用）。 */
  readonly resourceLimits: string;
  /** 产出记录必须携带的 provenance 字段清单。 */
  readonly provenanceFields: readonly string[];
  /** 支持的单位/格式（如 'SI', 'jsonl', 'fits'）。 */
  readonly supportedUnitsFormats: readonly string[];
  /** 失败分类（适配器可产出的失败类别）。 */
  readonly failureTaxonomy: readonly string[];
  /** 重试/幂等行为声明。 */
  readonly retryIdempotency: 'idempotent-retry-safe' | 'retry-unsafe-manual' | 'at-most-once';
  /** 许可/安全边界声明。 */
  readonly licenseSafetyBoundary: string;
  /** 行为测试与 fixtures 引用（至少 1 项——无测试的能力不入册）。 */
  readonly testsAndFixtures: readonly string[];
  /** 实现文件引用（相对仓根路径——存在性检查的输入）。 */
  readonly implementationRef: string;
}

// ---------------------------------------------------------------------------
// 声明校验
// ---------------------------------------------------------------------------

export type DeclarationValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly string[] };

/** 12 字段齐全 + 数组字段非空 + id 非空校验（fail-closed）。 */
export function validateCapabilityDeclaration(d: AdapterCapabilityDeclaration): DeclarationValidation {
  const problems: string[] = [];
  if (d.capabilityId.trim().length === 0) problems.push('capabilityId must be non-empty');
  for (const f of ['inputSchema', 'outputSchema', 'resourceLimits', 'licenseSafetyBoundary'] as const) {
    if ((d[f] as string).trim().length === 0) problems.push(`${f} must be non-empty`);
  }
  if (d.provenanceFields.length === 0) problems.push('provenanceFields must list at least one field');
  if (d.supportedUnitsFormats.length === 0) problems.push('supportedUnitsFormats must list at least one unit/format');
  if (d.failureTaxonomy.length === 0) problems.push('failureTaxonomy must list at least one failure class');
  if (d.testsAndFixtures.length === 0) problems.push('testsAndFixtures must reference at least one test — capabilities without tests are not admitted');
  if ((d.implementationRef ?? '').trim().length === 0) problems.push('implementationRef must be non-empty');
  // 自洽：声称完全确定性的适配器必须声明幂等（不幂等的「确定性」经不起重试）
  if (d.determinismProfile === 'deterministic' && d.retryIdempotency !== 'idempotent-retry-safe') {
    problems.push(`determinism contradiction: profile=deterministic but retryIdempotency=${d.retryIdempotency} — a deterministic adapter must be retry-safe`);
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// 注册表（内存册 + 实现文件存在性检查）
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export class AdapterCapabilityRegistry {
  private readonly byId = new Map<string, AdapterCapabilityDeclaration>();
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /** 入册：字段校验 + id 去重 + 实现文件存在。 */
  register(d: AdapterCapabilityDeclaration): DeclarationValidation {
    const validation = validateCapabilityDeclaration(d);
    if (!validation.ok) return validation;
    if (this.byId.has(d.capabilityId)) {
      return { ok: false, problems: [`capabilityId "${d.capabilityId}" already registered — ids are unique`] };
    }
    const implPath = isAbsolute(d.implementationRef) ? d.implementationRef : join(this.repoRoot, d.implementationRef);
    if (!existsSync(implPath)) {
      return { ok: false, problems: [`implementationRef "${d.implementationRef}" does not exist under repo root — declared capability has no implementation`] };
    }
    this.byId.set(d.capabilityId, d);
    return { ok: true };
  }

  get(capabilityId: string): AdapterCapabilityDeclaration | null {
    return this.byId.get(capabilityId) ?? null;
  }

  list(): readonly AdapterCapabilityDeclaration[] {
    return [...this.byId.values()].sort((a, b) => (a.capabilityId < b.capabilityId ? -1 : 1));
  }

  size(): number {
    return this.byId.size;
  }

  /** 全册一致性：逐条重验（含实现文件在场——删实现文件后册子必须能检出）。 */
  consistencyCheck(): { readonly ok: boolean; readonly problems: readonly string[] } {
    const problems: string[] = [];
    for (const d of this.list()) {
      const v = validateCapabilityDeclaration(d);
      if (!v.ok) problems.push(...v.problems.map((p) => `[${d.capabilityId}] ${p}`));
      const implPath = isAbsolute(d.implementationRef) ? d.implementationRef : join(this.repoRoot, d.implementationRef);
      if (!existsSync(implPath)) {
        problems.push(`[${d.capabilityId}] implementationRef "${d.implementationRef}" missing on disk — declaration/implementation drift`);
      }
    }
    return { ok: problems.length === 0, problems };
  }
}

// ---------------------------------------------------------------------------
// 按需求选适配器（fail-closed：不满足即拒绝，不静默降级）
// ---------------------------------------------------------------------------

export interface AdapterRequirement {
  /** 需要的确定性下限（'deterministic' 最强）。 */
  readonly determinism?: DeterminismProfile;
  /** 网络权限上限（需求为 read-only 时，read-write 适配器超出边界 → 拒）。 */
  readonly maxNetworkPermission?: AdapterPermissions['network'];
  /** 需要的单位/格式（至少一项匹配）。 */
  readonly requiredUnitsFormats?: readonly string[];
}

export type AdapterSelection =
  | { readonly ok: true; readonly matches: readonly AdapterCapabilityDeclaration[] }
  | { readonly ok: false; readonly reason: string; readonly matches: readonly AdapterCapabilityDeclaration[] };

const DETERMINISM_STRENGTH: Readonly<Record<DeterminismProfile, number>> = {
  deterministic: 3,
  'deterministic-with-seed': 2,
  nondeterministic: 1,
};

const NETWORK_PERMISSIVENESS: Readonly<Record<AdapterPermissions['network'], number>> = {
  none: 0,
  'read-only': 1,
  'read-write': 2,
};

/** 按需求选适配器：全部约束满足的候选集；零匹配 → 拒绝并给出原因。 */
export function selectAdapter(
  registry: AdapterCapabilityRegistry,
  requirement: AdapterRequirement,
): AdapterSelection {
  const all = registry.list();
  const matches = all.filter((d) => {
    if (requirement.determinism !== undefined && DETERMINISM_STRENGTH[d.determinismProfile] < DETERMINISM_STRENGTH[requirement.determinism]) {
      return false;
    }
    if (
      requirement.maxNetworkPermission !== undefined &&
      NETWORK_PERMISSIVENESS[d.permissions.network] > NETWORK_PERMISSIVENESS[requirement.maxNetworkPermission]
    ) {
      return false;
    }
    if (requirement.requiredUnitsFormats !== undefined) {
      const has = requirement.requiredUnitsFormats.some((u) => d.supportedUnitsFormats.includes(u));
      if (!has) return false;
    }
    return true;
  });
  if (matches.length === 0) {
    return {
      ok: false,
      matches,
      reason: `no registered adapter satisfies the requirement (determinism=${requirement.determinism ?? 'any'}, maxNetwork=${requirement.maxNetworkPermission ?? 'any'}, units=${requirement.requiredUnitsFormats?.join('|') ?? 'any'}; registry has ${all.length} entries) — fail-closed, no silent downgrade`,
    };
  }
  return { ok: true, matches };
}
