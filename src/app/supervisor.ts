import type { Store } from '../persistence/store.js';

/**
 * Research Supervisor (AVO fusion, G2 — the P0 gap).
 *
 * AVO (arXiv:2603.24517 §3.3; NVIDIA blog 2026-08-21) attributes long-horizon
 * autonomy to two mechanisms: persistent memory and SUPERVISION that "monitors
 * the broader trajectory for stagnation or repeated unproductive cycles and can
 * redirect the main agent". NOOA ships no supervisor (grep-verified @97f52de),
 * so this module is FAR-Lab's own, built on the event spine we already have.
 *
 * Discipline invariants (AGENTS.md §7 + orchestrator ownership):
 * - The supervisor is READ-ONLY. It analyzes persisted events and returns
 *   typed signals with recommendations. It never mutates run state — reopening
 *   stages stays the orchestrator's exclusive authority (evaluateIteration /
 *   stage machine), and any human/automation caller decides what to act on.
 * - Deterministic only. Signal detection is pure computation over the event
 *   log; LLM advisory reasoning lives elsewhere and consumes these signals,
 *   never produces them.
 * - Fail-visible: a missing run surfaces as an empty-window observation with a
 *   stalled_horizon signal rather than a silent pass.
 */

/** Closed vocabulary of supervisor signals (AVO failure modes, machine-readable). */
export const SUPERVISOR_SIGNAL_KINDS = [
  'stalled_horizon', // exploration line exhausted / process quiet beyond window
  'repeated_failure', // same failing signature recurring (AVO "unproductive cycles of edits")
  'unproductive_cycle', // busy but no material delta across the window
] as const;
export type SupervisorSignalKind = (typeof SUPERVISOR_SIGNAL_KINDS)[number];

export type SupervisorSeverity = 'low' | 'medium' | 'high';

export interface SupervisorRecommendation {
  /** Machine-readable action hint; consumers map it onto their own authority. */
  action:
    | 'resume_or_replan' // stalled_horizon
    | 'change_strategy' // repeated_failure
    | 'branch_or_deepen'; // unproductive_cycle
  rationale: string;
}

export interface SupervisorSignal {
  kind: SupervisorSignalKind;
  severity: SupervisorSeverity;
  evidence: Record<string, unknown>;
  recommendation: SupervisorRecommendation;
}

export interface TrajectoryObservation {
  runId: string;
  now: string;
  quietWindowMs: number;
  observation: {
    /** Events inside the analysis window (oldest first). */
    windowEvents: number;
    /** Total events on record for the run. */
    eventCount: number;
    /** ms since the last persisted event (0 when none exist). */
    msSinceLastEvent: number;
    distinctFailureSignatures: number;
    dominantFailureSignature?: { signature: string; count: number };
  };
  signals: SupervisorSignal[];
}

interface AnalysisOptions {
  store: Store;
  runId: string;
  /** Instant treated as "now" (ISO). Injectable for deterministic tests. */
  now?: string;
  /** Quiet period after which the horizon counts as stalled. */
  quietWindowMs?: number;
}

const DEFAULT_QUIET_WINDOW_MS = 30 * 60_000; // 30 min: > provider retry budget (~120s) x headroom
const REPEATED_FAILURE_THRESHOLD = 3;
const CYCLE_ACTIVITY_FLOOR = 4; // fewer busy events than this cannot be a "cycle"

/** Collapse a failure into its comparable signature: stage + normalized error text. */
const failureSignature = (detail: Record<string, unknown>, stage?: string): string => {
  const raw = typeof detail.error === 'string' ? detail.error : '';
  const normalized = raw.replace(/\s+/g, ' ').trim().slice(0, 120).toLowerCase();
  return `${stage ?? '?'}::${normalized}`;
};

/**
 * Pure, read-only trajectory analysis over persisted events.
 * Stop-rule ordering mirrors AVO's two named failure modes plus stall.
 */
