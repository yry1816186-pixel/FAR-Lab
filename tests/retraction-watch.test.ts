import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProvenanceReceipt, ResearchQuestion, ResearchRun, newId } from '../src/domain/index.js';
import type { SourceFamily } from '../src/domain/source.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { RawSourceRecord, SourceAdapter } from '../src/shared/ports.js';
import type { StageContext } from '../src/pipeline/types.js';
import type { ResponseCacheStore } from '../src/sources/response-cache.js';
import { withRetractions } from '../src/sources/response-cache.js';
import { retrieveStage } from '../src/pipeline/stages/retrieve.js';
import { retractionUncertaintyNote } from '../src/pipeline/stages/evidence.js';
import {
  classifyRetractionReasons,
  parseRetractionWatchCsv,
} from '../src/sources/retraction-watch.js';
import { retractionInfo } from '../src/sources/retraction.js';

/**
 * RU-R frontier candidate 2 — offline Retraction Watch retraction table.
 * Format pinned against the dataset README (gitlab.com/crossref/
 * retraction-watch-data, fetched 2026-08-24): 20 columns, semicolon-separated
 * lists, RetractionNature in {Retraction, Correction, Expression of concern,
 * Reinstatement}, OriginalPaperDOI may be blank/'unavailable'.
 * All offline/deterministic; the real dataset fetch is a BLOCKED-live component
 * and NO dataset bytes are vendored (fixtures below are synthetic).
 */

const HEADER =
  'Record ID,Title,Subject,Institution,Journal,Publisher,Country,Author,URLS,ArticleType,' +
  'RetractionDate,RetractionDOI,RetractionPubMedID,OriginalPaperDate,OriginalPaperDOI,' +
  'OriginalPaperPubMedID,RetractionNature,Reason,Paywalled,Notes';

const row = (fields: readonly string[]): string => fields.join(',');

const CSV_FIXTURE = [
  HEADER,
  row(['RW1', '"Famous trial, retracted"', 'Med', 'Inst A', 'J Clin', 'Pub', 'US', 'Author A', 'https://x', 'Research Article',
    '2026-01-02', '10.1/ret-notice', '', '2020-03-04', '10.1/retracted1', '', 'Retraction',
    '"Falsification/Fabrication of data;Plagiarism"', '0', '']),
  row(['RW2', 'Corrected analysis paper', '', '', '', '', '', '', '', '',
    '2026-02-03', '10.1/corr-notice', '', '2019-01-01', '10.1/corrected1', '', 'Correction',
    'Error in data', '0', '']),
  row(['RW3', 'Unavailable DOI row', '', '', '', '', '', '', '', '',
    '2026-02-04', '10.1/x', '', '2018-01-01', 'unavailable', '', 'Retraction', 'Plagiarism', '0', '']),
  row(['RW4', 'Blank DOI row', '', '', '', '', '', '', '', '',
    '2026-02-05', '10.1/y', '', '2018-01-01', '', '', 'Retraction', 'Plagiarism', '0', '']),
  row(['RW5', 'Unknown nature row', '', '', '', '', '', '', '', '',
    '2026-02-06', '10.1/z', '', '2018-01-01', '10.1/unknown-nature', '', 'Withdrawal', 'Error in text', '0', '']),
  // second notice for the same paper as RW1: strictest nature wins, reasons union
  row(['RW1b', 'Later expression of concern on the famous trial', '', '', '', '', '', '', '', '',
    '2026-03-01', '10.1/eoc-notice', '', '2020-03-04', '10.1/RETRACTED1', '', 'Expression of concern',
    'Investigation by journal', '0', '']),
].join('\r\n');

