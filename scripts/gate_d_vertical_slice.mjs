#!/usr/bin/env node
/**
 * gate_d_vertical_slice.mjs — Gate D（垂直切片门禁）机器检查。
 *
 * 权威 SSOT：1.md 第五编 §3「垂直切片门禁（Gate D）」（行 9514-9527）。
 *
 * 证据登记约定：垂直切片证据统一登记于
 *   .far-implementation/vertical-slice/EVIDENCE.yaml
 * 本脚本校验其字段完整性与所引文件存在性。登记格式（顶层键唯一，便于无依赖机检）：
 *
 *   schema_version: 1
 *   e2e_run_record: <相对仓库根的路径>          # 真实生产路径端到端运行记录
 *   expected_failure_evidence:                   # ≥1 条预期失败用例证据
 *     - <路径>
 *   cancellation_evidence:                       # ≥1 条主动取消用例证据
 *     - <路径>
 *   recovery_evidence: <路径>                    # 断连/进程重启后恢复到明确状态的证据
 *   clean_reinstall_record: <路径>               # 干净环境重新安装并运行的记录
 *   claim_artifact: <路径>                       # 产生的 Claim 产物
 *   run_artifact: <路径>                         # Run Manifest / 运行产物
 *   provenance_artifact: <路径>                  # Provenance 产物
 *
 * 机检项（对应 Gate D 条文）：
 *   D1 e2e_run_record 已登记且文件存在（「第一用户完成第一完整任务」运行记录）
 *   D2 expected_failure_evidence ≥1 且文件存在（「至少一个预期失败…正确处理」）
 *   D3 cancellation_evidence ≥1 且文件存在（「…和一个主动取消…正确处理」）
 *   D4 recovery_evidence 已登记且文件存在（「断连或进程重启后恢复到明确状态」）
 *   D5 clean_reinstall_record 已登记且文件存在（「安装和运行步骤在干净环境被重新执行」）
 *   D6 claim/run/provenance 三类产物均已登记且文件存在（「Claim/Artifact/Run/…/Provenance 可定位」）
 *
 * 非机检余留（人工评审）：真实生产路径而非 Demo 旁路、输入/权限/预算/状态链闭合、
 * 用户可理解状态与下一动作、结论未被错误表述为高于证据等级的科学结论。
 *
 * 判定：全部 PASS → READY exit 0；任一 FAIL → NOT_READY exit 1（逐项如实输出）。
 *
 * 用法：node scripts/gate_d_vertical_slice.mjs [--root <dir>]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
let ROOT = process.cwd();
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--root" && args[i + 1]) {
    ROOT = args[i + 1];
    i += 1;
  }
}

const EVIDENCE_FILE = join(ROOT, ".far-implementation", "vertical-slice", "EVIDENCE.yaml");

/** 去引号、去行内注释、去空白；空值返回 null。 */
function cleanScalar(raw) {
  if (raw === undefined) return null;
  let v = raw.trim();
  if (v === "" || v === "[]" || v === "~" || v === "null") return null;
  const hash = v.indexOf(" #");
  if (hash >= 0) v = v.slice(0, hash).trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1);
  }
  return v === "" ? null : v;
}

/**
 * 极简顶层键提取（无 YAML 依赖）：
 *   scalar 形式 `key: value`；块列表形式 `key:` 后接 `  - item` 行。
 * 返回 Map<string, string | string[]>（仅顶层键）。
 */
function parseTopLevel(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  let listKey = null;
  for (const line of lines) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item && listKey) {
      const v = cleanScalar(item[1]);
      if (v) map.get(listKey).push(v);
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      const [, key, rest] = kv;
      const v = cleanScalar(rest);
      if (v === null) {
        map.set(key, []);
        listKey = key;
      } else {
        map.set(key, v);
        listKey = null;
      }
      continue;
    }
    listKey = null;
  }
  return map;
}

const results = [];
const record = (id, ok, detail) => results.push({ id, ok, detail });

/** 校验「已登记 + 文件存在」；entry 为 string 或 string[]。 */
function checkPaths(id, label, entry, { min = 1 } = {}) {
  const paths = entry === undefined ? [] : Array.isArray(entry) ? entry : [entry];
  if (paths.length < min) {
    record(id, false, `${label} 未登记（需 ≥${min} 条路径）`);
    return;
  }
  const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
  if (missing.length > 0) {
    record(id, false, `${label} 所引文件不存在: ${missing.join(", ")}`);
    return;
  }
  record(id, true, `${label} 已登记 ${paths.length} 条且文件均存在`);
}

if (!existsSync(EVIDENCE_FILE)) {
  for (const [id, label] of [
    ["D1", "E2E 运行记录 e2e_run_record"],
    ["D2", "预期失败用例 expected_failure_evidence"],
    ["D3", "主动取消用例 cancellation_evidence"],
    ["D4", "断连/重启恢复 recovery_evidence"],
    ["D5", "干净环境重装 clean_reinstall_record"],
    ["D6", "Claim/Run/Provenance 产物"],
  ]) {
    record(id, false, `${label}：证据登记文件 .far-implementation/vertical-slice/EVIDENCE.yaml 不存在`);
  }
} else {
  const doc = parseTopLevel(readFileSync(EVIDENCE_FILE, "utf8"));
  checkPaths("D1", "E2E 运行记录", doc.get("e2e_run_record"));
  checkPaths("D2", "预期失败用例证据", doc.get("expected_failure_evidence"));
  checkPaths("D3", "主动取消用例证据", doc.get("cancellation_evidence"));
  checkPaths("D4", "断连/重启恢复证据", doc.get("recovery_evidence"));
  checkPaths("D5", "干净环境重装记录", doc.get("clean_reinstall_record"));
  {
    const parts = [
      ["claim_artifact", "Claim 产物"],
      ["run_artifact", "Run 产物"],
      ["provenance_artifact", "Provenance 产物"],
    ];
    const problems = [];
    for (const [key, label] of parts) {
      const entry = doc.get(key);
      const paths = entry === undefined ? [] : Array.isArray(entry) ? entry : [entry];
      if (paths.length === 0) problems.push(`${label}(${key}) 未登记`);
      else if (!existsSync(join(ROOT, paths[0]))) problems.push(`${label} 所引文件不存在: ${paths[0]}`);
    }
    if (problems.length > 0) record("D6", false, problems.join("；"));
    else record("D6", true, "Claim/Run/Provenance 三类产物均已登记且文件存在");
  }
}

console.log("═══════════════════════════════════════════");
console.log("  Gate D · Vertical Slice（垂直切片门禁）");
console.log("  权威: 1.md 行 9514-9527");
console.log("═══════════════════════════════════════════");
for (const r of results) {
  console.log(`  ${r.ok ? "✓ PASS" : "✗ FAIL"}  ${r.id}  ${r.detail}`);
}
const passed = results.filter((r) => r.ok).length;
console.log("───────────────────────────────────────────");
console.log("  非机检余留（人工评审）：真实生产路径而非 Demo 旁路、");
console.log("  输入/权限/预算/状态/恢复链闭合、用户可理解状态与下一动作、");
console.log("  结论未被错误表述为高于证据等级的科学结论。");
console.log("───────────────────────────────────────────");
if (passed === results.length) {
  console.log(`gate-d: READY (${passed}/${results.length} 机检项 PASS)`);
  process.exit(0);
}
console.log(`gate-d: NOT_READY (${passed}/${results.length} 机检项 PASS)`);
process.exit(1);
