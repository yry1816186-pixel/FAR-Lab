// src/planning/batch_contract.ts
// 职责：CORE-BATCH-001 —— batch contract（有界实验/交付单元合同）+ 收尾证据对拍引擎。
//
// 宪法 §4.2（CORE_CONSTITUTION.md L583-609）：每个 batch 必须声明 12 项合同字段，且收尾
// 证据与目标一致。本模块把该协议源代码化：
//   1. BatchContractSchema —— 12 字段 zod SSOT（objective / valueHypothesis / scope+nonScope /
//      requirementIds / verifiedFacts+unknowns / dependencies / allowedWriteSet /
//      acceptanceCommands / risk / rollback / expectedInformationGain / stopConditions）。
//   2. BatchClosureSchema —— 收尾声明：≥1 类宪法产出（能力增量/未知消减/否定结论/缺陷修复）
//      + 每条验收命令的实际结果 + 实际写入文件 + 未达成项显式交代。
//   3. validateBatchContract —— 结构完整性之上的语义门（rollback 不得为 none、需求 ID 形状、
//      写集不得绝对路径逃逸、scope/nonScope 自相矛盾）。
//   4. matchClosureToContract —— closure-evidence-match：每条验收命令必须有结果且 pass
//      （not_run 一律 fail-closed）、实际写入必须落在 allowedWriteSet 内、声称解决的未知必须
//      在合同中登记过。
//
// 设计原则（与 planning 域一致）：
//   - 确定性纯函数，无 LLM / 无 IO / 无随机。
//   - 违规枚举可机检（每条违规 = 代码 + 消息），绝不静默降级。
//
// Cannot-prove 声明（AGENTS.md §7 纪律，虽非 trust-kernel 路径仍遵循）：
//   本引擎只能对拍「结构一致性」——验收命令是否有结果、结果是否 pass、写入是否越界、
//   产出是否 ≥1 类。它不能证明「pass 的 actual 字符串是否真实反映命令输出」或「产出是否
//   语义上达成 objective」——那由命令级证据纪律（receipts / CI 日志）锚定，本层不做语义裁判。

import { z } from 'zod';

import { RiskLevelSchema } from './types.ts';

// ---------------------------------------------------------------------------
// Batch Contract —— 宪法 §4.2 十二字段
// ---------------------------------------------------------------------------

export const BatchAcceptanceCommandSchema = z.object({
  /** 验收命令 ID（唯一，closure 结果的引用键）。 */
  id: z.string().min(1),
  /** 命令（可执行、可复跑）。 */
  command: z.string().min(1),
  /** 通过标准（判读依据）。 */
  expected: z.string().min(1),
});

export const BatchContractSchema = z.object({
  /** batch 标识（checkpoint / 决策台账引用键）。 */
  batchId: z.string().min(1),
  /** 目标（要解决的真实问题）。 */
  objective: z.string().min(1),
  /** 价值假设：预期交付什么价值给谁（可被证据证实/证伪）。 */
  valueHypothesis: z.string().min(1),
  /** 范围内（做什么）。 */
  scope: z.array(z.string().min(1)).min(1),
  /** 范围外（明确不做什么）。 */
  nonScope: z.array(z.string().min(1)).default([]),
  /** 关联的宪法需求 ID（如 CORE-BATCH-001）。 */
  requirementIds: z.array(z.string().min(1)).min(1),
  /** 已验证事实（带证据锚点）。 */
  verifiedFacts: z.array(z.string().min(1)).default([]),
  /** 关键未知（收尾时逐项对账）。 */
  unknowns: z.array(z.string().min(1)).default([]),
  /** 依赖（前置 batch / 资产 / 裁决）。 */
  dependencies: z.array(z.string().min(1)).default([]),
  /** 允许写入集（仓库相对路径 / 目录前缀 / `dir/**` 通配）。 */
  allowedWriteSet: z.array(z.string().min(1)).min(1),
  /** 验收命令（收尾时每条必须有结果）。 */
  acceptanceCommands: z.array(BatchAcceptanceCommandSchema).min(1),
  /** 风险级（P0-P4，§12）。 */
  risk: RiskLevelSchema,
  /** 回滚方案（「none/无/不可逆」一律拒绝——§13 handoff rollback:none 拒收）。 */
  rollback: z.string().min(1),
  /** 预期信息增益（这个 batch 将减少什么不确定性）。 */
  expectedInformationGain: z.string().min(1),
  /** 停止条件（何时判定此路不通或已达成）。 */
  stopConditions: z.array(z.string().min(1)).min(1),
});

export type BatchAcceptanceCommand = z.infer<typeof BatchAcceptanceCommandSchema>;
export type BatchContract = z.infer<typeof BatchContractSchema>;

export interface BatchViolation {
  readonly code: BatchViolationCode;
  readonly message: string;
}

