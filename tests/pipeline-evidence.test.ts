import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CorpusSnapshot,
  ProvenanceReceipt,
  RELATION_POLARITY,
  ResearchRun,
  SourceDocument,
  newId,
} from '../src/domain/index.js';
import type { ResearchQuestion } from '../src/domain/index.js';
import type { SourceFamily } from '../src/domain/source.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { SourceAdapter } from '../src/shared/ports.js';
import type { StageContext } from '../src/pipeline/types.js';
import { buildEvidenceStage, MAX_CLAIMS_PER_SOURCE } from '../src/pipeline/stages/evidence.js';
import {
  ALIGNMENT_JACCARD_THRESHOLD,
  checkQuoteAlignment,
  normalizeForAlignment,
} from '../src/pipeline/stages/align.js';

/**
 * *** TEST FIXTURES ONLY *** — synthetic abstracts and scripted TestStubProvider outputs.
 * No network, no real provider, no real API keys. The stage MUST fail closed: a quote
 * that is not grounded in the retrieved abstract can never become a verified claim.
 */

const NOW = '2026-08-21T00:00:00.000Z';
const FIXTURE_HASH = 'a'.repeat(64);

const ABSTRACT_A =
  'CRISPR base editing of the maize DREB gene increases kernel yield under drought conditions. ' +
  'Across three field seasons the edited lines gained twelve percent yield on average relative to controls. ' +
  'The gain varied by genotype and by season, and no off-target effects were detected in the sequenced lines.';

const Q_VERBATIM = [
  'the edited lines gained twelve percent yield on average relative to controls',
  'increases kernel yield under drought conditions',
  'The gain varied by genotype and by season',
  'no off-target effects were detected',
] as const;

/** One word of one abstract sentence replaced (Across -> Over): 16 tokens, 15 shared → window jaccard 15/17 ≈ 0.88. */
const Q_FUZZY =
  'Over three field seasons the edited lines gained twelve percent yield on average relative to controls';

/** Real paraphrases — far below any 0.8 bar. */
const Q_PARAPHRASE_SUPPORTS = 'gene edited corn plants produced much more grain during dry weather experiments';
const Q_PARAPHRASE_CONTRADICTS = 'edited plants showed identical harvest outcomes compared with wild types';
const Q_PARAPHRASE_NEUTRAL = 'benefits fluctuate across genetic backgrounds and years';

// ---------------------------------------------------------------------------
// harness (temp-dir db + artifacts, scripted provider, orchestrator-shaped ctx)
// ---------------------------------------------------------------------------

const harnessClosers: Array<() => void> = [];
afterEach(() => {
  for (const close of harnessClosers.splice(0)) close();
});

const throwingSourceFor = (_family: SourceFamily): SourceAdapter => {
  throw new Error('build_evidence must not touch source adapters');
};

interface Bench {
  ctx: StageContext;
  store: Store;
  run: ResearchRun;
  /** The harness db handle — tests that exercise run-row writes (the honesty-gate tag) need it. */
  db: Db;
}

/**
 * Gap-assessment trailing step: build_evidence now ends with one evidence-gap
 * assessment call whenever verified claims are below the seek threshold; bench-built
 * stubs therefore always script it last (adequate evidence -> no follow-up round).
 */
const gapAdequateStep = (): StubStep => ({
  rawOutput: JSON.stringify({ enoughEvidence: true, gapDescription: 'fixture: adequate for the test scenario', queries: [] }),
});

const bench = (
  scriptedSteps: StubStep[],
  cancelled: () => boolean = () => false,
  extra: { fetchFullText?: StageContext['fetchFullText'] } = {},
): Bench => {
  const steps = [...scriptedSteps, gapAdequateStep()];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-evidence-'));
  const db: Db = openDb(path.join(dir, 'run.db'));
  const store = new Store(db);
  const question: ResearchQuestion = {
    id: newId('q'),
    text: 'Does CRISPR base editing improve drought tolerance in maize?',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'plant genetics', phenomena: ['drought tolerance'], inScope: [], outOfScope: [] },
    constraints: {
      assumptions: [],
      dataConstraints: [],
      resourceConstraints: [],
      ethicalConstraints: [],
      methodologicalConstraints: [],
    },
    createdAt: NOW,
  };
  // NOTE: Store.createRun is currently broken (appendEvent parses seq: 0 against a
  // positive-int schema and throws) — a pre-existing store.ts bug this suite cannot
  // fix (read-only contract). The stage handler only touches the objects table, so we
  // assemble the run in memory and persist the question directly.
  store.putObject('question', question);
  const run: ResearchRun = ResearchRun.parse({
    id: newId('run'),
    questionId: question.id,
    status: 'running',
    currentStage: 'build_evidence',
    stages: [],
    createdAt: NOW,
    updatedAt: NOW,
    tags: [],
  });
  const ctx: StageContext = {
    run,
    store,
    artifacts: openArtifactStore(path.join(dir, 'artifacts')),
    provider: createTestStubProvider(steps),
    sourceFor: throwingSourceFor,
    ...(extra.fetchFullText !== undefined ? { fetchFullText: extra.fetchFullText } : {}),
    recordReceipt: (partial) => {
      const receipt = ProvenanceReceipt.parse({
        ...partial,
        id: newId('rcp'),
        runId: run.id,
        at: partial.at ?? new Date().toISOString(),
      });
      store.putObject('receipt', receipt);
    },
    cancelled,
    log: () => {},
  };
  harnessClosers.push(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { ctx, store, run, db };
};

const mkSource = (runId: string, id: string, extra: Record<string, unknown> = {}): SourceDocument =>
  SourceDocument.parse({
    id,
    runId,
    family: 'openalex',
    identifiers: [{ kind: 'openalex', value: `W-${id}` }],
    title: 'Fixture Study of Base Editing in Maize',
    publicationYear: 2026,
    authors: ['Alice Fixture'],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: FIXTURE_HASH,
    retrievedAt: NOW,
    parseStatus: 'ok',
    abstractText: ABSTRACT_A,
    ...extra,
  });

