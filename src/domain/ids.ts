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

/** Cross-kind object reference inside a run, e.g. { kind: 'hypothesis', id: 'hyp_...' }. */
export const ObjectRef = z.object({
  kind: z.enum([
    'question', 'run', 'corpus_snapshot', 'source_document', 'claim',
    'evidence_relation', 'hypothesis', 'plan', 'task', 'feedback', 'revision',
    'receipt', 'bundle', 'artifact',
  ]),
  id: z.string().min(1),
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
