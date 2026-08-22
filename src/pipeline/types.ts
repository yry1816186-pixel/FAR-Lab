import type { ResearchRun, RunStageName } from '../domain/index.js';
import type { ProvenanceReceipt } from '../domain/provenance.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../shared/ports.js';
import type { SourceFamily, SourceDocument } from '../domain/source.js';
import type { FullTextFetchResult } from '../sources/fulltext.js';

/** What a stage may touch. Stage handlers stay pure of infrastructure wiring. */
export interface StageContext {
  run: ResearchRun;
  store: Store;
  artifacts: ArtifactStore;
  provider: ModelProvider;
  sourceFor: (family: SourceFamily) => SourceAdapter;
  /**
   * Fulltext deepening (phase A): fetch full text for a corpus document through
   * its identifiers. Absent = the live router (arXiv HTML / Europe PMC JATS);
   * tests inject deterministic fakes.
   */
  fetchFullText?: (doc: SourceDocument) => Promise<FullTextFetchResult>;
  /** Persist a provenance receipt tied to this run (models/sources/tools must call this). */
  recordReceipt: (receipt: Omit<ProvenanceReceipt, 'id' | 'runId' | 'at' | 'stage'> & {
    stage?: RunStageName;
    at?: string;
  }) => void;
  /** Structured cancellation signal checked between expensive operations inside stages. */
  cancelled: () => boolean;
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
