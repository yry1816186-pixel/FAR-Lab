import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProvenanceReceipt, ResearchQuestion, ResearchRun, newId } from '../src/domain/index.js';
import type { SourceFamily, SourceIdentifier, PublicationType } from '../src/domain/source.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { CitationChaseAdapter, RawSourceRecord, SourceAdapter } from '../src/shared/ports.js';
import type { StageContext } from '../src/pipeline/types.js';
import { retrieveStage } from '../src/pipeline/stages/retrieve.js';

/**
 * KNOWN-ANSWERER RETRIEVAL BENCHMARK (offline, deterministic, zero network).
 *
 * Runs the REAL retrieveStage over a fixture universe with a KNOWN gold set and
 * measures retrieval quality end-to-end: known-answer recall@cap, counter-
 * evidence recall, version/preprint dedup, hard-negative non-merge, citation-
 * chain recall (a gold doc reachable ONLY through the citation graph), source
 * diversity, recent-vs-classic year spread, and search-saturation honesty.
 *
 * The model provider is the TEST-ONLY scripted stub (purpose-keyed) and every
 * adapter is an in-memory fake — this benchmark exercises FUSION/DEDUP/SELECTION
 * code, not model quality; LLM self-evaluation is never the judge.
 *
 * Fixture universe (16 unique works + 1 merged version pair + 1 hard negative):
 *   GOLD      G1,G2 supporting; G3,G4 counter; G5 foundational (chase-only).
 *   VERSION   V-pre (arXiv 2401.01234) == V-pub (doi:10.1/vpub) — must merge.
 *   HARDNEG   H1 — same topic, near title, DIFFERENT work — must NOT merge.
 *   FILLER    F1..F9 — ranked below/near gold, drive pool > cap (rerank path).
 */

const QUESTION_TEXT =
  'Does intermittent fasting improve insulin sensitivity in adults compared with continuous calorie restriction?';

const makeQuestion = (): ResearchQuestion =>
  ResearchQuestion.parse({
    id: newId('q'),
    text: QUESTION_TEXT,
    background: '',
    goalType: 'exploratory',
    scope: {
      domain: 'nutrition science',
      phenomena: ['insulin sensitivity under dietary restriction'],
      inScope: ['human adult studies'],
      outOfScope: [],
    },
    constraints: {
      assumptions: [],
      dataConstraints: [],
      resourceConstraints: [],
      ethicalConstraints: [],
      methodologicalConstraints: [],
    },
    createdAt: new Date().toISOString(),
  });

/**
 * Per-doc abstract: title tokens + id-derived vocabulary repeated into a LONG body.
 * The shared boilerplate stays short (5 words) so the 3-gram shingle mass is
 * dominated by per-document text — MinHash near-dup must NOT false-merge these
 * (a template-dominated abstract would push pairwise jaccard over the 0.5 merge
 * threshold; that sensitivity is documented in the lane handoff).
 */
const abstractFor = (title: string, id: string): string => {
  const slug = id.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'fixture';
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const body: string[] = [];
  for (let i = 0; i < 30; i += 1) body.push(`${words[i % words.length]}-${slug}-${i}`);
  return `Synthetic fixture abstract: ${body.join(' ')}.`;
};

const rec = (
  title: string,
  ids: Array<{ kind: SourceIdentifier['kind']; value: string }>,
  extra: Partial<RawSourceRecord> = {},
): RawSourceRecord => ({
  identifiers: ids.map((i) => ({ kind: i.kind, value: i.value })),
  title,
  publicationYear: 2022,
  authors: ['Fixture Author'],
  contentDepth: 'abstract',
  accessState: 'open',
  abstractText: abstractFor(title, ids[0]?.value ?? title),
  normalized: { title, fixture: true },
  ...extra,
});

/* ------------------------------ fixture universe ------------------------------ */

const GOLD_SUPPORT = [
  rec(
    'Intermittent fasting improves insulin sensitivity in adults a randomized controlled trial',
    [
      { kind: 'doi', value: '10.1/g1' },
      { kind: 'openalex', value: 'W101' },
    ],
    { publicationYear: 2022, publicationType: 'primary_research' as PublicationType },
  ),
  rec(
    'Time restricted eating alters glucose metabolism in adults without caloric restriction',
    [
      { kind: 'doi', value: '10.1/g2' },
      { kind: 'openalex', value: 'W102' },
    ],
    { publicationYear: 2024, publicationType: 'primary_research' as PublicationType },
  ),
];

