import type Database from 'better-sqlite3';

export const SQL_HAS_PATH = `
  WITH RECURSIVE reach(node) AS (
    SELECT ?
    UNION
    SELECT e.to_node
    FROM evidence_edges e
    JOIN reach r ON e.from_node = r.node
  )
  SELECT EXISTS (
    SELECT 1 FROM reach WHERE node = ?
  ) AS has_path
`;

export class CycleDetectedError extends Error {
  readonly fromId: string;
  readonly toId: string;

  constructor(message: string, opts: { readonly fromId: string; readonly toId: string }) {
    super(message);
    this.name = 'CycleDetectedError';
    this.fromId = opts.fromId;
    this.toId = opts.toId;
    Object.setPrototypeOf(this, CycleDetectedError.prototype);
  }
}

export function hasPath(db: Database.Database, fromId: string, toId: string): boolean {
  const row = db.prepare<[string, string], { has_path: number }>(SQL_HAS_PATH).get(fromId, toId);
  return row?.has_path === 1;
}

export function addCycleGuard(db: Database.Database, fromId: string, toId: string): void {
  if (fromId === toId) {
    throw new CycleDetectedError(
      `addCycleGuard: self-loop forbidden for ${fromId}`,
      { fromId, toId },
    );
  }

  if (hasPath(db, toId, fromId)) {
    throw new CycleDetectedError(
      `addCycleGuard: cycle detected for edge ${fromId} -> ${toId}`,
      { fromId, toId },
    );
  }
}
