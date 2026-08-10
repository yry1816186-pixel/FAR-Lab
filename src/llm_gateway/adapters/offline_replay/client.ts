import type { LlmRequest, LlmResponse, ProviderAdapter } from '../../types.ts';
import { DEFAULT_DEMO_FIXTURES } from '../../../agent_loop/demo_fixtures.ts';

/** Input parameters for operations involving offline replay options. */
export interface OfflineReplayOptions {
  readonly modelId?: string;
  readonly modelVersion?: string | null;
  /**
   * 单一全局 fixture：所有调用返回同一内容（legacy · 向后兼容）。
   * 显式设置时优先级最高（stage-agnostic，不查 registry）。
   * 用于裸 gateway 测试 / 单次固定回放。
   */
  readonly fixtureResponse?: string;
  /**
   * stageId → fixture JSON 的自定义注册表。按 request.stageId 命中。
   * 优先于内置 DEFAULT_DEMO_FIXTURES（自定义覆盖默认 hero demo）。
   */
  readonly fixtures?: Readonly<Record<string, string>>;
  readonly providerRequestId?: string | null;
  readonly now?: () => string;
  /**
   * true = 禁用内置 DEFAULT_DEMO_FIXTURES 兜底（严格模式：stageId 未命中即抛错）。
   * 默认 false：无自定义 fixture 时回退内置 hero demo，使无参 createOfflineReplayAdapter() 即可端到端跑通。
   */
  readonly disableDefaultDemo?: boolean;
}

function countTextUnits(messages: LlmRequest['messages']): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

/**
 * 解析本次调用应返回的 fixture 内容。
 *
 * 优先级（高→低）：
 *   1. fixtureResponse（全局·legacy·stage-agnostic）
 *   2. fixtures[stageId]（自定义注册表）
 *   3. DEFAULT_DEMO_FIXTURES[stageId]（内置 hero demo·disableDefaultDemo=true 时跳过）
 *   4. 抛清晰错误（禁静默 echo 回退——echo 产出 schema-invalid 内容，是原默认离线路径断裂的根因）
 *
 * @throws Error 当 stageId 既无自定义 fixture、又不在内置 registry（或严格模式）时
 */
function resolveFixtureContent(request: LlmRequest, options: OfflineReplayOptions): string {
  // 1. legacy 全局 fixture
  if (options.fixtureResponse !== undefined) {
    return options.fixtureResponse;
  }

  const stageId = request.stageId;

  // 2/3. stageId-keyed registry 查找
  if (stageId !== undefined) {
    const custom = options.fixtures?.[stageId];
    if (custom !== undefined) {
      return custom;
    }
    if (options.disableDefaultDemo !== true) {
      const builtIn = DEFAULT_DEMO_FIXTURES[stageId];
      if (builtIn !== undefined) {
        return builtIn;
      }
    }
    const where =
      options.disableDefaultDemo === true
        ? ' (default demo disabled via disableDefaultDemo)'
        : ' and not present in DEFAULT_DEMO_FIXTURES';
    throw new Error(
      `offline_replay: no fixture registered for stageId="${stageId}"${where}. ` +
        'Provide a matching fixtures entry, fixtureResponse, or re-enable the default demo. ' +
        'Silent echo fallback has been removed (it returned schema-invalid content that failed stage zod parse).',
    );
  }

  // 4. 无 stageId 且无 fixtureResponse：调用方未走 agent_loop（未注入 stageId）也未提供全局 fixture。
  //    诚实 fail-fast——禁静默 echo（AGENTS §6 第 2 条：禁 fallback logic that hides broken data）。
  throw new Error(
    'offline_replay: request has no stageId and no fixtureResponse provided. ' +
      'Either set stageId on the request (agent_loop injects it) so the fixture registry can match, ' +
      'or pass fixtureResponse for stage-agnostic calls.',
  );
}

/**
 * create offline replay adapter.
 */
export function createOfflineReplayAdapter(options: OfflineReplayOptions = {}): ProviderAdapter {
  const modelId = options.modelId ?? 'offline-replay-fixture';
  const modelVersion = options.modelVersion ?? null;
  const providerRequestId = options.providerRequestId ?? null;

  return {
    profile: 'offline_replay',
    async call(request: LlmRequest): Promise<LlmResponse> {
      const content = resolveFixtureContent(request, options);
      const inputTokens = countTextUnits(request.messages);
      const outputTokens = content.length;
      const isoTimestamp = options.now === undefined ? new Date(0).toISOString() : options.now();

      return {
        credential: {
          providerProfile: 'offline_replay',
          providerRequestId,
          modelId,
          modelVersion,
          capability: request.responseFormat === 'json_schema' ? 'structured' : 'reasoning',
          isoTimestamp,
          tokenUsage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            // CU4-02（阶段 7 1127）：offline_replay 用字符数估算（伪 token）——
            // measured=false 标记，禁止混入真实成本依据（usage_tokens_total 消费侧按此区分）。
            measured: false,
          },
        },
        content,
        raw: {
          replayed: true,
          messageCount: request.messages.length,
          stageId: request.stageId ?? null,
        },
      };
    },
  };
}
