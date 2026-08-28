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
import type { HypothesisCandidate as Hypothesis, ScientificClaim } from '../../domain/index.js';
import { assertNotCancelled, isRepresentative, mapBounded, partitionClaimRefs, runClaimIds, STAGE_CONCURRENCY } from './shared.js';
import { contentTokens, topicalOverlap } from './evidence.js';
import { hasExplicitQuantity } from '../../domain/claim.js';
import { relationStrength } from '../../domain/evidence-strength.js';

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

/**
 * Counter link with an EXPLICIT relation label (Wave-3 relation-reliability fix, spec §5):
 * 'contradicts' must be asserted by the model — absent or unparseable labels default to
 * 'weakens' (never 'contradicts'), because blind re-judging measured contradicts precision
 * at 30% exact (upper bound, 57 relations) when contradicts was the implicit default.
 */
const CounterLink = LinkReason.extend({
  relation: z.enum(['contradicts', 'weakens', 'qualifies']).catch('weakens'),
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
  counterLinks: z.array(CounterLink).default([]),
  supportingClaimIds: z.array(z.string()).default([]),
  /** W5/S2: why each linked supporting claim supports THIS hypothesis (>= 20 chars per reason). */
  supportingLinks: z.array(LinkReason).default([]),
  /**
   * B6 binding-density enrichment: ids of provided claims the model EXPLICITLY evaluated
   * and rejected as bearing no real relation to THIS hypothesis — distinguishes
   * "evaluated, no relation" from "not evaluated". Transport-only telemetry: persisted
   * nowhere; ids unknown to the run are filtered deterministically before counting.
   */
  consideredClaimIds: z.array(z.string()).default([]),
  uncertainties: z.array(z.string().min(1)).default([]),
  testability: TestabilityStatus,
});

/**
 * W5-F5 link-verification verdicts: an independent, differently-framed audit of every
 * proposed claim->hypothesis link. Anchored-band discipline follows the MLR-Bench
 * judge-anchoring pattern (full-sentence bands + anti-leniency) and AI-Scientist v1's
 * pessimistic-reviewer default (strictness under doubt), both mechanism-level borrows.
 *
 * D-057/B direction anchoring (2026-08-29, live-measured): the fresh blind re-judge of
 * run_498s42b8 found 9/24 counter labels INVERTED (judge=supports, 0 empty) — every miss
 * was a null-side hypothesis (predicts absence/no-effect/no-correlation) whose
 * no-effect supporting claims were labelled contradicts/weakens. The audit now DECOMPOSES
 * direction before naming a verdict: state the hypothesis's predicted direction, state
 * the claim's finding direction, only then the relation between THOSE two statements.
 */
const LinkVerifyOut = z.object({
  verdicts: z
    .array(
      z.object({
        claimId: z.string().min(1),
        verdict: z.enum(['confirm', 'relabel', 'drop']),
        relation: z.enum(['contradicts', 'weakens', 'qualifies', 'supports']).optional(),
        /** Anchor 1: the hypothesis's testable prediction, in the auditor's own words. */
        hypPrediction: z.string().min(20),
        /** Anchor 2: the claim's finding direction, as the claim states it. */
        claimFinding: z.string().min(20),
        reason: z.string().min(20),
      }),
    )
    .min(1),
});

export type LinkVerdict = {
  claimId: string;
  verdict: 'confirm' | 'relabel' | 'drop';
  relation?: 'contradicts' | 'weakens' | 'qualifies' | 'supports';
  reason: string;
};
type CritiqueRelation = 'contradicts' | 'weakens' | 'qualifies' | 'supports';

export interface LinkAuditDecision {
  relation: CritiqueRelation;
  dropped: boolean;
  note?: string;
}

/**
 * Deterministic application of audit verdicts to proposed links (pure, exported for tests).
 * Rules: verdicts for unknown claimIds are ignored; a claim the audit did not mention
 * stays as proposed (the audit is enrichment, silence is not rejection); 'relabel'
 * without a valid relation stays as proposed with a note; only an explicit 'drop'
 * removes a link, and only an explicit 'relabel' with a valid relation changes the label.
 */
