# 20_COMPETITION_FACT_BASELINE.md — 项目事实基线与诚实边界

> **来源**：本文件来自调研优化版（post-research optimization）的 `01_PROJECT_FACT_BASELINE`，并入本主规划作为「竞赛事实基线与外部来源」层。工程实现状态以 `01_SOURCE_OF_TRUTH_AND_STATUS.md` 与 `far status --json` 为最终权威；本文件的外部比赛/API/标准事实以官方资料为准。

## 1. 当前真实名称

- 当前中文项目品牌：**真研 FAR-Lab**。
- 推荐对外统一口径：**真研 FAR-Lab：FAR-Chain 可证伪科研证据链运行时**。
- 推荐英文副标题：**FAR-Chain: a Proof-Carrying AI Scientist Runtime for Falsifiable Research**。

## 2. 备选名称

| 名称 | 优点 | 风险 | 建议 |
|---|---|---|---|
| FAR-Chain | 与当前文件一致；证据链感强 | 需解释 FAR | 保留核心名 |
| 真研 FAR-Lab | 中文记忆点强；强调“真”与科研 | 不够国际化 | 做中文品牌 |
| Proof-Carrying AI Scientist Runtime | 国际表达强 | 太长 | 做副标题 |
| Scientific Agent Integrity Layer | 准确但偏底层 | 不够比赛故事化 | 论文/技术报告用 |
| Falsifiability-Anchored Research OS | 气势强 | OS 化过度 | 降级为理念，不做产品名 |

## 3. 当前项目目标

项目要解决的问题不是“让大模型写更多科研想法”，而是：大模型生成或参与的科研 claim、假设、证据、数据、代码、实验计划、统计检验、反证路径、结论、失败记录和修订历史，如何被结构化绑定、审计、重放、导出、验证、证伪与降级。

## 4. 当前比赛目标

面向 2026 挑战杯/阿里云揭榜挂帅 XH-202619“基于国产开源大模型的 AI Scientist 的研发与应用”。官方资料强调使用阿里云 AI 大模型与产品能力，结合具体学科问题、真实科学数据、可验证研究假设、实验任务规划、数据分析与反馈迭代。项目最适配的路线是：**科研问题方向 + 天文公开数据场景 + AI Scientist 可信验证层**。

## 5. 当前技术路线

```text
User / Scientific question
  -> Claim extraction
  -> Scientific IR / FEC compilation
  -> dataset/source/code binding
  -> experiment plan freeze
  -> measurement or imported result
  -> statistical/causal/integrity checks
  -> deterministic five-value verdict
  -> evidence ledger + trace spans
  -> ProofEnvelope + .far-proof package
  -> verifier / replay / audit report
```

## 6. 当前系统模块基线

| 模块 | 当前状态判断 | 诚实边界 |
|---|---|---|
| FEC / Evidence Contract | 设计成熟，当前包称部分实现 | `NEEDS_REPO_VALIDATION` |
| 五值 verdict | 语义锁定 | deterministic kernel 需实际测试证明 |
| Canonical hash / proofHash | 设计详细，包内称 TS/Python/Browser 实现 | 上传内容无源码，需重跑 golden |
| Evidence ledger / Merkle root | 设计详细 | 需验证 leaf 是否绑定 payload/evidence/verdict |
| `.far-proof` bundle | 设计详细，V1/V2 迁移中 | 外部标准导出需 validator |
| Anti-Theater Harness | 核心设计强 | 需真实 attack fixtures 通过 |
| Web cockpit | 包内称实现痕迹 | UI 需真实打开验证 |
| Qwen/DashScope profile | 设计方向正确 | `NEEDS_API_VALIDATION` |
| TESS hero demo | 比赛适配强 | `NEEDS_REAL_ENV` |
| Benchmark runner | 设计强 | 真实 benchmark 需构造与运行 |

> **本主规划的状态纪律调和（见 README §状态纪律）**：本表的 `NEEDS_REPO_VALIDATION` 来源于调研版当时只拿到文档、未见到源码仓库的判断；在本主规划所处的真实仓库（含 `src/` `tests/` `packages/`）中，工程实现状态以 `01_SOURCE_OF_TRUTH_AND_STATUS.md` + `far status --json` 为权威——后者更准确。任何 `IMPLEMENTED_VERIFIED` 都可通过在仓库中运行 `far status --json` 复核。

## 7. 已有设计

- 五值 verdict：`CONFIRMED`、`REFUTED`、`INCONCLUSIVE`、`DEGRADED_SCOPE`、`UNTESTED`；禁第六值。
- 裁决优先级：`DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`，且 `CONFIRMED` 只表示 bounded support。
- FEC：先冻结可证伪证据契约，再采集/绑定证据，防止 HARKing 与事后改阈值。
- ProofEnvelope / proofHash / canonicalHash：绑定 verdict-critical 字段，任一关键字段改动会导致验证失败。
- Anti-Theater Harness：捕获 label-only evidence、LLM override、post-hoc threshold、dataset drift、scope laundering、missing raw artifact、metric swapping、seed cherry-picking、workflow digest mismatch、natural-language verdict mismatch 等攻击。
- Open Science Fusion：面向 RO-Crate、Workflow Run RO-Crate、W3C PROV、OpenTelemetry trace 的导出路线。

## 8. 当前已实现内容

> 详见 `01_SOURCE_OF_TRUTH_AND_STATUS.md` 与 `10_DEV_ENTRYPOINT.md` 的 P0 工程闭环。本节保留调研视角的「诚实边界」表述：调研版生成时未亲自核验源码，故对「已实现」持保守口径；真实仓库中的实际状态以 `far status --json` 为准。

