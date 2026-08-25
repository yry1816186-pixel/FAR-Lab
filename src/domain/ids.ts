import { z } from 'zod';

/**
 * Canonical kind -> id-prefix vocabulary: the ONE place entity id prefixes are
 * defined (R2-12 stewardship). The branded schemas below and the ObjectRef
 * shape check both derive from it — a new kind is added once, here.
 */
const ID_PREFIX = {
  question: 'q',
  run: 'run',
  corpus_snapshot: 'corp',
  source_document: 'src',
  claim: 'clm',
  evidence_relation: 'ev',
  hypothesis: 'hyp',
  plan: 'pln',
  task: 'task',
  feedback: 'fbk',
  revision: 'rev',
  receipt: 'rcp',
  bundle: 'bnd',
  scorecard: 'sc',
  tournament: 'trn',
  experiment_spec: 'xsp',
  experiment_run: 'xrun',
  dataset_record: 'ds',
  result_set: 'rset',
  stat_report: 'srep',
  model_config: 'mcfg',
  evidence_body: 'evb',
  ach_analysis: 'ach',
  prediction: 'prd',
  effect_estimate: 'efx',
  iteration: 'itr',
  tool_integration: 'tint',
} as const;

/** The single id-shape grammar: <prefix>_[0-9a-z]{20,32} (26-char ULID-style body from newId). */
const idShape = (prefix: string): RegExp => new RegExp(`^${prefix}_[0-9a-z]{20,32}$`);

/** Branded entity IDs. Prefix encodes the entity kind; body is opaque. */
export const idOf = (prefix: string) =>
  z.string().regex(idShape(prefix), `must be ${prefix}_<random>`);

export const RunId = idOf(ID_PREFIX.run);
export const QuestionId = idOf(ID_PREFIX.question);
export const SourceDocumentId = idOf(ID_PREFIX.source_document);
export const CorpusSnapshotId = idOf(ID_PREFIX.corpus_snapshot);
export const ClaimId = idOf(ID_PREFIX.claim);
export const EvidenceRelationId = idOf(ID_PREFIX.evidence_relation);
export const HypothesisId = idOf(ID_PREFIX.hypothesis);
export const PlanId = idOf(ID_PREFIX.plan);
export const FeedbackId = idOf(ID_PREFIX.feedback);
export const RevisionId = idOf(ID_PREFIX.revision);
export const ReceiptId = idOf(ID_PREFIX.receipt);
export const BundleId = idOf(ID_PREFIX.bundle);
export const TaskId = idOf(ID_PREFIX.task);
export const ScorecardId = idOf(ID_PREFIX.scorecard);
export const TournamentId = idOf(ID_PREFIX.tournament);
export const ExperimentSpecId = idOf(ID_PREFIX.experiment_spec);
export const ExperimentRunId = idOf(ID_PREFIX.experiment_run);
export const DatasetRecordId = idOf(ID_PREFIX.dataset_record);
export const ResultSetId = idOf(ID_PREFIX.result_set);
export const StatReportId = idOf(ID_PREFIX.stat_report);
export const ModelConfigId = idOf(ID_PREFIX.model_config);
export const EvidenceBodyId = idOf(ID_PREFIX.evidence_body);
export const AchAnalysisId = idOf(ID_PREFIX.ach_analysis);
export const PredictionId = idOf(ID_PREFIX.prediction);
export const EffectEstimateId = idOf(ID_PREFIX.effect_estimate);
export const IterationId = idOf(ID_PREFIX.iteration);
export const ToolIntegrationId = idOf(ID_PREFIX.tool_integration);

export type RunId = z.infer<typeof RunId>;
export type QuestionId = z.infer<typeof QuestionId>;
export type SourceDocumentId = z.infer<typeof SourceDocumentId>;
export type CorpusSnapshotId = z.infer<typeof CorpusSnapshotId>;
export type ClaimId = z.infer<typeof ClaimId>;
export type EvidenceRelationId = z.infer<typeof EvidenceRelationId>;
export type HypothesisId = z.infer<typeof HypothesisId>;
export type PlanId = z.infer<typeof PlanId>;
export type FeedbackId = z.infer<typeof FeedbackId>;
export type RevisionId = z.infer<typeof RevisionId>;
export type ReceiptId = z.infer<typeof ReceiptId>;
export type BundleId = z.infer<typeof BundleId>;
export type TaskId = z.infer<typeof TaskId>;
export type ScorecardId = z.infer<typeof ScorecardId>;
export type TournamentId = z.infer<typeof TournamentId>;
export type ExperimentSpecId = z.infer<typeof ExperimentSpecId>;
export type ExperimentRunId = z.infer<typeof ExperimentRunId>;
export type DatasetRecordId = z.infer<typeof DatasetRecordId>;
export type ResultSetId = z.infer<typeof ResultSetId>;
export type StatReportId = z.infer<typeof StatReportId>;
export type ModelConfigId = z.infer<typeof ModelConfigId>;
export type EvidenceBodyId = z.infer<typeof EvidenceBodyId>;
export type AchAnalysisId = z.infer<typeof AchAnalysisId>;
export type PredictionId = z.infer<typeof PredictionId>;
export type EffectEstimateId = z.infer<typeof EffectEstimateId>;
export type IterationId = z.infer<typeof IterationId>;
export type ToolIntegrationId = z.infer<typeof ToolIntegrationId>;

/** Kinds an ObjectRef may point at (the referenceable subset of id-bearing kinds). */
const OBJECT_REF_KINDS = [
  'question', 'run', 'corpus_snapshot', 'source_document', 'claim',
  'evidence_relation', 'hypothesis', 'plan', 'task', 'feedback', 'revision',
  'receipt', 'bundle', 'artifact',
  'experiment_spec', 'experiment_run', 'dataset_record', 'result_set', 'stat_report',
  'evidence_body', 'ach_analysis', 'prediction',
] as const;

/**
 * Cross-kind object reference inside a run, e.g. { kind: 'hypothesis', id: 'hyp_...' }.
 * The id is shape-checked against the kind (WP2 F5): a garbage id previously parsed
 * fine and only failed later at store lookup — now fabrication fails at the boundary.
 * Artifact refs are content addresses (sha256:<64-hex>), not prefixed entity ids.
 */
export const ObjectRef = z.object({
  kind: z.enum(OBJECT_REF_KINDS),
  id: z.string().min(1),
}).superRefine((ref, ctx) => {
  const idOk = ref.kind === 'artifact'
    ? /^sha256:[0-9a-f]{64}$/.test(ref.id)
    : idShape(ID_PREFIX[ref.kind]).test(ref.id);
  if (!idOk) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `id '${ref.id}' does not match the ${ref.kind} id shape`,
    });
  }
});
export type ObjectRef = z.infer<typeof ObjectRef>;

export const newId = (prefix: string): string => {
  // 26-char ULID-style body from random bytes (crockford base32 alphabet).
  const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(26));
  let s = '';
  for (const b of bytes) s += alphabet[b % 32];
  return `${prefix}_${s}`;
};
