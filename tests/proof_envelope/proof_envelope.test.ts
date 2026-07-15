// tests/proof_envelope/proof_envelope.test.ts
// 职责：ProofEnvelope 9 规则验证器 + proofHash + sealer 单元测试 (09 §4)。
//
// 目的：覆盖 validator.ts / proof_hash.ts / sealer.ts 的全部 PASS/FAIL/WARN 分支
//       (此前三文件无独立单元测试，branch 覆盖裸露，由 far_proof 间接覆盖)。
//
// 边界：
//   - validator / proof_hash 为纯函数，无 db 依赖
//   - sealer 需要 db；proof_envelopes.verdict_node_id 有 FK 指向 verdict_nodes。
//     本测试用 foreign_keys=OFF 隔离 FK（anti-theater / append-only trigger 不依赖 FK，仍生效），
//     以便聚焦 proof_envelope 自身逻辑，不依赖整条 verdict_nodes 插入链。
//
// 零容忍合规：无 :any / @ts-ignore / as unknown as / 空 catch / 修改测试期望掩盖实现。
// 类型安全：数组索引经 length 断言或 for-return 收窄，无 ! / ?. 掩盖 null。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  validateProofEnvelope,
  hasAntiTheaterViolation,
  summarizeChecks,
} from '../../src/proof_envelope/validator.ts';
import {
  sealProofEnvelope,
  getProofEnvelopesByVerdictNode,
} from '../../src/proof_envelope/sealer.ts';
import {
  computeProofHash,
  verifyProofHash,
} from '../../src/proof_envelope/proof_hash.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import type {
  SealProofEnvelopeInput,
  ProofCheckResult,
  ProofValidatorRule,
  CheckOutcome,
  ProofEnvelope,
} from '../../src/proof_envelope/types.ts';
import type { FalsificationSpec, SourceAnchor } from '../../src/falsifiability/types.ts';

// ---------- fixtures ----------

const HASH64_HEX = 'a'.repeat(64); // 小写 hex，满足 RULE-PE-006 正则
const HASH64_NONHEX = 'g'.repeat(64); // 长度 64 但非 hex
const HASH63 = 'a'.repeat(63);
const GIT40 = 'b'.repeat(40);

const VALID_SPEC: FalsificationSpec = {
  prediction: 'pred',
  metric: 'acc',
  falsificationThreshold: 0.5,
  thresholdSemantics: 'gt',
};

const VALID_ANCHOR: SourceAnchor = {
  gitCommitSha: GIT40,
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-28T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

/** 构造合法 base input，允许部分覆盖。默认全字段合法、conclusion 非 CONFIRMED。 */
type SealInputOverrides = Omit<Partial<SealProofEnvelopeInput>, 'knownFailures'> & {
  knownFailures?: readonly string[] | undefined;
};

function makeBaseInput(overrides: SealInputOverrides = {}): SealProofEnvelopeInput {
  const { knownFailures, ...rest } = overrides;
  const base: SealProofEnvelopeInput = {
    claimId: 'claim-1',
    verdictNodeId: 'vn-1',
    conclusion: 'REFUTED',
    prevProofHash: HASH64_HEX,
    checks: [],
    falsificationSpec: VALID_SPEC,
    sourceAnchor: VALID_ANCHOR,
    reproHash: HASH64_HEX,
    sealedAt: '2026-06-28T00:00:00.000Z',
    ...rest,
  };
  // knownFailures 默认省略（覆盖 validator 的 undefined 分支 RULE-PE-009）；显式提供时才写入。
  return knownFailures === undefined ? base : { ...base, knownFailures };
}

/** 从 checks 数组中取指定 ruleId 的 outcome（for-return 收窄，无 ! / ?.）。 */
function outcomeOf(
  checks: readonly ProofCheckResult[],
  ruleId: ProofValidatorRule,
): CheckOutcome {
  for (const check of checks) {
    if (check.ruleId === ruleId) {
      return check.outcome;
    }
  }
  throw new Error(`outcomeOf: rule ${ruleId} not found in checks`);
}

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  // 测试隔离：关闭 FK，使 sealProofEnvelope 不依赖 verdict_nodes 插入链。
  // anti-theater（BEFORE INSERT, 检查 checks JSON + conclusion）与 append-only trigger
  // 不依赖 FK，仍生效，保证本测试聚焦 proof_envelope 自身逻辑。
  db.pragma('foreign_keys = OFF');
  return db;
}

