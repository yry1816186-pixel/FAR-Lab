# Wave-4 Harness Fusion — F1/F3/F4 execution evidence (2026-08-22)

Fusion sources (all license-verified, main-agent first-hand code reads):
- **F1 retry timing**: deepseek-ai/deepseek-harness `packages/llm/llm/src/retry-policy.ts:14-18` + `packages/llm/llm-retry/src/index.ts:66-69`（MIT — 厂商自家：对称乘性抖动 delay×(1−r+2r·rand) + cap）；sst/opencode `packages/opencode/src/session/retry.ts:44-83`（MIT — Retry-After 三格式优先解析）
- **F3 credential redaction**: openai/codex `codex-rs/secrets/src/sanitizer.rs:4-22`（Apache-2.0 — 4 正则族）
- **F4 judge self-consistency**: google-gemini/gemini-cli `evals/llm-judge.ts:30-114`（Apache-2.0 — N 次投票多数决），FAR-Lab 适配为 per-dimension 中位数 + 离散度披露（对齐 D-037 rediscovery 3-vote 中位数先例）

## Gate results (commands + exit codes)

| gate | command | result |
|---|---|---|
| baseline (BEFORE fusion) | `npm test` @ 10:11 | 281/281 passed, exit 0 |
| AFTER fusion | `npm test` @ 10:29 | **295/295 passed** (18→19 files; +14 new tests), exit 0 |
| AFTER audit-P3 fixes | `npm test` @ 10:43 | **298/298 passed** (+3 audit-driven discriminating tests), exit 0 |
| typecheck | `npm run typecheck` | exit 0 |
| lint | `npx eslint src tests eval --max-warnings=0` | exit 0 |
| build | `npm run build` | exit 0 (dist fresh, D-031 discipline) |
| providers suite | `npx vitest run tests/providers.test.ts` | 54/54 |
| eval syntax | `node --check eval/llm-judge.mjs eval/judge-votes.mjs` | OK |

## F1 before/after (deterministic, real run from `dist/providers/http.js`)

**Before**: fixed `TRANSPORT_BACKOFF_MS = [1000, 3000]` — no jitter, no server guidance, attempt 2+ pinned at 3s.

**After** (measured, `random` injected at {0, 0.5, 1} for the exact bound table):

| attempt | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| random=0 (min) | 750 | 1500 | 3000 | 6000 | 12000 |
| random=0.5 (期望) | 1000 | 2000 | 4000 | 8000 | 16000 |
| random=1 (max) | 1250 | 2500 | 5000 | 10000 | 20000 |

Server guidance precedence (measured): `Retry-After: 7` → 7000ms（压过任何指数值）；`retry-after-ms: 600000` → capped 30000ms。语义不变量保持：W1 契约（≤2 次传输重试；quota/auth 永不重试；≤3 次纠正性重问）逐条有测试锁定。

新增可观测性：receipt 增 `transportRetries`/`correctiveReasks`（成功/失败 receipt 均带；llm.ts 透传入 provenance ModelCallFacts）——D-034 类独立样本损坏未来可直接从 receipt 计量，无需日志考古。

## F3 before/after (real run)

**Before**: 无任何输出脱敏——`truncate(bodyText, 300)` 原样进入 error.message → sqlite run.lastError/events/CLI 输出。

**After**（实测语料）：

| 输入 | 输出 |
|---|---|
| `key sk-abc123def456ghi789jklmn leaked` | `key [REDACTED_SECRET] leaked` |
| `aws AKIAIOSFODNN7EXAMPLE used` | `aws [REDACTED_SECRET] used` |
| `Authorization: Bearer abcdef1234567890abcdef sent` | `Authorization: Bearer [REDACTED_SECRET] sent` |
| `api_key = "z9y8x7w6v5u4t3s2r1q0"` | `api_key = "[REDACTED_SECRET]"` |
| 普通 429 错误文案 | 原样（无误伤） |

脱敏点在 `fail()` 持久化咽喉 + classifyHttpStatus/malformed-200 的消息构建处（**先脱敏后截断**——审计 P3 修复）；quota 分类先于脱敏在原文执行且有测试锁定（kind=quota_exceeded + "Insufficient balance" 原文保留 + 零重试）。端到端测试：429 响应体含回显密钥 → `res.error.message` 不含密钥；跨界密钥零片段泄漏测试。

