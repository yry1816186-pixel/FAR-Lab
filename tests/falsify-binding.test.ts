import { describe, it, expect } from 'vitest';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import {
  HypothesisCandidate,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  newId,
} from '../src/domain/index.js';
import type { RunId } from '../src/domain/index.js';
import type { StageContext } from '../src/pipeline/types.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { ArtifactStore } from '../src/shared/ports.js';
import { canonicalSha256 } from '../src/shared/crypto.js';
import { falsifyStage, gateCritiqueLinks } from '../src/pipeline/stages/falsify.js';

/**
 * B6 binding-density enrichment (PLAN-reuse-adoption §R4) — *** TEST FIXTURES ONLY ***
 * Every model response below is a scripted TestStubProvider step (executionMode 'test').
 *
 * EMR-ACH contrastivity: evidence bound to zero compared hypotheses has zero diagnostic
 * value; the enrichment goal is raising per-hypothesis claim coverage honestly. Under
 * test:
 *   - gate widening: claims whose vocabulary overlaps the hypothesis PREDICTIONS (not
 *     statement/mechanism) survive the topical gate — while a claim with no vocabulary
 *     overlap anywhere is still dropped (the threshold is unchanged);
 *   - consideredClaimIds: explicit "evaluated, no relation" is reported by the model,
 *     filtered against known ids, and surfaces only in the ctx.log density line;
 *   - zero-binding warning: a representative hypothesis ending with 0 supporting AND
 *     0 counter links while >= 3 verified claims exist warns visibly.
 */

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

/**
 * Vocabulary design (contentTokens: tokens > 3 chars minus stopwords):
 * - statement/mechanism vocabulary: ion transport / polymer / membranes / cation /
 *   accumulation / interface / degrades / pathways …
 * - prediction-only vocabulary: anion / redistribution / overpotential / discharge /
 *   operando / Raman / spectroscopy — appears NOWHERE in statement or mechanism.
 */
const HYP_TEXTS = {
  statement: 'Ion transport through polymer membranes governs battery lifetime',
  mechanism: 'Cation accumulation at the polymer interface degrades transport pathways',
  predictions: [
    'Anion redistribution raises cell overpotential during discharge cycling',
    'Blocking anion redistribution lowers overpotential in operando Raman spectroscopy',
  ],
} as const;

/** Counter claim: shares vocabulary ONLY with predictions (0 overlap vs statement+mechanism). */
const P1_TEXT = 'Operando Raman spectroscopy tracks overpotential growth as anion redistribution proceeds during discharge';
/** Supporting claim: same — prediction-only overlap. */
const P2_TEXT = 'Anion redistribution correlates with overpotential rise across repeated discharge cycles';
/** Topically unrelated claim: zero content-vocabulary overlap anywhere in the hypothesis. */
const DISTANT_TEXT = 'Quantum error correction thresholds improve under surface code decoding schedules';
/** Evaluated-and-rejected claims (model lists them in consideredClaimIds, never links them). */
const NOREL1_TEXT = 'Meta-analysis of 32 cohorts reports publication bias in psychology survey instruments';
const NOREL2_TEXT = 'Clinical trial registry uptake improved after 2010 reporting mandates';

const setup = () => {
  const store = new Store(openDb(':memory:'));
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do polymer electrolyte cells lose transport capacity during cycling?',
    background: 'interface degradation limits lifetime',
    goalType: 'explanatory',
    scope: { domain: 'electrochemistry', phenomena: ['interface degradation'] },
    constraints: { assumptions: [] },
    createdAt: new Date().toISOString(),
  });
  store.putObject('question', q);
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'running',
    currentStage: 'critique_falsify',
    stages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
  });
  return { store, run };
};

const makeClaim = (runId: RunId, text: string) =>
  ScientificClaim.parse({
    id: newId('clm'),
    runId,
    text,
    locators: [{ sourceDocumentId: newId('src'), quote: `verbatim excerpt grounding: ${text}` }],
    bindingStatus: 'verified',
    alignmentChecked: true,
  });

