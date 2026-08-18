/**
 * math computeInputHash 跨语言一致性测试（[F] / Red Line #5）。
 *
 * Authority: TS/Python canonicalHash byte-equal /
 *            03 §2.4 + 38 §1（FormalExpression inputHash）。
 *
 * 兑现 math_verifier.ts inputHash 注释承诺（audit [F] F-1：原「空头支票」——
 * 注释声称 cross-lang byte-equality 但无 Python 实现 + 无跨语言测试）。
 *
 * 真跨语言门禁（spawnSync Python compute_input_hash，比对 TS MathVerifier.computeInputHash）。
 * 覆盖 confidence 边界：
 *   - 整数浮点 1.0 / 0.0（F-1 核心分歧：JS JSON.stringify="1" vs Python json.dumps="1.0" → 定点规范化消除）
 *   - 非平凡浮点 0.9 / 0.1+0.2 / 1/3（F-2 实测 byte-equal·定点进一步加固）
 *   - 极小值 1e-10（定点 6 位统一 "0.000000"·无指数阈值分歧）
 *   - target 变化（avalanche 跨语言同步）
 *
 * 跨平台 spawn：Windows 用 'python'（WindowsApps python3 是 Store stub·spawn 会挂起），
 *              Unix 用 'python3'（对齐 scripts/run_py_tests.mjs 策略）。
 *
 * 注：-0.0 不通过 spawn 测试（argv/JSON 跨进程丢失负零符号）——其归一化由
 *     tests/math/math_verifier.test.ts §5 + repro/tests/test_math_input_hash.py 在进程内验证。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MathVerifier, canonicalConfidence } from '../../src/math/math_verifier.ts';
import { buildPythonPath } from '../_helpers/python.ts';
import type { FormalExpression } from '../../src/math/math_claim.ts';

const farChainRoot = new URL('../../', import.meta.url);

// Windows: 'python'（真实安装）；Unix: 'python3'。WindowsApps python3 是 Store stub（spawn 挂起风险）。
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

interface CrossLangCase {
  // target 收窄为 FormalExpression['target']（"lean4"|"dafny"|"smtlib"）——computeInputHash 形参要求 narrow union
  readonly target: FormalExpression['target'];
  readonly source: string;
  readonly formalizerId: string;
  readonly confidence: number;
}

function pythonComputeInputHash(c: CrossLangCase): string {
  // argv 传参（避免 shell 转义·confidence 浮点精度由 Python float() 解析·与 TS 同 IEEE-754 double）
  const script = [
    'import sys',
    'from far_chain_repro.math_input_hash import compute_input_hash',
    'target, source, formalizer_id, confidence = '
      + 'sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])',
    'print(compute_input_hash(target, source, formalizer_id, confidence))',
  ].join('; ');
  const result = spawnSync(
    PYTHON_CMD,
    ['-c', script, c.target, c.source, c.formalizerId, String(c.confidence)],
    {
      cwd: farChainRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: buildPythonPath(process.env.PYTHONPATH),
      },
    },
  );
  assert.equal(result.status, 0, `Python spawn failed: ${result.stderr}`);
  return result.stdout.trim();
}

const verifier = new MathVerifier();

function assertCrossLangEqual(c: CrossLangCase): void {
  const tsHash = verifier.computeInputHash({
    target: c.target,
    source: c.source,
    formalizerId: c.formalizerId,
    confidence: c.confidence,
  });
  const pyHash = pythonComputeInputHash(c);
  assert.equal(
    tsHash,
    pyHash,
    `TS computeInputHash !== Python compute_input_hash for confidence=${c.confidence} `
      + `(TS canonicalConfidence="${canonicalConfidence(c.confidence)}")`,
  );
}

// ---------- F-1 核心修复：整数浮点（1.0）跨语言 byte-equal ----------

test('[F] 跨语言 byte-equal：confidence=1.0（整数浮点·F-1 核心分歧点）', () => {
  // F-1：JS JSON.stringify(1.0)="1" vs Python json.dumps(1.0)="1.0" → 未规范化时字节发散
  assertCrossLangEqual({
    target: 'smtlib',
    source: '{"lhs":"x","rhs":"x"}',
    formalizerId: 'core_neutral@v1',
    confidence: 1.0,
  });
});

test('[F] 跨语言 byte-equal：confidence=0.0（整数浮点边界）', () => {
  assertCrossLangEqual({
    target: 'smtlib',
    source: 'src',
    formalizerId: 'core_neutral@v1',
    confidence: 0.0,
  });
});

// ---------- F-2：非平凡浮点 byte-equal（定点进一步加固） ----------

test('[F] 跨语言 byte-equal：confidence=0.9（非平凡浮点）', () => {
  assertCrossLangEqual({
    target: 'smtlib',
    source: 'src',
    formalizerId: 'core_neutral@v1',
    confidence: 0.9,
  });
});

test('[F] 跨语言 byte-equal：confidence=0.1+0.2（IEEE-754 浮点和）', () => {
  assertCrossLangEqual({
    target: 'lean4',
    source: 'theorem x : x = x := rfl',
    formalizerId: 'core_neutral@v1',
    confidence: 0.1 + 0.2, // 0.30000000000000004
  });
});

test('[F] 跨语言 byte-equal：confidence=1/3（无穷小数·shortest round-trip）', () => {
  assertCrossLangEqual({
    target: 'smtlib',
    source: 'src',
    formalizerId: 'core_neutral@v1',
    confidence: 1 / 3, // 0.3333333333333333
  });
});

// ---------- 边界：极小值（定点消除指数阈值分歧） ----------

test('[F] 跨语言 byte-equal：confidence=1e-10（极小值·定点 "0.000000"）', () => {
  // 未规范化时 JS String(1e-10)="1e-10" vs Python repr(1e-10)="1e-10"（此值恰巧一致），
  // 但中间阈值（如 1e-5）分歧：JS "0.00001" vs Python "1e-05"——定点 6 位统一消除
  assertCrossLangEqual({
    target: 'smtlib',
    source: 'src',
    formalizerId: 'core_neutral@v1',
    confidence: 1e-10,
  });
});

// ---------- 多 target 覆盖（avalanche 跨语言一致） ----------

test('[F] 跨语言 byte-equal：target 变化（smtlib ↔ lean4）两侧同步 avalanche', () => {
  const base = {
    source: '{"lhs":"x","rhs":"x"}',
    formalizerId: 'core_neutral@v1',
    confidence: 0.9,
  };
  const h1 = verifier.computeInputHash({ target: 'smtlib', ...base });
  const h2 = verifier.computeInputHash({ target: 'lean4', ...base });
  assert.notEqual(h1, h2, 'target 变化须产生不同 hash（avalanche）');
  // 两侧（TS / Python）都同步产生这个 avalanche
  assertCrossLangEqual({ target: 'smtlib', ...base });
  assertCrossLangEqual({ target: 'lean4', ...base });
});
