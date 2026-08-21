import { describe, it, expect } from 'vitest';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import {
  EvidenceRelation,
  HypothesisCandidate,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  SourceDocument,
  newId,
} from '../src/domain/index.js';
import type { RunId } from '../src/domain/index.js';
import type { StageContext } from '../src/pipeline/types.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { ArtifactStore, ModelProvider, StructuredCallRequest, SourceAdapter, RawSourceRecord } from '../src/shared/ports.js';
import { canonicalSha256 } from '../src/shared/crypto.js';
import { computeRequestHash } from '../src/providers/http.js';
import { generateHypothesesStage, MIN_REPRESENTATIVES } from '../src/pipeline/stages/hypotheses.js';
import {
  checkFalsificationCompleteness,
  falsifyStage,
  hasDecidableSemantics,
} from '../src/pipeline/stages/falsify.js';
import { COMPARISON_NOTE, RANK_WEIGHTS, aggregateOutcome, bradleyTerry, circleSchedule, compositeScore, rankStage, tournamentRounds } from '../src/pipeline/stages/rank.js';
import { DUPLICATE_MARKER } from '../src/pipeline/stages/shared.js';
import { SourceAdapterError } from '../src/sources/error.js';

/**
 * *** TEST FIXTURES ONLY ***
 * Every model response below is a scripted TestStubProvider step (executionMode 'test');
 * no network, no keys. Assertions are behavioral: candidate storage, cluster bookkeeping,
 * deterministic falsification completeness, deterministic weighted ranking, reference filtering.
 */

// ---------------------------------------------------------------------------
// fixtures / harness
// ---------------------------------------------------------------------------

const setup = () => {
  const store = new Store(openDb(':memory:'));
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'base editors show motif-dependent off-target deamination',
    goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-target edits'] },
    constraints: { assumptions: [] },
    createdAt: new Date().toISOString(),
  });
  // NOTE: Store.createRun is currently broken (appendEvent parses seq:0 against a
  // positive() schema), so the run is built in-memory; these stages never read the
  // runs table — they work off ctx.run + the objects table only.
  store.putObject('question', q);
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'running',
    currentStage: 'generate_hypotheses',
    stages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
  });
  return { store, run };
};

const SRC = newId('src');

const makeClaim = (runId: RunId, text: string, bindingStatus: 'verified' | 'resolved_unaligned' = 'verified') =>
  ScientificClaim.parse({
    id: newId('clm'),
    runId,
    text,
    locators: [{ sourceDocumentId: SRC, quote: `verbatim excerpt grounding: ${text}` }],
    bindingStatus,
    alignmentChecked: true,
  });

const ts = (i: number) => new Date(Date.parse('2026-08-21T00:00:00Z') + i * 1000).toISOString();

