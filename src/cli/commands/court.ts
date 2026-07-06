// src/cli/commands/court.ts
// far court <claim> --models a,b,c —— 跨模型可靠性法庭。
//
// 同一 claim 跑多个模型（每个用独立 modelId 的 offline_replay adapter），收集各自的机器裁决，
// 结构化检测一致/分歧，颁发 ReliabilityCertificate。
// 诚实边界：offline_replay 下所有模型回放同一套 fixture（按 stageId），verdict 必然相同——
// 展示的是「多模型法庭框架 + 一致性检测」，真实模型分歧需 --models 接真实 provider（凭据门）。
// 红线：LLM 不作裁决者——每个模型的 verdict 仍由 R0-R9 确定性内核给出（fixture 只驱动 stage 文本）。

import Database from 'better-sqlite3';
import { ulid } from 'ulid';

import { createLlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { runMigrations } from '../../db/migrator.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { executeAskRun } from './ask.ts';

export interface CourtArgs {
  readonly claim: string;
  readonly models: readonly string[];
  readonly json: boolean;
}

const DEFAULT_MODELS = ['qwen-vl-max', 'qwen-plus', 'qwen-turbo'];

export function parseCourtArgs(argv: readonly string[]): CourtArgs {
  let claim = '';
  let models: readonly string[] = DEFAULT_MODELS;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--models') {
      const raw = argv[++i] ?? '';
      const parts = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      if (parts.length === 0) {
        throw new Error('far court: --models 须为逗号分隔的非空列表（如 qwen-vl-max,qwen-plus）');
      }
      models = parts;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far court: 未知参数 "${a}"`);
    }
    claim = claim === '' ? a : `${claim} ${a}`;
  }

  return { claim, models, json };
}

interface ModelVerdict {
  readonly model: string;
  readonly verdict: string | null;
  readonly decisiveRuleId: string | null;
  readonly chainHead: string | null;
  readonly error: string | null;
}

interface ReliabilityCertificate {
  readonly certificateId: string;
  readonly claim: string;
  readonly modelCount: number;
  readonly verdicts: readonly ModelVerdict[];
  readonly distinctVerdicts: readonly string[];
  readonly agreement: 'unanimous' | 'majority' | 'split';
  readonly honestNote: string;
}

async function executeCourtSession(args: CourtArgs, gitCommitSha: string): Promise<ReliabilityCertificate> {
  const verdicts: ModelVerdict[] = [];
  for (const model of args.models) {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    try {
      const gateway = createLlmGateway([createOfflineReplayAdapter({ modelId: model })]);
      const result = await executeAskRun(db, args.claim, 'quick', gitCommitSha, undefined, gateway);
      const vn = result.loopState.verdictNode;
      verdicts.push({
        model,
        verdict: vn === null ? null : vn.verdict,
        decisiveRuleId: vn === null ? null : vn.verdictTrace.decisiveRuleId,
        chainHead: result.reproHash,
        error: result.loopState.error === null ? null : result.loopState.error.message,
      });
    } catch (err) {
      verdicts.push({
        model,
        verdict: null,
        decisiveRuleId: null,
        chainHead: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      db.close();
    }
  }

  const distinct = Array.from(new Set(verdicts.map((v) => v.verdict)));
  let agreement: 'unanimous' | 'majority' | 'split';
  if (distinct.length <= 1) {
    agreement = 'unanimous';
  } else if (distinct.length === 2) {
    agreement = 'majority';
  } else {
    agreement = 'split';
  }

  return {
    certificateId: ulid(),
    claim: args.claim,
    modelCount: args.models.length,
    verdicts,
    distinctVerdicts: distinct.map((v) => v ?? '<null>'),
    agreement,
    honestNote:
      'offline_replay 下所有模型回放同一套 fixture，verdict 必然一致；真实模型分歧需 --models 接真实 provider（凭据门）',
  };
}

function renderHuman(cert: ReliabilityCertificate): void {
  const lines = [
    '',
    '  FAR-Chain · far court（跨模型可靠性法庭）',
    '  ─────────────────────────────────────────────────',
    `  claim    : ${cert.claim}`,
    `  models   : ${cert.modelCount}`,
    '  ─────────────────────────────────────────────────',
  ];
  for (const v of cert.verdicts) {
    const vd = v.verdict ?? `<错误>`;
    const rule = v.decisiveRuleId === null ? '' : `（${v.decisiveRuleId}）`;
    const err = v.error === null ? '' : `  ⚠ ${v.error}`;
    lines.push(`  ${v.model.padEnd(20)} → ${vd}${rule}${err}`);
  }
  lines.push('  ─────────────────────────────────────────────────');
  lines.push(`  agreement : ${cert.agreement}（distinct=${cert.distinctVerdicts.join(', ')}）`);
  lines.push(`  cert      : ${cert.certificateId}`);
  lines.push('');
  lines.push(`  ⚠ honest : ${cert.honestNote}`);
  lines.push('  红线：每个模型 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）');
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

export async function runCourt(argv: readonly string[]): Promise<number> {
  const args = parseCourtArgs(argv);

  if (args.claim.trim().length === 0) {
    process.stderr.write(
      'far court: 缺少 claim。\n  用法: far court "<claim>" [--models a,b,c] [--json]\n',
    );
    return 2;
  }

  const cert = await executeCourtSession(args, resolveGitCommitSha());

  if (args.json) {
    process.stdout.write(`${JSON.stringify(cert, null, 2)}\n`);
  } else {
    renderHuman(cert);
  }
  return 0;
}
