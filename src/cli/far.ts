#!/usr/bin/env node
// src/cli/far.ts
// 职责：FAR-Lab CLI 入口（FI-1 · far 命令家族）。
// CLI 命令集 + far status + far verify。
//
// 分发为表驱动：命令注册表 + 分发器在 src/cli/registry.ts；本文件只做两件事——
// 1) 提供命令实现（COMMANDS 数组，每个描述符保留原 parseOptions + OptionSchema 解析，
//    重型/低频命令保持 lazy import，避免冷启动加载无关模块）；
// 2) 入口 main() 委托 registry.runCli 完成 查表 → -h/--help → run 的分发。
//
// 已实装子命令：`far status`（01 §5）+ `far verify`（04 §5 · FI-9 第三方独立重算）
// + `far export receipt`（04 §9 Trust Receipt DOC 投影）+ `far export receipt-v2` + `far export far-proof` + `far bench run`
// + `far verify-golden`（14 GV）+ `far fec compile|freeze` + `far fsm advance`（P2-2）
// + `far demo`（一键演示）+ `far api`（REST server）+ `far ask`（6-stage FSM）。
// Node 24 原生 type stripping 跑 .ts（package.json engines node>=24；
// tsconfig noEmit，不构建 dist；bin 直接指向本文件）。

import { runBenchRun } from './commands/bench.ts';
import { runExportFarProof, type ExportFarProofSource } from './commands/export_far_proof.ts';
import { runExportReceipt, type ReceiptFormat } from './commands/export_receipt.ts';
import { runFecCompile, runFecFreeze } from './commands/fec.ts';
import { runFsmAdvance } from './commands/fsm.ts';
import { runPlanningFromArgs } from './commands/planning.ts';
import { runStatus } from './commands/status.ts';
import { runVerify, VALID_MODES, type VerifyMode } from './commands/verify.ts';
import { runVerifyGolden, type VerifyGoldenBackend } from './commands/verify_golden.ts';
import { runApi } from './commands/api.ts';
import { runAsk } from './commands/ask.ts';
import { runDemo } from './commands/demo.ts';
import { runAuditSeedCherry } from './commands/audit_seed_cherry.ts';
import { runAuditMultiseed } from './commands/audit_multiseed.ts';
import { runCAstro } from './commands/c_astro.ts';
import { runCAstroLoop } from './commands/c_astro_loop.ts';
import { runGround } from './commands/ground.ts';
import { runCheckResource } from './commands/check_resource.ts';
import {
  runResearchInspect,
  runResearchStart,
  runResearchStatus,
  runResearchResume,
  runResearchFeedback,
  runResearchVerify,
  runResearchExport,
  runResearchCompare,
  runResearchAnalyze,
  runResearchEvaluate,
  runResearchBaseline,
} from './commands/research.ts';
import { runStream } from './commands/stream.ts';
import { runRepl } from './commands/repl.ts';
import { runReplay } from './commands/replay.ts';
import { runCourt } from './commands/court.ts';
import { runArena } from './commands/arena.ts';
import { runInit } from './commands/init.ts';
import { runDoctor } from './commands/doctor.ts';
import { runHardware } from './commands/hardware.ts';
import { runVersion } from './commands/version.ts';
import { runScheduleFromArgs } from './commands/schedule.ts';
import { runKeygen, runSign, runVerifySig } from './commands/sign.ts';
import { parseOptions, reportErrors, type OptionSchema } from './parse_options.ts';
import { runCli, type CliCommand } from './registry.ts';

// ---------------------------------------------------------------------------
// 命令注册表（声明式）：每个描述符 = name / aliases / description / run。
// run 收到 argv.slice(1)（已去掉命令名）；返回 number 作为退出码。
// 重型/低频命令（demo v2 / verify --v2 / export receipt-v2 / lifecycle /
// backup / real-paper）在 run 内 lazy import，保持 CLI 冷启动轻量。
// ---------------------------------------------------------------------------