const GOLD_COUNTER = [
  rec(
    'Intermittent fasting shows no insulin sensitivity benefit a failed replication',
    [
      { kind: 'doi', value: '10.1/g3c' },
      { kind: 'openalex', value: 'W301' },
    ],
    { publicationYear: 2024, publicationType: 'primary_research' as PublicationType },
  ),
  rec(
    'Methodological limitations of intermittent fasting trials a systematic critique',
    [{ kind: 'doi', value: '10.1/g4c' }],
    { publicationYear: 2023, publicationType: 'review' as PublicationType },
  ),
];

/** Gold reachable ONLY via backward citation chase from G1 (never in keyword results). */
const GOLD_CHASE = rec(
  'Hyperinsulinemic euglycemic clamp methodology for insulin sensitivity measurement',
  [
    { kind: 'doi', value: '10.1/g5' },
    { kind: 'openalex', value: 'W900' },
  ],
  { publicationYear: 1998, publicationType: 'primary_research' as PublicationType },
);

const FILLER = (n: number, year = 2021): RawSourceRecord =>
  rec(`Fixture filler study number ${n} on dietary interventions and metabolic outcomes`, [{ kind: 'doi', value: `10.1/f${n}` }], {
    publicationYear: year,
    publicationType: 'primary_research' as PublicationType,
  });

const F9 = rec('Citing filler review of dietary pattern assessment methods', [{ kind: 'openalex', value: 'W777' }], {
  publicationYear: 2020,
  publicationType: 'review' as PublicationType,
});

/** Version pair: arXiv preprint (arxiv id only) == published DOI version (same normalized title + year). */
const V_PRE = rec(
  'Effects of Intermittent Fasting on Insulin Sensitivity: A 12-Week Randomized Study',
  [{ kind: 'arxiv', value: '2401.01234' }],
  { publicationYear: 2021, publicationType: 'preprint' as PublicationType },
);
const V_PUB = rec(
  'Effects of intermittent fasting on insulin sensitivity: a 12-week randomized study',
  [{ kind: 'doi', value: '10.1/vpub' }],
  { publicationYear: 2021, publicationType: 'primary_research' as PublicationType },
);

/** Hard negative: near-identical title, DIFFERENT work (different population + finding). */
const HARD_NEG = rec(
  'Effects of intermittent fasting on insulin sensitivity a 12 week randomized study in adolescents',
  [{ kind: 'doi', value: '10.1/h1' }],
  { publicationYear: 2021, publicationType: 'primary_research' as PublicationType },
);

/* ------------------------------ scripted plan ------------------------------ */

const PLAN = {
  discovery: ['intermittent fasting insulin sensitivity trial', 'time restricted eating glucose metabolism'],
  supporting: ['intermittent fasting insulin sensitivity randomized trial'],
  counter: [
    'intermittent fasting insulin sensitivity failed replication',
    'intermittent fasting insulin sensitivity limitations critique',
  ],
};

/* ------------------------------ search universe ------------------------------ */
// Ranks are engineered so fused order (RRF k=60) is fully determined:
// G2 (5 lists) > G1 (3) > F1 (3x lower ranks) > G3 (2) > G4 (2) > F4/F3 > V > F5 > F7 > G5 (chase) > F2/F8/F9 > H1 > F6.

const [G1, G2] = GOLD_SUPPORT;
const [G3, G4] = GOLD_COUNTER;

const SEARCHES: Record<string, RawSourceRecord[]> = {
  // counter[0] -> openalex, europepmc; counter[1] -> crossref
  'oa:intermittent fasting insulin sensitivity failed replication': [G3, G1, FILLER(1)],
  'epmc:intermittent fasting insulin sensitivity failed replication': [G3, G4, HARD_NEG],
  'cr:intermittent fasting insulin sensitivity limitations critique': [G4, FILLER(2)],
  // discovery[0] -> openalex, arxiv, crossref
  'oa:intermittent fasting insulin sensitivity trial': [G1, G2, FILLER(1), V_PUB],
  'arxiv:intermittent fasting insulin sensitivity trial': [V_PRE, FILLER(4)],
  'cr:intermittent fasting insulin sensitivity trial': [G2, FILLER(3), FILLER(5), FILLER(6)],
  // discovery[1] -> openalex, arxiv, crossref
  'oa:time restricted eating glucose metabolism': [G2, FILLER(5), FILLER(7)],
  'arxiv:time restricted eating glucose metabolism': [FILLER(4), FILLER(8)],
  'cr:time restricted eating glucose metabolism': [FILLER(5), FILLER(7)],
  // supporting[0] -> openalex, arxiv, crossref (ALL already-seen: saturation tail)
  'oa:intermittent fasting insulin sensitivity randomized trial': [G1, G2, FILLER(1)],
  'arxiv:intermittent fasting insulin sensitivity randomized trial': [V_PRE, FILLER(4)],
  'cr:intermittent fasting insulin sensitivity randomized trial': [G2, FILLER(3)],
};

