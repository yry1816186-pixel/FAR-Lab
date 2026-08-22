# OSS Porting Scan v2 — 插件体系（hooks / skills / tool-registry / MCP 之上的底座需求）

日期 2026-08-22。GitHub 实值经 `api.github.com/repos/{owner}/{repo}`（WebFetch 或 gh api 当日观测）。本地深读：`.cache/repos/deepseek-harness`（dsh 0.1.1-rc.2）、FAR-Lab `src/agent/`（hooks.ts 70 行 / skills.ts 107 行 / tool.ts 87 行 / mcp.ts 189 行，全部实读）。
基准面：ExtensionBus（before/after tool call + turn end，first-block-wins / last-args-rewrite-wins / sticky-terminate，hooks.ts:29-70）、三层 skills（skills.ts:31-107）、zod ToolRegistry + restrict（tool.ts:43-77）、MCP stdio 适配器（mcp.ts:40-189）。核心问题：OSS 插件框架对这套自研面还有什么增量（声明式依赖？热插拔？版本协商？隔离？分发格式？）。

## ① 质量门表（含 cordis 存在性核查）

| # | 仓库 | stars | 最后 push | license | archived/fork | 门禁结果 |
|---|------|-------|-----------|---------|---------------|----------|
| 1 | deepseek-ai/cordis | — | — | — | — | **不存在（404）**：api.github.com 与 gh api 双验 404。用户断言的"deepseek-harness 底层内核仓库"不成立 |
| 1' | 真实来源（三层核查） | — | — | — | — | ① deepseek-harness `pnpm-lock.yaml:129-131`：`'@deepseek-ai/cordis': link:../../vendor/cordis`；② `vendor/cordis/package.json`：`@deepseek-ai/cordis` v4.0.1，author **Shigma**，MIT，repository 指回 deepseek-harness 自身（rescoped vendored fork）；③ 上游 = **cordiverse/cordis**（cordisjs/shigma/koishijs 重定向均至它，koishijs 404） |
| 1'' | cordiverse/cordis | 7,065 | 2026-08-21 | MIT | 否/否 | **PASS**（上游过门；深读以 vendored v4.0.1 为准——它才是 deepseek 实际用的代码） |
| 2 | fgazer94/AgentForge | 4 | 2026-03-13 | Apache-2.0 | 否/否 | **KILL**（<500 星且无战略豁免：LangChain/LangGraph 编排 demo，README 自述即多 agent 编排平台，无独特机制） |
| 3 | FellouAI/eko | 4,951 | 2026-03-03（距今 5.6 个月，逼近 6 月停更线） | MIT | 否/否 | **PASS with 警戒**（星数过线；但维护放缓 + 下述 registerPlugin 断言证伪） |
| 4 | fastify/avvio | 466 | 2026-08-21 | MIT | 否/否 | **战略豁免 PASS**：<500 但它是 fastify 主仓（37,021★，同日 gh api 实值）的插件模型唯一底座，2016 年起 10 年维护、昨日仍 push。星数≠采用度，采用度经 fastify 全量下载传递。豁免按质量门条款"独特战略价值+说理"执行 |

## ② 过门项深评

### 1. cordis（vendored `@deepseek-ai/cordis` v4.0.1 — `.cache/repos/deepseek-harness/vendor/cordis/src/`，9 文件 2693 行全量实读）

**它完整实现了候选维度中的三个半**（本类别唯一）：
- **声明式插件间依赖（含响应式）**：`Inject` 类型（registry.ts:19）+ `Inject.resolve` 归一化（registry.ts:71-89）+ `ctx.plugin()` 把解析结果喂给 Fiber（registry.ts:330）；`ctx.inject(deps, cb)` 语义 = "callback unloaded and re-run whenever a required service changes"（registry.ts:166-176 接口注释，实现 registry.ts:300-302 → fiber.ts:331 `this.dispose = () => this.restart()`）。
- **可逆卸载（dispose 纪律）**：插件 effect 可返回单个 disposer / Promise / async iterable（fiber.ts:69-80）；Fiber 四态 PENDING/ACTIVE/UNLOADING/DISPOSED（fiber.ts:144 注释区）；嵌套 effect 诊断树 EffectMeta（fiber.ts:95-101）；`registry.delete(plugin)` dispose 全部 fibers（registry.ts:258-267）；子 fiber 本身是父 fiber 的一个 effect（fiber.ts:265）→ 级联逆序清理。
- **隔离模型**：`Context.extend()` 不可变子上下文（context.ts:99-107）；`isolate(name, label)` 服务按 scope-label 分桶（context.ts:121-125）；`intercept(name, config)` 服务配置拦截、父上下文不受影响（context.ts:139-145）。事件分发带 context filter（events.ts:159-173）与五种 dispatch mode `emit|parallel|serial|bail|waterfall`（events.ts:32）。Service 命名注册、随宿主 fiber 卸载自动注销（service.ts:34-60）。
- **半个 = 配置校验非版本协商**：`Config` 用 Standard Schema V1（registry.ts:104），但**无 semver 协商**；也无第三方分发格式内建（loader/include 是 optional peer dep，vendor/cordis/package.json peerDependenciesMeta）。