describe('parseRetractionWatchCsv (README-pinned format, RFC 4180)', () => {
  const table = parseRetractionWatchCsv(CSV_FIXTURE);

  it('parses quoted commas, "" escapes, CRLF, and semicolon reason lists', () => {
    const e = table.get('10.1/retracted1');
    expect(e).not.toBeNull();
    // both notices' reasons are present (RW1b merged below); original order first
    expect(e!.reasons.slice(0, 2)).toEqual(['Falsification/Fabrication of data', 'Plagiarism']);
    expect(e!.reasons).toContain('Investigation by journal');
    expect(e!.nature).toBe('Retraction');
    expect(e!.retractionDate).toBe('2026-01-02');
    expect(e!.recordId).toBe('RW1');
  });

  it('DOI lookup is case-insensitive on both sides', () => {
    expect(table.get('10.1/Retracted1')!.nature).toBe('Retraction');
  });

  it('skips unavailable/blank DOIs and unrecognized natures — counted, never guessed', () => {
    expect(table.get('10.1/retracted1')).not.toBeNull();
    expect(table.get('unavailable')).toBeNull();
    expect(table.skippedNoDoi).toBe(2);
    expect(table.get('10.1/unknown-nature')).toBeNull();
    expect(table.unrecognizedNature).toBe(1);
    expect(table.size).toBe(2); // retracted1 + corrected1
  });

  it('merges second notices for the same paper: strictest nature wins, reasons union in first-seen order', () => {
    const e = table.get('10.1/retracted1');
    expect(e!.nature).toBe('Retraction'); // Retraction outranks Expression of concern
    expect(e!.reasons).toEqual([
      'Falsification/Fabrication of data', 'Plagiarism', 'Investigation by journal',
    ]);
  });

  it('maps every documented nature to its canonical status', () => {
    expect(table.get('10.1/corrected1')!.nature).toBe('Correction');
  });

  it('throws an honest error on a missing required column (format change guard)', () => {
    expect(() => parseRetractionWatchCsv('A,B,C\n1,2,3')).toThrow(/OriginalPaperDOI.*missing/);
  });
});

describe('classifyRetractionReasons (conservative, never guessed)', () => {
  it('misconduct vocabulary', () => {
    expect(classifyRetractionReasons(['Falsification of data'])).toBe('misconduct');
    expect(classifyRetractionReasons(['Paper mill'])).toBe('misconduct');
    expect(classifyRetractionReasons(['Investigation by journal'])).toBe('misconduct');
  });
  it('honest-error vocabulary', () => {
    expect(classifyRetractionReasons(['Error in data'])).toBe('honest_error');
    expect(classifyRetractionReasons(['Error in analyses'])).toBe('honest_error');
    expect(classifyRetractionReasons(['Contamination of cell lines'])).toBe('honest_error');
  });
  it('misconduct dominates when both classes appear', () => {
    expect(classifyRetractionReasons(['Error in text', 'Plagiarism'])).toBe('misconduct');
  });
  it('unrecognized vocabulary stays unclassified', () => {
    expect(classifyRetractionReasons(['Some novel reason'])).toBe('unclassified');
    expect(classifyRetractionReasons([])).toBe('unclassified');
  });
});

describe('retractionInfo precedence: update-to > Retraction Watch > is_retracted', () => {
  const table = parseRetractionWatchCsv(CSV_FIXTURE);
  const mk = (normalized: Record<string, unknown>, ids: Array<{ kind: string; value: string }>): RawSourceRecord => ({
    identifiers: ids as RawSourceRecord['identifiers'],
    title: 't',
    contentDepth: 'metadata_only',
    accessState: 'unknown',
    normalized,
  });

  it('a bare-DOI record with no retraction metadata classifies via the table WITH reasons', () => {
    const facts = retractionInfo(mk({}, [{ kind: 'doi', value: '10.1/retracted1' }]), table);
    expect(facts).toMatchObject({
      status: 'retracted',
      basis: 'retraction_watch',
      reasons: ['Falsification/Fabrication of data', 'Plagiarism', 'Investigation by journal'],
    });
  });

  it('update-to outranks the table (richest authoritative signal first)', () => {
    const facts = retractionInfo(
      mk({ 'update-to': [{ type: 'correction' }] }, [{ kind: 'doi', value: '10.1/retracted1' }]),
      table,
    );
    expect(facts).toMatchObject({ status: 'corrected', basis: 'update_to' });
  });

  it('the curated table outranks the OpenAlex boolean (false-positive window)', () => {
    const facts = retractionInfo(
      mk({ is_retracted: true }, [{ kind: 'doi', value: '10.1/retracted1' }]),
      table,
    );
    expect(facts!.basis).toBe('retraction_watch');
  });

  it('a Correction-nature table hit is corrected, not retracted (no demotion)', () => {
    const facts = retractionInfo(mk({}, [{ kind: 'doi', value: '10.1/corrected1' }]), table);
    expect(facts).toMatchObject({ status: 'corrected', basis: 'retraction_watch' });
  });

  it('records without a DOI identifier never consult the table', () => {
    expect(retractionInfo(mk({}, [{ kind: 'openalex', value: 'W1' }]), table)).toBeUndefined();
    expect(retractionInfo(mk({ is_retracted: true }, [{ kind: 'openalex', value: 'W1' }]), table)).toMatchObject({
      status: 'retracted',
      basis: 'is_retracted',
    });
  });

  it('absent table = exact legacy behavior (update-to, then flag)', () => {
    expect(retractionInfo(mk({}, [{ kind: 'doi', value: '10.1/retracted1' }]))).toBeUndefined();
    expect(retractionInfo(mk({ is_retracted: true }, [{ kind: 'doi', value: '10.1/retracted1' }]))).toMatchObject({
      status: 'retracted',
      basis: 'is_retracted',
    });
  });
});

