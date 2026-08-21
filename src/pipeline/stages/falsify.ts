import { z } from 'zod';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { callStructured } from '../llm.js';
import {
  DecisionRuleProvenance,
  EvidenceRelation,
  FalsificationSpec,
  HypothesisCandidate,
  TestabilityStatus,
  newId,
} from '../../domain/index.js';
import type { HypothesisCandidate as Hypothesis } from '../../domain/index.js';
import { assertNotCancelled, isRepresentative, partitionClaimRefs, runClaimIds } from './shared.js';
import { contentTokens, topicalOverlap } from './evidence.js';

/**
 * critique_falsify — falsification specs that can actually decide something (mission §29).
 *
 * "Could be tested in future work" is NOT a falsification spec. Every representative
 * hypothesis gets one structured critique call producing a full FalsificationSpec plus
 * assumption critiques, counter/supporting evidence links and uncertainties. A
 * DETERMINISTIC completeness check (pure function, no LLM) then verifies the spec
 * carries non-trivial content and a decidable decision rule; failing specs mark the
 * hypothesis untestable_currently and the failure is stored, never cosmetically fixed.
 */

// ---------------------------------------------------------------------------
// model output schema
// ---------------------------------------------------------------------------

/** A critique link reason must be a substantive argument (>= 20 chars), never a template (W5/S2). */
const LinkReason = z.object({
  claimId: z.string().min(1),
  linkReason: z.string().min(20),
});

const FalsifyOut = z.object({
  observable: z.string().min(1),
  measurement: z.string().min(1),
  expectedRelation: z.string().min(1),
  decisionRule: z.string().min(1),
  /**
   * W5/S3 (threshold provenance disclosure): self-assess where every quantitative
   * threshold in decisionRule comes from. Exactly one of:
   * - 'evidence-derived': the threshold is derived from the provided claims;
   * - 'community-standard': it is customary in the field's literature;
   * - 'model-stipulated': you chose the number yourself without evidence support.
   */
  decisionRuleProvenance: DecisionRuleProvenance,
  supportCondition: z.string().min(1),
  weakeningCondition: z.string().min(1),
  falsificationCondition: z.string().min(1),
  confounders: z.array(z.string().min(1)).default([]),
  alternativeExplanations: z.array(z.string().min(1)).default([]),
  dataRequirements: z.array(z.string().min(1)).default([]),
  method: z.string().min(1),
  failureInterpretation: z.string().min(1),
  /** Critiques targeting assumptions by index into hypothesis.assumptions; out-of-range ones are kept as free uncertainties. */
  assumptionCritiques: z
    .array(z.object({ assumptionIndex: z.number().int().nonnegative(), critique: z.string().min(1) }))
    .default([]),
  counterClaimIds: z.array(z.string()).default([]),
  /** Subset of counterClaimIds whose relation is 'weakens' rather than 'contradicts'. */
  weakeningClaimIds: z.array(z.string()).default([]),
  /** W5/S2: why each linked counter claim weakens/contradicts THIS hypothesis (>= 20 chars per reason). */
  counterLinks: z.array(LinkReason).default([]),
  supportingClaimIds: z.array(z.string()).default([]),
  /** W5/S2: why each linked supporting claim supports THIS hypothesis (>= 20 chars per reason). */
  supportingLinks: z.array(LinkReason).default([]),
  uncertainties: z.array(z.string().min(1)).default([]),
  testability: TestabilityStatus,
});

// ---------------------------------------------------------------------------
// deterministic completeness check — pure, exported for direct testing
// ---------------------------------------------------------------------------

/** String fields that must be non-empty AND non-trivial (>10 characters). */
export const REQUIRED_SPEC_FIELDS = [
  'observable',
  'measurement',
  'expectedRelation',
  'decisionRule',
  'supportCondition',
  'weakeningCondition',
  'falsificationCondition',
  'method',
  'failureInterpretation',
] as const;

