/**
 * profiles/offline_replay.ts —— FAR-Chain 离线回放 Profile（零 API Key 依赖）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/05_provider.md +
 *   FAR_CHAIN_DEV_SPEC/16_阿里云参与边界与模型中立策略_ALIYUN_MODEL_NEUTRALITY.md。
 *
 * 本 profile 是 Core 默认 profile：无云 key 可跑通所有 Core gates。
 * Competition profile（competition_aliyun_qwen）是完全独立的 entry，不在此文件。
 *
 * 模型中立：本文件不含任何 provider/model 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import { createLlmGateway } from '../llm_gateway/gateway.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../llm_gateway/adapters/offline_replay/client.ts';
import type {
  ProviderProfile,
  LlmCapability,
} from '../llm_gateway/types.ts';

// ---------- Profile 元数据 ----------

export interface ProfileMeta {
  readonly name: ProviderProfile;
  readonly displayName: string;
  readonly description: string;
  readonly defaultModel: string;
  readonly capabilities: readonly LlmCapability[];
  /** true 表示需要 API key（Competition profile 专用）。*/
  readonly requiresApiKey: boolean;
}

export const OFFLINE_REPLAY_PROFILE_META: ProfileMeta = {
  name: 'offline_replay',
  displayName: 'Offline Replay',
  description:
    'Core 默认 profile。无需 API key，使用预录制 fixture 回放，用于 CI / 开发 / 测试。',
  defaultModel: 'offline-replay-fixture',
  capabilities: ['reasoning', 'structured', 'code'],
  requiresApiKey: false,
};

// ---------- Profile 实例（单例） ----------

let cachedGateway: LlmGateway | null = null;

/**
 * 获取离线回放 Gateway（惰性初始化 + 缓存）。
 * 线程安全约束：Node.js 单线程，无需加锁。
 */
export function createOfflineReplayGateway(): LlmGateway {
  if (cachedGateway !== null) {
    return cachedGateway;
  }
  cachedGateway = createLlmGateway([createOfflineReplayAdapter()]);
  return cachedGateway;
}

/**
 * 重置缓存（主要用于测试 teardown）。
 */
export function resetOfflineReplayGateway(): void {
  cachedGateway = null;
}
