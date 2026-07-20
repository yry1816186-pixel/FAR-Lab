#!/usr/bin/env node
/**
 * walking_skeleton.mjs — FAR-Lab Walking Skeleton(Phase C / Gate C · C5)。
 *
 * 权威:1.md 行 9500-9512(Gate C)「真实生产路径 Walking Skeleton 能跨越
 * 客户端/接口、控制、Agent/工作流、执行、数据证据和观测层」。
 *
 * 本脚本只调用现有真实生产命令(非专用 Demo 旁路、非 Mock):
 *   1. far doctor                          观测层:环境自检(真实退出码)
 *   2. far demo                            执行层:GV14 裁决内核 + legacy 链(UNTESTED)+ hero 真实统计链(z-test)
 *   3. far ask --mode quick --export ...   Agent/工作流:6-stage FSM → 裁决 → 证据链 → 导出 bundle(文件 DB)
 *   4. far export far-proof --demo-chain   数据证据层:claim→FEC→seal→九分量导出
 *   5. far verify <demo bundle>            独立复算:第三方 verify(真实退出码)
 *   6. far verify <ask bundle>             独立复算:agent 路径 bundle
 *
 * 诚实声明(防误读):
 *   - 离线 MINIMAL_OFFLINE 模式下 LLM 由 offline_replay fixture 适配器提供;
 *     证据链/裁决内核/seal/导出/verify 全部为真实生产代码路径。
 *   - 本骨架证明的是"链路贯通",不证明任何科学结论;裁决等级以输出 honest 标注为准。
 *
 * 产物(全部落盘 .far-implementation/walking-skeleton/):
 *   run_log.txt            全量 stdout/stderr 拼接日志
 *   skeleton_evidence.yaml 每步命令/退出码/耗时/层映射/产物路径
 *   ask.far-proof/         agent 路径导出 bundle(+ ask.far-proof.rundb 文件数据库)
 *   demo.far-proof/        demo 链导出 bundle
 *
 * 用法:node scripts/walking_skeleton.mjs
 * 退出码:0=全步通过;1=任一步失败(逐步如实输出)。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WS_DIR = join(ROOT, ".far-implementation", "walking-skeleton");
const FAR = join("src", "cli", "far.ts");

const steps = [
  {
    id: "WS-1-doctor",
    layer: "观测层(observability)",
    cmd: [FAR, "doctor"],
    expect: 0,
    note: "环境自检(真实退出码;两条预期 WARN 不阻断:python 3.14 检测器缺陷/DASHSCOPE_API_KEY 未设)",
    acceptExit: [0, 2], // doctor: 2=仅 WARN(见 doctor.ts 退出语义)
  },
  {
    id: "WS-2-demo",
    layer: "执行层(execution)",
    cmd: [FAR, "demo"],
    note: "GV14 裁决内核 + legacy demo 链(UNTESTED 诚实标注)+ hero 真实 z-test 统计链",
    acceptExit: [0],
  },
  {
    id: "WS-3-ask",
    layer: "Agent/工作流(agent/workflow)",
    cmd: [
      FAR,
      "ask",
      "Walking skeleton probe: adapter A achieves macro-F1 >= 0.80 on TESS-ASTRO",
      "--mode",
      "quick",
      "--export",
      join(WS_DIR, "ask.far-proof"),
    ],
    note: "6-stage FSM → 内核裁决 → 证据链 → 导出 bundle(文件 DB: ask.far-proof.rundb)",
    acceptExit: [0],
  },
  {
    id: "WS-4-export",
    layer: "数据证据层(data/evidence)",
    cmd: [FAR, "export", "far-proof", "--demo-chain", "--out", join(WS_DIR, "demo.far-proof"), "--force"],
    note: "claim→FEC→seal→九分量 .far-proof 导出",
    acceptExit: [0],
  },
  {
    id: "WS-5-verify-demo",
    layer: "独立复算(verification)",
    cmd: [FAR, "verify", join(WS_DIR, "demo.far-proof")],
    note: "第三方独立重算:必需文件+脱敏链+proofHash 复算",
    acceptExit: [0],
  },
  {
    id: "WS-6-verify-ask",
    layer: "独立复算(verification)",
    cmd: [FAR, "verify", join(WS_DIR, "ask.far-proof")],
    note: "agent 路径 bundle 独立重算",
    acceptExit: [0],
  },
];

// 干净重建骨架产物(幂等;不采信缓存;README.md 为人工文档,保留)
mkdirSync(WS_DIR, { recursive: true });
for (const name of ["run_log.txt", "skeleton_evidence.yaml", "ask.far-proof", "ask.far-proof.rundb", "demo.far-proof"]) {
  const p = join(WS_DIR, name);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

const results = [];
let logText = `# FAR-Lab Walking Skeleton run log\n# root: ${ROOT}\n# started: ${new Date().toISOString()}\n\n`;
let failed = 0;

for (const step of steps) {
  const started = Date.now();
  const r = spawnSync(process.execPath, step.cmd, { cwd: ROOT, encoding: "utf8" });
  const durationMs = Date.now() - started;
  const status = r.status ?? -1;
  const ok = step.acceptExit.includes(status);
  if (!ok) failed += 1;
  results.push({
    id: step.id,
    layer: step.layer,
    command: `node ${step.cmd.join(" ")}`,
    exit_code: status,
    expected_exit: step.acceptExit,
    pass: ok,
    duration_ms: durationMs,
    note: step.note,
  });
  logText += `${"=".repeat(72)}\n[${step.id}] ${step.layer}\n$ node ${step.cmd.join(" ")}\nexit=${status} (${ok ? "PASS" : "FAIL"}, ${durationMs}ms)\n${"-".repeat(72)}\n`;
  logText += `${r.stdout ?? ""}${r.stderr ?? ""}\n\n`;
}

const yamlLines = [
  "# Walking Skeleton 证据登记(scripts/walking_skeleton.mjs 生成;重跑即覆盖)",
  `generated_at: "${new Date().toISOString()}"`,
  `root: "${ROOT.replace(/\\/g, "/")}"`,
  'honest_note: "离线 MINIMAL_OFFLINE:LLM=offline_replay fixture;证据链/裁决内核/seal/导出/verify 全为真实生产路径;骨架证明链路贯通,不证明科学结论"',
  "layers_covered:",
  '  - "客户端/接口: far CLI(node src/cli/far.ts,Node 24 type stripping)"',
  '  - "控制: FEC 强制门(demo/ask 内 fecAppendClaim)"',
  '  - "Agent/工作流: ask 6-stage FSM(runAgentLoop)"',
  '  - "执行: R0-R9 裁决内核 + hero z-test 统计链"',
  '  - "数据证据: evidence_log 哈希链 + 文件 DB(ask.far-proof.rundb)+ 九分量导出"',
  '  - "观测: far doctor + 本登记"',
  "steps:",
];
for (const s of results) {
  yamlLines.push(`  - id: ${s.id}`);
  yamlLines.push(`    layer: "${s.layer}"`);
  yamlLines.push(`    command: "${s.command.replace(/\\/g, "/")}"`);
  yamlLines.push(`    exit_code: ${s.exit_code}`);
  yamlLines.push(`    expected_exit: [${s.expected_exit.join(", ")}]`);
  yamlLines.push(`    pass: ${s.pass}`);
  yamlLines.push(`    duration_ms: ${s.duration_ms}`);
  yamlLines.push(`    note: "${s.note}"`);
}
yamlLines.push("artifacts:");
yamlLines.push('  - ".far-implementation/walking-skeleton/run_log.txt"');
yamlLines.push('  - ".far-implementation/walking-skeleton/demo.far-proof/(九分量 bundle)"');
yamlLines.push('  - ".far-implementation/walking-skeleton/ask.far-proof/(agent 路径 bundle)"');
yamlLines.push('  - ".far-implementation/walking-skeleton/ask.far-proof.rundb(文件数据库)"');
yamlLines.push(`verdict: ${failed === 0 ? "PASS" : "FAIL"} (${results.length - failed}/${results.length})`);

writeFileSync(join(WS_DIR, "run_log.txt"), logText, "utf8");
writeFileSync(join(WS_DIR, "skeleton_evidence.yaml"), yamlLines.join("\n") + "\n", "utf8");

console.log("═══════════════════════════════════════════");
console.log("  Walking Skeleton · 真实生产路径最小贯通");
console.log("═══════════════════════════════════════════");
for (const s of results) {
  console.log(`  ${s.pass ? "✓ PASS" : "✗ FAIL"}  ${s.id}  exit=${s.exit_code}  ${s.duration_ms}ms  ${s.layer}`);
}
console.log("───────────────────────────────────────────");
console.log(`walking-skeleton: ${failed === 0 ? "PASS" : "FAIL"} (${results.length - failed}/${results.length});证据: .far-implementation/walking-skeleton/`);
process.exit(failed === 0 ? 0 : 1);
