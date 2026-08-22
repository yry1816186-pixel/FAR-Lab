# final_delivery.md — FAR-Lab 赛道一方向 1A 正式开发交付报告

> 生成时间：2026-08-21（R1 施工与验收）｜**增补 2026-08-22（EV1→Wave-3 演进，见 §六/§七）**
> 任务书：`FAR-LAB_DEVELOPMENT_MISSION.md`（98 节总指令）｜规划：`task_plan.md`
> R1 代码基线：branch `build/far-lab-r1`，提交 `1b0e622`，测试 194/194；**当前基线：branch `build/ev2-closeout`（R1 已合入 main），测试 274/274，完成门禁 NOT_READY——唯一失败项为外部余额阻塞（§七）**

---

## 一、task_plan.md 执行情况

| Wave | 规划目标 | 实际结果 | 关键证据 |
| --- | --- | --- | --- |
| W0 | 地基 + 三 spike + 领域 schema + 决策落盘 | ✅ 全部完成 | `evidence/W0/{sqlite,model,source}-spike-report.md`；决策 D-010..D-014；B-HARNESS-RUNTIME 以本会话真实 hook/skill 加载证据关闭 |
| W1 | 第一条真实 Direction-A 纵向切片 | ✅ 真实问题端到端 live 完成（含真实失败→断点恢复） | `evidence/W1/`（377 行研究报告 + bundle + 3 次 resume 记录） |
| W2 | 反馈/因果修订/检查器/故障恢复 | ✅ 真实专家批评→假设 v0→v1 + 计划修订 + 版本差异；跨进程 cancel→resume；损坏检查点 fail-closed 测试 | `evidence/W2/`（修订因果链报告 + cancel/resume 演示）；`tests/recovery.test.ts` |
| W3 | HTTP API + Web 工作台 + GUI 实测 | ✅ 33 项 API 测试 + React 工作台 + 真实浏览器走查（含 UI 内新建 run 实时推进） | `evidence/W3/gui-*.png`；commit 8acdf50 |
| W4 | 问题集/强基线/指标/性能/安全 | ✅ 6 题问题集（修复后 6/6 完成）vs direct/RAG 基线；安全审计 0 P0/0 P1 | `evidence/W4/{evaluation-report,security-audit}.md` + `eval/` |
| W5 | 复现演练/独立审计/Frontier Sweep/交付 | ✅ 双独立审计 + 全部 P1/P2 修复 + gap-seek（任务书§30）live 双路径验证 + Frontier SATURATED | `evidence/W5/`（adversarial-audit / scientific-review / frontier-sweep） |

规划外完成（主动补齐）：任务书§30 有界自适应信息寻求（GO-1）、反证检索结构性修复（双查询+排序保护）、证伪阈值来源披露门禁、novelty 语料相对性披露、证据上限声明、评分批处理防截断、诚实弃权报告横幅、安全 P2 双修复（Host/Origin/Content-Type 守卫 + 不可信数据 prompt 围栏）。

## 二、全部验收结果（20/20 达标，19 live_verified + 1 tested）