// ============================================================================
// RULE-PE-001 · claim_non_empty
// ============================================================================

test('RULE-PE-001: empty claimId → FAIL', () => {
  const checks = validateProofEnvelope(makeBaseInput({ claimId: '   ' }));
  assert.equal(outcomeOf(checks, 'RULE-PE-001'), 'FAIL');
});

test('RULE-PE-001: non-empty claimId → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput({ claimId: 'claim-x' }));
  assert.equal(outcomeOf(checks, 'RULE-PE-001'), 'PASS');
});

// ============================================================================
// RULE-PE-002 · verdict_node_exists
// ============================================================================

test('RULE-PE-002: empty verdictNodeId → FAIL', () => {
  const checks = validateProofEnvelope(makeBaseInput({ verdictNodeId: '' }));
  assert.equal(outcomeOf(checks, 'RULE-PE-002'), 'FAIL');
});

test('RULE-PE-002: non-empty verdictNodeId → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput());
  assert.equal(outcomeOf(checks, 'RULE-PE-002'), 'PASS');
});

// ============================================================================
// RULE-PE-003 · falsification_spec_present (prediction + metric 两个分支)
// ============================================================================

test('RULE-PE-003: empty prediction → FAIL', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ falsificationSpec: { ...VALID_SPEC, prediction: '  ' } }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-003'), 'FAIL');
});

test('RULE-PE-003: empty metric → FAIL', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ falsificationSpec: { ...VALID_SPEC, metric: '' } }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-003'), 'FAIL');
});

test('RULE-PE-003: present prediction + metric → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput());
  assert.equal(outcomeOf(checks, 'RULE-PE-003'), 'PASS');
});

// ============================================================================
// RULE-PE-004 · source_anchor_present (gitCommitSha FAIL + rawResponseHash WARN)
// ============================================================================

test('RULE-PE-004: empty gitCommitSha → FAIL', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ sourceAnchor: { ...VALID_ANCHOR, gitCommitSha: '   ' } }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-004'), 'FAIL');
});

test('RULE-PE-004: empty rawResponseHash → WARN (offline replay)', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ sourceAnchor: { ...VALID_ANCHOR, rawResponseHash: '' } }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-004'), 'WARN');
});

test('RULE-PE-004: complete anchor → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput());
  assert.equal(outcomeOf(checks, 'RULE-PE-004'), 'PASS');
});

// ============================================================================
// RULE-PE-005 · repro_hash_present (长度分支)
// ============================================================================

test('RULE-PE-005: reproHash length 63 → FAIL', () => {
  const checks = validateProofEnvelope(makeBaseInput({ reproHash: HASH63 }));
  assert.equal(outcomeOf(checks, 'RULE-PE-005'), 'FAIL');
});

test('RULE-PE-005: reproHash length 64 → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput({ reproHash: HASH64_HEX }));
  assert.equal(outcomeOf(checks, 'RULE-PE-005'), 'PASS');
});

// ============================================================================
// RULE-PE-006 · prev_proof_hash_valid (长度 + hex 两分支)
// ============================================================================

test('RULE-PE-006: prevProofHash length 63 → FAIL (length branch)', () => {
  const checks = validateProofEnvelope(makeBaseInput({ prevProofHash: HASH63 }));
  assert.equal(outcomeOf(checks, 'RULE-PE-006'), 'FAIL');
});

test('RULE-PE-006: prevProofHash length 64 but non-hex → FAIL (hex branch)', () => {
  const checks = validateProofEnvelope(makeBaseInput({ prevProofHash: HASH64_NONHEX }));
  assert.equal(outcomeOf(checks, 'RULE-PE-006'), 'FAIL');
});

test('RULE-PE-006: valid hex 64 → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput({ prevProofHash: HASH64_HEX }));
  assert.equal(outcomeOf(checks, 'RULE-PE-006'), 'PASS');
});

// ============================================================================
// RULE-PE-007 · conclusion_matches_checks (anti-theater / degrade / pass 三分支)
// ============================================================================

/** 构造一个 outcome=WARN 的 check（ruleId 占位，RULE-PE-007 只看 outcome）。 */
function warnCheck(): ProofCheckResult {
  return { ruleId: 'RULE-PE-001', ruleName: 'x', outcome: 'WARN', detail: 'd' };
}

test('RULE-PE-007: WARN check + CONFIRMED → FAIL (anti-theater F1)', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ conclusion: 'CONFIRMED', checks: [warnCheck()] }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-007'), 'FAIL');
});

