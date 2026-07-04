#!/usr/bin/env node
// src/cli/far.ts
// 职责：FAR-Chain CLI 入口（FI-1 · far 命令家族）。
// 权威 SSOT：PROJECT_PLAN/06 §3.2.3（FI-1 CLI 命令集）+ 01 §5（far status）+ 04 §5（far verify）。
//
// 已实装子命令：`far status`（01 §5）+ `far verify`（04 §5 · FI-9 第三方独立重算）
// + `far export receipt`（04 §9 Trust Receipt DOC 投影）+ `far bench run`（05 §5 demo profile）。
// Node 24 原生 type stripping 跑 .ts（package.json engines node>=24；
// tsconfig noEmit，不构建 dist；bin 直接指向本文件）。

import { runBenchRun } from './commands/bench.ts';
import { runExportFarProof, type ExportFarProofSource } from './commands/export_far_proof.ts';
import { runExportReceipt, type ReceiptFormat } from './commands/export_receipt.ts';
import { runFecCompile, runFecFreeze } from './commands/fec.ts';
import { runFsmAdvance } from './commands/fsm.ts';
import { runStatus } from './commands/status.ts';
import { runVerify, VALID_MODES, type VerifyMode } from './commands/verify.ts';
import { runVerifyGolden, type VerifyGoldenBackend } from './commands/verify_golden.ts';

async function main(): Promise<void> {
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

  if (command === 'verify-golden') {
    const exitCode = runVerifyGoldenFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'bench') {
    const exitCode = await runBenchFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'export') {
    const exitCode = runExportFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'fec') {
    const exitCode = runFecFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'fsm') {
    const exitCode = runFsmFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  process.stderr.write(`far: 未知命令 '${command}'\n\n${HELP_TEXT}`);
  process.exit(1);
}

function runFecFromArgs(args: readonly string[]): number {
  const subcommand = args[0];
  if (subcommand === 'compile') {
    return runFecCompileFromArgs(args.slice(1));
  }
  if (subcommand === 'freeze') {
    return runFecFreezeFromArgs(args.slice(1));
  }
  process.stderr.write(
    `far fec: 当前支持 'compile' 或 'freeze'（实际: ${subcommand ?? '<missing>'}）\n`,
  );
  return 2;
}

function runFecCompileFromArgs(args: readonly string[]): number {
  let claimPath: string | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--claim') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far fec compile: --claim 需要一个参数（FecContractV2 JSON 路径）\n');
        return 2;
      }
      claimPath = next;
      i += 1;
    } else if (arg.startsWith('--claim=')) {
      claimPath = arg.slice('--claim='.length);
    } else if (arg === '--out') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far fec compile: --out 需要一个参数（输出 JSON 路径）\n');
        return 2;
      }
      outPath = next;
      i += 1;
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length);
    } else {
      process.stderr.write(`far fec compile: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  if (claimPath === undefined) {
    process.stderr.write('far fec compile: 必须提供 --claim <path>\n');
    return 2;
  }
  if (outPath === undefined) {
    process.stderr.write('far fec compile: 必须提供 --out <path>\n');
    return 2;
  }
  return runFecCompile({ claimPath, outPath });
}

function runFecFreezeFromArgs(args: readonly string[]): number {
  let fecPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--fec') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far fec freeze: --fec 需要一个参数（compile 输出的 JSON 路径）\n');
        return 2;
      }
      fecPath = next;
      i += 1;
    } else if (arg.startsWith('--fec=')) {
      fecPath = arg.slice('--fec='.length);
    } else {
      process.stderr.write(`far fec freeze: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  if (fecPath === undefined) {
    process.stderr.write('far fec freeze: 必须提供 --fec <path>\n');
    return 2;
  }
  return runFecFreeze({ fecPath });
}

function runFsmFromArgs(args: readonly string[]): number {
  const subcommand = args[0];
  if (subcommand !== 'advance') {
    process.stderr.write(`far fsm: 当前仅支持 'advance'（实际: ${subcommand ?? '<missing>'}）\n`);
    return 2;
  }
  return runFsmAdvanceFromArgs(args.slice(1));
}

function runFsmAdvanceFromArgs(args: readonly string[]): number {
  let event: string | undefined;
  let inputPath: string | undefined;
  let stateFile = './.far/fsm_state.json';
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--event') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far fsm advance: --event 需要一个参数（CliEvent 名）\n');
        return 2;
      }
      event = next;
      i += 1;
    } else if (arg.startsWith('--event=')) {
      event = arg.slice('--event='.length);
    } else if (arg === '--input') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far fsm advance: --input 需要一个参数（stageOutput JSON 路径）\n');
        return 2;
      }
      inputPath = next;
      i += 1;
    } else if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length);
    } else if (arg === '--state-file') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far fsm advance: --state-file 需要一个参数（state 文件路径）\n');
        return 2;
      }
      stateFile = next;
      i += 1;
    } else if (arg.startsWith('--state-file=')) {
      stateFile = arg.slice('--state-file='.length);
    } else if (arg === '--json') {
      json = true;
    } else {
      process.stderr.write(`far fsm advance: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  if (event === undefined) {
    process.stderr.write('far fsm advance: 必须提供 --event <name>\n');
    return 2;
  }
  if (inputPath === undefined) {
    process.stderr.write('far fsm advance: 必须提供 --input <path>\n');
    return 2;
  }

  const result = runFsmAdvance({ event, inputPath, stateFile });
  if (!result.ok) {
    process.stderr.write(`far fsm advance: ${result.error}\n`);
    return result.exitCode;
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`);
  } else {
    process.stdout.write(
      `far fsm advance: ${result.nextState} (receipt=${result.receipt.receipt.slice(0, 12)}…)\n  → ${result.stateFile}\n`,
    );
  }
  return 0;
}

