#!/usr/bin/env node
// src/cli/far.ts
// 职责：FAR-Chain CLI 入口（FI-1 · far 命令家族）。
// 权威 SSOT：FAR_LAB_MASTER_PLAN/06 §3.2.3（FI-1 CLI 命令集）+ 01 §5（far status）+ 04 §5（far verify）。
//
// 已实装子命令：`far status`（01 §5）+ `far verify`（04 §5 · FI-9 第三方独立重算）
// + `far export receipt`（04 §9 Trust Receipt DOC 投影）+ `far export far-proof` + `far bench run`
// + `far verify-golden`（14 GV）+ `far fec compile|freeze` + `far fsm advance`（P2-2）
// + `far demo`（一键演示）+ `far api`（REST server）+ `far ask`（6-stage FSM）。
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
import { runApi } from './commands/api.ts';
import { runAsk } from './commands/ask.ts';
import { runDemo } from './commands/demo.ts';
import { runStream } from './commands/stream.ts';
import { runRepl } from './commands/repl.ts';
import { runReplay } from './commands/replay.ts';
import { runCourt } from './commands/court.ts';
import { runArena } from './commands/arena.ts';
import { runInit } from './commands/init.ts';
import { runDoctor } from './commands/doctor.ts';
import { runVersion } from './commands/version.ts';
import { parseOptions, reportErrors, type OptionSchema } from './parse_options.ts';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(HELP_TEXT);
    process.exit(command === undefined ? 1 : 0);
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    process.exit(runVersion());
  }

  if (command === 'doctor') {
    const liveQwenSmoke = argv.includes('--live-qwen-smoke');
    const exitCode = await runDoctor({ liveQwenSmoke });
    process.exit(exitCode);
  }

  if (command === 'status') {
    const exitCode = runStatusFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'api') {
    // server 监听中保持进程存活（startServer 注册了 SIGINT/SIGTERM 优雅关停）。
    await runApi(argv.slice(1));
    return;
  }

  if (command === 'demo') {
    process.exit(runDemo(argv[1]));
  }

  if (command === 'ask') {
    const exitCode = await runAsk(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'stream') {
    const exitCode = await runStream(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'repl') {
    const exitCode = await runRepl();
    process.exit(exitCode);
  }

  if (command === 'replay') {
    process.exit(runReplay(argv.slice(1)));
  }

  if (command === 'court') {
    const exitCode = await runCourt(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'arena') {
    const exitCode = await runArena(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'init') {
    process.exit(runInit(argv.slice(1)));
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

const FEC_COMPILE_SCHEMA: readonly OptionSchema[] = [
  { name: '--claim', type: 'string', required: true, description: 'FecContractV2 JSON 路径', requiredPlaceholder: 'path' },
  { name: '--out', type: 'string', required: true, description: '输出 JSON 路径', requiredPlaceholder: 'path' },
];

function runFecCompileFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, FEC_COMPILE_SCHEMA, 'far fec compile');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const claimPath = result.values['--claim'] as string;
  const outPath = result.values['--out'] as string;
  return runFecCompile({ claimPath, outPath });
}

const FEC_FREEZE_SCHEMA: readonly OptionSchema[] = [
  { name: '--fec', type: 'string', required: true, description: 'compile 输出的 JSON 路径', requiredPlaceholder: 'path' },
];

function runFecFreezeFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, FEC_FREEZE_SCHEMA, 'far fec freeze');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const fecPath = result.values['--fec'] as string;
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

const FSM_ADVANCE_SCHEMA: readonly OptionSchema[] = [
  { name: '--event', type: 'string', required: true, description: 'CliEvent 名', requiredPlaceholder: 'name' },
  { name: '--input', type: 'string', required: true, description: 'stageOutput JSON 路径', requiredPlaceholder: 'path' },
  { name: '--state-file', type: 'string', default: './.far/fsm_state.json', description: 'state 文件路径' },
  { name: '--json', type: 'boolean', description: '机器可读输出（StageReceipt JSON）' },
];

function runFsmAdvanceFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, FSM_ADVANCE_SCHEMA, 'far fsm advance');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const event = result.values['--event'] as string;
  const inputPath = result.values['--input'] as string;
  const stateFile = result.values['--state-file'] as string;
  const json = result.values['--json'] === true;

  const fsmResult = runFsmAdvance({ event, inputPath, stateFile });
  if (!fsmResult.ok) {
    process.stderr.write(`far fsm advance: ${fsmResult.error}\n`);
    return fsmResult.exitCode;
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(fsmResult.receipt, null, 2)}\n`);
  } else {
    process.stdout.write(
      `far fsm advance: ${fsmResult.nextState} (receipt=${fsmResult.receipt.receipt.slice(0, 12)}…)\n  → ${fsmResult.stateFile}\n`,
    );
  }
  return 0;
}

const VERIFY_GOLDEN_SCHEMA: readonly OptionSchema[] = [
  { name: '--json', type: 'boolean', description: '输出机器可读汇总' },
  { name: '--all', type: 'boolean', description: '跑 golden_vectors/cases/GV-01..GV-14.json（默认）' },
  { name: '--case', type: 'string', description: '仅跑单个 case（如 GV-01）' },
  { name: '--case-dir', type: 'string', description: '指定 case 目录' },
  {
    name: '--backend',
    type: 'enum',
    default: 'node',
    enumValues: ['node', 'python', 'browser'],
    description: 'node|python|browser',
  },
];

function runVerifyGoldenFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, VERIFY_GOLDEN_SCHEMA, 'far verify-golden');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const all = result.values['--all'] === true;
  const caseId = result.values['--case'] as string | undefined;
  if (all && caseId !== undefined) {
    process.stderr.write('far verify-golden: --all 与 --case 不能同时使用\n');
    return 2;
  }
  const caseDir = result.values['--case-dir'] as string | undefined;
  const backend = result.values['--backend'] as VerifyGoldenBackend;
  return runVerifyGolden({
    json: result.values['--json'] === true,
    backend,
    ...(caseDir !== undefined ? { caseDir } : {}),
    ...(caseId !== undefined ? { caseIds: [caseId] } : {}),
  });
}

const STATUS_SCHEMA: readonly OptionSchema[] = [
  { name: '--json', type: 'boolean', description: '机器可读输出' },
  { name: '--db', type: 'string', description: 'evidence_log DB 路径' },
];

function runStatusFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, STATUS_SCHEMA, 'far status');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const dbPath = result.values['--db'] as string | undefined;
  const json = result.values['--json'] === true;
  return runStatus(dbPath !== undefined ? { dbPath, json } : { json });
}

const VERIFY_SCHEMA: readonly OptionSchema[] = [
  { name: '--json', type: 'boolean', description: '机器可读 10 字段 schema 输出' },
  { name: '--explain', type: 'boolean', description: '人类可读模式展开 10 规则 check 表' },
  { name: '--bundle', type: 'string', positional: true, description: '.far-proof V1 minimal 离线包目录' },
  { name: '--lint-input', type: 'string', description: 'AntiTheaterLintInput JSON 路径' },
  { name: '--envelope', type: 'string', description: 'ProofEnvelopeV2 JSON 路径' },
  { name: '--db', type: 'string', description: 'evidence_log DB 路径' },
  {
    name: '--mode',
    type: 'enum',
    enumValues: [...VALID_MODES],
    description: 'chain|envelope|full',
  },
];

function runVerifyFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, VERIFY_SCHEMA, 'far verify');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const bundlePath = result.values['--bundle'] as string | undefined;
  const envelopePath = result.values['--envelope'] as string | undefined;
  const dbPath = result.values['--db'] as string | undefined;
  const lintInputPath = result.values['--lint-input'] as string | undefined;
  let mode = result.values['--mode'] as string | undefined;

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
  const verifiedMode: VerifyMode = mode as VerifyMode; // enum schema 已守卫（单层 as 配注释）。

  return runVerify({
    ...(bundlePath !== undefined ? { bundlePath } : {}),
    ...(envelopePath !== undefined ? { envelopePath } : {}),
    ...(dbPath !== undefined ? { dbPath } : {}),
    ...(lintInputPath !== undefined ? { lintInputPath } : {}),
    mode: verifiedMode,
    json: result.values['--json'] === true,
    explain: result.values['--explain'] === true,
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

const BENCH_RUN_SCHEMA: readonly OptionSchema[] = [
  { name: '--json', type: 'boolean', description: 'stdout 输出完整 BenchmarkReport JSON' },
  { name: '--out', type: 'string', description: '输出 JSON 路径' },
  {
    name: '--generated-at',
    type: 'string',
    description: 'ISO 时间戳',
    validate: (v) => isIsoTimestamp(v) ? null : `须为 ISO UTC 时间戳（实际: ${v}）`,
  },
  {
    name: '--git-commit',
    type: 'string',
    description: 'commit sha 或 null',
    validate: (v) => v.length === 0 ? `不能为空（实际: ${v}）` : null,
  },
  {
    name: '--domain',
    type: 'string',
    description: '领域名称',
    validate: (v) => v.length === 0 ? '需要一个领域名称' : null,
  },
];

async function runBenchRunFromArgs(args: readonly string[]): Promise<number> {
  const result = parseOptions(args, BENCH_RUN_SCHEMA, 'far bench run');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const outputPath = result.values['--out'] as string | undefined;
  const generatedAt = result.values['--generated-at'] as string | undefined;
  const domain = result.values['--domain'] as string | undefined;
  const rawGitCommit = result.values['--git-commit'] as string | undefined;
  let gitCommitSha: string | null | undefined = rawGitCommit;
  if (rawGitCommit === 'null' || rawGitCommit === 'none') {
    gitCommitSha = null;
  }

  return runBenchRun({
    json: result.values['--json'] === true,
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

const EXPORT_RECEIPT_SCHEMA: readonly OptionSchema[] = [
  { name: '--json', type: 'boolean', description: '快捷 --format json' },
  { name: '--markdown', type: 'boolean', description: '快捷 --format markdown' },
  {
    name: '--format',
    type: 'string',
    description: 'json|markdown',
    validate: (v) => ['json', 'markdown', 'md'].includes(v) ? null : `须为 json|markdown（实际: ${v}）`,
  },
  { name: '--bundle', type: 'string', description: '.far-proof 目录路径' },
  { name: '--envelope', type: 'string', description: 'ProofEnvelopeV2 JSON 路径' },
  { name: '--out', type: 'string', description: '输出路径' },
  { name: '--generated-at', type: 'string', description: 'ISO 时间戳' },
];

function runExportReceiptFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, EXPORT_RECEIPT_SCHEMA, 'far export receipt');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const bundlePath = result.values['--bundle'] as string | undefined;
  const envelopePath = result.values['--envelope'] as string | undefined;
  const outputPath = result.values['--out'] as string | undefined;
  const generatedAt = result.values['--generated-at'] as string | undefined;
  const formatValue = result.values['--format'] as string | undefined;
  let format: ReceiptFormat = 'json';
  if (formatValue !== undefined) {
    format = formatValue === 'md' ? 'markdown' : (formatValue as ReceiptFormat);
  } else if (result.values['--markdown'] === true) {
    format = 'markdown';
  }

  return runExportReceipt({
    ...(bundlePath !== undefined ? { bundlePath } : {}),
    ...(envelopePath !== undefined ? { envelopePath } : {}),
    ...(outputPath !== undefined ? { outputPath } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
    format,
  });
}

const EXPORT_FAR_PROOF_SCHEMA: readonly OptionSchema[] = [
  { name: '--demo-chain', type: 'boolean', description: '构造 C-ASTRO-0001 offline demo chain 后导出' },
  { name: '--json', type: 'boolean', description: '输出 JSON' },
  { name: '--package', type: 'boolean', description: '生成 verify.sh + integrity.json + .tar.zst 离线包' },
  { name: '--force', type: 'boolean', description: '覆盖非空输出目录' },
  { name: '--db', type: 'string', description: 'evidence_log DB 路径' },
  { name: '--out', type: 'string', description: '输出目录路径' },
  {
    name: '--run-id',
    type: 'string',
    description: 'run id',
    validate: (v) => v.length === 0 ? '需要一个非空参数' : null,
  },
  {
    name: '--model-snapshot',
    type: 'string',
    description: 'model snapshot',
    validate: (v) => v.length === 0 ? '需要一个非空参数' : null,
  },
  {
    name: '--git-commit',
    type: 'string',
    description: '40-hex SHA',
    validate: (v) => isGitSha(v) ? null : `须为 40-hex SHA（实际: ${v}）`,
  },
  {
    name: '--env-hash',
    type: 'string',
    description: '64-hex 环境指纹',
    validate: (v) => isHex64(v) ? null : `须为 64-hex（实际: ${v}）`,
  },
  { name: '--archive', type: 'string', description: '.tar.zst 输出路径' },
  {
    name: '--exported-at',
    type: 'string',
    aliases: ['--generated-at'],
    description: 'ISO UTC 时间戳',
    validate: (v) => isIsoTimestamp(v) ? null : `须为 ISO UTC 时间戳（实际: ${v}）`,
  },
];

function runExportFarProofFromArgs(args: readonly string[]): number {
  const result = parseOptions(args, EXPORT_FAR_PROOF_SCHEMA, 'far export far-proof');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const demoChain = result.values['--demo-chain'] === true;
  const dbPath = result.values['--db'] as string | undefined;
  const runId = result.values['--run-id'] as string | undefined;
  const modelSnapshot = result.values['--model-snapshot'] as string | undefined;
  const gitCommitSha = result.values['--git-commit'] as string | undefined;
  const envHash = result.values['--env-hash'] as string | undefined;
  const archivePath = result.values['--archive'] as string | undefined;
  const exportedAt = result.values['--exported-at'] as string | undefined;
  const packageBundle = result.values['--package'] === true || archivePath !== undefined;

  // --demo-chain 自包含 demo 源：未显式 --out 时默认 ./.far-proof/（gitignore 已忽略·禁提交；重跑需 --force）。
  // --db 严肃路径仍须显式 --out（不默认）。既有目录非空时下方 --force 校验 fail-closed 兜底。
  let outputDir = result.values['--out'] as string | undefined;
  if (outputDir === undefined && demoChain) {
    outputDir = '.far-proof';
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
    force: result.values['--force'] === true,
    json: result.values['--json'] === true,
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
  far version                        版本号 + git HEAD
  far doctor [--live-qwen-smoke]     环境自诊断（默认零网络零密钥；DASHSCOPE_API_KEY 缺失只 WARN 不 FAIL）
                                     --live-qwen-smoke 显式才调真实 API（复用 ci/competition_qwen_smoke.ts·NEEDS_API_VALIDATION）
  far demo [tess-offline]            一键演示（14 Golden Vectors + 端到端 demo claim·offline 无需凭据）
                                     tess-offline = 聚焦 TESS（C-ASTRO-0001 脉冲星）offline 裁决

  far status [--db <path>] [--json]    生成单一 SSOT 状态报告（FI-10 · 01§5）
    --db <path>   验证 evidence_log DB 链头（verifyChainHead），不提供则 pending
    --json        机器可读输出（CI 文档构建回填 <X_FROM_STATUS_DUMP> 占位符用）

  far api [--port <n>] [--db <path>|--persist <path>] [--no-seed] [--protected]
          启动 REST API server（Fastify·前端默认连 localhost:3000）
    --port <n>      监听端口（默认 3000·前端 api_client.ts 对齐；可由 PORT 环境变量覆盖）
    --db <path>     DB 路径（默认 :memory: 临时·每次启动新鲜）
    --persist <p>   持久化到文件（如 ./far-chain.db·跨重启保留数据）
    --no-seed       不种子 demo 裁决（默认种子 C-ASTRO-0001 UNTESTED·legacy 路径不注入统计→R6 不触发；供前端展示）
    --protected     启用 JWT 鉴权（需 FAR_JWT_SECRET 环境变量；默认 offline 匿名 demo）
    示例：pnpm api   # 后端 localhost:3000，另起 cd frontend && npm run dev 即全栈

  far verify [--bundle <path> | --envelope <path> --db <path>] [--mode chain|envelope|full]
             [--json] [--explain]      第三方独立重算验证（FI-9 · 04§5）
    --bundle <path>    .far-proof V1 minimal 离线包目录（full 模式验必需文件 + redacted chain + V1 proofHash）
    <位置参数>         等价 --bundle（如 far verify examples/tess-offline/output/demo.far-proof）
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
    --all               跑 golden_vectors/cases/GV-01..GV-14.json（默认）
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

  far ask "<question>" [--mode full|quick] [--json] [--export <dir>]
                                    一次性跑完整 6-stage FSM（runAgentLoop），产出 verdict + 证据链
    --mode full|quick             full=最多 3 轮迭代（默认）/ quick=单轮即止
    --export <dir>                导出 V1 .far-proof self-verifiable bundle 到 <dir>
    --json                        机器可读输出
    默认 offline_replay（零密钥·fixture 回放）；真实推理需 --profile competition_aliyun_qwen + 凭据（环境变量名见 far ask）
    红线：裁决由 R0-R9 确定性内核给出（LLM 非裁决者）。
    退出码：0 正常终止 / 1 循环错误 / 2 参数错误

  far stream "<question>" [--mode] [--json]   同 ask 但实时流式打印每阶段（onArtifact 回调·真流非回放）
  far repl                                  交互式 REPL（提问 / :fork <后缀> / :history / :quit）
  far replay --db <path> | --bundle <dir>   重放证据链（时光机·hash 链 verify）
  far court "<claim>" [--models a,b,c]      跨模型可靠性法庭（颁发 ReliabilityCertificate）
  far arena "<hypothesis>" [--refuters]     对抗科学竞技场（refuter 攻击 + deterministic arbiter 记分板）
  far init <domain> [--out <dir>] [--force] DomainPack 脚手架（config + claim/fec 模板）

  spec §9.2 全部命令已实装。V2/V3 演进（非 CLI 命令缺口）：
  · 真实多模型 provider（court/arena 的 --models 接真实 LLM·需凭据门）
  · 形式化验证器（Lean / Dafny / Rust · L14）
  · 真实 OS 级 sandbox 隔离（07 §188）
  `;

main().catch((error: unknown) => {
  process.stderr.write(`far: 运行失败 — ${errorMessage(error)}\n`);
  process.exit(1);
});
