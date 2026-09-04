/**
 * Ω A6: independent judge for counter-evidence-debate verdicts (ADR Wave A exit item).
 *
 * Reads a pinned run's workspace db, presents each debate verdict (hypothesis +
 * falsification + the verdict + its counter-findings) to an INDEPENDENT model call via
 * the project's own provider plane (same dist/ modules — fairness by construction), and
 * asks whether the verdict is defensible against the run's evidence layer.
 *
 * Same-model judging is a DISCLOSED limitation (same-family ceiling, the known W4 judge
 * caveat) — the judge measures verdict defensibility, not ground truth.
 *
 * Usage:
 *   node eval/omega/judge.mjs --db <workspace>/far.db [--run <id|auto>] [--out <dir>]
 * Env: route via FARLAB_BASELINE_PROVIDER (dashscope recommended); judge model via the
 *      route's own model env (FARLAB_DASHSCOPE_MODEL); key from process env, never files.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeProvider } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const die = (code, msg) => { console.error(`FATAL: ${msg}`); process.exit(code); };

const dbPath = flag('--db', null);
if (!dbPath) die(2, 'judge --db <workspace>/far.db [--run <id|auto>] [--out <dir>]');

const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
const rows = db.prepare('SELECT id, doc FROM runs').all();
const runId = flag('--run', 'auto');
const pick = runId === 'auto' ? rows.at(-1) : rows.find((r) => r.id === runId);
if (!pick) die(3, `run not found (${runId}) in ${dbPath}`);
const runDoc = JSON.parse(pick.doc);
const objects = (kind) =>
  db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, pick.id).map((r) => JSON.parse(r.json));

const hypotheses = new Map(objects('hypothesis').map((h) => [h.id, h]));
const claims = objects('claim');
const reports = objects('agent_report').filter((r) => r.capability === 'counter-evidence-debate');
const verdicts = reports.flatMap((r) => (Array.isArray(r.result?.verdicts) ? r.result.verdicts : []));
const questionText = objects('question').at(-1)?.text ?? runDoc.question?.text ?? '(question text unavailable)';
const debateModel = reports[0]?.model ?? reports[0]?.modelVersion ?? null;
db.close();
if (verdicts.length === 0) die(3, `run ${pick.id} has no counter-evidence-debate verdicts to judge (kernel chain did not trigger or found nothing)`);

const provider = await makeProvider();
console.log(`judge: run=${pick.id} verdicts=${verdicts.length} judge=${provider.modelId} route=${provider.name}`);

// Evidence context, capped for budget: verified claims first, then the rest.
const claimContext = claims
  .slice(0, 40)
  .map((c) => `- ${String(c.text ?? '').slice(0, 200)} [${c.bindingStatus ?? 'unbound'}${c.gradeCertainty ? `/${c.gradeCertainty}` : ''}]`)
  .join('\n');

const judgePrompt = (v, hyp) => `You are an independent senior reviewer auditing an adversarial counter-evidence review that another AI produced. Judge ONLY whether that review's VERDICT is defensible given the hypothesis and the run's evidence layer.

RESEARCH QUESTION: ${questionText.slice(0, 800)}

HYPOTHESIS UNDER REVIEW:
statement: ${String(hyp?.statement ?? '(unknown hypothesis)').slice(0, 600)}
mechanism: ${String(hyp?.mechanism ?? '').slice(0, 400)}

THE DEBATE'S VERDICT: ${v.verdict}
counter-findings cited: ${JSON.stringify(v.counterFindings ?? []).slice(0, 900)}
uncertainties cited: ${JSON.stringify(v.uncertainties ?? []).slice(0, 300)}

EVIDENCE LAYER (verified claims of this run, truncated):
${claimContext || '(no claims)'}

Judge the verdict's defensibility:
- "sound": the verdict category is a defensible reading, and every counter-finding genuinely bears on THIS hypothesis (on-mechanism, evidence-anchored, no overclaim).
- "partial": directionally defensible but some counter-findings are off-target, weakly anchored, or the category overclaims.
- "unsound": the verdict category is not defensible from the material shown (e.g. counter-findings fabricated-sounding, irrelevant to the mechanism, or contradicting the cited evidence).
Reply as exactly: {"judgment":"sound"|"partial"|"unsound","rationale":"one short paragraph","worstFinding":"the single weakest counter-finding and why, or null"}`;

const results = [];
for (const v of verdicts) {
  const hyp = hypotheses.get(v.hypothesisId);
  const t0 = Date.now();
  const res = await provider.structuredCall(
    {
      task: judgePrompt(v, hyp),
      systemPrompt: 'You are a rigorous, skeptical scientific reviewer. You audit AI-generated adversarial reviews for defensibility. Never rubber-stamp; never punish honesty. Judge only what the material supports.',
      userPayload: { runId: pick.id, hypothesisId: v.hypothesisId, verdict: v.verdict },
      outputKind: 'json',
      temperature: 0.2,
      maxTokens: 2000,
      purpose: 'omega-judge-debate-verdict',
    },
    (raw) => {
      const o = raw && typeof raw === 'object' ? raw : null;
      const j = o?.judgment;
      return o !== null && ['sound', 'partial', 'unsound'].includes(j) && typeof o.rationale === 'string'
        ? raw
        : new Error(`judge output failed contract: ${JSON.stringify(raw).slice(0, 200)}`);
    },
  );
  results.push({
    hypothesisId: v.hypothesisId,
    verdict: v.verdict,
    counterFindings: (v.counterFindings ?? []).length,
    ok: res.ok,
    judgment: res.ok ? res.data.judgment : null,
    rationale: res.ok ? String(res.data.rationale).slice(0, 800) : `judge call failed: ${res.error?.kind}`,
    wallMs: Date.now() - t0,
  });
  console.log(`  ${v.hypothesisId} verdict=${v.verdict} judgment=${results.at(-1).judgment} (${Math.round((Date.now() - t0) / 1000)}s)`);
}

const counts = results.reduce((acc, r) => { const k = r.judgment ?? 'judge_failed'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
const judged = results.filter((r) => r.judgment !== null);
const soundRate = judged.length ? (counts.sound ?? 0) / judged.length : null;
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const out = {
  schemaVersion: 1,
  kind: 'debate-verdict-judge',
  judgedAt: new Date().toISOString(),
  runId: pick.id,
  runStatus: runDoc.status,
  judge: { route: provider.name, model: provider.modelId, sameModelAsDebate: debateModel === null ? null : debateModel === provider.modelId },
  disclosedLimitation: 'same-family judge ceiling — defensibility audit, not ground truth',
  counts,
  soundRate,
  verdicts: results,
};
const outDir = resolve(flag('--out', resolve(HERE, 'anchors')));
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `judge-${stamp}-${pick.id.slice(0, 18)}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`judge: ${counts.sound ?? 0} sound / ${counts.partial ?? 0} partial / ${counts.unsound ?? 0} unsound / ${counts.judge_failed ?? 0} failed — soundRate=${soundRate}`);
console.log(`judge: -> ${outPath}`);
process.exit(0);