/** Patterns that make a decision rule decidable: comparisons, ratios/thresholds, or explicit if-then judging criteria. */
const DECIDABLE_SEMANTICS: readonly RegExp[] = [
  /[≥≤><]/, // explicit comparison operators
  /(?:比值|比率|阈值|倍数?|至少|至多|最多|最少|大于|小于|超过|低于|高于)/, // quantitative Chinese judging vocabulary
  /(?:ratio|threshold|fold|times|percent|at (?:least|most)|(?:no )?more than|(?:no )?less than)/i,
  /\d\s*%/, // an explicit percentage threshold
  /(?:若|如果|假若|假定|假设|一旦)[\s\S]{1,80}?(?:则|那么|就|视为|判定)/, // qualitative if-then decision criterion
  /\bif\b[\s\S]{0,120}?\bthen\b/i,
  /\bwhen\b[\s\S]{0,120}?\bthen\b/i,
];

export const hasDecidableSemantics = (decisionRule: string): boolean =>
  DECIDABLE_SEMANTICS.some((re) => re.test(decisionRule));

export interface CompletenessResult {
  passed: boolean;
  missing: string[];
}

/**
 * Pure contract check on a candidate falsification spec (no LLM, no I/O).
 * "未来可以验证" style hollow text fails: no comparison semantics, no decidable rule.
 */
export const checkFalsificationCompleteness = (
  spec: Pick<FalsificationSpec, (typeof REQUIRED_SPEC_FIELDS)[number]>,
): CompletenessResult => {
  const missing: string[] = [];
  for (const field of REQUIRED_SPEC_FIELDS) {
    const v = (spec[field] ?? '').trim();
    if (v.length <= 10) missing.push(`${field}: empty or trivial (<=10 chars)`);
  }
  const rule = (spec.decisionRule ?? '').trim();
  if (rule.length > 10 && !hasDecidableSemantics(rule)) {
    missing.push('decisionRule: no decidable comparison semantics (>=/</ratio/threshold/if-then criterion)');
  }
  return { passed: missing.length === 0, missing };
};

// ---------------------------------------------------------------------------
// stage handler
// ---------------------------------------------------------------------------

