# v2 OSS 尽调：执行内核/沙箱/工具运行环境 —— MCP 协议面与工具层增量

日期：2026-08-22。方法：GitHub API 实值（WebFetch）+ 本地克隆直读（`.cache/repos/ag2`）+ zread 只读远端（MCP SDK 无本地克隆）。未执行任何被调研代码。沙箱大面沿用 2026-08-22 已定基线（KEEP），本文只做清单项对照复核 + MCP/工具层增量。

---

## ① 质量门表（GitHub API 实值，2026-08-22 拉取）

| 仓库 | stars | forks | open issues | license (API) | archived | pushed_at | 门禁结论 |
|---|---|---|---|---|---|---|---|
| modelcontextprotocol/typescript-sdk | 13,226 | 2,107 | 568 | NOASSERTION（自定义过渡文件，见下） | false | 2026-08-22 | **PASS** |
| modelcontextprotocol/modelcontextprotocol（spec） | 9,026 | 1,746 | 177 | NOASSERTION（同上） | false | 2026-08-22 | **PASS** |
| Zyling-ai/ZyHive | 19 | 3 | 1 | AGPL-3.0 | false | 2026-08-02 | **KILL**（<500 星，无战略价值说理成立——见④） |
| ag2ai/ag2 | 4,883 | 706 | 31 | Apache-2.0 | false | 2026-08-21 | **PASS** |
| microsoft/playwright-mcp | 36,358 | 3,046 | 3 | Apache-2.0 | false | 2026-08-21 | **PASS** |

仓库名核实：用户给的 `modelcontextprotocol/spec` 不是准确名。官方 spec 仓库实际为 **`modelcontextprotocol/modelcontextprotocol`**（`api.github.com/repos/modelcontextprotocol/specification` 重定向至此，API 返回 full_name 实证）。

许可与治理（读 LICENSE 原文，SDK 与 spec 仓库为同一份过渡文件）：
- 处于 **MIT → Apache-2.0 过渡期**：新代码/规范贡献 = Apache-2.0；未获再许可授权的历史贡献仍为 MIT；文档（规范除外）= CC-BY-4.0。API 报 NOASSERTION 仅因是自定义文件，双轨均为宽松许可，无 AGPL 类传染风险。
- 治理：版权人 "Model Context Protocol a Series of LF Projects, LLC" —— 已入 LF Projects（Linux Foundation 体系），非单公司私控。两仓库当天仍在 push，活跃。

---

## ② MCP 差距表：官方 TypeScript SDK vs 我们 `src/agent/mcp.ts`

我方现状（`src/agent/mcp.ts`，190 行，0 npm 依赖）：McpStdioClient = spawn + 换行分隔 JSON-RPC；initialize（默认 `2025-06-18`，capabilities `{}`）→ `notifications/initialized` → `tools/list`（单页）→ `tools/call`（content 透传 + isError）+ mcpToolAdapter 进 ToolRegistry。设计立场（文件头注释 L5-11）：集成边界刻意窄面，远端工具不在本地校验，server 是权威。

官方 SDK 现状：已重构为 pnpm monorepo，客户端能力在 `packages/client`（`@modelcontextprotocol/client`），协议类型/编解码在 `packages/core`。证据：`packages/client/src/index.ts`（zread 实读）、`packages/client/src/client/client.ts`（实读，截断前已覆盖 Client 类主体）、`docs/protocol-versions.md`（实读全文）。

