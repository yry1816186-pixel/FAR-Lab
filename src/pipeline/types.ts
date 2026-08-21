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