const fakeAdapter = (
  family: SourceFamily,
  key: string,
  opts: { citations?: CitationChaseAdapter } = {},
): SourceAdapter => ({
  family,
  async search(query) {
    const records = SEARCHES[`${key}:${query}`];
    if (records === undefined) throw new Error(`TEST FIXTURE: no scripted results for ${key}:${query}`);
    return { family, query, httpStatus: 200, records: [...records], latencyMs: 1 };
  },
  async resolve() {
    return { found: false, httpStatus: 404 };
  },
  ...(opts.citations !== undefined ? { citations: opts.citations } : {}),
});

/** Scripted citation graph: only G1 carries references (the chase gold path). */
const chaseAdapter = (calls: string[]): CitationChaseAdapter => ({
  async referencedWorkIds(workRef) {
    calls.push(`refs:${workRef}`);
    if (workRef === 'W101') return ['W900', 'W777'];
    return [];
  },
  async citingWorks(workRef) {
    calls.push(`cites:${workRef}`);
    return [];
  },
  async worksByIds(ids) {
    calls.push(`batch:${ids.join('|')}`);
    if (ids.includes('W900')) return [GOLD_CHASE, F9];
    return [];
  },
});

/* ------------------------------ env assembly ------------------------------ */

const openDbs: Db[] = [];
const tempDirs: string[] = [];

const makeEnv = (steps: StubStep[], adapters: Partial<Record<SourceFamily, SourceAdapter>>) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'farlab-known-answer-'));
  tempDirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  openDbs.push(db);
  const store = new Store(db);
  const artifacts = openArtifactStore(path.join(dir, 'artifacts'));
  const question = makeQuestion();
  const now = new Date().toISOString();
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: question.id,
    status: 'created',
    currentStage: 'scope',
    stages: STAGE_ALL.map((stage) => ({ stage, state: 'pending' })),
    createdAt: now,
    updatedAt: now,
    tags: [],
  });
  store.putObject('question', question);
  db.prepare(
    'INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), now, now);
  const ctx: StageContext = {
    run,
    store,
    artifacts,
    provider: createTestStubProvider(steps),
    sourceFor: (family) => {
      const adapter = adapters[family];
      if (!adapter) throw new Error(`TEST FIXTURE: no fake adapter registered for ${family}`);
      return adapter;
    },
    recordReceipt: (partial) => {
      const receipt = ProvenanceReceipt.parse({
        ...partial,
        id: newId('rcp'),
        runId: run.id,
        at: partial.at ?? new Date().toISOString(),
      });
      store.putObject('receipt', receipt);
    },
    cancelled: () => false,
    log: () => {},
  };
  return { ctx, store, run };
};

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------ the benchmark ------------------------------ */

