import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(process.argv[2] ?? 'artifacts/sjtu-125');
const db = new DatabaseSync(path.join(root, 'runtime', 'far.db'), { readOnly: true });
try {
  const runs = db.prepare('SELECT doc FROM runs').all().map(r => JSON.parse(r.doc));
  const receipts = db.prepare('SELECT json FROM objects WHERE kind=?').all('receipt').map(r => JSON.parse(r.json));
  const model = receipts.filter(r => r.modelCall);
  const sources = {};
  for (const r of receipts.filter(r => r.sourceRetrieval)) {
    const k = `${r.sourceRetrieval.family}:${r.sourceRetrieval.httpStatus}`;
    sources[k] = (sources[k] ?? 0) + 1;
  }
  const stages = {};
  for (const r of runs) { const k = `${r.status}:${r.currentStage}`; stages[k] = (stages[k] ?? 0) + 1; }
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (const r of model) for (const k of Object.keys(usage)) usage[k] += r.modelCall.usage[k] ?? 0;
  const result = {
    at: new Date().toISOString(), runCount: runs.length, stages,
    exportedReports: fs.existsSync(path.join(root, 'results')) ? fs.readdirSync(path.join(root, 'results')).filter(x => fs.existsSync(path.join(root, 'results', x, 'report.md'))).length : 0,
    modelCalls: model.length, usage,
    modelRoutes: [...new Set(model.map(r => `${r.modelCall.provider}:${r.modelCall.modelId}:${r.executionMode}`))],
    sourceStatuses: sources,
    failures: runs.filter(r => r.lastError).map(r => ({ runId: r.id, stage: r.currentStage, error: r.lastError.slice(0, 700) })),
  };
  console.log(JSON.stringify(result, null, 2));
} finally { db.close(); }