const COMMANDS: readonly CliCommand[] = [
  {
    name: 'version',
    aliases: ['--version', '-v'],
    description: 'print version + git HEAD',
    run: () => runVersion(),
  },
  {
    name: 'doctor',
    description: 'environment self-check (no network, no keys by default)',
    run: async (args) => {
      const liveQwenSmoke = args.includes('--live-qwen-smoke');
      const fullVerify = args.includes('--full-verify');
      const dbIdx = args.indexOf('--db');
      const dbPath = dbIdx !== -1 ? args[dbIdx + 1] : undefined;
      return runDoctor({
        liveQwenSmoke,
        fullVerify,
        ...(dbPath !== undefined ? { dbPath } : {}),
      });
    },
  },
  {
    name: 'hardware',
    description: 'best-effort runtime compute-backend probe',
    run: async (args) => runHardware({ json: args.includes('--json') }),
  },
  {
    name: 'status',
    description: 'emit the single SSOT status report',
    run: (args) => runStatusFromArgs(args),
  },
  {
    name: 'api',
    description: 'start the REST API server (Fastify; frontend defaults to localhost:3000)',
    run: async (args) => {
      // server 监听中保持进程存活（startServer 注册了 SIGINT/SIGTERM 优雅关停）。
      // 返回 undefined → runCli 不再调用 process.exit。
      await runApi(args);
    },
  },
  {
    name: 'demo',
    description: 'one-shot demo (14 Golden Vectors + end-to-end demo claim; fully offline)',
    run: async (args) => {
      // `far demo v2` shows the V2 receipt verification path (six assurance dimensions).
      if (args[0] === 'v2' || args[0] === '--v2') {
        const { runV2ReceiptVerification, formatV2VerificationForDisplay, V2_DEMO_SAMPLE } =
          await import('../v2_domain/receipt_verify_v2.ts');
        const result = runV2ReceiptVerification(V2_DEMO_SAMPLE);
        process.stdout.write(formatV2VerificationForDisplay(result) + '\n');
        return 0;
      }
      return runDemo(args[0]);
    },
  },
  {
    name: 'ask',
    description: 'run the full 6-stage FSM once (runAgentLoop); emits a verdict + evidence chain',
    run: async (args) => runAsk(args),
  },
  {
    name: 'stream',
    description: 'like ask, but streams each stage live (real streaming, not replay)',
    run: async (args) => runStream(args),
  },
  {
    name: 'repl',
    description: 'interactive REPL (ask / :fork <suffix> / :history / :quit)',
    run: async () => runRepl(),
  },
  {
    name: 'replay',
    description: 'replay the evidence chain (time machine; hash-chain verify)',
    run: (args) => runReplay(args),
  },
  {
    name: 'court',
    description: 'cross-model reliability court (issues a ReliabilityCertificate)',
    run: async (args) => runCourt(args),
  },
  {
    name: 'arena',
    description: 'adversarial science arena (refuter attacks + deterministic arbiter scoreboard)',
    run: async (args) => runArena(args),
  },
  {
    name: 'init',
    description: 'scaffold a DomainPack (config + claim/fec templates)',
    run: (args) => runInit(args),
  },
  {
    name: 'keygen',
    description: 'generate an Ed25519 key pair (signer key lifecycle)',
    run: (args) => runKeygen(args),
  },
  {
    name: 'sign',
    description: 'sign a file/directory with an Ed25519 private key (deterministic manifest)',
    run: (args) => runSign(args),
  },
  {
    name: 'verify-sig',
    description: 'verify an Ed25519 file-manifest signature (independent recompute + hash check)',
    run: (args) => runVerifySig(args),
  },
  {
    name: 'verify',
    description: 'third-party independent re-computation verification',
    run: async (args) => {
      // `far verify --v2` routes to the V2 six-dimension verification path.
      if (args.includes('--v2')) {
        const envelopeIdx = args.indexOf('--envelope');
        const bundleIdx = args.indexOf('--bundle');
        const { runVerifyV2 } = await import('./commands/verify_v2.ts');
        const opts: { envelopePath?: string; bundlePath?: string; json: boolean } = {
          json: args.includes('--json'),
        };
        if (envelopeIdx !== -1) {
          const ep = args[envelopeIdx + 1];
          if (ep !== undefined) opts.envelopePath = ep;
        }
        if (bundleIdx !== -1) {
          const bp = args[bundleIdx + 1];
          if (bp !== undefined) opts.bundlePath = bp;
        }
        const result = await runVerifyV2(opts);
        process.stdout.write(result.output + '\n');
        return result.exitCode;
      }
      return runVerifyFromArgs(args);
    },
  },
  {
    name: 'verify-golden',
    description: 'recompute the verdict golden vectors',
    run: (args) => runVerifyGoldenFromArgs(args),
  },
  {
    name: 'bench',
    description: 'FAR-Bench demo profile',
    run: async (args) => runBenchFromArgs(args),
  },
  {
    name: 'export',
    description: 'Trust Receipt / .far-proof evidence bundle export',
    run: (args) => runExportFromArgs(args),
  },
  {
    name: 'fec',
    description: 'FEC V2 compile + fecHash recompute / freeze cross-check',
    run: (args) => runFecFromArgs(args),
  },
  {
    name: 'fsm',
    description: 'advance the 9-state CLI protocol FSM and append a stageReceipt hash link',
    run: (args) => runFsmFromArgs(args),
  },
  {
    name: 'planning',
    description: 'opencode planning methodology as deterministic gates (plan/spec/risk/state/gate/checkpoint)',
    run: (args) => runPlanningFromArgs(args),
  },
  {
    name: 'audit-seed-cherry',
    description: 'anti-theater detector-validation showcase (cherry-pick replay)',
    run: (args) => runAuditSeedCherryFromArgs(args),
  },
  {
    name: 'audit-multiseed',
    description: 'real multi-seed audit (seed-dependent BLS)',
    run: (args) => runAuditMultiseedFromArgs(args),
  },
  {
    name: 'c-astro',
    description: 'C-ASTRO-0001 online TESS dataset resolver wiring',
    run: (args) => runCAstroFromArgs(args),
  },
  {
    name: 'c-astro-loop',
    description: 'C-ASTRO closed-loop experiment iteration (赛道一·B: plan→BLS→verify→refine grid)',
    run: (args) => runCAstroLoopFromArgs(args),
  },
  {
    name: 'ground',
    description: 'ground a research question in real literature + counter-evidence (OpenAlex/arXiv/Crossref; --json, --source, --max-per-query)',
    run: async (args) => runGround(args),
  },
  {
    name: 'check-resource',
    description: 'verify a cited identifier exists at its authoritative source (doi:... | arxiv:... | url:...; --json)',
    run: async (args) => runCheckResource(args),
  },
  {
    name: 'research',
    description: 'Track-1A vertical slice: ground → generate 3-5 hypotheses → critique → score → plan (start|status|resume|inspect)',
    run: async (args) => {
      const subcommand = args[0];
      if (subcommand === 'inspect') {
        return runResearchInspect(args.slice(1));
      }
      if (subcommand === 'status') {
        return runResearchStatus(args.slice(1));
      }
      if (subcommand === 'resume') {
        return runResearchResume(args.slice(1));
      }
      if (subcommand === 'feedback') {
        return runResearchFeedback(args.slice(1));
      }
      if (subcommand === 'verify') {
        return runResearchVerify(args.slice(1));
      }
      if (subcommand === 'export') {
        return runResearchExport(args.slice(1));
      }
      if (subcommand === 'compare') {
        return runResearchCompare(args.slice(1));
      }
      if (subcommand === 'analyze') {
        return runResearchAnalyze(args.slice(1));
      }
      if (subcommand === 'evaluate') {
        return runResearchEvaluate(args.slice(1));
      }
      if (subcommand === 'baseline') {
        return runResearchBaseline(args.slice(1));
      }
      if (subcommand === 'start') {
        return runResearchStart(args.slice(1));
      }
      process.stderr.write(
        `far research: expected 'start', 'status', 'resume', 'inspect', 'verify', 'export', 'compare', 'analyze', 'evaluate', 'baseline', or 'feedback' (got: ${subcommand ?? '<missing>'})\n` +
          '  usage: far research start "<question>" [--source ...] [--profile offline_replay|competition_aliyun_qwen] [--target 3..5] [--json] [--out <file>]\n' +
          '         far research status <runId> [--json]\n' +
          '         far research resume <runId> [--profile ...] [--out <file>] [--json]\n' +
          '         far research inspect <run.json> [--json]\n' +
          '         far research verify <run.json|bundle-dir> [--json]\n' +
          '         far research export <run.json> --out <bundle-dir> [--json]\n' +
          '         far research compare <run.json> [--revision <a> <b>] [--json]\n' +
          '         far research analyze <run.json> [--live] [--out <new.json>] [--json]\n' +
          '         far research evaluate <run.json> [--json]\n' +
          '         far research baseline "<question>" [--profile ...] [--json]\n' +
          '         far research feedback <run.json> --file feedback.json [--out <new.json>] [--profile ...]\n',
      );
      return 2;
    },
  },
  {
    name: 'lifecycle',
    description: 'retraction/correction/supersession lifecycle (IC-05; tombstone append-only)',
    run: async (args) => {
      const { runLifecycle } = await import('./commands/lifecycle.ts');
      return runLifecycle(args);
    },
  },
  {
    name: 'backup',
    description: 'safe backup via VACUUM INTO (IC-03; full integrity_check first)',
    run: async (args) => {
      const { runBackup } = await import('./commands/backup.ts');
      return runBackup(args);
    },
  },
  {
    name: 'schedule',
    description: 'scheduled re-verification (re-verify claims over time; JSON-persisted)',
    run: (args) => runScheduleFromArgs(args),
  },
  {
    name: 'real-paper',
    description: 'run a real published paper through the FAR-Lab pipeline',
    run: async (args) => {
      // real-paper: 真实论文端到端验证（DEEP_AUDIT 缺失项）
      const { runRealPaperFromArgs } = await import('./commands/real_paper.ts');
      return runRealPaperFromArgs(args);
    },
  },
];

