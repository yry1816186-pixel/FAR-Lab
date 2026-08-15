/**
 * 跨语言 byte-equal 对拍：TS computeProofHashV2 ↔ Python repro/far_chain_repro/proof_hash.py。
 *
 * RULE-PE-010 independently_recomputable 的独立路径验证——ProofEnvelope 必须可被一条
 * 不依赖项目 CI 的路径（Python）从原始 claim 重算到 proofHash 匹配。
 *
 * Authority: RULE-PE-010 + APPENDIX_C §1.9（TS/Python 等价）。
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValidEnvelopeV2Core } from './fixtures.ts';
import {
  computeProofHashV2,
  sealProofEnvelopeV2,
  verifyProofHashV2,
} from '../../../src/proof_envelope/v2/index.ts';

const REPRO_DIR = resolve(process.cwd(), 'repro', 'far_chain_repro');
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

/** 调 Python compute_proof_hash_v2（stdin JSON → stdout 64 hex）。参数 unknown：JSON.stringify 接受任意值。 */
function pythonComputeProofHash(envelopeWithoutProofHash: unknown): string {
  const pyCode = [
    'import sys, json',
    `sys.path.insert(0, ${JSON.stringify(REPRO_DIR)})`,
    'from proof_hash import compute_proof_hash_v2',
    'env = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
    'print(compute_proof_hash_v2(env))',
  ].join('\n');
  return execFileSync(PYTHON_CMD, ['-c', pyCode], {
    encoding: 'utf8',
    input: JSON.stringify(envelopeWithoutProofHash),
  }).trim();
}

/** 调 Python verify_proof_hash_v2（stdin 完整 envelope → stdout True/False）。参数 unknown：JSON.stringify 接受任意值。 */
function pythonVerifyProofHash(envelope: unknown): boolean {
  const pyCode = [
    'import sys, json',
    `sys.path.insert(0, ${JSON.stringify(REPRO_DIR)})`,
    'from proof_hash import verify_proof_hash_v2',
    'env = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
    'print(verify_proof_hash_v2(env))',
  ].join('\n');
  return execFileSync(PYTHON_CMD, ['-c', pyCode], {
    encoding: 'utf8',
    input: JSON.stringify(envelope),
  }).trim() === 'True';
}

test('RULE-PE-010 cross-lang byte-equal: TS computeProofHashV2 === Python compute_proof_hash_v2', () => {
  const core = makeValidEnvelopeV2Core();
  const tsHash = computeProofHashV2(core);
  const pyHash = pythonComputeProofHash(core);
  assert.equal(pyHash, tsHash, 'TS proofHash 必须与 Python 重算结果 byte-equal');
  assert.match(tsHash, /^[0-9a-f]{64}$/, 'proofHash 必须是 64 位小写 hex');
});

test('cross-lang byte-equal: full seal path (sealProofEnvelopeV2 → Python 重算)', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const { proofHash, ...rest } = envelope;
  const pyHash = pythonComputeProofHash(rest);
  assert.equal(pyHash, proofHash, 'seal 后 envelope.proofHash 必须与 Python 重算 byte-equal');
});

test('cross-lang byte-equal: verifyProofHashV2 (TS) === verify_proof_hash_v2 (Python) — 合法', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  assert.equal(verifyProofHashV2(envelope), 'valid');
  assert.equal(pythonVerifyProofHash(envelope), true);
});

test('cross-lang byte-equal: tamper verdictTrace → 两端 verify 都 detect failure', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const tampered = {
    ...envelope,
    verdictTrace: { ...envelope.verdictTrace, verdict: 'REFUTED' as const },
  };
  assert.notEqual(verifyProofHashV2(tampered), 'valid');
  assert.equal(pythonVerifyProofHash(tampered), false);
});

test('cross-lang byte-equal: variant envelopes（不同 VC 字段 → 不同 hash 且各自两端一致）', () => {
  const base = makeValidEnvelopeV2Core();
  const variants = [
    base,
    makeValidEnvelopeV2Core({ ledgerRoot: '0'.repeat(64) }),
    makeValidEnvelopeV2Core({
      verdictTrace: {
        ...base.verdictTrace,
        verdict: 'REFUTED',
        decisiveRuleId: 'R6_PRIMARY_TEST_REFUTES',
        reasonCodes: ['R6_PRIMARY_TEST_REFUTES'],
      },
    }),
  ];
  const hashes = new Set<string>();
  for (const v of variants) {
    const ts = computeProofHashV2(v);
    const py = pythonComputeProofHash(v);
    assert.equal(py, ts, 'variant hash 两端必须一致');
    hashes.add(ts);
  }
  assert.equal(hashes.size, variants.length, '不同 envelope 必须产生不同 proofHash');
});

