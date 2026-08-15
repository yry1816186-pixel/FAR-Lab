/**
 * research/memory — the persistent cross-run Research Memory (directive §2.5).
 *
 * "The mechanism by which the system gets smarter over time": every completed
 * LIVE/MIXED run feeds four tiers of memory —
 *
 *   1. negativeResults — the ledger of eliminated directions (per §2.2 "每层
 *      淘汰原因记录入账"), each reason carrying PRECISE VALUES (learnings
 *      forced structure, dzhng/deep-research anchor);
 *   2. branchTree — the explored-branch tree with BITEMPORAL invalidation
 *      (graphiti anchor: a superseded hypothesis is NEVER deleted — it gets
 *      validTo + invalidReason + supersededBy links, evolution history intact);
 *   3. strategyStats — which reasoning strategy produced surviving conjectures
 *      in which domain (utility statistics feeding future budgets);
 *   4. learnings (research tier) + conclusions (draft tier) — the gpt-researcher
 *      two-level separation: intermediate evidence memory stays OUT of the
 *      final-conclusion tier; the draft tier admits only corroborated primary
 *      hypotheses (the SAME qualification predicate as the discovery registry
 *      — one qualification source, never two).
 *
 * Epistemics (cannot-prove, must never be hidden): memory entries record what
 * happened in past runs — they are INTERNAL PRIORS, not external evidence.
 * Every injected summary carries the verbatim header below (§2.5 "标注为内部
 * 记忆非外部证据") and never participates in a verdict or a gate decision.
 *
 * Single source of truth: the ResearchRun files are the authoritative facts;
 * this store is a REBUILDABLE derived index (see rebuildMemoryFromRuns) —
 * deleting memory.json loses convenience, never history.
 *
 * Mode discipline: only LIVE/MIXED runs record (offline fixtures would
 * pollute real memory — same lesson as the discovery registry). Zero-entropy:
 * no Date.now/Math.random reads — callers inject `now`.
 */

import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { StrategyId } from '../discovery/types.ts';
import { hypothesisContentHash, corroboratedQualifies } from '../discovery/registry.ts';
import { parseResearchRunJson } from './schemas.ts';import { renameWithRetry } from './run_lifecycle.ts';
import type { HypothesisCandidate, ResearchRun } from './types.ts';

/** Default store location (gitignored runtime artifact under `.far/`). */
export const DEFAULT_RESEARCH_MEMORY_PATH = '.far/research-memory/memory.json';

/** Verbatim injection disclaimer (§2.5 — asserted verbatim in tests). */
export const MEMORY_SUMMARY_HEADER = '【内部研究记忆（非外部证据）】';
/** Closing discipline line appended to every injected summary. */
export const MEMORY_SUMMARY_FOOTER =
  '以上仅供方向参考（内部记忆非外部证据）：禁止将记忆条目复述为假设或当作引用证据；与当前语料冲突时以语料为准。';

/** Hard character cap for the injected summary (Distraction defense). */
export const MEMORY_SUMMARY_MAX_CHARS = 4000;

/** Lock staleness bound — a crashed holder must not brick the store. */
const LOCK_STALE_MS = 30_000;

// ── Store shape ─────────────────────────────────────────────────────────────

/** Why a direction was eliminated (typed — the ledger never invents reasons). */
export type EliminationReason =
  | 'falsifiability_gate_failed'
  | 'no_bound_evidence'
  | 'tournament_eliminated'
  | 'not_selected';

/** One negative-results ledger entry (eliminated direction, precise values). */
export interface NegativeResultEntry {
  readonly id: string;
  readonly runId: string;
  readonly hypothesisId: string;
  readonly strategyOrigin: StrategyId | null;
  /** sha256 over {statement, mechanism, falsificationMethod} — same as registry. */
  readonly contentHash: string;
  readonly domain: string;
  readonly question: string;
  readonly eliminatedAt: string;
  readonly eliminationReason: EliminationReason;
  /** Precise-value detail (MUST carry numbers — learnings forced structure). */
  readonly reasonDetail: string;
  /** Pointers to the evidence of elimination (run file / gate report refs). */
  readonly evidencePointers: readonly string[];
}

