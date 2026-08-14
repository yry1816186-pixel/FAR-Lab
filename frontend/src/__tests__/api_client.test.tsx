import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useHealth,
  useReady,
  useEvidence,
  useEvidenceChain,
  useVerdict,
  useVerdictByHypothesis,
  useVerdictList,
  useReport,
  useHypothesize,
  __testables,
} from '@/lib/api_client';
import type { HealthResponse, HonestVerdictDto, VerdictNode } from '@/lib/types';

// ---------- 测试包装器 ----------

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** V1 端点响应（P1-3 契约统一：{ ok: true, data: T } 信封）。 */
function jsonV1Response(body: unknown, status = 200): Response {
  return jsonResponse({ ok: true, data: body }, status);
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------- Fixtures（后端真实 DTO 形态·字段名 verbatim）----------

const falsificationSpec = {
  prediction: 'macro_f1 >= 0.8',
  metric: 'macro_f1',
  falsificationThreshold: 0.8,
  thresholdSemantics: 'gt' as const,
};

const sourceAnchor = {
  gitCommitSha: 'g'.repeat(40),
  isoTimestamp: '2026-01-01T00:00:00Z',
};

/**
 * HonestVerdictDto — GET /api/v1/verdict/* 形态（verdict route toDto 映射）：
 * parentNodeId + decision，无 replayProver。
 */
function verdictDto(overrides: Record<string, unknown> = {}): HonestVerdictDto {
  return {
    verdictId: 'v-001',
    evidenceId: 'ev-001',
    parentNodeId: null,
    nodeKind: 'hypothesis',
    decision: 'UNTESTED',
    falsificationSpec,
    thresholdSpec: null,
    metricValue: null,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: 'no evidence yet',
    sourceAnchor,
    prevHash: 'prev-hash',
    currentHash: 'curr-hash',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    decisionTrace: null,
    ...overrides,
  } as HonestVerdictDto;
}

/**
 * VerdictNode (raw) — POST /api/v1/hypothesize 形态（executeLoop 直接序列化 LoopState）：
 * parentVerdictId + verdict + replayProver。
 */
function verdictNodeRaw(overrides: Record<string, unknown> = {}): VerdictNode {
  return {
    verdictId: 'v-001',
    evidenceId: 'ev-001',
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: 'UNTESTED',
    falsificationSpec,
    thresholdSpec: null,
    metricValue: null,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: 'no evidence yet',
    sourceAnchor,
    replayProver: null,
    prevHash: 'prev-hash',
    currentHash: 'curr-hash',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as VerdictNode;
}

const HEAD_HASH = 'a'.repeat(64);

// ---------- 探针（bare root，无 /api/v1 前缀·spec 24 §0#3）----------

describe('api_client probes (bare root)', () => {
  it('useHealth 以 GET /health 调用 fetch', async () => {
    const health: HealthResponse = {
      status: 'ok',
      service: 'far-chain-api',
      timestamp: '2026-06-27T00:00:00Z',
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(health));
    const { result } = renderHook(() => useHealth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/health');
    expect(result.current.data).toEqual(health);
  });

  it('useReady 以 GET /ready 调用 fetch', async () => {
    const ready = {
      status: 'ready',
      service: 'far-chain-api',
      checks: { database: 'ok' },
      timestamp: '2026-06-27T00:00:00Z',
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(ready));
    const { result } = renderHook(() => useReady(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/ready');
    expect(result.current.data?.checks.database).toBe('ok');
  });
});

// ---------- App endpoints（/api/v1 前缀·spec 24 §0#2）----------

describe('api_client app endpoints (/api/v1 prefix)', () => {
  it('useEvidence 以 GET /api/v1/evidence/:id 调用 fetch', async () => {
    const ev = {
      evidenceId: 'ev-001',
      callRecordSeq: 0,
      stageId: 'stage3_hypothesis',
      payloadKind: 'hypothesis',
      evidencePayload: { text: 'demo' },
      sourceAnchor,
      createdAt: '2026-01-01T00:00:00Z',
      // verdictNode 契约字段（audit [G]）：证据条目无关联裁决时为 null
      verdictNode: null,
    };
    vi.mocked(fetch).mockResolvedValue(jsonV1Response(ev));
    const { result } = renderHook(() => useEvidence('ev-001'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/evidence/ev-001');
    expect(result.current.data?.evidenceId).toBe('ev-001');
    expect(result.current.data?.sourceAnchor).toEqual(sourceAnchor);
    // [G] 契约对齐：前端 EvidenceResponse.verdictNode 类型安全可访问
    expect(result.current.data?.verdictNode).toBeNull();
  });

  it('useEvidenceChain 以 GET /api/v1/evidence/chain/:headHash 调用 fetch', async () => {
    const chain = {
      headHash: HEAD_HASH,
      callRecord: {
        seq: 0,
        stageId: 'stage3_hypothesis',
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        modelId: 'offline-replay',
        reproHash: 'r'.repeat(64),
        gitCommitSha: 'g'.repeat(40),
        isoTimestamp: '2026-01-01T00:00:00Z',
        finishReason: 'stop',
        usageTokensTotal: null,
        prevHash: 'p'.repeat(64),
        currentHash: HEAD_HASH,
        createdAt: '2026-01-01T00:00:00Z',
      },
      graphSubtree: { rootId: 'node-001', nodes: [], edges: [] },
    };
    vi.mocked(fetch).mockResolvedValue(jsonV1Response(chain));
    const { result } = renderHook(() => useEvidenceChain(HEAD_HASH), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`/api/v1/evidence/chain/${HEAD_HASH}`);
    expect(result.current.data?.callRecord?.currentHash).toBe(HEAD_HASH);
  });

  it('useVerdict 以 GET /api/v1/verdict/:id 调用 fetch（HonestVerdictDto·decision 字段）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonV1Response(verdictDto()));
    const { result } = renderHook(() => useVerdict('v-001'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/verdict/v-001');
    expect(result.current.data?.verdictId).toBe('v-001');
    expect(result.current.data?.decision).toBe('UNTESTED');
    expect(result.current.data?.parentNodeId).toBeNull();
  });

  it('useVerdictByHypothesis 以 GET /api/v1/verdict/by_hypothesis/:hypoId 调用（单对象·非数组）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonV1Response(verdictDto({ verdictId: 'v-002' })));
    const { result } = renderHook(() => useVerdictByHypothesis('hypo-1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/verdict/by_hypothesis/hypo-1');
    // 后端返回单个 HonestVerdictDto（非数组）——直接消费 verdictId
    expect(result.current.data?.verdictId).toBe('v-002');
    expect(result.current.data?.decision).toBe('UNTESTED');
  });

  it('useVerdictList 以 GET /api/v1/verdict?limit&offset 调用（分页）', async () => {
    const list = {
      items: [verdictDto(), verdictDto({ verdictId: 'v-002' })],
      count: 2,
      limit: 100,
      offset: 0,
    };
    vi.mocked(fetch).mockResolvedValue(jsonV1Response(list));
    const { result } = renderHook(() => useVerdictList(100, 0), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/verdict?limit=100&offset=0');
    expect(result.current.data?.items).toHaveLength(2);
    expect(result.current.data?.count).toBe(2);
  });

  it('useReport 以 GET /api/v1/report/:runId 调用（HTML 字符串·非 JSON）', async () => {
    const html = '<!DOCTYPE html><html><body><h1>FAR-Lab Report</h1></body></html>';
    vi.mocked(fetch).mockResolvedValue(textResponse(html));
    const { result } = renderHook(() => useReport('run-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/report/run-1');
    expect(result.current.data).toBe(html);
  });

  it('useHypothesize 以 POST /api/v1/hypothesize 提交（raw honestVerdict 形态·verbatim 消费）', async () => {
    const hypoResp = {
      loopState: {
        runId: 'run-1',
        iterationsCompleted: 1,
        terminated: true,
        terminationReason: 'feedback_converged',
        artifacts: [],
        verdictNode: verdictNodeRaw(),
        error: null,
      },
      graphSubtree: {
        rootId: 'node-001',
        nodes: [
          {
            nodeId: 'node-001',
            evidenceId: 'ev-001',
            parentNodeId: null,
            nodeKind: 'hypothesis',
            decision: 'UNTESTED',
            metricValue: null,
            conflictingEvidenceCount: 0,
            scopeSlipText: null,
            untestedReason: null,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        edges: [],
      },
      honestVerdict: verdictNodeRaw({ verdictId: 'v-001', verdict: 'UNTESTED' }),
      reproHash: 'repro-hash-123',
    };
    vi.mocked(fetch).mockResolvedValue(jsonV1Response(hypoResp));
    const { result } = renderHook(() => useHypothesize(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ researchInput: '示例研究输入' });
    });
    // react-query v5：mutateAsync resolve 后 hook 的 data 状态需一次 re-render 才可见。
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // 校验 POST /api/v1/hypothesize + 请求体（researchInput + 审计 P0-2 客户端幂等键）
    const callArgs = vi.mocked(fetch).mock.calls[0];
    expect(callArgs[0]).toBe('/api/v1/hypothesize');
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe('POST');
    const sentBody = JSON.parse(init.body as string) as { researchInput: string; idempotencyKey?: string };
    expect(sentBody.researchInput).toBe('示例研究输入');
    expect(sentBody.idempotencyKey).toMatch(/^v1-[0-9a-f]{16}$/);
    // 同输入 → 同幂等键（确定性·防双击重复执行）
    const keyA = sentBody.idempotencyKey;
    const keyB = __testables.hypothesizeIdempotencyKey({ researchInput: '示例研究输入' });
    expect(keyA).toBe(keyB);
    // 校验后端字段 verbatim 消费（无 honestyVerdict* aliasing）
    expect(result.current.data?.reproHash).toBe('repro-hash-123');
    expect(result.current.data?.honestVerdict?.verdictId).toBe('v-001');
    expect(result.current.data?.honestVerdict?.verdict).toBe('UNTESTED');
    expect(result.current.data?.honestVerdict?.parentVerdictId).toBeNull();
    expect(result.current.data?.loopState.verdictNode?.verdict).toBe('UNTESTED');
    expect(result.current.data?.graphSubtree.nodes[0]?.nodeId).toBe('node-001');
  });
});

// ---------- fetch helpers（__testables）----------

describe('api_client fetch helpers (__testables)', () => {
  it('API_BASE_URL 默认为相对基址（same-origin·vite proxy / 反向代理解析）', () => {
    expect(__testables.API_BASE_URL).toBe('');
  });

  it('ApiError.guidance() 提取 detail.guidance（503 fail-closed 指引）·缺失/非字符串时为 null', () => {
    const withGuidance = new __testables.ApiError(
      503,
      'live profile needs an API key in the environment (see far doctor)',
      'research_live_profile_unavailable',
      null,
      { profile: 'auto', guidance: 'set DASHSCOPE_API_KEY for live runs' },
    );
    expect(withGuidance.guidance()).toBe('set DASHSCOPE_API_KEY for live runs');
    // detail 缺失
    expect(new __testables.ApiError(500, 'boom', 'E').guidance()).toBeNull();
    // detail 存在但 guidance 非字符串
    expect(
      new __testables.ApiError(500, 'boom', 'E', null, { guidance: 42 }).guidance(),
    ).toBeNull();
  });

  it('fetchJson 非 2xx 响应抛错（含状态码）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('boom', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    );
    await expect(__testables.fetchJson<{ a: number }>('/api/v1/health')).rejects.toThrow(/API 500/);
  });

  it('fetchText 返回原始文本（HTML body）', async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse('<html>report</html>'));
    const out = await __testables.fetchText('/api/v1/report/run-1');
    expect(out).toBe('<html>report</html>');
  });
});

// ---------- composeApiUrl（极端 URL 构造·__testables）----------
//
// 验证 API_BASE_URL 含 query 参数 / pathname 前缀 / path 含 query / extraParams 覆盖
// 等 4 类极端情形。优先级语义：base 自带 query < path 内 query < extraParams。

describe('api_client composeApiUrl (极端 URL 构造)', () => {
  const compose = __testables.composeApiUrl;

  it('默认 base + 纯 path', () => {
    expect(compose('http://localhost:3000', '/api/v1/verdict')).toBe(
      'http://localhost:3000/api/v1/verdict',
    );
  });

  it('默认 base + path 含 query（fetchJson verdictList 路径形态）', () => {
    expect(compose('http://localhost:3000', '/api/v1/verdict?limit=100&offset=0')).toBe(
      'http://localhost:3000/api/v1/verdict?limit=100&offset=0',
    );
  });

  it('base 含 query 参数 → 保留并合并到 path 后', () => {
    expect(compose('http://localhost:3000?token=abc', '/api/v1/events/stream')).toBe(
      'http://localhost:3000/api/v1/events/stream?token=abc',
    );
  });

  it('base 含 query + path 含 query → 二者合并', () => {
    expect(compose('http://localhost:3000?token=abc', '/api/v1/verdict?limit=100')).toBe(
      'http://localhost:3000/api/v1/verdict?limit=100&token=abc',
    );
  });

  it('base 含 query + path 含同名 query → path 优先（base 不覆盖）', () => {
    expect(compose('http://localhost:3000?limit=99', '/api/v1/verdict?limit=100')).toBe(
      'http://localhost:3000/api/v1/verdict?limit=100',
    );
  });

  it('base 含 pathname 前缀 → 前缀保留', () => {
    expect(compose('http://localhost:3000/v1', '/api/v1/verdict')).toBe(
      'http://localhost:3000/v1/api/v1/verdict',
    );
  });

  it('base 含 pathname 前缀且带尾斜杠 → 不产生双斜杠', () => {
    expect(compose('http://localhost:3000/v1/', '/api/v1/verdict')).toBe(
      'http://localhost:3000/v1/api/v1/verdict',
    );
  });

  it('extraParams 覆盖 base 与 path 的同名参数（最高优先级）', () => {
    expect(
      compose('http://localhost:3000?token=base', '/api/v1/verdict?token=path', { token: 'extra' }),
    ).toBe('http://localhost:3000/api/v1/verdict?token=extra');
  });

  it('extraParams 新增参数 + base query 保留（useAgentEventStream 形态）', () => {
    expect(
      compose('http://localhost:3000?token=abc', '/api/v1/events/stream', {
        runId: 'r1',
        replay: 'true',
      }),
    ).toBe('http://localhost:3000/api/v1/events/stream?token=abc&runId=r1&replay=true');
  });

  it('path 无前导斜杠 → 自动补斜杠', () => {
    expect(compose('http://localhost:3000', 'api/v1/verdict')).toBe(
      'http://localhost:3000/api/v1/verdict',
    );
  });

  it('extraParams 为空对象 → 与 undefined 等价（不污染 URL）', () => {
    expect(compose('http://localhost:3000', '/api/v1/verdict', {})).toBe(
      'http://localhost:3000/api/v1/verdict',
    );
  });

  // ---------- same-origin 相对基址（'' · 默认）----------

  it("base 为 ''（默认·same-origin）→ 返回相对 URL", () => {
    expect(compose('', '/api/v1/verdict')).toBe('/api/v1/verdict');
  });

  it("base 为 '' + path 无前导斜杠 → 补斜杠后仍为相对 URL", () => {
    expect(compose('', 'api/v1/verdict')).toBe('/api/v1/verdict');
  });

  it("base 为 '' + path 含 query + extraParams（SSE 订阅形态）→ query 合并保留", () => {
    expect(compose('', '/api/v1/events/stream', { runId: 'r1', replay: 'true' })).toBe(
      '/api/v1/events/stream?runId=r1&replay=true',
    );
  });
});
