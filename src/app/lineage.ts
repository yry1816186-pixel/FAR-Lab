import type { Store } from '../persistence/store.js';
import type { EvidenceRelation, HypothesisCandidate } from '../domain/index.js';

/**
 * Research Lineage (AVO fusion, G3): a typed, queryable view over the research
 * trajectory. The AVO paper's P_t = {(x_i, f(x_i))} generalizes here to runs
 * (revision chain), hypotheses (versions/status), evidence relations (support
 * AND counter), experiments, and causal revisions. Read-only assembly from the
 * Store — the lineage view owns no state and creates no second authority.
 *
 * Consumers: web timeline/lineage surfaces, CLI `far lineage`, supervisor
 * context expansion, export bundles (provenance completeness).
 */

export type LineageNodeKind =
  | 'run'
  | 'hypothesis'
  | 'evidence_relation'
  | 'experiment_spec'
  | 'experiment_run'
  | 'revision'
  | 'feedback';

export interface LineageNode {
  id: string;
  kind: LineageNodeKind;
  runId: string;
  /** Human-readable one-liner (statement / rationale / label). */
  label: string;
  /** Hypothesis versions carry their version number; runs their position in chain. */
  version?: number;
  status?: string;
  createdAt?: string;
}

export type LineageEdgeKind =
  | 'revised_into'      // run -> run (parentRunId chain)
  | 'counter_evidence'  // evidence_relation -> hypothesis (contradicts/weakens/fails_to_replicate/alternative_explanation)
  | 'support_evidence'  // evidence_relation -> hypothesis
  | 'caused_revision'   // feedback -> revision
  | 'revises';          // revision -> object it touched

export interface LineageEdge {
  kind: LineageEdgeKind;
  from: string;
  to: string;
}

export interface LineageGraph {
  rootRunId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

const COUNTER_RELATIONS = new Set([
  'contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation',
]);

/**
 * Build the trajectory graph rooted at rootRunId, following parentRunId both
 * directions so any run yields its whole revision family.
 */
export const buildLineageGraph = (opts: { store: Store; rootRunId: string }): LineageGraph => {
  const { store, rootRunId } = opts;
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];

  // ---- runs: the revision chain around the root ----
  // listRuns returns a projection without parentRunId; hydrate full docs.
  const allRuns = store
    .listRuns(1000)
    .map((r) => store.getRun(r.id))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const byParent = new Map<string, string[]>();
  for (const r of allRuns) {
    if (r.parentRunId) {
      byParent.set(r.parentRunId, [...(byParent.get(r.parentRunId) ?? []), r.id]);
    }
  }
  // collect the connected family: ancestors up + descendants down
  const family = new Set<string>();
  const walkUp = (id: string): void => {
    if (family.has(id)) return;
    family.add(id);
    const run = allRuns.find((r) => r.id === id);
    if (run?.parentRunId) walkUp(run.parentRunId);
  };
  const walkDown = (id: string): void => {
    for (const child of byParent.get(id) ?? []) {
      if (!family.has(child)) { family.add(child); walkDown(child); }
    }
  };
  walkUp(rootRunId);
  walkDown(rootRunId);

  for (const id of family) {
    const r = allRuns.find((x) => x.id === id)!;
    nodes.push({
      id, kind: 'run', runId: id,
      label: `run ${r.status} @ ${r.currentStage}`,
      status: r.status,
      createdAt: r.createdAt,
    });
    if (r.parentRunId && family.has(r.parentRunId)) {
      edges.push({ kind: 'revised_into', from: r.parentRunId, to: id });
    }
  }

  // ---- per-run scientific members ----
  for (const runId of family) {
    for (const h of store.listObjects('hypothesis', runId) as unknown as Array<Partial<HypothesisCandidate> & { id: string; statement: string; version: number; status: string }>) {
      nodes.push({
        id: h.id, kind: 'hypothesis', runId,
        label: h.statement.slice(0, 80),
        version: h.version,
        status: h.status,
      });
    }

    for (const rel of store.listObjects('evidence_relation', runId) as unknown as EvidenceRelation[]) {
      nodes.push({
        id: rel.id, kind: 'evidence_relation', runId,
        label: `${rel.relation}: ${rel.rationale.slice(0, 70)}`,
        createdAt: rel.createdAt,
      });
      const target = rel.targetHypothesisId ?? rel.targetClaimId;
      if (!target) continue;
      edges.push({
        kind: COUNTER_RELATIONS.has(rel.relation) ? 'counter_evidence' : 'support_evidence',
        from: rel.id, to: target,
      });
    }

    for (const spec of store.listObjects('experiment_spec', runId)) {
      nodes.push({
        id: spec.id, kind: 'experiment_spec', runId,
        label: `experiment spec v${(spec as { version?: number }).version ?? 0}`,
      });
    }
    for (const er of store.listObjects('experiment_run', runId)) {
      nodes.push({
        id: er.id, kind: 'experiment_run', runId,
        label: `experiment ${(er as { status?: string }).status ?? 'unknown'}`,
        status: (er as { status?: string }).status,
      });
    }

    for (const fb of store.listObjects('feedback', runId)) {
      nodes.push({
        id: fb.id, kind: 'feedback', runId,
        label: `feedback(${(fb as { source?: string }).source})`,
      });
    }
    for (const rev of store.listObjects('revision', runId)) {
      nodes.push({
        id: rev.id, kind: 'revision', runId,
        label: `revision ${(rev as { fromVersionLabel?: string }).fromVersionLabel}->${(rev as { toVersionLabel?: string }).toVersionLabel}`,
      });
      const trigger = (rev as { triggerFeedbackId?: string }).triggerFeedbackId;
      if (trigger) edges.push({ kind: 'caused_revision', from: trigger, to: rev.id });
      for (const op of (rev as { operations?: Array<{ objectId?: string }> }).operations ?? []) {
        if (op.objectId) edges.push({ kind: 'revises', from: rev.id, to: op.objectId });
      }
    }
  }

  return { rootRunId, nodes, edges };
};

/** Query helpers over the graph — the "queryable" half of G3. */

export const counterEvidenceFor = (graph: LineageGraph, hypothesisId: string): LineageNode[] => {
  const ids = new Set(
    graph.edges.filter((e) => e.kind === 'counter_evidence' && e.to === hypothesisId).map((e) => e.from),
  );
  return graph.nodes.filter((n) => ids.has(n.id));
};

export const hypothesisVersions = (graph: LineageGraph, baseStatementKey?: string): LineageNode[] =>
  graph.nodes
    .filter((n) => n.kind === 'hypothesis')
    .sort((a, b) => (a.version ?? 0) - (b.version ?? 0))
    .filter((n) => (baseStatementKey ? n.label.startsWith(baseStatementKey) : true));

export const revisionChain = (graph: LineageGraph): Array<{ feedback: string; revision: string }> =>
  graph.edges
    .filter((e) => e.kind === 'caused_revision')
    .map((e) => ({ feedback: e.from, revision: e.to }));
