# 开源项目移植与融合方案 v2（2026-08-22）

**v2 取代 v1**。v1 缺陷（用户裁定"稀烂"）：未逐项处理用户 8 大类清单、无质量门、过度复述既有裁定而缺增量、未主动补扫。v2 修正：**8 大类 25 个清单项逐项过质量门 + 主动补扫 10 项 + 全部落点对齐 `src/agent/` 真实代码 + 对清单与实仓不符处逐条证伪**。目标项目 = FAR-Lab（Node/TS，zod-only 硬不变量，最小架构）。

方法：6 路并行尽调子 Agent（质量门 GitHub API 实值 → 过门深读 → 类别净结论）+ 主 Agent 载荷性声明抽验（mcp.ts 缺陷、ag2 sandbox.py、cordis 依赖链、D-087、cgast license 均亲验）。底稿：`research/oss-porting-scan/v2-{harness,statemachine,plugin,tools-sandbox,protocols,algo-multi-obs}.md`。

---

## 0. 质量门总表（API 实值 2026-08-22）

| 裁定 | 项目 |
|---|---|
| **过门（深读）** | deepseek-harness(MIT 184k★) · modelscope/agentscope(Apache-2.0 29.3k★) · omnigent-ai/omnigent(Apache-2.0 9.2k★,alpha) · mastra-ai/mastra(核心Apache-2.0 27.4k★,ee/商业) · vercel/ai(Apache-2.0 26.3k★) · elizaOS/eliza(MIT 19.1k★) · cordiverse/cordis(MIT 7.1k★) · fastify/avvio(466★,战略豁免:fastify 37k★唯一插件底座/10年) · MCP typescript-sdk(13.2k★,MIT→Apache-2.0过渡) · ag2ai/ag2(4.9k★ Apache-2.0) · microsoft/playwright-mcp(36.4k★ Apache-2.0) · a2aproject/A2A(25.5k★ Apache-2.0) · ag-ui-protocol/ag-ui(15.5k★ MIT) · traceloop/openllmetry(7.4k★ Apache-2.0) · open-telemetry/semantic-conventions(639★ Apache-2.0,标准仓豁免) · restatesdk/sdk-typescript(119★,官方一手SDK边界豁免,不作依赖) |
| **质量门击杀** | xuemzhan/gecko(8★,停更7.5月) · Zyling-ai/ZyHive(19★+AGPL,实为Go+Vue团队OS非沙箱) · fgazer94/AgentForge(4★) · brunogcar/agent(1★无LICENSE) · flyersworder/agent-contracts(5★) · langchain-ai/langgraph-reflection(185★,archived,无LICENSE) · openpeng/agent-protocol(0★零采用零背书) · agi-inc/agent-protocol(停更16月) · JSON-Agents/Standard(20★,停更9月,draft-00) · inngest(5.8k★但**SSPL v1**) · cgast/harness(**无LICENSE**,API license:null) · daytona(无LICENSE+停更转私有) · modal(闭源商业) |
| **过门但实体裁定否决** | elizaOS(描述四项全证伪,见§2) · omnigent(alpha跨设备meta-harness,单产品形态过度) · LangSmith(商业闭源→开源替代评估,见§8) |
| **维持既有整框架 REJECT** | LangGraph / Temporal / DBOS / CrewAI / AutoGen（机制抽取已执行 D-054；Wave-8 报告在案） |

## 1. Harness / Agent Runtime

