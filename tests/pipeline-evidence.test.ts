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
}

/**
 * Gap-assessment trailing step: build_evidence now ends with one evidence-gap
 * assessment call whenever verified claims are below the seek threshold; bench-built
 * stubs therefore always script it last (adequate evidence -> no follow-up round).
 */
const gapAdequateStep = (): StubStep => ({
  rawOutput: JSON.stringify({ enoughEvidence: true, gapDescription: 'fixture: adequate for the test scenario', queries: [] }),
});

const bench = (scriptedSteps: StubStep[], cancelled: () => boolean = () => false): Bench => {
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
  return { ctx, store, run };
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
    expect(rel.strength).toBe('unrated');
    expect(RELATION_POLARITY[rel.relation]).toBe('supporting');

    const receipts = store.listObjects('receipt', ctx.run.id);
    // 2 model calls now: claim-extraction + the trailing evidence-gap assessment (W5 §30 addition).
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.kind).toBe('model_call');
    expect(receipts[0]?.stage).toBe('build_evidence');
    expect(receipts[1]?.modelCall?.usage).toBeDefined();
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
      expect(rel.strength).toBe('unrated');
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
