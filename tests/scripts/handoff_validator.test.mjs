// handoff_validator.test.mjs — Handoff 协议三件套校验器测试。
// 对接 docs/governance/AGENT-ORCHESTRATION.md §2 (Handoff 协议)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SCRIPT = "scripts/handoff_validator.mjs";

/** 完整有效的 handoff 文档（基于 AGENT-ORCHESTRATION.md §2.4 模板）。 */
function validHandoff() {
  return `## Handoff: implementation-engineer → integration-engineer

### Artifact
- src/anti_theater/detectors/effect_p_mismatch.ts @ cd45a4a
- test: 2278 tests (2272 pass / 0 fail / 6 skip) — typecheck 0 / lint 0

### Context
- Decisions made: 采用 effectiveDirection='supports' 守卫避免 Ritchie refutes 误报
- Constraints: ADDITIVE ONLY（decideFiveValueVerdictInternal 字节不变）
- Open questions (must resolve or mark as assumption): 精确 t 分布重算需 V2 类型扩展，当前标为 assumption 不做

### Decision
- Next step: integration-engineer 全量回归
- Risk budget: P3
- Rollback: git revert cd45a4a（additive，无消费者破坏）
`;
}

function runViaStdin(text) {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8", input: text });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("① 完整有效 handoff → exit 0", () => {
  const r = runViaStdin(validHandoff());
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
  assert.match(r.stderr, /handoff 校验通过/);
});

test("② 缺 '## Handoff:' 标题 → exit 1", () => {
  const text = validHandoff().replace(/^## Handoff:.*\n/m, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /缺失 "## Handoff/);
});

test("③ 缺 ### Artifact 节 → exit 1", () => {
  const text = validHandoff().replace(/### Artifact[\s\S]*?(?=### Context)/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /缺失 ### Artifact 节/);
});

test("④ Artifact 节缺文件路径 @ ref → exit 1", () => {
  const text = validHandoff().replace(/- src\/anti_theater\/detectors\/effect_p_mismatch\.ts @ cd45a4a\n/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /### Artifact 节缺文件路径 \+ @ ref/);
});

test("⑤ 缺 ### Context 节 → exit 1", () => {
  const text = validHandoff().replace(/### Context[\s\S]*?(?=### Decision)/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /缺失 ### Context 节/);
});

test("⑥ Context 节缺 Decisions → exit 1", () => {
  const text = validHandoff().replace(/- Decisions made:.*\n/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /### Context 节缺 "Decisions made"/);
});

test("⑦ Context 节缺 Constraints → exit 1", () => {
  const text = validHandoff().replace(/- Constraints:.*\n/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /### Context 节缺 "Constraints"/);
});

test("⑧ Open questions 未标注 assumption → exit 1", () => {
  const text = validHandoff().replace(
    /- Open questions.*assumption.*\n/,
    "- Open questions: 精确 t 分布重算需 V2 类型扩展\n",
  );
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Open questions 必须显式标注/);
});

test("⑨ 缺 ### Decision 节 → exit 1", () => {
  const text = validHandoff().replace(/### Decision[\s\S]*$/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /缺失 ### Decision 节/);
});

test("⑩ Decision 节缺 Next step → exit 1", () => {
  const text = validHandoff().replace(/- Next step:.*\n/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /### Decision 节缺 "Next step"/);
});

test("⑪ Decision 节缺 Risk budget → exit 1", () => {
  const text = validHandoff().replace(/- Risk budget:.*\n/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /### Decision 节缺 "Risk budget: P/);
});

test("⑫ Rollback='none' → exit 1（AGENTS.md §4.4 铁律）", () => {
  const text = validHandoff().replace(/- Rollback:.*\n/, "- Rollback: none\n");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Rollback="none" 被拒/);
});

test("⑬ Decision 节缺 Rollback → exit 1", () => {
  const text = validHandoff().replace(/- Rollback:.*\n/, "");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /### Decision 节缺 "Rollback"/);
});

test("⑭ Risk budget 非法（P5）→ exit 1", () => {
  const text = validHandoff().replace(/- Risk budget: P3/, "- Risk budget: P5");
  const r = runViaStdin(text);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Risk budget="P5" 不在/);
});

test("⑮ --help → exit 0 + 显示用法", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /handoff_validator/);
  assert.match(r.stdout, /--input/);
});

test("⑯ Open questions 标注 will-resolve-in → exit 0（合法标注）", () => {
  const text = validHandoff().replace(
    /- Open questions.*assumption.*\n/,
    "- Open questions: V2 类型扩展 will-resolve-in-INTEGRATE\n",
  );
  const r = runViaStdin(text);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
});

test("⑰ 中文回滚字段 '回滚:' 被识别 → exit 0", () => {
  const text = validHandoff().replace(/- Rollback:.*\n/, "- 回滚: git revert cd45a4a\n");
  const r = runViaStdin(text);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
});
