import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';

/**
 * BP-4 failover chain (LiteLLM router semantics verified against source 2026-08,
 * adapted to FAR-Lab's one-structured-call granularity and reproducibility rules).
 *
 * Classification (per structured call, AFTER each provider's own bounded retries):
 * - FAIL OVER: rate_limited / timeout / quota_exceeded / auth_error / provider_error
 *   with a 5xx-class (or unknown) httpStatus — the route is unhealthy or dead, and a
 *   DIFFERENT config may legitimately serve the same request.
 * - NO FAIL OVER: 400/404/413-class provider_error (the request itself is malformed
 *   for that wire; LiteLLM raises these too) and invalid_output (the model answered
 *   garbage after corrective re-asks — silently switching models mid-pipeline would
 *   corrupt run reproducibility while looking healthy).
 *
 * Cooldown: a config that exhausted a failover-worthy failure is skipped for
 * COOLDOWN_MS. LiteLLM's 5s default assumes sub-second proxy hops; a pipeline stage
 * between two attempts is minutes, so a 60s cooldown only suppresss the immediate
 * retry storm while letting a healthy fallback recover quickly after one stage.
 *
 * Every failover is VISIBLE: the successful (or final) receipt names the config that
 * actually served the call, and the returned error chain lists every route tried.
 */

export const COOLDOWN_MS = 60_000;

type ProviderError = NonNullable<StructuredCallResult<unknown>['error']>;

/** Should this failure justify trying a DIFFERENT config? (LiteLLM _should_retry lineage.) */
export const isFailoverWorthy = (err: ProviderError): boolean => {
  switch (err.kind) {
    case 'rate_limited':
    case 'timeout':
    case 'quota_exceeded':
    case 'auth_error':
      return true;
    case 'provider_error': {
      const s = err.httpStatus;
      if (s === 400 || s === 404 || s === 413) return false; // malformed request class
      return true; // 5xx / unknown transport failures
    }
    case 'invalid_output':
      return false;
  }
};

export interface FailoverRoute {
  provider: ModelProvider;
  /** Config id for cooldown bookkeeping ('' for non-config providers). */
  configId: string;
}

export interface FallbackChainEvents {
  /** Optional observability sink (orchestrator may append a note event per failover). */
  onFailover?: (from: string, to: string, err: ProviderError) => void;
}

const nowMs = (): number => Date.now();

export const createFallbackProvider = (
  routes: FailoverRoute[],
  events: FallbackChainEvents = {},
): ModelProvider => {
  if (routes.length === 0) throw new Error('fallback chain requires at least one route');
  const cooldownUntil = new Map<string, number>();

  const firstRoute = routes[0]!;
  return {
    name: firstRoute.provider.name,
    liveReady: routes.some((r) => r.provider.liveReady),
    async structuredCall<T>(
      req: StructuredCallRequest,
      parse: (raw: unknown) => T | Error,
    ): Promise<StructuredCallResult<T>> {
      const t = nowMs();
      const usable = routes.filter((r) => r.configId === '' || (cooldownUntil.get(r.configId) ?? 0) <= t);
      // Cooldown never empties the chain: if every route is cooling, try them all in
      // order anyway (LiteLLM exempts single-deployment groups for the same reason —
      // cooling the only option equals stopping the product).
      const chain = usable.length > 0 ? usable : routes;
      for (let i = 0; i < chain.length; i += 1) {
        const route = chain[i]!;
        const res = await route.provider.structuredCall<T>(req, parse);
        if (res.ok) return res;
        const err = res.error ?? { kind: 'provider_error' as const, message: 'unknown failure', retryable: false };
        const next = chain[i + 1];
        if (next === undefined || !isFailoverWorthy(err)) {
          // terminal: no route left, or the failure says "another config won't help"
          return res;
        }
        if (route.configId !== '') cooldownUntil.set(route.configId, nowMs() + COOLDOWN_MS);
        events.onFailover?.(route.provider.name, next.provider.name, err);
      }
      // The loop always returns on its last iteration (next === undefined -> return);
      // reaching here means the routes array mutated mid-call — a programmer error.
      throw new Error('fallback chain: unreachable terminal state');
    },
  };
};
