// tests/gates/ux_t1_gates.test.ts
// T1 UX 六项（UX-A11Y/API/CLI/I18N/PERF/WEB-001）：对真实仓库资产断言真实属性 +
// 机制纯函数负向/边界用例。幽灵根必须全红（缺资产 fail-closed）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkA11y,
  checkApiContract,
  checkCliSurface,
  checkI18n,
  checkPerf,
  checkWebWorkbench,
  explainableEta,
  progressFraction,
  pseudoLocalize,
  uxT1Gate,
  wideCharRatio,
} from '../../src/gates/ux_t1_gates.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PHANTOM = 'C:/phantom-root-ux';

// ---------------------------------------------------------------------------
// UX-A11Y-001
// ---------------------------------------------------------------------------

test('UX-A11Y-001: 真实可访问性资产面（reduced-motion/skip-link/focus-ring/aria 计数/非颜色通道/图表替代）', () => {
  const r = checkA11y(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('prefers-reduced-motion')), 'reduced-motion 证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('skipToContent')), 'skip-link 证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('focus-visible')), 'visible-focus 证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('aria')), 'aria 计数证据行缺失');
  // 诚实边界：无渲染环境的维度必须显式声明为 gap，而非静默通过
  assert.ok(r.declaredGaps.length >= 3, '对比度/读屏冒烟/触控目标等须显式 declaredGaps');
  assert.equal(checkA11y(PHANTOM).ok, false);
});

// ---------------------------------------------------------------------------
// UX-API-001
// ---------------------------------------------------------------------------

test('UX-API-001: OpenAPI 契约真实解析（路径数/全版本化/分页/限流 429）+ 错误目录 + 防漂移门', () => {
  const r = checkApiContract(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('unversioned=0')), '版本化断言证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('pagination')), '分页证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('rate-limit')), '限流证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('remediation')), '错误目录 remediation 证据行缺失');
  assert.equal(checkApiContract(PHANTOM).ok, false);
});

// ---------------------------------------------------------------------------
// UX-CLI-001
// ---------------------------------------------------------------------------

test('UX-CLI-001: CLI 三面（--json 自动化/doctor+resume 恢复/稳定退出码/可操作错误）', () => {
  const r = checkCliSurface(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('--json')), '--json 覆盖证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('doctor')), 'doctor 证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('exit codes')), '退出码契约证据行缺失');
  assert.ok(r.declaredGaps.some((g) => g.includes('completion')), 'shell 补全缺口须如实声明');
  assert.equal(checkCliSurface(PHANTOM).ok, false);
});

// ---------------------------------------------------------------------------
// UX-I18N-001
// ---------------------------------------------------------------------------

test('UX-I18N-001: 双语言目录键位/占位符零漂移 + verdict 规范值经 {raw} 透传（翻译不改认知状态）', () => {
  const r = checkI18n(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('drift=0')), '键位漂移证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('759') || /[0-9]{3} keys/.test(e)), '键量证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('{raw}')), 'verdict 透传证据行缺失');
  assert.equal(checkI18n(PHANTOM).ok, false);
});

test('UX-I18N-001 机制: pseudoLocalize 确定性 + 膨胀可控 + wideCharRatio 检出 CJK', () => {
  const a = pseudoLocalize('Run verification', 0.35);
  assert.equal(a, pseudoLocalize('Run verification', 0.35), '伪本地化必须确定性');
  assert.ok(a.length > 'Run verification'.length, '伪本地化必须变长（溢出风险暴露）');
  assert.ok(a.startsWith('[') && a.endsWith(']'), '伪本地化须加括号标记（截断可见）');
  assert.equal(pseudoLocalize('', 0.5), '[]');
  assert.ok(wideCharRatio('证据链evidence') > 0.25, 'CJK 宽字符占比应被检出（3/11≈0.27）');
  assert.equal(wideCharRatio('plain ascii'), 0);
});

// ---------------------------------------------------------------------------
// UX-PERF-001
// ---------------------------------------------------------------------------

test('UX-PERF-001: 长任务反馈面（cancel 端点/SSE 进度/断点续跑/性能预算门）全在场', () => {
  const r = checkPerf(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('cancel')), 'cancel 端点证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('SSE') || e.includes('events')), 'SSE 进度证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('resume')), 'resume 证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('budget')), '性能预算证据行缺失');
  assert.equal(checkPerf(PHANTOM).ok, false);
});

test('UX-PERF-001 机制: ETA/进度在总量未知时必须拒绝给出数字（禁虚假百分比）', () => {
  // 总量未知 → 无 ETA、无百分比（不确定性显式，而非编造）
  assert.equal(explainableEta(3, null, 5000).etaMs, null);
  assert.equal(explainableEta(3, null, 5000).basis, 'unknown-total');
  assert.equal(progressFraction(3, null), null);
  // 总量非法（<=0）同样拒绝
  assert.equal(explainableEta(3, 0, 5000).basis, 'unknown-total');
  assert.equal(progressFraction(3, -2), null);
  // 记账破坏（done>total）fail-closed：宁可不给进度也不给荒谬值
  assert.equal(progressFraction(7, 5), null);
  assert.equal(explainableEta(7, 5, 1000).basis, 'insufficient-signal');
  // 无速率信号（elapsed<=0 或 done<=0）
  assert.equal(explainableEta(0, 10, 5000).basis, 'insufficient-signal');
  assert.equal(explainableEta(2, 10, 0).basis, 'insufficient-signal');
  // 正常路径：可解释 ETA（线性外推，basis 可审计）
  const ok = explainableEta(2, 10, 4000);
  assert.equal(ok.basis, 'countable');
  assert.equal(ok.etaMs, 16000); // 2 单位耗 4s → 剩 8 单位 = 16s
  assert.equal(progressFraction(2, 8), 0.25);
});

// ---------------------------------------------------------------------------
// UX-WEB-001
// ---------------------------------------------------------------------------

test('UX-WEB-001: 路由表按科学对象组织（question/evidence/plan/verdict/history…）且零 chat 路由', () => {
  const r = checkWebWorkbench(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('routes')), '路由计数证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('chat')), '无-chat-路由证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('states')), '视图状态覆盖证据行缺失');
  assert.equal(checkWebWorkbench(PHANTOM).ok, false);
});

// ---------------------------------------------------------------------------
// 聚合器
// ---------------------------------------------------------------------------

test('uxT1Gate: 六项聚合一处；幽灵根整体 FAIL', () => {
  const gate = uxT1Gate(REPO_ROOT);
  assert.equal(gate.checks.length, 6);
  assert.equal(gate.pass, true, gate.checks.filter((c) => !c.ok).map((c) => `${c.requirement}: ${c.problems.join('; ')}`).join('\n'));
  assert.equal(uxT1Gate(PHANTOM).pass, false);
});
