import { z } from 'zod';
import path from 'node:path';
import { canonicalSha256 } from '../../shared/crypto.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../../shared/ports.js';
import type { Store } from '../../persistence/store.js';
import type { SourceFamily } from '../../domain/source.js';
import { newId, ProvenanceReceipt, AgentSession, AgentReport, type AgentTelemetrySummary, type AgentTurnRecord } from '../../domain/index.js';
import { receiptEventDetail } from '../../pipeline/llm.js';
import { makeRunBudget } from '../../app/run-budget.js';
import { resolveRunProvider } from '../../app/provider-resolver.js';
import { ToolRegistry, type AgentTool, type ToolContext, type ToolResult } from '../tool.js';
import { PermissionEngine } from '../permissions.js';
import { SessionTelemetry } from '../telemetry.js';
import { runAgentLoop, type AgentLoopConfig, type AgentLoopResult } from '../loop.js';
import { runSubagents, type SubagentResult } from '../subagents.js';
import { openRolloutWriter, readRollout, reconstructSession, rolloutFile, type InterruptedTurnDisposition } from '../rollout.js';
import { loadSkillsFromDir, selectSkills, renderSkillsPrompt, type AgentSkill } from '../skills.js';
import type { AgentEventSink, ReceiptSink, TranscriptEntry } from '../protocol.js';

/**
 * Real consumer of the agent kernel (H1-H5 vertical slice): iterative EVIDENCE-GAP
 * refinement on a completed run — parallel pro/contra literature sub-agents per top
 * hypothesis, then a tool-using parent loop that verifies gaps against the run's own
 * claims/relations and finishes with a schema-validated refinement report. Everything is
 * append-only: receipts per model call and retrieval, agent events on the run stream,
 * sessions + report as domain objects. No mock paths.
 */

export const CAPABILITY = 'refine-evidence-gaps';
const PURPOSE = `agent:${CAPABILITY}`;
// W-A: europepmc joins the hunting families — keyless, abstract-bearing biomed
// coverage; the gap-hunting sub-agents must not lose it when the OpenAlex keyless
// budget is exhausted (the observed vitamin-D failure mode).
const FAMILIES = ['openalex', 'arxiv', 'crossref', 'europepmc'] as const;

export const RefineResultSchema = z.object({
  summary: z.string().min(20),
  /** Empty is a legitimate honest outcome ("no material gaps found") — never forced. */
  evidenceGaps: z.array(z.object({
    hypothesisId: z.string().min(1),
    missing: z.string().min(10),
    suggestedQueries: z.array(z.string().min(4)).min(1).max(5),
    severity: z.enum(['high', 'medium', 'low']),
  })).max(10).default([]),
  counterEvidenceFound: z.array(z.object({
    hypothesisId: z.string().min(1),
    finding: z.string().min(5),
    sourceHint: z.string().optional(),
  })).default([]),
  refinedSuggestions: z.array(z.object({
    hypothesisId: z.string().min(1),
    suggestion: z.string().min(10),
  })).default([]),
});
export type RefineResult = z.infer<typeof RefineResultSchema>;

const SubagentFindingsSchema = z.object({
  findings: z.array(z.object({
    title: z.string().min(1),
    year: z.number().int().optional(),
    verdict: z.enum(['supports', 'contradicts', 'mixed', 'irrelevant']),
    note: z.string(),
  })).max(10).default([]),
  queriesUsed: z.array(z.string()).max(10).default([]),
});

export interface RefineDeps {
  store: Store;
  artifacts: ArtifactStore;
  provider: ModelProvider;
  sourceFor: (family: SourceFamily) => SourceAdapter;
  /** Directory for append-only session rollouts (H6 durability + resume). */
  rolloutDir: string;
  /** Skill directories by tier; defaults to repo `skills/` (builtin) + `<rolloutDir>/../skills` (user). */
  skillDirs?: Array<{ dir: string; tier: 'builtin' | 'project' | 'user' }>;
}

export interface RefineOptions {
  maxTurns?: number;
  /** Hypotheses each getting pro/contra sub-agents (default 2, capped at 3). */
  topK?: number;
  maxConcurrent?: number;
  /** Resume a persisted session (H6): replay its rollout transcript and continue the turn budget. */
  resumeSessionId?: string;
}

