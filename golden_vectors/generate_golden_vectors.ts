/**
 * golden_vectors generator (honest · R2-02 fixed 2026-06-29): produces TS-side hashes.
 *
 * Authority: 23 §3 / E4 (day-1 golden_vectors 双向回填).
 *
 * 反假绿修复（R2-01/R2-02，2026-06-29）：
 *   旧版用 canonicalHashVerified（T3 白名单仅吃 4 个 string 字段）测数值边界，
 *   把数值【字符串化塞进 cred.reproHash】（如 '1.0_float_test'.padEnd(64,'0')），
 *   → 字符串恒 byte-equal，数值序列化漂移防御完全失效 = R2-02 违规。
 *   旧版 N4 用 'NaN'.padEnd 字符串（非真 NaN 数值）→ 产 SHOULD_HAVE_REJECTED 占位，从未真测拒绝。
 *
 * 本版诚实修复：
 *   - 数值边界向量（N1-N3）走 hashCanonicalJson（通用 canonical，支持任意 JSON）用【真数值】，
 *     与 src/evidence_log/golden_vectors.ts NUMERIC_GREEN_VECTORS 镜像（SSOT）。
 *   - N4 用【真 NaN 数值】走 hashCanonicalJson，验证 assertNoNonFiniteNumber 抛错 → REJECTED_AS_EXPECTED。
 *   - 常规字符串向量仍走 canonicalHashVerified（T3 白名单 4 字段）。
 *
 * 禁 Math.random()/Date.now() 进确定性路径。generatedAt 用固定常量。
 * day-0 cross-lang PoC 真值证据：见 tests/evidence_log/cross_lang_consistency.test.ts
 *   （TS hashCanonicalJson === Python hash_canonical_json，逐向量 spawnSync 对拍，CI gate 绿）。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHashVerified, hashCanonicalJson } from '../src/evidence_log/hasher.ts';
import { GENESIS_PREV_HASH } from '../src/evidence_log/types.ts';

const GOLDEN_DIR = fileURLToPath(new URL('.', import.meta.url));

// ── 常规字符串向量：走 canonicalHashVerified（T3 白名单 4 字段）──
interface StringVector {
  readonly kind: 'string';
  readonly label: string;
  readonly input: {
    readonly stageId: string;
    readonly cred: {
      readonly modelId: string;
      readonly dashscopeRequestId: string | null;
      readonly reproHash: string;
      readonly gitCommitSha: string;
      readonly isoTimestamp: string;
    };
    readonly payloadKind: string;
    readonly prevHash: string;
  };
}

// ── 数值边界向量：走 hashCanonicalJson（通用 canonical，真数值，与 src NUMERIC_* SSOT 镜像）──
interface NumericVector {
  readonly kind: 'numeric';
  readonly label: string;
  readonly obj: Record<string, unknown>;
  readonly expectReject?: boolean; // N4 真 NaN 期望抛错
  readonly note: string;
}

const baseCred = {
  modelId: 'offline-replay-fixture',
  dashscopeRequestId: null,
  reproHash: 'a'.repeat(64),
  gitCommitSha: 'b'.repeat(40),
  isoTimestamp: '2026-06-27T00:00:00.000Z',
};

const stringVectors: StringVector[] = [
  {
    kind: 'string',
    label: 'simple_hypothesis',
    input: {
      stageId: 'stage3_hypothesis',
      cred: baseCred,
      payloadKind: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
  },
  {
    kind: 'string',
    label: 'unicode_chinese',
    input: {
      stageId: 'stage1_understanding',
      cred: { ...baseCred, reproHash: '中文测试'.padEnd(64, '0') },
      payloadKind: 'understanding',
      prevHash: GENESIS_PREV_HASH,
    },
  },
  {
    kind: 'string',
    label: 'full_fields_integration',
    input: {
      stageId: 'stage2_integration',
      cred: {
        modelId: 'qwen3.7-max-2026-05-20',
        dashscopeRequestId: 'req-test-golden-0001',
        reproHash: 'f'.repeat(64),
        gitCommitSha: 'c'.repeat(40),
        isoTimestamp: '2026-06-28T12:00:00.000Z',
      },
      payloadKind: 'integration',
      prevHash: 'e'.repeat(64),
    },
  },
  {
    kind: 'string',
    label: 'baseline_exempt_tag',
    input: {
      stageId: 'stage_narrative',
      cred: baseCred,
      payloadKind: 'meta',
      prevHash: GENESIS_PREV_HASH,
    },
  },
];

const numericVectors: NumericVector[] = [
  {
    kind: 'numeric',
    label: 'N1_float_arith',
    obj: { n: 0.1 + 0.2 },
    note: 'IEEE754 浮点算术，TS===Py byte-equal（真绿）',
  },
  {
    kind: 'numeric',
    label: 'N2_sci_1e21',
    obj: { n: 1e21 },
    note: '大科学计数，两边 "1e+21" 格式一致（真绿）',
  },
  {
    kind: 'numeric',
    label: 'N3_int_42',
    obj: { n: 42 },
    note: '整数，byte-equal（真绿）',
  },
  {
    // 2**53+1 首个 IEEE754 无法精确表示的整数。JS 值规约在序列化前完成，经 stdin Python 得同样值，byte-equal。
    // 用表达式而非字面量以避免 no-loss-of-precision lint。
    kind: 'numeric',
    label: 'N3b_bigint_gt_2p53',
    obj: { n: 2 ** 53 + 1 },
    note: 'JS 值规约 2**53+1→...992，经 stdin 双向 byte-equal（真绿，归 GREEN）',
  },
  {
    // N4 真 NaN 数值：assertNoNonFiniteNumber 应抛错（hashCanonicalJson 路径）。
    // 旧版用 'NaN'.padEnd 字符串非真 NaN → SHOULD_HAVE_REJECTED 占位；本版用真 NaN 验证拒绝契约。
    kind: 'numeric',
    label: 'N4_nan_reject',
    obj: { n: Number.NaN },
    expectReject: true,
    note: '真 NaN 数值：assertNoNonFiniteNumber 抛 /NaN and Infinity/ → REJECTED_AS_EXPECTED',
  },
];

function generateGoldenVectors(): void {
  mkdirSync(GOLDEN_DIR, { recursive: true });

  const results: Array<{ label: string; hash: string; note?: string }> = [];

  for (const v of stringVectors) {
    results.push({ label: v.label, hash: canonicalHashVerified(v.input) });
  }

  for (const v of numericVectors) {
    let threw = false;
    try {
      hashCanonicalJson(v.obj);
    } catch {
      threw = true;
    }
    if (v.expectReject) {
      results.push({
        label: v.label,
        hash: threw ? 'REJECTED_AS_EXPECTED' : 'SHOULD_HAVE_REJECTED',
        note: v.note,
      });
    } else {
      // 非拒绝向量若意外抛错，标记异常而非静默吞（反假绿）。
      if (threw) {
        throw new Error(`numeric vector ${v.label} unexpectedly rejected: ${v.note}`);
      }
      results.push({ label: v.label, hash: hashCanonicalJson(v.obj), note: v.note });
    }
  }

  const goldenFile = {
    generatedAt: '2026-06-29T00:00:00.000Z',
    generator: 'deterministic_script',
    source: 'golden_vectors/generate_golden_vectors.ts',
    // SSOT：数值边界真值对拍见 src/evidence_log/golden_vectors.ts NUMERIC_* + cross_lang_consistency.test.ts
    authority: '09 §3 / 23 §2.3 / HANDOFF §3.3',
    vectors: results,
  };

  writeFileSync(join(GOLDEN_DIR, 'golden_vectors.json'), JSON.stringify(goldenFile, null, 2), 'utf8');
  console.log(`Generated ${results.length} golden vectors (honest · R2-02 fixed) → golden_vectors/golden_vectors.json`);
}

generateGoldenVectors();
