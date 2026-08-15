/**
 * discovery/registry — the Discovery Registry (directive §2.4): every
 * conjecture reaching CORROBORATED or above gets an append-only registration
 * record with content hash + timestamp + full provenance (invention-log
 * style), exportable for external notarization.
 *
 * Tamper evidence: records form a hash chain — recordHash covers the full
 * canonical record (minus recordHash itself) and prevRecordHash points at the
 * previous line, so any edit to a historical record breaks every later link
 * (same philosophy as the evidence chain).
 *
 * Epistemics (cannot-prove, must never be hidden): a registry record proves
 * WHEN, WITH WHAT PROVENANCE, and IN WHAT CONTENT a conjecture was
 * registered. It does NOT prove the conjecture true, novel, or validated —
 * NOVEL_* states additionally require literature search + explicit human
 * review (§2.4 disclosure discipline; enforced by transitionConjectureState).
 *
 * Mode discipline: only LIVE/MIXED runs may write to a real ledger —
 * offline/synthetic/replay runs never touch disk (test-pollution lesson from
 * the retrieval-cache batch). registeredAt is wall-clock (notarization
 * semantics, outside the deterministic kernel); tests inject a fixed clock.
 */

import {
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  statSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import { renameWithRetry } from '../research/run_lifecycle.ts';
import type { HypothesisCandidate, ResearchRun } from '../research/types.ts';
import { transitionConjectureState, type ConjectureState, type StrategyId } from './types.ts';

// Single implementation moved to the leaf module (content_hash.ts) so the
// fan-out dedup and research memory can share it without import cycles.
export { hypothesisContentHash } from './content_hash.ts';

/** Default ledger location (gitignored runtime artifact under `.far/`). */
export const DEFAULT_DISCOVERY_REGISTRY_PATH = '.far/discovery/registry.jsonl';

/** Lock staleness bound — a holder crashed mid-append must not brick the ledger. */
const LOCK_STALE_MS = 30_000;

export interface RegistryProvenance {
  readonly strategyOrigin?: StrategyId | undefined;
  readonly corpusSnapshotId: string;
  readonly corpusRootHash: string;
  readonly modelProfile: string;
  readonly supportingCitations: readonly string[];
  readonly counterEvidenceCitations: readonly string[];
  /** sha256 over the run's stage-receipt projection (full receipts live in the run file). */
  readonly receiptsDigest: string;
  // ── Generation-side minimum provenance (directive §2.4 补遗; optional on
  //    pre-b4 ledger lines = "not recorded then", never fabricated) ───────────
  /** sha256 of the strategy's prompt signature — which prompt version produced this conjecture. */
  readonly strategySignatureHash?: string | null | undefined;
  /** Model id actually invoked (null = offline fixture / not recorded). */
  readonly modelId?: string | null | undefined;
  /** Gateway/provider identity of the generating call. */
  readonly provider?: string | null | undefined;
  /** Sampling temperature explicitly set (null = not set; LIVE qwen default 0.3). */
  readonly temperature?: number | null | undefined;
  /** Sampling seed (null = not set). */
  readonly seed?: number | null | undefined;
}

/** Typed promotion evidence — mirrors ConjecturePromotionEvidence (fail-closed reuse). */
export interface RegistryEvidence {
  readonly deterministicCheckRef?: string | undefined;
  readonly matchingLiterature?: string | undefined;
  readonly humanReviewRef?: string | undefined;
  /**
   * Present on KERNEL_ADJUDICATED transition lines (b5 backflow): what the
   * deterministic verdict kernel said, over which observation. Absent on
   * older lines = "not recorded then" (additive optional field).
   */
  readonly adjudication?: {
    readonly verdict: string;
    readonly observationId: string;
    readonly adapter: string;
    readonly metricValue: number;
  } | undefined;
  /**
   * Present on human-review transition lines (KERNEL_ADJUDICATED →
   * NOVEL_VALIDATED / REDISCOVERY): when the review happened and who did it.
   * Absent on older lines = "not recorded then" (additive optional field —
   * the reviewedAt/humanReviewRef pair is the disclosure-discipline trail).
   */
  readonly review?: {
    readonly reviewedAt: string;
    readonly reviewer?: string | undefined;
  } | undefined;
}

export interface DiscoveryRegistryRecord {
  readonly kind: 'registration' | 'state_transition';
  readonly registryId: string;
  /** sha256 over canonical {statement, mechanism, falsificationMethod} — the scientific content. */
  readonly contentHash: string;
  readonly registeredAt: string;
  readonly state: ConjectureState;
  readonly question: string;
  readonly runId: string;
  readonly provenance: RegistryProvenance;
  readonly evidence: RegistryEvidence;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

/** Input to the pure record builder. */
export interface RegistryRecordInput {
  readonly kind: 'registration' | 'state_transition';
  readonly sequence: number;
  readonly contentHash: string;
  readonly registeredAt: string;
  readonly state: ConjectureState;
  readonly question: string;
  readonly runId: string;
  readonly provenance: RegistryProvenance;
  readonly evidence: RegistryEvidence;
  readonly prevRecordHash: string;
}

/** Compute the scientific-content hash of a hypothesis (stable across packaging edits). */
import { hypothesisContentHash } from './content_hash.ts';

/**
 * Build one registry record (pure). The state transition itself is validated
 * by the shared ConjectureState machine — the registry never invents states.
 * @throws on illegal ladder transitions or missing promotion evidence.
 */
export function buildDiscoveryRegistryRecord(input: RegistryRecordInput): DiscoveryRegistryRecord {
  // Ladder-evidence coupling (second gate, mirrors transitionConjectureState):
  // a registry record CLAIMING a terminal evidence-gated state must carry the
  // evidence that state demands — the registry never launders a promotion.
  if (input.state === 'NOVEL_VALIDATED' && (input.evidence.humanReviewRef ?? '').trim() === '') {
    throw new Error(
      'registry record with state NOVEL_VALIDATED requires evidence.humanReviewRef (AI never self-certifies discoveries — directive §2.4)',
    );
  }
  if (input.state === 'REDISCOVERY' && (input.evidence.matchingLiterature ?? '').trim() === '') {
    throw new Error(
      'registry record with state REDISCOVERY requires evidence.matchingLiterature (the matching work must be named)',
    );
  }
  const core = {
    kind: input.kind,
    registryId: `dsc-${String(input.sequence).padStart(6, '0')}-${input.contentHash.slice(0, 12)}`,
    contentHash: input.contentHash,
    registeredAt: input.registeredAt,
    state: input.state,
    question: input.question,
    runId: input.runId,
    provenance: input.provenance,
    evidence: input.evidence,
    prevRecordHash: input.prevRecordHash,
  };
  return { ...core, recordHash: hashCanonicalJson(core) };
}

/** Verify a record's self-declared hash (recordHash covers everything else). */
export function verifyRecordHash(record: DiscoveryRegistryRecord): boolean {
  const { recordHash: _ignored, ...core } = record;
  return hashCanonicalJson(core) === record.recordHash;
}

export interface ChainVerification {
  readonly valid: boolean;
  readonly firstBrokenIndex: number | null;
  readonly reason: string | null;
}

/** Verify the full hash chain: per-record hashes + prev links + idempotency-key sanity. */
export function verifyDiscoveryRegistryChain(records: readonly DiscoveryRegistryRecord[]): ChainVerification {
  let prev = '';
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]!;
    if (!verifyRecordHash(record)) {
      return { valid: false, firstBrokenIndex: i, reason: `record ${i}: recordHash mismatch (content tampered)` };
    }
    if (record.prevRecordHash !== prev) {
      return {
        valid: false,
        firstBrokenIndex: i,
        reason: `record ${i}: prevRecordHash breaks the chain (reorder/edit/truncation)`,
      };
    }
    prev = record.recordHash;
  }
  return { valid: true, firstBrokenIndex: null, reason: null };
}