const makeHyp = (runId: RunId) =>
  HypothesisCandidate.parse({
    id: newId('hyp'),
    runId,
    version: 0,
    statement: HYP_TEXTS.statement,
    mechanism: HYP_TEXTS.mechanism,
    derivation: { strategy: 'mechanism_driven', rationale: 'seeded generation rationale', inputClaimIds: [] },
    assumptions: [{ id: 'a0', statement: 'anion motion couples to interface impedance', kind: 'empirical', backingClaimIds: [] }],
    predictions: [...HYP_TEXTS.predictions],
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'mixed',
    testability: 'testable_with_data',
    clusterKey: 'seeded',
    createdAt: new Date().toISOString(),
  });

const memArtifacts = (): ArtifactStore => {
  const data = new Map<string, string>();
  return {
    async put(payload) {
      const s = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const hash = canonicalSha256(s);
      const ref = `sha256:${hash}`;
      data.set(ref, s);
      return { ref, hash, size: s.length };
    },
    async get(ref) {
      return data.get(ref) ?? null;
    },
    path: (ref) => ref,
  };
};

/** StageContext with a COLLECTING ctx.log (the B6 density lines are asserted verbatim). */
const makeCtx = (run: { id: RunId }, store: Store, steps: StubStep[]) => {
  const logs: string[] = [];
  const receipts: Array<Record<string, unknown>> = [];
  const ctx: StageContext = {
    run: run as StageContext['run'],
    store,
    artifacts: memArtifacts(),
    provider: createTestStubProvider(steps),
    sourceFor: (family) => {
      throw new Error(`TEST FIXTURE: no fake adapter registered for ${family}`);
    },
    recordReceipt: (r) => {
      receipts.push(r as Record<string, unknown>);
    },
    cancelled: () => false,
    disowned: () => false,
    log: (msg) => {
      logs.push(msg);
    },
    checkpointed: async <T>(_stage: string, _family: string, _key: string, _fp: string | undefined, fn: () => Promise<T>) => fn(),
  };
  return { ctx, logs, receipts };
};

/** Complete, decidable spec skeleton (deterministic completeness gate must PASS). */
const baseSpec = {
  observable: 'cell overpotential across discharge cycles under blocked anion redistribution',
  measurement: 'operando Raman spectroscopy of the polymer electrolyte interface during full discharge cycling',
  expectedRelation: 'overpotential rise rate falls monotonically as anion redistribution is suppressed',
  decisionRule: 'if blocked-redistribution cells show >= 30% lower overpotential rise than controls over 100 cycles, supported; < 10% difference refutes',
  decisionRuleProvenance: 'model-stipulated',
  supportCondition: 'a suppressed-redistribution cell reproduces a materially lower overpotential rise',
  weakeningCondition: 'overpotential rise is unchanged within measurement noise across cells',
  falsificationCondition: 'overpotential rise accelerates despite redistribution blocking',
  confounders: ['cell temperature drift during cycling'],
  alternativeExplanations: ['interfacial impedance growth independent of anion motion'],
  dataRequirements: ['cycling series with operando spectra'],
  method: 'paired cycling experiment with anion-blocking additive and inert control',
  failureInterpretation: 'the redistribution-overpotential pathway is unsupported; revisit the interface model',
  uncertainties: [],
  testability: 'testable_now',
};

/** Audit step confirming every listed link (purpose-keyed: interleaving-proof). */
const auditConfirm = (hypId: string, ...claimIds: string[]): StubStep => ({
  forPurpose: `link-verification:${hypId}`,
  rawOutput: JSON.stringify({
    verdicts: claimIds.map((claimId) => ({
      claimId,
      verdict: 'confirm',
      reason: 'audit confirms the claim bears directly on the hypothesis predictions',
    })),
  }),
});

// ---------------------------------------------------------------------------
// pure gate: gateCritiqueLinks (exported helper — no LLM, no store)
// ---------------------------------------------------------------------------