function runVerifyGoldenFromArgs(args: readonly string[]): number {
  let json = false;
  let all = false;
  let caseId: string | undefined;
  let caseDir: string | undefined;
  let backend: VerifyGoldenBackend = 'node';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--json') {
      json = true;
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--case') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far verify-golden: --case 需要一个 caseId（如 GV-01）\n');
        return 2;
      }
      caseId = next;
      i += 1;
    } else if (arg.startsWith('--case=')) {
      caseId = arg.slice('--case='.length);
    } else if (arg === '--case-dir') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far verify-golden: --case-dir 需要一个目录路径\n');
        return 2;
      }
      caseDir = next;
      i += 1;
    } else if (arg.startsWith('--case-dir=')) {
      caseDir = arg.slice('--case-dir='.length);
    } else if (arg === '--backend') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far verify-golden: --backend 需要一个参数（当前支持 node|python|browser）\n');
        return 2;
      }
      const parsed = parseVerifyGoldenBackend(next);
      if (parsed === null) {
        process.stderr.write(`far verify-golden: --backend 当前支持 node|python|browser（实际: ${next}）\n`);
        return 2;
      }
      backend = parsed;
      i += 1;
    } else if (arg.startsWith('--backend=')) {
      const value = arg.slice('--backend='.length);
      const parsed = parseVerifyGoldenBackend(value);
      if (parsed === null) {
        process.stderr.write(`far verify-golden: --backend 当前支持 node|python|browser（实际: ${value}）\n`);
        return 2;
      }
      backend = parsed;
    } else {
      process.stderr.write(`far verify-golden: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  if (all && caseId !== undefined) {
    process.stderr.write('far verify-golden: --all 与 --case 不能同时使用\n');
    return 2;
  }

  return runVerifyGolden({
    json,
    backend,
    ...(caseDir !== undefined ? { caseDir } : {}),
    ...(caseId !== undefined ? { caseIds: [caseId] } : {}),
  });
}

function parseVerifyGoldenBackend(value: string): VerifyGoldenBackend | null {
  if (value === 'node' || value === 'python' || value === 'browser') {
    return value;
  }
  return null;
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
  let bundlePath: string | undefined;
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
    } else if (arg === '--bundle') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far verify: --bundle 需要一个参数（.far-proof 目录路径）\n');
        return 2;
      }
      bundlePath = next;
      i += 1;
    } else if (arg.startsWith('--bundle=')) {
      bundlePath = arg.slice('--bundle='.length);
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
    if (bundlePath !== undefined) {
      mode = 'full';
    } else if (envelopePath !== undefined && dbPath !== undefined) {
      mode = 'full';
    } else if (dbPath !== undefined) {
      mode = 'chain';
    } else {
      mode = 'envelope';
    }
  }
  if (!VALID_MODES.has(mode)) {
    process.stderr.write(`far verify: --mode 须为 chain|envelope|full（实际: ${mode}）\n`);
    return 2;
  }
  const verifiedMode: VerifyMode = mode as VerifyMode; // VALID_MODES.has 守卫保证（单层 as 配注释）。

  return runVerify({
    ...(bundlePath !== undefined ? { bundlePath } : {}),
    ...(envelopePath !== undefined ? { envelopePath } : {}),
    ...(dbPath !== undefined ? { dbPath } : {}),
    ...(lintInputPath !== undefined ? { lintInputPath } : {}),
    mode: verifiedMode,
    json,
    explain,
  });
}

async function runBenchFromArgs(args: readonly string[]): Promise<number> {
  const subcommand = args[0];
  if (subcommand !== 'run') {
    process.stderr.write(`far bench: 当前仅支持 'run'（实际: ${subcommand ?? '<missing>'}）\n`);
    return 2;
  }
  return runBenchRunFromArgs(args.slice(1));
}

function runBenchRunFromArgs(args: readonly string[]): Promise<number> {
  let json = false;
  let outputPath: string | undefined;
  let generatedAt: string | undefined;
  let gitCommitSha: string | null | undefined;
  let domain: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--json') {
      json = true;
    } else if (arg === '--out') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far bench run: --out 需要一个参数（输出 JSON 路径）\n');
        return Promise.resolve(2);
      }
      outputPath = next;
      i += 1;
    } else if (arg.startsWith('--out=')) {
      outputPath = arg.slice('--out='.length);
    } else if (arg === '--generated-at') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far bench run: --generated-at 需要一个 ISO 时间戳参数\n');
        return Promise.resolve(2);
      }
      if (!isIsoTimestamp(next)) {
        process.stderr.write(`far bench run: --generated-at 须为 ISO UTC 时间戳（实际: ${next}）\n`);
        return Promise.resolve(2);
      }
      generatedAt = next;
      i += 1;
    } else if (arg.startsWith('--generated-at=')) {
      const value = arg.slice('--generated-at='.length);
      if (!isIsoTimestamp(value)) {
        process.stderr.write(`far bench run: --generated-at 须为 ISO UTC 时间戳（实际: ${value}）\n`);
        return Promise.resolve(2);
      }
      generatedAt = value;
    } else if (arg === '--git-commit') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far bench run: --git-commit 需要一个 commit sha 或 null\n');
        return Promise.resolve(2);
      }
      const parsed = parseGitCommitSha(next);
      if (parsed === undefined) {
        process.stderr.write(`far bench run: --git-commit 不能为空（实际: ${next}）\n`);
        return Promise.resolve(2);
      }
      gitCommitSha = parsed;
      i += 1;
    } else if (arg.startsWith('--git-commit=')) {
      const value = arg.slice('--git-commit='.length);
      const parsed = parseGitCommitSha(value);
      if (parsed === undefined) {
        process.stderr.write(`far bench run: --git-commit 不能为空（实际: ${value}）\n`);
        return Promise.resolve(2);
      }
      gitCommitSha = parsed;
    } else if (arg === '--domain') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far bench run: --domain 需要一个领域名称\n');
        return Promise.resolve(2);
      }
      domain = next;
      i += 1;
    } else if (arg.startsWith('--domain=')) {
      const value = arg.slice('--domain='.length);
      if (value.length === 0) {
        process.stderr.write('far bench run: --domain 需要一个领域名称\n');
        return Promise.resolve(2);
      }
      domain = value;
    } else {
      process.stderr.write(`far bench run: 未知参数 '${arg}'\n`);
      return Promise.resolve(2);
    }
  }

  return runBenchRun({
    json,
    ...(outputPath !== undefined ? { outputPath } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
    ...(gitCommitSha !== undefined ? { gitCommitSha } : {}),
    ...(domain !== undefined ? { domain } : {}),
  });
}

function runExportFromArgs(args: readonly string[]): number {
  const subcommand = args[0];
  if (subcommand === 'receipt') {
    return runExportReceiptFromArgs(args.slice(1));
  }
  if (subcommand === 'far-proof') {
    return runExportFarProofFromArgs(args.slice(1));
  }
  process.stderr.write(`far export: 当前支持 'receipt' 或 'far-proof'（实际: ${subcommand ?? '<missing>'}）\n`);
  return 2;
}

function runExportReceiptFromArgs(args: readonly string[]): number {
  let bundlePath: string | undefined;
  let envelopePath: string | undefined;
  let outputPath: string | undefined;
  let generatedAt: string | undefined;
  let format: ReceiptFormat = 'json';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--json') {
      format = 'json';
    } else if (arg === '--markdown') {
      format = 'markdown';
    } else if (arg === '--format') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export receipt: --format 需要一个参数（json|markdown）\n');
        return 2;
      }
      const parsed = parseReceiptFormat(next);
      if (parsed === null) {
        process.stderr.write(`far export receipt: --format 须为 json|markdown（实际: ${next}）\n`);
        return 2;
      }
      format = parsed;
      i += 1;
    } else if (arg.startsWith('--format=')) {
      const parsed = parseReceiptFormat(arg.slice('--format='.length));
      if (parsed === null) {
        process.stderr.write(`far export receipt: --format 须为 json|markdown（实际: ${arg.slice('--format='.length)}）\n`);
        return 2;
      }
      format = parsed;
    } else if (arg === '--bundle') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export receipt: --bundle 需要一个参数（.far-proof 目录路径）\n');
        return 2;
      }
      bundlePath = next;
      i += 1;
    } else if (arg.startsWith('--bundle=')) {
      bundlePath = arg.slice('--bundle='.length);
    } else if (arg === '--envelope') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export receipt: --envelope 需要一个参数（ProofEnvelopeV2 JSON 路径）\n');
        return 2;
      }
      envelopePath = next;
      i += 1;
    } else if (arg.startsWith('--envelope=')) {
      envelopePath = arg.slice('--envelope='.length);
    } else if (arg === '--out') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export receipt: --out 需要一个参数（输出路径）\n');
        return 2;
      }
      outputPath = next;
      i += 1;
    } else if (arg.startsWith('--out=')) {
      outputPath = arg.slice('--out='.length);
    } else if (arg === '--generated-at') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export receipt: --generated-at 需要一个 ISO 时间戳参数\n');
        return 2;
      }
      generatedAt = next;
      i += 1;
    } else if (arg.startsWith('--generated-at=')) {
      generatedAt = arg.slice('--generated-at='.length);
    } else {
      process.stderr.write(`far export receipt: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  return runExportReceipt({
    ...(bundlePath !== undefined ? { bundlePath } : {}),
    ...(envelopePath !== undefined ? { envelopePath } : {}),
    ...(outputPath !== undefined ? { outputPath } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
    format,
  });
}

function runExportFarProofFromArgs(args: readonly string[]): number {
  let demoChain = false;
  let dbPath: string | undefined;
  let outputDir: string | undefined;
  let runId: string | undefined;
  let modelSnapshot: string | undefined;
  let gitCommitSha: string | undefined;
  let envHash: string | undefined;
  let exportedAt: string | undefined;
  let packageBundle = false;
  let archivePath: string | undefined;
  let force = false;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--demo-chain') {
      demoChain = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--package') {
      packageBundle = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--db') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export far-proof: --db 需要一个 evidence_log DB 路径\n');
        return 2;
      }
      dbPath = next;
      i += 1;
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice('--db='.length);
    } else if (arg === '--out') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export far-proof: --out 需要一个输出目录路径\n');
        return 2;
      }
      outputDir = next;
      i += 1;
    } else if (arg.startsWith('--out=')) {
      outputDir = arg.slice('--out='.length);
    } else if (arg === '--run-id') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far export far-proof: --run-id 需要一个非空参数\n');
        return 2;
      }
      runId = next;
      i += 1;
    } else if (arg.startsWith('--run-id=')) {
      runId = arg.slice('--run-id='.length);
    } else if (arg === '--model-snapshot') {
      const next = args[i + 1];
      if (next === undefined || next.length === 0) {
        process.stderr.write('far export far-proof: --model-snapshot 需要一个非空参数\n');
        return 2;
      }
      modelSnapshot = next;
      i += 1;
    } else if (arg.startsWith('--model-snapshot=')) {
      modelSnapshot = arg.slice('--model-snapshot='.length);
    } else if (arg === '--git-commit') {
      const next = args[i + 1];
      if (next === undefined || !isGitSha(next)) {
        process.stderr.write(`far export far-proof: --git-commit 须为 40-hex SHA（实际: ${next ?? '<missing>'}）\n`);
        return 2;
      }
      gitCommitSha = next;
      i += 1;
    } else if (arg.startsWith('--git-commit=')) {
      const value = arg.slice('--git-commit='.length);
      if (!isGitSha(value)) {
        process.stderr.write(`far export far-proof: --git-commit 须为 40-hex SHA（实际: ${value}）\n`);
        return 2;
      }
      gitCommitSha = value;
    } else if (arg === '--env-hash') {
      const next = args[i + 1];
      if (next === undefined || !isHex64(next)) {
        process.stderr.write(`far export far-proof: --env-hash 须为 64-hex（实际: ${next ?? '<missing>'}）\n`);
        return 2;
      }
      envHash = next;
      i += 1;
    } else if (arg.startsWith('--env-hash=')) {
      const value = arg.slice('--env-hash='.length);
      if (!isHex64(value)) {
        process.stderr.write(`far export far-proof: --env-hash 须为 64-hex（实际: ${value}）\n`);
        return 2;
      }
      envHash = value;
    } else if (arg === '--archive') {
      const next = args[i + 1];
      if (next === undefined) {
        process.stderr.write('far export far-proof: --archive 需要一个 .tar.zst 输出路径\n');
        return 2;
      }
      archivePath = next;
      packageBundle = true;
      i += 1;
    } else if (arg.startsWith('--archive=')) {
      archivePath = arg.slice('--archive='.length);
      packageBundle = true;
    } else if (arg === '--exported-at' || arg === '--generated-at') {
      const next = args[i + 1];
      if (next === undefined || !isIsoTimestamp(next)) {
        process.stderr.write(`far export far-proof: ${arg} 须为 ISO UTC 时间戳（实际: ${next ?? '<missing>'}）\n`);
        return 2;
      }
      exportedAt = next;
      i += 1;
    } else if (arg.startsWith('--exported-at=') || arg.startsWith('--generated-at=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : '';
      if (!isIsoTimestamp(value)) {
        process.stderr.write(`far export far-proof: exportedAt 须为 ISO UTC 时间戳（实际: ${value}）\n`);
        return 2;
      }
      exportedAt = value;
    } else {
      process.stderr.write(`far export far-proof: 未知参数 '${arg}'\n`);
      return 2;
    }
  }

  if (outputDir === undefined || outputDir.length === 0) {
    process.stderr.write('far export far-proof: 必须提供 --out <dir>\n');
    return 2;
  }
  const source = buildExportFarProofSource({ demoChain, dbPath, runId, modelSnapshot, gitCommitSha, envHash });
  if (!source.ok) {
    process.stderr.write(`far export far-proof: ${source.error}\n`);
    return 2;
  }

  return runExportFarProof({
    source: source.source,
    outputDir,
    packageBundle,
    force,
    json,
    ...(archivePath !== undefined ? { archivePath } : {}),
    ...(exportedAt !== undefined ? { exportedAt } : {}),
  });
}

