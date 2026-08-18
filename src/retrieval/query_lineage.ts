/**
 * retrieval/query_lineage — RET-QUERY-001：完整查询谱系（retrieval lineage）。
 *
 * 职责（宪法 T0 逐项，11 字段全结构化）：
 *   1.  originalQuery              原始查询
 *   2.  expandedQueries[]          翻译/扩展查询（含反证查询）
 *   3.  adapterIds[]               source adapters
 *   4.  filters                    过滤条件
 *   5.  pagination                 分页（timestamps/cursors/page/pageSize）
 *   6.  resultIdentifiers[]        结果标识（documentId 集合）
 *   7.  rankingInputs              排序输入（sort/relevance 参数）
 *   8.  rateLimitEvents[]          rate-limit/degraded/failure 事件
 *   9.  cacheStatus                cache/VCR 命中状态（per adapter×query）
 *   10. coverageLimitations[]      覆盖限制
 *   11. replay                     重放资格（replayable + 置信量化 + 原因）
 *
 * 机制：
 *   - buildLineage()/createLineageRecorder()：结构化记录 + 重放资格判定——
 *     failure 事件 / 缺失分页记录 → replayable=false（不可完整重放）；
 *     rate_limit/degraded 事件 / cacheStatus unknown / 覆盖限制 → 置信降级。
 *   - verifyReplay(lineage, replayed)：同输入重放 → result identifiers 集合
 *     确定性比对（排序去重后严格相等）；不一致 → REPLAY_DIVERGENT（missing/extra）。
 *   - detectPaginationDrift(recorded, replayed)：记录 cursor vs 重放 cursor
 *     不一致 → REPLAY_DIVERGENT（分页漂移检出）。
 *   - withLineage(adapter, recorder)：无侵入 additive 包装器——成功记录 identifiers/
 *     cache 状态；适配器抛错 → 记 failure 事件后【重新抛出】（绝不静默吞错）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - lineage 记录的是「我方观察到的查询事实」；不能证明源端索引未变化（重放差异
 *     可能来自源端演进——那正是 detectPaginationDrift 要暴露的，而非掩盖）。
 *   - withLineage 只能记录 RetrievalAdapter 接口暴露的信息；不提供游标/分页元数据
 *     的适配器如实记 'unknown' + 覆盖限制标注（不伪造分页数据）。
 *   - verifyReplay 的 identifiers 集合相等不证明文档内容相等（内容级由 rawHash
 *     机制覆盖，见 types.ts）——本模块只做谱系级重放验证。
 *
 * Determinism：纯函数 + 显式时间戳（ISO 字符串由调用方提供）；无时钟、无随机性。
 * No LLM。
 */

import type { RetrievedDocument, RetrievalAdapter, RetrievalQuery } from './types.ts';

// ---------------------------------------------------------------------------
// 谱系类型（11 字段）
// ---------------------------------------------------------------------------

/** 单次适配器查询的分页记录（适配器未暴露的字段为 undefined——如实）。 */
export interface PaginationRecord {
  readonly adapterId: string;
  readonly query: string;
  readonly page?: number;
  /** 源端游标（opaque 字符串）。 */
  readonly cursor?: string;
  /** 该页获取时间（ISO，调用方提供）。 */
  readonly timestamp?: string;
  readonly pageSize?: number;
  readonly hasMore?: boolean;
}

/** rate-limit / degraded / source-failure 事件。 */
export interface RateLimitEvent {
  /** 事件时间（ISO，调用方提供——模块不读时钟）。 */
  readonly at: string;
  readonly adapterId: string;
  readonly kind: 'rate_limit' | 'degraded' | 'failure';
  readonly detail: string;
}

/** per adapter×query 的缓存/VCR 状态。 */
export interface CacheStatusRecord {
  readonly adapterId: string;
  readonly query: string;
  readonly status: 'hit' | 'miss' | 'bypass' | 'unknown';
}

/** 重放资格（第 11 字段）。 */
export interface ReplayQualification {
  /** 结果是否可完整重放（failure 事件 / 分页缺失 → false）。 */
  readonly replayable: boolean;
  /** 置信量化：full（完整）> partial（有覆盖限制/unknown 缓存态）> degraded（降级事件）。 */
  readonly confidence: 'full' | 'partial' | 'degraded';
  readonly reasons: readonly string[];
}

