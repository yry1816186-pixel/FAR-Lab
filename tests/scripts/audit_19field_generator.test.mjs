// audit_19field_generator.test.mjs — 19 字段审计生成器校验逻辑测试。
// 对接 docs/governance/AGENT-LIFECYCLE.md §3 (19 字段模板) + §5 (完成门禁)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPT = "scripts/audit_19field_generator.mjs";

/** 构造一个完整有效的 audit 草稿（基于 AGENT-LIFECYCLE.md §3 示例）。 */
function validDraft(overrides = {}) {
  return {
    timestamp: "2026-08-07T12:00:00+08:00",
    trace_id: "task-A2-anti-theater-23",
    actor: "implementation-engineer",
    event: "task_completed",
    task_id: "A2-anti-theater-detector-23",
    risk: "P3",
    tool: ["Read", "Edit", "Bash"],
    args_redacted: "src/anti_theater/detectors/effect_p_mismatch.ts",
    status: "DONE",
    verification: {
      typecheck: "0 errors (pnpm run typecheck)",
      lint: "0 errors (pnpm run lint --max-warnings 0)",
      test: "2278 tests (2272 pass / 0 fail / 6 skip)",
      demo: "14/14 golden vectors (node src/cli/far.ts demo)",
    },
    approval: "P3 self-authorized (additive only, no schema/migration change)",
    memory_write: {
      progress_md: "appended checkpoint",
      working_memory: ".codebuddy/memory/2026-08-07.md",
      adr: null,
      blind_spot: null,
    },
    artifacts: [
      "src/anti_theater/detectors/effect_p_mismatch.ts",
      "tests/anti_theater/effect_p_mismatch.test.ts",
    ],
    policy_refs: ["AGENTS.md §7 (trust kernel additive only)", "AGENTS.md §4.3 (zero shallow tests)"],
    summary: "Added AT-EFFECT-P-MISMATCH detector (23rd). Three-layer consistency check.",
    counter_case: "Ritchie 复现失败 (refutes + negative effectSize) 在未加守卫时误报——已通过守卫修复",
    residual_risk: "精确 t 分布重算需 V2 类型扩展，当前 input 不暴露故不做",
    rollback: "git revert <commit-hash> — additive only, no consumer breakage",
    falsification_dimension_covered: "boundary (null 字段优雅退化) + error-path (多 finding 同时触发)",
    ...overrides,
  };
}

/** 通过 stdin 跑脚本，返回 { status, stdout, stderr }。 */
function runViaStdin(draft, extraArgs = []) {
  const input = JSON.stringify(draft);
  const r = spawnSync(process.execPath, [SCRIPT, ...extraArgs], {
    cwd: ROOT,
    encoding: "utf8",
    input,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("① 完整有效 audit 草稿 → exit 0 + 输出合法 audit.json", () => {
  const r = runViaStdin(validDraft());
  assert.equal(r.status, 0, `应 exit 0，实际:\nstdout=${r.stdout}\nstderr=${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.task_id, "A2-anti-theater-detector-23");
  assert.equal(out.risk, "P3");
  assert.equal(out.status, "DONE");
  assert.match(r.stderr, /audit 校验通过/);
});

test("② 缺 counter_case → exit 1（零 counter-case = 戏剧审查 FAIL）", () => {
  const draft = validDraft();
  delete draft.counter_case;
  const r = runViaStdin(draft);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /缺失必填字段: counter_case/);
});

test("③ counter_case 为空字符串 → exit 1", () => {
  const r = runViaStdin(validDraft({ counter_case: "   " }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /counter_case 为空/);
});

test("④ rollback='none' → exit 1（AGENTS.md §4.4 可逆性）", () => {
  const r = runViaStdin(validDraft({ rollback: "none" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rollback="none" 被拒/);
});

test("⑤ residual_risk 为空 → exit 1（AGENTS.md §8 残留风险显式）", () => {
  const r = runViaStdin(validDraft({ residual_risk: "" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /residual_risk 为空/);
});

test("⑥ verification 含占位符 '应该通过' → exit 1（反借口协议）", () => {
  const r = runViaStdin(validDraft({
    verification: { test: "应该能通过测试" },
  }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /verification 含占位符信号/);
});

test("⑦ verification 含 'should pass' → exit 1（反借口协议英文）", () => {
  const r = runViaStdin(validDraft({
    verification: { lint: "should pass" },
  }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /verification 含占位符信号/);
});

test("⑧ risk 非法 → exit 1（不在 P0-P4 枚举）", () => {
  const r = runViaStdin(validDraft({ risk: "P5" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /risk="P5" 不在/);
});

test("⑨ status 非法 → exit 1（不在枚举）", () => {
  const r = runViaStdin(validDraft({ status: "MAYBE" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /status="MAYBE" 不在/);
});

test("⑩ 缺多个必填字段 → exit 1 + 列出全部缺失", () => {
  const draft = validDraft();
  delete draft.trace_id;
  delete draft.actor;
  delete draft.artifacts;
  const r = runViaStdin(draft);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /缺失必填字段: trace_id/);
  assert.match(r.stderr, /缺失必填字段: actor/);
  assert.match(r.stderr, /缺失必填字段: artifacts/);
});

test("⑪ artifacts 空数组 → exit 1", () => {
  const r = runViaStdin(validDraft({ artifacts: [] }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /artifacts 必须是非空数组/);
});

test("⑫ autofill：缺 timestamp + trace_id → 自动填充 + exit 0", () => {
  const draft = validDraft();
  delete draft.timestamp;
  delete draft.trace_id;
  const r = runViaStdin(draft);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.match(out.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(out.trace_id, /^task-/);
});

test("⑬ --help → exit 0 + 显示用法", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /audit_19field_generator/);
  assert.match(r.stdout, /--input/);
  assert.match(r.stdout, /--collect/);
});

test("⑭ --input 文件模式：读文件 + --output 写文件 → exit 0", () => {
  const inPath = join(ROOT, ".codebuddy", "audit-draft-test.json");
  const outPath = join(ROOT, ".codebuddy", "audit-out-test.json");
  try {
    writeFileSync(inPath, JSON.stringify(validDraft()), "utf8");
    const r = spawnSync(process.execPath, [SCRIPT, "--input", inPath, "--output", outPath], {
      cwd: ROOT, encoding: "utf8",
    });
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.ok(existsSync(outPath), "output 文件应已生成");
    const out = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(out.task_id, "A2-anti-theater-detector-23");
  } finally {
    if (existsSync(inPath)) unlinkSync(inPath);
    if (existsSync(outPath)) unlinkSync(outPath);
  }
});

test("⑮ IMPLEMENTED_UNVERIFIED status 合法（未完成验证的状态）", () => {
  const r = runViaStdin(validDraft({
    status: "IMPLEMENTED_UNVERIFIED",
    verification: { test: "未跑全量 test（仅跑子集）" },
  }));
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
});