/** A node of the explored-branch tree (bitemporal: supersede, never delete). */
export interface BranchNode {
  readonly id: string;
  /** Lineage parent (the node this one superseded, when evolving a lineage). */
  readonly parentId: string | null;
  readonly contentHash: string;
  readonly runId: string;
  readonly hypothesisId: string;
  readonly strategyOrigin: StrategyId | null;
  readonly domain: string;
  readonly question: string;
  readonly statement: string;
  readonly validFrom: string;
  /** null = still active; set = invalidated (superseded or kernel-refuted). */
  readonly validTo: string | null;
  readonly invalidReason: 'superseded_by' | 'kernel_refuted' | null;
  /** Nodes that superseded this one (usually one; array keeps merge history open). */
  readonly supersededByNodeIds: readonly string[];
  /** Bound counter-evidence citations (visible to future runs — anti-confirmation-bias). */
  readonly counterEvidenceCount: number;
  /** Whether this node was the primary of its run (lineage heads). */
  readonly isPrimary: boolean;
}

/** Cross-run strategy utility per domain (which moves survive here). */
export interface StrategyDomainStat {
  readonly strategy: StrategyId;
  readonly domain: string;
  readonly runsObserved: number;
  readonly generated: number;
  readonly survivedFalsifiabilityGate: number;
  readonly corroborated: number;
  readonly tournamentWins: number;
  readonly primarySelections: number;
  readonly errors: number;
  readonly skips: number;
}

/** Research-tier learning (forced structure: entities/values/dates explicit). */
export interface LearningRecord {
  readonly id: string;
  readonly runId: string;
  readonly domain: string;
  readonly tier: 'research';
  readonly entities: readonly string[];
  readonly preciseValues: readonly string[];
  readonly dates: readonly string[];
  readonly text: string;
  readonly recordedAt: string;
}

/** Draft-tier conclusion (only corroborated primaries ever reach this tier). */
export interface ConclusionRecord {
  readonly id: string;
  readonly contentHash: string;
  readonly statement: string;
  readonly question: string;
  readonly domain: string;
  readonly runId: string;
  readonly hypothesisId: string;
  readonly recordedAt: string;
  readonly ladderState: 'CORROBORATED';
}

/** The on-disk memory document. */
export interface ResearchMemoryStore {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly negativeResults: readonly NegativeResultEntry[];
  readonly branchTree: readonly BranchNode[];
  readonly strategyStats: readonly StrategyDomainStat[];
  readonly learnings: readonly LearningRecord[];
  readonly conclusions: readonly ConclusionRecord[];
}

export function emptyMemoryStore(now: () => Date = () => new Date()): ResearchMemoryStore {
  return {
    schemaVersion: 1,
    updatedAt: now().toISOString(),
    negativeResults: [],
    branchTree: [],
    strategyStats: [],
    learnings: [],
    conclusions: [],
  };
}

// ── Load / save (fail-closed on corruption, atomic write, cross-process lock) ─

/**
 * Load the memory store. Missing file → empty store (first run). A corrupt or
 * future-versioned file is a HARD error — silently rebuilding would fake amnesia.
 */
