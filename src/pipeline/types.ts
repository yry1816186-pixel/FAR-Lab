import type { ResearchRun, RunStageName } from '../domain/index.js';
import type { ProvenanceReceipt } from '../domain/provenance.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../shared/ports.js';
import type { SourceFamily } from '../domain/source.js';

/** What a stage may touch. Stage handlers stay pure of infrastructure wiring. */
export interface StageContext {
  run: ResearchRun;
  store: Store;
  artifacts: ArtifactStore;
  provider: ModelProvider;
  sourceFor: (family: SourceFamily) => SourceAdapter;
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
