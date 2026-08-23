import type { ContentDepth, SourceFamily, SourceIdentifier, AccessState } from '../domain/source.js';

/** Structured model call request — the narrow semantic boundary (INTERFACES.md §5). */
export interface StructuredCallRequest {
  task: string;
  systemPrompt?: string;
  userPayload: unknown; // serialized into the prompt; canonical hash goes to the receipt
  /** zod schema the output MUST satisfy (parsed by the caller, enforced by the plane). */
  outputKind: 'json';
  temperature?: number;
  maxTokens?: number;
  /**
   * Strict-FC projection of the zod schema (providers/http.ts zodToStrictJsonSchema).
   * Providers with server-side schema enforcement (DeepSeek beta tools strict:true)
   * use it as the transport-level shape contract; other providers ignore it and the
   * caller's zod parse remains the semantic authority either way.
   */
  jsonSchema?: unknown;
  /**
   * Reasoning-effort override for THIS call (conversation gear > config default).
   * Emitted only when the resolved model route declared a reasoning capability;
   * undefined = zero thinking fields on the wire (legacy behavior, safe for any
   * endpoint incl. local runtimes). The dialect map lives in providers/http.ts
   * reasoningBodyFields; the gear→budget map in domain/model-config.ts.
   */
  reasoning?: { style: 'reasoning_effort' | 'enable_thinking' | 'thinking_budget'; gear: 'low' | 'medium' | 'high' };
  /** Retry budget owned by the plane (bounded, classified). */
  purpose: string; // e.g. 'claim-extraction', recorded in provenance
}

export interface StructuredCallResult<T> {
  ok: boolean;
  data?: T;
  /** Structured failure — never silently converted to success. */
  error?: {
    kind: 'provider_error' | 'rate_limited' | 'invalid_output' | 'timeout' | 'auth_error' | 'quota_exceeded';
    message: string;
    retryable: boolean;
    httpStatus?: number;
  };
  receipt: {
    provider: string;
    modelId: string;
    modelVersion?: string;
    latencyMs: number;
    usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number; cachedInputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number; reasoningTokens?: number };
    requestHash: string;
    outputHash: string;
    finishReason?: string;
    /** W4-F1 retry observability: transport retries / corrective re-asks consumed by this call. */
    transportRetries?: number;
    correctiveReasks?: number;
    /**
     * The reasoning gear actually served for this call (absent when the route has no
     * declared capability or the call carried no override) — reproducibility evidence.
     */
    reasoningGear?: 'low' | 'medium' | 'high';
    executionMode: 'live' | 'test';
  };
}

/** Model Execution Plane port. Implementations: DeepSeek (live), Z.ai (adapter), test stubs (test-only). */
export interface ModelProvider {
  readonly name: string;
  /** Whether live credentials/route are currently usable; false => calls fail closed with auth_error. */
  readonly liveReady: boolean;
  structuredCall<T>(req: StructuredCallRequest, parse: (raw: unknown) => T | Error): Promise<StructuredCallResult<T>>;
}

export interface RawRetrievalResult {
  family: SourceFamily;
  query: string;
  httpStatus: number;
  records: RawSourceRecord[];
  latencyMs: number;
}

export interface RawSourceRecord {
  identifiers: SourceIdentifier[];
  title: string;
  publicationYear?: number;
  authors: string[];
  venue?: string;
  abstractText?: string;
  contentDepth: ContentDepth;
  accessState: AccessState;
  license?: string;
  oaUrl?: string;
  fullTextUrl?: string;
  /** Normalized payload BEFORE volatile-field exclusion; adapter applies exclusion then hashes. */
  normalized: unknown;
}

export interface SourceAdapter {
  readonly family: SourceFamily;
  search(query: string, opts?: { limit?: number }): Promise<RawRetrievalResult>;
  /** Resolve a persistent identifier to a record (citation resolution path). */
  resolve(identifier: SourceIdentifier): Promise<{ found: boolean; record?: RawSourceRecord; httpStatus: number }>;
}

/** Immutable content-addressed artifact storage (source snapshots, exports, bundles). */
export interface ArtifactStore {
  /** Returns the content-addressed ref (sha256:...) and guarantees immutability on collision mismatch. */
  put(payload: string | Uint8Array): Promise<{ ref: string; hash: string; size: number }>;
  get(ref: string): Promise<string | null>;
  path(ref: string): string;
}
