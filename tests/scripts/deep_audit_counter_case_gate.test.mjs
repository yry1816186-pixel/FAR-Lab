// deep_audit_counter_case_gate.test.mjs — Deep Audit counter-case 门禁测试。
// 对接 docs/governance/AGENT-LIFECYCLE.md §2.5 (REVIEW 红队) + §5.1 (find_gaps)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SCRIPT = "scripts/deep_audit_counter_case_gate.mjs";

function runViaStdin(text) {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8", input: text });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("① review 含带证据 counter-case → exit 0", () => {
  const review = `# Review: A2 anti-theater detector

## Counter-case: Ritchie refutes 误报
未加 effectiveDirection='supports' 守卫时，Ritchie 复现失败（refutes + negative effectSize）
在 src/anti_theater/detectors/effect_p_mismatch.ts:87 误报为伪造。
测试 tests/anti_theater/effect_p_mismatch.test.ts:142 验证守卫修复后 pass。

## 正面评价
实现完整，覆盖三层一致性检查。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
  assert.match(r.stderr, /门禁通过/);
});

test("② 零 counter-case → exit 1（全正面审查是戏剧）", () => {
  const review = `# Review: A2 anti-theater detector

## 正面评价
实现完整，覆盖三层一致性检查。
测试全绿，代码质量高。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /零 counter-case/);
  assert.match(r.stderr, /全正面审查是戏剧/);
});

test("③ counter-case 无证据 → exit 1（空壳）", () => {
  const review = `# Review: A2 anti-theater detector

## Counter-case: 某个潜在问题
这里可能有问题，但没有具体证据。

## 正面评价
实现完整。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /无证据/);
  assert.match(r.stderr, /空壳/);
});

test("④ 中文'反例'标题被识别 → exit 0", () => {
  const review = `# 审查报告

## 反例: 边界 null 字段
当 input.effectSize 为 null 时，src/foo.ts:42 触发 TypeError。
测试 tests/foo.test.ts:10 验证优雅退化（exit 0）。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
});

test("⑤ 'Adversarial' 标题被识别 → exit 0", () => {
  const review = `# Security Review

## Adversarial: prompt injection
攻击者在 claim 文本注入 "ignore previous" 可绕过 R0 检查。
trace: src/agent_loop/prompt.ts:28 未转义用户输入。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
});

test("⑥ 'Red team' 标题被识别 → exit 0", () => {
  const review = `# Red Team Review

## Red team: tamper 检测绕过
篡改 proof_envelope 的 merkle_root 后，verify 仍 pass。
证据: tests/far_proof/tamper.test.ts:55 exit code 0（应 fail）。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
});

test("⑦ 多个 counter-case 部分空壳 → exit 1（列出空壳）", () => {
  const review = `# Review

## Counter-case: 有效反例
tests/foo.test.ts:10 验证 exit 0。

## Counter-case: 空壳反例
这里有个问题但没证据。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /空壳反例.*无证据/);
});

test("⑧ 证伪维度被识别（boundary + security）→ exit 0 + 维度标注", () => {
  const review = `# Review

## Counter-case: 边界安全
boundary: input 为 null 时 src/foo.ts:42 崩溃。
security: 攻击者可注入恶意 payload。
tests/foo.test.ts:10 exit 1（应 fail）。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
  assert.match(r.stderr, /证伪维度.*boundary/);
  assert.match(r.stderr, /security/);
});

test("⑨ --help → exit 0 + 显示用法", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /deep_audit_counter_case_gate/);
  assert.match(r.stdout, /counter-case/);
});

test("⑩ 性能证据（123ms）被识别为有效证据 → exit 0", () => {
  const review = `# Performance Review

## Counter-case: 性能回归
hero_multiseed 耗时从 500ms 升至 1230ms（performance 回归）。
证据: scripts/hero_multiseed.mjs 输出 1230ms。
`;
  const r = runViaStdin(review);
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
});