const makeHyp = (
  runId: RunId,
  statement: string,
  opts: { duplicateOf?: string; createdAt?: string } = {},
) =>
  HypothesisCandidate.parse({
    id: newId('hyp'),
    runId,
    version: 0,
    statement,
    mechanism: `causal mechanism underlying ${statement}`,
    derivation: {
      strategy: 'evidence_conditioned',
      rationale:
        opts.duplicateOf === undefined
          ? 'seeded generation rationale'
          : `seeded generation rationale | ${DUPLICATE_MARKER}${opts.duplicateOf}`,
      inputClaimIds: [],
    },
    assumptions: [
      { id: 'a0', statement: 'seeded assumption zero', kind: 'empirical', backingClaimIds: [] },
      { id: 'a1', statement: 'seeded assumption one', kind: 'theoretical', backingClaimIds: [] },
    ],
    predictions: ['seeded prediction'],
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'mixed',
    testability: 'testable_with_data',
    clusterKey: 'seeded',
    createdAt: opts.createdAt ?? ts(0),
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

interface CtxOpts {
  cancelled?: () => boolean;
  capture?: { reqs: StructuredCallRequest[] };
  openalex?: SourceAdapter;
  /** Per-purpose dynamic responses computed from the live request (for runtime-generated ids). */
  dynamic?: Record<string, (req: StructuredCallRequest) => unknown>;
}

const makeCtx = (run: { id: RunId }, store: Store, steps: StubStep[], opts: CtxOpts = {}) => {
  const artifacts = memArtifacts();
  const receipts: Array<Record<string, unknown>> = [];
  const inner = createTestStubProvider(steps);
  const wrapDynamic = opts.dynamic || opts.capture;
  const provider: ModelProvider = wrapDynamic
    ? {
        name: inner.name,
        liveReady: inner.liveReady,
        async structuredCall(req, parse) {
          if (opts.dynamic && req.task in opts.dynamic && req.task !== '') {
            const data = opts.dynamic[req.task]!(req);
            const parsedDyn = parse(data);
            if (parsedDyn instanceof Error) throw new Error(`TEST dynamic response failed schema for ${req.task}: ${parsedDyn.message}`);
            return {
              ok: true as const,
              data: parsedDyn,
              receipt: {
                provider: inner.name,
                modelId: 'test-stub',
                latencyMs: 0,
                usage: {},
                requestHash: computeRequestHash(req),
                outputHash: canonicalSha256(JSON.stringify(data)),
                executionMode: 'test' as const,
              },
            };
          }
          opts.capture?.reqs.push(req);
          return inner.structuredCall(req, parse);
        },
      }
    : inner;
  const ctx: StageContext = {
    run: run as StageContext['run'],
    store,
    artifacts,
    provider,
    sourceFor: (family) => {
      if (family === 'openalex' && opts.openalex) return opts.openalex;
      throw new Error(`TEST FIXTURE: no fake adapter registered for ${family}`);
    },
    recordReceipt: (r) => {
      receipts.push(r as Record<string, unknown>);
    },
    cancelled: opts.cancelled ?? (() => false),
    log: () => {},
  };
  return { ctx, receipts, artifacts };
};

const cand = (n: string, extra: Record<string, unknown> = {}) => ({
  statement: `statement ${n}`,
  mechanism: `mechanism ${n}`,
  assumptions: [`assumption ${n} a`, `assumption ${n} b`],
  predictions: [`prediction ${n}`],
  rationale: `rationale ${n}`,
  distinctnessRationale: `distinct from others because ${n}`,
  evidenceClaimIds: [],
  ...extra,
});
const gen = (...cs: unknown[]) => JSON.stringify({ candidates: cs });
const NOVELTY_MIXED = 'mixed';

const dim = (name: string, value: number | null, extra: Record<string, unknown> = {}) => ({
  dimension: name,
  value,
  rationale: `rationale for the ${name} judgment of this hypothesis`,
  evidenceClaimIds: [],
  qualitative: value === null ? 'not_assessed' : 'moderate',
  ...extra,
});

const CORE_DIMS = (v: number) => [
  dim('evidence_grounding', v),
  dim('falsifiability', v),
  dim('testability', v),
  dim('counter_evidence_exposure', v),
  dim('scientific_plausibility', v),
  dim('novelty', v),
  dim('methodological_soundness', v),
];

// ---------------------------------------------------------------------------
// generate_hypotheses
// ---------------------------------------------------------------------------

describe('generate_hypotheses stage', () => {
  it('runs three strategies, stores all candidates, filters invalid claim refs, records receipts', async () => {
    const { store, run } = setup();
    const clmA = makeClaim(run.id, 'claim A: duration increases deamination');
    const clmB = makeClaim(run.id, 'claim B: inhibitors reduce off-targets');
    const clmC = makeClaim(run.id, 'claim C: in vitro replication failed');
    for (const c of [clmA, clmB, clmC]) store.putObject('claim', c);
    // C contradicts A => counter bucket {A, C}; B stays supporting.
    store.putObject(
      'evidence_relation',
      EvidenceRelation.parse({
        id: newId('ev'), runId: run.id, relation: 'contradicts', claimId: clmC.id,
        targetClaimId: clmA.id, rationale: 'replication failure contradicts the duration link',
        createdAt: ts(0),
      }),
    );

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1', { evidenceClaimIds: [clmB.id, 'clm_doesnotexist000000000000aaa'] }), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1], reason: 'E1/E2 are paraphrases' }] }) },
      {
        rawOutput: JSON.stringify({
          labels: [
            { index: 0, noveltyLabel: 'evidence_grounded' },
            { index: 2, noveltyLabel: 'novel_speculation' },
            { index: 3, noveltyLabel: NOVELTY_MIXED },
          ],
        }),
      },
      // D-017 expansion: no matching hypothesis id -> all novelty-neighbor searches skipped
      { rawOutput: JSON.stringify({ hypotheses: [{ hypothesisId: 'hyp_notarget00000000000000000aaa', queries: ['ignored neighbor query one', 'ignored neighbor query two'] }] }) },
    ];
    const { ctx, receipts } = makeCtx(run, store, steps);
    expect(await generateHypothesesStage.applicable(ctx)).toBe(true);
    const outcome = await generateHypothesesStage.execute(ctx);

    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/generated 6 candidates via 3 strategies/);
    expect(summary).toMatch(/5 paraphrase-distinct representatives/);
    expect(summary).toMatch(/1 duplicate/);
    expect(summary).toContain('clm_doesnotexist000000000000aaa');

    const hyps = store.listObjects('hypothesis', run.id);
    expect(hyps).toHaveLength(6);
    const byStrategy = (s: string) => hyps.filter((h) => h.derivation.strategy === s);
    expect(byStrategy('evidence_conditioned')).toHaveLength(2);
    expect(byStrategy('contradiction_driven')).toHaveLength(2);
    expect(byStrategy('mechanism_driven')).toHaveLength(2);

    // invalid evidence reference filtered; fallback = the strategy's conditioning claims
    const e1 = hyps.find((h) => h.statement === 'statement E1');
    const e2 = hyps.find((h) => h.statement === 'statement E2');
    expect(e1?.derivation.inputClaimIds).toEqual([clmB.id]);
    expect(e2?.derivation.inputClaimIds).toEqual([clmB.id]);

    // duplicate marking: index 1 is a paraphrase of representative index 0
    const dups = hyps.filter((h) => h.derivation.rationale.includes(DUPLICATE_MARKER));
    expect(dups).toHaveLength(1);
    expect(dups[0]?.derivation.rationale).toContain(`${DUPLICATE_MARKER}${e1?.id}`);
    expect(dups[0]?.clusterKey).toBe(e1?.clusterKey);
    expect(new Set(hyps.map((h) => h.clusterKey)).size).toBe(5);

    // novelty labels applied (scripted + honest default for unmentioned)
    expect(hyps.find((h) => h.statement === 'statement E1')?.noveltyLabel).toBe('evidence_grounded');
    expect(hyps.find((h) => h.statement === 'statement C1')?.noveltyLabel).toBe('novel_speculation');
    expect(hyps.find((h) => h.statement === 'statement M2')?.noveltyLabel).toBe('mixed');

    // receipts: 3 strategy calls + 1 clustering + 1 novelty + 1 literature expansion, all model_call at this stage
    expect(receipts).toHaveLength(6);
    expect(receipts.every((r) => r.kind === 'model_call' && r.stage === 'generate_hypotheses')).toBe(true);
    // D-017: no neighbors retrieved -> deterministic honest 'unclear' layer on every assessed representative
    const litLayers = store.listObjects('hypothesis', run.id).filter((h) => h.literatureNovelty !== undefined);
    expect(litLayers).toHaveLength(4); // cap LIT_NOVELTY_MAX_HYPS = 4 (5 representatives)
    expect(litLayers.every((h) => h.literatureNovelty?.verdict === 'unclear')).toBe(true);
    expect(summary).toContain('literature novelty (D-017): 4/4');

    // regeneration is not applicable once hypotheses exist
    expect(await generateHypothesesStage.applicable({ ...ctx, run: { ...ctx.run } })).toBe(false);
  });

  it('falls back for contradiction_driven when no counter-evidence exists (explicit where-could-it-be-wrong instruction)', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'only affirmative claim one');
    const c2 = makeClaim(run.id, 'only affirmative claim two');
    store.putObject('claim', c1);
    store.putObject('claim', c2);

    const capture: { reqs: StructuredCallRequest[] } = { reqs: [] };
    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0], reason: 'single' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 0, noveltyLabel: 'evidence_grounded' }] }) },
      { rawOutput: JSON.stringify({ hypotheses: [{ hypothesisId: 'hyp_notarget00000000000000000aaa', queries: ['ignored neighbor query one', 'ignored neighbor query two'] }] }) },
    ];
    const { ctx } = makeCtx(run, store, steps, { capture });
    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    expect(capture.reqs).toHaveLength(6);
    const ec0 = capture.reqs[0]?.userPayload as { input?: Record<string, unknown> };
    const ec = (ec0.input ?? {}) as Record<string, unknown>;
    const supporting = ec.supportingClaims as Array<{ id: string }>;
    expect(supporting.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
    const cd0 = capture.reqs[1]?.userPayload as { input?: Record<string, unknown> };
    const cd = (cd0.input ?? {}) as Record<string, unknown>;
    expect(cd.counterEvidenceAbsent).toBe(true);
    expect(String(cd.instruction)).toMatch(/COULD be wrong/i);
    expect((cd.counterDirectionClaims as Array<{ id: string }>).map((c) => c.id).sort()).toEqual(
      [c1.id, c2.id].sort(),
    );
    expect(capture.reqs[1]?.purpose).toBe('hypothesis-search:contradiction-driven');
  });

  it('diversity supplement fires when clustering collapses 6 candidates into 2 representatives', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'claim one');
    const c2 = makeClaim(run.id, 'claim two');
    store.putObject('claim', c1);
    store.putObject('claim', c2);

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2, 3], reason: 'same mechanism' }, { memberIndices: [4, 5], reason: 'same premise' }] }) },
      { rawOutput: gen(cand('S1'), cand('S2')) }, // supplement
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2, 3], reason: 'same mechanism' }, { memberIndices: [4, 5], reason: 'same premise' }, { memberIndices: [6], reason: 'distinct' }, { memberIndices: [7], reason: 'distinct' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 6, noveltyLabel: 'novel_speculation' }] }) },
      { rawOutput: JSON.stringify({ hypotheses: [{ hypothesisId: 'hyp_notarget00000000000000000aaa', queries: ['ignored neighbor query one', 'ignored neighbor query two'] }] }) },
    ];
    const { ctx, receipts } = makeCtx(run, store, steps);
    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/diversity supplement/);

    const hyps = store.listObjects('hypothesis', run.id);
    expect(hyps).toHaveLength(8);
    expect(hyps.filter((h) => h.derivation.strategy === 'assumption_perturbation')).toHaveLength(2);
    expect(new Set(hyps.map((h) => h.clusterKey)).size).toBe(4); // 4 representatives after supplement
    expect(hyps.filter((h) => h.derivation.rationale.includes(DUPLICATE_MARKER))).toHaveLength(4);
    expect(receipts).toHaveLength(8); // 3 strategies + cluster + supplement + recluster + novelty + literature expansion
  });

  it(`stores an honest diversity shortfall when even the supplement stays below ${MIN_REPRESENTATIVES} representatives`, async () => {
    const { store, run } = setup();
    store.putObject('claim', makeClaim(run.id, 'claim one'));
    store.putObject('claim', makeClaim(run.id, 'claim two'));

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2], reason: 'same' }, { memberIndices: [3, 4, 5], reason: 'same' }] }) },
      { rawOutput: gen(cand('S1'), cand('S2')) },
      // supplement candidates merge into the existing clusters: still 2 representatives
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2, 6], reason: 'same' }, { memberIndices: [3, 4, 5, 7], reason: 'same' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 0, noveltyLabel: 'evidence_grounded' }] }) },
      { rawOutput: JSON.stringify({ hypotheses: [{ hypothesisId: 'hyp_notarget00000000000000000aaa', queries: ['ignored neighbor query one', 'ignored neighbor query two'] }] }) },
    ];
    const { ctx } = makeCtx(run, store, steps);
    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/stored as-is, NOT padded with paraphrases/);
    const hyps = store.listObjects('hypothesis', run.id);
    expect(hyps).toHaveLength(8);
    expect(new Set(hyps.map((h) => h.clusterKey)).size).toBe(2);
  });

  it('D-017: literature novelty full path — neighbors retrieved, deduped vs corpus, facet-ranked, adjudicated', async () => {
    const { store, run } = setup();
    store.putObject('claim', makeClaim(run.id, 'claim one'));
    store.putObject('claim', makeClaim(run.id, 'claim two'));
    // a corpus document whose DOI must NOT come back as a "neighbor"
    store.putObject(
      'source_document',
      SourceDocument.parse({
        id: newId('src'), runId: run.id, family: 'openalex',
        identifiers: [{ kind: 'doi', value: '10.1000/in-corpus' }],
        title: 'Corpus doc', authors: [], contentDepth: 'abstract', accessState: 'open',
        contentHash: 'ab'.repeat(32), retrievedAt: new Date().toISOString(), parseStatus: 'ok',
      }),
    );

    let searchCount = 0;
    const neighborRecord = (title: string, doi: string): RawSourceRecord => ({
      identifiers: [{ kind: 'doi', value: doi }],
      title,
      publicationYear: 2025,
      authors: ['Nb Author'],
      contentDepth: 'abstract',
      accessState: 'open',
      abstractText: `Neighbor abstract for ${title}.`,
      normalized: { DOI: doi, title },
    });
    const openalex: SourceAdapter = {
      family: 'openalex',
      async search(query) {
        searchCount += 1;
        return {
          family: 'openalex', query, httpStatus: 200,
          records: [
            neighborRecord(`Neighbor paper ${searchCount}`, `10.1000/nb.${searchCount}`),
            neighborRecord('Corpus duplicate', '10.1000/in-corpus'), // must be filtered (already in corpus)
          ],
          latencyMs: 1,
        };
      },
      async resolve() { throw new Error('TEST FIXTURE: resolve not expected'); },
    };

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1], reason: 'paraphrases' }, { memberIndices: [2, 3], reason: 'paraphrases' }, { memberIndices: [4], reason: 'distinct' }, { memberIndices: [5], reason: 'distinct' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 0, noveltyLabel: 'evidence_grounded' }] }) },
    ];
    // dynamic per-purpose responses: echo the runtime-generated hypothesis ids
    const { ctx, receipts } = makeCtx(run, store, steps, {
      openalex,
      dynamic: {
        'novelty-check:query-expansion': (req) => {
          const input = (req.userPayload as { input?: { hypotheses?: Array<{ hypothesisId: string }> } }).input;
          return {
            hypotheses: (input?.hypotheses ?? []).map((h) => ({
              hypothesisId: h.hypothesisId,
              queries: ['neighbor paraphrase query', 'neighbor entity mechanism query'],
            })),
          };
        },
        'novelty-check:facet-rerank': (req) => {
          const input = (req.userPayload as { input?: { hypotheses?: Array<{ hypothesisId: string; neighbors: unknown[] }> } }).input;
          return {
            rankings: (input?.hypotheses ?? []).map((h) => ({
              hypothesisId: h.hypothesisId,
              rankedNeighborIndices: h.neighbors.map((_, i) => i).reverse(), // deterministic reversed order
            })),
          };
        },
        'novelty-check:adjudication': (req) => {
          const input = (req.userPayload as { input?: { hypotheses?: Array<{ hypothesisId: string }> } }).input;
          return {
            verdicts: (input?.hypotheses ?? []).map((h, i) => ({
              hypothesisId: h.hypothesisId,
              verdict: i === 0 ? 'incremental' : 'unclear',
              nearestNeighborIndex: 0,
              justification: `fixture adjudication against retrieved neighbors for ${h.hypothesisId}`,
            })),
          };
        },
      },
    });

    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain('literature novelty (D-017): 4/4');
    expect(summary).toContain('0 novel / 1 incremental / 0 already_done / 3 unclear');

    // 4 representatives x 2 queries = 8 real searches, each receipted as live source retrieval
    expect(searchCount).toBe(8);
    const nbReceipts = receipts.filter((r) => r.kind === 'source_retrieval');
    expect(nbReceipts).toHaveLength(8);

    const hyps = store.listObjects('hypothesis', run.id);
    const withLit = hyps.filter((h) => h.literatureNovelty !== undefined);
    expect(withLit).toHaveLength(4);
    const first = withLit.find((h) => h.literatureNovelty?.verdict === 'incremental');
    expect(first?.literatureNovelty?.neighbors.length).toBeGreaterThan(0);
    expect(first?.literatureNovelty?.neighbors.every((n) => n.contentHash.length === 64)).toBe(true);
    // corpus doc never resurfaces as a neighbor
    expect(withLit.every((h) => !h.literatureNovelty?.neighbors.some((n) => n.doi === '10.1000/in-corpus'))).toBe(true);
    // two-layer novelty state: corpus-relative label still present alongside the literature layer
    expect(first?.noveltyLabel).toBeDefined();
    expect(first?.literatureNovelty?.justification).toContain('fixture adjudication');
  });

  it('D-017 rate-limit burst: failed novelty searches keep source_retrieval receipts and degrade to unclear', async () => {
    const { store, run } = setup();
    store.putObject('claim', makeClaim(run.id, 'claim one'));
    store.putObject('claim', makeClaim(run.id, 'claim two'));

    let thrown = 0;
    const openalex: SourceAdapter = {
      family: 'openalex',
      async search(query) {
        thrown += 1;
        throw new SourceAdapterError({
          family: 'openalex', query, kind: 'http_status', httpStatus: 429,
          message: 'OpenAlex search failed',
        });
      },
      async resolve() { throw new Error('TEST FIXTURE: resolve not expected'); },
    };

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1], reason: 'paraphrases' }, { memberIndices: [2, 3], reason: 'paraphrases' }, { memberIndices: [4], reason: 'distinct' }, { memberIndices: [5], reason: 'distinct' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 0, noveltyLabel: 'evidence_grounded' }] }) },
    ];
    const { ctx, receipts } = makeCtx(run, store, steps, {
      openalex,
      dynamic: {
        'novelty-check:query-expansion': (req) => {
          const input = (req.userPayload as { input?: { hypotheses?: Array<{ hypothesisId: string }> } }).input;
          return {
            hypotheses: (input?.hypotheses ?? []).map((h) => ({
              hypothesisId: h.hypothesisId,
              queries: ['neighbor paraphrase query', 'neighbor entity mechanism query'],
            })),
          };
        },
      },
    });

    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain('literature novelty (D-017): 4/4');

    // every attempted search failed AND was receipted (receipt invariant for failed retrievals)
    expect(thrown).toBe(8); // 4 representatives x 2 queries
    const failed = receipts.filter((r) => r.kind === 'source_retrieval');
    expect(failed).toHaveLength(8);
    for (const r of failed) {
      const sr = r.sourceRetrieval as { family: string; httpStatus: number; resultCount: number };
      expect(sr.family).toBe('openalex');
      expect(sr.httpStatus).toBe(429);
      expect(sr.resultCount).toBe(0);
    }

    // honest degradation: all literature layers unclear with zero neighbors, no fabrication
    const lit = store.listObjects('hypothesis', run.id).filter((h) => h.literatureNovelty !== undefined);
    expect(lit).toHaveLength(4);
    expect(lit.every((h) => h.literatureNovelty?.verdict === 'unclear' && h.literatureNovelty.neighbors.length === 0)).toBe(true);
  });

  it('skips honestly on an empty verified evidence base and fails fast when cancelled', async () => {
    const { store, run } = setup(); // no claims at all
    const empty = makeCtx(run, store, []);
    const skipped = await generateHypothesesStage.execute(empty.ctx);
    expect(skipped).toMatchObject({ kind: 'skipped' });
    expect(skipped.kind === 'skipped' ? skipped.reason : '').toMatch(/no verified claims/);

    const cancelled = makeCtx(run, store, [{ rawOutput: gen(cand('E1'), cand('E2')) }], {
      cancelled: () => true,
    });
    store.putObject('claim', makeClaim(run.id, 'claim so generation proceeds to the cancel checkpoint'));
    await expect(generateHypothesesStage.execute(cancelled.ctx)).rejects.toThrow(
      /^cancelled by user during generate_hypotheses/,
    );
  });
});

