# OSS Porting Scan v2 — 智能体算法层（反思/规划/自我修正）+ 多智能体编排 + 可观测性

日期 2026-08-22。GitHub API 实值均经 `api.github.com/repos/{owner}/{repo}` 当日观测（WebFetch）。
本地克隆直读：`.cache/repos/opencode`（v1.18.21, MIT）、`.cache/repos/deepseek-harness`（dsh 0.1.1-rc.2, MIT）。
裁决前置门（本类别特有）：每个反思/自我修正候选先回答"反思信号是外部（检索/实验/工具/日志/人类）还是内部（模型自我评审）"——内在者直接对照 registry C（Huang ICLR 2024 / CRITIC / 辩论 vs self-consistency，REJECT standing）。

## ① 质量门表

| # | 仓库 | stars | 最后 push | license | archived/fork | 门禁结果 |
|---|------|-------|-----------|---------|---------------|----------|
| 1 | langchain-ai/langgraph-reflection | 185 | 2025-03-18 | **无** | **archived** | **KILL**（三重击杀：archived+<500+无 license）。存在性：**是独立仓库**（早期 reflection demo，非文档页）；活体形态是 langgraph 文档的 reflection 模式 |
| 2 | brunogcar/agent | 1 | 2026-08-22 | 无 | 否 | **KILL**（<500 无战略豁免理由） |
| 3 | flyersworder/agent-contracts | 5 | 2026-08-22 | Apache-2.0 | 否 | **KILL**（<500；机制增量判"无"，见②） |
| 4 | sst/opencode（本地克隆 MIT 已验） | 未复核（本 pass 只读本地，API 值 UNVERIFIED；往期 wave 已过门） | — | MIT（LICENSE:1-3 实读） | 否 | 本地深读 |
| 5 | crewAI / ag2 | — | — | — | — | Wave-8 standing 维持，不重读 |
| 6a | langfuse/langfuse | 33,551 | 2026-08-22 | "Other"（GitHub 不可分类；core 自述开源可自托管，ee/ 商业拆分细节 UNVERIFIED） | 否 | 过星数门，REFERENCE only |
| 6b | traceloop/openllmetry | 7,387 | 2026-08-10 | Apache-2.0 | 否 | **PASS** |
| 6c | open-telemetry/semantic-conventions | 639 | 2026-08-20 | Apache-2.0 | 否 | **PASS**（注意：GenAI 属性已迁出，见③） |
| 6d | Arize-ai/phoenix | 11,143 | 2026-08-22 | **Elastic License 2.0**（source-available，非 OSI；禁托管服务/禁绕过 license key） | 否 | 过星数门，REFERENCE only |
| 7 | deepseek-ai/deepseek-harness（本地克隆 MIT 已验） | 未复核 API（UNVERIFIED） | — | MIT（LICENSE:1-3 实读，"Copyright (c) 2026 DeepSeek"） | 否 | 本地深读 |
| — | open-telemetry/semantic-conventions-genai（GenAI semconv 新家） | API 403 rate-limit，**UNVERIFIED** | — | — | — | 以 opentelemetry.io registry 页为权威源（已验） |

LangSmith：商业闭源 SaaS，不作为采纳对象（standing 维持）。

## ② 过门/本地项深评

### 1. langchain-ai/langgraph-reflection — KILL（双重：门禁 + registry C）
- **信号门**：其 reflection 循环 = LLM 生成草稿→同一/另一 LLM 作 judge 批评→重写。**信号是内部的**（judge 无外部 ground truth，只有模型先验）。直接落 registry C 裁定：无外部信号的 intrinsic self-correction 降性能；等成本下辩论不优于 self-consistency。
- FAR-Lab 等价物已更强：反馈修订环（实验/检索结果→因果关联修订→版本对比，信号=外部证据）、judge self-consistency（已落地）。**决策：REJECT（grade A 信心）**，仓库本身另被 archived/无 license 击杀。

### 2. brunogcar/agent — KILL
- 1 星无 license。"规划→执行→反思收敛 + 预算控制"思想盘点（一句话级）：FAR-Lab 已有 stage 机（规划）、`src/agent/budget.ts:22-26`（上下文预算 18%/28% 软硬门）、`src/agent/capabilities/refine.ts:246`（maxTurns 预算）、POPPER alpha-spending（统计预算）、orchestrator wall-clock 门。**无增量。决策：REJECT。**

### 3. flyersworder/agent-contracts — KILL
- 机制 = 声明式"资源预算/时间边界/成功判定"契约防 agent 跑飞。对照：FAR-Lab `budget.ts`（token 预算+硬门触发 compaction）、`AgentLoopConfig.maxTurns` + `shouldAbort`（refine.ts:246-248，含 cancelRequested 轮询）、wall-clock 门、POPPER 停止规则——覆盖同一问题面且是运行时强制而非纸面契约。**无增量机制，仅命名学。决策：REJECT。**

