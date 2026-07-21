#!/usr/bin/env node
/**
 * gate_c_readiness.mjs — Gate C（Implementation Readiness，实施就绪门禁）机器检查。
 *
 * 权威 SSOT：1.md 第五编 §2「Implementation Readiness Gate（Gate C）」（行 9500-9512）。
 *
 * 机检项（Gate C 全条件中可机器判定的子集；其余条目仍须人工评审）：
 *   C1 实施合同：.far-design/IMPLEMENTATION_CONTRACTS/ 下 contract-NNN.yaml ≥ 1 份，
 *      且每份含顶层键 boundary / inputs / outputs / failure_semantics / acceptance_oracle。
 *      （对应「首批实施合同依赖有序，边界、输入输出、失败语义和验收 Oracle 完整」）
 *   C2 CI 入口：ci/ 目录（含 ≥1 文件）或 scripts/ci_all.mjs 存在。
 *      （对应「仓库结构、包边界、配置层级、代码规范和 CI 入口确定」）
 *   C3 迁移与回滚策略可定位：docs/ 下文件名含 migration/rollback/迁移/回滚 的文档 ≥1，
 *      或任一实施合同内含 rollback: 顶层键。
 *      （对应「数据迁移、Schema 版本、兼容和回滚策略存在」）
 *   C4 测试基线可跑：node scripts/anti_theater_deterministic_scan.mjs exit 0。
 *      （对应「测试夹具、基准、观测和证据捕获机制可用」的快速代理探针）
 *   C5 Walking Skeleton 证据：.far-implementation/walking-skeleton/ 目录存在且含 ≥1 条目，
 *      或登记文件 .far-implementation/walking-skeleton.yaml 存在。
 *      （对应「真实生产路径 Walking Skeleton 能跨越…各层」）
 *
 * 非机检余留（人工评审，不在本脚本判定）：Gate A/B 通过状态、依赖顺序合理性、
 * 开发环境可复现与秘密替代、不可逆决策 Spike、「先写起来再说」禁令。
 *
 * 判定：全部 PASS → READY exit 0；任一 FAIL → NOT_READY exit 1（逐项如实输出）。
 *
 * 用法：node scripts/gate_c_readiness.mjs [--root <dir>]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
let ROOT = process.cwd();
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--root" && args[i + 1]) {
    ROOT = args[i + 1];
    i += 1;
  }
}
const rel = (p) => relative(ROOT, p) || p;

const CONTRACTS_DIR = join(ROOT, ".far-design", "IMPLEMENTATION_CONTRACTS");
const CONTRACT_NAME_RE = /^contract-\d+\.ya?ml$/;
const CONTRACT_REQUIRED_KEYS = [
  "boundary",
  "inputs",
  "outputs",
  "failure_semantics",
  "acceptance_oracle",
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 顶层键存在性检查（行首无缩进的 `key:`），避免引入 YAML 依赖。 */
function topLevelKeys(text) {
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

const results = [];
const record = (id, ok, detail) => results.push({ id, ok, detail });

// ── C1 实施合同 ─────────────────────────────────────────────────────────────
{
  const files = existsSync(CONTRACTS_DIR)
    ? readdirSync(CONTRACTS_DIR).filter((n) => CONTRACT_NAME_RE.test(n))
    : [];
  if (files.length === 0) {
    record(
      "C1",
      false,
      `${rel(CONTRACTS_DIR)} 下无 contract-NNN.yaml 合同文件（需 ≥1；TEMPLATE.contract.yaml 不计入）`,
    );
  } else {
    const bad = [];
    for (const name of files) {
      const text = readFileSync(join(CONTRACTS_DIR, name), "utf8");
      const keys = topLevelKeys(text);
      const missing = CONTRACT_REQUIRED_KEYS.filter((k) => !keys.has(k));
      if (missing.length > 0) bad.push(`${name} 缺字段: ${missing.join(", ")}`);
    }
    if (bad.length > 0) record("C1", false, bad.join("；"));
    else record("C1", true, `${files.length} 份合同字段完整（${files.join(", ")}）`);
  }
}

// ── C2 CI 入口 ──────────────────────────────────────────────────────────────
{
  const ciDir = join(ROOT, "ci");
  const ciDirOk = existsSync(ciDir) && readdirSync(ciDir).length > 0;
  const ciAll = join(ROOT, "scripts", "ci_all.mjs");
  if (ciDirOk) record("C2", true, `ci/ 目录存在（${readdirSync(ciDir).length} 个文件）`);
  else if (existsSync(ciAll)) record("C2", true, "scripts/ci_all.mjs 存在");
  else record("C2", false, "ci/ 目录与 scripts/ci_all.mjs 均不存在");
}

// ── C3 迁移与回滚策略可定位 ────────────────────────────────────────────────
{
  const docHits = walk(join(ROOT, "docs")).filter((f) =>
    /migration|rollback|迁移|回滚/i.test(rel(f)),
  );
  let contractRollback = false;
  if (existsSync(CONTRACTS_DIR)) {
    for (const name of readdirSync(CONTRACTS_DIR).filter((n) => CONTRACT_NAME_RE.test(n))) {
      const keys = topLevelKeys(readFileSync(join(CONTRACTS_DIR, name), "utf8"));
      if (keys.has("rollback")) contractRollback = true;
    }
  }
  if (docHits.length > 0) {
    record("C3", true, `docs/ 下可定位迁移/回滚文档 ${docHits.length} 份（如 ${rel(docHits[0])}）`);
  } else if (contractRollback) {
    record("C3", true, "实施合同内含 rollback 策略字段");
  } else {
    record("C3", false, "docs/ 无迁移/回滚文档，合同内亦无 rollback 字段");
  }
}

// ── C4 测试基线可跑 ─────────────────────────────────────────────────────────
{
  const probe = join(ROOT, "scripts", "anti_theater_deterministic_scan.mjs");
  if (!existsSync(probe)) {
    record("C4", false, "探针脚本 scripts/anti_theater_deterministic_scan.mjs 不存在");
  } else {
    const r = spawnSync(process.execPath, [probe], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) {
      record("C4", true, "anti_theater_deterministic_scan exit 0（测试基线可跑）");
    } else {
      const tail = String(r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" | ");
      record("C4", false, `anti_theater_deterministic_scan exit ${r.status ?? "?"}：${tail}`);
    }
  }
}

// ── C5 Walking Skeleton 证据 ───────────────────────────────────────────────
{
  const wsDir = join(ROOT, ".far-implementation", "walking-skeleton");
  const wsRegistry = join(ROOT, ".far-implementation", "walking-skeleton.yaml");
  if (existsSync(wsDir) && readdirSync(wsDir).length > 0) {
    record("C5", true, `${rel(wsDir)}/ 存在（${readdirSync(wsDir).length} 个条目）`);
  } else if (existsSync(wsRegistry)) {
    record("C5", true, `登记文件 ${rel(wsRegistry)} 存在`);
  } else {
    record("C5", false, ".far-implementation/walking-skeleton/ 目录与登记文件均不存在");
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════");
console.log("  Gate C · Implementation Readiness（实施就绪门禁）");
console.log("  权威: 1.md 行 9500-9512");
console.log("═══════════════════════════════════════════");
for (const r of results) {
  console.log(`  ${r.ok ? "✓ PASS" : "✗ FAIL"}  ${r.id}  ${r.detail}`);
}
const passed = results.filter((r) => r.ok).length;
console.log("───────────────────────────────────────────");
console.log("  非机检余留（人工评审）：Gate A/B 通过状态、合同依赖顺序、");
console.log("  开发环境可复现与秘密替代、不可逆决策 Spike、接口先行纪律。");
console.log("───────────────────────────────────────────");
if (passed === results.length) {
  console.log(`gate-c: READY (${passed}/${results.length} 机检项 PASS)`);
  process.exit(0);
}
console.log(`gate-c: NOT_READY (${passed}/${results.length} 机检项 PASS)`);
process.exit(1);