| ID | 状态 | 证据摘要（完整指针见 `.control/ACCEPTANCE_STATUS.json`） |
| --- | --- | --- |
| ACC-01 范围锁定 | live_verified | 8 个真实 run 全部执行 Direction-A 闭环，零产品漂移 |
| ACC-02 官方模型路由 | live_verified | DeepSeek（国产开源模型）live 生产路径，236+ 次结构化调用 executionMode=live 100%，receipts 全存证 |
| ACC-03 问题/范围持久化 | live_verified | 报告 §1（LLM 细化 scope 持久化并驱动全管线） |
| ACC-04 真实检索快照 | live_verified | 8+ run 真实三源检索；canonical-JSON 快照哈希 + 易变字段排除；artifacts 内容寻址 |
| ACC-05 引用解析+对齐 fail-closed | live_verified | 58/58 verified claims 独立复算通过（对抗审计）；3 DOI 实时解析一致；错位声明降级路径有单测 |
| ACC-06 正/反/冲突/不确定 | live_verified | 反证强制双查询；报告 §4 计数+反证条目；§8 不确定性清单 |
| ACC-07 假设实质多样 | live_verified | 释义聚类去重（如 11→6 代表），簇证据入库 |
| ACC-08 证伪规格 | live_verified | 量化证伪规格 + completenessCheck；未过者如实 untestable；阈值来源（provenance）披露 |
| ACC-09 排序可检查 | live_verified | 固定透明权重 + 每维度 rationale/producer/calibration=uncalibrated |
| ACC-10 计划可执行 | live_verified | 变量/对照/数据/方法/指标/判定规则/资源/伦理 + executabilityCheck + 证据上限声明 |
| ACC-11 反馈因果修订 | live_verified | 真实专家批评（克隆混杂）→ 因果链 → 假设 v1 + 计划修订 + VersionDiff（报告 §10） |
| ACC-12 生命周期/恢复 | live_verified | 跨进程 cancel→持久化→resume 穿过 3 种真实失败到 completed；损坏检查点 fail-closed |
| ACC-13 ProvenanceReceipt | live_verified | 全 receipts 真实采集（provider/model/usage/latency/哈希），无缺失伪造 |
| ACC-14 ReproducibilityBundle | live_verified | `far verify` 10/10 verified（干净链路 bundle）；lock 漂移正确 degraded |
| ACC-15 CLI 完整工作流 | live_verified | start/status/inspect/feedback/cancel/resume/export/verify 全部真实执行 + --json |
| ACC-16 Web 工作台 | live_verified | GUI 走查截图 + UI 内新建 run 实时推进 + EN/中 + 键盘可达 |
| ACC-17 安全防护 | tested（=target） | 安全审计 0 P0/0 P1；2 项 P2 已修复；SQL 参数化/路径穿越/body 上限实测 |
| ACC-18 代表性工作负载评估 | live_verified | 6 题（普通/困难/信息不足/冲突/反证丰富/机制争议）vs 同模型 direct/RAG 基线，预声明协议 |
| ACC-19 性能测量 | live_verified | receipts 聚合的阶段延迟/token 剖面；有界设计（重试≤2、批≤4、语料≤12、gap-seek≤1 轮） |
| ACC-20 独立对抗审计 | live_verified | 双审计 + 全部发现修复 + 回归验证 |

**完成门禁**：`node zcode-harness/scripts/completion-gate.mjs` → `VERIFIED_READY`，exit 0（2026-08-21 实跑）。

## 三、审计报告链接

- 独立对抗审计（结论 PASS，0 P0）：`evidence/W5/adversarial-audit.md`
- 独立科学审查（5 P1 全修复）：`evidence/W5/scientific-review.md`
- Frontier Opportunity Sweep（GO-1 已执行，SATURATED with recorded deferrals）：`evidence/W5/frontier-sweep.md`
- 安全审计（0 P0/0 P1）：`evidence/W4/security-audit.md`
- 评估报告（含修复后 Addendum）：`evidence/W4/evaluation-report.md`

## 四、遗留风险清单（如实申报，无隐藏）

1. **官方竞赛页面 URL 已记录并复核**（2026-08-22，`project-spec/COMPETITION.md` §0：阿里云榜题页 university.aliyun.com/action/tzbjbgs2026 + NADC 发布页 nadc.china-vo.org/article/20260624094452）。提交前仍需人工再核对当前官方规则。
2. **官方指定模型路由（Qwen 系列·百炼调用·需凭证）尚未 live 验证**（B-QWEN-LIVE-ROUTE）：官方规则原文要求"基座模型须基于千问（Qwen）系列模型，开发平台需通过阿里云百炼平台调用，或者采用比赛官网推荐工具调用系列模型，并提供调用凭证或截图"。当前 DeepSeek live 路由证明系统能力但**不满足该官方指定路由**；产品网关 model-agnostic，拿到 DASHSCOPE_API_KEY/百炼凭证后即可补齐 Qwen live 路由与凭证，不可伪造。
3. **codeRevision=unknown**：本地构建未注入 git commit（export 阶段读 FARLAB_GIT_COMMIT env）。发布构建时应注入（一行修复，已在 bundle limitations 如实标注）。
4. **评分与 LLM-judge 的校准极限**：所有模型分数标注 uncalibrated_llm_judgment；judge 差距（4.75 vs 3.25）不可量化引用（已在评估报告披露）。
5. **摘要级证据天花板**：当前源适配器以摘要为主；全文献新颖性检索未做（novelty 已带语料相对限定语；全文适配器为后续增强方向）。
6. ~~**Web 前端 XSS 面未审计**~~ **已审计关闭**（2026-08-22，`evidence/W-WEB/xss-surface-audit.md`：零危险 sink、无 markdown→HTML 渲染路径、React 默认转义覆盖；公网部署前若引入 markdown 渲染器则必须加 DOMPurify——常设条件）。
7. **human README/开发者文档未写**：交付以报告/测试/代码为准；发布包装（README/安装脚本/PDF 方案）属发布工程后续项，不影响已验证能力。

## 五、真实能力一句话总结