// ---------------------------------------------------------------------------
// critique_falsify
// ---------------------------------------------------------------------------

describe('critique_falsify stage', () => {
  it('writes a complete spec + evidence relations, and rejects a future-work hollow spec deterministically', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'counter claim: replication failed for the duration-dependent off-targeting mechanism');
    const c2 = makeClaim(run.id, 'supporting claim: dose-response increase observed for the duration-dependent off-targeting mechanism');
    store.putObject('claim', c1);
    store.putObject('claim', c2);
    const h1 = makeHyp(run.id, 'duration drives off-targeting', { createdAt: ts(0) });
    const h2 = makeHyp(run.id, 'gRNA structure drives off-targeting', { createdAt: ts(1) });
    const hdup = makeHyp(run.id, 'paraphrase of duration hypothesis', { duplicateOf: h1.id, createdAt: ts(2) });
    for (const h of [h1, h2, hdup]) store.putObject('hypothesis', h);

    const goodSpec = {
      observable: 'off-target edit frequency across exposure durations',
      measurement: 'targeted deep sequencing across a duration gradient of at least six timepoints',
      expectedRelation: 'monotonic increase of off-target rate with deaminase exposure duration',
      decisionRule: '若长暴露组比短暴露组高出至少2倍的脱靶率，则支持假设；若无显著差异则削弱',
      decisionRuleProvenance: 'evidence-derived',
      supportCondition: 'clear dose-response increase replicated across independent cell lines',
      weakeningCondition: 'flat or inconsistent response across the duration gradient',
      falsificationCondition: 'inverse relation or no relation replicated in three independent cell lines',
      confounders: ['cell-cycle state'],
      alternativeExplanations: ['gRNA secondary structure differences'],
      dataRequirements: ['duration-series editing dataset'],
      method: 'controlled exposure series with structure-matched gRNA controls',
      failureInterpretation: 'duration mechanism unsupported; revisit the mechanism class',
      assumptionCritiques: [{ assumptionIndex: 0, critique: 'assumption zero ignores cell-cycle confounding' }],
      counterLinks: [
        {
          claimId: c1.id,
          relation: 'weakens',
          linkReason: 'the replication failure of the duration link directly contradicts this exposure mechanism',
        },
        {
          claimId: 'clm_bogus00000000000000000000aaa',
          relation: 'contradicts',
          linkReason: 'a bogus claim reference that must be dropped with a visible warning',
        },
      ],
      supportingClaimIds: [c2.id],
      supportingLinks: [
        {
          claimId: c2.id,
          linkReason: 'the observed dose-response is the exact monotonic pattern this hypothesis predicts',
        },
      ],
      uncertainties: ['measurement noise at low edit frequencies'],
      testability: 'testable_now',
    };
    const hollowSpec = {
      observable: '某种可以在未来研究中观察的指标',
      measurement: '将来有了合适的数据之后可以进行相应的测量分析工作',
      expectedRelation: '预期将来数据中会出现某种形式的相关趋势',
      decisionRule: '可以在未来的工作中通过更多实验进一步验证这个想法',
      decisionRuleProvenance: 'model-stipulated',
      supportCondition: '如果未来的结果看起来与预期一致就算支持',
      weakeningCondition: '如果未来的结果看起来与预期不一致就算削弱',
      falsificationCondition: '如果未来很多年后依然没有数据那就无法证伪',
      confounders: [],
      alternativeExplanations: [],
      dataRequirements: [],
      method: '未来工作中的一个潜在分析方向',
      failureInterpretation: '如果未来无法验证就说明当前还下不了结论',
      assumptionCritiques: [{ assumptionIndex: 7, critique: 'index out of range is preserved honestly' }],
      counterLinks: [],
      supportingClaimIds: [],
      supportingLinks: [],
      uncertainties: [],
      testability: 'testable_with_data',
    };

    const steps: StubStep[] = [
      { rawOutput: JSON.stringify(goodSpec) },
      { rawOutput: JSON.stringify(hollowSpec) },
    ];
    const { ctx } = makeCtx(run, store, steps);
    expect(await falsifyStage.applicable(ctx)).toBe(true);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain('critique-linked evidence relation');
    expect(summary).toMatch(/REJECTED by deterministic completeness/);
    expect(summary).toContain('clm_bogus00000000000000000000aaa');

    // h1: complete spec accepted, links created, critique attached to the right assumption
    const h1After = store.getObject('hypothesis', h1.id);
    expect(h1After?.falsification?.completenessCheck).toEqual({ passed: true, missing: [] });
    expect(h1After?.falsification?.decisionRuleProvenance).toBe('evidence-derived'); // W5/S3 carried through
    expect(h1After?.testability).toBe('testable_now');
    expect(h1After?.supportingClaimIds).toEqual([c2.id]);
    expect(h1After?.counterClaimIds).toEqual([c1.id]);
    expect(h1After?.assumptions[0]?.uncertainty).toContain('cell-cycle confounding');
    expect(h1After?.uncertainties).toContain('measurement noise at low edit frequencies');

    // W5/S2: link rationales are the model's specific per-link reasons, never a constant template
    const rels = store.listObjects('evidence_relation', run.id);
    expect(rels).toHaveLength(2);
    expect(rels).toContainEqual(
      expect.objectContaining({
        relation: 'weakens', claimId: c1.id, targetHypothesisId: h1.id,
        rationale: 'the replication failure of the duration link directly contradicts this exposure mechanism',
        strength: 'unrated',
      }),
    );
    expect(rels).toContainEqual(
      expect.objectContaining({
        relation: 'supports', claimId: c2.id, targetHypothesisId: h1.id,
        rationale: 'the observed dose-response is the exact monotonic pattern this hypothesis predicts',
      }),
    );
    for (const r of rels) {
      expect(r.rationale).not.toBe('critique-linked counter evidence');
      expect(r.rationale).not.toBe('critique-linked supporting evidence');
    }

    // h2: hollow "future work" spec rejected by the pure check; hypothesis honestly untestable.
    // W5/S3: provenance still stored — 'model-stipulated' survives the completeness rejection.
    const h2After = store.getObject('hypothesis', h2.id);
    expect(h2After?.falsification?.completenessCheck?.passed).toBe(false);
    expect(h2After?.falsification?.completenessCheck?.missing?.join(' ')).toMatch(
      /decisionRule: no decidable comparison semantics/,
    );
    expect(h2After?.falsification?.decisionRuleProvenance).toBe('model-stipulated');
    expect(h2After?.testability).toBe('untestable_currently');
    expect(h2After?.uncertainties.some((u) => u.includes('unattached'))).toBe(true);

    // duplicate untouched; stage no longer applicable once every representative has a spec
    expect(store.getObject('hypothesis', hdup.id)?.falsification).toBeUndefined();
    const after = makeCtx(run, store, []);
    expect(await falsifyStage.applicable(after.ctx)).toBe(false);
  });

  it('W5/S2: without linkReason the rationale falls back to claim text + hypothesis association (never a bare constant)', async () => {
    const { store, run } = setup();
    // 150+ char counter claim text sharing real vocabulary with the hypothesis (topical gate),
    // exactly the first 120 chars may appear, the rest must be elided
    const longCounterText = `${'duration-dependent off-targeting counter evidence sentence. '.repeat(3)}COUNTERTAIL${'D'.repeat(10)}`;
    const cCounter = makeClaim(run.id, longCounterText);
    const longSupportingText = `${'duration-dependent off-targeting supporting evidence sentence. '.repeat(3)}SUPPORTTAIL${'E'.repeat(10)}`;
    const cSupporting = makeClaim(run.id, longSupportingText);
    store.putObject('claim', cCounter);
    store.putObject('claim', cSupporting);
    const h1 = makeHyp(run.id, 'duration drives off-targeting', { createdAt: ts(0) });
    store.putObject('hypothesis', h1);

    const spec = {
      observable: 'off-target edit frequency across exposure durations',
      measurement: 'targeted deep sequencing across a duration gradient of at least six timepoints',
      expectedRelation: 'monotonic increase of off-target rate with deaminase exposure duration',
      decisionRule: 'ratio >= 2x long vs short exposure supports; no increase weakens',
      decisionRuleProvenance: 'community-standard',
      supportCondition: 'clear dose-response increase replicated across independent cell lines',
      weakeningCondition: 'flat or inconsistent response across the duration gradient',
      falsificationCondition: 'inverse relation or no relation replicated in three independent cell lines',
      confounders: [],
      alternativeExplanations: [],
      dataRequirements: [],
      method: 'controlled exposure series with structure-matched gRNA controls',
      failureInterpretation: 'duration mechanism unsupported; revisit the mechanism class',
      assumptionCritiques: [],
      counterLinks: [
        {
          claimId: cCounter.id,
          relation: 'contradicts',
          linkReason: 'explicit per-link reason passes through verbatim without fallback construction',
        },
      ],
      supportingClaimIds: [cSupporting.id],
      supportingLinks: [],
      uncertainties: [],
      testability: 'testable_now',
    };
    const { ctx } = makeCtx(run, store, [{ rawOutput: JSON.stringify(spec) }]);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    const hypShort = h1.id.slice(0, 8);
    const rels = store.listObjects('evidence_relation', run.id);
    expect(rels).toHaveLength(2);
    const counterRel = rels.find((r) => r.claimId === cCounter.id);
    const supportingRel = rels.find((r) => r.claimId === cSupporting.id);
    // counter (schema v2): every counter link carries its own >=20-char reason — passes through verbatim
    expect(counterRel?.rationale).toBe('explicit per-link reason passes through verbatim without fallback construction');
    expect(counterRel?.rationale).not.toContain(hypShort);
    // supporting fallback: a supportingClaimIds entry with no matching supportingLinks reason gets the
    // deterministic claim-text construction — truncated to 120 chars, never a bare constant
    expect(supportingRel?.rationale).toBe(`${longSupportingText.slice(0, 120)}…（与假设 ${hypShort} 的 critique 支持关联）`);
    expect(supportingRel?.rationale).not.toContain('SUPPORTTAIL');
    // never the pre-W5 constant templates
    for (const r of rels) {
      expect(r.rationale).not.toBe('critique-linked counter evidence');
      expect(r.rationale).not.toBe('critique-linked supporting evidence');
    }
  });

  it('topical gate: topically distant critique links are dropped with a warning, never become relations (relation-precision spike root fix)', async () => {
    const { store, run } = setup();
    // Blind re-judging (spikes/relation-precision.mjs, 2026-08-22) measured contradicts
    // precision at 1/8; worst offenders were links with NO shared content vocabulary.
    const distant = makeClaim(run.id, 'quantum error correction thresholds improve under surface code decoding schedules');
    const near = makeClaim(run.id, 'counter claim: duration-independent off-targeting observed across exposure mechanism conditions');
    store.putObject('claim', distant);
    store.putObject('claim', near);
    const h1 = makeHyp(run.id, 'duration drives off-targeting', { createdAt: ts(0) });
    store.putObject('hypothesis', h1);

    const spec = {
      observable: 'off-target edit frequency across exposure durations',
      measurement: 'targeted deep sequencing across a duration gradient of at least six timepoints',
      expectedRelation: 'monotonic increase of off-target rate with deaminase exposure duration',
      decisionRule: 'ratio >= 2x long vs short exposure supports; no increase weakens',
      decisionRuleProvenance: 'community-standard',
      supportCondition: 'clear dose-response increase replicated across independent cell lines',
      weakeningCondition: 'flat or inconsistent response across the duration gradient',
      falsificationCondition: 'inverse relation or no relation replicated in three independent cell lines',
      confounders: [],
      alternativeExplanations: [],
      dataRequirements: [],
      method: 'controlled exposure series with structure-matched gRNA controls',
      failureInterpretation: 'duration mechanism unsupported; revisit the mechanism class',
      assumptionCritiques: [],
      counterLinks: [
        { claimId: distant.id, relation: 'contradicts', linkReason: 'a specific-looking but topically hollow rationale that must not survive the gate' },
        { claimId: near.id, relation: 'contradicts', linkReason: 'the duration-independent observation directly undermines the duration mechanism' },
      ],
      supportingClaimIds: [],
      supportingLinks: [],
      uncertainties: [],
      testability: 'testable_now',
    };
    const { ctx } = makeCtx(run, store, [{ rawOutput: JSON.stringify(spec) }]);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    // dropped link is visible in the summary, and only the overlapping claim becomes a relation
    expect(summary).toContain('topically non-overlapping counter claim link');
    const rels = store.listObjects('evidence_relation', run.id);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.claimId).toBe(near.id);
    expect(rels[0]?.relation).toBe('contradicts');
    // spec-side ids stay consistent with the gated relations
    const h1After = store.getObject('hypothesis', h1.id);
    expect(h1After?.counterClaimIds).toEqual([near.id]);
  });

  it('relation-label discipline (schema v2): explicit labels pass through; absent/unparseable defaults to weakens, never contradicts', async () => {
    const { store, run } = setup();
    const cExplicitContra = makeClaim(run.id, 'counter claim: duration-independent off-targeting mechanism asserted by the exposure study');
    const cExplicitQual = makeClaim(run.id, 'counter claim: duration-dependent off-targeting only under high-dose exposure conditions');
    const cUnlabeled = makeClaim(run.id, 'counter claim: off-targeting duration gradient weaker than the mechanism predicts');
    const cGarbageLabel = makeClaim(run.id, 'counter claim: duration exposure gradient off-targeting evidence with scope limits');
    for (const c of [cExplicitContra, cExplicitQual, cUnlabeled, cGarbageLabel]) store.putObject('claim', c);
    const h1 = makeHyp(run.id, 'duration drives off-targeting', { createdAt: ts(0) });
    store.putObject('hypothesis', h1);

    const spec = {
      observable: 'off-target edit frequency across exposure durations',
      measurement: 'targeted deep sequencing across a duration gradient of at least six timepoints',
      expectedRelation: 'monotonic increase of off-target rate with deaminase exposure duration',
      decisionRule: 'ratio >= 2x long vs short exposure supports; no increase weakens',
      decisionRuleProvenance: 'community-standard',
      supportCondition: 'clear dose-response increase replicated across independent cell lines',
      weakeningCondition: 'flat or inconsistent response across the duration gradient',
      falsificationCondition: 'inverse relation or no relation replicated in three independent cell lines',
      confounders: [],
      alternativeExplanations: [],
      dataRequirements: [],
      method: 'controlled exposure series with structure-matched gRNA controls',
      failureInterpretation: 'duration mechanism unsupported; revisit the mechanism class',
      assumptionCritiques: [],
      counterLinks: [
        { claimId: cExplicitContra.id, relation: 'contradicts', linkReason: 'explicitly asserted incompatibility with the duration mechanism prediction' },
        { claimId: cExplicitQual.id, relation: 'qualifies', linkReason: 'scope condition limiting the duration effect to high-dose exposure only' },
        { claimId: cUnlabeled.id, linkReason: 'weaker-than-predicted gradient reduces confidence in the duration mechanism' },
        { claimId: cGarbageLabel.id, relation: 'DEFINITELY-CONTRADICTS!!', linkReason: 'an unparseable label must never surface as contradicts' },
      ],
      supportingClaimIds: [],
      supportingLinks: [],
      uncertainties: [],
      testability: 'testable_now',
    };
    const { ctx } = makeCtx(run, store, [{ rawOutput: JSON.stringify(spec) }]);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    const rels = store.listObjects('evidence_relation', run.id);
    expect(rels).toHaveLength(4);
    const byClaim = new Map(rels.map((r) => [r.claimId, r.relation] as const));
    expect(byClaim.get(cExplicitContra.id)).toBe('contradicts'); // explicit assertion honored
    expect(byClaim.get(cExplicitQual.id)).toBe('qualifies'); // scope conditions kept out of the counter polarity
    expect(byClaim.get(cUnlabeled.id)).toBe('weakens'); // absent label -> weakens default
    expect(byClaim.get(cGarbageLabel.id)).toBe('weakens'); // unparseable label -> weakens default (zod .catch)
    const h1After = store.getObject('hypothesis', h1.id);
    expect(h1After?.counterClaimIds).toHaveLength(4); // linkage preserved for all gated links
  });

  it('W5/S2: linkReason under 20 characters is a schema failure (fail-closed, no silent template fallback)', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'claim one for the short-reason case');
    store.putObject('claim', c1);
    const h1 = makeHyp(run.id, 'duration drives off-targeting', { createdAt: ts(0) });
    store.putObject('hypothesis', h1);

    const spec = {
      observable: 'off-target edit frequency across exposure durations',
      measurement: 'targeted deep sequencing across a duration gradient of at least six timepoints',
      expectedRelation: 'monotonic increase of off-target rate with deaminase exposure duration',
      decisionRule: 'ratio >= 2x long vs short exposure supports; no increase weakens',
      decisionRuleProvenance: 'evidence-derived',
      supportCondition: 'clear dose-response increase replicated across independent cell lines',
      weakeningCondition: 'flat or inconsistent response across the duration gradient',
      falsificationCondition: 'inverse relation or no relation replicated in three independent cell lines',
      confounders: [],
      alternativeExplanations: [],
      dataRequirements: [],
      method: 'controlled exposure series with structure-matched gRNA controls',
      failureInterpretation: 'duration mechanism unsupported; revisit the mechanism class',
      assumptionCritiques: [],
      counterClaimIds: [c1.id],
      weakeningClaimIds: [],
      counterLinks: [{ claimId: c1.id, linkReason: 'too short' }], // < 20 chars -> schema rejection
      supportingClaimIds: [],
      supportingLinks: [],
      uncertainties: [],
      testability: 'testable_now',
    };
    const { ctx } = makeCtx(run, store, [{ rawOutput: JSON.stringify(spec) }]);
    await expect(falsifyStage.execute(ctx)).rejects.toThrow(/invalid_output/);
    expect(store.listObjects('evidence_relation', run.id)).toHaveLength(0);
    expect(store.getObject('hypothesis', h1.id)?.falsification).toBeUndefined();
  });

  it('W5/S3: a missing decisionRuleProvenance is a schema failure for new specs (the field is mandatory in the LLM contract)', async () => {
    const { store, run } = setup();
    store.putObject('claim', makeClaim(run.id, 'claim one'));
    const h1 = makeHyp(run.id, 'duration drives off-targeting', { createdAt: ts(0) });
    store.putObject('hypothesis', h1);

    const spec = {
      observable: 'off-target edit frequency across exposure durations',
      measurement: 'targeted deep sequencing across a duration gradient of at least six timepoints',
      expectedRelation: 'monotonic increase of off-target rate with deaminase exposure duration',
      decisionRule: 'ratio >= 2x long vs short exposure supports; no increase weakens',
      // decisionRuleProvenance intentionally omitted
      supportCondition: 'clear dose-response increase replicated across independent cell lines',
      weakeningCondition: 'flat or inconsistent response across the duration gradient',
      falsificationCondition: 'inverse relation or no relation replicated in three independent cell lines',
      confounders: [],
      alternativeExplanations: [],
      dataRequirements: [],
      method: 'controlled exposure series with structure-matched gRNA controls',
      failureInterpretation: 'duration mechanism unsupported; revisit the mechanism class',
      assumptionCritiques: [],
      counterLinks: [],
      supportingClaimIds: [],
      supportingLinks: [],
      uncertainties: [],
      testability: 'testable_now',
    };
    const { ctx } = makeCtx(run, store, [{ rawOutput: JSON.stringify(spec) }]);
    await expect(falsifyStage.execute(ctx)).rejects.toThrow(/invalid_output.*decisionRuleProvenance|decisionRuleProvenance.*invalid_output/s);
    expect(store.getObject('hypothesis', h1.id)?.falsification).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe('rank stage', () => {
  it('computes deterministic weighted ranks with evidence_grounding tie-break, filters refs, emits comparison artifact', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'evidence claim one');
    const c2 = makeClaim(run.id, 'evidence claim two');
    store.putObject('claim', c1);
    store.putObject('claim', c2);
    const ha = makeHyp(run.id, 'hypothesis A (tie, higher grounding)', { createdAt: ts(0) });
    const hb = makeHyp(run.id, 'hypothesis B (tie, lower grounding)', { createdAt: ts(1) });
    const hc = makeHyp(run.id, 'hypothesis C (lower)', { createdAt: ts(2) });
    const hdup = makeHyp(run.id, 'duplicate of A', { duplicateOf: ha.id, createdAt: ts(3) });
    for (const h of [ha, hb, hc, hdup]) store.putObject('hypothesis', h);

    // A composite = 0.2*0.8 + 0.8-weighted rest at 0.5 = 0.56
    // B composite = 0.2*0.6 + rest at 0.55             = 0.56  -> tie broken by evidence_grounding
    // C composite = (0.3 + 0.05*(1-0.2)) / 1.05        = 0.3238 (direction-known resource_cost)
    const rankOut = {
      assessments: [
        {
          hypothesisId: ha.id,
          dimensions: [
            ...CORE_DIMS(0.5).slice(0, 1).map((d) => ({ ...d, value: 0.8, evidenceClaimIds: [c1.id, 'clm_bogus00000000000000000000aaa'] })),
            ...CORE_DIMS(0.5).slice(1),
            dim('uncertainty', null),
          ],
        },
        {
          hypothesisId: hb.id,
          dimensions: [{ ...dim('evidence_grounding', 0.6) }, ...CORE_DIMS(0.55).slice(1), dim('uncertainty', null)],
        },
        {
          hypothesisId: hc.id,
          dimensions: [...CORE_DIMS(0.3), dim('uncertainty', null), dim('resource_cost', 0.2, { direction: 'higher_value_is_worse' })],
        },
        { hypothesisId: 'hyp_unknown0000000000000000000aaa', dimensions: [...CORE_DIMS(0.5), dim('uncertainty', null)] },
      ],
    };
    const { ctx, artifacts } = makeCtx(run, store, [
      { rawOutput: JSON.stringify(rankOut) },
      // D-016 tournament, seed order [ha, hb, hc] -> circle rounds: (hb, hc), (ha, hc), (ha, hb)
      { rawOutput: JSON.stringify({ aFirstVerdict: 'a', bFirstVerdict: 'a', rationale: 'fixture judgement: first hypothesis has the sharper decision rule' }) },
      { rawOutput: JSON.stringify({ aFirstVerdict: 'a', bFirstVerdict: 'a', rationale: 'fixture judgement: first hypothesis is better grounded in claims' }) },
      { rawOutput: JSON.stringify({ aFirstVerdict: 'a', bFirstVerdict: 'a', rationale: 'fixture judgement: first hypothesis is more falsifiable' }) },
    ]);
    expect(await rankStage.applicable(ctx)).toBe(true);
    const outcome = await rankStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/ranked 3 of 3/);
    expect(summary).toContain('hyp_unknown0000000000000000000aaa');
    expect(summary).toContain('clm_bogus00000000000000000000aaa');
    expect(summary).toContain('tournament: 3 pair(s) judged');

    const cards = store.listObjects('scorecard', run.id);
    expect(cards).toHaveLength(3); // duplicate hdup and unknown id never scored
    const cardOf = (h: string) => cards.find((c) => c.hypothesisId === h);
    expect(cardOf(ha.id)).toMatchObject({ rank: 1, rankedOutOf: 3 });
    expect(cardOf(hb.id)).toMatchObject({ rank: 2, rankedOutOf: 3 });
    expect(cardOf(hc.id)).toMatchObject({ rank: 3, rankedOutOf: 3 });
    expect(cardOf(ha.id)?.overallRationale).toContain('0.5600');
    expect(cardOf(hc.id)?.overallRationale).toContain('0.3238');
    expect(cardOf(ha.id)?.overallRationale).toContain('evidence_grounding 0.2');
    expect(cardOf(ha.id)?.comparisonNote).toBe(COMPARISON_NOTE);
    for (const c of cards) {
      expect(c.dimensions.every((d) => d.producer === 'test-stub/test-stub structured critique')).toBe(true);
      expect(c.dimensions.every((d) => d.calibration === 'uncalibrated_llm_judgment')).toBe(true);
    }
    const eg = cardOf(ha.id)?.dimensions.find((d) => d.dimension === 'evidence_grounding');
    expect(eg?.evidenceClaimIds).toEqual([c1.id]); // invalid ref filtered

    // deterministic top-2 comparison persisted as a content-addressed artifact
    const refs = outcome.kind === 'done' ? outcome.artifacts ?? [] : [];
    expect(refs).toHaveLength(1);
    const comparison = JSON.parse((await artifacts.get(refs[0] as string)) ?? '{}');
    expect(comparison).toMatchObject({ runId: run.id, aId: ha.id, bId: hb.id, preferred: 'a' });
    expect(comparison.criteria.length).toBeGreaterThanOrEqual(3);
    expect(comparison.criteria.some((c: { favors: string }) => c.favors === 'a')).toBe(true);
    expect(comparison.criteria.some((c: { favors: string }) => c.favors === 'b')).toBe(true);

    // D-016: tournament persisted with all 3 matches, order-swapped verdicts, standings
    const tournaments = store.listObjects('tournament', run.id);
    expect(tournaments).toHaveLength(1);
    const trn = tournaments[0]!;
    expect(trn.matches).toHaveLength(3);
    expect(trn.matches.every((m) => m.outcome === 'a' || m.outcome === 'b' || m.outcome === 'tie')).toBe(true);
    expect(trn.algorithm).toBe('bradley-terry-ilsr-v1');
    expect(trn.uncertainty.length).toBeGreaterThan(20);
    expect(trn.standings.map((s) => [s.hypothesisId, s.rank])).toEqual([
      [ha.id, 1],
      [hb.id, 2],
      [hc.id, 3],
    ]);
    const haStanding = trn.standings.find((s) => s.hypothesisId === ha.id);
    expect(haStanding).toMatchObject({ wins: 2, losses: 0, ties: 0, winRate: 1 });
    // head-to-head criterion recorded from the tournament (top-2 met in the schedule)
    expect(
      comparison.criteria.some(
        (c: { criterion: string; favors: string }) =>
          c.criterion === 'pairwise_tournament_head_to_head' && c.favors === 'a',
      ),
    ).toBe(true);
    // scorecards disclose the tournament record in their rationale
    expect(cardOf(ha.id)?.overallRationale).toContain('2W-0L-0T');
    expect(cardOf(ha.id)?.overallRationale).toContain('bt=');

    // all representatives scored -> not applicable anymore
    const after = makeCtx(run, store, []);
    expect(await rankStage.applicable(after.ctx)).toBe(false);
  });

  it('records judge-call failures as honest no-contests and falls back to composite ordering (D-016 fail-visible)', async () => {
    const { store, run } = setup();
    const h1 = makeHyp(run.id, 'hypothesis one', { createdAt: ts(0) });
    const h2 = makeHyp(run.id, 'hypothesis two', { createdAt: ts(1) });
    const h3 = makeHyp(run.id, 'hypothesis three', { createdAt: ts(2) });
    for (const h of [h1, h2, h3]) store.putObject('hypothesis', h);
    const rankOut = {
      assessments: [
        { hypothesisId: h1.id, dimensions: [...CORE_DIMS(0.8), dim('uncertainty', null)] },
        { hypothesisId: h2.id, dimensions: [...CORE_DIMS(0.6), dim('uncertainty', null)] },
        { hypothesisId: h3.id, dimensions: [...CORE_DIMS(0.4), dim('uncertainty', null)] },
      ],
    };
    const { ctx } = makeCtx(run, store, [
      { rawOutput: JSON.stringify(rankOut) },
      { fail: { kind: 'provider_error', message: 'fixture judge outage 1' } },
      { fail: { kind: 'provider_error', message: 'fixture judge outage 2' } },
      { fail: { kind: 'provider_error', message: 'fixture judge outage 3' } },
    ]);
    const outcome = await rankStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain('0 contested, 3 no-contest');
    const trn = store.listObjects('tournament', run.id)[0]!;
    expect(trn.matches.every((m) => m.outcome === 'no_contest')).toBe(true);
    expect(trn.matches.every((m) => m.rationale.includes('not judged'))).toBe(true);
    // all-neutral BT (1.0) -> deterministic composite tie-break decides the order
    const cards = store.listObjects('scorecard', run.id);
    expect(cards.find((c) => c.hypothesisId === h1.id)?.rank).toBe(1);
    expect(cards.find((c) => c.hypothesisId === h2.id)?.rank).toBe(2);
    expect(cards.find((c) => c.hypothesisId === h3.id)?.rank).toBe(3);
  });

  it('treats order-swap verdict disagreement as an honest tie, never a position-bias win (D-016)', async () => {
    const { store, run } = setup();
    const h1 = makeHyp(run.id, 'hypothesis one', { createdAt: ts(0) });
    const h2 = makeHyp(run.id, 'hypothesis two', { createdAt: ts(1) });
    store.putObject('hypothesis', h1);
    store.putObject('hypothesis', h2);
    const rankOut = {
      assessments: [
        { hypothesisId: h1.id, dimensions: [...CORE_DIMS(0.7), dim('uncertainty', null)] },
        { hypothesisId: h2.id, dimensions: [...CORE_DIMS(0.5), dim('uncertainty', null)] },
      ],
    };
    // n=2 -> one round -> one match (h1 vs h2); judge verdicts FLIP across the swap.
    const { ctx } = makeCtx(run, store, [
      { rawOutput: JSON.stringify(rankOut) },
      { rawOutput: JSON.stringify({ aFirstVerdict: 'a', bFirstVerdict: 'b', rationale: 'fixture contradictory verdicts across presentation order' }) },
    ]);
    const outcome = await rankStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const trn = store.listObjects('tournament', run.id)[0]!;
    expect(trn.matches).toHaveLength(1);
    expect(trn.matches[0]).toMatchObject({ outcome: 'tie' });
    expect(trn.standings.every((s) => s.ties === 1)).toBe(true);
    // equal BT -> composite tie-break keeps h1 first
    expect(store.listObjects('scorecard', run.id).find((c) => c.hypothesisId === h1.id)?.rank).toBe(1);
  });

  it('reports unscored representatives honestly when the model returns no usable assessment for them', async () => {
    const { store, run } = setup();
    const h1 = makeHyp(run.id, 'scored hypothesis', { createdAt: ts(0) });
    const h2 = makeHyp(run.id, 'unscored hypothesis', { createdAt: ts(1) });
    store.putObject('hypothesis', h1);
    store.putObject('hypothesis', h2);
    const out = { assessments: [{ hypothesisId: h1.id, dimensions: [...CORE_DIMS(0.7), dim('uncertainty', null)] }] };
    const { ctx } = makeCtx(run, store, [{ rawOutput: JSON.stringify(out) }]);
    const outcome = await rankStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain(h2.id);
    expect(summary).toMatch(/no usable assessment/);
    const cards = store.listObjects('scorecard', run.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ hypothesisId: h1.id, rank: 1, rankedOutOf: 1 });
    expect(outcome.kind === 'done' ? outcome.artifacts ?? [] : []).toHaveLength(0); // no top-2 with n=1
    const after = makeCtx(run, store, []);
    expect(await rankStage.applicable(after.ctx)).toBe(true); // h2 still unscored
  });
});

