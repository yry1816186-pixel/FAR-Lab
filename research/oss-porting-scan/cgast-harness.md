# OSS 尽调报告：cgast/harness

- 尽调日期：2026-08-22；方法：GitHub API + raw.githubusercontent.com 源码逐文件精读（只读，未执行任何代码）；zread 未索引该仓库（`repo not found`），全部结论来自 GitHub 实际数据。
- 尽调基线 commit：`b3a9edd`（main HEAD）。

## 1. 许可与维护

### 1.1 许可（关键风险）

- **仓库不存在 LICENSE 文件**：`LICENSE`、`LICENSE.md`、`LICENSE.txt` 三个路径 raw 请求均返回 404（实测）；GitHub API `license` 字段为 `null`；git 树 102 个条目中无任何许可文件；README 全文无许可声明段落（rg 验证）。
- "MIT" 仅出现在元数据声明：根 `package.json` `"license": "MIT"`，`packages/core/package.json` 同。
- 结论：**package.json 元数据 ≠ 法律授予**。无许可文本时默认"保留所有权利"，逐行复制/衍生该代码存在法律风险。若要借鉴，只能借鉴思路、自行实现，不可搬代码。风险评级：**高（法律层面）**。

### 1.2 维护信号

| 信号 | 实测值 | 评价 |
|---|---|---|
| 创建 / 最后 push | 2026-02-18 / 2026-03-02 | 活跃期仅 ~6 周，距今 ~5.7 个月无推送 |
| commits | 66（API Link header last=66） | 与 README 自称一致 |
| 贡献者 | cgast(33) + `claude`(AI 账号，noreply@anthropic.com) | **单人 + AI 生成仓库**，无社区 |
| stars / forks | 3 / 1 | 无采用信号 |
| issues / releases | 0 open issues；tag v0.1.3 → v0.2.0 | 无 issue 治理，tag 存在 |
| 自带文档 | README + `SECURITY_ASSESSMENT.md`（自评诚实，承认 3 Critical + 3 High 未修复） | 文档质量尚可，代码安全状况差 |

风险评级：**高**（弃维护概率极大，单人 AI 生成项目）。

## 2. 架构总图

pnpm monorepo，TypeScript/CommonJS，Node >= 20。

- `packages/core`：runLoop 循环 + EventBus + PluginLoader + AgentState（内存）+ ToolRegistry + WorkspaceGuard + 3 provider + soul/skills YAML 加载 + feedback(HITL) 子系统 + SqliteStore。运行时依赖 3 个：`yaml@^2.7`、`better-sqlite3@^11.8`（native addon）、`uuid@^11.1`。
- `packages/cli` / `packages/server`（HTTP+WS）/ `packages/desktop`（Electron，渲染层 app.ts 48KB 单文件）。
- `plugins/*`：sandbox(Docker)、heartbeat、persistence(会话摘要记忆)、human-review、ibkr(交易) 等 8 个；`souls/`+`skills/` YAML。
- 数据流：`createAgent()`（core/src/index.ts L226-460）装配 bus/state/store/guard/registry → `runLoop`（loop.ts L43-333：prompt 组装 → provider.chat 流式 → 工具执行 → 循环）→ 事件全量写入 events_log，run 结束写 sessions 快照。

## 3. 机制清单表

