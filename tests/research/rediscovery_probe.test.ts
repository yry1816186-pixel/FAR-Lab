/**
 * tests/research/rediscovery_probe.test.ts — the §4.1 direct-recall contrast
 * probe (b7-T2): zod SSOT tri-state schema, deterministic question builder,
 * offline-fixture-driven probe runs (known/unsure/not_seen + fail-closed
 * schema-invalid path), the pure backfill (interpretation-only: checksum and
 * match facts untouched), and the renderer's leakage-annotation upgrade
 * (a 'known' answer NEVER clears a hit — it only re-labels its risk).
 *
 * All probe runs here are driven by offline_replay fixtures keyed
 * `${DIRECT_RECALL_STAGE_PREFIX}:${targetId}` — NO live calls, by design.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import {
  renderRediscoveryReport,
  replayRediscoverySpec,
} from '../../src/research/evaluation/rediscovery/engine.ts';
import {
  applyDirectRecallProbe,
  buildDirectRecallQuestion,
  DIRECT_RECALL_STAGE_PREFIX,
  DirectRecallAnswerSchema,
  runDirectRecallProbe,
  type DirectRecallProbeRun,
} from '../../src/research/evaluation/rediscovery/probe.ts';
import { REDISCOVERY_SPECS } from '../../src/research/evaluation/rediscovery/targets.ts';
import { LEAKAGE_DISCLAIMER } from '../../src/research/evaluation/rediscovery/types.ts';
import type {
  DirectRecallProbeResult,
  RediscoveryReport,
} from '../../src/research/evaluation/rediscovery/types.ts';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function specById(specId: string) {
  const spec = REDISCOVERY_SPECS.find((s) => s.specId === specId);
  assert.ok(spec, `spec ${specId} must exist`);
  return spec;
}

/**
 * Replays are byte-stable by design (fixed runId + fixed clock), so each spec
 * is replayed ONCE and shared across tests — no cross-test nondeterminism.
 */
const replayCache = new Map<string, Promise<RediscoveryReport>>();
function replayOnce(specId: string): Promise<RediscoveryReport> {
  let p = replayCache.get(specId);
  if (p === undefined) {
    p = replayRediscoverySpec(specById(specId));
    replayCache.set(specId, p);
  }
  return p;
}

/** Build offline_replay fixtures: targetId -> probe answer (JSON-encoded). */
function probeFixtures(answers: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [targetId, answer] of Object.entries(answers)) {
    out[`${DIRECT_RECALL_STAGE_PREFIX}:${targetId}`] = JSON.stringify(answer);
  }
  return out;
}

/** A gateway wrapper that counts every callLlm (attempt-level accounting). */
function countingGateway(fixtures: Readonly<Record<string, string>>): {
  readonly gateway: LlmGateway;
  readonly calls: () => number;
} {
  const inner = createLlmGateway([
    createOfflineReplayAdapter({ fixtures, disableDefaultDemo: true }),
  ]);
  let n = 0;
  const gateway: LlmGateway = {
    register: (adapter) => inner.register(adapter),
    registeredProfiles: () => inner.registeredProfiles(),
    callLlm: (profile, request) => {
      n += 1;
      return inner.callLlm(profile, request);
    },
  };
  return { gateway, calls: () => n };
}

/** Extract the rendered report line for one target id. */
function targetLine(text: string, targetId: string): string {
  const line = text.split('\n').find((l) => l.startsWith(`- ${targetId}:`));
  assert.ok(line, `rendered report must contain a line for ${targetId}`);
  return line;
}

/** The exact annotation strings the renderer MUST emit (honesty red line). */
const HIGH_RISK = '泄漏风险：高（模型自述见过）';
const UNDECIDED = '泄漏风险：未定（模型自述不确定）';
const LOW_UNCLEARED = '泄漏风险：低-未清除（模型自述未见过；自述非证明）';
const UNEVALUATED = '泄漏风险：未评估（探针调用失败）';
const CONTRAST_MISS_KNOWN = '对照：模型自述见过但本回放未命中（支持推导而非记忆）';

// ─── zod SSOT schema ─────────────────────────────────────────────────────────

