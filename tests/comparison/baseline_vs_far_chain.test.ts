// tests/comparison/baseline_vs_far_chain.test.ts
//
// Phase 3 Task 3.3 — baseline vs FAR-Lab 对比执行。
//
// 对 6 条攻击语料分别跑 baseline（V1 makeVerdict）与 FAR-Lab（V2 decideFiveValueVerdict），
// 捕获 verdict + reasonCodes，验证 FAR-Lab 检测率 >> baseline 检测率。
//
// 真实依赖链：
//   baseline: V1 makeVerdict @ src/falsifiability/verdict.ts:76（真调·非 mock）
//   FAR-Lab: V2 decideFiveValueVerdict @ src/falsifiability/verdict_kernel_v2.ts:253（真调·非 mock）
//              内部调 compileFec (line 288) + R0-R9 规则 cascade + anti-theater/protocol/identifier/form/fingerprint 门
//   生产路径: fecAppendClaim @ src/fec/orchestrator.ts:128（seed-cherry 用例真调·经 DB 事务·compileFec + enforceFecMandatoryGate + decideFiveValueVerdict）
//
// Authority: PROGRESS = 真实依赖端到端接线成功；五值枚举固定。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import { runBaselineVerdict, verifyBaselineOnGoldenVectors } from './baseline_path.ts';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { VerdictKernelInput } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { toKernelFindings } from '../../src/anti_theater/index.ts';
import type { AntiTheaterReport } from '../../src/anti_theater/types.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import type { EvidenceRecord, FalsificationSpec, SourceAnchor, ThresholdSpec } from '../../src/falsifiability/types.ts';
import type { Verdict } from '../../src/schema/enums.ts';

const ATTACK_DIR = fileURLToPath(new URL('./attack_corpus/', import.meta.url));
const GV_DIR = fileURLToPath(new URL('../../golden_vectors/cases/', import.meta.url));

interface AttackFile {
  readonly attackId: string;
  readonly attackClass: string;
  readonly description: string;
  readonly baseCaseId: string;
  readonly claim: string;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
  readonly baselineEvidences: readonly EvidenceRecord[];
  readonly kernelOverride: Record<string, unknown>;
  readonly expected: {
    readonly baselineVerdict: Verdict;
    readonly farVerdict: Verdict;
    readonly farDecisiveRuleId: string;
    readonly farReasonCodes: readonly string[];
  };
}

interface ComparisonRow {
  readonly attackId: string;
  readonly baselineVerdict: Verdict;
  readonly farVerdict: Verdict;
  readonly farDecisiveRuleId: string;
  readonly farReasonCodes: readonly string[];
  readonly baselineCaught: boolean;
  readonly farCaught: boolean;
}

function loadAttackFiles(): readonly AttackFile[] {
  const files = readdirSync(ATTACK_DIR)
    .filter((f) => /^attack_.*\.json$/.test(f))
    .sort();
  return files.map((file) => JSON.parse(readFileSync(join(ATTACK_DIR, file), 'utf8')) as AttackFile);
}

function loadBaseKernelInput(caseId: string): VerdictKernelInput {
  const path = join(GV_DIR, `${caseId}.json`);
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.input.kernel as VerdictKernelInput;
}

