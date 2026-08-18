// tests/security/security_response.test.ts
// OSS-SECURITY-001：安全响应流程——policy SSOT / advisory 渲染 / tabletop 状态机演练
// （SLA 违约检出·非法转移检出）/ SECURITY.md 资产存在性。真实仓库资产验证 +
// 合成时间线验证判别力。

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ACK_SLA_HOURS,
  FIX_TARGET_HOURS,
  SECURITY_POLICY,
  checkSecurityPolicyAssets,
  renderAdvisory,
  runTabletopDrill,
  type AdvisoryInput,
  type TabletopTimeline,
} from '../../src/security/security_response.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// policy SSOT
// ---------------------------------------------------------------------------

test('OSS-SECURITY-001: SECURITY_POLICY 有私密报告渠道/supported versions/CVE 策略/credit 政策', () => {
  assert.ok(SECURITY_POLICY.contactChannels.length >= 2, 'at least primary + fallback channel');
  const primary = SECURITY_POLICY.contactChannels.find((c) => c.primary);
  assert.ok(primary, 'primary channel designated');
  assert.match(primary?.route ?? '', /security\/advisories|SECURITY\.md/, 'routes via GitHub private advisory');
  const privateFirst = SECURITY_POLICY.contactChannels.every(
    (c) => c.private !== false,
  );
  assert.ok(privateFirst, 'all channels are private (no public issues)');
  assert.ok(SECURITY_POLICY.supportedVersions.length >= 1);
  assert.ok(SECURITY_POLICY.cvePolicy.length > 20, 'CVE/公告策略成文');
  assert.ok(SECURITY_POLICY.creditPolicy.length > 10, 'credit 政策成文');
  assert.ok(SECURITY_POLICY.embargoPolicy.length > 10, 'embargo 政策成文');
  assert.equal(ACK_SLA_HOURS, 24, 'ack SLA 24h per constitution');
  for (const sev of ['critical', 'high', 'medium', 'low'] as const) {
    assert.ok(FIX_TARGET_HOURS[sev] > 0, `fix target defined for ${sev}`);
  }
  // 严重度修复目标单调：critical ≤ high ≤ medium ≤ low。
  assert.ok(FIX_TARGET_HOURS.critical <= FIX_TARGET_HOURS.high);
  assert.ok(FIX_TARGET_HOURS.high <= FIX_TARGET_HOURS.medium);
  assert.ok(FIX_TARGET_HOURS.medium <= FIX_TARGET_HOURS.low);
});

// ---------------------------------------------------------------------------
// advisory 渲染
// ---------------------------------------------------------------------------

function sampleAdvisory(): AdvisoryInput {
  return {
    advisoryId: 'FAR-SEC-2026-001',
    title: 'Proof bundle signature verification bypass',
    severity: 'high',
    affectedVersions: ['>=0.9.0 <1.0.0'],
    description: 'Simulated advisory: crafted bundle envelope could skip chain re-verification.',
    receivedAt: '2026-08-10T08:00:00.000Z',
    releasedAt: '2026-08-12T10:00:00.000Z',
    embargoUntil: '2026-08-14T10:00:00.000Z',
    reporterCredit: { name: 'external-researcher', consented: true },
    fixCommit: 'abc1234',
    verificationSteps: [
      'far verify <bundle> exits non-zero on tampered envelope',
      'node --test tests/far_proof/integrity_tamper.test.ts passes',
    ],
  };
}

test('OSS-SECURITY-001: renderAdvisory 产出结构化公告（版本/严重度/embargo/credit/验证步骤）', () => {
  const a = renderAdvisory(sampleAdvisory());
  assert.equal(a.advisoryId, 'FAR-SEC-2026-001');
  assert.equal(a.severity, 'high');
  assert.deepEqual(a.affectedVersions, ['>=0.9.0 <1.0.0']);
  assert.equal(a.embargoUntil, '2026-08-14T10:00:00.000Z');
  assert.equal(a.credits, 'external-researcher');
  assert.ok(a.verificationSteps.length >= 2);
  assert.ok(a.summary.length > 0);
  assert.ok(a.published, 'advisory is published after release');
});

test('OSS-SECURITY-001: 确定性——同输入两次渲染字节相同（无墙钟/随机）', () => {
  assert.equal(JSON.stringify(renderAdvisory(sampleAdvisory())), JSON.stringify(renderAdvisory(sampleAdvisory())));
});

test('OSS-SECURITY-001 负例: embargo 早于修复发布 → 拒绝渲染（公开细节早于 embargo 违规）', () => {
  const bad: AdvisoryInput = {
    ...sampleAdvisory(),
    embargoUntil: '2026-08-11T00:00:00.000Z', // < releasedAt
  };
  assert.throws(() => renderAdvisory(bad), /embargo/);
});

test('OSS-SECURITY-001 负例: 未知严重度 / 空受影响版本 → 拒绝渲染', () => {
  assert.throws(
    () => renderAdvisory({ ...sampleAdvisory(), severity: 'catastrophic' as AdvisoryInput['severity'] }),
    /severity/,
  );
  assert.throws(() => renderAdvisory({ ...sampleAdvisory(), affectedVersions: [] }), /affected/);
});

test('OSS-SECURITY-001 边界: reporter 未同意署名 → credits 匿名', () => {
  const a = renderAdvisory({ ...sampleAdvisory(), reporterCredit: { name: 'shy', consented: false } });
  assert.match(a.credits, /anonymous/i);
});

// ---------------------------------------------------------------------------
// tabletop 状态机演练
// ---------------------------------------------------------------------------

