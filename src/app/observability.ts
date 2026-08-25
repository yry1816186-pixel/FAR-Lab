import fs from 'node:fs';
import path from 'node:path';
import type { Store } from '../persistence/store.js';

/**
 * Unified reliability observability layer (workstream 2026-08-24).
 *
 * Design rule: this module NEVER becomes a second source of truth. Events,
 * receipts and run docs stay authoritative; what lives here is:
 *   1. one error taxonomy across provider/system boundaries (classify once,
 *      reuse in recovery-state, diagnostics and soak analysis);
 *   2. resource/storage sampling for soak + `far data obs`;
 *   3. the correlation-id contract, typed (the ids the spine already carries).
 *
 * OTel decision (evaluation on file, work/reliability-observability/otel-evaluation.md):
 * no SDK dependency — the product is single-machine, zero-runtime-deps (zod only),
 * and the append-only event spine + receipts already provide span-shaped data
 * (run → stage → receipt/event seq). Field semantics below align with OTel
 * semantic conventions so a future OTLP exporter can project losslessly.
 */

// ---- 1. Error taxonomy -------------------------------------------------------

/** Every failure category the product can surface, across layers. */
export type ErrorCategory =
  // model/provider plane (existing kinds in shared/ports.ts)
  | 'rate_limited' | 'timeout' | 'auth_error' | 'quota_exceeded' | 'provider_error' | 'invalid_output'
  // spend/budget governance
  | 'budget_exhausted' | 'spend_limit'
  // execution ownership
  | 'lease_lost' | 'lease_held' | 'cancelled'
  // local system plane
  | 'db_busy' | 'db_corrupt' | 'disk_full' | 'permission_denied' | 'io_error' | 'network_error' | 'malformed_input';

export interface ClassifiedError {
  category: ErrorCategory;
  /** Whether retrying the same operation can plausibly succeed without human action. */
  retryable: boolean;
  /** True when only a human decision (raise budget/clear limit/fix route) unblocks. */
  needsHuman: boolean;
  message: string;
}

const NEEDS_HUMAN: ReadonlySet<ErrorCategory> = new Set(['auth_error', 'quota_exceeded', 'budget_exhausted', 'spend_limit', 'db_corrupt', 'permission_denied']);
const RETRYABLE: ReadonlySet<ErrorCategory> = new Set(['rate_limited', 'timeout', 'provider_error', 'db_busy', 'network_error', 'io_error']);

/**
 * Classify any error crossing a product boundary. Deterministic on (name,
 * message, code): the provider plane's own retryable flag wins when present,
 * errno codes map the system plane, message shape catches the domain errors
 * (lease/budget/spend) that are thrown as plain Error subclasses today.
 */
export const classifyError = (e: unknown): ClassifiedError => {
  const message = e instanceof Error ? e.message : String(e);
  const name = e instanceof Error ? e.name : '';
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  // provider-plane result errors carry their own kind + retryable (ports.ts)
  const kind = (e as { kind?: unknown } | undefined)?.kind;
  if (typeof kind === 'string' && CATEGORIES.has(kind as ErrorCategory)) {
    const category = kind as ErrorCategory;
    const providerRetryable = (e as { retryable?: unknown } | undefined)?.retryable === true;
    return { category, retryable: providerRetryable || RETRYABLE.has(category), needsHuman: NEEDS_HUMAN.has(category), message };
  }
  if (name === 'RunLeaseLostError') return { category: 'lease_lost', retryable: false, needsHuman: false, message };
  if (name === 'RunLeaseHeldError') return { category: 'lease_held', retryable: false, needsHuman: false, message };
  if (name === 'RunBudgetExhaustedError') return { category: 'budget_exhausted', retryable: false, needsHuman: true, message };
  // Stringified provider failures keep their kind inline (src/pipeline/llm.ts throws
  // `model call failed (<kind>) in <stage>/<purpose>`); recover it from the text.
  const inline = /\bmodel call failed \((rate_limited|timeout|auth_error|quota_exceeded|provider_error|invalid_output)\)/.exec(message);
  if (inline !== null) {
    const category = inline[1] as ErrorCategory;
    return { category, retryable: RETRYABLE.has(category), needsHuman: NEEDS_HUMAN.has(category), message };
  }
  if (/^run token budget exhausted/i.test(message)) return { category: 'budget_exhausted', retryable: false, needsHuman: true, message };
  if (/workspace spend limit reached/i.test(message)) return { category: 'spend_limit', retryable: false, needsHuman: true, message };
  if (/^cancelled/i.test(message)) return { category: 'cancelled', retryable: false, needsHuman: false, message };
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || /database is locked/i.test(message)) {
    return { category: 'db_busy', retryable: true, needsHuman: false, message };
  }
  if (code === 'SQLITE_CORRUPT' || /database disk image is malformed/i.test(message)) {
    return { category: 'db_corrupt', retryable: false, needsHuman: true, message };
  }
  if (code === 'ENOSPC' || /no space left on device/i.test(message)) {
    return { category: 'disk_full', retryable: false, needsHuman: true, message };
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return { category: 'permission_denied', retryable: false, needsHuman: true, message };
  }
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN' || code === 'ENOTFOUND'
    || code === 'EHOSTUNREACH' || code === 'ETIMEDOUT' || code === 'EPIPE') {
    return { category: 'network_error', retryable: true, needsHuman: false, message };
  }
  if (code === 'ENOENT') return { category: 'io_error', retryable: false, needsHuman: false, message };
  return { category: 'provider_error', retryable: true, needsHuman: false, message };
};

