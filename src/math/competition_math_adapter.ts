// spec 38 §6 · Competition math autoformalizer (Qwen-Math profile).
//
// THIS IS THE ONLY FILE IN src/math/ ALLOWED TO REFERENCE Qwen / 百炼 / the
// competition profile. The model-neutral core formalizer lives in
// autoformalizer.ts; this adapter wraps it with a model-backed formalizer for
// higher-quality formalization, falling back to the rule-based core on any
// failure (honest degradation — spec 38 §4.5 / AGENTS §6.2).
//
// Red-line safety:
// - `competitionModelSnapshot` is INJECTED via constructor (NOT hard-coded) —
//   CLAUDE.md red-line #2 (COMPETITION_MODEL_SNAPSHOT is not a core-wide constant).
// - `formalizerId` embeds the injected snapshot so the evidence trail records
//   exactly which model version produced each formalization.
// - When the gateway is absent or the call fails, the result carries
//   formalizerId='core_neutral@v1', making the degradation observable.
//
// Model-neutrality: this file is EXEMPT from the src/math/ red-line grep by
// design (Qwen-Math only enters here). All other src/math/ files remain neutral.

import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type {
  LlmRequest,
  LlmResponse,
  ProviderProfile,
} from '../llm_gateway/types.ts';
import type { FormalExpression } from './math_claim.ts';
import type { AutoformalizeInput, Autoformalizer } from './autoformalizer.ts';
import { CoreNeutralAutoformalizer, backendToFormalTarget } from './autoformalizer.ts';

// ============================================================
// §1  Constructor options
// ============================================================

export interface CompetitionMathAdapterOptions {
  /** Injected competition model snapshot (e.g. 'qwen3.7-max-2026-05-20').
   * MUST be injected by the caller — never hard-coded (CLAUDE.md red-line #2). */
  readonly competitionModelSnapshot: string;
  /** LLM gateway for calling the competition Qwen-Math model. When undefined,
   * every call degrades to the core-neutral formalizer (fresh-clone friendly). */
  readonly gateway?: LlmGateway;
  /** Competition provider profile. Defaults to 'competition_aliyun_qwen'. */
  readonly profile?: ProviderProfile;
  /** Core-neutral fallback formalizer. Defaults to a fresh instance. */
  readonly coreFallback?: CoreNeutralAutoformalizer;
}

// ============================================================
// §2  Constants
// ============================================================

const DEFAULT_COMPETITION_PROFILE: ProviderProfile = 'competition_aliyun_qwen';
const FORMALIZER_ID_PREFIX = 'competition_qwen_math';
const DEFAULT_CONFIDENCE = 0.5;
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = [
  'You are a math autoformalization assistant. Given a natural-language math',
  'claim and a target backend, produce the formal SOURCE CODE (the expression',
  'text). The target language is decided by the caller, not by you.',
  '',
  'Output ONLY a JSON object with this exact shape:',
  '{"source": "<formal source code>", "confidence": <number 0-1>}',
  '',
  'Source formats by backend:',
  '- cas (SymPy): source = JSON {"lhs": "...", "rhs": "..."} or {"expr": "..."}',
  '- smt (Z3): source = JSON {"script": "<SMT-LIB>", "query": "unsat"|"sat"}',
  '- numerical: source = JSON {"bound": {"min": <num>, "max": <num>,',
  '  "sampleCount": <int>, "description": "..."}, "expression": "..."}',
  '',
  'Do not output any text outside the JSON object.',
].join('\n');

// ============================================================
// §3  CompetitionMathAutoformalizer
// ============================================================

export class CompetitionMathAutoformalizer implements Autoformalizer {
  readonly formalizerId: string;
  readonly isModelNeutralCore = false;

  private readonly gateway: LlmGateway | undefined;
  private readonly profile: ProviderProfile;
  private readonly coreFallback: CoreNeutralAutoformalizer;
  private readonly competitionModelSnapshot: string;

  constructor(options: CompetitionMathAdapterOptions) {
    if (options.competitionModelSnapshot.length === 0) {
      throw new Error(
        'CompetitionMathAutoformalizer: competitionModelSnapshot must be a non-empty string',
      );
    }
    this.competitionModelSnapshot = options.competitionModelSnapshot;
    this.gateway = options.gateway;
    this.profile = options.profile ?? DEFAULT_COMPETITION_PROFILE;
    this.coreFallback = options.coreFallback ?? new CoreNeutralAutoformalizer();
    this.formalizerId = `${FORMALIZER_ID_PREFIX}@${this.competitionModelSnapshot}`;
  }

  async autoformalize(input: AutoformalizeInput): Promise<FormalExpression> {
    if (this.gateway === undefined) {
      // Fresh-clone / offline path: no gateway wired → core neutral.
      return this.coreFallback.autoformalize(input);
    }
    const gateway = this.gateway;
    try {
      return await this.callCompetitionModel(input, gateway);
    } catch {
      // Honest degradation: any competition gateway failure (network, parse,
      // schema validation) falls back to the model-neutral core formalizer.
      // The formalizerId in the result distinguishes which path was taken.
      return this.coreFallback.autoformalize(input);
    }
  }

  private async callCompetitionModel(
    input: AutoformalizeInput,
    gateway: LlmGateway,
  ): Promise<FormalExpression> {
    const userPrompt = this.buildUserPrompt(input);
    const request: LlmRequest = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      responseFormat: 'json_schema',
      maxTokens: MAX_TOKENS,
    };
    const response: LlmResponse = await gateway.callLlm(this.profile, request);
    return this.parseResponse(response, input);
  }

  private buildUserPrompt(input: AutoformalizeInput): string {
    const backend = input.targetBackend ?? 'cas';
    const mustVerify = input.mustBeVerifiedBy.length > 0
      ? input.mustBeVerifiedBy.join(', ')
      : '(none specified)';
    return [
      `Claim (natural language): ${input.naturalLanguage}`,
      `Claim kind: ${input.claimKind}`,
      `Target backend: ${backend}`,
      `Must be verified by: ${mustVerify}`,
    ].join('\n');
  }

  private parseResponse(
    response: LlmResponse,
    input: AutoformalizeInput,
  ): FormalExpression {
    const content = response.content.trim();
    if (content.length === 0) {
      throw new Error('competition_math_adapter: empty response content');
    }
    const parsed = JSON.parse(content) as {
      source?: unknown;
      confidence?: unknown;
    };
    if (typeof parsed.source !== 'string' || parsed.source.length === 0) {
      throw new Error(
        'competition_math_adapter: response missing non-empty "source" string',
      );
    }
    const confidence = typeof parsed.confidence === 'number'
      ? parsed.confidence
      : DEFAULT_CONFIDENCE;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(
        `competition_math_adapter: confidence out of [0,1]: ${confidence}`,
      );
    }
    return {
      target: backendToFormalTarget(input.targetBackend),
      source: parsed.source,
      formalizerId: this.formalizerId,
      confidence,
    };
  }
}

// ============================================================
// §4  Factory
// ============================================================

export function createCompetitionMathAutoformalizer(
  options: CompetitionMathAdapterOptions,
): CompetitionMathAutoformalizer {
  return new CompetitionMathAutoformalizer(options);
}