function happyTimeline(): TabletopTimeline {
  return {
    receivedAt: '2026-08-10T08:00:00.000Z',
    acknowledgedAt: '2026-08-10T20:00:00.000Z', // +12h < 24h
    triagedAt: '2026-08-11T08:00:00.000Z',
    embargoedAt: '2026-08-11T09:00:00.000Z',
    fixingAt: '2026-08-11T10:00:00.000Z',
    releasedAt: '2026-08-13T08:00:00.000Z', // +72h = critical target（边界内）
    verifiedAt: '2026-08-13T12:00:00.000Z',
    severity: 'critical',
    reportId: 'TT-001',
  };
}

test('OSS-SECURITY-001: happy path——七步状态机全序通过、每步带时间戳、零 SLA 违约', () => {
  const r = runTabletopDrill(happyTimeline());
  assert.equal(r.outcome, 'pass');
  assert.equal(r.violations.length, 0, `violations: ${JSON.stringify(r.violations)}`);
  assert.deepEqual(
    r.steps.map((s) => s.state),
    ['received', 'acknowledged', 'triaged', 'embargoed', 'fixing', 'released', 'verified'],
  );
  for (const s of r.steps) {
    assert.ok(s.at.length > 0, `${s.state}: timestamped`);
    assert.ok(s.elapsedHoursFromReceipt >= 0);
  }
  assert.equal(r.drillId.length > 0, true);
});

test('OSS-SECURITY-001: ack SLA 违约检出——+30h 确认超 24h 上限', () => {
  const r = runTabletopDrill({
    ...happyTimeline(),
    acknowledgedAt: '2026-08-11T14:00:00.000Z', // +30h
    triagedAt: '2026-08-11T15:00:00.000Z',
    embargoedAt: '2026-08-11T16:00:00.000Z',
    fixingAt: '2026-08-11T17:00:00.000Z',
  });
  assert.equal(r.outcome, 'pass-with-violations');
  const ack = r.violations.find((v) => v.stage === 'acknowledgement');
  assert.ok(ack, 'ack SLA violation recorded');
  assert.equal(ack?.slaHours, 24);
  assert.ok((ack?.actualHours ?? 0) > 24);
});

test('OSS-SECURITY-001: 修复目标 SLA——critical 超 72h 检出', () => {
  const r = runTabletopDrill({
    ...happyTimeline(),
    severity: 'critical',
    releasedAt: '2026-08-14T09:00:00.000Z', // 接收后 ~97h > 72h
    verifiedAt: '2026-08-14T10:00:00.000Z',
  });
  const fix = r.violations.find((v) => v.stage === 'fix-release');
  assert.ok(fix, 'critical fix-target violation recorded');
  assert.equal(fix?.slaHours, 72);
});

test('OSS-SECURITY-001 负例: 状态乱序（triaged 早于 acknowledged）→ invalid 转移检出', () => {
  const r = runTabletopDrill({
    ...happyTimeline(),
    triagedAt: '2026-08-10T09:00:00.000Z', // 早于 acknowledgedAt(+12h)
  });
  assert.equal(r.outcome, 'invalid');
  assert.ok(r.invalidTransitions.length >= 1, 'out-of-order transition flagged');
  assert.match(r.invalidTransitions[0]?.detail ?? '', /order|monotonic|sequence/i);
});

test('OSS-SECURITY-001 负例: 缺步（未经 embargo 直接发布）→ invalid', () => {
  const r = runTabletopDrill({
    ...happyTimeline(),
    embargoedAt: '2026-08-13T08:00:00.000Z', // = releasedAt（零长 embargo 且晚于 fixing 之后发布同刻）
    releasedAt: '2026-08-13T08:00:00.000Z',
  });
  // embargo 与 release 同刻 = embargo 未先行成立 → 非法转移。
  assert.equal(r.outcome, 'invalid');
});

test('OSS-SECURITY-001 边界: 唯一违例是同刻转移（零长步骤）→ invalid（严格单调）', () => {
  // 隔离判定：除 embargoed == fixingAt 同刻外全序合法——同刻单独必须判非法。
  const r = runTabletopDrill({
    ...happyTimeline(),
    embargoedAt: '2026-08-11T10:00:00.000Z', // == fixingAt（同刻）
  });
  assert.equal(r.outcome, 'invalid', 'same-instant transition alone is invalid');
  assert.ok(r.invalidTransitions.some((t) => t.from === 'embargoed' && t.to === 'fixing'), 'flags the zero-length step');
});

// ---------------------------------------------------------------------------
// SECURITY.md 资产存在性（真实仓库）
// ---------------------------------------------------------------------------

test('OSS-SECURITY-001: 真实仓库 SECURITY.md 存在且含必需章节', () => {
  const r = checkSecurityPolicyAssets(REPO_ROOT);
  assert.equal(r.ok, true, `missing: ${r.missing.join(', ')}`);
  assert.equal(r.securityMdFound, true);
  assert.deepEqual(r.requiredSections, ['Supported Versions', 'Reporting a Vulnerability', 'Disclosure Policy']);
});

test('OSS-SECURITY-001 负例: 无 SECURITY.md 的目录 → fail（missing SECURITY.md）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secresp-nomd-'));
  try {
    const r = checkSecurityPolicyAssets(dir);
    assert.equal(r.ok, false);
    assert.ok(r.missing.includes('SECURITY.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('OSS-SECURITY-001 篡改: SECURITY.md 被剥离章节 → 检出缺失章节', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secresp-stripped-'));
  try {
    writeFileSync(
      join(dir, 'SECURITY.md'),
      '# Security Policy\n\nSome content without required sections.\n',
      'utf8',
    );
    const r = checkSecurityPolicyAssets(dir);
    assert.equal(r.ok, false);
    for (const section of ['Supported Versions', 'Reporting a Vulnerability', 'Disclosure Policy']) {
      assert.ok(r.missing.includes(`section: ${section}`), `${section} absence detected`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