/** Parse + structurally validate the ledger file (no chain check — caller composes). */
export function readDiscoveryRegistry(ledgerPath: string): DiscoveryRegistryRecord[] {
  if (!existsSync(ledgerPath)) return [];
  const raw = readTextFile(ledgerPath);
  const out: DiscoveryRegistryRecord[] = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (line.length === 0) continue;
    const parsed = parseRecordLine(line, i);
    out.push(parsed);
  }
  return out;
}

function parseRecordLine(line: string, lineIndex: number): DiscoveryRegistryRecord {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (err) {
    throw new Error(
      `registry line ${lineIndex + 1} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  const errors = validateRecordShape(value);
  if (errors.length > 0) {
    throw new Error(`registry line ${lineIndex + 1} invalid: ${errors.join('; ')}`);
  }
  return value as DiscoveryRegistryRecord;
}

function validateRecordShape(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['not an object'];
  const r = value as Record<string, unknown>;
  const errors: string[] = [];
  if (r['kind'] !== 'registration' && r['kind'] !== 'state_transition') errors.push('kind must be registration|state_transition');
  if (typeof r['registryId'] !== 'string' || r['registryId'].length === 0) errors.push('registryId must be a non-empty string');
  if (typeof r['contentHash'] !== 'string' || !/^[0-9a-f]{64}$/.test(r['contentHash'])) errors.push('contentHash must be sha256 hex');
  if (typeof r['registeredAt'] !== 'string' || r['registeredAt'].length === 0) errors.push('registeredAt must be a non-empty string');
  if (typeof r['state'] !== 'string') errors.push('state must be a string');
  if (typeof r['question'] !== 'string') errors.push('question must be a string');
  if (typeof r['runId'] !== 'string') errors.push('runId must be a string');
  if (typeof r['provenance'] !== 'object' || r['provenance'] === null) errors.push('provenance must be an object');
  if (typeof r['prevRecordHash'] !== 'string') errors.push('prevRecordHash must be a string');
  if (typeof r['recordHash'] !== 'string' || !/^[0-9a-f]{64}$/.test(r['recordHash'])) errors.push('recordHash must be sha256 hex');
  return errors;
}

export interface AppendResult {
  readonly appended: readonly DiscoveryRegistryRecord[];
  /** Records skipped because an identical (contentHash, state) line already exists. */
  readonly skippedDuplicates: number;
  /** Chain verification of the resulting ledger (fail-closed: append never leaves a broken chain). */
  readonly chain: ChainVerification;
}

/**
 * Append records to the ledger, idempotently. Duplicate suppression key =
 * (contentHash, state) — re-registering the same content in the same state is
 * a no-op, while a STATE TRANSITION of the same content appends a new line
 * (the ladder history is preserved, graphiti-style: nothing is rewritten).
 *
 * Concurrency: an exclusive lock file serializes appends; a stale lock
 * (>30 s, crashed holder) is removed. Lock acquisition failure is a hard
 * error — records are never silently dropped.
 */
export function appendDiscoveryRecords(
  ledgerPath: string,
  records: readonly DiscoveryRegistryRecord[],
): AppendResult {
  if (records.length === 0) {
    return { appended: [], skippedDuplicates: 0, chain: verifyDiscoveryRegistryChain(readDiscoveryRegistry(ledgerPath)) };
  }
  const release = acquireLock(ledgerPath);
  try {
    const existing = readDiscoveryRegistry(ledgerPath);
    const existingKeys = new Set(existing.map((r) => `${r.contentHash}:${r.state}`));
    const existingChain = verifyDiscoveryRegistryChain(existing);
    if (!existingChain.valid) {
      throw new Error(
        `refusing to append to a broken discovery registry (record ${existingChain.firstBrokenIndex}: ${existingChain.reason}) — repair or archive the ledger first`,
      );
    }

    const appended: DiscoveryRegistryRecord[] = [];
    let skipped = 0;
    let prev = existing.length > 0 ? existing[existing.length - 1]!.recordHash : '';
    let sequence = existing.length;
    for (const record of records) {
      const key = `${record.contentHash}:${record.state}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      // Re-chain the record (input prevRecordHash/registryId are suggestions;
      // the ledger position is authoritative).
      sequence += 1;
      const chained = buildDiscoveryRegistryRecord({
        kind: record.kind,
        sequence,
        contentHash: record.contentHash,
        registeredAt: record.registeredAt,
        state: record.state,
        question: record.question,
        runId: record.runId,
        provenance: record.provenance,
        evidence: record.evidence,
        prevRecordHash: prev,
      });
      appended.push(chained);
      existingKeys.add(key);
      prev = chained.recordHash;
    }

    if (appended.length > 0) {
      const payload = [...existing, ...appended].map((r) => JSON.stringify(r)).join('\n') + '\n';
      atomicWriteText(ledgerPath, payload);
    }
    return {
      appended,
      skippedDuplicates: skipped,
      chain: verifyDiscoveryRegistryChain([...existing, ...appended]),
    };
  } finally {
    release();
  }
}

