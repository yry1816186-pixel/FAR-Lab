import type { Store } from '../persistence/store.js';
import type { ReasoningStyle, ReasoningGear } from '../domain/model-config.js';
import type { ModelProviderConfig } from '../domain/model-config.js';
import type { ResearchRun } from '../domain/run.js';
import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import { createCustomProvider, missingConfigProvider, CUSTOM_PROVIDER_PREFIX } from '../providers/custom.js';
import { createFallbackProvider } from '../providers/fallback.js';
import { computeRequestHash } from '../providers/http.js';
import { canonicalSha256 } from '../shared/crypto.js';
import { isQwenFamily, isBailianEndpoint } from '../model-plane/capabilities.js';
import { getProvider } from '../providers/index.js';
import { createOfflineDevProvider } from '../providers/offline.js';

/** Registry route a run may pin via routeOverride — same set the CLI --route accepts. */
export type BuiltinRouteName = 'zai' | 'dashscope' | 'deepseek' | 'universal' | 'offline';

/** The built-in provider for a named route ('offline' = the deterministic dev wire). */
export const builtinRouteProvider = (route: BuiltinRouteName): ModelProvider | null => {
  if (route === 'offline') {
    return createOfflineDevProvider({
      id: 'mcfg_cli_offline', label: '离线开发路由 (routeOverride)',
      createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
      wire: 'offline', baseUrl: 'https://offline.farlab.invalid/v1',
      modelId: 'farlab-offline-deterministic', apiKey: '', fallbackConfigIds: [],
    });
  }
  return getProvider(route) ?? null;
};

/**
 * Runtime model-route resolution for the user configuration layer:
 *   1. run.providerConfigId (explicitly chosen when the run was created)
 *   2. meta activeModelConfigId (the user's global default)
 *   3. caller's fallback (the env chain — FARLAB_MODEL_PROVIDER; competition/
 *      automation route, untouched)
 *
 * Rebuilt from SQLite on every makeContext — config edits (key/model/endpoint) apply
 * to the next stage of a live run and every receipt records what actually served the
 * call. A dangling config id resolves to a fail-closed provider, never to a
 * silent model swap.
 *
 * BP-4: when the resolved config declares fallbackConfigIds, the returned provider is
 * a failover CHAIN (primary first, then its fallbacks, cycles cut, depth-bounded).
 * A config without fallbacks resolves exactly as before — opt-in behavior change.
 *
 * COMPETITION ROUTE MODE (R2 lane 11, opt-in meta switch `competition_route_mode`):
 * when ON, every route this resolver can hand to production (pipeline runs via
 * composition.ts and the resident agent via conversations.ts — both flow through
 * here) is held to the official XH-202619 calling rule (re-verified 2026-08-25,
 * evidence/W-MP/RESEARCH-competition-2026-08-25.md §A1): base model Qwen-family AND
 * served via a Bailian (*.aliyuncs.com) endpoint. Violations — including a NO-config
 * resolution, which would otherwise leak into the env-chain default (zai, non-Bailian)
 * — resolve to a fail-closed refusal provider instead of a usable route. OFF (default)
 * = exact legacy behavior. The switch itself is exposed for the API/settings surface
 * (lane 12/01 handoff); the gate re-reads the meta on every resolution.
 */

export const ACTIVE_MODEL_CONFIG_META_KEY = 'activeModelConfigId';

/** Opt-in competition route enforcement: 'on' = enforce Qwen-via-Bailian at this chokepoint. */
export const COMPETITION_ROUTE_META_KEY = 'competition_route_mode';

export const readCompetitionRouteMode = (store: Store): boolean =>
  store.getMeta(COMPETITION_ROUTE_META_KEY) === 'on';

export const writeCompetitionRouteMode = (store: Store, on: boolean): void => {
  if (on) store.setMeta(COMPETITION_ROUTE_META_KEY, 'on');
  else store.deleteMeta(COMPETITION_ROUTE_META_KEY);
};

/** Fail-closed refusal provider for competition-route violations (no network, no fabricated output). */
const competitionRefusalProvider = (reason: string): ModelProvider => ({
  name: 'competition-route-gate',
  liveReady: false,
  structuredCall<T>(req: StructuredCallRequest): Promise<StructuredCallResult<T>> {
    return Promise.resolve({
      ok: false,
      error: {
        kind: 'provider_error',
        message:
          `competition-route-gate: ${reason} — official rule requires Qwen-family base via Alibaba Bailian ` +
          `(evidence/W-MP/RESEARCH-competition-2026-08-25.md §A1); turn competition route mode off only if this workspace is not used for the submission route`,
        retryable: false,
      },
      receipt: {
        provider: 'competition-route-gate',
        modelId: '(refused)',
        latencyMs: 0,
        usage: {},
        requestHash: computeRequestHash(req),
        outputHash: canonicalSha256(''),
        executionMode: 'live',
      },
    });
  },
});

