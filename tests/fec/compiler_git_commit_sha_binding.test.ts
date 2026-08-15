// tests/fec/compiler_git_commit_sha_binding.test.ts
//
// T-008 · FEC freeze.gitCommitSha 强制绑定回归测试（2026-07-24 T-008 修复）。
//
// T-008：
//   "FEC `frozenAt` 自签无第三方锚定"——原 freeze.timestamp 是自签 ISO-8601 字符串，
//   任何人可任意回填，无法证明"冻结时确实在此时间点"。
//
// 修复机制（V1 边界·诚实登记）：
//   - ProtocolFreeze 新增 `gitCommitSha?: string`（40-hex sha1·公开可查）；
//   - FecContractV2 新增 `requireGitCommitShaBinding?: boolean` META 开关；
//   - compiler #11 校验：opt-in 时 freeze.gitCommitSha 须为合法 40-hex sha1，
//     否则 GIT_COMMIT_SHA_UNBOUND（HARD_FAIL_UNTESTED · fail-closed UNTESTED）。
//
// 测试覆盖：
//   1. V1 默认（requireGitCommitShaBinding 缺省/false）→ 跳过 #11（向后兼容 demo seed）；
//   2. opt-in + freeze.gitCommitSha 缺失 → GIT_COMMIT_SHA_UNBOUND（fail-closed）；
//   3. opt-in + freeze.gitCommitSha 格式错（短/含大写/含非 hex）→ GIT_COMMIT_SHA_UNBOUND；
//   4. opt-in + freeze.gitCommitSha 合法 40-hex → 通过（合法路径不误伤）；
//   5. computeFecHash 字段敏感性：gitCommitSha 进 hash（提供时），缺失时不进 hash（V1 兼容）；
//   6. orchestrator 集成：opt-in + 缺 sha → fecAppendClaim fail-closed UNTESTED。
//
// Authority: T-008 + +
//            src/fec/compiler.ts:437-481（checkGitCommitShaBinding）
//            src/fec/fec_contract.ts:176-203（ProtocolFreeze.gitCommitSha）
//            src/fec/fec_contract.ts:285-299（FecContractV2.requireGitCommitShaBinding）。
//
// 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import Database from 'better-sqlite3';
import {
  compileFec,
  computeFecHash,
} from '../../src/fec/compiler.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import { runMigrations } from '../../src/db/index.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeValidFec } from './fixtures.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';

const SHA1_40 = 'a'.repeat(40); // 合法 40-hex sha1
const SHA1_40_B = 'b'.repeat(40); // 另一合法 sha1（hash 字段敏感对照）

/** assert.fail narrowing helper：断言 compileFec 返回 ok=false 分支（含 errors 字段）。 */
type CompileFailResult = Extract<ReturnType<typeof compileFec>, { ok: false }>;
function assertCompileFail(result: ReturnType<typeof compileFec>): asserts result is CompileFailResult {
  assert.equal(result.ok, false, 'expected compile ok=false but got ok=true');
}

// ===== 工具：构造带/不带 gitCommitSha 的 FEC =====

function makeFecWithGitSha(options?: {
  readonly requireBinding?: boolean;
  readonly gitSha?: string | undefined;
}): FecContractV2 {
  const base = makeValidFec();
  // 用 spread 而非赋值（FecContractV2 字段 readonly · Partial 仍保 readonly · 不可赋值）。
  // exactOptionalPropertyTypes 兼容：gitSha undefined 时省略 freeze.gitCommitSha 字段。
  if (options?.requireBinding === undefined && options?.gitSha === undefined) {
    return base;
  }

  const freezeOverride = options?.gitSha !== undefined
    ? { ...base.freeze, gitCommitSha: options.gitSha }
    : base.freeze;

  const requireBinding = options?.requireBinding === undefined
    ? {}
    : { requireGitCommitShaBinding: options.requireBinding };

  return {
    ...base,
    ...requireBinding,
    freeze: freezeOverride,
  };
}

// ===== V1 默认不强制（向后兼容）=====

