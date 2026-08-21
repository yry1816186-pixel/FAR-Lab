/**
 * EV1 after-fusion evaluation batch driver (2026-08-22).
 * Runs the FUSED pipeline on all 6 pre-declared eval problems sequentially via the
 * real CLI (DeepSeek live route), recording run ids for the before/after comparison.
 * Baselines (baseline-direct / baseline-rag) are UNCHANGED systems — their archived
 * outputs remain the external anchors; they are not re-run here.
 *
 * Usage: node eval/run-ev1-batch.mjs   (writes eval/results/ev1-runs.jsonl incrementally)
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const problems = JSON.parse(readFileSync(new URL('./problems.json', import.meta.url), 'utf8')).problems;
const outPath = new URL('./results/ev1-runs.jsonl', import.meta.url);
if (!existsSync(outPath)) writeFileSync(outPath, '');

for (const p of problems) {
  const args = [
    'dist/cli/main.js', 'research', 'start', p.text,
    '--domain', p.domain ?? 'general science',
    '--goal', p.goalType ?? 'explanatory',
    '--json',
  ];
  console.log(`[ev1-batch] starting ${p.id}: ${p.text.slice(0, 70)}...`);
  try {
    const stdout = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
    const parsed = JSON.parse(line ?? '{}');
    appendFileSync(outPath, JSON.stringify({ problem: p.id, runId: parsed.runId, status: parsed.status }) + '\n');
    console.log(`[ev1-batch] ${p.id} -> ${parsed.runId} (${parsed.status})`);
  } catch (e) {
    appendFileSync(outPath, JSON.stringify({ problem: p.id, error: String(e.message).slice(0, 300) }) + '\n');
    console.error(`[ev1-batch] ${p.id} FAILED: ${e.message}`);
  }
}
console.log('[ev1-batch] all problems attempted; run ids in eval/results/ev1-runs.jsonl');
