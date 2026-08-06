// src/cli/commands/court.ts
// far court "<claim>" —— 跨模型可靠性法庭。
//
// 同一 claim 跑多个模型，收集各自的机器裁决，结构化检测一致/分歧，颁发 ReliabilityCertificate。
// 诚实边界（2026-08-06 修正）：默认 offline_replay fixture 回放——所有模型回放同一套
// fixture（按 stageId），verdict 必然 unanimous（展示「多模型法庭框架 + 一致性检测 +
// 证书结构」，非真实模型分歧）。真实模型分歧：`--profile competition_aliyun_qwen`
// （凭据门：FAR_DASHSCOPE_API_KEY 或 DASHSCOPE_API_KEY·真实 HTTP 计费·G3 环境锚 2026-08-06 已闭合）。
// 红线：每个模型 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）。

import { resolveGitCommitSha } from '../git_commit_sha.ts';
import {
  runCourtSession,
  type ReliabilityCertificate,
  type CourtSessionOptions,
} from '../../api/internal/court_service.ts';
import { createCompetitionQwenGateway } from '../../llm_gateway/competition_gateway.ts';
import { COMPETITION_MODEL_SNAPSHOT } from '../../llm_gateway/adapters/aliyun_qwen/snapshot.ts';

/** Input parameters for operations involving court args. */
export interface CourtArgs {
  readonly claim: string;
  readonly models: readonly string[];
  readonly json: boolean;
  /** 真实 provider profile（默认 offline_replay·competition_aliyun_qwen 走真实 HTTP 计费）。 */
  readonly profile: string;
}

const DEFAULT_MODELS = ['qwen-vl-max', 'qwen-plus', 'qwen-turbo'];

/**
 * parse court args.
 */
export function parseCourtArgs(argv: readonly string[]): CourtArgs {
  let claim = '';
  let models: readonly string[] = DEFAULT_MODELS;
  let json = false;
  let profile = 'offline_replay';

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
    if (a === '--profile') {
      profile = argv[++i] ?? profile;
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

  return { claim, models, json, profile };
}

// computeAgreement + ReliabilityCertificate + runCourtSession 已提取至 api/internal/court_service.ts（CLI + API 共用）。
export { computeAgreement } from '../../api/internal/court_service.ts';
export type { ReliabilityCertificate } from '../../api/internal/court_service.ts';

function renderHuman(cert: ReliabilityCertificate): void {
  const lines = [
    '',
    '  FAR-Lab · far court (cross-model reliability court)',
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

/**
 * run court.
 */
export async function runCourt(argv: readonly string[]): Promise<number> {
  const args = parseCourtArgs(argv);

  if (args.claim.trim().length === 0) {
    process.stderr.write(
      'far court: missing claim.\n  usage: far court "<claim>" [--models a,b,c] [--profile offline_replay|competition_aliyun_qwen] [--json]\n',
    );
    return 2;
  }

  // 真实 provider 路径（2026-08-06·G3 环境锚闭合后接线）：凭据门 + competition gateway
  let sessionOptions: CourtSessionOptions = {};
  if (args.profile !== 'offline_replay') {
    const apiKey = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
    if (apiKey === undefined || apiKey === '') {
      process.stderr.write(
        `far court: profile "${args.profile}" needs real LLM credentials.\n` +
          '  set FAR_DASHSCOPE_API_KEY=sk-xxx or DASHSCOPE_API_KEY=sk-xxx and retry (real cross-model court·billing applies).\n' +
          '  default offline_replay needs no credentials (fixture replay).\n',
      );
      return 2;
    }
    sessionOptions = {
      gateway: createCompetitionQwenGateway({ apiKey }),
      modelSnapshot: COMPETITION_MODEL_SNAPSHOT,
      providerProfile: args.profile,
      providerLabel: args.profile,
    };
  }

  const cert = await runCourtSession(args.claim, args.models, resolveGitCommitSha(), sessionOptions);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(cert, null, 2)}\n`);
  } else {
    renderHuman(cert);
  }
  return 0;
}