### 4. OpenCode 规划-反思循环（本地 .cache/repos/opencode，v1.18.21, MIT）
**信号门：通过**——其修正信号全部是外部的（工具调用解析失败、权限边界、人类审批），无模型自我评审环节。

真实实现（file:line 实读）：
- **计划模式（任务拆解）**：`packages/opencode/src/session/prompt/plan-mode.txt:10-40` Phase 1 显式并行探索（"Launch up to 3 explore agents IN PARALLEL"）→ Phase 2 设计 agent → question 工具澄清 → 增量写计划文件 → `plan-mode.txt:63-67` Phase 5 只许以 question 或 `plan_exit` 结束回合。
- **只读强制**：`packages/opencode/src/agent/agent.ts:156-174` plan agent 权限档：禁全部编辑工具、仅计划文件路径可写（`plans/*.md` 白名单）、`plan_exit: allow`；:127-128 build 档反禁 `plan_enter/plan_exit`。
- **计划-执行切换注入**：`packages/opencode/src/session/reminders.ts:26-35`（plan agent → 注入 PROMPT_PLAN 只读约束）；:60-67（plan→build 切换注入 build-switch.txt："Your operational mode has changed from plan to build"）；:86-95（PLAN_MODE 模板 `${planInfo}` 替换：计划文件已存在→读+增量编辑，不存在→write 创建）。
- **门控与开关**：`packages/opencode/src/effect/runtime-flags.ts:47`（`OPENCODE_EXPERIMENTAL_PLAN_MODE`）；`packages/opencode/src/cli/cmd/run.ts:439-444`（plan_enter/plan_exit 作为权限点）。
- **错误复盘（外部信号修正）**：`packages/opencode/src/session/llm.ts:296-311` `experimental_repairToolCall`——确定性修复：工具名大小写纠正（:297-303），否则改路由到内置 `invalid` 工具并把失败信息 JSON 化回灌（:304-310）——**解析器错误作为外部信号回环**，非模型自评。流错误 `onError` 记日志（:281-294）。

**增量判定**：FAR-Lab 的研究计划本身就是产品核心工件（等价于 plan file）；stage 机+schema 化调用点=等价的 plan/build 分离；`refine.ts:304-341` 已有并行 pro/contra 子代理（等价 explore fan-out）。真正可取的细节是 **build-switch 合成提醒模式**（模式切换时向用户消息注入 synthetic text part 保持约束连贯）与 **plan_exit 显式审批门**。决策：**KEEP 自有 + EXTRACT（可选、grade C）**——把"阶段切换时注入合成 system-reminder"模式用于我们研究计划→执行计划的交接处；不引代码。

### 5. CrewAI + AutoGen(ag2) — Wave-8 standing 维持
- **CrewAI**：常驻角色 crew 编排，无能力分化实证，REJECT 维持；FAR-Lab stage 机即等价物。
- **ag2**：对话驱动多智能体（后继 AutoGen），同一裁定 REJECT 维持；`refine.ts:322-328` 的 maxDepth:1 受控 fan-out（`src/agent/subagents.ts`）是我们需要的全部"多智能体"。

### 6. 可观测开源对照（LangSmith 替代评估）
- **langfuse**（33.5k）：OTel 原生摄取的 LLM 工程平台（trace/eval/prompt 管理）。**决策：REFERENCE**——其"OTel 为唯一摄取协议"的架构判断支持我们"语义对齐、不引平台"路线；license 为 Other（core/ee 混合），不作代码采纳。
- **traceloop/openllmetry**（7.4k, Apache-2.0）：GenAI 场景的 OTel 自动插桩 SDK 家族（Python/JS）。**决策：REFERENCE + EXTRACT（仅语义）**——它证明 OTLP 生态成熟，但其价值在"自动插桩"，与我们 receipts 的显式记账路线互补不重叠；不装 SDK（zod-only + 零依赖纪律）。
- **open-telemetry/semantic-conventions**（639, Apache-2.0）：**关键事实（opentelemetry.io registry 实读）**：GenAI 属性整组标注 **"Moved: Generative AI semantic conventions"**——已迁至独立 GenAI semconv 仓（semantic-conventions-genai，API 值 403 未验，UNVERIFIED），原 `gen_ai.system`、`gen_ai.prompt_tokens` 等标 Deprecated。**决策：EXTRACT（语义进映射表，见③），不引 SDK/不引依赖。**
- **Arize-ai/phoenix**（11.1k, **ELv2**）：AI 可观测+评估套件。ELv2 禁托管 offering——对我们自用无碍但非 OSI，且是重平台。**决策：REFERENCE。**

### 7. deepseek-harness Event Stream（本地 .cache/repos/deepseek-harness，MIT）
**信号门：通过**——回放/修复信号全部来自持久化日志事实与 provider 错误（外部）。

