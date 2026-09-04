import { z } from 'zod';
import { canonicalSha256 } from '../../shared/crypto.js';
import type { Store } from '../../persistence/store.js';
import type { AgentTool } from '../../agent/tool.js';
import type { RunKernelPlaneDeps } from '../capability-plane.js';
import { isRepresentative } from '../../pipeline/stages/shared.js';
import { FeedbackSignal } from '../../domain/feedback.js';
import { newId } from '../../domain/ids.js';

/**
 * Kernel capability registry (Ω ADR D5): the closed set of capabilities a
 * kernel-authored workflow step may invoke by name. Each spec owns its result
 * contract, its task construction from run state, and its capability-scoped
 * tools — the executor never invents tasks or schemas on the fly (P8: the
 * control logic stays deterministic; LLM judgment lives INSIDE steps).
 */

export interface KernelCapabilitySpec {
  name: string;
  systemPrompt: string;
  maxTurns?: number;
  /** Result contract persisted as the agent_report payload. */
  resultSchema: z.ZodType<Record<string, unknown>>;
  /** Read-only view of the run's current scientific state → task + context entries. */
  build: (store: Store, runId: string) => { task: string; contextEntries: Array<{ label: string; payload: unknown }> };
  /** Capability-scoped tools bound to this run's store/sources/receipts. */
  makeTools: (deps: RunKernelPlaneDeps) => AgentTool[];
  /**
   * Ω A4: materialize a completed report into the scientific layer (e.g. debate
   * counter-findings as FeedbackSignals for the human-review + revise loop).
   * Returns the number of objects written; absent = nothing to materialize.
   */
  materialize?: (store: Store, runId: string, report: { id: string; sessionId: string; result: Record<string, unknown> }) => number;
}

// ---------------------------------------------------------------------------
// counter-evidence-debate: adversarial review of the ranked hypothesis set.
// ---------------------------------------------------------------------------

const CounterEvidenceDebateSchema = z.object({
  verdicts: z.array(z.object({
    hypothesisId: z.string().min(1),
    verdict: z.enum(['supported', 'contradicted', 'mixed', 'insufficient_evidence']),
    counterFindings: z.array(z.object({
      statement: z.string().min(1),
      relation: z.enum(['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation']),
      sourceRef: z.string().min(1),
    })).default([]),
    uncertainties: z.array(z.string().min(1)).default([]),
  })).min(1),
  discriminatingObservations: z.array(z.string().min(1)).default([]),
  honestLimits: z.string().min(1),
});

const SearchSourcesArgs = z.object({
  query: z.string().min(3),
  families: z.array(z.enum(['openalex', 'arxiv', 'crossref', 'europepmc'])).min(1).default(['openalex']),
  limit: z.number().int().min(1).max(20).default(5),
});

const head = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