| 能力项 | 官方 SDK（证据） | 我们 mcp.ts（证据） | 判定 |
|---|---|---|---|
| stdio 传输 | StdioClientTransport（`client/stdio.ts`，子路径导出隔离 child_process 依赖） | spawn 管道（mcp.ts L50-59） | 双方**有**，对等 |
| HTTP 传输 | StreamableHTTPClientTransport（含 ReconnectionScheduler）+ SSEClientTransport（legacy 回退）（index.ts 导出；client.ts connect 示例） | 无 | 我们**无**（需评估：近期是否接远程 server） |
| WebSocket 传输 | 新 client 包**无** WS 传输（src/client/ 下仅 stdio/streamableHttp/sse） | 无 | 双方无，非差距 |
| OAuth | 全套：RFC 9728 元数据发现、PKCE 授权、token 刷新、动态客户端注册、client-credentials/private-key-JWT/cross-app 扩展（index.ts auth/authExtensions 导出） | 无 | 我们**无**（stdio 场景不需要；HTTP 时必须） |
| resources / prompts / completion | listResources/readResource/subscribe、listPrompts/getPrompt、complete（client.ts 类型导入与 Client 方法） | 无 | 我们**无**（需评估：挂只读语料/提示词模板是否有科研工作流价值） |
| sampling / elicitation / roots（server→client 请求） | setRequestHandler 全支持；**sampling/roots/logging 已随 2026-07-28 规范标记 deprecated（SEP-2577），保留窗口 ≥12 个月**（client.ts 类注释、protocol-versions.md） | L140 显式丢弃一切带 method 的入站消息 | 我们**无**；官方已在废弃轨道上 → 引入价值低 |
| 工具清单变更通知 | ClientOptions.listChanged：`notifications/tools/list_changed` → 缓存逐出 + 自动重拉 + 去抖（client.ts LIST_CHANGED_EVICTIONS / _setupListChangedHandlers）；modern 纪元改 subscriptions/listen 流 | L140：无 id 的通知全部静默丢弃；注册后工具清单永不更新 | 我们**无** → 真实陈旧性风险，**应补** |
| tools/list 分页 | cursor 自动聚合 + `listMaxPages=64` 防不收敛（client.ts DEFAULT_LIST_MAX_PAGES） | L74-81 只解析首页 `res.tools`，**静默丢 nextCursor** | 我们**无** → 分页 server 工具被无声截断，**正确性缺陷，应补** |
| 协议版本/纪元 | 双纪元：legacy（2024-10-07…2025-11-25，initialize）+ modern（**2026-07-28：无 initialize，改 `server/discover` + 每请求 `_meta` 信封**）；versionNegotiation auto/pin、getProtocolEra（protocol-versions.md 全文；SDK 默认仍 legacy） | 固定 `2025-06-18` 单纪元（L62），无协商 | 我们落后一个纪元；legacy 兼容窗口仍在（SDK 默认也是 legacy），非紧急 |
| 输出校验 | jsonSchemaValidator（Node 用 AJV）+ 工具 outputSchema 编译校验（SEP-2106）+ structuredContent | 无（设计立场：server 权威，透传） | 差距**有意**，保持需评估 |
| 响应缓存 | SEP-2549 cache hints、cacheMode use/refresh/bypass、按 principal 分区（client.ts ClientOptions 注释） | 无 | 我们**无**（需评估，非急需） |
| 取消/进度 | RequestOptions signal → `notifications/cancelled`；progress 通知；modern 纪元关 SSE 流即取消 | 超时只杀本地等待（L112-115），server 不知情；无进度 | 我们**无**（低成本可补 cancelled 通知） |
| 断线重连 | ReconnectionScheduler（streamableHttp） | server 退出 → failAll（L56），无重连 | 我们**无**（单进程 stdio 会话场景影响有限） |
| 请求超时 | DEFAULT_REQUEST_TIMEOUT_MSEC | 30s 默认，可配（L110） | 双方**有**，对等 |
| 优雅关闭 | close 协议链 | SIGTERM → 2s → SIGKILL（L97-103） | 双方**有**，我方纪律合格 |
| JSON-RPC 批量 | 单消息发送 | 单消息发送 | 双方无（2025-06-18 规范是否移除批量：UNVERIFIED，未读 spec 原文） |
| 中间件/日志 | applyMiddlewares / withLogging / withOAuth（index.ts） | 无 | 我们**无**（窄面立场下可接受） |

### 是否值得引入官方 SDK —— 结论：DEFER（带触发），非现在 ADOPT