export const analyzeTrajectory = (opts: AnalysisOptions): TrajectoryObservation => {
  const { store, runId } = opts;
  const now = opts.now ?? new Date().toISOString();
  const quietWindowMs = opts.quietWindowMs ?? DEFAULT_QUIET_WINDOW_MS;

  const all = listEvents(store, runId); // oldest-first per store contract
  const nowMs = Date.parse(now);
  const last = all.at(-1);
  const msSinceLastEvent = last ? Math.max(0, nowMs - Date.parse(last.at)) : Number.MAX_SAFE_INTEGER;

  // ---- signal 1: stalled_horizon ----
  const signals: SupervisorSignal[] = [];
  if (!last || msSinceLastEvent > quietWindowMs) {
    signals.push({
      kind: 'stalled_horizon',
      severity: 'high',
      evidence: {
        msSinceLastEvent: last ? msSinceLastEvent : null,
        quietWindowMs,
        lastEventType: last?.type ?? null,
      },
      recommendation: {
        action: 'resume_or_replan',
        rationale: !last
          ? 'run has no recorded activity at all'
          : `no persisted activity for ${Math.round(msSinceLastEvent / 1000)}s (> quiet window ${Math.round(quietWindowMs / 1000)}s)`,
      },
    });
  }

  // ---- signal 2: repeated_failure (identical signatures within window) ----
  const failures = new Map<string, number>();
  for (const e of all) {
    if (e.type !== 'stage_failed') continue;
    const sig = failureSignature(e.detail, e.stage);
    failures.set(sig, (failures.get(sig) ?? 0) + 1);
  }
  let dominant: { signature: string; count: number } | undefined;
  for (const [signature, count] of failures) {
    if (!dominant || count > dominant.count) dominant = { signature, count };
  }
  if (dominant && dominant.count >= REPEATED_FAILURE_THRESHOLD) {
    signals.push({
      kind: 'repeated_failure',
      severity: 'high',
      evidence: { signature: dominant.signature, count: dominant.count, distinctSignatures: failures.size },
      recommendation: {
        action: 'change_strategy',
        rationale: `the same failure ("${dominant.signature}") recurred ${dominant.count}x — retrying unchanged is a loop, not progress`,
      },
    });
  }

  // ---- signal 3: unproductive_cycle (activity without material delta) ----
  const notes = all.filter((e) => e.type === 'note');
  if (notes.length >= CYCLE_ACTIVITY_FLOOR && !signals.some((s) => s.kind === 'stalled_horizon')) {
    const fps = notes.map((e) => (typeof e.detail.fingerprint === 'string' ? e.detail.fingerprint : ''));
    const distinctFps = new Set(fps.filter(Boolean));
    // No fingerprint variety among busy steps == churn without state change.
    // (Iteration-level material-delta detection stays in iteration.ts; this is
    // the intra-round busy-but-flat pattern.)
    if (fps.length >= CYCLE_ACTIVITY_FLOOR && distinctFps.size <= 1 && Boolean(fps[0])) {
      signals.push({
        kind: 'unproductive_cycle',
        severity: 'medium',
        evidence: { busyEvents: notes.length, distinctFingerprints: distinctFps.size },
        recommendation: {
          action: 'branch_or_deepen',
          rationale: `${notes.length} activity bursts produced no material delta — branch to a different direction or deepen before spending more`,
        },
      });
    }
  }

  return {
    runId,
    now,
    quietWindowMs,
    observation: {
      windowEvents: all.length,
      eventCount: all.length,
      msSinceLastEvent: last ? msSinceLastEvent : Number.MAX_SAFE_INTEGER,
      distinctFailureSignatures: failures.size,
      ...(dominant ? { dominantFailureSignature: dominant } : {}),
    },
    signals,
  };
};

// ---- local import shim (keeps the module import graph cycle-free) ----
// listEvents lives on Store as a method; re-exported here for typing clarity.
function listEvents(store: Store, runId: string) {
  return store.listEvents(runId);
}
