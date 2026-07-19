#!/usr/bin/env node
// src/cli/far.ts
// 职责：FAR-Chain CLI 入口（FI-1 · far 命令家族）。
// CLI 命令集 + far status + far verify。
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
import { runAuditSeedCherry } from './commands/audit_seed_cherry.ts';
import { runAuditMultiseed } from './commands/audit_multiseed.ts';
import { runCAstro } from './commands/c_astro.ts';
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

  // Per-command help: `far <cmd> --help` / `-h` prints that command's usage section.
  if (argv.slice(1).some((a) => a === '-h' || a === '--help')) {
    process.stdout.write(commandHelp(command) + '\n');
    process.exit(0);
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

  if (command === 'audit-seed-cherry') {
    const exitCode = await runAuditSeedCherryFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'audit-multiseed') {
    const exitCode = await runAuditMultiseedFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  if (command === 'c-astro') {
    const exitCode = await runCAstroFromArgs(argv.slice(1));
    process.exit(exitCode);
  }

  process.stderr.write(`far: unknown command '${command}'\n\n${HELP_TEXT}`);
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
    `far fec: expected 'compile' or 'freeze' (got: ${subcommand ?? '<missing>'})\n`,
  );
  return 2;
}

const FEC_COMPILE_SCHEMA: readonly OptionSchema[] = [
  { name: '--claim', type: 'string', required: true, description: 'path to FecContractV2 JSON', requiredPlaceholder: 'path' },
  { name: '--out', type: 'string', required: true, description: 'output JSON path', requiredPlaceholder: 'path' },
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
  { name: '--fec', type: 'string', required: true, description: 'path to the JSON produced by `far fec compile`', requiredPlaceholder: 'path' },
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
    process.stderr.write(`far fsm: only 'advance' is supported (got: ${subcommand ?? '<missing>'})\n`);
    return 2;
  }
  return runFsmAdvanceFromArgs(args.slice(1));
}

const FSM_ADVANCE_SCHEMA: readonly OptionSchema[] = [
  { name: '--event', type: 'string', required: true, description: 'CliEvent name', requiredPlaceholder: 'name' },
  { name: '--input', type: 'string', required: true, description: 'path to stageOutput JSON', requiredPlaceholder: 'path' },
  { name: '--state-file', type: 'string', default: './.far/fsm_state.json', description: 'path to state file' },
  { name: '--json', type: 'boolean', description: 'machine-readable output (StageReceipt JSON)' },
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
  { name: '--json', type: 'boolean', description: 'emit a machine-readable summary' },
  { name: '--all', type: 'boolean', description: 'run golden_vectors/cases/GV-01..GV-14.json (default)' },
  { name: '--case', type: 'string', description: 'run a single case (e.g. GV-01)' },
  { name: '--case-dir', type: 'string', description: 'case directory path' },
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
    process.stderr.write('far verify-golden: --all and --case are mutually exclusive\n');
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
  { name: '--json', type: 'boolean', description: 'machine-readable output' },
  { name: '--db', type: 'string', description: 'path to evidence_log DB' },
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
  { name: '--json', type: 'boolean', description: 'machine-readable 10-field schema output' },
  { name: '--explain', type: 'boolean', description: 'human-readable mode: expand the 10-rule check table' },
  { name: '--bundle', type: 'string', positional: true, description: 'path to a .far-proof V1 minimal offline bundle directory' },
  { name: '--lint-input', type: 'string', description: 'path to AntiTheaterLintInput JSON' },
  { name: '--envelope', type: 'string', description: 'path to ProofEnvelopeV2 JSON' },
  { name: '--db', type: 'string', description: 'path to evidence_log DB' },
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
    process.stderr.write(`far bench: only 'run' is supported (got: ${subcommand ?? '<missing>'})\n`);
    return 2;
  }
  return runBenchRunFromArgs(args.slice(1));
}

