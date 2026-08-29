import { canonicalSha256 } from '../shared/crypto.js';
import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import { computeRequestHash, extractJsonText, type ModelCallErrorKind, type SleepLike } from './http.js';

/**
 * *** TEST-ONLY *** — a fully scripted, in-process ModelProvider stub.
 *
 * NEVER wire this into production paths: it performs no network call and its
 * outputs are whatever the test author scripted. Receipts stamp
 * executionMode 'test' by default (see TestStubOptions.asLive). It exists so
 * pipeline/caller tests can exercise the ModelProvider contract
 * deterministically (scripted success, scripted failure injection, scripted
 * latency) without network or keys.
 *
 * Semantics: one script step is consumed per structuredCall, in order. There is
 * NO automatic retry here — retry orchestration belongs to the live core
 * (http.ts); tests that want to simulate a retry sequence simply script two
 * steps and call twice.
 */

export interface StubStep {
  /** Raw model-output string the stub returns (JSON text, may include fences). */
  rawOutput?: string;
  /** Deterministic scripted latency (also reported as receipt.latencyMs). */
  delayMs?: number;
  /** Scripted structured failure (injected, never a real provider state). */
  fail?: { kind: ModelCallErrorKind; message: string; httpStatus?: number };
  /**
   * Key this step to a call PURPOSE (e.g. 'falsification-spec:hyp_x') instead of call
   * sequence. Purpose-keyed scripts are interleaving-proof: stage-level bounded
   * concurrency (mapBounded) changes call ORDER but never call identity, so tests that
   * script multiple same-stage calls must key by purpose, not position.
   */
  forPurpose?: string;
}

export interface TestStubOptions {
  name?: string;
  sleep?: SleepLike;
  /**
   * Declare the stub's ROLE: a scripted double of a LIVE model (receipts stamp
   * executionMode 'live'). Default remains 'test' — a stub that does not
   * declare a role is a test-mode double, and product-run stages refuse
   * test-stamped scientific output (real-content discipline, 2026-08-29).
   * asLive exists for orchestrator-level tests whose scripted answers stand in
   * for a live route's analysis; the stamp names the role played, truthfully.
   */
  asLive?: boolean;
}

export function createTestStubProvider(steps: StubStep[], opts: TestStubOptions = {}): ModelProvider {
  const name = opts.name ?? 'test-stub';
  const mode: 'live' | 'test' = opts.asLive === true ? 'live' : 'test';
  const sleep: SleepLike = opts.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let cursor = 0;
  const nextSequential = (): StubStep | undefined => {
    while (cursor < steps.length && steps[cursor]!.forPurpose !== undefined) cursor += 1;
    return steps[cursor++];
  };
  return {
    name,
    // A stub is by definition never live.
    liveReady: false,
    async structuredCall<T>(
      req: StructuredCallRequest,
      parse: (raw: unknown) => T | Error,
    ): Promise<StructuredCallResult<T>> {
      const keyed = steps.find((s) => s.forPurpose !== undefined && s.forPurpose === req.purpose);
      const step = keyed ?? nextSequential();
      if (!step) {
        // Test-authoring bug: loud, never silently satisfied.
        throw new Error(
          `${name}: TEST-ONLY stub script exhausted at step ${cursor} — script one step per expected structuredCall`,
        );
      }
      const requestHash = computeRequestHash(req);
      if (step.delayMs && step.delayMs > 0) await sleep(step.delayMs);
      const latencyMs = step.delayMs ?? 0;

      if (step.fail) {
        return {
          ok: false,
          error: {
            kind: step.fail.kind,
            message: `[TEST-ONLY stub] ${step.fail.message}`,
            retryable: false,
            ...(step.fail.httpStatus !== undefined ? { httpStatus: step.fail.httpStatus } : {}),
          },
          receipt: {
            provider: name,
            modelId: 'test-stub',
            latencyMs,
            usage: {}, // a stub produces no real token accounting
            requestHash,
            outputHash: canonicalSha256(''),
            executionMode: mode,
          },
        };
      }

      const raw = step.rawOutput ?? '';
      const extracted = extractJsonText(raw);
      const parsed = extracted !== null ? parse(extracted.value) : null;
      if (extracted === null || parsed === null || parsed instanceof Error) {
        const reason =
          parsed instanceof Error ? parsed.message : 'scripted rawOutput is not valid JSON';
        return {
          ok: false,
          error: {
            kind: 'invalid_output',
            message: `[TEST-ONLY stub] scripted output rejected: ${reason}`,
            retryable: false,
          },
          receipt: {
            provider: name,
            modelId: 'test-stub',
            latencyMs,
            usage: {},
            requestHash,
            outputHash: canonicalSha256(raw),
            executionMode: mode,
          },
        };
      }
      return {
        ok: true,
        data: parsed,
        receipt: {
          provider: name,
          modelId: 'test-stub',
          latencyMs,
          usage: {},
          requestHash,
          outputHash: canonicalSha256(raw),
          executionMode: mode,
        },
      };
    },
  };
}
