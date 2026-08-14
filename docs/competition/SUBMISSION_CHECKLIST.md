# FAR-Lab 赛道一·方向一·A 提交清单与验收矩阵

> 题目：XH-202619 · 赛道一·方向 1·A（科学假设生成与研究计划设计）
> 提交截止：2026-09-05 · 初审：2026-09-20 · 决赛：2026-11
> 官方要求（2026-08-13 从官网核实）：技术方案文档 PDF ≤20 页 + 可选可交互前端 + 演示视频 ≤10 分钟；基座模型必须 Qwen 系列（阿里云百炼调用）。

## 1. 交付物清单

| # | 交付物 | 载体 | 状态（2026-08-14） |
|---|--------|------|---------------------|
| 1 | 源码仓库 | `github.com/yry1816186-pixel/FAR-Lab`，main 分支（PR #23/#24/#25/#26 已合并） | ✅ 已合并推送 |
| 2 | 技术方案文档（PDF ≤20 页） | `docs/competition/TECHNICAL_PROPOSAL.md` → 导出 PDF（≈6 页） | ✅ 已生成（仓库外 artifact） |
| 3 | 可交互前端 | `/research` 科研工作台（Track-1A 七项主流程，全 API 驱动） | ✅ 已实现（27 files / 262 tests / build 0） |
| 4 | 演示视频（≤10 分钟） | `docs/competition/DEMO_SCRIPT.md` 逐屏脚本 → 录制 | 🟡 脚本已备·**录制需人工** |
| 5 | live 演示证据 | **live Qwen + live 检索 + live 数据全部实测**（runId `01KZZ74P2YEEN0BTBD1V4KK9PD`） | ✅ 全 live 闭环 |

## 2. 验收矩阵（协议 §18）

> 逐项标注：✅ 已实现并有证据 / 🟡 已实现待 live 验证 / ⏸ 待做。证据=命令输出+测试名，无证据不标 ✅。

### 2.1 科研闭环（初赛核心：闭环链条完整、计划可执行、假设生成有证据支撑）

| 验收项 | 状态 | 证据 |
|--------|------|------|
| 科学问题 → 研究可行性门（§9.1） | ✅ | `far research start "write a poem"` → exit 3 拒绝；危险化学方向被安全筛查拦截（tests/research/researchability_gate.test.ts 10 tests） |
| 至少两个真实文献来源（§9.3） | ✅ | **live 实测** openalex+crossref 合并 50 文档语料（runId 同上）；arxiv 适配器在 |
| 支持性证据 + 反证 + 分解子问题检索 | ✅ | `counterEvidenceQueryCount=8`（live evaluate 实测）；grounding.ts extraQueries |
| 3-5 个机制不同的候选假设 | ✅ | `distinctHypothesisIdCount=3`（内容寻址 id，live evaluate 实测） |
| 引用绑定（文献身份真实性） | ✅ | **live 实测** `citationBindingRate=1.0 / unboundEvidenceCount=0`（evaluate + verify 双重） |
| 独立批判 + 确定性评分 + Pareto | ✅ | 确定性维度 + Pareto 标记（live research verify PASS） |
| 可执行研究计划（DAG/统计方法/停止条件/人工批准门） | ✅ | `planCompleteness=1.0`；`humanApprovalGateCount=5`（live） |
| 反馈 → 修订 → 版本比较 | ✅ | live 人工反馈 → 修订 #2 真实计划改写 + compare 结构化 diff |
| 真实数据分析真实影响下一轮 | ✅ | **live 实测**：NASA TAP n=392 r=0.587 p<0.001 CI[0.518,0.649] → Observation → 修订 |
| null/失败/平台期如实保留 | ✅ | analyze FAILED/PARTIAL 状态机 + interpretObservation 三分支（tests/research/experiment.test.ts） |
| 多轮迭代成效逐步提升 | ✅ | 修订链 #1→#2 可比较可回滚；不强制单调提升（诚实 note 在 compare 输出） |

### 2.2 可信与复现（技术深度 30%：结果校验反馈迭代稳定性）

| 验收项 | 状态 | 证据 |
|--------|------|------|
| 运行模式诚实标注（聚合+逐组件） | ✅ | runMode 横幅（CLI/API/前端三处）；live run runMode=LIVE 逐组件可见 |
| 逐阶段 ProvenanceReceipt（§3.3） | ✅ | 10 条收据/run；**live 实测 receiptCompleteness=1.0**；provider 未提供字段=null+partial |
| 环境指纹（git commit/工作树/锁文件） | ✅ | `environment.gitCommit/dirty/lockfileHash`（live 落盘） |
| 确定性重算（第三方可复算） | ✅ | live `far research verify` PASS：rootHash/绑定/确定性维度/Pareto/主假设/两门全部重算匹配 |
| 导出包 + 篡改检测 | ✅ | live export → 独立 verify.mjs INTEGRITY PASS → 确定性重算 PASS |
| 程序化评估指标（非手工） | ✅ | 13 指标脚本计算（live 实测 citationBindingRate=1.0 等） |
| 四类公平基线 | ✅ | **live 实测**（同 key 同问题全 LIVE）：direct 6 假设 / rag 5+14 文档 / no_kernel 4 / **full 3+37 文档+binding 1.00+unbound 0+内核 yes** |

### 2.3 应用潜力（30%：真实场景价值/演示交互交付/可复现性）

| 验收项 | 状态 | 证据 |
|--------|------|------|
| Science-125 问题面向 | ✅ | 冻结评估集 6 项（5 个 Science-125 真实问题 + 1 hero）；demo_seeds 30 个 Science-125 问题 |
| 多入口（CLI/API/Web）共享同一 application service | ✅ | `applyFeedbackToRun` 单一服务；CLI+API 复用（tests/api/research.test.ts 6 tests） |
| 权威真实数据集 + Dataset Card | ✅ | NASA Exoplanet Archive TAP（public domain）+ 完整 DatasetCard（live rawChecksum/curl 复现命令） |
| fresh-clone 可复现 | ✅ | 无 key 全链路跑通 + full suite 2625（2619p/0f/6s）+ CI 全绿 |

## 3. 剩余差距（提交截止前必须完成）
1. **演示视频录制**（≤10 分钟）：脚本已备（DEMO_SCRIPT.md），录制需人工操作
2. **比赛系统提交**：按协议不自动提交（需人工在官网提交入口完成，入口上线中）
3. 盲评 rubric（§14.4）：需真人领域专家执行，非阻断
