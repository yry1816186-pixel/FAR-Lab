import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HypothesisCandidate,
  HypothesisScorecard,
  ResearchQuestion,
  ScientificClaim,
  SourceDocument,
  newId,
} from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { exportStage } from '../src/pipeline/stages/export.js';
import type { StageContext } from '../src/pipeline/types.js';
import { buildReproducibilityPackage } from '../src/report/package.js';
import { detectPandoc } from '../src/report/pandoc.js';
import { sha256Hex } from '../src/shared/crypto.js';

// *** TEST-ONLY *** Lane-07 integration: real Store + real artifact store + the real
// export stage, then the reproducibility-package builder over the SAME deps — the
// paper/report bytes in the package must be the pipeline's stored artifacts, verified
// against the bundle's declared hashes. Pandoc runs when present on the machine.

let tmp: string;
let db: Db;
let store: Store;

const T0 = Date.parse('2026-08-25T00:00:00.000Z');
const ts = (i: number) => new Date(T0 + i * 1000).toISOString();
const hasPandoc = detectPandoc() !== null;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-pkg-'));
  db = openDb(path.join(tmp, 'state.db'));
  store = new Store(db);
});
afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const makeCtx = (runId: string): StageContext => {
  const run = store.getRun(runId);
  if (run === null) throw new Error(`fixture run missing: ${runId}`);
  return {
    run,
    store,
    artifacts: openArtifactStore(path.join(tmp, 'artifacts')),
    provider: createTestStubProvider([]),
    sourceFor: () => {
      throw new Error('no source adapter in test');
    },
    recordReceipt: () => {},
    cancelled: () => false,
    log: () => {},
  };
};

interface FullGraph { runId: string; paperRef: string }

/** Compact but citation-complete study: question / verified source / verified claim / ranked hypothesis. */
const seedFullStudy = (): FullGraph => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'Why do probes fail?', background: '', goalType: 'explanatory',
    scope: { domain: 'meta-science', phenomena: ['probe failures'] }, constraints: {}, createdAt: ts(1),
  });
  store.putObject('question', q);
  const run = store.createRun(q);
  const src = SourceDocument.parse({
    id: newId('src'), runId: run.id, family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1000/probe-study' }],
    title: 'A study of probe failures', publicationYear: 2024, authors: ['A. Researcher'],
    venue: 'Journal of Probes', contentDepth: 'abstract', accessState: 'open',
    contentHash: 'a'.repeat(64), retrievedAt: ts(2), parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, checkedAt: ts(2) },
  });
  store.putObject('source_document', src);
  const claim = ScientificClaim.parse({
    id: newId('clm'), runId: run.id, text: 'Probes fail deterministically under load',
    locators: [{ sourceDocumentId: src.id, quote: 'probes fail under load' }],
    bindingStatus: 'verified', alignmentChecked: true, uncertainties: [],
  });
  store.putObject('claim', claim);
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId: run.id, statement: 'Probe failure is load-dependent',
    derivation: { strategy: 'evidence_conditioned', rationale: 'from verified claim', inputClaimIds: [claim.id] },
    supportingClaimIds: [claim.id], uncertainties: ['load model is simplified'], createdAt: ts(3),
  });
  store.putObject('hypothesis', hyp);
  const scorecard = HypothesisScorecard.parse({
    id: newId('sc'), runId: run.id, hypothesisId: hyp.id,
    dimensions: [{
      dimension: 'evidence_grounding', value: 0.8, rationale: 'verified claim grounds it',
      evidenceClaimIds: [claim.id], producer: 'test-fixture', calibration: 'deterministic',
    }],
    overallRationale: 'single-hypothesis fixture', rankedOutOf: 1, rank: 1,
  });
  store.putObject('scorecard', scorecard);
  return { runId: run.id, paperRef: '' };
};

const runExport = async (runId: string): Promise<StageContext['artifacts']> => {
  const ctx = makeCtx(runId);
  await exportStage.execute(ctx);
  return ctx.artifacts;
};

const walk = (dir: string, base = dir): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });

