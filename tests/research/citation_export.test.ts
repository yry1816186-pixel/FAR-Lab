// tests/research/citation_export.test.ts
// Citation interoperability export (2.md §12 R10 clause): serialize a run's
// cited RetrievedDocuments to BibTeX / CSL-JSON for reference managers
// (Zotero/Mendeley). Honesty contract under test:
//   - a field is emitted ONLY when the source document carries it (never
//     fabricated, never emitted as an empty value)
//   - venue/container-title is NOT in RetrievedDocument → the field must be
//     ABSENT (this pins the honesty gap, not papers over it)
//   - output is deterministic (byte-identical double-run) and stably ordered
// The .bib output is round-tripped through a MINIMAL strict in-test parser
// (no new dependency): regex per field line + brace-depth entry scanner with
// LaTeX unescape, so escaping is verified, not assumed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  citationKeyHint,
  sanitizeCiteKey,
  toBibtexEntry,
  toCslJson,
  toBibtexFile,
  toCslJsonFile,
} from '../../src/research/citation_export.ts';
import { runExportCitations } from '../../src/cli/commands/export_citations.ts';
import { RunStore } from '../../src/research/run_lifecycle.ts';
import type { RetrievedDocument } from '../../src/retrieval/types.ts';
import type { HypothesisCandidate, ResearchRun } from '../../src/research/types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

let docSeq = 0;

/** Full-metadata doc builder: every field present unless overridden to null/''. */
function makeDoc(overrides: Partial<RetrievedDocument> = {}): RetrievedDocument {
  docSeq += 1;
  const seq = docSeq;
  return {
    documentId: `docid${seq.toString().padStart(4, '0')}`,
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier: `W-seq-${seq}`,
    doi: `10.1000/far-test-${seq}`,
    canonicalUrl: `https://openalex.org/W-seq-${seq}`,
    title: `Test Document ${seq}`,
    authors: ['Alice Smith', 'Bob Jones'],
    publicationDate: '2021-06-15',
    retrievedAt: '2026-08-15T10:30:00.000Z',
    retrievalQuery: 'test query',
    retrievalMethod: 'openalex-rest',
    rawHash: `rawhash${seq}`,
    normalizedHash: `normhash${seq}`,
    parserVersion: 'openalex-atom-v1',
    abstract: 'test abstract',
    licenseMetadata: 'cc-by',
    ...overrides,
  } satisfies RetrievedDocument;
}

/** OpenAlex-style doc with DOI + full authors + publication date. */
const DOC_FULL = makeDoc({ documentId: 'aaa-full' });

/** arXiv doc: no DOI, eprint id, arXiv source. */
const DOC_ARXIV = makeDoc({
  documentId: 'bbb-arxiv',
  sourceType: 'arxiv',
  sourceName: 'arXiv',
  persistentIdentifier: '2401.12345',
  doi: null,
  canonicalUrl: 'https://arxiv.org/abs/2401.12345',
  authors: ['Carol White'],
  publicationDate: '2024-01-20',
  retrievalMethod: 'arxiv-api-atom',
});