export type BatchViolationCode =
  | 'ROLLBACK_NONE'
  | 'REQUIREMENT_ID_MALFORMED'
  | 'DUPLICATE_ACCEPTANCE_ID'
  | 'WRITE_SET_ESCAPE'
  | 'SCOPE_SELF_CONTRADICTION';

export interface BatchValidationResult {
  readonly ok: boolean;
  readonly violations: readonly BatchViolation[];
}

/** 需求 ID 形状：<大写字母/数字/连字符的组> - <三位序号>（如 CORE-BATCH-001 / UX-VIZ-001 / ENG-TEST-001）。 */
const REQUIREMENT_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d{3}$/;

/** rollback 声明的拒绝值（不可逆合同不是合同——宪法要求每个 batch 可回滚）。 */
const ROLLBACK_REJECTS = new Set(['none', 'n/a', 'na', '无', '不可逆', 'irreversible']);

/** 写集条目必须仓库相对（拒绝绝对路径 / 盘符 / 上跳 / 反斜杠）。 */
function isRepoRelativePath(entry: string): boolean {
  if (entry.startsWith('/') || entry.startsWith('\\')) return false;
  if (/^[A-Za-z]:/.test(entry)) return false;
  if (entry.split('/').includes('..')) return false;
  if (entry.includes('\\')) return false;
  return true;
}

/**
 * 校验 batch contract 语义完整（zod 之上的门）。trustKernelPaths 语义不适用于此层。
 */
