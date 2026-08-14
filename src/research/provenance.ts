/**
 * research/provenance — per-stage provenance receipts + environment fingerprint
 * (directive §3.3).
 *
 * Every science-critical stage of a research run records a ProvenanceReceipt:
 * model stages carry provider identity (model id / request id / snapshot state /
 * provider-reported token usage / cost status); retrieval stages carry corpus
 * identity (snapshotId / rootHash / data source / retrievedAt / parser version);
 * deterministic stages carry input+output content hashes so a third party can
 * recompute them. Nothing is invented: fields a provider does not supply are
 * null + provenanceStatus='partial' with the missing fields named.
 *
 * EnvironmentFingerprint pins the run to its software environment (git commit,
 * worktree dirty flag, node version, lockfile hash) — needed for the "what
 * exactly ran" half of reproducibility (the other half, deterministic recompute,
 * is done by `far research verify`).
 */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { rawSha256Hex } from '../retrieval/hash.ts';
import type { CostSnapshot, TokenUsage } from '../llm_gateway/types.ts';
import type { ComponentMode } from './types.ts';

const execFileAsync = promisify(execFile);

/** Model snapshot state (directive §3.3 — never invent a snapshot). */
export type ModelSnapshotState = 'provided' | 'not_provided_by_provider' | 'unknown';

/** Cost status (directive §3.3 — billed/estimated/unavailable, never guessed). */
export type CostStatus = 'billed' | 'estimated' | 'unavailable';

/** Provider-reported token usage for a receipt (null = provider did not report). */
export interface ReceiptTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /** true = provider-measured tokens; false = character estimate (replay). */
  readonly measured: boolean;
}

/** Cost entry for a receipt (null amount = unavailable). */
export interface ReceiptCost {
  readonly status: CostStatus;
  readonly currency: string | null;
  readonly amount: number | null;
}

/**
 * A structured provenance receipt for one science-critical stage (directive §3.3).
 *
 * Field policy: provider-dependent fields are null when the provider does not
 * supply them, and provenanceStatus='partial' lists what is missing. A receipt
 * never fabricates request ids, token usage, or model snapshots.
 */
export interface ProvenanceReceipt {
  /** The run this stage belongs to. */
  readonly runId: string;
  /** Stage identifier (stable, e.g. 'research_hypotheses'). */
  readonly stageId: string;
  /** Stage implementation version (for schema evolution). */
  readonly stageVersion: number;
  /** 1-based attempt within the stage (structured-repair retries count). */
  readonly attempt: number;
  /** 1-based ordinal of the stage across the run. */
  readonly sequence: number;
  /** What kind of component produced this stage. */
  readonly component: 'model' | 'retrieval' | 'deterministic';
  /** Execution mode of this component. */
  readonly mode: ComponentMode;
  /** Provider profile (model stages only; null otherwise). */
  readonly provider: string | null;
  /** Endpoint/region (model stages; null when not available). */
  readonly endpointRegion: string | null;
  /** Model id actually called (model stages; null otherwise). */
  readonly modelId: string | null;
  /** Provider request/response id (null when the provider did not return one). */
  readonly requestId: string | null;
  /** Provider-reported model snapshot state (never invented). */
  readonly modelSnapshot: ModelSnapshotState;
  /** Provider-reported token usage (null = unavailable — never estimated live). */
  readonly tokenUsage: ReceiptTokenUsage | null;
  /** Stage latency in ms (null = not measured). */
  readonly latencyMs: number | null;
  /** Number of provider retries the stage consumed. */
  readonly retries: number;
  /** Provider finish reason (null = not reported). */
  readonly finishReason: string | null;
  /** Cost status (replay = estimated/char-based, live = billed or unavailable). */
  readonly cost: ReceiptCost;
  /** sha256 of the canonical stage input (deterministic stages only). */
  readonly inputHash: string | null;
  /** sha256 of the canonical stage output (deterministic stages only). */
  readonly outputHash: string | null;
  /** Corpus snapshotId (retrieval/grounding stages). */
  readonly corpusSnapshotId: string | null;
  /** Corpus root hash (retrieval/grounding stages). */
  readonly corpusRootHash: string | null;
  /** Data source (retrieval stages). */
  readonly dataSource: string | null;
  /** ISO timestamp the data was retrieved (retrieval stages). */
  readonly retrievedAt: string | null;
  /** Parser version (retrieval stages). */
  readonly parserVersion: string | null;
  /** Prompt/template hash (model stages; null = not captured). */
  readonly promptTemplateHash: string | null;
  /** Stage errors (empty = none). */
  readonly errors: readonly string[];
  /** UTC ISO 8601 creation time. */
  readonly createdAt: string;
  /** 'complete' = all applicable fields present; 'partial' = fields missing. */
  readonly provenanceStatus: 'complete' | 'partial';
  /** Which fields are missing (empty when complete). */
  readonly missingFields: readonly string[];
}

