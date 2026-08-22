/**
 * WP4 benchmark: falsify-stage wall-clock, sequential vs bounded concurrency.
 * Deterministic by construction: test-stub scripted latency (no network), identical
 * payloads/outputs at both settings; the ONLY variable is overlap. Mirrors the
 * tests/pipeline-hypotheses.test.ts StageContext harness.
 * Usage: node spikes/waveg-concurrency-bench.mjs
 */
import { spawnSync } from 'node:child_process';

const CHILD = `
const { openDb } = await import('./dist/persistence/db.js');
const { Store } = await import('./dist/persistence/store.js');
const { createTestStubProvider } = await import('./dist/providers/test-stub.js');
const { STAGE_CONCURRENCY } = await import('./dist/pipeline/stages/shared.js');
const { newId } = await import('./dist/domain/index.js');

const spec = (i) => JSON.stringify({
  observable: 'obs ' + i, measurement: 'meas ' + i, expectedRelation: 'rel ' + i,
  decisionRule: 'if x >= ' + i + ' then supported else weakened', decisionRuleProvenance: 'model-stipulated',
  supportCondition: 's' + i, weakeningCondition: 'w' + i, falsificationCondition: 'f' + i,
  confounders: [], alternativeExplanations: [], dataRequirements: [],
  method: 'm' + i, failureInterpretation: 'fi' + i,
  assumptionCritiques: [], counterLinks: [], supportingClaimIds: [], supportingLinks: [],
  uncertainties: [], testability: 'testable_now',
});
const RUN_ID = 'run_' + 'b'.repeat(26);
const H = [0, 1, 2, 3].map((i) => 'hyp_bench' + String(i).padStart(2, '0') + 'x'.repeat(20));
const dir = '.far-run/bench-wg-' + process.env.BENCH_TAG;
const db = openDb(dir + '/t.db');
const store = new Store(db);
const q = (await import('./dist/domain/index.js')).ResearchQuestion.parse({
  id: newId('q'), text: 'bench', background: '', goalType: 'explanatory',
  scope: { domain: 'd', phenomena: ['p'] }, constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
});
const run = store.createRun(q);
for (const [i, h] of H.entries()) {
  store.putObject('hypothesis', {
    id: h, runId: run.id, version: 0, statement: 'statement ' + i, mechanism: 'mechanism ' + i,
    derivation: { strategy: 'mechanism_driven', rationale: 'r' + i, inputClaimIds: [] },
    assumptions: [], predictions: ['p' + i], supportingClaimIds: [], counterClaimIds: [],
    uncertainties: [], noveltyLabel: 'evidence_grounded', testability: 'testable_now',
    clusterKey: 'k' + i, createdAt: new Date().toISOString(),
  });
}
const steps = H.map((h, i) => ({ forPurpose: 'falsification-spec:' + h, delayMs: 120, rawOutput: spec(i) }));
const provider = createTestStubProvider(steps, { name: 'bench-stub' });
const ctx = {
  run, store,
  artifacts: { put: async (p) => ({ ref: 'sha256:' + '0'.repeat(64), hash: '0'.repeat(64), size: String(p).length }), get: async () => null, path: () => dir },
  provider,
  sourceFor: () => { throw new Error('not needed'); },
  recordReceipt: () => {},
  cancelled: () => false,
  disowned: () => false,
  log: () => {},
  checkpointed: async (_s, _f, _k, _fp, fn) => fn(),
};
const falsify = (await import('./dist/pipeline/stages/falsify.js')).falsifyStage;
const t0 = Date.now();
const out = await falsify.execute(ctx);
const wallMs = Date.now() - t0;
const hyps = store.listObjects('hypothesis', run.id).map((h) => h.id).sort().join(',');
console.log(JSON.stringify({ concurrency: STAGE_CONCURRENCY, wallMs, outcome: out.kind, hypOrder: hyps }));
process.exit(0);
`;

const run = (concurrency, tag) => {
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    encoding: 'utf8',
    env: { ...process.env, FARLAB_STAGE_CONCURRENCY: String(concurrency), BENCH_TAG: tag },
    timeout: 120_000,
  });
  if (res.status !== 0) throw new Error(`child(concurrency=${concurrency}) failed: ${res.stderr.slice(0, 500)}`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
};

const seq = run(1, 'seq');
const par = run(3, 'par');
console.log(`sequential (concurrency=1): ${seq.wallMs}ms  hyps=${seq.hypOrder}`);
console.log(`bounded    (concurrency=3): ${par.wallMs}ms  hyps=${par.hypOrder}`);
console.log(`outputs identical (order+content): ${seq.hypOrder === par.hypOrder && seq.outcome === par.outcome}`);
console.log(`falsify-segment speedup: ${(seq.wallMs / par.wallMs).toFixed(2)}x (4 calls x 120ms scripted; only overlap differs)`);