describe('known-answer retrieval benchmark (offline, real stage code)', () => {
  it('recall@cap: all supporting gold docs make the corpus', async () => {
    const chaseCalls: string[] = [];
    const openalex = fakeAdapter('openalex', 'oa', { citations: chaseAdapter(chaseCalls) });
    // Identity rerank permutation is scripted for the FULL pool (16 entries —
    // applyRerank validates every index exactly once, so a pool-size drift fails loudly).
    const identityRerank = Array.from({ length: 16 }, (_, i) => ({
      index: i,
      relevance: i < 12 ? ('high' as const) : ('low' as const),
      reason: 'fixture identity permutation preserves fused order',
    }));
    const env = makeEnv(
      [
        { forPurpose: 'query-planning', rawOutput: JSON.stringify(PLAN) },
        { forPurpose: 'listwise-rerank', rawOutput: JSON.stringify({ ranked: identityRerank }) },
      ],
      { openalex, arxiv: fakeAdapter('arxiv', 'arxiv'), crossref: fakeAdapter('crossref', 'cr'), europepmc: fakeAdapter('europepmc', 'epmc') },
    );

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    const corpus = env.store.listObjects('corpus_snapshot', env.run.id)[0];
    if (!corpus) throw new Error('no corpus snapshot persisted');
    const docs = corpus.documentIds.map((id) => env.store.getObject('source_document', id));
    const docIs = (needle: RawSourceRecord): boolean =>
      docs.some((d) => d !== null && d.identifiers.some((i) => needle.identifiers.some((n) => n.value === i.value)));

    // --- known-answer recall@12: 5/5 gold (G1 G2 supporting, G3 G4 counter, G5 chase-only)
    for (const gold of [...GOLD_SUPPORT, ...GOLD_COUNTER, GOLD_CHASE]) {
      expect(docIs(gold), `gold doc missing from corpus: ${gold.title}`).toBe(true);
    }
    const recall = (5 / 5).toFixed(2);

    // --- counter-evidence recall: both counter golds survived the cap (seat floor evidence)
    expect(docIs(G3) && docIs(G4)).toBe(true);

    // --- citation-chain recall: G5 reached ONLY via backward chase from G1
    expect(docIs(GOLD_CHASE)).toBe(true);
    expect(corpus.fusion?.citationChase).toMatchObject({ seeds: 3, backward: 2, forward: 0, added: 2 });
    expect(corpus.queries.some((q) => q.purpose === 'citation_chase' && q.text === 'refs:W101')).toBe(true);
    expect(chaseCalls).toContain('batch:W900|W777');

    // --- version/preprint dedup: V-pre + V-pub are ONE pool entry (poolSize pins it)
    expect(corpus.fusion?.poolSize).toBe(16); // 15 keyword-uniques minus the V merge (14) + 2 chase adds
    const vDocs = docs.filter((d) => d !== null && /12-week randomized study/i.test(d.title) && !/adolescents/i.test(d.title));
    expect(vDocs).toHaveLength(1); // exactly one doc for the merged version pair

    // --- hard negative NOT merged with the version pair (its own pool entry kept it at 16)
    //     (H1 itself ranks 15th and is cut by the cap — correct behavior, it is a distractor)

    // --- diversity: >=3 families, observed concentration, classic-vs-recent year spread
    const div = corpus.fusion?.diversity;
    expect(Object.keys(div?.familyCounts ?? {}).length).toBeGreaterThanOrEqual(3);
    expect(div?.familyConcentration).toBeGreaterThan(0);
    expect(div?.familyConcentration).toBeLessThan(1);
    expect(div?.yearMin).toBe(1998); // the chase-reached 1998 foundational paper
    expect(div?.yearMax).toBe(2024);
    expect(div?.publicationTypeCounts['review']).toBe(1); // G4 (systematic critique)

    // --- saturation honesty: supporting round returned only already-seen docs
    expect(corpus.fusion?.saturation).toBeDefined();
    expect(corpus.fusion?.saturation?.saturated).toBe(true);
    expect(corpus.fusion?.saturation?.searches).toBeGreaterThanOrEqual(4);

    // --- publicationType persisted on documents (preprint-vs-published visible downstream)
    const g5Doc = docs.find((d) => d?.identifiers.some((i) => i.value === '10.1/g5'));
    expect(g5Doc?.publicationType).toBe('primary_research');
    const vDoc = vDocs[0];
    expect(vDoc && 'publicationType' in vDoc ? vDoc.publicationType : undefined).toBeDefined();

    // --- rerank exercised (pool 16 > cap 12) and applied
    expect(corpus.fusion?.rerankApplied).toBe(true);
    expect(corpus.fusion?.counterSeatsKept).toBeGreaterThanOrEqual(2);

    // --- provenance: chase searches receipted, chase queries in the snapshot
    const receipts = env.store.listObjects('receipt', env.run.id).filter((r) => r.kind === 'source_retrieval');
    const chaseReceipts = receipts.filter((r) => /citation-chase/.test(r.redactionNote ?? ''));
    expect(chaseReceipts.length).toBe(6); // 3 seeds x (refs + cites)

    // benchmark number surfaced for the run log (recall@12 on the known gold set)
    expect(out.summary).toContain('citation chase');
    expect(out.summary).toContain('corpus mix');
    expect(Number(recall)).toBe(1);
  });

  it('saturation honesty (negative control): a corpus that keeps finding new docs is NOT marked saturated', async () => {
    // Every scripted search returns exactly ONE never-seen record -> novelty 1 on
    // every search; pool = 12 uniques stays <= cap, so no rerank step is consumed.
    let serial = 0;
    const mk = (key: string): SourceAdapter => ({
      family: key as SourceFamily,
      async search(query) {
        serial += 1; // unique per CALL: titles/dois must never collide or fuzzy-merge
        const record = rec(`Fresh unique result ${serial} for ${key} ${query}`, [
          { kind: 'doi', value: `10.9/${key}-${serial}` },
        ]);
        return { family: key as SourceFamily, query, httpStatus: 200, records: [record], latencyMs: 1 };
      },
      async resolve() {
        return { found: false, httpStatus: 404 };
      },
    });
    const env = makeEnv(
      [{ forPurpose: 'query-planning', rawOutput: JSON.stringify(PLAN) }],
      { openalex: mk('openalex'), arxiv: mk('arxiv'), crossref: mk('crossref'), europepmc: mk('europepmc') },
    );
    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const corpus = env.store.listObjects('corpus_snapshot', env.run.id)[0];
    expect(corpus?.fusion?.saturation).toMatchObject({ saturated: false });
    expect(corpus?.fusion?.saturation?.tailNovelty).toBe(1);
    expect(corpus?.fusion?.citationChase).toBeUndefined(); // no capable family wired -> honestly absent
  });
});