describe('direct-recall probe schema (zod SSOT)', () => {
  it('accepts exactly the three tri-state verdicts with bounded confidence and nullable pointer', () => {
    for (const recall of ['known', 'unsure', 'not_seen'] as const) {
      const parsed = DirectRecallAnswerSchema.safeParse({
        recall,
        confidence: 0.75,
        sourcePointer: 'Jinek et al. 2012, Science',
      });
      assert.equal(parsed.success, true, recall);
    }
  });

  it('rejects free-text verdicts, out-of-range confidence, and a missing pointer key', () => {
    // Free-text adjudication is structurally impossible (brief: 禁自由文本裁决).
    assert.equal(
      DirectRecallAnswerSchema.safeParse({ recall: 'definitely', confidence: 0.5, sourcePointer: null }).success,
      false,
    );
    // Confidence is bounded to [0,1] — a 1.5 must fail, not clamp.
    assert.equal(
      DirectRecallAnswerSchema.safeParse({ recall: 'known', confidence: 1.5, sourcePointer: null }).success,
      false,
    );
    assert.equal(
      DirectRecallAnswerSchema.safeParse({ recall: 'known', confidence: 0.5, sourcePointer: -0.1 }).success,
      false,
    );
    // sourcePointer must be present and explicit (string or null) — no ambiguity.
    assert.equal(
      DirectRecallAnswerSchema.safeParse({ recall: 'known', confidence: 0.5 }).success,
      false,
    );
  });
});

// ─── Question builder (determinism + no-free-text contract) ─────────────────

describe('buildDirectRecallQuestion', () => {
  it('pins: memory-only demand, statement verbatim, cutoff date, the three allowed values, no-invention rule', () => {
    const spec = specById('rediscovery-molecular-biology-1997');
    const target = spec.targetDiscoveries.find((t) => t.id === 'crispr-cas9-programmable-cleavage');
    assert.ok(target);
    const q = buildDirectRecallQuestion(target, spec.cutoffDate);
    assert.ok(q.includes('memory only'), 'must demand a memory-only answer');
    assert.ok(q.includes('do NOT use any tool, search, or retrieval'));
    assert.ok(q.includes(target.statement), 'statement must appear verbatim');
    assert.ok(q.includes(spec.cutoffDate), 'cutoff date must appear');
    for (const v of ['known', 'unsure', 'not_seen']) {
      assert.ok(q.includes(v), `allowed value ${v} must be named`);
    }
    assert.ok(q.includes('NEVER invent'), 'no-invention rule for pointers');
    // Deterministic: same inputs, byte-identical question.
    assert.equal(q, buildDirectRecallQuestion(target, spec.cutoffDate));
  });
});

// ─── Offline-fixture probe runs ──────────────────────────────────────────────

