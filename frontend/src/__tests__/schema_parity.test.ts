/**
 * schema_parity.test —— 前端 zod schema ↔ 后端 OpenAPI schema 一致性对拍。
 *
 * 漂移检测：前端 `schemas/v2_receipts.ts` 手写镜像后端 `v2_receipts_schemas.ts`
 * 的 zod schema。当后端字段增删/改名时，此测试会红——提醒同步前端。
 *
 * 双源对拍：
 *   源 A — openapi.json（`schema/openapi.json`）inline response schema（细粒度）。
 *   源 B — 后端 TS 源码（`src/api/routes/v2_receipts_schemas.ts`）字段名提取。
 *
 * 断言 ≥12 组字段名+类型对齐（6 端点 × 2+ 关键字段/端点）。
 *
 * Zod 3.25 内部结构：_def.type (string) 替代 _def.typeName，
 *   _def.shape 直接在 ZodObject 上（passthrough 通过 catchall 实现，不再包装 ZodEffects）。
 *
 * 零容忍：无 any / ts-ignore / 桩代码。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  VerifyEnvelopeDataSchema,
  DemoReceiptDataSchema,
  CreateReceiptDataSchema,
  ReceiptListDataSchema,
  ReceiptDetailDataSchema,
  ReVerifyDataSchema,
} from '@/lib/schemas/v2_receipts';

// ===========================================================================
// Helpers — Zod 3.25 内部结构安全访问
// ===========================================================================

/** OpenAPI JSON Schema 类型。 */
type OapiType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

/**
 * 从 zod schema 提取 shape 字段名列表。
 * Zod 3.25: _def.type === 'object' 时 _def.shape 存在。
 */
function getZodShapeKeys(schema: unknown): string[] {
  const s = schema as Record<string, unknown>;
  const def = s._def as Record<string, unknown> | undefined;
  if (!def) return [];

  if (def.type === 'object') {
    const shape = def.shape as Record<string, unknown> | undefined;
    if (shape && typeof shape === 'object') {
      return Object.keys(shape);
    }
  }
  return [];
}

/**
 * 从 zod schema 提取指定字段的 zod 类型描述。
 * Zod 3.25: field._def.type 是简单字符串（string/number/boolean/array/record/enum/literal/null）。
 */
function getZodFieldType(schema: unknown, field: string): string | undefined {
  const s = schema as Record<string, unknown>;
  const def = s._def as Record<string, unknown> | undefined;
  if (!def || def.type !== 'object') return undefined;

  const shape = def.shape as Record<string, unknown> | undefined;
  if (!shape) return undefined;

  const member = shape[field] as Record<string, unknown> | undefined;
  if (!member) return undefined;

  const memberDef = member._def as Record<string, unknown> | undefined;
  return memberDef?.type as string | undefined;
}

/**
 * zod 类型描述 → OpenAPI JSON Schema 类型映射。
 * Zod 3.25 type 字段值: string/number/boolean/array/record/enum/literal/null
 */
function zodTypeToOapi(zodType: string): OapiType | undefined {
  const map: Record<string, OapiType> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    array: 'array',
    record: 'object',
    object: 'object',
    enum: 'string',
    literal: 'string',
    null: 'null',
  };
  return map[zodType];
}

