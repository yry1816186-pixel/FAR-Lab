// src/planning/gate.ts
// 职责：opencode /verify-full 源代码化 —— 四步门函数报告引擎（确定性纯函数）。
//
// 四步门函数：IDENTIFY（识别验证维度）→ RUN（运行命令）→ READ（亲读输出）→ VERIFY（证据落盘）。
// 纪律（AGENT-LIFECYCLE §5.2 grade + verification-before-completion）：
//   1. 未跑的验证项必须显式标注 not_run —— 绝不默认通过。
//   2. failed > 0          → BLOCKED（门禁失败，禁止声称完成）
//   3. not_run > 0         → IMPLEMENTED_UNVERIFIED（实现完成但验证缺失）
//   4. 全部 pass           → DONE
//   5. 空验证项列表        → IMPLEMENTED_UNVERIFIED（无验证证据 = 无完成声明）

import type {
  GateConclusion,
  GateReport,
  VerificationRunResult,
  VerificationStatus,
} from './types.ts';

/**
 * 构建门禁报告。items 为计划内的验证项，results 为实际运行结果（key = item id）。
 * 缺失的 results key 视为 not_run（fail-closed：没有证据 = 未验证）。
 */
export function buildGateReport(
  items: readonly { id: string; name: string; command: string; expected: string }[],
  results: Readonly<Record<string, VerificationRunResult>>,
): GateReport {
  const passed: string[] = [];
  const failed: string[] = [];
  const notRun: string[] = [];

  for (const item of items) {
    const result = results[item.id];
    const status: VerificationStatus = result === undefined ? 'not_run' : result.status;
    if (status === 'pass') passed.push(item.id);
    else if (status === 'fail') failed.push(item.id);
    else notRun.push(item.id);
  }

  let conclusion: GateConclusion;
  let rationale: string;

  if (items.length === 0) {
    conclusion = 'IMPLEMENTED_UNVERIFIED';
    rationale = 'no verification items declared — no evidence, no completion claim';
  } else if (failed.length > 0) {
    conclusion = 'BLOCKED';
    rationale = `gate failed: ${failed.length} item(s) failed (${failed.join(', ')}) — diagnose root cause, fix, re-run`;
  } else if (notRun.length > 0) {
    conclusion = 'IMPLEMENTED_UNVERIFIED';
    rationale = `not_run item(s) present: ${notRun.join(', ')} — unverified items must be explicitly labeled, never default-passed`;
  } else {
    conclusion = 'DONE';
    rationale = `all ${passed.length} verification item(s) passed with evidence`;
  }

  return { items, results, passed, failed, notRun, conclusion, rationale };
}

/** 渲染门禁报告为 markdown（CLI / PROGRESS 落盘共用）。 */
export function renderGateReport(report: GateReport): string {
  const lines: string[] = ['## 验证报告', '', '| 验证项 | 命令 | 状态 | 实际输出 |', '|--------|------|------|---------|'];
  for (const item of report.items) {
    const r = report.results[item.id];
    const status = r?.status ?? 'not_run';
    const actual = r?.actual ?? '—';
    lines.push(`| ${item.name} | \`${item.command}\` | ${status.toUpperCase()} | ${actual.replace(/\|/g, '\\|')} |`);
  }
  lines.push('', `### 裁决`);
  lines.push(`- 结论: **${report.conclusion}**`);
  lines.push(`- 依据: ${report.rationale}`);
  return lines.join('\n');
}
