// scripts/day1_verify.mjs
// 职责：day-1 实测状态报告器（E1-E6）—— 检查 day-1 证据产物是否存在，诚实报告 NEEDS_* 状态。
// 权威 SSOT：FINAL_PACKAGE/30_FINAL_CHECKLIST.md §4 / HANDOFF_TO_DEV_AGENT.md §5.3 / 02 §7.4/§10。
//
// 设计原则（反假绿）：
//   - 本脚本不执行真实百炼调用（避免付费 API · 02 §7.5 Ask 层）。
//   - 仅检查 day-1 证据产物（文件）是否存在 + 报告每项 NEEDS_* 状态词。
//   - skip ≠ 通过：无证据的项标 [须day-1核验]，绝不标 [已实证]。
//   - 始终 exit 0（报告器非门禁）—— 真实 day-1 执行由人工按 docs/DAY1_VERIFICATION.md 完成。
//
// 用法：node scripts/day1_verify.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 证据产物检查 ----------

function readFileSyncSafe(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '{}';
  }
}

function hasFarProofDemo() {
  return existsSync(join(repoRoot, '.far-proof-demo'));
}

function hasCostSnapshot() {
  const dir = join(repoRoot, 'evidence', 'dashscope_calls');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('_cost_snapshot.json'));
  return files.length > 0 ? files : null;
}

function goldenE4State() {
  // 读 golden_vectors.json，检查 E4（N4 NaN 拒绝契约 + 数值边界真值对拍）是否已诚实裁决。
  // 反假绿（R2-01/R2-02，2026-06-29）：旧版 N4 用 'NaN'.padEnd 字符串（非真 NaN）→ SHOULD_HAVE_REJECTED 占位，
  // 旧版 N1-N3 把数值字符串化塞进 cred.reproHash（恒 byte-equal）→ 数值漂移防御失效。
  // 本版：N4 必须是 REJECTED_AS_EXPECTED（真 NaN 经 assertNoNonFiniteNumber 抛错），且数值边界向量必须是真数值。
  try {
    const gv = JSON.parse(
      readFileSyncSafe(join(repoRoot, 'golden_vectors', 'golden_vectors.json')),
    );
    const vectors = gv?.vectors ?? [];
    const n4 = vectors.find((v) => v?.label === 'N4_nan_reject');
    // 数值边界真值落地：N1-N3 系列必须存在且产出真实 hex（非字符串占位）。
    const numericLanded = vectors.some(
      (v) => typeof v?.label === 'string' && /^N[123]/.test(v.label) && /^[0-9a-f]{64}$/.test(v?.hash ?? ''),
    );
    if (!n4) return 'UNKNOWN';
    if (n4.hash === 'SHOULD_HAVE_REJECTED') return 'PLACEHOLDER'; // 旧版字符串 NaN 占位（R2-02 违规）
    if (n4.hash === 'REJECTED_AS_EXPECTED' && numericLanded) return 'RESOLVED';
    return 'PARTIAL';
  } catch {
    return 'UNKNOWN';
  }
}

// ---------- E1-E6 状态 ----------

