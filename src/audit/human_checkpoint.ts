export const HUMAN_CHECKPOINT_KINDS = [
  'secret_configured',
  'model_snapshot_migration',
  'structured_model_support',
  'source_set_accepted',
  'expensive_run_approved',
  'verdict_confirmed_review',
  'submission_material_review',
] as const;

export const HUMAN_ROLES = ['computer', 'liberal_arts', 'design', 'team'] as const;

export const HUMAN_CHECKPOINT_DECISIONS = ['approved', 'rejected', 'deferred'] as const;

export type HumanCheckpointKind = (typeof HUMAN_CHECKPOINT_KINDS)[number];
export type HumanRole = (typeof HUMAN_ROLES)[number];
export type HumanCheckpointDecision = (typeof HUMAN_CHECKPOINT_DECISIONS)[number];

export interface HumanCheckpoint {
  readonly checkpointId: string;
  readonly kind: HumanCheckpointKind;
  readonly requestedByRole: string;
  readonly requiredHumanRole: HumanRole;
  readonly decision: HumanCheckpointDecision;
  readonly reason: string;
  readonly evidencePath?: string;
  readonly isoTimestamp: string;
}

export const W1_REQUIRED_HUMAN_CHECKPOINT_KINDS = [
  'secret_configured',
  'model_snapshot_migration',
  'structured_model_support',
  'source_set_accepted',
] as const;
