// tests/scripts/probe_python_axis.test.mjs
//
// P3-1 真实断言测试：闭合审计发现「proof_test 是观察性 stdout 描述、零断言存在」。
//
// 单一真实依赖（T8）：probePythonAxis() 内部真实 spawnSync(python3|python,
//   ['-c', 'import sympy, z3; print("available")'])。本测试不 mock spawnSync ——
//   它验证真实探针在当前环境（python 可用或不可用）下都输出**机读友好**的首行契约 + 与返回形态**双向一致**。
//
// 诚实边界（CLAUDE.md §3 + 02 F1 never-fabricate）：本测试**不断言** available=true/false
//   （那是环境属性，非代码属性）。它断言的是**契约**：
//   (a) 探针只写一个 chunk（契约行在任何其他输出之前，无前言噪声污染 CI 日志）
//   (b) 首行严格匹配 ^Python axis: (available|skipped \(.+\))$ —— CI grep / 人类可读
//   (c) available===true ↔ 首行 = 'Python axis: available'，且不携带 reason
//   (d) available===false ↔ 首行 = 'Python axis: skipped (<reason>)'，reason 非空且**字面**出现在首行
//   (e) 同环境多次调用确定性（探针不读随机源）
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C P3-1 + CLAUDE.md §3（环境失败 ≠ 代码 bug）
//            + scripts/run_py_tests.mjs:16-39 probePythonAxis 实现。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { probePythonAxis } from '../../scripts/run_py_tests.mjs';

const FIRST_LINE_RE = /^Python axis: (available|skipped \(.+\))$/;

test('probePythonAxis: emits machine-readable first-line contract + honest shape', () => {
  const sink = [];
  const result = probePythonAxis((s) => { sink.push(s); });

  assert.equal(sink.length, 1, 'probe must write exactly one chunk first (no preamble before the contract line)');

  const firstLine = sink[0].split('\n', 1)[0];
  assert.match(
    firstLine,
    FIRST_LINE_RE,
    'first line must be CI-greppable: "Python axis: available" or "Python axis: skipped (<reason>)"',
  );

  if (result.available) {
    assert.equal(firstLine, 'Python axis: available', 'available===true must align with the "available" line');
    assert.equal('reason' in result, false, 'available result must not fabricate a reason');
  } else {
    assert.ok(
      firstLine.startsWith('Python axis: skipped ('),
      'available===false must align with the "skipped (...)" line',
    );
    assert.ok(
      typeof result.reason === 'string' && result.reason.length > 0,
      'skipped result must carry a non-empty honest reason (never silent)',
    );
    assert.ok(
      firstLine.includes(result.reason),
      'first-line reason text must equal result.reason (human-readable text == machine-readable field, no drift)',
    );
  }
});

test('probePythonAxis: deterministic across repeated calls in the same environment', () => {
  const sink1 = [];
  const sink2 = [];
  const r1 = probePythonAxis((s) => { sink1.push(s); });
  const r2 = probePythonAxis((s) => { sink2.push(s); });

  assert.equal(r1.available, r2.available, 'same env → same verdict (probe reads no entropy source)');
  assert.deepEqual(sink1, sink2, 'probe output must be byte-stable across calls');
});