describe('retractionUncertaintyNote (hint tier, verification-gated)', () => {
  it('verification retracted wins; reasons ride the wording', () => {
    expect(retractionUncertaintyNote({
      verification: { method: 'crossref_doi', resolved: true, retractionStatus: 'retracted', checkedAt: '2026-08-24T00:00:00.000Z' },
      retractionStatus: 'retracted',
      retractionReasons: ['Plagiarism'],
    })).toBe('source retracted (Crossref update-to) (Retraction Watch: Plagiarism) — treat with maximal skepticism');
  });

  it('hint speaks only while unverified; a CLEAN verification silences it (false-positive window)', () => {
    const hint = { retractionStatus: 'retracted' as const, retractionReasons: ['Falsification/Fabrication of data'] };
    expect(retractionUncertaintyNote(hint)).toContain('flagged retracted at search time');
    expect(retractionUncertaintyNote(hint)).toContain('Retraction Watch: Falsification/Fabrication of data');
    expect(retractionUncertaintyNote({
      ...hint,
      verification: { method: 'crossref_doi', resolved: true, checkedAt: '2026-08-24T00:00:00.000Z' },
    })).toBeNull();
  });
});

/* --------------------- retrieve-stage integration --------------------- */

const QUESTION_TEXT = 'Does intermittent fasting improve insulin sensitivity in adults?';
const PLAN = {
  discovery: ['intermittent fasting insulin sensitivity', 'time restricted eating glucose'],
  supporting: ['intermittent fasting insulin sensitivity trial'],
  counter: [
    'intermittent fasting insulin sensitivity failed replication',
    'intermittent fasting insulin sensitivity limitations',
  ],
};

const mkRec = (title: string, doi: string, year = 2022): RawSourceRecord => {
  const slug = doi.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const body: string[] = [];
  for (let i = 0; i < 30; i += 1) body.push(`${words[i % words.length]}-${slug}-${i}`);
  return {
    identifiers: [{ kind: 'doi', value: doi }],
    title,
    publicationYear: year,
    authors: ['RW Fixture'],
    contentDepth: 'abstract',
    accessState: 'open',
    abstractText: `Synthetic fixture abstract: ${body.join(' ')}.`,
    normalized: { title, fixture: true },
  };
};

const RETRACTED_DOC = mkRec('Highly cited retracted fasting trial with strong claims', '10.1/retracted1', 2021);

const openDbs: Db[] = [];
const tempDirs: string[] = [];