/** Official-rule compliance of one config: Qwen-family model on a Bailian endpoint. Null = compliant. */
const competitionViolationOf = (cfg: ModelProviderConfig): string | null => {
  if (!isQwenFamily(cfg.modelId)) {
    return `model config "${cfg.label}" (${cfg.id}): modelId "${cfg.modelId}" is not Qwen-family`;
  }
  if (!isBailianEndpoint(cfg.baseUrl)) {
    return `model config "${cfg.label}" (${cfg.id}): baseUrl "${cfg.baseUrl}" is not a Bailian (*.aliyuncs.com) endpoint`;
  }
  return null;
};

/** Max routes in a chain (primary + declared fallbacks, cycles cut by the visited set). */
const MAX_CHAIN_ROUTES = 6;

/**
 * Flatten the declared failover chain breadth-first: primary, then ITS fallbacks in
 * declared order, then each fallback's own fallbacks — a declared fallback is never
 * silently ignored (red-team P1-2). Cycles are cut by the visited set; dangling ids
 * stop that branch without failing the rest of the chain.
 */
const buildChain = (store: Store, firstConfigId: string): ModelProviderConfigChain => {
  const firstCfg = store.getObject('model_config', firstConfigId);
  if (firstCfg === null) return { kind: 'missing', configId: firstConfigId };
  const routes: Array<{ provider: ModelProvider; configId: string }> = [];
  const seen = new Set<string>();
  const queue: string[] = [firstConfigId];
  while (queue.length > 0 && routes.length < MAX_CHAIN_ROUTES) {
    const configId = queue.shift()!;
    if (seen.has(configId)) continue;
    seen.add(configId);
    const cfg = store.getObject('model_config', configId);
    if (cfg === null) continue; // dangling id: cut this branch, keep the rest
    routes.push({ provider: createCustomProvider(cfg), configId: cfg.id });
    queue.push(...cfg.fallbackConfigIds);
  }
  return { kind: 'routes', routes };
};

type ModelProviderConfigChain =
  | { kind: 'routes'; routes: Array<{ provider: ModelProvider; configId: string }> }
  | { kind: 'missing'; configId: string };

export const resolveRunProvider = (store: Store, run: ResearchRun): ModelProvider | null => {
  // Run-scoped built-in route (CLI --route): pinned at creation so a resume in a
  // NEW process keeps the run on its route instead of falling to the workspace
  // default (live-observed: zai run resumed into a dead deepseek default, 402).
  if (run.routeOverride !== undefined) {
    return builtinRouteProvider(run.routeOverride);
  }
  const configId = run.providerConfigId ?? store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  const competition = readCompetitionRouteMode(store);
  if (configId === null) {
    // Competition mode must not leak into the caller's env-chain default (zai — a
    // non-Bailian route): a fail-closed refusal beats a silently non-compliant default.
    return competition
      ? competitionRefusalProvider('no model config selected while competition route mode is ON — declare a Bailian-served Qwen model config (or set the active default)')
      : null;
  }
  const chain = buildChain(store, configId);
  if (chain.kind === 'missing') return missingConfigProvider(configId);
  if (competition) {
    // EVERY route in the chain (primary + declared failovers) must comply: a mid-run
    // failover onto a non-compliant route would breach the official rule invisibly.
    for (const route of chain.routes) {
      const cfg = store.getObject('model_config', route.configId);
      if (cfg === null) continue; // unreachable: buildChain only emits existing configs
      const violation = competitionViolationOf(cfg);
      if (violation !== null) return competitionRefusalProvider(violation);
    }
  }
  if (chain.routes.length === 1) return chain.routes[0]!.provider;
  return createFallbackProvider(chain.routes);
};

/**
 * RU-9 GO2: the run's reasoning route — FIRST config in the resolved chain
 * that declares a reasoning capability (style+defaultGear from its config).
 * null for env builtin routes / undeclared configs = zero reasoning fields
 * on the wire (exact legacy behavior).
 */
export const resolveRunReasoningRoute = (
  store: Store,
  run: ResearchRun,
): { style: ReasoningStyle; defaultGear: ReasoningGear; modelId: string } | null => {
  // A run pinned to a registry route uses that route's wire defaults — the
  // ACTIVE config's reasoning declaration must not leak onto it.
  if (run.routeOverride !== undefined) return null;
  const configId = run.providerConfigId ?? store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  if (configId === null) return null;
  const chain = buildChain(store, configId);
  if (chain.kind === 'missing') return null;
  for (const route of chain.routes) {
    const cfg = store.getObject('model_config', route.configId);
    if (cfg?.reasoning !== undefined) {
      return { style: cfg.reasoning.style, defaultGear: cfg.reasoning.defaultGear, modelId: cfg.modelId };
    }
  }
  return null;
};

/** Exposed for tests: the route names a resolved chain would try, in order. */
export const resolveChainNames = (store: Store, firstConfigId: string): string[] => {
  const chain = buildChain(store, firstConfigId);
  return chain.kind === 'missing' ? [`${CUSTOM_PROVIDER_PREFIX}${chain.configId}`] : chain.routes.map((r) => r.provider.name);
};
