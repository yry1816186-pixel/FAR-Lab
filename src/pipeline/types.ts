import type { ResearchRun, RunStageName } from '../domain/index.js';
import type { ProvenanceReceipt } from '../domain/provenance.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../shared/ports.js';
import type { SourceFamily, SourceDocument } from '../domain/source.js';
import type { FullTextFetchResult } from '../sources/fulltext.js';
import type { RunBudgetView } from '../app/run-budget.js';

/** What a stage may touch. Stage handlers stay pure of infrastructure wiring. */
export interface StageContext {
  run: ResearchRun;
  store: Store;
  artifacts: ArtifactStore;
  provider: ModelProvider;
  /**
   * RU-9 GO2: the run's resolved reasoning route (declared-capability model
   * configs only); absent for env builtin routes — zero reasoning fields on
   * the wire, exact legacy behavior. callStructured derives the per-call gear
   * from the stage table + model clamps when the caller passes none.
   */
  reasoningRoute?: { style: import('../domain/model-config.js').ReasoningStyle; defaultGear: import('../domain/model-config.js').ReasoningGear; modelId: string };
  sourceFor: (family: SourceFamily) => SourceAdapter;
  /**
   * Fulltext deepening (phase A): fetch full text for a corpus document through
   * its identifiers. Absent = the live router (arXiv HTML / Europe PMC JATS);
   * tests inject deterministic fakes.
   */
  fetchFullText?: (doc: SourceDocument) => Promise<FullTextFetchResult>;
  /**
   * Persist a provenance receipt tied to this run (models/sources/tools must call this).
   * `stage` is free-form: pipeline stages pass the RunStageName; the agent kernel uses
   * 'agent:<capability>' (matches the ProvenanceReceipt schema and ModelReceiptPartial).
   */
  recordReceipt: (receipt: Omit<ProvenanceReceipt, 'id' | 'runId' | 'at' | 'stage'> & {
    stage?: string;
    at?: string;
  }) => void;
  /** Structured cancellation signal checked between expensive operations inside stages. */
  cancelled: () => boolean;
  /**
   * Run token budget (BP-1 governance). Absent = unlimited (tests/minimal harnesses).
   * callStructured consults this before every model call (exhaustion throws
   * RunBudgetExhaustedError) and reports usage after; the orchestrator honors the
   * same view at stage boundaries. Spend authority stays with receipts.
   */
  budget?: RunBudgetView;
  /**
   * W-C bilingual display layer: when true, generation stages additionally produce
   * Simplified-Chinese renderings of primary display fields (hypothesis statements,
   * plan objective) via one batched, temperature-0 call each — enrichment semantics,
   * failures never block. Absent/false (tests, minimal harnesses) = English only.
   * The orchestrator wires this from FARLAB_ZH_DISPLAY (default on; '0' disables).
   */
  zhDisplay?: boolean;
  /**
   * W8 S2 intra-stage step checkpoint (dbos OAOO pattern), per FAMILY: return the
   * persisted result for (stage, family, key) when present, else run fn once and persist.
   * Keys must be stable domain ids (not loop counters) so they survive re-ordering and
   * enable parallelism; `family` separates independent checkpoint groups inside one stage
   * (rank: 'scoring' batches vs 'pairs') so their fingerprints cannot clear each other.
   * inputsFingerprint: hash of the family's FULL prompt-bearing inputs (projections +
   * prompt text + batch partition); a change (code/prompt upgrade mid-run) invalidates
   * only that family's cached outputs instead of replaying stale responses under
   * rebuilt prompts (Wave-5 audit P3 hardening). Pass undefined only when the subtask
   * inputs are provably key-bound.
   */
  checkpointed: <T>(stage: RunStageName, family: string, key: string, inputsFingerprint: string | undefined, fn: () => Promise<T>) => Promise<T>;
  /**
   * True when this executor lost the run lease (adopted elsewhere after expiry). Stage
   * loops surface this through assertNotCancelled so a disowned worker stops before its
   * next domain-object write instead of racing the adopter (W8 audit P1-3 fencing).
   */
  disowned: () => boolean;
  /**
   * B3 wait-time granularity: stages with a REAL, known work total report
   * incremental progress (done/total) so the workbench can narrate sub-stage
   * advancement instead of a minutes-long stage-level silence. `note`, when
   * given, appends a milestone note event (reason + free-form detail). Totals
   * must be actual domain counts (hypotheses, planned queries, sources) —
   * never estimates; stages without a known total simply never call this.
   * Optional so test contexts and minimal harnesses need not stub it.
   */
  progress?: (done: number, total: number, note?: { reason: string; detail?: Record<string, unknown> }) => void;
  log: (msg: string) => void;
}

export type StageOutcome =
  | { kind: 'done'; summary: string; artifacts?: string[] }
  | { kind: 'skipped'; reason: string };

export interface StageHandler {
  readonly stage: RunStageName;
  /** True when the stage legitimately has nothing to do for this run (e.g. no feedback yet). */
  applicable(ctx: StageContext): Promise<boolean>;
  execute(ctx: StageContext): Promise<StageOutcome>;
}