/** The software-environment fingerprint for a run (directive §3.3). */
export interface EnvironmentFingerprint {
  /** git commit the run was executed on (null = not a git repo / git missing). */
  readonly gitCommit: string | null;
  /** Whether the working tree had uncommitted changes at run start. */
  readonly gitDirty: boolean | null;
  /** Node version. */
  readonly nodeVersion: string;
  /** Platform / arch. */
  readonly platform: string;
  /** sha256 of the dependency lockfile (null = lockfile missing/unreadable). */
  readonly lockfileHash: string | null;
  /** Package version. */
  readonly packageVersion: string | null;
}

/** sha256 of arbitrary text (thin alias over the retrieval hash primitive). */
export function hashText(text: string): string {
  return rawSha256Hex(text);
}

/** Snapshot state derived from what the provider actually returned. */
export function modelSnapshotState(profile: string, modelVersion: string | null): ModelSnapshotState {
  if (profile === 'offline_replay') return 'unknown';
  return modelVersion !== null ? 'provided' : 'not_provided_by_provider';
}

/** Convert a gateway TokenUsage to a receipt token usage. */
export function toReceiptTokenUsage(usage: TokenUsage): ReceiptTokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    measured: usage.measured ?? true,
  };
}

/** Convert a gateway cost snapshot to a receipt cost. */
export function toReceiptCost(snapshot: CostSnapshot | undefined): ReceiptCost {
  if (snapshot === undefined) {
    return { status: 'unavailable', currency: null, amount: null };
  }
  return { status: 'billed', currency: snapshot.currency, amount: snapshot.amount };
}

