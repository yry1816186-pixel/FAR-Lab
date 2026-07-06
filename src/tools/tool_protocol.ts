/**
 * tool_protocol.ts —— FAR-Chain T12 工具协议接口（零 MCP SDK 依赖）。
 *
 * 设计要点：
 *   - 零 MCP SDK 依赖：不引入 MCP 官方 SDK 包，自研轻量工具协议。
 *   - readonly 标志位：true 表示工具不修改状态（可安全重复调用·离线可复现）。
 *   - requiresSandbox 标志位：true 表示工具需在沙箱内执行。
 *   - capability 联合类型：10 个能力位，覆盖 read/write/evidence/graph/llm/python/math。
 *   - ToolResult.sourceAnchor 必填，确保每次工具执行都可审计（三柱之「可审计」）。
 *
 * 模型中立：本文件不含任何 provider/model 字面量。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import type { SourceAnchor } from '../evidence_log/types.ts';

// ---------- ToolInputSchema：JSON-Schema 风格的工具输入描述 ----------

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

// ---------- ToolCapability：10 个能力位 ----------
//
// 6 个已有能力位（read_evidence / write_evidence / query_graph / render_report /
//   invoke_llm / run_python）+ 4 个新增 math 能力位（solve_symbolic /
//   verify_math_claim / search_premise / formalize_statement）。

export type ToolCapability =
  | 'solve_symbolic'
  | 'verify_math_claim'
  | 'search_premise'
  | 'formalize_statement'
  | 'read_evidence'
  | 'write_evidence'
  | 'query_graph'
  | 'render_report'
  | 'invoke_llm'
  | 'run_python';

// ---------- Tool 接口 ----------

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  /** true=不修改状态（可安全重复调用·离线可复现）。 */
  readonly readonly: boolean;
  /** true=需在沙箱内执行（写操作 / 外部代码执行 / 网络调用）。 */
  readonly requiresSandbox: boolean;
  readonly capability: ToolCapability;
  execute(input: Readonly<Record<string, unknown>>): Promise<ToolResult>;
}

// ---------- ToolResult 接口 ----------
//
// 失败时 ok=false + error 非空 + output=null；
// 成功时 ok=true + output 非空 + error=null。
// sourceAnchor 始终必填（无论成败·确保可审计）。

export interface ToolResult {
  readonly ok: boolean;
  readonly output: Readonly<Record<string, unknown>> | null;
  readonly error: string | null;
  readonly sourceAnchor: SourceAnchor;
}
