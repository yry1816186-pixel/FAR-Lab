# FAR-Lab 扩展性指南（Extensibility）

本项目的自由扩展面：一切能力均为真实实现，配置即生效，无演示态。每个面都给出入口、机制与边界。

## 总览

| 扩展面 | 入口 | 机制 |
|---|---|---|
| Skills（技能） | `skills/*.md`、设置→工具、插件携带 | frontmatter 清单 + 任务相关性注入（零匹配=零上下文成本） |
| Plugins（插件） | `far plugin install <dir>`、设置→工具 | `far-plugin.json` 声明式清单，展开为 skills/commands/hooks/MCP，全部停用入库待审 |
| MCP 服务器 | `far mcp add/list/enable/probe`、设置→工具 | stdio + streamable-HTTP 客户端，风险分级准入，探针真连验证 |
| Commands（命令） | 插件清单、设置→工具 | 提示词模板，命令面板 / 会话输入框 `/<name>` 触发 |
| Hooks（钩子） | 插件清单、设置→工具 | 声明式规则→内核权限（block/require_approval/log）；插件进程内 beforeTool/afterTool |
| 集成终端 | web 侧栏「终端」 | 真实登录 shell 会话（SSE 输出流；无 PTY：vim/htop 等全屏程序不支持，UI 如实标注） |
| Shell 执行（agent） | 会话中让 agent 跑命令 | `run_command` 提案 → 批准卡（命令原文可见）→ 登录 shell 执行，cwd 围栏+超时+退出码诚实 |
| 文件读/查 | agent 内建工具 | `read_file` / `find_files`（glob） / `grep_content`（正则）：根围栏、二进制检测、有界扫描 |
| HTTP 代理 / 自定义 CA | `FARLAB_HTTPS_PROXY` / `FARLAB_CA_CERT` 等环境变量 | Node 原生 fetch 全局生效（providers/文献源/MCP HTTP），`far probe net` 环回自检 |
| 思考过程 | 会话消息卡「思考过程」 | 三线制捕获（reasoning_content / thinking 块 / thought parts），仅展示不回灌 |
| 浏览器控制 | MCP 接入 Playwright MCP | 见下方配方 |
| 电脑控制 | MCP 生态（desktop-commander 等） | 见下方配方 |

## MCP 快速接入（含浏览器/电脑控制）

```bash
# 通用：添加（默认停用，审查后启用）
far mcp add <label> --command <可执行文件> [--args "a,b"] [--env K=V] [--risk read|edit|execute|destructive]
far mcp add <label> --url https://<host>/mcp            # streamable-HTTP
far mcp probe <label>     # 真连：initialize + tools/list，结果持久化为 lastTest
far mcp enable <label>
```

### 浏览器控制（Playwright MCP）

```bash
npm install -g @playwright/mcp@latest   # 或 npx 免安装
far mcp add playwright --command npx --args "@playwright/mcp@latest,--browser,chromium" --risk execute
far mcp probe playwright                 # 真实验证：应列出 navigate/click/snapshot 等工具
far mcp enable playwright
```

启用后，对话会话的 `list_capabilities` 会展示该服务器的工具（按研究者声明的 riskClass 准入；read 级会话只收 read 级风险服务器）。`@playwright/mcp` 提供 navigate / click / type / snapshot 等真实浏览器操作。

### 电脑控制（桌面自动化）

推荐接入成熟的桌面控制 MCP 服务器（按需选择）：

```bash
# desktop-commander（文件系统/进程/终端级控制，开源）
far mcp add desktop-commander --command npx --args "@wonderwhy-er/desktop-commander@latest" --risk destructive
# Windows 自动化（UI Automation 级）
far mcp add windows-automation --command npx --args "@sadam/computer-controller-mcp@latest" --risk destructive
```

注意：`--risk destructive` 的服务器**不会**进入自动研究会话（admission 只收 read 级），仅在你明确批准的交互场景中可用；destructive 级调用始终要求批准（内核 strictest-wins 权限）。

## 插件

本地目录 + `far-plugin.json`（见 `src/plugins/manifest.ts` 的 zod 契约）：

```bash
far plugin install ./my-plugin   # 展开为 integrations，全部 DISABLED
far plugin list
```

清单可携带 `skills` / `commands` / `hookRules` / `mcpServers` / `entry`（JS 入口，子进程 host 隔离运行，JSON-RPC over stdio）。供应链纪律：仅本地目录导入，不联网拉取；研究者先审再启用。

## Agent 自写技能 / 工具链

对话中直接说「帮我沉淀一个技能」——agent 会用 `create_tool_integration` 提交**草稿**（skill/command/hook/MCP 四类全支持，含完整 body），批准后入库仍为停用态，在设置→工具中审查后启用；下一次会话装配即刻生效。多能力组合（插件套链）即多个 integration 的叠加，`list_capabilities` 工具可让 agent 自己发现可用能力面。

## 网络（代理与证书）

```bash
# .env 或环境变量（CLI/serve 启动时自动应用；进程内一次 re-exec 使 Node 原生 fetch 生效）
FARLAB_HTTPS_PROXY=http://127.0.0.1:7890
FARLAB_HTTP_PROXY=http://127.0.0.1:7890
FARLAB_NO_PROXY=localhost,127.0.0.1
FARLAB_CA_CERT=/path/to/ca.pem       # 企业自签 CA
far probe net                        # 状态 + 真实环回隧道自检（不触外网）
```

覆盖面：模型 providers、文献源（OpenAlex/arXiv/CrossRef/EuropePMC）、MCP streamable-HTTP —— 全部走全局 fetch，一次配置全局生效。

## 终端与终端 Profile 继承

- Web「终端」面板 = 你的系统登录 shell（Windows: pwsh→powershell→cmd 优先级；POSIX: `$SHELL`），登录语义加载 Profile（.bash_profile/.zprofile、PS profile、cmd AutoRun）；`FARLAB_SHELL` 可强制指定。
- 无 PTY（进程级 stdio 管道）：命令行工作流真实可用，全屏交互程序不可用——UI 明示。
- `FARLAB_TERMINAL=off` 一键禁用整个终端面。

## 组件（components）与索引（indexing）

- **组件**：本产品中插件的可组合资产 = skills + commands + hookRules + mcpServers + entry（见 manifest 契约）。没有独立的「UI 组件挂载」系统——不发明假能力；web 界面能力面见设置→工具。
- **索引**：研究工作区对象（问题/假设/主张/会话/记忆）走 SQLite FTS5 真实全文索引（`search_workspace` / `recall_memory` 工具）；文件面（find/grep）为有界实时扫描——不做会漂移的持久文件索引。

## 安全边界（详见 SECURITY.md）

- 插件/MCP/终端/run_command 都以研究者本机权限运行（与插件 host 相同信任模型）——这是文档化信任边界，不是沙箱承诺。
- 会话准入按 riskClass 最小化；插件自报 `readOnlyHint` 等仅作展示，永不覆盖研究者声明的风险级。
- agent 的 shell 提案一律人工批准卡（命令原文展示）；destructive 级钩子规则不可被 bypass 模式跳过。