/** 完整查询谱系（RET-QUERY-001 的 11 字段）。 */
export interface RetrievalLineage {
  readonly originalQuery: string;
  readonly expandedQueries: readonly string[];
  readonly adapterIds: readonly string[];
  readonly filters: Readonly<Record<string, string | number | boolean>>;
  readonly pagination: readonly PaginationRecord[];
  readonly resultIdentifiers: readonly string[];
  readonly rankingInputs: Readonly<Record<string, string | number | boolean>>;
  readonly rateLimitEvents: readonly RateLimitEvent[];
  readonly cacheStatus: readonly CacheStatusRecord[];
  readonly coverageLimitations: readonly string[];
  readonly replay: ReplayQualification;
}

// ---------------------------------------------------------------------------
// buildLineage：记录 → 谱系 + 重放资格判定
// ---------------------------------------------------------------------------

export interface LineageInput {
  readonly originalQuery: string;
  readonly expandedQueries?: readonly string[];
  readonly adapterIds?: readonly string[];
  readonly filters?: Readonly<Record<string, string | number | boolean>>;
  readonly pagination?: readonly PaginationRecord[];
  readonly resultIdentifiers?: readonly string[];
  readonly rankingInputs?: Readonly<Record<string, string | number | boolean>>;
  readonly rateLimitEvents?: readonly RateLimitEvent[];
  readonly cacheStatus?: readonly CacheStatusRecord[];
  readonly coverageLimitations?: readonly string[];
  /** 调用方已知发生了降级但事件未入谱系（诚实通道：宁可自曝不可静默）。 */
  readonly unrecordedDegradationHint?: boolean;
}

function qualifyReplay(input: LineageInput): ReplayQualification {
  const reasons: string[] = [];
  const events = input.rateLimitEvents ?? [];
  const failures = events.filter((e) => e.kind === 'failure');
  const degraded = events.filter((e) => e.kind === 'rate_limit' || e.kind === 'degraded');
  if (failures.length > 0) {
    reasons.push(`${failures.length} source-failure event(s): affected query branches cannot be reproduced (identifiers incomplete)`);
  }
  if (input.unrecordedDegradationHint === true) {
    reasons.push('caller reported degradation NOT captured as structured events — lineage incomplete by construction');
  }
  const unknownCache = (input.cacheStatus ?? []).filter((c) => c.status === 'unknown');
  if (unknownCache.length > 0) {
    reasons.push(`${unknownCache.length} cacheStatus entr(ies) unknown — replay may mix live/replay modes`);
  }
  const limitations = input.coverageLimitations ?? [];
  if (limitations.length > 0) {
    reasons.push(`${limitations.length} coverage limitation(s) declared`);
  }
  const replayable = failures.length === 0 && input.unrecordedDegradationHint !== true;
  const confidence: ReplayQualification['confidence'] = !replayable || degraded.length > 0
    ? 'degraded'
    : unknownCache.length > 0 || limitations.length > 0
      ? 'partial'
      : 'full';
  return { replayable, confidence, reasons };
}

/** 组装完整谱系（11 字段）+ 确定性重放资格判定。 */
export function buildLineage(input: LineageInput): RetrievalLineage {
  if (input.originalQuery.trim().length === 0) {
    throw new Error('buildLineage: originalQuery must be non-empty');
  }
  const replay = qualifyReplay(input);
  return {
    originalQuery: input.originalQuery,
    expandedQueries: [...(input.expandedQueries ?? [])],
    adapterIds: [...(input.adapterIds ?? [])],
    filters: { ...(input.filters ?? {}) },
    pagination: [...(input.pagination ?? [])].map((p) => ({ ...p })),
    resultIdentifiers: [...(input.resultIdentifiers ?? [])],
    rankingInputs: { ...(input.rankingInputs ?? {}) },
    rateLimitEvents: [...(input.rateLimitEvents ?? [])].map((e) => ({ ...e })),
    cacheStatus: [...(input.cacheStatus ?? [])].map((c) => ({ ...c })),
    coverageLimitations: [...(input.coverageLimitations ?? [])],
    replay,
  };
}

// ---------------------------------------------------------------------------
// verifyReplay：同输入重放 → identifiers 集合确定性比对
// ---------------------------------------------------------------------------

export interface ReplayOutcome {
  readonly outcome: 'REPLAY_OK' | 'REPLAY_DIVERGENT' | 'NOT_REPLAYABLE';
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly reason: string;
}