| 项目 | 裁定 | 要点 |
|---|---|---|
| deepseek-harness | C 抽取（已执行） | llm-retry 已落地（295/295）；compaction/保尾 DEFER 带触发；Cordis 全插件化 REJECT |
| cgast/harness | REJECT | 无 LICENSE（法律不可搬运）+停更5.7月+沙箱双执行缺陷；仅 HITL 五型类型学记档 |
| **agentscope** | **ADAPT（机制级）** | 用户描述证伪：**"HarnessAgent"不存在**（全仓0命中）、无"子Agent编排"、无"Plan Mode"（实为 DEFAULT/EXPLORE/ACCEPT_EDITS/BYPASS/DONT_ASK 权限模式）。真增量：**HintBlock 运行时状态注入**（`_agent.py:1197`）、**权限模式机+bypass_immune+ask→deny 保建议规则**（`_engine.py:594-848`）、**Offloader 上下文卸载协议**、**超大 tool result 切分**（`:2823`）。IM channel 路由 REJECT、沙箱适配器 DEFER |
| omnigent | REJECT/REFERENCE | owner 证伪（Databricks-Labs 404，实为 omnigent-ai）；alpha 期跨设备 meta-harness 桥接 12 家外部 harness——单产品形态过度；策略三层作用域+纯评估器可参照 |
| mastra（补扫） | 引包 REJECT / **EXTRACT** | zod-only 冲突不引包；**EXTRACT `loop/timeout.ts`**（step/total 双超时+独立错误类型+abort 合成，149 行零依赖）；thread fork/clone REFERENCE（呼应版本对比环） |
| vercel/ai（补扫） | 引包 REJECT / **EXTRACT×3** | **HMAC 签名工具审批**（防 ask/execute 间 TOCTOU，Web Crypto）、**StopCondition 组合子**、**损坏 tool call 修复回路** |

**类别 GO 净增量**（全部零新依赖）：`permissions.ts`（模式机+bypass_immune+审批签名+规则建议）、`loop.ts`（双超时+组合停止条件+宽限轮次）、`compaction.ts`（offload+超大结果切分）、`tool.ts`（修复回路）、hooks/skills（HintBlock 注入）。

## 2. 状态机 & DAG

| 项目 | 裁定 | 要点 |
|---|---|---|
| LangGraph | 维持 W8 | 整框架 REJECT；put_writes/checkpoint/租约语义已抽取落地（D-054） |
| gecko | 门禁击杀 | 8★停更7.5月；COW 状态隔离思想记 D 备忘（触发=并行 fan-out 出现大上下文拷贝压力） |
| elizaOS | **REJECT（描述证伪）** | 19.1k★ 过门但：`langgraph` 依赖 0 命中（仅用 @langchain/core 工具库）；"Atom 原子执行单元"不存在；"runtime 快照"实为 daemon 的 systemd 状态；"子流程嵌套"= 内存 Map 崩溃即丢；其 "dag" 模式拓扑排序后**仍串行执行（假并行）**。对 D-054 增量：零 |
| restate-sdk-ts（补扫） | REFERENCE + DEFER | 新一代 sdk-gen 核心=单一 journal-race 挂起点作确定性边界（`scheduler.ts:31-37`）；inbox 在 SDK 内 0 命中（服务端概念，≈我们 run 租约）；唯一真缺口候选=**awakeable/`peek()` 跨进程外部完成语义**——我们反馈环走"跑完重开+版本比较"，不需要；DEFER 触发=stage 需在进程生命周期外等外部完成者（届时 BUILD completions 表 <1 表，勿引引擎） |
| inngest（补扫） | 采用面杀 | 5.8k★ 但引擎 **SSPL v1**（LICENSE.md 实读）+托管服务与自包含路线冲突；step.run 记账化=D-054 同族 |

**类别净结论**：管线跨 stage 零分支、领域并行是 stage 内数据并行（checkpointed 已收敛）——**线性 stage 机不需要升级 DAG 引擎**。重开触发：①第二条管线拓扑且分支有持久跨节点依赖 ②stage 需等进程外完成者 ③stage 内 step 顺序耦合（在线性机内解）。

## 3. 插件体系