const CATEGORIES: ReadonlySet<string> = new Set([
  'rate_limited', 'timeout', 'auth_error', 'quota_exceeded', 'provider_error', 'invalid_output',
  'budget_exhausted', 'spend_limit', 'lease_lost', 'lease_held', 'cancelled',
  'db_busy', 'db_corrupt', 'disk_full', 'permission_denied', 'io_error', 'network_error', 'malformed_input',
]);

/** Aggregate a run's failure events into category counts — the `far data obs`
 *  error profile. Reads only event payload text; classification is the same
 *  deterministic function above, so re-derivation is stable. */
export const errorProfileForRun = (store: Store, runId: string): Record<ErrorCategory, number> => {
  const counts = {} as Record<ErrorCategory, number>;
  for (const e of store.listEvents(runId)) {
    if (e.type !== 'stage_failed' && e.type !== 'note') continue;
    const detail = typeof e.detail === 'object' && e.detail !== null ? (e.detail as Record<string, unknown>) : {};
    const errText = typeof detail.error === 'string' ? detail.error
      : typeof (detail as { error?: { message?: unknown } }).error?.message === 'string' ? (detail as { error: { message: string } }).error.message
        : null;
    if (errText === null) continue;
    const { category } = classifyError(new Error(errText));
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
};

// ---- 2. Resource + storage sampling ------------------------------------------

export interface ProcessSample {
  at: string;
  pid: number;
  uptimeMs: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  /** Active libuv handles + requests — the leak signature for soak analysis. */
  activeHandles: number;
  activeRequests: number;
}

export const sampleProcess = (): ProcessSample => {
  const mu = process.memoryUsage();
  return {
    at: new Date().toISOString(),
    pid: process.pid,
    uptimeMs: Math.round(process.uptime() * 1000),
    rssMb: Math.round((mu.rss / 1048576) * 10) / 10,
    heapUsedMb: Math.round((mu.heapUsed / 1048576) * 10) / 10,
    heapTotalMb: Math.round((mu.heapTotal / 1048576) * 10) / 10,
    externalMb: Math.round((mu.external / 1048576) * 10) / 10,
    activeHandles: (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.().length ?? -1,
    activeRequests: (process as unknown as { _getActiveRequests?: () => unknown[] })._getActiveRequests?.().length ?? -1,
  };
};

const dirSizeBytes = (dir: string): number => {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSizeBytes(p);
    else if (e.isFile()) {
      try { total += fs.statSync(p).size; } catch { /* raced away mid-scan: not counted */ }
    }
  }
  return total;
};

export interface StorageSample {
  at: string;
  dbBytes: number;
  walBytes: number;
  schedulerDbBytes: number;
  artifactsBytes: number;
  /** Landed content-addressed blobs + orphaned put-temps (crash residue). */
  artifactBlobs: number;
  orphanTemps: number;
  runs: number;
  events: number;
  objects: number;
  receipts: number;
}

/** One storage-growth sample for soak + workspace diagnostics. Counts are
 *  store queries (cheap); byte sizes are directory scans (bounded by disk). */
export const sampleStorage = (store: Store, dataDir: string): StorageSample => {
  const artifactRoot = path.join(dataDir, 'artifacts');
  let artifactBlobs = 0;
  let orphanTemps = 0;
  try {
    for (const shard of fs.readdirSync(artifactRoot, { withFileTypes: true })) {
      if (!shard.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(artifactRoot, shard.name))) {
        if (/^[0-9a-f]{64}$/.test(f)) artifactBlobs += 1;
        else if (/^\.[0-9a-f]{64}\.tmp-/.test(f)) orphanTemps += 1;
      }
    }
  } catch { /* no artifact store yet */ }
  const fileSize = (p: string): number => { try { return fs.statSync(p).size; } catch { return 0; } };
  const counts = store.workspaceCounts();
  return {
    at: new Date().toISOString(),
    dbBytes: fileSize(path.join(dataDir, 'far.db')),
    walBytes: fileSize(path.join(dataDir, 'far.db-wal')) + fileSize(path.join(dataDir, 'far.db-shm')),
    schedulerDbBytes: fileSize(path.join(dataDir, 'far-scheduler.db')),
    artifactsBytes: dirSizeBytes(artifactRoot),
    artifactBlobs,
    orphanTemps,
    runs: counts.runs,
    events: counts.events,
    objects: counts.objects,
    receipts: counts.receipts,
  };
};

// ---- 3. Correlation contract --------------------------------------------------

/**
 * The correlation spine every subsystem already persists; typed here as the
 * contract. Rendering/diagnostics join on these fields and NOTHING else.
 * (OTel mapping: runId ≈ trace_id, stage+stepKey ≈ span name, receiptId/event
 * seq ≈ span/event ids — see otel-evaluation.md.)
 */
export interface CorrelationSpan {
  runId: string;
  stage?: string;
  stepKey?: string;
  stageAttempt?: number;
  receiptId?: string;
  eventSeq?: number;
  objectKind?: string;
  objectId?: string;
  experimentId?: string;
  leaseHolder?: string;
}

export const formatCorrelation = (c: CorrelationSpan): string =>
  `run=${c.runId}`
  + (c.stage !== undefined ? ` stage=${c.stage}${c.stageAttempt !== undefined ? `#${c.stageAttempt}` : ''}` : '')
  + (c.stepKey !== undefined ? ` step=${c.stepKey}` : '')
  + (c.receiptId !== undefined ? ` receipt=${c.receiptId}` : '')
  + (c.eventSeq !== undefined ? ` seq=${c.eventSeq}` : '')
  + (c.objectKind !== undefined && c.objectId !== undefined ? ` obj=${c.objectKind}/${c.objectId}` : '')
  + (c.experimentId !== undefined ? ` exp=${c.experimentId}` : '')
  + (c.leaseHolder !== undefined ? ` holder=${c.leaseHolder}` : '');
