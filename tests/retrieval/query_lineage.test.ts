/**
 * query_lineage.test.ts — RET-QUERY-001 验收：完整查询谱系。
 *
 * 覆盖宪法验收项：
 *   - query replay：同输入重放 → identifiers 集合确定性比对（顺序无关）
 *   - pagination drift：cursor/timestamp 不一致 → REPLAY_DIVERGENT 检出
 *   - rate-limit：降级事件入谱系 → 置信降级（degraded）；failure → 不可完整重放
 *   - source failure：适配器抛错 → 记 failure 事件 + 重抛（绝不静默）
 *   - 11 字段结构化 + 覆盖限制标注
 *
 * Cannot-prove：见 src/retrieval/query_lineage.ts 模块头（identifiers 集合相等不证明
 * 内容相等；源端索引演进不在本模块控制内）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLineage,
  verifyReplay,
  detectPaginationDrift,
  createLineageRecorder,
  withLineage,
} from '../../src/retrieval/query_lineage.ts';
import type { RetrievedDocument, RetrievalAdapter, RetrievalQuery } from '../../src/retrieval/types.ts';

function fakeDoc(id: string, fromCache: boolean): RetrievedDocument {
  return {
    documentId: id,
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier: `W${id}`,
    doi: null,
    canonicalUrl: 'https://example.org/w',
    title: `doc ${id}`,
    authors: [],
    publicationDate: '2020-01-01',
    retrievedAt: '2026-08-17T00:00:00.000Z',
    ...(fromCache ? { retrievedFrom: 'cache' as const } : {}),
    retrievalQuery: 'q',
    retrievalMethod: 'openalex-rest',
    rawHash: `hash-${id}`,
    normalizedHash: `nhash-${id}`,
    parserVersion: 'openalex-atom-v1',
    abstract: null,
    licenseMetadata: null,
  };
}

const AT = '2026-08-17T00:00:00.000Z';

// ---------------------------------------------------------------------------
// 11 字段结构化 + 重放资格
// ---------------------------------------------------------------------------

test('buildLineage: 11 字段全结构化，完整记录 → replayable/full confidence', () => {
  const lineage = buildLineage({
    originalQuery: 'priming effect replication',
    expandedQueries: ['priming effect replication failure', 'priming effect non-replication'],
    adapterIds: ['openalex', 'crossref'],
    filters: { fromYear: 2015, openAccessOnly: true },
    pagination: [{ adapterId: 'openalex', query: 'priming effect replication', page: 1, cursor: 'c1', timestamp: AT, pageSize: 25, hasMore: true }],
    resultIdentifiers: ['doc-a', 'doc-b'],
    rankingInputs: { sort: 'relevance_score', minRelevance: 0.3 },
    rateLimitEvents: [],
    cacheStatus: [{ adapterId: 'openalex', query: 'priming effect replication', status: 'miss' }],
    coverageLimitations: [],
  });
  assert.equal(lineage.originalQuery, 'priming effect replication');
  assert.equal(lineage.expandedQueries.length, 2);
  assert.deepEqual(lineage.adapterIds, ['openalex', 'crossref']);
  assert.deepEqual(lineage.filters, { fromYear: 2015, openAccessOnly: true });
  assert.equal(lineage.pagination.length, 1);
  assert.equal(lineage.pagination[0]?.cursor, 'c1');
  assert.deepEqual(lineage.resultIdentifiers, ['doc-a', 'doc-b']);
  assert.equal(lineage.rankingInputs.sort, 'relevance_score');
  assert.deepEqual(lineage.rateLimitEvents, []);
  assert.equal(lineage.cacheStatus[0]?.status, 'miss');
  assert.deepEqual(lineage.coverageLimitations, []);
  assert.equal(lineage.replay.replayable, true);
  assert.equal(lineage.replay.confidence, 'full');
});

test('buildLineage: originalQuery 空 → 拒绝', () => {
  assert.throws(() => buildLineage({ originalQuery: '   ' }), /non-empty/);
});

// ---------------------------------------------------------------------------
// query replay 验证
// ---------------------------------------------------------------------------

function fullLineage(ids: readonly string[]): ReturnType<typeof buildLineage> {
  return buildLineage({ originalQuery: 'q', resultIdentifiers: ids });
}

test('verifyReplay: 同集合（顺序无关、去重）→ REPLAY_OK', () => {
  const lineage = fullLineage(['a', 'b', 'c']);
  const ok = verifyReplay(lineage, { resultIdentifiers: ['c', 'a', 'b', 'a'] });
  assert.equal(ok.outcome, 'REPLAY_OK');
});

test('verifyReplay: 集合差异 → REPLAY_DIVERGENT（missing/extra 精确）', () => {
  const lineage = fullLineage(['a', 'b', 'c']);
  const r = verifyReplay(lineage, { resultIdentifiers: ['b', 'c', 'x'] });
  assert.equal(r.outcome, 'REPLAY_DIVERGENT');
  assert.deepEqual(r.missing, ['a']);
  assert.deepEqual(r.extra, ['x']);
  assert.match(r.reason, /1 missing, 1 extra/);
});

test('verifyReplay: 不可完整重放的谱系 → NOT_REPLAYABLE（不假装可比）', () => {
  const lineage = buildLineage({
    originalQuery: 'q',
    resultIdentifiers: ['a'],
    rateLimitEvents: [{ at: AT, adapterId: 'openalex', kind: 'failure', detail: 'HTTP 503' }],
  });
  assert.equal(lineage.replay.replayable, false);
  assert.equal(lineage.replay.confidence, 'degraded');
  const r = verifyReplay(lineage, { resultIdentifiers: ['a'] });
  assert.equal(r.outcome, 'NOT_REPLAYABLE');
  assert.match(r.reason, /source-failure/);
});

// ---------------------------------------------------------------------------
// pagination drift
// ---------------------------------------------------------------------------

test('detectPaginationDrift: 一致 → CONSISTENT；cursor/timestamp 漂移 → REPLAY_DIVERGENT', () => {
  const recorded = [
    { adapterId: 'openalex', query: 'q', page: 1, cursor: 'c1', timestamp: AT },
    { adapterId: 'crossref', query: 'q', page: 1, cursor: 'k9', timestamp: AT },
  ];
  assert.equal(detectPaginationDrift(recorded, recorded.map((p) => ({ ...p }))).status, 'CONSISTENT');
  const drifted = detectPaginationDrift(recorded, [
    { ...recorded[0]!, cursor: 'c2' },
    { ...recorded[1]!, timestamp: '2026-08-18T00:00:00.000Z' },
  ]);
  assert.equal(drifted.status, 'REPLAY_DIVERGENT');
  const fields = drifted.drifts.map((d) => `${d.adapterId}:${d.field}`);
  assert.deepEqual([...fields].sort(), ['crossref:timestamp', 'openalex:cursor']);
});

test('detectPaginationDrift: 重放缺失/多出分页记录 → 检出 absent', () => {
  const recorded = [{ adapterId: 'openalex', query: 'q', page: 1, cursor: 'c1' }];
  const r = detectPaginationDrift(recorded, [{ adapterId: 'arxiv', query: 'q', page: 1, cursor: 'a1' }]);
  assert.equal(r.status, 'REPLAY_DIVERGENT');
  assert.ok(r.drifts.some((d) => d.recorded === '<absent>' || d.replayed === '<absent>'));
});

// ---------------------------------------------------------------------------
// rate-limit / degraded 事件入谱系
// ---------------------------------------------------------------------------

test('rate-limit/degraded 事件: 记录后置信降级（degraded）但仍可重放', () => {
  const lineage = buildLineage({
    originalQuery: 'q',
    resultIdentifiers: ['a'],
    rateLimitEvents: [{ at: AT, adapterId: 'openalex', kind: 'rate_limit', detail: '429 backoff 2s' }],
  });
  assert.equal(lineage.replay.replayable, true, 'rate-limit（已记录）不破坏重放资格');
  assert.equal(lineage.replay.confidence, 'degraded', '但置信必须降级');
});

test('未结构化记录的降级（unrecordedDegradationHint）→ 不可完整重放 + 降置信', () => {
  const lineage = buildLineage({ originalQuery: 'q', unrecordedDegradationHint: true });
  assert.equal(lineage.replay.replayable, false);
  assert.equal(lineage.replay.confidence, 'degraded');
  assert.match(lineage.replay.reasons.join('; '), /NOT captured/);
});

// ---------------------------------------------------------------------------
// withLineage 包装器：成功记录 + source failure 不静默
// ---------------------------------------------------------------------------

function makeAdapter(docs: readonly RetrievedDocument[] | Error): RetrievalAdapter {
  return {
    source: 'openalex',
    sourceName: 'OpenAlex',
    async retrieve(_query: RetrievalQuery): Promise<readonly RetrievedDocument[]> {
      if (docs instanceof Error) throw docs;
      return docs;
    },
  };
}

test('withLineage: 成功路径记录 identifiers + 缓存态 + adapterIds', async () => {
  const recorder = createLineageRecorder();
  const wrapped = withLineage(makeAdapter([fakeDoc('d1', false), fakeDoc('d2', true)]), recorder, AT);
  const docs = await wrapped.retrieve({ text: 'q', maxResults: 10, source: 'openalex' });
  assert.equal(docs.length, 2);
  const lineage = recorder.toLineage({ originalQuery: 'q' });
  assert.deepEqual(lineage.resultIdentifiers, ['d1', 'd2']);
  assert.deepEqual(lineage.adapterIds, ['openalex']);
  assert.equal(lineage.cacheStatus[0]?.status, 'hit', '任一文档来自缓存 → hit（诚实：混合态按 hit 报）');
  assert.equal(lineage.pagination[0]?.timestamp, AT);
  assert.ok(
    lineage.coverageLimitations.some((l) => l.includes('no cursor')),
    '适配器未暴露游标 → 覆盖限制如实标注（不伪造分页数据）',
  );
  assert.equal(lineage.replay.confidence, 'partial', '覆盖限制存在 → partial');
});

test('withLineage: 适配器抛错 → failure 事件入谱系 + 重抛（绝不静默）', async () => {
  const recorder = createLineageRecorder();
  const wrapped = withLineage(makeAdapter(new Error('HTTP 503 upstream')), recorder, AT);
  await assert.rejects(
    () => wrapped.retrieve({ text: 'q', maxResults: 10, source: 'openalex' }),
    /HTTP 503/,
    '包装器必须重抛原始错误——吞错是被禁止的静默失败',
  );
  const lineage = recorder.toLineage({ originalQuery: 'q' });
  assert.equal(lineage.rateLimitEvents.length, 1);
  assert.equal(lineage.rateLimitEvents[0]?.kind, 'failure');
  assert.match(lineage.rateLimitEvents[0]?.detail ?? '', /HTTP 503/);
  assert.equal(lineage.replay.replayable, false, 'source failure → 结果标记不可完整重放');
  assert.equal(lineage.replay.confidence, 'degraded', '置信降级');
});

test('withLineage: 全 live 命中 → cacheStatus miss；空结果 → unknown + 限制', async () => {
  const recorder = createLineageRecorder();
  const wrapped = withLineage(makeAdapter([fakeDoc('live-1', false)]), recorder, AT);
  await wrapped.retrieve({ text: 'q', maxResults: 10, source: 'openalex' });
  const lineage = recorder.toLineage({ originalQuery: 'q' });
  assert.equal(lineage.cacheStatus[0]?.status, 'miss');

  const emptyRecorder = createLineageRecorder();
  const emptyWrapped = withLineage(makeAdapter([]), emptyRecorder, AT);
  await emptyWrapped.retrieve({ text: 'q', maxResults: 10, source: 'openalex' });
  const emptyLineage = emptyRecorder.toLineage({ originalQuery: 'q' });
  assert.equal(emptyLineage.cacheStatus[0]?.status, 'unknown');
  assert.equal(emptyLineage.replay.confidence, 'partial');
});
