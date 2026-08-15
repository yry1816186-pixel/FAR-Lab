/**
 * graph_subtree.ts 分支覆盖率补全测试。
 *
 * graph_subtree.ts 提供 getSubtree(db, rootVerdictId) 和 getSubtreeByChainHead(db, headHash)。
 * 当前覆盖率 line=80.65%, branch=50% — 缺少以下分支：
 *   1. BFS 遍历多节点子树（正常路径·收集多个可达节点 + edges）
 *   2. rootVerdictId 不存在 → 空子树
 *   3. 循环边（A→B→A）不无限循环（visited 去重）
 *   4. getSubtreeByChainHead: call_record 不存在 → 空子树
 *   5. getSubtreeByChainHead: 完整路径（call_record → evidence → verdict → subtree）
 *   6. getSubtreeByChainHead: hash 存在但无 evidence_log 关联 → 空子树
 *   7. getSubtreeByChainHead: evidence 存在但无 verdict_node → 空子树
 *   8. fetchNode: node 不存在 → null → continue（不添加到 nodes）
 *   9. node DTO 字段映射正确
 *  10. edge DTO 字段映射正确
 *
 * 单一真实依赖：真实 better-sqlite3 :memory: DB + appendRecord + appendEvidenceLog + recordVerdict。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { getSubtree, getSubtreeByChainHead } from '../../src/api/internal/graph_subtree.ts';
import {
  appendEvidenceLog,
  appendRecord,
  GENESIS_PREV_HASH,
} from '../../src/evidence_log/index.ts';
import {
  recordVerdict,
  supersedeVerdict,
} from '../../src/falsifiability/index.ts';
import type {
  FalsificationSpec,
  RecordVerdictArgs,
  SourceAnchor,
  ThresholdSpec,
  VerdictTracePersisted,
} from '../../src/falsifiability/index.ts';
import { FIXTURE_VERDICT_TRACE } from '../falsifiability/_verdict_trace_fixture.ts';

// ---------- 共享 helpers ----------

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const BASE_SPEC: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const BASE_THRESHOLD: ThresholdSpec = { semantics: 'gt', value: 0.85 };

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * ChainHeadTracker 跟踪 evidence_log append-only hash 链的当前 head。
 * 每次 appendRecord 后更新 head → 下次 appendRecord 用当前 head 作 prevHash。
 */
class ChainHeadTracker {
  private head: string = GENESIS_PREV_HASH;

  get current(): string {
    return this.head;
  }

