import { z } from 'zod';
import { BundleId, ReceiptId, RunId, ExperimentRunId, ResultSetId, StatReportId } from './ids.js';

/**
 * Execution facts captured AS THEY HAPPEN (mission §36/§55). Missing data stays missing —
 * fabrication is prohibited. Sensitive payloads are hashed/redacted by default.
 */
export const ReceiptKind = z.enum([
  'model_call', 'source_retrieval', 'tool_exec', 'stage_transition', 'export', 'revision',
]);
export type ReceiptKind = z.infer<typeof ReceiptKind>;

export const ExecutionMode = z.enum(['live', 'test']);
export type ExecutionMode = z.infer<typeof ExecutionMode>;

export const ModelCallFacts = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  modelVersion: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().int().nonnegative().optional(),
    completionTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    /**
     * RU-9 GO1 token-kind accounting: providers bill cached/reasoning tokens at
     * different rates (zai implicit ~50%; dashscope explicit 10/125%; OpenAI
     * reasoning at output rate) — dropping them understated USD-ceiling
     * accounting by up to 80-90% on cache hits. All optional: old receipts parse.
     */
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheCreationTokens: z.number().int().nonnegative().optional(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
  }).default({}),
  latencyMs: z.number().int().nonnegative(),
  requestHash: z.string().length(64),   // canonical hash of redacted request
  outputHash: z.string().length(64),
  finishReason: z.string().optional(),
  /** W4-F1 retry observability (bounded-retry counts actually consumed, 0 = clean first pass). */
  transportRetries: z.number().int().nonnegative().optional(),
  correctiveReasks: z.number().int().nonnegative().optional(),
});

export const SourceRetrievalFacts = z.object({
  family: z.string().min(1),
  query: z.string(),
  httpStatus: z.number().int(),
  resultCount: z.number().int().nonnegative(),
  contentHashes: z.array(z.string().length(64)).default([]),
});

export const ProvenanceReceipt = z.object({
  id: ReceiptId,
  runId: RunId,
  kind: ReceiptKind,
  executionMode: ExecutionMode,
  at: z.string().datetime(),
  modelCall: ModelCallFacts.optional(),
  sourceRetrieval: SourceRetrievalFacts.optional(),
  toolExec: z.object({
    tool: z.string(), inputHash: z.string().length(64), outputHash: z.string().length(64),
    exitCode: z.number().int().optional(), durationMs: z.number().int().nonnegative().optional(),
  }).optional(),
  stage: z.string().optional(),
  codeRevision: z.string().optional(),   // git commit at execution time
  environmentFingerprint: z.string().optional(),
  redactionNote: z.string().default('raw prompts/responses not retained; hashes only'),
});
export type ProvenanceReceipt = z.infer<typeof ProvenanceReceipt>;
export type ModelCallFacts = z.infer<typeof ModelCallFacts>;

/** What a third party can do with the bundle — declared honestly (ACC-14). */
export const EvidenceLevel = z.enum(['inspect', 'replay', 'recompute']);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;

export const ReproducibilityBundle = z.object({
  id: BundleId,
  runId: RunId,
  declaredEvidenceLevel: EvidenceLevel,
  codeRevision: z.string(),
  environmentFingerprint: z.string().min(1),
  dependencyLockHash: z.string().length(64),
  questionRef: z.string(),
  corpusSnapshotRef: z.string(),
  sourceArtifactHashes: z.array(z.string().length(64)),
  modelMetadata: z.array(z.object({
    provider: z.string(), modelId: z.string(),
    route: z.enum(['live_official', 'live', 'test_only']),
  })),
  receiptIds: z.array(ReceiptId),
  finalArtifactHashes: z.array(z.string().length(64)),
  /**
   * BP-3 research-product artifact: content-addressed ref of the rendered paper markdown
   * (`<runId>.paper.md` download). Absent on pre-BP3 bundles — the /paper endpoint 404s
   * honestly instead of guessing. finalArtifactHashes[0] remains the report artifact.
   */
  paperOutlineRef: z.string().optional(),
  verificationInstructions: z.string().min(1),
  /** External/non-deterministic factors that prevent exact reproduction — mandatory honesty. */
  limitations: z.array(z.string()).default([]),
  /**
   * SWAN-ontology interchange view of the surviving hypotheses (W-G follow-up; W3C SWAN
   * is a stable public standard — ResearchStatement qualified as hypothesis). For
   * external semantic-web consumers only; the internal domain model is authoritative.
   */
  hypothesisJsonLd: z.array(z.unknown()).optional(),
  /** EEL (D-081): executed-experiment evidence — object ids plus content-addressed artifact hashes (P2, ACC-26). */
  experimentEvidence: z.array(z.object({
    experimentRunId: ExperimentRunId,
    resultIds: z.array(ResultSetId),
    statReportIds: z.array(StatReportId),
    artifactHashes: z.array(z.string().length(64)),
    lockfileHash: z.string().length(64).optional(),
  })).optional(),
  createdAt: z.string().datetime(),
});
export type ReproducibilityBundle = z.infer<typeof ReproducibilityBundle>;
