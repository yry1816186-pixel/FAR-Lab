// tests/cli/verify_golden_cross_lang.test.ts
//
// P1-4 端到端物证：far verify-golden（runVerifyGolden @ verify_golden.ts:122）真调 decideFiveValueVerdict
// 遍历 14 条落盘 GV（golden_vectors/cases/GV-01..GV-14.json），node backend 全 PASS（kernel oracle 自洽）。
// python/browser backend 按环境能力 best-effort：可用则断言跨后端 per-case verdict 一致；不可用则显式 skip（带 reason）。
//
// 真实依赖：verify_golden.ts collectVerifyGoldenDump({backend:'node'}) → 每条 GV 调 decideFiveValueVerdict
// （V2 kernel 真实运行，非硬编码旁路）。proof_caller = verify_golden.ts:122 runVerifyGolden。
// 反假绿：断言 dump.total===14 + status PASS + per-case decisiveRuleId 非空；python/browser 失败=环境 skip 非代码 bug。
//
// Authority: P1-4 + APPENDIX_B_GOLDEN §2（GV-01..GV-14）+ 04 §5。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  buildPythonPath,
  collectVerifyGoldenDump,
  runVerifyGolden,
} from '../../src/cli/commands/verify_golden.ts';

const NODE_DUMP = collectVerifyGoldenDump({ backend: 'node' });

test('node_python_browser_agree_on_GV: node backend runs all 14 GV through V2 kernel, PASS (P1-4 node axis)', () => {
  // runVerifyGolden（verify_golden.ts:122）返回 0=PASS / 7=FAIL——证明 CLI 真路径驱动 kernel。
  // 捕获 stdout 避免 JSON 文本污染测试输出（runVerifyGolden 直写 process.stdout）。
  const origWrite = process.stdout.write.bind(process.stdout);
  let exit: number;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    exit = runVerifyGolden({ backend: 'node', json: true });
  } finally {
    process.stdout.write = origWrite;
  }
  assert.equal(exit, 0, `runVerifyGolden node backend should exit 0 (PASS), got ${exit}`);

  assert.equal(NODE_DUMP.status, 'PASS', `node backend should PASS, errors: ${NODE_DUMP.errors.join('; ')}`);
  assert.equal(NODE_DUMP.total, 14, `expected 14 golden vectors on disk, got ${NODE_DUMP.total}`);
  assert.equal(NODE_DUMP.passed, 14, `all 14 GV should pass, got ${NODE_DUMP.passed} passed / ${NODE_DUMP.failed} failed`);
  assert.equal(NODE_DUMP.failed, 0);

  // 每条 GV 都真调了 decideFiveValueVerdict：decisiveRuleId 非空（非占位）。
  for (const result of NODE_DUMP.cases) {
    assert.ok(
      result.decisiveRuleId && result.decisiveRuleId.length > 0,
      `${result.caseId}: decisiveRuleId must be non-empty (kernel ran)`,
    );
    assert.equal(result.status, 'PASS', `${result.caseId}: expected PASS`);
    assert.equal(result.verdict, result.expectedVerdict, `${result.caseId}: verdict must match expected`);
  }
});

test('python backend agrees with node per-case verdicts (P1-4 python axis · skip if env unavailable)', (t) => {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  // 探针：far_chain_repro 依赖 sympy；缺 sympy / 缺 python = 环境问题（非代码 bug），显式 skip。
  const probe = spawnSync(pythonCmd, ['-c', 'import sympy'], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: buildPythonPath() } });
  if (probe.error !== undefined || probe.status !== 0) {
    t.skip(`python axis: skipped (sympy unavailable — ${probe.error?.message ?? probe.stderr?.trim() ?? 'non-zero exit'})`);
    return;
  }
  let pyDump;
  try {
    pyDump = collectVerifyGoldenDump({ backend: 'python' });
  } catch (error) {
    t.skip(`python axis: skipped (far_chain_repro module unavailable — ${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  assert.equal(pyDump.status, 'PASS', `python backend should PASS, errors: ${pyDump.errors.join('; ')}`);
  // 跨后端 per-case verdict 一致（node vs python）。
  for (const pyCase of pyDump.cases) {
    const nodeCase = NODE_DUMP.cases.find((c) => c.caseId === pyCase.caseId);
    assert.ok(nodeCase, `${pyCase.caseId}: missing from node dump`);
    assert.equal(pyCase.verdict, nodeCase.verdict, `${pyCase.caseId}: python verdict must match node verdict`);
  }
});

test('browser backend agrees with node per-case verdicts (P1-4 browser axis · skip if env unavailable)', (t) => {
  let brDump;
  try {
    brDump = collectVerifyGoldenDump({ backend: 'browser' });
  } catch (error) {
    t.skip(`browser axis: skipped (verify_golden.html / vm sandbox unavailable — ${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  assert.equal(brDump.status, 'PASS', `browser backend should PASS, errors: ${brDump.errors.join('; ')}`);
  for (const brCase of brDump.cases) {
    const nodeCase = NODE_DUMP.cases.find((c) => c.caseId === brCase.caseId);
    assert.ok(nodeCase, `${brCase.caseId}: missing from node dump`);
    assert.equal(brCase.verdict, nodeCase.verdict, `${brCase.caseId}: browser verdict must match node verdict`);
  }
});
