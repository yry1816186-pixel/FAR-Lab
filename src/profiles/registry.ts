/**
 * profiles/registry.ts —— FAR-Chain Profile 注册表（模型中立）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/16 §3（llm_gateway core 与 competition profile 边界）+
 *   FAR_CHAIN_DEV_SPEC/05_provider.md。
 *
 * 设计要点：
 *   - 按 name 注册/查找 Profile。
 *   - 支持 Capability-based 查找（如查找所有支持 'reasoning' 的 profile）。
 *   - Core 默认 profile 为 'offline_replay'（零 API key 依赖）。
 *   - Competition profile 仅在注册后才可用（需 DASHSCOPE_API_KEY）。
 *
 * 模型中立：本文件不含任何 provider/model 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile, LlmCapability } from '../llm_gateway/types.ts';
import type { ProfileMeta } from './offline_replay.ts';
import {
  OFFLINE_REPLAY_PROFILE_META,
  createOfflineReplayGateway,
} from './offline_replay.ts';

// ---------- Profile 条目 ----------

export interface ProfileEntry {
  readonly meta: ProfileMeta;
  readonly gateway: LlmGateway;
}

// ---------- 注册表 ----------

const profileRegistry = new Map<ProviderProfile, ProfileEntry>();

// 启动期自动注册离线回放 profile（Core 默认）
profileRegistry.set(OFFLINE_REPLAY_PROFILE_META.name, {
  meta: OFFLINE_REPLAY_PROFILE_META,
  gateway: createOfflineReplayGateway(),
});

// ---------- 注册 / 查询 ----------

export class ProfileRegistryError extends Error {
  constructor(message: string) {
    super(`ProfileRegistry: ${message}`);
    this.name = 'ProfileRegistryError';
  }
}

/**
 * 注册新 profile（如 competition_aliyun_qwen）。
 * 同名 profile 重复注册会抛错（防止意外覆盖）。
 */
export function registerProfile(meta: ProfileMeta, gateway: LlmGateway): void {
  if (profileRegistry.has(meta.name)) {
    throw new ProfileRegistryError(
      `profile "${meta.name}" is already registered. Use replaceProfile() to explicitly replace.`,
    );
  }
  profileRegistry.set(meta.name, { meta, gateway });
}

/**
 * 替换已注册 profile（用于热切换 adapter）。
 * 若 profile 未注册则抛错。
 */
export function replaceProfile(meta: ProfileMeta, gateway: LlmGateway): void {
  if (!profileRegistry.has(meta.name)) {
    throw new ProfileRegistryError(
      `profile "${meta.name}" is not registered. Use registerProfile() first.`,
    );
  }
  profileRegistry.set(meta.name, { meta, gateway });
}

/**
 * 查询 profile 条目；未注册返回 undefined。
 */
export function lookupProfile(name: ProviderProfile): ProfileEntry | undefined {
  return profileRegistry.get(name);
}

/**
 * 查询 profile 条目；未注册抛错。
 */
export function requireProfile(name: ProviderProfile): ProfileEntry {
  const entry = profileRegistry.get(name);
  if (entry === undefined) {
    const registered = [...profileRegistry.keys()].join(', ') || '(none)';
    throw new ProfileRegistryError(
      `profile "${name}" not found. Registered profiles: ${registered}`,
    );
  }
  return entry;
}

/**
 * 列出所有已注册 profile 名称。
 */
export function listProfiles(): readonly ProviderProfile[] {
  return [...profileRegistry.keys()];
}

/**
 * 按 capability 筛选已注册 profile。
 */
export function listProfilesByCapability(capability: LlmCapability): readonly ProviderProfile[] {
  const names: ProviderProfile[] = [];
  for (const [name, entry] of profileRegistry) {
    if ((entry.meta.capabilities as readonly string[]).includes(capability)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * 获取 profile 的 gateway 实例。
 * 未注册抛错。
 */
export function getGateway(name: ProviderProfile): LlmGateway {
  return requireProfile(name).gateway;
}

/**
 * 获取默认 gateway（Core 默认 = offline_replay）。
 */
export function getDefaultGateway(): LlmGateway {
  return requireProfile('offline_replay').gateway;
}

/**
 * 清空注册表（主要用于测试 teardown）。
 */
export function clearProfileRegistry(): void {
  profileRegistry.clear();
}

/**
 * 重置注册表到初始状态（仅含 offline_replay）。
 */
export function resetProfileRegistry(): void {
  profileRegistry.clear();
  profileRegistry.set(OFFLINE_REPLAY_PROFILE_META.name, {
    meta: OFFLINE_REPLAY_PROFILE_META,
    gateway: createOfflineReplayGateway(),
  });
}