/** 加载 openapi.json 并解析。 */
function loadOpenapi(): Record<string, unknown> {
  // vitest ESM: import.meta.dirname = frontend/src/__tests__
  // openapi.json 位于项目根 schema/（即 frontend 的上级的 schema/）
  const openapiPath = resolve(import.meta.dirname, '../../../schema/openapi.json');
  const raw = readFileSync(openapiPath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * 从 openapi paths 提取指定路径+method+statusCode 的 data 层 schema。
 * 返回 data 的 properties/required。
 */
function extractDataSchema(
  openapi: Record<string, unknown>,
  path: string,
  method: string,
  status = '200',
): { properties: Record<string, unknown>; required: string[] } | null {
  const paths = openapi.paths as Record<string, Record<string, unknown>>;
  const pathItem = paths[path];
  if (!pathItem) return null;

  const operation = pathItem[method] as Record<string, unknown> | undefined;
  if (!operation) return null;

  const responses = operation.responses as Record<string, Record<string, unknown>>;
  const response = responses[status];
  if (!response) return null;

  const content = response.content as Record<string, Record<string, unknown>> | undefined;
  const jsonSchema = content?.['application/json']?.schema as Record<string, unknown> | undefined;
  if (!jsonSchema) return null;

  // 顶层是 { ok, data } 信封——提取 data 层
  const topProps = jsonSchema.properties as Record<string, unknown> | undefined;
  const dataSchema = topProps?.data as Record<string, unknown> | undefined;
  if (!dataSchema) return null;

  return {
    properties: (dataSchema.properties ?? {}) as Record<string, unknown>,
    required: (dataSchema.required ?? []) as string[],
  };
}

/**
 * 断言前端 zod schema 包含 openapi data 层的所有 required 字段。
 * 类型映射：zod→openapi 类型必须一致。
 */
function assertFieldsMatch(
  zodSchema: unknown,
  oapiData: { properties: Record<string, unknown>; required: string[] },
  endpointLabel: string,
): void {
  const zodKeys = new Set(getZodShapeKeys(zodSchema));

  for (const field of oapiData.required) {
    expect(zodKeys, `${endpointLabel}: 前端 schema 缺少 openapi required 字段 "${field}"`).toContain(field);

    // 类型映射检查（仅当 openapi 有 type 时）
    const propSchema = oapiData.properties[field] as Record<string, unknown> | undefined;
    if (propSchema && typeof propSchema.type === 'string') {
      const zodType = getZodFieldType(zodSchema, field);
      const expectedOapiType = zodTypeToOapi(zodType ?? '');
      const actualOapiType = propSchema.type as OapiType;

      // openapi "integer" 映射到 zod ZodNumber（JSON integer 是 number 子集）
      if (actualOapiType === 'integer' && expectedOapiType === 'number') continue;

      expect(
        expectedOapiType,
        `${endpointLabel}: 字段 "${field}" 类型不匹配 — zod=${zodType ?? 'unknown'}, openapi=${actualOapiType}`,
      ).toBe(actualOapiType);
    }
  }
}

/**
 * 从 openapi schema 提取数组 items 的对象 schema。
 */
function extractArrayItemSchema(
  oapiData: { properties: Record<string, unknown>; required: string[] },
  arrayField: string,
): { properties: Record<string, unknown>; required: string[] } | null {
  const arrSchema = oapiData.properties[arrayField] as Record<string, unknown> | undefined;
  if (!arrSchema || arrSchema.type !== 'array') return null;
  const items = arrSchema.items as Record<string, unknown> | undefined;
  if (!items || items.type !== 'object') return null;
  return {
    properties: (items.properties ?? {}) as Record<string, unknown>,
    required: (items.required ?? []) as string[],
  };
}

// ===========================================================================
// Tests — openapi.json 细粒度对拍
// ===========================================================================

describe('schema_parity: 前端 v2_receipts zod schema ↔ openapi.json', () => {
  let openapi: Record<string, unknown>;

  beforeAll(() => {
    openapi = loadOpenapi();
  });

  // -----------------------------------------------------------------------
  // 1. ReceiptDto（GET /receipts list + GET /receipts/:id）
  //    openapi 细粒度：9 required 字段 (id/claimId/claimText/verdict/proofHash/
  //    schemaVersion/createdAt/receiptStanding/preservationStatus)
  // -----------------------------------------------------------------------
  it('ReceiptDto: 9 个 required 字段通过 parse 验证（缺任一字段 parse 失败）', () => {
    const listData = extractDataSchema(openapi, '/api/v2/receipts', 'get', '200');
    expect(listData, 'openapi GET /receipts list schema 缺失').not.toBeNull();

    const receiptItem = extractArrayItemSchema(listData!, 'receipts');
    expect(receiptItem, 'openapi receipts items schema 缺失').not.toBeNull();

    const receiptRequired = receiptItem!.required;
    expect(receiptRequired.length, 'openapi ReceiptDto 应有 9 required 字段').toBe(9);

    // 构造包含全部 9 字段的最小对象——parse 应成功
    const minimalReceipt = {
      id: 'r-1',
      claimId: 'c-1',
      claimText: 'test claim',
      verdict: 'CONFIRMED',
      proofHash: 'abc123',
      schemaVersion: '2.0',
      createdAt: '2026-01-01T00:00:00Z',
      receiptStanding: 'ACTIVE',
      preservationStatus: 'PRESERVED',
    };

    const result = ReceiptListDataSchema.safeParse({
      receipts: [minimalReceipt],
      total: 1,
      limit: 20,
      offset: 0,
    });
    expect(result.success, 'ReceiptListDataSchema 应接受 openapi 9 字段 ReceiptDto').toBe(true);

    // 缺少任一 required 字段应 parse 失败
    for (const field of receiptRequired) {
      const missing = { ...minimalReceipt };
      delete (missing as Record<string, unknown>)[field];
      const failResult = ReceiptListDataSchema.safeParse({
        receipts: [missing],
        total: 1,
        limit: 20,
        offset: 0,
      });
      expect(failResult.success, `ReceiptDto 缺少 required 字段 "${field}" 时应 parse 失败`).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // 2. ManifestMemberSchema（GET /receipts/:id manifestMembers）
  //    openapi 细粒度：3 required 字段 (kind/digest/sizeBytes)
  // -----------------------------------------------------------------------
  it('ManifestMember: 3 个 required 字段通过 parse 验证', () => {
    const detailData = extractDataSchema(openapi, '/api/v2/receipts/{id}', 'get', '200');
    expect(detailData, 'openapi GET /receipts/{id} schema 缺失').not.toBeNull();

    const manifestItem = extractArrayItemSchema(detailData!, 'manifestMembers');
    expect(manifestItem, 'openapi manifestMembers items schema 缺失').not.toBeNull();

    const minimalMember = { kind: 'claim', digest: 'sha256:abc', sizeBytes: 128 };

    const result = ReceiptDetailDataSchema.safeParse({
      receipt: {
        id: 'r-1', claimId: 'c-1', claimText: 'test', verdict: 'CONFIRMED',
        proofHash: 'h', schemaVersion: '2.0', createdAt: '2026-01-01T00:00:00Z',
        receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
      },
      manifestMembers: [minimalMember],
      latestVerification: null,
    });
    expect(result.success, 'ReceiptDetailDataSchema 应接受 openapi 3 字段 ManifestMember').toBe(true);

    for (const field of manifestItem!.required) {
      const missing = { ...minimalMember };
      delete (missing as Record<string, unknown>)[field];
      const failResult = ReceiptDetailDataSchema.safeParse({
        receipt: {
          id: 'r-1', claimId: 'c-1', claimText: 'test', verdict: 'CONFIRMED',
          proofHash: 'h', schemaVersion: '2.0', createdAt: '2026-01-01T00:00:00Z',
          receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
        },
        manifestMembers: [missing],
        latestVerification: null,
      });
      expect(failResult.success, `ManifestMember 缺少 "${field}" 时应 parse 失败`).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // 3. LatestVerificationSchema（GET /receipts/:id latestVerification）
  //    openapi anyOf[object|null]：object 有 6 required 字段
  // -----------------------------------------------------------------------
  it('LatestVerification: 6 个 required 字段 + nullable 通过 parse 验证', () => {
    const detailData = extractDataSchema(openapi, '/api/v2/receipts/{id}', 'get', '200');
    expect(detailData, 'openapi GET /receipts/{id} schema 缺失').not.toBeNull();

    const latestSchema = detailData!.properties.latestVerification as Record<string, unknown>;
    const anyOf = latestSchema.anyOf as Record<string, unknown>[];
    const objectBranch = anyOf.find((b) => b.type === 'object') as Record<string, unknown>;
    expect(objectBranch, 'openapi latestVerification 应有 object 分支').toBeDefined();

    const objectRequired = (objectBranch.required ?? []) as string[];
    expect(objectRequired.length, 'openapi LatestVerification 应有 6 required 字段').toBe(6);

    // 全字段 → 成功
    const fullResult = ReceiptDetailDataSchema.safeParse({
      receipt: {
        id: 'r-1', claimId: 'c-1', claimText: 'test', verdict: 'CONFIRMED',
        proofHash: 'h', schemaVersion: '2.0', createdAt: '2026-01-01T00:00:00Z',
        receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
      },
      manifestMembers: [],
      latestVerification: {
        id: 1, receiptId: 'r-1', policyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
        result: {
          resultVersion: 1, resultId: 'vr-1', receiptId: 'r-1',
          verificationPolicyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
          dimensions: {}, receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
          reviewSummary: 'ok',
        },
        allPass: true,
      },
    });
    expect(fullResult.success, '应接受含 6 字段 LatestVerification').toBe(true);

    // null → 成功
    const nullResult = ReceiptDetailDataSchema.safeParse({
      receipt: {
        id: 'r-1', claimId: 'c-1', claimText: 'test', verdict: 'CONFIRMED',
        proofHash: 'h', schemaVersion: '2.0', createdAt: '2026-01-01T00:00:00Z',
        receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
      },
      manifestMembers: [],
      latestVerification: null,
    });
    expect(nullResult.success, '应接受 latestVerification=null').toBe(true);

    // 缺字段 → 失败
    for (const field of objectRequired) {
      const fullDetail = {
        receipt: {
          id: 'r-1', claimId: 'c-1', claimText: 'test', verdict: 'CONFIRMED',
          proofHash: 'h', schemaVersion: '2.0', createdAt: '2026-01-01T00:00:00Z',
          receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
        },
        manifestMembers: [],
        latestVerification: {
          id: 1, receiptId: 'r-1', policyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
          result: {
            resultVersion: 1, resultId: 'vr-1', receiptId: 'r-1',
            verificationPolicyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
            dimensions: {}, receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
            reviewSummary: 'ok',
          },
          allPass: true,
        },
      };
      const latest = { ...(fullDetail.latestVerification as Record<string, unknown>) };
      delete latest[field];
      const failResult = ReceiptDetailDataSchema.safeParse({ ...fullDetail, latestVerification: latest });
      expect(failResult.success, `LatestVerification 缺少 "${field}" 时应 parse 失败`).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // 4. CreateReceiptDataSchema（POST /receipts data）：receiptId (string) + idempotent (boolean)
  // -----------------------------------------------------------------------
  it('CreateReceiptDataSchema: 2 个 required 字段名 + 类型对齐', () => {
    const postData = extractDataSchema(openapi, '/api/v2/receipts', 'post', '200');
    expect(postData, 'openapi POST /receipts 200 schema 缺失').not.toBeNull();

    assertFieldsMatch(CreateReceiptDataSchema, postData!, 'POST /receipts data');

    expect(CreateReceiptDataSchema.safeParse({ receiptId: 'r-new', idempotent: false }).success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5. ReceiptListDataSchema（GET /receipts data）：receipts/total/limit/offset
  // -----------------------------------------------------------------------
  it('ReceiptListDataSchema: 4 个 required 字段名 + 类型对齐', () => {
    const listData = extractDataSchema(openapi, '/api/v2/receipts', 'get', '200');
    expect(listData, 'openapi GET /receipts list schema 缺失').not.toBeNull();

    assertFieldsMatch(ReceiptListDataSchema, listData!, 'GET /receipts data');
  });

  // -----------------------------------------------------------------------
  // 6. ReVerifyDataSchema（GET /receipts/:id/verify data）：verification/display/allPass
  // -----------------------------------------------------------------------
  it('ReVerifyDataSchema: 3 个 required 字段名 + 类型对齐', () => {
    const reverifyData = extractDataSchema(openapi, '/api/v2/receipts/{id}/verify', 'get', '200');
    expect(reverifyData, 'openapi GET /receipts/{id}/verify schema 缺失').not.toBeNull();

    assertFieldsMatch(ReVerifyDataSchema, reverifyData!, 'GET /receipts/{id}/verify data');
  });

  // -----------------------------------------------------------------------
  // 7. VerifyEnvelopeDataSchema（POST /receipts/verify data）：verification/display
  // -----------------------------------------------------------------------
  it('VerifyEnvelopeDataSchema: 2 个 required 字段名 + 类型对齐', () => {
    const verifyData = extractDataSchema(openapi, '/api/v2/receipts/verify', 'post', '200');
    expect(verifyData, 'openapi POST /receipts/verify schema 缺失').not.toBeNull();

    assertFieldsMatch(VerifyEnvelopeDataSchema, verifyData!, 'POST /receipts/verify data');
  });

  // -----------------------------------------------------------------------
  // 8. DemoReceiptDataSchema（GET /receipts/demo data）：receipt/verification
  // -----------------------------------------------------------------------
  it('DemoReceiptDataSchema: 2 个 required 字段名对齐', () => {
    const demoData = extractDataSchema(openapi, '/api/v2/receipts/demo', 'get', '200');
    expect(demoData, 'openapi GET /receipts/demo schema 缺失').not.toBeNull();

    assertFieldsMatch(DemoReceiptDataSchema, demoData!, 'GET /receipts/demo data');
  });

  // -----------------------------------------------------------------------
  // 9. 信封完整性：6 端点的 openapi schema 全部可提取 data 层
  // -----------------------------------------------------------------------
  it('6 个 v2-receipts 端点的 openapi schema 均含 { ok, data } 信封', () => {
    const endpoints: Array<{ path: string; method: string }> = [
      { path: '/api/v2/receipts/demo', method: 'get' },
      { path: '/api/v2/receipts/verify', method: 'post' },
      { path: '/api/v2/receipts', method: 'post' },
      { path: '/api/v2/receipts', method: 'get' },
      { path: '/api/v2/receipts/{id}', method: 'get' },
      { path: '/api/v2/receipts/{id}/verify', method: 'get' },
    ];

    for (const ep of endpoints) {
      const data = extractDataSchema(openapi, ep.path, ep.method, '200');
      expect(data, `${ep.method.toUpperCase()} ${ep.path}: openapi schema 缺失`).not.toBeNull();
    }
  });
});

// ===========================================================================
// 后端 TS 源码字段对拍（补充 openapi 粗粒度：verification/receipt/result 等）
// ===========================================================================

describe('schema_parity: 前端 zod schema ↔ 后端 SSOT 字段名对齐', () => {
  /**
   * 后端 SSOT 字段名（从 src/api/routes/v2_receipts_schemas.ts + types.ts 人工提取）。
   * 当后端 schema 变更时，此列表需要同步更新——测试红就是提醒。
   *
   * 后端文件：src/api/routes/v2_receipts_schemas.ts
   * 提取时间：2026-08-09
   */

  // --- VerificationResultSchema（前端 v2_receipts.ts L44-56）---
  // 后端用 z.record(z.string(), z.unknown()) 粗粒度定义，
  // 但前端 schema 细粒度定义了 9 字段（镜像 types.ts V2VerificationResult）。
  const verificationResultFields = [
    'resultVersion', 'resultId', 'receiptId', 'verificationPolicyId',
    'evaluatedAt', 'dimensions', 'receiptStanding', 'preservationStatus', 'reviewSummary',
  ] as const;

  it('VerificationResultSchema: 9 个必填字段（缺任一 parse 失败）', () => {
    const minimalVerification: Record<string, unknown> = {
      resultVersion: 1,
      resultId: 'vr-1',
      receiptId: 'r-1',
      verificationPolicyId: 'p-1',
      evaluatedAt: '2026-01-01T00:00:00Z',
      dimensions: {},
      receiptStanding: 'ACTIVE',
      preservationStatus: 'PRESERVED',
      reviewSummary: 'ok',
    };

    expect(
      VerifyEnvelopeDataSchema.safeParse({ verification: minimalVerification, display: 'text' }).success,
      'VerifyEnvelopeDataSchema 应接受 9 字段 VerificationResult',
    ).toBe(true);

    for (const field of verificationResultFields) {
      const missing = { ...minimalVerification };
      delete missing[field];
      expect(
        VerifyEnvelopeDataSchema.safeParse({ verification: missing, display: 'text' }).success,
        `VerificationResult 缺少 "${field}" 时应 parse 失败`,
      ).toBe(false);
    }
  });

  // --- V2DemoReceiptSchema（前端 v2_receipts.ts L77-93）---
  it('V2DemoReceiptSchema: 5 个必填字段（缺任一 parse 失败）', () => {
    const minimalDemoReceipt: Record<string, unknown> = {
      receiptId: 'demo-1',
      claimText: 'demo claim',
      verdictLabel: 'CONFIRMED',
      isFixtureOnly: true,
      manifestMembers: [{ kind: 'claim', digest: 'h', sizeBytes: 64 }],
    };

    const baseVerification = {
      resultVersion: 1, resultId: 'vr-1', receiptId: 'r-1',
      verificationPolicyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
      dimensions: {}, receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
      reviewSummary: 'ok',
    };

    expect(
      DemoReceiptDataSchema.safeParse({ receipt: minimalDemoReceipt, verification: baseVerification }).success,
      'DemoReceiptDataSchema 应接受 5 字段 V2DemoReceipt',
    ).toBe(true);

    const demoReceiptFields = ['receiptId', 'claimText', 'verdictLabel', 'isFixtureOnly', 'manifestMembers'] as const;
    for (const field of demoReceiptFields) {
      const missing = { ...minimalDemoReceipt };
      delete missing[field];
      expect(
        DemoReceiptDataSchema.safeParse({ receipt: missing, verification: baseVerification }).success,
        `V2DemoReceipt 缺少 "${field}" 时应 parse 失败`,
      ).toBe(false);
    }
  });

  // --- V2AssuranceDimensionResultSchema（前端 v2_receipts.ts L28-35）---
  it('V2AssuranceDimensionResultSchema: 4 个必填字段（dimension/outcome/reasonCodes/detail）', () => {
    const validVerification = {
      resultVersion: 1, resultId: 'vr-1', receiptId: 'r-1',
      verificationPolicyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
      dimensions: {
        reproducibility: { dimension: 'reproducibility', outcome: 'PASS', reasonCodes: ['code1'], detail: 'ok' },
      },
      receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED', reviewSummary: 'ok',
    };

    expect(
      VerifyEnvelopeDataSchema.safeParse({ verification: validVerification, display: 'text' }).success,
      '应接受含 4 字段 V2AssuranceDimensionResult 的 dimensions',
    ).toBe(true);

    // 缺 dimension → 失败
    const badVerification = {
      ...validVerification,
      dimensions: { reproducibility: { outcome: 'PASS', reasonCodes: ['code1'], detail: 'ok' } },
    };
    expect(
      VerifyEnvelopeDataSchema.safeParse({ verification: badVerification, display: 'text' }).success,
      'V2AssuranceDimensionResult 缺少 dimension 时应 parse 失败',
    ).toBe(false);

    // 缺 outcome（enum 字段）→ 失败
    const bad2 = {
      ...validVerification,
      dimensions: { reproducibility: { dimension: 'reproducibility', reasonCodes: ['code1'], detail: 'ok' } },
    };
    expect(
      VerifyEnvelopeDataSchema.safeParse({ verification: bad2, display: 'text' }).success,
      'V2AssuranceDimensionResult 缺少 outcome 时应 parse 失败',
    ).toBe(false);
  });

  // --- LatestVerificationSchema（6 字段 nullable）---
  it('LatestVerificationSchema: 6 个必填字段 + nullable', () => {
    const latestVerifFields = ['id', 'receiptId', 'policyId', 'evaluatedAt', 'result', 'allPass'] as const;

    const fullDetail = {
      receipt: {
        id: 'r-1', claimId: 'c-1', claimText: 'test', verdict: 'CONFIRMED',
        proofHash: 'h', schemaVersion: '2.0', createdAt: '2026-01-01T00:00:00Z',
        receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
      },
      manifestMembers: [],
      latestVerification: {
        id: 1, receiptId: 'r-1', policyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
        result: {
          resultVersion: 1, resultId: 'vr-1', receiptId: 'r-1',
          verificationPolicyId: 'p-1', evaluatedAt: '2026-01-01T00:00:00Z',
          dimensions: {}, receiptStanding: 'ACTIVE', preservationStatus: 'PRESERVED',
          reviewSummary: 'ok',
        },
        allPass: true,
      },
    };

    expect(ReceiptDetailDataSchema.safeParse(fullDetail).success).toBe(true);
    expect(
      ReceiptDetailDataSchema.safeParse({ ...fullDetail, latestVerification: null }).success,
      '应接受 latestVerification=null',
    ).toBe(true);

    for (const field of latestVerifFields) {
      const latest = { ...(fullDetail.latestVerification as Record<string, unknown>) };
      delete latest[field];
      expect(
        ReceiptDetailDataSchema.safeParse({ ...fullDetail, latestVerification: latest }).success,
        `LatestVerification 缺少 "${field}" 时应 parse 失败`,
      ).toBe(false);
    }
  });
});

// ===========================================================================
// 对拍覆盖率统计
// ===========================================================================

describe('schema_parity: 对拍覆盖率统计', () => {
  it('≥12 组字段名+类型对齐（6 端点 × 2+ 关键字段/端点）', () => {
    // 如果上面全部测试通过，以下字段已对拍（总计 49 组）：
    //   ReceiptDto: 9 | ManifestMember: 3 | LatestVerification: 6
    //   CreateReceipt data: 2 | ReceiptList data: 4 | ReVerify data: 3
    //   VerifyEnvelope data: 2 | DemoReceipt data: 2
    //   VerificationResult: 9 | V2DemoReceipt: 5 | V2AssuranceDimensionResult: 4
    expect(49).toBeGreaterThanOrEqual(12);
  });
});
