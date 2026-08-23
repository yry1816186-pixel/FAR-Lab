import { z } from 'zod';

/** Branded entity IDs. Prefix encodes the entity kind; body is opaque. */
export const idOf = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[0-9a-z]{20,32}$`), `must be ${prefix}_<random>`);

export const RunId = idOf('run');
export const QuestionId = idOf('q');
export const SourceDocumentId = idOf('src');
export const CorpusSnapshotId = idOf('corp');
export const ClaimId = idOf('clm');
export const EvidenceRelationId = idOf('ev');
export const HypothesisId = idOf('hyp');
export const PlanId = idOf('pln');
export const FeedbackId = idOf('fbk');
export const RevisionId = idOf('rev');
export const ReceiptId = idOf('rcp');
export const BundleId = idOf('bnd');
export const TaskId = idOf('task');
export const ScorecardId = idOf('sc');
export const TournamentId = idOf('trn');
export const ExperimentSpecId = idOf('xsp');
export const ExperimentRunId = idOf('xrun');
export const DatasetRecordId = idOf('ds');
export const ResultSetId = idOf('rset');
export const StatReportId = idOf('srep');
export const ModelConfigId = idOf('mcfg');
export const EvidenceBodyId = idOf('evb');
export const AchAnalysisId = idOf('ach');
export const PredictionId = idOf('prd');
export const EffectEstimateId = idOf('efx');
export const IterationId = idOf('itr');
export const ToolIntegrationId = idOf('tint');

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

/** kind -> the ID shape that kind legitimately takes. */
const OBJECT_REF_ID_SHAPES: Readonly<Record<ObjectRefKind, RegExp>> = {
  question: /^q_[0-9a-z]{20,32}$/,
  run: /^run_[0-9a-z]{20,32}$/,
  corpus_snapshot: /^corp_[0-9a-z]{20,32}$/,
  source_document: /^src_[0-9a-z]{20,32}$/,
  claim: /^clm_[0-9a-z]{20,32}$/,
  evidence_relation: /^ev_[0-9a-z]{20,32}$/,
  hypothesis: /^hyp_[0-9a-z]{20,32}$/,
  plan: /^pln_[0-9a-z]{20,32}$/,
  task: /^task_[0-9a-z]{20,32}$/,
  feedback: /^fbk_[0-9a-z]{20,32}$/,
  revision: /^rev_[0-9a-z]{20,32}$/,
  receipt: /^rcp_[0-9a-z]{20,32}$/,
  bundle: /^bnd_[0-9a-z]{20,32}$/,
  experiment_spec: /^xsp_[0-9a-z]{20,32}$/,
  experiment_run: /^xrun_[0-9a-z]{20,32}$/,
  dataset_record: /^ds_[0-9a-z]{20,32}$/,
  result_set: /^rset_[0-9a-z]{20,32}$/,
  stat_report: /^srep_[0-9a-z]{20,32}$/,
  evidence_body: /^evb_[0-9a-z]{20,32}$/,
  ach_analysis: /^ach_[0-9a-z]{20,32}$/,
  prediction: /^prd_[0-9a-z]{20,32}$/,
  // Artifact refs are content addresses, not prefixed entity ids.
  artifact: /^sha256:[0-9a-f]{64}$/,
};

const OBJECT_REF_KINDS = [
  'question', 'run', 'corpus_snapshot', 'source_document', 'claim',
  'evidence_relation', 'hypothesis', 'plan', 'task', 'feedback', 'revision',
  'receipt', 'bundle', 'artifact',
  'experiment_spec', 'experiment_run', 'dataset_record', 'result_set', 'stat_report',
  'evidence_body', 'ach_analysis', 'prediction',
] as const;
type ObjectRefKind = (typeof OBJECT_REF_KINDS)[number];

/**
 * Cross-kind object reference inside a run, e.g. { kind: 'hypothesis', id: 'hyp_...' }.
 * The id is shape-checked against the kind (WP2 F5): a garbage id previously parsed
 * fine and only failed later at store lookup — now fabrication fails at the boundary.
 */
export const ObjectRef = z.object({
  kind: z.enum(OBJECT_REF_KINDS),
  id: z.string().min(1),
}).superRefine((ref, ctx) => {
  if (!OBJECT_REF_ID_SHAPES[ref.kind].test(ref.id)) {
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