export interface RefineOutcome {
  sessionId: string;
  status: AgentLoopResult['status'];
  reportId?: string;
  result?: RefineResult;
  telemetry: AgentTelemetrySummary;
  subagentSessions: Array<{ label: string; sessionId: string; status: string }>;
  /** Names of skills actually injected into this session's system prompt (empty = none matched). */
  skillsUsed: string[];
  resumed: boolean;
  error?: string;
}

const head = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

export const runEvidenceGapRefinement = async (deps: RefineDeps, runId: string, opts: RefineOptions = {}): Promise<RefineOutcome> => {
  const run = deps.store.getRun(runId);
  if (run === null) throw new Error(`run not found: ${runId}`);
  const question = deps.store.getObject('question', run.questionId);
  if (question === null) throw new Error(`question not found for run ${runId}: ${run.questionId}`);
  const hypotheses = deps.store.listObjects('hypothesis', runId);
  if (hypotheses.length === 0) {
    throw new Error(`run ${runId} has no hypotheses — run the pipeline first (far research start / resume)`);
  }

  const topK = Math.max(1, Math.min(opts.topK ?? 2, 3));
  const topHypotheses = hypotheses.slice(0, topK);

  // --- event-first sink: the three agent events land on the run's append-only stream ---
  const emit: AgentEventSink = (ev) => {
    if (ev.type === 'session_started') {
      deps.store.appendEvent(runId, {
        type: 'agent_started',
        detail: {
          sessionId: ev.sessionId, capability: ev.capability, task: head(ev.task, 300), maxTurns: ev.maxTurns,
          ...(ev.parentSessionId !== undefined ? { parentSessionId: ev.parentSessionId } : {}),
        },
      });
    } else if (ev.type === 'tool_used') {
      deps.store.appendEvent(runId, {
        type: 'agent_tool_used',
        detail: { sessionId: ev.sessionId, turn: ev.turn, tool: ev.tool, ok: ev.ok, durationMs: ev.durationMs, ...(ev.summary !== undefined ? { summary: ev.summary } : {}) },
      });
    } else if (ev.type === 'session_finished') {
      deps.store.appendEvent(runId, { type: 'agent_finished', detail: { sessionId: ev.sessionId, status: ev.status, turns: ev.turns } });
    }
  };

  const recordReceipt: ReceiptSink = (partial) => {
    const receipt = ProvenanceReceipt.parse({ ...partial, id: newId('rcp'), runId, at: partial.at ?? new Date().toISOString() });
    deps.store.putObject('receipt', receipt);
    deps.store.appendEvent(runId, {
      type: 'receipt_recorded',
      stage: partial.stage,
      detail: receiptEventDetail(receipt),
      receiptId: receipt.id,
    });
  };

  // Unified model plane: the session serves from the run's CONFIGURED provider chain
  // (user model-config + failover, BP-4) and spends from the SAME receipt-derived
  // run budget the pipeline honors — an agent session on a run is not a budget escape hatch.
  const sessionProvider = resolveRunProvider(deps.store, run) ?? deps.provider;
  const sessionBudget = makeRunBudget(deps.store, runId);

  // --- tools (read-only over the run + live literature search) ---
  const makeTools = (): ToolRegistry => {
    const listHypotheses: AgentTool = {
      name: 'list_hypotheses',
      description: 'List this run\'s hypotheses: statement, mechanism, supporting/counter claim counts, testability.',
      inputSchema: z.object({}),
      async execute(): Promise<ToolResult> {
        const rows = hypotheses.map((h) => ({
          id: h.id, statement: h.statement, mechanism: h.mechanism,
          supportingClaims: h.supportingClaimIds.length, counterClaims: h.counterClaimIds.length,
          testability: h.testability,
        }));
        return { ok: true, data: { hypotheses: rows }, summary: `${rows.length} hypotheses` };
      },
    };

    const readEvidence: AgentTool = {
      name: 'read_evidence',
      description: 'Read this run\'s verified claims and evidence relations, optionally scoped to one hypothesis id.',
      inputSchema: z.object({ hypothesisId: z.string().min(1).optional() }),
      async execute(args: unknown): Promise<ToolResult> {
        const parsed = z.object({ hypothesisId: z.string().min(1).optional() }).parse(args);
        const relations = deps.store.listObjects('evidence_relation', runId)
          .filter((r) => parsed.hypothesisId === undefined || r.targetHypothesisId === parsed.hypothesisId)
          .slice(0, 40);
        let claims = deps.store.listObjects('claim', runId);
        if (parsed.hypothesisId !== undefined) {
          const h = hypotheses.find((x) => x.id === parsed.hypothesisId);
          const ids = new Set([...(h?.supportingClaimIds ?? []), ...(h?.counterClaimIds ?? [])]);
          claims = claims.filter((c) => ids.has(c.id));
        }
        return {
          ok: true,
          data: {
            claims: claims.slice(0, 40).map((c) => ({ id: c.id, text: head(c.text, 200), binding: c.bindingStatus })),
            relations: relations.map((r) => ({ id: r.id, relation: r.relation, strength: r.strength, rationale: head(r.rationale, 160) })),
          },
          summary: `${claims.length} claims, ${relations.length} relations`,
        };
      },
    };

    const searchSources: AgentTool = {
      name: 'search_sources',
      description: 'Search the live literature (openalex / arxiv / crossref) by scientific query; returns title, authors, venue, year, abstract excerpt.',
      inputSchema: z.object({
        query: z.string().min(2).max(300),
        families: z.array(z.enum(FAMILIES)).min(1).max(3).optional(),
        limit: z.number().int().min(1).max(10).default(5),
      }),
      summarize: (payload: unknown) => {
        const p = payload as { results?: unknown[]; errors?: unknown[] };
        const errCount = p?.errors?.length ?? 0;
        const n = p?.results?.length ?? 0;
        return `${n} records${errCount > 0 ? ` (+${errCount} family errors)` : ''}`;
      },
      async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
        const parsed = z.object({
          query: z.string().min(2).max(300),
          families: z.array(z.enum(FAMILIES)).min(1).max(3).optional(),
          limit: z.number().int().min(1).max(10).default(5),
        }).parse(args);
        const families = parsed.families ?? [...FAMILIES];
        const results: unknown[] = [];
        const errors: Array<{ family: string; error: string }> = [];
        for (const family of families) {
          try {
            const res = await deps.sourceFor(family).search(parsed.query, { limit: parsed.limit });
            ctx.recordReceipt({
              kind: 'source_retrieval',
              executionMode: 'live',
              stage: PURPOSE,
              redactionNote: 'query text and per-record normalized-content hashes retained; payloads not archived',
              sourceRetrieval: {
                family,
                query: parsed.query,
                httpStatus: res.httpStatus,
                resultCount: res.records.length,
                contentHashes: res.records.slice(0, 10).map((r) => canonicalSha256(JSON.stringify(r.normalized))),
              },
            });
            for (const r of res.records) {
              results.push({
                family, title: r.title, publicationYear: r.publicationYear ?? null,
                authors: r.authors.slice(0, 3), venue: r.venue ?? null,
                identifiers: r.identifiers, abstractExcerpt: r.abstractText !== undefined ? head(r.abstractText, 400) : null,
              });
            }
          } catch (e) {
            errors.push({ family, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return { ok: true, data: { query: parsed.query, results, ...(errors.length > 0 ? { errors } : {}) }, summary: `${results.length} records across ${families.join(',')}` };
      },
    };

    return new ToolRegistry().register(listHypotheses).register(readEvidence).register(searchSources);
  };

  const permissions = new PermissionEngine({
    rules: [
      { tool: 'list_hypotheses', effect: 'allow' },
      { tool: 'read_evidence', effect: 'allow' },
      { tool: 'search_sources', effect: 'allow' },
    ],
    defaultEffect: 'deny',
  });

  const baseConfig: Omit<AgentLoopConfig, 'task'> = {
    capability: CAPABILITY,
    systemPrompt: `You are a rigorous research-refinement agent in FAR-Lab (scientific hypothesis generation). You refine the evidence base of existing hypotheses: find evidence GAPS, hunt COUNTER-evidence, and propose precise follow-up literature queries. Hard constraints: cite only what tools actually returned (never invent titles, sources or numbers); preserve uncertainty explicitly; suggestedQueries must be concrete literature-search queries a scientist could run verbatim.`,
    maxTurns: opts.maxTurns ?? 8,
    resultSchema: RefineResultSchema,
    shouldAbort: () => deps.store.getRun(runId)?.cancelRequested === true,
  };

  // --- skills (H4 conditional injection): repo builtin tier + user tier, relevance-selected ---
  const skillDirs = deps.skillDirs ?? [
    { dir: path.join(process.cwd(), 'skills'), tier: 'builtin' as const },
    { dir: path.resolve(deps.rolloutDir, '..', 'skills'), tier: 'user' as const },
  ];
  const allSkills: AgentSkill[] = [];
  for (const { dir, tier } of skillDirs) allSkills.push(...loadSkillsFromDir(dir, tier).skills);
  const selectedSkills = selectSkills(
    `${question.text} refine evidence gaps counter evidence hypotheses ${topHypotheses.map((h) => h.statement).join(' ')}`,
    allSkills,
    { maxCount: 3, maxChars: 4000 },
  );
  const skillsSection = renderSkillsPrompt(selectedSkills);

  // --- session + rollout (H6): fresh session, or resume of a persisted one ---
  const sessionId = opts.resumeSessionId ?? newId('ags');
  let resumeCtx: {
    transcript: TranscriptEntry[];
    priorTurns: number;
    priorTurnRecords: AgentTurnRecord[];
    startedAt: string;
    openTurn?: { turn: number; tool: string; disposition: InterruptedTurnDisposition };
  } | undefined;
  if (opts.resumeSessionId !== undefined) {
    const { lines } = readRollout(rolloutFile(deps.rolloutDir, opts.resumeSessionId));
    if (lines.length === 0) throw new Error(`resume: no rollout found for session ${opts.resumeSessionId}`);
    const rec = reconstructSession(lines);
    if (rec.meta !== undefined && rec.meta.capability !== CAPABILITY) {
      throw new Error(`resume: session ${opts.resumeSessionId} belongs to capability '${rec.meta.capability}', not ${CAPABILITY}`);
    }
    resumeCtx = {
      transcript: rec.transcript,
      priorTurns: rec.turns.length > 0 ? Math.max(...rec.turns.map((t) => t.turn)) : 0,
      priorTurnRecords: rec.turns,
      startedAt: rec.meta?.at ?? new Date().toISOString(),
      ...(rec.openTurn !== undefined ? { openTurn: rec.openTurn } : {}),
    };
  }
  const telemetry = new SessionTelemetry();
  const mainDeps = {
    provider: sessionProvider,
    tools: makeTools(),
    permissions,
    sessionId,
    purpose: PURPOSE,
    emit,
    recordReceipt,
    budget: sessionBudget,
    telemetry,
    artifacts: deps.artifacts,
    rollout: openRolloutWriter(deps.rolloutDir, sessionId),
    rolloutFactory: (sid: string) => openRolloutWriter(deps.rolloutDir, sid),
  };

  // --- phase 1 (fresh runs only): parallel pro/contra literature sub-agents per top hypothesis.
  // On resume the sub-agent findings already live in the persisted transcript as context entries.
  let subResults: SubagentResult[] = [];
  if (resumeCtx === undefined) {
    const specs = topHypotheses.flatMap((h) => [
      {
        label: `pro:${h.id}`,
        task: `Search the literature FOR this hypothesis: "${h.statement}". Use search_sources with precise scientific queries (mechanism terms, population/phenomenon, method names). Finish with the sources that genuinely SUPPORT it (verdict 'supports'; 'mixed' when partial). If nothing relevant is found, return empty findings — never invent sources.`,
        toolNames: ['search_sources'],
        maxTurns: 4,
      },
      {
        label: `contra:${h.id}`,
        task: `Search the literature AGAINST this hypothesis: "${h.statement}". Hunt for contradicting results, failed replications, boundary conditions and competing mechanisms (verdict 'contradicts' or 'mixed'). If no counter-evidence is found, return empty findings and say so — absence of hits is a finding, not a failure.`,
        toolNames: ['search_sources'],
        maxTurns: 4,
      },
    ]);
    subResults = await runSubagents(
      // task is a placeholder — runSubagents replaces it per spec; only the base fields are shared.
      { ...baseConfig, task: 'literature pro/contra verification (per-sub-agent task overrides this)', resultSchema: SubagentFindingsSchema, maxTurns: 4 },
      mainDeps,
      specs,
      { maxConcurrent: opts.maxConcurrent ?? 3, maxDepth: 1 },
    );

    // Child sessions are audit objects too (startedAt derived from measured wall time).
    for (const sub of subResults) {
      const startedAt = new Date(Date.now() - sub.telemetry.wallMs).toISOString();
      deps.store.putObject('agent_session', AgentSession.parse({
        id: sub.sessionId, runId, capability: CAPABILITY, parentSessionId: sessionId,
        purpose: `${PURPOSE}:sub:${sub.label}`, status: sub.status === 'completed' ? 'completed' : 'failed',
        startedAt, endedAt: new Date().toISOString(),
        task: head(subsTaskFor(specs, sub.label), 2000), config: {}, turns: sub.turns,
        ...(sub.error !== undefined ? { lastError: sub.error } : {}),
      }));
    }
  }

  // --- phase 2: parent refinement loop over the run + sub-agent findings ---
  const claims = deps.store.listObjects('claim', runId);
  const relations = deps.store.listObjects('evidence_relation', runId);
  const cfg: AgentLoopConfig = {
    ...baseConfig,
    systemPrompt: `${baseConfig.systemPrompt}${skillsSection}`,
    task: `Refine the evidence base of run ${runId}: for each listed hypothesis, identify concrete evidence gaps and counter-evidence, verify against the run's own claims/relations with read_evidence, cross-check the sub-agent literature findings, and finish with the refinement report contract.`,
    initialTranscript: resumeCtx?.transcript,
    resume: resumeCtx !== undefined
      ? { priorTurns: resumeCtx.priorTurns, ...(resumeCtx.openTurn !== undefined ? { openTurn: resumeCtx.openTurn } : {}) }
      : undefined,
    contextEntries: [
      { label: 'research_question', payload: { text: question.text, background: head(question.background, 400), domain: question.scope.domain, goalType: question.goalType } },
      { label: 'hypotheses', payload: topHypotheses.map((h) => ({ id: h.id, statement: h.statement, mechanism: h.mechanism, uncertainties: h.uncertainties })) },
      { label: 'evidence_snapshot', payload: { claims: claims.slice(0, 30).map((c) => ({ id: c.id, text: head(c.text, 160), binding: c.bindingStatus })), relations: relations.slice(0, 30).map((r) => ({ relation: r.relation, strength: r.strength, target: r.targetHypothesisId ?? null })) } },
      ...subResults.map((s) => ({
        label: `subagent:${s.label}`,
        payload: { status: s.status, ...(s.result !== undefined ? s.result : { error: s.error ?? 'no result' }) },
      })),
    ],
  };

  const res = await runAgentLoop(cfg, mainDeps);

  const session = AgentSession.parse({
    id: sessionId, runId, capability: CAPABILITY, purpose: PURPOSE,
    status: res.status === 'completed' ? 'completed' : res.status === 'aborted' ? 'cancelled' : 'failed',
    startedAt: resumeCtx?.startedAt ?? new Date(Date.now() - telemetry.summary().wallMs).toISOString(),
    endedAt: new Date().toISOString(),
    task: head(cfg.task, 2000),
    config: { maxTurns: cfg.maxTurns ?? 8, topK, ...(resumeCtx !== undefined ? { resumed: true } : {}) },
    turns: [...(resumeCtx?.priorTurnRecords ?? []), ...res.turns],
    ...(res.error !== undefined ? { lastError: res.error } : {}),
  });
  deps.store.putObject('agent_session', session);

  let reportId: string | undefined;
  if (res.status === 'completed' && res.result !== undefined) {
    const parsed = RefineResultSchema.parse(res.result);
    reportId = newId('agr');
    deps.store.putObject('agent_report', AgentReport.parse({
      id: reportId, runId, sessionId, capability: CAPABILITY,
      createdAt: new Date().toISOString(), result: parsed, telemetry: telemetry.summary(),
    }));
  }

  return {
    sessionId,
    status: res.status,
    ...(reportId !== undefined ? { reportId } : {}),
    ...(res.result !== undefined ? { result: RefineResultSchema.parse(res.result) } : {}),
    telemetry: telemetry.summary(),
    subagentSessions: subResults.map((s) => ({ label: s.label, sessionId: s.sessionId, status: s.status })),
    skillsUsed: selectedSkills.map((s) => s.name),
    resumed: resumeCtx !== undefined,
    ...(res.error !== undefined ? { error: res.error } : {}),
  };
};

const subsTaskFor = (specs: Array<{ label: string; task: string }>, label: string): string =>
  specs.find((s) => s.label === label)?.task ?? label;