const corpusOf = (ctx: StageContext, docs: SourceDocument[]): CorpusSnapshot => {
  for (const doc of docs) ctx.store.putObject('source_document', doc);
  const snap = CorpusSnapshot.parse({
    id: newId('corp'),
    runId: ctx.run.id,
    queries: [{ purpose: 'discovery', text: 'fixture discovery query' }],
    documentIds: docs.map((d) => d.id),
    createdAt: NOW,
  });
  ctx.store.putObject('corpus_snapshot', snap);
  return snap;
};

const extractionStep = (claims: Array<Record<string, unknown>>): StubStep => ({
  rawOutput: JSON.stringify({ claims }),
});

const defined = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`TEST expected defined value: ${what}`);
  return v;
};

const claimByText = (store: Store, runId: string, text: string) =>
  defined(
    store.listObjects('claim', runId).find((c) => c.text === text),
    `claim with text "${text}"`,
  );

const relationForClaim = (store: Store, runId: string, claimId: string) =>
  defined(
    store.listObjects('evidence_relation', runId).find((r) => r.claimId === claimId),
    `relation for claim ${claimId}`,
  );

// ---------------------------------------------------------------------------
// align.ts — deterministic alignment gate (pure unit level)
// ---------------------------------------------------------------------------

describe('checkQuoteAlignment (deterministic gate)', () => {
  it('normalizes case, whitespace, typographic quotes and dashes', () => {
    expect(normalizeForAlignment('It\u2019s a \u201CTest\u201D\u2014string  with\u00A0spaces')).toBe(
      'it\'s a "test"-string with spaces',
    );
    expect(normalizeForAlignment('  Mixed\u00A0CASE   text  ')).toBe('mixed case text');
    expect(normalizeForAlignment('ＦＡＲ－Lab １２％')).toBe('far-lab 12%');
  });

  it('verbatim: normalized substring of the abstract passes', () => {
    const r = checkQuoteAlignment('kernel yield under drought', ABSTRACT_A);
    expect(r.verdict).toBe('verbatim');
    expect(r.jaccard).toBe(1);
  });

  it('verbatim survives curly quotes, em-dash and case drift', () => {
    const r = checkQuoteAlignment('No OFF\u2014target   effects were detected', ABSTRACT_A);
    expect(r.verdict).toBe('verbatim');
  });

  it('fuzzy: a two-word rewrite of one sentence clears the 0.8 window bar', () => {
    // fixture sanity: NOT a substring, but >= threshold against a same-length window
    expect(normalizeForAlignment(Q_FUZZY)).not.toBe('');
    expect(normalizeForAlignment(ABSTRACT_A).includes(normalizeForAlignment(Q_FUZZY))).toBe(false);
    const r = checkQuoteAlignment(Q_FUZZY, ABSTRACT_A);
    expect(r.verdict).toBe('fuzzy');
    expect(r.jaccard).toBeGreaterThanOrEqual(ALIGNMENT_JACCARD_THRESHOLD);
    expect(r.jaccard).toBeLessThan(1);
  });

  it('fuzzy: exactly 0.8 passes at the boundary (>=, not >)', () => {
    // 10-token abstract, 9-token quote: 8 shared + 1 foreign word, reordered (not a substring).
    // Best window [alpha..iota]: inter=8, union=10 → exactly 0.8.
    const abstract = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
    const quote = 'theta eta zeta epsilon delta gamma beta quux alpha';
    const r = checkQuoteAlignment(quote, abstract);
    expect(r.jaccard).toBeCloseTo(0.8, 12);
    expect(r.verdict).toBe('fuzzy');
  });

  it('CJK: a pure-Chinese near-verbatim quote survives punctuation drift', () => {
    const abstract =
      '在三季田间试验中，编辑株系的平均产量比对照高百分之十二。效应随基因型和季节变化。';
    const quote = '在三季田间试验中编辑株系的平均产量比对照高百分之十二';
    const r = checkQuoteAlignment(quote, abstract);
    expect(normalizeForAlignment(abstract).includes(normalizeForAlignment(quote))).toBe(false);
    expect(r).toEqual({ verdict: 'fuzzy', jaccard: 1 });
  });

  it('CJK: a one-character transcription error can clear the near-verbatim bar', () => {
    const abstract = '长期随访显示治疗组的复发风险显著低于对照组且未发现严重不良反应';
    const quote = '长期随访显示治疗组的复发风险明显低于对照组且未发现严重不良反应';
    const r = checkQuoteAlignment(quote, abstract);
    expect(r.verdict).toBe('fuzzy');
    expect(r.jaccard).toBeGreaterThanOrEqual(ALIGNMENT_JACCARD_THRESHOLD);
    expect(r.jaccard).toBeLessThan(1);
  });

  it('CJK: an unrelated pure-Chinese claim still fails closed', () => {
    const abstract = '在三季田间试验中，编辑株系的平均产量比对照高百分之十二。';
    const r = checkQuoteAlignment('该药物显著降低肺癌患者的五年死亡率', abstract);
    expect(r.verdict).toBe('unaligned');
    expect(r.jaccard).toBeLessThan(ALIGNMENT_JACCARD_THRESHOLD);
  });

  it('CJK: reordering the same characters does not masquerade as near-verbatim', () => {
    const abstract = '治疗组长期随访显示复发风险显著下降';
    const reordered = [...abstract].reverse().join('');
    const r = checkQuoteAlignment(reordered, abstract);
    expect(r.verdict).toBe('unaligned');
    expect(r.jaccard).toBeLessThan(ALIGNMENT_JACCARD_THRESHOLD);
  });

  it('unaligned: a real paraphrase fails well below the bar', () => {
    for (const q of [Q_PARAPHRASE_SUPPORTS, Q_PARAPHRASE_CONTRADICTS, Q_PARAPHRASE_NEUTRAL]) {
      const r = checkQuoteAlignment(q, ABSTRACT_A);
      expect(r.verdict).toBe('unaligned');
      expect(r.jaccard).toBeLessThan(ALIGNMENT_JACCARD_THRESHOLD);
    }
  });

  it('unaligned: empty or whitespace-only quote never aligns', () => {
    expect(checkQuoteAlignment('   ', ABSTRACT_A).verdict).toBe('unaligned');
    expect(checkQuoteAlignment('', ABSTRACT_A).jaccard).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// build_evidence stage (scripted provider, temp-dir store)
// ---------------------------------------------------------------------------

describe('build_evidence stage', () => {
  it('applicable is false without a corpus snapshot', async () => {
    const { ctx } = bench([]);
    await expect(buildEvidenceStage.applicable(ctx)).resolves.toBe(false);
  });

  it('applicable is false when no source has an abstract or verification failed', async () => {
    const { ctx } = bench([]);
    const noAbstract = mkSource(ctx.run.id, newId('src'), {
      contentDepth: 'metadata_only',
      abstractText: undefined,
    });
    const unresolved = mkSource(ctx.run.id, newId('src'), {
      verification: { method: 'crossref_doi', resolved: false, detail: 'fixture: DOI missing', checkedAt: NOW },
    });
    corpusOf(ctx, [noAbstract, unresolved]);
    await expect(buildEvidenceStage.applicable(ctx)).resolves.toBe(false);
  });

  it('applicable is true while a usable source has no claims, false once claimed', async () => {
    const { ctx, store } = bench([
      extractionStep([{ text: 'Base editing raises maize yield under drought.', quote: Q_VERBATIM[0], stance: 'supports' }]),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);
    await expect(buildEvidenceStage.applicable(ctx)).resolves.toBe(true);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    expect(store.listObjects('claim', ctx.run.id)).toHaveLength(1);
    await expect(buildEvidenceStage.applicable(ctx)).resolves.toBe(false);
  });

  it('a zero-claim extraction leaves the source unprocessed (spec: no claim = unprocessed)', async () => {
    const { ctx, store } = bench([extractionStep([])]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);
    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') expect(outcome.summary).toContain('claims=0');
    expect(store.listObjects('claim', ctx.run.id)).toHaveLength(0);
    await expect(buildEvidenceStage.applicable(ctx)).resolves.toBe(true);
  });

  it('verbatim quote → verified claim, mapped supports relation, model receipt persisted', async () => {
    const { ctx, store } = bench([
      extractionStep([
        {
          text: 'Base editing raises maize yield under drought.',
          quote: Q_VERBATIM[0],
          stance: 'supports',
          note: 'single study, three seasons only',
        },
      ]),
    ]);
    const src = mkSource(ctx.run.id, newId('src'));
    corpusOf(ctx, [src]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('claims=1');
      expect(outcome.summary).toContain('verified=1');
      expect(outcome.summary).toContain('supports=1');
    }

    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(1);
    const claim = defined(claims[0], 'claim');
    expect(claim.bindingStatus).toBe('verified');
    expect(claim.alignmentChecked).toBe(true);
    expect(claim.locators).toHaveLength(1);
    expect(claim.locators[0]?.sourceDocumentId).toBe(src.id);
    expect(claim.locators[0]?.quote).toBe(Q_VERBATIM[0]);
    expect(claim.uncertainties).toEqual(['single study, three seasons only']);
    expect(claim.extractionModelRef).toBe('test-stub/test-stub');

    const relations = store.listObjects('evidence_relation', ctx.run.id);
    expect(relations).toHaveLength(1);
    const rel = defined(relations[0], 'relation');
    expect(rel.relation).toBe('supports');
    expect(rel.claimId).toBe(claim.id);
    expect(rel.targetHypothesisId).toBeUndefined();
    // SCIENCE lane: deterministic strength — verified + non-quantitative text grades
    // moderate (imprecision domain) -> 'weak'; derivation note is auditable.
    expect(rel.strength).toBe('weak');
    expect(rel.uncertainties.some((u) => u.includes('strength-v1'))).toBe(true);
    expect(RELATION_POLARITY[rel.relation]).toBe('supporting');

    const receipts = store.listObjects('receipt', ctx.run.id);
    // 2 model calls now: claim-extraction + the trailing evidence-gap assessment (W5 §30 addition).
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.kind).toBe('model_call');
    expect(receipts[0]?.stage).toBe('build_evidence');
    expect(receipts[1]?.modelCall?.usage).toBeDefined();
  });

  it('SCIENCE lane: quote carrying a risk ratio gets the E-value confounding disclosure (eValue activated)', async () => {
    // The VanderWeele-Ding closed form existed with ZERO production callers; this
    // locks the wiring: RR in the verbatim quote -> E-value note on the claim.
    const ABSTRACT_RR =
      'A cohort study of 4,000 workers found the exposure carried a risk ratio of 2.5 for the respiratory endpoint. ' +
      'Adjustment for smoking attenuated the estimate only marginally.';
    const { ctx, store } = bench([
      extractionStep([
        {
          text: 'Exposure doubles respiratory risk (RR 2.5).',
          quote: 'the exposure carried a risk ratio of 2.5 for the respiratory endpoint',
          stance: 'supports',
        },
      ]),
    ]);
    const src = mkSource(ctx.run.id, newId('src'), { abstractText: ABSTRACT_RR });
    corpusOf(ctx, [src]);
    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(1);
    const claim = defined(claims[0], 'claim');
    expect(claim.bindingStatus).toBe('verified');
    const eNote = claim.uncertainties.find((u) => u.includes('E-value'));
    expect(eNote).toBeDefined();
    expect(eNote).toContain('RR');
  });

  it('D-018: cross-paper claim pairs with topical overlap get adjudicated claim-claim relations (targetClaimId)', async () => {
    const ABSTRACT_B =
      'A three-year trial of CRISPR base editing of the maize DREB gene does not increase kernel yield under drought conditions. ' +
      'Edited lines matched control yields in every season, and the initial report likely reflected site-specific conditions.';
    const { ctx, store } = bench([
      extractionStep([
        {
          text: 'Base editing of the maize DREB gene increases kernel yield under drought.',
          quote: Q_VERBATIM[1],
          stance: 'supports',
        },
      ]),
      extractionStep([
        {
          text: 'Base editing of the maize DREB gene does not increase kernel yield under drought.',
          quote: 'base editing of the maize DREB gene does not increase kernel yield under drought conditions',
          stance: 'contradicts',
        },
      ]),
      // verified=2 < GAP_SEEK_MIN_VERIFIED -> gap assessment runs; script "adequate"
      { rawOutput: JSON.stringify({ enoughEvidence: true, gapDescription: 'fixture: evidence adequate for cross-relation testing', queries: [] }) },
      // D-018 adjudication: the one prefiltered pair is a contradiction
      {
        rawOutput: JSON.stringify({
          verdicts: [
            {
              pairId: 0,
              verdict: 'contradicts',
              sharedSubject: 'effect of maize DREB base editing on kernel yield under drought',
              conflictPoint: 'direction of the yield effect',
              confidence: 'moderate',
            },
          ],
        }),
      },
    ]);
    const docA = mkSource(ctx.run.id, newId('src'));
    const docB = mkSource(ctx.run.id, newId('src'), { abstractText: ABSTRACT_B });
    corpusOf(ctx, [docA, docB]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('claims=2');
      expect(outcome.summary).toContain('cross_relations=1 persisted (0 not_comparable) of 1 prefiltered pairs');
    }

    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(2);
    const relations = store.listObjects('evidence_relation', ctx.run.id);
    expect(relations).toHaveLength(3); // 2 per-claim stance relations + 1 cross-paper claim-claim relation
    const cross = defined(
      relations.find((r) => r.targetClaimId !== undefined),
      'cross relation',
    );
    expect(cross.relation).toBe('contradicts');
    expect(cross.claimId).toBeDefined();
    expect(cross.targetClaimId).toBeDefined();
    expect(cross.claimId).not.toBe(cross.targetClaimId);
    // both endpoints are real verified claims from different documents
    const a = claims.find((c) => c.id === cross.claimId);
    const b = claims.find((c) => c.id === cross.targetClaimId);
    expect(a?.locators[0]?.sourceDocumentId).not.toBe(b?.locators[0]?.sourceDocumentId);
    expect(cross.rationale).toContain('claim-claim contradicts');
    expect(cross.rationale).toContain('direction of the yield effect');

    // SCIENCE lane (2026-08-24): the contradiction loop now CLOSES —
    // (a) cross-relation strength derives deterministically (verified + quantitative
    //     endpoints -> moderate), and (b) both endpoint claims' certainty is rescored
    //     one step down (high -> moderate) with an auditable uncertainty note.
    expect(cross.strength).toBe('moderate');
    expect(cross.uncertainties.some((u) => u.includes('weaker endpoint'))).toBe(true);
    expect(outcome.kind === 'done' && outcome.summary.includes('2 claim(s) certainty-downgraded by contradiction rescore')).toBe(true);
    for (const c of [a, b]) {
      expect(c?.gradeCertainty).toBe('moderate');
      expect(c?.uncertainties.some((u) => u.includes('inconsistency rescore'))).toBe(true);
    }

    // 4 model calls: 2 extractions + gap assessment + cross adjudication
    const modelCalls = store.listObjects('receipt', ctx.run.id).filter((r) => r.kind === 'model_call');
    expect(modelCalls).toHaveLength(4);

    // idempotent: a re-execution (new pending doc) does not re-adjudicate existing pairs
    const docC = mkSource(ctx.run.id, newId('src'), {
      abstractText: ABSTRACT_B,
      title: 'Fixture duplicate-abstract study',
    });
    const snap = store.listObjects('corpus_snapshot', ctx.run.id)[0]!;
    ctx.store.putObject('corpus_snapshot', { ...snap, documentIds: [...snap.documentIds, docC.id] });
    ctx.store.putObject('source_document', docC);
    const rerun = await buildEvidenceStage.execute({
      ...ctx,
      provider: createTestStubProvider([
        extractionStep([
          {
            text: 'Base editing of the maize DREB gene does not increase kernel yield under drought.',
            quote: 'base editing of the maize DREB gene does not increase kernel yield under drought conditions',
            stance: 'contradicts',
          },
        ]),
        gapAdequateStep(),
      ]),
    });
    expect(rerun.kind).toBe('done');
    if (rerun.kind === 'done') expect(rerun.summary).toContain('cross_relations=already present (1)');
    expect(store.listObjects('evidence_relation', ctx.run.id)).toHaveLength(4); // +1 stance relation from docC only
  });

  it('direction anchor: opposing-direction pair gets a deterministic counter disclosure even when the adjudicator abstains', async () => {
    // The measured held-out gap (2026-09-05): counter-evidence hit rate <= 3/7
    // because the strict cross adjudicator defaults to not_comparable on
    // non-numeric opposition. The lexical anchor (Lane-06 sibling) guarantees
    // the counter signal is VISIBLE on the claims whatever the verdict.
    const ABSTRACT_DOWN =
      'A three-year trial of CRISPR base editing of the maize DREB gene reduces kernel yield under drought conditions. ' +
      'Edited lines lost eight percent yield on average relative to controls across all seasons.';
    const { ctx, store } = bench([
      extractionStep([
        {
          text: 'Base editing of the maize DREB gene increases kernel yield under drought.',
          quote: Q_VERBATIM[1],
          stance: 'supports',
        },
      ]),
      extractionStep([
        {
          text: 'Base editing of the maize DREB gene reduces kernel yield under drought.',
          quote: 'reduces kernel yield under drought conditions',
          stance: 'contradicts',
        },
      ]),
      { rawOutput: JSON.stringify({ enoughEvidence: true, gapDescription: 'fixture: adequate for direction-anchor testing', queries: [] }) },
      // the adjudicator ABSTAINS — the strict path the held-out runs exercised
      {
        rawOutput: JSON.stringify({
          verdicts: [
            {
              pairId: 0,
              verdict: 'not_comparable',
              sharedSubject: 'effect of maize DREB base editing on kernel yield under drought',
              confidence: 'low',
            },
          ],
        }),
      },
    ]);
    const docA = mkSource(ctx.run.id, newId('src'));
    const docB = mkSource(ctx.run.id, newId('src'), { abstractText: ABSTRACT_DOWN });
    corpusOf(ctx, [docA, docB]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('cross_relations=0 persisted (1 not_comparable) of 1 prefiltered pairs');
      expect(outcome.summary).toContain('2 directional-conflict disclosure(s)');
    }
    // the counter signal rides BOTH claims as an idempotent-prefixed note
    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(2);
    for (const c of claims) {
      const note = c.uncertainties.find((u) => u.startsWith('directional conflict:'));
      expect(note, `claim ${c.id} carries the directional conflict note`).toBeDefined();
      expect(note).toContain('increases');
      expect(note).toContain('reduces');
    }
    // abstention persisted zero claim-claim relations (only the 2 stance relations)
    expect(store.listObjects('evidence_relation', ctx.run.id).filter((r) => r.targetClaimId !== undefined)).toHaveLength(0);
  });

  it('direction anchor: null-effect vs asserted-effect pair gets the counter disclosure (measured econ miss class)', async () => {
    // Live probe corpus phrasing: the null claim ("no negative employment
    // effects") carries no direction verb, so the verb-opposition anchor
    // abstained — the null-vs-effect arm closes that measured miss.
    const ABSTRACT_DOWN_NULL =
      'In a structural model of local labor demand, the minimum wage rate reduces employment in small firms. ' +
      'A multi-state study of minimum wage policy finds no negative employment effects on low-wage workers overall, ' +
      'with employment trajectories matching control regions across the post-policy window.';
    const { ctx, store } = bench([
      extractionStep([
        {
          text: 'The minimum wage rate reduces employment in small firms.',
          quote: 'the minimum wage rate reduces employment in small firms',
          stance: 'contradicts',
        },
      ]),
      extractionStep([
        {
          text: 'No negative employment effects on low-wage workers overall.',
          quote: 'no negative employment effects on low-wage workers overall',
          stance: 'supports',
        },
      ]),
      { rawOutput: JSON.stringify({ enoughEvidence: true, gapDescription: 'fixture: adequate for null-anchor testing', queries: [] }) },
      {
        rawOutput: JSON.stringify({
          verdicts: [
            {
              pairId: 0,
              verdict: 'not_comparable',
              sharedSubject: 'minimum wage effects on employment',
              confidence: 'low',
            },
          ],
        }),
      },
    ]);
    const docA = mkSource(ctx.run.id, newId('src'), { abstractText: ABSTRACT_DOWN_NULL });
    const docB = mkSource(ctx.run.id, newId('src'), {
      abstractText:
        'A pooled evaluation of minimum wage policies reports no negative employment effects on low-wage workers overall. ' +
        'Across treated and control regions, employment series remained indistinguishable over the full post-policy window.',
    });
    corpusOf(ctx, [docA, docB]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('2 directional-conflict disclosure(s)');
    }
    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(2);
    for (const c of claims) {
      const note = c.uncertainties.find((u) => u.startsWith('directional conflict:'));
      expect(note, `claim ${c.id} carries the null-vs-effect note`).toBeDefined();
      expect(note).toContain('null-vs-effect opposition');
    }
  });

  it('high-overlap non-substring quote (jaccard >= 0.8) → verified with alignmentChecked=true', async () => {
    // fixture sanity pinned at unit level too: this quote is a fuzzy, not verbatim, match
    expect(checkQuoteAlignment(Q_FUZZY, ABSTRACT_A).verdict).toBe('fuzzy');
    const { ctx, store } = bench([
      extractionStep([{ text: 'Yield gain across three seasons.', quote: Q_FUZZY, stance: 'supports' }]),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const claim = claimByText(store, ctx.run.id, 'Yield gain across three seasons.');
    expect(claim.bindingStatus).toBe('verified');
    expect(claim.alignmentChecked).toBe(true);
  });

  it('paraphrased quotes → resolved_unaligned, downgraded relation, visible unaligned-claim rationale', async () => {
    const { ctx, store } = bench([
      extractionStep([
        { text: 'S1: editing raises yield.', quote: Q_PARAPHRASE_SUPPORTS, stance: 'supports', note: 'model claims support' },
        { text: 'S2: editing does nothing.', quote: Q_PARAPHRASE_CONTRADICTS, stance: 'contradicts' },
        { text: 'S3: effects vary.', quote: Q_PARAPHRASE_NEUTRAL, stance: 'neutral' },
      ]),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('unaligned=3');
      expect(outcome.summary).toContain('verified=0');
    }

    // supports + contradicts are downgraded to 'unknown'; neutral stays 'qualifies'
    const c1 = claimByText(store, ctx.run.id, 'S1: editing raises yield.');
    const r1 = relationForClaim(store, ctx.run.id, c1.id);
    expect(c1.bindingStatus).toBe('resolved_unaligned');
    expect(c1.alignmentChecked).toBe(false);
    expect(r1.relation).toBe('unknown');
    expect(r1.rationale).toContain('unaligned-claim');
    expect(RELATION_POLARITY[r1.relation]).toBe('neutral');

    const c2 = claimByText(store, ctx.run.id, 'S2: editing does nothing.');
    expect(relationForClaim(store, ctx.run.id, c2.id).relation).toBe('unknown');

    const c3 = claimByText(store, ctx.run.id, 'S3: effects vary.');
    const r3 = relationForClaim(store, ctx.run.id, c3.id);
    expect(c3.bindingStatus).toBe('resolved_unaligned');
    expect(r3.relation).toBe('qualifies'); // neutral stance is not a polarity claim — not downgraded
    expect(r3.rationale).toContain('unaligned-claim'); // ...but the misalignment stays visible
  });

  it('fail-closed: no unaligned claim is ever verified or carries supporting/counter polarity', async () => {
    const { ctx, store } = bench([
      extractionStep([
        { text: 'Aligned claim.', quote: Q_VERBATIM[0], stance: 'supports' },
        { text: 'Garbled claim.', quote: Q_PARAPHRASE_SUPPORTS, stance: 'supports' },
        { text: 'Garbled counter.', quote: Q_PARAPHRASE_CONTRADICTS, stance: 'contradicts' },
      ]),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(3);
    const byClaimId = new Map(
      store.listObjects('evidence_relation', ctx.run.id).map((r) => [r.claimId, r]),
    );
    expect(byClaimId.size).toBe(3);
    for (const claim of claims) {
      const rel = defined(byClaimId.get(claim.id), `relation of ${claim.id}`);
      if (claim.locators[0]?.quote !== Q_VERBATIM[0]) {
        expect(claim.bindingStatus).not.toBe('verified');
        expect(claim.bindingStatus).toBe('resolved_unaligned');
        expect(claim.alignmentChecked).toBe(false);
        expect(rel.relation).not.toBe('supports');
        expect(rel.relation).not.toBe('contradicts');
        expect(RELATION_POLARITY[rel.relation]).toBe('neutral');
      } else {
        expect(claim.bindingStatus).toBe('verified'); // the one grounded quote is verified
      }
    }
  });

  it('stance→relation mapping covers supports/contradicts/qualifies/unknown', async () => {
    const { ctx, store } = bench([
      extractionStep([
        { text: 'M1', quote: Q_VERBATIM[0], stance: 'supports' },
        { text: 'M2', quote: Q_VERBATIM[1], stance: 'contradicts' },
        { text: 'M3', quote: Q_VERBATIM[2], stance: 'neutral' },
        { text: 'M4', quote: Q_VERBATIM[3], stance: 'unknown' },
      ]),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const expected: Array<{ text: string; relation: string; polarity: string }> = [
      { text: 'M1', relation: 'supports', polarity: 'supporting' },
      { text: 'M2', relation: 'contradicts', polarity: 'counter' },
      { text: 'M3', relation: 'qualifies', polarity: 'neutral' },
      { text: 'M4', relation: 'unknown', polarity: 'neutral' },
    ];
    for (const e of expected) {
      const claim = claimByText(store, ctx.run.id, e.text);
      expect(claim.bindingStatus).toBe('verified');
      const rel = relationForClaim(store, ctx.run.id, claim.id);
      expect(rel.relation).toBe(e.relation);
      expect(RELATION_POLARITY[rel.relation]).toBe(e.polarity);
      expect(rel.rationale.length).toBeGreaterThan(0);
      // 'M1'..'M4' contain digits -> quantitative -> grade high -> 'moderate'
      // (deterministic mapping; every relation carries its derivation note).
      expect(rel.strength).toBe('moderate');
      expect(rel.uncertainties.some((u) => u.includes('strength-v1'))).toBe(true);
    }
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('supports=1');
      expect(outcome.summary).toContain('contradicts=1');
      expect(outcome.summary).toContain('qualifies=1');
      expect(outcome.summary).toContain('unknown=1');
    }
  });

  it('model failure → stage rejects, no claim persisted, failure receipt kept', async () => {
    const { ctx, store } = bench([{ fail: { kind: 'provider_error', message: 'fixture outage' } }]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);

    await expect(buildEvidenceStage.execute(ctx)).rejects.toThrow(
      'model call failed (provider_error) in build_evidence/claim-extraction',
    );
    expect(store.listObjects('claim', ctx.run.id)).toHaveLength(0);
    expect(store.listObjects('evidence_relation', ctx.run.id)).toHaveLength(0);
    // provenance stays honest: the failed attempt is still recorded
    const receipts = store.listObjects('receipt', ctx.run.id);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.kind).toBe('model_call');
  });

  it('no-abstract and unresolved sources are skipped, noted in summary, and never hit the model', async () => {
    const { ctx, store } = bench([
      // exactly ONE scripted step: a second model call would exhaust the script and fail loudly
      extractionStep([{ text: 'Only for the usable source.', quote: Q_VERBATIM[0], stance: 'neutral' }]),
    ]);
    const usable = mkSource(ctx.run.id, newId('src'), {
      verification: { method: 'openalex_id', resolved: true, checkedAt: NOW },
    });
    const noAbstract = mkSource(ctx.run.id, newId('src'), {
      contentDepth: 'metadata_only',
      abstractText: undefined,
    });
    const unresolved = mkSource(ctx.run.id, newId('src'), {
      verification: { method: 'crossref_doi', resolved: false, detail: 'fixture: DOI missing', checkedAt: NOW },
    });
    corpusOf(ctx, [usable, noAbstract, unresolved]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('skipped_no_abstract=1');
      expect(outcome.summary).toContain('skipped_unresolved=1');
      expect(outcome.summary).toContain('processed=1');
    }
    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.locators[0]?.sourceDocumentId).toBe(usable.id);
    await expect(buildEvidenceStage.applicable(ctx)).resolves.toBe(false);
  });

  it('per-source claim cap: 6 model claims → 4 stored, truncation noted in summary', async () => {
    expect(MAX_CLAIMS_PER_SOURCE).toBe(4);
    const { ctx, store } = bench([
      extractionStep([
        { text: 'Fixture claim 1', quote: Q_VERBATIM[0], stance: 'supports' },
        { text: 'Fixture claim 2', quote: Q_VERBATIM[1], stance: 'neutral' },
        { text: 'Fixture claim 3', quote: Q_VERBATIM[2], stance: 'unknown' },
        { text: 'Fixture claim 4', quote: Q_VERBATIM[3], stance: 'supports' },
        { text: 'Fixture claim 5', quote: Q_VERBATIM[0], stance: 'supports' },
        { text: 'Fixture claim 6', quote: Q_VERBATIM[1], stance: 'contradicts' },
      ]),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('claims=4');
      expect(outcome.summary).toContain('truncated_to_cap=2');
    }
    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(4);
    expect(new Set(claims.map((c) => c.text))).toEqual(
      new Set(['Fixture claim 1', 'Fixture claim 2', 'Fixture claim 3', 'Fixture claim 4']),
    );
    expect(store.listObjects('evidence_relation', ctx.run.id)).toHaveLength(4);
  });

  it('cancellation before extraction → rejects as cancelled without touching the model', async () => {
    // empty script: if the stage tried any model call, the stub would throw 'script exhausted'
    const { ctx } = bench([], () => true);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);
    await expect(buildEvidenceStage.execute(ctx)).rejects.toThrow(
      /^cancelled by user in build_evidence/,
    );
  });
});

// ---------------------------------------------------------------------------
// fulltext deepening (phase A) — abstract → full text, bounded and fail-visible
// ---------------------------------------------------------------------------

const FULLTEXT_SENTENCE =
  'Deep sequencing of the treated cohorts revealed a consistent shift in community composition.';
const FULLTEXT_BODY = `${FULLTEXT_SENTENCE} `.repeat(40).trim();
const ARXIV_DOC = {
  identifiers: [
    { kind: 'openalex' as const, value: 'W-arx' },
    { kind: 'doi' as const, value: '10.1/arxiv.1' },
    { kind: 'arxiv' as const, value: '2401.04088v2' },
  ],
};

describe('build_evidence fulltext deepening (phase A)', () => {
  it('deepens a routed doc: artifact stored, doc upgraded, claims ground in full text', async () => {
    const fetchedCalls: string[] = [];
    const { ctx, store, run } = bench(
      [
        extractionStep([
          { text: 'Fulltext claim', quote: FULLTEXT_SENTENCE, stance: 'supports' },
        ]),
      ],
      () => false,
      {
        fetchFullText: async (doc) => {
          fetchedCalls.push(doc.id);
          return {
            status: 'fetched',
            fetch: {
              variant: 'arxiv_html_v1',
              sourceUrl: 'https://arxiv.org/html/2401.04088',
              text: FULLTEXT_BODY,
              license: 'arXiv.org perpetual, non-exclusive license',
              httpStatus: 200,
            },
          };
        },
      },
    );
    const doc = mkSource(run.id, newId('src'), ARXIV_DOC);
    corpusOf(ctx, [doc]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('fulltext=');
      expect(outcome.summary).toContain('arxiv_html_v1');
    }
    expect(fetchedCalls).toEqual([doc.id]);

    // claim verified against the COMBINED text (sentence absent from the abstract)
    const claim = claimByText(store, run.id, 'Fulltext claim');
    expect(claim.bindingStatus).toBe('verified');

    // document upgraded with artifact ref + license
    const stored = store.getObject('source_document', doc.id)!;
    expect(stored.contentDepth).toBe('full_text');
    expect(stored.fullTextRef).toBeDefined();
    expect(stored.license).toBe('arXiv.org perpetual, non-exclusive license');

    // artifact round-trips the FULL text
    const artifactText = await ctx.artifacts.get(stored.fullTextRef!);
    expect(artifactText).toBe(FULLTEXT_BODY);

    // provenance receipt for the fetch
    const receipt = store
      .listObjects('receipt', run.id)
      .find((r) => r.sourceRetrieval?.family === 'arxiv_html_v1');
    expect(receipt?.sourceRetrieval?.resultCount).toBe(1);
  });

  it('not_available (no rendering) degrades silently to abstract extraction', async () => {
    const { ctx, store, run } = bench(
      [extractionStep([{ text: 'Abstract claim', quote: Q_VERBATIM[0], stance: 'supports' }])],
      () => false,
      { fetchFullText: async () => ({ status: 'not_available', reason: 'no HTML rendering (404)' }) },
    );
    corpusOf(ctx, [mkSource(run.id, newId('src'), ARXIV_DOC)]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') expect(outcome.summary).toContain('fulltext=none');
    expect(claimByText(store, run.id, 'Abstract claim').bindingStatus).toBe('verified');
    const stored = store.listObjects('source_document', run.id)[0]!;
    expect(stored.contentDepth).toBe('abstract');
  });

  it('fetch errors are visible in the summary and never block extraction', async () => {
    const { ctx, run } = bench(
      [extractionStep([{ text: 'Abstract claim', quote: Q_VERBATIM[1], stance: 'supports' }])],
      () => false,
      { fetchFullText: async () => ({ status: 'error', message: 'boom: http 503' }) },
    );
    corpusOf(ctx, [mkSource(run.id, newId('src'), ARXIV_DOC)]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('fulltext=');
      expect(outcome.summary).toContain('error(boom: http 503)');
    }
  });

  it('resume path: already-deepened doc reloads its excerpt from the artifact store', async () => {
    // First: write the artifact the earlier attempt would have stored.
    const { ctx, store, run } = bench(
      [extractionStep([{ text: 'Resume claim', quote: FULLTEXT_SENTENCE, stance: 'neutral' }])],
      () => false,
      {
        fetchFullText: async () => {
          throw new Error('must NOT be called: doc already deepened');
        },
      },
    );
    const put = await ctx.artifacts.put(FULLTEXT_BODY);
    const doc = mkSource(run.id, newId('src'), {
      ...ARXIV_DOC,
      contentDepth: 'full_text',
      fullTextRef: put.ref,
    });
    corpusOf(ctx, [doc]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    // The quote exists ONLY in the stored fulltext artifact — alignment must pass.
    const claim = claimByText(store, run.id, 'Resume claim');
    expect(claim.bindingStatus).toBe('verified');
  });

  it('excerpt cap keeps the model view bounded while the artifact stays complete', async () => {
    const longText = `${'Sentence that repeats to exceed the cap. '.repeat(900)}`;
    const recordedPayloads: unknown[] = [];
    const { ctx } = bench(
      [
        {
          rawOutput: JSON.stringify({ claims: [] }),
        },
      ],
      () => false,
      { fetchFullText: async () => ({ status: 'fetched', fetch: { variant: 'europepmc_jats_v1', sourceUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML', text: longText, license: 'CC BY 4.0', httpStatus: 200 } }) },
    );
    // intercept the model payload through a spy provider wrapper
    const originalProvider = ctx.provider;
    ctx.provider = {
      ...originalProvider,
      structuredCall: ((req: unknown, parse: unknown) => {
        recordedPayloads.push((req as { userPayload?: unknown }).userPayload);
        return originalProvider.structuredCall(req as never, parse as never);
      }) as typeof originalProvider.structuredCall,
    };
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'), ARXIV_DOC)]);
    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    // RU-3 T1: external text rides in the dedicated untrustedSourceContent channel.
    const extractionPayload = recordedPayloads.find((p) =>
      JSON.stringify(p).includes('fullTextExcerpt')) as { input?: { source?: Record<string, unknown>; untrustedSourceContent?: { fullTextExcerpt?: string } } } | undefined;
    expect(extractionPayload?.input?.untrustedSourceContent?.fullTextExcerpt).toBeDefined();
    expect(extractionPayload!.input!.untrustedSourceContent!.fullTextExcerpt!.length).toBeLessThanOrEqual(16_200);
    // Channel-separation regression lock: the trusted `source` object must not
    // carry the external text (spotlighting invariant).
    expect(extractionPayload!.input!.source!.abstract).toBeUndefined();
    expect(extractionPayload!.input!.source!.fullTextExcerpt).toBeUndefined();
    const stored = ctx.store.listObjects('source_document', ctx.run.id)[0]!;
    const artifactText = await ctx.artifacts.get(stored.fullTextRef!);
    expect(artifactText).toBe(longText);
  });
});
// ---------------------------------------------------------------------------
// Lane-06 (2026-08-25): deterministic numeric anchoring of D-018 contradiction
// judgment — CI-vs-CI arithmetic rides the pair payload, and non-overlapping
// intervals get a heterogeneity disclosure on BOTH claims regardless of verdict.
// ---------------------------------------------------------------------------

describe('build_evidence D-018 numeric anchoring (lane-06)', () => {
  const ABSTRACT_NUM_A =
    'A multi-site trial of CRISPR base editing of the maize DREB gene reports a substantial yield effect. ' +
    'Across all sites base editing increased yield with an effect of 2.1 (95% CI [1.2, 3.0]) relative to controls.';
  const ABSTRACT_NUM_B =
    'A large-panel study of CRISPR base editing of the maize DREB gene finds no meaningful yield effect. ' +
    'In every panel base editing showed no yield gain with an effect of 0.4 (95% CI [0.1, 0.9]) relative to controls.';

  it('disjoint quoted CIs anchor the pair and get a deterministic disclosure even when the verdict is not_comparable', async () => {
    const { ctx, store } = bench([
      extractionStep([
        {
          text: 'Base editing of the maize DREB gene increases kernel yield substantially.',
          quote: 'base editing increased yield with an effect of 2.1 (95% CI [1.2, 3.0])',
          stance: 'supports',
        },
      ]),
      extractionStep([
        {
          text: 'Base editing of the maize DREB gene does not meaningfully increase kernel yield.',
          quote: 'base editing showed no yield gain with an effect of 0.4 (95% CI [0.1, 0.9])',
          stance: 'contradicts',
        },
      ]),
      // verified=2 < floor -> gap assessment runs; script "adequate"
      { rawOutput: JSON.stringify({ enoughEvidence: true, gapDescription: 'fixture: adequate', queries: [] }) },
      // the judge abstains — the arithmetic must still be disclosed
      {
        rawOutput: JSON.stringify({
          verdicts: [
            {
              pairId: 0,
              verdict: 'not_comparable',
              sharedSubject: 'effect of maize DREB base editing on yield',
              confidence: 'low',
            },
          ],
        }),
      },
    ]);
    const docA = mkSource(ctx.run.id, newId('src'), { abstractText: ABSTRACT_NUM_A });
    const docB = mkSource(ctx.run.id, newId('src'), { abstractText: ABSTRACT_NUM_B });
    corpusOf(ctx, [docA, docB]);

    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      // 1 prefiltered pair, judge abstained, but the disclosure fired deterministically
      expect(outcome.summary).toContain('cross_relations=0 persisted (1 not_comparable) of 1 prefiltered pairs');
      expect(outcome.summary).toContain('2 numeric-heterogeneity disclosure(s)');
    }
    const claims = store.listObjects('claim', ctx.run.id);
    expect(claims).toHaveLength(2);
    for (const c of claims) {
      expect(c.uncertainties.some((u) => u.startsWith('numeric heterogeneity: non-overlapping CIs'))).toBe(true);
    }
    // no cross relation persisted for a not_comparable verdict (enrichment honesty)
    expect(store.listObjects('evidence_relation', ctx.run.id).filter((r) => r.targetClaimId !== undefined)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// W4R subject-coverage honesty gate (2-of-2): adversarial review P1 — the gate
// shipped with zero test coverage; these drive both agreement paths.
// ---------------------------------------------------------------------------
describe('build_evidence subject-coverage gate (2-of-2)', () => {
  const gapInsufficient = (): StubStep => ({
    rawOutput: JSON.stringify({
      enoughEvidence: false,
      gapDescription: 'fixture: verified claims study a different subject than the question names',
      queries: [],
    }),
  });

  it('two agreeing insufficient judgments flag the run (tag persisted + 2-of-2 verdict in summary)', async () => {
    const { ctx, store, run, db } = bench([
      extractionStep([{ text: 'CRISPR base editing increases kernel yield under drought.', quote: Q_VERBATIM[1], stance: 'supports' }]),
      gapInsufficient(),
      gapInsufficient(),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);
    // the bench assembles the run in memory; the gate's tag write needs the row
    db.prepare('INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), NOW, NOW);
    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).toContain('insufficient (2-of-2');
    }
    const row = db.prepare('SELECT doc FROM runs WHERE id=?').get(run.id) as { doc: string };
    expect(JSON.parse(row.doc).tags).toContain('evidence-insufficient');
    expect(store.listObjects('claim', run.id)).toHaveLength(1); // claims persisted — the refusal is downstream
  });

  it('a confirm pass that disagrees un-refuses the run (no 2-of-2 verdict, no tag)', async () => {
    const { ctx, run, db } = bench([
      extractionStep([{ text: 'CRISPR base editing increases kernel yield under drought.', quote: Q_VERBATIM[1], stance: 'supports' }]),
      gapInsufficient(),
      gapAdequateStep(),
    ]);
    corpusOf(ctx, [mkSource(ctx.run.id, newId('src'))]);
    db.prepare('INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), NOW, NOW);
    const outcome = await buildEvidenceStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') {
      expect(outcome.summary).not.toContain('insufficient (2-of-2');
    }
    const row = db.prepare('SELECT doc FROM runs WHERE id=?').get(run.id) as { doc: string };
    expect(JSON.parse(row.doc).tags).not.toContain('evidence-insufficient');
  });
});