一个真实用户现在可以：输入真实科学问题 → 系统真实检索三源并核验来源 → 强制反证搜索 → 逐字绑定声明（对不上就降级）→ 多策略生成实质不同的候选假设并聚类去重 → 生成含量化证伪规格（阈值来源如实标注）的可比较假设集 → 确定性排序 → 产出带证据上限声明的可执行研究计划 → 接受专家反馈并留下可解释的因果修订链 → 全程 live 模型回执 → 导出可被第三方 `far verify`（10/10）独立核验的复现包 —— 经 CLI 与 Web 工作台双入口使用，面对失败/取消/损坏如实降级，且对证据不足的问题诚实弃权而非编造。

---

## 六、R1 后演进（EV1 → Wave-3，2026-08-22，本节为增补）

以下全部为 R1 报告之后、分支 `build/ev2-closeout` 上经双并行会话执行并 live 验证的增量（决策 D-015..D-035，证据均在 `evidence/W-EV1/`、`evidence/W-EV2/`、`research/WAVE3-SCOUT.md`）：

**EV1（外部机制融合四件套 + 评估收口）**：F1 RRF+listwise rerank+反证席位、F2 Robin 式锦标赛 Bradley-Terry 聚合、F3 文献级新颖性判定（对检索邻居，含诚实降级）、F4 跨文献 claim-claim 关系。前后对比（`evidence/W-EV1/ev1-before-after.md`，审计修正后数字）：claims +40%（58→81）、反证关系 +90%（含关系精度质量注脚，见下）、claim binding 100% 保持、tokens +84.5% 如实记录；judge 3-seed 方差研究诚实不宣称序内优势。

**科学真实性修复（关系标签 P1，本会话发现并闭环）**：盲判重审发现 claim→假设关系标签不可靠（contradicts 合并 1/20 精确、2 例方向反转）；对照实验（F4 同裁判同协议 80% vs falsify 40%）证明根因是 falsify 阶段设计（contradicts 默认标签/无定义/无原文引用）。修复=topical gate + schema v2 显式标签（`evidence/W-EV2/relation-precision.md`）；完整修复后复测 **supports 8/8=100%**，反证侧残余为已记录的判分粒度边界。

**EV2 + Wave-3（十二项决策馈送全部闭合）**：fulltext phase A（arXiv LaTeXML + EuropePMC JATS，零新依赖）与 phase B（OpenAlex content API GROBID TEI 路由，本地 GROBID 以"同输出零基建"否决）；POPPER 多重检验纪律（多假设计划强制声明 policy，live 验证 single_primary）；DeepSeek strict function calling 成为默认结构化传输（**全链 live 验证 41/41 tool_calls 九阶段零失败**，`evidence/W-EV2/strict-fc-live-verification.md`，含投影 v2 与内容保持 JSON 修复层两轮对抗审计修复）；MLR-Bench 外部可比评估（同裁判同任务 N=5，差距诚实归因于任务扁平化/呈现/渲染，Feasibility 反超锚点，渲染 v2 已落地）；FIRE-Bench 设计复现评估 harness（5 题 live，均值 F1=0.58，判分方差 ±0.5 如实披露）；Idea2Plan 五段模板折叠；models.dev 193-provider 目录（经本地代理解锁）；DashScope/百炼适配器（竞赛强制路由的产品侧就绪）；另落地 dist-freshness 防复发守卫、僵尸 run 清扫、invalid_output 重试 1→3。

## 七、当前状态与三项外部门（2026-08-22 09:07 实测）

- 测试 **274/274 绿**、typecheck 干净、path-hygiene 0 错误；completion-gate **NOT_READY，唯一失败项 = B-DEEPSEEK-BALANCE（critical，外部）**。
- **三项用户行动门**（均有直接探针证据，不可会话内解除、不可伪造）：
  1. **DeepSeek 账户充值**（实测 HTTP 402 Insufficient Balance）——阻塞全部 live 管线与判分；充值后 `node eval/rediscovery.mjs` 自动续传完成 v2 去混杂对比。
  2. **DASHSCOPE_API_KEY**（实测 ABSENT）——竞赛强制"千问经百炼+凭证"路由的 live 验证；适配器已就绪，`node spikes/qwen-route-probe.mjs` 一命令出回执（提交截止 2026-09-05）。
  3. **OPENALEX_API_KEY**（可选，实测 ABSENT）——不间断检索 + fulltext phase-B TEI 抓取验证（keyless 匿名层已恢复且适配器 live 验证通过，key 提供确定性与全文能力）。
- §四 遗留风险清单中第 5 条（摘要级证据天花板）已由 fulltext phase A/B 部分解除；第 1/2/3/6/7 条仍有效。