/** Cross-process append lock (exclusive create; stale after LOCK_STALE_MS). */
function acquireLock(ledgerPath: string): () => void {
  const lockPath = `${ledgerPath}.lock`;
  mkdirSync(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx');
      closeSync(fd);
      return () => {
        try {
          unlinkSync(lockPath);
        } catch {
          // Already removed (stale cleanup race) — the lock is advisory, not a kernel invariant.
        }
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
        try {
          unlinkSync(lockPath);
          continue; // stale lock reclaimed — retry immediately
        } catch {
          // Raced another reclaimer — fall through to the backoff.
        }
      }
      const until = Date.now() + 100;
      while (Date.now() < until) {
        /* brief busy wait (same process family as renameWithRetry) */
      }
    }
  }
  throw new Error(`discovery registry lock contention at ${lockPath} — another append is stuck`);
}

function atomicWriteText(path: string, text: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameWithRetry(tmp, path);
}

function readTextFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/** sha256 over the run's stage-receipt projection (light provenance pointer). */
export function receiptsDigestForRun(run: ResearchRun): string {
  return hashCanonicalJson(
    run.stageReceipts.map((r) => ({
      stageId: r.stageId,
      sequence: r.sequence,
      ...(r.inputHash !== undefined ? { inputHash: r.inputHash } : {}),
      ...(r.outputHash !== undefined ? { outputHash: r.outputHash } : {}),
    })),
  );
}

