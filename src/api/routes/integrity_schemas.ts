/**
 * Machine-readable wire contracts for the three integrity endpoints.
 *
 * These schemas describe the V1 response after the server's preSerialization
 * success-envelope hook. They constrain transport shape only; Merkle
 * membership and chain correctness still require independent verification.
 */

import type { FastifySchema } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function toRouteSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema) as Record<string, unknown>;
}

function successEnvelope(data: z.ZodTypeAny): z.ZodTypeAny {
  return z.object({ ok: z.literal(true), data }).strict();
}

const ApiProblemSchema = z.object({
  error_code: z.string(),
  message: z.string(),
  source_anchor: z.object({
    fileId: z.string().nullable(),
    stageId: z.string().nullable(),
    callRecordId: z.string().nullable(),
  }).strict(),
  detail: z.unknown().optional(),
}).passthrough();

const EmptyIntegrityRootSchema = z.object({
  merkleRoot: z.literal('0'.repeat(64)),
  leafCount: z.literal(0),
  chainHeadSeq: z.null(),
  chainHeadHash: z.null(),
}).strict();

const NonEmptyIntegrityRootSchema = z.object({
  merkleRoot: z.string().regex(SHA256_HEX_PATTERN),
  leafCount: z.number().int().positive(),
  chainHeadSeq: z.number().int().positive(),
  chainHeadHash: z.string().regex(SHA256_HEX_PATTERN),
}).strict();

export const IntegrityRootDataSchema = z.union([
  EmptyIntegrityRootSchema,
  NonEmptyIntegrityRootSchema,
]);
export type IntegrityRootDto = z.infer<typeof IntegrityRootDataSchema>;

export const IntegrityProofDataSchema = z.object({
  seq: z.number().int().positive(),
  leafIndex: z.number().int().nonnegative(),
  leaf: z.string().regex(SHA256_HEX_PATTERN),
  siblings: z.array(z.string().regex(SHA256_HEX_PATTERN)),
  expectedRoot: z.string().regex(SHA256_HEX_PATTERN),
  leafCount: z.number().int().positive(),
}).strict();
export type IntegrityProofDto = z.infer<typeof IntegrityProofDataSchema>;

export const ReproReceiptDataSchema = z.object({
  schemaVersion: z.literal(1),
  merkleRoot: z.string().regex(SHA256_HEX_PATTERN),
  leafCount: z.number().int().nonnegative(),
  chainHeadSeq: z.number().int().positive().nullable(),
  chainHeadHash: z.string().regex(SHA256_HEX_PATTERN).nullable(),
  gitCommitSha: z.string().nullable(),
  generatedAt: z.string().datetime({ offset: true }),
}).strict();
export type ReproReceipt = z.infer<typeof ReproReceiptDataSchema>;

export const IntegrityRootEnvelopeSchema = successEnvelope(IntegrityRootDataSchema);
export const IntegrityProofEnvelopeSchema = successEnvelope(IntegrityProofDataSchema);
export const ReproReceiptEnvelopeSchema = successEnvelope(ReproReceiptDataSchema);

function problemResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      'application/problem+json': { schema: toRouteSchema(ApiProblemSchema) },
    },
  };
}

const COMMON_ERROR_RESPONSES = {
  401: problemResponse('Authentication is required in protected mode'),
  429: problemResponse('Request rate limit exceeded'),
  500: problemResponse('Integrity computation failed'),
} as const;

export const IntegrityRootRouteSchema: FastifySchema = {
  response: {
    200: toRouteSchema(IntegrityRootEnvelopeSchema),
    ...COMMON_ERROR_RESPONSES,
  },
};

export const IntegrityProofRouteSchema: FastifySchema = {
  response: {
    200: toRouteSchema(IntegrityProofEnvelopeSchema),
    400: problemResponse('Sequence is not a canonical positive safe integer'),
    404: problemResponse('No call record exists at the requested sequence'),
    ...COMMON_ERROR_RESPONSES,
  },
};

export const ReproReceiptRouteSchema: FastifySchema = {
  response: {
    200: toRouteSchema(ReproReceiptEnvelopeSchema),
    ...COMMON_ERROR_RESPONSES,
  },
};