**对 FAR-Lab 的增量清单（相对 ExtensionBus/ToolRegistry/MCP）**：
1. `disposer 纪律`：ExtensionBus 的 unsubscribe 只是 splice 数组（hooks.ts:34-47），handler 持有的资源无卸载协议。这是唯一真实增量——但当前 FAR-Lab 唯一持资源扩展是 McpStdioClient，且它已有显式 close()（mcp.ts:90-104，SIGTERM→2s→SIGKILL）。
2. 响应式依赖重启、isolate scope：**零增量**——FAR-Lab 插件面是编译期装配（无运行时按 config 动态装配场景），工具面隔离已由 `ToolRegistry.restrict`（tool.ts:63-71，fail-closed）覆盖。
3. 整体内核（Fiber/Context 代理/RegistryService/EventsService）：**负增量**——2693 行换"运行时动态装配"能力，FAR-Lab 无调用方。

**deepseek-harness 为何需要而 FAR-Lab 不需要**：dsh 是多 face（host/client/web）多 workspace 产品，运行时按 cordis.yml 装配插件目录（根 package.json 有 gen-cordis-catalog/verify-cordis-config/demo:cordis 等 8 个 cordis 工具链脚本）；FAR-Lab 单进程、启动期单点装配、第三方扩展走 MCP 进程边界（隔离免费）+ skills（数据非代码）。

**决策：REFERENCE（grade A）**。Wave-4/deepseek-harness 裁定（"一切皆插件"REJECT）维持，但补 nuance：若 ExtensionBus handler 出现资源持有，EXTRACT 的不是 cordis，是 fiber.ts:69-80 的 disposer 形状纪律（~15 行），见③。

### 2. FellouAI/eko — registerPlugin 断言证伪，插件维度零增量

**registerPlugin 存在性核查（VERIFIED-ABSENT）**：
- 当前主分支全树 222 路径，`plugin|hook` 仅 3 处且全在 `example/extension/`（react hooks，非插件框架）；
- org 级 code search `registerPlugin org:FellouAI` = **0**；eko-docs 仓同查 = **0**；commit search = **0**；
- 旧版 tag 1.0.8 的 `src/core/eko.ts`（132 行全文实读）无 Plugin/registerPlugin/hook 字样；v1.1.0 / v2.2.0 / v4.x 树内 0 plugin 路径。
- 结论：registerPlugin 在 FellouAI 全部公共代码中查无实据；疑来自早期宣传稿/三方博客/闭源 Fellou 浏览器扩展侧 API（来源 UNVERIFIED）。
- 另：官方 docs 站 fellou.ai/eko 503、eko.fellou.ai 301→503，当日不可交叉验证。

**实际插件相邻面（实读）**：eko 1.0.8 `ToolRegistry.registerTool/unregisterTool`（src/core/tool-registry.ts:7-14，62 行，无 schema 校验）；v4.x `AgentWrapTool`（packages/eko-core/src/chat/tools/agent-wrap-tool.ts:24-56，236 行）把 Agent 包装成 DialogueTool（agent-as-tool，extra 覆写 name/description/parameters）——与 FAR-Lab `subagents.ts`（86 行）同构，非增量；v4.x 扩展通道是 MCP（eko-core/src/index.ts 导出 SimpleSseMcpClient/SimpleHttpMcpClient，实读）。

**决策：REJECT（grade B+）**。插件维度零增量：工具注册弱于 FAR-Lab（无 zod、无 restrict、无 fail-closed）；AgentWrapTool≈subagents；registerPlugin 不存在；维护逼近停更线。残值 REFERENCE 一条：AgentWrapTool 的 extra 覆写（name/description/parameters，agent-wrap-tool.ts:41-56）可作 subagents 提示词包装对照。

