import { describe, it, expect } from 'vitest';
import { zh, en } from '../web/src/i18n/dict';
import {
  stageKey, goalTypeKey, qualityKey, receiptKindKey, executionModeKey,
  availabilityKey, stepKindKey, contentDepthKey, accessStateKey, bindingKey,
  bindingZhKey, relationKey, retrievalPurposeKey,
} from '../web/src/i18n/keys';

/**
 * i18n key exhaustiveness (W-G follow-up): every value of every domain union that the
 * UI renders must map to an existing key in BOTH dictionaries. Adding a domain enum
 * value without its translations reddens HERE — not as a raw key string in the UI
 * (which was possible for all 26 former `as never` call sites).
 */
const STAGES = ['scope', 'retrieve', 'verify_sources', 'build_evidence', 'generate_hypotheses', 'critique_falsify', 'rank', 'plan', 'execute', 'feedback', 'revise', 'export'] as const;
const GOAL_TYPES = ['explanatory', 'predictive', 'interventional', 'methodological', 'exploratory'] as const;
const QUALITY = ['improved', 'neutral', 'worse', 'inconclusive'] as const;
const RECEIPT_KINDS = ['model_call', 'source_retrieval', 'tool_exec', 'stage_transition', 'export', 'revision'] as const;
const MODES = ['live', 'test'] as const;
const AVAILABILITY = ['public', 'request_required', 'must_collect', 'unavailable', 'unknown'] as const;
const STEP_KINDS = ['literature', 'data_analysis', 'tool_run', 'simulation', 'experiment', 'human_review', 'other'] as const;
const DEPTHS = ['metadata_only', 'abstract', 'full_text', 'data'] as const;
const ACCESS = ['open', 'restricted', 'paywalled', 'unavailable', 'unknown'] as const;
const BINDINGS = ['verified', 'resolved_unaligned', 'unresolved', 'missing'] as const;
const RELATIONS = ['supports', 'contradicts', 'weakens', 'qualifies', 'depends_on', 'derived_from', 'replicates', 'fails_to_replicate', 'alternative_explanation', 'methodological_limitation', 'unknown'] as const;
const PURPOSES = ['discovery', 'supporting', 'counter_evidence', 'methodological', 'identifier_resolution', 'gap_followup'] as const;

describe('i18n key builders — domain-union to dictionary exhaustiveness', () => {
  it('every stage/goalType/quality value has zh+en entries', () => {
    for (const s of STAGES) for (const k of [stageKey(s)]) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const g of GOAL_TYPES) for (const k of [goalTypeKey(g)]) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const q of QUALITY) for (const k of [qualityKey(q)]) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
  });

  it('every receipt/mode/availability/stepKind value has zh+en entries', () => {
    for (const k of RECEIPT_KINDS.map(receiptKindKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const k of MODES.map(executionModeKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const k of AVAILABILITY.map(availabilityKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const k of STEP_KINDS.map(stepKindKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
  });

  it('every depth/access/binding/relation/purpose value has zh+en entries', () => {
    for (const k of DEPTHS.map(contentDepthKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const k of ACCESS.map(accessStateKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const b of BINDINGS) {
      expect(zh).toHaveProperty(bindingKey(b));
      expect(en).toHaveProperty(bindingKey(b));
    }
    expect(zh).toHaveProperty(bindingZhKey('verified'));
    for (const k of RELATIONS.map(relationKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
    for (const k of PURPOSES.map(retrievalPurposeKey)) { expect(zh).toHaveProperty(k); expect(en).toHaveProperty(k); }
  });
});
