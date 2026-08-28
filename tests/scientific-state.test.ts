import { describe, expect, it } from 'vitest';
import {
  HypothesisCandidate, HypothesisScorecard, ScientificClaim, EvidenceRelation,
} from '../src/domain/index.js';
import { projectScientificState } from '../src/domain/scientific-state.js';
import { deriveNextActions } from '../src/domain/next-action.js';
import { projectStateDeltas } from '../src/domain/state-delta.js';

/**
 * Product Spine projections (2026-08-28): the tests that matter are the TRUTH
 * gates — template content must never occupy the leading-explanation slot,
 * insufficient states must surface as conclusions, and actions must derive
 * from the scientific state (ordered, qualitative, honest affordances).
 */

const at = '2026-08-28T00:00:00.000Z';
/** Id grammar: <prefix>_[0-9a-z]{20,32}. */
const mkId = (prefix: string, tag: string): string => {
  const body = `${tag}0000000000000000000`.slice(0, 22).replace(/[^0-9a-z]/g, '0');
  return `${prefix}_${body}`;
};
const rid = mkId('run', 'test');

const claim = (tag: string, text: string, over: Partial<ScientificClaim> = {}): ScientificClaim => ScientificClaim.parse({
  id: mkId('clm', tag), runId: rid, text, bindingStatus: 'verified',
  locators: [{ sourceDocumentId: mkId('src', 'a'), quote: text }], ...over,
});

const hyp = (tag: string, statement: string, over: Partial<HypothesisCandidate> = {}): HypothesisCandidate =>
  HypothesisCandidate.parse({
    id: mkId('hyp', tag), runId: rid, statement, mechanism: 'm', version: 0, createdAt: at,
    derivation: { strategy: 'evidence_conditioned', rationale: 'r', inputClaimIds: [] },
    ...over,
  });

const card = (forHyp: HypothesisCandidate, rank: number, ground: number, exposure: number): HypothesisScorecard =>
  HypothesisScorecard.parse({
    id: mkId('sc', forHyp.id.slice(4, 12)), runId: rid, hypothesisId: forHyp.id, rankedOutOf: 3, rank,
    dimensions: [
      { dimension: 'evidence_grounding', value: ground, rationale: 'grounded rationale', producer: 'test', calibration: 'uncalibrated_llm_judgment' },
      { dimension: 'counter_evidence_exposure', value: exposure, rationale: 'exposure rationale', producer: 'test', calibration: 'uncalibrated_llm_judgment' },
    ],
    overallRationale: 'or',
  });

const rel = (tag: string, forClaim: ScientificClaim, target: HypothesisCandidate, relation: 'supports' | 'contradicts', strength: 'strong' | 'weak' = 'strong'): EvidenceRelation =>
  EvidenceRelation.parse({ id: mkId('ev', tag), runId: rid, relation, claimId: forClaim.id, targetHypothesisId: target.id, rationale: 'why', strength, createdAt: at });

