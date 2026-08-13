/**
 * research — Track-1A "scientific hypothesis generation & research-plan design"
 * vertical slice (directive §6 Phase 2 / §9).
 *
 * Public surface:
 *   - types:     HypothesisCandidate, Scorecard, ResearchPlan, ResearchRun, Revision, FeedbackSignal
 *   - orchestrator: runResearch (the full vertical slice)
 *   - hypothesis_generation: generateHypotheses
 *   - adversarial_review: critiqueHypothesis
 *   - research_plan: designResearchPlan
 *   - scorecard: deterministic scoring + Pareto front
 *   - citation: deterministic citation binding
 *
 * Reuse (no parallel schema): FalsificationMethod (agent_loop), CorpusSnapshot /
 * RetrievedDocument / CitationResolver (retrieval), LlmGateway (llm_gateway).
 */

export * from './types.ts';
export * from './llm.ts';
export * from './citation.ts';
export * from './scorecard.ts';
export * from './hypothesis_generation.ts';
export * from './adversarial_review.ts';
export * from './research_plan.ts';
export * from './orchestrator.ts';
export * from './provenance.ts';
export * from './researchability_gate.ts';
export * from './revision.ts';
