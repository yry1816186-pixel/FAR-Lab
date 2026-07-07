# 23_GAP_AND_OPPORTUNITY.md — 全球坐标系与技术空白

> **来源**：调研优化版 `04_GAP_AND_OPPORTUNITY`，并入本主规划作为「全球竞品空白 / 不可替代点 / 砍功能清单」层。与 `22_DEEP_RESEARCH_REVIEW`、`24_PRODUCT_POSITIONING` 共同构成竞赛差异化论证。

## 1. 现有系统已经做到什么

| 系统 | 已做到 | 对 FAR 的警示 |
|---|---|---|
| Google/DeepMind Co-Scientist | 多智能体科学假设生成、辩论、排序、实验建议 | 不要和大厂比通用 hypothesis generation；要补可信验证 |
| FutureHouse Robin | 面向真实生物医学问题的 hypothesis + experiment + data analysis workflow | 闭环很强，但 proof package/反证/第三方重放仍可作为差异化 |
| Sakana AI Scientist-v2 | end-to-end 研究 idea、实验、论文生成与评审 | 容易被质疑“AI 写论文”；FAR 要做审计层 |
| AlphaEvolve | 自动 evaluator + 演化算法发现/改进算法 | 说明“生成器必须被 evaluator 约束”；FAR 把 evaluator 科研化 |

## 2. 它们还缺什么

- claim-level 的预注册证据契约。
- 对失败、反证、撤回、范围降级的一等记录。
- 面向第三方 reviewer 的独立 proof package。
- 绑定数据/代码/运行/统计/模型调用的可 diff hash。
- 明确拒绝 LLM-as-final-scientific-judge 的裁决边界。
- 可复现标准、provenance 标准和 agent trace 的统一 schema。

## 3. Benchmark 暴露的问题

ScienceAgentBench、CORE-Bench、MLR-Bench、SocSci-Repro-Bench 的共同信号是：当前科研 agent 的瓶颈不是“不会生成”，而是“生成后的实验、代码、复现、统计、结果宣称、失败处理、污染控制不够可靠”。其中 MLR-Bench 报告 coding agents 在大量 cases 中产生 fabricated/invalid experimental results，这直接支持 FAR 的 anti-theater 定位。

## 4. 最大短板判断

当前 AI Scientist 最大短板不是生成能力，而是：

1. 可验证性不足；
2. 可复现性不足；
3. 证据绑定不足；
4. 失败与反证记录不足；
5. provenance 与 trace 不足；
6. 统计/因果边界不足；
7. 对第三方 reviewer 不友好。

## 5. 本项目不可替代点

**把 AI Scientist 的每个科研 claim 编译成 proof-carrying research object，并允许第三方机器验证、重放、篡改检测和降级。**

## 6. 评委应该记住的一句话

**我们不是让 AI 更会“说科学”，而是让 AI 说出的科学结论必须能被别人复查、重跑、反驳和撤回。**

## 7. 开源社区为什么会用

- AI4S 团队可用 `.far-proof` 附带审计证据。
- Agent 框架可把 FAR 当 reliability harness。
- Reproducibility 社区可用 schema/validator 评测 AI 科研 claim。
- Benchmark 作者可用 anti-theater fixtures 测 agent 是否伪造结果。
- 科研数据中心可用 proof package 连接数据、代码、运行和结论。

## 8. 应该砍掉的高级功能

| 功能 | 原因 | 处理 |
|---|---|---|
| 多学科全自动科研 OS | 过大，难验证 | 删除主线，路线图概念 |
| 大规模 GPU 自动实验 | 成本高，比赛早期不必要 | `NEEDS_GPU_VALIDATION` 长期 |
| 公网透明日志服务 | 运维/安全/合规重 | 先本地 Merkle root，外部 anchoring 路线图 |
| 完整 Lean/Dafny 形式化 | 成本高 | 只保留状态机不变式/少量 property tests |
| 完整 MCP marketplace | 偏离主线 | 只做 MCP provenance/security adapter |
| 自动论文发表/审稿系统 | 容易撞 AI Scientist-v2 | 不做主线 |
| 生产级多租户 SaaS | 偏工程部署 | 不做比赛 MVP |

## 9. 难但必须保留的最小可见版本

- FEC mandatory path。
- Deterministic five-value verdict。
- `.far-proof` manifest + validator。
- Evidence ledger + proofHash + tamper diff。
- Anti-theater attack fixtures。
- TESS hero demo offline fixture +真实环境验证计划。
- Qwen/DashScope competition provider profile。
- Local Agent tasks + red-line checks。

## 10. 必须降级到路线图的内容

- 外部 validator 全覆盖。
- GPU/large-scale benchmark。
- 多语言 verifier（Rust/Go/WASM）。
- 全自动多 agent discovery。
- 多租户 cloud service。
- 完整形式化证明。

## 11. 来源

- **Google Research / Nature: AI co-scientist**：<https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/>
- **FutureHouse Robin multi-agent scientific discovery**：<https://www.futurehouse.org/research/demonstrating-end-to-end-scientific-discovery-with-robin-a-multi-agent-system>
- **Sakana AI Scientist-v2**：<https://github.com/SakanaAI/AI-Scientist-v2>
- **DeepMind AlphaEvolve**：<https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/>
- **ScienceAgentBench**：<https://osu-nlp-group.github.io/ScienceAgentBench/>
- **CORE-Bench**：<https://crab.cs.princeton.edu/core-website/>
- **MLR-Bench**：<https://arxiv.org/abs/2605.04677>
- **SocSci-Repro-Bench**：<https://github.com/malizad/SocSci-Repro-Bench>