/** Metadata-poor doc: no DOI, no publication date, no authors. */
const DOC_SPARSE = makeDoc({
  documentId: 'ccc-sparse',
  doi: null,
  publicationDate: null,
  authors: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// Minimal strict BibTeX test parser (regex field lines + brace-depth scanner
// with LaTeX unescape — the round-trip oracle; ~40 lines, zero dependencies).
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedBibtexEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** Reverse of the serializer's LaTeX escaping (longest-match first). */
function unescapeLatex(value: string): string {
  return value
    .replaceAll('\\textbackslash{}', '\\')
    .replaceAll('\\textasciitilde{}', '~')
    .replaceAll('\\textasciicircum{}', '^')
    .replaceAll('{\\textquotedbl}', '"')
    .replaceAll('\\{', '{')
    .replaceAll('\\}', '}')
    .replaceAll('\\&', '&')
    .replaceAll('\\%', '%')
    .replaceAll('\\#', '#')
    .replaceAll('\\_', '_');
}

/** Parse @type{key, ...field = "value"...} entries (escaped braces are literals). */
function parseBibtex(bib: string): ParsedBibtexEntry[] {
  const entries: ParsedBibtexEntry[] = [];
  let i = 0;
  while (i < bib.length) {
    const at = bib.indexOf('@', i);
    if (at === -1) break;
    const braceOpen = bib.indexOf('{', at);
    if (braceOpen === -1) break;
    const header = bib.slice(at + 1, braceOpen);
    const typeMatch = /^(\w+)$/.exec(header);
    if (typeMatch === null) {
      i = at + 1;
      continue;
    }
    // Scan to the matching close brace; a brace preceded by a backslash is a
    // literal and does not change depth.
    let depth = 1;
    let j = braceOpen + 1;
    while (j < bib.length && depth > 0) {
      const ch = bib[j];
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      j += 1;
    }
    const body = bib.slice(braceOpen + 1, j - 1);
    const commaIdx = body.indexOf(',');
    const key = body.slice(0, commaIdx).trim();
    const fields: Record<string, string> = {};
    for (const line of body.slice(commaIdx + 1).split('\n')) {
      const m = /^\s*(\w+)\s*=\s*"(.*)",?\s*$/.exec(line);
      if (m !== null) {
        let value = m[2] ?? '';
        // Strip the serializer's double-brace title protection BEFORE
        // unescaping (title braces are escaped, only protection is raw).
        if (value.startsWith('{{') && value.endsWith('}}')) {
          value = value.slice(2, -2);
        }
        fields[m[1] ?? ''] = unescapeLatex(value);
      }
    }
    entries.push({ type: typeMatch[1] ?? '', key, fields });
    i = j;
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializers
// ─────────────────────────────────────────────────────────────────────────────

describe('toBibtexEntry', () => {
  it('emits @article with source-faithful fields for an OpenAlex doc with DOI', () => {
    const bib = toBibtexEntry(DOC_FULL, 'smith2021');
    const [entry] = parseBibtex(bib);
    assert.ok(entry !== undefined, `entry parsed: ${bib}`);
    assert.equal(entry.type, 'article');
    assert.equal(entry.key, 'farsmith2021');
    assert.equal(entry.fields.author, 'Alice Smith and Bob Jones');
    assert.equal(entry.fields.title, 'Test Document 1');
    assert.equal(entry.fields.year, '2021');
    assert.equal(entry.fields.doi, DOC_FULL.doi);
    assert.equal(entry.fields.url, DOC_FULL.canonicalUrl);
    assert.match(entry.fields.note ?? '', /Accessed via FAR-Lab \(source: OpenAlex\)/);
    assert.match(entry.fields.note ?? '', /accessed 2026-08-15/); // real retrievedAt date
    // venue is not in RetrievedDocument → the field must be ABSENT
    assert.ok(!('journal' in entry.fields));
    assert.ok(!('booktitle' in entry.fields));
  });

  it('emits @misc with eprint/howpublished for an arXiv doc', () => {
    const bib = toBibtexEntry(DOC_ARXIV, 'white2024');
    const [entry] = parseBibtex(bib);
    assert.ok(entry !== undefined);
    assert.equal(entry.type, 'misc');
    assert.equal(entry.fields.eprint, '2401.12345');
    assert.equal(entry.fields.howpublished, 'arXiv');
    assert.ok(!('doi' in entry.fields), 'arXiv fixture has no DOI → field absent');
  });

  it('brace-protects and LaTeX-escapes an adversarial title through round-trip', () => {
    const nasty = makeDoc({
      documentId: 'ddd-nasty',
      title: 'A {B} \\ C & D % E ~ F ^ G _ H # I " J',
    });
    const bib = toBibtexEntry(nasty, 'smith2021');
    // raw output must be quote-safe and brace-protected
    assert.match(bib, /title = "\{\{A \\\{B\\\}/);
    const [entry] = parseBibtex(bib);
    assert.ok(entry !== undefined);
    assert.equal(entry.fields.title, 'A {B} \\ C & D % E ~ F ^ G _ H # I " J');
  });

  it('omits doi/year/author lines entirely when the source lacks them (no empty fields)', () => {
    const bib = toBibtexEntry(DOC_SPARSE, 'sparse');
    assert.ok(!/^\s*doi\s*=/m.test(bib), 'no doi line for doi=null doc');
    assert.ok(!/^\s*year\s*=/m.test(bib), 'no year line for publicationDate=null doc');
    assert.ok(!/^\s*author\s*=/m.test(bib), 'no author line for authors=[] doc');
    const [entry] = parseBibtex(bib);
    assert.ok(entry !== undefined);
    assert.ok(!('doi' in entry.fields));
    assert.ok(!('year' in entry.fields));
    assert.ok(!('author' in entry.fields));
    // note keeps the accessed date (retrievedAt is present on this doc)
    assert.match(entry.fields.note ?? '', /accessed 2026-08-15/);
  });

  it('drops the accessed date from note when retrievedAt carries no date (never invents one)', () => {
    const noDate = makeDoc({ documentId: 'eee-nodate', retrievedAt: '' });
    const [entry] = parseBibtex(toBibtexEntry(noDate, 'nodate'));
    assert.ok(entry !== undefined);
    assert.ok(!/accessed \d{4}/.test(entry.fields.note ?? ''), 'no fabricated date');
    assert.match(entry.fields.note ?? '', /Accessed via FAR-Lab/);
  });

  it('sanitizes the cite key to ascii lowercase', () => {
    assert.equal(sanitizeCiteKey('Smith, J. É. 2020!'), 'smithj2020');
    const bib = toBibtexEntry(DOC_FULL, 'Smith, J. É. 2020!');
    assert.match(bib, /@article\{farsmithj2020,/);
  });
});

describe('toCslJson', () => {
  it('produces the exact CSL-JSON record for a full-metadata doc', () => {
    const record = toCslJson(DOC_FULL, 'smith2021');
    assert.deepEqual(record, {
      id: 'farsmith2021',
      type: 'article-journal',
      title: 'Test Document 1',
      author: [{ literal: 'Alice Smith' }, { literal: 'Bob Jones' }],
      issued: { 'date-parts': [[2021]] },
      DOI: DOC_FULL.doi,
      URL: DOC_FULL.canonicalUrl,
      note: 'Accessed via FAR-Lab (source: OpenAlex); accessed 2026-08-15',
    });
  });

  it('types arXiv docs as misc and omits DOI when absent (year still emitted)', () => {
    const record = toCslJson(DOC_ARXIV, 'white2024');
    assert.equal(record.type, 'misc');
    assert.ok(!('DOI' in record), 'no DOI key when doi=null');
    assert.deepEqual(record.issued, { 'date-parts': [[2024]] });
    assert.deepEqual(record.author, [{ literal: 'Carol White' }]);
  });

  it('omits author entirely for authors=[] and never emits container-title (venue unavailable)', () => {
    const record = toCslJson(DOC_SPARSE, 'sparse');
    assert.ok(!('author' in record));
    assert.ok(!('container-title' in record), 'venue not in RetrievedDocument → absent');
    assert.ok(!('issued' in record));
  });

  it('emits issued only with a derivable year (yyyy / yyyy-mm shapes)', () => {
    const yearOnly = makeDoc({ documentId: 'fff-yearonly', publicationDate: '2019' });
    assert.deepEqual(toCslJson(yearOnly, 'y').issued, { 'date-parts': [[2019]] });
    const junk = makeDoc({ documentId: 'ggg-junk', publicationDate: 'n/a' });
    assert.ok(!('issued' in toCslJson(junk, 'y')), 'non-numeric date → no issued');
  });
});

describe('file assembly (dedup / ordering / determinism)', () => {
  it('deduplicates by documentId and orders by documentId asc regardless of input order', () => {
    const forward = toBibtexFile([DOC_FULL, DOC_ARXIV, DOC_SPARSE], '01RUN');
    const shuffled = toBibtexFile([DOC_SPARSE, DOC_FULL, DOC_ARXIV, DOC_FULL], '01RUN');
    assert.equal(forward, shuffled);
    const entries = parseBibtex(forward);
    assert.equal(entries.length, 3, 'duplicate doc appears once');
    assert.equal(new Set(entries.map((e) => e.key)).size, 3);
    // documentId asc ordering: full(aaa-) < arxiv(bbb-) < sparse(ccc-)
    assert.deepEqual(
      entries.map((e) => e.key),
      ['farsmith2021', 'farwhite2024', 'fardocccc-spar'],
    );
  });

  it('is byte-identical across double runs (no timestamps, no randomness)', () => {
    const docs = [DOC_FULL, DOC_ARXIV, DOC_SPARSE];
    assert.equal(toBibtexFile(docs, '01RUN'), toBibtexFile(docs, '01RUN'));
    assert.equal(toCslJsonFile(docs), toCslJsonFile(docs));
  });

  it('csl-json file parses as a JSON array with one record per document', () => {
    const parsed = JSON.parse(toCslJsonFile([DOC_FULL, DOC_ARXIV])) as unknown[];
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 2);
    assert.equal((parsed[0] as { id: string }).id, 'farsmith2021');
  });

  it('disambiguates colliding cite keys deterministically (suffix -2)', () => {
    const a = makeDoc({ documentId: 'hhh-a', authors: ['Zoe Quill'], publicationDate: '2020-01-01' });
    const b = makeDoc({ documentId: 'iii-b', authors: ['Zoe Quill'], publicationDate: '2020-02-02' });
    const bib = toBibtexFile([a, b], '01RUN');
    const keys = parseBibtex(bib).map((e) => e.key);
    assert.deepEqual([...keys].sort(), ['farquill2020', 'farquill2020-2']);
    const csl = JSON.parse(toCslJsonFile([a, b])) as { id: string }[];
    assert.deepEqual([...csl.map((r) => r.id)].sort(), ['farquill2020', 'farquill2020-2']);
  });

  it('falls back to a documentId-derived key when no author/year is available', () => {
    const sparse = makeDoc({ documentId: 'jjj-sparse2', authors: [], publicationDate: null });
    const hint = citationKeyHint(sparse);
    assert.match(hint, /^docjjj/);
    // sanitized key keeps ascii dashes: far + docjjj-spar(documentId[:8]);
    // entry type stays field-driven (this doc still has a doi → @article)
    assert.match(toBibtexEntry(sparse, hint), /@article\{fardocjjj-spar,/);
    assert.ok(!/^\s*author\s*=/m.test(toBibtexEntry(sparse, hint)));
    assert.ok(!/^\s*year\s*=/m.test(toBibtexEntry(sparse, hint)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI (runExportCitations)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal-but-valid ResearchRun (same pattern as export_bundle.test.ts). */
function minimalRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    runId: '01TESTRUN',
    question: 'test question',
    gateReport: {
      question: 'test question',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: 'astronomy', domainHints: ['astronomy'], questionLength: 13 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: '2026-08-13T00:00:00.000Z',
      schemaVersion: 1,
    },
    corpus: {
      snapshotId: 'snap',
      rootHash: 'root',
      documentCount: 0,
      documents: [],
      sourceQueries: [],
      createdAt: '2026-08-13T00:00:00.000Z',
    },
    hypotheses: [],
    bindings: {},
    critiques: {},
    scorecards: {},
    plan: {
      objectives: ['o1'],
      primaryHypothesisId: 'none',
      alternativeHypothesisIds: [],
      preregisteredPredictions: [],
      dataRequirements: [],
      inclusionExclusionCriteria: [],
      variables: [],
      design: 'd',
      analysisDag: [],
      tools: [],
      statisticalMethods: [],
      sampleSizeRationale: 's',
      multiplicityHandling: 'm',
      missingOutlierStrategy: 'x',
      stoppingConditions: [],
      checkpoints: [],
      budget: 'b',
      risks: [],
      reproducibility: [],
      nextRoundDecisionRules: [],
      humanApprovalRequired: [],
    },
    revisions: [],
    observations: [],
    stageReceipts: [],
    environment: {
      gitCommit: 'abc123',
      gitDirty: false,
      nodeVersion: 'v24',
      platform: 'win32-x64',
      lockfileHash: 'lockhash',
      packageVersion: '1.1.0',
    },
    modes: {
      modelExecutionMode: 'RECORDED_REPLAY',
      retrievalExecutionMode: 'RECORDED_REPLAY',
      experimentExecutionMode: 'NOT_EXECUTED',
    },
    runMode: 'RECORDED_REPLAY',
    startedAt: '2026-08-13T00:00:00.000Z',
    schemaVersion: 3,
    citationGate: {
      boundRate: 1,
      totalCited: 0,
      boundCount: 0,
      unboundEvidenceCount: 0,
      resolvedViaRetrieval: [],
      perHypothesis: {},
      primaryRequiresAllBound: true,
      primaryAllBound: false,
      gateVerdict: 'PASS',
    },
    falsifiabilityGate: { perHypothesis: {}, allPassed: true },
    discovery: null,
    ...overrides,
  } satisfies ResearchRun;
}

function hypothesis(supporting: readonly string[], counter: readonly string[]): HypothesisCandidate {
  return {
    id: 'hyp1',
    statement: 'stmt',
    mechanism: 'mech',
    falsificationMethod: { prediction: 'p', metric: 'rmse', comparator: 'lt', value: 0.1 },
    supportingCitations: supporting,
    counterEvidenceCitations: counter,
    relationToExistingTheory: 'r',
    alternativeExplanations: ['a'],
    observablePredictions: ['o'],
    distinguishingObservations: ['d'],
    noveltyRelativeToCorpus: 'n',
    assumptions: ['x'],
    risks: ['y'],
  };
}

/** A run whose corpus holds two docs and whose hypothesis cites both + one unknown id. */
function citedRun(): ResearchRun {
  return minimalRun({
    corpus: {
      snapshotId: 'snap',
      rootHash: 'root',
      documentCount: 2,
      documents: [DOC_FULL, DOC_ARXIV],
      sourceQueries: ['q'],
      createdAt: '2026-08-13T00:00:00.000Z',
    },
    hypotheses: [hypothesis([DOC_FULL.documentId], [DOC_ARXIV.documentId, 'unknown-doc-1'])],
  });
}

/** Capture process.stdout.write for the duration of fn. */
function captureStdout(fn: () => void): string {
  return captureStream(process.stdout, fn);
}

/** Capture process.stderr.write for the duration of fn. */
function captureStderr(fn: () => void): string {
  return captureStream(process.stderr, fn);
}

function captureStream(stream: NodeJS.WriteStream, fn: () => void): string {
  const chunks: string[] = [];
  const original = stream.write.bind(stream);
  (stream as { write: (s: string) => boolean }).write = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    fn();
  } finally {
    (stream as { write: (s: string) => boolean }).write = original;
  }
  return chunks.join('');
}

describe('runExportCitations (CLI)', () => {
  it('exports bibtex to a file: exit 0, 2 entries, unknown id warned (never silent)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-cite-export-'));
    try {
      const store = new RunStore(dir);
      store.saveRun('01TESTRUN', citedRun());
      const outFile = join(dir, 'out.bib');
      let exit = -1;
      const stdout = captureStdout(() => {
        exit = runExportCitations({ runId: '01TESTRUN', format: 'bibtex', output: outFile, store });
      });
      assert.equal(exit, 0);
      const entries = parseBibtex(readFileSync(outFile, 'utf8'));
      assert.equal(entries.length, 2);
      assert.deepEqual(entries.map((e) => e.key).sort(), ['farsmith2021', 'farwhite2024']);
      assert.match(stdout, /exported\s+: 2 citation\(s\)/i);
      assert.match(stdout, /unknown-doc-1/, 'unknown documentId listed in the warning section');
      assert.match(readFileSync(outFile, 'utf8'), /unresolved documentId \(not in corpus, skipped\): unknown-doc-1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exports csl-json to a file: exit 0, JSON array matching source metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-cite-export-'));
    try {
      const store = new RunStore(dir);
      store.saveRun('01TESTRUN', citedRun());
      const outFile = join(dir, 'out.json');
      let exit = -1;
      captureStdout(() => {
        exit = runExportCitations({ runId: '01TESTRUN', format: 'csl-json', output: outFile, store });
      });
      assert.equal(exit, 0);
      const parsed = JSON.parse(readFileSync(outFile, 'utf8')) as { id: string; title: string }[];
      assert.equal(parsed.length, 2);
      assert.equal(parsed.filter((r) => r.id === 'farsmith2021').length, 1);
      assert.equal(parsed.filter((r) => r.id === 'farwhite2024').length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes to stdout when output is "-" (pipe-clean: summary goes to stderr)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-cite-export-'));
    try {
      const store = new RunStore(dir);
      store.saveRun('01TESTRUN', citedRun());
      let exit = -1;
      let stderr = '';
      const stdout = captureStdout(() => {
        stderr = captureStderr(() => {
          exit = runExportCitations({ runId: '01TESTRUN', format: 'bibtex', output: '-', store });
        });
      });
      assert.equal(exit, 0);
      assert.match(stdout, /@article\{farsmith2021,/);
      assert.match(stdout, /@misc\{farwhite2024,/);
      // stdout must contain ONLY the citation payload (redirect-safe):
      assert.ok(!stdout.includes('FAR-Lab · far export citations'), 'summary banner not on stdout');
      assert.ok(stdout.startsWith('% FAR-Lab citation export'), 'payload starts with the file header');
      assert.match(stderr, /exported\s+: 2 citation/); // human summary on stderr
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('defaults the output path to .far/exports/<runId>-citations.<ext>', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-cite-export-'));
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      const store = new RunStore(join(dir, 'runs'));
      store.saveRun('01TESTRUN', citedRun());
      let exit = -1;
      captureStdout(() => {
        exit = runExportCitations({ runId: '01TESTRUN', format: 'bibtex', store });
      });
      assert.equal(exit, 0);
      const expected = join(dir, '.far', 'exports', '01TESTRUN-citations.bib');
      assert.equal(parseBibtex(readFileSync(expected, 'utf8')).length, 2);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits non-zero with a clear reason when the run has no citations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-cite-export-'));
    try {
      const store = new RunStore(dir);
      store.saveRun('01TESTRUN', minimalRun()); // no hypotheses, no citations
      let exit = -1;
      let stderr = '';
      captureStdout(() => {
        stderr = captureStderr(() => {
          exit = runExportCitations({ runId: '01TESTRUN', format: 'bibtex', output: join(dir, 'x.bib'), store });
        });
      });
      assert.notEqual(exit, 0);
      assert.match(stderr, /no citations/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits non-zero when the run does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-cite-export-'));
    try {
      const store = new RunStore(dir);
      const exit = runExportCitations({ runId: 'NOSUCHRUN', format: 'bibtex', store });
      assert.notEqual(exit, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