export const applyLinkAudit = (
  proposed: readonly { claimId: string; relation: CritiqueRelation }[],
  verdicts: readonly LinkVerdict[],
): Map<string, LinkAuditDecision> => {
  const byId = new Map(proposed.map((p) => [p.claimId, p] as const));
  const out = new Map<string, LinkAuditDecision>(
    proposed.map((p) => [p.claimId, { relation: p.relation, dropped: false }] as const),
  );
  for (const v of verdicts) {
    const p = byId.get(v.claimId);
    if (p === undefined) continue; // audit hallucinated an id — ignore deterministically
    if (v.verdict === 'drop') {
      out.set(v.claimId, { relation: p.relation, dropped: true, note: `dropped by link audit: ${v.reason}` });
    } else if (v.verdict === 'relabel') {
      if (v.relation !== undefined) {
        out.set(v.claimId, { relation: v.relation, dropped: false, note: `relabelled ${p.relation}->${v.relation} by link audit: ${v.reason}` });
      } else {
        out.set(v.claimId, { relation: p.relation, dropped: false, note: `relabel verdict without relation kept as ${p.relation}: ${v.reason}` });
      }
    } // 'confirm' → keep as proposed, no note
  }
  return out;
};

/**
 * B6: deterministic topical gate for critique LINK CANDIDATES — pure, exported for
 * direct testing. The gate SURFACE is statement + mechanism + PREDICTIONS (widened
 * 2026-08-22 from statement+mechanism only): B1 measured 11 hypotheses with just 1+1
 * explicit critique bindings, and predictions are the hypothesis's concrete testable
 * content — a claim sharing vocabulary with a prediction is a legitimate link candidate
 * even when the claim's vocabulary does not overlap statement/mechanism. The
 * vocabulary-overlap THRESHOLD is unchanged (D-018 rule: containment >= 0.25 or >= 4
 * shared content tokens), so a claim with NO content vocabulary overlap anywhere in
 * statement+mechanism+predictions still fails the gate — widening the surface cannot
 * weaken it for claims with no overlap at all.
 */
