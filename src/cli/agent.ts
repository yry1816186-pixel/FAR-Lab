import { createApp } from '../app/composition.js';
import { sourceAdapterFor } from '../sources/index.js';
import { runEvidenceGapRefinement, CAPABILITY } from '../agent/capabilities/refine.js';
import { ink, marker } from './term.js';

/**
 * `far agent …` — agent-harness surface (H1). Own module so the main router stays a
 * one-line hook (same convention as experiment.ts). Live provider route only: the
 * refinement capability is a real research action, not a demo path.
 */

export interface AgentCommandOptions {
  dataDir: string | undefined;
  positional: string | undefined;
  flag: (name: string) => boolean;
  arg: (name: string) => string | undefined;
}

export interface AgentCommandResult {
  code: number;
  text?: string;
  json?: unknown;
}

const RUN_ID_RE = /^run_[0-9a-z]{20,32}$/;

export async function agentCommand(sub: string | undefined, opts: AgentCommandOptions): Promise<AgentCommandResult> {
  if (sub !== 'refine') {
    return { code: 2, text: 'usage: far agent refine <run-id> [--turns N] [--top-k N] [--max-concurrent N] [--json]' };
  }
  const runId = opts.positional;
  if (runId === undefined || !RUN_ID_RE.test(runId)) {
    return { code: 2, text: 'far agent refine requires a run id (run_<26-char id>)' };
  }
  const parseIntArg = (name: string): number | undefined => {
    const raw = opts.arg(name);
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 64) return undefined;
    return n;
  };
  const app = await createApp({ dataDir: opts.dataDir });
  try {
    const outcome = await runEvidenceGapRefinement(
      { store: app.store, artifacts: app.artifacts, provider: app.provider, sourceFor: (f) => sourceAdapterFor(f) },
      runId,
      {
        ...(parseIntArg('--turns') !== undefined ? { maxTurns: parseIntArg('--turns') } : {}),
        ...(parseIntArg('--top-k') !== undefined ? { topK: parseIntArg('--top-k') } : {}),
        ...(parseIntArg('--max-concurrent') !== undefined ? { maxConcurrent: parseIntArg('--max-concurrent') } : {}),
      },
    );
    if (opts.flag('--json')) {
      return {
        code: outcome.status === 'completed' ? 0 : 1,
        json: {
          runId, capability: CAPABILITY, sessionId: outcome.sessionId, status: outcome.status,
          ...(outcome.reportId !== undefined ? { reportId: outcome.reportId } : {}),
          ...(outcome.result !== undefined ? { result: outcome.result } : {}),
          ...(outcome.error !== undefined ? { error: outcome.error } : {}),
          telemetry: outcome.telemetry,
          subagentSessions: outcome.subagentSessions,
        },
      };
    }
    const lines: string[] = [`${marker()} ${ink.bold(`agent ${outcome.status}`)} session ${outcome.sessionId} on run ${runId}`];
    for (const s of outcome.subagentSessions) {
      lines.push(`  ${ink.muted('sub-agent')} ${s.label} ${s.status === 'completed' ? ink.ok(s.status) : ink.err(s.status)} (${s.sessionId})`);
    }
    if (outcome.result !== undefined) {
      lines.push(`  ${ink.bold('gaps')}: ${outcome.result.evidenceGaps.length}  ${ink.bold('counter-evidence')}: ${outcome.result.counterEvidenceFound.length}  ${ink.bold('suggestions')}: ${outcome.result.refinedSuggestions.length}`);
      for (const gap of outcome.result.evidenceGaps) {
        lines.push(`    ${ink.warn(gap.severity)} ${gap.hypothesisId}: ${gap.missing}`);
        lines.push(`      ${ink.muted(`queries: ${gap.suggestedQueries.join(' | ')}`)}`);
      }
      if (outcome.reportId !== undefined) lines.push(`  ${ink.ok('report')} ${outcome.reportId}`);
    }
    if (outcome.error !== undefined) lines.push(`  ${ink.err('error')}: ${outcome.error}`);
    lines.push(`  ${ink.muted(`turns=${outcome.telemetry.turns} modelCalls=${outcome.telemetry.modelCalls} tools=${outcome.telemetry.toolCalls} wall=${outcome.telemetry.wallMs}ms`)}`);
    return { code: outcome.status === 'completed' ? 0 : 1, text: lines.join('\n') };
  } finally {
    app.close();
  }
}