test('RULE-PE-007: WARN check + non-CONFIRMED → WARN (correct degradation)', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ conclusion: 'DEGRADED_SCOPE', checks: [warnCheck()] }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-007'), 'WARN');
});

test('RULE-PE-007: all-pass checks + CONFIRMED → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput({ conclusion: 'CONFIRMED', checks: [] }));
  assert.equal(outcomeOf(checks, 'RULE-PE-007'), 'PASS');
});

// ============================================================================
// RULE-PE-008 · sealed_by_deterministic (恒 PASS)
// ============================================================================

test('RULE-PE-008: always PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput());
  assert.equal(outcomeOf(checks, 'RULE-PE-008'), 'PASS');
});

// ============================================================================
// RULE-PE-009 · known_failures_not_hidden (empty/empty-entry/CONFIRMED/transparent)
// ============================================================================

test('RULE-PE-009: no knownFailures → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput({ knownFailures: [] }));
  assert.equal(outcomeOf(checks, 'RULE-PE-009'), 'PASS');
});

test('RULE-PE-009: undefined knownFailures → PASS', () => {
  const checks = validateProofEnvelope(makeBaseInput({ knownFailures: undefined }));
  assert.equal(outcomeOf(checks, 'RULE-PE-009'), 'PASS');
});

test('RULE-PE-009: knownFailures with empty entry → WARN', () => {
  const checks = validateProofEnvelope(makeBaseInput({ knownFailures: ['valid', '   '] }));
  assert.equal(outcomeOf(checks, 'RULE-PE-009'), 'WARN');
});

test('RULE-PE-009: knownFailures + CONFIRMED → WARN (should be transparent)', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ conclusion: 'CONFIRMED', knownFailures: ['some failure'] }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-009'), 'WARN');
});

test('RULE-PE-009: knownFailures + non-CONFIRMED → PASS (transparent reporting)', () => {
  const checks = validateProofEnvelope(
    makeBaseInput({ conclusion: 'REFUTED', knownFailures: ['some failure'] }),
  );
  assert.equal(outcomeOf(checks, 'RULE-PE-009'), 'PASS');
});

// ============================================================================
// hasAntiTheaterViolation + summarizeChecks (helper 公开函数分支)
// ============================================================================

test('hasAntiTheaterViolation: WARN + CONFIRMED → true', () => {
  assert.equal(hasAntiTheaterViolation([warnCheck()], 'CONFIRMED'), true);
});

test('hasAntiTheaterViolation: WARN + non-CONFIRMED → false', () => {
  assert.equal(hasAntiTheaterViolation([warnCheck()], 'REFUTED'), false);
});

test('hasAntiTheaterViolation: all-pass + CONFIRMED → false', () => {
  assert.equal(hasAntiTheaterViolation([], 'CONFIRMED'), false);
});

test('summarizeChecks: counts each outcome', () => {
  const checks: ProofCheckResult[] = [
    { ruleId: 'RULE-PE-001', ruleName: 'a', outcome: 'PASS', detail: '' },
    { ruleId: 'RULE-PE-002', ruleName: 'b', outcome: 'PASS', detail: '' },
    { ruleId: 'RULE-PE-003', ruleName: 'c', outcome: 'WARN', detail: '' },
    { ruleId: 'RULE-PE-004', ruleName: 'd', outcome: 'FAIL', detail: '' },
  ];
  const summary = summarizeChecks(checks);
  assert.equal(summary.PASS, 2);
  assert.equal(summary.WARN, 1);
  assert.equal(summary.FAIL, 1);
  assert.equal(summary.SKIP, 0);
});

// ============================================================================
// computeProofHash · 排序确定性 + 内容敏感性
// ============================================================================