| 项目 | 裁定 | 要点 |
|---|---|---|
| cordis | REFERENCE + 2×DEFER | `deepseek-ai/cordis` **404 不存在**（双验）；真实链路（主 Agent 本地亲验）：dsh `pnpm-lock.yaml:129-131` → `vendor/cordis` = `@deepseek-ai/cordis`（**author Shigma**，Koishi/cordis 原作者，MIT）→ 上游 **cordiverse/cordis**（7.1k★ MIT PASS）。vendored 2693 行全读：声明式依赖+响应式重启（`registry.ts:19-89,300-302`）、**disposer 可逆卸载纪律**（`fiber.ts:69-80,144`）、isolate/intercept 隔离。对 FAR-Lab 增量=disposer 纪律（~20 行，DEFER 触发=≥2 个持资源 handler，当前 0-1）；2693 行内核对编译期装配+MCP 进程边界的我们是负收益 |
| AgentForge | 门禁击杀 | 4★ LangChain 编排 demo |
| Eko | REJECT | `registerPlugin` **VERIFIED-ABSENT**（222 路径树+org code search+docs+1.0.8 tag 源码全查 0 命中）；其 ToolRegistry 无 schema 校验（弱于自研）；AgentWrapTool≈subagents.ts 同构 |
| avvio（补扫） | REFERENCE + DEFER | 核心无声明式依赖检查（该逻辑实证在 fastify/lib/plugin-utils.js）；有 pluginTimeout+**onClose 逆注册序关闭**（unshift 实读）；逆序 onClose 纪律 DEFER（触发=≥3 个关停子系统，当前≈2） |

**类别净结论：KEEP 自研四分法**（行为→ExtensionBus；能力→MCP 进程隔离；知识→skills 三层；约束→zod+restrict）。第三方 in-process 扩展调用方=0；版本协商三框架均无内建（伪需求信号）。

## 4. 执行内核 / 沙箱 / 工具运行环境

| 项目 | 裁定 | 要点 |
|---|---|---|
| **MCP** | **KEEP 自研窄面 + 2 补丁 GO** | spec 仓名纠正：实为 `modelcontextprotocol/modelcontextprotocol`（非 /spec）；typescript-sdk 13.2k★。**主 Agent 亲验我方两处正确性缺陷**：① `listTools()` 丢 `nextCursor` 分页（`src/agent/mcp.ts:73-82`，分页服务器工具被静默截断）② 无 `id` 的通知全丢（`mcp.ts:140`，`tools/list_changed` 永不更新）——~30-60 行自研补齐，**不引 SDK**。官方 SDK 独有但近期无场景：Streamable HTTP/SSE 传输、全套 OAuth、resources/prompts、双纪元协商；sampling/roots 已随 2026-07-28 规范自标 deprecated（SEP-2577）。**SDK DEFER 触发**=接远程 HTTP server / 需要 resources-prompts / modern 纪元成主流；引入=新 npm 依赖，须走变更确认门 |
| ZyHive | 门禁击杀 | 19★+AGPL；描述证伪（Go+Vue 团队协作 OS，非沙箱） |
| autogen/ag2 沙箱 | **EXTRACT×5 → EEL E5** | 真实位置 `ag2/ag2/extensions/docker/sandbox.py` DockerSandbox **L25-256（主 Agent 亲验 L25/44-46/53-54）**；D-087 未覆盖纪律：超时→容器重启+exit 124（L126-132）、默认围栏 network none/mem 512m（L44-49）、atexit 崩溃兜底回收（L188-190,241-247）、超时下限校验（L53-54）、输出截断 100k。我方 `remote/train_eval.py` 无 timeout/kill（rg 零命中）——缺口属实 |
| playwright-mcp（补扫） | REFERENCE + DEFER | 36.4k★ Apache-2.0；无障碍树快照/零视觉模型/只读优先；**现有 McpStdioClient 即可驱动**（反证自研窄面够用）；纪律：npx 拉包锁版本、浏览器出域与 E2B deny-all 分属两套网络策略；触发=网页证据抓取立项 |

沙箱大面维持前批：KEEP D-087（OpenSSH+Docker/WSL2+sidecar，live 验证）；E2B REFERENCE（onTimeout/pause、snapshot→docker pause/commit、deny-all 出域、计量语义进 E5）；microsandbox DEFER；gvisor/kata/firecracker REFERENCE。

## 5. Agent 协议规范