## 9. 未实现但计划实现内容

- SciIR v2 schema 与 JSON Schema validator。
- 必须绑定 FEC 的 deterministic verdict kernel。
- `.far-proof` validator/replay/diff report。
- Qwen/DashScope competition profile 的真实 API smoke test。
- TESS/Lightkurve/MAST 数据 resolver 与 offline fixture 分离。
- Proof package 的 PROV-O/RO-Crate/WRROC 导出适配。
- ProbeAtlas / FAR-Bench / MiniBench。
- Web Cockpit 的审计 UI 与 demo script。

## 10. 只是愿景的内容

- 完全自主 AI Scientist 闭环发现新科学。
- 大规模 GPU 自动实验。
- 多学科通用科研 OS。
- 完整形式化验证所有业务逻辑。
- 生产级分布式数据库、云部署和多租户安全。
- 第三方透明日志长期托管。

这些内容可进入长期路线图，不得写入 MVP 承诺。

## 11. 模型与 provider 基线

- Core 必须模型中立：OpenAI-compatible、local LLM、Qwen/DashScope、未来 provider 均通过 Provider Gateway 接入。
- Competition Profile 必须明确支持阿里云百炼/DashScope/Qwen，且 API key 只通过环境变量或本地 secret profile 传入。
- 不得把 cached/offline fixture 冒充真实 Qwen API 成功。
- Qwen 模型名、可用区域、base URL、WorkspaceId 等必须以官方文档和真实账户为准，标 `NEEDS_API_VALIDATION`。

## 12. 数据来源基线

- 主 demo 推荐：TESS/MAST 光变曲线 + Lightkurve 本地分析 + ADS 文献锚点。
- 备选：文献 claim + dataset snapshot + code artifact + proof package verification。
- 所有外部数据下载与 API 访问标 `NEEDS_REAL_ENV` 或 `NEEDS_API_VALIDATION`。

## 13. 证据链设计基线

证据链不是“把聊天记录存下来”，而是把 `Claim -> FEC -> DatasetSnapshot -> CodeArtifact -> ExperimentPlan -> RunRecord -> ResultRecord -> StatisticalTestPlan -> VerdictNode -> ProofEnvelope` 形成可 hash、可追踪、可导出、可重放、可 diff 的结构化链。

## 14. 评测设计基线

MVP 评测必须先覆盖：schema validation、canonical hash stability、proof package validation、verdict kernel golden vectors、anti-theater attack fixtures、source anchor validity、trace completeness。科学任务指标只能作为 demo/benchmark，不可替代工程可靠性评测。

## 15. 当前最强亮点

1. 从“生成科学”转向“可证伪、篡改可检测、可独立复算的 AI 科研证据链”。
2. 五值 deterministic verdict 使不确定、失败、降级成为一等公民。
3. `.far-proof` 把 claim、证据、代码、数据、运行、trace、hash、verdict 打成第三方可查包。
4. Anti-Theater Harness 直接攻击 AI Scientist 常见伪科研路径。
5. 与比赛 TESS/AI4S/阿里云 Qwen profile 可形成清晰闭环。

## 16. 当前最大漏洞

- TESS demo 如果没有真实数据重放，容易被评委质疑为剧本。
- Qwen/百炼 profile 如果只写适配不真实验证，无法满足赛题“使用阿里云 AI 大模型及产品能力”。
- `.far-proof` 若不能用最小 verifier 在现场展示篡改失败，核心价值会变弱。
- 设计复杂度高，若不收敛 MVP，容易成为巨兽文档。

> 「上传文件中没有源码与测试」这一条来自调研版当时的 workspace 状态；在本主规划所处的真实仓库中不成立——以 `far status --json` 为准。

## 17. 不能对外宣称已完成的内容

- 已完成端到端真实 AI Scientist。
- 已发现新天文现象/新行星/新 flare 规律。
- 已真实接入并验证某个 Qwen 具体模型（未做真实 API smoke 前）。
- 已通过官方比赛平台测试。
- 已完成 GPU benchmark。
- 已通过外部 RO-Crate/WRROC/PROV validator。
- 已实现生产级安全、多租户、权限隔离。
- 已形式化证明系统正确。
- 已经比 Co-Scientist/Robin/AI-Scientist-v2 更强。

## 18. 来源

- **阿里云天池/挑战杯揭榜挂帅 XH-202619 官方赛题页**：赛题、赛道、时间、必须使用阿里云 AI 大模型及产品、TESS/科学数据方向约束。<https://university.aliyun.com/action/tzbjbgs2026>
- **国家天文科学数据中心 XH-202619 赛题说明**：赛题合作方、AI4S 场景、TESS/天文知识图谱等数据场景。<https://nadc.china-vo.org/article/20250606145916>
- **Alibaba Cloud Model Studio: OpenAI compatibility of DashScope**：Qwen/DashScope OpenAI-compatible provider profile。<https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope>
- **Alibaba Cloud Model Studio: First API call to Qwen**：API key、WorkspaceId、环境变量安全与调用约束。<https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen>
- **MAST TESS mission archive**：TESS light curve/TPF/FFI public data。<https://archive.stsci.edu/missions-and-data/tess>
- **Lightkurve**：Kepler/TESS light curve analysis。<https://lightkurve.github.io/lightkurve/>
- **W3C PROV-O**：Entity/Activity/Agent/wasGeneratedBy/used 映射。<https://www.w3.org/TR/prov-o/>
- **RO-Crate specification**：开放科学研究对象打包。<https://www.researchobject.org/ro-crate/specification>
- **Workflow Run RO-Crate**：workflow run provenance 打包。<https://www.researchobject.org/workflow-run-crate/>
