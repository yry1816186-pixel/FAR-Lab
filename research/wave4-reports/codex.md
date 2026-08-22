# Breadth report: openai/codex (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) + main-agent verification. Subagent delivered Top-5 with file:line; main agent verified the load-bearing claims first-hand (its full 28-entry table was not retrievable from the agent channel — noted honestly; entries below carry only main-agent-verified or subagent-reported-then-verified references).

Main-agent spot-checks: `codex-rs/secrets/src/sanitizer.rs:1-22` (4 LazyLock regexes: OpenAI sk- keys, AWS AKIA, Bearer tokens, generic api_key/token/secret/password assignments → `[REDACTED_SECRET]`) ✅; `codex-rs/core/src/compact_token_budget.rs:22-60` (token-budget compaction SKIPS model summarization, installs fresh context window, still modeled as compaction lifecycle so hooks observe it) ✅; `codex-rs/core/src/elicitation.rs:1-30` (refcounted ElicitationService pausing tool-result delivery; watch channel for pause state) ✅.

## Repo overview

Apache-2.0 (`LICENSE:189-193`). Rust workspace (100+ crates under codex-rs/), Bazel+Cargo. OpenAI's official CLI coding agent.

## Key mechanisms (verified subset + subagent-reported entries marked ◇)

| 组 | 机制名 | file:line | 做法摘要 | 价值 | 成本 | FAR-Lab 对照 |
|---|---|---|---|---|---|---|
| E | 秘密正则脱敏器 | `secrets/src/sanitizer.rs:4-22` | 4 组正则（sk-/AKIA/Bearer/赋值对）best-efford redact | 防凭证泄漏，~30 行 | 低 | 部分（FAR-Lab 有 redactionNote 约定但无输出内容 redactor） |
| B | Token-budget 无模型压缩 | `core/src/compact_token_budget.rs:22-93` | 跳过模型摘要，直接装新窗口；仍走 compaction 生命周期让 hooks 可见 | 零模型成本的窗口管理 | 中 | 缺失（FAR-Lab 单次调用无需；记为 future） |
| B | 错误类型感知重试（context-trim 自愈） | `core/src/compact.rs:271-344` ◇ | context-window-exceeded 错误触发裁剪再重试 | 自愈创新 | 中 | 缺失 |
| D | Elicitation 服务（refcount 暂停） | `core/src/elicitation.rs:1-80` | 异步人机环协调；并发 elicitation 计数暂停会话直至全部完成 | 干净的 HITL 原语 | 中 | 缺失（FAR-Lab feedback 阶段同步） |
| F | 10 层配置栈 + profile | `config/src/config_layer_source.rs:6-62` ◇ | 层级优先合并 | 实验 dev/prod 配置 | 中 | 部分（env+config 已有） |
| E | Seatbelt/Landlock 沙箱 | codex-rs platform crates ◇ | 声明式策略执行 | 高（coding 场景） | 高 | 不适用（FAR-Lab 无本地执行面） |
| C | apply-patch 协议 | codex-rs/apply-patch ◇ | 自定义补丁格式 | 高（文件编辑） | 中 | 不适用 |

## Top-5（子 Agent 排序）

1. Secret Sanitizer（~30 行 JS 移植，防凭证泄漏——对 FAR-Lab 日志/receipt 输出直接有用）
2. Token-Budget Compaction（多轮记忆时代适用）
3. Error-Type-Aware Retry（context-trim 自愈）
4. Elicitation Service（交互式验证未来可用）
5. Config Layer Stack（实验配置分离）

## 主 Agent 备注

- codex 面向 coding agent 场景，与 FAR-Lab 垂直科学产品差异大；可收割面窄但工程质量极高
- sanitizer 是唯一"立即可用零成本"项；其余记入注册表 B 缓延（附反转触发）