| 项目 | 裁定 | 要点 |
|---|---|---|
| agent-protocol | 双杀 | openpeng 版 0★零采用（v3.1 内容属实：agent.json+worker.yaml+9 工具，但无背书）；agi-inc 原版停更 16 月 |
| **A2A** | DEFER + REFERENCE | 25.5k★ LF/Google 真标准；TaskState 9 态↔我 RunStatus 8 态映射表已留档；AgentCard≈capabilities+toolNames。**内部 subagents 是进程内函数调用，无网络边界——A2A 解决的发现/准入/传输问题不存在**；Artifact 无哈希（弱于我 content-addressed artifacts，反向映射即降级）。触发=多实例部署/第三方 Agent 协作/远程 Direction-B executor/SaaS 多租户 |
| JSON-Agents | 门禁击杀 | 20★停更9月 |
| **AG-UI（补扫）** | DEFER + REFERENCE | 15.5k★ MIT；与 AgentEvent→SSE 链路同构，9 事件逐项映射表在底稿；**我方独有 4 事件（model_call_done/compaction/permission 裁决/spilledTo）在 AG-UI 只能挤进 Custom——单消费者下我们更强，不采纳**。借 vocabulary（不引实现）：interrupt+resume（权限交互化时）、StateDelta RFC 6902（状态同步成瓶颈时）、流式三元组（前端要流式时）。我 SSE cursor/Last-Event-ID 续传已等价解决其重连问题 |
| agents.md（补扫） | 已是采用者 | 上下文约定非序列化，生态位一段留档 |

**类别净结论**：KEEP 自有 zod 判别联合 + ReproducibilityBundle 为权威；对外互操作由更合适的层承担（SWAN JSON-LD 已落地、RO-Crate 维持 DEFER）。

## 6. 算法层（反思/规划/自我修正）

| 项目 | 裁定 | 要点 |
|---|---|---|
| langgraph-reflection | 门禁击杀 | 185★+archived+无LICENSE；确为独立仓库（非文档页），但其 reflection=**内部 LLM-judge 信号→registry C 证伪命中**（双死因） |
| brunogcar/agent | 门禁击杀 | 1★无LICENSE |
| agent-contracts | 门禁击杀 | 5★；机制无增量（budget.ts+POPPER alpha-spending+wall-clock 门已覆盖"预算/时间/成功判定防跑飞"） |
| opencode 规划-反思 | EXTRACT（可选） | 本地实读：`agent/agent.ts:156-174`（plan 档仅计划文件可写）+`session/reminders.ts:26-35,60-67,86-95`（**阶段切换合成提醒注入**）+`prompt/plan-mode.txt`（≤3 explore 并行→design→双出口）+`llm.ts:296-311`（experimental_repairToolCall，解析错误=外部信号回灌）。信号门通过；净增量仅"合成提醒"模式 |

**科学红线重申**：反思类候选全灭，再次证实 FAR-Lab 证据注册表裁定——**无外部信号的内在自我修正已被证伪**（Huang ICLR 2024 等，registry C standing）。FAR-Lab 反馈修订环（实验反馈→因果关联修订→版本对比）是带外部信号的正确形态，优于本类清单全部候选。

## 7. 多智能体编排

AutoGen / CrewAI：**Wave-8 standing REJECT 维持**（ag2 只取容器纪律进 E5；"常驻角色委员会/对话总线"无能力分化实证，stage 机+schema 化调用点即等价物）。

## 8. 工程化 / 可观测性

| 项目 | 裁定 | 要点 |
|---|---|---|
| LangSmith | 商业闭源 | 不作采纳对象→开源替代评估：langfuse(33.6k★, license Other+core/ee 拆分→REFERENCE)、phoenix(11.1k★, **ELv2**→REFERENCE)、**openllmetry(7.4k★ Apache-2.0 PASS)**、otel semconv(639★ Apache-2.0 PASS) |
| OTel GenAI 对齐 | **EXTRACT 语义 + DEFER** | receipts/rollout/eval→semconv 字段级 9 行映射表已存档（底稿§③）；**不动 zod schema、不引 SDK**；注意 semconv 已迁独立仓须用新名（input_tokens/provider.name，旧名 Deprecated）；DEFER 触发=首个外部消费者 |
| dsh Event Stream | 已移植大半 + DEFER | 词汇表 `known-event-types.ts:15-59`（50 型）+ignorable 前向兼容门（`coordinator.ts:1053-1056`）+崩溃修复（`repair.ts:27-132`）；**我 `rollout.ts:9-14` 溯源注释+`:71` InterruptedTurnDisposition 证明崩溃修复语义已移植完毕**；剩余增量=ignorable 前向门+重试事件入 rollout，DEFER 触发=rollout 类型不兼容演进/外部消费者 |

