import path from 'node:path';
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
    return { code: 2, text: 'usage: far agent refine <run-id> [--turns N] [--top-k N] [--max-concurrent N] [--resume <ags-id>] [--json]' };
  }
  const runId = opts.positional;
  if (runId === undefined || !RUN_ID_RE.test(runId)) {
    return { code: 2, text: 'far agent refine requires a run id (run_<26-char id>)' };
  }
  const resume = opts.arg('--resume');
  // Validate numeric flags up front: a silently-dropped invalid value would run the
  // refinement with hidden defaults (adversarial round-2 NUJ-4) — fail fast instead.
  const NUMERIC_FLAGS = ['--turns', '--top-k', '--max-concurrent'] as const;
  for (const flag of NUMERIC_FLAGS) {
    const raw = opts.arg(flag);
    if (raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 64) {
      return { code: 2, text: `invalid value for ${flag}: '${raw}' — expected an integer 1..64` };
    }
  }
  const numFlag = (flag: string): number | undefined => {
    const raw = opts.arg(flag);
    return raw === undefined ? undefined : Number(raw);
  };
  const turns = numFlag('--turns');
  const topK = numFlag('--top-k');
  const maxConcurrent = numFlag('--max-concurrent');
  if (resume !== undefined && !/^ags_[0-9a-z]{20,32}$/.test(resume)) {
    return { code: 2, text: `invalid --resume session id: ${resume} (expected ags_<26-char id>)` };
  }
  const app = await createApp({ dataDir: opts.dataDir });
  try {
    const outcome = await runEvidenceGapRefinement(
      { store: app.store, artifacts: app.artifacts, provider: app.provider, sourceFor: (f) => sourceAdapterFor(f), rolloutDir: path.join(app.dataDir, 'agent-sessions') },
      runId,
      {
        ...(turns !== undefined ? { maxTurns: turns } : {}),
        ...(topK !== undefined ? { topK } : {}),
        ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
        ...(resume !== undefined ? { resumeSessionId: resume } : {}),
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
    const lines: string[] = [`${marker()} ${ink.bold(`agent ${outcome.status}`)} session ${outcome.sessionId} on run ${runId}${outcome.resumed ? ink.info(' (resumed)') : ''}`];
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
    if (outcome.skillsUsed.length > 0) lines.push(`  ${ink.muted(`skills`)}: ${outcome.skillsUsed.join(', ')}`);
    for (const m of outcome.mcpServers) {
      const state = m.state === 'connected' ? ink.ok(`${m.state}(${m.toolCount ?? '?'} tools)`) : m.state === 'disabled' ? ink.muted(m.state) : ink.err(m.state);
      lines.push(`  ${ink.muted('mcp')} ${m.label} ${state}${m.error !== undefined ? ` ${ink.warn(m.error)}` : ''}`);
    }
    lines.push(`  ${ink.muted(`turns=${outcome.telemetry.turns} modelCalls=${outcome.telemetry.modelCalls} tools=${outcome.telemetry.toolCalls} wall=${outcome.telemetry.wallMs}ms`)}`);
    return { code: outcome.status === 'completed' ? 0 : 1, text: lines.join('\n') };
  } finally {
    app.close();
  }
}
