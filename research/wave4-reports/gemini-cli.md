# Breadth report: google-gemini/gemini-cli (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/gemini-cli` (Apache-2.0 LICENSE:1, main-agent license-verified). Subagent delivered Top-5 with file:line; full table not retrieved from channel.

Main-agent spot-checks: `evals/llm-judge.ts:30-114` ✅（judgeYesNo：selfConsistencyRuns 并行 majority vote；YES/NO 严格系统提示；容错解析 THE ANSWER IS YES/endsWith）；`packages/core/src/core/geminiChat.ts:895-925` ✅（On-Retry Nudging：InvalidStreamError 按类型 THINKING_ONLY_RESPONSE/NO_RESPONSE_TEXT 注入定向 system 修正提示）。

## Repo overview

Apache-2.0。TS monorepo 1738 .ts / 7 包，零运行时依赖（core/cli 分层）。

## Top-5（子 Agent 排序 + 主 Agent 校正）

| 排名 | 机制 | file:line | 要点 | FAR-Lab 对照（主 Agent 校正） |
|---|---|---|---|---|
| 1 | 四层分层记忆 HierarchicalMemory | `memory.ts:7-12` → `memoryContextManager.ts:49-65` | global(domain)→project(constraints)→session(hypotheses)→extension(plugins) | 缓延（FAR-Lab project-spec 为开发期；运行期记忆=sqlite runs；触发：产品需要用户级研究偏好持久化时） |
| 2 | ChatCompression probe 验证模式 | `chatCompressionService.ts:382-411` | 压缩后用 probe 验证保真 | 缓延（无多轮会话；与 deepseek 9 段 checkpoint 一起记档） |
| 3 | LLM-Judge self-consistency | `evals/llm-judge.ts:30-114`（~85 行） | 并行 N 次判分取 majority | **GO 候选**：FAR-Lab eval/llm-judge.mjs 无 majority vote（EV1 判分曾 ±1-2pt 种子方差，靠 3-seed 手工均值披露）；D-037 已在 rediscovery 边界带用 3-vote——把 self-consistency 引入 llm-judge.mjs 是自然补全，离线可测 |
| 4 | Context-Aware Retry Nudging | `geminiChat.ts:901-923`（~15 行） | 按错误类型注入定向修正提示 | **部分已有**：http.ts appendCorrection 传递 zod 错误详情（更强）；增量=空响应/仅思考两类特定 nudge 文案 |
| 5 | Extension Integrity HMAC 签名 | `integrity.ts:42-218` | 扩展完整性验证 | 不适用（无扩展生态） |

## 其余（子 Agent 报告要点）

Context Pipeline 图引擎（`context/pipeline/orchestrator.ts`）、extension 系统、@file 上下文、NHC 总结——均为 coding-agent 面或已覆盖。

## 主 Agent 备注

gemini-cli 净新增=llm-judge self-consistency 模式（与 FAR-Lab 判分方差痛点直接对应）。