### 3. fastify/avvio — 最小插件底座的形状样本（战略豁免 PASS）

机制实读（index.js 629 行 + lib/plugin.js 292 行，main@2026-08-21 raw 实取）：
- **封装**：`Boot.override(server, func, opts)` 每插件可换实例（index.js:145），encapsulateThreeParam（index.js:272）；skip-override 判定在 fastify 层（fastify-plugin 元数据），**avvio 只提供 override 钩子**。
- **依赖**：**avvio 核心无声明式依赖检查**——`checkDependencies` 实证位于 fastify/lib/plugin-utils.js（code search 命中）；avvio 提供的是加载序：Plugin.exec→queue.pause→嵌套 use 入队→finish 等 queue drain（lib/plugin.js:199-292），即"父插件完成后子插件才启动"的隐式拓扑（与 cordis 显式 inject 构成两种流派的对照样本）。
- **启动语义**：pluginTimeout 防挂起（AVV_ERR_PLUGIN_EXEC_TIMEOUT，lib/plugin.js:128-133）；preReady→booted（index.js:100-115）。
- **关闭**：`onClose` unshift 进 `_closeQ` → **逆注册序执行**（index.js:316-340 + onClose unshift 实读）；`Symbol.asyncDispose` 集成（index.js:117-127）。

**对 FAR-Lab 增量**：三条纪律各 ~20 行，但均无当下调用方——(a) 逆序 onClose 队列：FAR-Lab 需关停子系统 ≈2 个（mcp.close、telemetry flush），散装够用；(b) pluginTimeout：FAR-Lab 装配无"启动挂起"风险面；(c) override/封装：为多实例 HTTP server 设计，无同构问题。
**决策：REFERENCE（grade A）**。不引入依赖（avvio 与 server/expose 语义耦合），抄形状不抄代码，触发器见③。

## ③ 类别净结论：FAR-Lab 不需要插件底座（KEEP 现状，grade A）

理由链：
1. **扩展需求四分法已各就各位**：行为扩展→ExtensionBus；能力扩展→MCP 外部进程（进程级隔离+超时+杀伤协议，mcp.ts:106-119/90-104，安全性优于任何 in-process 插件沙箱）；知识扩展→skills（数据非代码，天然免执行风险）；确定性约束→zod+restrict。第三方 in-process 插件生态调用方 = 0（Wave-4 R5 standing 不变）。
2. **行业旁证**：eko 4.x 无插件底座照样 5k★ 且自己把 MCP 当扩展通道（与 FAR-Lab 同构）；deepseek-harness 用 cordis 是因为它有多 face 运行时装配的真实需求，FAR-Lab 没有；avvio 证明"插件底座"最小可以多小（无依赖检查、无隔离，只有加载序+超时+逆序关）。
3. **版本协商维度**：三个框架均无内建（cordis 只有 schema 校验；fastify 的版本兼容检查在 fastify-plugin 元数据层，非 avvio）——该维度本身就是伪需求信号，npm 依赖树已是事实答案。

最小形态（若触发，两个 ~20 行纪律 EXTRACT 进 src/agent/hooks.ts，均不引框架）：
- **EXTRACT-1 disposer 纪律**（形状源：cordis fiber.ts:69-80）：ExtensionBus 的 register 已返回 unsubscribe（hooks.ts:34-47），升级为"handler 可声明 cleanup，unsubscribe 时自动执行"。**DEFER 触发**：出现 ≥2 个持有资源（定时器/子进程/句柄）的 hook handler（当前 0-1）。
- **EXTRACT-2 逆序 onClose 队列**（形状源：avvio index.js close+unshift 语义）：统一注册关停回调、逆序 drain。**DEFER 触发**：需优雅关停的子系统 ≥3（当前 ≈2）。
- **DEFER（不动）**：声明式插件依赖（cordis Inject / fastify dependencies）——触发 = 第三方 in-process 插件生态出现（届时先与 MCP 进程模型对比再评）；热插拔/响应式重启（cordis dispose-restart）——触发 = 长驻服务形态 + 配置热更需求；isolate scope——触发 = 多租户/多会话并发共享内核（subagents+restrict 当前已覆盖工具面）。
