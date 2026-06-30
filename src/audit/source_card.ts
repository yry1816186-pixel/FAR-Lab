export const SOURCE_CARD_SOURCE_TYPES = [
  'official_doc',
  'paper',
  'github_repo',
  'dataset',
  'news',
  'benchmark',
  'other',
] as const;

export const SOURCE_CARD_EVIDENCE_LEVELS = ['primary', 'secondary', 'tertiary'] as const;

export const SOURCE_CARD_STABILITY = ['stable', 'versioned', 'time_sensitive'] as const;

export const SOURCE_CARD_USED_FOR = [
  'design_benchmark',
  'api_contract',
  'scientific_evidence',
  'scoring_context',
] as const;

export type SourceCardSourceType = (typeof SOURCE_CARD_SOURCE_TYPES)[number];
export type SourceCardEvidenceLevel = (typeof SOURCE_CARD_EVIDENCE_LEVELS)[number];
export type SourceCardStability = (typeof SOURCE_CARD_STABILITY)[number];
export type SourceCardUsedFor = (typeof SOURCE_CARD_USED_FOR)[number];

export interface SourceCard {
  readonly sourceId: string;
  readonly url: string;
  readonly title: string;
  readonly sourceType: SourceCardSourceType;
  readonly publisher: string;
  readonly fetchedAt: string;
  readonly claim: string;
  readonly evidenceLevel: SourceCardEvidenceLevel;
  readonly stability: SourceCardStability;
  readonly usedFor: SourceCardUsedFor;
  readonly verifiedFactId?: string;
  readonly notes?: string;
}

export function sourceCardNeedsVerifiedFact(card: SourceCard): boolean {
  return card.usedFor === 'api_contract' || card.usedFor === 'scoring_context';
}
