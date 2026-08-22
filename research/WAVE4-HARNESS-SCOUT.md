# Wave-4 Scout — Agent Harness Source Expedition (2026-08-22)

**Mission** (user handoff): deep-read all obtainable agent-harness sources (DeepSeek harness,
codex, Claude Code public docs ONLY, OpenCode, Hermes, pi-mono + proactively added gemini-cli /
aider / goose / cline / smolagents / OpenHands) → cross-compare → EV-ranked shortlist →
source-level fusion into FAR-Lab authoritative paths → benchmark before/after → adversarial
audit → closeout.

**Method**: 12 parallel breadth subagents (11 local source trees in `.cache/repos/` — data only,
never executed — + 1 Claude-Code public-docs agent under the proprietary-software rule).
Each produces a mechanism inventory mapped to a 10-group × 60+ subdimension system (A interaction,
B context, C tools, D orchestration, E safety, F extensibility, G quality, H product, I model
layer, J eval/evolution). Main agent cross-compares, spot-verifies file:line claims, then
phase-2 deep-dives the highest-value groups before any fusion decision.

**FAR-Lab harness surfaces (fusion landing zones)**: `src/providers/http.ts` (OpenAI-compat
gateway: W1 retry discipline, strict-FC projection, untrusted-data fence, receipts; no streaming,
no prompt-cache control), `src/pipeline/llm.ts` (structured-call bridge + tolerance chain),
`src/app/orchestrator.ts` (persisted linear stage machine, crash/resume at stage boundaries,
cancel), `eval/` (rediscovery judge v2, mlr-bench, llm-judge), `src/cli`+`src/server`+`web`.
Protected invariants: zod-only runtime deps; Direction-A domain ownership (soul boundary).

**Baseline captured before any fusion** (2026-08-22 10:11 local): tests 281/281 (exit 0),
typecheck exit 0. Model routes externally blocked (D-036) → live LLM benchmarks unavailable;
fusion benchmarks must be deterministic/offline (recorded outputs in `eval/results/`,
`spikes/output/`, `.far-run/far.db`) until any route returns.

## 0. Repo inventory (local clones, `.cache/repos/`, gitignored)

| repo | license (verified) | size (files) | breadth agent status |
|---|---|---|---|
| deepseek-ai/deepseek-harness | MIT (main-agent verified) | 7924 | running |
| NousResearch/hermes-agent | MIT (main-agent verified) | 10016 | running |
| openai/codex | Apache-2.0 (main-agent verified) | 6493 | running |
| sst/opencode | MIT (main-agent verified) | 6530 | report received, full re-emit pending |
| badlogic/pi-mono | MIT (main-agent verified) | 1392 | running |
| google-gemini/gemini-cli | Apache-2.0 (main-agent verified) | 2998 | running |
| Aider-AI/aider | Apache-2.0 (main-agent verified) | 692 | running |
| block/goose | Apache-2.0 (main-agent verified) | 2363 | running |
| cline/cline | Apache-2.0 (main-agent verified) | 3846 | running |
| huggingface/smolagents | Apache-2.0 (main-agent verified) | 186 | running |
| All-Hands-AI/OpenHands | MIT (main-agent verified) | 2119 | running |
| Claude Code (docs only) | proprietary — public docs only | n/a | running |

## 1. Per-repo breadth reports (filled as agents complete)

Reports live in `research/wave4-reports/`: opencode.md, hermes-agent.md, smolagents.md, codex.md, cline.md, claude-code-docs.md, pi-mono.md, gemini-cli.md, aider.md (+deepseek-harness, goose, OpenHands pending below). Every load-bearing file:line claim was main-agent spot-verified (noted per file).

## 2. Cross-cutting comparison (phase-1 synthesis, main agent)

### 2.1 收敛发现（≥3 仓独立同构 = 高置信行业共识）

