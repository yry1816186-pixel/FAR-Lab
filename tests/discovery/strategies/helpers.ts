/**
 * tests/discovery/strategies/helpers — shared fixtures for strategy tests.
 * NOT a test file (no *.test.ts suffix): exports a minimal schema-valid
 * candidate factory, corpus builders, and the offline end-to-end runner every
 * strategy test reuses (the fixture seam is the strategy's stageId
 * `discovery_<id>` — zero API key, deterministic replay).
 */

import { createLlmGateway } from '../../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../../src/llm_gateway/adapters/offline_replay/client.ts';
import { callStructuredJson } from '../../../src/research/llm.ts';
import { createCorpusSnapshot } from '../../../src/retrieval/corpus.ts';
import { renderCorpusAllowlist } from '../../../src/research/hypothesis_generation.ts';
import { RESEARCH_DEMO_DOCS } from '../../../src/research/research_fixtures.ts';
import {
  buildStrategySchema,
  buildStrategyMessages,
  type StrategyDefinition,
  type StrategyPromptInput,
} from '../../../src/discovery/strategies/strategy.ts';

/** One minimal schema-valid candidate (threshold coherence: gt + finite value). */
export function makeCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    statement: 'Lipid oversupply in skeletal muscle impairs insulin signalling via ceramide accumulation.',
    mechanism:
      'REGULARITY_1: intramyocellular lipid correlates with insulin resistance [doc-1]; REGULARITY_2: ceramide inhibits Akt translocation [doc-2]; UNIFIED_MECHANISM: lipid-to-ceramide conversion blocks insulin signalling; EXTRAPOLATION: the blockade scales with lipid turnover rate.',
    falsificationMethod: {
      prediction: 'Ceramide-lowering intervention restores insulin sensitivity within 8 weeks.',
      metric: 'HOMA-IR change from baseline',
      comparator: 'gt' as const,
      value: 0.5,
    },
    supportingCitations: [],
    counterEvidenceCitations: [],
    relationToExistingTheory:
      'SOURCE_DOMAIN: epidemiology; MAPPING: exposure→dose→response structure maps lipid exposure onto insulin response; FAILURE_CONDITIONS: analogy breaks when lipid turnover varies independently of exposure.',
    alternativeExplanations: ['Mitochondrial overload rather than ceramide signalling.'],
    observablePredictions: ['Serum ceramide drops before HOMA-IR improves.'],
    distinguishingObservations: ['Ceramide-lowering without lipid-lowering should still restore signalling.'],
    noveltyRelativeToCorpus: 'Combines two corpus-reported regularities into one mechanism with an extrapolated scaling prediction.',
    assumptions: ['LIMITATION_ORIGIN: doc-1: the corpus admits no interventional ceramide data.'],
    risks: ['No interventional evidence in the current corpus.'],
    ...overrides,
  };
}

/** Corpus with the full demo document set (≥2 documents). */
export function makeFullCorpus() {
  return createCorpusSnapshot(RESEARCH_DEMO_DOCS, ['demo query'], '2026-08-15T00:00:00.000Z');
}

/** Corpus with a single document (applicability-skip scenarios). */
export function makeSingleDocCorpus() {
  return createCorpusSnapshot([RESEARCH_DEMO_DOCS[0]!], ['demo query'], '2026-08-15T00:00:00.000Z');
}

/** Run one strategy end-to-end against an offline fixture (deterministic replay). */
export async function runStrategyOffline(
  strategy: StrategyDefinition,
  fixtureResponse: unknown,
): Promise<{ hypotheses: readonly ReturnType<typeof makeCandidate>[] }> {
  const gateway = createLlmGateway([
    createOfflineReplayAdapter({
      fixtures: { [`discovery_${strategy.id}`]: JSON.stringify(fixtureResponse) },
    }),
  ]);
  const input: StrategyPromptInput = {
    question: 'Why does insulin resistance develop in skeletal muscle?',
    corpusAllowlist: renderCorpusAllowlist(makeFullCorpus()),
    perCallTarget: 1,
  };
  const result = await callStructuredJson(
    gateway,
    'offline_replay',
    `discovery_${strategy.id}`,
    buildStrategySchema(strategy.maxPerCall),
    buildStrategyMessages(strategy, input),
    4096,
  );
  return result.data;
}