| 机制 | 位置(file:line) | 要点 | 与 Wave-4/Wave-8 已覆盖项关系 | 移植价值 |
|---|---|---|---|---|
| 核心循环 runLoop | `packages/core/src/engine/loop.ts:43-333`（全文 356 行，README "~350 lines" 属实） | 4 终止条件（无 tool_calls / maxIterations / 插件 abort / 中断）；工具超时默认 30s（L267-271）；llm:error 的 retryCount 硬编码 0、插件 retry 语义残缺（L166-185） | FAR-Lab 无工具循环不变量正面冲突；重试语义远劣于 Wave-4（deepseek-harness llm-retry + opencode） | 无 |
| 工具超时 withTimeout | `loop.ts:335-355` 与 `tools/executor.ts:88-108` | **两处逐字重复实现**；超时不取消底层操作，仅弃结果 | 无新意 | 无 |
| ToolExecutor 类 | `tools/executor.ts:20-108` | 与 loop.ts L233-303 内联逻辑完全重复，**loop 不用它 → 内部死代码** | — | 无 |
| EventBus（veto/modify） | `events/bus.ts:72-110`；`events/events.ts:10-39,173-184` | 29 个类型化事件；10 个白名单 modifiable；hook 返回 `{abort:true}` → emit 返回 null；优先级排序；浅拷贝逐 hook 变换（L79-93）；hook 异常吞掉仅 console.error（L94-97） | FAR-Lab orchestrator 为确定性 stage 机，不需要插件总线 | 低 |
| 插件加载 | `plugins/loader.ts:42-51,68,105-165` | 动态 `import()`；**构造时向上遍历祖先目录收集 plugins/**（SECURITY_ASSESSMENT H2 自认 Open） | 无对应 | 无（注入面） |
| SQLite 持久化 | `persistence/sqlite.ts:20-51`（sessions/memory/events_log 三表）、`:17` WAL；`core/src/index.ts:359-367`（onAll→全事件落库）、`:445-455`（run 结束存快照） | 快照 + append-only 事件日志；**全仓库无任何 getSession/resume/replay 调用方（rg 验证）→ 无崩溃恢复**；home 不存在时静默降级 MemoryStore（index.ts:253-259） | FAR-Lab D-054（OAOO step 检查点+租约心跳）远超此物；Wave-8 已覆盖 | 无 |
| 心跳插件 | `plugins/heartbeat/src/index.ts:96-105,141-161,186-290,311-331` | 定时自主任务调度（interval/quiet hours/skipIfBusy/防重入 ticking），Electron 前台运行时才有 | **语义与 D-054 租约心跳无关**（它是 cron 式任务，不是 liveness/lease） | 无 |
| WorkspaceGuard | `workspace/guard.ts:16-24`（默认 deny-outside + shell 限 workdir）、`:30-65`（denied 优先）、`:126-130` isWithin、`:158-213` glob→regex | 默认收紧设计正确；但 glob `[^/]*` 硬编码 POSIX 分隔符、大小写敏感（Windows 上语义漂移可绕过）、**不解析 symlink**（realpath 缺失 → 软链逃逸）；仅在 tool:request hook 上挂载（index.ts:370-391），shell 只验 workdir 不验 command | EEL sidecar 隔离已更强 | 低 |
| Docker 沙箱 | `plugins/sandbox/src/docker.ts:78-101`（warm container "sleep infinity" + docker exec 复用）、`:252-268`（--memory/--cpus/--network none）、`types.ts:22-30` 默认 2g/1.5cpu/300s/断网；`index.ts:74-78` Docker 不可用→**明文降级宿主执行** | warm/cold 双模式、CLI 包装零 SDK 依赖 | EEL experiment-runtime 已是隔离 sidecar + 自带 lockfile | 低 |
| 沙箱拦截器（致命缺陷） | `plugins/sandbox/src/interceptor.ts:37-74,79-95` | `__sandboxHandled` 魔法参数注入 args，但 `tools/builtin/shell.ts`（全 58 行）与 `file-ops.ts`（全 109 行）**均无该字段检查 → 同一命令在宿主机真实执行一次（副作用发生）后，结果才被 tool:result 钩子替换为沙箱结果**。注释自称 "modify args to be a no-op" 但未实现。隔离形同虚设 | — | 无（反面教材） |
| 沙箱文件操作注入 | `docker.ts:222-244` | readFile= `cat "${filePath}"`、writeFile 路径直接拼进 `bash -c` 字符串，模型可控路径可注入命令 | — | 无 |
| YAML soul 层 | `soul/loader.ts:37-47`（YAML.parse + `as` 断言，仅查 3 必填字段，无 schema 校验）；`soul/injector.ts:11-64`（boundaries→ethics→character→context 四层拼 system prompt） | 人格化 prompt 分层拼装 | FAR-Lab 有自己的 prompt 组织与 zod schema 纪律 | 低 |
| provider 抽象 | `providers/provider.ts:46-55`（`chat(): AsyncGenerator<ChatChunk>` + supportsTools/Streaming/Images 能力位） | 接口小而干净，值得注意的唯一设计点 | FAR-Lab `src/providers/http.ts` 已有 + 更强 | 低 |
| OpenAI 兼容实现 | `providers/openai.ts:42-49`（单次 fetch **无重试/无退避/无 AbortSignal**）、`:137-141`（tool args JSON.parse 失败静默吞为 `{}`）、`:164-166`（空 catch 跳行） | 比 Wave-4 融合后的 FAR-Lab http.ts 原始得多 | Wave-4 全面劣于已有 | 无 |
| HITL feedback 子系统 | `feedback/types.ts:10-102`（confirm/choice/text/review/form 五型 + verdicts + 行级 annotations）、`:106-170`（completed/timeout/cancelled/error 四态）；`manager.ts:119,159`（Promise.race 超时；confirm defaultDeny） | 全仓库完成度最高的部件：类型化 HITL 请求/响应/超时/升级 | FAR-Lab 已有"纠正性重问"覆盖，但其**五型反馈类型学**（尤其 review 的 annotations + escalate verdict、confirm 的 defaultDeny 超时语义）是已覆盖项之外的设计输入 | **中低（仅类型学参考）** |
| 会话摘要持久记忆 | `plugins/persistence/src/index.ts:55-100,191-242` | agent:end 记摘要 + prompt:assemble 注入最近 10 条历史；摘要=最后一条 assistant 消息截断 200 字符（自认 proxy） | 非 compaction（Wave 已覆盖 6 仓），价值低于已有 | 无 |
| 秘密处理 | `core/src/index.ts:193-215`（config 中 `${VAR}` 展开 API key）；`tools/builtin/shell.ts:39`（`env: {...process.env}` **全量环境继承给任意 shell 命令**，SECURITY_ASSESSMENT C4 自认） | 无脱敏，反有泄漏 | Wave-4 codex/aider/hermes 脱敏已覆盖且优 | 无 |

另（供完整性）：`SECURITY_ASSESSMENT.md` 自评 3 Critical + 3 High Open（未认证 `/api/run` RCE、CORS 通配、skill 参数 shell 注入、SSRF、错误反射、动态插件加载），文档诚实但证实安全基线差。

## 4. Top 机制深评（仅 1 项够格）

### 4.1 HITL Feedback 类型系统（唯一有增量参考价值的部件）

- 提取文件：`packages/core/src/feedback/types.ts`（全量类型）、`feedback/manager.ts`（FeedbackManager.request + Promise.race 超时）、`feedback/adapter.ts` / `chain.ts`（未逐行读，链式门控从 index.ts 导出签名推得，细节 UNVERIFIED）。
- 增量点：FAR-Lab 已覆盖"纠正性重问"与 strict-FC，但该仓库把人工反馈做成**五型正交类型学**：confirm（含 `defaultDeny`——超时即拒绝的 fail-safe 缺省）、choice（multiple/defaults）、text、review（`approve/reject/revise/escalate` 四 verdict + line/offset 行级 annotations）、form；响应侧统一 completed/timeout/cancelled/error 四态 + respondedBy 审计字段。对 FAR-Lab 研究计划评审/人工确认环节的类型建模是一份现成 checklist。
- TS/zod-only 适配注意：原实现零 schema 校验（纯 TS interface），移植时需重写为 zod discriminated union（`type` 字段天然判别）；其 manager 实现绑定 EventBus 且含多处 `as any`（heartbeat 插件 L201/213/222/272 同病），**只取类型学，不取实现**。
- 风险：无 LICENSE（连改写引用都要避免逐行相似）；维护停滞。

### 其余候选落选理由

- WorkspaceGuard 默认 deny-outside 思路好，但 symlink 不解析 + Windows glob 漂移两缺陷 + EEL 已有更强隔离 → 只值一句"默认收紧"的印证。
- Docker warm-container：EEL sidecar 已覆盖，且其拦截器有宿主双执行致命缺陷。

## 5. 净结论

**裁定：D 仅参考（接近 REJECT）。** 三约束逐条对照：

1. **最小架构 / zod-only 零新依赖**：core 运行时依赖 `better-sqlite3`（native addon，还与 FAR-Lab 跨平台交付冲突）、`yaml`、`uuid` —— 引包路线（B）直接违反不变量；其 monorepo（CLI/server/Electron/8 插件）复杂度远超 FAR-Lab 所需，插件总线本身即 FAR-Lab 明确不采的"coding-agent 基建"。
2. **无工具循环不变量**：仓库核心资产恰是 FAR-Lab 不允许的东西——agentic 工具循环（shell/file/http 内置工具 + 迭代执行）。可剥离的非循环部件（持久化/重试/provider/沙箱）逐一被 Wave-4/Wave-8 已尽调项覆盖且质量更差：无重试退避、无秘密脱敏（反有 env 全量泄漏）、无崩溃恢复（sessions 表只写不读）。
3. **维护信号弱**：单人 + AI 生成、6 周寿命后停更 5.7 个月、3 stars、0 issue 治理；叠加**无 LICENSE 文件**（法律上未授予任何权利）——即使想"直接复制"（A）或"改造适配"（C）都不可行，只剩思路级参考（D）。

**唯一保留的参考输入**：feedback 五型 HITL 类型学（4.1 节），建议在 FAR-Lab 评审/确认环节类型设计时对照一次，用 zod 重写，不引用其实现。

**未能读取的内容**（如实列出）：`packages/desktop/src/main/agent-manager.ts`（22KB）、`packages/server/src/ws.ts`、`feedback/adapter.ts`/`chain.ts` 细节、`plugins/ibkr/*`、`providers/anthropic.ts`（结构与 openai.ts 平行，未逐行）——均非决策关键路径；上表未涉及它们的结论。
