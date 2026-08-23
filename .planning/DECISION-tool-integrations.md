# DECISION: 工具接入系统（Tool Integrations, TIS）

日期：2026-08-23
状态：IMPLEMENTED（T1–T5 全部落地；离线测试全绿；live 连接属于研究者自己的动作，产品如实显示连接状态）

## 决策

产品支持研究者自配外部工具，统一为四种声明式配置 + 一种可执行扩展：

| kind | 形态 | 执行位置 |
|---|---|---|
| `mcp_server` | stdio 或 streamable-HTTP 传输 | 外部进程 / 远程端点 |
| `skill` | 内联 markdown（frontmatter 字段） | 会话提示注入（user 层） |
| `command` | 提示词模板 | 命令面板 + 输入框 `/` 菜单 |
| `hook_rule` | 声明式策略（block/require_approval/log） | 权限引擎 + ExtensionBus |
| `plugin`（导入形态） | far-plugin.json 清单 + 可选任意 JS entry | 独立宿主子进程 |

关键架构选择（及理由）：

1. **单一实体表 `tool_integration`**（discriminatedUnion），与 model_config 同构：zod schema + store 泛型表 + CRUD API + SettingsPanel + 密钥掩码（env/header 值只存本地 SQLite，API 投影一律 `••••` 尾 4 位）。跨字段语义（stdio↔command、http↔url、hook 事件↔动作）在 `integrationSemanticIssues` 于所有创建边界强制——superRefine 会破坏 discriminatedUnion/omit，故移出 zod。
2. **插件宿主复用 MCP 传输**：任意 JS 插件运行在 `src/plugins/host-main.ts` 宿主子进程，说与 MCP stdio 相同的 JSON-RPC 协议（initialize/tools/list/tools/call）外加 hooks/beforeTool|afterTool 两法。产品进程永不加载插件代码；宿主崩溃不殃及产品。插件 entry 展开为一个 mcp_server 集成——一套客户端、一套风险分级、一套权限机制，无第二协议。
3. **hook_rule 双层编译**：block → PermissionRule deny（bypassImmune，模式切换不可绕过）；require_approval → ask（继承引擎的 (tool,args) 精确审批绑定与 TTL；无头环境 ask 自动拒绝=失效安全）；log → ExtensionBus 观察事件。模式匹配在装配时对已知工具展开，热路径零字符串匹配。
4. **MCP 名称净化**：`mcp_<label>_<tool>` 规整到内核 TOOL_NAME_RE（≤32 字符），冲突加 `_2.._9` 后缀，不可救药的名称响亮跳过并记录——绝不静默覆盖或猜测。
5. **对话式配置生成接入 resident-agent 提案体系**（兄弟会话的 ConversationProposal）：`ConversationActionKind` 增加 `create_tool_integration`。Agent 可起草配置（draft+rationale+warnings），批准执行后**强制 enabled:false 入库**——Agent 能暂存，只有研究者能在设置里启用。Agent 永不自我激活（与「启动研究由研究者点击」同原则）。
6. **插件导入只走本地目录**（`POST /api/v1/tools/import-plugin`，须携带 `reviewed:true`）：无远程下载，供应链审查前置；导入的配置一律停用，研究者逐项审查后启用。

## 威胁模型（诚实边界）

- 子进程隔离防**崩溃/挂起**（超时 30s/工具、2s/hook），**不防恶意代码**：插件与 MCP server 拥有研究者自己的 OS 权限，与业界 MCP 信任模型一致。控制点=安装时人工审查 + 显式激活 + 密钥只写不读。
- MCP/插件工具 riskClass 默认 `execute`（保守）；explore 模式下非 read 工具一律拒绝。
- 对话起草的 env 值可能含研究者粘贴的密钥：与设置手输同威胁域（本地 SQLite，不出 API）。

## 变更面

新增：`src/domain/tool-integration.ts`、`src/agent/{mcp-http,mcp-manager,hooks-compose}.ts`、`src/plugins/{manifest,host-main,import}.ts`、`web/src/components/ToolsSection.tsx`、`web/src/hooks/{useToolIntegrations,useToolCommands}.ts`、tests 6 个（tool-integration/mcp-http/mcp-manager/hooks-compose/api-tools/plugins/tool-proposals）。
修改：ids.ts、domain/index.ts、store.ts（新表，泛型 objects 免迁移）、mcp.ts（McpToolCaller 结构接口）、capabilities/refine.ts（会话装配 MCP/hook/skill + 生命周期 try/finally）、cli/agent.ts（状态显示）、api.ts（`/api/v1/tools` CRUD/test/import-plugin）、conversation.ts + conversation-agent.ts + conversations.ts（create_tool_integration 最小集成）、web 侧 SettingsPanel/App/ConversationView/ResearchComposer/CommandPalette（经 palette 命令）/endpoints/types/dict/styles。

## 验证

离线全绿：T1 23 + plugins 9（含真实子进程端到端）+ api-tools 4 + tool-proposals 5 + 兄弟会话 conversations 11 = 1162/1164 passed（2 skip 为既有；reasoning-conversation 5 失败为兄弟会话 18:48 in-flight 文件，非本变更面）。tsc 双端 0 错。live 连接（真实远程 MCP/云插件）按无 live-API 指令不做实测——`/tools/:id/test` 路由即为研究者的诚实连接验证面。
