#!/usr/bin/env node
/**
 * scripts/far_stage_ext_smoke.mjs — .pi/extensions/far-stage.ts 冒烟测试
 *
 * 覆盖:
 *   1. 用 pi 自带的 jiti(与 pi 加载方式同源)加载 far-stage.ts,调用默认导出工厂;
 *   2. 断言 session_start 已监听、/far-status 已注册、far_gate_run 工具已注册;
 *   3. .far-master 缺失时的兼容行为:.far-design 存在 → 旧版状态条 "FAR {stage} · {freeze}",
 *      两者皆缺 → bootstrap 提示;
 *   4. .far-master 存在时的全局行为:状态条 "FAR A✓·B·S1 · NOT_FROZEN" 风格,
 *      /far-status 含 phase/gate_status 两行(真实文件优先,否则夹具,结束清理);
 *   5. 真实调用 far_gate_run: design-lint(应 PASS)、agent-config(应 PASS)、
 *      未知门名(应给出可用列表)、coverage-gate(验证长超时路径,不跑 all);
 *   6. .far-design 夹具(仅缺失时创建)验证字段提取与 RESUME.md 顶部 10 行原样报告;
 *   7. 不修改 far-guard.ts,不安装任何 npm 依赖,不污染真实控制面(仅清理自建夹具)。
 *
 * 用法: node scripts/far_stage_ext_smoke.mjs     (exit 0 = 全部通过)
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 门禁 cwd 语义 = 仓库根(与 pi 从仓库根启动一致),显式 chdir 使脚本从任意目录调用都确定。
process.chdir(repoRoot);

const PI_PKG = "C:\\Users\\RichardYuan\\AppData\\Roaming\\npm\\node_modules\\@earendil-works\\pi-coding-agent";
const EXT_PATH = path.join(repoRoot, ".pi", "extensions", "far-stage.ts");
const FAR_DESIGN_DIR = path.join(repoRoot, ".far-design");
const FAR_MASTER_DIR = path.join(repoRoot, ".far-master");
const DESIGN_STATE_PATH = path.join(FAR_DESIGN_DIR, "STATE.yaml");
const DESIGN_RESUME_PATH = path.join(FAR_DESIGN_DIR, "RESUME.md");
const MASTER_STATE_PATH = path.join(FAR_MASTER_DIR, "STATE.yaml");

// ---------------------------------------------------------------------------
// jiti 解析:优先 pi 全局安装目录下的 pi 包 node_modules/jiti(显式路径),
// 否则用 createRequire 从 pi 包路径兜底 require('jiti')。
// ---------------------------------------------------------------------------

function loadJiti(log) {
  if (!fs.existsSync(PI_PKG)) {
    throw new Error(`pi 全局安装目录不存在: ${PI_PKG}`);
  }
  const explicitJiti = path.join(PI_PKG, "node_modules", "jiti");
  log.push(`jiti 显式路径 ${explicitJiti}: ${fs.existsSync(explicitJiti) ? "存在" : "不存在,走 createRequire 兜底"}`);
  const piRequire = createRequire(path.join(PI_PKG, "package.json"));
  const errors = [];
  for (const spec of ["jiti/static", "jiti"]) {
    try {
      const mod = piRequire(spec);
      const createJiti = mod.createJiti ?? mod.default?.createJiti ?? mod.default ?? mod;
      if (typeof createJiti === "function") {
        log.push(`jiti 已通过 "${spec}" 加载`);
        return { createJiti, piRequire };
      }
    } catch (e) {
      errors.push(`${spec}: ${e.message}`);
    }
  }
  throw new Error(`无法从 pi 包解析 jiti (${errors.join("; ")})`);
}

// ---------------------------------------------------------------------------
// mock ExtensionAPI / ExtensionContext
// ---------------------------------------------------------------------------

function makeMockPi() {
  const events = new Map();
  const commands = new Map();
  const tools = new Map();
  const api = {
    on: (name, handler) => {
      const list = events.get(name) ?? [];
      list.push(handler);
      events.set(name, list);
    },
    registerCommand: (name, opts) => commands.set(name, opts),
    registerTool: (def) => tools.set(def.name, def),
  };
  return { api, events, commands, tools };
}

function makeMockCtx(callLog) {
  return {
    cwd: repoRoot,
    hasUI: false,
    mode: "print",
    ui: {
      setStatus: (key, text) => callLog.push({ kind: "setStatus", key, text }),
      notify: (message, type) => callLog.push({ kind: "notify", message, type }),
    },
  };
}

// 与 far-stage.ts 完全一致的轻量标量解析:首个匹配行、首个冒号切分、去成对引号。
// 用于真实控制面分支从 STATE.yaml 读取期望值(不硬编码阶段,容忍未来阶段推进)。
function readTopScalar(text, key) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    if (line.slice(0, idx).trim() !== key) continue;
    let value = line.slice(idx + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

// ---------------------------------------------------------------------------
// 加载扩展(也供验收用的门禁矩阵脚本复用)
// ---------------------------------------------------------------------------

export async function loadFarStage() {
  const log = [];
  const { createJiti, piRequire } = loadJiti(log);
  const alias = {
    typebox: piRequire.resolve("typebox"),
    "@earendil-works/pi-coding-agent": path.join(PI_PKG, "dist", "index.js"),
  };
  const jiti = createJiti(import.meta.url, { moduleCache: false, alias });
  const factory = await jiti.import(EXT_PATH, { default: true });
  if (typeof factory !== "function") {
    throw new Error("far-stage.ts 默认导出不是工厂函数");
  }
  const mock = makeMockPi();
  await factory(mock.api);
  return { ...mock, loadLog: log };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

function toolText(res) {
  return res.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

async function runGateTool(tools, gate, label) {
  console.log(`\n>>> far_gate_run 调用: ${label} (gate=${JSON.stringify(gate)})`);
  const res = await tools
    .get("far_gate_run")
    .execute(`smoke-${label}`, gate === undefined ? {} : { gate }, undefined, undefined, makeMockCtx([]));
  const text = toolText(res);
  console.log(text);
  return { text, details: res.details };
}

async function fireSessionStart(events) {
  const log = [];
  await events.get("session_start")[0]({ type: "session_start", reason: "startup" }, makeMockCtx(log));
  const status = log.filter((c) => c.kind === "setStatus" && c.key === "far-stage").map((c) => c.text).join(" | ");
  const notify = log.filter((c) => c.kind === "notify").map((c) => c.message).join("\n");
  return { status, notify };
}

async function fireFarStatus(commands) {
  const log = [];
  await commands.get("far-status").handler("", makeMockCtx(log));
  return log.filter((c) => c.kind === "notify").map((c) => c.message).join("\n");
}

function createDesignFixture() {
  fs.mkdirSync(FAR_DESIGN_DIR, { recursive: true });
  fs.writeFileSync(
    DESIGN_STATE_PATH,
    [
      "# smoke fixture",
      "stage: S1",
      "freeze_status: design-frozen",
      "next_action: 冻结证据基线",
      "next_command: node scripts/ci_all.mjs",
      'updated_at: "2026-07-19T12:00:00+08:00"',
      "open_p0_questions: []",
      "open_blockers: []",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    DESIGN_RESUME_PATH,
    Array.from({ length: 12 }, (_, i) => `RESUME 第 ${i + 1} 行${i === 0 ? " · SMOKE-MARK" : ""}`).join("\n") + "\n",
    "utf8",
  );
}

function createMasterFixture() {
  fs.mkdirSync(FAR_MASTER_DIR, { recursive: true });
  fs.writeFileSync(
    MASTER_STATE_PATH,
    [
      "# smoke fixture",
      "phase: PHASE_B",
      "gate_status: GATE_A_PASSED",
      "current_objective: Phase B 事实恢复与设计冻结",
      "next_action: 执行 /far-s1-baseline",
      'updated_at: "2026-07-19T12:00:00+08:00"',
      "",
    ].join("\n"),
    "utf8",
  );
}

async function main() {
  console.log("=== far-stage.ts 冒烟测试 ===");
  console.log(`仓库根: ${repoRoot}`);

  // -- 1. 加载扩展 + 注册断言 -------------------------------------------------
  const { events, commands, tools, loadLog } = await loadFarStage();
  for (const l of loadLog) console.log(`   ${l}`);
  check("session_start 已监听", (events.get("session_start") ?? []).length === 1);
  check("/far-status 已注册", commands.has("far-status"));
  check("far_gate_run 已注册", tools.has("far_gate_run"));
  const def = tools.get("far_gate_run");
  check("far_gate_run 描述含完成前必须调用", /必须调用|must/i.test(def.description));

  // -- 2. .far-master 缺失时的兼容行为 -----------------------------------------
  const masterExistedInitially = fs.existsSync(MASTER_STATE_PATH);
  const designExistedInitially = fs.existsSync(DESIGN_STATE_PATH);
  console.log(`\n控制面现状: .far-master/STATE.yaml ${masterExistedInitially ? "存在(真实)" : "不存在"} · .far-design/STATE.yaml ${designExistedInitially ? "存在(真实)" : "不存在"}`);

  if (!masterExistedInitially) {
    const { status, notify } = await fireSessionStart(events);
    console.log(`   setStatus: ${status}`);
    console.log(`   notify: ${notify.split("\n").join(" | ")}`);
    if (designExistedInitially) {
      const realStage = readTopScalar(fs.readFileSync(DESIGN_STATE_PATH, "utf8"), "stage");
      const realFreeze = readTopScalar(fs.readFileSync(DESIGN_STATE_PATH, "utf8"), "freeze_status");
      check(
        ".far-master 缺失时保持旧版状态条行为",
        status.includes(`FAR ${realStage} · ${realFreeze}`) && !status.includes("✓"),
        status,
      );
    } else {
      check("两者皆缺时提示 bootstrap", notify.includes("far_design_bootstrap.mjs"));
    }
    const report0 = await fireFarStatus(commands);
    check(
      "/far-status 对 .far-master 缺失优雅降级",
      report0.includes(".far-master/STATE.yaml: 不存在") && report0.includes("far-phase-a"),
    );
  } else {
    console.log("   (跳过兼容分支:.far-master 已由他人建成,走真实文件断言)");
  }

  // -- 3. far_gate_run 真实调用 ------------------------------------------------
  const r1 = await runGateTool(tools, "design-lint", "design-lint");
  check("design-lint PASS", /\[PASS\] design-lint/.test(r1.text) && r1.details?.outcomes?.[0]?.verdict === "PASS");

  const r2 = await runGateTool(tools, "agent-config", "agent-config");
  check("agent-config PASS", /\[PASS\] agent-config/.test(r2.text) && r2.details?.outcomes?.[0]?.verdict === "PASS");

  const r3 = await runGateTool(tools, "not-a-gate", "unknown-gate");
  check("未知门名返回可用列表", r3.text.includes("未知门禁") && r3.text.includes("design-lint") && r3.details?.error === "unknown_gate");

  const r4 = await runGateTool(tools, "coverage-gate", "coverage-gate");
  const covVerdict = r4.details?.outcomes?.[0]?.verdict ?? "?";
  check("coverage-gate 长超时路径可工作(有确定裁决)", ["PASS", "FAIL", "TIMEOUT"].includes(covVerdict), `verdict=${covVerdict}`);
  check(
    "结构化 details 完整",
    typeof r4.details?.summary?.blockingGreen === "boolean" && typeof r4.details?.outcomes?.[0]?.durationMs === "number",
  );

  // -- 4. .far-master 存在时的全局行为(真实优先,否则夹具) ----------------------
  let createdMasterFixture = false;
  let createdDesignFixture = false;
  try {
    if (!masterExistedInitially) {
      createMasterFixture();
      createdMasterFixture = true;
      console.log("\n已创建临时 .far-master 夹具(测试后清理)");
    }
    if (!fs.existsSync(DESIGN_STATE_PATH)) {
      createDesignFixture();
      createdDesignFixture = true;
      console.log("已创建临时 .far-design 夹具(测试后清理)");
    }

    const masterText = fs.readFileSync(MASTER_STATE_PATH, "utf8");
    const expPhase = readTopScalar(masterText, "phase");
    const expGate = readTopScalar(masterText, "gate_status");
    const designText = fs.existsSync(DESIGN_STATE_PATH) ? fs.readFileSync(DESIGN_STATE_PATH, "utf8") : "";
    const expStage = designText ? readTopScalar(designText, "stage") : "";
    const expFreeze = designText ? readTopScalar(designText, "freeze_status") : "";
    const expStageShort = expStage.split("_")[0] || "";

    const { status, notify } = await fireSessionStart(events);
    console.log(`   setStatus: ${status}`);
    console.log(`   notify:\n${notify.split("\n").map((l) => `     ${l}`).join("\n")}`);

    if (createdMasterFixture) {
      // 夹具断言:phase=PHASE_B → 状态条 "FAR A✓·B[·S1] · {freeze}"
      check("全局状态条含已过阶段 ✓ 链", status.includes("A✓·B"), status);
      if (expStageShort) check("全局状态条含 Phase B 子阶段短名", status.includes(`B·${expStageShort}`), status);
      if (expFreeze) check("全局状态条尾部为 freeze_status", status.endsWith(`· ${expFreeze}`), status);
      check("notify 含 phase/gate_status 两行", notify.includes("phase: PHASE_B") && notify.includes("gate_status: GATE_A_PASSED"));
    } else {
      // 真实 .far-master:从文件读取期望值比对,不硬编码
      const letterMatch = /([A-H])\s*$/.exec(expPhase.replace(/^PHASE[_\s-]/i, ""));
      const letter = letterMatch ? letterMatch[1] : "";
      const idx = "ABCDEFGH".indexOf(letter);
      check("全局状态条反映真实 phase", idx >= 0 && status.includes(letter), `phase=${expPhase} status=${status}`);
      if (idx > 0) check("全局状态条含已过阶段 ✓", status.includes("✓"), status);
      if (expFreeze) check("全局状态条尾部为真实 freeze_status", status.endsWith(`· ${expFreeze}`), status);
      check("notify 含真实 phase/gate_status", notify.includes(`phase: ${expPhase}`) && notify.includes(`gate_status: ${expGate}`));
    }
    check("notify 含 .far-master 纪律提醒", notify.includes(".far-master/STATE.yaml") && notify.includes("PHASE_GATES.yaml"));

    const report = await fireFarStatus(commands);
    console.log(`\n>>> /far-status 报告:\n${report.split("\n").map((l) => `     ${l}`).join("\n")}`);
    check(
      "/far-status 含全局字段区与 phase/gate_status 行",
      report.includes(".far-master/STATE.yaml 全局字段") &&
        report.includes(`phase: ${expPhase}`) &&
        report.includes(`gate_status: ${expGate}`),
    );

    // -- 5. .far-design 字段提取与 RESUME.md 顶部 10 行 --------------------------
    if (createdDesignFixture) {
      check("/far-status 含夹具 stage/freeze_status/next_command", report.includes("stage: S1") && report.includes("freeze_status: design-frozen") && report.includes("next_command: node scripts/ci_all.mjs"));
      check("/far-status 含 RESUME.md 顶部标记", report.includes("SMOKE-MARK"));
      check("/far-status 只取顶部 10 行", !report.includes("RESUME 第 11 行"));
    } else if (designExistedInitially) {
      check(
        "/far-status 反映真实 .far-design 字段",
        report.includes(`stage: ${expStage}`) && report.includes(`freeze_status: ${expFreeze}`),
      );
      if (fs.existsSync(DESIGN_RESUME_PATH)) {
        const resumeLines = fs.readFileSync(DESIGN_RESUME_PATH, "utf8").split(/\r?\n/);
        const firstNonEmpty = resumeLines.find((l) => l.trim() !== "");
        check(
          "/far-status 含真实 RESUME.md 顶部 10 行",
          report.includes("RESUME.md 顶部 10 行") && (!firstNonEmpty || report.includes(firstNonEmpty)),
        );
        const line11 = resumeLines[10];
        const first10Text = resumeLines.slice(0, 10).join("\n");
        if (line11 && line11.trim() !== "" && !first10Text.includes(line11)) {
          check("/far-status 只取顶部 10 行(真实文件)", !report.includes(line11));
        } else {
          console.log("   (跳过第 11 行截断断言:真实 RESUME.md 第 11 行为空或与前 10 行重复)");
        }
      } else {
        check("/far-status 报告 RESUME.md 缺失", report.includes("RESUME.md: 不存在"));
      }
    }
  } finally {
    if (createdMasterFixture) {
      try {
        fs.rmSync(FAR_MASTER_DIR, { recursive: true, force: true });
        console.log("\n临时 .far-master 夹具已清理");
      } catch (e) {
        failures++;
        console.error(`❌ .far-master 夹具清理失败: ${e.message}`);
      }
    }
    if (createdDesignFixture) {
      try {
        fs.rmSync(FAR_DESIGN_DIR, { recursive: true, force: true });
        console.log("临时 .far-design 夹具已清理");
      } catch (e) {
        failures++;
        console.error(`❌ .far-design 夹具清理失败: ${e.message}`);
      }
    }
  }

  // -- 6. 结论 ------------------------------------------------------------------
  console.log(`\n=== 冒烟测试${failures === 0 ? "全部通过 ✅" : `存在 ${failures} 项失败 ❌`} ===`);
  return failures === 0 ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`❌ 冒烟测试异常: ${e.stack || e.message}`);
      process.exit(1);
    });
}
