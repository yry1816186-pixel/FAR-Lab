import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import {
  routeCall,
  type RouteCandidate,
  type RoutingDecision,
  type RoutingPolicy,
  type TaskClass,
  type BudgetCtx,
} from './routing.js';

/**
 * MODEL PLANE FACADE (model-plane lane, 2026-08-24).
 *
 * Sits ABOVE the provider/fallback layer and BELOW the agent runtime: callers ask for
 * a TASK CLASS, the plane routes deterministically (routing.ts), delegates to the
 * selected route's ModelProvider (which may itself be an explicit failover chain —
 * fallback.ts), and stamps the routing decision onto the receipt.
 *
 * Boundary rules (mission §"不要重做 Agent Loop" / §fallback):
 *  - No silent model swap: routing happens ONCE, BEFORE the call, and the decision is
 *    on the receipt (receipt.routing). Mid-call failover remains the provider layer's
 *    explicit, receipted mechanism.
 *  - No route eligible → fail-visible error naming every candidate's rejection reason.
 *    The plane never "tries something anyway".
 *  - The plane never fabricates results: the inner provider's StructuredCallResult is
 *    returned as-is apart from the additive receipt.routing stamp.
 */

export interface ModelPlaneEvents {
  /** Observability sink: every routing decision (selected or not) lands here. */
  onDecision?: (decision: RoutingDecision) => void;
}

export interface ModelPlaneConfig {
  candidates: RouteCandidate[];
  policy?: RoutingPolicy;
  /** Per-call budget context (remaining USD / estimated input tokens); default unconstrained. */
  budget?: () => BudgetCtx;
  events?: ModelPlaneEvents;
}

export interface RoutedCallResult<T> {
  result: StructuredCallResult<T>;
  decision: RoutingDecision;
}

export interface ModelPlane {
  /** Full routed call: decision + stamped receipt + provider result in one return. */
  call<T>(taskClass: TaskClass, req: StructuredCallRequest, parse: (raw: unknown) => T | Error): Promise<RoutedCallResult<T>>;
  /** Routing without calling (previews, UI, tests). */
  decide(taskClass: TaskClass): RoutingDecision;
  /**
   * A ModelProvider-shaped view PINNED to one task class — the drop-in adoption seam
   * for invokeStructured/callStructured-style callers: provider.structuredCall routes,
   * stamps receipt.routing, delegates. Failures of ROUTING itself (no eligible route)
   * return a provider_error result carrying the full candidate/ reason list — visible,
   * never a fabricated success and never a silent alternate model.
   */
  providerFor(taskClass: TaskClass): ModelProvider;
  readonly candidates: readonly RouteCandidate[];
}

export const createModelPlane = (config: ModelPlaneConfig): ModelPlane => {
  const { candidates } = config;
  const policy: RoutingPolicy = config.policy ?? { mode: 'default' };
  if (candidates.length === 0) throw new Error('model plane requires at least one route candidate');

  const decide = (taskClass: TaskClass): RoutingDecision => {
    const decision = routeCall(taskClass, candidates, policy, config.budget?.() ?? {});
    config.events?.onDecision?.(decision);
    return decision;
  };

  const routeFor = (taskClass: TaskClass): RouteCandidate => {
    const decision = decide(taskClass);
    if (decision.selectedRoute === null) {
      const reasons = decision.candidates.map((c) => `${c.name}(${c.modelId}): ${c.reason}`).join('; ');
      throw new Error(`no eligible route for task class "${taskClass}" under policy "${policy.mode}" — ${reasons}`);
    }
    const route = candidates.find((c) => c.name === decision.selectedRoute)!;
    return route;
  };

  const stampRouting = <T>(res: StructuredCallResult<T>, decision: RoutingDecision): StructuredCallResult<T> => ({
    ...res,
    receipt: { ...res.receipt, routing: { taskClass: decision.taskClass, route: decision.selectedRoute ?? '(none)', selectedVia: decision.selectedVia ?? 'none' } },
  });

  const callImpl = async <T>(taskClass: TaskClass, req: StructuredCallRequest, parse: (raw: unknown) => T | Error): Promise<RoutedCallResult<T>> => {
    const decision = decide(taskClass);
    if (decision.selectedRoute === null) {
      const reasons = decision.candidates.map((c) => `${c.name}(${c.modelId}): ${c.reason}`).join('; ');
      return {
        result: {
          ok: false,
          error: { kind: 'provider_error', message: `model plane: no eligible route for "${taskClass}" — ${reasons}`, retryable: false },
          receipt: {
            provider: 'model-plane', modelId: '(unrouted)', latencyMs: 0, usage: {},
            requestHash: '', outputHash: '',
            routing: { taskClass, route: '(none)', selectedVia: 'none' },
            executionMode: 'live',
          },
        } satisfies StructuredCallResult<T>,
        decision,
      };
    }
    const route = candidates.find((c) => c.name === decision.selectedRoute)!;
    const result = await route.provider.structuredCall<T>(req, parse);
    return { result: stampRouting(result, decision), decision };
  };

  return {
    candidates,
    decide,
    call: callImpl,
    providerFor: (taskClass: TaskClass): ModelProvider => ({
      name: `model-plane:${taskClass}`,
      get liveReady(): boolean {
        try {
          return routeFor(taskClass).provider.liveReady;
        } catch {
          return false;
        }
      },
      structuredCall: <T>(req: StructuredCallRequest, parse: (raw: unknown) => T | Error) =>
        callImpl<T>(taskClass, req, parse).then((r) => r.result),
    }),
  };
};