| 机制族 | 谁做得最好 | FAR-Lab 现状 | 差距判定 |
|---|---|---|---|
| retry-after 解析 + jittered 指数退避 + 上限 | opencode（retry-after 头解析+正则族）、hermes（decorrelated jitter+per-provider 表）、pi-mono（两层分类）、aider（0.125s→60s 翻倍）、smolagents（ApiModel Retrying）——**5/9 仓收敛** | providers: 固定 [1s,3s] 无头解析无 jitter；sources: openalex 单次固定 backoff（注释明说"Retry-After is not exposed by the fetch contract"） | **真缺口，生产痛点有实据（OpenAlex 429 纪律 D-029b、DeepSeek 429）** |
| 截断显式标记 | smolagents（双半截断 20k）、cline（2000 上限+`[truncated N chars]`）、opencode（TOOL_OUTPUT_MAX_CHARS）、Claude Code（[truncated]+按需重取） | evidence.ts 已有 `[full-text excerpt: first N of M]`（词边界截断）；falsify claim.slice(0,120)+… | **已达标**（微差：无字符数标记处可统一，价值低） |
| 纠正性重问（错误反馈重试） | gemini-cli Retry Nudging（按错误类型 nudge）、aider reflection（上限3） | http.ts appendCorrection 传递 zod 错误（3 次上限 D-034） | **FAR-Lab 领先**（zod 详情>类型文案） |
| 验证环+完成判定 | Claude Code verification loops | guard/verify 阶段+completion-gate+far verify | **FAR-Lab 领先** |
| compaction（多轮会话压缩） | deepseek-harness（9 段 checkpoint，主 Agent 亲验）、cline（双策略+溢出强转确定性路径）、goose（lenient StructuredSummary，主 Agent 亲验）、pi-mono（迭代摘要）、codex（token-budget 零模型压缩）、Claude Code（auto+microcompact）——**6 仓全员** | 单次结构化调用无会话历史 | **不适用当下**；最佳设计记档（deepseek 9 段+goose lenient），反转触发=引入多轮会话 |
| 秘密脱敏（输出/错误路径） | codex sanitizer（4 正则，亲验）、aider scrub、hermes redact（20+ vendor 前缀）、Claude Code 自动脱敏 | receipt 只存 hash（强）；错误消息含响应体截断 300 字符入 sqlite/日志——理论泄漏面 | **小缺口**（防御纵深，低成本） |
| LLM 判分 self-consistency | gemini-cli llm-judge（N 并行 majority，亲验） | eval/llm-judge.mjs 单次判分；EV1 实测 ±1-2pt 种子方差（靠 3-seed 手工均值）；D-037 已在 rediscovery 边界带 3-vote | **真缺口**（有量化痛点实据） |

### 2.2 FAR-Lab 已领先/已覆盖（无需移植，记档防重做）

验证环完成判定（vs Claude Code）、纠正性重问（vs aider/gemini-cli）、strict-FC 结构化传输（vs opencode generateObject）、不可信数据 fence（vs Claude Code containment）、token 记账 receipt（vs smolagents Monitor）、eval 体系深度（vs opencode/pi-mono 无 eval）、模型目录 models.dev（vs opencode catalog）、Provider 注册 fail-closed（vs 各仓）。

### 2.3 一致判定不适用（灵魂边界/最小架构）

代码即动作（smolagents）、子代理体系（cline/hermes/Claude Code/opencode）、git 检查点（cline）、沙箱执行（codex/hermes/smolagents/OpenHands）、TUI（多数）、hooks/plugin 生态（hermes/opencode/Claude Code）、MCP（cline/opencode/smolagents）、Anthropic prompt caching（aider——DeepSeek 服务端自动缓存已覆盖）。

### 2.4 缓延注册表 B 候选（带反转触发）

- compaction 设计档（deepseek 9 段 + goose lenient + cline 溢出强转）← 触发：多轮会话功能
- Architect-Editor 弱强分工（aider 实测成本-50~70%）← 触发：live 路由恢复+成本数据可得
- repo-map 图排名+二分预算（aider）← 触发：检索池>60（与 ONNX rerank 同触发）
- background-review 方法论沉淀（hermes）+ auto-memory（Claude Code）← 触发：live 路由
- AGENTS.md 层级指令（opencode）/CLAUDE.md 四层（Claude Code）← 触发：运行期用户/项目偏好需求
- 事件 hooks（hermes/opencode）← 触发：真实扩展需求

## 3. Shortlist (EV-ranked, license+security reviewed)

裁定口径：期望值 = 价值 × 当下可执行性（模型路由被 D-036 阻断 → live 验证不可用的项自动降档为注册表 B 缓延，不假装能验证）。灵魂边界/zod-only/最小架构逐项对照。

