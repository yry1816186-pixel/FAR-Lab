# FAR-Lab 赛道一·方向一·A 提交清单与验收矩阵

> 题目：XH-202619 · 赛道一·方向 1·A（科学假设生成与研究计划设计）
> 提交截止：2026-09-05 · 初审：2026-09-20 · 决赛：2026-11
> 官方要求（2026-08-13 从官网核实）：技术方案文档 PDF ≤20 页 + 可选可交互前端 + 演示视频 ≤10 分钟；基座模型必须 Qwen 系列（阿里云百炼调用）。

## 1. 交付物清单

| # | 交付物 | 载体 | 状态（2026-08-13） |
|---|--------|------|---------------------|
| 1 | 源码仓库 | `github.com/yry1816186-pixel/FAR-Lab`，分支 `agent/track-1a`（集成主线） | ✅ 已推送（12 commits 领先 main） |
| 2 | 技术方案文档（PDF ≤20 页） | 本文档系（`docs/competition/TECHNICAL_PROPOSAL.md`）→ 导出 PDF | 🟡 骨架待写（本节） |
| 3 | 可交互前端 | `/research` 科研工作台（Track-1A 七项主流程，全 API 驱动） | ✅ 已实现（27 files / 262 tests / build 0） |
| 4 | 演示视频（≤10 分钟） | `docs/competition/DEMO_SCRIPT.md` 逐屏脚本 → 录制 | 🟡 脚本待写 |
| 5 | live 演示证据 | 检索 live + NASA 数据 live + （Qwen live 待 key 轮换后补充） | 🟡 部分 live 实测完成 |

## 2. 验收矩阵（协议 §18）

> 逐项标注：✅ 已实现并有证据 / 🟡 已实现待 live 验证 / ⏸ 待做。证据=命令输出+测试名，无证据不标 ✅。

### 2.1 科研闭环（初赛核心：闭环链条完整、计划可执行、假设生成有证据支撑）

| 验收项 | 状态 | 证据 |
|--------|------|------|
| 科学问题 → 研究可行性门（§9.1） | ✅ | `far research start "write a poem"` → exit 3 拒绝；危险化学方向被安全筛查拦截（tests/research/researchability_gate.test.ts 10 tests） |
| 至少两个真实文献来源（§9.3） | ✅ | OpenAlex live 实测（13 文档+5 反证查询）；arXiv/Crossref 适配器在（未 live 冒烟） |
| 支持性证据 + 反证 + 分解子问题检索 | ✅ | `counterEvidenceQueryCount=8`（evaluate 实测）；grounding.ts extraQueries |
| 3-5 个机制不同的候选假设 | ✅ | `distinctHypothesisIdCount=3`（内容寻址 id，evaluate 实测） |
| 引用绑定（文献身份真实性） | ✅ | `citationBindingRate=1.0 / unboundEvidenceCount=0`（evaluate + verify 双重实测） |
| 独立批判 + 确定性评分 + Pareto | ✅ | 确定性维度（Falsifiability/Testability/EvidenceCoverage 等）+ Pareto 标记（research verify PASS） |
| 可执行研究计划（DAG/统计方法/停止条件/人工批准门） | ✅ | `planCompleteness=1.0`；`humanApprovalGateCount=1` |
| 反馈 → 修订 → 版本比较 | ✅ | `far research feedback` + `compare`（冻结 before/after 计划快照结构化 diff） |
| 真实数据分析真实影响下一轮 | ✅ | `far research analyze --live`：NASA TAP n=392 r=0.587 p<0.001 → Observation → 反馈 → 修订（live 实测） |
| null/失败/平台期如实保留 | ✅ | analyze FAILED/PARTIAL 状态机 + interpretObservation 三分支（tests/research/experiment.test.ts） |
| 多轮迭代成效逐步提升 | 🟡 | 机制已备（revisions 不可变、比较可回滚引用）；"逐步提升"需要多轮 live Qwen 运行验证（待 key） |

### 2.2 可信与复现（技术深度 30%：结果校验反馈迭代稳定性）

| 验收项 | 状态 | 证据 |
|--------|------|------|
| 运行模式诚实标注（聚合+逐组件） | ✅ | runMode 横幅（CLI/API/前端三处）；MIXED/RECORDED_REPLAY 不伪装 live |
| 逐阶段 ProvenanceReceipt（§3.3） | ✅ | 9 条收据/run；provider 未提供字段=null+partial（tests/research/provenance.test.ts） |
| 环境指纹（git commit/工作树/锁文件） | ✅ | `environment.gitCommit/dirty/lockfileHash`（实测落盘） |
| 确定性重算（第三方可复算） | ✅ | `far research verify`：corpus rootHash/绑定/确定性维度/Pareto/主假设全部重算匹配 |
| 导出包 + 篡改检测 | ✅ | `far research export` + 独立 verify.mjs + 篡改 exit 7（tests/research/export_bundle.test.ts 4 tests） |
| 程序化评估指标（非手工） | ✅ | 13 指标脚本计算 + 人工 rubric 明确列出不自动打分（evaluate 实测） |
| 四类公平基线 | 🟡 | harness 完成（tests/research/baseline.test.ts）；live 对比待 key |

### 2.3 应用潜力（30%：真实场景价值/演示交互交付/可复现性）

| 验收项 | 状态 | 证据 |
|--------|------|------|
| Science-125 问题面向 | ✅ | 冻结评估集 6 项（5 个 Science-125 真实问题 + 1 hero）；demo_seeds 30 个 Science-125 问题 |
| 多入口（CLI/API/Web）共享同一 application service | ✅ | `applyFeedbackToRun` 单一服务；CLI+API 复用（tests/api/research.test.ts 6 tests） |
| 权威真实数据集 + Dataset Card | ✅ | NASA Exoplanet Archive TAP（public domain）+ 完整 DatasetCard（来源/版本/license/校验/允许推断边界） |
| fresh-clone 可复现 | ✅ | 无 key 全链路跑通（offline_replay + 真实样本 replay + live 检索/数据免费）；full suite 2618 |

## 3. 剩余差距（提交截止前必须完成）

1. **技术方案 PDF**（≤20 页）：`docs/competition/TECHNICAL_PROPOSAL.md` → 导出
2. **演示视频**（≤10 分钟）：`docs/competition/DEMO_SCRIPT.md` → 录制（离线部分可立即录；live Qwen 部分待 key）
3. **live Qwen 冒烟 + live 四基线对比**：待用户轮换 key 后补录（`far research start --profile competition_aliyun_qwen` + `far research baseline`）
4. main 合并：`agent/track-1a` → main（PR 创建/合并属 P4，已获授权，择机执行）
5. CI 最终全量：合并后 GitHub Actions 跑绿截图

## 4. 安全红线（提交材料自检）

- [ ] 无 secret 明文（key 引用一律 env 名；`far doctor` 不读值）
- [ ] 无伪造绿（所有 badge/数字指向真实 workflow/实测）
- [ ] demo 视频中的 live 证据标注真实日期与命令输出
- [ ] 技术方案中的"已验证"全部可回溯到命令输出/测试名

