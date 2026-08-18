/**
 * features/verify/schemas — zod runtime contracts for the v2 receipts API.
 *
 * The backend is the contract of record; these schemas decode `data` at the
 * HTTP boundary so a contract drift fails loudly (RESPONSE_SCHEMA_MISMATCH)
 * instead of corrupting the UI state silently.
 */

import { z } from 'zod';

const ManifestMemberSchema = z.object({
  kind: z.string(),
  digest: z.string(),
  sizeBytes: z.number(),
});

const AssuranceDimensionSchema = z.object({
  dimension: z.string(),
  outcome: z.enum(['PASS', 'FAIL', 'WARN', 'SKIP', 'NOT_APPLICABLE']),
  reasonCodes: z.array(z.string()),
  detail: z.string(),
});

const VerificationResultSchema = z.object({
  resultVersion: z.number(),
  resultId: z.string(),
  receiptId: z.string(),
  verificationPolicyId: z.string(),
  evaluatedAt: z.string(),
  dimensions: z.record(z.string(), AssuranceDimensionSchema),
  receiptStanding: z.string(),
  preservationStatus: z.string(),
  reviewSummary: z.string(),
});

const StoredReceiptSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  claimText: z.string(),
  verdict: z.string(),
  proofHash: z.string(),
  schemaVersion: z.string(),
  createdAt: z.string(),
  receiptStanding: z.string(),
  preservationStatus: z.string(),
});

export const DemoReceiptDataSchema = z.object({
  receipt: z.object({
    receiptId: z.string(),
    claimText: z.string(),
    verdictLabel: z.string(),
    isFixtureOnly: z.boolean(),
    manifestMembers: z.array(ManifestMemberSchema),
  }),
  verification: VerificationResultSchema,
});

export const ReceiptListDataSchema = z.object({
  receipts: z.array(StoredReceiptSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const ReceiptDetailDataSchema = z.object({
  receipt: StoredReceiptSchema,
  manifestMembers: z.array(ManifestMemberSchema),
  latestVerification: z
    .object({
      id: z.number(),
      receiptId: z.string(),
      policyId: z.string(),
      evaluatedAt: z.string(),
      result: VerificationResultSchema,
      allPass: z.boolean(),
    })
    .nullable(),
});

export const VerifyEnvelopeDataSchema = z.object({
  verification: VerificationResultSchema,
  display: z.string(),
});

export const CreateReceiptDataSchema = z.object({
  receiptId: z.string(),
  idempotent: z.boolean(),
});

export const ReVerifyDataSchema = z.object({
  verification: VerificationResultSchema,
  display: z.string(),
  allPass: z.boolean(),
});