describe('buildReproducibilityPackage (full study, real paths)', () => {
  it('assembles a verified package: stored artifacts, manifest, ro-crate, citations, pandoc', async () => {
    const g = seedFullStudy();
    const artifacts = await runExport(g.runId);
    const outDir = path.join(tmp, 'pkg-a');
    const result = await buildReproducibilityPackage({ store, artifacts }, g.runId, { outDir });

    // --- stored-artifact identity: package paper/report bytes ARE the pipeline's bytes ---
    const bundle = store.listObjects('bundle', g.runId).at(-1)!;
    const paths = result.files.map((f) => f.path);
    for (const [logical, ref] of [['report.md', `sha256:${bundle.finalArtifactHashes[0]}`], ['paper.md', bundle.paperOutlineRef!]] as const) {
      const stored = await artifacts.get(ref);
      const shipped = fs.readFileSync(path.join(outDir, logical), 'utf8');
      expect(shipped).toBe(stored);
    }

    // --- MANIFEST re-hash: every declared file matches its sha256 ---
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'MANIFEST.json'), 'utf8'));
    expect(manifest.bundleId).toBe(bundle.id);
    for (const [p, entry] of Object.entries(manifest.files)) {
      const h = sha256Hex(fs.readFileSync(path.join(outDir, p)));
      expect(h).toBe((entry as { sha256: string }).sha256);
    }
    expect(paths).toContain('references.bib');
    expect(paths).toContain('figures/win-rate.svg');
    expect(paths).toContain('figures/corpus-depth.svg');
    expect(paths.filter((p) => p.startsWith('tables/') && p.endsWith('.csv'))).toHaveLength(3);

    // --- bundle.json deep-equals the stored bundle object ---
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'bundle.json'), 'utf8'))).toEqual(bundle);

    // --- RO-Crate: descriptor + root + file entities with hashes matching the manifest ---
    const crate = JSON.parse(fs.readFileSync(path.join(outDir, 'ro-crate-metadata.json'), 'utf8'));
    expect(crate['@context']).toBe('https://w3id.org/ro/crate/1.1/context');
    const fileEntity = crate['@graph'].find((e: Record<string, unknown>) => e['@id'] === 'paper.md');
    expect(fileEntity.sha256).toBe(manifest.files['paper.md'].sha256);

    // --- citations resolve; paper carries inline keys + related work ---
    expect(result.citations?.unresolved).toEqual([]);
    expect(result.citations!.citedKeys.length).toBeGreaterThan(0);
    const paper = fs.readFileSync(path.join(outDir, 'paper.md'), 'utf8');
    expect(paper).toContain('[@');
    expect(paper).toContain('Related work (retrieved corpus)');
    const bib = fs.readFileSync(path.join(outDir, 'references.bib'), 'utf8');
    expect(bib).toContain('@article{');
    expect(bib).toContain('10.1000/probe-study');

    // --- README: verification instructions + limitations verbatim ---
    const readme = fs.readFileSync(path.join(outDir, 'README.md'), 'utf8');
    expect(readme).toContain(`far verify ${bundle.id}`);
    expect(readme).toContain('MANIFEST');
    expect(readme).toContain(bundle.limitations[0]!.slice(0, 24));

    // --- stage bundle records the new artifacts; every ref resolves in the store ---
    expect(bundle.figures).toHaveLength(2);
    expect(bundle.tables).toHaveLength(6); // 3 tables x (csv+md)
    for (const f of [...bundle.figures!, ...bundle.tables!]) {
      const content = await artifacts.get(f.ref);
      expect(content).not.toBeNull();
      expect(content!.length).toBeGreaterThan(0);
    }

    // --- pandoc: honest either way ---
    if (hasPandoc) {
      expect(result.pandoc.version).not.toBeNull();
      expect(result.pandoc.produced).toEqual(['docx', 'jats', 'html']);
      expect(fs.readFileSync(path.join(outDir, 'paper.docx')).subarray(0, 2).toString('latin1')).toBe('PK');
      expect(fs.readFileSync(path.join(outDir, 'paper.jats.xml'), 'utf8')).toContain('<article');
      expect(fs.readFileSync(path.join(outDir, 'paper.html'), 'utf8')).toContain('<html');
    } else {
      expect(result.pandoc.produced).toEqual([]);
      expect(result.pandoc.unavailable.every((u) => u.reason.includes('pandoc not found'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'paper.docx'))).toBe(false);
    }
  });

  it('is byte-deterministic: two builds of the same bundle produce identical files', async () => {
    const g = seedFullStudy();
    const artifacts = await runExport(g.runId);
    const dirA = path.join(tmp, 'det-a');
    const dirB = path.join(tmp, 'det-b');
    await buildReproducibilityPackage({ store, artifacts }, g.runId, { outDir: dirA, pandoc: null });
    await buildReproducibilityPackage({ store, artifacts }, g.runId, { outDir: dirB, pandoc: null });
    const filesA = walk(dirA).sort();
    const filesB = walk(dirB).sort();
    expect(filesA).toEqual(filesB);
    for (const f of filesA) {
      expect(fs.readFileSync(path.join(dirA, f))).toEqual(fs.readFileSync(path.join(dirB, f)));
    }
    // MANIFEST identical too (timestamps pinned to bundle.createdAt, not wall clock)
    expect(fs.readFileSync(path.join(dirA, 'MANIFEST.json'))).toEqual(fs.readFileSync(path.join(dirB, 'MANIFEST.json')));
  });
});