const makeEnv = (docs: readonly RawSourceRecord[], rerankPoolSize: number, cache?: ResponseCacheStore) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'farlab-rw-'));
  tempDirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  openDbs.push(db);
  const store = new Store(db);
  const artifacts = openArtifactStore(path.join(dir, 'artifacts'));
  const question = ResearchQuestion.parse({
    id: newId('q'),
    text: QUESTION_TEXT,
    background: '',
    goalType: 'exploratory',
    scope: { domain: 'nutrition', phenomena: ['insulin sensitivity'], inScope: [], outOfScope: [] },
    constraints: {
      assumptions: [], dataConstraints: [], resourceConstraints: [], ethicalConstraints: [],
      methodologicalConstraints: [],
    },
    createdAt: new Date().toISOString(),
  });
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
  const steps: StubStep[] = [{ forPurpose: 'query-planning', rawOutput: JSON.stringify(PLAN) }];
  if (rerankPoolSize > 0) {
    steps.push({
      forPurpose: 'listwise-rerank',
      rawOutput: JSON.stringify({
        ranked: Array.from({ length: rerankPoolSize }, (_, i) => ({
          index: i,
          relevance: i < 12 ? ('high' as const) : ('low' as const),
          reason: 'fixture identity permutation',
        })),
      }),
    });
  }
  const serveAll = (family: SourceFamily): SourceAdapter => ({
    family,
    async search() {
      return { family, query: '', httpStatus: 200, records: [...docs], latencyMs: 1 };
    },
    async resolve() {
      return { found: false, httpStatus: 404 };
    },
  });
  const ctx: StageContext = {
    run,
    store,
    artifacts,
    provider: createTestStubProvider(steps),
    sourceFor: serveAll,
    ...(cache !== undefined ? { responseCache: cache } : {}),
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

const memoryCache = (): ResponseCacheStore => ({
  getCachedSearch: () => null,
  putCachedSearch: () => {},
});

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('retrieve-stage integration: table-driven demotion + reason persistence', () => {
  const table = parseRetractionWatchCsv(CSV_FIXTURE);

  it('over-cap: a retracted-by-table-only doc ranked first takes NO cap seat; demotion attributed', async () => {
    // 13 docs; the retracted one has the lowest DOI key so it fuses first everywhere.
    const docs = [RETRACTED_DOC, ...Array.from({ length: 12 }, (_, i) => mkRec(`Clean study number ${i + 1} on fasting`, `10.1/b${i.toString().padStart(2, '0')}`))];
    const env = makeEnv(docs, docs.length, withRetractions(memoryCache(), table));
    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const corpus = env.store.listObjects('corpus_snapshot', env.run.id)[0];
    expect(corpus.fusion?.retractedDemoted).toBe(1);
    expect(corpus.fusion?.poolSize).toBe(13);
    expect(out.summary).toContain('offline Retraction Watch table');
    const docsOut = corpus.documentIds.map((id) => env.store.getObject('source_document', id));
    expect(docsOut.some((d) => d?.identifiers.some((i) => i.value === '10.1/retracted1'))).toBe(false);
    expect(docsOut).toHaveLength(12);
  });

  it('under-cap: the retracted doc stays WITH status + reasons + class persisted', async () => {
    const docs = [RETRACTED_DOC, mkRec('Clean study on fasting', '10.1/b01', 2023), mkRec('Second clean study', '10.1/b02', 2024)];
    const env = makeEnv(docs, 0, withRetractions(memoryCache(), table));
    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const corpus = env.store.listObjects('corpus_snapshot', env.run.id)[0];
    const docsOut = corpus.documentIds.map((id) => env.store.getObject('source_document', id));
    const retracted = docsOut.find((d) => d?.identifiers.some((i) => i.value === '10.1/retracted1'));
    expect(retracted).toBeDefined();
    expect(retracted!.retractionStatus).toBe('retracted');
    expect(retracted!.retractionReasons).toEqual([
      'Falsification/Fabrication of data', 'Plagiarism', 'Investigation by journal',
    ]);
    expect(retracted!.retractionClass).toBe('misconduct');
  });

  it('no table attached = exact legacy behavior (bare-DOI retracted doc competes normally)', async () => {
    const docs = [RETRACTED_DOC, mkRec('Clean study on fasting', '10.1/b01', 2023), mkRec('Second clean study', '10.1/b02', 2024)];
    const env = makeEnv(docs, 0); // no responseCache at all
    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const corpus = env.store.listObjects('corpus_snapshot', env.run.id)[0];
    expect(corpus.fusion?.retractedDemoted).toBeUndefined();
    const docsOut = corpus.documentIds.map((id) => env.store.getObject('source_document', id));
    const retracted = docsOut.find((d) => d?.identifiers.some((i) => i.value === '10.1/retracted1'));
    expect(retracted?.retractionStatus).toBeUndefined();
  });
});