test('computeProofHash: checks 不同顺序 → 相同 hash (排序确定性)', () => {
  const base = makeBaseInput();
  // 构造两个 envelopeWithoutHash：checks 顺序不同
  const checksA: ProofCheckResult[] = [
    { ruleId: 'RULE-PE-002', ruleName: 'b', outcome: 'PASS', detail: 'x' },
    { ruleId: 'RULE-PE-001', ruleName: 'a', outcome: 'WARN', detail: 'y' },
  ];
  const checksB: ProofCheckResult[] = [
    { ruleId: 'RULE-PE-001', ruleName: 'a', outcome: 'WARN', detail: 'y' },
    { ruleId: 'RULE-PE-002', ruleName: 'b', outcome: 'PASS', detail: 'x' },
  ];
  // 用 computeProofHash 直接算（需 Omit<ProofEnvelope,'proofHash'> 形状）
  const envA = { envelopeId: 'e1', claimId: base.claimId, verdictNodeId: base.verdictNodeId, conclusion: base.conclusion, prevProofHash: base.prevProofHash, checks: checksA, knownFailures: [], falsificationSpec: base.falsificationSpec, sourceAnchor: base.sourceAnchor, reproHash: base.reproHash, sealedBy: 'deterministic_sealer' as const, sealedAt: base.sealedAt, createdAt: '2026-06-28T00:00:00.000Z' };
  const envB = { ...envA, checks: checksB };
  assert.equal(computeProofHash(envA), computeProofHash(envB));
});

test('computeProofHash: 不同内容 → 不同 hash', () => {
  const base = makeBaseInput();
  const env1 = { envelopeId: 'e1', claimId: base.claimId, verdictNodeId: base.verdictNodeId, conclusion: base.conclusion, prevProofHash: base.prevProofHash, checks: [], knownFailures: [], falsificationSpec: base.falsificationSpec, sourceAnchor: base.sourceAnchor, reproHash: base.reproHash, sealedBy: 'deterministic_sealer' as const, sealedAt: base.sealedAt, createdAt: '2026-06-28T00:00:00.000Z' };
  const env2 = { ...env1, claimId: 'claim-different' };
  assert.notEqual(computeProofHash(env1), computeProofHash(env2));
});

// ============================================================================
// verifyProofHash · 正确 / 篡改
// ============================================================================

test('verifyProofHash: correct proofHash → true', () => {
  const db = openDb();
  const result = sealProofEnvelope(db, makeBaseInput());
  assert.equal(verifyProofHash(result.envelope), true);
});

test('verifyProofHash: tampered proofHash → false', () => {
  const db = openDb();
  const result = sealProofEnvelope(db, makeBaseInput());
  const tampered: ProofEnvelope = { ...result.envelope, proofHash: '0'.repeat(64) };
  assert.equal(verifyProofHash(tampered), false);
});

// ============================================================================
// sealProofEnvelope · 正常密封 + round-trip
// ============================================================================

test('sealProofEnvelope: valid input → envelope with 64-hex proofHash, no warnings', () => {
  const db = openDb();
  const result = sealProofEnvelope(db, makeBaseInput({ conclusion: 'REFUTED' }));
  assert.equal(result.envelope.proofHash.length, 64);
  assert.match(result.envelope.proofHash, /^[0-9a-f]{64}$/);
  assert.equal(result.envelope.sealedBy, 'deterministic_sealer');
  assert.equal(result.hasWarnings, false);
  assert.equal(result.checks.length, 9);
});

test('sealProofEnvelope: WARN-generating input + non-CONFIRMED → hasWarnings true', () => {
  const db = openDb();
  // rawResponseHash empty → RULE-PE-004 WARN；conclusion REFUTED → 非 CONFIRMED，可密封
  const result = sealProofEnvelope(
    db,
    makeBaseInput({ conclusion: 'REFUTED', sourceAnchor: { ...VALID_ANCHOR, rawResponseHash: '' } }),
  );
  assert.equal(result.hasWarnings, true);
});

test('sealProofEnvelope: anti-theater trigger aborts WARN + CONFIRMED', () => {
  const db = openDb();
  // rawResponseHash empty → RULE-PE-004 WARN；conclusion CONFIRMED → trigger ABORT
  assert.throws(
    () =>
      sealProofEnvelope(
        db,
        makeBaseInput({
          conclusion: 'CONFIRMED',
          sourceAnchor: { ...VALID_ANCHOR, rawResponseHash: '' },
        }),
      ),
    /WARN|anti-theater|CONFIRMED/i,
  );
});

test('sealProofEnvelope: FAIL-generating input + CONFIRMED → throws (anti-theater F1 · AT-02)', () => {
  const db = openDb();
  // reproHash 长度 63 → RULE-PE-005 FAIL（无 WARN）；conclusion CONFIRMED → sealer TS 层 step 1b throw。
  // 此场景 checks JSON 只含 "FAIL" 不含 "WARN"，正是旧 trigger（仅匹配 WARN）漏过的 AT-02 漏洞。
  assert.throws(
    () =>
      sealProofEnvelope(
        db,
        makeBaseInput({ conclusion: 'CONFIRMED', reproHash: HASH63 }),
      ),
    /WARN\/FAIL|anti-theater|CONFIRMED/i,
  );
});