export function loadResearchMemory(path: string = DEFAULT_RESEARCH_MEMORY_PATH): ResearchMemoryStore {
  if (!existsSync(path)) return emptyMemoryStore();
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `research memory at ${path} is not valid JSON — refusing to silently rebuild (repair or archive the file): ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  const errors = validateMemoryShape(parsed);
  if (errors.length > 0) {
    throw new Error(`research memory at ${path} is structurally invalid: ${errors.join('; ')}`);
  }
  const store = parsed as ResearchMemoryStore;
  if (store.schemaVersion !== 1) {
    throw new Error(
      `research memory at ${path} has schemaVersion ${String(store.schemaVersion)} — this build understands version 1 only (fail-closed)`,
    );
  }
  return store;
}

function validateMemoryShape(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['not an object'];
  const s = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof s['schemaVersion'] !== 'number') errors.push('schemaVersion must be a number');
  if (typeof s['updatedAt'] !== 'string') errors.push('updatedAt must be a string');
  for (const key of ['negativeResults', 'branchTree', 'strategyStats', 'learnings', 'conclusions'] as const) {
    if (!Array.isArray(s[key])) errors.push(`${key} must be an array`);
  }
  return errors;
}

/** Serialize + atomically write the store (tmp + Windows-resilient rename). */
export function saveResearchMemory(path: string, store: ResearchMemoryStore): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  renameWithRetry(tmp, path);
}

/** Read-modify-write under the cross-process lock (whole-store swap is atomic). */
function withMemoryLock<T>(path: string, fn: (store: ResearchMemoryStore) => T): T {
  const lockPath = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx');
      closeSync(fd);
      try {
        return fn(loadResearchMemory(path));
      } finally {
        try {
          unlinkSync(lockPath);
        } catch {
          // already reclaimed by a stale-cleanup race — advisory lock, not an invariant
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
        try {
          unlinkSync(lockPath);
          continue;
        } catch {
          // raced another reclaimer — fall through to the backoff
        }
      }
      const until = Date.now() + 100;
      while (Date.now() < until) {
        /* brief busy wait (same family as the registry lock) */
      }
    }
  }
  throw new Error(`research memory lock contention at ${lockPath} — another writer is stuck`);
}

// ── Recording a completed run ────────────────────────────────────────────────

/** Outcome of recording one run (mirrors RegistrationOutcome semantics). */
export interface MemoryRecordingOutcome {
  readonly skippedMode: boolean;
  readonly negativeRecorded: number;
  readonly branchesAdded: number;
  readonly branchesSuperseded: number;
  readonly conclusionsRecorded: number;
  readonly learningsRecorded: number;
}

/** Nothing-recorded outcome for non-recording modes. */
function skippedModeOutcome(): MemoryRecordingOutcome {
  return {
    skippedMode: true,
    negativeRecorded: 0,
    branchesAdded: 0,
    branchesSuperseded: 0,
    conclusionsRecorded: 0,
    learningsRecorded: 0,
  };
}

/** The domain of a run ('unknown' when the gate recorded none). */
function domainOfRun(run: ResearchRun): string {
  return run.gateReport.scope.domain ?? 'unknown';
}

/**
 * Record one completed run into the memory store (idempotent per
 * (runId, hypothesisId, kind); LIVE/MIXED only).
 */
export function recordRunToMemory(
  run: ResearchRun,
  opts: { memoryPath?: string; now?: () => Date } = {},
): MemoryRecordingOutcome {
  if (run.runMode !== 'LIVE' && run.runMode !== 'MIXED') {
    return skippedModeOutcome();
  }
  const path = opts.memoryPath ?? DEFAULT_RESEARCH_MEMORY_PATH;
  const at = (opts.now ?? (() => new Date()))().toISOString();
  const domain = domainOfRun(run);
  const primaryId = run.plan.primaryHypothesisId;
  const tournamentRatings = new Map(
    (run.discovery?.tournament?.ratings ?? []).map((r) => [r.id, r]),
  );

  return withMemoryLock(path, (prev) => {
    // Idempotency indexes over (runId, hypothesisId, kind).
    const negKey = (runId: string, hypId: string): string => `${runId}:${hypId}`;
    const knownNeg = new Set(prev.negativeResults.map((n) => negKey(n.runId, n.hypothesisId)));
    const knownBranch = new Set(prev.branchTree.map((b) => negKey(b.runId, b.hypothesisId)));
    const knownConclusion = new Set(prev.conclusions.map((c) => negKey(c.runId, c.hypothesisId)));
    const knownLearning = new Set(prev.learnings.map((l) => l.runId));

    const negatives: NegativeResultEntry[] = [];
    const branches: BranchNode[] = [];
    const conclusions: ConclusionRecord[] = [];
    let superseded = 0;
    // Mutable working copy for bitemporal supersede edits (the final store is
    // rebuilt immutably from it — loaded objects are never patched in place).
    let branchTreeSoFar: readonly BranchNode[] = prev.branchTree;

    for (const hypothesis of run.hypotheses) {
      const gateEntry = run.falsifiabilityGate.perHypothesis[hypothesis.id];
      const binding = run.bindings[hypothesis.id];
      const counterCount = binding?.boundCounter.length ?? 0;
      const contentHash = hypothesisContentHash(hypothesis);
      const runPointer = `run:${run.runId}/hypothesis/${hypothesis.id}`;

      if (gateEntry?.passed !== true) {
        // Eliminated at the falsifiability gate — never a valid branch.
        if (!knownNeg.has(negKey(run.runId, hypothesis.id))) {
          negatives.push({
            id: `neg-${contentHash.slice(0, 12)}-${run.runId.slice(-6).toLowerCase()}`,
            runId: run.runId,
            hypothesisId: hypothesis.id,
            strategyOrigin: hypothesis.strategyOrigin ?? null,
            contentHash,
            domain,
            question: run.question,
            eliminatedAt: at,
            eliminationReason: 'falsifiability_gate_failed',
            reasonDetail: withPreciseValues(
              `falsifiability gate errors: ${(gateEntry?.errors ?? ['no gate record']).join('; ')}`,
              { gateErrors: gateEntry?.errors.length ?? 0, candidates: run.hypotheses.length },
            ),
            evidencePointers: [runPointer, 'falsifiabilityGate.perHypothesis'],
          });
        }
        continue;
      }
      if (!corroboratedQualifies(hypothesis, run)) {
        // Structured but evidence-free — explored, not corroborated: ledger only.
        if (!knownNeg.has(negKey(run.runId, hypothesis.id))) {
          negatives.push({
            id: `neg-${contentHash.slice(0, 12)}-${run.runId.slice(-6).toLowerCase()}`,
            runId: run.runId,
            hypothesisId: hypothesis.id,
            strategyOrigin: hypothesis.strategyOrigin ?? null,
            contentHash,
            domain,
            question: run.question,
            eliminatedAt: at,
            eliminationReason: 'no_bound_evidence',
            reasonDetail: withPreciseValues('no bound citations (CORROBORATED requires evidence)', {
              boundSupporting: binding?.boundSupporting.length ?? 0,
              boundCounter: counterCount,
            }),
            evidencePointers: [runPointer, 'bindings'],
          });
        }
        continue;
      }

      // Corroborated-qualified → a real branch of explored space.
      if (!knownBranch.has(negKey(run.runId, hypothesis.id))) {
        // Bitemporal supersede (computed immutably): the new PRIMARY of a
        // (question, strategy) lineage invalidates the previous still-active
        // primary of that lineage — evolution history preserved, never deleted
        // (graphiti-style; the old node stays with validTo + supersededBy).
        let parentId: string | null = null;
        if (hypothesis.id === primaryId) {
          const oldHead = branchTreeSoFar.find(
            (b) =>
              b.validTo === null &&
              b.isPrimary &&
              b.question === run.question &&
              b.strategyOrigin === (hypothesis.strategyOrigin ?? null),
          );
          if (oldHead !== undefined) {
            parentId = oldHead.id;
            branchTreeSoFar = branchTreeSoFar.map((b) =>
              b.id === oldHead.id
                ? {
                    ...b,
                    validTo: at,
                    invalidReason: 'superseded_by' as const,
                    supersededByNodeIds: [...b.supersededByNodeIds, `node-${contentHash.slice(0, 12)}-${run.runId.slice(-6).toLowerCase()}`],
                  }
                : b,
            );
            superseded += 1;
          }
        }
        const node: BranchNode = {
          id: `node-${contentHash.slice(0, 12)}-${run.runId.slice(-6).toLowerCase()}`,
          parentId,
          contentHash,
          runId: run.runId,
          hypothesisId: hypothesis.id,
          strategyOrigin: hypothesis.strategyOrigin ?? null,
          domain,
          question: run.question,
          statement: hypothesis.statement,
          validFrom: at,
          validTo: null,
          invalidReason: null,
          supersededByNodeIds: [],
          counterEvidenceCount: counterCount,
          isPrimary: hypothesis.id === primaryId,
        };
        branches.push(node);
      }

      if (hypothesis.id === primaryId) {
        if (!knownConclusion.has(negKey(run.runId, hypothesis.id))) {
          conclusions.push({
            id: `ccl-${contentHash.slice(0, 12)}-${run.runId.slice(-6).toLowerCase()}`,
            contentHash,
            statement: hypothesis.statement,
            question: run.question,
            domain,
            runId: run.runId,
            hypothesisId: hypothesis.id,
            recordedAt: at,
            ladderState: 'CORROBORATED',
          });
        }
      } else if (!run.plan.alternativeHypothesisIds.includes(hypothesis.id)) {
        // Corroborated but neither primary nor kept-alive alternative → the
        // tournament/selection layer eliminated it (§2.2 ledger duty).
        const rating = tournamentRatings.get(hypothesis.id);
        if (!knownNeg.has(negKey(run.runId, hypothesis.id))) {
          negatives.push({
            id: `neg-${contentHash.slice(0, 12)}-${run.runId.slice(-6).toLowerCase()}`,
            runId: run.runId,
            hypothesisId: hypothesis.id,
            strategyOrigin: hypothesis.strategyOrigin ?? null,
            contentHash,
            domain,
            question: run.question,
            eliminatedAt: at,
            eliminationReason: rating !== undefined ? 'tournament_eliminated' : 'not_selected',
            reasonDetail:
              rating !== undefined
                ? withPreciseValues(
                    `tournament rank ${rating.rank} (elo ${rating.elo.toFixed(1)}, wins ${rating.wins}, losses ${rating.losses}) — primary went to another lineage`,
                    { rank: rating.rank },
                  )
                : withPreciseValues('not selected as primary and not kept as a plan alternative', {
                    alternatives: run.plan.alternativeHypothesisIds.length,
                  }),
            evidencePointers: [runPointer, rating !== undefined ? 'discovery.tournament' : 'plan'],
          });
        }
      }
    }

    // Strategy utility statistics (aggregate counters over per-run facts).
    const stats = prev.strategyStats.map((s) => ({ ...s }));
    const bump = (
      strategy: StrategyId,
      patch: Partial<Omit<StrategyDomainStat, 'strategy' | 'domain'>>,
    ): void => {
      let row = stats.find((s) => s.strategy === strategy && s.domain === domain);
      if (row === undefined) {
        row = {
          strategy,
          domain,
          runsObserved: 0,
          generated: 0,
          survivedFalsifiabilityGate: 0,
          corroborated: 0,
          tournamentWins: 0,
          primarySelections: 0,
          errors: 0,
          skips: 0,
        };
        stats.push(row);
      }
      row.runsObserved += 1;
      row.generated += patch.generated ?? 0;
      row.survivedFalsifiabilityGate += patch.survivedFalsifiabilityGate ?? 0;
      row.corroborated += patch.corroborated ?? 0;
      row.tournamentWins += patch.tournamentWins ?? 0;
      row.primarySelections += patch.primarySelections ?? 0;
      row.errors += patch.errors ?? 0;
      row.skips += patch.skips ?? 0;
    };
    const byStrategy = new Map<StrategyId | null, HypothesisCandidate[]>();
    for (const h of run.hypotheses) {
      const key = h.strategyOrigin ?? null;
      byStrategy.set(key, [...(byStrategy.get(key) ?? []), h]);
    }
    for (const [strategyOrNull, hyps] of byStrategy) {
      if (strategyOrNull === null) continue; // legacy runs carry no strategy facts
      bump(strategyOrNull, {
        generated: hyps.length,
        survivedFalsifiabilityGate: hyps.filter((h) => run.falsifiabilityGate.perHypothesis[h.id]?.passed === true).length,
        corroborated: hyps.filter((h) => corroboratedQualifies(h, run)).length,
        tournamentWins: hyps.filter((h) => (tournamentRatings.get(h.id)?.wins ?? 0) > 0).length,
        primarySelections: hyps.some((h) => h.id === primaryId) ? 1 : 0,
      });
    }
    for (const call of run.discovery?.fanout?.perStrategy ?? []) {
      if (call.error !== null && byStrategy.has(call.strategyId)) {
        bump(call.strategyId, { errors: 1 });
      }
      if (call.skipReason !== null && byStrategy.has(call.strategyId)) {
        bump(call.strategyId, { skips: 1 });
      }
    }

    // One forced-structure learning per run (research tier).
    const learnings: LearningRecord[] = [];
    if (!knownLearning.has(run.runId)) {
      const corroboratedCount = run.hypotheses.filter((h) => corroboratedQualifies(h, run)).length;
      const primary = run.hypotheses.find((h) => h.id === primaryId);
      const topRating = run.discovery?.tournament?.ratings[0];
      const learning: LearningRecord = {
        id: `lrn-${run.runId.slice(-6).toLowerCase()}-${run.runId.length}`,
        runId: run.runId,
        domain,
        tier: 'research',
        entities: [
          ...(primary?.strategyOrigin !== undefined ? [`strategy:${primary.strategyOrigin}`] : []),
          `domain:${domain}`,
        ],
        preciseValues: [
          `corroborated=${corroboratedCount}/${run.hypotheses.length}`,
          ...(topRating !== undefined ? [`topElo=${topRating.elo.toFixed(1)}`] : []),
          `counterBound=${Object.values(run.bindings).reduce((n, b) => n + b.boundCounter.length, 0)}`,
        ],
        dates: [at],
        text: `run ${run.runId} on "${run.question.slice(0, 60)}": ${corroboratedCount}/${run.hypotheses.length} hypotheses corroborated; primary=${primaryId}`,
        recordedAt: at,
      };
      assertLearningStructure(learning);
      learnings.push(learning);
    }

    if (
      negatives.length === 0 &&
      branches.length === 0 &&
      conclusions.length === 0 &&
      learnings.length === 0 &&
      superseded === 0 &&
      stats.length === prev.strategyStats.length
    ) {
      return {
        skippedMode: false,
        negativeRecorded: 0,
        branchesAdded: 0,
        branchesSuperseded: 0,
        conclusionsRecorded: 0,
        learningsRecorded: 0,
      };
    }

    const next: ResearchMemoryStore = {
      schemaVersion: 1,
      updatedAt: at,
      negativeResults: [...prev.negativeResults, ...negatives],
      branchTree: [...branchTreeSoFar, ...branches],
      strategyStats: stats,
      learnings: [...prev.learnings, ...learnings],
      conclusions: [...prev.conclusions, ...conclusions],
    };
    saveResearchMemory(path, next);
    return {
      skippedMode: false,
      negativeRecorded: negatives.length,
      branchesAdded: branches.length,
      branchesSuperseded: superseded,
      conclusionsRecorded: conclusions.length,
      learningsRecorded: learnings.length,
    };
  });
}

/** Ensure a reason detail carries digits (learnings forced structure). */
function withPreciseValues(
  base: string,
  counters: Record<string, number>,
): string {
  if (/\d/.test(base)) return base;
  const suffix = Object.entries(counters)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return suffix.length > 0 ? `${base} [${suffix}]` : `${base} [count=0]`;
}

/** Learnings anchor: entities / precise values / dates must ALL be explicit. */
export function assertLearningStructure(learning: LearningRecord): void {
  if (learning.entities.length === 0) throw new Error('learning record requires ≥1 entity (forced structure, dzhng anchor)');
  if (learning.preciseValues.length === 0) throw new Error('learning record requires ≥1 precise value (forced structure)');
  if (learning.dates.length === 0 || !learning.dates.every((d) => !Number.isNaN(Date.parse(d)))) {
    throw new Error('learning record requires ≥1 parseable UTC date (forced structure)');
  }
}

// ── Injection summary (deterministic, bounded, marked as internal prior) ─────

/** Bounded deterministic summary for run-start injection (§2.5). */
export function buildMemorySummary(
  store: ResearchMemoryStore,
  opts: { domain?: string } = {},
): string {
  const domain = opts.domain?.toLowerCase() ?? null;
  const matchesDomain = (entryDomain: string): boolean => {
    if (domain === null) return true;
    const e = entryDomain.toLowerCase();
    return e === domain || e.includes(domain) || domain.includes(e);
  };
  const lines: string[] = [MEMORY_SUMMARY_HEADER];
  const activeBranches = store.branchTree.filter((b) => b.validTo === null && matchesDomain(b.domain));
  if (activeBranches.length > 0) {
    lines.push(
      `已探索分支（本域 active=${activeBranches.length}/全部=${store.branchTree.length}）——以下方向已有谱系，勿原样重复：`,
    );
    for (const b of activeBranches.slice(-3).reverse()) {
      lines.push(`  · [${b.validFrom.slice(0, 10)}] ${(b.strategyOrigin ?? 'legacy')}: ${truncate(b.statement, 110)}`);
    }
  }
  const negatives = store.negativeResults
    .filter((n) => matchesDomain(n.domain))
    .sort((a, b) => (a.eliminatedAt < b.eliminatedAt ? 1 : -1))
    .slice(0, 5);
  if (negatives.length > 0) {
    lines.push('负结果台账（已淘汰方向及原因——重新提出前须有新证据或新机制）：');
    for (const n of negatives) {
      lines.push(`  · [${n.eliminatedAt.slice(0, 10)}] ${n.eliminationReason}（${n.strategyOrigin ?? 'legacy'}）: ${truncate(n.reasonDetail, 120)}`);
    }
  }
  const stats = store.strategyStats
    .filter((s) => matchesDomain(s.domain) && s.generated > 0)
    .sort((a, b) => survivalRate(b) - survivalRate(a) || a.strategy.localeCompare(b.strategy))
    .slice(0, 3);
  if (stats.length > 0) {
    lines.push('策略效用统计（本域存活率=corroborated/generated）：');
    for (const s of stats) {
      lines.push(`  · ${s.strategy}@${s.domain}: generated=${s.generated} corroborated=${s.corroborated} (${(survivalRate(s) * 100).toFixed(0)}%) wins=${s.tournamentWins}`);
    }
  }
  const conclusions = store.conclusions
    .filter((c) => matchesDomain(c.domain))
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
    .slice(0, 3);
  if (conclusions.length > 0) {
    lines.push('往轮结论（draft 层，仅 corroborated 主假设）：');
    for (const c of conclusions) {
      lines.push(`  · [${c.recordedAt.slice(0, 10)}] ${truncate(c.statement, 100)}`);
    }
  }
  lines.push(MEMORY_SUMMARY_FOOTER);
  const text = lines.join('\n');
  if (text.length <= MEMORY_SUMMARY_MAX_CHARS) return text;
  return `${text.slice(0, MEMORY_SUMMARY_MAX_CHARS - 1)}…[截断：摘要超 ${MEMORY_SUMMARY_MAX_CHARS} 字符上限]`;
}

function survivalRate(s: StrategyDomainStat): number {
  return s.generated > 0 ? s.corroborated / s.generated : 0;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Everything the orchestrator needs at run start: prior text + dedup index. */
export interface MemoryInjectionPayload {
  readonly summary: string | null;
  /** Content hashes already explored (branches) or eliminated (negatives). */
  readonly knownContentHashes: ReadonlySet<string>;
}

/** Build the injection payload from the store (null summary = nothing to inject). */
export function buildMemoryInjection(
  store: ResearchMemoryStore,
  opts: { domain?: string } = {},
): MemoryInjectionPayload {
  const known = new Set<string>([
    ...store.branchTree.map((b) => b.contentHash),
    ...store.negativeResults.map((n) => n.contentHash),
  ]);
  const emptyStore =
    store.branchTree.length === 0 &&
    store.negativeResults.length === 0 &&
    store.conclusions.length === 0 &&
    store.strategyStats.length === 0 &&
    store.learnings.length === 0;
  return {
    summary: emptyStore ? null : buildMemorySummary(store, opts),
    knownContentHashes: known,
  };
}

// ── Dedup screening (exact content-hash; marking only, never selection power) ─

export interface MemoryScreenHit {
  readonly id: string;
  /** Machine-greppable marker (PARAPHRASE_RISK sibling). */
  readonly marker: string;
}

/**
 * Flag candidates whose scientific content was already explored (branch) or
 * already eliminated (negative). b5 scope: MARK ONLY — selection/scorecard
 * wiring is a later batch (declared, not hidden).
 */
export function screenAgainstMemory(
  candidates: readonly HypothesisCandidate[],
  store: ResearchMemoryStore,
): readonly MemoryScreenHit[] {
  const branchByHash = new Map(store.branchTree.map((b) => [b.contentHash, b]));
  const negativeByHash = new Map(store.negativeResults.map((n) => [n.contentHash, n]));
  const hits: MemoryScreenHit[] = [];
  for (const candidate of candidates) {
    const hash = hypothesisContentHash(candidate);
    const neg = negativeByHash.get(hash);
    if (neg !== undefined) {
      hits.push({ id: candidate.id, marker: `MEMORY_DUPLICATE:negative:${neg.id}` });
      continue;
    }
    const branch = branchByHash.get(hash);
    if (branch !== undefined) {
      hits.push({ id: candidate.id, marker: `MEMORY_DUPLICATE:branch:${branch.id}` });
    }
  }
  return hits;
}

// ── Lineage query (bitemporal walk) ─────────────────────────────────────────

/** Walk one lineage: node → supersededBy chain (oldest first). */
export function traceLineage(
  store: ResearchMemoryStore,
  fromContentHash: string,
): readonly BranchNode[] {
  const byId = new Map(store.branchTree.map((b) => [b.id, b]));
  const start = store.branchTree.find((b) => b.contentHash === fromContentHash);
  if (start === undefined) return [];
  const chain: BranchNode[] = [start];
  let cursor: BranchNode | undefined = start;
  while (cursor !== undefined && cursor.supersededByNodeIds.length > 0) {
    cursor = byId.get(cursor.supersededByNodeIds[0] ?? '');
    if (cursor !== undefined) chain.push(cursor);
  }
  return chain;
}

// ── Kernel-adjudication backflow (called by far research adjudicate) ─────────

/** Invalidate branches whose content the kernel REFUTED (never delete). */
export function markKernelRefuted(
  opts: { contentHash: string; at: string },
  paths: { memoryPath?: string } = {},
): number {
  const path = paths.memoryPath ?? DEFAULT_RESEARCH_MEMORY_PATH;
  return withMemoryLock(path, (prev) => {
    let refuted = 0;
    const branchTree = prev.branchTree.map((b) => {
      if (b.contentHash !== opts.contentHash || b.validTo !== null) return b;
      refuted += 1;
      return { ...b, validTo: opts.at, invalidReason: 'kernel_refuted' as const };
    });
    if (refuted === 0) return 0;
    const next: ResearchMemoryStore = { ...prev, updatedAt: opts.at, branchTree };
    saveResearchMemory(path, next);
    return refuted;
  });
}

// ── Rebuild (memory = derived index over the authoritative run files) ────────

/**
 * Rebuild the memory store from run files (the single-source-of-truth proof:
 * a deleted memory.json must be reconstructible to an equivalent form).
 * Records in run-file order; returns the fresh store WITHOUT writing it.
 */
export function rebuildMemoryFromRuns(
  runFilePaths: readonly string[],
  opts: { now?: () => Date; memoryPath?: string } = {},
): { store: ResearchMemoryStore; outcome: MemoryRecordingOutcome; runsSkippedOffline: number } {
  const memoryPath = opts.memoryPath ?? DEFAULT_RESEARCH_MEMORY_PATH;
  const now = opts.now ?? (() => new Date());
  // Seed an empty store file so recordRunToMemory's load-modify-write has a base.
  saveResearchMemory(memoryPath, emptyMemoryStore(now));
  let outcome = skippedModeOutcome();
  let runsSkippedOffline = 0;
  for (const file of runFilePaths) {
    const run = parseResearchRunJson(readFileSync(file, 'utf8'));
    if (run.runMode !== 'LIVE' && run.runMode !== 'MIXED') {
      runsSkippedOffline += 1;
      continue;
    }
    outcome = recordRunToMemory(run, { memoryPath, now });
  }
  return { store: loadResearchMemory(memoryPath), outcome, runsSkippedOffline };
}
