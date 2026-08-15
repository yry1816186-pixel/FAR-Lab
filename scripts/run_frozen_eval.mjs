#!/usr/bin/env node
// scripts/run_frozen_eval.mjs — run the frozen evaluation set LIVE.
//
// §18.1/§18.3: for each `final` item in src/research/evaluation/frozen_eval_set.json,
// start a real research run (live model + real retrieval), then compute the
// program metrics (`far research evaluate`). Outputs under .far/eval/ (gitignored
// runtime evidence): <id>.run.json (frozen run) + <id>.metrics.json + summary.json,
// and prints a markdown table. Idempotent: existing outputs are skipped (--force
// re-runs). Honest modes: every row reports its runMode; a FAILED/absent run is
// reported as such, never silently retried into existence.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const EVAL_DIR = join(ROOT, '.far', 'eval');
const SET_PATH = join(ROOT, 'src', 'research', 'evaluation', 'frozen_eval_set.json');

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyFlag = args.find((a) => a.startsWith('--only='));
const sourcesFlag = args.find((a) => a.startsWith('--sources='));
const sources = sourcesFlag !== undefined ? sourcesFlag.slice(10).split('+') : ['openalex'];
const only = onlyFlag !== undefined ? onlyFlag.slice(7).split(',') : null;

function sh(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
    env: process.env,
    cwd: ROOT,
    ...opts,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function far(cmdArgs) {
  return sh(process.execPath, ['src/cli/far.ts', ...cmdArgs]);
}

const set = JSON.parse(readFileSync(SET_PATH, 'utf8'));
const items = set.items.filter((it) =>
  only !== null ? only.includes(it.id) : set.purpose.final.includes(it.id),
);
if (items.length === 0) {
  console.error('run_frozen_eval: no matching items');
  process.exit(2);
}
mkdirSync(EVAL_DIR, { recursive: true });

const key = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
if (key === undefined || key === '') {
  console.error(
    'run_frozen_eval: live evaluation needs DASHSCOPE_API_KEY in the environment (none found).',
  );
  process.exit(2);
}

const rows = [];
for (const item of items) {
  const runPath = join(EVAL_DIR, `${item.id}.run.json`);
  const metricsPath = join(EVAL_DIR, `${item.id}.metrics.json`);

  if (!force && existsSync(runPath) && existsSync(metricsPath)) {
    console.log(`= ${item.id}: cached`);
  } else {
    console.log(`▶ ${item.id}: live run starting (${item.evidenceProfile})`);
    const start = far([
      'research', 'start', item.question,
      '--profile', 'competition_aliyun_qwen',
      '--source', sources.join('+'),
      '--target', '3',
      '--out', runPath,
    ]);
    if (start.status !== 0) {
      console.error(`  ✖ start exit ${start.status}: ${start.stderr.split('\n').slice(-3).join(' | ')}`);
      rows.push({ id: item.id, status: `RUN_FAILED(exit ${start.status})`, runMode: 'n/a' });
      continue;
    }
    console.log(`  ✓ run completed`);
  }

  const run = JSON.parse(readFileSync(runPath, 'utf8'));
  const evalOut = far(['research', 'evaluate', runPath, '--json']);
  if (evalOut.status !== 0) {
    console.error(`  ✖ evaluate exit ${evalOut.status}`);
    rows.push({ id: item.id, status: 'EVALUATE_FAILED', runMode: run.runMode });
    continue;
  }
  const report = JSON.parse(evalOut.stdout);
  writeFileSync(metricsPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  const m = Object.fromEntries(report.metrics.map((x) => [x.name, x.value]));
  rows.push({
    id: item.id,
    status: 'OK',
    runMode: report.runModeIsLive === true ? 'LIVE' : run.runMode,
    corpusDocs: m.corpusDocumentCount ?? run.corpus.documentCount,
    hyps: m.hypothesisCount,
    binding: m.citationBindingRate,
    falsifiability: m.falsifiabilityCompleteness,
    counterQ: m.counterEvidenceQueryCount,
    planComplete: m.planCompleteness,
    recompute: report.deterministicRecompute,
  });
}

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  gitCommit: sh('git', ['rev-parse', 'HEAD']).stdout.trim(),
  questionSet: 'frozen_eval_set.json · purpose.final',
  sources,
  rows,
};
writeFileSync(join(EVAL_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

const head = '| item | status | mode | corpus | hyps | binding | falsifiable | counterQ | plan | recompute |';
const line = (r) =>
  `| ${r.id} | ${r.status} | ${r.runMode} | ${r.corpusDocs ?? '—'} | ${r.hyps ?? '—'} | ${r.binding ?? '—'} | ${r.falsifiability ?? '—'} | ${r.counterQ ?? '—'} | ${r.planComplete ?? '—'} | ${r.recompute ?? '—'} |`;
console.log('\n' + [head, '|---|---|---|---|---|---|---|---|---|---|', ...rows.map(line)].join('\n'));
const failed = rows.filter((r) => r.status !== 'OK').length;
process.exit(failed > 0 ? 1 : 0);
