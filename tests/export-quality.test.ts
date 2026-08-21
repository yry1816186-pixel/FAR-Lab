import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EvidenceRelation,
  ProvenanceReceipt,
  ResearchPlan,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  SourceDocument,
  newId,
} from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore, type ArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { exportStage } from '../src/pipeline/stages/export.js';
import type { StageContext } from '../src/pipeline/types.js';

// *** TEST-ONLY *** W2 report-quality fixtures. The plan is persisted DIRECTLY (not via
// planStage) to reproduce a pre-W2 stored run whose steps contain fabricated `task_`
// references — exactly the state of evidence/W1/run_7zez1a8ezbbrrgw9begtta0gsw. The
// export stage must defend at render time without re-running the pipeline.

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ArtifactStore;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-export-quality-'));
  db = openDb(path.join(tmp, 'state.db'));
  store = new Store(db);
  artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ts = (i: number) => new Date(Date.now() + i * 1000).toISOString();

const GHOST_TASK = 'task_1a2b3c4d5e6f7a8b9c0d1e2f'; // fabricated step id (mirrors the real W1 run)

/** Pre-W2 stored-run fixture: question / 2 sources / 2 claims / 2 counter relations / 1 plan with ghost task refs. */
const seedPreW2Run = () => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Do hospital sink biofilms mediate ARG transfer to pathogens?',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'microbiology', phenomena: ['ARG transfer'] },
    constraints: {},
    createdAt: ts(1),
  });
  const now = new Date().toISOString();
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'created',
    currentStage: 'scope',
    stages: STAGE_ALL.map((stage) => ({ stage, state: 'pending' })),
    createdAt: now,
    updatedAt: now,
    tags: [],
  });
  // same createRunRow workaround as pipeline-export.test.ts (store.appendEvent seq=0 bug — read-only contract)
  store.putObject('question', q);
  db.prepare(
    'INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), now, now);

  const srcA = SourceDocument.parse({
    id: newId('src'),
    runId: run.id,
    family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1000/biofilm-survey' }],
    title: `${'T'.repeat(45)}`, // 45 chars -> must truncate to 40 + '…' in the counter line
    publicationYear: 2024,
    authors: ['B. Author'],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: `${'a'.repeat(64)}`, // sha256-hex shaped
    retrievedAt: ts(2),
    parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, detail: 'ok', checkedAt: ts(2) },
  });
  const srcB = SourceDocument.parse({
    id: newId('src'),
    runId: run.id,
    family: 'arxiv',
    identifiers: [{ kind: 'arxiv', value: '2401.99999' }],
    title: 'Transformation assay failure report',
    publicationYear: 2023,
    authors: ['C. Author'],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: `${'b'.repeat(64)}`,
    retrievedAt: ts(3),
    parseStatus: 'ok',
    verification: { method: 'arxiv_id', resolved: true, titleMatch: true, detail: 'ok', checkedAt: ts(3) },
  });

  // 150-char claim text: first 120 chars are 'A' — everything past char 120 must be elided
  const longClaimText = `${'A'.repeat(120)}UNIQUETAIL${'B'.repeat(20)}`;
  const clmLong = ScientificClaim.parse({
    id: newId('clm'),
    runId: run.id,
    text: longClaimText,
    locators: [{ sourceDocumentId: srcA.id, quote: 'survey of biofilm ARG transfer' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
    uncertainties: ['only one hospital sampled'],
  });
  const clmUnaligned = ScientificClaim.parse({
    id: newId('clm'),
    runId: run.id,
    text: 'ICU sink biofilms carry 12 ARG families',
    locators: [{ sourceDocumentId: srcB.id, quote: 'unrelated abstract text' }],
    bindingStatus: 'resolved_unaligned',
    alignmentChecked: true,
    uncertainties: [],
  });

  const relCounterClaim = EvidenceRelation.parse({
    id: newId('ev'),
    runId: run.id,
    relation: 'contradicts',
    claimId: clmLong.id,
    rationale: 'critique-linked counter evidence', // generic rationale — the exact W1 defect
    strength: 'strong',
    uncertainties: [],
    createdAt: ts(4),
  });
  const relCounterSource = EvidenceRelation.parse({
    id: newId('ev'),
    runId: run.id,
    relation: 'fails_to_replicate',
    sourceDocumentId: srcB.id, // pure source-level counter relation (no claimId)
    rationale: 'failed replication in independent lab',
    strength: 'moderate',
    uncertainties: [],
    createdAt: ts(5),
  });

  const step1Id = newId('task');
  const step2Id = newId('task');
  const plan = ResearchPlan.parse({
    id: newId('pln'),
    runId: run.id,
    objective: 'Quantify biofilm-mediated ARG transfer in hospital sinks',
    hypothesisIds: [`hyp_${'1'.repeat(26)}`],
    variables: ['biofilm mass', 'ARG transfer rate'],
    controls: ['sterile sink model'],
    inclusionCriteria: [],
    exclusionCriteria: [],
    dataRequirements: [],
    toolRequirements: [],
    steps: [
      {
        id: step1Id,
        title: 'sample sink biofilms',
        kind: 'experiment',
        inputs: ['sampling swabs', GHOST_TASK], // fabricated input ref from the pre-W2 model output
        outputs: ['biofilm extracts'],
        method: 'swab 20 sink drains',
        failureConditions: ['low biomass'],
        dependsOn: [],
      },
      {
        id: step2Id,
        title: 'measure transfer rate',
        kind: 'data_analysis',
        inputs: ['biofilm extracts'],
        outputs: ['transfer rate table'],
        method: 'qPCR ARG quantification',
        failureConditions: ['inhibition'],
        dependsOn: [GHOST_TASK], // fabricated dependency
      },
    ],
    metrics: ['transfer events per gram biofilm'],
    statistics: [],
    decisionRules: {
      successCriterion: 'rate above sterile control',
      weakeningCriterion: 'rate near control',
      falsificationCriterion: 'no transfer in any sample',
      stopCriterion: '20 sinks analysed',
    },
    confounders: [],
    alternativeExplanations: [],
    resources: { compute: 'low', cost: 'low', time: '3 months' },
    risks: [],
    ethics: [],
    prerequisites: [],
    alternativeBranches: [],
    reproducibilityRequirements: [],
    evidenceClaimIds: [],
    executabilityCheck: { passed: true, missing: [] }, // pre-W2 check did not cover step refs
    createdAt: ts(6),
  });

  store.putObject('source_document', srcA);
  store.putObject('source_document', srcB);
  store.putObject('claim', clmLong);
  store.putObject('claim', clmUnaligned);
  store.putObject('evidence_relation', relCounterClaim);
  store.putObject('evidence_relation', relCounterSource);
  store.putObject('plan', plan);

  return { run, srcA, srcB, clmLong, clmUnaligned, plan };
};

const makeCtx = (run: ResearchRun): StageContext => ({
  run,
  store,
  artifacts,
  provider: createTestStubProvider([]), // export performs no model call; empty script fails loudly if that changes
  sourceFor: () => {
    throw new Error('no source adapter available in test');
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
});

/** Seed a fresh pre-W2 run, execute the export stage, return the rendered report. */
const renderPreW2Report = async () => {
  const g = seedPreW2Run();
  const outcome = await exportStage.execute(makeCtx(g.run));
  if (outcome.kind !== 'done') throw new Error('expected done outcome');
  const report = await artifacts.get(outcome.artifacts[0]!);
  if (report === null) throw new Error('report artifact missing');
  return { report, ...g };
};

describe('export report quality (W2)', () => {
  it('renders counter-evidence lines with claim text (120-char cap) and source title (40-char cap)', async () => {
    const { report } = await renderPreW2Report();
    // exact §4 line: [relation] claimText120…（来源: title40…，strength=…）
    expect(report).toContain(`[contradicts] ${'A'.repeat(120)}…（来源: ${'T'.repeat(40)}…，strength=strong）`);
    // the tail past the 120-char cap must be elided, and the bare-rationale defect must be gone
    expect(report).not.toContain('UNIQUETAIL');
    expect(report).not.toContain('[contradicts] critique-linked counter evidence');
  });

  it('renders source-level counter relations (no claimId) by source title', async () => {
    const { report } = await renderPreW2Report();
    expect(report).toContain(
      '[fails_to_replicate] Transformation assay failure report（来源: Transformation assay failure report，strength=moderate）',
    );
  });

  it('defends §7 against invalid task refs from pre-sanitization plans (marker instead of raw id)', async () => {
    const { report } = await renderPreW2Report();
    expect(report).toContain('(invalid ref removed at render)');
    expect(report).toContain('inputs：sampling swabs；(invalid ref removed at render)');
    expect(report).toContain('dependsOn：(invalid ref removed at render)');
    // the fabricated id must never surface verbatim as if it were a real step reference
    expect(report).not.toContain(GHOST_TASK);
  });

  it('still lists resolved_unaligned claims with full per-item text in §3 (regression)', async () => {
    const { report, clmUnaligned } = await renderPreW2Report();
    expect(report).toContain(`- ${clmUnaligned.id}：ICU sink biofilms carry 12 ARG families`);
  });

  it('keeps the claim-id prefix on every §8 uncertainty line (regression)', async () => {
    const { report, clmLong } = await renderPreW2Report();
    expect(report).toContain(`- 声明 ${clmLong.id}：only one hospital sampled`);
  });
});