// ---------------------------------------------------------------------------
// pure functions (no LLM, no I/O)
// ---------------------------------------------------------------------------

describe('deterministic falsification completeness check (pure)', () => {
  const good = {
    observable: 'off-target edit frequency per exposure duration',
    measurement: 'targeted deep sequencing across a duration gradient',
    expectedRelation: 'monotonic increase with duration',
    decisionRule: 'support if ratio >= 2x long vs short; weaken if flat',
    supportCondition: 'dose-response present across independent lines',
    weakeningCondition: 'flat response across the full gradient',
    falsificationCondition: 'inverse or no relationship in three lines',
    method: 'controlled exposure series with matched controls',
    failureInterpretation: 'duration hypothesis unsupported; revisit mechanism',
  };
  it('accepts a spec with non-trivial fields and a decidable rule', () => {
    expect(checkFalsificationCompleteness(good)).toEqual({ passed: true, missing: [] });
  });
  it('rejects hollow future-work specs and trivial fields', () => {
    const hollow = { ...good, decisionRule: 'this idea can be verified by more experiments in future work' };
    const r = checkFalsificationCompleteness(hollow);
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toMatch(/no decidable comparison semantics/);
    const trivial = { ...good, observable: 'tbd', method: 'n/a' };
    const r2 = checkFalsificationCompleteness(trivial);
    expect(r2.passed).toBe(false);
    expect(r2.missing.filter((m) => m.startsWith('observable')).length).toBe(1);
    expect(r2.missing.filter((m) => m.startsWith('method')).length).toBe(1);
  });
  it('recognizes comparison and if-then semantics only', () => {
    for (const ok of ['若长期暴露则脱靶率至少翻倍', 'ratio >= 1.5 supports', '阈值 0.05', 'increase > 20%']) {
      expect(hasDecidableSemantics(ok)).toBe(true);
    }
    for (const bad of ['future work may verify this', '进一步验证', 'to be determined later on']) {
      expect(hasDecidableSemantics(bad)).toBe(false);
    }
  });
});

