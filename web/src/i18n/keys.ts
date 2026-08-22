/**
 * Typed i18n key builders (W-G follow-up, web review F-05).
 *
 * Template-literal keys (`stage.${s}`) previously needed `as never` at 26 call sites,
 * defeating DictKey's type guarantee: a new domain enum value without a matching dict
 * entry would render the raw key string to users. Each builder below is the SINGLE
 * assertion point for its family, and tests/web-i18n-keys.test.ts exhaustively asserts
 * every value of every domain union maps to an existing key in BOTH dictionaries —
 * so adding an enum value without a translation reddens the suite, not the UI.
 */
import type { DictKey } from './dict';
import type {
  AccessState,
  CitationBindingStatus,
  ContentDepth,
  EvidenceRelationType,
  ExecutionMode,
  ReceiptKind,
  RunStageName,
  ScientificGoalType,
} from '../api/types';

type QualityStatus = 'improved' | 'neutral' | 'worse' | 'inconclusive';
type StepKind = 'literature' | 'data_analysis' | 'tool_run' | 'simulation' | 'experiment' | 'human_review' | 'other';
type Availability = 'public' | 'request_required' | 'must_collect' | 'unavailable' | 'unknown';
export type RetrievalPurpose = 'discovery' | 'supporting' | 'counter_evidence' | 'methodological' | 'identifier_resolution' | 'gap_followup';

const key = (prefix: string, value: string): DictKey => `${prefix}.${value}` as DictKey;

export const stageKey = (s: RunStageName): DictKey => key('stage', s);
export const goalTypeKey = (g: ScientificGoalType): DictKey => key('goalType', g);
export const qualityKey = (q: QualityStatus): DictKey => key('quality', q);
export const receiptKindKey = (k: ReceiptKind): DictKey => key('receiptKind', k);
export const executionModeKey = (m: ExecutionMode): DictKey => key('mode', m);
export const availabilityKey = (a: Availability): DictKey => key('availability', a);
export const stepKindKey = (k: StepKind): DictKey => key('stepKind', k);
export const contentDepthKey = (d: ContentDepth): DictKey => key('depth', d);
export const accessStateKey = (a: AccessState): DictKey => key('access', a);
export const bindingKey = (b: CitationBindingStatus): DictKey => key('binding', b);
/** zh-gloss variant used for tooltips regardless of UI language (domain term gloss). */
export const bindingZhKey = (b: CitationBindingStatus): DictKey => `binding.${b}.zh` as DictKey;
export const relationKey = (r: EvidenceRelationType): DictKey => key('relation', r);
export const retrievalPurposeKey = (p: RetrievalPurpose): DictKey => key('retrieval.purpose', p);
