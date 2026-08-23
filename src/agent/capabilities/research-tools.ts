import { z } from 'zod';
import type { Store } from '../../persistence/store.js';
import type { ArtifactStore } from '../../shared/ports.js';
import { queryRunEvents, previewFor } from '../research-query.js';
import { runExploration } from '../exploration-runner.js';
import type { SidecarFactory, Sidecar } from '../../experiment/python.js';
import { createSidecar } from '../../experiment/python.js';

/**
 * Research-tools capability (AVO fusion wiring): the G4/G5/G6 planes exposed
 * as standard AgentTool-shaped objects so ANY kernel session registers and
 * uses them directly — no adapter layer, no second surface to maintain.
 *
 * Shape note: these are plain objects matching the AgentTool interface members
 * that matter at registration time (name/description/inputSchema/execute/
 * riskClass); they do not import the ToolRegistry class to keep this module
 * usable from both server actions and kernel sessions without cycles.
 */

export interface ResearchToolDeps {
  store: Store;
  runId: string;
  artifacts: ArtifactStore;
  /** Injectable sidecar factory; production default createSidecar(). */
  sidecarFactory?: () => Sidecar;
}

// ---- G6: event queries as a tool ----

export const query_run_events = {
  name: 'query_run_events',
  description: 'Query this run\'s append-only event history by kind (bounded; tail-biased). Kinds: stage_started, stage_done, stage_failed, note, receipt_recorded, agent_tool_used, run_cancelled.',
  inputSchema: z.object({
    kinds: z.array(z.string().min(1)).min(1),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  riskClass: 'read' as const,
};

// ---- G5: pass-by-reference previews as a tool ----

export const preview_ref = {
  name: 'preview_ref',
  description: 'Bounded preview of a referenced payload (artifact ref / row id): returns {ref, preview, chars, truncated}; full payload is NOT inlined — expand explicitly only when needed.',
  inputSchema: z.object({
    ref: z.string().min(1),
    kind: z.string().min(1),
    payload: z.unknown(),
    maxChars: z.number().int().min(20).max(2000).default(400),
  }),
  riskClass: 'read' as const,
};

// ---- G4: exploratory CodeAct as a tool ----

export const makeExplorationTool = (): {
  name: string;
  description: string;
  inputSchema: z.ZodType<{ purpose: string; code: string }>;
  riskClass: 'execute';
} => ({
  name: 'explore_code',
  description: 'Run gated exploratory Python analysis in the sandboxed family runtime (restricted namespace: statistics/math/json/re/numpy prebound; no os/sys/network/exec). Outputs are CANDIDATE findings — never confirmatory facts. Use for quick numeric checks on retrieved data before drafting hypotheses.',
  inputSchema: z.object({
    purpose: z.string().min(8).max(500),
    code: z.string().min(1).max(8000),
  }),
  riskClass: 'execute',
});

// Real implementations delegating to the underlying modules. Kept separate from
// the schema objects above so tests can call them with injected deps while the
// tool objects stay serializable descriptors.

export const wireResearchTools = (
  deps: ResearchToolDeps,
): Array<{
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  riskClass: 'read' | 'execute';
  summarize?: (payload: unknown) => string;
  execute: (args: unknown) => Promise<{ ok: boolean; data?: unknown; summary?: string; error?: string }>;
}> => [
  {
    name: query_run_events.name,
    description: query_run_events.description,
    inputSchema: query_run_events.inputSchema,
    riskClass: 'read',
    summarize: (payload) => {
      const p = payload as { events?: unknown[]; truncated?: boolean };
      return `${p?.events?.length ?? 0} events${p?.truncated ? ' (truncated)' : ''}`;
    },
    async execute(args) {
      try {
        const parsed = (query_run_events.inputSchema as z.ZodType<{ kinds: string[]; limit?: number }>).parse(args);
        const result = queryRunEvents(deps.store, { runId: deps.runId, kinds: parsed.kinds, ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}) });
        return { ok: true, data: result, summary: `${result.events.length} events${result.truncated ? ' (truncated)' : ''}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: preview_ref.name,
    description: preview_ref.description,
    inputSchema: preview_ref.inputSchema,
    riskClass: 'read',
    summarize: (payload) => {
      const p = payload as { truncated?: boolean; chars?: number };
      return `preview${p?.truncated ? ' (truncated)' : ''} of ${p?.chars ?? '?'} chars`;
    },
    async execute(args) {
      try {
        const parsed = (preview_ref.inputSchema as z.ZodType<{ ref: string; kind: string; payload: unknown; maxChars: number }>).parse(args);
        const p = previewFor({ ref: parsed.ref, kind: parsed.kind, payload: parsed.payload }, { maxChars: parsed.maxChars });
        return { ok: true, data: p, summary: `${p.chars} chars${p.truncated ? ' (truncated)' : ''}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  (() => {
    // exploration tool bound to deps; sidecar spawned per call (same lifecycle
    // as runExploration's own management).
    const sidecarFactory: SidecarFactory = deps.sidecarFactory ?? (() => createSidecar());
    return {
      name: 'explore_code',
      description: makeExplorationTool().description,
      inputSchema: makeExplorationTool().inputSchema,
      riskClass: 'execute' as const,
      summarize: (payload) => {
        const p = payload as { ok?: boolean; stdout?: string };
        return `${p?.ok ? 'completed' : 'failed'}: ${String(p?.stdout ?? '').slice(0, 80)}`;
      },
      async execute(args) {
        try {
          const parsed = (makeExplorationTool().inputSchema as z.ZodType<{ purpose: string; code: string }>).parse(args);
          const r = await runExploration({
            store: deps.store,
            runId: deps.runId,
            artifacts: deps.artifacts,
            purpose: parsed.purpose,
            code: parsed.code,
            maxRuntimeMs: 120_000,
            sidecarFactory,
          });
          return {
            ok: true,
            data: {
              ok: r.execution.ok,
              stdout: r.execution.stdout ?? '',
              errorKind: r.execution.errorKind,
              errorMessage: r.execution.errorMessage,
              artifactRef: r.artifactRef,
              gateViolations: [],
            },
            summary: `${r.execution.ok ? 'completed' : `failed (${r.execution.errorKind})`}: ${String(r.execution.stdout ?? '').slice(0, 80)}`,
          };
        } catch (e) {
          // Gate rejections surface their violation codes so the model can fix
          // the code instead of guessing.
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, error: msg };
        }
      },
    };
  })(),
];