test('T-008 compiler: V1 默认（requireGitCommitShaBinding 缺省）→ 跳过 #11（向后兼容 demo seed）', () => {
  // FEC 完全不携带 gitCommitSha + 不 opt-in → 须通过（demo seed 现状）
  const fec = makeValidFec();
  const result = compileFec({ fec });

  assert.equal(result.ok, true, 'V1 默认下不强制 git 锚定·demo seed 须通过');
  // V1 默认下 #11 跳过，不会产 GIT_COMMIT_SHA_UNBOUND（已通过 assert.equal 确保 ok=true，无 errors 可查）
});

test('T-008 compiler: requireGitCommitShaBinding=false 显式 → 跳过 #11（向后兼容）', () => {
  // 显式 false + gitCommitSha 缺失 → 须通过
  const fec = makeFecWithGitSha({ requireBinding: false });
  const result = compileFec({ fec });
  assert.equal(result.ok, true);
});

// ===== opt-in + gitCommitSha 缺失/格式错 → GIT_COMMIT_SHA_UNBOUND =====

test('T-008 compiler: opt-in + freeze.gitCommitSha 缺失 → GIT_COMMIT_SHA_UNBOUND（HARD_FAIL_UNTESTED）', () => {
  const fec = makeFecWithGitSha({ requireBinding: true }); // 不提供 gitSha
  const result = compileFec({ fec });

  assertCompileFail(result);

  const shaError = result.errors.find((e) => e.code === 'GIT_COMMIT_SHA_UNBOUND');
  assert.ok(shaError !== undefined, '须产 GIT_COMMIT_SHA_UNBOUND error');
  assert.equal(shaError!.severity, 'HARD_FAIL_UNTESTED');
  assert.equal(shaError!.field, 'freeze.gitCommitSha');
  // 错误消息须含修复指引
  assert.match(shaError!.message, /requireGitCommitShaBinding=true/);
  assert.match(shaError!.message, /git rev-parse HEAD/);
  assert.match(shaError!.message, /40-hex sha1/);
});

test('T-008 compiler: opt-in + freeze.gitCommitSha 空字符串 → GIT_COMMIT_SHA_UNBOUND', () => {
  const fec = makeFecWithGitSha({ requireBinding: true, gitSha: '' });
  const result = compileFec({ fec });

  assertCompileFail(result);
  const shaError = result.errors.find((e) => e.code === 'GIT_COMMIT_SHA_UNBOUND');
  assert.ok(shaError !== undefined);
});

test('T-008 compiler: opt-in + freeze.gitCommitSha 短字符串（非 40 字符）→ GIT_COMMIT_SHA_UNBOUND', () => {
  const fec = makeFecWithGitSha({ requireBinding: true, gitSha: 'abc123' });
  const result = compileFec({ fec });

  assertCompileFail(result);
  assert.ok(
    result.errors.some((e) => e.code === 'GIT_COMMIT_SHA_UNBOUND'),
    '短字符串须触发 GIT_COMMIT_SHA_UNBOUND',
  );
});

test('T-008 compiler: opt-in + freeze.gitCommitSha 含大写 hex → GIT_COMMIT_SHA_UNBOUND（git rev-parse 输出小写）', () => {
  const fec = makeFecWithGitSha({ requireBinding: true, gitSha: 'A'.repeat(40) });
  const result = compileFec({ fec });

  assertCompileFail(result);
  assert.ok(
    result.errors.some((e) => e.code === 'GIT_COMMIT_SHA_UNBOUND'),
    '大写 hex 须触发（git rev-parse 输出小写·与 SourceAnchor.gitCommitSha 同规范）',
  );
});

test('T-008 compiler: opt-in + freeze.gitCommitSha 含非 hex 字符 → GIT_COMMIT_SHA_UNBOUND', () => {
  const fec = makeFecWithGitSha({ requireBinding: true, gitSha: 'g'.repeat(40) });
  const result = compileFec({ fec });

  assertCompileFail(result);
  assert.ok(
    result.errors.some((e) => e.code === 'GIT_COMMIT_SHA_UNBOUND'),
    'g 非 hex 字符 须触发',
  );
});

