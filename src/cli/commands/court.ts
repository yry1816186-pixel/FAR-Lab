// src/cli/commands/court.ts
// far court <claim> --models a,b,c —— 跨模型可靠性法庭。
//
// 同一 claim 跑多个模型（每个用独立 modelId 的 offline_replay adapter），收集各自的机器裁决，
// 结构化检测一致/分歧，颁发 ReliabilityCertificate。
// 诚实边界：offline_replay 下所有模型回放同一套 fixture（按 stageId），verdict 必然相同——
// 展示的是「多模型法庭框架 + 一致性检测」，真实模型分歧需 --models 接真实 provider（凭据门）。
// 红线：LLM 不作裁决者——每个模型的 verdict 仍由 R0-R9 确定性内核给出（fixture 只驱动 stage 文本）。

import { resolveGitCommitSha } from '../git_commit_sha.ts';
import {
  runCourtSession,
  type ReliabilityCertificate,
} from '../../api/internal/court_service.ts';

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
        throw new Error('far court: --models must be a comma-separated non-empty list (e.g. qwen-vl-max,qwen-plus)');
      }
      models = parts;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far court: unknown argument "${a}"`);
    }
    claim = claim === '' ? a : `${claim} ${a}`;
  }

  return { claim, models, json };
}

// computeAgreement + ReliabilityCertificate + runCourtSession 已提取至 api/internal/court_service.ts（CLI + API 共用）。
export { computeAgreement } from '../../api/internal/court_service.ts';
export type { ReliabilityCertificate } from '../../api/internal/court_service.ts';

function renderHuman(cert: ReliabilityCertificate): void {
  const lines = [
    '',
    '  FAR-Chain · far court (cross-model reliability court)',
    '  ─────────────────────────────────────────────────',
    `  claim    : ${cert.claim}`,
    `  models   : ${cert.modelCount}`,
    '  ─────────────────────────────────────────────────',
  ];
  for (const v of cert.verdicts) {
    const vd = v.verdict ?? '<error>';
    const rule = v.decisiveRuleId === null ? '' : `(${v.decisiveRuleId})`;
    const err = v.error === null ? '' : `  ⚠ ${v.error}`;
    lines.push(`  ${v.model.padEnd(20)} → ${vd}${rule}${err}`);
  }
  lines.push('  ─────────────────────────────────────────────────');
  lines.push(`  agreement : ${cert.agreement} (distinct=${cert.distinctVerdicts.join(', ')})`);
  lines.push(`  cert      : ${cert.certificateId}`);
  lines.push('');
  lines.push(`  ⚠ honest : ${cert.honestNote}`);
  lines.push('  red line: each model verdict is still produced by the deterministic R0-R9 kernel (the LLM is not the adjudicator)');
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

export async function runCourt(argv: readonly string[]): Promise<number> {
  const args = parseCourtArgs(argv);

  if (args.claim.trim().length === 0) {
    process.stderr.write(
      'far court: missing claim.\n  usage: far court "<claim>" [--models a,b,c] [--json]\n',
    );
    return 2;
  }

  const cert = await runCourtSession(args.claim, args.models, resolveGitCommitSha());

  if (args.json) {
    process.stdout.write(`${JSON.stringify(cert, null, 2)}\n`);
  } else {
    renderHuman(cert);
  }
  return 0;
}