export const gateCritiqueLinks = (
  hyp: Pick<Hypothesis, 'statement' | 'mechanism' | 'predictions'>,
  claims: readonly Pick<ScientificClaim, 'id' | 'text'>[],
  ids: readonly string[],
): { kept: string[]; dropped: string[] } => {
  const hypTokens = contentTokens(`${hyp.statement} ${hyp.mechanism} ${hyp.predictions.join(' ')}`);
  const textById = new Map(claims.map((c) => [c.id, c.text] as const));
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const id of ids) {
    const text = textById.get(id);
    const passes = text !== undefined && topicalOverlap(contentTokens(text), hypTokens).passes;
    if (passes) kept.push(id);
    else dropped.push(id);
  }
  return { kept, dropped };
};

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
    // Shared across the bounded-concurrency callbacks below (B3-critique P0-1:
    // a per-callback counter reset to 0 on every hypothesis and the stage
    // record stuck at done=1 while notes kept firing).
    let hypothesesDone = 0;

    // Per-hypothesis work is independent (all inputs read from the store — no
    // cross-iteration coupling), so bounded overlap (WP4) cuts wall-clock on this
    // model-bound stage; per-item warnings/results are collected locally and merged
    // in INPUT order below, keeping stage aggregates deterministic.
    const outs = await mapBounded(targets, STAGE_CONCURRENCY, async (hyp): Promise<{ warnings: string[]; result: string; relations: number }> => {
      assertNotCancelled(ctx, 'critique_falsify');
      const warnings: string[] = [];
      let relations = 0;
      // Read once per hypothesis and reused for the prompt projection, the claim lookup
      // map and the B6 density/contrastivity signals below (no claims are written during
      // this stage, so a single snapshot is authoritative for the whole callback).
      const runClaims = ctx.store.listObjects('claim', runId);
      const res = await callStructured<z.infer<typeof FalsifyOut>>(ctx, {
        stage: 'critique_falsify',
        purpose: `falsification-spec:${hyp.id}`,
        systemPrompt:
          'You are an adversarial reviewer. Produce a COMPLETE falsification specification for the hypothesis: ' +
          'what observable to measure, how, the expected relation, and a DECIDABLE decision rule (a comparison, ' +
          'ratio, threshold, or explicit if-then criterion) that separates support from weakening from refutation. ' +
          '"Could be tested in future work" without a decision rule is invalid. Self-assess the provenance of every ' +
          'quantitative threshold in the decision rule. Set decisionRuleProvenance to exactly one of: ' +
          '"evidence-derived" (every quantitative threshold is derived from the provided claims), ' +
          '"community-standard" (customary values in the field\'s literature), "model-stipulated" (you chose the ' +
          'numbers yourself without evidence support), or "mixed" (some thresholds have a real source and others are ' +
          'stipulated — never dress invented numbers as sourced). Also critique each assumption and link real counter-evidence and supporting ' +
          'claims by their ids (only ids from the provided claims list). RELATION LABEL DISCIPLINE, anchored (strict): ' +
          '"supports" ONLY when the claim\'s finding is direct evidence for THIS hypothesis\'s core mechanism or prediction ' +
          'about the same subject — topical kinship or shared vocabulary alone is NOT support; ' +
          '"contradicts" ONLY when the claim asserts a finding incompatible with the hypothesis\'s core prediction about ' +
          'the same subject AND the same quantity/relationship; "weakens" when the claim reduces confidence without ' +
          'direct incompatibility (uncontrolled confounder, weaker effect than the mechanism requires); "qualifies" when ' +
          'the claim bounds the conditions under which the hypothesis applies. NULL-SIDE DIRECTION: first read what the ' +
          'hypothesis PREDICTS — an effect, or an ABSENCE (no effect / no correlation / no transfer). A finding of no ' +
          'effect SUPPORTS a no-effect hypothesis and CONTRADICTS an effect hypothesis; never label by the claim\'s ' +
          'valence alone. A claim stretched from a different ' +
          'subject, measure, or mechanistic layer must not be linked at all. For claims that bear NO real relation ' +
          'to this hypothesis, do NOT link them — list their ids in consideredClaimIds instead: the claims you ' +
          'examined and rejected as unrelated (a claim absent from both the links and consideredClaimIds reads as ' +
          'never evaluated). When in doubt choose the weaker label or ' +
          'do not link — never invent a conflict, and never pad the evidence base with topic-neighbors that do not ' +
          'actually bear on the mechanism. For EVERY linked claim give a specific ' +
          'linkReason of at least 20 characters naming the exact tension or support (generic template phrases are ' +
          'invalid). State genuine uncertainties.',
        payload: {
          hypothesis: {
            id: hyp.id,
            statement: hyp.statement,
            mechanism: hyp.mechanism,
            assumptions: hyp.assumptions.map((a) => a.statement),
            predictions: hyp.predictions,
            noveltyLabel: hyp.noveltyLabel,
          },
          availableClaims: runClaims.map((c) => ({ id: c.id, text: c.text, quote: c.locators[0]?.quote, bindingStatus: c.bindingStatus, ...(c.gradeCertainty !== undefined ? { gradeCertainty: c.gradeCertainty } : {}) })),
        },
        schema: FalsifyOut,
        // Lane-06: spec authoring is a structured judgment — pinned so provider
        // defaults cannot vary falsification-spec decoding across runs.
        temperature: 0.2,
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
      // Counter links carry explicit per-link labels (contradicts/weakens/qualifies);
      // duplicate claimIds keep the first link; invalid refs are dropped visibly.
      const seenCounter = new Set<string>();
      const validCounter = out.counterLinks.filter((l) => {
        if (!existingClaimIds.has(l.claimId) || seenCounter.has(l.claimId)) return false;
        seenCounter.add(l.claimId);
        return true;
      });
      const droppedCounterRefs = [...new Set(out.counterLinks.filter((l) => !existingClaimIds.has(l.claimId)).map((l) => l.claimId))];
      const supportingRefs = partitionClaimRefs(out.supportingClaimIds, existingClaimIds);
      const droppedRefs = [...droppedCounterRefs, ...supportingRefs.invalid];
      if (droppedRefs.length > 0) {
        warnings.push(`${hyp.id}: dropped ${droppedRefs.length} non-existent claim reference(s) (${droppedRefs.join(', ')})`);
      }
      const claimById = new Map(runClaims.map((c) => [c.id, c] as const));
      // ---- deterministic topical gate on critique links (2026-08-22 relation-precision spike) ----
      // Blind re-judging measured contradicts-label precision at 1/8 exact (2 adjacent); the
      // worst offenders were topically DISTANT claims the model linked as counter evidence.
      // Same vocabulary-overlap rule as the D-018 claim-claim prefilter: a claim that shares
      // no content vocabulary with the hypothesis cannot honestly weaken/contradict/support it.
      // B6 (2026-08-22): the gate SURFACE now includes hypothesis predictions (see
      // gateCritiqueLinks) — the threshold is unchanged.
      const gateLinks = (ids: readonly string[]): { kept: string[]; dropped: string[] } =>
        gateCritiqueLinks(hyp, runClaims, ids);
      const gatedCounter = gateLinks(validCounter.map((l) => l.claimId));
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
      const counterLinkByClaim = new Map(validCounter.map((l) => [l.claimId, l] as const));
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
      const mkRelation = (
        relation: 'contradicts' | 'weakens' | 'qualifies' | 'supports',
        claimId: string,
        proposalFamily: 'counter' | 'supporting',
        auditNote?: string,
      ) => {
        // SCIENCE lane: deterministic strength from the linked claim's measured
        // properties (gradeCertainty + verified binding + quantitativeness) —
        // the same single mapping every other write point uses.
        const claim = claimById.get(claimId);
        const strength = relationStrength({
          gradeCertainty: claim?.gradeCertainty,
          bindingVerified: claim?.bindingStatus === 'verified',
          quantitative: claim !== undefined && hasExplicitQuantity(claim.text),
        });
        return EvidenceRelation.parse({
          id: newId('ev'),
          runId,
          relation,
          claimId,
          targetHypothesisId: hyp.id,
          // rationale keyed to the PROPOSAL family so the substantive proposer argument
          // survives even when the audit relabels the link across polarity
          rationale: linkRationale(claimId, proposalFamily),
          strength: strength.strength,
          uncertainties: [
            ...(auditNote !== undefined ? [auditNote] : []),
            strength.derivation,
          ],
          createdAt: now,
        });
      };

      // ---- W5-F5: independent adversarial audit of the proposed links ----
      // Blind re-judging measured only 11/18 supports links surviving exact agreement
      // (relation-blind-agreement north-star 0.61). A second, differently-framed
      // examination (auditor vs proposer) relabels or drops links that do not
      // survive. Audit-call failure keeps the already-gated original links with a
      // visible warning — the audit is enrichment, never a silent drop path.
      const proposedLinks: { claimId: string; relation: CritiqueRelation; linkReason: string }[] = [
        ...gatedCounter.kept.map((id) => ({
          claimId: id,
          relation: (counterLinkByClaim.get(id)?.relation ?? 'weakens') as CritiqueRelation,
          linkReason: linkRationale(id, 'counter'),
        })),
        ...gatedSupporting.kept.map((id) => ({
          claimId: id,
          relation: 'supports' as const,
          linkReason: linkRationale(id, 'supporting'),
        })),
      ];
      let audit = new Map<string, LinkAuditDecision>();
      /** Ids the audit never verdicted — their persisted relations carry the disclosure (round-2 P1-C: stage summaries are invisible to workbench researchers). */
      const unauditedIds = new Set<string>();
      if (proposedLinks.length > 0) {
        try {
          const verifyRes = await callStructured<z.infer<typeof LinkVerifyOut>>(ctx, {
            stage: 'critique_falsify',
            purpose: `link-verification:${hyp.id}`,
            systemPrompt:
              'You are a skeptical auditor of evidence links proposed by a different reviewer. For EACH proposed ' +
              'claim->hypothesis link work in exactly three anchored steps, and write all three into your verdict: ' +
              '(1) hypPrediction — state the hypothesis\'s testable predicted direction in your own words, INCLUDING ' +
              'whether it predicts an effect, an ABSENCE of effect, or a moderator/boundary; (2) claimFinding — state ' +
              'the finding direction the claim itself reports; (3) only then decide exactly one of: "confirm" (the ' +
              'proposed relation is the correct relation between those two directions), "relabel" (a different ' +
              'relation fits; supply it), or "drop" (no defensible relation). ' +
              'DIRECTION DISCIPLINE (null-side hypotheses): a hypothesis that predicts NO effect / no correlation / ' +
              'no transfer is SUPPORTED by findings of no effect — labelling such a finding contradicts or weakens ' +
              'is backwards. Symmetrically, an effect-predicting hypothesis is contradicted by no-effect findings. ' +
              'Anchored discipline: a claim SUPPORTS only if its finding direction matches the hypothesis\'s predicted ' +
              'direction as direct evidence for THIS hypothesis\'s core mechanism or prediction on the same subject — ' +
              'topical kinship is NOT support. A claim CONTRADICTS only if its finding direction is opposite to the ' +
              'predicted direction about the same subject and the same quantity/relationship. A claim WEAKENS if it ' +
              'reduces confidence without direct opposition. A claim QUALIFIES if it bounds the conditions under which ' +
              'the hypothesis applies. A link stretched from a different subject, measure, or mechanistic layer must ' +
              'be DROPped. Be strict: a wrong support or contradiction is worse than an honest drop; do not confirm ' +
              'out of politeness. Every reason needs at least 20 characters naming the exact direction relationship.',
            payload: {
              hypothesis: {
                id: hyp.id,
                statement: hyp.statement,
                mechanism: hyp.mechanism,
                predictions: hyp.predictions,
              },
              expectedRelation: out.expectedRelation,
              proposedLinks: proposedLinks.map((l) => ({
                claimId: l.claimId,
                proposedRelation: l.relation,
                claimText: claimById.get(l.claimId)?.text ?? '(claim text unavailable)',
                proposedReason: l.linkReason,
              })),
            },
            schema: LinkVerifyOut,
            temperature: 0,
          });
          audit = applyLinkAudit(proposedLinks, verifyRes.data.verdicts);
          // S3 (adversarial review 2026-08-29): "silence is not rejection" lets a
          // lazy audit verdict ONE easy link and wave the rest through. Coverage is
          // now checked deterministically and under-coverage is disclosed — the
          // unaudited links keep the enrichment semantics, but never silently.
          const auditedIds = new Set(verifyRes.data.verdicts.map((v) => v.claimId));
          const unaudited = proposedLinks.filter((l) => !auditedIds.has(l.claimId));
          if (unaudited.length > 0) {
            for (const l of unaudited) unauditedIds.add(l.claimId);
            warnings.push(
              `${hyp.id}: link audit covered ${proposedLinks.length - unaudited.length}/${proposedLinks.length} proposed link(s) — ${unaudited.length} kept as proposed WITHOUT audit review (${unaudited.map((l) => l.claimId).join(', ')})`,
            );
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(`${hyp.id}: link audit failed — original gated links kept unchanged (${msg.slice(0, 120)})`);
          // The audit CALL failed: every link persists un-audited — stamp them all
          // so the disclosure rides on the relations, not just this summary line.
          for (const l of proposedLinks) unauditedIds.add(l.claimId);
        }
      }
      const auditDropped = [...audit.entries()].filter(([, d]) => d.dropped).map(([id]) => id);
      if (auditDropped.length > 0) {
        warnings.push(`${hyp.id}: link audit dropped ${auditDropped.length} link(s) (${auditDropped.join(', ')})`);
      }
      // Persist by FINAL decision polarity (audit P1 fix): a relabelled link must land in
      // the hypothesis id-array matching the label the persisted relation carries — the
      // rank judge and renderers read both, and a supports-relation listed as counter
      // evidence desynchronizes the persisted object graph.
      const finalCounter: string[] = [];
      const finalSupporting: string[] = [];
      const finalRelationOf = (id: string, proposed: CritiqueRelation): CritiqueRelation =>
        audit.get(id)?.relation ?? proposed;
      // proposal family = where the link was PROPOSED, independent of the audited label
      const proposalFamilyOf = new Map<string, 'counter' | 'supporting'>([
        ...gatedCounter.kept.map((id) => [id, 'counter'] as const),
        ...gatedSupporting.kept.map((id) => [id, 'supporting'] as const),
      ]);
      for (const id of gatedCounter.kept) {
        if (audit.get(id)?.dropped) continue;
        const proposed = (counterLinkByClaim.get(id)?.relation ?? 'weakens') as CritiqueRelation;
        (finalRelationOf(id, proposed) === 'supports' ? finalSupporting : finalCounter).push(id);
      }
      for (const id of gatedSupporting.kept) {
        if (audit.get(id)?.dropped) continue;
        (finalRelationOf(id, 'supports') === 'supports' ? finalSupporting : finalCounter).push(id);
      }
      for (const id of finalCounter) {
        const decision = audit.get(id);
        // schema .catch already defaults unparseable labels to 'weakens'; the ?? guard
        // keeps 'contradicts' from ever appearing without an explicit model assertion.
        // Rationale keyed to the PROPOSAL family (audit P2 fix): the proposer's
        // linkReason is the substantive argument; a cross-polarity relabel is disclosed
        // in uncertainties via the audit note, never silently re-worded.
        ctx.store.putObject(
          'evidence_relation',
          mkRelation(decision?.relation ?? counterLinkByClaim.get(id)?.relation ?? 'weakens', id, proposalFamilyOf.get(id) ?? 'counter', decision?.note ?? (unauditedIds.has(id) ? 'kept as proposed — NOT covered by the link audit (coverage miss)' : undefined)),
        );
        relations += 1;
      }
      for (const id of finalSupporting) {
        const decision = audit.get(id);
        ctx.store.putObject('evidence_relation', mkRelation(decision?.relation ?? 'supports', id, proposalFamilyOf.get(id) ?? 'supporting', decision?.note ?? (unauditedIds.has(id) ? 'kept as proposed — NOT covered by the link audit (coverage miss)' : undefined)));
        relations += 1;
      }

      // ---- B6 binding-density observability (EMR-ACH contrastivity) ----
      // Contrastivity: evidence bound to zero compared hypotheses has zero diagnostic
      // value in the ACH matrix; symmetrically, a hypothesis bound to zero evidence is
      // invisible to it. The density line makes per-hypothesis binding coverage visible
      // without persisting anything new; considered-nolink counts only run-known ids the
      // model explicitly judged as no-relation and that did not end up linked.
      const finalLinkedIds = new Set([...finalCounter, ...finalSupporting]);
      const consideredNolink = new Set(
        out.consideredClaimIds.filter((id) => existingClaimIds.has(id) && !finalLinkedIds.has(id)),
      ).size;
      ctx.log(
        `critique bindings: hyp=${hyp.id} support=${finalSupporting.length} counter=${finalCounter.length} considered-nolink=${consideredNolink} of ${runClaims.length}`,
      );
      // Zero links on both sides while a real verified evidence base exists is a density
      // anomaly worth surfacing in the stage summary (visible, never silently green).
      const verifiedCount = runClaims.filter((c) => c.bindingStatus === 'verified').length;
      if (finalSupporting.length === 0 && finalCounter.length === 0 && verifiedCount >= 3) {
        warnings.push(
          `${hyp.id}: 0 supporting and 0 counter critique links while ${verifiedCount} verified claim(s) exist in the run — zero evidence binding (ACH contrastivity: no claim can discriminate this hypothesis)`,
        );
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
        supportingClaimIds: finalSupporting,
        counterClaimIds: finalCounter,
      });
      ctx.store.putObject('hypothesis', updated);

      // B3 milestone: hypotheses materialize one by one in the workbench feed
      // instead of appearing in silence after a minutes-long stage.
      hypothesesDone += 1;
      ctx.progress?.(hypothesesDone, targets.length, {
        reason: 'hypothesis_critiqued',
        detail: {
          hypothesisId: hyp.id,
          statement: hyp.statement.length > 90 ? `${hyp.statement.slice(0, 90)}…` : hyp.statement,
          supportingLinks: finalSupporting.length,
          counterLinks: finalCounter.length,
          testability,
        },
      });

      return {
        warnings,
        relations,
        result: completeness.passed
          ? `${hyp.id}: falsification spec passed deterministic completeness (testability=${testability}; counter links ${finalCounter.length}${gatedCounter.dropped.length > 0 ? ` (${gatedCounter.dropped.length} dropped by topical gate)` : ''}, supporting links ${finalSupporting.length}${gatedSupporting.dropped.length > 0 ? ` (${gatedSupporting.dropped.length} dropped by topical gate)` : ''}${auditDropped.length > 0 ? `, ${auditDropped.length} dropped by link audit` : ''})`
          : `${hyp.id}: falsification spec REJECTED by deterministic completeness — missing: ${completeness.missing.join('; ')}; testability=untestable_currently`,
      };
    });
    for (const o of outs) {
      warnings.push(...o.warnings);
      results.push(o.result);
      relationsCreated += o.relations;
    }

    const parts = [
      `critiqued ${targets.length} representative hypothesis/hypotheses; ${relationsCreated} critique-linked evidence relation(s) created.`,
      ...results,
    ];
    if (warnings.length > 0) parts.push(`warnings: ${warnings.join(' | ')}`);
    return { kind: 'done', summary: parts.join(' ') };
  },
};
