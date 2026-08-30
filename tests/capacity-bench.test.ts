import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ScientificClaim, EvidenceRelation, HypothesisCandidate, ResearchQuestion, newId } from '../src/domain/index.js';
import { projectScientificState } from '../src/domain/scientific-state.js';
import { buildLineageGraph } from '../src/app/lineage.js';

/**
 * FA-PRF-01 capacity benchmark (endgame audit: "1000+ claims / 100+ hypotheses
 * never measured" — PERF_BASELINE.md admitted corpus caps at ~21 claims).
 *
 * *** SYNTHETIC *** fixture by design: zod-valid objects with fabricated text,
 * clearly labelled here and in every emitted number. It measures the SYSTEM's
 * projection/read/write paths at scale, never scientific content. Production
 * paths only: real sqlite, real store, real domain projections — no mocks.
 *
 * Always-on with generous CI ceilings (capacity regression gate); set
 * FARLAB_CAPACITY_EVIDENCE=1 to also archive the numbers as a JSON artifact.
 */

const N_CLAIMS = 1000;
const N_HYPS = 100;
const N_RELATIONS = 3000;

let tmp: string;
let db: Db;
let store: Store;
let runId: string;
/** measured numbers (SYNTHETIC) — archived by the last test when env is set */
const measured: Record<string, number> = {};

const T0 = '2026-08-30T00:00:00.000Z';

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-capacity-'));
  db = openDb(path.join(tmp, 'far.db'));
  store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'SYNTHETIC capacity fixture: 1000-claim projection stress',
    background: '', goalType: 'explanatory',
    scope: { domain: 'reliability', phenomena: ['capacity'] }, constraints: {}, createdAt: T0,
  });
  runId = store.createRun(question).id;
});