describe('gateCritiqueLinks (B6 widened surface, unchanged threshold)', () => {
  const claims = [
    { id: 'clm_p1', text: P1_TEXT },
    { id: 'clm_p2', text: P2_TEXT },
    { id: 'clm_distant', text: DISTANT_TEXT },
    { id: 'clm_statement', text: 'Cation accumulation at the polymer interface impedes transport through membranes' },
  ];

  it('keeps prediction-vocabulary claims: overlap with PREDICTIONS admits them', () => {
    const { kept, dropped } = gateCritiqueLinks(HYP_TEXTS, claims, ['clm_p1', 'clm_p2', 'clm_distant']);
    expect(kept).toEqual(['clm_p1', 'clm_p2']); // gate-widening is what makes these links possible
    expect(dropped).toEqual(['clm_distant']); // zero overlap anywhere in statement+mechanism+predictions
  });

  it('scientific-truth floor: the threshold is NOT weakened — statement+mechanism surface alone (pre-B6) still drops the prediction-linked claims', () => {
    // Same claims, hypothesis with no predictions = the OLD gate surface. The prediction-
    // linked claims had ZERO overlap with statement/mechanism, so only admitting them via
    // the widened surface (not via a looser threshold) can explain the test above.
    const { kept, dropped } = gateCritiqueLinks({ ...HYP_TEXTS, predictions: [] }, claims, [
      'clm_p1',
      'clm_p2',
      'clm_distant',
      'clm_statement',
    ]);
    expect(kept).toEqual(['clm_statement']); // statement/mechanism overlap passes under BOTH surfaces
    expect(dropped).toEqual(['clm_p1', 'clm_p2', 'clm_distant']);
  });

  it('a topically unrelated claim is dropped under both the old and the widened surface', () => {
    const widened = gateCritiqueLinks(HYP_TEXTS, claims, ['clm_distant']);
    const oldSurface = gateCritiqueLinks({ ...HYP_TEXTS, predictions: [] }, claims, ['clm_distant']);
    expect(widened.dropped).toEqual(['clm_distant']);
    expect(oldSurface.dropped).toEqual(['clm_distant']);
  });

  it('unknown claim ids deterministically drop (claim object missing)', () => {
    const { kept, dropped } = gateCritiqueLinks(HYP_TEXTS, claims, ['clm_hallucinated0000']);
    expect(kept).toEqual([]);
    expect(dropped).toEqual(['clm_hallucinated0000']);
  });
});

// ---------------------------------------------------------------------------
// integration: falsifyStage end-to-end with scripted purpose-keyed responses
// ---------------------------------------------------------------------------