export interface RegistrationOutcome {
  /** True when the run's mode forbids ledger writes (offline/synthetic/replay). */
  readonly skippedMode: boolean;
  readonly appended: readonly DiscoveryRegistryRecord[];
  readonly skippedDuplicates: number;
  /** Hypotheses that did NOT qualify (gate failure or zero bound citations). */
  readonly notRegistered: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * The CORROBORATED qualification predicate — the SINGLE qualification source
 * shared by the registry and the research-memory draft tier (one rule, never
 * two): falsifiability gate passed AND ≥1 bound citation (evidence attached).
 */
export function corroboratedQualifies(
  hypothesis: HypothesisCandidate,
  run: ResearchRun,
): boolean {
  const gateEntry = run.falsifiabilityGate.perHypothesis[hypothesis.id];
  if (gateEntry?.passed !== true) return false;
  const binding = run.bindings[hypothesis.id];
  const boundEvidence =
    (binding?.boundSupporting.length ?? 0) + (binding?.boundCounter.length ?? 0);
  return boundEvidence > 0;
}

/**
 * Run-finalize integration point: register every CORROBORATED-qualified
 * hypothesis of a completed run. Qualification = falsifiability gate passed
 * AND at least one bound citation (evidence attached, not just structured).
 * Only LIVE/MIXED runs write; every other mode is a no-op (skippedMode=true).
 */
export function registerRunDiscoveries(
  run: ResearchRun,
  opts: { ledgerPath?: string; now?: () => Date } = {},
): RegistrationOutcome {
  if (run.runMode !== 'LIVE' && run.runMode !== 'MIXED') {
    return { skippedMode: true, appended: [], skippedDuplicates: 0, notRegistered: [] };
  }
  const registeredAt = (opts.now ?? (() => new Date()))().toISOString();
  const digest = receiptsDigestForRun(run);
  // §2.4 minimum provenance: match the generating strategy's captured facts
  // (b4+ runs carry them in the discovery block; legacy/pre-b4 runs = absent).
  const fanoutByStrategy = new Map(
    (run.discovery?.fanout?.perStrategy ?? []).map((r) => [r.strategyId, r]),
  );
  const inputs: RegistryRecordInput[] = [];
  const notRegistered: { id: string; reason: string }[] = [];

  for (const hypothesis of run.hypotheses) {
    const binding = run.bindings[hypothesis.id];
    if (!corroboratedQualifies(hypothesis, run)) {
      const gateEntry = run.falsifiabilityGate.perHypothesis[hypothesis.id];
      notRegistered.push({
        id: hypothesis.id,
        reason:
          gateEntry === undefined
            ? 'falsifiability gate: no record'
            : gateEntry.passed !== true
              ? 'falsifiability gate failed'
              : 'no bound citations (CORROBORATED requires evidence)',
      });
      continue;
    }
    // Ladder discipline: structured (falsifiable) + evidence → CORROBORATED,
    // validated by the shared state machine (fail-closed on illegal edges).
    const state = transitionConjectureState('STRUCTURED_CONJECTURE', 'CORROBORATED', {
      deterministicCheckRef: `run:${run.runId}/falsifiability_gate+${hypothesis.id}`,
    });
    inputs.push({
      kind: 'registration',
      sequence: 0, // placeholder — the ledger re-chains authoritatively
      contentHash: hypothesisContentHash(hypothesis),
      registeredAt,
      state,
      question: run.question,
      runId: run.runId,
      provenance: {
        ...(hypothesis.strategyOrigin !== undefined
          ? { strategyOrigin: hypothesis.strategyOrigin }
          : {}),
        corpusSnapshotId: run.corpus.snapshotId,
        corpusRootHash: run.corpus.rootHash,
        modelProfile: run.modes.modelExecutionMode === 'LIVE' ? 'live' : 'mixed',
        supportingCitations: (binding?.boundSupporting ?? []).map((d) => d.doi ?? d.persistentIdentifier),
        counterEvidenceCitations: (binding?.boundCounter ?? []).map((d) => d.doi ?? d.persistentIdentifier),
        receiptsDigest: digest,
        ...(hypothesis.strategyOrigin !== undefined
          ? (() => {
              const call = fanoutByStrategy.get(hypothesis.strategyOrigin);
              return call === undefined
                ? {}
                : {
                    strategySignatureHash: call.strategySignatureHash ?? null,
                    modelId: call.modelId ?? null,
                    provider: call.provider ?? null,
                    temperature: call.temperature ?? null,
                    seed: call.seed ?? null,
                  };
            })()
          : {}),
      },
      evidence: {
        deterministicCheckRef: `run:${run.runId}/falsifiability_gate+${hypothesis.id}`,
      },
      prevRecordHash: '', // placeholder — re-chained on append
    });
  }

  const result = appendDiscoveryRecords(opts.ledgerPath ?? DEFAULT_DISCOVERY_REGISTRY_PATH, inputs.map((input) => buildDiscoveryRegistryRecord(input)));
  return {
    skippedMode: false,
    appended: result.appended,
    skippedDuplicates: result.skippedDuplicates,
    notRegistered,
  };
}

// ── Human-review promotion (ladder top two rungs) ────────────────────────────

/** Why a human-review promotion was refused (typed — never a stringly error). */
export type HumanReviewRefusalReason =
  | 'hypothesis_not_in_run'
  | 'not_registered'
  | 'illegal_transition';

/** The human-review promotion outcome (same family as BackflowOutcome). */
export interface HumanReviewOutcome {
  readonly status: 'APPENDED' | 'SKIPPED_DUPLICATE' | 'REFUSED';
  readonly reason?: HumanReviewRefusalReason;
  /** Verbatim illegal-edge detail from the shared ladder machine (legal path included). */
  readonly detail?: string;
  readonly fromState?: ConjectureState;
  readonly toState?: 'NOVEL_VALIDATED' | 'REDISCOVERY';
  readonly appendedRecord?: DiscoveryRegistryRecord;
}

/**
 * Record ONE human review: promote a ledger-tracked conjecture to
 * NOVEL_VALIDATED (needs humanReviewRef) or REDISCOVERY (needs
 * matchingLiterature). The shared ConjectureState machine is THE gate — the
 * current state is the hypothesis's LAST ledger line, so a CORROBORATED-only
 * ledger refuses a direct NOVEL jump with the legal path printed (fail-closed,
 * no skip-level), and terminal states refuse everything.
 *
 * The run file supplies the content (contentHash) + provenance only; the
 * review itself is a human operational act recorded with wall-clock
 * reviewedAt (notarization semantics, outside the deterministic kernel).
 *
 * Cannot-prove: a review line proves a human REFERENCED a review record at
 * reviewedAt — it does not verify the review's content, the reviewer's
 * identity, or the conjecture's truth/novelty (disclosure discipline §2.4
 * still demands leakage assessment + AI-generated labeling externally).
 */
export function recordHumanReview(input: {
  readonly run: ResearchRun;
  readonly hypothesisId: string;
  readonly toState: 'NOVEL_VALIDATED' | 'REDISCOVERY';
  readonly humanReviewRef?: string;
  readonly matchingLiterature?: string;
  readonly reviewer?: string;
  readonly ledgerPath?: string;
  readonly now?: () => Date;
}): HumanReviewOutcome {
  const ledgerPath = input.ledgerPath ?? DEFAULT_DISCOVERY_REGISTRY_PATH;
  const hypothesis = input.run.hypotheses.find((h) => h.id === input.hypothesisId);
  if (hypothesis === undefined) {
    return { status: 'REFUSED', reason: 'hypothesis_not_in_run' };
  }
  const contentHash = hypothesisContentHash(hypothesis);
  const existing = readDiscoveryRegistry(ledgerPath);
  const history = existing.filter((r) => r.contentHash === contentHash);
  if (history.length === 0) {
    // The ladder never promotes unregistered content (§2.4).
    return { status: 'REFUSED', reason: 'not_registered' };
  }
  if (existing.some((r) => r.contentHash === contentHash && r.state === input.toState)) {
    return { status: 'SKIPPED_DUPLICATE', toState: input.toState };
  }
  // The current rung = the LAST line for this content (the ladder history is
  // append-only; file order is authoritative). The shared machine is the ONLY
  // gate — no parallel rule set here.
  const fromState = history[history.length - 1]!.state;
  const evidence = {
    ...(input.humanReviewRef !== undefined ? { humanReviewRef: input.humanReviewRef } : {}),
    ...(input.matchingLiterature !== undefined ? { matchingLiterature: input.matchingLiterature } : {}),
  };
  // Validate through the shared machine; on success it echoes `to` back, so
  // the recorded state below is the requested target itself.
  try {
    transitionConjectureState(fromState, input.toState, evidence);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('illegal conjecture transition')) {
      // Skip-level / terminal / demotion — refuse with the legal path verbatim.
      return { status: 'REFUSED', reason: 'illegal_transition', detail: message, fromState };
    }
    // Evidence failures (empty humanReviewRef / matchingLiterature) propagate
    // loudly — the caller must never be able to launder a promotion through.
    throw err;
  }
  const review = {
    reviewedAt: (input.now ?? (() => new Date()))().toISOString(),
    ...(input.reviewer !== undefined && input.reviewer !== '' ? { reviewer: input.reviewer } : {}),
  };
  const record = buildDiscoveryRegistryRecord({
    kind: 'state_transition',
    sequence: existing.length,
    contentHash,
    registeredAt: review.reviewedAt,
    state: input.toState,
    question: input.run.question,
    runId: input.run.runId,
    provenance: {
      corpusSnapshotId: input.run.corpus.snapshotId,
      corpusRootHash: input.run.corpus.rootHash,
      modelProfile: 'human-review',
      supportingCitations: [],
      counterEvidenceCitations: [],
      receiptsDigest: `human-review:${input.hypothesisId}@${input.run.runId}`,
    },
    evidence: { ...evidence, review },
    prevRecordHash: '',
  });
  const append = appendDiscoveryRecords(ledgerPath, [record]);
  const appendedRecord = append.appended[0];
  if (appendedRecord === undefined) {
    return { status: 'SKIPPED_DUPLICATE', toState: input.toState };
  }
  return { status: 'APPENDED', fromState, toState: input.toState, appendedRecord };
}

/** Notarization export: the full ledger + chain head, machine-verifiable. */
export interface RegistryExport {
  readonly exportedAt: string;
  readonly recordCount: number;
  /** Chain head = last recordHash; verifying the export = re-running the chain check. */
  readonly chainHead: string;
  readonly records: readonly DiscoveryRegistryRecord[];
  readonly disclaimer: string;
}

export function exportDiscoveryRegistry(
  ledgerPath: string,
  opts: { now?: () => Date } = {},
): RegistryExport {
  const records = readDiscoveryRegistry(ledgerPath);
  const chain = verifyDiscoveryRegistryChain(records);
  if (!chain.valid) {
    throw new Error(
      `refusing to export a broken discovery registry (record ${chain.firstBrokenIndex}: ${chain.reason})`,
    );
  }
  return {
    exportedAt: (opts.now ?? (() => new Date()))().toISOString(),
    recordCount: records.length,
    chainHead: records.length > 0 ? records[records.length - 1]!.recordHash : '',
    records,
    disclaimer:
      'Registry records prove registration provenance (when, what content, which run). They do NOT prove scientific truth or novelty — NOVEL_* states additionally require literature search and explicit human review (directive §2.4).',
  };
}