test('sealProofEnvelope: all-pass checks + CONFIRMED → throws (ASK-9 硬门·AT-02 盲区闭合)', () => {
  const db = openDb();
  // AT-02 盲区：checks 全 PASS（无 WARN/FAIL）→ hasAntiTheaterViolation=false → AT-02 不触发。
  // 旧版 sealer 会成功密封 CONFIRMED（违反 ASK-9「机器密封禁产 CONFIRMED」）。
  // ASK-9 硬门（P1-5）在 AT-02 之后兜底：conclusion===CONFIRMED 直接 throw，与 hasWarnOrFail 无关。
  assert.throws(
    () =>
      sealProofEnvelope(
        db,
        makeBaseInput({ conclusion: 'CONFIRMED', checks: [] }),
      ),
    /ASK-9|cannot seal CONFIRMED|CONFIRMED/i,
  );
});

test('anti-theater trigger aborts direct SQL INSERT with FAIL + CONFIRMED (physical backstop · AT-02)', () => {
  const db = openDb();
  // 绕过 sealer，直接 INSERT 一个 checks 含 "FAIL"（无 "WARN"）+ CONFIRMED 的 envelope。
  // 验证 migration 0008 trigger 作为物理兜底防线（防直接 SQL INSERT 绕过 sealer.ts step 1b）。
  const checksJson = JSON.stringify([
    { ruleId: 'RULE-PE-005', ruleName: 'repro_hash_present', outcome: 'FAIL', detail: 'reproHash length invalid' },
    { ruleId: 'RULE-PE-007', ruleName: 'conclusion_matches_checks', outcome: 'FAIL', detail: 'FAIL + CONFIRMED' },
  ]);
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO proof_envelopes (
            envelope_id, claim_id, verdict_node_id, conclusion,
            proof_hash, prev_proof_hash, checks, known_failures,
            falsification_spec, source_anchor, repro_hash,
            sealed_by, sealed_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'env-fail-direct', 'claim-1', 'vn-1', 'CONFIRMED',
          HASH64_HEX, HASH64_HEX, checksJson, '[]',
          JSON.stringify(VALID_SPEC), JSON.stringify(VALID_ANCHOR), HASH64_HEX,
          'deterministic_sealer', '2026-06-28T00:00:00.000Z', '2026-06-28T00:00:00.000Z',
        ),
    /WARN\/FAIL|anti-theater|CONFIRMED/i,
  );
});

test('hasAntiTheaterViolation: FAIL + CONFIRMED → true (AT-02 FAIL coverage)', () => {
  const failCheck: ProofCheckResult = {
    ruleId: 'RULE-PE-005',
    ruleName: 'repro_hash_present',
    outcome: 'FAIL',
    detail: '',
  };
  assert.equal(hasAntiTheaterViolation([failCheck], 'CONFIRMED'), true);
});

test('getProofEnvelopesByVerdictNode: round-trip returns sealed envelope with matching fields', () => {
  const db = openDb();
  const verdictNodeId = 'vn-rt-' + 'd'.repeat(8);
  const result = sealProofEnvelope(db, makeBaseInput({ verdictNodeId, conclusion: 'REFUTED' }));
  const fetched = getProofEnvelopesByVerdictNode(db, verdictNodeId);
  assert.equal(fetched.length, 1);
  const first = fetched[0];
  assert.ok(first !== undefined, 'round-trip should return the sealed envelope');
  assert.equal(first.envelopeId, result.envelope.envelopeId);
  assert.equal(first.proofHash, result.envelope.proofHash);
  assert.equal(first.conclusion, 'REFUTED');
  assert.equal(first.sealedBy, 'deterministic_sealer');
  assert.equal(first.checks.length, 9);
  assert.deepEqual([...first.knownFailures], [...result.envelope.knownFailures]);
  // 回读的 envelope 仍可通过 proofHash 校验
  assert.equal(verifyProofHash(first), true);
});

test('getProofEnvelopesByVerdictNode: empty result for unknown verdictNodeId', () => {
  const db = openDb();
  const fetched = getProofEnvelopesByVerdictNode(db, 'does-not-exist');
  assert.equal(fetched.length, 0);
});
