/**
 * R2-14 scorecard aggregator — the lane's independent verdict surface.
 *
 * Runs the full probe battery (P1-P8, each an isolated process), then the
 * offline replay benchmarks (deterministic metrics + retrieval baseline over the
 * read-only runtime-DB copy), merges everything with the north-star ledger, and
 * emits:
 *   eval/results/r2-14/scorecard.json          machine-readable full result
 *   eval/results/r2-14/scorecard.md            human table
 *   evidence/r2-14/scorecard.{json,md}         committed snapshot for lane 15
 *
 * Verdict semantics: FAIL findings map to INVALID-CLAIMS entries (each names the
 * capability claim it undermines); ADVISORY findings go to the divergence report
 * for the owning lane's handoff; PASS needs no entry. The scorecard never edits
 * production code and never re-runs a probe to convert a FAIL.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, RESULTS_DIR, INPUT_DB } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(ROOT, 'evidence', 'r2-14');

const PROBES = [
  { id: 'p1-wiring', script: 'p1-wiring.mjs', claim: 'every advertised production module is actually wired to a real entrypoint' },
  { id: 'p2-route-contract', script: 'p2-route-contract.mjs', claim: 'every control in the web workbench reaches a real server route' },
  { id: 'p3-live-masquerade', script: 'p3-live-masquerade.mjs', claim: 'no mock/synthetic result is ever presented with live provenance' },
  { id: 'p4-stale-web', script: 'p4-stale-web.mjs', claim: 'the served web/dist can never be stale relative to src (D-031)' },
  { id: 'p5-citation-grounding', script: 'p5-citation-grounding.mjs', claim: 'verified claims are grounded in verbatim quotes from real cited sources' },
  { id: 'p6-sandbox-escape', script: 'p6-sandbox-escape.mjs', claim: 'the exploration sandbox blocks escape beyond its scope (not just cwd)' },
  { id: 'p7-memory-benefit', script: 'p7-memory-benefit.mjs', claim: 'stored memory changes later research behavior (write→compile→consume)' },
  { id: 'p8-agent-isolation', script: 'p8-agent-isolation.mjs', claim: 'agent/subagent tool use is permission-gated on the real execution path' },
];

const runNode = (args, timeoutMs = 120_000) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: timeoutMs });
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') };
};

const readProbeJson = (id) => {
  const f = path.join(RESULTS_DIR, `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

const main = () => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const probeRuns = [];

  for (const p of PROBES) {
    const r = runNode([path.join(HERE, p.script)], 180_000);
    const json = readProbeJson(p.id);
    probeRuns.push({ ...p, exit: r.status, stdout: r.stdout, stderr: r.stderr, result: json });
    console.log(`[scorecard] ${p.id}: exit=${r.status} verdict=${json?.verdict ?? 'NO-RESULT'}`);
  }

  // Replay benchmarks (offline, deterministic; DB-only paths).
  const bench = {};
  if (fs.existsSync(INPUT_DB)) {
    const m = runNode([path.join(ROOT, 'eval', 'metrics.mjs'), '--db', INPUT_DB], 300_000);
    bench.metrics = { exit: m.status, stdoutTail: m.stdout.slice(-3000), stderrTail: m.stderr.slice(-500) };
    console.log(`[scorecard] metrics replay: exit=${m.status}`);
    const rb = runNode([path.join(ROOT, 'eval', 'retrieval-baseline.mjs'), '--db', INPUT_DB], 300_000);
    bench.retrieval = { exit: rb.status, stdoutTail: rb.stdout.slice(-3000), stderrTail: rb.stderr.slice(-500) };
    console.log(`[scorecard] retrieval replay: exit=${rb.status}`);
  } else {
    bench.skipped = 'INPUT_DB absent';
  }

  // North-star ledger for cross-reference.
  const northStar = fs.existsSync(path.join(ROOT, 'eval', 'north-star.json'))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'north-star.json'), 'utf8'))
    : null;

  // Invalid-claims list: every FAIL finding names the claim it invalidates.
  const invalidClaims = [];
  const divergences = [];
  for (const p of probeRuns) {
    if (!p.result) {
      invalidClaims.push({ probe: p.id, claim: p.claim, finding: { id: 'NO-RESULT', detail: `probe produced no result (exit=${p.exit}): ${p.stderr.slice(0, 300)}` } });
      continue;
    }
    for (const f of p.result.findings ?? []) {
      if (f.severity === 'FAIL') invalidClaims.push({ probe: p.id, claim: p.claim, finding: f });
      else divergences.push({ probe: p.id, finding: f });
    }
  }

  const overall = invalidClaims.length === 0
    ? (divergences.length === 0 ? 'PASS' : 'PASS_WITH_DIVERGENCES')
    : 'INVALID_CLAIMS_FOUND';

  const scorecard = {
    schema: 'r2-14-scorecard/1',
    generatedAt: new Date().toISOString(),
    evaluatedTree: { baseline: 'baseline/parallel-r2', commit: '47cc373', note: 'unfused sibling lane branches are NOT in this tree; integration (lane 99) must re-run this battery on the fused tree' },
    overall,
    probes: probeRuns.map((p) => ({ id: p.id, verdict: p.result?.verdict ?? 'NO-RESULT', summary: p.result?.summary ?? null, exit: p.exit })),
    invalidClaims,
    divergences,
    benchmarks: bench,
    northStarMetrics: northStar ? northStar.metrics.map((m) => ({ id: m.id, current: m.current })) : null,
  };

  const jsonPath = path.join(RESULTS_DIR, 'scorecard.json');
  fs.writeFileSync(jsonPath, JSON.stringify(scorecard, null, 2));

  const lines = [];
  lines.push('# R2-14 Independent Scorecard — evaluation/red-team lane');
  lines.push('');
  lines.push(`Generated ${scorecard.generatedAt} against \`${scorecard.evaluatedTree.commit}\` (baseline/parallel-r2).`);
  lines.push('');
  lines.push(`**Overall: ${overall}** — ${invalidClaims.length} invalid-claim entries, ${divergences.length} divergences.`);
  lines.push('');
  lines.push('| Probe | Verdict | Summary |');
  lines.push('|---|---|---|');
  for (const p of scorecard.probes) lines.push(`| ${p.id} | ${p.verdict} | ${String(p.summary).replaceAll('|', '\\|')} |`);
  lines.push('');
  if (invalidClaims.length > 0) {
    lines.push('## Invalid completion claims');
    lines.push('');
    for (const c of invalidClaims) lines.push(`- **${c.probe}/${c.finding.id}** undermines: "${c.claim}" — ${c.finding.detail}`);
    lines.push('');
  }
  if (divergences.length > 0) {
    lines.push('## Divergences (advisory, for owning-lane handoffs)');
    lines.push('');
    for (const d of divergences) lines.push(`- ${d.probe}/${d.finding.id}: ${d.finding.detail}`);
    lines.push('');
  }
  lines.push('## Replay benchmarks');
  lines.push('');
  lines.push('```');
  lines.push(bench.metrics ? `metrics.mjs exit=${bench.metrics.exit}\n${bench.metrics.stdoutTail}` : 'skipped');
  lines.push(bench.retrieval ? `\nretrieval-baseline.mjs exit=${bench.retrieval.exit}\n${bench.retrieval.stdoutTail}` : '');
  lines.push('```');
  const mdPath = path.join(RESULTS_DIR, 'scorecard.md');
  fs.writeFileSync(mdPath, lines.join('\n'));

  // Committed evidence snapshot for lane 15 + the integrator.
  fs.copyFileSync(jsonPath, path.join(EVIDENCE_DIR, 'scorecard.json'));
  fs.copyFileSync(mdPath, path.join(EVIDENCE_DIR, 'scorecard.md'));
  for (const p of PROBES) {
    const f = path.join(RESULTS_DIR, `${p.id}.json`);
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(EVIDENCE_DIR, `${p.id}.json`));
  }

  console.log(`[scorecard] overall=${overall} invalidClaims=${invalidClaims.length} divergences=${divergences.length}`);
  console.log(`[scorecard] results: ${RESULTS_DIR}`);
  console.log(`[scorecard] evidence snapshot: ${EVIDENCE_DIR}`);
  process.exitCode = overall === 'INVALID_CLAIMS_FOUND' ? 1 : 0;
};

main();
