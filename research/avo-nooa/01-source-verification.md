# NOOA 源码核验与 Windows 适配报告 (2026-08-24)

## 源身份验证 (全部 FACT, 一手来源)

| 项 | 结果 |
|---|---|
| arXiv:2603.24517 | ✅ AVO 论文, 2026-03-25, NVIDIA (Terry Chen, Zhifan Ye 等共同一作; Vinod Grover/Luis Ceze/Ming-Yu Liu/Humphrey Shi 在列) |
| NVIDIA 官方博客 | ✅ developer.nvidia.com/blog/nvidia-avo-reaches-100-on-arc-agi-3... (Aug 21, 2026) |
| NOOA repo | ✅ **NVIDIA-NeMo/labs-OO-Agents** (指令中 "NVIDIA-labs" 是论文名; GitHub 实际在 NVIDIA-NeMo org 下; `NVIDIA/labs-OO-Agents` 与 `NVIDIA-labs` org 均不存在) |
| arXiv:2607.20709 | ✅ "NVIDIA-labs OO Agents: Native Python Object-Oriented Agents", 2026-07-22 |
| License | Apache-2.0 (LICENSE 文件 + pyproject 双重确认; GitHub API 显示 NOASSERTION 是文件头格式导致) |
| 固定版本 | HEAD = 97f52dec84ed88ca3b202f91bee0bc0074626246 (2026-08-21), clone 于 .cache/nooa |

## AVO 论文核心机制 (源码/全文级)

- `Vary(P_t) = Agent(P_t, K, f)`: 整个 variation operator 变成自主 agent run, agent 全权决定 consult 什么/edit 什么/何时 evaluate。Sample+Generate+Evaluate 被吸收进单一循环。
- Lineage P_t = {(x_i, f(x_i))} 全量 solution+score 历史; f 是 n 维向量 (正确性一票否决: fail→score=0); K = 领域知识库。
- 提交纪律: 只有通过 correctness 且 ≥ best-so-far 才 commit 进 lineage; 失败尝试留在 agent 内部 trajectory (不删证据但不污染 committed lineage)。
- Supervisor: 监控两类失败模式 — stall (探索线耗尽) / unproductive cycles (反复 edit 无改进)。触发后 review 整体 evolutionary trajectory 并重定向到候选方向。7 天 run 中主 agent 决定何时新优化/回访历史/换策略, supervisor 在 plateau 时维持前进。
- 结果: 40 committed versions / 500+ 内部探索方向 / 7 天; MHA causal 最高 +10.5% vs FA4; GQA 迁移 30 分钟自适应完成 (+9.3% vs FA4)。收益模式: 离散跳跃(v8/13/20/30/33 架构拐点)+平台期, 前 20 版贡献最大绝对增益。
- 重要诚实声明(论文自己写的): ARC-AGI-3 100.00 RHAE 不是 controlled ablation; 与 VISTA 差异混杂 agent backend/observation/memory 等多因素。

## NOOA 框架架构事实 (源码级, 97f52de)

- 核心: `Agent` 基类 (metaclass=AgentMeta); 字段=typed state, 方法=capability, docstring=prompt, `...` 体=LLM agentic loop, 实体=deterministic Python。
- CodeAct strategy (`strategies/codeact.py`): LLM 写 Python 在持久 REPL 执行, `execute_python` tool + structured output 收敛; 引用 Wang et al. Executable Code Actions。
- Sandbox (`runtime/sandbox/`): **Linux-only** (Landlock filesystem + seccomp network + rlimit), parent-side worker 进程, timeout/CPU kill 后重启 worker, REPL namespace 持久。代码自述: AST validators 是 guardrails NOT security boundary, 真正边界是 OS-level isolation。
- Context blocks: static protected (system_prompt/self 可缓存前缀) + dynamic protected (state 每turn 重估) + user blocks; XML/Markdown formatter; provider-specific formatter (OpenAI/Anthropic/Responses)。
- Events: append-only typed events, tags ("1","2"...), EventQuery API (type/tag/text/call_id 过滤, regex), summary range tags ("1..22") 折叠。ATIF v1.7 trajectory export (OTel 解耦)。
- Storage: StorageManager Protocol (EventBackend + snapshot save/restore), SQLite 内置 (fcntl 文件锁), InMemory 默认。snapshot 支持 __nosnapshot__ 标记。
- Memory 包 (nooa-memory): recall/remember/reflect + embeddings + forgetting + reflection, 独立 optional 包。
- Strategies 家族: codeact / codeact_lite / reflexion / predict / prefill / pure_python / composite / template。
- MCP: stdio/SSE/streamable-http client + OAuth + MCPManager/MCPTool。
- litellm>=1.84.0 强制 (注释记录: 1.82.7/1.82.8 有 2026-03 backdoor 被 yank, CVE-2026-49468 proxy RCE fixed in 1.84.0)。
- **框架内无 supervisor 实现** (grep 零命中): supervisor 属于 AVO 论文层概念, NOOA 是 harness 底座。

## 测试运行结果 (Windows, 本机真实执行)

- 环境: uv sync --group dev, CPython 3.13.10 venv
- Windows 兼容补丁 (本地 .cache, 不上游提交): sqlite.py fcntl→try/except no-op; debug_handler.py SIGUSR2→hasattr guard
- 核心套件 GREEN: tests/core_runtime + tests/storage + codeact strategies = **483 passed**
- 全套件: 6328 passed / 157 failed / 65 errors — 失败分解后:
  - tests/tools (~140): bash session 工具依赖 pass_fds/getpgid/killpg/PTY 行为 → **POSIX-only, 平台限制非缺陷**
  - sandbox 测试: resource module 不存在 → Linux-only by design
  - 其余 ~15: SQLite session locking (fcntl no-op 后果), journal exporter (posix import 断言), license-header test (tempdir .git 结构), producers (killpg)
  - 结论: **除 fcntl-degradation 相关的 SQLite locking 外, 全部失败均为 POSIX-specific 功能在 Windows 的预期不可用**, 核心框架 (typed object/CodeAct/context/events/storage/strategies) 在 Windows 完整可用。

## 对 FAR-Lab 的直接含义

1. NOOA 可以作为 Python Scientific Agent Runtime 的真实基底 (Apache-2.0, 官方, 活跃, 测试覆盖充分)。
2. AVO 的 supervisor 必须自建 (NOOA 没有) — 但事件流/trajectory 导出 (ATIF/event_query) 已给 supervisor 提供了观测面。
3. NOOA 的 committed-lineage 纪律与 FAR-Lab 的 evidence/provenance 不变量天然对齐; FAR-Lab 需要扩展的是"负结果也必须保存"(AVO 只 commit 改进, FAR-Lab 科学语义要求 null result 入库)。
4. Windows 开发环境可用 (sandbox 层除外); EEL 生产执行目标是 Docker/Linux, sandbox 能力在生产路径可用。
5. 供应链注意: 若 vendor, litellm 版本下限 1.84.0 必须保留。
