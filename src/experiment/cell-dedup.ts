import { createHash } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import type { Hyperparams, ResultCell, ResultSet, RunId } from '../domain/index.js';

/**
 * ResultCell fingerprint dedup — single shared owner (D-086-1 / FA-REM-02): both
 * executors (local sidecar, remote SSH device) derive a cell's identity here and
 * replay a cached cell instead of retraining. A cell is cacheable iff spec hash,
 * dataset content, producing environment, and model identity all match a prior
 * cell. Environment identity is executor-scoped by construction: local cells pin
 * the sidecar lockfile hash, remote cells pin device + python + pip-freeze
 * (D-086-3 same-device determinism) — a replay never crosses an environment
 * boundary, and a retry on a different device honestly retrains.
 *
 * Serialization shapes below are FROZEN: fingerprints persist in far.db result
 * sets, so both builders must keep reproducing the exact legacy JSON.stringify
 * literal key order — tests/remote-executor-dedup.test.ts locks this.
 */

export interface LocalCellInputs {
  specHash: string;
  contentRef: string;
  /** Sidecar lockfile hash (python dependency identity). */
  envLock: string | null;
  modelIdx: number;
  seed: number;
  builder: string;
  hyperparams: Hyperparams;
}

export interface RemoteCellInputs {
  specHash: string;
  contentRef: string;
  device: string;
  remotePython: string | null;
  remotePipFreeze: string | null;
  modelIdx: number;
  seed: number;
  builder: string;
  hyperparams: Hyperparams;
}

export const localCellFingerprint = (i: LocalCellInputs): string =>
  createHash('sha256').update(JSON.stringify({
    specHash: i.specHash, contentRef: i.contentRef, envLock: i.envLock,
    modelIdx: i.modelIdx, seed: i.seed, builder: i.builder, hyperparams: i.hyperparams,
  })).digest('hex');

export const remoteCellFingerprint = (i: RemoteCellInputs): string =>
  createHash('sha256').update(JSON.stringify({
    specHash: i.specHash, contentRef: i.contentRef, device: i.device,
    remotePython: i.remotePython, remotePipFreeze: i.remotePipFreeze,
    modelIdx: i.modelIdx, seed: i.seed, builder: i.builder, hyperparams: i.hyperparams,
  })).digest('hex');

/** Every cell already computed in this run (any executor) — the dedup candidates. */
export const previousRunCells = (store: Store, runId: RunId): ResultCell[] =>
  (store.listObjects('result_set', runId) as ResultSet[]).flatMap((rs) => rs.cells);

/** Cached-cell replay: the per-row artifact IS the cell's result — losing it is fail-loud. */
export const loadCachedPerRow = async (
  artifacts: ArtifactStore,
  cached: ResultCell,
  fail: (message: string) => never,
): Promise<number[]> => {
  const raw = await artifacts.get(cached.perRowRef);
  if (raw === null) fail(`cached cell ${cached.modelName} lost its per-row artifact ${cached.perRowRef}`);
  return JSON.parse(raw) as number[];
};