const counterEvidenceDebate: KernelCapabilitySpec = {
  name: 'counter-evidence-debate',
  systemPrompt:
    'You are the adversarial reviewer (skeptic seat) of a scientific hypothesis-generation system. Your job is to ATTACK the ranked hypotheses: hunt contradicting results, failed replications, boundary conditions and competing mechanisms in the live literature. Hard constraints: cite only what search_sources actually returned (never invent titles, DOIs or numbers); empty results are a finding, report them as such; "insufficient_evidence" is an honest verdict; the goal is discriminating evidence, not rhetoric.',
  maxTurns: 10,
  resultSchema: CounterEvidenceDebateSchema,
  build: (store, runId) => {
    const question = store.listObjects('question', runId).at(-1);
    const hypotheses = store.listObjects('hypothesis', runId).filter(isRepresentative).slice(0, 5);
    const task = `Adversarially review the top hypotheses of run ${runId} for the research question below. For EACH hypothesis: search the literature for counter-evidence (contradictions, failed replications, boundary conditions, competing mechanisms), then deliver a verdict with concrete counter-findings and uncertainties. Finish with discriminating observations that would separate the competing explanations experimentally, and state honestly what your review could not establish.`;
    return {
      task,
      contextEntries: [
        {
          label: 'research_question',
          payload: question === undefined
            ? { note: 'no question object persisted' }
            : { text: question.text, domain: question.scope.domain, goalType: question.goalType },
        },
        {
          label: 'hypotheses_under_review',
          payload: hypotheses.map((h) => ({ id: h.id, statement: h.statement, mechanism: h.mechanism })),
        },
      ],
    };
  },
  makeTools: (deps) => {
    const listHypotheses: AgentTool = {
      name: 'list_hypotheses',
      description: 'List the run\'s representative hypotheses (id, statement, mechanism, uncertainties).',
      inputSchema: z.object({}),
      riskClass: 'read',
      async execute() {
        const hs = deps.store.listObjects('hypothesis', deps.runId).filter(isRepresentative);
        return {
          ok: true,
          data: { hypotheses: hs.map((h) => ({ id: h.id, statement: h.statement, mechanism: h.mechanism, uncertainties: h.uncertainties })) },
          summary: `${hs.length} representative hypotheses`,
        };
      },
    };
    const readEvidence: AgentTool = {
      name: 'read_evidence',
      description: 'Read the run\'s verified claims and evidence relations for context (what the pipeline already established).',
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
      riskClass: 'read',
      async execute(args) {
        const parsed = z.object({ limit: z.number().int() }).parse(args ?? { limit: 20 });
        const claims = deps.store.listObjects('claim', deps.runId).slice(0, parsed.limit);
        const relations = deps.store.listObjects('evidence_relation', deps.runId).slice(0, parsed.limit);
        return {
          ok: true,
          data: {
            claims: claims.map((c) => ({ id: c.id, text: head(c.text, 160), binding: c.bindingStatus })),
            relations: relations.map((r) => ({ relation: r.relation, strength: r.strength, target: r.targetHypothesisId ?? null })),
          },
          summary: `${claims.length} claims / ${relations.length} relations`,
        };
      },
    };
    const searchSources: AgentTool = {
      name: 'search_sources',
      description: 'Search live academic sources (openalex | arxiv | crossref | europepmc). Returns title/authors/year/identifiers/abstract excerpt.',
      inputSchema: SearchSourcesArgs,
      riskClass: 'read',
      async execute(args) {
        const parsed = SearchSourcesArgs.parse(args);
        const results: Array<Record<string, unknown>> = [];
        const errors: Array<{ family: string; error: string }> = [];
        for (const family of parsed.families) {
          try {
            const res = await deps.sourceFor(family).search(parsed.query, { limit: parsed.limit });
            deps.recordReceipt({
              kind: 'source_retrieval',
              executionMode: 'live',
              stage: 'agent:counter-evidence-debate',
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
        return {
          ok: true,
          data: { query: parsed.query, results, ...(errors.length > 0 ? { errors } : {}) },
          summary: `${results.length} records across ${parsed.families.join(',')}${errors.length > 0 ? ` (${errors.length} family errors)` : ''}`,
        };
      },
    };
    return [listHypotheses, readEvidence, searchSources];
  },
  materialize: (store, runId, report) => {
    // Debate counter-findings become FeedbackSignals (source 'tool_result'): the
    // feedback stage records them, the revise stage consumes them into causal
    // Revisions — the debate's evidence flows through the SAME verification-
    // disciplined rails as every other signal, never a private side channel.
    const verdicts = Array.isArray(report.result.verdicts) ? report.result.verdicts : [];
    let written = 0;
    for (const v of verdicts) {
      if (v === null || typeof v !== 'object') continue;
      const findings = Array.isArray(v.counterFindings) ? v.counterFindings : [];
      for (const f of findings) {
        if (f === null || typeof f !== 'object') continue;
        const statement = typeof f.statement === 'string' ? f.statement.trim() : '';
        if (statement === '') continue;
        const target = typeof v.hypothesisId === 'string' && /^hyp_/.test(v.hypothesisId)
          ? { kind: 'hypothesis' as const, id: v.hypothesisId }
          : undefined;
        store.putObject('feedback', FeedbackSignal.parse({
          id: newId('fbk'),
          runId,
          source: 'tool_result',
          content: `[counter-evidence-debate:${f.relation ?? 'unknown'}] ${statement} (source: ${typeof f.sourceRef === 'string' ? f.sourceRef : 'unreferenced'})`,
          structured: { finding: f, verdict: v.verdict ?? 'unknown', capability: 'counter-evidence-debate', reportId: report.id, sessionId: report.sessionId },
          ...(target !== undefined ? { target } : {}),
          provenance: `agent:counter-evidence-debate report=${report.id} session=${report.sessionId}`,
          receivedAt: new Date().toISOString(),
        }));
        written += 1;
      }
    }
    return written;
  },
};

export const KERNEL_CAPABILITIES: readonly KernelCapabilitySpec[] = [counterEvidenceDebate];

export const KERNEL_CAPABILITY_NAMES: readonly string[] = KERNEL_CAPABILITIES.map((c) => c.name);

export const resolveKernelCapability = (name: string): KernelCapabilitySpec | undefined =>
  KERNEL_CAPABILITIES.find((c) => c.name === name);