test('cross-lang byte-equal: antiTheaterReport 含 optional 字段（D9/R1·_filter_anti_theater_report 条件包含）', () => {
  // 验证 Python _filter_anti_theater_report 对 3 个 optional 字段（antiTheaterScore/canSealConfirmed/
  // verdictConstraint）的条件包含与 TS byte-equal。关键陷阱：canSealConfirmed=false（falsy）必须被包含
  // ——Python 端须用 `is not None` 而非真值判断（镜像 compute_fec_hash:102），否则误丢 False → hash 分裂。
  const populated = makeValidEnvelopeV2Core({
    antiTheaterReport: {
      findings: [
        {
          findingId: 'AT-POSTHOC-THRESHOLD-CONTENT_HASH',
          attackKind: 'post-hoc-threshold',
          outcome: 'FAIL',
          hasFail: true,
          evidenceRef: 'call_records.seq=42',
          message: 'executed threshold hash ≠ frozen thresholdHash',
        },
      ],
      hasFail: true,
      failCount: 1,
      warnCount: 0,
      llmOverrideRejected: true,
      antiTheaterScore: 55,
      canSealConfirmed: false,
      verdictConstraint: {
        forcedVerdict: 'UNTESTED',
        blockSeal: true,
        reasonCodes: ['AT_POSTHOC_THRESHOLD_FORCED'],
      },
    },
  });
  const tsHash = computeProofHashV2(populated);
  const pyHash = pythonComputeProofHash(populated);
  assert.equal(pyHash, tsHash, '含 optional 字段的 antiTheaterReport 两端必须 byte-equal');

  // 反向验证：与空 antiTheaterReport 的 base envelope 不同（optional 字段改变 proofHash·D9 结构变化自动反映）。
  const baseHash = computeProofHashV2(makeValidEnvelopeV2Core());
  assert.notEqual(tsHash, baseHash, 'populated antiTheaterReport 必须改变 proofHash');
});

// ===== A3 次要增强：V2 proofHash Unicode/NFC edge case（F-4-007 的 V2 层防线）=====

/** override claim.naturalLanguage（保留其余 claim 字段）。 */
function withNaturalLanguage(text: string): ReturnType<typeof makeValidEnvelopeV2Core> {
  const base = makeValidEnvelopeV2Core();
  return makeValidEnvelopeV2Core({
    claim: { ...base.claim, naturalLanguage: text },
  });
}

test('cross-lang byte-equal: NFC/NFD 等价形式归一化后同 hash（é = e + U+0301）', () => {
  // NFD（e + combining acute U+0301）与 NFC（é 单字符）是 Unicode 等价表示——normalizeClaim
  // 的 NFC 归一化必须使两者 hash 相同（否则跨语言/跨平台 hash 分裂·F-4-007）。
  const nfd = withNaturalLanguage('cafe\u0301: model achieves RMSE \u2264 0.5');
  const nfc = withNaturalLanguage('café: model achieves RMSE ≤ 0.5');
  const tsNfd = computeProofHashV2(nfd);
  const tsNfc = computeProofHashV2(nfc);
  assert.equal(tsNfd, tsNfc, 'NFC 归一化后 NFD/NFC 等价形式必须同 hash');
  const pyNfd = pythonComputeProofHash(nfd);
  assert.equal(pyNfd, tsNfd, 'Python 端必须与 TS 端 byte-equal（NFD claim）');
});

test('cross-lang byte-equal: 中文 + 组合字符 claim 双端一致', () => {
  // 中文 + CJK 兼容字符 + 组合变音符号：两端 canonical_json 必须 byte-equal。
  const cn = withNaturalLanguage('模型 M 在数据集 D 上达到 RMSE ≤ 0.5（\u4e2d\u6587测试）');
  const tsHash = computeProofHashV2(cn);
  const pyHash = pythonComputeProofHash(cn);
  assert.equal(pyHash, tsHash, '中文 claim 两端必须 byte-equal');
  assert.match(tsHash, /^[0-9a-f]{64}$/);
});

test('cross-lang byte-equal: normalizeWhitespace 折叠多空格/tab + CRLF 双端一致', () => {
  // normalizeWhitespace 语义：\r\n→\n、\r→\n、[ \t]+→单空格、trim（\n 保留·不折叠成空格）。
  // 场景 A：纯空格/tab 折叠（不含换行）→ 与 clean 文本同 hash。
  const messySpaces = withNaturalLanguage('  model\tM  achieves  RMSE  ≤ 0.5  ');
  const clean = withNaturalLanguage('model M achieves RMSE ≤ 0.5');
  assert.equal(
    computeProofHashV2(messySpaces),
    computeProofHashV2(clean),
    '空格/tab 折叠后须与 clean 文本同 hash（normalizeClaim 生效）',
  );
  // 场景 B：CRLF/CR 归一化为 \n——两端 byte-equal（不断言与 clean 相等·\n 保留是设计语义）。
  const messyCrlf = withNaturalLanguage('model M achieves RMSE\r\n≤ 0.5\r');
  const tsHash = computeProofHashV2(messyCrlf);
  const pyHash = pythonComputeProofHash(messyCrlf);
  assert.equal(pyHash, tsHash, 'CRLF/CR 归一化后两端必须 byte-equal');
});

test('cross-lang byte-equal: 转义字符（引号/反斜杠/控制符）双端一致', () => {
  // JSON 转义敏感字符：canonical_json 的转义规则两端必须一致。
  const escaped = withNaturalLanguage('claim "quoted" with \\ backslash and \u0007 bell');
  const tsHash = computeProofHashV2(escaped);
  const pyHash = pythonComputeProofHash(escaped);
  assert.equal(pyHash, tsHash, '转义字符两端必须 byte-equal');
});