  appendAndEvidence(
    db: Database.Database,
    evidenceId: string,
  ): { readonly seq: number; readonly currentHash: string } {
    const record = appendRecord(
      db,
      {
        stageId: 'stage3_hypothesis',
        cred: {
          modelId: 'offline-replay-fixture',
          dashscopeRequestId: null,
          reproHash: 'a'.repeat(64),
          gitCommitSha: SOURCE_ANCHOR.gitCommitSha,
          isoTimestamp: SOURCE_ANCHOR.isoTimestamp,
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        prevHash: this.head,
      },
      {
        requestPayload: '{}',
        responsePayload: '{}',
        finishReason: 'stop',
        usageTokensTotal: 0,
      },
      { providerProfile: 'offline_replay' },
    );
    this.head = record.currentHash;
    appendEvidenceLog(db, {
      evidenceId,
      callRecordSeq: record.seq,
      evidencePayload: { claim: 'graph_subtree fixture' },
      sourceAnchor: SOURCE_ANCHOR,
    });
    return { seq: record.seq, currentHash: record.currentHash };
  }
}

function makeVerdictArgs(
  evidenceId: string,
  verdict: RecordVerdictArgs['verdict'],
  trace: VerdictTracePersisted = FIXTURE_VERDICT_TRACE,
  opts?: {
    readonly parentVerdictId?: string | null;
    readonly nodeKind?: string;
    readonly metricValue?: number | null;
    readonly conflictingEvidenceCount?: number;
    readonly scopeSlipText?: string | null;
    readonly untestedReason?: string | null;
  },
): RecordVerdictArgs {
  return {
    evidenceId,
    parentVerdictId: opts?.parentVerdictId ?? null,
    nodeKind: (opts?.nodeKind as RecordVerdictArgs['nodeKind']) ?? 'hypothesis',
    verdict,
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
    metricValue: opts?.metricValue ?? null,
    conflictingEvidenceCount: opts?.conflictingEvidenceCount ?? 0,
    scopeSlipText: opts?.scopeSlipText ?? null,
    untestedReason: opts?.untestedReason ?? null,
    sourceAnchor: SOURCE_ANCHOR,
    replayProver: null,
    verdictTrace: trace,
  };
}

function insertEdge(
  db: Database.Database,
  fromNode: string,
  toNode: string,
  edgeKind: string = 'supports',
  edgeId?: string,
): void {
  const eid = edgeId ?? `edge-${fromNode}-${toNode}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO evidence_edges (edge_id, from_node, to_node, edge_kind, weight, source_anchor, prev_hash, current_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eid,
    fromNode,
    toNode,
    edgeKind,
    0.5,
    JSON.stringify(SOURCE_ANCHOR),
    'g'.repeat(64),
    'h'.repeat(64),
    '2026-06-27T00:00:00.000Z',
  );
}

// ---------- getSubtree 测试 ----------

test('getSubtree: rootVerdictId 不存在 → 空子树（rootId 正确·nodes/edges 空）', () => {
  const db = openDb();
  try {
    const subtree = getSubtree(db, 'nonexistent-verdict');
    assert.equal(subtree.rootId, 'nonexistent-verdict');
    assert.equal(subtree.nodes.length, 0);
    assert.equal(subtree.edges.length, 0);
  } finally {
    db.close();
  }
});

test('getSubtree: 单节点（无出边）→ 1 node + 0 edges', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-single');
    const v = recordVerdict(db, makeVerdictArgs('ev-single', 'CONFIRMED'));
    const subtree = getSubtree(db, v.verdictId);
    assert.equal(subtree.rootId, v.verdictId);
    assert.equal(subtree.nodes.length, 1);
    assert.equal(subtree.edges.length, 0);
  } finally {
    db.close();
  }
});

test('getSubtree: BFS 多节点子树（root → child1, child2）→ 3 nodes + 2 edges', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-bfs-a');
    const root = recordVerdict(db, makeVerdictArgs('ev-bfs-a', 'CONFIRMED'));

    tracker.appendAndEvidence(db, 'ev-bfs-b');
    const child1 = recordVerdict(db, makeVerdictArgs('ev-bfs-b', 'CONFIRMED', FIXTURE_VERDICT_TRACE, { parentVerdictId: root.verdictId }));

    tracker.appendAndEvidence(db, 'ev-bfs-c');
    const child2 = recordVerdict(db, makeVerdictArgs('ev-bfs-c', 'REFUTED', FIXTURE_VERDICT_TRACE, { parentVerdictId: root.verdictId }));

    insertEdge(db, root.verdictId, child1.verdictId, 'derives_from');
    insertEdge(db, root.verdictId, child2.verdictId, 'derives_from');

    const subtree = getSubtree(db, root.verdictId);
    assert.equal(subtree.nodes.length, 3, 'BFS 应收集全部可达节点（root + 2 children）');
    assert.equal(subtree.edges.length, 2);
    const nodeIds = subtree.nodes.map((n) => n.nodeId).sort();
    assert.ok(nodeIds.includes(root.verdictId));
    assert.ok(nodeIds.includes(child1.verdictId));
    assert.ok(nodeIds.includes(child2.verdictId));
  } finally {
    db.close();
  }
});

test('getSubtree: 循环边（A→B→A）不无限循环（visited 去重）', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-cycle-a');
    const a = recordVerdict(db, makeVerdictArgs('ev-cycle-a', 'CONFIRMED'));

    tracker.appendAndEvidence(db, 'ev-cycle-b');
    const b = recordVerdict(db, makeVerdictArgs('ev-cycle-b', 'CONFIRMED', FIXTURE_VERDICT_TRACE, { parentVerdictId: a.verdictId }));

    insertEdge(db, a.verdictId, b.verdictId, 'iterates');
    insertEdge(db, b.verdictId, a.verdictId, 'iterates');

    const subtree = getSubtree(db, a.verdictId);
    assert.equal(subtree.nodes.length, 2, '循环不导致重复节点');
    assert.ok(subtree.edges.length >= 2, '两条边都被收集');
  } finally {
    db.close();
  }
});

test('getSubtree: node DTO 字段映射正确（camelCase + 全字段）', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-dto');
    const v = recordVerdict(db, makeVerdictArgs('ev-dto', 'REFUTED', FIXTURE_VERDICT_TRACE, {
      nodeKind: 'evidence',
      metricValue: 0.42,
      conflictingEvidenceCount: 3,
      scopeSlipText: 'scope narrowed',
    }));
    const subtree = getSubtree(db, v.verdictId);
    const node = subtree.nodes[0]!;
    assert.equal(node.nodeKind, 'evidence');
    assert.equal(node.decision, 'REFUTED');
    assert.equal(node.metricValue, 0.42);
    assert.equal(node.conflictingEvidenceCount, 3);
    assert.equal(node.scopeSlipText, 'scope narrowed');
    assert.equal(node.parentNodeId, null);
    // B3 透明度层：FIXTURE_VERDICT_TRACE 不含 decisionTrace → 宽容降级为 null
    assert.equal(node.decisionTrace, null);
    assert.ok(node.createdAt.length > 0);
  } finally {
    db.close();
  }
});

test('getSubtree: decisionTrace 存在时正确映射到 node.decisionTrace（B3 透明度层）', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-dt-a');

    // 手工构造含 decisionTrace 的 trace（4 个 verdict-critical 字段 + B3 可选字段）
    const traceWithDecision: VerdictTracePersisted = {
      reasonCodes: ['R7_SUPPORTED'],
      ruleTrace: [{ ruleId: 'R7_SUPPORTED', triggered: true }],
      decisiveRuleId: 'R7_SUPPORTED',
      evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
      decisionTrace: {
        firedRuleId: 'R7_SUPPORTED',
        r7Gate: {
          supports: true,
          primaryAdjustedPValueSignificant: true,
          effectSizeSufficient: true,
          evidenceSufficient: true,
          noSameScopeRefutation: true,
          noIntegrityFlags: true,
          noWarnAssumption: true,
          overallPassed: true,
        },
        metrics: {
          alpha: 0.05,
          mde: 0.1,
          primaryAdjustedPValue: 0.0082,
          primaryEffectSize: 0.42,
          primaryConfidenceInterval: [0.2, 0.5],
          powerStatus: 'adequate',
          evidenceStatus: 'sufficient',
          effectiveDirection: 'positive',
          antiTheaterFailCount: 0,
          antiTheaterWarnCount: 0,
          integrityFlags: [],
          totalStatistics: 4,
          skippedStatistics: 0,
        },
        totalRulesInTree: 18,
        cannotProveStatement: '决策路径追踪是事后解释，不能证明裁决正确',
      },
    };
    const v = recordVerdict(db, makeVerdictArgs('ev-dt-a', 'CONFIRMED', traceWithDecision));

    const subtree = getSubtree(db, v.verdictId);
    const node = subtree.nodes[0]!;
    assert.ok(node.decisionTrace !== null, 'decisionTrace 应透传到 DTO');
    const dt = node.decisionTrace as Record<string, unknown>;
    assert.equal(dt.firedRuleId, 'R7_SUPPORTED');
    assert.equal((dt.metrics as Record<string, unknown>).alpha, 0.05);
    assert.equal((dt.r7Gate as Record<string, unknown>).overallPassed, true);
  } finally {
    db.close();
  }
});

test('getSubtree: verdict_trace_json 为非法 JSON 时宽容降级为 null（不阻断图查询）', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-dt-bad');
    // verdict_nodes 的 immutable trigger（0012 重建）禁 UPDATE verdict_trace_json →
    // 用 raw INSERT 注入非法 trace 行（模拟异常/旧数据），验证只读图查询不受影响
    db.prepare(
      `INSERT INTO verdict_nodes
         (verdict_id, evidence_id, node_kind, verdict, falsification_spec,
          source_anchor, prev_hash, current_hash, verdict_trace_json)
       VALUES (?, ?, 'evidence', 'CONFIRMED', '{}', 'anchor', 'prev', 'cur', ?)`,
    ).run('v-dt-bad', 'ev-dt-bad', '{not-valid-json');

    const subtree = getSubtree(db, 'v-dt-bad');
    assert.equal(subtree.nodes.length, 1, '非法 trace 不应阻断节点返回');
    assert.equal(subtree.nodes[0]?.decisionTrace, null, '非法 JSON → decisionTrace 为 null');
  } finally {
    db.close();
  }
});

test('getSubtree: edge DTO 字段映射正确（edgeKind + weight + camelCase）', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-edge-a');
    const a = recordVerdict(db, makeVerdictArgs('ev-edge-a', 'CONFIRMED'));

    tracker.appendAndEvidence(db, 'ev-edge-b');
    const b = recordVerdict(db, makeVerdictArgs('ev-edge-b', 'CONFIRMED', FIXTURE_VERDICT_TRACE, { parentVerdictId: a.verdictId }));

    insertEdge(db, a.verdictId, b.verdictId, 'tests', 'edge-custom-id');

    const subtree = getSubtree(db, a.verdictId);
    assert.equal(subtree.edges.length, 1);
    const edge = subtree.edges[0]!;
    assert.equal(edge.edgeId, 'edge-custom-id');
    assert.equal(edge.fromNode, a.verdictId);
    assert.equal(edge.toNode, b.verdictId);
    assert.equal(edge.edgeKind, 'tests');
    assert.equal(edge.weight, 0.5);
  } finally {
    db.close();
  }
});

test('getSubtree: 多种 edgeKind 都正确映射（supports/refutes/derives_from/tests/iterates）', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    tracker.appendAndEvidence(db, 'ev-multi-root');
    const root = recordVerdict(db, makeVerdictArgs('ev-multi-root', 'CONFIRMED'));

    const kinds = ['supports', 'refutes', 'derives_from', 'tests', 'iterates'];
    for (let i = 0; i < kinds.length; i++) {
      tracker.appendAndEvidence(db, `ev-multi-${i}`);
      const c = recordVerdict(db, makeVerdictArgs(`ev-multi-${i}`, 'CONFIRMED', FIXTURE_VERDICT_TRACE, { parentVerdictId: root.verdictId }));
      insertEdge(db, root.verdictId, c.verdictId, kinds[i]!, `edge-multi-${i}`);
    }

    const subtree = getSubtree(db, root.verdictId);
    assert.equal(subtree.edges.length, 5);
    const edgeKinds = subtree.edges.map((e) => e.edgeKind).sort();
    assert.deepEqual(edgeKinds, [...kinds].sort());
  } finally {
    db.close();
  }
});

// ---------- getSubtreeByChainHead 测试 ----------

test('getSubtreeByChainHead: call_record 不存在 → 空子树', () => {
  const db = openDb();
  try {
    const subtree = getSubtreeByChainHead(db, '0'.repeat(64));
    assert.equal(subtree.rootId, '0'.repeat(64));
    assert.equal(subtree.nodes.length, 0);
    assert.equal(subtree.edges.length, 0);
  } finally {
    db.close();
  }
});

test('getSubtreeByChainHead: 完整路径（hash → call_record → evidence → verdict → subtree）', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    const { currentHash } = tracker.appendAndEvidence(db, 'ev-chain');
    const v = recordVerdict(db, makeVerdictArgs('ev-chain', 'CONFIRMED'));

    const subtree = getSubtreeByChainHead(db, currentHash);
    assert.equal(subtree.nodes.length, 1);
    assert.equal(subtree.nodes[0]?.nodeId, v.verdictId);
  } finally {
    db.close();
  }
});

test('getSubtreeByChainHead: hash 存在但无 evidence_log 关联 → 空子树', () => {
  const db = openDb();
  try {
    // 只插 call_record·不插 evidence_log
    const record = appendRecord(
      db,
      {
        stageId: 'stage3_hypothesis',
        cred: {
          modelId: 'offline-replay-fixture',
          dashscopeRequestId: null,
          reproHash: 'a'.repeat(64),
          gitCommitSha: SOURCE_ANCHOR.gitCommitSha,
          isoTimestamp: SOURCE_ANCHOR.isoTimestamp,
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        prevHash: GENESIS_PREV_HASH,
      },
      {
        requestPayload: '{}',
        responsePayload: '{}',
        finishReason: 'stop',
        usageTokensTotal: 0,
      },
      { providerProfile: 'offline_replay' },
    );

    const subtree = getSubtreeByChainHead(db, record.currentHash);
    assert.equal(subtree.nodes.length, 0);
    assert.equal(subtree.edges.length, 0);
  } finally {
    db.close();
  }
});

test('getSubtreeByChainHead: evidence 存在但无 verdict_node → 空子树', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    const { currentHash } = tracker.appendAndEvidence(db, 'ev-no-verdict');

    const subtree = getSubtreeByChainHead(db, currentHash);
    assert.equal(subtree.nodes.length, 0);
  } finally {
    db.close();
  }
});

test('getSubtreeByChainHead: supersede 后取最新活跃 verdict_node', () => {
  const db = openDb();
  try {
    const tracker = new ChainHeadTracker();
    const { currentHash } = tracker.appendAndEvidence(db, 'ev-supersede');
    const oldV = recordVerdict(db, makeVerdictArgs('ev-supersede', 'INCONCLUSIVE', FIXTURE_VERDICT_TRACE, { untestedReason: 'initial' }));

    // supersede old verdict with new one
    const newTrace: VerdictTracePersisted = {
      reasonCodes: ['R5_REFUTED'],
      ruleTrace: [{ ruleId: 'R5_REFUTED', triggered: true }],
      decisiveRuleId: 'R5_REFUTED',
      evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    };
    const { newVerdict } = supersedeVerdict(db, {
      oldVerdictId: oldV.verdictId,
      newVerdictArgs: makeVerdictArgs('ev-supersede', 'REFUTED', newTrace, { parentVerdictId: oldV.verdictId }),
    });

    const subtree = getSubtreeByChainHead(db, currentHash);
    // getSubtreeByChainHead queries WHERE superseded_by IS NULL → should find newV (active)
    assert.equal(subtree.nodes.length, 1);
    assert.equal(subtree.nodes[0]?.nodeId, newVerdict.verdictId);
  } finally {
    db.close();
  }
});
