/**
 * sandbox_manifest.ts —— M-08 分层沙箱清单（工具白名单升级版）。
 *
 * 设计要点：
 *   - SandboxHonestyTier 诚实分层：manifest-only → process-isolation → network-isolation → full-vm-isolation。
 *   - 未实现物理隔离前只标 manifest-only（不夸大隔离等级·遵守 §2.4）。
 *   - 每个工具条目含 toolName / requiresSandbox / sideEffect / honestyTier / resourceLimits。
 *   - 复用现有 TOOL_WHITELIST 作为工具名权威来源。
 *
 * 模型中立：本文件不含任何 provider/model 字面量。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import { TOOL_WHITELIST } from './tool_whitelist.ts';

// ---------- SandboxHonestyTier：诚实分层 ----------

export const SANDHONESTY_TIERS = [
  'manifest-only',
  'process-isolation',
  'network-isolation',
  'full-vm-isolation',
] as const;

export type SandboxHonestyTier = (typeof SANDHONESTY_TIERS)[number];

// ---------- SandboxResourceLimits：资源限制 ----------

export interface SandboxResourceLimits {
  /** 最大 CPU 时间（毫秒），null=无限制。 */
  readonly maxCpuMs: number | null;
  /** 最大内存（MB），null=无限制。 */
  readonly maxMemoryMb: number | null;
  /** 最大磁盘（MB），null=无限制。 */
  readonly maxDiskMb: number | null;
  /** 是否允许出站网络。manifest-only 层始终为 false。 */
  readonly allowNetwork: boolean;
}

// ---------- SandboxToolEntry：单个工具的沙箱条目 ----------

export interface SandboxToolEntry {
  readonly toolName: string;
  /** 是否需要沙箱执行。 */
  readonly requiresSandbox: boolean;
  /** 工具是否有副作用（写操作 / 网络调用 / 外部执行）。 */
  readonly sideEffect: boolean;
  /** 该工具落地时的实际隔离层级。 */
  readonly honestyTier: SandboxHonestyTier;
  /** 资源限制（manifest-only 时为 null）。 */
  readonly resourceLimits: SandboxResourceLimits | null;
}

// ---------- SandboxManifest：分层沙箱清单 ----------

export interface SandboxManifest {
  readonly version: 1;
  /** 全局诚实层级：取所有工具条目的最低层级。 */
  readonly globalHonestyTier: SandboxHonestyTier;
  /** 工具清单。 */
  readonly tools: Readonly<Record<string, SandboxToolEntry>>;
  /** 是否允许持久化工作区。manifest-only 层始终为 false。 */
  readonly allowPersistentWorkspace: boolean;
  /** 清单生成时间戳。 */
  readonly generatedAt: string;
}

// ---------- 工厂函数 ----------

/**
 * 为单个工具创建沙箱条目。
 * 当前所有工具均为 manifest-only（无实际隔离·见 §2.4）。
 */
export function createSandboxToolEntry(params: {
  readonly toolName: string;
  readonly requiresSandbox: boolean;
  readonly sideEffect: boolean;
}): SandboxToolEntry {
  if (!(TOOL_WHITELIST as readonly string[]).includes(params.toolName)) {
    throw new Error(
      `createSandboxToolEntry: "${params.toolName}" is not in TOOL_WHITELIST`,
    );
  }

  return {
    toolName: params.toolName,
    requiresSandbox: params.requiresSandbox,
    sideEffect: params.sideEffect,
    honestyTier: 'manifest-only',
    resourceLimits: null,
  };
}

/**
 * 构建完整 SandboxManifest。
 * 覆盖 TOOL_WHITELIST 中所有 10 个工具。
 */
export function buildSandboxManifest(params: {
  readonly generatedAt: string;
}): SandboxManifest {
  const toolDefaults: Readonly<Record<string, { requiresSandbox: boolean; sideEffect: boolean }>> = {
    read_evidence: { requiresSandbox: false, sideEffect: false },
    write_evidence: { requiresSandbox: true, sideEffect: true },
    query_graph: { requiresSandbox: false, sideEffect: false },
    render_report: { requiresSandbox: false, sideEffect: false },
    invoke_llm: { requiresSandbox: true, sideEffect: true },
    run_python: { requiresSandbox: true, sideEffect: true },
    solve_symbolic: { requiresSandbox: false, sideEffect: false },
    verify_math_claim: { requiresSandbox: false, sideEffect: false },
    search_premise: { requiresSandbox: false, sideEffect: false },
    formalize_statement: { requiresSandbox: false, sideEffect: false },
  };

  const tools: Record<string, SandboxToolEntry> = {};
  for (const toolName of TOOL_WHITELIST) {
    const defaults = toolDefaults[toolName];
    if (defaults === undefined) {
      throw new Error(
        `buildSandboxManifest: missing defaults for whitelisted tool "${toolName}"`,
      );
    }
    tools[toolName] = createSandboxToolEntry({
      toolName,
      requiresSandbox: defaults.requiresSandbox,
      sideEffect: defaults.sideEffect,
    });
  }

  // 全局诚实层级取最低：所有条目均为 manifest-only → global = manifest-only
  const tiers: SandboxHonestyTier[] = Object.values(tools).map((entry) => entry.honestyTier);
  const globalHonestyTier = lowestHonestyTier(tiers);

  return {
    version: 1,
    globalHonestyTier,
    tools,
    allowPersistentWorkspace: false,
    generatedAt: params.generatedAt,
  };
}

// ---------- 查询函数 ----------

/**
 * 查询工具是否在沙箱清单中且允许执行。
 */
export function isToolSandboxAllowed(
  manifest: SandboxManifest,
  toolName: string,
): boolean {
  const entry = manifest.tools[toolName];
  if (entry === undefined) {
    return false;
  }
  return true;
}

/**
 * 获取清单中所有需要沙箱执行却仅为 manifest-only 的工具名。
 * 用于 HonestyWall 标注"声称沙箱但未落地"。
 */
export function getUnresolvedSandboxTools(manifest: SandboxManifest): string[] {
  const unresolved: string[] = [];
  for (const entry of Object.values(manifest.tools)) {
    if (entry.requiresSandbox && entry.honestyTier === 'manifest-only') {
      unresolved.push(entry.toolName);
    }
  }
  return unresolved;
}

/**
 * 获取全局最低诚实层级。
 */
export function lowestHonestyTier(tiers: readonly SandboxHonestyTier[]): SandboxHonestyTier {
  if (tiers.length === 0) {
    return 'manifest-only';
  }
  const order: readonly SandboxHonestyTier[] = [
    'manifest-only',
    'process-isolation',
    'network-isolation',
    'full-vm-isolation',
  ];
  let lowest = tiers[0]!;
  for (const tier of tiers) {
    if (order.indexOf(tier) < order.indexOf(lowest)) {
      lowest = tier;
    }
  }
  return lowest;
}