---

## 9. GO 清单（立即可执行，全部零新 npm 依赖，按价值排序）

1. **`src/agent/mcp.ts` 两处正确性缺陷**（真 bug：nextCursor 分页循环 + list_changed 通知处理，~30-60 行）——主 Agent 亲验在案
2. **EEL E5 容器纪律×5**（ag2 sandbox.py：超时重启 exit 124 / network none+mem 512m / atexit 回收 / 超时下限 / 100k 截断）——注意 `src/experiment`+`experiment-runtime/` 属 EEL 兄弟会话车道，须走 EEL 车道提交；E2B 语义（pause/commit kill-resume、deny-all 出域）并入同批
3. **`src/agent/permissions.ts` 增强**（agentscope 模式机+bypass_immune+ask→deny 保建议；vercel/ai HMAC 审批签名防 TOCTOU）
4. **`src/agent/loop.ts`**（mastra 双超时+StopCondition 组合子+宽限轮次）
5. **`src/agent/compaction.ts`+`tool.ts`**（offload 协议+超大结果切分+修复回路）
6. （可选）HintBlock 运行时状态注入（hooks/skills）

## 10. DEFER 触发器注册表（16 项）

MCP 官方 SDK（远程 HTTP server/resources-prompts/modern 纪元）· A2A（多实例/第三方协作/SaaS 多租户）· AG-UI vocabulary（权限交互化/StateDelta 瓶颈/流式立项）· OTel GenAI 映射（首个外部消费者）· restate awakeable（进程外完成者）· DAG 引擎（分支管线拓扑）· cordis disposer（≥2 持资源 handler）· 逆序 onClose（≥3 关停子系统）· 声明式插件依赖/热插拔（第三方 in-process 生态）· playwright-mcp（网页证据抓取立项）· microsandbox（KVM 环境+VM 级隔离需求）· E2B 基础设施（离 WSL2+对抗性代码）· HITL 五型（运行中审批门，+TTL）· compaction 设计档（多轮会话立项）· COW 状态隔离（fan-out 拷贝压力）· rollout ignorable 前向门（类型不兼容演进/外部消费者）

## 11. 用户清单描述证伪更正表

| 清单断言 | 实况 |
|---|---|
| agentscope 有 "HarnessAgent 组件/子Agent编排/Plan Mode" | 全仓 0 命中；权限模式是另一套（DEFAULT/EXPLORE/ACCEPT_EDITS/BYPASS/DONT_ASK） |
| Omnigent 是 "Databricks-Labs/omnigent" | owner 404，实为 omnigent-ai/omnigent，alpha 期 |
| ElizaOS "基于 LangGraph 封装/Atom 原子单元/Runtime 快照/子流程嵌套" | 四项全证伪：langgraph 0 命中、Atom 不存在、快照=systemd、子流程内存 Map 崩溃即丢、dag 模式假并行 |
| Cordis 在 "deepseek-ai/cordis" | 404；实为 dsh vendored `@deepseek-ai/cordis`（author Shigma）→ 上游 cordiverse/cordis |
| Eko "registerPlugin 接口" | VERIFIED-ABSENT（全源码 0 命中） |
| MCP spec 在 "modelcontextprotocol/spec" | 实为 modelcontextprotocol/modelcontextprotocol |
| Agent-Protocol v3.1 值得采纳 | openpeng 版 0★零采用零背书；原版停更 16 月 |
| LangSmith 可对接任意框架 | 商业闭源，非 OSS 采纳对象（开源替代见 §8） |
