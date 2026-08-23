/**
 * Pure builders for the research-plan visualizations (VIZ V2). No React, no DOM:
 * topological layering for the step DAG, honest budget parsing (a cost that
 * doesn't parse is shown as text, never coerced into a number), and the
 * decision-exit structure derived from the plan's four real criteria.
 */
import type { PlanStep, ResearchPlan } from '../api/types';

// ---- step DAG layout (longest-path layering, deterministic) ----

export interface DagNode {
  id: string;
  /** Human index in the plan's step order (1-based) — the label users see. */
  index: number;
  title: string;
  kind: PlanStep['kind'];
  /** Layer = longest path from any source; steps with no deps sit at layer 0. */
  layer: number;
  /** Position within its layer (topological tiebreak: plan order). */
  row: number;
  x: number;
  y: number;
  /** Deps that reference ids not present in the plan (fabrication artifacts). */
  invalidDeps: string[];
}

export interface DagEdge {
  from: string;
  to: string;
  /** True when `from` is not a real step id — drawn as a warning stub. */
  invalid: boolean;
  /** Shortest orthogonal path points for the SVG polyline. */
  points: { x: number; y: number }[];
}

export interface DagLayout {
  nodes: DagNode[];
  edges: DagEdge[];
  width: number;
  height: number;
}

export const DAG_NODE_W = 190;
export const DAG_NODE_H = 52;
const GAP_X = 70;
const GAP_Y = 26;

/**
 * Deterministic layered layout: layer(v) = 0 for sources, else 1 + max(layer of
 * deps). Cycles cannot occur in a valid plan; if the data contains one, the
 * affected nodes land at layer cap and the edge still renders — we never throw
 * away the user's data for a layout problem.
 */
export function layoutPlanDag(steps: PlanStep[]): DagLayout {
  const byId = new Map(steps.map((s, i) => [s.id, { step: s, index: i + 1 }] as const));
  const layerOf = new Map<string, number>();
  const layerOfStep = (id: string, seen: Set<string>): number => {
    const known = layerOf.get(id);
    if (known !== undefined) return known;
    const entry = byId.get(id);
    if (entry === undefined || seen.has(id)) return 0; // invalid ref or cycle guard
    seen.add(id);
    let layer = 0;
    for (const dep of entry.step.dependsOn ?? []) {
      if (byId.has(dep)) layer = Math.max(layer, layerOfStep(dep, seen) + 1);
    }
    layerOf.set(id, layer);
    return layer;
  };
  for (const s of steps) layerOfStep(s.id, new Set());

  const maxLayer = Math.max(0, ...steps.map((s) => layerOf.get(s.id) ?? 0));
  const perLayer = new Map<number, PlanStep[]>();
  for (const s of steps) {
    const l = layerOf.get(s.id) ?? 0;
    const arr = perLayer.get(l) ?? [];
    arr.push(s); // plan order preserved within a layer
    perLayer.set(l, arr);
  }

  const pos = new Map<string, { x: number; y: number; row: number; layer: number }>();
  for (let l = 0; l <= maxLayer; l++) {
    const arr = perLayer.get(l) ?? [];
    arr.forEach((s, row) => {
      pos.set(s.id, { x: l * (DAG_NODE_W + GAP_X), y: row * (DAG_NODE_H + GAP_Y), row, layer: l });
    });
  }

  const nodes: DagNode[] = steps.map((s) => {
    const p = pos.get(s.id)!;
    return {
      id: s.id,
      index: byId.get(s.id)!.index,
      title: s.title,
      kind: s.kind,
      layer: p.layer,
      row: p.row,
      x: p.x,
      y: p.y,
      invalidDeps: (s.dependsOn ?? []).filter((d) => !byId.has(d)),
    };
  });

  const centerY = (id: string): number => {
    const p = pos.get(id);
    return p !== undefined ? p.y + DAG_NODE_H / 2 : 0;
  };
  const edges: DagEdge[] = [];
  for (const s of steps) {
    for (const dep of s.dependsOn ?? []) {
      if (!byId.has(dep)) {
        // fabrication artifact: stub on the left edge of the dependent node
        const p = pos.get(s.id)!;
        edges.push({
          from: dep,
          to: s.id,
          invalid: true,
          points: [
            { x: p.x - 28, y: centerY(s.id) },
            { x: p.x, y: centerY(s.id) },
          ],
        });
        continue;
      }
      const from = pos.get(dep)!;
      const to = pos.get(s.id)!;
      const x1 = from.x + DAG_NODE_W;
      const y1 = from.y + DAG_NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + DAG_NODE_H / 2;
      const mid = (x1 + x2) / 2;
      edges.push({ from: dep, to: s.id, invalid: false, points: [{ x: x1, y: y1 }, { x: mid, y: y1 }, { x: mid, y: y2 }, { x: x2, y: y2 }] });
    }
  }

  const width = (maxLayer + 1) * DAG_NODE_W + maxLayer * GAP_X;
  const height = Math.max(...[...perLayer.values()].map((arr) => arr.length)) * DAG_NODE_H
    + (Math.max(...[...perLayer.values()].map((arr) => arr.length)) - 1) * GAP_Y;
  return { nodes, edges, width, height };
}