export const falsifyStage: StageHandler = {
  stage: 'critique_falsify',

  async applicable(ctx) {
    const reps = ctx.store
      .listObjects('hypothesis', ctx.run.id)
      .filter((h) => isRepresentative(h) && h.falsification === undefined);
    return reps.length > 0;
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    const runId = ctx.run.id;
    const targets = ctx.store
      .listObjects('hypothesis', runId)
      .filter((h) => isRepresentative(h) && h.falsification === undefined);
    if (targets.length === 0) {
      return { kind: 'skipped', reason: 'no representative hypothesis without a falsification spec' };
    }
    const existingClaimIds = runClaimIds(ctx);
    const warnings: string[] = [];
    const results: string[] = [];
    let relationsCreated = 0;

    for (const hyp of targets) {
      assertNotCancelled(ctx, 'critique_falsify');
      const res = await callStructured<z.infer<typeof FalsifyOut>>(ctx, {
        stage: 'critique_falsify',
        purpose: `falsification-spec:${hyp.id}`,
        systemPrompt:
          'You are an adversarial reviewer. Produce a COMPLETE falsification specification for the hypothesis: ' +
          'what observable to measure, how, the expected relation, and a DECIDABLE decision rule (a comparison, ' +
          'ratio, threshold, or explicit if-then criterion) that separates support from weakening from refutation. ' +
          '"Could be tested in future work" without a decision rule is invalid. Self-assess the provenance of every ' +
          'quantitative threshold in the decision rule and set decisionRuleProvenance to exactly one of: ' +
          '"evidence-derived" (the threshold is derived from the provided claims), ' +
          '"community-standard" (it is a customary value in the field\'s literature), or ' +
          '"model-stipulated" (you chose the number yourself without evidence support) — never dress a number you ' +
          'invented as evidence-derived. Also critique each assumption, link real counter-evidence and supporting ' +
          'claims by their ids (only ids from the provided claims list), and for EVERY linked claim give a specific ' +
          'linkReason of at least 20 characters arguing why that particular claim weakens/contradicts or supports ' +
          'THIS hypothesis (generic template phrases are invalid). State genuine uncertainties.',
        payload: {
          hypothesis: {
            id: hyp.id,
            statement: hyp.statement,
            mechanism: hyp.mechanism,
            assumptions: hyp.assumptions.map((a) => a.statement),
            predictions: hyp.predictions,
            noveltyLabel: hyp.noveltyLabel,
          },
          availableClaims: ctx.store
            .listObjects('claim', runId)
            .map((c) => ({ id: c.id, text: c.text, bindingStatus: c.bindingStatus })),
        },
        schema: FalsifyOut,
      });
      const out = res.data;

      // ---- deterministic completeness gate (mission §29) ----
      const completeness = checkFalsificationCompleteness(out);
      const falsification: FalsificationSpec = {
        observable: out.observable,
        measurement: out.measurement,
        expectedRelation: out.expectedRelation,
        decisionRule: out.decisionRule,
        // W5/S3: threshold provenance is carried through (optional in the domain schema
        // for backward compatibility with pre-W5 stored specs).
        decisionRuleProvenance: out.decisionRuleProvenance,
        supportCondition: out.supportCondition,
        weakeningCondition: out.weakeningCondition,
        falsificationCondition: out.falsificationCondition,
        confounders: out.confounders,
        alternativeExplanations: out.alternativeExplanations,
        dataRequirements: out.dataRequirements,
        method: out.method,
        failureInterpretation: out.failureInterpretation,
        completenessCheck: completeness,
      };
      // A spec that cannot decide anything leaves the hypothesis honestly untestable now.
      const testability = completeness.passed ? out.testability : 'untestable_currently';

      // ---- evidence reference filtering + relation links ----
      const counter = partitionClaimRefs(out.counterClaimIds, existingClaimIds);
      const weakening = new Set(partitionClaimRefs(out.weakeningClaimIds, existingClaimIds).valid);
      const supportingRefs = partitionClaimRefs(out.supportingClaimIds, existingClaimIds);
      const droppedRefs = [...counter.invalid, ...supportingRefs.invalid];
      if (droppedRefs.length > 0) {
        warnings.push(`${hyp.id}: dropped ${droppedRefs.length} non-existent claim reference(s) (${droppedRefs.join(', ')})`);
      }
      const claimById = new Map(
        ctx.store.listObjects('claim', runId).map((c) => [c.id, c] as const),
      );
      // ---- deterministic topical gate on critique links (2026-08-22 relation-precision spike) ----
      // Blind re-judging measured contradicts-label precision at 1/8 exact (2 adjacent); the
      // worst offenders were topically DISTANT claims the model linked as counter evidence.
      // Same vocabulary-overlap rule as the D-018 claim-claim prefilter: a claim that shares
      // no content vocabulary with the hypothesis cannot honestly weaken/contradict/support it.
      const hypText = `${hyp.statement} ${hyp.mechanism}`;
      const hypTokens = contentTokens(hypText);
      const gateLinks = (ids: readonly string[]): { kept: string[]; dropped: string[] } => {
        const kept: string[] = [];
        const dropped: string[] = [];
        for (const id of ids) {
          const claim = claimById.get(id);
          const passes = claim !== undefined && topicalOverlap(contentTokens(claim.text), hypTokens).passes;
          if (passes) kept.push(id);
          else dropped.push(id);
        }
        return { kept, dropped };
      };
      const gatedCounter = gateLinks(counter.valid);
      const gatedSupporting = gateLinks(supportingRefs.valid);
      for (const [label, gated] of [['counter', gatedCounter], ['supporting', gatedSupporting]] as const) {
        if (gated.dropped.length > 0) {
          warnings.push(
            `${hyp.id}: dropped ${gated.dropped.length} topically non-overlapping ${label} claim link(s) (${gated.dropped.join(', ')}) — no shared content vocabulary with the hypothesis`,
          );
        }
      }
      const now = new Date().toISOString();
      // ---- W5/S2: relation rationale must be auditable, never a constant template ----
      // Priority: the model's per-link linkReason (a specific argument, >= 20 chars).
      // Fallback: a dynamically constructed rationale carrying the claim text (first 120
      // chars) plus the association to this hypothesis — still claim-specific, never a
      // bare constant.
      const counterReasons = new Map(out.counterLinks.map((l) => [l.claimId, l.linkReason] as const));
      const supportingReasons = new Map(out.supportingLinks.map((l) => [l.claimId, l.linkReason] as const));
      const hypShort = hyp.id.slice(0, 8); // e.g. hyp_k57p — readable short code
      const linkRationale = (claimId: string, direction: 'counter' | 'supporting'): string => {
        const reason = (direction === 'counter' ? counterReasons : supportingReasons).get(claimId)?.trim();
        if (reason !== undefined && reason.length >= 20) return reason;
        const claim = claimById.get(claimId);
        const text = claim
          ? claim.text.length > 120
            ? `${claim.text.slice(0, 120)}…`
            : claim.text
          : `claim ${claimId} 对象缺失`;
        const association =
          direction === 'counter' ? `与假设 ${hypShort} 的 critique 关联` : `与假设 ${hypShort} 的 critique 支持关联`;
        return `${text}（${association}）`;
      };
      const mkRelation = (relation: 'contradicts' | 'weakens' | 'supports', claimId: string) =>
        EvidenceRelation.parse({
          id: newId('ev'),
          runId,
          relation,
          claimId,
          targetHypothesisId: hyp.id,
          rationale: linkRationale(claimId, relation === 'supports' ? 'supporting' : 'counter'),
          strength: 'unrated',
          uncertainties: [],
          createdAt: now,
        });
      for (const id of gatedCounter.kept) {
        ctx.store.putObject('evidence_relation', mkRelation(weakening.has(id) ? 'weakens' : 'contradicts', id));
        relationsCreated += 1;
      }
      for (const id of gatedSupporting.kept) {
        ctx.store.putObject('evidence_relation', mkRelation('supports', id));
        relationsCreated += 1;
      }

      // ---- assumption critiques: attach in range, preserve overflow honestly ----
      const assumptions = hyp.assumptions.map((a) => ({ ...a }));
      const uncertainties = [...out.uncertainties];
      for (const critique of out.assumptionCritiques) {
        const target = assumptions[critique.assumptionIndex];
        if (target) {
          target.uncertainty =
            target.uncertainty === undefined ? critique.critique : `${target.uncertainty}; ${critique.critique}`;
        } else {
          uncertainties.push(`assumption critique (unattached, index out of range): ${critique.critique}`);
        }
      }

      const updated: Hypothesis = HypothesisCandidate.parse({
        ...hyp,
        assumptions,
        uncertainties,
        falsification,
        testability,
        supportingClaimIds: gatedSupporting.kept,
        counterClaimIds: gatedCounter.kept,
      });
      ctx.store.putObject('hypothesis', updated);

      results.push(
        completeness.passed
          ? `${hyp.id}: falsification spec passed deterministic completeness (testability=${testability}; counter links ${gatedCounter.kept.length}${gatedCounter.dropped.length > 0 ? ` (${gatedCounter.dropped.length} dropped by topical gate)` : ''}, supporting links ${gatedSupporting.kept.length}${gatedSupporting.dropped.length > 0 ? ` (${gatedSupporting.dropped.length} dropped by topical gate)` : ''})`
          : `${hyp.id}: falsification spec REJECTED by deterministic completeness — missing: ${completeness.missing.join('; ')}; testability=untestable_currently`,
      );
    }

    const parts = [
      `critiqued ${targets.length} representative hypothesis/hypotheses; ${relationsCreated} critique-linked evidence relation(s) created.`,
      ...results,
    ];
    if (warnings.length > 0) parts.push(`warnings: ${warnings.join(' | ')}`);
    return { kind: 'done', summary: parts.join(' ') };
  },
};
