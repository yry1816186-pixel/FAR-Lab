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
import {
  runV2ReceiptVerification,
  formatV2VerificationForDisplay,
  V2_DEMO_SAMPLE,
} from '../../v2_domain/receipt_verify_v2.ts';
import type { ProofEnvelopeV2 } from '../../proof_envelope/v2/types.ts';

/**
 * Register V2 API routes under the given Fastify instance.
 */
export async function registerV2ReceiptRoutes(app: FastifyInstance): Promise<void> {
  // GET /receipts/demo — return the demo sample receipt with six-dimension verification.
  app.get('/receipts/demo', async (_request, reply) => {
    const result = runV2ReceiptVerification(V2_DEMO_SAMPLE);
    return reply.code(200).send({
      ok: true,
      receipt: V2_DEMO_SAMPLE,
      verification: result,
    });
  });

  // POST /receipts/verify — verify a submitted ProofEnvelopeV2.
  app.post('/receipts/verify', async (request, reply) => {
    const body = request.body as ProofEnvelopeV2 | null;
    if (body === null || typeof body !== 'object') {
      return reply.code(400).send({
        ok: false,
        error: 'Request body must be a ProofEnvelopeV2 JSON object',
      });
    }

    // Check minimal envelope shape.
    if (typeof body.schemaVersion !== 'string' || typeof body.proofHash !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: 'Missing required fields: schemaVersion, proofHash',
      });
    }

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
      verification: result,
      display,
    });
  });
}

/** Convert envelope fields to manifest members for verification. */
function envelopeToMembers(envelope: ProofEnvelopeV2): readonly { readonly kind: import('../../v2_domain/receipt_manifest.ts').ReceiptManifestMemberKind; readonly digest: string; readonly sizeBytes: number }[] {
  const members: { kind: import('../../v2_domain/receipt_manifest.ts').ReceiptManifestMemberKind; digest: string; sizeBytes: number }[] = [];
  const fields: Array<[import('../../v2_domain/receipt_manifest.ts').ReceiptManifestMemberKind, unknown]> = [
    ['claim', envelope.claim],
    ['fecSnapshot', envelope.fecSnapshot],
    ['protocolFreeze', envelope.protocolFreeze],
    ['datasetBindings', envelope.datasetBindings],
    ['workflowBindings', envelope.workflowBindings],
    ['verdictTrace', envelope.verdictTrace],
    ['antiTheaterReport', envelope.antiTheaterReport],
  ];
  for (const [kind, value] of fields) {
    if (value !== undefined && value !== null) {
      const json = JSON.stringify(value);
      members.push({ kind, digest: 'sha256:' + simpleHash(json), sizeBytes: json.length });
    }
  }
  return members;
}

/** Simple hash (not crypto — API path is for display, not trust). */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0').repeat(8).slice(0, 64);
}
