#!/usr/bin/env node
// src/cli/far.ts
// 职责：FAR-Chain CLI 入口（FI-1 · far 命令家族）。
// 权威 SSOT：PROJECT_PLAN/06 §3.2.3（FI-1 CLI 命令集）+ 01 §5（far status）+ 04 §5（far verify）。
//
// 已实装子命令：`far status`（01 §5）+ `far verify`（04 §5 · FI-9 第三方独立重算）。
// `far export` 等留后续 FI。Node 24 原生 type stripping 跑 .ts（package.json engines node>=24；
// tsconfig noEmit，不构建 dist；bin 直接指向本文件）。

import { runStatus } from './commands/status.ts';
import { runVerify, VALID_MODES, type VerifyMode } from './commands/verify.ts';

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (command === undefined) {
    process.stdout.write(HELP_TEXT);
    process.exit(1);
  }

  if (command === 'status') {
    const exitCode = runStatusFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'verify') {
    const exitCode = runVerifyFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  process.stderr.write(`far: 未知命令 '${command}'\n\n${HELP_TEXT}`);
  process.exit(1);
}

function runStatusFromArgs(args: readonly string[]): number {
  let dbPath: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--json') {
      json = true;
    } else if (arg === '--db') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far status: --db 需要一个参数（evidence_log DB 路径）\n');
        return 2;
      }
      dbPath = next;
      i += 1;
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice('--db='.length);
    } else {
      process.stderr.write(`far status: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  return runStatus(dbPath !== undefined ? { dbPath, json } : { json });
}

function runVerifyFromArgs(args: readonly string[]): number {
  let envelopePath: string | undefined;
  let dbPath: string | undefined;
  let mode: string | undefined;
  let json = false;
  let explain = false;
  let lintInputPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--json') {
      json = true;
    } else if (arg === '--explain') {
      explain = true;
    } else if (arg === '--lint-input') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far verify: --lint-input 需要一个参数（AntiTheaterLintInput JSON 路径）\n');
        return 2;
      }
      lintInputPath = next;
      i += 1;
    } else if (arg.startsWith('--lint-input=')) {
      lintInputPath = arg.slice('--lint-input='.length);
    } else if (arg === '--envelope') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far verify: --envelope 需要一个参数（ProofEnvelopeV2 JSON 路径）\n');
        return 2;
      }
      envelopePath = next;
      i += 1;
    } else if (arg.startsWith('--envelope=')) {
      envelopePath = arg.slice('--envelope='.length);
    } else if (arg === '--db') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far verify: --db 需要一个参数（evidence_log DB 路径）\n');
        return 2;
      }
      dbPath = next;
      i += 1;
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice('--db='.length);
    } else if (arg === '--mode') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far verify: --mode 需要一个参数（chain|envelope|full）\n');
        return 2;
      }
      mode = next;
      i += 1;
    } else if (arg.startsWith('--mode=')) {
      mode = arg.slice('--mode='.length);
    } else {
      process.stderr.write(`far verify: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  // mode 默认推断（D2）：两者→full；仅 --db→chain；否则→envelope（须 --envelope）。
  if (mode === undefined) {
    mode = envelopePath !== undefined && dbPath !== undefined ? 'full' : dbPath !== undefined ? 'chain' : 'envelope';
  }
  if (!VALID_MODES.has(mode)) {
    process.stderr.write(`far verify: --mode 须为 chain|envelope|full（实际: ${mode}）\n`);
    return 2;
  }
  const verifiedMode: VerifyMode = mode as VerifyMode; // VALID_MODES.has 守卫保证（单层 as 配注释）。

  return runVerify({
    ...(envelopePath !== undefined ? { envelopePath } : {}),
    ...(dbPath !== undefined ? { dbPath } : {}),
    ...(lintInputPath !== undefined ? { lintInputPath } : {}),
    mode: verifiedMode,
    json,
    explain,
  });
}

const HELP_TEXT = `FAR-Chain CLI（FI-1 · far 命令家族）

用法：
  far status [--db <path>] [--json]    生成单一 SSOT 状态报告（FI-10 · 01§5）
    --db <path>   验证 evidence_log DB 链头（verifyChainHead），不提供则 pending
    --json        机器可读输出（CI 文档构建回填 <X_FROM_STATUS_DUMP> 占位符用）

  far verify [--envelope <path>] [--db <path>] [--mode chain|envelope|full]
             [--json] [--explain]      第三方独立重算验证（FI-9 · 04§5）
    --envelope <path>  ProofEnvelopeV2 JSON 文件（envelope/full 模式必需）
    --db <path>        evidence_log DB（chain/full 模式必需·verifyChainHead）
    --mode <m>         chain|envelope|full（默认从 --envelope/--db 推断）
    --json             机器可读 10 字段 schema 输出（04 §5.2）
    --explain          人类可读模式展开 10 规则 check 表
    --lint-input <path> AntiTheaterLintInput JSON（#11b·04 §5.3 L5 anti-theater verifier；
                       须配合 --envelope；独立重算 20 detector 并与内嵌报告深度对比，
                       任何发散 → status FAIL · exit 7）
    退出码：0 PASS / 7 FAIL / 2 参数错误 / 1 运行时错误（04 §5.4）

后续子命令（W1-W5 路线图）：
  far export --format far-proof             .far-proof 三重导出（FI-9 · 04§5）
`;

main();