/** Upstream + downstream transitive closure of a node (hover highlighting). */
export function dagNeighbors(steps: PlanStep[], focusId: string): { upstream: Set<string>; downstream: Set<string> } {
  const depsOf = new Map(steps.map((s) => [s.id, s.dependsOn ?? []] as const));
  const upstream = new Set<string>();
  const upStack = [...(depsOf.get(focusId) ?? [])];
  while (upStack.length > 0) {
    const id = upStack.pop()!;
    if (upstream.has(id) || !depsOf.has(id)) continue;
    upstream.add(id);
    upStack.push(...(depsOf.get(id) ?? []));
  }
  const downstream = new Set<string>();
  const dsStack = steps.filter((s) => (s.dependsOn ?? []).includes(focusId)).map((s) => s.id);
  while (dsStack.length > 0) {
    const id = dsStack.pop()!;
    if (downstream.has(id)) continue;
    downstream.add(id);
    dsStack.push(...steps.filter((s) => (s.dependsOn ?? []).includes(id)).map((s) => s.id));
  }
  return { upstream, downstream };
}

// ---- budget (honest parsing of free-text costs) ----

export interface BudgetSegment {
  stepId: string;
  stepIndex: number;
  title: string;
  /** Parsed leading dollar amount; absent when the text doesn't parse. */
  usd: number;
  /** The verbatim cost string (tooltip + fallback rendering). */
  raw: string;
}

export interface Budget {
  segments: BudgetSegment[];
  totalUsd: number;
  /** Steps whose cost text did not parse — rendered verbatim below the bar. */
  unparsed: BudgetSegment[];
}

const USD_RE = /\$\s*([\d,]+(?:\.\d+)?)/;

/**
 * Only a leading $-amount parses ("$15,000 (Reagents…)"). Anything else
 * ("TBD", "2 GPU-hours") is honest unparsed text — no unit guessing.
 */
export function parseBudget(steps: PlanStep[]): Budget {
  const segments: BudgetSegment[] = [];
  const unparsed: BudgetSegment[] = [];
  steps.forEach((s, i) => {
    if (s.estimatedCost === undefined) return;
    const seg: BudgetSegment = { stepId: s.id, stepIndex: i + 1, title: s.title, usd: 0, raw: s.estimatedCost };
    const m = USD_RE.exec(s.estimatedCost);
    if (m !== null) {
      seg.usd = Number(m[1]!.replace(/,/g, ''));
      if (Number.isFinite(seg.usd)) segments.push(seg);
      else unparsed.push(seg);
    } else {
      unparsed.push(seg);
    }
  });
  return { segments, totalUsd: segments.reduce((a, s) => a + s.usd, 0), unparsed };
}

// ---- decision exits (the plan's four real criteria as a structure) ----

export type DecisionExitKind = 'success' | 'weakening' | 'falsification';

export interface DecisionExit {
  kind: DecisionExitKind;
  criterion: string;
}

export function decisionExits(plan: ResearchPlan): DecisionExit[] {
  return [
    { kind: 'success', criterion: plan.decisionRules.successCriterion },
    { kind: 'weakening', criterion: plan.decisionRules.weakeningCriterion },
    { kind: 'falsification', criterion: plan.decisionRules.falsificationCriterion },
  ];
}
