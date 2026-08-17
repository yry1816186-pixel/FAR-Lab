// tests/data_governance/data_card_privacy.test.ts
// DATA-CARD-001 + DATA-PRIVACY-001：15 字段 Dataset Card、漂移三查、license 门、
// 既有卡投影（缺口显式补声明）、数据清单完整性、外发四门审查、确定性脱敏、删除计划。
// 真实依赖：全部纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DatasetCardSchema,
  fromExoplanetCard,
  missingnessDrift,
  schemaDrift,
  unitDrift,
  validateDatasetCard,
} from '../../src/data_governance/dataset_card.ts';
import type { DatasetCard } from '../../src/data_governance/dataset_card.ts';
import {
  DataFlowSchema,
  deletionComplete,
  deletionPlan,
  redact,
  reviewDataFlow,
  reviewDataFlows,
  validateDataInventory,
} from '../../src/data_governance/privacy.ts';
import type { DataFlow, DataInventoryEntry } from '../../src/data_governance/privacy.ts';

function card(overrides: Record<string, unknown> = {}): DatasetCard {
  return DatasetCardSchema.parse({
    datasetId: 'exoplanet:doi-10.26133/NEA12',
    purpose: '系外行星半径-辐照度相关性假设检验',
    provenance: {
      source: 'NASA Exoplanet Archive TAP',
      sourceUrl: 'https://exoplanetarchive.ipac.caltech.edu/',
      persistentId: 'doi:10.26133/NEA12',
      collectionMethod: 'TAP API 结构化查询',
    },
    version: '2026-08-01',
    checksum: { algorithm: 'sha256', value: 'a'.repeat(64) },
    schema: { fields: ['pl_rade', 'pl_orbper'], shape: '2 columns' },
    units: { pl_rade: 'R_EARTH', pl_orbper: 'days' },
    license: 'CC0-1.0',
    privacy: { category: 'public', consentBasis: null, notes: '' },
    knownBiases: ['检测偏向短周期大行星（ transit 方法选择效应）'],
    missingness: { notes: ['pl_rade 少量缺失'], knownMissingColumns: ['pl_rade'] },
    transformations: ['半径单位地球化', '过滤非确认行星'],
    splitPolicy: '按系统名分层 80/20（防同系统泄漏）',
    leakageRisks: ['同系统多行星相关性——mitigated by system-stratified split'],
    retention: { policy: '随发布保留至下一版本数据集替换', deletionProcedure: '删除 .far/cache/retrieval 对应快照 + 重算 rootHash' },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// DATA-CARD-001：15 字段 + 语义门
// ---------------------------------------------------------------------------

test('DATA-CARD-001: 15 字段完整卡通过语义门（license allowlist 含其 license）', () => {
  const v = validateDatasetCard(card(), ['CC0-1.0', 'CC-BY-4.0', 'MIT']);
  assert.equal(v.ok, true, JSON.stringify(v.violations));
});

test('DATA-CARD-001 fail-closed: 15 字段任一缺失被 zod 拒（全字段抽验）', () => {
  const fields = ['purpose', 'provenance', 'version', 'checksum', 'schema', 'units', 'license', 'privacy', 'knownBiases', 'missingness', 'transformations', 'splitPolicy', 'leakageRisks', 'retention'] as const;
  for (const f of fields) {
    const base = card() as Record<string, unknown>;
    delete base[f];
    assert.equal(DatasetCardSchema.safeParse(base).success, false, `missing '${f}' must fail`);
  }
});

test('DATA-CARD-001 fail-closed: 坏 checksum 形状 / license 不在允许单 / 敏感类缺同意 / 缺删除程序 / 裸风险各自拒', () => {
  const badHash = validateDatasetCard(card({ checksum: { algorithm: 'sha256', value: 'deadbeef' } }));
  assert.ok(badHash.violations.some((v) => v.code === 'BAD_CHECKSUM_VALUE'));

  const badLicense = validateDatasetCard(card(), ['MIT']);
  assert.ok(badLicense.violations.some((v) => v.code === 'LICENSE_NOT_ALLOWED'));

  const noConsent = validateDatasetCard(card({ privacy: { category: 'sensitive', consentBasis: null, notes: '' } }));
  assert.ok(noConsent.violations.some((v) => v.code === 'SENSITIVE_WITHOUT_CONSENT'));

  // 负例直构绕过 parse 助手（空 deletionProcedure 会被 zod 先拒——语义门断言才轮得到）
  const noDeletionCard = { ...card(), retention: { policy: '永久', deletionProcedure: '' } };
  const noDeletion = validateDatasetCard(noDeletionCard as DatasetCard);
  assert.ok(noDeletion.violations.some((v) => v.code === 'RETENTION_WITHOUT_DELETION'));

  const bareRisk = validateDatasetCard(card({ leakageRisks: ['time-series overlap'] }));
  assert.ok(bareRisk.violations.some((v) => v.code === 'LEAKAGE_RISK_WITHOUT_MITIGATION_NOTE'));
});

// ---------------------------------------------------------------------------
// 既有卡投影：缺口字段显式补声明（不静默默认）
// ---------------------------------------------------------------------------

test('DATA-CARD-001 投影: Exoplanet 既有卡 9 字段映射 + 6 缺口字段强制显式', () => {
  const projected = fromExoplanetCard(
    {
      source: 'NASA Exoplanet Archive TAP',
      sourceUrl: 'https://exoplanetarchive.ipac.caltech.edu/',
      version: '2026-08-01',
      persistentId: 'doi:10.26133/NEA12',
      license: 'CC0-1.0',
      rawChecksum: 'b'.repeat(64),
      fields: ['pl_rade', 'pl_orbper'],
      units: { pl_rade: 'R_EARTH' },
      missingNotes: ['pl_rade 少量缺失'],
      qualityNotes: ['选择效应'],
    },
    {
      purpose: '半径-辐照度检验',
      collectionMethod: 'TAP API',
      privacyCategory: 'public',
      consentBasis: null,
      transformations: [],
      splitPolicy: '系统名分层 80/20',
      leakageRisks: ['同系统相关——mitigated by stratified split'],
      retentionPolicy: '至下版替换',
      deletionProcedure: '删快照重算 rootHash',
      knownBiases: [],
    },
  );
  assert.equal(projected.schema.fields.length, 2);
  assert.ok(projected.knownBiases.includes('选择效应'), '既有 qualityNotes 并入 biases');
  assert.equal(validateDatasetCard(projected).ok, true);
});

// ---------------------------------------------------------------------------
// 漂移三查（schema / unit / missingness）
// ---------------------------------------------------------------------------

test('DATA-CARD-001 漂移: 字段双向/单位变更/未声明单位/新缺失列 各自检出', () => {
  const c = card();
  assert.deepEqual(
    schemaDrift(c, ['pl_rade', 'pl_orbper', 'new_col']).map((f) => f.detail),
    ["actual field 'new_col' not declared on card"],
  );
  assert.ok(schemaDrift(c, ['pl_rade']).some((f) => f.detail.includes("declared field 'pl_orbper' absent")));

  const ud = unitDrift(c, { pl_rade: 'R_JUPITER', pl_orbper: 'days' });
  assert.ok(ud.some((f) => f.detail.includes("pl_rade' unit changed")));

  const md = missingnessDrift(c, ['pl_rade', 'pl_orbper']);
  assert.deepEqual(md.map((f) => f.detail), ["column 'pl_orbper' now has missing values but is not declared known-missing on card"]);
  assert.equal(missingnessDrift(c, ['pl_rade']).length, 0, '已知缺失列不算漂移');
});

// ---------------------------------------------------------------------------
// DATA-PRIVACY-001：清单完整性 + 外发四门 + 目的对拍
// ---------------------------------------------------------------------------

function inventory(): DataInventoryEntry[] {
  return [
    { dataId: 'corpus-public', category: 'public', purpose: '文献综述语料', lawfulBasis: null, locations: ['.far/cache/retrieval'], sharedWith: [], retentionDays: 30 },
    { dataId: 'bench-sensitive', category: 'sensitive', purpose: '基准题库评测', lawfulBasis: '研究豁免声明-2026-08', locations: ['db:bench'], sharedWith: [], retentionDays: 365 },
    { dataId: 'user-personal', category: 'personal', purpose: '用户反馈分析', lawfulBasis: '明示同意-记录#42', locations: ['db:feedback'], sharedWith: [], retentionDays: 90 },
  ];
}

test('DATA-PRIVACY-001 清单: 合法清单通过；敏感类缺 lawfulBasis 拒；重复 dataId 拒', () => {
  assert.equal(validateDataInventory(inventory()).ok, true);
  const bad = [...inventory()];
  bad[1] = { ...(bad[1] as DataInventoryEntry), lawfulBasis: null };
  const r = validateDataInventory(bad);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('bench-sensitive')));
  const dup = [...inventory(), inventory()[0] as DataInventoryEntry];
  assert.ok(validateDataInventory(dup).problems.some((p) => p.includes('duplicate')));
});

function flow(overrides: Partial<DataFlow> = {}): DataFlow {
  return DataFlowSchema.parse({
    flowId: 'f1',
    dataRefs: ['bench-sensitive'],
    destination: 'external-model',
    flowPurpose: '基准题库评测模型调用',
    minimized: true,
    redaction: { applied: true, method: '去标识化-字段级' },
    authorized: true,
    vendorBoundary: '供应商A-数据处理条款-2026',
    auditRef: 'audit:2026-08-18#7',
    ...overrides,
  });
}

test('DATA-PRIVACY-001 外发四门: sensitive 四门全过 → 放行；缺任一门 → 拒且逐条列名', () => {
  const ok = reviewDataFlow(flow(), inventory());
  assert.equal(ok.allowed, true, JSON.stringify(ok.reasons));

  const gates: readonly [string, Partial<DataFlow>][] = [
    ['authorized', { authorized: false }],
    ['minimized', { minimized: false }],
    ['redaction', { redaction: { applied: false, method: null } }],
    ['vendorBoundary', { vendorBoundary: null }],
    ['auditRef', { auditRef: null }],
  ];
  for (const [gate, patch] of gates) {
    const v = reviewDataFlow(flow(patch), inventory());
    assert.equal(v.allowed, false, `gate '${gate}' must block`);
    const gateWord = gate === 'vendorBoundary' ? 'vendor boundary' : gate === 'auditRef' ? 'audit' : gate;
    assert.ok(v.reasons.some((r) => r.toLowerCase().includes(gateWord.toLowerCase())), `reason names gate '${gate}': ${v.reasons.join(';')}`);
  }
});

test('DATA-PRIVACY-001: personal 外发默认拒（宪法红线）；未登记数据流拒；internal 目的对拍', () => {
  const personal = reviewDataFlow(flow({ dataRefs: ['user-personal'] }), inventory());
  assert.equal(personal.allowed, false);
  assert.ok(personal.reasons.some((r) => r.includes('personal') && r.includes('denied by default')));

  const unregistered = reviewDataFlow(flow({ dataRefs: ['ghost-data'] }), inventory());
  assert.equal(unregistered.allowed, false);
  assert.ok(unregistered.reasons.some((r) => r.includes('not in inventory')));

  const internal = reviewDataFlow(
    flow({ destination: 'internal', flowPurpose: '文献综述语料分析', dataRefs: ['corpus-public'], authorized: false, minimized: false, redaction: { applied: false, method: null }, vendorBoundary: null, auditRef: null }),
    inventory(),
  );
  assert.equal(internal.allowed, true, 'internal 流不设外发四门（目的对拍过即行）');

  const mismatch = reviewDataFlow(
    flow({ destination: 'internal', flowPurpose: '模型蒸馏完全无关用途', dataRefs: ['corpus-public'] }),
    inventory(),
  );
  assert.equal(mismatch.allowed, false, '目的不匹配的 internal 流也要拒（目的限制）');
});

test('DATA-PRIVACY-001 全量审查报告: 放行/拒绝分组 + 拒绝原因齐全', () => {
  const report = reviewDataFlows(
    [flow({ flowId: 'ok-flow' }), flow({ flowId: 'bad-flow', authorized: false })],
    inventory(),
  );
  assert.deepEqual(report.allowed, ['ok-flow']);
  assert.equal(report.denied.length, 1);
  assert.equal(report.denied[0]?.flowId, 'bad-flow');
});

// ---------------------------------------------------------------------------
// 脱敏 + 删除
// ---------------------------------------------------------------------------

test('DATA-PRIVACY-001 脱敏: 邮箱/手机号/身份证号 确定性替换 + 原文不残留 + 计数入账', () => {
  const input = '联系 alice@example.com 或 13812345678，证件 110101199001011234';
  const r = redact(input);
  assert.ok(!r.redacted.includes('alice@example.com'));
  assert.ok(!r.redacted.includes('13812345678'));
  assert.ok(!r.redacted.includes('110101199001011234'));
  assert.ok(r.redacted.includes('[REDACTED:email]'));
  const names = r.findings.map((f) => f.name);
  assert.deepEqual([...names].sort(), ['email', 'id-card-cn', 'phone-cn']);
  // 确定性：同输入同输出
  assert.equal(redact(input).redacted, r.redacted);
});

test('DATA-PRIVACY-001 删除: 计划覆盖全位置；位置删净判定；漏删检出', () => {
  const inv = inventory();
  const plan = deletionPlan(inv);
  assert.equal(plan.length, 3);
  const feedback = plan.find((p) => p.dataId === 'user-personal');
  assert.deepEqual(feedback?.locations, ['db:feedback']);

  const entry = inv[2] as DataInventoryEntry;
  assert.equal(deletionComplete(entry, ['db:feedback']), true);
  assert.equal(deletionComplete(entry, []), false, '漏删必须检出');
});