/** Run a short-lived command and return trimmed stdout, or null on any failure. */
async function tryExecTrimmed(args: readonly string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 5000,
      windowsHide: true,
      encoding: 'utf8',
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Read a file and hash it, or null on any failure. */
function tryHashFile(path: string): string | null {
  try {
    return hashText(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Read package.json version, or null on any failure. */
function tryPackageVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * Capture the software-environment fingerprint.
 *
 * Runs `git rev-parse HEAD` + `git status --porcelain` with a 5s timeout each;
 * reads the pnpm lockfile hash. Every field fails soft to null/unknown — the
 * receipt must exist even when the environment cannot be fully described.
 */
export async function captureEnvironmentFingerprint(cwd = process.cwd()): Promise<EnvironmentFingerprint> {
  const gitCommit = await tryExecTrimmed(['rev-parse', 'HEAD'], cwd);
  let gitDirty: boolean | null = null;
  if (gitCommit !== null) {
    const statusOut = await tryExecTrimmed(['status', '--porcelain'], cwd);
    gitDirty = statusOut === null ? null : statusOut.length > 0;
  }

  return {
    gitCommit,
    gitDirty,
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileHash: tryHashFile('pnpm-lock.yaml'),
    packageVersion: tryPackageVersion(),
  };
}

/** Base fields shared by every receipt (assigned by the builder). */
export interface ReceiptInit {
  readonly runId: string;
  readonly stageId: string;
  readonly stageVersion?: number;
  readonly attempt?: number;
  readonly sequence: number;
  readonly component: ProvenanceReceipt['component'];
  readonly mode: ComponentMode;
  readonly provider?: string | null;
  readonly endpointRegion?: string | null;
  readonly modelId?: string | null;
  readonly requestId?: string | null;
  readonly modelSnapshot?: ModelSnapshotState;
  readonly tokenUsage?: ReceiptTokenUsage | null;
  readonly latencyMs?: number | null;
  readonly retries?: number;
  readonly finishReason?: string | null;
  readonly cost?: ReceiptCost;
  readonly inputHash?: string | null;
  readonly outputHash?: string | null;
  readonly corpusSnapshotId?: string | null;
  readonly corpusRootHash?: string | null;
  readonly dataSource?: string | null;
  readonly retrievedAt?: string | null;
  readonly parserVersion?: string | null;
  readonly promptTemplateHash?: string | null;
  readonly errors?: readonly string[];
  readonly createdAt?: string;
}

/**
 * Build a ProvenanceReceipt, then compute provenanceStatus/missingFields honestly:
 * a field is "expected" for a component and missing when null; 'partial' names
 * the missing ones. Nothing is filled in by guessing.
 */
export function buildProvenanceReceipt(init: ReceiptInit): ProvenanceReceipt {
  const base = {
    runId: init.runId,
    stageId: init.stageId,
    stageVersion: init.stageVersion ?? 1,
    attempt: init.attempt ?? 1,
    sequence: init.sequence,
    component: init.component,
    mode: init.mode,
    provider: init.provider ?? null,
    endpointRegion: init.endpointRegion ?? null,
    modelId: init.modelId ?? null,
    requestId: init.requestId ?? null,
    modelSnapshot: init.modelSnapshot ?? 'unknown',
    tokenUsage: init.tokenUsage ?? null,
    latencyMs: init.latencyMs ?? null,
    retries: init.retries ?? 0,
    finishReason: init.finishReason ?? null,
    cost: init.cost ?? { status: 'unavailable', currency: null, amount: null },
    inputHash: init.inputHash ?? null,
    outputHash: init.outputHash ?? null,
    corpusSnapshotId: init.corpusSnapshotId ?? null,
    corpusRootHash: init.corpusRootHash ?? null,
    dataSource: init.dataSource ?? null,
    retrievedAt: init.retrievedAt ?? null,
    parserVersion: init.parserVersion ?? null,
    promptTemplateHash: init.promptTemplateHash ?? null,
    errors: init.errors ?? [],
    createdAt: init.createdAt ?? new Date().toISOString(),
  } satisfies Omit<ProvenanceReceipt, 'provenanceStatus' | 'missingFields'>;

  const expected: Array<readonly [string, unknown]> =
    base.component === 'model'
      ? [
          ['provider', base.provider],
          ['modelId', base.modelId],
          ['requestId', base.requestId],
          ['modelSnapshot', base.modelSnapshot === 'unknown' ? null : base.modelSnapshot],
        ]
      : base.component === 'retrieval'
        ? [
            ['dataSource', base.dataSource],
            ['corpusSnapshotId', base.corpusSnapshotId],
            ['corpusRootHash', base.corpusRootHash],
            ['retrievedAt', base.retrievedAt],
            ['parserVersion', base.parserVersion],
          ]
        : [
            ['inputHash', base.inputHash],
            ['outputHash', base.outputHash],
          ];
  const missing = expected.filter(([, v]) => v === null || v === undefined).map(([k]) => k);

  return {
    ...base,
    provenanceStatus: missing.length === 0 ? 'complete' : 'partial',
    missingFields: missing,
  };
}