- **约束声明（不可跳过）**：官方 SDK 引入 = 新 npm 依赖 + monorepo 多包结构（client/core/server 分包），按工作区宪法属**变更确认线**（改依赖须先向用户确认），本结论不构成引入授权。
- 不引入的理由：我方 190 行 stdio 窄面满足"最小充分架构"；差距表中真正伤及正确性的只有两项（分页截断、list_changed 静默丢弃），均可在自研客户端内 ~30-60 行补齐，零新依赖；sampling/roots 官方自己在废弃；elicitation/resources 无近场景。
- **触发条件（满足任一再提变更确认）**：(i) 需接入远程 HTTP MCP server（OAuth/Streamable HTTP 不可自研合理承担）；(ii) 需 resources/prompts 能力面；(iii) modern 纪元（2026-07-28）服务器成为实际对接目标。
- 许可不构成阻断（MIT/Apache-2.0 双轨宽松）。

### 不等 SDK、现在就该补的三点（EXTRACT 进 mcp.ts）

1. `tools/list` cursor 聚合 + 页数上限（对照 L74-81 的静默截断）。
2. 处理 `notifications/tools/list_changed` → 重拉并更新 ToolRegistry（对照 L140 的静默丢弃）。
3. 不可解析行/被丢弃消息至少记日志，不再裸 `continue`（L137-140 两处吞没）。

---

## ③ ag2 容器执行器对照表（microsoft/autogen → ag2ai/ag2 后继）

执行器真实位置（本地克隆直读）：**`ag2/ag2/extensions/docker/sandbox.py`（DockerSandbox，L25-256）** + `ag2/ag2/extensions/docker/environment.py`（DockerEnvironment 工厂，L20-157）+ `ag2/ag2/tools/sandbox/adapter/shell.py`（命令过滤，L22-95）。注：老的 `autogen_ext.interpreters.DockerCommandLineCodeExecutor` 路径在本克隆中不存在（克隆只含 ag2 主仓 `ag2/` 目录，无 `python/packages/autogen-ext`）——该旧路径现状 UNVERIFIED；现行实现即上列三文件。

我方对照现状（直读验证）：`experiment-runtime/farlab_experiment_runtime/ops.py` 仅为计算算子分发（L18-200：env_info/train_eval/paired_stats/abs_stats），`remote/train_eval.py` 无 timeout/kill/cleanup/signal 处理（rg 零匹配）；runtime 侧未见 mem_limit/cpu/network_mode/回收引用。D-087 OpenSSH 网关本体（ed25519+TOFU）不在本次验证范围。

| 容器生命周期纪律 | ag2 证据（file:line） | 我方 runtime 现状 | 增量判定 |
|---|---|---|---|
| 超时 → 容器重启：超时意味着容器可能被污染，stop+remove 后换新容器，返回 exit 124 | sandbox.py L126-132 | 无超时后重置语义 | **D-087 未覆盖，应补**（超时后目标重置/健康检查） |
| 资源默认围栏：`network_mode="none"`（默认断网）、`mem_limit="512m"`、cpu_quota、user、auto_remove | sandbox.py L44-49, L170-182 | 无资源限额声明 | **应补**（与 OpenSSH 网关互补，Docker/WSL2 目标侧） |
| atexit 崩溃兜底回收 + aclose 幂等注销 | sandbox.py L188-190, L213-239, L241-247 | 无 atexit/cleanup | **应补**（进程崩溃也回收目标资源） |
| 幂等创建防护：threading.Lock + closed 双检（跨一次性事件循环安全，注释明说为何不用 asyncio.Lock） | sandbox.py L76-80, L163-168 | 不适用（无容器创建路径） | 设计参考 |
| 超时下限校验（>=1s）+ 默认 60s | sandbox.py L53-54, L44 | train_eval.py 无超时参数 | 应补 |
| 文件上传路径逃逸拒绝（绝对路径→报错，禁锢在 workdir）+ tar 流注入 | sandbox.py L148-151, L250-256 | 不适用（SSH 通道） | 原则可借鉴 |
| 输出截断上限（max_output 100k 字符） | tools/sandbox/environment.py L45 | 无 | 应补（防巨输出撑爆上下文） |
| Shell 命令允许列表 + 链式操作符阻断，**明示"非安全边界"** | adapter/shell.py L86-95, L35 | 不适用 | 原则可借鉴（诚实边界声明） |
| 任意模型代码默认拒绝在宿主跑：SandboxCodeTool 必须显式后端，LocalSandbox 只配命令过滤型工具 | tools/sandbox/environment.py L24-27 | 我方原则一致（EEL 只进目标侧） | 对齐，无增量 |
| 工厂按解析后参数键缓存复用容器（状态跨调用持久），工厂持有生命周期 | environment.py L99-110, L133-136 | 不适用 | 设计参考 |