function identifierSet(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/**
 * 重放验证：lineage 记录的 resultIdentifiers vs 重放所得 identifiers 集合比对。
 * - lineage 不可完整重放 → NOT_REPLAYABLE（带原因，不假装可比）
 * - 集合相等（顺序无关，确定性排序）→ REPLAY_OK
 * - 否则 → REPLAY_DIVERGENT（missing/extra 精确列出）
 */
export function verifyReplay(lineage: RetrievalLineage, replayed: { resultIdentifiers: readonly string[] }): ReplayOutcome {
  if (!lineage.replay.replayable) {
    return {
      outcome: 'NOT_REPLAYABLE',
      missing: [],
      extra: [],
      reason: `lineage not fully replayable: ${lineage.replay.reasons.join('; ')}`,
    };
  }
  const recorded = identifierSet(lineage.resultIdentifiers);
  const actual = identifierSet(replayed.resultIdentifiers);
  const missing = recorded.filter((id) => !actual.includes(id));
  const extra = actual.filter((id) => !recorded.includes(id));
  if (missing.length === 0 && extra.length === 0) {
    return { outcome: 'REPLAY_OK', missing: [], extra: [], reason: `identifier sets match (${recorded.length} ids)` };
  }
  return {
    outcome: 'REPLAY_DIVERGENT',
    missing,
    extra,
    reason: `identifier sets diverge: ${missing.length} missing, ${extra.length} extra`,
  };
}

// ---------------------------------------------------------------------------
// detectPaginationDrift：分页漂移检出
// ---------------------------------------------------------------------------

export interface PaginationDrift {
  readonly adapterId: string;
  readonly query: string;
  readonly field: 'cursor' | 'timestamp' | 'page' | 'hasMore';
  readonly recorded: string;
  readonly replayed: string;
}

export interface PaginationDriftResult {
  readonly status: 'CONSISTENT' | 'REPLAY_DIVERGENT';
  readonly drifts: readonly PaginationDrift[];
}

function paginationKey(p: PaginationRecord): string {
  return `${p.adapterId}::${p.query}::${p.page ?? 1}`;
}

/** 可选字段归一化（undefined → 占位符，供确定性字符串比较）。 */
function norm(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

/** 单条分页记录的字段对（recorded vs replayed 的字符串化值）。 */
function fieldPairs(rec: PaginationRecord, rep: PaginationRecord): readonly [PaginationDrift['field'], string, string][] {
  return [
    ['cursor', norm(rec.cursor, '<none>'), norm(rep.cursor, '<none>')],
    ['timestamp', norm(rec.timestamp, '<none>'), norm(rep.timestamp, '<none>')],
    ['page', norm(rec.page === undefined ? undefined : String(rec.page), '1'), norm(rep.page === undefined ? undefined : String(rep.page), '1')],
    ['hasMore', norm(rec.hasMore === undefined ? undefined : String(rec.hasMore), 'false'), norm(rep.hasMore === undefined ? undefined : String(rep.hasMore), 'false')],
  ];
}

/** 单条分页记录的字段级漂移（replay 缺失 → absent 漂移）。复杂度受预算约束（≤15）。 */
function recordFieldDrifts(rec: PaginationRecord, rep: PaginationRecord | undefined): PaginationDrift[] {
  if (rep === undefined) {
    return [{ adapterId: rec.adapterId, query: rec.query, field: 'page', recorded: paginationKey(rec), replayed: '<absent>' }];
  }
  const drifts: PaginationDrift[] = [];
  for (const [field, recorded, replayed] of fieldPairs(rec, rep)) {
    if (recorded !== replayed) {
      drifts.push({ adapterId: rec.adapterId, query: rec.query, field, recorded, replayed });
    }
  }
  return drifts;
}

/**
 * 分页漂移检测：按 (adapterId, query, page) 对齐 recorded vs replayed 分页记录，
 * cursor/timestamp/page/hasMore 任一不一致 → REPLAY_DIVERGENT（带漂移明细）。
 * 确定性：字段级字符串化比较，无顺序依赖。
 */
export function detectPaginationDrift(
  recorded: readonly PaginationRecord[],
  replayed: readonly PaginationRecord[],
): PaginationDriftResult {
  const drifts: PaginationDrift[] = [];
  const replayMap = new Map(replayed.map((p) => [paginationKey(p), p]));
  const recordedKeys = new Set(recorded.map(paginationKey));
  for (const rec of recorded) {
    drifts.push(...recordFieldDrifts(rec, replayMap.get(paginationKey(rec))));
  }
  for (const rep of replayed) {
    if (!recordedKeys.has(paginationKey(rep))) {
      drifts.push({ adapterId: rep.adapterId, query: rep.query, field: 'page', recorded: '<absent>', replayed: paginationKey(rep) });
    }
  }
  return { status: drifts.length === 0 ? 'CONSISTENT' : 'REPLAY_DIVERGENT', drifts };
}

// ---------------------------------------------------------------------------
// 记录器 + withLineage 包装器（additive，无侵入）
// ---------------------------------------------------------------------------

export interface LineageRecorder {
  /** 记录一次成功的适配器查询（identifiers + 缓存态 + 可得分页元数据）。 */
  recordQuery(args: {
    readonly adapterId: string;
    readonly query: string;
    readonly documents: readonly RetrievedDocument[];
    readonly at: string;
    readonly cursor?: string;
    readonly page?: number;
    readonly pageSize?: number;
    readonly hasMore?: boolean;
    readonly cacheOverride?: CacheStatusRecord['status'];
  }): void;
  /** 记录 rate-limit/degraded/failure 事件（failure 不吞——调用方仍应抛出）。 */
  recordEvent(event: RateLimitEvent): void;
  addCoverageLimitation(note: string): void;
  /** 组装谱系（buildLineage 之上叠加已记录数据）。 */
  toLineage(base: Omit<LineageInput, 'resultIdentifiers' | 'adapterIds' | 'pagination' | 'cacheStatus' | 'rateLimitEvents' | 'coverageLimitations'>): RetrievalLineage;
}

/** 创建谱系记录器（纯内存累积，确定性）。 */
export function createLineageRecorder(): LineageRecorder {
  const queries: {
    adapterId: string;
    query: string;
    documents: readonly RetrievedDocument[];
    at: string;
    cursor?: string;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
    cacheStatus: CacheStatusRecord['status'];
  }[] = [];
  const events: RateLimitEvent[] = [];
  const limitations: string[] = [];
  const adapterIds = new Set<string>();

  return {
    recordQuery({ adapterId, query, documents, at, cursor, page, pageSize, hasMore, cacheOverride }) {
      adapterIds.add(adapterId);
      const anyFromCache = documents.some((d) => d.retrievedFrom === 'cache');
      const status: CacheStatusRecord['status'] =
        cacheOverride ?? (documents.length === 0 ? 'unknown' : anyFromCache ? 'hit' : 'miss');
      queries.push({
        adapterId,
        query,
        documents,
        at,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
        ...(hasMore !== undefined ? { hasMore } : {}),
        cacheStatus: status,
      });
      if (cursor === undefined) {
        limitations.push(`adapter '${adapterId}' exposes no cursor for query '${query}' — pagination recorded as page-level only`);
      }
    },
    recordEvent(event) {
      events.push({ ...event });
    },
    addCoverageLimitation(note) {
      limitations.push(note);
    },
    toLineage(base) {
      const resultIdentifiers = queries.flatMap((q) => q.documents.map((d) => d.documentId));
      const pagination = queries.map((q) => ({
        adapterId: q.adapterId,
        query: q.query,
        ...(q.page !== undefined ? { page: q.page } : {}),
        ...(q.cursor !== undefined ? { cursor: q.cursor } : {}),
        timestamp: q.at,
        ...(q.pageSize !== undefined ? { pageSize: q.pageSize } : {}),
        ...(q.hasMore !== undefined ? { hasMore: q.hasMore } : {}),
      }));
      const cacheStatus = queries.map((q) => ({ adapterId: q.adapterId, query: q.query, status: q.cacheStatus }));
      return buildLineage({
        ...base,
        adapterIds: [...adapterIds],
        resultIdentifiers,
        pagination,
        cacheStatus,
        rateLimitEvents: events,
        coverageLimitations: limitations,
      });
    },
  };
}

/**
 * 无侵入 additive 包装器：包住 RetrievalAdapter，成功记录谱系；抛错记录 failure
 * 事件后【重新抛出】——绝静默吞错是红线（source failure 必须可见）。
 */
export function withLineage(adapter: RetrievalAdapter, recorder: LineageRecorder, at: string): RetrievalAdapter {
  return {
    source: adapter.source,
    sourceName: adapter.sourceName,
    async retrieve(query: RetrievalQuery): Promise<readonly RetrievedDocument[]> {
      try {
        const documents = await adapter.retrieve(query);
        recorder.recordQuery({ adapterId: adapter.source, query: query.text, documents, at });
        return documents;
      } catch (err) {
        recorder.recordEvent({
          at,
          adapterId: adapter.source,
          kind: 'failure',
          detail: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
