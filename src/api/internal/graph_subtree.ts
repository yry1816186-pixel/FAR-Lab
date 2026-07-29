/**
 * graph_subtree —— 证据图子树查询层（只读）。
 *
 * 设计理由：
 *   - evidence_graph 模块（src/evidence_graph/）仅提供 insertEdge + cycle_guard，
 *     未提供 getSubtree 查询函数。
 *   - API 层需要 GraphSubtree 响应（K-01 返回 LoopState + GraphSubtree + 判定 + reproHash）。
 *   - 本文件只读查询 evidence_edges + verdict_nodes 表（不修改 evidence_graph 模块·
 *     遵守任务约束「不得修改 evidence_graph/*」）。
 *
 * 查询策略：
 *   - 从 rootVerdictId 出发，BFS 遍历 evidence_edges（from_node → to_node 方向）。
 *   - 收集可达 verdict_nodes + 对应 evidence_edges。
 *   - 防御性 maxDepth=10 防图过深（API 响应体大小可控）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { Database } from 'better-sqlite3';

import type { EdgeKind } from '../../schema/enums.ts';
import { EDGE_KINDS } from '../../schema/enums.ts';
import type { GraphEdgeDto, GraphNodeDto, GraphSubtree } from '../types.ts';

interface VerdictNodeRow {
  readonly verdict_id: string;
  readonly evidence_id: string;
  readonly parent_verdict_id: string | null;
  readonly node_kind: string;
  readonly verdict: string;
  readonly metric_value: number | null;
  readonly conflicting_evidence_count: number;
  readonly scope_slip_text: string | null;
  readonly untested_reason: string | null;
  readonly created_at: string;
}

interface EdgeRow {
  readonly edge_id: string;
  readonly from_node: string;
  readonly to_node: string;
  readonly edge_kind: string;
  readonly weight: number | null;
  readonly created_at: string;
}

const MAX_DEPTH = 10;

/**
 * 从 rootVerdictId 出发 BFS 收集可达子树。
 *
 * @param db 数据库实例
 * @param rootVerdictId 根判定节点 ID
 * @returns GraphSubtree（nodes + edges·rootId 对应的节点不存在时返回空子树）
 */
export function getSubtree(db: Database, rootVerdictId: string): GraphSubtree {
  const nodes = new Map<string, GraphNodeDto>();
  const edges: GraphEdgeDto[] = [];
  const visited = new Set<string>();
  const queue: Array<{ readonly id: string; readonly depth: number }> = [
    { id: rootVerdictId, depth: 0 },
  ];

  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) {
      break;
    }
    const { id, depth } = item;
    if (visited.has(id) || depth > MAX_DEPTH) {
      continue;
    }
    visited.add(id);

    const node = fetchNode(db, id);
    if (node === null) {
      continue;
    }
    nodes.set(id, node);

    const outEdges = fetchOutEdges(db, id);
    for (const edge of outEdges) {
      edges.push(edge);
      if (!visited.has(edge.toNode)) {
        queue.push({ id: edge.toNode, depth: depth + 1 });
      }
    }
  }

  return {
    rootId: rootVerdictId,
    nodes: [...nodes.values()],
    edges,
  };
}

/**
 * 从证据链头 hash 出发，查找关联的判定节点子树。
 *
 * 用于 GET /evidence/chain/:headHash 场景：先查 call_records 找到 seq，
 * 再查 evidence_log 找到 evidenceId，最后查 verdict_nodes 找到关联判定节点。
 *
 * 若链头无关联判定节点，返回空子树（rootId = headHash·nodes/edges 为空）。
 */
export function getSubtreeByChainHead(db: Database, headHash: string): GraphSubtree {
  const callRecordRow = db
    .prepare('SELECT seq FROM call_records WHERE current_hash = ? LIMIT 1')
    .get(headHash) as { seq?: number } | undefined;
  if (callRecordRow === undefined || callRecordRow.seq === undefined) {
    return { rootId: headHash, nodes: [], edges: [] };
  }

  const evidenceRow = db
    .prepare('SELECT evidence_id FROM evidence_log WHERE call_record_seq = ? LIMIT 1')
    .get(callRecordRow.seq) as { evidence_id?: string } | undefined;
  if (evidenceRow === undefined || evidenceRow.evidence_id === undefined) {
    return { rootId: headHash, nodes: [], edges: [] };
  }

  const verdictRow = db
    .prepare('SELECT verdict_id FROM verdict_nodes WHERE evidence_id = ? AND superseded_by IS NULL ORDER BY created_at DESC, verdict_id DESC LIMIT 1')
    .get(evidenceRow.evidence_id) as { verdict_id?: string } | undefined;
  if (verdictRow === undefined || verdictRow.verdict_id === undefined) {
    return { rootId: headHash, nodes: [], edges: [] };
  }

  return getSubtree(db, verdictRow.verdict_id);
}

function fetchNode(db: Database, nodeId: string): GraphNodeDto | null {
  const row = db
    .prepare(
      `SELECT verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
              metric_value, conflicting_evidence_count, scope_slip_text, untested_reason,
              created_at
       FROM verdict_nodes
       WHERE verdict_id = ?`,
    )
    .get(nodeId) as VerdictNodeRow | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    nodeId: row.verdict_id,
    evidenceId: row.evidence_id,
    parentNodeId: row.parent_verdict_id,
    nodeKind: row.node_kind,
    decision: row.verdict,
    metricValue: row.metric_value,
    conflictingEvidenceCount: row.conflicting_evidence_count,
    scopeSlipText: row.scope_slip_text,
    untestedReason: row.untested_reason,
    createdAt: row.created_at,
  };
}

function fetchOutEdges(db: Database, fromNode: string): readonly GraphEdgeDto[] {
  const rows = db
    .prepare(
      `SELECT edge_id, from_node, to_node, edge_kind, weight, created_at
       FROM evidence_edges
       WHERE from_node = ?
       ORDER BY created_at ASC`,
    )
    .all(fromNode) as readonly EdgeRow[];
  return rows.map((row) => {
    const edgeKind = parseEdgeKind(row.edge_kind, row.edge_id);
    return {
      edgeId: row.edge_id,
      fromNode: row.from_node,
      toNode: row.to_node,
      edgeKind,
      weight: row.weight,
      createdAt: row.created_at,
    };
  });
}

function parseEdgeKind(value: string, edgeId: string): EdgeKind {
  if ((EDGE_KINDS as readonly string[]).includes(value)) {
    return value as EdgeKind;
  }
  throw new Error(`graph_subtree.parseEdgeKind: invalid edge_kind "${value}" for edge_id=${edgeId}`);
}