// 深合并：对象递归合并，数组/原始值替换。用于 GV-01 base + kernelOverride → 攻击 kernel input。
function deepMergeOverride<T>(base: T, override: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    if (
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue) &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = deepMergeOverride(
        baseValue as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function buildAttackKernelInput(attack: AttackFile): VerdictKernelInput {
  const base = loadBaseKernelInput(attack.baseCaseId);
  return deepMergeOverride(base, attack.kernelOverride);
}

const BASELINE_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-11T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

// ========== GV-01..14 baseline 能跑通验证 ==========

test('baseline path runs on all GV-01..14 (V1 makeVerdict processes every case without error)', () => {
  const results = verifyBaselineOnGoldenVectors();
  assert.equal(results.length, 14, 'must process all 14 golden vectors');
  for (const r of results) {
    assert.ok(r.baselineVerdict.length > 0, `${r.caseId} must produce a verdict`);
  }
  const divergences = results.filter((r) => r.diverges);
  // baseline V1 降维必然与 V2 expected 有分歧（V1 无 R0-R9/FEC/anti-theater）——这是对比试验的前提。
  assert.ok(divergences.length > 0, 'baseline must diverge from V2 on at least some GVs (proving V1 misses V2 defenses)');
});

// ========== 6 条攻击语料对比执行 ==========

const attacks = loadAttackFiles();

test(`loaded ${attacks.length} attack corpus files`, () => {
  assert.equal(attacks.length, 6, 'must load exactly 6 attack corpus files');
});

const comparisonRows: ComparisonRow[] = [];

for (const attack of attacks) {
  test(`comparison: ${attack.attackId} — baseline ${attack.expected.baselineVerdict} vs FAR-Lab ${attack.expected.farVerdict}`, () => {
    // --- baseline 路径：V1 makeVerdict（绕过 FEC/V2/anti-theater）---
    const baselineOutput = runBaselineVerdict({
      claim: attack.claim,
      evidences: attack.baselineEvidences,
      falsificationSpec: attack.falsificationSpec,
      thresholdSpec: attack.thresholdSpec,
    });
    assert.equal(
      baselineOutput.verdict,
      attack.expected.baselineVerdict,
      `${attack.attackId} baseline verdict must be ${attack.expected.baselineVerdict}`,
    );
    assert.match(baselineOutput.proofHash, /^[0-9a-f]{64}$/, 'baseline proofHash must be real sha256');

    // --- FAR-Lab 路径：V2 decideFiveValueVerdict（含 compileFec + R0-R9 + anti-theater）---
    const kernelInput = buildAttackKernelInput(attack);
    const farOutput = decideFiveValueVerdict(kernelInput);
    assert.equal(
      farOutput.verdict,
      attack.expected.farVerdict,
      `${attack.attackId} FAR-Lab verdict must be ${attack.expected.farVerdict}`,
    );
    assert.equal(
      farOutput.decisiveRuleId,
      attack.expected.farDecisiveRuleId,
      `${attack.attackId} decisiveRuleId must be ${attack.expected.farDecisiveRuleId}`,
    );
    assert.deepEqual(
      [...farOutput.reasonCodes],
      [...attack.expected.farReasonCodes],
      `${attack.attackId} reasonCodes must match`,
    );

    // --- 对比结论 ---
    const baselineCaught = baselineOutput.verdict !== 'CONFIRMED';
    const farCaught = farOutput.verdict !== 'CONFIRMED';
    comparisonRows.push({
      attackId: attack.attackId,
      baselineVerdict: baselineOutput.verdict,
      farVerdict: farOutput.verdict,
      farDecisiveRuleId: farOutput.decisiveRuleId,
      farReasonCodes: farOutput.reasonCodes,
      baselineCaught,
      farCaught,
    });
  });
}

// ========== 生产路径验证：fecAppendClaim 真实事务（seed-cherry 用例） ==========

test('production path: fecAppendClaim processes seed-cherry attack via full FEC gate + V2 kernel + anti-theater', () => {
  const seedCherryAttack = attacks.find((a) => a.attackId === 'AT-SEED-CHERRY');
  assert.ok(seedCherryAttack, 'seed-cherry attack must exist in corpus');

  const kernelInput = buildAttackKernelInput(seedCherryAttack);
  const fec = kernelInput.fec as FecContractV2;
  assert.ok(fec !== null, 'seed-cherry kernel must have a valid FEC');

  // 构造 AntiTheaterReport（从 kernel input 的 antiTheaterFindings 反推存储型 findings）。
  const antiTheaterReport: AntiTheaterReport = {
    findings: kernelInput.antiTheaterFindings.map((f, i) => ({
      findingId: `AT-FINDING-${i + 1}`,
      attackKind: f.kind as AntiTheaterReport['findings'][number]['attackKind'],
      outcome: f.severity === 'fail' ? 'FAIL' : f.severity === 'warn' ? 'WARN' : 'PASS',
      hasFail: f.severity === 'fail',
      evidenceRef: 'EV-AT-001',
      message: f.details ?? '',
    })),
    hasFail: kernelInput.antiTheaterFindings.some((f) => f.severity === 'fail'),
    failCount: kernelInput.antiTheaterFindings.filter((f) => f.severity === 'fail').length,
    warnCount: kernelInput.antiTheaterFindings.filter((f) => f.severity === 'warn').length,
    llmOverrideRejected: true,
  };

  // 验证 toKernelFindings 投影正确（真实 adapter 调用·非 mock）
  const projected = toKernelFindings(antiTheaterReport.findings);
  const firstProjected = projected[0];
  assert.ok(firstProjected !== undefined, 'toKernelFindings must project at least one finding');
  assert.equal(firstProjected.severity, 'fail', 'toKernelFindings must project FAIL → fail');

  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const result = fecAppendClaim(db, {
      callRecord: {
        stageId: 'stage3_hypothesis',
        cred: {
          modelId: 'offline-replay-fixture',
          dashscopeRequestId: null,
          reproHash: 'a'.repeat(64),
          gitCommitSha: BASELINE_SOURCE_ANCHOR.gitCommitSha,
          isoTimestamp: BASELINE_SOURCE_ANCHOR.isoTimestamp,
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
      },
      callAudit: {
        requestPayload: '{"prompt":"comparison-trial"}',
        responsePayload: '{"claim":"seed-cherry-attack"}',
        finishReason: 'stop',
        usageTokensTotal: 16,
      },
      appendOptions: { providerProfile: 'offline_replay' },
      evidencePayload: { claim: seedCherryAttack.claim, attackId: 'AT-SEED-CHERRY' },
      sourceAnchor: BASELINE_SOURCE_ANCHOR,
      claim: seedCherryAttack.claim,
      falsificationSpec: seedCherryAttack.falsificationSpec,
      thresholdSpec: seedCherryAttack.thresholdSpec,
      evidences: [
        {
          claim: 'measured bls_power = 0.62 on dataset D (n=120, seed=137)',
          metricValue: 0.62,
          supportsClaim: true,
          refutesClaim: false,
          scopeNarrowerThanClaim: false,
          sourceAnchor: BASELINE_SOURCE_ANCHOR,
        },
      ],
      parentVerdictId: null,
      nodeKind: 'hypothesis',
      fecV2: { contract: fec },
      antiTheaterReport,
    });

    // FEC gate 通过（GV-01 FEC 编译成功）
    assert.equal(result.fecGate.allowed, true, 'FEC gate must allow valid FEC');
    // V2 kernel 经 fecAppendClaim 真实事务路径触发 ANTI_THEATER_FAIL
    assert.equal(result.kernelOutput.verdict, 'UNTESTED', 'production path must yield UNTESTED for anti-theater fail');
    assert.equal(result.kernelOutput.decisiveRuleId, 'ANTI_THEATER_FAIL');
    assert.equal(result.decision.verdict, 'UNTESTED');
  } finally {
    db.close();
  }
});

// ========== 对比结果汇总（所有攻击用例跑完后输出检测率） ==========

test('comparison summary: FAR-Lab detection rate >> baseline detection rate', () => {
  // 本 test 在 6 条攻击 test 之后跑（node:test 串行执行同文件 test）。
  // 若 comparisonRows 未填满（test 跑序不确定），主动重算。
  if (comparisonRows.length < attacks.length) {
    for (const attack of attacks) {
      const baselineOutput = runBaselineVerdict({
        claim: attack.claim,
        evidences: attack.baselineEvidences,
        falsificationSpec: attack.falsificationSpec,
        thresholdSpec: attack.thresholdSpec,
      });
      const kernelInput = buildAttackKernelInput(attack);
      const farOutput = decideFiveValueVerdict(kernelInput);
      const existing = comparisonRows.find((r) => r.attackId === attack.attackId);
      if (existing === undefined) {
        comparisonRows.push({
          attackId: attack.attackId,
          baselineVerdict: baselineOutput.verdict,
          farVerdict: farOutput.verdict,
          farDecisiveRuleId: farOutput.decisiveRuleId,
          farReasonCodes: farOutput.reasonCodes,
          baselineCaught: baselineOutput.verdict !== 'CONFIRMED',
          farCaught: farOutput.verdict !== 'CONFIRMED',
        });
      }
    }
  }

  const baselineDetections = comparisonRows.filter((r) => r.baselineCaught).length;
  const farDetections = comparisonRows.filter((r) => r.farCaught).length;
  const baselineRate = (baselineDetections / comparisonRows.length * 100).toFixed(1);
  const farRate = (farDetections / comparisonRows.length * 100).toFixed(1);

  // 输出对比表（console output 供 COMPARISON_TRIAL_REPORT.md 提取）
  console.log('\n========== BASELINE vs FAR-Lab COMPARISON ==========');
  console.log('attackId                          | baseline    | FAR-Lab   | decisiveRuleId                    | reasonCodes');
  console.log('-'.repeat(160));
  for (const row of comparisonRows) {
    console.log(
      `${row.attackId.padEnd(33)}| ${row.baselineVerdict.padEnd(12)}| ${row.farVerdict.padEnd(12)}| ${row.farDecisiveRuleId.padEnd(33)}| ${row.farReasonCodes.join(', ')}`,
    );
  }
  console.log('-'.repeat(160));
  console.log(`baseline detection rate: ${baselineDetections}/${comparisonRows.length} (${baselineRate}%)`);
  console.log(`FAR-Lab detection rate: ${farDetections}/${comparisonRows.length} (${farRate}%)`);
  console.log('=====================================================\n');

  // 核心断言：FAR-Lab 检测率必须 > baseline 检测率
  assert.ok(
    farDetections > baselineDetections,
    `FAR-Lab detection rate (${farDetections}/${comparisonRows.length}) must exceed baseline (${baselineDetections}/${comparisonRows.length})`,
  );
  assert.equal(
    farDetections,
    comparisonRows.length,
    `FAR-Lab must detect all ${comparisonRows.length} attacks`,
  );
  assert.equal(
    baselineDetections,
    0,
    'baseline must miss all attacks (all baseline verdicts = CONFIRMED)',
  );
});
