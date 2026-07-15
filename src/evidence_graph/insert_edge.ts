import type Database from 'better-sqlite3';
import { ulid } from 'ulid';
import type { EdgeKind } from '../schema/enums.ts';
import { GENESIS_PREV_HASH } from '../evidence_log/types.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import { addCycleGuard } from './cycle_guard.ts';

export interface InsertEdgeArgs {
  readonly fromNode: string;
  readonly toNode: string;
  readonly edgeKind: EdgeKind;
  readonly weight?: number;
  readonly sourceAnchor: string;
}

export interface InsertEdgeResult {
  readonly edgeId: string;
  readonly currentHash: string;
}

function getEdgeChainHead(db: Database.Database): string {
  const row = db
    .prepare<[], { current_hash: string }>(
      'SELECT current_hash FROM evidence_edges ORDER BY created_at DESC, edge_id DESC LIMIT 1',
    )
    .get();
  return row?.current_hash ?? GENESIS_PREV_HASH;
}

export function insertEdge(db: Database.Database, args: InsertEdgeArgs): InsertEdgeResult {
  const insertTxn = db.transaction((): InsertEdgeResult => {
    addCycleGuard(db, args.fromNode, args.toNode);

    const edgeId = ulid();
    const prevHash = getEdgeChainHead(db);
    const weight = args.weight ?? null;
    const currentHash = hashCanonicalJson({
      edgeId,
      fromNode: args.fromNode,
      toNode: args.toNode,
      edgeKind: args.edgeKind,
      weight,
      sourceAnchor: args.sourceAnchor,
      prevHash,
    });

    db.prepare(
      `INSERT INTO evidence_edges
        (edge_id, from_node, to_node, edge_kind, weight, source_anchor, prev_hash, current_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      edgeId,
      args.fromNode,
      args.toNode,
      args.edgeKind,
      weight,
      args.sourceAnchor,
      prevHash,
      currentHash,
    );

    return { edgeId, currentHash };
  });

  return insertTxn();
}
