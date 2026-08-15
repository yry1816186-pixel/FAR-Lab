/**
 * far snapshot-verify — persisted corpus-snapshot integrity + increment report
 * CLI (2.md §10 后 R10 clause, T1; wraps retrieval/snapshot_integrity.ts).
 *
 * Grammar (far.ts wiring — coordinator-owned — maps argv to the input object):
 *   far snapshot-verify <run.json> [<run2.json> ...] [--json]
 *   far snapshot-verify -                        # run paths from stdin, one per line
 *   far snapshot-verify --increment <runA.json> <runB.json> [--json]
 *
 * Exit codes: 0 = all runs verified ok; 1 = any verification mismatch OR any
 * run file unreadable/malformed (fail-closed: one bad file never yields 0);
 * 2 = usage error (no paths, bad --increment arity, unknown flag).
 *
 * Output discipline: human render and --json render are pure functions of the
 * outcome (no timestamps, no locale-dependent ordering) — identical inputs
 * produce identical bytes.
 *
 * Cannot-prove: verifying a run's corpus proves the PERSISTED snapshot is
 * internally consistent; it does not prove the snapshot reflects what the
 * source API returned at fetch time (see snapshot_integrity.ts module doc).
 */

import { readFileSync } from 'node:fs';

import {
  readRunCorpus,
  snapshotIncrement,
  verifyCorpusSnapshot,
  RunCorpusReadError,
} from '../../retrieval/snapshot_integrity.ts';

/** Per-run verification result (load failures carry `error`, ok:false). */
export interface RunVerifyResult {
  readonly runPath: string;
  readonly runId: string | null;
  readonly ok: boolean;
  readonly recomputedSnapshotId: string | null;
  readonly recomputedRootHash: string | null;
  readonly mismatches: readonly string[];
  /** Typed error message (RunCorpusReadError code prefix) when the file could not be loaded. */
  readonly error: string | null;
}

/** Increment-mode report: run identity pair + pure set delta + comparability statement. */
export interface SnapshotIncrementReport {
  readonly fromRunPath: string;
  readonly toRunPath: string;
  readonly fromRunId: string;
  readonly toRunId: string;
  readonly fromSnapshotId: string;
  readonly toSnapshotId: string;
  readonly addedIds: readonly string[];
  readonly retiredIds: readonly string[];
  readonly unchangedCount: number;
  readonly sameRootHash: boolean;
  readonly comparabilityStatement: string;
}

/** Structured CLI outcome; `exitCode` is the process exit status to return. */
export interface SnapshotVerifyOutcome {
  readonly mode: 'verify' | 'increment';
  /** Verify mode: one entry per run path. Increment mode: empty. */
  readonly results: readonly RunVerifyResult[];
  /** Increment mode: the report. Verify mode: null. */
  readonly increment: SnapshotIncrementReport | null;
  readonly json: boolean;
  readonly exitCode: 0 | 1 | 2;
  readonly usageError: string | null;
}

/** Input for runSnapshotVerify (see module doc for the argv grammar this maps from). */
export interface SnapshotVerifyInput {
  readonly runPaths: readonly string[] | '-';
  readonly json?: boolean | undefined;
  /** Increment mode: exactly two run paths (runA → runB, "from" → "to"). */
  readonly increment?: readonly [string, string] | undefined;
  /** Injectable stdin provider (used only when runPaths === '-'; default reads fd 0). */
  readonly stdin?: (() => string) | undefined;
}

/** Parsed argv for the coordinator's far.ts wiring. */
export type ParsedSnapshotVerifyArgs =
  | { readonly ok: true; readonly runPaths: readonly string[]; readonly increment: readonly [string, string] | null; readonly json: boolean }
  | { readonly ok: false; readonly error: string };

/** Parse `far snapshot-verify [--increment A B | paths... | -] [--json]` argv. */
export function parseSnapshotVerifyArgs(args: readonly string[]): ParsedSnapshotVerifyArgs {
  const runPaths: string[] = [];
  let increment: readonly [string, string] | null = null;
  let json = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--increment') {
      const from = args[i + 1];
      const to = args[i + 2];
      if (from === undefined || to === undefined || from === '' || to === '') {
        return { ok: false, error: '--increment needs exactly two run file paths (--increment <runA.json> <runB.json>)' };
      }
      increment = [from, to];
      i += 2;
      continue;
    }
    if (a === undefined) continue;
    if (a.startsWith('--')) {
      return { ok: false, error: `unknown argument "${a}"` };
    }
    runPaths.push(a);
  }
  if (increment !== null && runPaths.length > 0) {
    return { ok: false, error: 'pass either --increment <A> <B> or run paths, not both' };
  }
  if (increment === null && runPaths.length === 0) {
    return { ok: false, error: 'no run paths given (expected run .json paths, "-", or --increment <A> <B>)' };
  }
  return { ok: true, runPaths, increment, json };
}

/**
 * Run the verification (or increment report). Reads run files; does NOT print —
 * rendering is renderSnapshotVerifyHuman / renderSnapshotVerifyJson so the
 * coordinator stays a thin shim. Fail-closed batch semantics in verify mode:
 * an unreadable/malformed run becomes an ok:false error entry and forces
 * exitCode 1 (a verification batch is only "all ok" when every file verified).
 * In increment mode a load failure throws the typed RunCorpusReadError (both
 * files are core inputs — there is no partial report to print).
 */