## F4 before/after

**Before**: `eval/llm-judge.mjs` 单次判分；EV1 实测同数据种子摆动 ±1-2pt（靠 3-seed 手工均值披露）。

**After**: `FARLAB_JUDGE_VOTES=N`（默认 1 = 行为不变）→ 同一盲序任务 N 次顺序调用 → per-dimension **中位数** + min/max `spread` + `per_vote` 全量留档（分歧永不隐藏）；全部成功票为零时诚实 `judge_ok=false`。纯函数 `eval/judge-votes.mjs`（medianOf/aggregateVotes）单测 5 例锁定。

**诚实边界**：live 方差削减收益 **UNVERIFIED**——模型路由被 D-036 阻断（deepseek 402 / zai 429-1113 / dashscope keyless），机制落地+离线测试完成，live 验证记为路由恢复后的待办（已入 DECISIONS）。

## v2 ambition-gate compliance（research/WAVE-PROMPTS/_COMMON-BASELINE.md:26，并行会话 96f85ab 同日立）

准入线 = 目标指标可测提升 ≥5% **或消除一类已实证失败模式**，且零北极星回退：
- **F1**：消除类 = "服务端 Retry-After 指令被物理忽略 + 固定退避零抖动（雷群）"——旧代码无 parseRetryAfterMs/无 jitter（git diff 可证模式存在）；判别性测试在新代码通过、对旧代码必然失败（honors Retry-After / jitter bounds 两组）。北极星零回退：295/295 全绿，分类语义测试锁定。
- **F3**：消除类 = "凭证形态子串可入持久化错误路径"——判别性端到端测试（429 回显密钥→消息脱敏）对旧代码必然失败。
- **F4**：**不主张消除已实证失败**（默认 N=1 行为不变；方差仍在）——按门禁措辞属"机制已具备（opt-in）"，live 验证后方差削减 ≥5% 才可转默认推荐，否则记"评估后不采用"。此边界已写入 DECISIONS。

## Adversarial audit (2026-08-22, fresh adversarial-auditor subagent)

**判定：ACCEPT — 0 P0 / 0 P1 / 0 P2 / 6 P3**。审计实证：2990 条持久化旧 receipt 用新 ProvenanceReceipt schema 全量 reparse 通过（0 失败）；dist 新鲜度核对；四上游许可证与源码逐一独立复核（机制=重写/适配非拷贝，attribution 双处到位）；绕过语料实测（发现 sk-proj- 假阴性=忠实继承 codex 上游局限）。

**6 项 P3 已全部同会话修复**（复跑门禁 298/298，+3 判别性测试）：
1. W1 契约注释过时（1s/3s）→ 已更新为新曲线描述（http.ts:12-19）
2. 先截断后脱敏可漏密钥前缀片段 → 改为**先脱敏后截断**（classifyHttpStatus + malformed-200 两处）；新增跨 300 字符边界判别测试（旧代码该配置泄漏 24 字符完整可用片段，新代码零片段）
3. sk-proj- 连字符格式假阴性 → sk- 模式扩展 `[A-Za-z0-9-]`（超出 codex 上游的已文档化改进）+ 测试
4. "顺序正确性有测试锁定"表述强于覆盖 → 补齐 quota 语义保留测试（"Insufficient balance" 原文经脱敏不变 + kind=quota_exceeded + 零重试）后表述成立
5. FARLAB_JUDGE_VOTES 非法值崩溃且丢全量记录 → 启动时 Number.isInteger 校验 + exit 2 快速失败
6. 判分 receipt 丢 modelVersion / per_vote 无 usage → 恢复 modelVersion + per_vote 增 usage/latencyMs；偶数票 x.5 中位数已在 judge-votes.mjs 模块文档声明

## Attribution

- deepseek-harness（MIT, Copyright (c) 2026 DeepSeek）：重试抖动算法形态
- opencode（MIT, Copyright (c) 2025 opencode）：Retry-After 解析次序
- openai/codex（Apache-2.0, Copyright 2025 OpenAI）：脱敏正则族（TS 重写，非逐行拷贝）
- gemini-cli（Apache-2.0）：判分投票机制思想（中位数适配为 FAR-Lab 设计）