describe('deterministic composite scoring (pure)', () => {
  it('core weights are fixed, transparent and sum to 1.0', () => {
    expect(RANK_WEIGHTS).toEqual({
      evidence_grounding: 0.2,
      falsifiability: 0.15,
      testability: 0.1,
      counter_evidence_exposure: 0.15,
      scientific_plausibility: 0.15,
      novelty: 0.1,
      methodological_soundness: 0.15,
    });
    expect(Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 12);
  });
  it('excludes null dimensions from numerator AND denominator', () => {
    const r = compositeScore([
      { dimension: 'evidence_grounding', value: null },
      { dimension: 'falsifiability', value: 0.5 },
      { dimension: 'testability', value: 1 },
    ]);
    expect(r?.value).toBeCloseTo((0.15 * 0.5 + 0.1 * 1) / 0.25, 12);
    expect(r?.included).toEqual(['falsifiability', 'testability']);
    expect(r?.excluded.join(' ')).toMatch(/evidence_grounding: value null/);
  });
  it('handles direction-known and direction-unclear cost/risk dimensions', () => {
    const known = compositeScore([
      { dimension: 'evidence_grounding', value: 1 },
      { dimension: 'risk', value: 0.8, direction: 'higher_value_is_worse' },
    ]);
    expect(known?.value).toBeCloseTo((0.2 * 1 + 0.05 * 0.2) / 0.25, 12);
    const unclear = compositeScore([
      { dimension: 'evidence_grounding', value: 1 },
      { dimension: 'risk', value: 0.8, direction: 'unclear' },
    ]);
    expect(unclear?.value).toBeCloseTo(1, 12);
    expect(unclear?.excluded.join(' ')).toMatch(/risk: direction unclear/);
  });
  it('returns null when nothing is scoreable', () => {
    expect(compositeScore([{ dimension: 'evidence_grounding', value: null }])).toBeNull();
    expect(compositeScore([])).toBeNull();
  });
});