export function runSnapshotVerify(input: SnapshotVerifyInput): SnapshotVerifyOutcome {
  const json = input.json ?? false;

  if (input.increment !== undefined) {
    if (input.increment.length !== 2) {
      return usageOutcome(json, '--increment needs exactly two run file paths');
    }
    const [fromPath, toPath] = input.increment;
    const from = readRunCorpus(fromPath);
    const to = readRunCorpus(toPath);
    const inc = snapshotIncrement(from.corpus, to.corpus);
    const report: SnapshotIncrementReport = {
      fromRunPath: fromPath,
      toRunPath: toPath,
      fromRunId: from.runId,
      toRunId: to.runId,
      fromSnapshotId: from.corpus.snapshotId,
      toSnapshotId: to.corpus.snapshotId,
      addedIds: inc.addedIds,
      retiredIds: inc.retiredIds,
      unchangedCount: inc.unchangedCount,
      sameRootHash: inc.sameRootHash,
      comparabilityStatement: inc.comparabilityStatement,
    };
    return { mode: 'increment', results: [], increment: report, json, exitCode: 0, usageError: null };
  }

  let paths: readonly string[];
  if (input.runPaths === '-') {
    let stdinText: string;
    try {
      stdinText = (input.stdin ?? (() => readStdinSync()))();
    } catch (error) {
      return usageOutcome(json, `cannot read run paths from stdin: ${error instanceof Error ? error.message : String(error)}`);
    }
    paths = stdinText.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  } else {
    paths = input.runPaths;
  }
  if (paths.length === 0) {
    return usageOutcome(json, 'no run paths given');
  }

  const results: RunVerifyResult[] = paths.map((runPath) => {
    try {
      const { runId, corpus } = readRunCorpus(runPath);
      const v = verifyCorpusSnapshot(corpus);
      return {
        runPath,
        runId,
        ok: v.ok,
        recomputedSnapshotId: v.recomputedSnapshotId,
        recomputedRootHash: v.recomputedRootHash,
        mismatches: v.mismatches,
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof RunCorpusReadError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      return {
        runPath,
        runId: null,
        ok: false,
        recomputedSnapshotId: null,
        recomputedRootHash: null,
        mismatches: [],
        error: message,
      };
    }
  });

  const anyBad = results.some((r) => !r.ok);
  return {
    mode: 'verify',
    results,
    increment: null,
    json,
    exitCode: anyBad ? 1 : 0,
    usageError: null,
  };
}

function usageOutcome(json: boolean, error: string): SnapshotVerifyOutcome {
  return { mode: 'verify', results: [], increment: null, json, exitCode: 2, usageError: error };
}

function readStdinSync(): string {
  // Synchronous stdin read for the '-' path-list mode (fd 0).
  return readFileSync(0, 'utf8');
}

/** Human-readable render (pure function of the outcome — no timestamps). */
export function renderSnapshotVerifyHuman(outcome: SnapshotVerifyOutcome): string {
  if (outcome.usageError !== null) {
    return `far snapshot-verify: ${outcome.usageError}`;
  }
  if (outcome.mode === 'increment') {
    const inc = outcome.increment;
    if (inc === null) return 'far snapshot-verify: internal error (increment mode without report)';
    const lines = [
      'Corpus increment report:',
      `  from : ${inc.fromRunPath} (runId ${inc.fromRunId}, snapshotId ${short(inc.fromSnapshotId)})`,
      `  to   : ${inc.toRunPath} (runId ${inc.toRunId}, snapshotId ${short(inc.toSnapshotId)})`,
      `  added   (${inc.addedIds.length}): ${inc.addedIds.join(', ') || '-'}`,
      `  retired (${inc.retiredIds.length}): ${inc.retiredIds.join(', ') || '-'}`,
      `  unchanged: ${inc.unchangedCount}  same rootHash: ${inc.sameRootHash ? 'yes' : 'no'}`,
      `  comparability: ${inc.comparabilityStatement}`,
    ];
    return lines.join('\n');
  }
  const lines = ['Corpus snapshot verification:'];
  let okCount = 0;
  for (const r of outcome.results) {
    if (r.ok) okCount += 1;
    lines.push(`  ${r.ok ? 'OK  ' : 'FAIL'} ${r.runPath}${r.runId === null ? '' : ` (runId ${r.runId})`}`);
    if (r.error !== null) {
      lines.push(`       error   : ${r.error}`);
    } else if (r.ok) {
      lines.push(`       snapshotId: ${short(r.recomputedSnapshotId ?? '')} rootHash: ${short(r.recomputedRootHash ?? '')} docs verified against stored hashes`);
    } else {
      for (const m of r.mismatches) lines.push(`       ${m}`);
    }
  }
  lines.push(`${outcome.results.length} run(s): ${okCount} ok, ${outcome.results.length - okCount} failed`);
  return lines.join('\n');
}

/** --json render: verify mode → array of per-run results; increment mode → report object. */
export function renderSnapshotVerifyJson(outcome: SnapshotVerifyOutcome): string {
  if (outcome.mode === 'increment') {
    return JSON.stringify(outcome.increment, null, 2);
  }
  return JSON.stringify(outcome.results, null, 2);
}

function short(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 16)}...`;
}