afterAll(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ms = async (fn: () => Promise<void> | void): Promise<number> => {
  const t0 = performance.now();
  await fn();
  return Math.round(performance.now() - t0);
};

describe('capacity: 1000 claims / 100 hypotheses / 3000 relations (SYNTHETIC)', () => {
  it('bulk write stays inside the write budget', async () => {
    const writeMs = await ms(async () => {
      for (let i = 0; i < N_CLAIMS; i++) {
        const text = `SYNTHETIC claim ${i}: measured effect ${i % 97} under condition ${i % 13}`;
        const claim = ScientificClaim.parse({
          id: newId('clm'), runId, text,
          locators: [{ sourceDocumentId: `src_synth${String(i % 40).padStart(24, '0')}`, quote: text }],
          bindingStatus: 'verified', alignmentChecked: true,
        });
        store.putObjectEvented('claim', claim, { type: 'note', detail: { synthetic: true, i } }, T0);
      }
      for (let h = 0; h < N_HYPS; h++) {
        const hyp = HypothesisCandidate.parse({
          id: newId('hyp'), runId, version: 0,
          statement: `SYNTHETIC hypothesis ${h}: mechanism ${h % 7} drives the effect`,
          mechanism: `synthetic mechanism ${h % 7}`,
          derivation: { strategy: 'mechanism_driven', rationale: 'synthetic', inputClaimIds: [] },
          assumptions: [{ id: 'a1', statement: 'synthetic assumption', kind: 'empirical', backingClaimIds: [] }],
          predictions: [`synthetic prediction ${h}`],
          supportingClaimIds: [], counterClaimIds: [], uncertainties: [], noveltyLabel: 'mixed',
          testability: 'testable_with_data', clusterKey: `c${h % 10}`, createdAt: T0,
        });
        store.putObjectEvented('hypothesis', hyp, { type: 'note', detail: { synthetic: true, h } }, T0);
      }
      for (let r = 0; r < N_RELATIONS; r++) {
        const rel = EvidenceRelation.parse({
          id: newId('ev'), runId,
          relation: r % 3 === 0 ? 'contradicts' : 'supports',
          claimId: `clm_synth${String(r % N_CLAIMS).padEnd(24, '0')}`,
          targetHypothesisId: undefined, rationale: 'synthetic', strength: 'weak',
          uncertainties: [], createdAt: T0,
        });
        store.putObjectEvented('evidence_relation', rel, { type: 'note', detail: { synthetic: true, r } }, T0);
      }
    });
    console.log(`CAPACITY(SYNTHETIC) bulk-write: ${N_CLAIMS}+${N_HYPS}+${N_RELATIONS} objects+events in ${writeMs}ms`);
    measured.bulkWriteMs = writeMs;
    expect(writeMs).toBeLessThan(120_000); // generous CI ceiling
  });

  it('science projection (the /science hot path) stays inside budget at scale', async () => {
    // First projection warms sqlite page cache; measure the warm path the UI
    // hits on refresh, plus a cold-path number for the artifact.
    const cold = await ms(() => {
      const claims = store.listObjects('claim', runId);
      const relations = store.listObjects('evidence_relation', runId);
      const hypotheses = store.listObjects('hypothesis', runId);
      const state = projectScientificState({
        runId, runStatus: 'completed', questionDomain: 'reliability',
        claims, relations, hypotheses, scorecards: [], evidenceBodies: [],
        tournament: null, counterQueriesAttempted: 3, hypothesesStageConcluded: true,
      });
      if (state.kind !== 'evidence_backed' && state.kind !== 'insufficient') throw new Error(`unexpected kind ${state.kind}`);
    });
    const warmRuns: number[] = [];
    for (let i = 0; i < 3; i++) {
      warmRuns.push(await ms(() => {
        const claims = store.listObjects('claim', runId);
        const relations = store.listObjects('evidence_relation', runId);
        const hypotheses = store.listObjects('hypothesis', runId);
        projectScientificState({
          runId, runStatus: 'completed', questionDomain: 'reliability',
          claims, relations, hypotheses, scorecards: [], evidenceBodies: [],
          tournament: null, counterQueriesAttempted: 3, hypothesesStageConcluded: true,
        });
      }));
    }
    const warm = Math.max(...warmRuns);
    console.log(`CAPACITY(SYNTHETIC) /science projection: cold ${cold}ms, worst-of-3 warm ${warm}ms`);
    measured.scienceProjectionColdMs = cold;
    measured.scienceProjectionWarmMaxMs = warm;
    expect(warm).toBeLessThan(2_000);
  });

  it('event spine read (listEvents) stays inside budget at 4k+ events', async () => {
    const t = await ms(() => {
      const events = store.listEvents(runId);
      if (events.length < N_CLAIMS + N_HYPS + N_RELATIONS) throw new Error(`expected 4k+ events, saw ${events.length}`);
    });
    console.log(`CAPACITY(SYNTHETIC) listEvents(4100+): ${t}ms`);
    measured.listEventsMs = t;
    expect(t).toBeLessThan(1_500);
  });

  it('lineage graph build stays inside budget', async () => {
    const t = await ms(() => { buildLineageGraph({ store, rootRunId: runId }); });
    console.log(`CAPACITY(SYNTHETIC) buildLineageGraph: ${t}ms`);
    measured.buildLineageGraphMs = t;
    expect(t).toBeLessThan(3_000);
  });

  it('archives the numbers when FARLAB_CAPACITY_EVIDENCE=1', () => {
    if (process.env.FARLAB_CAPACITY_EVIDENCE !== '1') return;
    const dir = path.join(process.cwd(), 'evidence', 'capacity');
    fs.mkdirSync(dir, { recursive: true });
    const artifact = {
      synthetic: true,
      generatedAt: new Date().toISOString(),
      scale: { claims: N_CLAIMS, hypotheses: N_HYPS, relations: N_RELATIONS },
      measured,
      note: 'SYNTHETIC fixture — measures system projection/read/write capacity, never scientific content.',
    };
    fs.writeFileSync(path.join(dir, `capacity-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(artifact, null, 2) + '\n');
    expect(fs.existsSync(path.join(dir, `capacity-${new Date().toISOString().slice(0, 10)}.json`))).toBe(true);
  });
});