test('T-008 compiler: opt-in + freeze.gitCommitSha 41 字符（多一个 hex）→ GIT_COMMIT_SHA_UNBOUND', () => {
  const fec = makeFecWithGitSha({ requireBinding: true, gitSha: 'a'.repeat(41) });
  const result = compileFec({ fec });

  assertCompileFail(result);
  assert.ok(
    result.errors.some((e) => e.code === 'GIT_COMMIT_SHA_UNBOUND'),
    '41 字符须触发（精确 40）',
  );
});

// ===== opt-in + 合法 40-hex sha1 → 通过（不误伤）=====

test('T-008 compiler: opt-in + freeze.gitCommitSha 合法 40-hex sha1 → 通过（合法路径不误伤）', () => {
  const fec = makeFecWithGitSha({ requireBinding: true, gitSha: SHA1_40 });
  const result = compileFec({ fec });

  assert.equal(result.ok, true, '合法 40-hex sha1 须通过 #11 校验');
  // 已通过 assert.equal 确保 ok=true（无 errors 可查·#11 不会触发）
});

// ===== computeFecHash 字段敏感性 =====

test('T-008 computeFecHash: gitCommitSha 缺失时不进 hash（V1 向后兼容·与 T-008 修复前 hash 一致）', () => {
  // 两个 FEC 都不提供 gitCommitSha → hash 须相同（V1 兼容）
  const fec1 = makeValidFec();
  const fec2 = makeValidFec();
  assert.equal(computeFecHash(fec1), computeFecHash(fec2));
});

test('T-008 computeFecHash: gitCommitSha 提供时进 hash（篡改 sha → hash 变）', () => {
  const fecWithoutSha = makeValidFec();
  const fecWithShaA = makeFecWithGitSha({ gitSha: SHA1_40 });
  const fecWithShaB = makeFecWithGitSha({ gitSha: SHA1_40_B });

  // 提供 sha vs 不提供 sha → hash 须不同
  assert.notEqual(
    computeFecHash(fecWithoutSha),
    computeFecHash(fecWithShaA),
    '提供 gitCommitSha 须改变 hash（hash 包含此字段）',
  );

  // 不同 sha → hash 须不同
  assert.notEqual(
    computeFecHash(fecWithShaA),
    computeFecHash(fecWithShaB),
    '不同 gitCommitSha 须产不同 hash',
  );
});

test('T-008 computeFecHash: 相同 gitCommitSha → 相同 hash（确定性）', () => {
  const fec1 = makeFecWithGitSha({ gitSha: SHA1_40 });
  const fec2 = makeFecWithGitSha({ gitSha: SHA1_40 });
  assert.equal(computeFecHash(fec1), computeFecHash(fec2));
});

// ===== orchestrator 集成 =====

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-24T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const falsificationSpec: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const thresholdSpec: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function buildFecArgs(fec: FecContractV2) {
  const evidences: EvidenceRecord[] = [
    {
      claim: 'measured accuracy is 0.91',
      metricValue: 0.91,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor,
    },
  ];

  return {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: sourceAnchor.gitCommitSha,
        isoTimestamp: sourceAnchor.isoTimestamp,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    },
    callAudit: {
      requestPayload: '{"prompt":"claim"}',
      responsePayload: '{"claim":"accuracy"}',
      finishReason: 'stop',
      usageTokensTotal: 12,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claim: 'accuracy should be at least 0.85' },
    sourceAnchor,
    claim: 'accuracy should be at least 0.85',
    falsificationSpec,
    thresholdSpec,
    evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: fec },
  } as const;
}

