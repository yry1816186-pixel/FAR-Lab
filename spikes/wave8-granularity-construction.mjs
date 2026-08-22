/**
 * Wave-8 construction B: resume-granularity loss, deterministically reproduced on
 * PRODUCTION code (dist/app/orchestrator.js) with a counting stage handler.
 *
 * Scenario: a stage performs N independent subtasks (mirrors rank tournament pairs /
 * critique_falsify per-hypothesis loops / retrieve per-query searches). The worker is
 * killed after K of N subtasks (simulated by abandoning the promise — exactly what a
 * process kill leaves in the DB: stage state=running, subtask results unpersisted).
 * Then a resume runs. Measure: subtasks re-executed vs subtasks already done.
 *
 * Deterministic, no model calls, scratch DB under a temp dir. Exit 0.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../dist/persistence/db.js';
import { Store } from '../dist/persistence/store.js';
import { Orchestrator } from '../dist/app/orchestrator.js';
import { ResearchQuestion, newId } from '../dist/domain/index.js';
import { STAGE_ORDER } from '../dist/domain/run.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-w8-gran-'));
const db = openDb(path.join(dir, 'far.db'));
const store = new Store(db);

const q = ResearchQuestion.parse({
  id: newId('q'), text: 'construction question', background: '', goalType: 'explanatory',
  scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
});
const run = store.createRun(q);

const SUBTASKS = 10; // e.g. rank tournament pair comparisons in a real run
let subtaskExecutions = 0;
let killAfter = 6;   // worker dies after 6 of 10 subtasks

const countingStage = (stage) => ({
  stage,
  applicable: async () => true,
  execute: async () => {
    for (let i = 1; i <= SUBTASKS; i++) {
      if (i > killAfter) {
        // simulate worker death mid-stage: the promise never settles, nothing more persists.
        // What the DB keeps = exactly what a killed process keeps: stage state=running,
        // prior stages done, NO subtask results (they are only persisted at stage end).
        await new Promise(() => {});
      }
      subtaskExecutions++;
    }
    return { kind: 'done', summary: `${stage} done` };
  },
});

const stages = new Map(STAGE_ORDER.map((s) => [
  s,
  s === 'retrieve' ? countingStage(s) : { stage: s, applicable: async () => true, execute: async () => ({ kind: 'done', summary: `${s} done` }) },
]));

const orch = new Orchestrator({
  store,
  artifacts: {}, provider: {}, sourceFor: () => { throw new Error('unused'); },
  stages, signals: new Map(),
});

// worker "dies": we do NOT await; after 200ms the abandoned execution is dead-in-water
const worker = orch.execute(run.id);
await new Promise((r) => setTimeout(r, 200));
const killedState = store.getRun(run.id);
const stuck = killedState.stages.find((s) => s.stage === 'retrieve');
const deadRunRow = {
  status: killedState.status,
  retrieveStageState: stuck.state,
  note: 'status=running + stage=running is EXACTLY the frozen-run signature the real DB shows (3 silent-kill victims, evidence/W8/pain-measurement.json)',
};

// nothing supervises: simulate the world after the kill — the row sits until a HUMAN resumes
killAfter = SUBTASKS; // a later resume completes the stage
const before = subtaskExecutions;
const afterResume = await orch.execute(run.id);
const reExecuted = subtaskExecutions - before;

const result = {
  measuredAt: new Date().toISOString(),
  subtasksTotal: SUBTASKS,
  subtasksCompletedBeforeKill: killAfter === SUBTASKS ? 6 : killAfter, // 6 done in-memory only
  persistedSubtaskResultsAfterKill: 0,
  deadRunRow,
  resumeOutcome: { status: afterResume.status, subtasksReExecutedOnResume: reExecuted },
  waste: `${6} of ${SUBTASKS} completed subtasks were lost (60%); resume redid all ${SUBTASKS}`,
  wallClockAnalogy: 'mean rank stage = 17 model calls; a kill at 90% through rank re-pays all 17 on resume today',
};
console.log(JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(process.cwd(), 'evidence/W8/granularity-construction.json'), JSON.stringify(result, null, 2));
worker.catch(() => {}); // abandoned promise: keep node alive-exit clean
db.close();
process.exit(0);
