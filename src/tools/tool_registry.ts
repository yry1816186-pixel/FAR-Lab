/**
 * tool_registry.ts —— FAR-Chain 工具注册表（零 MCP SDK 依赖）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/30_MCP工具协议_TOOL_PROTOCOL.md +
 *   FAR_CHAIN_DEV_SPEC/15 §8 #8（禁引入外部 agent runtime·自研确定性 TS）。
 *
 * 设计要点：
 *   - 单例注册表：register / lookup / execute 三核心操作。
 *   - 白名单门控：execute() 前走 assertToolWhitelisted(name)。
 *   - 输入校验：execute() 用 Tool.inputSchema 做最小校验（required 字段存在性）。
 *   - 错误隔离：工具执行抛错不崩注册表，包裹为 ToolResult { ok: false, error }。
 *   - 零类型绕过：无 any / ts-ignore / 双重断言。
 *
 * 模型中立：本文件不含任何 provider/model 字面量。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import { assertToolWhitelisted } from './tool_whitelist.ts';
import type { Tool, ToolResult } from './tool_protocol.ts';
import type { CodeLocation } from '../evidence_log/types.ts';

const TOOL_REGISTRY_CODE_LOCATION: CodeLocation = {
  filePath: 'src/tools/tool_registry.ts',
  location: 'executeTool',
};

// ---------- 错误类型 ----------

export class ToolRegistryError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
  ) {
    super(`ToolRegistry: ${message} (tool="${toolName}")`);
    this.name = 'ToolRegistryError';
  }
}

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public override readonly cause: unknown,
  ) {
    super(`ToolExecutionError: ${message} (tool="${toolName}")`);
    this.name = 'ToolExecutionError';
  }
}

// ---------- 工具注册表（单例） ----------

const registry = new Map<string, Tool>();

// ---------- 注册 / 查询 ----------

/**
 * 注册工具到全局注册表。
 * 同名工具重复注册会抛 ToolRegistryError（防止意外覆盖）。
 */
export function registerTool(tool: Tool): void {
  const existing = registry.get(tool.name);
  if (existing !== undefined) {
    throw new ToolRegistryError(
      `tool "${tool.name}" is already registered. ` +
        'Use replaceTool() to explicitly replace an existing registration.',
      tool.name,
    );
  }
  registry.set(tool.name, tool);
}

/**
 * 显式替换已注册的工具（用于 mock / 测试 / adapter 热切换）。
 * 若工具未注册则抛 ToolRegistryError（防止静默创建）。
 */
export function replaceTool(tool: Tool): void {
  const existing = registry.get(tool.name);
  if (existing === undefined) {
    throw new ToolRegistryError(
      `tool "${tool.name}" is not registered. ` +
        'Use registerTool() for first-time registration.',
      tool.name,
    );
  }
  registry.set(tool.name, tool);
}

/**
 * 查询已注册工具；未注册返回 undefined。
 */
export function lookupTool(name: string): Tool | undefined {
  return registry.get(name);
}

/**
 * 查询已注册工具；未注册抛 ToolRegistryError。
 */
export function requireTool(name: string): Tool {
  const tool = registry.get(name);
  if (tool === undefined) {
    throw new ToolRegistryError(
      `tool "${name}" is not registered. Available tools: ${listToolNames().join(', ') || '(none)'}`,
      name,
    );
  }
  return tool;
}

/**
 * 已注册工具名列表（按注册顺序）。
 */
export function listToolNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * 移除已注册工具。
 * 未注册时静默成功（幂等）。
 */
export function unregisterTool(name: string): void {
  registry.delete(name);
}

/**
 * 清空所有已注册工具（主要用于测试 teardown）。
 */
export function clearRegistry(): void {
  registry.clear();
}

// ---------- 输入校验 ----------

function validateInput(
  tool: Tool,
  input: Readonly<Record<string, unknown>>,
): string | null {
  const schema = tool.inputSchema;
  const required = schema.required ?? [];

  for (const field of required) {
    if (!(field in input)) {
      return `missing required field "${field}"`;
    }
  }

  // 校验 input 中的 key 都在 schema.properties 中声明
  for (const key of Object.keys(input)) {
    if (!(key in schema.properties)) {
      return `unknown field "${key}" (not declared in inputSchema.properties)`;
    }
  }

  return null;
}

// ---------- 执行 ----------

/**
 * 按名称执行工具。
 *
 * 执行流程：
 *   1. 白名单门控：assertToolWhitelisted(name)
 *   2. 注册表查询：requireTool(name)
 *   3. 输入校验：validateInput(tool, input)
 *   4. 工具执行：tool.execute(input)
 *   5. 错误包裹：执行期抛错 → ToolResult { ok: false, error }
 *
 * 注意：执行期抛错不会崩注册表，统一包裹为失败 ToolResult。
 */
export async function executeTool(
  name: string,
  input: Readonly<Record<string, unknown>>,
): Promise<ToolResult> {
  // 1. 白名单门控
  assertToolWhitelisted(name);

  // 2. 注册表查询
  const tool = requireTool(name);

  // 3. 输入校验
  const validationError = validateInput(tool, input);
  if (validationError !== null) {
    return {
      ok: false,
      output: null,
      error: `ToolRegistry input validation: ${validationError}`,
      sourceAnchor: {
        gitCommitSha: '',
        dashscopeRequestId: null,
        isoTimestamp: new Date().toISOString(),
        rawResponseHash: '',
        codeLocation: TOOL_REGISTRY_CODE_LOCATION,
      },
    };
  }

  // 4. 工具执行
  try {
    const result = await tool.execute(input);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      output: null,
      error: `ToolRegistry execution error: ${message}`,
      sourceAnchor: {
        gitCommitSha: '',
        dashscopeRequestId: null,
        isoTimestamp: new Date().toISOString(),
        rawResponseHash: '',
        codeLocation: TOOL_REGISTRY_CODE_LOCATION,
      },
    };
  }
}

/**
 * 同步执行（别名，内部仍用 await，提供给非 async 调用方）。
 */
export function executeToolSync(
  name: string,
  input: Readonly<Record<string, unknown>>,
): Promise<ToolResult> {
  return executeTool(name, input);
}

/**
 * 批量查询已注册工具中符合指定 capabilities 的工具名列表。
 * 用于按能力维度筛选可用工具（如查询所有 math 能力工具）。
 */
export function listToolsByCapability(capability: string): string[] {
  const names: string[] = [];
  for (const [name, tool] of registry) {
    if (tool.capability === capability) {
      names.push(name);
    }
  }
  return names;
}

/**
 * 注册表是否为空。
 */
export function isRegistryEmpty(): boolean {
  return registry.size === 0;
}
