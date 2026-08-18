/**
 * source_status.test.ts — RET-RETRACTION-001 验收：撤稿与更正状态检查。
 *
 * 覆盖宪法验收项：
 *   - 撤稿传播：retracted 证据（原 relation=SUPPORTS）→ claim 强制 REOPEN + 证据显式
 *     kind 标注（不得作为未标记正向支持）；REFUTES 证据被撤稿同样污染 → REOPEN
 *   - 缓存失效：statusVersion 版本化，旧版本条目读取 → InvalidatedCacheError
 *   - 报告展示：retracted 显式渲染（绝不静默）；空输入显式「未检查」声明
 *   - corrected / expression_of_concern → QUALIFIED 传播；ok → 无传播
 *   - checkSourceStatus 查表（命中/无命中的诚实注记）
 *
 * Cannot-prove：见 src/evidence/source_status.ts 模块头（通告注册表完备性不在本模块
 * 证明范围；REOPEN 是标记不是重裁本身）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSourceStatus,
  propagateSourceStatus,
  createSourceStatusCache,
  recordSourceStatus,
  readSourceStatus,
  InvalidatedCacheError,
  renderSourceStatusSection,
  type SourceStatusRecord,
  type ClaimEvidenceDependency,
} from '../../src/evidence/source_status.ts';

const AT = '2026-08-17T00:00:00.000Z';

const retractedRecord: SourceStatusRecord = {
  sourceId: '10.1234/retracted-paper',
  status: 'retracted',
  checkedAt: AT,
  evidenceRef: '10.1234/retraction-notice',
};

const deps: readonly ClaimEvidenceDependency[] = [
  { claimId: 'claim-1', evidenceId: 'ev-1', sourceId: '10.1234/retracted-paper', relation: 'SUPPORTS' },
  { claimId: 'claim-2', evidenceId: 'ev-2', sourceId: '10.1234/retracted-paper', relation: 'REFUTES' },
  { claimId: 'claim-3', evidenceId: 'ev-3', sourceId: '10.9999/other-paper', relation: 'SUPPORTS' },
];

// ---------------------------------------------------------------------------
// checkSourceStatus 查表
// ---------------------------------------------------------------------------

test('checkSourceStatus: 命中注册表 → 返回通告记录；无命中 → ok + 诚实注记（不假装证明源端无撤稿）', () => {
  const hit = checkSourceStatus('10.1234/retracted-paper', [retractedRecord], AT);
  assert.equal(hit.matched, true);
  assert.equal(hit.status, 'retracted');
  assert.equal(hit.evidenceRef, '10.1234/retraction-notice');

  const miss = checkSourceStatus('10.5678/unknown', [retractedRecord], AT);
  assert.equal(miss.matched, false);
  assert.equal(miss.status, 'ok');
  assert.equal(miss.evidenceRef, null);
  assert.match(miss.note ?? '', /SUPPLIED registry/);

  assert.throws(() => checkSourceStatus('  ', [], AT), /non-empty/);
});

// ---------------------------------------------------------------------------
// 撤稿传播（核心）
// ---------------------------------------------------------------------------

test('撤稿传播: SUPPORTS 证据被撤稿 → claim-1 REOPEN + 证据显式 research_history 标注（不得作为未标记正向支持）', () => {
  const r = propagateSourceStatus(deps, retractedRecord);
  assert.equal(r.dependencyGraphSource, 'explicit-caller-supplied-manifest');
  const c1 = r.claimPropagations.find((p) => p.claimId === 'claim-1');
  assert.ok(c1 !== undefined);
  assert.equal(c1.verdictImpact, 'REOPEN');
  const d1 = c1.evidenceDispositions[0];
  assert.equal(d1?.originalRelation, 'SUPPORTS');
  assert.equal(d1?.disposition, 'research_history');
  assert.match(d1?.reason ?? '', /cannot remain UNMARKED positive support/);
  // 依赖该撤稿源的其他 claim 不受影响（claim-3 依赖别的源）
  assert.equal(r.claimPropagations.some((p) => p.claimId === 'claim-3'), false);
  assert.equal(r.affectedClaimCount, 2);
});

test('撤稿传播: REFUTES 证据被撤稿 → 同样 REOPEN（反证基础被污染——保守重开，不静默）', () => {
  const r = propagateSourceStatus(deps, retractedRecord);
  const c2 = r.claimPropagations.find((p) => p.claimId === 'claim-2');
  assert.ok(c2 !== undefined);
  assert.equal(c2.verdictImpact, 'REOPEN');
  assert.match(c2.evidenceDispositions[0]?.reason ?? '', /taints the REFUTES basis/);
});

test('撤稿传播: 可选 counter_example 角色（反证/错误案例用途显式标注）', () => {
  const r = propagateSourceStatus(deps, retractedRecord, { retractedRole: 'counter_example' });
  const c1 = r.claimPropagations.find((p) => p.claimId === 'claim-1');
  assert.equal(c1?.evidenceDispositions[0]?.disposition, 'counter_example');
});

test('更正/关注表情/版本更新传播: → QUALIFIED 标记（不 REOPEN）', () => {
  for (const status of ['corrected', 'expression_of_concern', 'version_update'] as const) {
    const r = propagateSourceStatus(deps, {
      sourceId: '10.1234/retracted-paper',
      status,
      checkedAt: AT,
      evidenceRef: `ref-${status}`,
    });
    const c1 = r.claimPropagations.find((p) => p.claimId === 'claim-1');
    assert.equal(c1?.verdictImpact, 'QUALIFIED', `${status} → QUALIFIED`);
    assert.equal(c1?.evidenceDispositions[0]?.disposition, 'qualified');
  }
});

test('ok 状态: 无传播（NONE + unchanged）', () => {
  const r = propagateSourceStatus(deps, { sourceId: '10.1234/retracted-paper', status: 'ok', checkedAt: AT, evidenceRef: null });
  const c1 = r.claimPropagations.find((p) => p.claimId === 'claim-1');
  assert.equal(c1?.verdictImpact, 'NONE');
  assert.equal(c1?.evidenceDispositions[0]?.disposition, 'unchanged');
  assert.equal(r.affectedClaimCount, 0);
});

// ---------------------------------------------------------------------------
// 缓存失效（statusVersion 版本化）
// ---------------------------------------------------------------------------

test('缓存: 状态类写入 bump 版本 → 旧版本条目读取抛 InvalidatedCacheError，重写后可读', () => {
  let cache = createSourceStatusCache(1);
  cache = recordSourceStatus(cache, retractedRecord); // v2
  assert.equal(readSourceStatus(cache, '10.1234/retracted-paper')?.status, 'retracted');

  cache = recordSourceStatus(cache, {
    sourceId: '10.9999/other-paper',
    status: 'corrected',
    checkedAt: AT,
    evidenceRef: 'ref-c',
  }); // v3 → 第一条即刻陈旧
  assert.throws(
    () => readSourceStatus(cache, '10.1234/retracted-paper'),
    (e: unknown) => e instanceof InvalidatedCacheError && e.entryVersion === 2 && e.currentVersion === 3,
    '旧版本条目必须被拒绝（fail-closed），且错误携带版本对',
  );

  cache = recordSourceStatus(cache, { ...retractedRecord, checkedAt: '2026-08-18T00:00:00.000Z' }); // v4
  assert.equal(readSourceStatus(cache, '10.1234/retracted-paper')?.checkedAt, '2026-08-18T00:00:00.000Z');
  // v4 写入同样使 v3 条目陈旧（版本全局推进——任何旧版本条目一律拒绝）
  assert.throws(
    () => readSourceStatus(cache, '10.9999/other-paper'),
    InvalidatedCacheError,
    'v4 bump 后 v3 条目必须同样陈旧——版本语义全局一致',
  );
});

test('缓存: ok 写入不 bump 版本（ok 不改变失效语义）；未缓存 → null', () => {
  let cache = createSourceStatusCache(5);
  assert.equal(readSourceStatus(cache, 'never-seen'), null);
  cache = recordSourceStatus(cache, { sourceId: 's-ok', status: 'ok', checkedAt: AT, evidenceRef: null });
  assert.equal(cache.currentVersion, 5, 'ok 不 bump');
  assert.equal(readSourceStatus(cache, 's-ok')?.status, 'ok');
});

// ---------------------------------------------------------------------------
// 报告展示（retracted 显式渲染，绝不静默）
// ---------------------------------------------------------------------------

test('报告展示: retracted 必须显式出现（含 sourceId + 依据引用 + 传播明细），不得静默', () => {
  const propagation = propagateSourceStatus(deps, retractedRecord);
  const section = renderSourceStatusSection([retractedRecord], propagation);
  assert.match(section, /## Source Status/);
  assert.match(section, /RETRACTED — 10\.1234\/retracted-paper/);
  assert.match(section, /ref 10\.1234\/retraction-notice/);
  assert.match(section, /Claim claim-1: verdictImpact=REOPEN/);
  assert.match(section, /SUPPORTS → research_history/);
  // 撤稿渲染不得被静默省略：出现次数 ≥ 1（RETRACTED 标签 + 传播 reason 中的源 id）
  assert.ok((section.match(/10\.1234\/retracted-paper/g) ?? []).length >= 2);
});

test('报告展示: 空输入渲染显式「未检查」声明（absence of notice ≠ notice of absence）', () => {
  const section = renderSourceStatusSection([]);
  assert.match(section, /status check NOT performed/);
  assert.match(section, /unknown, not asserted/);
});

test('报告展示: 无依赖 claim 时如实声明（不夸大影响面）', () => {
  const propagation = propagateSourceStatus(
    [{ claimId: 'claim-x', evidenceId: 'ev-x', sourceId: '10.9/z', relation: 'SUPPORTS' }],
    retractedRecord,
  );
  assert.equal(propagation.claimPropagations.length, 0);
  const section = renderSourceStatusSection([retractedRecord], propagation);
  assert.match(section, /No claim depends on source/);
});