export function validateBatchContract(contract: BatchContract): BatchValidationResult {
  const violations: BatchViolation[] = [];

  // rollback 不得为「无」——可回滚性是 batch 合同的硬约束
  const rollbackNorm = contract.rollback.trim().toLowerCase();
  if (ROLLBACK_REJECTS.has(rollbackNorm)) {
    violations.push({
      code: 'ROLLBACK_NONE',
      message: `rollback='${contract.rollback}' rejected — every batch must be reversible (AGENTS.md §13: rollback:none is not a handoff)`,
    });
  }

  // 需求 ID 形状（畸形 ID = 无法对账到宪法需求）
  for (const rid of contract.requirementIds) {
    if (!REQUIREMENT_ID_RE.test(rid)) {
      violations.push({
        code: 'REQUIREMENT_ID_MALFORMED',
        message: `requirement id '${rid}' malformed — expected shape like CORE-BATCH-001 (UPPER tokens + 3-digit ordinal)`,
      });
    }
  }

  // 验收命令 ID 唯一（closure 结果按 id 对账，重复 = 对账歧义）
  const seen = new Set<string>();
  for (const cmd of contract.acceptanceCommands) {
    if (seen.has(cmd.id)) {
      violations.push({
        code: 'DUPLICATE_ACCEPTANCE_ID',
        message: `duplicate acceptance command id '${cmd.id}' — closure results are keyed by id`,
      });
    }
    seen.add(cmd.id);
  }

  // 写集仓库相对（绝对路径 / 上跳 = 写集不可约束）
  for (const entry of contract.allowedWriteSet) {
    if (!isRepoRelativePath(entry)) {
      violations.push({
        code: 'WRITE_SET_ESCAPE',
        message: `allowedWriteSet entry '${entry}' must be a repo-relative path (no leading '/', drive letter, '..' or backslash)`,
      });
    }
  }

  // scope 与 nonScope 同条目 = 自相矛盾合同
  const nonScopeSet = new Set(contract.nonScope);
  for (const s of contract.scope) {
    if (nonScopeSet.has(s)) {
      violations.push({
        code: 'SCOPE_SELF_CONTRADICTION',
        message: `'${s}' declared in both scope and nonScope — contradictory contract`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Batch Closure —— 收尾声明 + closure-evidence-match
// ---------------------------------------------------------------------------

/** 宪法 §4.2：batch 结束至少产生以下之一（四类产出，枚举对齐宪法原文）。 */
export const BATCH_OUTCOME_KINDS = [
  'CAPABILITY_INCREMENT',
  'UNKNOWN_REDUCTION',
  'NEGATIVE_CONCLUSION',
  'DEFECT_FIX',
] as const;
export type BatchOutcomeKind = (typeof BATCH_OUTCOME_KINDS)[number];

export const BatchOutcomeSchema = z.object({
  kind: z.enum(BATCH_OUTCOME_KINDS),
  /** 产出证据（命令输出 / PR / checkpoint 引用——可追溯到真实工件）。 */
  evidence: z.string().min(1),
});

export const BatchAcceptanceResultSchema = z.object({
  /** pass / fail / not_run（未跑必须显式标注，绝不默认通过——四步门纪律）。 */
  status: z.enum(['pass', 'fail', 'not_run']),
  /** 实际输出的关键行。 */
  actual: z.string().min(1),
});

export const BatchClosureSchema = z.object({
  /** 产出（≥1 类，每类带证据）。 */
  outcomes: z.array(BatchOutcomeSchema).min(1),
  /** 验收命令结果（key = acceptanceCommands.id；缺失即违规）。 */
  acceptanceResults: z.record(z.string(), BatchAcceptanceResultSchema),
  /** 实际写入的文件（对拍 allowedWriteSet）。 */
  filesWritten: z.array(z.string().min(1)).default([]),
  /** 未达成项（item + 原因——收尾未覆盖 objective 的部分必须显式交代）。 */
  unachieved: z
    .array(
      z.object({
        item: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .default([]),
  /** 声称已解决的合同未知项（必须在 contract.unknowns 中登记过）。 */
  unknownsResolved: z.array(z.string().min(1)).default([]),
});

export type BatchOutcome = z.infer<typeof BatchOutcomeSchema>;
export type BatchAcceptanceResult = z.infer<typeof BatchAcceptanceResultSchema>;
export type BatchClosure = z.infer<typeof BatchClosureSchema>;

export interface ClosureViolation {
  readonly code: ClosureViolationCode;
  readonly message: string;
}

export type ClosureViolationCode =
  | 'ACCEPTANCE_RESULT_MISSING'
  | 'ACCEPTANCE_FAILED'
  | 'ACCEPTANCE_NOT_RUN'
  | 'WRITE_OUT_OF_CONTRACT'
  | 'UNKNOWN_RESOLUTION_UNDECLARED';

export interface ClosureMatchResult {
  readonly ok: boolean;
  readonly violations: readonly ClosureViolation[];
  /** 摘要（对账结果一览，供 checkpoint / CLI 输出）。 */
  readonly summary: {
    readonly acceptanceTotal: number;
    readonly acceptancePassed: number;
    readonly outcomesByKind: Readonly<Record<string, number>>;
    readonly filesWritten: number;
    readonly unknownsResolved: number;
  };
}

/** 判定文件是否落在允许写入集内（精确 / 目录前缀 / `dir/**` 通配，确定性匹配）。 */
export function writeSetAllows(file: string, allowedWriteSet: readonly string[]): boolean {
  for (const entry of allowedWriteSet) {
    if (file === entry) return true;
    if (entry.endsWith('/**')) {
      const prefix = entry.slice(0, -2); // 'dir/**' → 'dir/'
      if (file.startsWith(prefix)) return true;
      continue;
    }
    if (entry.endsWith('/') && file.startsWith(entry)) return true;
  }
  return false;
}

/**
 * closure-evidence-match：收尾证据与合同目标对拍（CORE-BATCH-001 验收语义的机器化）。
 * fail-closed：任一验收命令缺结果 / fail / not_run，或写入越界 → 不 ok。
 */
export function matchClosureToContract(
  contract: BatchContract,
  closure: BatchClosure,
): ClosureMatchResult {
  const violations: ClosureViolation[] = [];
  let passed = 0;

  for (const cmd of contract.acceptanceCommands) {
    const result = closure.acceptanceResults[cmd.id];
    if (result === undefined) {
      violations.push({
        code: 'ACCEPTANCE_RESULT_MISSING',
        message: `acceptance command '${cmd.id}' has no closure result — every command must be accounted for`,
      });
      continue;
    }
    if (result.status === 'fail') {
      violations.push({
        code: 'ACCEPTANCE_FAILED',
        message: `acceptance command '${cmd.id}' failed: ${result.actual}`,
      });
      continue;
    }
    if (result.status === 'not_run') {
      violations.push({
        code: 'ACCEPTANCE_NOT_RUN',
        message: `acceptance command '${cmd.id}' marked not_run — not_run never counts as pass (four-step gate discipline)`,
      });
      continue;
    }
    passed += 1;
  }

  for (const file of closure.filesWritten) {
    if (!writeSetAllows(file, contract.allowedWriteSet)) {
      violations.push({
        code: 'WRITE_OUT_OF_CONTRACT',
        message: `file '${file}' written outside allowedWriteSet [${contract.allowedWriteSet.join(', ')}]`,
      });
    }
  }

  const declaredUnknowns = new Set(contract.unknowns);
  for (const u of closure.unknownsResolved) {
    if (!declaredUnknowns.has(u)) {
      violations.push({
        code: 'UNKNOWN_RESOLUTION_UNDECLARED',
        message: `unknown '${u}' claimed resolved but never declared in contract.unknowns — accountability requires declaration first`,
      });
    }
  }

  const outcomesByKind: Record<string, number> = {};
  for (const o of closure.outcomes) {
    outcomesByKind[o.kind] = (outcomesByKind[o.kind] ?? 0) + 1;
  }

  return {
    ok: violations.length === 0,
    violations,
    summary: {
      acceptanceTotal: contract.acceptanceCommands.length,
      acceptancePassed: passed,
      outcomesByKind,
      filesWritten: closure.filesWritten.length,
      unknownsResolved: closure.unknownsResolved.length,
    },
  };
}