---

## ④ 每项决策

| # | 项目 | 决策 | 约束/理由 |
|---|---|---|---|
| 1 | MCP 官方 spec + typescript-sdk | **REFERENCE + DEFER(带触发)**；自研 McpStdioClient **KEEP**；三条小补丁 **EXTRACT** | 官方 SDK = 新 npm 依赖 + 多包结构，**须过变更确认门**；触发条件见②；spec 治理（LF Projects）与许可（MIT/Apache-2.0 过渡）健康，REFERENCE 无约束 |
| 2 | Zyling-ai/ZyHive | **REJECT** | 19 星（<500 门禁线），AGPL-3.0 传染许可，且实为 Go+Vue "AI 团队 OS"（自述），非浏览器自动化沙箱，无战略价值说理可救 |
| 3 | microsoft/autogen 沙箱（ag2） | **REFERENCE / EXTRACT 纪律清单** | 不 ADOPT（Python 包，我们 Node/TS 单仓）；EXTRACT 上表 5 项"应补"纪律入 D-087 检查表；旧 autogen-ext 执行器路径 UNVERIFIED |
| 4 | microsoft/playwright-mcp（主动补扫） | **REFERENCE + DEFER(触发：网页证据抓取进 P0)** | 见下段评估 |

### playwright-mcp 评估（网页证据抓取是否正解）

是正解，且接入成本为零内核改动。README（实读）自证：基于**无障碍树快照而非截图**（"No vision models needed, operates purely on structured data"，动作走确定性元素 ref，非坐标猜测）；能力按 `--caps` 显式选择（vision/pdf/devtools 均关）；`--isolated --headless --storage-state` 支持无痕会话；origin 允许/阻断列表（README 明示非安全边界）；secrets 脱敏（明示 convenience 非 security）；官方 Docker headless 镜像。以 stdio（`npx @playwright/mcp`）作为外部 MCP server 接入时，**我们现有 McpStdioClient 的 tools/list + tools/call 即可完整驱动**——这反过来验证了自研窄面客户端的够用性。三点纪律：证据抓取优先只读工具（browser_snapshot/browser_network_requests/browser_console_messages）；`npx` 运行时拉包属供应链面，须锁版本（缓存/lockfile，同 experiment-runtime 做法）；浏览器出域与 E2B deny-all 是两套网络策略，接入时须单独声明允许域。另注：README 官方自评 coding agent 场景 CLI+SKILLS 更省 token——FAR-Lab 若做持续浏览器上下文的证据循环，MCP 形态合适；若只做一次性抓取，直接用 Playwright 库/CLI 更省。

---

## ⑤ 类别净结论

1. **工具层 KEEP 自研 + 三个小补丁**：McpStdioClient 的 stdio 窄面在当前场景（本地工具服务器、playwright-mcp 级别接入）够用且符合最小充分架构；必须修的两处正确性缺口是 tools/list 分页静默截断与 list_changed 静默丢弃，加一处日志化吞没，合计一个小 PR，零新依赖。
2. **官方 TypeScript SDK：DEFER 而非 ADOPT**。差距主要在 HTTP/OAuth/resources/双纪元——都无近期场景；真正紧急项为零。引入= 新依赖，必须走变更确认门，触发条件已列（远程 HTTP server / resources-prompts / modern 纪元成为主流）。
3. **ag2：EXTRACT 纪律入 D-087 检查表**，五项应补（超时→目标重置、资源限额默认值、崩溃兜底回收、超时下限、输出截断上限），源码 file:line 已列，可逐项核对 sidecar/网关实现后落 TODO。
4. **沙箱大面结论不变**（KEEP 基线：OpenSSH 网关 + Docker/WSL2 + sidecar；E2B REFERENCE；microsandbox DEFER；daytona REJECT），本次无新证据推翻。
5. ZyHive 按门禁如实击杀；spec 仓库名已纠正为 `modelcontextprotocol/modelcontextprotocol`，治理/许可健康。
