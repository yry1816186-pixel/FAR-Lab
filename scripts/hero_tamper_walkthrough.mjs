#!/usr/bin/env node
/**
 * hero_tamper_walkthrough.mjs — 主 Hero:HERO-TAMPER-PLUS(IC-08 · D-S5-03)。
 *
 * 叙事(60 秒):export → verify clean → tamper → verify exit 7。
 * 「篡改走完即信」:现场导出 .far-proof bundle,独立 verify 通过;
 * 然后当场篡改信封结论,verify 以 exit 7 + PROOF_HASH_MISMATCH 结构化指认。
 *
 * 验收 Oracle(合同 contract-008):
 *   ① 全程 ≤60 秒(本机计时);③ 输出含 honest status 段;④ 干净环境(临时目录,无 DB 残留)可重复。
 *   exit code 与 verify 对齐:tamper=7(脚本自身 exit 0=演示链路全部如预期)。
 *
 * 诚实声明:本演示证明「导出包完整性+篡改可检+独立复算」,
 * 不证明任何科学真理;demo 数据来自 fixture(CLM-026 边界)。
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUDGET_MS = 60_000;
const started = Date.now();
const FAR = join("src", "cli", "far.ts");

function run(args, expectExit) {
  const r = spawnSync(process.execPath, [FAR, ...args], { cwd: process.cwd(), encoding: "utf8" });
  const status = r.status ?? -1;
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  return { status, out, ok: expectExit.includes(status) };
}

function elapsed() {
  return ((Date.now() - started) / 1000).toFixed(1);
}

const tmp = mkdtempSync(join(tmpdir(), "hero-tamper-"));
const bundle = join(tmp, "hero.far-proof");
let failures = 0;

console.log("══ HERO-TAMPER-PLUS · 篡改走完即信 ══");
console.log(`t=${elapsed()}s  step 1/4: far export far-proof --demo-chain(现场导出,非播放预录)`);
const s1 = run(["export", "far-proof", "--demo-chain", "--out", bundle, "--force"], [0]);
console.log(`  exit=${s1.status} ${s1.ok ? "✓" : "✗"}`);
if (!s1.ok) failures += 1;

console.log(`t=${elapsed()}s  step 2/4: far verify(干净包必须通过,exit 0)`);
const s2 = run(["verify", bundle], [0]);
console.log(`  exit=${s2.status} ${s2.ok ? "✓ clean 验证通过" : "✗"}`);
if (!s2.ok) failures += 1;

console.log(`t=${elapsed()}s  step 3/4: 当场篡改(把信封结论改为 CONFIRMED)`);
const jsonlPath = join(bundle, "proof_envelopes.jsonl");
const lines = readFileSync(jsonlPath, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
const row = JSON.parse(lines[0]);
const originalConclusion = row.conclusion;
row.conclusion = "CONFIRMED";
lines[0] = JSON.stringify(row);
writeFileSync(jsonlPath, lines.join("\n") + "\n", "utf8");
console.log(`  tamper: conclusion ${originalConclusion} → CONFIRMED(攻击者伪造「证实」)`);

console.log(`t=${elapsed()}s  step 4/4: far verify(篡改必须 exit 7 + 结构化指认)`);
const s4 = run(["verify", bundle], [7]);
const mismatchShown = /MISMATCH|tampered|FAIL/i.test(s4.out);
console.log(`  exit=${s4.status} ${s4.ok ? "✓ 篡改被检出(exit 7)" : "✗ 未检出!"} · 结构化指认=${mismatchShown ? "✓" : "✗"}`);
if (!s4.ok || !mismatchShown) failures += 1;
const mismatchLine = s4.out.split("\n").find((l) => /MISMATCH/.test(l));
if (mismatchLine !== undefined) console.log(`  指认: ${mismatchLine.trim()}`);

rmSync(tmp, { recursive: true, force: true });

const totalMs = Date.now() - started;
console.log("");
console.log("── honest status(诚实边界)──");
console.log("  证明了: .far-proof 导出包哈希链完整(覆盖范围:proof_envelopes 全字段+信封链引用+call_records 白名单字段+lifecycle 事件链;其余分量仅存在性检查,见 FINDINGS F-V09-01);第三方可离线独立复算;覆盖内篡改可被 exit 7 检出并结构化指认。");
console.log("  不证明: 任何科学真理;demo 数据来自 fixture(legacy demo 链恒 UNTESTED=诚实标注);");
console.log("          真实统计裁决见 hero 链(z-test)/audit-multiseed;Live LLM 路径=外部合同 IC-14。");
console.log(`── 计时: ${(totalMs / 1000).toFixed(1)}s / 预算 60s ${totalMs <= BUDGET_MS ? "✓" : "✗ 超时"} ──`);

if (totalMs > BUDGET_MS) failures += 1;
console.log(`hero-tamper-plus: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failures)`);
process.exit(failures === 0 ? 0 : 1);