真实实现（file:line 实读，本次落到行级）：
- **事件词汇表**：`packages/core/session/src/known-event-types.ts:15-59`（GENERATED，由 `scripts/gen-persistence-catalog.ts` 生成）——50 个会话事件类型：`turn/start|end`、`step/start|end`、`tool/call`、`tool/result`、`llm/retry`、`llm/retry-started`、`compaction/{start,prune,summary,end}`、`approval/{asked,decided,policy}`、`plan/mode`、`todo/write`、`subagent/*`、`team/*` 等。
- **前向兼容读取门**：文件头注释（:8-14）——持久化读取路径拒绝解释词汇表外的类型，除非事件带 `ignorable` 标记（"silently skipping a required event would reconstruct a wrong session"）。信封定义 `packages/core/session/src/types.ts:408-426`（`SessionEvent` 含 `ignorable?: true` :426 与 `sourceEventSeqs` 引用字段 :427-434）；执行点 `packages/session/session-persistence/src/coordinator.ts`（`if (KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true) continue`，注释 :1053-1056）。另有事件生产者-消费者矩阵文档 `docs/event-producer-consumer.md`（脚本生成）。
- **崩溃修复（回放收敛）**：`packages/core/session/src/repair.ts:27-132` `interruptedTurnClosers`——扫描日志找 open turn/step/悬空 tool-call，确定性合成收尾事件；`:13/:16` 两分类 `TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN`；`:104-105` 合成 tool-result 内嵌重试纪律文案（"retry only if the operation is read-only or idempotent… Do not retry blindly"）——**把重试决策显式交给模型但带硬规则**；时间戳复用最后真实事件（:82-86），不发明未来时间。
- **LLM 重试即事件**：`packages/llm/llm-retry/src/index.ts:150-195`——重试作为 `llm/retry`/`llm/retry-started` 事件**写入会话日志**（可回放审计），maxRetries 按 policy（:182-190 从日志 findLast 恢复同 turn/step/provider 的先前重试计数），尊重 provider Retry-After（:194-195）。
- **OTel 出口**：`packages/session/session-telemetry-otel/src/index.ts:1-60`——OTLP/HTTP 日志导出（sdk-logs BatchLogRecordProcessor），模式 FULL/FEEDBACK_ONLY/**DISABLED（默认）**，fail-closed 校验。
- **重放测试**：`packages/test-support/llm-replay`（llm/stream waterfall 消费者，见 event-producer-consumer.md 矩阵）。

**增量判定（对照 FAR-Lab）**：**open-turn 崩溃分类已被我们移植**——`src/agent/rollout.ts:9-14` 注释明言语义源自 deepseek-harness `session/repair.ts`，`rollout.ts:71` `InterruptedTurnDisposition = 'tool_not_started' | 'tool_outcome_unknown'`、`:79` openTurn、`:116-124` 重建即等价物；rollout 撕裂尾行丢弃沿 codex 语义（:11-13）。剩余增量三件：
  1. **`ignorable` 前向兼容标记 + 词汇表读取门**（新版本 harness 写新事件类型，旧读取端显式跳过而非错读/崩溃）——我们 `RolloutLine`（rollout.ts:16-24）是封闭 union，无版本增长策略。价值真实但目前我们单体部署、读写同版本，风险低。
  2. **重试事件入日志**（我们重试发生在 loop 内部，rollout 只有 tool_lifecycle started/finished 两相，重试退避不可回放）。
  3. **事件生产者-消费者矩阵文档自动生成**（docs 治理，低优先）。
**决策：KEEP（已移植核心）+ DEFER（触发器：rollout 行类型首次向后不兼容演进，或引入外部 rollout 消费者时，届时加 `ignorable` 字段 + 读取门；重试事件入 rollout 与 ②4 的 build-switch 同批考虑）。grade B。**

## ③ 可观测对齐：OTel GenAI semconv ↔ FAR-Lab receipts/rollout/SessionTelemetry

**结论：值得做"语义对齐"，但形态是纯函数映射模块或导出期转换，不动 receipt zod schema、不引 OTel SDK（zod-only 硬不变量）。grade B，建议 DEFER 至首个外部消费者（竞赛导出需求/接入 langfuse/Jaeger 演示）出现，映射表本文即存档。**

注意（registry 实读）：对齐目标用**新仓命名**——`gen_ai.usage.input_tokens/output_tokens`（旧 `gen_ai.prompt_tokens/completion_tokens` 已 Deprecated）、`gen_ai.provider.name`（旧 `gen_ai.system` 已 Deprecated）。

字段级映射表（FAR-Lab → OTel GenAI semconv）：

| FAR-Lab 真实字段（file:line） | OTel GenAI 属性 | 备注 |
|---|---|---|
| `ProvenanceReceipt.modelCall.usage.{promptTokens,completionTokens}`（src/domain/provenance.ts:20-24,48） | `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` | 仅命名映射；reasoning tokens 我们未记（`gen_ai.usage.reasoning.output_tokens` 无源） |
| `modelCall.model` / provider | `gen_ai.request.model` / `gen_ai.response.model` / `gen_ai.provider.name` | provider.name 枚举含 `deepseek` |
| `modelCall.latencyMs`（provenance.ts:25） | span duration | 数值语义一致 |
| （finish 原因未记） | `gen_ai.response.finish_reasons`（复数）/ `gen_ai.response.stop_reason` / `gen_ai.response.time_to_first_chunk` | 我们有缺口的字段；流式细节不采集则留空 |
| `ProvenanceReceipt.sourceRetrieval.{family,query,resultCount,contentHashes}`（capabilities/refine.ts:203-215） | `gen_ai.retrieval.query.text` + `gen_ai.retrieval.documents`（byte-string JSON 数组）+ `gen_ai.data_source.id` | contentHashes 可作为 documents 的脱敏指纹形态——比 semconv 默认（原文入 attributes）更符合我们不落 payload 的纪律 |
| `AgentSession.id`/`capability`（src/domain/agent.ts:43-46） | `gen_ai.agent.id` / `gen_ai.agent.name`（agent span，development） | capability→agent.name 语义贴切 |
| sessionId/runId 贯穿（rollout session_meta，rollout.ts:17） | `gen_ai.conversation.id` | runId 更贴 conversation 语义 |
| tournament BT 分数/judge self-consistency | `gen_ai.evaluation.score` / `gen_ai.evaluation.name` / `gen_ai.evaluation.label` | 我们的科学排序环可直接映射，语义零损 |
| `AgentTurnRecord.action`（agent.ts:20-22，含 tool_error/permission_denied） | `gen_ai.operation.name` ∈ {invoke_agent, invoke_workflow, execute_tool, chat, …} + `gen_ai.tool.{name,call.id,arguments,result}` | action 枚举比 semconv 细，反向映射多对一 |
| `SessionTelemetrySummary`（agent.ts:61-71，全为实测计数） | GenAI **metrics**（gen_ai.client.token_usage 等） | 数值同源，聚合口径一致 |

**不对齐的部分（明示理由）**：FAR-Lab receipts 的科学记账维度（stage/purpose/executionMode/redactionNote/contentHashes）在 semconv 中无对应物——这是我们超出工业遥测的部分，保留自有 schema 为主、OTel 为导出投影，方向不可逆（OTel 为主会丢科学 provenance）。SDK/OTLP 依赖不引：观测闭环（receipts→store→run 事件→web SSE）已内建，外部平台（langfuse/phoenix）无当前消费者。

## ④ 类别净结论

1. **反思/自我修正**：三个外部候选全灭——langgraph-reflection（内部信号，registry C 直接命中 + archived/无 license）、brunogcar/agent（1 星）、agent-contracts（5 星，机制已被 budget.ts+maxTurns+POPPER+wall-clock 覆盖）。类别级结论再确认：**反思只在有外部信号时保留**，我们已有的反馈修订环/tournament/judge self-consistency 就是正确形态，无需外采。
2. **多智能体**：无变化。Wave-8 REJECT 维持（crewAI/ag2）；dsh 的 agent-team/goal-round-driver 插件亦无能力分化实证。FAR-Lab `subagents.ts`（maxDepth:1 fan-out）+ stage 机继续作为等价物。
3. **规划**：opencode plan-mode 深读完成——真实机制是"权限档隔离 + 计划文件唯一可写 + question/plan_exit 双出口 + build-switch 合成提醒"，信号全外部，工程上干净。唯一值得抄的思想是**阶段切换合成提醒**（grade C，可选）；计划文件/审批门我们以研究计划工件+门控 stage 已有等价物。
4. **可观测**：核心发现两个——(a) **GenAI semconv 已迁独立仓**，旧属性名作废，任何对齐须用新名；(b) FAR-Lab 早已移植 dsh 的崩溃修复语义（rollout.ts:9-14 溯源注释），真正剩余增量是 `ignorable` 前向兼容门与重试事件入日志——均 DEFER 带触发器。OTel 对齐裁决：**语义映射表存档（本文③），不动 schema、不引 SDK**。
5. 决策汇总：REJECT ×4（langgraph-reflection、brunogcar/agent、agent-contracts、crewAI/ag2 standing）；KEEP ×2（自有反馈环/编排、rollout 已移植部分）；EXTRACT ×2（OTel GenAI 语义映射=低优先 DEFER 触发、opencode build-switch 模式=可选）；REFERENCE ×3（langfuse、openllmetry、phoenix）；DEFER ×1（dsh ignorable 门+重试事件，触发器明确）。
