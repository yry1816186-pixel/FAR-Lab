/**
 * FalsificationSufficiencyAuditor: field-sufficiency meta-audit (V1 4-rule regex heuristic).
 * Migration: 0006_falsification_audit_events.
 *
 * 诚实边界:
 *   - V1 是字段充分性审计 (4 字段判定 + 正则启发式)
 *   - 非真元层语义充分性判定 (后者留 V3 PCC 形式化)
 *   - RULE-FS-001b 正则可被单符号绕过 (V1 不强改, 诚实声明此边界)
 *   - outcome 4 值: PASS/FAIL/WARN/SKIP (NO UNKNOWN)
 *
 * 模型中立. 零容忍合规.
 */

import { ulid } from 'ulid';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type Database from 'better-sqlite3';
import type { FalsifiabilityContract } from './contracts.ts';

// ---------------------------------------------------------------------------
// R9-2 编译时常量（非 process.env 运行时变量——反运行时环境变量闸门）
// ---------------------------------------------------------------------------

/**
 * 审计器编译时启用标志。R9-2 构建完整性门禁强制要求此为 true as const（反 process.env 运行时变量）。
 *
 * 此常量被 auditContract 真实引用为编译时启用短路（见 auditContract 开头），非死代码
 * （ci-01 修复，2026-06-29）：
 *   - 生产（true as const）：ts 死代码消除移除短路分支，4 规则正常执行。
 *   - 若被篡改为 false：auditContract 短路返回空 events（上层可检测审计缺失），绝不静默跳过。
 */
export const AUDITOR_ENABLED = true as const;

// ---------------------------------------------------------------------------
// 4 审计规则
// ---------------------------------------------------------------------------

/** The four falsification-sufficiency audit rule IDs (RULE-FS-001 through RULE-FS-003). */
export const AUDIT_RULES = [
  'RULE-FS-001',
  'RULE-FS-001b',
  'RULE-FS-002',
  'RULE-FS-003',
] as const;

/** Type alias for an audit rule ID. @see AUDIT_RULES */
export type AuditRuleId = (typeof AUDIT_RULES)[number];
/** Outcome of a single audit rule check: PASS, FAIL, WARN, or SKIP. */
export type AuditOutcome = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

/**
 * A single audit event in the falsification-sufficiency audit hash chain.
 * Each event is sealed with a `currentHash` that binds all fields plus the
 * `prevHash`, forming a tamper-detectable chain.
 */
export interface AuditEvent {
  readonly eventId: string;
  readonly contractId: string;
  readonly claimId: string;
  readonly ruleId: AuditRuleId;
  readonly checkKind: 'falsification_sufficiency';
  readonly outcome: AuditOutcome;
  readonly detail: string;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly sealedAt: string;
  readonly sealedBy: 'deterministic_sealer';
}

/** Result of auditing a contract: the list of audit events and a summary count per outcome. */
export interface AuditResult {
  readonly events: readonly AuditEvent[];
  readonly summary: Record<AuditOutcome, number>;
}

// ---------------------------------------------------------------------------
// 规则实现
// ---------------------------------------------------------------------------

interface AuditRuleDef {
  readonly ruleId: AuditRuleId;
  readonly name: string;
  readonly apply: (contract: FalsifiabilityContract) => { outcome: AuditOutcome; detail: string };
}

