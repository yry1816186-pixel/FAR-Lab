import { describe, expect, it } from 'vitest';
import { dagNeighbors, layoutPlanDag, parseBudget, DAG_NODE_H, DAG_NODE_W } from '../web/src/viz/plan-viz';
import type { PlanStep, ResearchPlan } from '../web/src/api/types';

const step = (id: string, over: Partial<PlanStep> = {}): PlanStep => ({
  id,
  title: `步骤 ${id}`,
  kind: 'data_analysis',
  method: '',
  ...over,
});

describe('layoutPlanDag', () => {
  it('layers by longest path; plan order breaks ties within a layer', () => {
    const a = step('a');
    const b = step('b');
    const c = step('c', { dependsOn: ['a', 'b'] });
    const d = step('d');
    const { nodes } = layoutPlanDag([a, b, c, d]);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('a')!.layer).toBe(0);
    expect(byId.get('b')!.layer).toBe(0);
    expect(byId.get('d')!.layer).toBe(0);
    expect(byId.get('c')!.layer).toBe(1);
    // a and b keep plan order (row 0/1); same-layer d follows
    expect(byId.get('a')!.row).toBe(0);
    expect(byId.get('b')!.row).toBe(1);
    expect(byId.get('d')!.row).toBe(2);
    // index follows the plan's own order, not layout
    expect(byId.get('d')!.index).toBe(4);
  });

  it('routes elbow edges from dep right edge to dependent left edge', () => {
    const a = step('a');
    const b = step('b', { dependsOn: ['a'] });
    const { edges } = layoutPlanDag([a, b]);
    expect(edges).toHaveLength(1);
    const e = edges[0]!;
    expect(e.invalid).toBe(false);
    expect(e.points[0]).toEqual({ x: DAG_NODE_W, y: DAG_NODE_H / 2 });
    expect(e.points.at(-1)!.x).toBe(DAG_NODE_W + 70); // b sits at layer 1: x = 1 * (node+gap)
  });

  it('flags invalid dependency refs as warning stubs without dropping them', () => {
    const b = step('b', { dependsOn: ['task_ghost'] });
    const { nodes, edges } = layoutPlanDag([b]);
    expect(nodes[0]!.invalidDeps).toEqual(['task_ghost']);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.invalid).toBe(true);
    expect(edges[0]!.from).toBe('task_ghost');
  });

  it('sizes the canvas from the widest layer and deepest chain', () => {
    const a = step('a');
    const b = step('b', { dependsOn: ['a'] });
    const c = step('c', { dependsOn: ['b'] });
    const { width, height } = layoutPlanDag([a, b, c]);
    expect(width).toBe(3 * DAG_NODE_W + 2 * 70); // 3 layers
    expect(height).toBe(DAG_NODE_H); // every layer has 1 node
  });
});

describe('dagNeighbors', () => {
  it('returns full transitive upstream and downstream, not just direct deps', () => {
    const a = step('a');
    const b = step('b', { dependsOn: ['a'] });
    const c = step('c', { dependsOn: ['b'] });
    const d = step('d', { dependsOn: ['c'] });
    const up = dagNeighbors([a, b, c, d], 'c');
    expect(up.upstream).toEqual(new Set(['b', 'a']));
    expect(up.downstream).toEqual(new Set(['d']));
    const fromRoot = dagNeighbors([a, b, c, d], 'a');
    expect(fromRoot.upstream).toEqual(new Set());
    expect(fromRoot.downstream).toEqual(new Set(['b', 'c', 'd']));
  });
});

describe('parseBudget', () => {
  it('parses leading dollar amounts with commas and annotations', () => {
    const b = parseBudget([
      step('a', { estimatedCost: '$15,000 (Data transfer fees)' }),
      step('b', { estimatedCost: '$40,000 (Reagents, lab labor)' }),
    ]);
    expect(b.segments.map((s) => s.usd)).toEqual([15000, 40000]);
    expect(b.totalUsd).toBe(55000);
    expect(b.unparsed).toEqual([]);
  });

  it('honestly reports non-dollar cost texts instead of guessing', () => {
    const b = parseBudget([
      step('a', { estimatedCost: 'TBD' }),
      step('b', { estimatedCost: '2 GPU-hours' }),
      step('c', { estimatedCost: '$5,000' }),
      step('d', {}), // no cost at all
    ]);
    expect(b.segments.map((s) => s.usd)).toEqual([5000]);
    expect(b.unparsed.map((s) => s.stepIndex)).toEqual([1, 2]);
    expect(b.totalUsd).toBe(5000);
  });
});

describe('decisionExits shape', () => {
  it('exposes exactly the three verdict criteria from the plan', async () => {
    const { decisionExits } = await import('../web/src/viz/plan-viz');
    const plan = {
      decisionRules: {
        successCriterion: 'S',
        weakeningCriterion: 'W',
        falsificationCriterion: 'F',
        stopCriterion: 'Stop',
      },
    } as ResearchPlan;
    const exits = decisionExits(plan);
    expect(exits.map((e) => e.kind)).toEqual(['success', 'weakening', 'falsification']);
    expect(exits.map((e) => e.criterion)).toEqual(['S', 'W', 'F']);
  });
});