describe('pairwise tournament machinery (pure, D-016)', () => {
  it('circleSchedule gives every participant real matches (odd n includes BYE rounds)', () => {
    // n=3: 3 rounds -> full round-robin, everyone plays twice
    const pairs3 = circleSchedule(['A', 'B', 'C'], tournamentRounds(3));
    expect(tournamentRounds(3)).toBe(3);
    const played = new Map<string, number>([['A', 0], ['B', 0], ['C', 0]]);
    for (const p of pairs3) {
      played.set(p.aId, played.get(p.aId)! + 1);
      played.set(p.bId, played.get(p.bId)! + 1);
    }
    expect([...played.values()].every((v) => v === 2)).toBe(true);
    expect(pairs3).toHaveLength(3);
    // n=4: rounds capped at 5 -> full round robin of 6 pairs, 3 each
    const pairs4 = circleSchedule(['A', 'B', 'C', 'D'], tournamentRounds(4));
    expect(pairs4).toHaveLength(6);
    // n=8: rounds capped at 5 -> 20 pairs, 5 each (Si et al. sweet spot)
    const pairs8 = circleSchedule(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], tournamentRounds(8));
    expect(pairs8).toHaveLength(20);
    const counts8 = new Map<string, number>();
    for (const p of pairs8) {
      counts8.set(p.aId, (counts8.get(p.aId) ?? 0) + 1);
      counts8.set(p.bId, (counts8.get(p.bId) ?? 0) + 1);
    }
    expect([...counts8.values()].every((v) => v === 5)).toBe(true);
  });

  it('aggregateOutcome: consistency required across the order swap', () => {
    expect(aggregateOutcome({ aFirstVerdict: 'a', bFirstVerdict: 'a' })).toBe('a');
    expect(aggregateOutcome({ aFirstVerdict: 'b', bFirstVerdict: 'b' })).toBe('b');
    expect(aggregateOutcome({ aFirstVerdict: 'tie', bFirstVerdict: 'tie' })).toBe('tie');
    expect(aggregateOutcome({ aFirstVerdict: 'a', bFirstVerdict: 'b' })).toBe('tie'); // position-bias disagreement -> no signal
    expect(aggregateOutcome({ aFirstVerdict: 'a', bFirstVerdict: 'incomparable' })).toBe('no_contest');
    expect(aggregateOutcome({ aFirstVerdict: 'incomparable', bFirstVerdict: 'incomparable' })).toBe('no_contest');
  });

  it('bradleyTerry ranks by strength; ties split points; winless-but-contested sinks to 0', () => {
    const ids = ['W', 'N', 'L'];
    const standings = bradleyTerry(ids, [
      { aId: 'W', bId: 'N', outcome: 'a' },
      { aId: 'W', bId: 'L', outcome: 'a' },
      { aId: 'N', bId: 'L', outcome: 'b' }, // L beats N
    ]);
    const by = new Map(standings.map((s) => [s.hypothesisId, s] as const));
    // W 2-0 > L 1-1 > N 0-2 — strictly ordered strengths
    expect(by.get('W')!.btScore).toBeGreaterThan(by.get('L')!.btScore);
    expect(by.get('L')!.btScore).toBeGreaterThan(by.get('N')!.btScore);
    expect(by.get('W')).toMatchObject({ wins: 2, losses: 0 });
    expect(by.get('L')).toMatchObject({ wins: 1, losses: 1 });
    expect(by.get('N')).toMatchObject({ wins: 0, losses: 2 });
    // tie match splits half-points to both sides
    const tieSt = bradleyTerry(['X', 'Y'], [{ aId: 'X', bId: 'Y', outcome: 'tie' }]);
    expect(tieSt[0]).toMatchObject({ wins: 0, losses: 0, ties: 1 });
    expect(tieSt[0]!.btScore).toBeCloseTo(tieSt[1]!.btScore, 6);
    // no contested matches -> everyone stays neutral 1.0
    const neutral = bradleyTerry(['P', 'Q'], []);
    expect(neutral.every((s) => s.btScore === 1)).toBe(true);
  });
});
