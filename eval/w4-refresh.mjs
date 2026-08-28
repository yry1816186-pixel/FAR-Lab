#!/usr/bin/env node
/**
 * W4-R (refresh) driver — 2026-08-29.
 * Re-runs the pre-declared W4 protocol (eval/PROTOCOL.md) on the CURRENT
 * architecture (post: direction-anchored falsify audit, claim ops, 12-stage
 * spine, transport fixes) against fresh baseline-direct / baseline-rag runs.
 *
 * Fairness identical to W4: same question set, same provider route for all
 * three systems (zai glm-4.6 via the eval glm-anthropic provider for
 * baselines; the pipeline rides the same zai account through --route zai).
 * Failures are kept verbatim — no rerun-to-success.
 *
 * Usage: node eval/w4-refresh.mjs   (writes progress to stderr, artifacts to
 * eval/results/w4-refresh-*.json + baseline jsonl)
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const problems = JSON.parse(readFileSync(resolve(root, 'eval/problems.json'), 'utf8')).problems;
const out = [];
const log = (s) => process.stderr.write(`[w4r ${new Date().toISOString().slice(11, 19)}] ${s}\n`);

for (const p of problems) {
  log(`P ${p.id} start (${p.type})`);
  let record = { problem: p.id, type: p.type, question: p.text };
  try {
    const stdout = execFileSync(
      process.execPath,
      ['dist/cli/main.js', 'research', 'start', p.text, '--domain', p.domain, '--goal', p.goalType, '--route', 'zai', '--json'],
      { cwd: root, encoding: 'utf8', timeout: 45 * 60_000, maxBuffer: 64 * 1024 * 1024 },
    );
    // The CLI prints the {runId} JSON early, then executes the whole pipeline and
    // prints a final human-readable status — pick the JSON line, not the last line.
    const jsonLine = stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).pop();
    const created = JSON.parse(jsonLine);
    record.runId = created.runId;
    // poll to terminal state
    for (;;) {
      await new Promise((r) => setTimeout(r, 20_000));
      const status = JSON.parse(execFileSync(
        process.execPath,
        ['dist/cli/main.js', 'research', 'status', record.runId, '--json'],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      ));
      const s = status.status;
      if (s === 'completed' || s === 'partial' || s === 'failed' || s === 'cancelled') {
        record.status = s;
        record.lastError = status.lastError ?? null;
        record.progress = status.progress;
        break;
      }
    }
  } catch (e) {
    record.launchError = String(e.message).slice(0, 300);
    record.status = 'launch_failed';
  }
  log(`P ${p.id} -> ${record.status}`);
  out.push(record);
  writeFileSync(resolve(root, 'eval/results/w4-refresh-runs.json'), JSON.stringify(out, null, 2) + '\n');
}

// Baselines: same provider route for all systems (fairness rule from PROTOCOL.md).
log('baseline-direct start');
execFileSync(process.execPath, ['eval/baseline-direct.mjs'], { cwd: root, stdio: 'inherit' });
log('baseline-rag start');
execFileSync(process.execPath, ['eval/baseline-rag.mjs'], { cwd: root, stdio: 'inherit' });

// Metrics recompute (reads .far-run/far.db read-only; question-text match binds
// the fresh runs; baselines read from the jsonl just written).
log('metrics start');
const metricsPath = resolve(root, 'eval/results/metrics-w4-refresh.json');
const metricsOut = execFileSync(process.execPath, ['eval/metrics.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(metricsPath, metricsOut.startsWith('{') ? metricsOut : JSON.stringify({ raw: metricsOut }) + '\n');
log('DONE');