describe('projectScientificState — truth gates', () => {
  it('template hypotheses are REFUSED the leading slot: kind=template, leading=null, markers disclosed', () => {
    const s = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'life sciences (offline scope template)',
      claims: [claim('c1', 'c1')], relations: [],
      hypotheses: [hyp('t1', 'Offline hypothesis 1 (evidence-driven): filler'), hyp('t2', 'Offline hypothesis 2 (mechanism-driven): filler')],
      scorecards: [], counterQueriesAttempted: 2,
    });
    expect(s.kind).toBe('template');
    expect(s.leading).toBeNull();
    expect(s.templateEvidence.length).toBeGreaterThanOrEqual(1);
    expect(s.biggestUnknown).toEqual({ kind: 'template_content' });
  });

  it('a LIVE run with one template-looking string among real hypotheses stays evidence_backed (half-rule)', () => {
    const h1 = hyp('a', 'Real mechanistic hypothesis A');
    const h2 = hyp('b', 'Real mechanistic hypothesis B');
    const h3 = hyp('c', 'Offline hypothesis 3: odd one out');
    const s = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'cardiology',
      claims: [claim('c1', 'omega-3 raises AF risk')], relations: [],
      hypotheses: [h1, h2, h3], scorecards: [card(h1, 1, 0.8, 0.5), card(h2, 2, 0.6, 0.4), card(h3, 3, 0.2, 0.1)],
      counterQueriesAttempted: 0,
    });
    expect(s.kind).not.toBe('template');
  });

  it('evidence_backed state synthesizes leader/why/support/counter/unknown from real objects', () => {
    const h1 = hyp('a', 'Direct atrial electrophysiological effect', {
      supportingClaimIds: [mkId('clm', 'ok')], counterClaimIds: [mkId('clm', 'ctr')],
      uncertainties: ['population generalization untested'],
      falsification: {
        observable: 'atrial action potential duration', measurement: 'patch clamp', expectedRelation: 'shortens',
        decisionRule: 'ratio > 1.0', supportCondition: 's', weakeningCondition: 'w',
        falsificationCondition: 'no shortening observed at therapeutic dose', confounders: [], alternativeExplanations: [],
        dataRequirements: [], method: 'in vitro', failureInterpretation: 'f',
      },
    });
    const h2 = hyp('b', 'Dose-formulation heterogeneity', {
      falsification: {
        observable: 'EPA/DHA ratio effect estimate', measurement: 'meta-analysis', expectedRelation: 'moderates',
        decisionRule: 'I2 drop', supportCondition: 's', weakeningCondition: 'w',
        falsificationCondition: 'ratio does not moderate', confounders: [], alternativeExplanations: [],
        dataRequirements: [], method: 'regression', failureInterpretation: 'f',
      },
    });
    const cOk = claim('ok', 'RCT reports AF signal increase', { gradeCertainty: 'high' });
    const cCtr = claim('ctr', 'Observational cohort finds no association', { gradeCertainty: 'moderate' });
    const s = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'cardiology',
      claims: [cOk, cCtr],
      relations: [rel('r1', cOk, h1, 'supports', 'strong'), rel('r2', cCtr, h1, 'contradicts', 'weak')],
      hypotheses: [h1, h2], scorecards: [card(h1, 1, 0.8, 0.6), card(h2, 2, 0.7, 0.4)],
      counterQueriesAttempted: 2,
    });
    expect(s.kind).toBe('evidence_backed');
    expect(s.leading?.hypothesisId).toBe(h1.id);
    expect(s.strongestSupport?.claimId).toBe(cOk.id);
    expect(s.strongestSupport?.gradeCertainty).toBe('high');
    expect(s.strongestCounter?.claimId).toBe(cCtr.id);
    expect(s.biggestUnknown?.kind).toBe('unresolved_counter');
    expect(s.falsifiers[0]?.condition).toContain('no shortening');
    expect(s.discriminatingObservations[0]?.betweenHypothesisIds).toEqual([h1.id, h2.id]);
    expect(s.confidence.qualitative).toBe('high'); // min(0.8, (0.8+0.6)/2)=0.7 -> high band
  });

  it('no active hypotheses -> insufficient with the formal negative conclusion', () => {
    const s = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'cardiology',
      claims: [claim('c1', 'c')], relations: [], hypotheses: [], scorecards: [], counterQueriesAttempted: 0,
    });
    expect(s.kind).toBe('insufficient');
    expect(s.biggestUnknown).toEqual({ kind: 'no_active_hyps' });
  });

  it('searched-and-found-none is a scoped record, never "no counter-evidence exists"', () => {
    const s = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'cardiology',
      claims: [claim('c1', 'c')], relations: [], hypotheses: [hyp('a', 'H')], scorecards: [card(hyp('a', 'H'), 1, 0.5, 0.5)],
      counterQueriesAttempted: 3,
    });
    expect(s.counters.searchedAndFoundNone).toEqual({ queriesAttempted: 3, foundCount: 0 });
    expect(s.biggestUnknown?.kind).toBe('searched_no_counter');
  });

  it('running runs are forming — no premature state', () => {
    const s = projectScientificState({
      runId: rid, runStatus: 'running', questionDomain: 'x',
      claims: [], relations: [], hypotheses: [], scorecards: [], counterQueriesAttempted: 0,
    });
    expect(s.kind).toBe('forming');
    expect(s.leading).toBeNull();
  });
});

