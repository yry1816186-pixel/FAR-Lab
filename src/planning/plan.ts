// src/planning/plan.ts
// 职责：opencode /plan 源代码化 —— Plan DAG 校验引擎（确定性纯函数）。
//
// 门禁（对应 opencode /plan 铁律 + AGENT-LIFECYCLE §2.3）：
//   1. 非空计划（≥1 步）
//   2. 步骤 id 唯一
//   3. 每步有动作描述 + 合法风险级
//   4. 每步可独立验证（verification 非空）—— 无验证命令的步骤是占位符
//   5. 依赖完整性（dependsOn 引用的 id 必须存在）
//   6. 无循环依赖（DFS 环检测）
//   7. 输出确定性拓扑执行顺序（Kahn 算法，id 字典序稳定）

import type { Plan, PlanValidationResult, PlanViolation, RiskLevel } from './types.ts';
import { RISK_LEVELS } from './types.ts';

const RISK_SET: ReadonlySet<string> = new Set<string>(RISK_LEVELS);

/**
 * 校验 Plan 并输出确定性拓扑序。
 * ok=false 时 executionOrder=[]，violations 列出全部违规（非首个即止）。
 */
export function validatePlan(plan: Plan): PlanValidationResult {
  const violations: PlanViolation[] = [];

  // 1. 非空计划（schema 已保证 ≥1 步，双保险）
  if (plan.steps.length === 0) {
    violations.push({ stepId: '*', code: 'EMPTY_PLAN', message: 'plan has no steps' });
    return { ok: false, violations, executionOrder: [] };
  }

  // 2. 步骤 id 唯一 + 每步字段合法
  const seen = new Set<string>();
  for (const step of plan.steps) {
    if (seen.has(step.id)) {
      violations.push({ stepId: step.id, code: 'DUPLICATE_STEP_ID', message: `duplicate step id '${step.id}'` });
    }
    seen.add(step.id);

    if (step.action.trim().length === 0) {
      violations.push({ stepId: step.id, code: 'EMPTY_ACTION', message: `step '${step.id}' has empty action` });
    }
    if (!RISK_SET.has(step.risk)) {
      violations.push({
        stepId: step.id,
        code: 'INVALID_RISK',
        message: `step '${step.id}' has invalid risk '${String(step.risk)}' (expected P0-P4)`,
      });
    }
    if (step.verification.trim().length === 0) {
      violations.push({
        stepId: step.id,
        code: 'MISSING_VERIFICATION',
        message: `step '${step.id}' has no verification command (unverifiable step = placeholder, not a plan)`,
      });
    }
  }

  const ids = new Set<string>(plan.steps.map((s) => s.id));

  // 3. 依赖完整性（dependsOn 引用必须存在；自依赖也算缺失/环）
  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) {
        violations.push({
          stepId: step.id,
          code: 'MISSING_DEPENDENCY',
          message: `step '${step.id}' depends on unknown step '${dep}'`,
        });
      }
    }
  }

  // 4. 循环检测 + 拓扑序（Kahn；id 字典序稳定保证确定性）
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const step of plan.steps) {
    indegree.set(step.id, 0);
    children.set(step.id, []);
  }
  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) continue; // 已报 MISSING_DEPENDENCY
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
      children.get(dep)?.push(step.id);
    }
  }

  const ready: string[] = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort();
  const executionOrder: string[] = [];

  while (ready.length > 0) {
    const id = ready.shift() as string;
    executionOrder.push(id);
    const next = (children.get(id) ?? []).slice().sort();
    for (const child of next) {
      const d = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, d);
      if (d === 0) {
        // 按字典序插入，保持稳定
        const insertAt = ready.findIndex((r) => r > child);
        if (insertAt === -1) ready.push(child);
        else ready.splice(insertAt, 0, child);
      }
    }
  }

  if (executionOrder.length < plan.steps.length) {
    const cyclic = plan.steps
      .filter((s) => !executionOrder.includes(s.id))
      .map((s) => s.id)
      .sort();
    violations.push({
      stepId: cyclic.join(','),
      code: 'CYCLE_DETECTED',
      message: `cycle detected among steps: ${cyclic.join(', ')}`,
    });
    return { ok: false, violations, executionOrder: [] };
  }

  return { ok: violations.length === 0, violations, executionOrder };
}

/** 快速检查单个风险值是否合法（供 CLI/文档复用）。 */
export function isValidRiskLevel(risk: string): risk is RiskLevel {
  return RISK_SET.has(risk);
}