const BENCH_RUN_SCHEMA: readonly OptionSchema[] = [
  { name: '--json', type: 'boolean', description: 'write the full BenchmarkReport JSON to stdout' },
  { name: '--out', type: 'string', description: 'output JSON path' },
  {
    name: '--generated-at',
    type: 'string',
    description: 'ISO timestamp',
    validate: (v) => isIsoTimestamp(v) ? null : `must be an ISO UTC timestamp (got: ${v})`,
  },
  {
    name: '--git-commit',
    type: 'string',
    description: 'commit sha or null',
    validate: (v) => v.length === 0 ? `must not be empty (got: ${v})` : null,
  },
  {
    name: '--domain',
    type: 'string',
    description: 'domain name',
    validate: (v) => v.length === 0 ? 'requires a non-empty domain name' : null,
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
  process.stderr.write(`far export: expected 'receipt' or 'far-proof' (got: ${subcommand ?? '<missing>'})\n`);
  return 2;
}

const EXPORT_RECEIPT_SCHEMA: readonly OptionSchema[] = [
  { name: '--json', type: 'boolean', description: 'shorthand for --format json' },
  { name: '--markdown', type: 'boolean', description: 'shorthand for --format markdown' },
  {
    name: '--format',
    type: 'string',
    description: 'json|markdown',
    validate: (v) => ['json', 'markdown', 'md'].includes(v) ? null : `must be json|markdown (got: ${v})`,
  },
  { name: '--bundle', type: 'string', description: 'path to .far-proof directory' },
  { name: '--envelope', type: 'string', description: 'path to ProofEnvelopeV2 JSON' },
  { name: '--out', type: 'string', description: 'output path' },
  { name: '--generated-at', type: 'string', description: 'ISO timestamp' },
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
  { name: '--demo-chain', type: 'boolean', description: 'build the C-ASTRO-0001 offline demo chain, then export' },
  { name: '--json', type: 'boolean', description: 'emit JSON' },
  { name: '--package', type: 'boolean', description: 'produce verify.sh + integrity.json + a .tar.zst offline package' },
  { name: '--force', type: 'boolean', description: 'overwrite a non-empty output directory' },
  { name: '--db', type: 'string', description: 'path to evidence_log DB' },
  { name: '--out', type: 'string', description: 'output directory path' },
  {
    name: '--run-id',
    type: 'string',
    description: 'run id',
    validate: (v) => v.length === 0 ? 'requires a non-empty value' : null,
  },
  {
    name: '--model-snapshot',
    type: 'string',
    description: 'model snapshot',
    validate: (v) => v.length === 0 ? 'requires a non-empty value' : null,
  },
  {
    name: '--git-commit',
    type: 'string',
    description: '40-hex SHA',
    validate: (v) => isGitSha(v) ? null : `must be a 40-hex SHA (got: ${v})`,
  },
  {
    name: '--env-hash',
    type: 'string',
    description: '64-hex environment fingerprint',
    validate: (v) => isHex64(v) ? null : `must be 64-hex (got: ${v})`,
  },
  { name: '--archive', type: 'string', description: '.tar.zst output path' },
  {
    name: '--exported-at',
    type: 'string',
    aliases: ['--generated-at'],
    description: 'ISO UTC timestamp',
    validate: (v) => isIsoTimestamp(v) ? null : `must be an ISO UTC timestamp (got: ${v})`,
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
    process.stderr.write('far export far-proof: --out <dir> is required\n');
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
    return { ok: false, error: 'provide exactly one of --demo-chain or --db <path>' };
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
      error: 'when using --db, you must also provide --run-id, --model-snapshot, --git-commit and --env-hash',
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

const AUDIT_SEED_CHERRY_SCHEMA: readonly OptionSchema[] = [
  { name: '--lightcurve', type: 'string', description: 'lightcurve fixture path (default tests/fixtures/science_harness/tic_sample.cache)', requiredPlaceholder: 'path' },
  { name: '--python', type: 'string', description: 'python command (default auto-discover python3/python)', requiredPlaceholder: 'cmd' },
  { name: '--json', type: 'boolean', description: 'machine-readable output' },
];

async function runAuditSeedCherryFromArgs(args: readonly string[]): Promise<number> {
  const result = parseOptions(args, AUDIT_SEED_CHERRY_SCHEMA, 'far audit-seed-cherry');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const lightcurvePath = result.values['--lightcurve'] as string | undefined;
  const pythonCmd = result.values['--python'] as string | undefined;
  const json = result.values['--json'] === true;
  return runAuditSeedCherry({
    ...(lightcurvePath !== undefined ? { lightcurvePath } : {}),
    ...(pythonCmd !== undefined ? { pythonCmd } : {}),
    json,
  });
}

const AUDIT_MULTISEED_SCHEMA: readonly OptionSchema[] = [
  { name: '--lightcurve', type: 'string', description: 'lightcurve fixture path (default tests/fixtures/science_harness/tic_sample.cache)', requiredPlaceholder: 'path' },
  { name: '--python', type: 'string', description: 'python command (default auto-discover python3/python)', requiredPlaceholder: 'cmd' },
  { name: '--json', type: 'boolean', description: 'machine-readable output' },
];

async function runAuditMultiseedFromArgs(args: readonly string[]): Promise<number> {
  const result = parseOptions(args, AUDIT_MULTISEED_SCHEMA, 'far audit-multiseed');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const lightcurvePath = result.values['--lightcurve'] as string | undefined;
  const pythonCmd = result.values['--python'] as string | undefined;
  const json = result.values['--json'] === true;
  return runAuditMultiseed({
    ...(lightcurvePath !== undefined ? { lightcurvePath } : {}),
    ...(pythonCmd !== undefined ? { pythonCmd } : {}),
    json,
  });
}

const CASTRO_SCHEMA: readonly OptionSchema[] = [
  { name: '--tic', type: 'string', description: 'TESS Input Catalog ID (default 268644982)', requiredPlaceholder: 'id' },
  { name: '--sector', type: 'string', description: 'TESS sector (default 14)', requiredPlaceholder: 'n' },
  { name: '--lightcurve', type: 'string', description: 'cached lightcurve fixture path (fallback when online unavailable)', requiredPlaceholder: 'path' },
  { name: '--python', type: 'string', description: 'python command (default auto-discover python3/python)', requiredPlaceholder: 'cmd' },
  { name: '--json', type: 'boolean', description: 'machine-readable output' },
];

async function runCAstroFromArgs(args: readonly string[]): Promise<number> {
  const result = parseOptions(args, CASTRO_SCHEMA, 'far c-astro');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const ticId = result.values['--tic'] as string | undefined;
  const sectorStr = result.values['--sector'] as string | undefined;
  const lightcurvePath = result.values['--lightcurve'] as string | undefined;
  const pythonCmd = result.values['--python'] as string | undefined;
  const json = result.values['--json'] === true;
  let sector: number | undefined;
  if (sectorStr !== undefined) {
    const parsed = Number(sectorStr);
    if (!Number.isFinite(parsed)) {
      process.stderr.write(`far c-astro: --sector must be a number (got: ${sectorStr})\n`);
      return 2;
    }
    sector = parsed;
  }
  return runCAstro({
    ...(ticId !== undefined ? { ticId } : {}),
    ...(sector !== undefined ? { sector } : {}),
    ...(lightcurvePath !== undefined ? { lightcurvePath } : {}),
    ...(pythonCmd !== undefined ? { pythonCmd } : {}),
    json,
  });
}

function commandHelp(command: string): string {
  const lines = HELP_TEXT.split('\n');
  const startIdx = lines.findIndex((l) => new RegExp('^  far ' + command + '\\b').test(l));
  if (startIdx === -1) return HELP_TEXT;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^ {2}far \S/.test(lines[i] ?? '')) {
      endIdx = i;
      break;
    }
  }
  return 'FAR-Chain CLI — ' + command + '\n\n' + lines.slice(startIdx, endIdx).join('\n').trimEnd();
}

const HELP_TEXT = `FAR-Chain CLI — claim-level verification for AI4S scientific claims

USAGE:
  far version                        print version + git HEAD
  far doctor [--live-qwen-smoke]     environment self-check (no network, no keys by default;
                                     a missing DASHSCOPE_API_KEY only WARNs, never FAILs)
                                     --live-qwen-smoke   call the real API (needs a valid key)
  far demo [tess-offline]            one-shot demo (14 Golden Vectors + end-to-end demo claim;
                                     fully offline, no credentials needed)
                                     tess-offline        focus on the TESS (C-ASTRO-0001 pulsar) offline verdict

  far audit-seed-cherry [--lightcurve <path>] [--python <cmd>] [--json]
                         FUSION-OS-1 detector-validation showcase: replay a cherry-pick fixture through the
                         real anti-theater -> verdict path (NOT a production verdict-path wiring; needs P1-6 for that)

  far audit-multiseed [--lightcurve <path>] [--python <cmd>] [--json]
                        FUSION-OS-1 real multi-seed audit: run seed-dependent BLS across pre-registered
                        seeds (noise-injected, distinct per seed); detect_seed_cherry fires on the REAL
                        computed registry when the researcher hides non-detection seeds. Status RED (local).
    --lightcurve <path>  lightcurve fixture (default tests/fixtures/science_harness/tic_sample.cache)
    --python <cmd>       python command (default auto-discover python3/python; BLS needs numpy)
    --json               machine-readable output
    needs python+numpy; exits 1 if missing. exit codes: 0 cherry-pick DETECTED / 7 MISSED (regression) / 2 bad args

  far c-astro [--tic <id>] [--sector <n>] [--lightcurve <path>] [--python <cmd>] [--json]
                        C-ASTRO-0001 online TESS dataset_resolver production wiring (P1-6):
                        fetchOnlineDataset (lightkurve+MAST, host-whitelisted) -> resolveDataset ->
                        buildCAstroChain. online resolved -> datasetSource=online (real R7); any failure ->
                        fail-safe cached_fixture (baseline_exempt, DEGRADED_SCOPE). Status RED (single-seed demo).
    --tic <id>           TESS Input Catalog ID (default 268644982)
    --sector <n>         TESS sector (default 14)
    --lightcurve <path>  cached fixture fallback (default tests/fixtures/science_harness/tic_sample.cache)
    --python <cmd>       python command (default auto-discover; BLS needs numpy)
    --json               machine-readable output
    needs python+numpy; exits 1 if missing. exit 0 on pipeline run; 2 bad args

  far status [--db <path>] [--json]  emit the single SSOT status report
    --db <path>   verify the evidence_log DB chain head (verifyChainHead); omitted => pending
    --json        machine-readable output (used by CI to backfill <X_FROM_STATUS_DUMP> placeholders)

  far api [--port <n>] [--db <path>|--persist <path>] [--no-seed] [--protected]
          start the REST API server (Fastify; the frontend defaults to localhost:3000)
    --port <n>      listen port (default 3000, aligned with frontend api_client.ts; overridable via PORT)
    --db <path>     DB path (default :memory: ephemeral, fresh each start)
    --persist <p>   persist to a file (e.g. ./far-chain.db; survives restarts)
    --no-seed       do not seed the demo verdict (default seeds C-ASTRO-0001 UNTESTED; the legacy seed
                    injects no statistics so rule R6 does not fire; meant for frontend display)
    --protected     enable JWT auth (needs FAR_JWT_SECRET; default offline anonymous demo)
    example: pnpm api   # backend on localhost:3000; run "cd frontend && npm run dev" for the full stack

  far verify [--bundle <path> | --envelope <path> --db <path>] [--mode chain|envelope|full]
             [--json] [--explain]      third-party independent re-computation verification
    --bundle <path>      .far-proof V1 minimal offline bundle directory (full mode verifies required
                         files + redacted chain + V1 proofHash)
    <positional>        equivalent to --bundle (e.g. far verify examples/tess-offline/output/demo.far-proof)
    --envelope <path>   ProofEnvelopeV2 JSON file (required for envelope/full mode)
    --db <path>         evidence_log DB (required for chain/full mode; verifyChainHead)
    --mode <m>          chain|envelope|full (inferred from --envelope/--db by default)
    --json              machine-readable 10-field schema output
    --explain           human-readable mode: expand the 10-rule check table
    --lint-input <path> AntiTheaterLintInput JSON (requires --envelope; independently recomputes the
                        20 detectors and compares them in depth with the embedded report;
                        any divergence => status FAIL, exit 7)
    exit codes: 0 PASS / 7 FAIL / 2 bad args / 1 runtime error

  far verify-golden [--all | --case GV-01] [--backend node|python|browser] [--json]
                         recompute the verdict golden vectors
    --all               run golden_vectors/cases/GV-01..GV-14.json (default)
    --case <id>         run a single case (e.g. GV-01)
    --case-dir <path>   specify a case directory (for tests / offline-bundle review)
    --backend node      run the Node/V2 kernel axis; really calls decideFiveValueVerdict
    --backend python    run the Python mirror axis; reads the same case JSON and recomputes independently
    --backend browser   run the offline browser verifier axis; reads the inline script in
                        frontend/public/verify_golden.html
    --json              emit a machine-readable summary
    exit codes: 0 PASS / 7 FAIL / 2 bad args / 1 runtime error

  far export receipt (--envelope <path> | --bundle <path>) [--format json|markdown] [--out <path>]
                         Trust Receipt DOC projection (does not enter proofHash)
    --envelope <path>    ProofEnvelopeV2 JSON file
    --bundle <path>      .far-proof V1 minimal offline bundle directory
    --format <fmt>       json|markdown (default json; --json / --markdown are shorthand)
    --out <path>         write to a file; omit to print to stdout
    exit codes: 0 success / 7 input validation failed / 2 bad args / 1 runtime error

  far export far-proof (--demo-chain | --db <path>) --out <dir> [--package] [--archive <path>]
                       [--json] [--force] [--exported-at <iso>]
                         .far-proof V1 self-verifiable evidence bundle
    --demo-chain         build the C-ASTRO-0001 offline demo chain, then export
    --db <path>          export from an existing evidence_log DB (requires the four metadata options below)
    --run-id <id>        run id written on DB export
    --model-snapshot <s> model snapshot written on DB export
    --git-commit <sha>   40-hex git commit SHA written on DB export
    --env-hash <hex>     64-hex environment fingerprint written on DB export
    --package            produce verify.sh + integrity.json + a .tar.zst offline package
    --archive <path>     specify the .tar.zst path (implies --package)
    --force              overwrite a non-empty output directory
    exit codes: 0 success / 7 chain verification failed / 2 bad args / 1 runtime error

  far bench run [--domain <name>] [--generated-at <iso>] [--git-commit <sha|null>]
                [--json] [--out <path>] FAR-Bench demo profile
    --domain <name>      run only the given demo domain (e.g. astronomy); omit to run all demo seeds
    --generated-at <iso> pin the report generatedAt (for golden/fresh-clone reproduction)
    --git-commit <sha>   git commit sha written into the report; null/none means unanchored
    --json               write the full BenchmarkReport JSON to stdout
    --out <path>         write the full BenchmarkReport JSON to a file
    exit codes: 0 success / 2 bad args / 1 runtime error

  far fec compile --claim <path> --out <path>   FEC V2 compile + fecHash recompute
    --claim <path>      path to FecContractV2 JSON (input)
    --out <path>        output JSON path (contains {plan, fecHash, fec})
    runs compileFec (10 compilation checks); computeFecHash = sha256(canonical JSON of VC fields).
    exit codes: 0 compiled / 7 compile failed (HARD_FAIL) / 2 bad args / 1 runtime error

  far fec freeze --fec <path>                   FEC V2 freeze: recompute hash and cross-check
    --fec <path>        path to the JSON produced by "far fec compile"
    computeFecHash is recomputed and strictly compared with the stored fecHash (no hand-filled values).
    exit codes: 0 hash matches / 7 hash mismatch (tamper detected) / 2 bad args / 1 runtime error

  far fsm advance --event <name> --input <path> [--state-file <path>] [--json]
                                    advance the 9-state CLI protocol FSM and append a stageReceipt hash link
    --event <name>      CliEvent name (ADVANCE_CLAIM_CANDIDATE / ADVANCE_FEC_PROPOSE /
                        ADVANCE_FEC_COMPILE / ADVANCE_EVIDENCE_GATHER / ADVANCE_STATISTICS /
                        ADVANCE_VERDICT / ADVANCE_PROOF_SEAL / ADVANCE_AUDITABLE / ADVANCE_VERIFIED)
    --input <path>      path to the stageOutput JSON file
    --state-file <path> state file path (default ./.far/fsm_state.json; initialized to INITIAL + GENESIS_RECEIPT if absent)
    --json              machine-readable output (StageReceipt JSON)
    transition (state_machine) + computeStageReceipt (sha256(prevReceipt + hashCanonicalJson)).
    an illegal transition is never silently overwritten: returns PROTOCOL_DEVIATION_CRITICAL, exit 7 (fail-closed).
    exit codes: 0 advanced / 7 protocol deviation / 2 bad args / 1 runtime error

  far ask "<question>" [--mode full|quick] [--json] [--export <dir>]
                                    run the full 6-stage FSM once (runAgentLoop); emits a verdict + evidence chain
    --mode full|quick             full = up to 3 iterations (default) / quick = single pass
    --export <dir>                export a V1 .far-proof self-verifiable bundle to <dir>
    --json                        machine-readable output
    defaults to offline_replay (no keys, fixture replay); real inference needs --profile competition_aliyun_qwen + credentials
    red line: the verdict is produced by the deterministic R0-R9 kernel (the LLM is never the adjudicator).
    exit codes: 0 normal termination / 1 loop error / 2 bad args

  far stream "<question>" [--mode] [--json]   like ask, but streams each stage live (onArtifact callback; real streaming, not replay)
  far repl                                  interactive REPL (ask / :fork <suffix> / :history / :quit)
  far replay --db <path> | --bundle <dir>   replay the evidence chain (time machine; hash-chain verify)
  far court "<claim>" [--models a,b,c]      cross-model reliability court (issues a ReliabilityCertificate)
  far arena "<hypothesis>" [--refuters]     adversarial science arena (refuter attacks + deterministic arbiter scoreboard)
  far init <domain> [--out <dir>] [--force] scaffold a DomainPack (config + claim/fec templates)

  All listed commands are implemented. Items below are future work (not missing CLI commands):
  - real multi-model providers (court/arena --models against real LLMs; needs a credential gate)
  - formal verifiers (Lean / Dafny / Rust)
  - real OS-level sandbox isolation
  `;

main().catch((error: unknown) => {
  const msg = errorMessage(error);
  // Thrown errors already self-identify as 'far <cmd>: …'; avoid the redundant 'far: failed —' double-prefix.
  process.stderr.write(`${msg.startsWith('far ') ? msg : `far: ${msg}`}\n`);
  process.exit(1);
});