describe('falsifyStage B6 binding-density enrichment (integration)', () => {
  it('prediction-linked claims survive gate+audit; unrelated claim dropped; density line logged; consideredClaimIds filtered', async () => {
    const { store, run } = setup();
    const clmP1 = makeClaim(run.id, P1_TEXT);
    const clmP2 = makeClaim(run.id, P2_TEXT);
    const clmDistant = makeClaim(run.id, DISTANT_TEXT);
    const clmNoRel1 = makeClaim(run.id, NOREL1_TEXT);
    const clmNoRel2 = makeClaim(run.id, NOREL2_TEXT);
    for (const c of [clmP1, clmP2, clmDistant, clmNoRel1, clmNoRel2]) store.putObject('claim', c);
    const h1 = makeHyp(run.id);
    store.putObject('hypothesis', h1);

    const spec = {
      ...baseSpec,
      assumptionCritiques: [],
      counterLinks: [
        {
          claimId: clmP1.id,
          relation: 'weakens',
          linkReason: 'the accelerated redistribution-overpotential coupling directly undermines the predicted suppression pathway',
        },
        {
          claimId: clmDistant.id,
          relation: 'contradicts',
          linkReason: 'a topically hollow rationale that must not survive the widened vocabulary gate',
        },
      ],
      supportingClaimIds: [clmP2.id],
      supportingLinks: [
        {
          claimId: clmP2.id,
          linkReason: 'the redistribution-overpotential correlation matches the predicted discharge-cycle signature',
        },
      ],
      // one hallucinated id must be filtered from the considered-nolink count
      consideredClaimIds: [clmNoRel1.id, clmNoRel2.id, 'clm_unknown00000000000000000x'],
      uncertainties: ['operando Raman signal-to-noise under load'],
    };
    const steps: StubStep[] = [
      { forPurpose: `falsification-spec:${h1.id}`, rawOutput: JSON.stringify(spec) },
      auditConfirm(h1.id, clmP1.id, clmP2.id),
    ];
    const { ctx, logs } = makeCtx(run, store, steps);
    expect(await falsifyStage.applicable(ctx)).toBe(true);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';

    // prediction-vocabulary links SURVIVED the gate and the audit, exactly as proposed
    const h1After = store.getObject('hypothesis', h1.id);
    expect(h1After?.counterClaimIds).toEqual([clmP1.id]);
    expect(h1After?.supportingClaimIds).toEqual([clmP2.id]);
    expect(h1After?.falsification?.completenessCheck).toEqual({ passed: true, missing: [] });

    const rels = store.listObjects('evidence_relation', run.id);
    expect(rels).toHaveLength(2);
    expect(rels).toContainEqual(
      expect.objectContaining({ relation: 'weakens', claimId: clmP1.id, targetHypothesisId: h1.id }),
    );
    expect(rels).toContainEqual(
      expect.objectContaining({ relation: 'supports', claimId: clmP2.id, targetHypothesisId: h1.id }),
    );
    // the topically unrelated claim never became a relation nor a binding
    expect(rels.some((r) => r.claimId === clmDistant.id)).toBe(false);
    expect(h1After?.counterClaimIds.includes(clmDistant.id)).toBe(false);
    expect(h1After?.supportingClaimIds.includes(clmDistant.id)).toBe(false);

    // visible gate drop in the stage summary
    expect(summary).toContain('topically non-overlapping counter claim link');
    expect(summary).toContain(clmDistant.id);

    // B6 density line: final (post-audit) bindings, considered-nolink filtered to
    // run-known unlinked ids (2 of the 3 scripted; the unknown id does not count)
    expect(logs).toContain(`critique bindings: hyp=${h1.id} support=1 counter=1 considered-nolink=2 of 5`);

    // h1 has links — no zero-binding warning for it
    expect(summary).not.toContain(`${h1.id}: 0 supporting and 0 counter critique links`);
  });

  it('zero-binding warning fires when a representative hypothesis ends with 0+0 links while >= 3 verified claims exist; density line reports the no-link mass', async () => {
    const { store, run } = setup();
    const claims = [P1_TEXT, P2_TEXT, DISTANT_TEXT, NOREL1_TEXT, NOREL2_TEXT].map((t) => makeClaim(run.id, t));
    for (const c of claims) store.putObject('claim', c);
    const h2 = makeHyp(run.id);
    store.putObject('hypothesis', h2);

    // a complete spec that honestly links NOTHING and reports every claim as evaluated-no-relation
    const spec = {
      ...baseSpec,
      assumptionCritiques: [],
      counterLinks: [],
      supportingClaimIds: [],
      supportingLinks: [],
      consideredClaimIds: claims.map((c) => c.id),
      uncertainties: [],
    };
    const steps: StubStep[] = [{ forPurpose: `falsification-spec:${h2.id}`, rawOutput: JSON.stringify(spec) }];
    const { ctx, logs } = makeCtx(run, store, steps);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';

    expect(summary).toContain(
      `${h2.id}: 0 supporting and 0 counter critique links while 5 verified claim(s) exist in the run — zero evidence binding`,
    );
    expect(logs).toContain(`critique bindings: hyp=${h2.id} support=0 counter=0 considered-nolink=5 of 5`);

    // honest state: spec stored and complete, zero relations, zero bindings — a density
    // signal, not a failure being cosmetically padded
    const h2After = store.getObject('hypothesis', h2.id);
    expect(h2After?.falsification?.completenessCheck).toEqual({ passed: true, missing: [] });
    expect(h2After?.supportingClaimIds).toEqual([]);
    expect(h2After?.counterClaimIds).toEqual([]);
    expect(store.listObjects('evidence_relation', run.id)).toHaveLength(0);
  });

  it('zero-binding warning stays silent below the >= 3 verified-claims threshold', async () => {
    const { store, run } = setup();
    const twoClaims = [P1_TEXT, NOREL1_TEXT].map((t) => makeClaim(run.id, t));
    for (const c of twoClaims) store.putObject('claim', c);
    const h3 = makeHyp(run.id);
    store.putObject('hypothesis', h3);

    const spec = {
      ...baseSpec,
      assumptionCritiques: [],
      counterLinks: [],
      supportingClaimIds: [],
      supportingLinks: [],
      consideredClaimIds: twoClaims.map((c) => c.id),
      uncertainties: [],
    };
    const steps: StubStep[] = [{ forPurpose: `falsification-spec:${h3.id}`, rawOutput: JSON.stringify(spec) }];
    const { ctx, logs } = makeCtx(run, store, steps);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).not.toContain('zero evidence binding');
    expect(logs).toContain(`critique bindings: hyp=${h3.id} support=0 counter=0 considered-nolink=2 of 2`);
  });
});
