/**
 * V2 API routes — /api/v2/receipts endpoints.
 *
 * Exposes the V2 domain layer over HTTP for frontend integration.
 * Routes:
 *   POST /api/v2/receipts/verify  — verify an envelope, return six-dimension result
 *   GET  /api/v2/receipts/demo    — return the demo sample receipt verification
 *
 * Authority: doc19 §5 (machine envelope), §8 (API lifecycle).
 */

import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import {
  runV2ReceiptVerification,
  formatV2VerificationForDisplay,
  V2_DEMO_SAMPLE,
} from '../../v2_domain/receipt_verify_v2.ts';
import type { ProofEnvelopeV2 } from '../../proof_envelope/v2/types.ts';
import { verifyRouteSchema, demoRouteSchema } from './v2_receipts_schemas.ts';

/**
 * Register V2 API routes under the given Fastify instance.
 */
export async function registerV2ReceiptRoutes(app: FastifyInstance): Promise<void> {
  // GET /receipts/demo — return the demo sample receipt with six-dimension verification.
  app.get('/receipts/demo', { schema: demoRouteSchema }, async (_request, reply) => {
    const result = runV2ReceiptVerification(V2_DEMO_SAMPLE);
    return reply.code(200).send({
      ok: true,
      data: {
        receipt: V2_DEMO_SAMPLE,
        verification: result,
      },
    });
  });

  // POST /receipts/verify — verify a submitted ProofEnvelopeV2.
  //
  // 请求体结构校验由 ProofEnvelopeV2RequestSchema（fastify/ajv）接管：
  //   - schemaVersion / proofHash 必填 string
  //   - claim / verdictTrace 为对象（若存在）
  //   - datasetBindings / workflowBindings 等为数组（若存在）
  // 验证失败 → error_handler 转 400 VALIDATION_FAILED（RFC 7807）。
  // 原手动 typeof 校验已移除（schema SSOT 接管，避免双套校验漂移）。
  app.post('/receipts/verify', { schema: verifyRouteSchema }, async (request, reply) => {
    const body = request.body as ProofEnvelopeV2;

    // Build a V2DemoReceipt-compatible input from the envelope.
    const claim = body.claim;
    const verdictTrace = body.verdictTrace;
    const receiptInput = {
      receiptId: claim?.id ?? 'api-unknown',
      claimText: claim?.naturalLanguage ?? '(missing claim)',
      verdictLabel: verdictTrace?.verdict ?? 'UNKNOWN',
      manifestMembers: envelopeToMembers(body),
      receiptStanding: 'ACTIVE' as const,
      preservationStatus: 'AVAILABLE' as const,
      effectSize: 0,
      pValue: null,
      isFixtureOnly: true,
    };

    const result = runV2ReceiptVerification(receiptInput);
    const display = formatV2VerificationForDisplay(result);

    return reply.code(200).send({
      ok: true,
      data: {
        verification: result,
        display,
      },
    });
  });
}

/** Convert envelope fields to manifest members for verification. */
function envelopeToMembers(envelope: ProofEnvelopeV2): readonly { readonly kind: import('../../v2_domain/receipt_manifest.ts').ReceiptManifestMemberKind; readonly digest: string; readonly sizeBytes: number }[] {
  const members: { kind: import('../../v2_domain/receipt_manifest.ts').ReceiptManifestMemberKind; digest: string; sizeBytes: number }[] = [];
  // R3 修复（真实信封全挂 MANDATORY_MEMBER_MISSING）：成员映射必须覆盖
  // REQUIRED_MANIFEST_MEMBER_KINDS 全部 11 类——此前缺 experimentRuns /
  // measurementResults / statisticalResults / ledgerRoot 四类，凡经本路由验证的
  // 真实信封必缺员 FAIL（R2 真机 QA pass7 现场抓获）。
  const fields: Array<[import('../../v2_domain/receipt_manifest.ts').ReceiptManifestMemberKind, unknown]> = [
    ['claim', envelope.claim],
    ['fecSnapshot', envelope.fecSnapshot],
    ['protocolFreeze', envelope.protocolFreeze],
    ['datasetBindings', envelope.datasetBindings],
    ['workflowBindings', envelope.workflowBindings],
    ['experimentRuns', envelope.experimentRuns],
    ['measurementResults', envelope.measurementResults],
    ['statisticalResults', envelope.statisticalResults],
    ['verdictTrace', envelope.verdictTrace],
    ['antiTheaterReport', envelope.antiTheaterReport],
    ['ledgerRoot', envelope.ledgerRoot],
  ];
  for (const [kind, value] of fields) {
    if (value !== undefined && value !== null) {
      const json = JSON.stringify(value);
      members.push({ kind, digest: realSha256Hex(json), sizeBytes: json.length });
    }
  }
  return members;
}

/**
 * 成员内容的真实 sha256（裸 64-hex·无前缀）。
 * R3 修复：simpleHash（非密码学 DJB2 变体 + 'sha256:' 前缀）被 manifest 格式门
 * 拒收（MANIFEST_DIGEST_INVALID）且其 'sha256:' 前缀谎称算法——display 面也不得
 * 伪造算法标识。改为 node:crypto 真实 sha256，注释与事实一致。
 */
function realSha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