| # | 候选 | 来源（license） | 期望值 | 决策 | 理由 |
|---|---|---|---|---|---|
| F1 | 重试纪律升级：Retry-After 解析 + 对称抖动指数退避 + 上限 +（配套）receipt 重试计数 | deepseek-harness llm-retry（MIT，厂商自家）+ opencode retry.ts（MIT）+ hermes retry_utils（MIT）；5 仓收敛 | **高** | **GO** | 生产痛点实据（OpenAlex/DeepSeek 429、D-034 独立样本损坏类的重试可见性需求）；厂商官方参数在手（5 次/500ms/10s/±10%）；确定性可测（注入 fetch/sleep） |
| F3 | 错误路径秘密脱敏（输出 redactor） | codex sanitizer.rs（Apache-2.0，4 正则亲验）+ hermes redact（MIT）+ aider scrub（Apache-2.0） | 中 | **GO** | 防御纵深：错误消息含响应体截断 300 字符入 sqlite/日志，理论泄漏面真实；~30 行零依赖；确定性可测 |
| F4 | LLM 判分 self-consistency（N 次中位数 + 离散度披露） | gemini-cli llm-judge.ts（Apache-2.0，亲验）+ D-037 先例（rediscovery 3-vote） | 中 | **GO（诚实标注）** | 量化痛点实据（EV1 判分 ±1-2pt 种子方差）；机制数学平凡（中位数）；默认 N=1 不改现行行为，live 收益 UNVERIFIED 直到路由恢复 |
| R1 | compaction 设计档（deepseek 9 段 + goose lenient/渐进丢弃/装饰器 + cline 溢出强转 + OpenHands forgotten_ids 协议） | 6 仓 | 高（未来） | **DEFER→注册表 B** | FAR-Lab 单次结构化调用无会话历史；反转触发=引入多轮会话功能 |
| R2 | Architect-Editor 弱强模型分工 | aider（Apache-2.0） | 高（未来） | **DEFER→B** | 需 live 多模型路由验证成本假设（-50~70%）；触发=路由恢复+成本数据 |
| R3 | repo-map 图排名+二分预算 | aider | 中 | **DEFER→B** | 池 max 44<60（与 ONNX rerank 同触发，WAVE3 已测） |
| R4 | background-review 方法论沉淀 + auto-memory | hermes + Claude Code docs | 中 | **DEFER→B** | 需 live 模型 |
| R5 | AGENTS.md 层级指令 / 事件 hooks / 权限引擎 / 声明式 provider 注册 | opencode 等 | 低-中 | **REJECT（当下）** | 分别：无运行期指令需求 / 无扩展生态 / 无破坏性操作面 / models.dev 已覆盖（D-033）——均违反最小架构 earn-your-complexity 门 |
| R6 | evidence 全文摘录保尾（head→head+tail） | deepseek-harness pruner（码点计数+固定标记纪律） | 中 | **DEFER→B** | 改动触及 claim 提取语义，live 验证前不动生产路径（灵魂边界+诚实门） |

## 4. Fusion plan (Marginal Value Gate ordering, invariant checks)

执行顺序 F1 → F3 → F4（F1 触及传输核心先做并全量回归；F3 独立纯函数；F4 独立 eval 层）。

**不变量对照**：三项融合均零新运行时依赖（纯 TS 函数，zod-only 保持）；均不触碰 domain/hypothesis/falsification 逻辑（灵魂边界）；均不弱化现有测试（providers.test.ts 全量保留语义，新增行为用新断言）。

**F1 设计**（源码级依据：deepseek-harness `packages/llm/llm/src/retry-policy.ts:14-18` 默认值 + `llm-retry/src/index.ts:66-69` 对称抖动；opencode `packages/opencode/src/session/retry.ts:44-83` Retry-After 三格式解析）：
- providers/http.ts：保持 W1 契约（2 次传输重试、3 次纠正性重问、quota/auth 不重试——审计tested语义不变）
- 新 `backoffDelayMs(attempt, retryAfterHeader?)`：① Retry-After 优先（ms 头 > 秒 > HTTP-date，均 cap 30s）② 否则 1000·2^(n-1) 对称乘性抖动 ±25%（厂商算法 delay×(1−r+2r·rand)），cap 30s
- 失败路径消息过 redactSecrets（并入 F3）
- receipt 增可选 `transportRetries`/`correctiveReasks` 计数（D-034 类损坏的可观测性；向后兼容 optional）
- sources 层不动（openalex 预算-429 不重试是 D-029b 实证纪律；FetchResponseLike 契约变更收益低）

**F3 设计**：`redactSecrets(s)`（codex 4 正则 TS 适配 + Apache-2.0 attribution）：sk-键/AKIA/Bearer/赋值对 → `[REDACTED_SECRET]`；应用于 classifyHttpStatus 消息、malformed-body 消息、invalid_output 的 raw head。

**F4 设计**：eval/llm-judge.mjs 判分聚合纯函数化（`aggregateVotes(runs)`：per-field 中位数 + min/max 离散度），`FARLAB_JUDGE_VOTES`（默认 1）；投票明细入 jsonl（不隐藏分歧——科学诚实）。

## 5. Fusion execution evidence

**F1+F3+F4 EXECUTED 2026-08-22（同会话）**：`evidence/W-H4/fusion-f1-f3-f4.md` — 基线 281/281 → 融合后 **295/295**（+14 测试）、typecheck/lint/build 全 exit 0；F1 退避表（random∈{0,0.5,1} × attempt 1-5）与 Retry-After 优先级实测数字；F3 脱敏语料实测；F4 中位数+spread 聚合单测。诚实边界：F4 live 方差削减 UNVERIFIED（D-036 路由阻断，记 DECISIONS 待办）。

变更文件：`src/providers/http.ts`（backoffDelayMs/parseRetryAfterMs/redactSecrets + runner）、`src/providers/{deepseek,zai,dashscope}.ts`（random seam 透传）、`src/shared/ports.ts` + `src/domain/provenance.ts` + `src/pipeline/llm.ts`（receipt 重试计数透传）、`eval/judge-votes.mjs`（新）、`eval/llm-judge.mjs`（投票制）、`tests/providers.test.ts`（+7）、`tests/judge-votes.test.ts`（新，5）。