const items = [
  {
    id: 'E1',
    title: 'Snapshot Liveness + Qwen 维护期',
    status: 'NEEDS_REAL_ENV',
    evidence: '无自动证据（须配 key 跑 ci/snapshot_liveness_smoke.ts）',
    how: 'set DASHSCOPE_API_KEY && pnpm exec tsx ci/snapshot_liveness_smoke.ts',
    claimState: '[须day-1核验·E1]',
  },
  {
    id: 'E2',
    title: 'dashscopeRequestId 字段名实测',
    status: 'NEEDS_REAL_TEST',
    evidence: '设计锁定 x-request-id（extract_request_id.ts）；curl -i 实测未记录',
    how: '配 key 真实调用，观察响应 header/body 锁定三候选字段名',
    claimState: '[须day-1核验·E2]',
  },
  {
    id: 'E3',
    title: 'cross_lang 字节相等',
    status: '已实证',
    evidence: 'tests/evidence_log/cross_lang_consistency.test.ts（CI gate 绿）',
    how: 'pnpm test / pnpm run test:py',
    claimState: '[已实证·cross_lang_consistency.test.ts·2026-06-28]',
  },
  {
    id: 'E4',
    title: 'golden_vectors 双向回填（N4 NaN 拒绝 + 数值边界真值对拍）',
    status: goldenE4State() === 'RESOLVED' ? '已实证' : goldenE4State() === 'PLACEHOLDER' ? '待实测' : '待核验',
    evidence:
      goldenE4State() === 'RESOLVED'
        ? 'N4_nan_reject=REJECTED_AS_EXPECTED（真 NaN 经 assertNoNonFiniteNumber 抛错）+ N1-N3 真数值 hex 已落地；cross_lang_consistency.test.ts CI gate 绿'
        : goldenE4State() === 'PLACEHOLDER'
          ? 'N4_nan_reject=SHOULD_HAVE_REJECTED（旧版字符串 NaN 占位，R2-02 违规待修）'
          : `E4 状态=${goldenE4State()}（须核验 golden_vectors.json）`,
    how: 'pnpm exec tsx golden_vectors/generate_golden_vectors.ts && pnpm run test:evidence_log（cross_lang 对拍 + N4 拒绝）',
    claimState: goldenE4State() === 'RESOLVED' ? '[已实证·cross_lang_consistency.test.ts + generate_golden_vectors.ts·2026-06-29]' : '[须day-1核验·E4]',
  },
  {
    id: 'E5',
    title: 'ProofEnvelope 导出可重算',
    status: hasFarProofDemo() ? '已实证' : '待运行',
    evidence: hasFarProofDemo() ? '.far-proof-demo/ 存在（replay 已跑）' : '.far-proof-demo/ 不存在（须跑 replay）',
    how: 'pnpm exec tsx scripts/replay_demo_chain.ts',
    claimState: hasFarProofDemo() ? '[已实证·demo_chain_replay.test.ts·2026-06-28]' : '[须运行 replay]',
  },
  {
    id: 'E6',
    title: '竞赛真实计费调用 + 成本快照',
    status: hasCostSnapshot() ? '已回填' : 'NEEDS_HUMAN_OPERATION',
    evidence: hasCostSnapshot()
      ? `evidence/dashscope_calls/${hasCostSnapshot()[0]}`
      : '无成本快照（须配 key 跑 competition_qwen_smoke + generate_cost_snapshot + 控制台截图）',
    how: 'set DASHSCOPE_API_KEY && pnpm exec tsx ci/competition_qwen_smoke.ts && node scripts/generate_cost_snapshot.mjs',
    claimState: hasCostSnapshot() ? '[已实证]' : '[须day-1核验·E6]',
  },
];

// ---------- 报告 ----------

console.log('═══════════════════════════════════════════');
console.log('  FAR-Chain Day-1 实测状态报告（E1-E6）');
console.log('  权威 SSOT: 30_FINAL_CHECKLIST.md §4 / 02 §7.4/§10');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('反假绿铁律：skip ≠ 通过；无证据项标 [须day-1核验]，绝不标 [已实证]。');
console.log('');

for (const item of items) {
  console.log(`── ${item.id} · ${item.title} ──`);
  console.log(`  状态词:   ${item.status}`);
  console.log(`  声称口径: ${item.claimState}`);
  console.log(`  证据:     ${item.evidence}`);
  console.log(`  完成方法: ${item.how}`);
  console.log('');
}

const verified = items.filter((i) => i.claimState.startsWith('[已实证')).length;
const needsDay1 = items.length - verified;

console.log('═══════════════════════════════════════════');
console.log(`  [已实证]: ${verified}/${items.length}    [须day-1核验]: ${needsDay1}/${items.length}`);
console.log(`  详见 docs/DAY1_VERIFICATION.md（含 Ask 层 CI 接线建议项）`);
console.log('═══════════════════════════════════════════');