async function main(): Promise<void> {
  const exitCode = await runCli(
    { commands: COMMANDS, helpText: HELP_TEXT, commandHelp },
    process.argv.slice(2),
  );
  if (exitCode !== undefined) {
    // Natural exit (exitCode) instead of process.exit(): on Windows, an undici
    // fetch followed by a force-exit in the same tick races libuv handle teardown
    // (assertion !(handle->flags & UV_HANDLE_CLOSING), exit 0xC0000409). Letting
    // the event loop drain gives undici's keep-alive sockets time to close cleanly.
    process.exitCode = exitCode;
  }
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
  { name: '--dry-run', type: 'boolean', description: 'G2: print the transition diff without writing the state file' },
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
  const dryRun = result.values['--dry-run'] === true;

  const fsmResult = runFsmAdvance({ event, inputPath, stateFile, dryRun });
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
  { name: '--pubkey', type: 'string', description: 'expected Ed25519 public key PEM (bundle signature attribution; requires --bundle)' },
  {
    name: '--mode',
    type: 'enum',
    enumValues: [...VALID_MODES],
    description: 'chain|envelope|full',
  },
];

async function runVerifyFromArgs(args: readonly string[]): Promise<number> {
  const result = parseOptions(args, VERIFY_SCHEMA, 'far verify');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const bundlePath = result.values['--bundle'] as string | undefined;
  const envelopePath = result.values['--envelope'] as string | undefined;
  const dbPath = result.values['--db'] as string | undefined;
  const lintInputPath = result.values['--lint-input'] as string | undefined;
  const pubKeyPath = result.values['--pubkey'] as string | undefined;
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
    ...(pubKeyPath !== undefined ? { pubKeyPath } : {}),
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

function runExportFromArgs(args: readonly string[]): Promise<number> {
  const subcommand = args[0];
  if (subcommand === 'receipt') {
    return Promise.resolve(runExportReceiptFromArgs(args.slice(1)));
  }
  if (subcommand === 'receipt-v2') {
    return runExportReceiptV2FromArgs(args.slice(1));
  }
  if (subcommand === 'far-proof') {
    return Promise.resolve(runExportFarProofFromArgs(args.slice(1)));
  }
  process.stderr.write(`far export: expected 'receipt', 'receipt-v2', or 'far-proof' (got: ${subcommand ?? '<missing>'})\n`);
  return Promise.resolve(2);
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

const EXPORT_RECEIPT_V2_SCHEMA: readonly OptionSchema[] = [
  {
    name: '--format',
    type: 'string',
    description: 'json|markdown (default json)',
    validate: (v) => ['json', 'markdown'].includes(v) ? null : `must be json|markdown (got: ${v})`,
  },
  { name: '--envelope', type: 'string', required: true, description: 'path to ProofEnvelopeV2 JSON', requiredPlaceholder: 'path' },
  { name: '--out', type: 'string', description: 'output path' },
];

async function runExportReceiptV2FromArgs(args: readonly string[]): Promise<number> {
  const result = parseOptions(args, EXPORT_RECEIPT_V2_SCHEMA, 'far export receipt-v2');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const envelopePath = result.values['--envelope'] as string;
  const outputPath = result.values['--out'] as string | undefined;
  const formatValue = result.values['--format'] as string | undefined;
  const format = formatValue === 'markdown' ? 'markdown' : 'json';

  const { runExportReceiptV2 } = await import('./commands/export_receipt_v2.ts');
  const v2Result = await runExportReceiptV2({
    envelopePath,
    ...(outputPath !== undefined ? { outputPath } : {}),
    format,
  });
  process.stdout.write(v2Result.output + '\n');
  return v2Result.exitCode;
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

const CASTRO_LOOP_SCHEMA: readonly OptionSchema[] = [
  { name: '--lightcurve', type: 'string', description: 'lightcurve CSV path (default cached fixture)', requiredPlaceholder: 'path' },
  { name: '--rounds', type: 'string', description: 'number of closed-loop iterations (default 3)', requiredPlaceholder: 'n' },
  { name: '--python', type: 'string', description: 'python command (default auto-discover python3/python)', requiredPlaceholder: 'cmd' },
  { name: '--json', type: 'boolean', description: 'machine-readable output' },
];

async function runCAstroLoopFromArgs(args: readonly string[]): Promise<number> {
  const result = parseOptions(args, CASTRO_LOOP_SCHEMA, 'far c-astro-loop');
  if (reportErrors(result.errors)) {
    return 2;
  }
  const lightcurvePath = result.values['--lightcurve'] as string | undefined;
  const roundsStr = result.values['--rounds'] as string | undefined;
  const pythonCmd = result.values['--python'] as string | undefined;
  const json = result.values['--json'] === true;
  let rounds: number | undefined;
  if (roundsStr !== undefined) {
    const parsed = Number(roundsStr);
    if (!Number.isInteger(parsed) || parsed < 1) {
      process.stderr.write(`far c-astro-loop: --rounds must be an integer >= 1 (got: ${roundsStr})\n`);
      return 2;
    }
    rounds = parsed;
  }
  return runCAstroLoop({
    ...(lightcurvePath !== undefined ? { lightcurvePath } : {}),
    ...(rounds !== undefined ? { rounds } : {}),
    ...(pythonCmd !== undefined ? { pythonCmd } : {}),
    json,
  });
}

// Per-command help (`far <cmd> --help`): slices the detailed usage wall (DETAILED_HELP).
// 2026-08-14 UX regroup: the default no-arg help (HELP_TEXT) is a compact grouped
// overview; the full multi-line usage/options/exit-codes stay here per command.
// Consecutive blocks of the same command (e.g. `far research start` … `far research
// baseline`, `far export receipt` … `far export far-proof`) are returned together.
function commandHelp(command: string): string {
  const head = command.split(' ')[0] ?? command;
  const lines = DETAILED_HELP.split('\n');
  const startIdx = lines.findIndex((l) => new RegExp('^  far ' + head + '\\b').test(l));
  if (startIdx === -1) return HELP_TEXT;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const m = /^ {2}far ([A-Za-z][\w-]*)/.exec(lines[i] ?? '');
    if (m !== null && m[1] !== head) {
      endIdx = i;
      break;
    }
  }
  return 'FAR-Lab CLI — ' + command + '\n\n' + lines.slice(startIdx, endIdx).join('\n').trimEnd();
}

// DETAILED_HELP — the full per-command usage wall (usage + options + exit codes).
// Surfaced by `far <cmd> --help`; the default no-arg help is the compact HELP_TEXT below.
const DETAILED_HELP = `FAR-Lab CLI — claim-level verification for AI4S scientific claims

USAGE:
  far version                        print version + git HEAD
  far doctor [--live-qwen-smoke] [--full-verify] [--db <path>]
                                     environment self-check (no network, no keys by default;
                                     a missing DASHSCOPE_API_KEY only WARNs, never FAILs).
                                     Env checks print FIRST; the offline verify of the demo
                                     bundle (IC-03) prints as a compact VERIFY SUMMARY line.
                                     --live-qwen-smoke   call the real API (needs a valid key)
                                     --full-verify       also print the full far verify report
                                                         (default: summary only)
                                     --db <path>         full integrity_check + chain verify (fail-closed, IC-03)
  far hardware [--json]              best-effort runtime compute-backend probe
                                     (CPU / GPU / WebGPU / WASM; never affects verdict determinism)
  far demo [tess-offline]            one-shot demo (14 Golden Vectors + end-to-end demo claim;
                                     fully offline, no credentials needed)
                                     tess-offline        focus on the TESS (C-ASTRO-0001 pulsar) offline verdict

  far audit-seed-cherry [--lightcurve <path>] [--python <cmd>] [--json]
                         anti-theater detector-validation showcase: replay a cherry-pick fixture through the
                         real anti-theater -> verdict path (NOT a production verdict-path wiring; needs a real run registry for that)

  far audit-multiseed [--lightcurve <path>] [--python <cmd>] [--json]
                        real multi-seed audit: run seed-dependent BLS across pre-registered
                        seeds (noise-injected, distinct per seed); detect_seed_cherry fires on the REAL
                        computed registry when the researcher hides non-detection seeds. Local fixture only (online TESS multi-seed is a V2 item).
    --lightcurve <path>  lightcurve fixture (default tests/fixtures/science_harness/tic_sample.cache)
    --python <cmd>       python command (default auto-discover python3/python; BLS needs numpy)
    --json               machine-readable output
    needs python+numpy; exits 1 if missing. exit codes: 0 cherry-pick DETECTED / 7 MISSED (regression) / 2 bad args

  far c-astro [--tic <id>] [--sector <n>] [--lightcurve <path>] [--python <cmd>] [--json]
                        C-ASTRO-0001 online TESS dataset resolver wiring:
                        fetchOnlineDataset (lightkurve+MAST, host-whitelisted) -> resolveDataset ->
                        buildCAstroChain. online resolved -> datasetSource=online (real R7); any failure ->
                        fail-safe cached_fixture (baseline_exempt, DEGRADED_SCOPE). Single-seed demo (multi-seed is a V2 item).
    --tic <id>           TESS Input Catalog ID (default 268644982)
    --sector <n>         TESS sector (default 14)
    --lightcurve <path>  cached fixture fallback (default tests/fixtures/science_harness/tic_sample.cache)
    --python <cmd>       python command (default auto-discover; BLS needs numpy)
    --json               machine-readable output
    needs python+numpy; exits 1 if missing. exit 0 on pipeline run; 2 bad args

  far c-astro-loop [--lightcurve <path>] [--rounds <n>] [--python <cmd>] [--json]
                        C-ASTRO closed-loop experiment iteration (赛道一·方向一·B: 接入"仪器"后
                        据反馈迭代提升). 每轮 = 规划(周期网格) -> BLS(真 numpy) -> 验证 ->
                        据反馈缩放并加密网格。光变曲线即"仪器"，BLS 即"实验"。
    --lightcurve <path>  lightcurve CSV (default tests/fixtures/science_harness/tic_sample.cache)
    --rounds <n>         closed-loop iterations (default 3)
    --python <cmd>       python command (default auto-discover; BLS needs numpy)
    --json               machine-readable output
    needs python+numpy; exits 1 if missing. exit 0 on run; 2 bad args. Honest: each round is a
    real BLS subprocess; depthSNR may plateau on a saturated signal (real measurement, not a stub).

  far ground "<question>" [--source openalex|arxiv|crossref] [--max-per-query <n>] [--no-counter-evidence] [--json]
                        Ground a research question in REAL literature + adversarial counter-evidence
                        (赛道一·方向一·A acquisition layer, directive §9/§16). Retrieves supporting docs
                        + 5 counter-evidence queries (non-replication/null/failure/criticism/alternative),
                        dedupes into an immutable CorpusSnapshot (snapshotId + tamper-evident rootHash).
                        A hypothesis should cite documentIds from this corpus; the citation resolver makes
                        unbound citations deterministically detectable. Network: allowlisted, rate-limited.
    --source <s>        openalex (default) | arxiv | crossref
    --max-per-query <n> docs per query, 1..25 (default 5)
    --no-counter-evidence  disable the adversarial queries (rarely wanted)
    --json              machine-readable GroundedCorpus output
    exits 0 on success; 1 bad args; 2 retrieval failure (fail-closed, never a partial corpus).

  far check-resource <kind>:<value> [--json]
                        Verify a cited identifier EXISTS at its authoritative source — NOT via an
                        LLM (directive §20 / forensic K5: closes "exists=true theater"). doi →
                        Crossref, arxiv → arXiv, url → UNSUPPORTED (safe SSRF URL check is future work).
    <kind>:<value>      doi:10.1126/science.aac4716 | arxiv:2501.12345 | url:https://...
    --json              machine-readable ResourceValidation output
    exits 0 VERIFIED · 7 NOT_FOUND (fabrication signal) · 8 UNAVAILABLE (env failure) · 9 UNSUPPORTED · 1 bad args

  far research start "<question>" [--source openalex|arxiv|crossref] [--max-per-query <n>]
                   [--profile auto|offline_replay|competition_aliyun_qwen] [--target 3..5] [--json] [--out <file>]
                         Track-1A vertical slice (赛道一·方向一·A) under the persistent run
                         lifecycle: researchability & safety gate →
                         ground the question in real literature (supporting + counter-evidence +
                         decomposition subquestions) → CorpusSnapshot → generate 3-5
                         mechanistically-distinct candidate hypotheses (corpus-injected, citation
                         allowlist) → independent critique → deterministic scorecard + Pareto front →
                         executable research plan. Every stage records a ProvenanceReceipt (provider
                         request id / token usage / corpus hashes / git commit); citations must bind
                         to the corpus; scoring never uses a single model total score. Progress is
                         checkpointed under .far/research-runs/<runId>/ (FAR_RESEARCH_RUNS_DIR
                         overrides); one stderr line per stage; first Ctrl+C cancels (exit 130).
    --source <s>        openalex (default) | arxiv | crossref
    --max-per-query <n> docs per query, 1..25 (default 5)
    --profile <p>       auto (default; LIVE when DASHSCOPE_API_KEY is set — no flag needed;
                        without a key the run FAILS CLOSED exit 2 with actionable guidance) |
                        offline_replay (synthetic fixtures, RECORDED_REPLAY; explicit opt-in) |
                        competition_aliyun_qwen (LIVE; needs the key)
    --target <n>        hypothesis count 3..5 (default 3)
    --json              machine-readable ResearchRun output
    --out <file>        save the ResearchRun JSON
    exits 0 success · 1 pipeline failure (checkpoint kept; resumable) · 2 bad args · 3 gate refused
    (UNSUPPORTED — no pipeline ran) · 130 cancelled (first Ctrl+C)

  far research status <runId> [--json]
                         print the on-disk lifecycle checkpoint: state, stage progress
                         (n/8 with per-stage ✓), timestamps, error+errorKind when FAILED,
                         runMode+run file when COMPLETED, and the next-command hint.
    --json              machine-readable checkpoint object
    exits 0 success · 1 unknown runId / unreadable checkpoint · 2 bad args

  far research resume <runId> [--profile ...] [--out <file>] [--json]
                         re-execute a FAILED/CANCELLED run from its checkpoint — completed
                         stages are NOT repeated (their model calls and frozen corpus are
                         reused); --profile must match the checkpoint's own profile (a run's
                         provenance is never mixed mid-flight). COMPLETED runs are rejected.
    exits 0 success · 1 not resumable / unknown runId · 2 bad args / profile mismatch / missing key

  far research inspect <run.json> [--json]
                         print a saved ResearchRun (hypotheses · scorecards · plan · run modes)
    exits 0 success · 1 read/parse failure · 2 bad args

  far research verify <run.json | bundle-dir> [--json]
                         third-party recompute of the deterministic layer (corpus rootHash ·
                         citation binding · deterministic scorecard · Pareto front · primary
                         selection). A bundle-dir is integrity-checked against its manifest first.
    exits 0 PASS · 7 tamper/mismatch · 1 read/parse failure · 2 bad args

  far research export <run.json> --out <bundle-dir> [--json]
                         freeze the run into a portable hash-pinned bundle (research-run.json +
                         manifest.json + standalone verify.mjs + README). LLM text is frozen, not
                         re-generated; the deterministic layer is independently recomputable.
    exits 0 success · 1 read/write failure · 2 bad args

  far research feedback <run.json> --file feedback.json [--out <new.json>] [--profile ...]
                         apply a structured feedback signal → immutable revision (plan_rewrite
                         triggers a real redesign). Revisions never force monotonic improvement.
    exits 0 success · 1 failure · 2 bad args

  far research compare <run.json> [--revision <a> <b>] [--json]
                         deterministic plan diff between frozen revision states (default: first
                         revision's before-plan vs latest revision's after-plan).
    exits 0 success · 1 no revisions / read failure · 2 bad args

  far research analyze <run.json> [--live] [--out <new.json>] [--json]
                         Phase 3 loop: execute the plan's first real analysis step against the
                         NASA Exoplanet Archive (live TAP fetch with --live; otherwise the
                         committed REAL sample in RECORDED_REPLAY mode) -> parse the output into
                         an Observation -> FeedbackSignal -> revision (plan rewritten when
                         triggered). Nulls / small samples / non-significance preserved honestly.
    exits 0 success · 1 experiment/read failure · 2 bad args

  far research evaluate <run.json> [--json]
                         program-computed evaluation metrics (§14.3) + deterministic recompute.
                         Metrics come from the frozen run state (never hand-edited); human-rubric
                         metrics are listed, not auto-scored.
    exits 0 success · 1 read failure · 2 bad args

  far research baseline "<question>" [--profile ...] [--json]
                         four fair baselines (§14.2) with the same model + question: direct answer,
                         simple RAG, no-deterministic-kernel agent, and the full system. Capability
                         gaps are reported as N/A (never scored as zero). Live comparison needs the
                         profile API key.
    exits 0 success · 3 gate refused · 1 pipeline failure · 2 bad args

  far status [--db <path>] [--json]  emit the single SSOT status report
    --db <path>   verify the evidence_log DB chain head (verifyChainHead); omitted => pending
    --json        machine-readable output (used by CI to backfill <X_FROM_STATUS_DUMP> placeholders)

  far lifecycle <sub> --db <path> --target-kind <k> --target-id <id> [options]
                         retraction/correction/supersession lifecycle (IC-05; tombstone append-only)
    state                       print current state (active|contested|corrected|retracted|superseded)
    history [--json]            print the full transition history of the target
    transition --to <state> --actor <a> --reason <r> [--audit-ref <ref>]
                                record a transition (illegal transitions are rejected, exit 1)
    verify                      verify the target-scoped event hash chain
    exit codes: 0 ok / 1 illegal transition or chain broken / 2 bad args

  far backup --db <path> --out <path> [--force]
                         safe backup via VACUUM INTO (IC-03; full integrity_check first —
                         a corrupted DB is never backed up; backup re-checked after write)

  far api [--port <n>] [--db <path>|--persist <path>] [--no-seed] [--protected]
          start the REST API server (Fastify; the frontend defaults to localhost:3000)
    --port <n>      listen port (default 3000, aligned with frontend api_client.ts; overridable via PORT)
    --db <path>     DB path (default :memory: ephemeral, fresh each start)
    --persist <p>   persist to a file (e.g. ./FAR-Lab.db; survives restarts)
    --no-seed       do not seed the demo verdict (default seeds C-ASTRO-0001 UNTESTED; the legacy seed
                    injects no statistics so rule R6 does not fire; meant for frontend display)
    --protected     enable JWT auth (needs FAR_JWT_SECRET; default offline anonymous demo)
    example: pnpm api   # backend on localhost:3000; run "cd frontend && npm run dev" for the full stack

  far verify [--bundle <path> [--db <path>] | --envelope <path> --db <path>] [--mode chain|envelope|full]
             [--json] [--explain]      third-party independent re-computation verification
    --bundle <path>      .far-proof V1 minimal offline bundle directory (full mode verifies required
                         files + redacted chain + V1 proofHash + integrity.json manifest)
    <positional>        equivalent to --bundle (e.g. far verify .far-implementation/walking-skeleton/demo.far-proof)
    --envelope <path>   ProofEnvelopeV2 JSON file (required for envelope/full mode)
    --db <path>         evidence_log DB (required for chain/full mode; verifyChainHead)
                        with --bundle: also runs DB↔export anchor comparison (DEF-18 — detects
                        consistent forgery: DB payload hashes recomputed after export)
    --mode <m>          chain|envelope|full (inferred from --envelope/--db by default)
    --json              machine-readable 10-field schema output
    --explain           human-readable mode: expand the 10-rule check table
    --lint-input <path> AntiTheaterLintInput JSON (requires --envelope; independently recomputes the
                        23 detectors and compares them in depth with the embedded report;
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

  far export receipt-v2 --envelope <path> [--format json|markdown] [--out <path>]
                         V2 Receipt export (manifest + six-dimension verification + ContractBindingSet)
    --envelope <path>    ProofEnvelopeV2 JSON file
    --format <fmt>       json|markdown (default json)
    --out <path>         write to a file; omit to print to stdout
    exit codes: 0 success / 2 bad args / 1 runtime error

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
                        ADVANCE_VERDICT / ADVANCE_PROOF_SEAL / ADVANCE_AUDITABLE / ADVANCE_VERIFIED /
                        REVERT_EVIDENCE_GATHER / REVERT_STATISTICS / REVERT_VERDICT)
    --input <path>      path to the stageOutput JSON file
    --state-file <path> state file path (default ./.far/fsm_state.json; initialized to INITIAL + GENESIS_RECEIPT if absent)
    --json              machine-readable output (StageReceipt JSON)
    transition (state_machine) + computeStageReceipt (sha256(prevReceipt + hashCanonicalJson)).
    an illegal transition is never silently overwritten: returns PROTOCOL_DEVIATION_CRITICAL, exit 7 (fail-closed).
    exit codes: 0 advanced / 7 protocol deviation / 2 bad args / 1 runtime error

  far planning plan <file> | spec <file> | risk <signal...> | state <from> <to> [--compress] |
       gate <file> | checkpoint <file> [--template]
                                     opencode planning methodology as deterministic gates
    plan <file>       validate a Plan DAG (dependencies / cycles / per-step verification) → topological order
    spec <file>       validate a Spec (>=3 verifiable ACs / Delta / trust-kernel additive declaration)
    risk <signals...> grade P0-P4 (signals: readOnly/docOnly/boundedWrite/touchesTrustKernel/newCliOrApi/crossModule/destructive/irreversible/ambiguous)
    state <from> <to> stage-machine transition check (ANALYZE→PLAN→EXECUTE→VERIFY→REVIEW→REPORT; --compress allows stage skipping)
    gate <file>       four-step gate report from {items, results} (DONE / IMPLEMENTED_UNVERIFIED / BLOCKED)
    checkpoint <file> parse a PROGRESS.md checkpoint (resumption protocol); --template renders the protocol template
    exit codes: 0 pass / 7 gate fail / 3 IMPLEMENTED_UNVERIFIED / 2 bad args

  far ask "<question>" [--mode full|quick] [--json] [--export <dir>] [--resume <path>]
                                    run the full 6-stage FSM once (runAgentLoop); emits a verdict + evidence chain
    --mode full|quick             full = up to 3 iterations (default) / quick = single pass
    --export <dir>                export a V1 .far-proof self-verifiable bundle to <dir>
    --resume <path>               stage_receipt store (IC-06): resume from the last valid receipt after kill
    --json                        machine-readable output
    --ground                      Phase 4b: FIRST ground the question in real retrieved literature + adversarial
                                  counter-evidence (§9/§16), attach the corpus snapshot to the result. Default off.
    --ground-source <s>           openalex (default) | arxiv | crossref (only with --ground)
    defaults to offline_replay (no keys, fixture replay); real inference needs --profile competition_aliyun_qwen + credentials
    red line: the verdict is produced by the deterministic R0-R9 kernel (the LLM is never the adjudicator).
    exit codes: 0 normal termination / 1 loop error / 2 bad args

  far stream "<question>" [--mode] [--json]   like ask, but streams each stage live (onArtifact callback; real streaming, not replay)
  far repl                                  interactive REPL (ask / :fork <suffix> / :history / :quit)
  far replay --db <path> | --bundle <dir>   replay the evidence chain (time machine; hash-chain verify)
  far court "<claim>" [--models a,b,c]      cross-model reliability court (issues a ReliabilityCertificate)
  far arena "<hypothesis>" [--refuters]     adversarial science arena (refuter attacks + deterministic arbiter scoreboard)
  far init <domain> [--out <dir>] [--force] scaffold a DomainPack (config + claim/fec templates)

  far keygen --out <path>                   generate an Ed25519 key pair (private PKCS8 PEM + .pub.pem)
  far sign <file-or-dir> --key <private.pem> [--out <sig.json>] [--json]
                                            sign a deterministic file manifest (Ed25519); signing a
                                            .far-proof bundle writes <bundle-dir>.sig.json (DEF-18)
  far verify-sig <file-or-dir> --sig <sig.json> [--pubkey <public.pem>] [--json]
                                            verify an Ed25519 file-manifest signature (independent
                                            recompute + hash check; any path drift → FAIL)

  far real-paper [--paper bem] [--mode as-published|corrected]
    Run a real published paper through the FAR-Lab pipeline (statistics recompute
    + deterministic verdict kernel + 23 anti-theater fraud detectors + tamper-evident
    proof seal). Currently supports:
      bem  — Bem (2011) "Feeling the Future" (replication crisis landmark)
    Modes:
      as-published  simulate the paper's actual analysis (exposes methodological flaws)
      corrected     apply FAR-Lab's proper analysis (Bonferroni correction)

  far schedule <add|list|remove|run>       scheduled re-verification (re-verify claims over time; JSON-persisted)
    add --exec "<command>" [--every <days>] [--label <text>]
                          register a periodic re-verification job (--every default 7 days)
    list                  list all jobs with due status
    remove <id>           remove a job
    run                   execute all due jobs now and record lastRunAt/lastExitCode
    store: $FAR_HOME/schedules.json (default ~/.far/schedules.json); exec via execFile with 5-min timeout.
    exit codes: 0 ok / 1 error / 2 bad args

  All listed commands are implemented. Items below are future work (not missing CLI commands):
  - real multi-model providers (court/arena --models against real LLMs; needs a credential gate)
  - formal verifiers (Lean / Dafny / Rust)
  - real OS-level sandbox isolation
  `;

// HELP_TEXT — compact grouped overview (2026-08-14 UX regroup: the old 300-line wall
// buried the four real entry commands). One-line descriptions here; full usage,
// options, and exit codes live in DETAILED_HELP via `far <command> --help`.
// Every command in COMMANDS appears exactly once in a group (GETTING STARTED
// intentionally repeats the entry points); scripts/doc_command_check.mjs extracts
// subcommands from this text, so lines must keep the 2-space "  far <cmd>" shape.
const HELP_TEXT = `FAR-Lab CLI — claim-level verification for AI4S scientific claims

GETTING STARTED (recommended order)
  far demo                              see the deterministic kernel verify 14 golden vectors (no key)
  far ground "<your question>"          real literature retrieval + counter-evidence — free, no key
  far research start "<your question>"  full research loop (live model when DASHSCOPE_API_KEY is set;
                                        without a key it fails closed with actionable guidance)
  far research status <runId>           observe a long run  ·  far research resume <runId>  continue it

RESEARCH LOOP
  far research <start|status|resume|inspect|verify|export|compare|analyze|evaluate|baseline|feedback>
                                        ground → hypotheses → critique → deterministic score → plan
                                        (checkpointed per stage, resumable, Ctrl+C cancels honestly)
  far ground "<question>"               ground a question in REAL literature + adversarial counter-evidence
                                        (OpenAlex/arXiv/Crossref; --source, --max-per-query, --json)
  far check-resource <kind>:<value>     verify a cited identifier exists at its authoritative source
                                        (doi: | arxiv: | url:; --json)
  far ask "<question>"                  run the full 6-stage FSM once (verdict + evidence chain)
  far stream "<question>"               like ask, but streams each stage live (real streaming, not replay)
  far repl                              interactive REPL (ask / :fork <suffix> / :history / :quit)

VERIFICATION & TRUST
  far demo [tess-offline]               one-shot demo: 14 golden vectors + end-to-end demo claim (offline)
  far verify [--bundle|--envelope|--db] third-party independent re-computation verification
                                        (--v2: V2 six-dimension path; --explain expands the check tables)
  far verify-golden [--all|--case]      recompute the verdict golden vectors (node/python/browser axes)
  far fec <compile|freeze>              FEC V2 compile + fecHash recompute / freeze cross-check
  far replay --db <p> | --bundle <d>    replay the evidence chain (time machine; hash-chain verify)
  far court "<claim>"                   cross-model reliability court (issues a ReliabilityCertificate)
  far arena "<hypothesis>"              adversarial science arena (refuter attacks + deterministic arbiter)

EVIDENCE & PROOF
  far export <receipt|receipt-v2|far-proof>
                                        Trust Receipt / .far-proof portable evidence bundle export
  far keygen --out <path>               generate an Ed25519 key pair (signer key lifecycle)
  far sign <path> --key <sk.pem>        sign a file/directory with an Ed25519 private key (deterministic manifest)
  far verify-sig <path> --sig <s.json>  verify an Ed25519 file-manifest signature (independent recompute)
  far backup --db <p> --out <p>         safe backup via VACUUM INTO (full integrity_check first, IC-03)
  far real-paper [--paper bem]          run a real published paper through the FAR-Lab pipeline

SYSTEM
  far doctor [--full-verify]            environment self-check (no network, no keys by default;
                                        env checks first, compact verify summary; --full-verify = full report)
  far hardware [--json]                 best-effort runtime compute-backend probe (CPU/GPU/WebGPU/WASM)
  far init <domain>                     scaffold a DomainPack (config + claim/fec templates)
  far api [--port <n>]                  start the REST API server (Fastify; frontend defaults to :3000)
  far status [--db <path>]              emit the single SSOT status report
  far lifecycle <state|history|transition|verify>
                                        retraction/correction/supersession lifecycle (IC-05; append-only)
  far planning <plan|spec|risk|state|gate|checkpoint>
                                        planning methodology as deterministic gates (P0-P4 grading)
  far schedule <add|list|remove|run>    scheduled re-verification (re-verify claims over time)
  far fsm advance                       advance the 9-state CLI protocol FSM (stageReceipt hash link)
  far bench run                         FAR-Bench demo profile
  far version                           print version + git HEAD
  far c-astro [--tic <id>] [--sector <n>]
                                        C-ASTRO-0001 online TESS dataset resolver wiring
  far c-astro-loop [--rounds <n>]       C-ASTRO closed-loop experiment iteration (plan→BLS→verify→refine)
  far audit-seed-cherry [--json]        anti-theater detector-validation showcase (cherry-pick replay)
  far audit-multiseed [--json]          real multi-seed audit (seed-dependent BLS)

MORE
  far <command> --help                  full usage, options, and exit codes for a single command
  docs: README quickstart · docs/quickstart.md · docs/INDEX.md

  All listed commands are implemented. Future work (not missing commands): real multi-model
  providers for court/arena (needs a credential gate) · formal verifiers (Lean/Dafny) ·
  real OS-level sandbox isolation.
  `;

main().catch((error: unknown) => {
  const msg = errorMessage(error);
  // Thrown errors already self-identify as 'far <cmd>: …'; avoid the redundant 'far: failed —' double-prefix.
  process.stderr.write(`${msg.startsWith('far ') ? msg : `far: ${msg}`}\n`);
  // Natural exit (see main()): a force-exit right after an undici fetch can crash
  // on Windows with a libuv assertion; exitCode lets teardown finish cleanly.
  process.exitCode = 1;
});