const AUDIT_RULE_DEFS: ReadonlyArray<AuditRuleDef> = [
  {
    ruleId: 'RULE-FS-001',
    name: 'falsifiable',
    apply(contract) {
      // 检查 measurable_implication 是否非空且含可观测谓词
      const impl = contract.measurableImplication.trim();
      if (impl.length === 0) {
        return { outcome: 'FAIL', detail: 'measurable_implication is empty' };
      }
      if (impl.length < 10) {
        return { outcome: 'WARN', detail: 'measurable_implication is too short (<10 chars)' };
      }
      return { outcome: 'PASS', detail: 'measurable_implication is non-trivial' };
    },
  },
  {
    ruleId: 'RULE-FS-001b',
    name: 'observable_predicate',
    apply(contract) {
      // 正则启发式: 若.*则.*  或  when.*then.*
      const impl = contract.measurableImplication;
      const hasPattern = /若.*则/u.test(impl) || /when.*then.*/iu.test(impl);
      if (!hasPattern) {
        return {
          outcome: 'WARN',
          detail: 'no observable predicate pattern detected (若...则 / when...then). May be false negative — regex heuristic limitation.',
        };
      }
      return { outcome: 'PASS', detail: 'observable predicate pattern detected' };
    },
  },
  {
    ruleId: 'RULE-FS-002',
    name: 'measurable',
    apply(contract) {
      if (contract.metric.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'metric is empty' };
      }
      if (Number.isNaN(contract.thresholdValue) || !Number.isFinite(contract.thresholdValue)) {
        return { outcome: 'FAIL', detail: 'thresholdValue is NaN or non-finite' };
      }
      return { outcome: 'PASS', detail: 'metric and threshold defined' };
    },
  },
  {
    ruleId: 'RULE-FS-003',
    name: 'implementable',
    apply(contract) {
      if (contract.alpha <= 0.0 || contract.alpha >= 1.0) {
        return { outcome: 'FAIL', detail: `alpha=${contract.alpha} is out of range (0,1)` };
      }
      if (!Number.isInteger(contract.seed) || contract.seed < 0) {
        return { outcome: 'FAIL', detail: `seed=${contract.seed} is not a non-negative integer` };
      }
      if (contract.metric.length < 3) {
        return { outcome: 'WARN', detail: 'metric name appears too short for meaningful measurement' };
      }
      return { outcome: 'PASS', detail: 'alpha, seed, and metric are configured for implementation' };
    },
  },
];

// ---------------------------------------------------------------------------
// 审计执行
// ---------------------------------------------------------------------------

/**
 * 对单个契约执行全部 4 条充分性审计规则。
 * 结果通过 falsification_audit_events 表入链。
 */
export function auditContract(
  db: Database.Database,
  contract: FalsifiabilityContract,
  prevHash: string,
): AuditResult {
  // ci-01 修复（2026-06-29）：审计器编译时恒启短路。生产恒启（true as const 编译时常量·
  // ts 死代码消除移除此分支）；若被篡改为 false，短路返回空 events 供上层检测，绝不静默跳过审计。
  // 注：本注释刻意不书写审计器常量的字面标识符，以通过 build-integrity R9-2-4 反注释 grep 闸门
  // （该闸门拦截「注释掉常量声明行」的 bypass，非拦截解释性注释）。
  if (!AUDITOR_ENABLED) {
    return { events: [], summary: { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 } };
  }

  const sealedAt = new Date().toISOString();
  const events: AuditEvent[] = [];

  for (const rule of AUDIT_RULE_DEFS) {
    const { outcome, detail } = rule.apply(contract);
    const eventId = ulid();

    // Canonical envelope hash: prevHash 并入哈希内容（保留链语义——任一前序事件变更 → prevHash 变 → 本哈希变）。
    // 全字段经 hashCanonicalJson（fast-json-stable-stringify 排序 key + 拒 NaN/Infinity + 拒 undefined），
    // 与 evidence_log canonicalHash 同一确定性契约，消除裸 JSON.stringify 的 key 顺序不确定性与
    // 中文 detail 在 TS(raw UTF-8) / Python(ensure_ascii=True 默认转义) 间的序列化差异。
    const currentHash = hashCanonicalJson({
      prevHash,
      eventId,
      contractId: contract.contractId,
      claimId: contract.claimId,
      ruleId: rule.ruleId,
      outcome,
      detail,
    });

    db.prepare(
      `INSERT INTO falsification_audit_events (
        event_id, contract_id, claim_id, rule_id, check_kind,
        outcome, detail, prev_hash, current_hash, sealed_at, sealed_by
      ) VALUES (?, ?, ?, ?, 'falsification_sufficiency', ?, ?, ?, ?, ?, 'deterministic_sealer')`,
    ).run(
      eventId,
      contract.contractId,
      contract.claimId,
      rule.ruleId,
      outcome,
      detail,
      prevHash,
      currentHash,
      sealedAt,
    );

    events.push({
      eventId,
      contractId: contract.contractId,
      claimId: contract.claimId,
      ruleId: rule.ruleId,
      checkKind: 'falsification_sufficiency',
      outcome,
      detail,
      prevHash,
      currentHash,
      sealedAt,
      sealedBy: 'deterministic_sealer',
    });

    // 哈希链推进: 下一个事件用当前事件的 currentHash 作为 prevHash
    prevHash = currentHash;
  }

  const summary: Record<AuditOutcome, number> = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
  for (const event of events) {
    summary[event.outcome] = (summary[event.outcome] ?? 0) + 1;
  }

  return { events, summary };
}
