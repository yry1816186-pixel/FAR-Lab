# final_delivery.md — FAR-Lab 赛道一方向 1A 正式开发交付报告

> 生成时间：2026-08-21（本 Goal 会话内完成全部施工与验收）
> 任务书：`FAR-LAB_DEVELOPMENT_MISSION.md`（98 节总指令）｜规划：`task_plan.md`
> 代码基线：branch `build/far-lab-r1`，最终提交 `1b0e622`；测试 **194/194 全绿**；完成门禁 **VERIFIED_READY (exit 0)**

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

1. **官方竞赛页面 URL 未在工件中记录**（WORKSPACE 交付时即无 URL）：竞赛事实以 2026-08-21 复核结论为准（`project-spec/COMPETITION.md`）；提交前需人工再核对当前官方规则（尤其模型路由要求）。ACC-01 证据基于此如实标注。
2. **Qwen/百炼 live 路径 BLOCKED**（B-QWEN-LIVE-ROUTE，非关键）：无 DASHSCOPE 凭证、RELAY base 不可发现。比赛路由由 DeepSeek（国产开源模型）满足 live 要求；Z.ai/GLM 适配器就绪，配额 2026-08-22 10:03 重置后可 `node spikes/model-spike/probe.mjs --provider zai` 一条命令补第二 live 路由。
3. **codeRevision=unknown**：本地构建未注入 git commit（export 阶段读 FARLAB_GIT_COMMIT env）。发布构建时应注入（一行修复，已在 bundle limitations 如实标注）。
4. **评分与 LLM-judge 的校准极限**：所有模型分数标注 uncalibrated_llm_judgment；judge 差距（4.75 vs 3.25）不可量化引用（已在评估报告披露）。
5. **摘要级证据天花板**：当前源适配器以摘要为主；全文献新颖性检索未做（novelty 已带语料相对限定语；全文适配器为后续增强方向）。
6. **Web 前端 XSS 面未审计**（安全审计范围外，本机 127.0.0.1 部署下风险有限；公网部署前需补审）。
7. **human README/开发者文档未写**：交付以报告/测试/代码为准；发布包装（README/安装脚本/PDF 方案）属发布工程后续项，不影响已验证能力。

## 五、真实能力一句话总结

一个真实用户现在可以：输入真实科学问题 → 系统真实检索三源并核验来源 → 强制反证搜索 → 逐字绑定声明（对不上就降级）→ 多策略生成实质不同的候选假设并聚类去重 → 生成含量化证伪规格（阈值来源如实标注）的可比较假设集 → 确定性排序 → 产出带证据上限声明的可执行研究计划 → 接受专家反馈并留下可解释的因果修订链 → 全程 live 模型回执 → 导出可被第三方 `far verify`（10/10）独立核验的复现包 —— 经 CLI 与 Web 工作台双入口使用，面对失败/取消/损坏如实降级，且对证据不足的问题诚实弃权而非编造。
