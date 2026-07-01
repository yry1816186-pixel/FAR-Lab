#!/usr/bin/env node
// src/cli/far.ts
// 职责：FAR-Chain CLI 入口（FI-1 · far 命令家族）。
// 权威 SSOT：PROJECT_PLAN/06 §3.2.3（FI-1 CLI 命令集）+ 01 §5（far status）+ 04 §5（far verify，W2）。
//
// W0 phase A 最小壳：仅 `far status` 子命令。`far verify` / `far export` 等留后续 FI。
// Node 24 原生 type stripping 跑 .ts（package.json engines node>=24；tsconfig noEmit，
// 不构建 dist；bin 直接指向本文件）。

import { runStatus } from './commands/status.ts';

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

const HELP_TEXT = `FAR-Chain CLI（FI-1 · W0 phase A 最小壳）

用法：
  far status [--db <path>] [--json]    生成单一 SSOT 状态报告（FI-10 · 01§5）
    --db <path>   验证 evidence_log DB 链头（verifyChainHead），不提供则 pending
    --json        机器可读输出（CI 文档构建回填 <X_FROM_STATUS_DUMP> 占位符用）

后续子命令（W1-W5 路线图）：
  far verify --claim <id> [--full-trace]   第三方可独立重算全链（FI-9 · 04§5）
  far export --format far-proof             .far-proof 三重导出（FI-9 · 04§5）
`;

main();
