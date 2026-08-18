// tests/gates/oss_t1_gates.test.ts
// T1 OSS 五项（CONTRIB/GOVERNANCE/INTEROP/MAINTAIN/TRANSPARENCY-001）：真实资产断言 +
// SLA/bus-factor/发布清单纯函数负向用例。幽灵根必须全红。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONTRIBUTOR_SLA,
  busFactorAssessment,
  checkContributorFunnel,
  checkGovernance,
  checkInterop,
  checkMaintainability,
  checkTransparency,
  ossT1Gate,
  publicationEntryValid,
  slaVerdict,
  tierFromTemplate,
} from '../../src/gates/oss_t1_gates.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PHANTOM = 'C:/phantom-root-oss';

// ---------------------------------------------------------------------------
// OSS-CONTRIB-001
// ---------------------------------------------------------------------------

test('OSS-CONTRIB-001: 贡献漏斗真实面（模板≥3/CONTRIBUTING 全锚点/PR 模板/CODEOWNERS/env 边界）', () => {
  const r = checkContributorFunnel(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('templates')), '模板计数证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('doctor')), 'doctor 环境自诊断证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('SLA')), 'SLA 政策证据行缺失');
  assert.ok(r.declaredGaps.length >= 1, '外部真实贡献者响应时长不可离线验证——须显式声明');
  assert.equal(checkContributorFunnel(PHANTOM).ok, false);
});

test('OSS-CONTRIB-001 机制: 模板→SLA 档位映射 + 首响 SLA 判定（按时/迟到/未答/超时/坏日期 fail-closed）', () => {
  assert.equal(tierFromTemplate('bug_report.yml'), 'bug');
  assert.equal(tierFromTemplate('reproducibility_failure.yml'), 'reproducibility-failure');
  assert.equal(tierFromTemplate('feature_request.yml'), 'feature');
  assert.equal(tierFromTemplate('documentation.yml'), 'documentation');
  assert.equal(tierFromTemplate('anything-else.yml'), 'other');
  // 专项模板（可复现性失败）必须比泛型档更紧
  assert.ok(CONTRIBUTOR_SLA['reproducibility-failure'] < CONTRIBUTOR_SLA.other);

  const opened = '2026-08-01T00:00:00Z';
  const now = new Date('2026-08-05T00:00:00Z');
  // 按时响应（bug 档 7 天内）
  assert.equal(slaVerdict(opened, '2026-08-03T00:00:00Z', 'bug', now).state, 'responded-within');
  // 迟到响应
  assert.equal(slaVerdict(opened, '2026-08-20T00:00:00Z', 'bug', now).state, 'responded-late');
  // 未响应但在窗口内
  assert.equal(slaVerdict(opened, null, 'bug', now).state, 'awaiting-within');
  // 未响应且已超窗
  const later = new Date('2026-08-20T00:00:00Z');
  assert.equal(slaVerdict(opened, null, 'bug', later).state, 'overdue');
  // 坏日期 fail-closed（宁可误报 overdue 也不静默放行）
  assert.equal(slaVerdict('not-a-date', '2026-08-03T00:00:00Z', 'bug', now).state, 'overdue');
  assert.equal(slaVerdict(opened, 'garbage', 'bug', now).state, 'overdue');
});

// ---------------------------------------------------------------------------
// OSS-GOVERNANCE-001
// ---------------------------------------------------------------------------

test('OSS-GOVERNANCE-001: 治理面（角色/继任/不活跃/发布权/安全响应锚点 + bus-factor 诚实声明）', () => {
  const r = checkGovernance(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('Bus factor')), 'bus-factor 诚实声明证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('Succession')), '继任条款证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('Inactivity')), '不活跃政策证据行缺失');
  assert.equal(checkGovernance(PHANTOM).ok, false);
});

test('OSS-GOVERNANCE-001 机制: bus-factor 风险评估（1 人 + 无继任 = 过度声明检出）', () => {
  const critical = busFactorAssessment(1, false);
  assert.equal(critical.busFactor, 1);
  assert.equal(critical.risk, 'critical');
  assert.equal(critical.overClaim, true, '单维护者且无继任计划却声称治理成熟 = 过度声明');
  const mitigated = busFactorAssessment(1, true);
  assert.equal(mitigated.risk, 'critical');
  assert.equal(mitigated.overClaim, false, '有继任计划的 bus-factor=1 是诚实可接受态');
  assert.equal(busFactorAssessment(3, true).risk, 'ok');
});

// ---------------------------------------------------------------------------
// OSS-INTEROP-001
// ---------------------------------------------------------------------------

test('OSS-INTEROP-001: 适配器层隔离（≥3 适配器/零内核 import/格式校验 fail-closed/不称无损）', () => {
  const r = checkInterop(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('kernel imports=0')), '内核隔离证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('bibtex|csl-json')), '引用导出格式校验证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('lossless')), '无损声明检查证据行缺失');
  assert.equal(checkInterop(PHANTOM).ok, false);
});

// ---------------------------------------------------------------------------
// OSS-MAINTAIN-001
// ---------------------------------------------------------------------------

test('OSS-MAINTAIN-001: 可维护性自动化（复杂度预算/依赖方向 fitness/零警告 lint/CODEOWNERS/迁移面）', () => {
  const r = checkMaintainability(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('max-warnings 0')), '零警告 lint 证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('complexity')), '复杂度预算证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('dependency')), '依赖方向 fitness 证据行缺失');
  assert.equal(checkMaintainability(PHANTOM).ok, false);
});

// ---------------------------------------------------------------------------
// OSS-TRANSPARENCY-001
// ---------------------------------------------------------------------------

test('OSS-TRANSPARENCY-001: 发布清单（公开资产在场/私有资产带具体理由且确在 gitignore）', () => {
  const r = checkTransparency(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('public')), '公开资产证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('private-with-reason')), '私有资产理由证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('gitignore')), 'gitignore 一致性证据行缺失');
  assert.equal(checkTransparency(PHANTOM).ok, false);
});

test('OSS-TRANSPARENCY-001 机制: 私有条目理由审查（空理由/仅 internal 拒绝）', () => {
  assert.equal(publicationEntryValid({ asset: '.far/', visibility: 'public' }), true);
  assert.equal(publicationEntryValid({ asset: '.far/', visibility: 'private-with-reason', reason: '' }), false);
  assert.equal(publicationEntryValid({ asset: '.far/', visibility: 'private-with-reason', reason: 'internal' }), false, '仅以内部为由不成立');
  assert.equal(publicationEntryValid({ asset: '.far/', visibility: 'private-with-reason', reason: '内部' }), false);
  assert.equal(
    publicationEntryValid({ asset: '.far-design/', visibility: 'private-with-reason', reason: '盲区登记含未公开攻击面（安全风险依据）' }),
    true,
  );
  assert.equal(publicationEntryValid({ asset: 'x', visibility: 'unknown-mode' as 'public' }), false, '未知 visibility 档拒');
});

// ---------------------------------------------------------------------------
// 聚合器
// ---------------------------------------------------------------------------

test('ossT1Gate: 五项聚合一处；幽灵根整体 FAIL', () => {
  const gate = ossT1Gate(REPO_ROOT);
  assert.equal(gate.checks.length, 5);
  assert.equal(gate.pass, true, gate.checks.filter((c) => !c.ok).map((c) => `${c.requirement}: ${c.problems.join('; ')}`).join('\n'));
  assert.equal(ossT1Gate(PHANTOM).pass, false);
});