function buildExportFarProofSource(input: {
  readonly demoChain: boolean;
  readonly dbPath: string | undefined;
  readonly runId: string | undefined;
  readonly modelSnapshot: string | undefined;
  readonly gitCommitSha: string | undefined;
  readonly envHash: string | undefined;
}): { readonly ok: true; readonly source: ExportFarProofSource } | { readonly ok: false; readonly error: string } {
  const sourceCount = Number(input.demoChain) + Number(input.dbPath !== undefined);
  if (sourceCount !== 1) {
    return { ok: false, error: '须且只能提供 --demo-chain 或 --db <path>' };
  }
  if (input.demoChain) {
    return { ok: true, source: { kind: 'demoChain' } };
  }
  if (
    input.dbPath === undefined ||
    input.runId === undefined ||
    input.modelSnapshot === undefined ||
    input.gitCommitSha === undefined ||
    input.envHash === undefined
  ) {
    return {
      ok: false,
      error: '使用 --db 时必须提供 --run-id、--model-snapshot、--git-commit 和 --env-hash',
    };
  }
  return {
    ok: true,
    source: {
      kind: 'db',
      dbPath: input.dbPath,
      runId: input.runId,
      modelSnapshot: input.modelSnapshot,
      gitCommitSha: input.gitCommitSha,
      envHash: input.envHash,
    },
  };
}