describe('buildReproducibilityPackage (failure paths — fail closed, never silently partial)', () => {
  it('rejects a run with no bundle (export stage not run)', async () => {
    const g = seedFullStudy();
    const artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
    await expect(buildReproducibilityPackage({ store, artifacts }, g.runId, { outDir: path.join(tmp, 'x') }))
      .rejects.toThrow(/export stage first/);
  });

  it('rejects an unknown run id', async () => {
    const artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
    await expect(buildReproducibilityPackage({ store, artifacts }, 'run_ghost00000000000000000000000', { outDir: path.join(tmp, 'x') }))
      .rejects.toThrow(/run not found/);
  });

  it('rejects when a stored artifact the bundle declares is unavailable on disk', async () => {
    const g = seedFullStudy();
    const artifacts = await runExport(g.runId);
    const bundle = store.listObjects('bundle', g.runId).at(-1)!;
    fs.rmSync(artifacts.path(bundle.paperOutlineRef!)); // simulate artifact loss
    await expect(buildReproducibilityPackage({ store, artifacts }, g.runId, { outDir: path.join(tmp, 'x') }))
      .rejects.toThrow(/missing in artifact store/);
  });

  it('rejects an unknown pandoc format name', async () => {
    const g = seedFullStudy();
    const artifacts = await runExport(g.runId);
    await expect(buildReproducibilityPackage({ store, artifacts }, g.runId, { outDir: path.join(tmp, 'x'), formats: ['pdf'] }))
      .rejects.toThrow(/unknown pandoc format "pdf"/);
  });
});

describe('buildReproducibilityPackage (partial study — honest emptiness)', () => {
  it('packages a question-only run with disclosed empty sections', async () => {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'An empty question?', background: '', goalType: 'exploratory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: ts(1),
    });
    store.putObject('question', q);
    const run = store.createRun(q);
    const artifacts = await runExport(run.id);
    const result = await buildReproducibilityPackage({ store, artifacts }, run.id, { outDir: path.join(tmp, 'partial'), pandoc: null });

    expect(result.paperIncluded).toBe(true);
    expect(result.citations?.citedKeys).toEqual([]);
    const paper = fs.readFileSync(path.join(tmp, 'partial', 'paper.md'), 'utf8');
    expect(paper).toContain('(No abstract points');
    expect(paper).toContain('(No contributions');
    const winRateSvg = fs.readFileSync(path.join(tmp, 'partial', 'figures', 'win-rate.svg'), 'utf8');
    expect(winRateSvg).toContain('No ranked hypotheses are stored');
    const resultsCsv = fs.readFileSync(path.join(tmp, 'partial', 'tables', 'results-overview.csv'), 'utf8');
    expect(resultsCsv.trim().split('\r\n')).toHaveLength(1); // header only — zero fabricated rows
    // empty corpus: n=0 disclosed in the figure, not silently omitted
    expect(fs.readFileSync(path.join(tmp, 'partial', 'figures', 'corpus-depth.svg'), 'utf8')).toContain('n=0');
  });
});