test('T-008 orchestrator: V1 默认（不 opt-in）→ fecAppendClaim 不受影响（向后兼容）', () => {
  const db = openDb();
  try {
    const fec = makeValidFec(); // 不 opt-in
    const result = fecAppendClaim(db, buildFecArgs(fec));

    // V1 默认下 fecGate.allowed=true（#11 跳过）
    assert.equal(result.fecGate.allowed, true);
    assert.equal(result.fecGate.ciBlocked, false);
    // untestedReason 不应含 GIT_COMMIT_SHA_UNBOUND
    if (result.decision.untestedReason !== null) {
      assert.ok(
        !result.decision.untestedReason.includes('GIT_COMMIT_SHA_UNBOUND'),
        'V1 默认下 untestedReason 不应含 GIT_COMMIT_SHA_UNBOUND',
      );
    }
  } finally {
    db.close();
  }
});

test('T-008 orchestrator: opt-in + freeze.gitCommitSha 缺失 → fecAppendClaim fail-closed UNTESTED（GIT_COMMIT_SHA_UNBOUND）', () => {
  const db = openDb();
  try {
    const fec = makeFecWithGitSha({ requireBinding: true }); // 缺 sha
    const result = fecAppendClaim(db, buildFecArgs(fec));

    // 核心断言 1：fecGate.allowed=false（编译失败）
    assert.equal(result.fecGate.allowed, false, 'opt-in + 缺 sha → fecGate 须阻断');
    assert.equal(result.fecGate.ciBlocked, false, 'GIT_COMMIT_SHA_UNBOUND 是 HARD_FAIL_UNTESTED·非 CI_BLOCK');

    // 核心断言 2：verdict 绝不是 CONFIRMED（fail-closed 阻断）
    assert.notEqual(
      result.decision.verdict,
      'CONFIRMED',
      'T-008 fail-closed: opt-in + 缺 sha 时禁止落 CONFIRMED（自签时间戳可回填）',
    );

    // 核心断言 3：untestedReason 含 GIT_COMMIT_SHA_UNBOUND
    assert.ok(result.decision.untestedReason !== null);
    assert.ok(
      result.decision.untestedReason.includes('GIT_COMMIT_SHA_UNBOUND'),
      `untestedReason 须含 GIT_COMMIT_SHA_UNBOUND·实际: ${result.decision.untestedReason}`,
    );

    // 核心断言 4：verdict_nodes 落库 verdict ≠ CONFIRMED
    assert.notEqual(result.verdictNode.verdict, 'CONFIRMED');
  } finally {
    db.close();
  }
});

test('T-008 orchestrator: opt-in + freeze.gitCommitSha 合法 40-hex → fecAppendClaim 不受影响（合法路径不误伤）', () => {
  const db = openDb();
  try {
    const fec = makeFecWithGitSha({ requireBinding: true, gitSha: SHA1_40 });
    const result = fecAppendClaim(db, buildFecArgs(fec));

    // 合法 sha → fecGate.allowed=true（#11 通过）
    assert.equal(result.fecGate.allowed, true, '合法 40-hex sha1 须通过 #11');
    // untestedReason 不应含 GIT_COMMIT_SHA_UNBOUND
    if (result.decision.untestedReason !== null) {
      assert.ok(
        !result.decision.untestedReason.includes('GIT_COMMIT_SHA_UNBOUND'),
        '合法 sha 时 untestedReason 不应含 GIT_COMMIT_SHA_UNBOUND',
      );
    }
  } finally {
    db.close();
  }
});

test('T-008 orchestrator: opt-in + freeze.gitCommitSha 格式错 → fecAppendClaim fail-closed UNTESTED', () => {
  const db = openDb();
  try {
    const fec = makeFecWithGitSha({ requireBinding: true, gitSha: 'not-a-sha' });
    const result = fecAppendClaim(db, buildFecArgs(fec));

    assert.equal(result.fecGate.allowed, false);
    assert.notEqual(result.decision.verdict, 'CONFIRMED');
    assert.ok(
      result.decision.untestedReason!.includes('GIT_COMMIT_SHA_UNBOUND'),
      '格式错 sha 须触发 GIT_COMMIT_SHA_UNBOUND',
    );
  } finally {
    db.close();
  }
});
