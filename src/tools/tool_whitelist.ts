/**
 * tool_whitelist.ts —— T12 工具白名单（10 个工具名·零 MCP SDK 依赖）。
 *
 * 设计要点：
 *   - TOOL_WHITELIST 含 10 个工具名：6 已有能力位 + 4 新增 math 工具。
 *   - isToolWhitelisted(name) 已知返回 true，未知返回 false。
 *   - assertToolWhitelisted(name) 未知名抛错（用于工具执行前置断言）。
 *   - 白名单是工具执行的安全门：未在白名单的工具不可被 ToolRegistry.execute 调用。
 *
 * 模型中立：本文件不含任何 provider/model 字面量。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

// ---------- TOOL_WHITELIST：10 个工具名 ----------
//
// 顺序：6 个已有能力位在前，4 个新增 math 工具在后。
// 新增 math 工具全部 readonly=true / requiresSandbox=false（见 stub_tools.ts）。

export const TOOL_WHITELIST: readonly string[] = [
  // 6 个已有能力位
  'read_evidence',
  'write_evidence',
  'query_graph',
  'render_report',
  'invoke_llm',
  'run_python',
  // 4 个新增 math 工具（readonly=true, requiresSandbox=false）
  'solve_symbolic',
  'verify_math_claim',
  'search_premise',
  'formalize_statement',
];

const WHITELIST_SET: ReadonlySet<string> = new Set(TOOL_WHITELIST);

// ---------- 查询函数 ----------

export function isToolWhitelisted(name: string): boolean {
  return WHITELIST_SET.has(name);
}

export function assertToolWhitelisted(name: string): void {
  if (!isToolWhitelisted(name)) {
    throw new Error(
      `assertToolWhitelisted: tool "${name}" is not in TOOL_WHITELIST ` +
        `(allowed: ${TOOL_WHITELIST.join(', ')})`,
    );
  }
}