describe('deriveNextActions — derived from scientific state, not pipeline order', () => {
  const baseInput = {
    runId: rid,
    runStatus: 'completed',
    leg: { kind: 'no_plan' as const, executabilityPassed: false },
    unconsumedFeedbackCount: 0,
    hasEvidenceDebt: false,
    planDatasets: [] as Array<{ name: string; availability: string }>,
  };

  it('template state -> rerun-with-live-route + formal insufficient conclusion, in that order', () => {
    const state = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'life sciences (offline scope template)',
      claims: [], relations: [], hypotheses: [hyp('t1', 'Offline hypothesis 1: x')], scorecards: [], counterQueriesAttempted: 0,
    });
    const actions = deriveNextActions({ ...baseInput, state });
    expect(actions[0]?.actionType).toBe('RERUN_WITH_LIVE_ROUTE');
    expect(actions[0]?.researcherDecisionRequired).toBe(true);
    expect(actions[0]?.actionable).toBe(true);
    expect(actions[1]?.actionType).toBe('DECLARE_INSUFFICIENT_EVIDENCE');
  });

  it('evidence_backed without counter exposure -> COUNTER_EVIDENCE_SEARCH ranks first', () => {
    const h1 = hyp('a', 'H1');
    const c1 = claim('c1', 'c');
    const state = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'cardiology',
      claims: [c1], relations: [rel('r1', c1, h1, 'supports')],
      hypotheses: [h1, hyp('b', 'H2')], scorecards: [card(h1, 1, 0.8, 0.6), card(hyp('b', 'H2'), 2, 0.7, 0.4)],
      counterQueriesAttempted: 0,
    });
    const actions = deriveNextActions({ ...baseInput, state });
    expect(actions[0]?.actionType).toBe('COUNTER_EVIDENCE_SEARCH');
    expect(actions[0]?.expectedDiscrimination).toBe('high');
  });

  it('unconsumed feedback + executable plan beat literature actions (loop-unblock priority)', () => {
    const h1 = hyp('a', 'H1');
    const c1 = claim('c1', 'c');
    const state = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'cardiology',
      claims: [c1], relations: [rel('r1', c1, h1, 'supports')],
      hypotheses: [h1], scorecards: [card(h1, 1, 0.8, 0.6)], counterQueriesAttempted: 0,
    });
    const actions = deriveNextActions({
      ...baseInput, state,
      leg: { kind: 'unexecuted', executabilityPassed: true },
      unconsumedFeedbackCount: 2,
    });
    expect(actions[0]?.actionType).toBe('CONSUME_FEEDBACK_INTO_REVISION');
    expect(actions[0]?.actionable).toBe(true);
    expect(actions[0]?.actionHint).toEqual({ kind: 'resume' });
    expect(actions[1]?.actionType).toBe('EXECUTE_PLANNED_EXPERIMENT');
  });

  it('no fake affordances: non-loop science actions are guidance, never resume buttons', () => {
    const state = projectScientificState({
      runId: rid, runStatus: 'completed', questionDomain: 'cardiology',
      claims: [claim('c1', 'c')], relations: [], hypotheses: [hyp('a', 'H1')], scorecards: [card(hyp('a', 'H1'), 1, 0.5, 0.5)],
      counterQueriesAttempted: 0,
    });
    const LOOP_TYPES = new Set(['CONSUME_FEEDBACK_INTO_REVISION', 'EXECUTE_PLANNED_EXPERIMENT', 'RESUME_EVIDENCE_DEBT', 'RERUN_WITH_LIVE_ROUTE']);
    const actions = deriveNextActions({ ...baseInput, state });
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      if (!LOOP_TYPES.has(a.actionType)) expect(a.actionable).toBe(false);
    }
  });

  it('running runs derive nothing (the live band owns the narrative)', () => {
    const state = projectScientificState({
      runId: rid, runStatus: 'running', questionDomain: 'x',
      claims: [], relations: [], hypotheses: [], scorecards: [], counterQueriesAttempted: 0,
    });
    expect(deriveNextActions({ ...baseInput, runStatus: 'running', state })).toEqual([]);
  });
});

describe('projectStateDeltas — WHAT CHANGED / WHY from the causal revision chain', () => {
  it('projects revision operations with before/after, trigger excerpt and ranking impact', async () => {
    const { Revision, FeedbackSignal } = await import('../src/domain/index.js');
    const h1 = hyp('a', 'H1');
    const fb = FeedbackSignal.parse({
      id: mkId('fbk', 'f1'), runId: rid, source: 'experiment',
      content: 'Meta-analysis verdict: weakens H1 (k=4, CI excludes null)',
      provenance: 'test', receivedAt: at,
    });
    const rev = Revision.parse({
      id: mkId('rev', 'r1'), runId: rid, triggerFeedbackId: fb.id,
      causalReason: 'The pooled estimate contradicts H1 for the therapeutic-dose subgroup',
      operations: [{
        objectType: 'hypothesis', objectId: h1.id, operation: 'weaken',
        before: 'rank 1 leading', after: 'rank 2', reason: 'pooled estimate contradicts subgroup prediction',
      }],
      fromVersionLabel: 'v2', toVersionLabel: 'v3',
      qualityDelta: { status: 'worse', claim: 'H1 subgroup prediction weakened by pooled evidence', evidenceRefs: [] },
      createdAt: at,
    });
    const deltas = projectStateDeltas({ runId: rid, revisions: [rev], feedbacks: [fb], versionDiffs: [] });
    expect(deltas).toHaveLength(1);
    const d = deltas[0]!;
    expect(d.trigger.feedbackSource).toBe('experiment');
    expect(d.trigger.excerpt).toContain('Meta-analysis');
    expect(d.whatChanged[0]?.operation).toBe('weaken');
    expect(d.whatChanged[0]?.before).toBe('rank 1 leading');
    expect(d.rankingImpact).toBe('weakened');
    expect(d.explanation).toContain('pooled estimate');
    expect(d.affectedHypothesisIds).toEqual([h1.id]);
  });
});