describe('runDirectRecallProbe (offline fixtures)', () => {
  it('covers known and not_seen tri-states with confidence + pointer carried; empty pointer normalized to null', async () => {
    const spec = specById('rediscovery-gravitational-wave-2015');
    const { gateway } = countingGateway(
      probeFixtures({
        'gw150914-bbh-direct-detection': { recall: 'known', confidence: 0.9, sourcePointer: 'Phys. Rev. Lett. 116, 061102 (2016)' },
        'gw170817-multimessenger-kilonova': { recall: 'not_seen', confidence: 0.85, sourcePointer: '' },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    assert.equal(run.answeredCount, 2);
    assert.equal(run.failedCount, 0);

    const known = run.results.find((r) => r.targetId === 'gw150914-bbh-direct-detection');
    assert.ok(known);
    assert.equal(known.outcome, 'answered');
    assert.equal(known.recall, 'known');
    assert.equal(known.recalled, true);
    assert.equal(known.confidence, 0.9);
    assert.equal(known.sourcePointer, 'Phys. Rev. Lett. 116, 061102 (2016)');
    assert.equal(known.error, null);
    assert.equal(known.modelId, 'offline-replay-fixture');

    const notSeen = run.results.find((r) => r.targetId === 'gw170817-multimessenger-kilonova');
    assert.ok(notSeen);
    assert.equal(notSeen.recall, 'not_seen');
    assert.equal(notSeen.recalled, false);
    // Empty string is "none given" — normalized to null, never rendered as a fake pointer.
    assert.equal(notSeen.sourcePointer, null);
  });

  it('unsure verdict maps to recalled=false (only known counts as recalled)', async () => {
    const spec = specById('rediscovery-gravitational-wave-2015');
    const { gateway } = countingGateway(
      probeFixtures({
        'gw150914-bbh-direct-detection': { recall: 'unsure', confidence: 0.4, sourcePointer: null },
        'gw170817-multimessenger-kilonova': { recall: 'unsure', confidence: 0.6, sourcePointer: null },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    assert.ok(run.results.every((r) => r.recall === 'unsure' && r.recalled === false));
  });

  it('schema-invalid fixture fails CLOSED per target (verbatim error) and the other target still answers', async () => {
    const spec = specById('rediscovery-gravitational-wave-2015');
    const { gateway, calls } = countingGateway(
      probeFixtures({
        'gw150914-bbh-direct-detection': { recall: 'known', confidence: 0.9, sourcePointer: null },
        'gw170817-multimessenger-kilonova': { recall: 'definitely-not-in-enum', confidence: 0.5, sourcePointer: null },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    assert.equal(run.answeredCount, 1);
    assert.equal(run.failedCount, 1);

    const failed = run.results.find((r) => r.targetId === 'gw170817-multimessenger-kilonova');
    assert.ok(failed);
    assert.equal(failed.outcome, 'call_failed');
    assert.equal(failed.recall, null, 'failed rows never carry a guessed verdict');
    assert.equal(failed.recalled, false);
    assert.ok(
      failed.error !== null && failed.error.includes('failed local schema validation'),
      `error must be verbatim, got: ${failed.error}`,
    );
    assert.ok(failed.error !== null && failed.error.includes(`${DIRECT_RECALL_STAGE_PREFIX}:gw170817-multimessenger-kilonova`));
    // One call per answered target; the failing target consumed exactly 2 attempts (initial + repair).
    assert.equal(calls(), 3);
  });

  it('issues exactly ONE gateway call per answered target (2 targets -> 2 calls)', async () => {
    const spec = specById('rediscovery-molecular-biology-1997');
    const { gateway, calls } = countingGateway(
      probeFixtures({
        'rna-interference': { recall: 'not_seen', confidence: 0.8, sourcePointer: null },
        'crispr-cas9-programmable-cleavage': { recall: 'known', confidence: 0.9, sourcePointer: 'Jinek et al. 2012, Science' },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    assert.equal(run.answeredCount, 2);
    assert.equal(calls(), 2, 'cost budget: one probe call per target');
  });
});

// ─── Backfill: interpretation-only, never match-fact surgery ─────────────────

describe('applyDirectRecallProbe (pure backfill)', () => {
  async function probedRun(): Promise<{ before: RediscoveryReport; after: RediscoveryReport; run: DirectRecallProbeRun }> {
    const before = await replayOnce('rediscovery-molecular-biology-1997');
    const spec = specById('rediscovery-molecular-biology-1997');
    const { gateway } = countingGateway(
      probeFixtures({
        'rna-interference': { recall: 'unsure', confidence: 0.5, sourcePointer: null },
        'crispr-cas9-programmable-cleavage': { recall: 'known', confidence: 0.9, sourcePointer: 'Jinek et al. 2012, Science' },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    return { before, after: applyDirectRecallProbe(before, run), run };
  }

  it('flips status to LIVE_COMPLETED, risk to PROBED_LIVE, backfills results; disclaimer + questions preserved', async () => {
    const { before, after, run } = await probedRun();
    const probe = after.leakageAssessment.directRecallProbe;
    assert.equal(probe.status, 'LIVE_COMPLETED');
    assert.equal(after.leakageAssessment.pretrainingLeakageRisk, 'PROBED_LIVE');
    assert.equal(probe.results, run.results);
    assert.equal(after.leakageAssessment.disclaimer, LEAKAGE_DISCLAIMER);
    assert.deepEqual(probe.probeQuestions, before.leakageAssessment.directRecallProbe.probeQuestions);
  });

  it('is interpretation-ONLY: checksum, hitRate, targetResults, matchLevelCounts are untouched', async () => {
    const { before, after } = await probedRun();
    assert.equal(after.replayChecksum, before.replayChecksum, 'checksum excludes leakage by design — probe must not fake a new replay');
    assert.equal(after.hitRate, before.hitRate);
    assert.deepEqual(after.targetResults, before.targetResults);
    assert.deepEqual(after.matchLevelCounts, before.matchLevelCounts);
  });

  it('a known answer does NOT clear the hit: match verdicts stay identical field-by-field', async () => {
    const { before, after } = await probedRun();
    const hitBefore = before.targetResults.find((t) => t.targetId === 'crispr-cas9-programmable-cleavage');
    const hitAfter = after.targetResults.find((t) => t.targetId === 'crispr-cas9-programmable-cleavage');
    assert.ok(hitBefore?.matched, 'precondition: crispr is a hit in this spec');
    assert.equal(hitAfter?.matched, true, 'known NEVER clears a hit (诚实红线)');
    assert.equal(hitAfter?.matchLevel, hitBefore?.matchLevel);
    assert.equal(hitAfter?.matchedHypothesisId, hitBefore?.matchedHypothesisId);
  });

  it('is idempotent: applying the same run twice yields an identical report', async () => {
    const { after, run } = await probedRun();
    const twice = applyDirectRecallProbe(after, run);
    assert.equal(JSON.stringify(twice), JSON.stringify(after));
  });

  it('fails loud on an empty run and on a foreign targetId (probe of a different spec)', async () => {
    const before = await replayOnce('rediscovery-molecular-biology-1997');
    assert.throws(
      () => applyDirectRecallProbe(before, { results: [], answeredCount: 0, failedCount: 0 }),
      /empty probe run/,
    );
    const foreign: DirectRecallProbeResult = {
      targetId: 'not-a-target-of-this-spec',
      recalled: false,
      outcome: 'answered',
      recall: 'not_seen',
      confidence: 0.5,
      sourcePointer: null,
      error: null,
      modelId: null,
    };
    assert.throws(
      () => applyDirectRecallProbe(before, { results: [foreign], answeredCount: 1, failedCount: 0 }),
      /not a target of report/,
    );
  });
});

// ─── Renderer: leakage annotations on hit/miss rows ──────────────────────────

describe('renderRediscoveryReport leakage annotations', () => {
  it('e2e: replay -> probe -> apply -> render; hit rows carry tri-state risk labels + per-target probe evidence', async () => {
    const report = await replayOnce('rediscovery-molecular-biology-1997');
    const spec = specById('rediscovery-molecular-biology-1997');
    const { gateway } = countingGateway(
      probeFixtures({
        'rna-interference': { recall: 'unsure', confidence: 0.55, sourcePointer: null },
        'crispr-cas9-programmable-cleavage': { recall: 'known', confidence: 0.9, sourcePointer: 'Jinek et al. 2012, Science' },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    const text = renderRediscoveryReport(applyDirectRecallProbe(report, run));

    assert.ok(text.includes('LIVE_COMPLETED'));
    assert.ok(text.includes('PROBED_LIVE'));
    assert.ok(text.includes(LEAKAGE_DISCLAIMER), 'disclaimer stays mandatory even post-probe');
    // HIT + known -> the exact high-risk annotation, on the SAME line as the HIT.
    const crisprLine = targetLine(text, 'crispr-cas9-programmable-cleavage');
    assert.ok(crisprLine.includes('HIT'), 'known does not clear the hit');
    assert.ok(crisprLine.includes('L3_SEMANTIC'));
    assert.ok(crisprLine.includes(HIGH_RISK));
    // HIT + unsure -> undecided label.
    assert.ok(targetLine(text, 'rna-interference').includes(UNDECIDED));
    // Per-target probe evidence lines: verdict + confidence + model-claimed source.
    const probeLine = text
      .split('\n')
      .find((l) => l.startsWith('- crispr-cas9-programmable-cleavage: known'));
    assert.ok(probeLine, 'probe section must show the per-target verdict');
    assert.ok(probeLine?.includes('confidence 0.90'));
    assert.ok(probeLine?.includes('source (model-claimed, unverified): Jinek et al. 2012, Science'));
  });

  it('HIT + not_seen -> low-but-uncleared label (self-report is NOT proof of cleanliness)', async () => {
    const report = await replayOnce('rediscovery-gravitational-wave-2015');
    const spec = specById('rediscovery-gravitational-wave-2015');
    const { gateway } = countingGateway(
      probeFixtures({
        'gw150914-bbh-direct-detection': { recall: 'not_seen', confidence: 0.7, sourcePointer: null },
        'gw170817-multimessenger-kilonova': { recall: 'not_seen', confidence: 0.8, sourcePointer: null },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    const text = renderRediscoveryReport(applyDirectRecallProbe(report, run));
    const hitLine = targetLine(text, 'gw150914-bbh-direct-detection');
    assert.ok(hitLine.includes('HIT'));
    assert.ok(hitLine.includes(LOW_UNCLEARED));
    assert.ok(!hitLine.includes(HIGH_RISK), 'not_seen must never earn the high-risk label');
    // MISS + not_seen renders with NO leakage annotation (nothing to interpret).
    const missLine = targetLine(text, 'gw170817-multimessenger-kilonova');
    assert.ok(missLine.includes('MISS'));
    assert.ok(!missLine.includes('泄漏风险'));
  });

  it('MISS + known -> contrast note (model has the memory yet the replay missed: evidence FOR derivation)', async () => {
    const report = await replayOnce('rediscovery-gravitational-wave-2015');
    const spec = specById('rediscovery-gravitational-wave-2015');
    const { gateway } = countingGateway(
      probeFixtures({
        'gw150914-bbh-direct-detection': { recall: 'known', confidence: 0.9, sourcePointer: null },
        'gw170817-multimessenger-kilonova': { recall: 'known', confidence: 0.9, sourcePointer: 'ApJL 848 (2017)' },
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    const text = renderRediscoveryReport(applyDirectRecallProbe(report, run));
    assert.ok(targetLine(text, 'gw170817-multimessenger-kilonova').includes(CONTRAST_MISS_KNOWN));
    // The HIT + known row still carries the high-risk label (§4.1 contrast arm).
    assert.ok(targetLine(text, 'gw150914-bbh-direct-detection').includes(HIGH_RISK));
  });

  it('all targets fail schema validation -> BLOCKED, risk stays CANNOT_BE_EXCLUDED_OFFLINE, failures rendered verbatim', async () => {
    const report = await replayOnce('rediscovery-gravitational-wave-2015');
    const spec = specById('rediscovery-gravitational-wave-2015');
    const invalid = { recall: 'maybe', confidence: 0.5, sourcePointer: null };
    const { gateway, calls } = countingGateway(
      probeFixtures({
        'gw150914-bbh-direct-detection': invalid,
        'gw170817-multimessenger-kilonova': invalid,
      }),
    );
    const run = await runDirectRecallProbe(spec, { gateway, profile: 'offline_replay' });
    assert.equal(run.answeredCount, 0);
    assert.equal(run.failedCount, 2);
    assert.equal(calls(), 4, '2 attempts x 2 targets, all consumed');
    const applied = applyDirectRecallProbe(report, run);
    assert.equal(applied.leakageAssessment.directRecallProbe.status, 'BLOCKED');
    assert.equal(applied.leakageAssessment.pretrainingLeakageRisk, 'CANNOT_BE_EXCLUDED_OFFLINE');
    const text = renderRediscoveryReport(applied);
    assert.ok(text.includes('BLOCKED'));
    assert.ok(text.includes('CALL_FAILED'));
    // A hit whose probe failed is 未评估 — never silently clean.
    assert.ok(targetLine(text, 'gw150914-bbh-direct-detection').includes(UNEVALUATED));
  });

  it('regression pin: WITHOUT a probe the report renders exactly as before (NOT_RUN_OFFLINE, no annotations)', async () => {
    const report = await replayOnce('rediscovery-molecular-biology-1997');
    assert.equal(report.leakageAssessment.directRecallProbe.status, 'NOT_RUN_OFFLINE');
    assert.equal(report.leakageAssessment.directRecallProbe.results, null);
    const text = renderRediscoveryReport(report);
    assert.ok(text.includes('NOT_RUN_OFFLINE'));
    assert.ok(text.includes('CANNOT_BE_EXCLUDED_OFFLINE'));
    for (const line of text.split('\n')) {
      if (line.startsWith('- ') && line.includes(': HIT')) {
        assert.ok(!line.includes('泄漏风险'), `unprobed hit rows must stay unannotated: ${line}`);
      }
    }
    // The placeholder questions are the REAL probe questions (what would be asked).
    assert.ok(
      report.leakageAssessment.directRecallProbe.probeQuestions.every((q) => q.includes('DIRECT-RECALL PROBE')),
    );
  });
});