function parseReceiptFormat(value: string): ReceiptFormat | null {
  if (value === 'json') return 'json';
  if (value === 'markdown' || value === 'md') return 'markdown';
  return null;
}

function parseGitCommitSha(value: string): string | null | undefined {
  if (value === 'null' || value === 'none') {
    return null;
  }
  if (value.length === 0) {
    return undefined;
  }
  return value;
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isGitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

function isHex64(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const HELP_TEXT = `FAR-Chain CLI（FI-1 · far 命令家族）

用法：
  far status [--db <path>] [--json]    生成单一 SSOT 状态报告（FI-10 · 01§5）
    --db <path>   验证 evidence_log DB 链头（verifyChainHead），不提供则 pending
    --json        机器可读输出（CI 文档构建回填 <X_FROM_STATUS_DUMP> 占位符用）

  far verify [--bundle <path> | --envelope <path> --db <path>] [--mode chain|envelope|full]
             [--json] [--explain]      第三方独立重算验证（FI-9 · 04§5）
    --bundle <path>    .far-proof V1 minimal 离线包目录（full 模式验必需文件 + redacted chain + V1 proofHash）
    --envelope <path>  ProofEnvelopeV2 JSON 文件（envelope/full 模式必需）
    --db <path>        evidence_log DB（chain/full 模式必需·verifyChainHead）
    --mode <m>         chain|envelope|full（默认从 --envelope/--db 推断）
    --json             机器可读 10 字段 schema 输出（04 §5.2）
    --explain          人类可读模式展开 10 规则 check 表
    --lint-input <path> AntiTheaterLintInput JSON（#11b·04 §5.3 L5 anti-theater verifier；
                       须配合 --envelope；独立重算 20 detector 并与内嵌报告深度对比，
                       任何发散 → status FAIL · exit 7）
    退出码：0 PASS / 7 FAIL / 2 参数错误 / 1 运行时错误（04 §5.4）

  far verify-golden [--all | --case GV-01] [--backend node|python|browser] [--json]
                         verdict golden vectors 重算（P1-4）
    --all               跑 golden_vectors/cases/GV-01..GV-12.json（默认）
    --case <id>         仅跑单个 case（如 GV-01）
    --case-dir <path>   指定 case 目录（测试/离线包复核用）
    --backend node      执行 Node/V2 kernel 轴，真实调用 decideFiveValueVerdict
    --backend python    执行 Python mirror 轴，读取同一 case JSON 独立重算
    --backend browser   执行离线 browser verifier 轴，读取 frontend/public/verify_golden.html 内联脚本
    --json              输出机器可读汇总
    退出码：0 PASS / 7 FAIL / 2 参数错误 / 1 运行时错误

  far export receipt (--envelope <path> | --bundle <path>) [--format json|markdown] [--out <path>]
                         Trust Receipt DOC 投影（04§9；不进入 proofHash）
    --envelope <path>    ProofEnvelopeV2 JSON 文件
    --bundle <path>      .far-proof V1 minimal 离线包目录
    --format <fmt>       json|markdown（默认 json；--json / --markdown 为快捷形式）
    --out <path>         写入文件；不提供则输出到 stdout
    退出码：0 成功 / 7 输入验证失败 / 2 参数错误 / 1 运行时错误

  far export far-proof (--demo-chain | --db <path>) --out <dir> [--package] [--archive <path>]
                       [--json] [--force] [--exported-at <iso>]
                         .far-proof V1 self-verifiable evidence bundle（04§5 / APPENDIX_D）
    --demo-chain         构造 C-ASTRO-0001 offline demo chain 后导出
    --db <path>          从已有 evidence_log DB 导出（须提供下列四个元数据参数）
    --run-id <id>        DB 导出时写入 run id
    --model-snapshot <s> DB 导出时写入 model snapshot
    --git-commit <sha>   DB 导出时写入 40-hex git commit SHA
    --env-hash <hex>     DB 导出时写入 64-hex 环境指纹
    --package            生成 verify.sh + integrity.json + .tar.zst 离线包
    --archive <path>     指定 .tar.zst 路径（隐含 --package）
    --force              覆盖非空输出目录
    退出码：0 成功 / 7 链验证失败 / 2 参数错误 / 1 运行时错误

  far bench run [--domain <name>] [--generated-at <iso>] [--git-commit <sha|null>]
                [--json] [--out <path>] FAR-Bench demo profile（05§5）
    --domain <name>      仅运行指定 demo 领域（如 天文学）；不提供则运行全部 demo seeds
    --generated-at <iso> 锁定报告 generatedAt（用于 golden/fresh-clone 复现）
    --git-commit <sha>   写入报告 gitCommitSha；null/none 表示不锚 commit
    --json               stdout 输出完整 BenchmarkReport JSON
    --out <path>         写入完整 BenchmarkReport JSON
    退出码：0 成功 / 2 参数错误 / 1 运行时错误

  far fec compile --claim <path> --out <path>   FEC V2 编译 + fecHash 重算（P1-1·03 §2.2）
    --claim <path>      FecContractV2 JSON 路径（输入）
    --out <path>        输出 JSON 路径（含 {plan, fecHash, fec}）
    真实依赖：compileFec 跑 10 项编译检查；computeFecHash sha256(canonical JSON of VC fields)。
    退出码：0 编译成功 / 7 编译失败（HARD_FAIL）/ 2 参数错误 / 1 运行时错误

  far fec freeze --fec <path>                   FEC V2 冻结哈希重算互验（P1-1·03 §1.2 [VC]）
    --fec <path>        far fec compile 输出的 JSON 路径
    真实依赖：computeFecHash 重算后与 stored fecHash 严格比对（CLAUDE.md §5 RR-1 禁手填）。
    退出码：0 hash 匹配 / 7 hash 不匹配（篡改检出）/ 2 参数错误 / 1 运行时错误

  far fsm advance --event <name> --input <path> [--state-file <path>] [--json]
                                    9-state CLI 协议 FSM 推进 + stageReceipt 哈希链追加（P2-2）
    --event <name>      CliEvent 名（ADVANCE_CLAIM_CANDIDATE / ADVANCE_FEC_PROPOSE /
                        ADVANCE_FEC_COMPILE / ADVANCE_EVIDENCE_GATHER / ADVANCE_STATISTICS /
                        ADVANCE_VERDICT / ADVANCE_PROOF_SEAL / ADVANCE_AUDITABLE / ADVANCE_VERIFIED）
    --input <path>      stageOutput JSON 文件路径
    --state-file <path> state 文件路径（默认 ./.far/fsm_state.json；不存在则按 INITIAL+GENESIS_RECEIPT 初始化）
    --json              机器可读输出（StageReceipt JSON）
    真实依赖：transition（state_machine）+ computeStageReceipt（sha256(prevReceipt + hashCanonicalJson)）。
    非法转移不静默覆写：返回 PROTOCOL_DEVIATION_CRITICAL，exit 7（fail-closed 红线）。
    退出码：0 推进成功 / 7 协议偏离 / 2 参数错误 / 1 运行时错误

  后续子命令（W1-W5 路线图）：
  far ask/repl/stream                       产品化交互壳（FI-1 后续）
  `;

main().catch((error: unknown) => {
  process.stderr.write(`far: 运行失败 — ${errorMessage(error)}\n`);
  process.exit(1);
});
