import type { ContentDepth, SourceFamily, SourceIdentifier, AccessState, PublicationType } from '../domain/source.js';
import type { ReasoningStyle, ReasoningGear } from '../domain/model-config.js';

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
   * Server-enforced json_schema response_format (OpenAI-style
   * response_format:{type:'json_schema',strict:true} — verified on Bailian qwen3.7-plus/
   * 3.7-max/3.8-max, 2026-08-24). Distinct from jsonSchema (beta tools mode): the plane's
   * dashscope negotiation sets this ONLY when the capability registry verified the model
   * supports it; callers keep passing jsonSchema and the adapter decides the wire mode.
   */
  responseJsonSchema?: unknown;
  /**
   * Reasoning-effort override for THIS call (conversation gear > config default).
   * Emitted only when the resolved model route declared a reasoning capability;
   * undefined = zero thinking fields on the wire (legacy behavior, safe for any
   * endpoint incl. local runtimes). The dialect map lives in providers/http.ts
   * reasoningBodyFields; the gear→budget map in domain/model-config.ts.
   */
  reasoning?: { style: ReasoningStyle; gear: ReasoningGear };
  /** Retry budget owned by the plane (bounded, classified). */
  purpose: string; // e.g. 'claim-extraction', recorded in provenance
  /**
   * Wire-level cancellation (2026-08-29): when aborted, the transport aborts the
   * in-flight fetch at the next opportunity and fails the call NON-retryably with
   * a cancel-flavored error — a user cancel lands in ms instead of waiting out the
   * stage boundary. Optional and additive: providers/eval code that never sets it
   * behave exactly as before.
   */
  signal?: AbortSignal;
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
    /**
     * Model-plane provenance (2026-08-24): echo of the generation parameters actually
     * sent (reproducibility — requestHash covers payload, this covers knobs) and the
     * routing decision that selected this route (task class + selection rule). Absent
     * on legacy/pre-plane results.
     */
    params?: {
      temperature?: number;
      maxTokens?: number;
      structuredOutput?: 'json_object' | 'json_schema_strict' | 'strict_tools' | 'prompt_contract';
      reasoning?: { style: string; gear: string };
    };
    routing?: {
      taskClass: string;
      route: string;
      selectedVia: string;
    };
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
  /** Canonical publication type when the family API exposes one (optional — not all do). */
  publicationType?: PublicationType;
  /** Normalized payload BEFORE volatile-field exclusion; adapter applies exclusion then hashes. */
  normalized: unknown;
}

/**
 * Citation-graph capability (backward reference chasing + forward citation
 * search), optional per adapter — families without a citation API simply omit
 * it and callers feature-detect. All methods are read-only retrieval paths and
 * follow the adapter's rate-limit/error discipline.
 */
export interface CitationChaseAdapter {
  /**
   * Backward: bare external work ids referenced by one work, in the API's own
   * (typically citation-order) sequence. `workRef` accepts a bare family work id
   * (e.g. OpenAlex W-id) or a resolvable compound like `doi:10.1234/abc`.
   */
  referencedWorkIds(workRef: string): Promise<string[]>;
  /**
   * Forward: works citing `workRef`, in a deterministic source-native order
   * (explicitly sorted by the implementation, never default-luck).
   */
  citingWorks(workRef: string, limit: number): Promise<RawSourceRecord[]>;
  /** Batch-resolve bare work ids to records in ONE request (bounded by the caller). */
  worksByIds(ids: readonly string[]): Promise<RawSourceRecord[]>;
}

export interface SourceAdapter {
  readonly family: SourceFamily;
  search(query: string, opts?: { limit?: number }): Promise<RawRetrievalResult>;
  /**
   * SCIENCE lane (2026-08-24) — citation-graph querying (filter= API param), e.g.
   * OpenAlex `cites:W123` (forward snowballing) or `ids.openalex:W1|W2` (backward
   * batch resolve). OPTIONAL: families without filter-style APIs simply omit it and
   * the retrieve-stage citation chase skips them honestly (no degradation, disclosed).
   */
  searchFiltered?(filter: string, opts?: { limit?: number }): Promise<RawRetrievalResult>;
  /** Resolve a persistent identifier to a record (citation resolution path). */
  resolve(identifier: SourceIdentifier): Promise<{ found: boolean; record?: RawSourceRecord; httpStatus: number }>;
  /** Optional citation-graph capability; absent when the family exposes no citation API. */
  readonly citations?: CitationChaseAdapter;
}

/** Immutable content-addressed artifact storage (source snapshots, exports, bundles). */
export interface ArtifactStore {
  /** Returns the content-addressed ref (sha256:...) and guarantees immutability on collision mismatch. */
  put(payload: string | Uint8Array): Promise<{ ref: string; hash: string; size: number }>;
  get(ref: string): Promise<string | null>;
  path(ref: string): string;
}
