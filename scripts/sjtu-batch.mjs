import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const root = path.resolve(arg('out', 'artifacts/sjtu-125'));
fs.mkdirSync(root, { recursive: true });
const json = (file, value) => { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(`${p}.tmp`, JSON.stringify(value, null, 2)); fs.renameSync(`${p}.tmp`, p); };
if (args.includes('--key-stdin')) {
  const input = createInterface({ input: process.stdin, terminal: false });
  console.log('Waiting for API credential on stdin (not persisted).');
  process.env.DASHSCOPE_API_KEY = await new Promise((resolve, reject) => { input.once('line', line => { resolve(line.trim()); input.close(); }); input.once('close', () => reject(new Error('Credential stdin ended before a key was received'))); });
}
process.env.FARLAB_DASHSCOPE_MODEL = 'qwen3.7-max';
process.env.FARLAB_DASHSCOPE_THINKING = 'off';
process.env.FARLAB_MODEL_PROVIDER = 'dashscope';
process.env.FARLAB_MODEL_CONCURRENCY = arg('model-concurrency', '80');
process.env.FARLAB_TOTAL_BUDGET_MS = '180000';
process.env.FARLAB_MIN_CALL_INTERVAL_MS = '0';
process.env.FARLAB_MAX_ITERATION_ROUNDS = '1';
process.env.FARLAB_RUN_TOKEN_BUDGET = arg('token-budget', '500000');
const useFallbackForQuota = reason => {
  if (!/quota_exceeded|insufficient.*(?:balance|quota)|balance.*insufficient/i.test(reason ?? '') || !process.env.FARLAB_DASHSCOPE_FALLBACK_API_KEY) return false;
  process.env.DASHSCOPE_API_KEY = process.env.FARLAB_DASHSCOPE_FALLBACK_API_KEY;
  delete process.env.FARLAB_DASHSCOPE_FALLBACK_API_KEY;
  fs.appendFileSync(path.join(root, 'credential-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event: 'switched_to_user_authorized_backup_after_quota_error' }) + '\n');
  console.log('Quota exhausted: switching to user-authorized backup credential.');
  return true;
};
const { createDashScopeProvider } = await import('../dist/providers/dashscope.js');
let provider = createDashScopeProvider();
const preflight = () => provider.structuredCall({ task: 'Return JSON {"ready":true}.', userPayload: {}, outputKind: 'json', purpose: 'sjtu-batch-preflight', maxTokens: 100, signal: AbortSignal.timeout(45000) }, raw => raw?.ready === true ? raw : new Error('Expected ready=true'));
let probe = await preflight();
if (!probe.ok && useFallbackForQuota(`${probe.error?.kind}: ${probe.error?.message}`)) { provider = createDashScopeProvider(); probe = await preflight(); }
json('preflight.json', { at: new Date().toISOString(), ok: probe.ok, error: probe.error, receipt: probe.receipt, baseUrl: provider.baseUrl });
console.log(JSON.stringify({ preflight: probe.ok, error: probe.error, receipt: probe.receipt }));
if (!probe.ok) { process.exitCode = 2; } else if (!args.includes('--probe')) {
  const { createApp } = await import('../dist/app/composition.js');
  const { ResearchQuestion, newId } = await import('../dist/domain/index.js');
  const { buildReproducibilityPackage } = await import('../dist/report/package.js');
  const input = JSON.parse(fs.readFileSync(arg('questions', 'artifacts/sjtu-125/source/questions.json'), 'utf8'));
  const questions = Array.isArray(input) ? input : (input.questions ?? input.problems);
  if (questions.length !== 125 || new Set(questions.map(q => q.id)).size !== 125) throw new Error('Expected 125 distinct questions');
  const limit = Number(arg('limit', '125'));
  const concurrency = Number(arg('concurrency', '20'));
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 80) throw new Error('Concurrency must be 1..80');
  const started = Date.now();
  const records = fs.existsSync(path.join(root, 'runs.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'runs.json'), 'utf8')) : {};
  let cursor = 0;
  const app = await createApp({ dataDir: path.join(root, 'runtime'), providerName: 'dashscope' });
  if (args.includes('--recover-stopped')) {
    for (const record of Object.values(records)) {
      const lease = app.store.getRunLease(record.runId);
      if (!lease.holder) continue;
      const owner = Number(lease.holder.split('-')[0]);
      let stopped = false;
      try { process.kill(owner, 0); } catch (error) { if (error.code === 'ESRCH') stopped = true; else throw error; }
      if (!stopped) throw new Error(`Refusing recovery: lease owner ${owner} is still alive`);
      app.store.releaseLease(record.runId, lease.holder);
      app.store.appendEvent(record.runId, { type: 'note', detail: { reason: 'batch_stopped_process_lease_recovery', previousOwnerPid: owner, recoveringPid: process.pid } });
    }
  }
  const snapshot = () => { json('runs.json', records); const states = {}; for (const r of Object.values(records)) states[r.status] = (states[r.status] ?? 0) + 1; const progress = { updatedAt: new Date().toISOString(), elapsedSeconds: Math.round((Date.now() - started) / 1000), total: questions.length, started: Object.keys(records).length, states }; json('progress.json', progress); console.log(JSON.stringify(progress)); };
  const timer = setInterval(snapshot, 30000);
  json('configuration.json', { pid: process.pid, model: provider.modelId, provider: provider.name, baseUrl: provider.baseUrl, concurrency, modelConcurrency: Number(process.env.FARLAB_MODEL_CONCURRENCY), iterationRounds: 1, runTokenBudget: Number(process.env.FARLAB_RUN_TOKEN_BUDGET), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workspaceHasExistingChanges: true, startedAt: new Date(started).toISOString(), scope: 'Full FAR-Lab pipeline, one autonomous iteration; scientific findings remain unverified until independent validation.' });
  try {
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (cursor < Math.min(limit, questions.length)) {
        const item = questions[cursor++];
        const id = String(item.id);
        if (records[id]?.status === 'completed' && records[id]?.exported) continue;
        let run;
        try {
          run = records[id]?.runId ? app.store.getRun(records[id].runId) : null;
          if (!run) {
            const text = item.question ?? item.text ?? item.title;
            if (typeof text !== 'string' || text.length < 5) throw new Error('Missing question text');
            // Page context includes neighboring questions and is provenance only.
            const q = ResearchQuestion.parse({ id: newId('q'), text, background: '', goalType: 'exploratory', scope: { domain: item.category ?? item.domain ?? 'general science', phenomena: [text] }, constraints: { resourceConstraints: ['Bounded automated literature research; do not claim real-world experiments were performed without execution evidence.'] }, createdAt: new Date().toISOString() });
            run = app.store.createRun(q, { routeOverride: 'dashscope' });
          }
          records[id] = { ...records[id], id: item.id, question: item.question ?? item.text ?? item.title, runId: run.id, status: 'running', startedAt: records[id]?.startedAt ?? new Date().toISOString(), exported: false };
          snapshot();
          for (let attempt = 1; attempt <= 2; attempt++) {
            run = await app.orchestrator.execute(run.id);
            records[id] = { ...records[id], status: run.status, runStatus: run.status, attempt, error: run.lastError, stages: run.stages };
            snapshot();
            if (run.stages.some(s => s.state === 'failed') && useFallbackForQuota(run.lastError)) { attempt--; continue; }
            if (!run.stages.some(s => s.state === 'failed') || /auth|quota|401|403/i.test(run.lastError ?? '')) break;
          }
          const dir = path.join(root, 'results', id.padStart(3, '0'));
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'question.json'), JSON.stringify(item, null, 2));
          fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run, null, 2));
          fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(app.store.listEvents(run.id), null, 2));
          fs.writeFileSync(path.join(dir, 'receipts.json'), JSON.stringify(app.store.listObjects('receipt', run.id), null, 2));
          if (app.store.listObjects('bundle', run.id).length) {
            await buildReproducibilityPackage({ store: app.store, artifacts: app.artifacts }, run.id, { outDir: dir, pandoc: null });
            records[id].exported = true;
          }
          records[id].endedAt = new Date().toISOString();
        } catch (error) {
          records[id] = { ...records[id], status: 'failed', runStatus: run?.status, error: String(error.message).slice(0, 1500), endedAt: new Date().toISOString() };
        }
        snapshot();
      }
    }));
  } finally { clearInterval(timer); snapshot(); app.close(); }
  process.exitCode = Object.values(records).filter(r => r.status === 'completed' && r.exported).length === Math.min(limit, 125) ? 0 : 2;
}
